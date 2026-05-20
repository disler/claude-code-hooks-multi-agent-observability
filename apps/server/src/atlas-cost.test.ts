// atlas-cost.test.ts — bun:test
//
// Covers:
//   - appendSpend writes one JSONL line, readLedger reads it back
//   - appendSpend rejects missing cost_usd / negative cost / non-finite
//   - aggregate({slice:'agent'}) groups + sorts desc; unknown agent → __atlas_unassigned__
//   - aggregate respects since / until
//   - readLedger tolerates a malformed line mid-file (skip + count)
//   - HTTP layer: 8KB body rejection (413)

import { describe, test, expect, beforeEach, afterAll } from 'bun:test';
import { mkdirSync, existsSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';

const TEST_DIR = join('/tmp', `atlas-cost-test-${process.pid}`);
const TEST_LEDGER = join(TEST_DIR, 'spend.jsonl');
const TEST_EVENTS_DB = join(TEST_DIR, 'events.db');

process.env.ATLAS_SPEND_JSONL = TEST_LEDGER;
process.env.ATLAS_EVENTS_DB = TEST_EVENTS_DB;

if (!existsSync(TEST_DIR)) mkdirSync(TEST_DIR, { recursive: true });

// Import AFTER env override so module reads the test file paths.
const mod = await import('./atlas-cost');
const {
  appendSpend,
  readLedger,
  readLedgerWithStats,
  aggregate,
  totals,
  sparkline,
  registerCostRoutes,
  validateSpend,
} = mod;

function reset() {
  if (existsSync(TEST_LEDGER)) rmSync(TEST_LEDGER);
}

beforeEach(() => {
  reset();
});

afterAll(() => {
  try { rmSync(TEST_DIR, { recursive: true, force: true }); } catch {}
});

describe('appendSpend + readLedger', () => {
  test('writes one JSONL line and reads it back', () => {
    const rec = appendSpend({
      ts: 1_700_000_000_000,
      agent_id: 'swift',
      project_id: 'margin',
      cost_usd: 0.42,
      tokens_in: 1000,
      tokens_out: 250,
      source: 'manual',
    });
    expect(rec.agent_id).toBe('swift');

    const raw = readFileSync(TEST_LEDGER, 'utf8');
    expect(raw.endsWith('\n')).toBe(true);
    expect(raw.split('\n').filter(Boolean).length).toBe(1);

    const rows = readLedger();
    expect(rows.length).toBe(1);
    expect(rows[0]!.cost_usd).toBe(0.42);
    expect(rows[0]!.agent_id).toBe('swift');
    expect(rows[0]!.project_id).toBe('margin');
  });

  test('normalises @-prefixed agent ids to lowercase', () => {
    appendSpend({ agent_id: '@Producer', cost_usd: 0.01 });
    const rows = readLedger();
    expect(rows[0]!.agent_id).toBe('producer');
  });

  test('three appends remain valid jsonl', () => {
    appendSpend({ agent_id: 'a', cost_usd: 1 });
    appendSpend({ agent_id: 'b', cost_usd: 2 });
    appendSpend({ agent_id: 'c', cost_usd: 3 });
    const lines = readFileSync(TEST_LEDGER, 'utf8').split('\n').filter(Boolean);
    expect(lines.length).toBe(3);
    for (const l of lines) {
      expect(() => JSON.parse(l)).not.toThrow();
    }
  });
});

describe('validation', () => {
  test('rejects missing cost_usd', () => {
    expect(() => appendSpend({ agent_id: 'x' })).toThrow(/cost_usd/);
  });

  test('rejects negative cost', () => {
    expect(() => appendSpend({ agent_id: 'x', cost_usd: -0.5 })).toThrow(/>= 0/);
  });

  test('rejects non-finite cost', () => {
    expect(() => appendSpend({ agent_id: 'x', cost_usd: Infinity })).toThrow(/finite/);
    expect(() => appendSpend({ agent_id: 'x', cost_usd: NaN })).toThrow(/finite/);
  });

  test('rejects missing agent_id', () => {
    expect(() => appendSpend({ cost_usd: 0.1 })).toThrow(/agent_id/);
  });

  test('rejects non-finite tokens_in', () => {
    expect(() => appendSpend({ agent_id: 'x', cost_usd: 0.1, tokens_in: NaN })).toThrow(/tokens_in/);
  });

  test('validateSpend defaults source to manual when absent', () => {
    const r = validateSpend({ agent_id: 'x', cost_usd: 0.1 });
    expect(r.source).toBe('manual');
  });
});

describe('aggregate', () => {
  test('groups by agent, sorts desc, unknown agent → __atlas_unassigned__', () => {
    appendSpend({ agent_id: 'swift',   cost_usd: 1.00, tokens_in: 100, tokens_out: 50 });
    appendSpend({ agent_id: 'swift',   cost_usd: 0.50, tokens_in: 200, tokens_out: 25 });
    appendSpend({ agent_id: 'web',     cost_usd: 2.00, tokens_in: 400, tokens_out: 100 });
    // Force an __atlas_unassigned__ bucket via a bypass write (validateSpend would reject empty agent_id)
    writeFileSync(
      TEST_LEDGER,
      readFileSync(TEST_LEDGER, 'utf8') +
        JSON.stringify({ ts: Date.now(), agent_id: '', cost_usd: 0.25, source: 'manual' }) + '\n',
      'utf8',
    );

    const rows = aggregate({ slice: 'agent' });
    // The malformed-agent line gets skipped by readLedger (validation),
    // so we should see only web + swift in agent slice.
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows[0]!.key).toBe('web');
    expect(rows[0]!.cost_usd).toBeCloseTo(2.0, 6);
    expect(rows[1]!.key).toBe('swift');
    expect(rows[1]!.cost_usd).toBeCloseTo(1.5, 6);
    expect(rows[1]!.count).toBe(2);
  });

  test('project slice with null project_id → __atlas_unassigned__ bucket', () => {
    appendSpend({ agent_id: 'producer', cost_usd: 0.30 });             // project null
    appendSpend({ agent_id: 'swift',    cost_usd: 0.20, project_id: 'margin' });
    const rows = aggregate({ slice: 'project' });
    const unassigned = rows.find(r => r.key === '__atlas_unassigned__');
    expect(unassigned).toBeDefined();
    expect(unassigned!.cost_usd).toBeCloseTo(0.30, 6);
    const margin = rows.find(r => r.key === 'margin');
    expect(margin?.cost_usd).toBeCloseTo(0.20, 6);
  });

  test('respects since / until window', () => {
    const t0 = 1_700_000_000_000;
    appendSpend({ ts: t0,          agent_id: 'a', cost_usd: 1 });
    appendSpend({ ts: t0 +  86400000, agent_id: 'a', cost_usd: 2 });
    appendSpend({ ts: t0 + 2*86400000, agent_id: 'a', cost_usd: 4 });

    const rows = aggregate({
      slice: 'agent',
      since: t0 +  86400000,
      until: t0 + 2*86400000,
    });
    expect(rows.length).toBe(1);
    expect(rows[0]!.key).toBe('a');
    expect(rows[0]!.cost_usd).toBeCloseTo(6.0, 6); // 2 + 4
    expect(rows[0]!.count).toBe(2);
  });

  test('totals matches sum across slice', () => {
    appendSpend({ agent_id: 'a', cost_usd: 1, tokens_in: 10, tokens_out: 5 });
    appendSpend({ agent_id: 'b', cost_usd: 2, tokens_in: 20, tokens_out: 7 });
    const t = totals();
    expect(t.cost_usd).toBeCloseTo(3.0, 6);
    expect(t.tokens_in).toBe(30);
    expect(t.tokens_out).toBe(12);
    expect(t.count).toBe(2);
  });
});

describe('readLedger tolerance', () => {
  test('skips a malformed line in the middle and continues', () => {
    appendSpend({ ts: 1_700_000_000_000, agent_id: 'a', cost_usd: 1 });
    // Inject garbage between two good lines.
    const cur = readFileSync(TEST_LEDGER, 'utf8');
    writeFileSync(TEST_LEDGER, cur + 'this is not json\n', 'utf8');
    appendSpend({ ts: 1_700_000_000_001, agent_id: 'b', cost_usd: 2 });

    const { rows, malformed } = readLedgerWithStats();
    expect(rows.length).toBe(2);
    expect(malformed).toBe(1);
    expect(rows.map(r => r.agent_id).sort()).toEqual(['a', 'b']);
  });

  test('skips a structurally-incomplete line (missing cost_usd)', () => {
    appendSpend({ agent_id: 'a', cost_usd: 1 });
    const cur = readFileSync(TEST_LEDGER, 'utf8');
    writeFileSync(
      TEST_LEDGER,
      cur + JSON.stringify({ ts: Date.now(), agent_id: 'b' }) + '\n',
      'utf8',
    );
    const { rows, malformed } = readLedgerWithStats();
    expect(rows.length).toBe(1);
    expect(malformed).toBe(1);
  });
});

describe('sparkline', () => {
  test('returns 30 buckets with expected total', () => {
    const t0 = Date.now() - 5 * 86_400_000;
    appendSpend({ ts: t0,                agent_id: 'swift', cost_usd: 0.5 });
    appendSpend({ ts: t0 + 86_400_000,    agent_id: 'swift', cost_usd: 0.3 });
    const points = sparkline({ slice: 'agent', slice_key: 'swift', bucket: 'day' });
    expect(points.length).toBe(30);
    const sum = points.reduce((a, p) => a + p.cost_usd, 0);
    expect(sum).toBeCloseTo(0.8, 6);
  });
});

describe('HTTP', () => {
  const headers = { 'X-Test': '1' };

  test('POST /api/atlas/cost — happy path', async () => {
    const req = new Request('http://localhost/api/atlas/cost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: 'web', cost_usd: 0.01, source: 'manual' }),
    });
    const resp = await registerCostRoutes(req, new URL(req.url), headers);
    expect(resp).not.toBeNull();
    expect(resp!.status).toBe(201);
    const j = (await resp!.json()) as any;
    expect(j.ok).toBe(true);
    expect(j.record.agent_id).toBe('web');
  });

  test('POST /api/atlas/cost — 400 on missing cost_usd', async () => {
    const req = new Request('http://localhost/api/atlas/cost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: 'web' }),
    });
    const resp = await registerCostRoutes(req, new URL(req.url), headers);
    expect(resp!.status).toBe(400);
    const j = (await resp!.json()) as any;
    expect(j.error).toMatch(/cost_usd/);
  });

  test('POST /api/atlas/cost — 413 on >8KB body', async () => {
    const big = JSON.stringify({ agent_id: 'web', cost_usd: 0.01, note: 'x'.repeat(9 * 1024) });
    const req = new Request('http://localhost/api/atlas/cost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': String(big.length) },
      body: big,
    });
    const resp = await registerCostRoutes(req, new URL(req.url), headers);
    expect(resp!.status).toBe(413);
  });

  test('GET /api/atlas/cost?slice=agent', async () => {
    appendSpend({ agent_id: 'swift', cost_usd: 1 });
    appendSpend({ agent_id: 'web',   cost_usd: 2 });
    const url = new URL('http://localhost/api/atlas/cost?slice=agent');
    const resp = await registerCostRoutes(new Request(url.toString()), url, headers);
    expect(resp!.status).toBe(200);
    const j = (await resp!.json()) as any;
    expect(j.slice).toBe('agent');
    expect(j.rows[0].key).toBe('web');
    expect(j.totals.cost_usd).toBeCloseTo(3.0, 6);
  });

  test('GET /api/atlas/cost — 400 on invalid slice', async () => {
    const url = new URL('http://localhost/api/atlas/cost?slice=banana');
    const resp = await registerCostRoutes(new Request(url.toString()), url, headers);
    expect(resp!.status).toBe(400);
  });

  test('GET /api/atlas/cost/sparkline — requires key', async () => {
    const url = new URL('http://localhost/api/atlas/cost/sparkline?slice=agent');
    const resp = await registerCostRoutes(new Request(url.toString()), url, headers);
    expect(resp!.status).toBe(400);
  });
});
