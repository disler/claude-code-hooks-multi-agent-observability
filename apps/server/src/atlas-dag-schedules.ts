// ~/atlas/observability/apps/server/src/atlas-dag-schedules.ts
//
// Phase 13 — scheduled DAGs. Plain-JSON storage at
// ~/atlas/observability/data/dag-schedules.json. Each schedule records:
//
//   - DAG template slug + var values
//   - project_id to dispatch into
//   - one of: cron expression OR interval_ms OR next_run_ms (one-shot)
//   - requires_approval / cost_cap_usd / transactional flags forwarded to dispatch
//
// A 60-second tick in the server checks for due CRON schedules and fires them
// via dispatchSwarmDAG. Non-cron triggers (webhook, api) are NOT auto-fired by
// the ticker — they are driven externally via atlas-routine-triggers.
//
// Paperclip-7: schedules gained an additive `trigger` discriminator and a pair
// of policy fields (concurrency, catch_up). Legacy rows without `trigger` are
// treated as { kind: "cron", expr: <existing cron field> }.

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { createHash, randomUUID, timingSafeEqual } from 'crypto';
import { instantiateDAGTemplate } from './atlas-dag-templates';
import { dispatchSwarmDAG } from './atlas-workspace';
import { claimTicket, listClaims } from './atlas-tickets';

const ATLAS_HOME = process.env.ATLAS_HOME || '/Users/hrmacnair/atlas';
const SCHED_FILE = join(ATLAS_HOME, 'observability', 'data', 'dag-schedules.json');

// ---------- types ----------------------------------------------------------

export type ScheduleTrigger =
  | { kind: 'cron'; expr: string }
  | { kind: 'webhook'; secret_hash: string; last_fired_at?: string | null }
  | { kind: 'api'; last_fired_at?: string | null };

export type ConcurrencyPolicy = 'allow' | 'skip' | 'queue';

export interface DAGSchedule {
  id: string;
  name: string;
  template_slug: string;
  vars: Record<string, string>;
  project_id: string;
  // legacy fields — kept for back-compat. The ticker still reads cron / interval_ms / next_run_ms.
  cron?: string;
  interval_ms?: number;
  next_run_ms?: number;       // one-shot
  // forwarded to dispatch
  requires_approval?: boolean;
  transactional?: boolean;
  cost_cap_usd?: number;
  // Paperclip-7 additions
  trigger?: ScheduleTrigger;
  concurrency?: ConcurrencyPolicy;   // default "allow"
  catch_up?: boolean;                // default false
  // bookkeeping
  enabled: boolean;
  last_run_at?: number;
  last_dag_id?: string;
  last_error?: string;
  created_at: number;
}

export type FireSource = 'cron' | 'webhook' | 'api';

export interface FireResult {
  ok: boolean;
  ticket_id?: string;
  dag_id?: string;
  skipped?: boolean;
  reason?: string;
  error?: string;
}

// ---------- atomic IO ------------------------------------------------------

function load(): DAGSchedule[] {
  try {
    if (!existsSync(SCHED_FILE)) return [];
    return JSON.parse(readFileSync(SCHED_FILE, 'utf8'));
  } catch { return []; }
}

function save(rows: DAGSchedule[]): void {
  mkdirSync(dirname(SCHED_FILE), { recursive: true });
  const tmp = `${SCHED_FILE}.tmp.${process.pid}.${Date.now()}`;
  try {
    writeFileSync(tmp, JSON.stringify(rows, null, 2));
    renameSync(tmp, SCHED_FILE);
  } catch (e) {
    try { unlinkSync(tmp); } catch {}
    throw e;
  }
}

// ---------- legacy-row normalization --------------------------------------

/** Returns the effective trigger for a schedule (treats legacy rows as cron). */
export function effectiveTrigger(s: DAGSchedule): ScheduleTrigger | null {
  if (s.trigger) return s.trigger;
  if (s.cron) return { kind: 'cron', expr: s.cron };
  return null;
}

// ---------- CRUD ----------------------------------------------------------

export function listDAGSchedules(): DAGSchedule[] { return load(); }

export function getScheduleById(id: string): DAGSchedule | null {
  return load().find(r => r.id === id) ?? null;
}

export function createDAGSchedule(
  input: Omit<DAGSchedule, 'id' | 'enabled' | 'created_at'> & { trigger?: ScheduleTrigger }
): DAGSchedule {
  const rows = load();
  const s: DAGSchedule = {
    ...input,
    id: randomUUID(),
    enabled: true,
    created_at: Date.now(),
  };
  // If a trigger.kind=cron was provided, mirror its expr into the legacy `cron`
  // field so the ticker logic keeps working unchanged.
  if (s.trigger && s.trigger.kind === 'cron' && !s.cron) {
    s.cron = s.trigger.expr;
  }
  rows.push(s);
  save(rows);
  return s;
}

export function setScheduleEnabled(id: string, enabled: boolean): { ok: boolean; error?: string } {
  const rows = load();
  const s = rows.find(r => r.id === id);
  if (!s) return { ok: false, error: 'not found' };
  s.enabled = enabled;
  save(rows);
  return { ok: true };
}

export function deleteDAGSchedule(id: string): { ok: boolean } {
  const rows = load().filter(r => r.id !== id);
  save(rows);
  return { ok: true };
}

/** Mutate a schedule's trigger field. Used by webhook attach/detach. */
export function setScheduleTrigger(id: string, trigger: ScheduleTrigger | null): { ok: boolean; error?: string } {
  const rows = load();
  const s = rows.find(r => r.id === id);
  if (!s) return { ok: false, error: 'not found' };
  if (trigger === null) {
    delete s.trigger;
  } else {
    s.trigger = trigger;
  }
  save(rows);
  return { ok: true };
}

/** Update last_fired_at on the trigger (webhook/api only) and bookkeeping fields. */
export function recordTriggerFire(id: string, source: FireSource): void {
  const rows = load();
  const s = rows.find(r => r.id === id);
  if (!s) return;
  const ts = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  if (s.trigger && (s.trigger.kind === 'webhook' || s.trigger.kind === 'api')) {
    s.trigger.last_fired_at = ts;
  }
  s.last_run_at = Date.now();
  save(rows);
  void source;
}

/**
 * Find a schedule whose webhook trigger matches the SHA256 of the plaintext
 * secret. Constant-time compare. Returns the matching schedule or null.
 */
export function findScheduleByWebhookSecret(plaintext: string): DAGSchedule | null {
  if (!plaintext || typeof plaintext !== 'string') return null;
  const candidate = Buffer.from(createHash('sha256').update(plaintext, 'utf8').digest('hex'), 'hex');
  if (candidate.length !== 32) return null;
  let match: DAGSchedule | null = null;
  for (const s of load()) {
    if (!s.enabled) continue;
    if (!s.trigger || s.trigger.kind !== 'webhook') continue;
    let stored: Buffer;
    try { stored = Buffer.from(s.trigger.secret_hash, 'hex'); } catch { continue; }
    if (stored.length !== candidate.length) continue;
    if (timingSafeEqual(stored, candidate)) {
      match = s;
      // don't break — defeat positional timing leaks
    }
  }
  return match;
}

// ---------- fire path (extracted) -----------------------------------------

/** Lock key used to gate concurrent fires of the same schedule. */
function fireLockTicketId(schedule_id: string): string {
  return `routine-fire-${schedule_id}`;
}

/** Lock-claim TTL in seconds. Held for ~5 min so a previous fire that is
 * still running keeps the lock alive; "skip" callers see it and bail. */
const FIRE_LOCK_TTL_SEC = 300;

// Test seam — replace the dispatcher in tests so we don't need the workspace DB.
type DispatchFn = typeof dispatchSwarmDAG;
let _dispatcher: DispatchFn = dispatchSwarmDAG;
export function _setDispatcherForTest(fn: DispatchFn | null): void {
  _dispatcher = fn ?? dispatchSwarmDAG;
}

/**
 * Fire a schedule. Source distinguishes cron-tick fires from webhook / api
 * fires. Concurrency policy is enforced here via the atlas-tickets claim
 * primitive — we claim a per-schedule lock ticket before dispatching:
 *   - allow (default): claim is attempted but conflict is ignored.
 *   - skip:            claim conflict → return { skipped: true }.
 *   - queue:           same as "allow" today; caller upstream enforces
 *                      single-writer. Reserved for future true queueing.
 */
export function fireSchedule(schedule: DAGSchedule, source: FireSource): FireResult {
  const policy: ConcurrencyPolicy = schedule.concurrency || 'allow';
  const lockTicketId = fireLockTicketId(schedule.id);

  if (policy === 'skip') {
    // Look at existing claims; if any non-expired lock for this schedule, skip.
    const active = listClaims().find(c => c.ticket_id === lockTicketId);
    if (active) {
      return { ok: true, skipped: true, reason: 'concurrency_skip' };
    }
  }

  // Take the lock. Conflicts on allow/queue are tolerated (we still fire).
  let claim;
  try {
    claim = claimTicket({
      ticket_id: lockTicketId,
      agent_id: `routine-${source}`,
      ttl_seconds: FIRE_LOCK_TTL_SEC,
    });
  } catch (e: any) {
    return { ok: false, error: e?.message || 'claim_failed' };
  }
  if (!claim.ok && policy === 'skip') {
    return { ok: true, skipped: true, reason: 'concurrency_skip' };
  }

  // Dispatch.
  try {
    const inst = instantiateDAGTemplate(schedule.template_slug, schedule.vars);
    if (!inst.ok || !inst.nodes) {
      return { ok: false, error: inst.error || 'instantiate_failed' };
    }
    const r = _dispatcher({
      project_id: schedule.project_id,
      nodes: inst.nodes,
      requires_approval: schedule.requires_approval,
      transactional: schedule.transactional,
      cost_cap_usd: schedule.cost_cap_usd,
      template_slug: schedule.template_slug,
    });
    if (!r.ok) {
      return { ok: false, error: r.error || 'dispatch_failed', ticket_id: lockTicketId };
    }
    recordTriggerFire(schedule.id, source);
    return { ok: true, ticket_id: lockTicketId, dag_id: r.dag_id };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'dispatch_threw' };
  }
}

// ---------- cron parser ---------------------------------------------------

// Tiny cron-ish parser. Supported forms:
//   "*/15 * * * *"            every 15 minutes
//   "0 9 * * *"               daily at 09:00
//   "0 22 * * *"              daily at 22:00
//   "0 9 * * mon"             weekly Monday 09:00 (mon|tue|wed|thu|fri|sat|sun)
// Anything else → null (caller should use interval_ms instead).
const DAYS = ['sun','mon','tue','wed','thu','fri','sat'];
export function nextCronFire(cron: string, from: Date = new Date()): number | null {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [minP, hourP, domP, monthP, dowP] = parts;
  // every-N minutes
  const everyN = minP.match(/^\*\/(\d+)$/);
  if (everyN && hourP === '*' && domP === '*' && monthP === '*' && dowP === '*') {
    const n = parseInt(everyN[1]);
    if (n <= 0) return null;
    return from.getTime() + n * 60_000;
  }
  // daily / weekly at HH:MM
  const mm = parseInt(minP);
  const hh = parseInt(hourP);
  if (isNaN(mm) || isNaN(hh) || domP !== '*' || monthP !== '*') return null;
  const dow = dowP === '*' ? null : DAYS.indexOf(dowP.toLowerCase());
  const next = new Date(from);
  next.setSeconds(0, 0);
  next.setHours(hh, mm);
  if (next <= from) next.setDate(next.getDate() + 1);
  if (dow != null && dow >= 0) {
    while (next.getDay() !== dow) next.setDate(next.getDate() + 1);
  }
  return next.getTime();
}

// ---------- ticker --------------------------------------------------------

let schedTimer: ReturnType<typeof setInterval> | null = null;
const SCHED_TICK_MS = 60 * 1000;

export function startDAGScheduleTicker(): void {
  if (schedTimer) return;
  const tick = () => {
    const rows = load();
    const now = Date.now();
    let mutated = false;
    for (const s of rows) {
      if (!s.enabled) continue;
      // Skip schedules whose trigger is webhook/api — those are externally driven.
      const eff = effectiveTrigger(s);
      if (eff && (eff.kind === 'webhook' || eff.kind === 'api')) continue;
      const due = isDue(s, now);
      if (!due) continue;
      const result = fireSchedule(s, 'cron');
      s.last_run_at = now;
      if (result.dag_id) s.last_dag_id = result.dag_id;
      s.last_error = result.ok ? undefined : (result.error || 'fire_failed');
      if (s.next_run_ms) s.enabled = false;  // one-shot, disable after firing
      if (s.interval_ms) s.next_run_ms = now + s.interval_ms;
      mutated = true;
    }
    if (mutated) save(rows);
  };
  setTimeout(tick, 30 * 1000);  // first tick after 30 s so server settles
  schedTimer = setInterval(tick, SCHED_TICK_MS);
}

function isDue(s: DAGSchedule, now: number): boolean {
  if (s.next_run_ms) return now >= s.next_run_ms;
  if (s.cron) {
    const last = s.last_run_at || s.created_at;
    const next = nextCronFire(s.cron, new Date(last));
    return next != null && now >= next;
  }
  if (s.interval_ms) {
    const last = s.last_run_at || 0;
    return now - last >= s.interval_ms;
  }
  return false;
}

// ---------- internals exposed for tests -----------------------------------

export const _internal = {
  SCHED_FILE,
  fireLockTicketId,
  load,
  save,
};
