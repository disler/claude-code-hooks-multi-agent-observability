// atlas-spinup.ts
//
// Paperclip-8: Cliphub-style company templates. One /spinup invocation stamps
// out a complete project: agents (paperclip-1), per-agent budgets (paperclip-2),
// goals (paperclip-3), and routines (paperclip-7), plus a fresh project dir
// with WHITEPAPER.md / GOALS.md / .atlas/phase-state.json.
//
// Templates live as plain JSON under ${ATLAS_HOME}/templates/company/<slug>/:
//   orgchart.json   { agents: [{id,name,role,reports_to,color}, ...] }
//   routines.json   { routines: [{name,template_slug,vars?,project_id,trigger,concurrency?,catch_up?}, ...] }
//   budgets.json    { default_monthly_usd, warn_pct, hard_pct, agents: { <agent_id>: {monthly_usd, notes?} } }
//   goals.json      { mission_id, goals: [{id,name,project_id?,parent_goal_id?,status?}, ...] }
//   README.md       free-form description
//
// On instantiate the agent ids and goal ids are prefixed with project_slug to
// keep multiple instantiations of the same template from colliding inside the
// flat-JSON registries.
//
// Endpoints (mounted in index.ts):
//   GET  /api/atlas/spinup/templates                       → list slugs + summary
//   GET  /api/atlas/spinup/templates/:slug                 → full template content
//   POST /api/atlas/spinup/instantiate (x-atlas-admin)      body: { template_slug, project_slug, project_name, dry_run? }
//
// Body cap: 16 KB. Fail-closed on missing admin token.

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync, readdirSync, rmSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { timingSafeEqual } from 'crypto';

import { createDAGSchedule, deleteDAGSchedule, type DAGSchedule, type ScheduleTrigger, type ConcurrencyPolicy } from './atlas-dag-schedules';
import { claimTicket, releaseTicket } from './atlas-tickets';

const ATLAS_HOME = process.env.ATLAS_HOME || '/Users/hrmacnair/atlas';
const TEMPLATES_DIR = process.env.ATLAS_TEMPLATES_DIR || join(ATLAS_HOME, 'templates', 'company');
const AGENTS_FILE = process.env.ATLAS_AGENTS_JSON || join(ATLAS_HOME, 'memory', 'agents.json');
const BUDGETS_FILE = process.env.ATLAS_BUDGETS_JSON || join(ATLAS_HOME, 'memory', 'agent_budgets.json');
const GOALS_FILE = process.env.ATLAS_GOALS_JSON || join(ATLAS_HOME, 'memory', 'goals.json');
const PROJECTS_DIR = process.env.ATLAS_PROJECTS_DIR || join(ATLAS_HOME, 'projects');

const MAX_BODY_BYTES = 16 * 1024;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;
const AGENT_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

// ---------- types ----------------------------------------------------------

export interface TemplateAgent {
  id: string;
  name: string;
  role: string;
  reports_to: string | null;
  color: string;
}

export interface TemplateRoutine {
  name: string;
  template_slug: string;
  vars?: Record<string, string>;
  project_id: string;          // "__PROJECT_SLUG__" placeholder allowed; replaced on apply
  trigger: ScheduleTrigger;
  concurrency?: ConcurrencyPolicy;
  catch_up?: boolean;
  requires_approval?: boolean;
  transactional?: boolean;
  cost_cap_usd?: number;
}

export interface TemplateBudgetEntry {
  monthly_usd: number;
  notes?: string;
}

export interface TemplateBudgets {
  default_monthly_usd: number;
  warn_pct: number;
  hard_pct: number;
  agents: Record<string, TemplateBudgetEntry>;
}

export interface TemplateGoal {
  id: string;
  name: string;
  project_id?: string | null;
  parent_goal_id?: string | null;
  status?: 'active' | 'done' | 'abandoned';
}

export interface TemplateGoalsFile {
  mission_id: string;
  goals: TemplateGoal[];
}

export interface CompanyTemplate {
  slug: string;
  readme: string;
  orgchart: { agents: TemplateAgent[] };
  routines: { routines: TemplateRoutine[] };
  budgets: TemplateBudgets;
  goals: TemplateGoalsFile;
}

export interface TemplateSummary {
  slug: string;
  name: string;
  description: string;
  agent_count: number;
  routine_count: number;
  goal_count: number;
}

export interface InstantiateInput {
  template_slug: string;
  project_slug: string;
  project_name: string;
  dry_run?: boolean;
}

export interface InstantiatePlan {
  ok: true;
  dry_run: true;
  project_slug: string;
  project_name: string;
  agents_to_add: TemplateAgent[];
  budgets_to_add: Record<string, TemplateBudgetEntry>;
  goals_to_add: TemplateGoal[];
  routines_to_create: TemplateRoutine[];
  project_dir: string;
}

export interface InstantiateResult {
  ok: true;
  dry_run: false;
  project_slug: string;
  project_name: string;
  agents_added: string[];        // ids actually appended
  budgets_added: string[];       // ids actually appended
  goals_added: string[];         // ids actually appended
  routines_created: Array<{ schedule_id: string; name: string }>;
  project_dir: string;
}

export interface InstantiateError {
  ok: false;
  status: number;
  error: string;
  rollback_notes?: string[];
}

// ---------- helpers --------------------------------------------------------

function isObject(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === 'object' && !Array.isArray(x);
}

function isFiniteNumber(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

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
    return { ok: false, status: 413, error: 'body too large (>16KB)' };
  }
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return { ok: false, status: 400, error: 'failed to read body' };
  }
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
    return { ok: false, status: 413, error: 'body too large (>16KB)' };
  }
  if (!raw) return { ok: true, body: {} };
  try {
    return { ok: true, body: JSON.parse(raw) };
  } catch {
    return { ok: false, status: 400, error: 'invalid JSON' };
  }
}

// Hand-rolled validators (no zod). Throw on shape mismatch with a precise reason.

function validateOrgchart(raw: unknown, slug: string): { agents: TemplateAgent[] } {
  if (!isObject(raw) || !Array.isArray((raw as any).agents)) {
    throw new Error(`[${slug}] orgchart.json: expected { agents: [...] }`);
  }
  const agents: TemplateAgent[] = [];
  const seen = new Set<string>();
  for (const a of (raw as any).agents) {
    if (!isObject(a)) throw new Error(`[${slug}] orgchart: non-object agent`);
    const id = String(a.id || '').trim();
    if (!id || !AGENT_ID_RE.test(id)) throw new Error(`[${slug}] orgchart: invalid agent id "${a.id}"`);
    if (seen.has(id)) throw new Error(`[${slug}] orgchart: duplicate agent id "${id}"`);
    seen.add(id);
    agents.push({
      id,
      name: String(a.name || id),
      role: String(a.role || ''),
      reports_to: a.reports_to == null ? null : String(a.reports_to),
      color: String(a.color || '#888888'),
    });
  }
  // Ensure reports_to references resolve to known ids (or null).
  for (const a of agents) {
    if (a.reports_to !== null && !seen.has(a.reports_to)) {
      throw new Error(`[${slug}] orgchart: agent "${a.id}" reports_to unknown id "${a.reports_to}"`);
    }
  }
  if (agents.length === 0) throw new Error(`[${slug}] orgchart: at least one agent required`);
  return { agents };
}

function validateBudgets(raw: unknown, slug: string): TemplateBudgets {
  if (!isObject(raw)) throw new Error(`[${slug}] budgets.json: expected object`);
  const default_monthly_usd = isFiniteNumber((raw as any).default_monthly_usd) ? (raw as any).default_monthly_usd : 200;
  const warn_pct = isFiniteNumber((raw as any).warn_pct) ? (raw as any).warn_pct : 0.8;
  const hard_pct = isFiniteNumber((raw as any).hard_pct) ? (raw as any).hard_pct : 1.0;
  if (warn_pct <= 0 || warn_pct >= 1) throw new Error(`[${slug}] budgets.warn_pct must be in (0,1)`);
  if (hard_pct <= 0 || hard_pct > 1)  throw new Error(`[${slug}] budgets.hard_pct must be in (0,1]`);
  if (warn_pct >= hard_pct)           throw new Error(`[${slug}] budgets.warn_pct must be < hard_pct`);
  if (default_monthly_usd < 0)        throw new Error(`[${slug}] budgets.default_monthly_usd must be >= 0`);

  const agents: Record<string, TemplateBudgetEntry> = {};
  const rawAgents = (raw as any).agents;
  if (rawAgents && isObject(rawAgents)) {
    for (const [k, v] of Object.entries(rawAgents)) {
      if (!isObject(v)) continue;
      const monthly = isFiniteNumber((v as any).monthly_usd) ? (v as any).monthly_usd : default_monthly_usd;
      if (monthly < 0) throw new Error(`[${slug}] budgets.agents.${k}.monthly_usd must be >= 0`);
      const entry: TemplateBudgetEntry = { monthly_usd: monthly };
      if (typeof (v as any).notes === 'string') entry.notes = (v as any).notes;
      agents[String(k)] = entry;
    }
  }
  return { default_monthly_usd, warn_pct, hard_pct, agents };
}

function validateRoutines(raw: unknown, slug: string): { routines: TemplateRoutine[] } {
  if (!isObject(raw) || !Array.isArray((raw as any).routines)) {
    throw new Error(`[${slug}] routines.json: expected { routines: [...] }`);
  }
  const routines: TemplateRoutine[] = [];
  const seenNames = new Set<string>();
  for (const r of (raw as any).routines) {
    if (!isObject(r)) throw new Error(`[${slug}] routines: non-object entry`);
    const name = String(r.name || '').trim();
    if (!name) throw new Error(`[${slug}] routines: missing name`);
    if (seenNames.has(name)) throw new Error(`[${slug}] routines: duplicate name "${name}"`);
    seenNames.add(name);
    const template_slug = String(r.template_slug || '').trim();
    if (!template_slug) throw new Error(`[${slug}] routines.${name}: missing template_slug`);
    const project_id = String(r.project_id || '').trim();
    if (!project_id) throw new Error(`[${slug}] routines.${name}: missing project_id`);
    if (!isObject(r.trigger)) throw new Error(`[${slug}] routines.${name}: missing trigger`);
    const tk = (r.trigger as any).kind;
    if (tk !== 'cron' && tk !== 'api') {
      throw new Error(`[${slug}] routines.${name}: trigger.kind must be "cron" or "api" (got "${tk}")`);
    }
    if (tk === 'cron' && !((r.trigger as any).expr)) {
      throw new Error(`[${slug}] routines.${name}: cron trigger missing expr`);
    }
    const trigger: ScheduleTrigger = tk === 'cron'
      ? { kind: 'cron', expr: String((r.trigger as any).expr) }
      : { kind: 'api' };

    const out: TemplateRoutine = {
      name,
      template_slug,
      project_id,
      trigger,
    };
    if (isObject(r.vars)) {
      const vars: Record<string, string> = {};
      for (const [k, v] of Object.entries(r.vars)) vars[String(k)] = String(v);
      out.vars = vars;
    }
    if (r.concurrency === 'allow' || r.concurrency === 'skip' || r.concurrency === 'queue') {
      out.concurrency = r.concurrency;
    }
    if (typeof r.catch_up === 'boolean') out.catch_up = r.catch_up;
    if (typeof r.requires_approval === 'boolean') out.requires_approval = r.requires_approval;
    if (typeof r.transactional === 'boolean') out.transactional = r.transactional;
    if (isFiniteNumber(r.cost_cap_usd)) out.cost_cap_usd = r.cost_cap_usd;
    routines.push(out);
  }
  return { routines };
}

function validateGoals(raw: unknown, slug: string): TemplateGoalsFile {
  if (!isObject(raw)) throw new Error(`[${slug}] goals.json: expected object`);
  const mission_id = String((raw as any).mission_id || 'atlas-root');
  const goalsRaw = (raw as any).goals;
  if (!Array.isArray(goalsRaw)) throw new Error(`[${slug}] goals.json: goals must be array`);
  if (goalsRaw.length === 0) throw new Error(`[${slug}] goals.json: at least one goal required`);
  const goals: TemplateGoal[] = [];
  const seen = new Set<string>();
  for (const g of goalsRaw) {
    if (!isObject(g)) throw new Error(`[${slug}] goals: non-object goal`);
    const id = String(g.id || '').trim();
    if (!id) throw new Error(`[${slug}] goals: missing id`);
    if (seen.has(id)) throw new Error(`[${slug}] goals: duplicate id "${id}"`);
    seen.add(id);
    const status = g.status === 'done' || g.status === 'abandoned' ? g.status : 'active';
    goals.push({
      id,
      name: String(g.name || id),
      project_id: g.project_id == null ? null : String(g.project_id),
      parent_goal_id: g.parent_goal_id == null ? null : String(g.parent_goal_id),
      status,
    });
  }
  return { mission_id, goals };
}

// ---------- public reads ---------------------------------------------------

export function listTemplates(): TemplateSummary[] {
  if (!existsSync(TEMPLATES_DIR)) return [];
  const out: TemplateSummary[] = [];
  for (const entry of readdirSync(TEMPLATES_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const slug = entry.name;
    try {
      const t = getTemplate(slug);
      const firstLine = (t.readme.split('\n').find(l => l.trim() && !l.startsWith('#')) || '').trim();
      out.push({
        slug: t.slug,
        name: slug.replace(/-/g, ' '),
        description: firstLine,
        agent_count: t.orgchart.agents.length,
        routine_count: t.routines.routines.length,
        goal_count: t.goals.goals.length,
      });
    } catch {
      // skip malformed template
    }
  }
  return out.sort((a, b) => a.slug.localeCompare(b.slug));
}

export function getTemplate(slug: string): CompanyTemplate {
  if (!slug || !SLUG_RE.test(slug)) {
    throw new Error(`invalid template slug "${slug}"`);
  }
  const dir = join(TEMPLATES_DIR, slug);
  if (!existsSync(dir)) throw new Error(`template "${slug}" not found`);

  const readPath = (name: string) => {
    const p = join(dir, name);
    if (!existsSync(p)) throw new Error(`[${slug}] missing ${name}`);
    return readFileSync(p, 'utf8');
  };

  const orgchart = validateOrgchart(JSON.parse(readPath('orgchart.json')), slug);
  const budgets = validateBudgets(JSON.parse(readPath('budgets.json')), slug);
  const routines = validateRoutines(JSON.parse(readPath('routines.json')), slug);
  const goals = validateGoals(JSON.parse(readPath('goals.json')), slug);
  const readme = readPath('README.md');

  return { slug, readme, orgchart, routines, budgets, goals };
}

// ---------- atomic JSON writes --------------------------------------------

function atomicWriteJson(path: string, data: unknown): void {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmp = `${path}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
  try {
    writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
    renameSync(tmp, path);
  } catch (e) {
    try { unlinkSync(tmp); } catch {}
    throw e;
  }
}

function loadJson<T>(path: string, fallback: T): T {
  try {
    if (!existsSync(path)) return fallback;
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

// ---------- test seam for routine creation --------------------------------

// Lets tests inject a stub creator so we can drive rollback simulation without
// touching the real dispatch path.
type CreateRoutineFn = (input: Omit<DAGSchedule, 'id' | 'enabled' | 'created_at'> & { trigger?: ScheduleTrigger }) => DAGSchedule;
let _createRoutine: CreateRoutineFn = createDAGSchedule;
let _deleteRoutine: (id: string) => { ok: boolean } = deleteDAGSchedule;
export function _setRoutineHooksForTest(create: CreateRoutineFn | null, del: ((id: string) => { ok: boolean }) | null): void {
  _createRoutine = create ?? createDAGSchedule;
  _deleteRoutine = del ?? deleteDAGSchedule;
}

// ---------- instantiation core --------------------------------------------

/**
 * Validate input shape + collision rules. Returns the loaded template and
 * derived (prefixed) artifacts, or an error envelope.
 */
function buildPlan(input: InstantiateInput): {
  ok: true;
  template: CompanyTemplate;
  agents: TemplateAgent[];
  budgets: Record<string, TemplateBudgetEntry>;
  goals: TemplateGoal[];
  routines: TemplateRoutine[];
  project_dir: string;
} | InstantiateError {
  const project_slug = String(input?.project_slug || '').trim();
  const project_name = String(input?.project_name || '').trim();
  const template_slug = String(input?.template_slug || '').trim();

  if (!template_slug)               return { ok: false, status: 400, error: 'template_slug required' };
  if (!project_slug)                return { ok: false, status: 400, error: 'project_slug required' };
  if (!project_name)                return { ok: false, status: 400, error: 'project_name required' };
  if (!SLUG_RE.test(project_slug))  return { ok: false, status: 400, error: 'project_slug must be 3-32 kebab-case (a-z, 0-9, -)' };

  let template: CompanyTemplate;
  try {
    template = getTemplate(template_slug);
  } catch (e: any) {
    return { ok: false, status: 404, error: e?.message || 'template not found' };
  }

  const project_dir = join(PROJECTS_DIR, project_slug);

  // Collision detection: project dir, any prefixed agent id, any prefixed goal id.
  if (existsSync(project_dir)) {
    return { ok: false, status: 409, error: `project_slug "${project_slug}" already exists at ${project_dir}` };
  }

  const existingAgents = loadJson<{ agents?: TemplateAgent[] }>(AGENTS_FILE, { agents: [] });
  const existingAgentIds = new Set((existingAgents.agents || []).map(a => a.id));
  const prefixedAgents: TemplateAgent[] = template.orgchart.agents.map(a => ({
    ...a,
    id: `${project_slug}-${a.id}`,
    reports_to: a.reports_to == null ? null : `${project_slug}-${a.reports_to}`,
  }));
  for (const a of prefixedAgents) {
    if (existingAgentIds.has(a.id)) {
      return { ok: false, status: 409, error: `agent id collision: "${a.id}" already exists in agents.json` };
    }
  }

  // Budgets — keyed by prefixed agent id.
  const prefixedBudgets: Record<string, TemplateBudgetEntry> = {};
  const idMap = new Map(template.orgchart.agents.map(a => [a.id, `${project_slug}-${a.id}`]));
  for (const [unprefixed, entry] of Object.entries(template.budgets.agents)) {
    const newKey = idMap.get(unprefixed) || `${project_slug}-${unprefixed}`;
    prefixedBudgets[newKey] = { ...entry };
  }

  // Goals — prefix ids and rewrite parent_goal_id; force project_id to slug.
  const goalIdMap = new Map(template.goals.goals.map(g => [g.id, `${project_slug}-${g.id}`]));
  const prefixedGoals: TemplateGoal[] = template.goals.goals.map(g => ({
    id: `${project_slug}-${g.id}`,
    name: g.name,
    project_id: project_slug,
    parent_goal_id: g.parent_goal_id ? (goalIdMap.get(g.parent_goal_id) || g.parent_goal_id) : null,
    status: g.status || 'active',
  }));
  const existingGoals = loadJson<{ goals?: Array<{ id: string }> }>(GOALS_FILE, { goals: [] });
  const existingGoalIds = new Set((existingGoals.goals || []).map(g => g.id));
  for (const g of prefixedGoals) {
    if (existingGoalIds.has(g.id)) {
      return { ok: false, status: 409, error: `goal id collision: "${g.id}" already exists in goals.json` };
    }
  }

  // Routines — substitute project_id placeholder.
  const prefixedRoutines: TemplateRoutine[] = template.routines.routines.map(r => ({
    ...r,
    project_id: r.project_id === '__PROJECT_SLUG__' ? project_slug : r.project_id,
  }));

  return {
    ok: true,
    template,
    agents: prefixedAgents,
    budgets: prefixedBudgets,
    goals: prefixedGoals,
    routines: prefixedRoutines,
    project_dir,
  };
}

export function instantiateTemplate(input: InstantiateInput): InstantiatePlan | InstantiateResult | InstantiateError {
  const built = buildPlan(input);
  if (!('agents' in built)) return built;
  const plan = built;
  const project_dir = plan.project_dir;

  if (input.dry_run) {
    return {
      ok: true,
      dry_run: true,
      project_slug: input.project_slug,
      project_name: input.project_name,
      agents_to_add: plan.agents,
      budgets_to_add: plan.budgets,
      goals_to_add: plan.goals,
      routines_to_create: plan.routines,
      project_dir,
    };
  }

  // ---- Concurrency lock: prevent racing /instantiate for same project_slug.
  const claimTicketId = `spinup-${input.project_slug}`;
  const claimAgentId = 'spinup-orchestrator';
  const claim = claimTicket({ ticket_id: claimTicketId, agent_id: claimAgentId, ttl_seconds: 60 });
  if (!claim.ok) {
    return { ok: false, status: 409, error: 'instantiation_in_progress' } as InstantiateError;
  }

  try {
    return _applyInstantiation(input, plan);
  } finally {
    try { releaseTicket({ ticket_id: claimTicketId, agent_id: claimAgentId }); } catch {}
  }
}

function _applyInstantiation(
  input: InstantiateInput,
  plan: { template: CompanyTemplate; agents: TemplateAgent[]; budgets: Record<string, TemplateBudgetEntry>; goals: TemplateGoal[]; routines: TemplateRoutine[]; project_dir: string },
): InstantiateResult | InstantiateError {
  const project_dir = plan.project_dir;
  // ---- APPLY mode: write everything, with best-effort rollback. ---------
  const rollback_notes: string[] = [];
  const addedAgentIds: string[] = [];
  const addedBudgetIds: string[] = [];
  const addedGoalIds: string[] = [];
  const createdRoutines: Array<{ schedule_id: string; name: string }> = [];
  let projectDirCreated = false;

  // Snapshot the original file contents so rollback can restore them verbatim.
  // For each top-level file: keep null if it didn't exist (so rollback can
  // unlink it), else the original string.
  function snapshot(path: string): string | null {
    if (!existsSync(path)) return null;
    try { return readFileSync(path, 'utf8'); } catch { return null; }
  }
  const snapAgents = snapshot(AGENTS_FILE);
  const snapBudgets = snapshot(BUDGETS_FILE);
  const snapGoals = snapshot(GOALS_FILE);

  function restore(path: string, snap: string | null): void {
    try {
      if (snap === null) {
        if (existsSync(path)) unlinkSync(path);
      } else {
        atomicWriteJson(path, JSON.parse(snap));
      }
    } catch (e: any) {
      rollback_notes.push(`could not restore ${path}: ${e?.message}`);
    }
  }

  function doRollback(reason: string): InstantiateError {
    // Undo in reverse order: routines → goals → budgets → agents → project dir.
    for (const r of createdRoutines) {
      try { _deleteRoutine(r.schedule_id); }
      catch (e: any) { rollback_notes.push(`failed to delete routine ${r.schedule_id}: ${e?.message}`); }
    }
    if (addedAgentIds.length > 0)  restore(AGENTS_FILE, snapAgents);
    if (addedBudgetIds.length > 0) restore(BUDGETS_FILE, snapBudgets);
    if (addedGoalIds.length > 0)   restore(GOALS_FILE, snapGoals);
    if (projectDirCreated) {
      try { rmSync(project_dir, { recursive: true, force: true }); }
      catch (e: any) { rollback_notes.push(`failed to rm project dir: ${e?.message}`); }
    }
    return {
      ok: false,
      status: 500,
      error: reason,
      ...(rollback_notes.length ? { rollback_notes } : {}),
    };
  }

  try {
    // 1. Append agents.
    const agentsFile = loadJson<{ agents: TemplateAgent[] }>(AGENTS_FILE, { agents: [] });
    if (!Array.isArray(agentsFile.agents)) agentsFile.agents = [];
    for (const a of plan.agents) {
      agentsFile.agents.push({
        ...a,
        // tack on the static fields the live orgchart expects
        ...({ status: 'idle', current_ticket_id: null, avatar: null } as any),
      });
      addedAgentIds.push(a.id);
    }
    atomicWriteJson(AGENTS_FILE, agentsFile);

    // 2. Append budget entries (merge into existing agents map).
    const budgetsFile = loadJson<any>(BUDGETS_FILE, {
      month: 'auto',
      default_monthly_usd: plan.template.budgets.default_monthly_usd,
      warn_pct: plan.template.budgets.warn_pct,
      hard_pct: plan.template.budgets.hard_pct,
      agents: {},
    });
    if (!isObject(budgetsFile.agents)) budgetsFile.agents = {};
    for (const [k, v] of Object.entries(plan.budgets)) {
      budgetsFile.agents[k] = v;
      addedBudgetIds.push(k);
    }
    atomicWriteJson(BUDGETS_FILE, budgetsFile);

    // 3. Append goals.
    const goalsFile = loadJson<any>(GOALS_FILE, {
      mission: { id: 'atlas-root', name: 'Atlas', statement: '' },
      goals: [],
    });
    if (!Array.isArray(goalsFile.goals)) goalsFile.goals = [];
    const ts = nowIso();
    for (const g of plan.goals) {
      goalsFile.goals.push({
        id: g.id,
        name: g.name,
        mission_id: plan.template.goals.mission_id || 'atlas-root',
        project_id: g.project_id ?? input.project_slug,
        parent_goal_id: g.parent_goal_id ?? null,
        created_at: ts,
        status: g.status || 'active',
      });
      addedGoalIds.push(g.id);
    }
    atomicWriteJson(GOALS_FILE, goalsFile);

    // 4. Create routines.
    for (const r of plan.routines) {
      const created = _createRoutine({
        name: r.name,
        template_slug: r.template_slug,
        vars: r.vars || {},
        project_id: r.project_id,
        trigger: r.trigger,
        ...(r.concurrency ? { concurrency: r.concurrency } : {}),
        ...(typeof r.catch_up === 'boolean' ? { catch_up: r.catch_up } : {}),
        ...(typeof r.requires_approval === 'boolean' ? { requires_approval: r.requires_approval } : {}),
        ...(typeof r.transactional === 'boolean' ? { transactional: r.transactional } : {}),
        ...(isFiniteNumber(r.cost_cap_usd) ? { cost_cap_usd: r.cost_cap_usd } : {}),
      });
      if (!created || !created.id) throw new Error(`routine create returned no id for "${r.name}"`);
      createdRoutines.push({ schedule_id: created.id, name: r.name });
    }

    // 5. Project directory + files.
    mkdirSync(project_dir, { recursive: true });
    projectDirCreated = true;
    mkdirSync(join(project_dir, '.atlas'), { recursive: true });

    const whitepaper = renderWhitepaper(input.project_name, input.project_slug, plan.template);
    writeFileSync(join(project_dir, 'WHITEPAPER.md'), whitepaper, 'utf8');

    const goalsMd = renderGoalsMarkdown(input.project_name, plan.goals);
    writeFileSync(join(project_dir, 'GOALS.md'), goalsMd, 'utf8');

    atomicWriteJson(join(project_dir, '.atlas', 'phase-state.json'), {
      phase: 'scaffold',
      created_at: ts,
      template_slug: plan.template.slug,
    });

    return {
      ok: true,
      dry_run: false,
      project_slug: input.project_slug,
      project_name: input.project_name,
      agents_added: addedAgentIds,
      budgets_added: addedBudgetIds,
      goals_added: addedGoalIds,
      routines_created: createdRoutines,
      project_dir: project_dir,
    };
  } catch (e: any) {
    return doRollback(e?.message || 'instantiation failed');
  }
}

// ---------- rendering -----------------------------------------------------

function renderWhitepaper(name: string, slug: string, template: CompanyTemplate): string {
  const agentLines = template.orgchart.agents.map(a => `- **${a.name}** — ${a.role}`).join('\n');
  return `# ${name} — White Paper

> Scaffolded from \`${template.slug}\` template on ${nowIso()}.

## Project

- **Slug:** \`${slug}\`
- **Template:** ${template.slug}

## Template intent

${template.readme.trim()}

## Org chart

${agentLines}

## Decisions Log

_None yet._

## Features Log

_None yet._
`;
}

function renderGoalsMarkdown(name: string, goals: TemplateGoal[]): string {
  const lines = goals.map(g => `- [ ] **${g.name}** \`${g.id}\``).join('\n');
  return `# ${name} — Goals

${lines}
`;
}

// ---------- HTTP routes ---------------------------------------------------

export async function registerSpinupRoutes(
  req: Request,
  url: URL,
  baseHeaders: Record<string, string> = {},
): Promise<Response | null> {
  const path = url.pathname;
  if (!path.startsWith('/api/atlas/spinup')) return null;
  const method = req.method;

  if (path === '/api/atlas/spinup/templates' && method === 'GET') {
    try {
      return jsonResponse({ templates: listTemplates() }, 200, baseHeaders);
    } catch (e: any) {
      return jsonResponse({ error: e?.message || 'list failed' }, 500, baseHeaders);
    }
  }

  if (method === 'GET') {
    const m = path.match(/^\/api\/atlas\/spinup\/templates\/([^/]+)$/);
    if (m && SLUG_RE.test(m[1]!)) {
      try {
        return jsonResponse(getTemplate(m[1]!), 200, baseHeaders);
      } catch (e: any) {
        const msg = e?.message || 'template read failed';
        const status = /not found/.test(msg) ? 404 : 500;
        return jsonResponse({ error: msg }, status, baseHeaders);
      }
    }
  }

  if (path === '/api/atlas/spinup/instantiate' && method === 'POST') {
    const adminCheck = checkAdminAuth(req);
    if (!adminCheck.ok) return jsonResponse({ error: adminCheck.reason }, 401, baseHeaders);
    const body = await readJsonBody(req);
    if (!body.ok) return jsonResponse({ error: body.error }, body.status, baseHeaders);
    try {
      const result = instantiateTemplate({
        template_slug: String((body.body as any).template_slug || ''),
        project_slug: String((body.body as any).project_slug || ''),
        project_name: String((body.body as any).project_name || ''),
        dry_run: Boolean((body.body as any).dry_run),
      });
      if ((result as InstantiateError).ok === false) {
        const e = result as InstantiateError;
        return jsonResponse({ error: e.error, ...(e.rollback_notes ? { rollback_notes: e.rollback_notes } : {}) }, e.status, baseHeaders);
      }
      return jsonResponse(result, 200, baseHeaders);
    } catch (e: any) {
      return jsonResponse({ error: e?.message || 'instantiate failed' }, 500, baseHeaders);
    }
  }

  return null;
}

// ---------- internals for tests -------------------------------------------

export const _internal = {
  TEMPLATES_DIR,
  AGENTS_FILE,
  BUDGETS_FILE,
  GOALS_FILE,
  PROJECTS_DIR,
  MAX_BODY_BYTES,
};

// Touch unused imports to keep tree-shake happy in some bundlers.
void statSync;
