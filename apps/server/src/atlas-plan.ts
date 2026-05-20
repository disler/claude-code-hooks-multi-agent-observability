// ~/atlas/observability/apps/server/src/atlas-plan.ts
//
// Backs the `/spinup-plan` planning layer:
//   - Walks ~/atlas/projects/*/plan/ to surface phase state on the dashboard.
//   - Watches plan/ dirs and pushes plan_update messages over the existing
//     WebSocket bus (the broadcaster is wired in index.ts via setPlanBroadcaster).
//   - Receives PlanDrafted / PlanLocked / PlanArchived / PhaseStarted /
//     PhaseCompleted events through the existing `/api/atlas/events/dispatch`
//     route — see handlePlanEvent() for the audit + broadcast wire-up.
//
// Plan files are plain Markdown with YAML frontmatter. Parsing intentionally
// stays in pure TS (simple `key: value` only — no nested YAML) to avoid a
// sync uv call on every dashboard read.

import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  mkdirSync,
  appendFileSync,
  watch,
} from 'fs';
import { join, basename } from 'path';

const ATLAS_HOME = '/Users/hrmacnair/atlas';
const PROJECTS_DIR = join(ATLAS_HOME, 'projects');
const AUDIT_DIR = join(ATLAS_HOME, 'audit');

// ---- types ----------------------------------------------------------------

export type PhaseStatus = 'backlog' | 'running' | 'done' | 'archived';

export interface PhaseSummary {
  project: string;
  number: number;
  slug: string;
  file: string;
  status: PhaseStatus;
  target_days: number | null;
  started: string | null;
  finished: string | null;
  spawned_session: string | null;
  outcome: string;          // first line of ## Outcome section, for tooltips
}

export interface PlanSummary {
  project: string;
  hasPlan: boolean;
  locked: boolean;
  locked_at: string | null;
  depth: 'quick' | 'deep' | null;
  owner_agent: string | null;
  target_done: string | null;
  created: string | null;
  phases: PhaseSummary[];
  timeline: string[];       // last N timeline lines (newest last)
  questions: number;        // open question count
}

// ---- frontmatter parser ---------------------------------------------------

function parseFrontmatter(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  const m = /^---\n([\s\S]*?)\n---/m.exec(text);
  if (!m || !m[1]) return out;
  for (const line of m[1].split('\n')) {
    const km = /^\s*([A-Za-z_][\w]*)\s*:\s*(.*)$/.exec(line);
    if (!km || !km[1]) continue;
    let v = (km[2] ?? '').trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    if (v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1);
    out[km[1]] = v;
  }
  return out;
}

function extractOutcomeFirstLine(body: string): string {
  const m = /^##\s+Outcome\s*\n([^\n]*)/m.exec(body);
  if (!m || !m[1]) return '';
  return m[1].trim();
}

function ynull(v: string | undefined): string | null {
  if (v === undefined) return null;
  if (v === 'null' || v === '') return null;
  return v;
}

function ynum(v: string | undefined): number | null {
  if (v === undefined || v === 'null' || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function isStatus(v: string): v is PhaseStatus {
  return v === 'backlog' || v === 'running' || v === 'done' || v === 'archived';
}

// ---- summarizers ----------------------------------------------------------

function summarizePhase(project: string, file: string): PhaseSummary | null {
  let raw: string;
  try { raw = readFileSync(file, 'utf8'); } catch { return null; }
  const fm = parseFrontmatter(raw);
  const statusRaw = fm.status ?? '';
  const status: PhaseStatus = isStatus(statusRaw) ? statusRaw : 'backlog';
  const fileName = basename(file, '.md');
  // Default number/slug from filename (NN-slug).
  const nameMatch = /^(\d+)-(.+)$/.exec(fileName);
  const numberFromFile = nameMatch && nameMatch[1] ? Number(nameMatch[1]) : 0;
  const slugFromFile   = nameMatch && nameMatch[2] ? nameMatch[2] : fileName;
  return {
    project,
    number: ynum(fm.number) ?? numberFromFile,
    slug: fm.slug || slugFromFile,
    file,
    status,
    target_days: ynum(fm.target_days),
    started: ynull(fm.started),
    finished: ynull(fm.finished),
    spawned_session: ynull(fm.spawned_session),
    outcome: extractOutcomeFirstLine(raw),
  };
}

const SAFE_SLUG = /^[a-z0-9_][a-z0-9_-]{0,63}$/;

export function readPlanForProject(project: string): PlanSummary {
  const empty: PlanSummary = {
    project, hasPlan: false, locked: false, locked_at: null,
    depth: null, owner_agent: null, target_done: null, created: null,
    phases: [], timeline: [], questions: 0,
  };
  if (!SAFE_SLUG.test(project)) return empty;
  const planDir = join(PROJECTS_DIR, project, 'plan');
  if (!planDir.startsWith(PROJECTS_DIR + '/')) return empty;
  if (!existsSync(planDir)) return empty;
  // Treat plan/ as missing if only archive/ remains (and nothing else).
  let entries: string[] = [];
  try { entries = readdirSync(planDir); } catch { return empty; }
  const nonArchive = entries.filter(e => e !== 'archive');
  if (nonArchive.length === 0) return empty;

  const planFile = join(planDir, 'PLAN.md');
  let planFm: Record<string, string> = {};
  if (existsSync(planFile)) {
    try { planFm = parseFrontmatter(readFileSync(planFile, 'utf8')); } catch {}
  }

  const pdir = join(planDir, 'phases');
  const phases: PhaseSummary[] = [];
  if (existsSync(pdir)) {
    let files: string[] = [];
    try { files = readdirSync(pdir).filter(f => f.endsWith('.md')).sort(); } catch {}
    for (const f of files) {
      const p = summarizePhase(project, join(pdir, f));
      if (p) phases.push(p);
    }
  }

  // timeline tail (last 10 lines)
  let timeline: string[] = [];
  const tlFile = join(planDir, 'TIMELINE.md');
  if (existsSync(tlFile)) {
    try {
      timeline = readFileSync(tlFile, 'utf8')
        .split('\n').filter(l => l.trim().length > 0).slice(-10);
    } catch {}
  }

  // questions count
  let questions = 0;
  const qFile = join(planDir, 'questions.md');
  if (existsSync(qFile)) {
    try {
      questions = readFileSync(qFile, 'utf8').split('\n')
        .filter(l => /^\s*-\s*Q:/i.test(l)).length;
    } catch {}
  }

  return {
    project,
    hasPlan: true,
    locked: planFm.locked === 'true',
    locked_at: ynull(planFm.locked_at),
    depth: (planFm.depth === 'deep' || planFm.depth === 'quick') ? planFm.depth : null,
    owner_agent: ynull(planFm.owner_agent),
    target_done: ynull(planFm.target_done),
    created: ynull(planFm.created),
    phases,
    timeline,
    questions,
  };
}

export function listAllPlans(): PlanSummary[] {
  if (!existsSync(PROJECTS_DIR)) return [];
  let projects: string[] = [];
  try {
    projects = readdirSync(PROJECTS_DIR).filter(n => {
      try { return statSync(join(PROJECTS_DIR, n)).isDirectory(); } catch { return false; }
    });
  } catch {}
  return projects.map(readPlanForProject);
}

// ---- audit helper ---------------------------------------------------------

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function appendPlanAudit(eventType: string, payload: any): void {
  try {
    mkdirSync(AUDIT_DIR, { recursive: true });
    const month = new Date().toISOString().slice(0, 7);
    const entry = {
      ts: nowIso(),
      id: `plan_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
      division: payload?.project ? `project:${payload.project}` : 'atlas-meta',
      agent: 'plan',
      action: eventType,
      target: payload?.project || '',
      summary: planEventSummary(eventType, payload || {}),
      autonomy: 'bold',
      outcome: 'executed',
      approver: null,
      correlation_id: null,
    };
    appendFileSync(join(AUDIT_DIR, `${month}.log`), JSON.stringify(entry) + '\n');
  } catch {}
}

function planEventSummary(type: string, p: any): string {
  switch (type) {
    case 'PlanDrafted':    return `Plan drafted for ${p.project} (${p.depth}, ${p.phases_count} phases)`;
    case 'PlanLocked':     return `Plan locked for ${p.project} (${p.phases_count} phases, target ${p.target_done || 'none'})`;
    case 'PlanArchived':   return `Plan archived for ${p.project}`;
    case 'PhaseStarted':   return `Phase ${p.phase_number}-${p.phase_slug} started in ${p.project}`;
    case 'PhaseCompleted': return `Phase ${p.phase_number}-${p.phase_slug} completed in ${p.project} (${p.duration_days}d)`;
    default:               return type;
  }
}

// ---- plan event interceptor ----------------------------------------------

const PLAN_EVENT_TYPES = new Set([
  'PlanDrafted', 'PlanLocked', 'PlanArchived', 'PhaseStarted', 'PhaseCompleted',
]);

let _broadcaster: ((msg: any) => void) | null = null;

export function setPlanBroadcaster(fn: (msg: any) => void): void {
  _broadcaster = fn;
}

function broadcast(msg: any): void {
  try { _broadcaster?.(msg); } catch {}
}

export function isPlanEvent(eventType: string): boolean {
  return PLAN_EVENT_TYPES.has(eventType);
}

export function handlePlanEvent(eventType: string, payload: any): void {
  appendPlanAudit(eventType, payload);
  const project = payload?.project;
  if (project && typeof project === 'string') {
    const summary = readPlanForProject(project);
    broadcast({ type: 'plan_update', project, plan: summary, event: eventType });
  } else {
    broadcast({ type: 'plan_event', event: eventType, payload });
  }
}

// ---- file watcher --------------------------------------------------------
//
// Recursively watch ~/atlas/projects/*/plan/. macOS fs.watch supports
// `recursive: true`, so a single watcher per project's plan/ dir suffices.
// 250ms debounce coalesces bursts; on fire, rescan the project's plan and
// push a fresh snapshot.

type WatcherHandle = { project: string; close: () => void };
const _watchers: Map<string, WatcherHandle> = new Map();
const _debounce: Map<string, ReturnType<typeof setTimeout>> = new Map();

function ensureProjectWatcher(project: string): void {
  if (_watchers.has(project)) return;
  const pd = join(PROJECTS_DIR, project, 'plan');
  if (!existsSync(pd)) return;
  try {
    const w = watch(pd, { recursive: true }, () => {
      const existing = _debounce.get(project);
      if (existing) clearTimeout(existing);
      const t = setTimeout(() => {
        _debounce.delete(project);
        try {
          const summary = readPlanForProject(project);
          broadcast({ type: 'plan_update', project, plan: summary, event: 'fs_change' });
        } catch {}
      }, 250);
      _debounce.set(project, t);
    });
    _watchers.set(project, { project, close: () => w.close() });
    console.log(`[plan] watching ${pd}`);
  } catch (err: any) {
    console.warn(`[plan] failed to watch ${pd}: ${err.message}`);
  }
}

function stopProjectWatcher(project: string): void {
  const h = _watchers.get(project);
  if (!h) return;
  try { h.close(); } catch {}
  _watchers.delete(project);
  console.log(`[plan] stopped watching ${project}`);
}

let _topWatcher: ReturnType<typeof watch> | null = null;
let _topDebounce: ReturnType<typeof setTimeout> | null = null;

function listProjectsWithPlan(): string[] {
  try {
    return readdirSync(PROJECTS_DIR).filter(n => {
      try {
        return statSync(join(PROJECTS_DIR, n)).isDirectory()
            && existsSync(join(PROJECTS_DIR, n, 'plan'));
      } catch { return false; }
    });
  } catch { return []; }
}

export function startPlanWatcher(): void {
  if (!existsSync(PROJECTS_DIR)) {
    console.warn(`[plan] no projects dir at ${PROJECTS_DIR}, skipping watcher`);
    return;
  }
  // Initial sweep — attach a watcher to every project that currently has plan/.
  for (const p of listProjectsWithPlan()) ensureProjectWatcher(p);

  try {
    _topWatcher = watch(PROJECTS_DIR, { recursive: true }, (_evt, filename) => {
      if (_topDebounce) clearTimeout(_topDebounce);
      _topDebounce = setTimeout(() => {
        _topDebounce = null;
        const live = new Set(listProjectsWithPlan());
        for (const p of live) ensureProjectWatcher(p);
        for (const p of Array.from(_watchers.keys())) {
          if (!live.has(p)) stopProjectWatcher(p);
        }
        // If the change was inside a project we know about, broadcast its
        // fresh snapshot (covers plan/ just appearing for the first time).
        if (typeof filename === 'string') {
          const seg = filename.split('/');
          const proj = seg[0];
          if (proj && live.has(proj) && seg.includes('plan')) {
            const summary = readPlanForProject(proj);
            broadcast({ type: 'plan_update', project: proj, plan: summary, event: 'fs_change' });
          }
        }
      }, 300);
    });
    console.log(`[plan] top-level watch on ${PROJECTS_DIR}`);
  } catch (err: any) {
    console.warn(`[plan] top-level watch failed: ${err.message}`);
  }
}
