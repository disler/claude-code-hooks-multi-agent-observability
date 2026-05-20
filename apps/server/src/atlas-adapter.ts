// atlas-adapter.ts
//
// Paperclip-5: HTTP webhook adapter contract.
//
// Lets non-Claude workers (Codex, Cursor, bash, external bots) participate
// in the Atlas ticket queue via REST. Each adapter is an API key bound to
// one Atlas agent_id (from agents.json). Plaintext keys are returned exactly
// once at registration and never persisted — only SHA256 hashes hit disk.
//
// Storage (flat JSON, atomic temp+rename writes):
//   ~/atlas/memory/adapters.json      — { adapters: AdapterRecord[] }
//   ~/atlas/memory/tickets.json       — { tickets: TicketRecord[] }
//   ~/atlas/memory/adapter_audit.jsonl — append-only audit log
//
// Lock primitive: reuses atlas-tickets.ts (claimTicket / releaseTicket).
// We do NOT introduce a second lock implementation.
//
// Admin-protected routes (register, revoke) require process.env.ATLAS_ADMIN_TOKEN
// to be set, and the caller must send it via header `x-atlas-admin`.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  appendFileSync,
  unlinkSync,
} from 'fs';
import { dirname, join } from 'path';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'crypto';

import {
  claimTicket,
  releaseTicket,
  getClaim,
  listClaims,
  type Claim,
} from './atlas-tickets';

const ATLAS_HOME = process.env.ATLAS_HOME || '/Users/hrmacnair/atlas';
const MEMORY_DIR = join(ATLAS_HOME, 'memory');
const ADAPTERS_FILE = join(MEMORY_DIR, 'adapters.json');
const TICKETS_FILE = join(MEMORY_DIR, 'tickets.json');
const AUDIT_FILE = join(MEMORY_DIR, 'adapter_audit.jsonl');

// ---------- types ----------------------------------------------------------

export type AdapterKind = 'claude' | 'codex' | 'cursor' | 'bash' | 'http';

export interface AdapterRecord {
  id: string;
  name: string;
  agent_id: string;
  api_key_hash: string; // sha256 hex
  kind: AdapterKind;
  created_at: string;
  last_heartbeat_at: string | null;
  revoked: boolean;
}

export interface TicketRecord {
  id: string;
  title: string;
  agent_id?: string | null;
  status: 'open' | 'claimed' | 'done';
  created_at: string;
  payload?: unknown;
  // Set when a claim is taken via the adapter contract.
  claimed_by_adapter_id?: string | null;
  claimed_at?: string | null;
  // Set on completion.
  completed_at?: string | null;
  result?: unknown;
  notes?: string | null;
}

// ---------- helpers --------------------------------------------------------

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function ensureDirs(): void {
  if (!existsSync(MEMORY_DIR)) mkdirSync(MEMORY_DIR, { recursive: true });
}

function sha256Hex(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

function atomicWriteJson(path: string, value: unknown): void {
  ensureDirs();
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, JSON.stringify(value, null, 2));
  try {
    renameSync(tmp, path);
  } catch (e) {
    try { unlinkSync(tmp); } catch {}
    throw e;
  }
}

function readAdaptersFile(): AdapterRecord[] {
  try {
    if (!existsSync(ADAPTERS_FILE)) return [];
    const raw = readFileSync(ADAPTERS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed?.adapters) ? parsed.adapters : [];
    return arr.filter((a: any) => a && typeof a.id === 'string').map((a: any) => ({
      id: String(a.id),
      name: String(a.name || a.id),
      agent_id: String(a.agent_id || ''),
      api_key_hash: String(a.api_key_hash || ''),
      kind: (['claude', 'codex', 'cursor', 'bash', 'http'].includes(a.kind) ? a.kind : 'http') as AdapterKind,
      created_at: String(a.created_at || nowIso()),
      last_heartbeat_at: a.last_heartbeat_at ? String(a.last_heartbeat_at) : null,
      revoked: a.revoked === true,
    }));
  } catch {
    return [];
  }
}

function writeAdapters(list: AdapterRecord[]): void {
  atomicWriteJson(ADAPTERS_FILE, { adapters: list });
}

function readTicketsFile(): TicketRecord[] {
  try {
    if (!existsSync(TICKETS_FILE)) {
      atomicWriteJson(TICKETS_FILE, { tickets: [] });
      return [];
    }
    const raw = readFileSync(TICKETS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed?.tickets) ? parsed.tickets : [];
    return arr.filter((t: any) => t && typeof t.id === 'string');
  } catch {
    return [];
  }
}

function writeTickets(list: TicketRecord[]): void {
  atomicWriteJson(TICKETS_FILE, { tickets: list });
}

export function appendAudit(entry: {
  adapter_id: string | null;
  agent_id: string | null;
  route: string;
  ticket_id?: string | null;
  ok: boolean;
  extra?: Record<string, unknown>;
}): void {
  ensureDirs();
  const line = JSON.stringify({
    ts: nowIso(),
    adapter_id: entry.adapter_id,
    agent_id: entry.agent_id,
    route: entry.route,
    ticket_id: entry.ticket_id ?? null,
    ok: entry.ok,
    ...(entry.extra || {}),
  });
  try {
    appendFileSync(AUDIT_FILE, line + '\n');
  } catch {
    // Audit best-effort; don't fail caller if disk full / readonly.
  }
}

// ---------- adapter CRUD ---------------------------------------------------

export interface RegisterAdapterOpts {
  name: string;
  agent_id: string;
  kind: AdapterKind;
}

export interface RegisterAdapterResult {
  adapter_id: string;
  api_key: string;
  agent_id: string;
}

export function registerAdapter(opts: RegisterAdapterOpts): RegisterAdapterResult {
  if (!opts.name || typeof opts.name !== 'string') throw new Error('name required');
  if (!opts.agent_id || typeof opts.agent_id !== 'string') throw new Error('agent_id required');
  if (!['claude', 'codex', 'cursor', 'bash', 'http'].includes(opts.kind)) {
    throw new Error('invalid kind');
  }
  const plaintext = randomBytes(32).toString('hex');
  const rec: AdapterRecord = {
    id: randomUUID(),
    name: opts.name,
    agent_id: opts.agent_id,
    api_key_hash: sha256Hex(plaintext),
    kind: opts.kind,
    created_at: nowIso(),
    last_heartbeat_at: null,
    revoked: false,
  };
  const list = readAdaptersFile();
  list.push(rec);
  writeAdapters(list);
  return { adapter_id: rec.id, api_key: plaintext, agent_id: rec.agent_id };
}

export function revokeAdapter(adapter_id: string): {
  revoked: boolean;
  released_ticket_ids: string[];
  failed_ticket_ids: string[];
  cascade_ok: boolean;
} {
  if (!adapter_id || typeof adapter_id !== 'string') throw new Error('adapter_id required');
  const list = readAdaptersFile();
  const idx = list.findIndex(a => a.id === adapter_id);
  if (idx === -1) throw new Error('adapter not found');
  const existing = list[idx]!;
  // Cascade first; flip revoked flag last so a thrown writeAdapters/listClaims
  // leaves the adapter unrevoked and retryable.
  const released_ticket_ids: string[] = [];
  const failed_ticket_ids: string[] = [];
  const claims = listClaims().filter(c => c.agent_id === existing.agent_id);
  for (const c of claims) {
    try {
      const r = releaseTicket({ ticket_id: c.ticket_id, agent_id: existing.agent_id });
      if (!r.released) throw new Error(r.reason || 'release_failed');
      // If updateTicket throws after the lock was released, the lock is
      // already gone — we do NOT re-acquire it; surface as failed_ticket_ids.
      updateTicket(c.ticket_id, t => (
        t.status === 'claimed'
          ? { ...t, status: 'open', claimed_by_adapter_id: null, claimed_at: null }
          : t
      ));
      appendAudit({
        adapter_id: existing.id,
        agent_id: existing.agent_id,
        route: 'revoke_cascade',
        ticket_id: c.ticket_id,
        ok: true,
      });
      released_ticket_ids.push(c.ticket_id);
    } catch (e: any) {
      failed_ticket_ids.push(c.ticket_id);
      try {
        appendAudit({
          adapter_id: existing.id,
          agent_id: existing.agent_id,
          route: 'revoke_cascade',
          ticket_id: c.ticket_id,
          ok: false,
          extra: { error: String(e?.message ?? e) },
        });
      } catch {}
    }
  }
  list[idx] = { ...existing, revoked: true };
  writeAdapters(list);
  return {
    revoked: true,
    released_ticket_ids,
    failed_ticket_ids,
    cascade_ok: failed_ticket_ids.length === 0,
  };
}

/**
 * Authenticate an incoming plaintext api_key.
 *
 * Hashes the candidate, then scans non-revoked adapters comparing the hashes
 * with `crypto.timingSafeEqual` over equal-length buffers. Returns the matching
 * adapter record, or null. Does NOT short-circuit on first mismatch length —
 * but timingSafeEqual itself enforces constant-time inside the buffer compare.
 */
export function authenticate(api_key: string): AdapterRecord | null {
  if (!api_key || typeof api_key !== 'string') return null;
  const candidate = Buffer.from(sha256Hex(api_key), 'hex');
  if (candidate.length !== 32) return null; // sha256 = 32 bytes
  let match: AdapterRecord | null = null;
  for (const a of readAdaptersFile()) {
    if (a.revoked) continue;
    let stored: Buffer;
    try {
      stored = Buffer.from(a.api_key_hash, 'hex');
    } catch {
      continue;
    }
    if (stored.length !== candidate.length) continue;
    if (timingSafeEqual(stored, candidate)) {
      match = a;
      // Do not break — keep loop running so timing doesn't leak the
      // position of the match in the file. Cheap; the list is small.
    }
  }
  return match;
}

export function recordHeartbeat(adapter_id: string): { ok: boolean; server_time: string } {
  const list = readAdaptersFile();
  const idx = list.findIndex(a => a.id === adapter_id);
  if (idx === -1) throw new Error('adapter not found');
  const ts = nowIso();
  const existing = list[idx]!;
  list[idx] = { ...existing, last_heartbeat_at: ts };
  writeAdapters(list);
  return { ok: true, server_time: ts };
}

export function listAdapters(includeRevoked = true): Array<Omit<AdapterRecord, 'api_key_hash'>> {
  return readAdaptersFile()
    .filter(a => includeRevoked || !a.revoked)
    .map(({ api_key_hash, ...rest }) => rest);
}

// ---------- ticket coordination -------------------------------------------

/**
 * Pop one open ticket matching the adapter's agent_id (or unscoped if the
 * adapter is allowed to take any ticket — we use ticket.agent_id == null
 * or == adapter.agent_id). Returns null if none available. Caller must
 * subsequently call claimTicket for atomicity.
 */
function pickAvailableTicket(agent_id: string, ticket_id?: string): TicketRecord | null {
  const tickets = readTicketsFile();
  if (ticket_id) {
    const t = tickets.find(t => t.id === ticket_id);
    if (!t) return null;
    if (t.status !== 'open') return null;
    return t;
  }
  return tickets.find(t =>
    t.status === 'open' &&
    (!t.agent_id || t.agent_id === agent_id)
  ) || null;
}

function updateTicket(ticket_id: string, mutator: (t: TicketRecord) => TicketRecord): TicketRecord | null {
  const tickets = readTicketsFile();
  const idx = tickets.findIndex(t => t.id === ticket_id);
  if (idx === -1) return null;
  const existing = tickets[idx]!;
  const next = mutator(existing);
  tickets[idx] = next;
  writeTickets(tickets);
  return next;
}

export interface AdapterClaimResult {
  ok: true;
  ticket: TicketRecord;
  claim_id: string;
  expires_at: string;
}

export interface AdapterClaimError {
  ok: false;
  status: 404 | 409 | 410;
  error: string;
  holder?: Claim;
}

/**
 * Adapter-side claim. Wraps atlas-tickets.claimTicket for the lock plus
 * mutates tickets.json status field.
 */
export function adapterClaim(opts: {
  adapter: AdapterRecord;
  ticket_id?: string;
  ttl_seconds?: number;
}): AdapterClaimResult | AdapterClaimError {
  if (opts.adapter.revoked) {
    return { ok: false, status: 410, error: 'adapter_revoked' };
  }
  const picked = pickAvailableTicket(opts.adapter.agent_id, opts.ticket_id);
  if (!picked) {
    return { ok: false, status: 404, error: 'no_ticket_available' };
  }
  const claim = claimTicket({
    ticket_id: picked.id,
    agent_id: opts.adapter.agent_id,
    ttl_seconds: opts.ttl_seconds,
  });
  if (!claim.ok) {
    return { ok: false, status: 409, error: 'already_claimed', holder: claim.holder };
  }
  const updated = updateTicket(picked.id, t => ({
    ...t,
    status: 'claimed',
    claimed_by_adapter_id: opts.adapter.id,
    claimed_at: nowIso(),
  }));
  return {
    ok: true,
    ticket: updated ?? picked,
    claim_id: claim.claim_id,
    expires_at: claim.expires_at,
  };
}

export interface AdapterCompleteResult {
  ok: true;
  released: true;
}

export interface AdapterCompleteError {
  ok: false;
  status: 403 | 404 | 410;
  error: string;
}

export function adapterComplete(opts: {
  adapter: AdapterRecord;
  ticket_id: string;
  result?: unknown;
  notes?: string;
}): AdapterCompleteResult | AdapterCompleteError {
  if (opts.adapter.revoked) {
    return { ok: false, status: 410, error: 'adapter_revoked' };
  }
  const tickets = readTicketsFile();
  const t = tickets.find(t => t.id === opts.ticket_id);
  if (!t) return { ok: false, status: 404, error: 'ticket_not_found' };
  // The lock holder must match this adapter's agent_id, AND the ticket
  // record must show this adapter as the claimant.
  const holder = getClaim(opts.ticket_id);
  if (!holder) return { ok: false, status: 404, error: 'no_active_claim' };
  if (holder.agent_id !== opts.adapter.agent_id) {
    return { ok: false, status: 403, error: 'not_claim_holder' };
  }
  if (t.claimed_by_adapter_id && t.claimed_by_adapter_id !== opts.adapter.id) {
    return { ok: false, status: 403, error: 'not_claim_holder' };
  }
  const release = releaseTicket({ ticket_id: opts.ticket_id, agent_id: opts.adapter.agent_id });
  if (!release.released) {
    return { ok: false, status: 403, error: release.reason || 'not_holder' };
  }
  updateTicket(opts.ticket_id, t => ({
    ...t,
    status: 'done',
    completed_at: nowIso(),
    result: opts.result ?? null,
    notes: opts.notes ?? null,
  }));
  return { ok: true, released: true };
}

// ---------- HTTP routes ----------------------------------------------------
//
// Wired from index.ts. Returns a Response, or null if pathname/method
// doesn't belong to this module (so index.ts can fall through to other
// handlers).

function jsonResponse(headers: Record<string, string>, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

const MAX_BODY_BYTES = 16_384;

function bodyTooLarge(body: unknown): boolean {
  return JSON.stringify(body ?? {}).length > MAX_BODY_BYTES;
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

function authFromHeader(req: Request): AdapterRecord | null {
  const key = req.headers.get('x-adapter-key');
  if (!key) return null;
  return authenticate(key);
}

export async function handleAdapterRoute(
  req: Request,
  url: URL,
  headers: Record<string, string>
): Promise<Response | null> {
  const path = url.pathname;
  const method = req.method;

  // ---- Admin-protected: register ----
  if (path === '/api/atlas/adapter/register' && method === 'POST') {
    const adminCheck = checkAdminAuth(req);
    if (!adminCheck.ok) {
      appendAudit({ adapter_id: null, agent_id: null, route: path, ok: false, extra: { reason: adminCheck.reason } });
      return jsonResponse(headers, 401, { error: adminCheck.reason });
    }
    try {
      const body = await req.json() as RegisterAdapterOpts;
      if (bodyTooLarge(body)) {
        appendAudit({ adapter_id: null, agent_id: null, route: path, ok: false, extra: { error: 'body_too_large' } });
        return jsonResponse(headers, 413, { error: 'body_too_large' });
      }
      const out = registerAdapter(body);
      appendAudit({ adapter_id: out.adapter_id, agent_id: out.agent_id, route: path, ok: true });
      return jsonResponse(headers, 201, out);
    } catch (err: any) {
      appendAudit({ adapter_id: null, agent_id: null, route: path, ok: false, extra: { error: err?.message } });
      return jsonResponse(headers, 400, { error: err?.message || 'bad_request' });
    }
  }

  // ---- Admin-protected: revoke ----
  if (path === '/api/atlas/adapter/revoke' && method === 'POST') {
    const adminCheck = checkAdminAuth(req);
    if (!adminCheck.ok) {
      appendAudit({ adapter_id: null, agent_id: null, route: path, ok: false, extra: { reason: adminCheck.reason } });
      return jsonResponse(headers, 401, { error: adminCheck.reason });
    }
    try {
      const body = await req.json() as { adapter_id: string };
      if (bodyTooLarge(body)) {
        appendAudit({ adapter_id: null, agent_id: null, route: path, ok: false, extra: { error: 'body_too_large' } });
        return jsonResponse(headers, 413, { error: 'body_too_large' });
      }
      const out = revokeAdapter(body.adapter_id);
      appendAudit({ adapter_id: body.adapter_id, agent_id: null, route: path, ok: true });
      return jsonResponse(headers, 200, out);
    } catch (err: any) {
      appendAudit({ adapter_id: null, agent_id: null, route: path, ok: false, extra: { error: err?.message } });
      return jsonResponse(headers, 400, { error: err?.message || 'bad_request' });
    }
  }

  // ---- Adapter-protected routes (require x-adapter-key) ----
  if (path === '/api/atlas/adapter/claim' && method === 'POST') {
    const adapter = authFromHeader(req);
    if (!adapter) {
      appendAudit({ adapter_id: null, agent_id: null, route: path, ok: false, extra: { reason: 'unauthorized' } });
      return jsonResponse(headers, 401, { error: 'unauthorized' });
    }
    if (adapter.revoked) {
      appendAudit({ adapter_id: adapter.id, agent_id: adapter.agent_id, route: path, ok: false, extra: { reason: 'revoked' } });
      return jsonResponse(headers, 410, { error: 'adapter_revoked' });
    }
    try {
      const body = await req.json() as { agent_id?: string; ticket_id?: string };
      if (bodyTooLarge(body)) {
        appendAudit({ adapter_id: adapter.id, agent_id: adapter.agent_id, route: path, ok: false, extra: { error: 'body_too_large' } });
        return jsonResponse(headers, 413, { error: 'body_too_large' });
      }
      const out = adapterClaim({ adapter, ticket_id: body.ticket_id });
      if (out.ok) {
        appendAudit({ adapter_id: adapter.id, agent_id: adapter.agent_id, route: path, ticket_id: out.ticket.id, ok: true });
        return jsonResponse(headers, 200, { ticket: out.ticket, claim_id: out.claim_id, expires_at: out.expires_at });
      }
      appendAudit({ adapter_id: adapter.id, agent_id: adapter.agent_id, route: path, ticket_id: body.ticket_id ?? null, ok: false, extra: { error: out.error } });
      return jsonResponse(headers, out.status, { error: out.error, ...(out.holder ? { holder: out.holder } : {}) });
    } catch (err: any) {
      appendAudit({ adapter_id: adapter.id, agent_id: adapter.agent_id, route: path, ok: false, extra: { error: err?.message } });
      return jsonResponse(headers, 400, { error: err?.message || 'bad_request' });
    }
  }

  if (path === '/api/atlas/adapter/complete' && method === 'POST') {
    const adapter = authFromHeader(req);
    if (!adapter) {
      appendAudit({ adapter_id: null, agent_id: null, route: path, ok: false, extra: { reason: 'unauthorized' } });
      return jsonResponse(headers, 401, { error: 'unauthorized' });
    }
    if (adapter.revoked) {
      appendAudit({ adapter_id: adapter.id, agent_id: adapter.agent_id, route: path, ok: false, extra: { reason: 'revoked' } });
      return jsonResponse(headers, 410, { error: 'adapter_revoked' });
    }
    try {
      const body = await req.json() as { ticket_id: string; result?: unknown; notes?: string };
      if (bodyTooLarge(body)) {
        appendAudit({ adapter_id: adapter.id, agent_id: adapter.agent_id, route: path, ok: false, extra: { error: 'body_too_large' } });
        return jsonResponse(headers, 413, { error: 'body_too_large' });
      }
      if (!body.ticket_id) {
        appendAudit({ adapter_id: adapter.id, agent_id: adapter.agent_id, route: path, ok: false, extra: { error: 'ticket_id_required' } });
        return jsonResponse(headers, 400, { error: 'ticket_id required' });
      }
      const out = adapterComplete({ adapter, ticket_id: body.ticket_id, result: body.result, notes: body.notes });
      if (out.ok) {
        appendAudit({ adapter_id: adapter.id, agent_id: adapter.agent_id, route: path, ticket_id: body.ticket_id, ok: true });
        return jsonResponse(headers, 200, { released: true });
      }
      appendAudit({ adapter_id: adapter.id, agent_id: adapter.agent_id, route: path, ticket_id: body.ticket_id, ok: false, extra: { error: out.error } });
      return jsonResponse(headers, out.status, { error: out.error });
    } catch (err: any) {
      appendAudit({ adapter_id: adapter.id, agent_id: adapter.agent_id, route: path, ok: false, extra: { error: err?.message } });
      return jsonResponse(headers, 400, { error: err?.message || 'bad_request' });
    }
  }

  if (path === '/api/atlas/adapter/heartbeat' && method === 'POST') {
    const adapter = authFromHeader(req);
    if (!adapter) {
      appendAudit({ adapter_id: null, agent_id: null, route: path, ok: false, extra: { reason: 'unauthorized' } });
      return jsonResponse(headers, 401, { error: 'unauthorized' });
    }
    if (adapter.revoked) {
      appendAudit({ adapter_id: adapter.id, agent_id: adapter.agent_id, route: path, ok: false, extra: { reason: 'revoked' } });
      return jsonResponse(headers, 410, { error: 'adapter_revoked' });
    }
    try {
      const out = recordHeartbeat(adapter.id);
      appendAudit({ adapter_id: adapter.id, agent_id: adapter.agent_id, route: path, ok: true });
      return jsonResponse(headers, 200, out);
    } catch (err: any) {
      appendAudit({ adapter_id: adapter.id, agent_id: adapter.agent_id, route: path, ok: false, extra: { error: err?.message } });
      return jsonResponse(headers, 400, { error: err?.message || 'bad_request' });
    }
  }

  return null;
}

// ---------- test hooks -----------------------------------------------------

export const _internal = {
  ADAPTERS_FILE,
  TICKETS_FILE,
  AUDIT_FILE,
  readAdaptersFile,
  writeAdapters,
  readTicketsFile,
  writeTickets,
  sha256Hex,
  atomicWriteJson,
};
