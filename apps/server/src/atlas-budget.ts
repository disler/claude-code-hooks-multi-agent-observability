// atlas-budget.ts
//
// Paperclip-2: Per-agent monthly USD budget with auto-pause at warn/hard
// thresholds. Source of truth is ~/atlas/memory/agent_budgets.json (flat JSON,
// atomic temp+rename writes — same pattern as atlas-goals.ts).
//
// Cost rollup is delegated to atlas-cost.aggregate({slice:'agent'}) — we never
// re-implement spend math. Window is pinned to "current calendar month, UTC,
// first day at 00:00:00".
//
// ─────────────────────────────────────────────────────────────────────────
// CROSS-LANGUAGE CONTRACT — must stay in sync with autonomy_gate.py
// ─────────────────────────────────────────────────────────────────────────
//
// 1. Month window:
//      since = first-of-month 00:00:00 UTC (Date.UTC(year, month, 1))
//      until = now (caller passes undefined → cost module defaults to now)
//      Both languages compute this from `datetime.now(timezone.utc)` /
//      `new Date()` — no local-time math, no DST.
//
// 2. agent_id normalisation:
//      - lowercase
//      - strip a leading '@'
//      - trim whitespace
//      Mirrors `normaliseTag()` in atlas-cost.ts and `normalise_agent_tag()`
//      in autonomy_gate.py. "@Producer" / "Producer" / "producer" all collapse
//      to "producer".
//
// 3. Decision thresholds:
//      pct = spent_usd / monthly_usd       (0 if monthly_usd <= 0)
//      pct >= hard_pct  → "paused"  (hard_block in the hook)
//      pct >= warn_pct  → "warn"    (must_approve in the hook)
//      else             → "ok"
//
// 4. Default fallback:
//      Agent absent from `agents` map → uses `default_monthly_usd`.
//
// Endpoints:
//   GET   /api/atlas/budget                  → { agents, thresholds, month_start_utc }
//   GET   /api/atlas/budget/:agent_id        → single status
//   PATCH /api/atlas/budget/:agent_id        body: { monthly_usd?, notes? }
//                                            requires header `x-atlas-admin`
//   PATCH /api/atlas/budget                  body: { default_monthly_usd?, warn_pct?, hard_pct? }
//                                            requires header `x-atlas-admin`
//
// Body cap: 8KB. Validation: 400 on bad input, 413 on too large, 401 on admin
// header missing/invalid, 415 on wrong content-type for PATCH bodies.

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { timingSafeEqual } from 'crypto';

import { aggregate } from './atlas-cost';

const ATLAS_HOME = process.env.ATLAS_HOME || '/Users/hrmacnair/atlas';
const BUDGETS_FILE = process.env.ATLAS_BUDGETS_JSON || join(ATLAS_HOME, 'memory', 'agent_budgets.json');

const MAX_BODY_BYTES = 8 * 1024;
const MAX_MONTHLY_USD = 100_000;

// ---------- types ----------------------------------------------------------

export type BudgetState = 'ok' | 'warn' | 'paused';

export interface AgentBudgetEntry {
  monthly_usd: number;
  notes?: string;
}

export interface BudgetConfig {
  month: 'auto' | string;
  default_monthly_usd: number;
  warn_pct: number;
  hard_pct: number;
  agents: Record<string, AgentBudgetEntry>;
}

export interface AgentStatus {
  agent_id: string;
  monthly_usd: number;
  spent_usd: number;
  pct: number;
  state: BudgetState;
  warn_threshold: number;
  hard_threshold: number;
  notes?: string;
}

// ---------- helpers --------------------------------------------------------

function isFiniteNumber(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

export function normaliseAgentId(s: unknown): string | null {
  if (typeof s !== 'string') return null;
  const t = s.trim().toLowerCase().replace(/^@/, '');
  return t || null;
}

const DEFAULT_CONFIG: BudgetConfig = {
  month: 'auto',
  default_monthly_usd: 200.0,
  warn_pct: 0.8,
  hard_pct: 1.0,
  agents: {},
};

// ---------- mtime-cached loader -------------------------------------------

let cachedConfig: BudgetConfig | null = null;
let cachedMtimeMs = 0;
let cachedPath = '';

function readConfigUncached(): BudgetConfig {
  if (!existsSync(BUDGETS_FILE)) return { ...DEFAULT_CONFIG };
  try {
    const raw = readFileSync(BUDGETS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_CONFIG };

    const month = typeof parsed.month === 'string' ? parsed.month : 'auto';
    const default_monthly_usd = isFiniteNumber(parsed.default_monthly_usd) && parsed.default_monthly_usd >= 0
      ? parsed.default_monthly_usd
      : DEFAULT_CONFIG.default_monthly_usd;
    const warn_pct = isFiniteNumber(parsed.warn_pct) && parsed.warn_pct > 0 && parsed.warn_pct <= 1
      ? parsed.warn_pct
      : DEFAULT_CONFIG.warn_pct;
    const hard_pct = isFiniteNumber(parsed.hard_pct) && parsed.hard_pct > 0 && parsed.hard_pct <= 1
      ? parsed.hard_pct
      : DEFAULT_CONFIG.hard_pct;

    const agents: Record<string, AgentBudgetEntry> = {};
    if (parsed.agents && typeof parsed.agents === 'object') {
      for (const [rawKey, rawVal] of Object.entries(parsed.agents)) {
        const key = normaliseAgentId(rawKey);
        if (!key) continue;
        const val: any = rawVal || {};
        const monthly = isFiniteNumber(val.monthly_usd) && val.monthly_usd >= 0
          ? val.monthly_usd
          : default_monthly_usd;
        const entry: AgentBudgetEntry = { monthly_usd: monthly };
        if (typeof val.notes === 'string') entry.notes = val.notes;
        agents[key] = entry;
      }
    }

    return { month, default_monthly_usd, warn_pct, hard_pct, agents };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Read the budgets config, cached by file mtime. Cache invalidates whenever
 * the file changes on disk.
 */
export function loadBudgets(): BudgetConfig {
  try {
    if (!existsSync(BUDGETS_FILE)) {
      cachedConfig = { ...DEFAULT_CONFIG };
      cachedMtimeMs = 0;
      cachedPath = BUDGETS_FILE;
      return cachedConfig;
    }
    const mtime = statSync(BUDGETS_FILE).mtimeMs;
    if (cachedConfig && cachedPath === BUDGETS_FILE && mtime === cachedMtimeMs) {
      return cachedConfig;
    }
    cachedConfig = readConfigUncached();
    cachedMtimeMs = mtime;
    cachedPath = BUDGETS_FILE;
    return cachedConfig;
  } catch {
    return cachedConfig || { ...DEFAULT_CONFIG };
  }
}

/** Force-invalidate the loadBudgets() cache. Used after writes. */
function invalidateCache(): void {
  cachedConfig = null;
  cachedMtimeMs = 0;
}

// ---------- month window ---------------------------------------------------

/** ms epoch for the first day, 00:00:00 UTC, of the current calendar month. */
export function monthStartUtc(now: Date = new Date()): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0);
}

// ---------- spend lookup ---------------------------------------------------

/**
 * Month-to-date USD spend for a single agent. Calls atlas-cost.aggregate and
 * picks the matching row. Returns 0 when the agent has no recorded spend in
 * the window.
 */
export function getAgentSpendUsd(agent_id: string): number {
  const id = normaliseAgentId(agent_id);
  if (!id) return 0;
  try {
    const since = monthStartUtc();
    const rows = aggregate({ slice: 'agent', since });
    const row = rows.find(r => normaliseAgentId(r.key) === id);
    return row ? row.cost_usd : 0;
  } catch {
    return 0;
  }
}

// ---------- status ---------------------------------------------------------

function stateOf(pct: number, warn: number, hard: number): BudgetState {
  if (!Number.isFinite(pct)) return 'ok';
  if (pct >= hard) return 'paused';
  if (pct >= warn) return 'warn';
  return 'ok';
}

export function getAgentStatus(agent_id: string): AgentStatus {
  const cfg = loadBudgets();
  const id = normaliseAgentId(agent_id) || agent_id;
  const entry = cfg.agents[id];
  const monthly_usd = entry?.monthly_usd ?? cfg.default_monthly_usd;
  const spent_usd = getAgentSpendUsd(id);
  const pct = monthly_usd > 0 ? spent_usd / monthly_usd : 0;
  return {
    agent_id: id,
    monthly_usd,
    spent_usd,
    pct,
    state: stateOf(pct, cfg.warn_pct, cfg.hard_pct),
    warn_threshold: cfg.warn_pct * monthly_usd,
    hard_threshold: cfg.hard_pct * monthly_usd,
    ...(entry?.notes ? { notes: entry.notes } : {}),
  };
}

/** Status for every agent configured in the budgets file. */
export function listAllStatuses(): AgentStatus[] {
  const cfg = loadBudgets();
  const out: AgentStatus[] = [];

  // Pre-pull all spend once to avoid N aggregate() calls.
  let spendByAgent = new Map<string, number>();
  try {
    const since = monthStartUtc();
    const rows = aggregate({ slice: 'agent', since });
    for (const r of rows) {
      const id = normaliseAgentId(r.key);
      if (id) spendByAgent.set(id, r.cost_usd);
    }
  } catch {
    spendByAgent = new Map();
  }

  for (const id of Object.keys(cfg.agents)) {
    const entry = cfg.agents[id]!;
    const monthly_usd = entry.monthly_usd;
    const spent_usd = spendByAgent.get(id) || 0;
    const pct = monthly_usd > 0 ? spent_usd / monthly_usd : 0;
    out.push({
      agent_id: id,
      monthly_usd,
      spent_usd,
      pct,
      state: stateOf(pct, cfg.warn_pct, cfg.hard_pct),
      warn_threshold: cfg.warn_pct * monthly_usd,
      hard_threshold: cfg.hard_pct * monthly_usd,
      ...(entry.notes ? { notes: entry.notes } : {}),
    });
  }
  return out.sort((a, b) => b.pct - a.pct);
}

// ---------- mutations ------------------------------------------------------

function atomicWriteConfig(cfg: BudgetConfig): void {
  const dir = dirname(BUDGETS_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = `${BUDGETS_FILE}.tmp.${process.pid}.${Date.now()}`;
  try {
    writeFileSync(tmp, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
    renameSync(tmp, BUDGETS_FILE);
  } catch (e) {
    try { unlinkSync(tmp); } catch {}
    throw e;
  }
  invalidateCache();
}

export interface SetAgentBudgetOpts {
  agent_id: string;
  monthly_usd: number;
  notes?: string;
}

export function setAgentBudget(opts: SetAgentBudgetOpts): AgentStatus {
  const id = normaliseAgentId(opts.agent_id);
  if (!id) throw new Error('agent_id required');
  if (!isFiniteNumber(opts.monthly_usd)) throw new Error('monthly_usd must be a finite number');
  if (opts.monthly_usd < 0) throw new Error('monthly_usd must be >= 0');
  if (opts.monthly_usd > MAX_MONTHLY_USD) throw new Error(`monthly_usd must be <= ${MAX_MONTHLY_USD}`);

  const cfg = loadBudgets();
  const next: BudgetConfig = {
    ...cfg,
    agents: { ...cfg.agents, [id]: { monthly_usd: opts.monthly_usd, ...(opts.notes ? { notes: opts.notes } : {}) } },
  };
  atomicWriteConfig(next);
  return getAgentStatus(id);
}

export interface SetGlobalThresholdsOpts {
  default_monthly_usd?: number;
  warn_pct?: number;
  hard_pct?: number;
}

export function setGlobalThresholds(opts: SetGlobalThresholdsOpts): BudgetConfig {
  const cfg = loadBudgets();
  const next: BudgetConfig = { ...cfg };

  if (opts.default_monthly_usd !== undefined) {
    if (!isFiniteNumber(opts.default_monthly_usd) || opts.default_monthly_usd < 0 || opts.default_monthly_usd > MAX_MONTHLY_USD) {
      throw new Error('default_monthly_usd must be a finite number in [0, 100000]');
    }
    next.default_monthly_usd = opts.default_monthly_usd;
  }

  // We must validate warn/hard together against the resulting pair.
  const candidateWarn = opts.warn_pct !== undefined ? opts.warn_pct : cfg.warn_pct;
  const candidateHard = opts.hard_pct !== undefined ? opts.hard_pct : cfg.hard_pct;

  if (opts.warn_pct !== undefined) {
    if (!isFiniteNumber(opts.warn_pct) || opts.warn_pct <= 0 || opts.warn_pct >= 1) {
      throw new Error('warn_pct must be in (0, 1)');
    }
  }
  if (opts.hard_pct !== undefined) {
    if (!isFiniteNumber(opts.hard_pct) || opts.hard_pct <= 0 || opts.hard_pct > 1) {
      throw new Error('hard_pct must be in (0, 1]');
    }
  }
  if (candidateWarn >= candidateHard) {
    throw new Error('warn_pct must be < hard_pct');
  }

  next.warn_pct = candidateWarn;
  next.hard_pct = candidateHard;

  atomicWriteConfig(next);
  return next;
}

// ---------- HTTP routes ----------------------------------------------------

function jsonResponse(body: unknown, status = 200, baseHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...baseHeaders, 'Content-Type': 'application/json' },
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

async function readJsonBody(req: Request): Promise<{ ok: true; body: any } | { ok: false; status: number; error: string }> {
  const lenHeader = req.headers.get('content-length');
  if (lenHeader && Number(lenHeader) > MAX_BODY_BYTES) {
    return { ok: false, status: 413, error: 'body too large (>8KB)' };
  }
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return { ok: false, status: 400, error: 'failed to read body' };
  }
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
    return { ok: false, status: 413, error: 'body too large (>8KB)' };
  }
  if (!raw) return { ok: true, body: {} };
  try {
    return { ok: true, body: JSON.parse(raw) };
  } catch {
    return { ok: false, status: 400, error: 'invalid JSON' };
  }
}

/**
 * If the request matches a /api/atlas/budget* route, returns a Response.
 * Otherwise returns null so the caller continues route matching.
 */
export async function registerBudgetRoutes(
  req: Request,
  url: URL,
  baseHeaders: Record<string, string> = {},
): Promise<Response | null> {
  const path = url.pathname;
  if (!path.startsWith('/api/atlas/budget')) return null;
  const method = req.method;

  // GET /api/atlas/budget
  if (path === '/api/atlas/budget' && method === 'GET') {
    try {
      const cfg = loadBudgets();
      return jsonResponse({
        agents: listAllStatuses(),
        thresholds: {
          default_monthly_usd: cfg.default_monthly_usd,
          warn_pct: cfg.warn_pct,
          hard_pct: cfg.hard_pct,
        },
        month_start_utc: monthStartUtc(),
      }, 200, baseHeaders);
    } catch (err: any) {
      return jsonResponse({ error: err?.message || 'budget read failed' }, 500, baseHeaders);
    }
  }

  // PATCH /api/atlas/budget (global thresholds)
  if (path === '/api/atlas/budget' && method === 'PATCH') {
    const adminCheck = checkAdminAuth(req);
    if (!adminCheck.ok) return jsonResponse({ error: adminCheck.reason }, 401, baseHeaders);
    const body = await readJsonBody(req);
    if (!body.ok) return jsonResponse({ error: body.error }, body.status, baseHeaders);
    try {
      const next = setGlobalThresholds(body.body);
      return jsonResponse({
        ok: true,
        thresholds: {
          default_monthly_usd: next.default_monthly_usd,
          warn_pct: next.warn_pct,
          hard_pct: next.hard_pct,
        },
      }, 200, baseHeaders);
    } catch (err: any) {
      return jsonResponse({ error: err?.message || 'bad_request' }, 400, baseHeaders);
    }
  }

  // GET /api/atlas/budget/:agent_id
  if (method === 'GET') {
    const m = path.match(/^\/api\/atlas\/budget\/([^/]+)$/);
    if (m) {
      const id = normaliseAgentId(decodeURIComponent(m[1]!));
      if (!id) return jsonResponse({ error: 'invalid agent_id' }, 400, baseHeaders);
      try {
        return jsonResponse(getAgentStatus(id), 200, baseHeaders);
      } catch (err: any) {
        return jsonResponse({ error: err?.message || 'status read failed' }, 500, baseHeaders);
      }
    }
  }

  // PATCH /api/atlas/budget/:agent_id
  if (method === 'PATCH') {
    const m = path.match(/^\/api\/atlas\/budget\/([^/]+)$/);
    if (m) {
      const adminCheck = checkAdminAuth(req);
      if (!adminCheck.ok) return jsonResponse({ error: adminCheck.reason }, 401, baseHeaders);

      const id = normaliseAgentId(decodeURIComponent(m[1]!));
      if (!id) return jsonResponse({ error: 'invalid agent_id' }, 400, baseHeaders);

      const body = await readJsonBody(req);
      if (!body.ok) return jsonResponse({ error: body.error }, body.status, baseHeaders);
      const b: any = body.body || {};
      if (b.monthly_usd === undefined && b.notes === undefined) {
        return jsonResponse({ error: 'must set monthly_usd or notes' }, 400, baseHeaders);
      }

      // Load current to permit notes-only update.
      const cfg = loadBudgets();
      const current = cfg.agents[id];
      const monthly = b.monthly_usd !== undefined ? b.monthly_usd : (current?.monthly_usd ?? cfg.default_monthly_usd);
      try {
        const out = setAgentBudget({
          agent_id: id,
          monthly_usd: monthly,
          notes: b.notes !== undefined ? String(b.notes) : current?.notes,
        });
        return jsonResponse({ ok: true, status: out }, 200, baseHeaders);
      } catch (err: any) {
        return jsonResponse({ error: err?.message || 'bad_request' }, 400, baseHeaders);
      }
    }
  }

  return null;
}
