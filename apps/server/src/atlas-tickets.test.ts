// atlas-tickets.test.ts — bun:test
//
// Covers:
//   - single claim succeeds
//   - concurrent double-claim — second returns conflict
//   - expired claim — second can take over
//   - release by wrong agent — rejected
//   - listClaims excludes expired

import { describe, test, expect, beforeEach, afterAll } from 'bun:test';
import { existsSync, readFileSync, writeFileSync, unlinkSync, readdirSync } from 'fs';
import { join } from 'path';

// Point the module at an isolated test state dir so we don't stomp the real one.
const TEST_HOME = join('/tmp', `atlas-tickets-test-${process.pid}`);
process.env.ATLAS_HOME = TEST_HOME;

// Import AFTER env override so module init uses the test dir.
const mod = await import('./atlas-tickets');
const { claimTicket, releaseTicket, getClaim, listClaims, _clearAllClaimsForTest, _internal } = mod;

function setExpiredOnDisk(ticket_id: string, agent_id: string): void {
  // Write a lock file directly with expires_at in the past to simulate
  // a stale claim left behind by a dead agent.
  const p = _internal.lockPathFor(ticket_id);
  writeFileSync(p, JSON.stringify({
    claim_id: 'expired-test',
    ticket_id,
    agent_id,
    claimed_at: new Date(Date.now() - 600_000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
    expires_at: new Date(Date.now() - 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
  }));
}

beforeEach(() => {
  _clearAllClaimsForTest();
});

afterAll(() => {
  _clearAllClaimsForTest();
});

describe('atlas-tickets', () => {
  test('single claim succeeds and writes lock file', () => {
    const res = claimTicket({ ticket_id: 'tkt-1', agent_id: 'agent-A', ttl_seconds: 60 });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('unreachable');
    expect(res.ticket_id).toBe('tkt-1');
    expect(typeof res.claim_id).toBe('string');
    expect(typeof res.expires_at).toBe('string');

    const onDisk = readFileSync(_internal.lockPathFor('tkt-1'), 'utf8');
    const parsed = JSON.parse(onDisk);
    expect(parsed.ticket_id).toBe('tkt-1');
    expect(parsed.agent_id).toBe('agent-A');
  });

  test('concurrent double-claim — second returns conflict with holder', () => {
    const first = claimTicket({ ticket_id: 'tkt-2', agent_id: 'agent-A', ttl_seconds: 60 });
    expect(first.ok).toBe(true);

    const second = claimTicket({ ticket_id: 'tkt-2', agent_id: 'agent-B', ttl_seconds: 60 });
    expect(second.ok).toBe(false);
    if (second.ok) throw new Error('unreachable');
    expect(second.reason).toBe('conflict');
    expect(second.holder.agent_id).toBe('agent-A');
    expect(second.holder.ticket_id).toBe('tkt-2');
  });

  test('expired claim — second agent can take over', () => {
    setExpiredOnDisk('tkt-3', 'agent-A');
    // Sanity: file exists on disk before the claim attempt.
    expect(existsSync(_internal.lockPathFor('tkt-3'))).toBe(true);

    const res = claimTicket({ ticket_id: 'tkt-3', agent_id: 'agent-B', ttl_seconds: 60 });
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('unreachable');

    const holder = getClaim('tkt-3');
    expect(holder).not.toBeNull();
    expect(holder!.agent_id).toBe('agent-B');
  });

  test('release by wrong agent — rejected, lock survives', () => {
    const first = claimTicket({ ticket_id: 'tkt-4', agent_id: 'agent-A', ttl_seconds: 60 });
    expect(first.ok).toBe(true);

    const rej = releaseTicket({ ticket_id: 'tkt-4', agent_id: 'agent-B' });
    expect(rej.released).toBe(false);
    expect(rej.reason).toBe('not_holder');

    // Holder unchanged.
    const claim = getClaim('tkt-4');
    expect(claim).not.toBeNull();
    expect(claim!.agent_id).toBe('agent-A');

    // Correct agent can release.
    const ok = releaseTicket({ ticket_id: 'tkt-4', agent_id: 'agent-A' });
    expect(ok.released).toBe(true);
    expect(getClaim('tkt-4')).toBeNull();
  });

  test('release is idempotent on unclaimed ticket', () => {
    const res = releaseTicket({ ticket_id: 'tkt-never', agent_id: 'agent-A' });
    expect(res.released).toBe(true);
  });

  test('listClaims excludes expired claims', () => {
    const live = claimTicket({ ticket_id: 'tkt-live', agent_id: 'agent-A', ttl_seconds: 60 });
    expect(live.ok).toBe(true);
    setExpiredOnDisk('tkt-dead', 'agent-Z');

    const all = listClaims();
    const ids = all.map(c => c.ticket_id).sort();
    expect(ids).toContain('tkt-live');
    expect(ids).not.toContain('tkt-dead');
  });

  test('getClaim returns null for expired and sweeps the lock', () => {
    setExpiredOnDisk('tkt-sweep', 'agent-Z');
    const before = existsSync(_internal.lockPathFor('tkt-sweep'));
    expect(before).toBe(true);
    const c = getClaim('tkt-sweep');
    expect(c).toBeNull();
    const after = existsSync(_internal.lockPathFor('tkt-sweep'));
    expect(after).toBe(false);
  });

  test('rejects ticket_id with path traversal characters', () => {
    expect(() => claimTicket({ ticket_id: '../escape', agent_id: 'agent-A' })).toThrow();
    expect(() => claimTicket({ ticket_id: 'a/b', agent_id: 'agent-A' })).toThrow();
  });
});
