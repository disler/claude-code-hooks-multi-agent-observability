// atlas-cost.ts
//
// Paperclip-4: Cost view sliced by agent / project / goal / task. Tokens + USD.
//
// Source-of-truth for machine-readable spend:
//   ~/atlas/memory/spend.jsonl — append-only JSON Lines.
//
// Each record:
//   {
//     ts:          number,           // ms epoch
//     agent_id:    string,           // canonical lowercase id ("swift", "producer", …)
//     project_id?: string | null,
//     goal_id?:    string | null,
//     ticket_id?:  string | null,
//     model?:      string | null,
//     tokens_in?:  number,
//     tokens_out?: number,
//     cost_usd:    number,           // required, finite, >= 0
//     source:      "manual"|"events"|"adapter"
//   }
//
// spend.md is a separate human-curated ledger. This module never reads or
// writes it.
//
// In addition to the ledger, queryEventCosts() pulls usage-bearing rows
// straight out of observability/events.db. Hook payloads occasionally embed
// `usage` / `cost_usd` / `total_cost_usd` (PostToolUse from agent tool
// responses, Stop summaries with result envelopes). We normalise those into
// the ledger shape but never write them back to disk — they stay derived.
//
// Public surface:
//   appendSpend(record)              -> validates, appends one JSONL line
//   readLedger({since,until})        -> filtered ledger rows
//   queryEventCosts({since,until})   -> normalised event-derived rows
//   aggregate({slice,since,until})   -> grouped + sorted cost slice
//   totals({since,until})            -> single summary row
//   sparkline({slice,key,bucket})    -> 30-bucket time series
//   registerCostRoutes(req,url,…)    -> mounted by index.ts

import { existsSync, appendFileSync, readFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { Database } from 'bun:sqlite';

const ATLAS_HOME = process.env.ATLAS_HOME || '/Users/hrmacnair/atlas';
const SPEND_FILE = process.env.ATLAS_SPEND_JSONL || join(ATLAS_HOME, 'memory', 'spend.jsonl');
const EVENTS_DB_PATH = process.env.ATLAS_EVENTS_DB || 'events.db';

const SOURCES = new Set(['manual', 'events', 'adapter']);
const SLICES = new Set(['agent', 'project', 'goal', 'task']);
const UNASSIGNED = '__atlas_unassigned__';

// 8KB cap on the POST body for the HTTP layer.
const MAX_BODY_BYTES = 8 * 1024;

// ---------- types ----------------------------------------------------------

export type SpendSource = 'manual' | 'events' | 'adapter';
export type SliceKey = 'agent' | 'project' | 'goal' | 'task';
export type BucketUnit = 'day' | 'hour';

export interface SpendRecord {
  ts: number;
  agent_id: string;
  project_id?: string | null;
  goal_id?: string | null;
  ticket_id?: string | null;
  model?: string | null;
  tokens_in?: number;
  tokens_out?: number;
  cost_usd: number;
  source: SpendSource;
}

export interface ReadOpts {
  since?: number;
  until?: number;
}

export interface AggregateRow {
  key: string;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  count: number;
}

export interface TotalsRow {
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  count: number;
}

export interface SparkPoint {
  bucket_ts: number;
  cost_usd: number;
}

// ---------- validation -----------------------------------------------------

function isFiniteNumber(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

function normaliseTag(s: unknown): string | null {
  if (typeof s !== 'string') return null;
  const t = s.trim().toLowerCase().replace(/^@/, '');
  return t || null;
}

/**
 * Validate and normalise a candidate spend record. Throws Error with a
 * human-readable message on the first failed check.
 */
export function validateSpend(input: any): SpendRecord {
  if (!input || typeof input !== 'object') {
    throw new Error('record must be an object');
  }

  const ts = isFiniteNumber(input.ts) ? input.ts : Date.now();
  if (!isFiniteNumber(ts) || ts <= 0) throw new Error('ts must be a positive finite number');

  const agent_id = normaliseTag(input.agent_id);
  if (!agent_id) throw new Error('agent_id required');

  if (!isFiniteNumber(input.cost_usd)) throw new Error('cost_usd required and must be a finite number');
  if (input.cost_usd < 0) throw new Error('cost_usd must be >= 0');

  if (input.tokens_in != null && (!isFiniteNumber(input.tokens_in) || input.tokens_in < 0)) {
    throw new Error('tokens_in must be a non-negative finite number');
  }
  if (input.tokens_out != null && (!isFiniteNumber(input.tokens_out) || input.tokens_out < 0)) {
    throw new Error('tokens_out must be a non-negative finite number');
  }

  const source: SpendSource = SOURCES.has(input.source) ? input.source : 'manual';

  const rec: SpendRecord = {
    ts: Math.floor(ts),
    agent_id,
    project_id: input.project_id == null ? null : String(input.project_id),
    goal_id: input.goal_id == null ? null : String(input.goal_id),
    ticket_id: input.ticket_id == null ? null : String(input.ticket_id),
    model: input.model == null ? null : String(input.model),
    tokens_in: isFiniteNumber(input.tokens_in) ? Math.floor(input.tokens_in) : 0,
    tokens_out: isFiniteNumber(input.tokens_out) ? Math.floor(input.tokens_out) : 0,
    cost_usd: input.cost_usd,
    source,
  };

  return rec;
}

// ---------- append ---------------------------------------------------------

/**
 * Append a single validated record to spend.jsonl. One JSON object per line,
 * single fs.appendFileSync call to preserve jsonl validity even under
 * concurrent writes.
 */
export function appendSpend(record: any): SpendRecord {
  const rec = validateSpend(record);
  const dir = dirname(SPEND_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  appendFileSync(SPEND_FILE, JSON.stringify(rec) + '\n', 'utf8');
  return rec;
}

// ---------- read ledger ----------------------------------------------------

interface ReadResult {
  rows: SpendRecord[];
  malformed: number;
}

function readLedgerInternal(opts: ReadOpts = {}): ReadResult {
  const out: SpendRecord[] = [];
  let malformed = 0;
  if (!existsSync(SPEND_FILE)) return { rows: out, malformed };

  let raw: string;
  try {
    raw = readFileSync(SPEND_FILE, 'utf8');
  } catch {
    return { rows: out, malformed };
  }

  const since = isFiniteNumber(opts.since) ? opts.since : -Infinity;
  const until = isFiniteNumber(opts.until) ? opts.until : Infinity;

  const lines = raw.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let parsed: any;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      malformed += 1;
      continue;
    }
    if (!parsed || typeof parsed !== 'object') {
      malformed += 1;
      continue;
    }
    if (!isFiniteNumber(parsed.ts) || !isFiniteNumber(parsed.cost_usd) || typeof parsed.agent_id !== 'string') {
      malformed += 1;
      continue;
    }
    if (parsed.ts < since || parsed.ts > until) continue;

    out.push({
      ts: parsed.ts,
      agent_id: normaliseTag(parsed.agent_id) || UNASSIGNED,
      project_id: parsed.project_id ?? null,
      goal_id: parsed.goal_id ?? null,
      ticket_id: parsed.ticket_id ?? null,
      model: parsed.model ?? null,
      tokens_in: isFiniteNumber(parsed.tokens_in) ? parsed.tokens_in : 0,
      tokens_out: isFiniteNumber(parsed.tokens_out) ? parsed.tokens_out : 0,
      cost_usd: parsed.cost_usd,
      source: SOURCES.has(parsed.source) ? parsed.source : 'manual',
    });
  }
  return { rows: out, malformed };
}

/**
 * Read the spend.jsonl ledger, filtered by an optional [since, until] window.
 * Tolerant of malformed lines (skipped silently).
 */
export function readLedger(opts: ReadOpts = {}): SpendRecord[] {
  return readLedgerInternal(opts).rows;
}

/** Variant that exposes the malformed counter (tests / dashboards). */
export function readLedgerWithStats(opts: ReadOpts = {}): ReadResult {
  return readLedgerInternal(opts);
}

// ---------- events.db query ------------------------------------------------

/**
 * Heuristically pull usage-bearing payloads from events.db and project them
 * into the ledger shape. We look for any of:
 *   - top-level cost_usd / total_cost_usd
 *   - nested tool_response.usage.{input_tokens,output_tokens}
 *   - top-level usage.{input_tokens,output_tokens}
 * agent_id is taken from payload.agent / .owner / .assignee, else UNASSIGNED.
 *
 * No row is written back to disk; this is a read-time projection so the cost
 * dashboard can show real spend even for sessions that didn't produce a
 * spend.jsonl entry.
 */
export function queryEventCosts(opts: ReadOpts = {}): SpendRecord[] {
  const out: SpendRecord[] = [];
  let db: Database | null = null;
  try {
    db = new Database(EVENTS_DB_PATH, { readonly: true });
    const since = isFiniteNumber(opts.since) ? opts.since : 0;
    const until = isFiniteNumber(opts.until) ? opts.until : Number.MAX_SAFE_INTEGER;

    // Parameterised LIKE filter cuts payload scan down significantly.
    // We accept that some rows in the result still won't carry usage; we
    // re-check in JS.
    const rows = db
      .prepare(
        `SELECT timestamp, payload, model_name
         FROM events
         WHERE timestamp >= ? AND timestamp <= ?
           AND (payload LIKE ? OR payload LIKE ? OR payload LIKE ?)
         ORDER BY timestamp ASC
         LIMIT 50000`
      )
      .all(since, until, '%input_tokens%', '%cost_usd%', '%total_cost_usd%') as Array<{
        timestamp: number;
        payload: string;
        model_name: string | null;
      }>;

    for (const row of rows) {
      let p: any = null;
      try { p = JSON.parse(row.payload); } catch { continue; }
      if (!p || typeof p !== 'object') continue;

      // Locate usage object — top-level first, then nested under tool_response.
      const usage = (p.usage && typeof p.usage === 'object') ? p.usage
        : (p.tool_response && typeof p.tool_response === 'object' && p.tool_response.usage && typeof p.tool_response.usage === 'object') ? p.tool_response.usage
        : null;

      const tokens_in = isFiniteNumber(usage?.input_tokens) ? usage.input_tokens : 0;
      const tokens_out = isFiniteNumber(usage?.output_tokens) ? usage.output_tokens : 0;

      const cost_usd = isFiniteNumber(p.cost_usd) ? p.cost_usd
        : isFiniteNumber(p.total_cost_usd) ? p.total_cost_usd
        : isFiniteNumber(p.tool_response?.total_cost_usd) ? p.tool_response.total_cost_usd
        : 0;

      if (cost_usd <= 0 && tokens_in === 0 && tokens_out === 0) continue;

      out.push({
        ts: row.timestamp,
        agent_id: normaliseTag(p.agent || p.owner || p.assignee) || UNASSIGNED,
        project_id: typeof p.project_id === 'string' ? p.project_id : (typeof p.project === 'string' ? p.project : null),
        goal_id: typeof p.goal_id === 'string' ? p.goal_id : null,
        ticket_id: typeof p.ticket_id === 'string' ? p.ticket_id : (typeof p.task_id === 'string' ? p.task_id : null),
        model: row.model_name || (typeof p.model === 'string' ? p.model : null),
        tokens_in,
        tokens_out,
        cost_usd: cost_usd < 0 ? 0 : cost_usd,
        source: 'events',
      });
    }
  } catch {
    // events.db unreadable → return whatever we collected.
  } finally {
    try { db?.close(); } catch {}
  }
  return out;
}

// ---------- aggregate ------------------------------------------------------

function sliceKeyOf(rec: SpendRecord, slice: SliceKey): string {
  let v: string | null | undefined;
  switch (slice) {
    case 'agent':   v = rec.agent_id; break;
    case 'project': v = rec.project_id; break;
    case 'goal':    v = rec.goal_id; break;
    case 'task':    v = rec.ticket_id; break;
  }
  if (!v || typeof v !== 'string' || !v.trim()) return UNASSIGNED;
  return v;
}

export interface AggregateOpts extends ReadOpts {
  slice: SliceKey;
}

/**
 * Slice + group the union of ledger and event-derived spend. Returns rows
 * sorted by cost_usd desc.
 */
export function aggregate(opts: AggregateOpts): AggregateRow[] {
  if (!SLICES.has(opts.slice)) throw new Error(`invalid slice: ${opts.slice}`);
  const all = [...readLedger(opts), ...queryEventCosts(opts)];
  const byKey = new Map<string, AggregateRow>();
  for (const rec of all) {
    const key = sliceKeyOf(rec, opts.slice);
    const cur = byKey.get(key) || { key, tokens_in: 0, tokens_out: 0, cost_usd: 0, count: 0 };
    cur.tokens_in += rec.tokens_in || 0;
    cur.tokens_out += rec.tokens_out || 0;
    cur.cost_usd += rec.cost_usd || 0;
    cur.count += 1;
    byKey.set(key, cur);
  }
  return Array.from(byKey.values()).sort((a, b) => b.cost_usd - a.cost_usd);
}

export function totals(opts: ReadOpts = {}): TotalsRow {
  const all = [...readLedger(opts), ...queryEventCosts(opts)];
  const t: TotalsRow = { tokens_in: 0, tokens_out: 0, cost_usd: 0, count: 0 };
  for (const rec of all) {
    t.tokens_in += rec.tokens_in || 0;
    t.tokens_out += rec.tokens_out || 0;
    t.cost_usd += rec.cost_usd || 0;
    t.count += 1;
  }
  return t;
}

// ---------- sparkline ------------------------------------------------------

export interface SparkOpts {
  slice: SliceKey;
  slice_key: string;
  bucket?: BucketUnit;
  since?: number;
  until?: number;
}

/**
 * Returns the last 30 buckets of cost for one slice key.
 * `bucket="day"` → 30 day buckets, `bucket="hour"` → 30 hour buckets.
 */
export function sparkline(opts: SparkOpts): SparkPoint[] {
  const bucket: BucketUnit = opts.bucket === 'hour' ? 'hour' : 'day';
  const bucketMs = bucket === 'hour' ? 3_600_000 : 86_400_000;
  const now = Date.now();
  const until = isFiniteNumber(opts.until) ? opts.until : now;
  const since = isFiniteNumber(opts.since) ? opts.since : until - bucketMs * 30;

  const all = [...readLedger({ since, until }), ...queryEventCosts({ since, until })];
  const target = opts.slice_key || UNASSIGNED;

  // Pre-fill 30 buckets so the chart always renders zero-runs as flat line.
  const points: SparkPoint[] = [];
  const startBucket = Math.floor(since / bucketMs) * bucketMs;
  for (let i = 0; i < 30; i++) {
    points.push({ bucket_ts: startBucket + i * bucketMs, cost_usd: 0 });
  }

  for (const rec of all) {
    if (sliceKeyOf(rec, opts.slice) !== target) continue;
    const idx = Math.floor((rec.ts - startBucket) / bucketMs);
    if (idx < 0 || idx >= points.length) continue;
    points[idx]!.cost_usd += rec.cost_usd || 0;
  }

  return points;
}

// ---------- HTTP routes ----------------------------------------------------

function jsonResponse(body: unknown, init: ResponseInit & { headers?: Record<string, string> } = {}, baseHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...baseHeaders, ...(init.headers || {}), 'Content-Type': 'application/json' },
  });
}

function parseTimeParam(s: string | null): number | undefined {
  if (!s) return undefined;
  // Time-unit rule: ISO-like strings via Date.parse; numeric >=1e12 = ms,
  // 1e9..1e12 = seconds (×1000), <1e9 = ambiguous/reject.
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const t = Date.parse(s);
    return Number.isNaN(t) ? undefined : t;
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return undefined;
  if (n >= 1e12) return n;
  if (n >= 1e9) return n * 1000;
  return undefined;
}

/**
 * If the request matches a /api/atlas/cost* route, returns a Response.
 * Otherwise returns null and the caller continues route matching.
 */
export async function registerCostRoutes(
  req: Request,
  url: URL,
  baseHeaders: Record<string, string> = {},
): Promise<Response | null> {
  // GET /api/atlas/cost?slice=agent|project|goal|task&since=&until=
  if (url.pathname === '/api/atlas/cost' && req.method === 'GET') {
    try {
      const slice = (url.searchParams.get('slice') || 'agent') as SliceKey;
      if (!SLICES.has(slice)) {
        return jsonResponse({ error: 'invalid slice; must be agent|project|goal|task' }, { status: 400 }, baseHeaders);
      }
      const since = parseTimeParam(url.searchParams.get('since'));
      const until = parseTimeParam(url.searchParams.get('until'));
      const rows = aggregate({ slice, since, until });
      const t = totals({ since, until });
      return jsonResponse({ slice, rows, totals: t }, {}, baseHeaders);
    } catch (err: any) {
      return jsonResponse({ error: err?.message || 'cost aggregate failed' }, { status: 500 }, baseHeaders);
    }
  }

  // GET /api/atlas/cost/totals?since=&until=
  if (url.pathname === '/api/atlas/cost/totals' && req.method === 'GET') {
    try {
      const since = parseTimeParam(url.searchParams.get('since'));
      const until = parseTimeParam(url.searchParams.get('until'));
      return jsonResponse({ totals: totals({ since, until }) }, {}, baseHeaders);
    } catch (err: any) {
      return jsonResponse({ error: err?.message || 'cost totals failed' }, { status: 500 }, baseHeaders);
    }
  }

  // GET /api/atlas/cost/sparkline?slice=agent&key=swift&bucket=day
  if (url.pathname === '/api/atlas/cost/sparkline' && req.method === 'GET') {
    try {
      const slice = (url.searchParams.get('slice') || 'agent') as SliceKey;
      if (!SLICES.has(slice)) {
        return jsonResponse({ error: 'invalid slice; must be agent|project|goal|task' }, { status: 400 }, baseHeaders);
      }
      const key = url.searchParams.get('key') || '';
      if (!key) {
        return jsonResponse({ error: 'key query param required' }, { status: 400 }, baseHeaders);
      }
      const bucket = (url.searchParams.get('bucket') === 'hour' ? 'hour' : 'day') as BucketUnit;
      const since = parseTimeParam(url.searchParams.get('since'));
      const until = parseTimeParam(url.searchParams.get('until'));
      return jsonResponse(
        { points: sparkline({ slice, slice_key: key, bucket, since, until }) },
        {},
        baseHeaders,
      );
    } catch (err: any) {
      return jsonResponse({ error: err?.message || 'cost sparkline failed' }, { status: 500 }, baseHeaders);
    }
  }

  // POST /api/atlas/cost  body: { agent_id, project_id?, goal_id?, ticket_id?,
  //   model?, tokens_in?, tokens_out?, cost_usd, source? }
  if (url.pathname === '/api/atlas/cost' && req.method === 'POST') {
    // 8KB body cap.
    const lenHeader = req.headers.get('content-length');
    if (lenHeader && Number(lenHeader) > MAX_BODY_BYTES) {
      return jsonResponse({ error: 'body too large (>8KB)' }, { status: 413 }, baseHeaders);
    }
    let raw: string;
    try {
      raw = await req.text();
    } catch {
      return jsonResponse({ error: 'failed to read body' }, { status: 400 }, baseHeaders);
    }
    if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
      return jsonResponse({ error: 'body too large (>8KB)' }, { status: 413 }, baseHeaders);
    }
    let body: any;
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return jsonResponse({ error: 'invalid JSON' }, { status: 400 }, baseHeaders);
    }
    try {
      const rec = appendSpend(body);
      return jsonResponse({ ok: true, record: rec }, { status: 201 }, baseHeaders);
    } catch (err: any) {
      return jsonResponse({ error: err?.message || 'invalid spend record' }, { status: 400 }, baseHeaders);
    }
  }

  return null;
}
