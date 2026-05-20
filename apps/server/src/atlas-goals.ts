// atlas-goals.ts
//
// Paperclip-3: Goal cascade (Mission → Project → Goal → Task).
//
// Single mission ("atlas-root") seeded from /Users/hrmacnair/atlas/CLAUDE.md.
// Goals are flat JSON in ~/atlas/memory/goals.json, written atomically via
// temp-file-then-rename. Each goal carries:
//   - mission_id      → parent mission (default "atlas-root")
//   - project_id      → owning project slug (margin | industry | incubator | …) | null
//   - parent_goal_id  → optional parent goal for nested sub-goals
//
// Endpoints (mounted in index.ts):
//   GET   /api/atlas/goals?project=&mission=&status=   → { mission, goals }
//   GET   /api/atlas/goals/tree?project=               → { mission, tree }
//   GET   /api/atlas/goals/:id                         → { goal, ancestry }
//   POST  /api/atlas/goals      body: { name, project_id?, parent_goal_id?, mission_id? }
//   PATCH /api/atlas/goals/:id  body: { project_id?, parent_goal_id?, status?, name? }
//
// Out of scope this slice: deletion, archival, milestones, attached-card counts
// (Kanban join is left to the client — see GoalTree.vue's TODO).

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, openSync, closeSync, unlinkSync, statSync } from 'fs';
import { join, dirname } from 'path';
import crypto from 'crypto';

const ATLAS_HOME = process.env.ATLAS_HOME || '/Users/hrmacnair/atlas';
const GOALS_FILE = join(ATLAS_HOME, 'memory', 'goals.json');

// ---------- types ----------------------------------------------------------

export type GoalStatus = 'active' | 'done' | 'abandoned';

export interface Mission {
  id: string;
  name: string;
  statement: string;
}

export interface Goal {
  id: string;
  name: string;
  mission_id: string;
  project_id: string | null;
  parent_goal_id: string | null;
  created_at: string;
  status: GoalStatus;
}

export interface GoalsFile {
  mission: Mission;
  goals: Goal[];
}

export interface GoalNode extends Goal {
  children: GoalNode[];
}

export interface GoalAncestryEntry {
  kind: 'mission' | 'goal';
  id: string;
  name: string;
}

// ---------- file I/O -------------------------------------------------------

const DEFAULT_MISSION: Mission = {
  id: 'atlas-root',
  name: 'Atlas',
  statement:
    'Build native macOS and web applications. Run the businesses that grow out of those applications. Spin up white-label SaaS products on demand.',
};

function readGoalsFile(): GoalsFile {
  try {
    if (!existsSync(GOALS_FILE)) {
      return { mission: DEFAULT_MISSION, goals: [] };
    }
    const raw = readFileSync(GOALS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    const mission: Mission = parsed?.mission && typeof parsed.mission === 'object'
      ? {
          id: String(parsed.mission.id || DEFAULT_MISSION.id),
          name: String(parsed.mission.name || DEFAULT_MISSION.name),
          statement: String(parsed.mission.statement || DEFAULT_MISSION.statement),
        }
      : { ...DEFAULT_MISSION };
    const goals: Goal[] = Array.isArray(parsed?.goals)
      ? parsed.goals
          .filter((g: any) => g && typeof g.id === 'string')
          .map((g: any) => ({
            id: String(g.id),
            name: String(g.name || g.id),
            mission_id: String(g.mission_id || mission.id),
            project_id: g.project_id ? String(g.project_id) : null,
            parent_goal_id: g.parent_goal_id ? String(g.parent_goal_id) : null,
            created_at: String(g.created_at || new Date().toISOString()),
            status: (g.status === 'done' || g.status === 'abandoned') ? g.status : 'active',
          }))
      : [];
    return { mission, goals };
  } catch {
    return { mission: DEFAULT_MISSION, goals: [] };
  }
}

function writeGoalsFile(data: GoalsFile): boolean {
  try {
    mkdirSync(dirname(GOALS_FILE), { recursive: true });
    const tmp = `${GOALS_FILE}.tmp.${process.pid}.${Date.now()}`;
    try {
      writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
      renameSync(tmp, GOALS_FILE);
    } catch (inner) {
      try { unlinkSync(tmp); } catch {}
      throw inner;
    }
    return true;
  } catch (err) {
    console.error('[atlas-goals] write failed:', (err as Error)?.message);
    return false;
  }
}

function withGoalsLock<T>(fn: () => T): T {
  const lock = `${GOALS_FILE}.lock`;
  const start = Date.now();
  while (true) {
    try {
      const fd = openSync(lock, 'wx');
      closeSync(fd);
      try { return fn(); } finally { try { unlinkSync(lock); } catch {} }
    } catch (e: any) {
      if (e?.code !== 'EEXIST') throw e;
      if (Date.now() - start > 2000) {
        // stale-lock takeover: lock older than 5s gets nuked
        try {
          const st = statSync(lock);
          if (Date.now() - st.mtimeMs > 5000) { unlinkSync(lock); continue; }
        } catch {}
        throw new Error('goals.json lock contended (>2s)');
      }
      // tiny sleep — busy-wait OK at our scale (single operator, sub-second)
      const until = Date.now() + 25;
      while (Date.now() < until) {}
    }
  }
}

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function genGoalId(name: string): string {
  // Stable-ish kebab-case prefix + short hash, so callers get readable ids
  // without colliding with the seeded slugs.
  const slug = name.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'goal';
  const suffix = crypto.randomBytes(3).toString('hex');
  return `${slug}-${suffix}`;
}

// ---------- public read API ------------------------------------------------

export function getMission(): Mission {
  return readGoalsFile().mission;
}

export interface ListGoalsOpts {
  project_id?: string | null;
  mission_id?: string;
  status?: GoalStatus;
}

export function listGoals(opts: ListGoalsOpts = {}): { mission: Mission; goals: Goal[] } {
  const { mission, goals } = readGoalsFile();
  const filtered = goals.filter(g => {
    if (opts.mission_id && g.mission_id !== opts.mission_id) return false;
    if (opts.status && g.status !== opts.status) return false;
    if (opts.project_id !== undefined) {
      // explicit null → only orphan-project goals; explicit string → match
      if (opts.project_id === null && g.project_id !== null) return false;
      if (typeof opts.project_id === 'string' && g.project_id !== opts.project_id) return false;
    }
    return true;
  });
  return { mission, goals: filtered };
}

export function getGoal(id: string): { goal: Goal; ancestry: GoalAncestryEntry[] } | null {
  const { mission, goals } = readGoalsFile();
  const goal = goals.find(g => g.id === id);
  if (!goal) return null;
  const ancestry = resolveAncestry(goal, goals, mission);
  return { goal, ancestry };
}

function resolveAncestry(goal: Goal, allGoals: Goal[], mission: Mission): GoalAncestryEntry[] {
  // Walk parent chain, then prepend mission.
  const chain: Goal[] = [];
  const byId = new Map(allGoals.map(g => [g.id, g]));
  let cursor: Goal | undefined = goal;
  const seen = new Set<string>();
  while (cursor) {
    if (seen.has(cursor.id)) break; // cycle guard
    seen.add(cursor.id);
    chain.unshift(cursor);
    if (!cursor.parent_goal_id) break;
    cursor = byId.get(cursor.parent_goal_id);
  }
  return [
    { kind: 'mission' as const, id: mission.id, name: mission.name },
    ...chain.map(g => ({ kind: 'goal' as const, id: g.id, name: g.name })),
  ];
}

export function buildAncestry(goal_id: string): GoalAncestryEntry[] {
  const r = getGoal(goal_id);
  return r ? r.ancestry : [];
}

export function buildTree(opts: { project_id?: string | null; mission_id?: string } = {}): { mission: Mission; tree: GoalNode[] } {
  const { mission, goals } = readGoalsFile();
  const missionId = opts.mission_id || mission.id;

  // Scope: filter by mission_id and optionally project_id (orphan or specific).
  const scoped = goals.filter(g => {
    if (g.mission_id !== missionId) return false;
    if (opts.project_id !== undefined) {
      if (opts.project_id === null && g.project_id !== null) return false;
      if (typeof opts.project_id === 'string' && g.project_id !== opts.project_id) return false;
    }
    return true;
  });

  const nodes = new Map<string, GoalNode>();
  for (const g of scoped) nodes.set(g.id, { ...g, children: [] });

  const roots: GoalNode[] = [];
  for (const node of nodes.values()) {
    if (node.parent_goal_id && nodes.has(node.parent_goal_id)) {
      nodes.get(node.parent_goal_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return { mission, tree: roots };
}

// ---------- public write API ----------------------------------------------

export interface CreateGoalInput {
  name: string;
  project_id?: string | null;
  parent_goal_id?: string | null;
  mission_id?: string;
  status?: GoalStatus;
}

export function createGoal(input: CreateGoalInput): { ok: boolean; goal?: Goal; error?: string } {
  const rawName = input?.name;
  if (typeof rawName !== 'string' || !rawName.trim() || rawName.length > 500) {
    throw new Error('invalid goal name');
  }
  const name = rawName.trim();

  if (input.mission_id && input.mission_id !== DEFAULT_MISSION.id) {
    throw new Error('unknown mission_id');
  }

  return withGoalsLock(() => {
    const file = readGoalsFile();
    const missionId = input.mission_id || file.mission.id;

    // Validate parent_goal_id if supplied
    if (input.parent_goal_id) {
      const parent = file.goals.find(g => g.id === input.parent_goal_id);
      if (!parent) return { ok: false, error: `parent_goal_id ${input.parent_goal_id} not found` };
    }

    const goal: Goal = {
      id: genGoalId(name),
      name,
      mission_id: missionId,
      project_id: input.project_id ?? null,
      parent_goal_id: input.parent_goal_id ?? null,
      created_at: nowIso(),
      status: input.status || 'active',
    };

    file.goals.push(goal);
    if (!writeGoalsFile(file)) return { ok: false, error: 'write failed' };
    return { ok: true, goal };
  });
}

export interface LinkGoalInput {
  goal_id: string;
  project_id?: string | null;
  parent_goal_id?: string | null;
  status?: GoalStatus;
  name?: string;
}

export function linkGoal(input: LinkGoalInput): { ok: boolean; goal?: Goal; error?: string } {
  if (!input?.goal_id) return { ok: false, error: 'goal_id required' };
  return withGoalsLock(() => {
    const file = readGoalsFile();
    const idx = file.goals.findIndex(g => g.id === input.goal_id);
    if (idx === -1) return { ok: false, error: `goal ${input.goal_id} not found` };

    const goal = file.goals[idx]!;

    if (input.parent_goal_id !== undefined) {
      if (input.parent_goal_id === goal.id) {
        return { ok: false, error: 'goal cannot be its own parent' };
      }
      if (input.parent_goal_id) {
        const parent = file.goals.find(g => g.id === input.parent_goal_id);
        if (!parent) return { ok: false, error: `parent_goal_id ${input.parent_goal_id} not found` };
        // Cycle check: walk up from candidate parent — if we hit goal.id, reject.
        const byId = new Map(file.goals.map(g => [g.id, g]));
        let cursor: Goal | undefined = parent;
        const seen = new Set<string>();
        while (cursor && cursor.parent_goal_id) {
          if (seen.has(cursor.id)) break;
          seen.add(cursor.id);
          if (cursor.parent_goal_id === goal.id) {
            return { ok: false, error: 'parent change would create a cycle' };
          }
          cursor = byId.get(cursor.parent_goal_id);
        }
        goal.parent_goal_id = input.parent_goal_id;
      } else {
        goal.parent_goal_id = null;
      }
    }

    if (input.project_id !== undefined) goal.project_id = input.project_id;
    if (input.status !== undefined) {
      if (input.status === 'active' || input.status === 'done' || input.status === 'abandoned') {
        goal.status = input.status;
      } else {
        return { ok: false, error: `invalid status ${input.status}` };
      }
    }
    if (input.name !== undefined) {
      const n = String(input.name).trim();
      if (n) goal.name = n;
    }

    file.goals[idx] = goal;
    if (!writeGoalsFile(file)) return { ok: false, error: 'write failed' };
    return { ok: true, goal };
  });
}

// ---------- orphan helper (used by atlas-today) ---------------------------

// Returns the set of goal IDs that currently exist. Cheap O(n).
export function existingGoalIds(): Set<string> {
  return new Set(readGoalsFile().goals.map(g => g.id));
}
