// atlas-division-state.ts
//
// Phase 10 Layer 1 follow-up. Bumps a division's state.json after every
// audit write made from inside the dashboard server (atlas-events,
// atlas-today, atlas-proposals, atlas-whitepaper).
//
// Same semantics as ~/atlas/scheduler/helpers/division-state.js (the
// scheduler side). Kept as a separate file because the dashboard server
// runs under Bun and the scheduler runs under Node.

import { readdirSync, readFileSync, writeFileSync, existsSync, renameSync } from 'fs';
import { join } from 'path';

const ATLAS_HOME = process.env.ATLAS_HOME || '/Users/hrmacnair/atlas';
const DIVISIONS_DIR = join(ATLAS_HOME, 'divisions');
const PENDING_DIR = join(ATLAS_HOME, 'review', 'pending');

function countPendingForDivision(division: string): number {
  try {
    const files = readdirSync(PENDING_DIR).filter(f => f.endsWith('.yaml'));
    let n = 0;
    for (const f of files) {
      try {
        const text = readFileSync(join(PENDING_DIR, f), 'utf8');
        const m = text.match(/^division:\s*(.+)$/m);
        if (m && m[1].trim() === division) n++;
      } catch {}
    }
    return n;
  } catch {
    return 0;
  }
}

function readMissionsInProgress(division: string): string[] {
  const p = join(DIVISIONS_DIR, division, 'missions.yaml');
  try {
    const text = readFileSync(p, 'utf8');
    if (!text || text.trim() === '[]') return [];
    const blocks = text.split(/(?=^- )/m);
    const ids: string[] = [];
    for (const block of blocks) {
      const idM = block.match(/^[- ]*\s*id:\s*(.+)$/m);
      const stM = block.match(/^\s*status:\s*(.+)$/m);
      if (idM && stM && /in_progress/i.test(stM[1].trim())) {
        ids.push(idM[1].trim());
      }
    }
    return ids;
  } catch {
    return [];
  }
}

export function bumpDivisionState(division: string | undefined | null, actionId: string | null, ts?: string): void {
  if (!division) return;
  const dir = join(DIVISIONS_DIR, division);
  if (!existsSync(dir)) return;
  const statePath = join(dir, 'state.json');

  let state: any = {
    last_activity: null,
    last_action_id: null,
    current_missions: [],
    pending_review_count: 0,
    drift_score: 0.0,
    health: 'green',
  };
  try { state = { ...state, ...JSON.parse(readFileSync(statePath, 'utf8')) }; } catch {}

  state.last_activity = ts || new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  if (actionId) state.last_action_id = actionId;
  state.pending_review_count = countPendingForDivision(division);
  state.current_missions = readMissionsInProgress(division);

  try {
    const tmp = statePath + '.tmp';
    writeFileSync(tmp, JSON.stringify(state, null, 2));
    renameSync(tmp, statePath);
  } catch {}
}
