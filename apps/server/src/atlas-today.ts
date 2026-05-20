// ~/atlas/observability/apps/server/src/atlas-today.ts
//
// Today queue — single source of truth at ~/atlas/today/queue.yaml.
// Same content surfaces in the dashboard and the 06:00 Telegram digest.
//
// Item lifecycle:
//   pending → done       (operator marks operator_task complete)
//   pending → deferred   (moves to ~/atlas/today/deferred/queue.yaml,
//                         resurfaces in tomorrow's ranking)
//   pending → approved   (for type=approval; routes through the underlying
//                         proposal's apply pipeline via atlas-proposals)
//   pending → rejected   (for type=approval; same)
//
// Item types: approval, operator_task, scout_candidate, read_recommended,
//             operator_added, retirement_proposal, trial_concern.
//
// Layer 4 (Today) scope:
//   - Queue file + schema + endpoints + rule-based bootstrap ranker.
//   - Sync from existing atlas-proposals pending queue → emits `approval` items.
//   - Operator-added items via add().
//   - approve/reject for approval items delegate to atlas-proposals.
//   - done/defer/pin for any item.
//   - Archive done items at midnight (scheduled job calls archiveDone()).
//
// Out of scope this layer:
//   - Opus producer re-rank (lands as a 06:00 scheduled job — calls
//     rankItems() with an LLM-driven priority. Until then, rule-based.)
//   - Dashboard Vue card (data plane only this session; UI is dashboard work).

import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'fs';
import { join } from 'path';
import crypto from 'crypto';
import { listProposals, approveProposal, rejectProposal } from './atlas-proposals';
import { listCandidates, listTrials } from './atlas-scout';
import { existingGoalIds } from './atlas-goals';

const ATLAS_HOME = '/Users/hrmacnair/atlas';
const TODAY_DIR = join(ATLAS_HOME, 'today');
const QUEUE_FILE = join(TODAY_DIR, 'queue.yaml');
const DEFERRED_FILE = join(TODAY_DIR, 'deferred', 'queue.yaml');
const DONE_DIR = join(TODAY_DIR, 'done');
const AUDIT_DIR = join(ATLAS_HOME, 'audit');
const UV_BIN = '/opt/homebrew/bin/uv';

export type TodayItemType =
  | 'approval'
  | 'operator_task'
  | 'scout_candidate'
  | 'read_recommended'
  | 'operator_added'
  | 'retirement_proposal'
  | 'trial_concern'
  | 'incubator_stale';

export type TodayUrgency = 'red' | 'yellow' | 'green' | 'white';

export type TodayItem = {
  item_id: string;
  type: TodayItemType;
  title: string;
  urgency: TodayUrgency;
  priority_rank: number;       // lower = higher priority
  origin: string;              // atlas-meta | margin | industry | scout | operator | trading
  related_artifact?: string;   // proposal id, mission id, brief slug, candidate id
  preview: string;
  actions: Array<{ label: string; verb: string; target?: string }>;
  created: string;             // ISO
  updated: string;             // ISO
  operator_done: boolean;
  operator_done_at: string | null;
  pinned?: boolean;
  // Paperclip-3 cascade: optional link up the ancestry tree.
  // Mission → Project → Goal → Task. `goal_id` references atlas-goals.
  // Cards without a goal_id (or pointing at a stale goal) surface as orphans.
  goal_id?: string | null;
  orphan?: boolean;
};

// Paperclip-3: in-place tag of cards with no goal_id or a goal_id pointing
// at a goal that no longer exists. Pure function — caller decides whether
// to persist. Returns the same array reference for ergonomic chaining.
export function flagOrphanCards<T extends Pick<TodayItem, 'goal_id' | 'orphan'>>(cards: T[]): T[] {
  let ids: Set<string>;
  try { ids = existingGoalIds(); } catch { ids = new Set(); }
  for (const c of cards) {
    c.orphan = !c.goal_id || !ids.has(c.goal_id);
  }
  return cards;
}

// ----- yaml helpers --------------------------------------------------------

function readYamlArray(path: string): any[] {
  try {
    if (!existsSync(path)) return [];
    const res = spawnSync(
      UV_BIN,
      ['run', '--quiet', '--with', 'pyyaml', 'python3', '-c',
       'import sys,json,yaml; d=yaml.safe_load(open(sys.argv[1])); print(json.dumps(d or [], default=str))',
       path],
      { encoding: 'utf8' }
    );
    if (res.status !== 0) return [];
    const parsed = JSON.parse(res.stdout);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeYamlArray(path: string, data: any[]): boolean {
  try {
    mkdirSync(join(path, '..'), { recursive: true });
    const json = JSON.stringify(data);
    const res = spawnSync(
      UV_BIN,
      ['run', '--quiet', '--with', 'pyyaml', 'python3', '-c',
       'import sys,json,yaml; d=json.loads(sys.stdin.read()); print(yaml.safe_dump(d, sort_keys=False, default_flow_style=False, allow_unicode=True), end="")'],
      { input: json, encoding: 'utf8' }
    );
    if (res.status !== 0) return false;
    writeFileSync(path, res.stdout || '[]\n');
    return true;
  } catch {
    return false;
  }
}

// ----- audit ---------------------------------------------------------------

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function actId(): string {
  return `act_${Math.floor(Date.now() / 1000)}_${crypto.randomBytes(3).toString('hex')}`;
}

import { bumpDivisionState } from './atlas-division-state';

function appendAudit(entry: any): void {
  try {
    mkdirSync(AUDIT_DIR, { recursive: true });
    const month = new Date().toISOString().slice(0, 7);
    const path = join(AUDIT_DIR, `${month}.log`);
    const { appendFileSync } = require('fs');
    appendFileSync(path, JSON.stringify(entry) + '\n');
  } catch {}
  try {
    if (entry && entry.division) {
      bumpDivisionState(entry.division, entry.id || null, entry.ts || '');
    }
  } catch {}
}

// ----- queue I/O -----------------------------------------------------------

function readQueue(): TodayItem[] {
  return readYamlArray(QUEUE_FILE) as TodayItem[];
}

function readDeferred(): TodayItem[] {
  return readYamlArray(DEFERRED_FILE) as TodayItem[];
}

function writeQueue(items: TodayItem[]): boolean {
  return writeYamlArray(QUEUE_FILE, items);
}

function writeDeferred(items: TodayItem[]): boolean {
  return writeYamlArray(DEFERRED_FILE, items);
}

function newItemId(): string {
  return `today_${Math.floor(Date.now() / 1000)}_${crypto.randomBytes(2).toString('hex')}`;
}

// ----- rule-based ranker (bootstrap until 06:00 opus job lands) ------------

function rankItems(items: TodayItem[]): TodayItem[] {
  // Score per item (lower = higher priority):
  //   pinned                                              → 0
  //   red                                                 → 100
  //   yellow                                              → 200
  //   green                                               → 300
  //   white                                               → 400
  //   + age days * 0.5 (older items float up, capped at -50)
  //   + operator_added bonus (-20)
  const urgencyScore: Record<TodayUrgency, number> = { red: 100, yellow: 200, green: 300, white: 400 };
  const now = Date.now();

  const scored = items.map(it => {
    let score = it.pinned ? 0 : urgencyScore[it.urgency] ?? 300;
    const ageDays = (now - new Date(it.created).getTime()) / 86_400_000;
    score -= Math.min(50, ageDays * 0.5);
    if (it.type === 'operator_added') score -= 20;
    return { it, score };
  });

  scored.sort((a, b) => a.score - b.score);
  return scored.map((entry, i) => ({ ...entry.it, priority_rank: i + 1 }));
}

// ----- sync from atlas-proposals ------------------------------------------

// Pull current pending+queued+deferred proposals and ensure each has a
// matching `approval` item in the queue. Existing items keyed by
// related_artifact == proposal.id stay (any operator-set fields preserved).
export function syncFromProposals(): { added: number; removed: number; total: number } {
  const items = readQueue();
  const existingByArtifact = new Map<string, TodayItem>();
  for (const it of items) {
    if (it.type === 'approval' && it.related_artifact) {
      existingByArtifact.set(it.related_artifact, it);
    }
  }

  const proposals = listProposals().filter(p => p.status === 'pending' || p.status === 'queued' || p.status === 'deferred');
  const seenArtifacts = new Set<string>();

  let added = 0;
  for (const p of proposals) {
    seenArtifacts.add(p.id);
    if (existingByArtifact.has(p.id)) continue;

    let urgency: TodayUrgency = 'green';
    if (p.human_only) urgency = 'red';       // hook_patch etc. blocks downstream work
    else if (p.velocity_state === 'queued_over_cap') urgency = 'white';

    items.push({
      item_id: newItemId(),
      type: 'approval',
      title: `${p.type}: ${p.target_file || '(no target)'}`,
      urgency,
      priority_rank: 0,
      origin: p.proposer_division,
      related_artifact: p.id,
      preview: (p.rationale_preview || p.diff_preview.split('\n')[0] || '').slice(0, 200),
      actions: [
        { label: 'Approve', verb: 'approve', target: p.id },
        { label: 'Reject',  verb: 'reject',  target: p.id },
        { label: 'Defer',   verb: 'defer',   target: p.id },
      ],
      created: p.created || nowIso(),
      updated: nowIso(),
      operator_done: false,
      operator_done_at: null,
    });
    added++;
  }

  // Remove approval items whose underlying proposal no longer exists in pending/queued/deferred
  let removed = 0;
  const filtered = items.filter(it => {
    if (it.type !== 'approval') return true;
    if (!it.related_artifact) return true;
    if (seenArtifacts.has(it.related_artifact)) return true;
    removed++;
    return false;
  });

  // ----- Layer 5b: also sync Scout's top-3-this-week candidates as
  // scout_candidate items, and any paused trials as trial_concern items.
  const existingScoutArtifacts = new Set<string>();
  for (const it of filtered) {
    if ((it.type === 'scout_candidate' || it.type === 'trial_concern') && it.related_artifact) {
      existingScoutArtifacts.add(it.related_artifact);
    }
  }
  try {
    const candidates = listCandidates();
    // Take top 3 by score that are still pending (not installed/declined)
    const topPending = candidates
      .filter(c => c.status === 'pending' && c.recommendation === 'install_proposed')
      .slice(0, 3);
    for (const c of topPending) {
      if (existingScoutArtifacts.has(c.candidate_id)) continue;
      filtered.push({
        item_id: newItemId(),
        type: 'scout_candidate',
        title: `${c.name} · ${c.score_total.toFixed(1)}/10 (${c.type})`,
        urgency: c.human_only ? 'red' : 'green',
        priority_rank: 0,
        origin: 'scout',
        related_artifact: c.candidate_id,
        preview: c.repo ? `${c.repo} — install?` : `install?`,
        actions: [
          { label: 'Install', verb: 'approve', target: c.candidate_id },
          { label: 'Decline', verb: 'reject',  target: c.candidate_id },
          { label: 'Defer',   verb: 'defer',   target: c.candidate_id },
        ],
        created: c.discovered || nowIso(),
        updated: nowIso(),
        operator_done: false,
        operator_done_at: null,
      });
      added++;
    }
    const pausedTrials = listTrials().filter(t => t.data?.status === 'paused');
    for (const t of pausedTrials) {
      if (existingScoutArtifacts.has(t.candidate_id)) continue;
      filtered.push({
        item_id: newItemId(),
        type: 'trial_concern',
        title: `Trial paused: ${t.data.name || t.candidate_id}`,
        urgency: 'red',
        priority_rank: 0,
        origin: 'scout',
        related_artifact: t.candidate_id,
        preview: (t.data.concerns?.[t.data.concerns.length - 1]?.reason) || 'trial watchdog tripped',
        actions: [
          { label: 'Investigate', verb: 'pin',  target: t.candidate_id },
          { label: 'Decline',     verb: 'reject', target: t.candidate_id },
          { label: 'Defer',       verb: 'defer', target: t.candidate_id },
        ],
        created: t.data.installed_at || nowIso(),
        updated: nowIso(),
        operator_done: false,
        operator_done_at: null,
      });
      added++;
    }
  } catch (err) {
    // Scout module not yet built or empty — sync gracefully skips.
  }

  // ----- Phase A: surface stale incubator missions as Today items -----
  // Stale rules live in atlas-incubator.ts (queued >21d, in_progress >14d,
  // drafted >7d, review >3d). Each stale mission becomes one Today item.
  // De-dupe by mission id so re-syncs don't pile up duplicates.
  const existingIncubatorArtifacts = new Set<string>();
  for (const it of filtered) {
    if (it.type === 'incubator_stale' && it.related_artifact) {
      existingIncubatorArtifacts.add(it.related_artifact);
    }
  }
  try {
    const { listMissions, isStale, daysInCurrentStage } = require('./atlas-incubator');
    const allMissions = listMissions() as any[];
    const staleMissions = allMissions.filter(m =>
      m.status !== 'graduated' && m.status !== 'abandoned' && isStale(m)
    );
    for (const m of staleMissions) {
      if (existingIncubatorArtifacts.has(m.id)) continue;
      const days = daysInCurrentStage(m) ?? '?';
      const urgency: TodayUrgency =
        m.status === 'review' ? 'red'
        : m.status === 'in_progress' ? 'red'
        : m.status === 'drafted' ? 'yellow'
        : 'yellow';
      const verbForStage =
        m.status === 'review' ? 'Promote or kill'
        : m.status === 'in_progress' ? 'Decide: validate harder or kill'
        : m.status === 'drafted' ? 'Open landing or kill'
        : 'Validate or kill';
      filtered.push({
        item_id: newItemId(),
        type: 'incubator_stale',
        title: `${verbForStage} — ${m.title}`,
        urgency,
        priority_rank: 0,
        origin: 'incubator',
        related_artifact: m.id,
        preview: `${m.status} for ${days}d · score ${m.score?.total ?? '?'}/50 · ${m.category || ''}`,
        actions: [
          { label: 'Open',  verb: 'pin',    target: m.id },
          { label: 'Defer', verb: 'defer',  target: m.id },
        ],
        created: m.created || nowIso(),
        updated: nowIso(),
        operator_done: false,
        operator_done_at: null,
      });
      added++;
    }
  } catch (err) {
    // Incubator module not yet built or empty — sync gracefully skips.
  }

  const ranked = rankItems(filtered);
  writeQueue(ranked);
  return { added, removed, total: ranked.length };
}

// ----- public API ----------------------------------------------------------

export function getToday(opts?: { includeDeferred?: boolean }): {
  queue: TodayItem[];
  deferred: TodayItem[];
  completed_today: TodayItem[];
  summary: { total: number; orphan_count: number };
} {
  // Sync from proposals every read — cheap and keeps the queue fresh.
  syncFromProposals();
  const all = readQueue();
  const completed_today = all.filter(it => {
    if (!it.operator_done || !it.operator_done_at) return false;
    return it.operator_done_at.slice(0, 10) === new Date().toISOString().slice(0, 10);
  });
  const active = all.filter(it => !it.operator_done);

  // Paperclip-3: tag orphans on the live + deferred surfaces so the dashboard
  // can render the red-dot badge without a second round-trip.
  flagOrphanCards(active);
  const deferred = opts?.includeDeferred ? readDeferred() : [];
  if (deferred.length > 0) flagOrphanCards(deferred);
  flagOrphanCards(completed_today);

  const orphan_count = active.reduce((n, it) => n + (it.orphan ? 1 : 0), 0);

  return {
    queue: active,
    deferred,
    completed_today,
    summary: { total: active.length, orphan_count },
  };
}

export function addOperatorItem(text: string, urgency: TodayUrgency = 'green', surface = 'unknown'): { ok: boolean; item?: TodayItem; message: string } {
  if (!text || !text.trim()) return { ok: false, message: 'empty text' };

  // Telegram add: urgent-keyword bump
  const t = text.trim().toLowerCase();
  if (urgency === 'green' && /\b(today|urgent|tonight|asap|now)\b/.test(t)) {
    urgency = 'yellow';
  }

  const item: TodayItem = {
    item_id: newItemId(),
    type: 'operator_added',
    title: text.trim().slice(0, 120),
    urgency,
    priority_rank: 0,
    origin: 'operator',
    preview: text.trim(),
    actions: [
      { label: 'Done',  verb: 'done',  target: '' },
      { label: 'Defer', verb: 'defer', target: '' },
      { label: 'Pin',   verb: 'pin',   target: '' },
    ],
    created: nowIso(),
    updated: nowIso(),
    operator_done: false,
    operator_done_at: null,
  };

  const items = readQueue();
  items.push(item);
  const ranked = rankItems(items);
  writeQueue(ranked);

  appendAudit({
    ts: nowIso(), id: actId(),
    division: 'atlas-meta',
    agent: 'operator',
    action: 'today_item_added',
    target: item.item_id,
    summary: `operator added via ${surface}: ${item.title}`,
    autonomy: 'bold',
    outcome: 'executed',
    approver: 'operator',
    correlation_id: item.item_id,
  });

  return { ok: true, item, message: `added ${item.item_id}` };
}

function findItem(id: string): { items: TodayItem[]; idx: number } | null {
  const items = readQueue();
  let idx = items.findIndex(it => it.item_id === id);
  if (idx === -1) idx = items.findIndex(it => it.item_id.startsWith(id));
  if (idx === -1) return null;
  return { items, idx };
}

export function markDone(id: string, surface: string): { ok: boolean; message: string } {
  const found = findItem(id);
  if (!found) return { ok: false, message: `item ${id} not found` };
  const it = found.items[found.idx];
  it.operator_done = true;
  it.operator_done_at = nowIso();
  it.updated = nowIso();
  writeQueue(rankItems(found.items));
  appendAudit({
    ts: nowIso(), id: actId(),
    division: 'atlas-meta', agent: 'operator',
    action: 'today_item_done',
    target: it.item_id, summary: `done via ${surface}: ${it.title}`,
    autonomy: 'bold', outcome: 'executed', approver: 'operator',
    correlation_id: it.item_id,
  });
  return { ok: true, message: `marked done: ${it.item_id}` };
}

export function pinItem(id: string, surface: string): { ok: boolean; message: string } {
  const found = findItem(id);
  if (!found) return { ok: false, message: `item ${id} not found` };
  const it = found.items[found.idx];
  it.pinned = true;
  it.updated = nowIso();
  writeQueue(rankItems(found.items));
  appendAudit({
    ts: nowIso(), id: actId(),
    division: 'atlas-meta', agent: 'operator',
    action: 'today_item_pinned',
    target: it.item_id, summary: `pinned via ${surface}: ${it.title}`,
    autonomy: 'bold', outcome: 'executed', approver: 'operator',
    correlation_id: it.item_id,
  });
  return { ok: true, message: `pinned ${it.item_id}` };
}

export function deferItem(id: string, surface: string): { ok: boolean; message: string } {
  const found = findItem(id);
  if (!found) return { ok: false, message: `item ${id} not found` };
  const it = found.items[found.idx];

  // Pull from queue, push to deferred
  const remaining = [...found.items];
  remaining.splice(found.idx, 1);
  writeQueue(rankItems(remaining));

  const deferred = readDeferred();
  deferred.push({ ...it, updated: nowIso() });
  writeDeferred(deferred);

  // If item was an approval, also defer the underlying proposal so the
  // proposal pipeline knows it's been queued for tomorrow.
  if (it.type === 'approval' && it.related_artifact) {
    // We don't fail if proposal defer errors — the today defer still stuck.
    try {
      const httpMod = require('http');
      const body = JSON.stringify({ surface, approver: 'operator' });
      httpMod.request({
        hostname: 'localhost', port: 4000,
        path: `/api/atlas/proposals/${encodeURIComponent(it.related_artifact)}/defer`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      }, () => {}).end(body);
    } catch {}
  }

  appendAudit({
    ts: nowIso(), id: actId(),
    division: 'atlas-meta', agent: 'operator',
    action: 'today_item_deferred',
    target: it.item_id, summary: `deferred via ${surface}: ${it.title}`,
    autonomy: 'bold', outcome: 'queued', approver: 'operator',
    correlation_id: it.item_id,
  });
  return { ok: true, message: `deferred ${it.item_id}` };
}

export function approveItem(id: string, surface: string): { ok: boolean; message: string } {
  const found = findItem(id);
  if (!found) return { ok: false, message: `item ${id} not found` };
  const it = found.items[found.idx];
  if (it.type !== 'approval' || !it.related_artifact) {
    return { ok: false, message: `item ${it.item_id} is not an approval` };
  }
  // Route through proposal apply pipeline
  const result = approveProposal(it.related_artifact, 'operator', surface);
  if (!result.ok) return result;

  // Mark today item done so it leaves the active list
  it.operator_done = true;
  it.operator_done_at = nowIso();
  it.updated = nowIso();
  writeQueue(rankItems(found.items));
  return { ok: true, message: `approved (proposal applied): ${result.message}` };
}

export function rejectItem(id: string, surface: string, note?: string): { ok: boolean; message: string } {
  const found = findItem(id);
  if (!found) return { ok: false, message: `item ${id} not found` };
  const it = found.items[found.idx];
  if (it.type !== 'approval' || !it.related_artifact) {
    return { ok: false, message: `item ${it.item_id} is not an approval` };
  }
  const result = rejectProposal(it.related_artifact, 'operator', surface, note);
  if (!result.ok) return result;

  it.operator_done = true;
  it.operator_done_at = nowIso();
  it.updated = nowIso();
  writeQueue(rankItems(found.items));
  return { ok: true, message: `rejected (proposal moved to rejected/): ${result.message}` };
}

// ----- nightly maintenance -------------------------------------------------

// Archive done items to ~/atlas/today/done/{YYYY-MM-DD}.yaml and remove them
// from the live queue. Also re-merges deferred items back into the queue.
// Scheduler calls this via the 23:59 archive_done job; safe to call ad hoc.
export function archiveDoneAndRefresh(): { archived: number; resurfaced: number } {
  const all = readQueue();
  const today = new Date().toISOString().slice(0, 10);

  const done = all.filter(it => it.operator_done);
  const active = all.filter(it => !it.operator_done);

  if (done.length > 0) {
    mkdirSync(DONE_DIR, { recursive: true });
    const archivePath = join(DONE_DIR, `${today}.yaml`);
    const existing = readYamlArray(archivePath);
    writeYamlArray(archivePath, existing.concat(done));
  }

  // Resurface deferred items
  const deferred = readDeferred();
  if (deferred.length > 0) {
    for (const d of deferred) active.push({ ...d, updated: nowIso() });
    writeDeferred([]);
  }

  writeQueue(rankItems(active));
  return { archived: done.length, resurfaced: deferred.length };
}

// ----- digest renderer (used by Telegram + dashboard) ----------------------

export function renderTelegramDigest(): string {
  const { queue } = getToday();
  const today = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const emoji: Record<TodayUrgency, string> = { red: '🔴', yellow: '🟡', green: '🟢', white: '⚪' };

  if (queue.length === 0) {
    return `☀️ Atlas · ${today}\n\nNothing in the queue. Open dashboard for archive: http://100.105.173.78:5173/`;
  }

  const top = queue.slice(0, 5);
  const lines = top.map((it, i) => {
    // Skip preview when it overlaps the title — operator_added items
    // truncate title to 120 chars but preview holds the same body, so
    // `preview !== title` was a false-negative dedup. Compare prefixes.
    const tNorm = (it.title || '').trim().toLowerCase();
    const pNorm = (it.preview || '').trim().toLowerCase();
    const overlap = !!pNorm && (tNorm.startsWith(pNorm.slice(0, 30)) || pNorm.startsWith(tNorm.slice(0, 30)));
    const preview = (pNorm && !overlap) ? ` — ${it.preview.slice(0, 80)}` : '';
    return `${emoji[it.urgency]} ${i + 1}. ${it.title}${preview}`;
  });

  return `☀️ Atlas · ${today}\n\n${lines.join('\n')}\n\nReply: approve/reject/defer/done <id> · open dashboard for full view → http://100.105.173.78:5173/`;
}
