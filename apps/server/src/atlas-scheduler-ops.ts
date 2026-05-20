// atlas-scheduler-ops.ts
//
// Layer 5c — retry + abandon endpoints for scheduled missions.
//
// retry:   POSTs to /api/atlas/scheduler/retry/:division/:jobId. Shells out
//          to `node scheduler.js --run-once <div>/<jobId>` detached. Returns
//          immediately. Scheduler audits + reply-log dumps as usual.
//
// abandon: POSTs to /api/atlas/scheduler/abandon/:division/:jobId. Appends
//          to ~/atlas/scheduler/abandon-requests.json. The scheduler's
//          pollAbandonRequests() picks it up on the next tick, SIGTERMs the
//          running process, audits, clears the request.

import { spawn } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'fs';
import { join } from 'path';
import crypto from 'crypto';

const ATLAS_HOME = '/Users/hrmacnair/atlas';
const SCHEDULER_JS = join(ATLAS_HOME, 'scheduler', 'scheduler.js');
const ABANDON_FILE = join(ATLAS_HOME, 'scheduler', 'abandon-requests.json');
const AUDIT_DIR = join(ATLAS_HOME, 'audit');
const DIVISIONS_DIR = join(ATLAS_HOME, 'divisions');

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}
function actId(): string {
  return `act_${Math.floor(Date.now() / 1000)}_${crypto.randomBytes(3).toString('hex')}`;
}
function appendAudit(entry: any): void {
  try {
    mkdirSync(AUDIT_DIR, { recursive: true });
    const month = new Date().toISOString().slice(0, 7);
    appendFileSync(join(AUDIT_DIR, `${month}.log`), JSON.stringify(entry) + '\n');
  } catch {}
}

function isKnownDivision(division: string): boolean {
  return existsSync(join(DIVISIONS_DIR, division, 'division.yaml'));
}

export function retryScheduledJob(division: string, jobId: string, approver: string, surface: string):
    { ok: boolean; message: string; pid?: number } {
  if (!isKnownDivision(division)) {
    return { ok: false, message: `unknown division: ${division}` };
  }
  if (!existsSync(SCHEDULER_JS)) {
    return { ok: false, message: `scheduler.js not found at ${SCHEDULER_JS}` };
  }
  const target = `${division}/${jobId}`;

  // Fire-and-forget. Detached so the job survives this HTTP response.
  let pid: number | undefined;
  try {
    const proc = spawn('node', [SCHEDULER_JS, '--run-once', target], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env },
    });
    proc.unref();
    pid = proc.pid;
  } catch (err: any) {
    return { ok: false, message: `spawn failed: ${err.message}` };
  }

  appendAudit({
    ts: nowIso(),
    id: actId(),
    division,
    agent: 'ops',
    mission_id: null,
    action: 'mission_retried',
    target: jobId,
    summary: `Manual retry via ${surface} (detached pid ${pid})`,
    autonomy: 'bold',
    outcome: 'executed',
    approver,
    correlation_id: null,
  });

  return { ok: true, message: `dispatched retry of ${target} (pid ${pid})`, pid };
}

export function abandonScheduledJob(division: string, jobId: string, approver: string, surface: string):
    { ok: boolean; message: string } {
  if (!isKnownDivision(division)) {
    return { ok: false, message: `unknown division: ${division}` };
  }
  const stateKey = `${division}/${jobId}`;

  // Append to ~/atlas/scheduler/abandon-requests.json. Scheduler reads each tick.
  let current: { requests: any[] } = { requests: [] };
  try {
    if (existsSync(ABANDON_FILE)) {
      const raw = JSON.parse(readFileSync(ABANDON_FILE, 'utf8'));
      if (Array.isArray(raw.requests)) current = raw;
    }
  } catch {}
  // Dedupe — don't append the same stateKey twice if it's already pending.
  const alreadyQueued = current.requests.some((r: any) => r && r.stateKey === stateKey);
  if (!alreadyQueued) {
    current.requests.push({
      stateKey,
      requested_at: nowIso(),
      requested_by: approver,
      surface,
    });
    try {
      writeFileSync(ABANDON_FILE, JSON.stringify(current, null, 2));
    } catch (err: any) {
      return { ok: false, message: `abandon-requests write failed: ${err.message}` };
    }
  }

  // Server-side audit. Scheduler also audits when it actually SIGTERMs.
  appendAudit({
    ts: nowIso(),
    id: actId(),
    division,
    agent: 'ops',
    mission_id: null,
    action: 'mission_abandon_requested',
    target: jobId,
    summary: `Abandon queued via ${surface}; scheduler picks up on next tick`,
    autonomy: 'bold',
    outcome: 'queued',
    approver,
    correlation_id: null,
  });

  return { ok: true, message: alreadyQueued
    ? `abandon already queued for ${stateKey}`
    : `abandon queued for ${stateKey} (next tick)` };
}
