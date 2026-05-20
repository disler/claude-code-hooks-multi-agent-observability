// atlas-tickets.ts
//
// Atomic ticket checkout primitive. Replaces ad-hoc file locks with a single-
// writer claim system used to prevent double-claim of Atlas swarm tasks.
//
// Storage: flat JSON lock files under ~/atlas/.state/claims/<ticket_id>.lock
// Atomicity: fs.openSync(path, 'wx') — O_CREAT | O_EXCL | O_WRONLY. The OS
// rejects with EEXIST if the file already exists, giving us a single-writer
// guarantee on a single APFS volume.
//
// Lock contents (JSON):
//   { ticket_id, agent_id, claimed_at, expires_at, claim_id }
//
// Claim lifecycle:
//   1. claimTicket() — sweep target lock if expired, then O_EXCL create.
//   2. releaseTicket() — delete the lock; agent_id must match holder.
//   3. Stale claims (expires_at <= now) are reclaimable by anyone.
//
// On module init, expired locks are swept once. Subsequent sweeps happen
// per-claim against the target file only — listClaims() also filters expired
// entries for callers, regardless of whether they've been swept from disk.

import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeSync,
} from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

const ATLAS_HOME = process.env.ATLAS_HOME || '/Users/hrmacnair/atlas';
const STATE_DIR = join(ATLAS_HOME, '.state');
const CLAIMS_DIR = join(STATE_DIR, 'claims');

// ---------- types ----------------------------------------------------------

export interface Claim {
  claim_id: string;
  ticket_id: string;
  agent_id: string;
  claimed_at: string;
  expires_at: string;
}

export interface ClaimSuccess {
  ok: true;
  claim_id: string;
  expires_at: string;
  ticket_id: string;
}

export interface ClaimConflict {
  ok: false;
  reason: 'conflict';
  holder: Claim;
}

export type ClaimResult = ClaimSuccess | ClaimConflict;

// ---------- helpers --------------------------------------------------------

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function isExpired(claim: Pick<Claim, 'expires_at'>): boolean {
  try {
    return new Date(claim.expires_at).getTime() <= Date.now();
  } catch {
    return true;
  }
}

function lockPathFor(ticket_id: string): string {
  // Disallow path separators / nul / dotdot in ticket_id to keep lock files
  // confined to CLAIMS_DIR. Anything weirder gets rejected up front.
  if (!ticket_id || typeof ticket_id !== 'string') {
    throw new Error('ticket_id required');
  }
  if (ticket_id.includes('/') || ticket_id.includes('\\') || ticket_id.includes('\0') || ticket_id === '.' || ticket_id === '..') {
    throw new Error('ticket_id contains illegal characters');
  }
  return join(CLAIMS_DIR, `${ticket_id}.lock`);
}

function ensureDirs(): void {
  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
  if (!existsSync(CLAIMS_DIR)) mkdirSync(CLAIMS_DIR, { recursive: true });
}

function readLockFile(p: string): Claim | null {
  try {
    if (!existsSync(p)) return null;
    const raw = readFileSync(p, 'utf8');
    const parsed = JSON.parse(raw) as Claim;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.ticket_id !== 'string') return null;
    if (typeof parsed.agent_id !== 'string') return null;
    if (typeof parsed.claimed_at !== 'string') return null;
    if (typeof parsed.expires_at !== 'string') return null;
    if (typeof parsed.claim_id !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

function sweepIfExpired(p: string): void {
  const existing = readLockFile(p);
  if (existing && isExpired(existing)) {
    try {
      unlinkSync(p);
    } catch {
      // someone else swept; fine.
    }
  }
}

// ---------- init -----------------------------------------------------------

ensureDirs();
// One-shot sweep on module load. Anything stale is gone before first claim.
try {
  for (const name of readdirSync(CLAIMS_DIR)) {
    if (!name.endsWith('.lock')) continue;
    sweepIfExpired(join(CLAIMS_DIR, name));
  }
} catch {
  // Directory just appeared / race on init; non-fatal.
}

// ---------- public api -----------------------------------------------------

export interface ClaimOpts {
  ticket_id: string;
  agent_id: string;
  ttl_seconds?: number;
}

/**
 * Atomically claim a ticket.
 *
 * Implementation:
 *   const fd = fs.openSync(p, 'wx');   // O_CREAT | O_EXCL | O_WRONLY
 *
 * If the file already exists and is non-expired → conflict.
 * If the file already exists but is expired → sweep then retry once.
 */
export function claimTicket(opts: ClaimOpts): ClaimResult {
  if (!opts.agent_id || typeof opts.agent_id !== 'string') {
    throw new Error('agent_id required');
  }
  const ttl = opts.ttl_seconds && opts.ttl_seconds > 0 ? opts.ttl_seconds : 300;
  const p = lockPathFor(opts.ticket_id);

  ensureDirs();
  // Targeted sweep before attempting create.
  sweepIfExpired(p);

  const now = Date.now();
  const claim: Claim = {
    claim_id: randomUUID(),
    ticket_id: opts.ticket_id,
    agent_id: opts.agent_id,
    claimed_at: nowIso(),
    expires_at: new Date(now + ttl * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
  };
  const payload = JSON.stringify(claim, null, 2);

  const expected = Buffer.byteLength(payload, 'utf8');

  // First attempt.
  try {
    const fd = openSync(p, 'wx');
    try {
      try {
        const written = writeSync(fd, payload);
        if (written !== expected) {
          throw new Error(`partial write to lock file: wrote ${written}/${expected} bytes`);
        }
      } catch (werr) {
        try { unlinkSync(p); } catch {}
        throw werr;
      }
    } finally {
      closeSync(fd);
    }
    return { ok: true, claim_id: claim.claim_id, expires_at: claim.expires_at, ticket_id: claim.ticket_id };
  } catch (err: any) {
    if (err && err.code === 'EEXIST') {
      // Race or stale. Re-read; if expired, sweep and retry exactly once.
      const existing = readLockFile(p);
      if (existing && isExpired(existing)) {
        try { unlinkSync(p); } catch {}
        try {
          const fd = openSync(p, 'wx');
          try {
            try {
              const written = writeSync(fd, payload);
              if (written !== expected) {
                throw new Error(`partial write to lock file: wrote ${written}/${expected} bytes`);
              }
            } catch (werr) {
              try { unlinkSync(p); } catch {}
              throw werr;
            }
          } finally {
            closeSync(fd);
          }
          return { ok: true, claim_id: claim.claim_id, expires_at: claim.expires_at, ticket_id: claim.ticket_id };
        } catch (err2: any) {
          // Lost the race after sweep — someone else claimed it.
          const winner = readLockFile(p);
          if (winner) {
            return { ok: false, reason: 'conflict', holder: winner };
          }
          throw err2;
        }
      }
      if (existing) {
        return { ok: false, reason: 'conflict', holder: existing };
      }
      // File vanished between EEXIST and re-read — try one more time.
      try {
        const fd = openSync(p, 'wx');
        try {
          try {
            const written = writeSync(fd, payload);
            if (written !== expected) {
              throw new Error(`partial write to lock file: wrote ${written}/${expected} bytes`);
            }
          } catch (werr) {
            try { unlinkSync(p); } catch {}
            throw werr;
          }
        } finally {
          closeSync(fd);
        }
        return { ok: true, claim_id: claim.claim_id, expires_at: claim.expires_at, ticket_id: claim.ticket_id };
      } catch {
        const winner = readLockFile(p);
        if (winner) return { ok: false, reason: 'conflict', holder: winner };
        throw err;
      }
    }
    throw err;
  }
}

export interface ReleaseOpts {
  ticket_id: string;
  agent_id: string;
}

export interface ReleaseResult {
  released: boolean;
  reason?: 'not_holder' | 'not_claimed';
  holder?: Claim;
}

/**
 * Release a ticket. Idempotent — releasing an unclaimed ticket is a no-op
 * success. Releasing another agent's claim is rejected.
 */
export function releaseTicket(opts: ReleaseOpts): ReleaseResult {
  if (!opts.agent_id || typeof opts.agent_id !== 'string') {
    throw new Error('agent_id required');
  }
  const p = lockPathFor(opts.ticket_id);
  const existing = readLockFile(p);
  if (!existing) {
    return { released: true, reason: 'not_claimed' };
  }
  // Expired claims are effectively unclaimed; any agent can clear them.
  if (!isExpired(existing) && existing.agent_id !== opts.agent_id) {
    return { released: false, reason: 'not_holder', holder: existing };
  }
  try {
    unlinkSync(p);
  } catch {
    // Already gone — still a success.
  }
  return { released: true };
}

/**
 * Return the current claim for a ticket, or null if unclaimed/expired.
 * Expired claims are swept as a side effect.
 */
export function getClaim(ticket_id: string): Claim | null {
  const p = lockPathFor(ticket_id);
  const existing = readLockFile(p);
  if (!existing) return null;
  if (isExpired(existing)) {
    try { unlinkSync(p); } catch {}
    return null;
  }
  return existing;
}

/**
 * List all non-expired claims. Expired claims encountered during the scan
 * are not included and are not swept here (avoids fighting with concurrent
 * writers); per-ticket sweep happens in claimTicket / getClaim.
 */
export function listClaims(): Claim[] {
  ensureDirs();
  const out: Claim[] = [];
  let names: string[];
  try {
    names = readdirSync(CLAIMS_DIR);
  } catch {
    return [];
  }
  for (const name of names) {
    if (!name.endsWith('.lock')) continue;
    const claim = readLockFile(join(CLAIMS_DIR, name));
    if (!claim) continue;
    if (isExpired(claim)) continue;
    out.push(claim);
  }
  return out;
}

// ---------- testing hooks --------------------------------------------------

/** Internal: clear all claims. Test-only. */
export function _clearAllClaimsForTest(): void {
  ensureDirs();
  for (const name of readdirSync(CLAIMS_DIR)) {
    if (!name.endsWith('.lock')) continue;
    try { unlinkSync(join(CLAIMS_DIR, name)); } catch {}
  }
}

export const _internal = {
  CLAIMS_DIR,
  lockPathFor,
  readLockFile,
};
