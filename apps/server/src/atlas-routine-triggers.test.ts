// atlas-routine-triggers.test.ts — bun:test
//
// Paperclip-7 routine-trigger contract.
//
// Coverage:
//   - attachWebhook returns plaintext once; listSchedules omits plaintext (hash only).
//   - fireScheduleByWebhook with correct secret + no signature → fires + ticket lock.
//   - fireScheduleByWebhook with wrong secret → 404 (no_matching_webhook).
//   - fireScheduleByWebhook with HMAC: valid sig → fires; invalid sig → 401.
//   - fireScheduleManually via HTTP requires admin token; missing → 401.
//   - Concurrency "skip": second rapid fire → skipped:true.
//   - Concurrency "allow": both fires succeed.
//   - detachWebhook clears secret_hash.
//   - Audit jsonl appended on success and failure.

import { describe, test, expect, beforeEach, afterAll } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { createHmac } from 'crypto';

const TEST_HOME = join('/tmp', `atlas-routine-test-${process.pid}`);
process.env.ATLAS_HOME = TEST_HOME;
process.env.ATLAS_ADMIN_TOKEN = 'test-admin-token';

mkdirSync(join(TEST_HOME, 'memory'), { recursive: true });
mkdirSync(join(TEST_HOME, 'observability', 'data'), { recursive: true });
mkdirSync(join(TEST_HOME, 'skills', 'dags'), { recursive: true });
writeFileSync(join(TEST_HOME, 'observability', 'data', 'dag-schedules.json'), '[]');
// Seed a tiny noop template so instantiateDAGTemplate succeeds without
// touching the real ATLAS_HOME skill library.
writeFileSync(join(TEST_HOME, 'skills', 'dags', 'noop-template.json'), JSON.stringify({
  name: 'noop',
  description: 'test',
  vars: [],
  nodes: [{ task: 'noop', owner: '@Producer', prompt: 'noop', files: [], deps: [] }],
}, null, 2));

// Imports AFTER env is set so module-level path constants pick up TEST_HOME.
const schedMod  = await import('./atlas-dag-schedules');
const trigMod   = await import('./atlas-routine-triggers');
const ticketMod = await import('./atlas-tickets');

const {
  createDAGSchedule,
  listDAGSchedules,
  getScheduleById,
  _setDispatcherForTest,
  _internal: schedInternal,
} = schedMod;

const {
  attachWebhook,
  detachWebhook,
  fireScheduleManually,
  fireScheduleByWebhook,
  handleRoutineRoute,
  _internal: trigInternal,
} = trigMod;

const { _clearAllClaimsForTest } = ticketMod;

// Stub dispatcher — avoid the workspace DB / DAG validator.
let DISPATCH_CALLS = 0;
_setDispatcherForTest(((_input: any) => {
  DISPATCH_CALLS += 1;
  return { ok: true, dag_id: `stub-dag-${DISPATCH_CALLS}`, errors: [], warnings: [] };
}) as any);

function resetState(): void {
  _clearAllClaimsForTest();
  schedInternal.save([]);
  try { writeFileSync(trigInternal.AUDIT_FILE, ''); } catch {}
  DISPATCH_CALLS = 0;
}

function readAudit(): Array<Record<string, unknown>> {
  if (!existsSync(trigInternal.AUDIT_FILE)) return [];
  return readFileSync(trigInternal.AUDIT_FILE, 'utf8')
    .split('\n').filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return {}; } });
}

function mkSchedule(extra: Partial<Parameters<typeof createDAGSchedule>[0]> = {}) {
  return createDAGSchedule({
    name: 'test-schedule',
    template_slug: 'noop-template',
    vars: {},
    project_id: 'test-project',
    ...extra,
  } as any);
}

beforeEach(() => { resetState(); });
afterAll(() => {
  try { rmSync(TEST_HOME, { recursive: true, force: true }); } catch {}
});

describe('attachWebhook', () => {
  test('returns plaintext secret once and stores only the hash', () => {
    const s = mkSchedule();
    const r = attachWebhook({ schedule_id: s.id });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(typeof r.secret).toBe('string');
    expect(r.secret.length).toBeGreaterThanOrEqual(32);

    // List shouldn't expose plaintext — only the hash on the trigger.
    const listed = listDAGSchedules().find(x => x.id === s.id)!;
    expect(listed.trigger?.kind).toBe('webhook');
    if (listed.trigger?.kind === 'webhook') {
      expect(listed.trigger.secret_hash).toBeTruthy();
      expect(listed.trigger.secret_hash).not.toContain(r.secret);
    }
    // Plaintext should not be persisted anywhere in the file.
    const fileRaw = readFileSync(schedInternal.SCHED_FILE, 'utf8');
    expect(fileRaw.includes(r.secret)).toBe(false);
  });

  test('returns 404 on unknown schedule', () => {
    const r = attachWebhook({ schedule_id: 'does-not-exist' });
    expect(r.ok).toBe(false);
  });
});

describe('fireScheduleByWebhook', () => {
  test('correct secret, no signature → fires + creates lock claim', () => {
    const s = mkSchedule();
    const attach = attachWebhook({ schedule_id: s.id });
    if (!attach.ok) throw new Error('attach failed');
    const r = fireScheduleByWebhook({
      secret_plaintext: attach.secret,
      body: { hi: 'there' },
      raw_body: JSON.stringify({ hi: 'there' }),
      signature_header: null,
    });
    expect(r.ok).toBe(true);
    expect(r.status).toBe(200);
    expect(DISPATCH_CALLS).toBe(1);

    // Lock claim should be visible under the schedule's lock ticket id.
    const claims = ticketMod.listClaims();
    expect(claims.some(c => c.ticket_id === schedInternal.fireLockTicketId(s.id))).toBe(true);
  });

  test('wrong secret → 404', () => {
    const s = mkSchedule();
    attachWebhook({ schedule_id: s.id });
    const r = fireScheduleByWebhook({
      secret_plaintext: 'nope-' + 'a'.repeat(60),
      raw_body: '',
      signature_header: null,
    });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(404);
    expect(DISPATCH_CALLS).toBe(0);
  });

  test('HMAC: valid signature → fires; invalid → 401', () => {
    const s = mkSchedule();
    const attach = attachWebhook({ schedule_id: s.id });
    if (!attach.ok) throw new Error('attach failed');
    const body = JSON.stringify({ payload: 'ok' });
    const goodSig = 'sha256=' + createHmac('sha256', attach.secret).update(body, 'utf8').digest('hex');

    const ok = fireScheduleByWebhook({
      secret_plaintext: attach.secret,
      raw_body: body,
      signature_header: goodSig,
    });
    expect(ok.ok).toBe(true);
    expect(ok.status).toBe(200);

    // Need a fresh schedule to avoid the skip-concurrency interfering.
    _clearAllClaimsForTest();
    const bad = fireScheduleByWebhook({
      secret_plaintext: attach.secret,
      raw_body: body,
      signature_header: 'sha256=deadbeef'.padEnd(goodSig.length, '0'),
    });
    expect(bad.ok).toBe(false);
    expect(bad.status).toBe(401);
  });
});

describe('fireScheduleManually (HTTP)', () => {
  test('rejects without admin token', async () => {
    const s = mkSchedule();
    const req = new Request(`http://x/api/atlas/routine/${s.id}/fire`, { method: 'POST' });
    const url = new URL(req.url);
    const resp = await handleRoutineRoute(req, url, {});
    expect(resp).not.toBeNull();
    expect(resp!.status).toBe(401);
    expect(DISPATCH_CALLS).toBe(0);
  });

  test('admin token → fires', async () => {
    const s = mkSchedule();
    const req = new Request(`http://x/api/atlas/routine/${s.id}/fire`, {
      method: 'POST',
      headers: { 'x-atlas-admin': 'test-admin-token' },
    });
    const url = new URL(req.url);
    const resp = await handleRoutineRoute(req, url, {});
    expect(resp).not.toBeNull();
    expect(resp!.status).toBe(200);
    const body = await resp!.json() as { ok: boolean };
    expect(body.ok).toBe(true);
    expect(DISPATCH_CALLS).toBe(1);
  });
});

describe('concurrency policy', () => {
  test('"skip" — second rapid fire returns skipped:true', () => {
    const s = mkSchedule({ concurrency: 'skip' });
    const attach = attachWebhook({ schedule_id: s.id });
    if (!attach.ok) throw new Error('attach failed');
    const fire1 = fireScheduleByWebhook({ secret_plaintext: attach.secret, raw_body: '', signature_header: null });
    const fire2 = fireScheduleByWebhook({ secret_plaintext: attach.secret, raw_body: '', signature_header: null });
    expect(fire1.ok).toBe(true);
    expect(fire1.skipped).toBeUndefined();
    expect(fire2.ok).toBe(true);
    expect(fire2.skipped).toBe(true);
    expect(DISPATCH_CALLS).toBe(1);
  });

  test('"allow" — both fires dispatch', () => {
    const s = mkSchedule({ concurrency: 'allow' });
    const attach = attachWebhook({ schedule_id: s.id });
    if (!attach.ok) throw new Error('attach failed');
    const fire1 = fireScheduleByWebhook({ secret_plaintext: attach.secret, raw_body: '', signature_header: null });
    const fire2 = fireScheduleByWebhook({ secret_plaintext: attach.secret, raw_body: '', signature_header: null });
    expect(fire1.ok).toBe(true);
    expect(fire2.ok).toBe(true);
    expect(fire1.skipped).toBeUndefined();
    expect(fire2.skipped).toBeUndefined();
    expect(DISPATCH_CALLS).toBe(2);
  });
});

describe('detachWebhook', () => {
  test('clears the secret_hash and reverts trigger', () => {
    const s = mkSchedule();
    attachWebhook({ schedule_id: s.id });
    const before = getScheduleById(s.id)!;
    expect(before.trigger?.kind).toBe('webhook');

    const r = detachWebhook({ schedule_id: s.id });
    expect(r.ok).toBe(true);

    const after = getScheduleById(s.id)!;
    expect(after.trigger).toBeUndefined();
  });
});

describe('audit log', () => {
  test('writes a line for success and failure', () => {
    const s = mkSchedule();
    const attach = attachWebhook({ schedule_id: s.id });
    if (!attach.ok) throw new Error('attach failed');

    // success
    fireScheduleByWebhook({ secret_plaintext: attach.secret, raw_body: '', signature_header: null });
    // failure (wrong secret)
    fireScheduleByWebhook({ secret_plaintext: 'wrong-' + 'b'.repeat(60), raw_body: '', signature_header: null });

    const lines = readAudit();
    // expect at least: attach (success), webhook fire success, webhook fire failure
    expect(lines.length).toBeGreaterThanOrEqual(3);
    expect(lines.some(l => l.source === 'attach' && l.ok === true)).toBe(true);
    expect(lines.some(l => l.source === 'webhook' && l.ok === true && l.schedule_id === s.id)).toBe(true);
    expect(lines.some(l => l.source === 'webhook' && l.ok === false)).toBe(true);
  });
});
