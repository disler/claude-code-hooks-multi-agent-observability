// atlas-routine-triggers.ts
//
// Paperclip-7: routine trigger surface — webhook + manual "fire now" API on
// top of atlas-dag-schedules. Cron support stays in atlas-dag-schedules and
// is untouched here.
//
// What lives here:
//   - attachWebhook  — generate plaintext secret, store SHA256 hash on the
//     schedule's trigger field, return plaintext ONCE.
//   - detachWebhook  — clear the webhook trigger.
//   - fireScheduleByWebhook — look up schedule by plaintext secret, optionally
//     validate an HMAC signature, then call fireSchedule(..., "webhook").
//   - fireScheduleManually  — admin gate, calls fireSchedule(..., "api").
//
// Webhook secret storage mirrors atlas-adapter's pattern: plaintext is returned
// exactly once and never persisted; only the SHA256 hash hits disk. Lookup uses
// `crypto.timingSafeEqual` over equal-length buffers (see atlas-dag-schedules
// `findScheduleByWebhookSecret`).
//
// Audit log is append-only at ~/atlas/memory/routine_audit.jsonl.

import { existsSync, mkdirSync, appendFileSync } from 'fs';
import { dirname, join } from 'path';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';

import {
  type DAGSchedule,
  type FireResult,
  fireSchedule,
  findScheduleByWebhookSecret,
  getScheduleById,
  setScheduleTrigger,
} from './atlas-dag-schedules';

const ATLAS_HOME = process.env.ATLAS_HOME || '/Users/hrmacnair/atlas';
const MEMORY_DIR = join(ATLAS_HOME, 'memory');
const AUDIT_FILE = join(MEMORY_DIR, 'routine_audit.jsonl');

// Body size cap for webhook traffic — 64 KB. Larger bodies → 413.
const MAX_WEBHOOK_BODY_BYTES = 64 * 1024;

// ---------- helpers --------------------------------------------------------

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function ensureDirs(): void {
  if (!existsSync(MEMORY_DIR)) mkdirSync(MEMORY_DIR, { recursive: true });
  const d = dirname(AUDIT_FILE);
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
}

function sha256Hex(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

export function appendRoutineAudit(entry: {
  schedule_id: string | null;
  source: 'cron' | 'webhook' | 'api' | 'attach' | 'detach';
  ok: boolean;
  ticket_id?: string | null;
  error?: string;
  extra?: Record<string, unknown>;
}): void {
  ensureDirs();
  const line = JSON.stringify({
    ts: nowIso(),
    schedule_id: entry.schedule_id,
    source: entry.source,
    ok: entry.ok,
    ticket_id: entry.ticket_id ?? null,
    ...(entry.error ? { error: entry.error } : {}),
    ...(entry.extra || {}),
  });
  // Synchronous append. POSIX guarantees atomic write-up-to-PIPE_BUF (>=512B,
  // typically 4KB) for O_APPEND opens; our JSONL lines are sub-1KB, so
  // concurrent writes from a single Node process cannot interleave. Surface
  // failures to stderr instead of silently swallowing them.
  try {
    appendFileSync(AUDIT_FILE, line + '\n');
  } catch (e) {
    console.error('audit_write_failed', e);
  }
}

// ---------- attach / detach ----------------------------------------------

export interface AttachWebhookResult {
  ok: true;
  schedule_id: string;
  secret: string;          // plaintext, returned ONCE
}
export interface AttachWebhookError {
  ok: false;
  status: 404;
  error: string;
}

/** Generates a 32-byte secret, stores SHA256(secret) on the schedule's
 * trigger, and returns the plaintext exactly once. */
export function attachWebhook(opts: { schedule_id: string }): AttachWebhookResult | AttachWebhookError {
  const s = getScheduleById(opts.schedule_id);
  if (!s) {
    appendRoutineAudit({ schedule_id: opts.schedule_id, source: 'attach', ok: false, error: 'not_found' });
    return { ok: false, status: 404, error: 'schedule_not_found' };
  }
  const plaintext = randomBytes(32).toString('hex');
  const hash = sha256Hex(plaintext);
  const r = setScheduleTrigger(s.id, { kind: 'webhook', secret_hash: hash, last_fired_at: null });
  if (!r.ok) {
    appendRoutineAudit({ schedule_id: s.id, source: 'attach', ok: false, error: r.error });
    return { ok: false, status: 404, error: r.error || 'attach_failed' };
  }
  appendRoutineAudit({ schedule_id: s.id, source: 'attach', ok: true });
  return { ok: true, schedule_id: s.id, secret: plaintext };
}

export interface DetachWebhookResult {
  ok: true;
  detached: true;
}
export interface DetachWebhookError {
  ok: false;
  status: 404;
  error: string;
}

/** Clears the webhook trigger. If the schedule had a legacy cron field, the
 * effective trigger reverts to cron; otherwise the schedule becomes "off"
 * (no auto-fire). */
export function detachWebhook(opts: { schedule_id: string }): DetachWebhookResult | DetachWebhookError {
  const s = getScheduleById(opts.schedule_id);
  if (!s) {
    appendRoutineAudit({ schedule_id: opts.schedule_id, source: 'detach', ok: false, error: 'not_found' });
    return { ok: false, status: 404, error: 'schedule_not_found' };
  }
  const r = setScheduleTrigger(s.id, null);
  if (!r.ok) {
    appendRoutineAudit({ schedule_id: s.id, source: 'detach', ok: false, error: r.error });
    return { ok: false, status: 404, error: r.error || 'detach_failed' };
  }
  appendRoutineAudit({ schedule_id: s.id, source: 'detach', ok: true });
  return { ok: true, detached: true };
}

// ---------- fire (manual + webhook) ---------------------------------------

export interface FireManualResult {
  ok: boolean;
  ticket_id?: string;
  dag_id?: string;
  skipped?: boolean;
  reason?: string;
  error?: string;
}

/** Admin "fire now" — calls fireSchedule(..., "api"). */
export function fireScheduleManually(opts: { schedule_id: string }): FireManualResult & { status?: number } {
  const s = getScheduleById(opts.schedule_id);
  if (!s) {
    appendRoutineAudit({ schedule_id: opts.schedule_id, source: 'api', ok: false, error: 'not_found' });
    return { ok: false, error: 'schedule_not_found', status: 404 };
  }
  // For api triggers, ensure the trigger field reflects the api kind if no
  // other trigger is set — purely cosmetic / for last_fired_at bookkeeping.
  if (!s.trigger && !s.cron) {
    setScheduleTrigger(s.id, { kind: 'api', last_fired_at: null });
  }
  const fresh = getScheduleById(opts.schedule_id) || s;
  const r: FireResult = fireSchedule(fresh, 'api');
  appendRoutineAudit({
    schedule_id: s.id,
    source: 'api',
    ok: r.ok,
    ticket_id: r.ticket_id ?? null,
    error: r.ok ? undefined : r.error,
    extra: r.skipped ? { skipped: true, reason: r.reason } : undefined,
  });
  return { ...r };
}

export interface WebhookFireOpts {
  secret_plaintext: string;
  body?: unknown;                       // already-parsed JSON body
  raw_body?: string;                    // raw body for HMAC validation
  signature_header?: string | null;     // value of x-atlas-signature, may be null
}

export interface WebhookFireResult {
  ok: boolean;
  status: number;
  ticket_id?: string;
  dag_id?: string;
  skipped?: boolean;
  reason?: string;
  error?: string;
}

/**
 * HMAC validation rule (matches the route docstring):
 *   - If header `x-atlas-signature` is missing AND the request has no body,
 *     allow the path-secret-only flow.
 *   - If header is present, validate against `sha256=<hex(hmac_sha256(secret, raw_body))>`
 *     and reject on mismatch.
 *
 * If the header is missing but there IS a body, we accept it (path-secret-only
 * still passes the route gate) — the path secret itself is the auth carrier.
 */
function verifyWebhookHmac(secret_plaintext: string, raw_body: string, header: string | null | undefined): { ok: boolean; reason?: string } {
  if (!header) {
    return { ok: true };
  }
  const expected = 'sha256=' + createHmac('sha256', secret_plaintext).update(raw_body, 'utf8').digest('hex');
  // constant-time compare
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  if (a.length !== b.length) return { ok: false, reason: 'invalid_signature' };
  return timingSafeEqual(a, b) ? { ok: true } : { ok: false, reason: 'invalid_signature' };
}

export function fireScheduleByWebhook(opts: WebhookFireOpts): WebhookFireResult {
  if (!opts.secret_plaintext) {
    appendRoutineAudit({ schedule_id: null, source: 'webhook', ok: false, error: 'missing_secret' });
    return { ok: false, status: 401, error: 'missing_secret' };
  }
  const s = findScheduleByWebhookSecret(opts.secret_plaintext);
  if (!s) {
    appendRoutineAudit({ schedule_id: null, source: 'webhook', ok: false, error: 'not_found' });
    return { ok: false, status: 404, error: 'no_matching_webhook' };
  }
  // If a signature header is present, validate it.
  const raw = opts.raw_body ?? '';
  const verify = verifyWebhookHmac(opts.secret_plaintext, raw, opts.signature_header ?? null);
  if (!verify.ok) {
    appendRoutineAudit({ schedule_id: s.id, source: 'webhook', ok: false, error: verify.reason });
    return { ok: false, status: 401, error: verify.reason || 'invalid_signature' };
  }
  const r: FireResult = fireSchedule(s, 'webhook');
  // We don't currently attach the webhook_body to a ticket record — there is
  // no per-fire ticket in the workspace task model. The DAG carries the work;
  // the audit row captures the trigger metadata.
  appendRoutineAudit({
    schedule_id: s.id,
    source: 'webhook',
    ok: r.ok,
    ticket_id: r.ticket_id ?? null,
    error: r.ok ? undefined : r.error,
    extra: {
      ...(r.skipped ? { skipped: true, reason: r.reason } : {}),
      body_bytes: raw.length,
    },
  });
  return {
    ok: r.ok,
    status: r.ok ? 200 : 500,
    ticket_id: r.ticket_id,
    dag_id: r.dag_id,
    skipped: r.skipped,
    reason: r.reason,
    error: r.error,
  };
}

// ---------- HTTP route handler -------------------------------------------

function jsonResponse(headers: Record<string, string>, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

function checkAdminAuth(req: Request): { ok: boolean; reason?: string } {
  const expected = process.env.ATLAS_ADMIN_TOKEN;
  if (!expected) return { ok: false, reason: 'admin_token_not_configured' };
  const got = req.headers.get('x-atlas-admin');
  if (!got) return { ok: false, reason: 'missing_admin_header' };
  const a = Buffer.from(expected);
  const b = Buffer.from(got);
  if (a.length !== b.length) return { ok: false, reason: 'invalid_admin_token' };
  return timingSafeEqual(a, b) ? { ok: true } : { ok: false, reason: 'invalid_admin_token' };
}

/**
 * Routes:
 *   POST /api/atlas/routine/:id/fire             (x-atlas-admin)
 *   POST /api/atlas/routine/webhook/:secret      body: JSON, optional x-atlas-signature
 *   POST /api/atlas/routine/:id/webhook/attach   (x-atlas-admin)
 *   POST /api/atlas/routine/:id/webhook/detach   (x-atlas-admin)
 *
 * Returns null if the path/method does not match (so index.ts can fall through).
 */
export async function handleRoutineRoute(
  req: Request,
  url: URL,
  headers: Record<string, string>
): Promise<Response | null> {
  const path = url.pathname;
  const method = req.method;

  if (method !== 'POST') return null;
  if (!path.startsWith('/api/atlas/routine/')) return null;

  // /api/atlas/routine/webhook/:secret  — public, secret-in-path auth
  const webhookMatch = path.match(/^\/api\/atlas\/routine\/webhook\/([^\/]+)$/);
  if (webhookMatch) {
    let secret: string;
    try {
      secret = decodeURIComponent(webhookMatch[1]!);
    } catch {
      // Malformed percent-encoding. Mirror the no-matching-webhook response so
      // a probe cannot distinguish "bad encoding" from "wrong secret".
      appendRoutineAudit({ schedule_id: null, source: 'webhook', ok: false, error: 'not_found' });
      return jsonResponse(headers, 404, { ok: false, error: 'no_matching_webhook' });
    }
    const sig = req.headers.get('x-atlas-signature');
    // Pre-read Content-Length check to avoid buffering oversized bodies (DOS guard).
    // Content-Length may be omitted; the post-read check below is the safety net.
    const cl = req.headers.get('content-length');
    if (cl) {
      const n = parseInt(cl, 10);
      if (Number.isFinite(n) && n > MAX_WEBHOOK_BODY_BYTES) {
        appendRoutineAudit({ schedule_id: null, source: 'webhook', ok: false, error: 'body_too_large' });
        return jsonResponse(headers, 413, { error: 'body_too_large' });
      }
    }
    let raw = '';
    try {
      raw = await req.text();
    } catch (e: any) {
      return jsonResponse(headers, 400, { error: 'body_read_failed' });
    }
    if (Buffer.byteLength(raw, 'utf8') > MAX_WEBHOOK_BODY_BYTES) {
      appendRoutineAudit({ schedule_id: null, source: 'webhook', ok: false, error: 'body_too_large' });
      return jsonResponse(headers, 413, { error: 'body_too_large' });
    }
    let parsed: unknown = undefined;
    if (raw.length > 0) {
      try { parsed = JSON.parse(raw); } catch { /* allow non-JSON; we still verify HMAC over raw bytes */ }
    }
    const r = fireScheduleByWebhook({
      secret_plaintext: secret,
      body: parsed,
      raw_body: raw,
      signature_header: sig,
    });
    return jsonResponse(headers, r.status, {
      ok: r.ok,
      ...(r.ticket_id ? { ticket_id: r.ticket_id } : {}),
      ...(r.dag_id ? { dag_id: r.dag_id } : {}),
      ...(r.skipped ? { skipped: true, reason: r.reason } : {}),
      ...(r.error ? { error: r.error } : {}),
    });
  }

  // /api/atlas/routine/:id/fire
  const fireMatch = path.match(/^\/api\/atlas\/routine\/([^\/]+)\/fire$/);
  if (fireMatch) {
    const schedId = fireMatch[1]!;
    const adminCheck = checkAdminAuth(req);
    if (!adminCheck.ok) {
      appendRoutineAudit({ schedule_id: schedId, source: 'api', ok: false, error: adminCheck.reason });
      return jsonResponse(headers, 401, { error: adminCheck.reason });
    }
    const r = fireScheduleManually({ schedule_id: schedId });
    const status = r.status ?? (r.ok ? 200 : 500);
    return jsonResponse(headers, status, {
      ok: r.ok,
      ...(r.ticket_id ? { ticket_id: r.ticket_id } : {}),
      ...(r.dag_id ? { dag_id: r.dag_id } : {}),
      ...(r.skipped ? { skipped: true, reason: r.reason } : {}),
      ...(r.error ? { error: r.error } : {}),
    });
  }

  // /api/atlas/routine/:id/webhook/attach
  const attachMatch = path.match(/^\/api\/atlas\/routine\/([^\/]+)\/webhook\/attach$/);
  if (attachMatch) {
    const schedId = attachMatch[1]!;
    const adminCheck = checkAdminAuth(req);
    if (!adminCheck.ok) {
      appendRoutineAudit({ schedule_id: schedId, source: 'attach', ok: false, error: adminCheck.reason });
      return jsonResponse(headers, 401, { error: adminCheck.reason });
    }
    const r = attachWebhook({ schedule_id: schedId });
    if (!r.ok) return jsonResponse(headers, r.status, { error: r.error });
    return jsonResponse(headers, 201, { schedule_id: r.schedule_id, secret: r.secret });
  }

  // /api/atlas/routine/:id/webhook/detach
  const detachMatch = path.match(/^\/api\/atlas\/routine\/([^\/]+)\/webhook\/detach$/);
  if (detachMatch) {
    const schedId = detachMatch[1]!;
    const adminCheck = checkAdminAuth(req);
    if (!adminCheck.ok) {
      appendRoutineAudit({ schedule_id: schedId, source: 'detach', ok: false, error: adminCheck.reason });
      return jsonResponse(headers, 401, { error: adminCheck.reason });
    }
    const r = detachWebhook({ schedule_id: schedId });
    if (!r.ok) return jsonResponse(headers, r.status, { error: r.error });
    return jsonResponse(headers, 200, { detached: true });
  }

  return null;
}

// ---------- test hooks ---------------------------------------------------

export const _internal = {
  AUDIT_FILE,
  MAX_WEBHOOK_BODY_BYTES,
  sha256Hex,
};

// Silence unused-import warnings for types used purely in JSDoc.
export type _ScheduleRefType = DAGSchedule;
