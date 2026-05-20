// atlas-spinup.test.ts — bun:test
//
// Paperclip-8 company-template instantiation.
//
// Coverage:
//   - listTemplates returns the three seeded templates.
//   - getTemplate validates shape; unknown slug → throws.
//   - instantiateTemplate dry_run returns plan, writes nothing.
//   - instantiateTemplate apply: agents.json / agent_budgets.json / goals.json
//     all gain prefixed entries; project dir + WHITEPAPER + GOALS + phase-state
//     get created; routines get created and stamped on the schedule file.
//   - Collision detection: same project_slug twice → 409 on second call.
//   - Rollback: simulate a partial failure (routine creator throws) → all prior
//     writes are undone, no leftover agents / budgets / goals / project dir.
//   - HTTP admin gate: POST instantiate without x-atlas-admin → 401.
//   - HTTP body cap: oversized payload → 413.

import { describe, test, expect, beforeEach, afterAll } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, cpSync, readdirSync } from 'fs';
import { join } from 'path';

// Share TEST_HOME with atlas-routine-triggers.test so the module-level
// path constants in atlas-dag-schedules / atlas-dag-templates (captured at
// first import) point at the same on-disk sandbox both suites populate.
// Bun loads test files in one process; first import wins the env capture.
const TEST_HOME = join('/tmp', `atlas-routine-test-${process.pid}`);
const TEMPLATES_SRC = '/Users/hrmacnair/atlas/templates/company';

process.env.ATLAS_HOME = TEST_HOME;
process.env.ATLAS_TEMPLATES_DIR = join(TEST_HOME, 'templates', 'company');
process.env.ATLAS_AGENTS_JSON = join(TEST_HOME, 'memory', 'agents.json');
process.env.ATLAS_BUDGETS_JSON = join(TEST_HOME, 'memory', 'agent_budgets.json');
process.env.ATLAS_GOALS_JSON = join(TEST_HOME, 'memory', 'goals.json');
process.env.ATLAS_PROJECTS_DIR = join(TEST_HOME, 'projects');
process.env.ATLAS_ADMIN_TOKEN = 'test-admin-token';

mkdirSync(join(TEST_HOME, 'memory'), { recursive: true });
mkdirSync(join(TEST_HOME, 'projects'), { recursive: true });
mkdirSync(join(TEST_HOME, 'templates'), { recursive: true });
mkdirSync(join(TEST_HOME, 'observability', 'data'), { recursive: true });
mkdirSync(join(TEST_HOME, 'skills', 'dags'), { recursive: true });
// Seed empty schedules + the noop dag template both for our own dispatcher
// stub path and for atlas-routine-triggers.test which expects them.
writeFileSync(join(TEST_HOME, 'observability', 'data', 'dag-schedules.json'), '[]');
writeFileSync(join(TEST_HOME, 'skills', 'dags', 'noop-template.json'), JSON.stringify({
  name: 'noop',
  description: 'test',
  vars: [],
  nodes: [{ task: 'noop', owner: '@Producer', prompt: 'noop', files: [], deps: [] }],
}, null, 2));

// Copy the real templates into the sandbox. Tests don't mutate them.
cpSync(TEMPLATES_SRC, join(TEST_HOME, 'templates', 'company'), { recursive: true });

const spinup = await import('./atlas-spinup');
const { claimTicket, releaseTicket } = await import('./atlas-tickets');

const {
  listTemplates,
  getTemplate,
  instantiateTemplate,
  registerSpinupRoutes,
  _setRoutineHooksForTest,
  _internal,
} = spinup;

// Stub routine creator/deleter — record calls and let us inject failures.
let ROUTINE_CALLS = 0;
let ROUTINE_FAIL_AFTER = Infinity;
const CREATED_ROUTINES: string[] = [];
const DELETED_ROUTINES: string[] = [];
function installStubRoutines() {
  ROUTINE_CALLS = 0;
  CREATED_ROUTINES.length = 0;
  DELETED_ROUTINES.length = 0;
  ROUTINE_FAIL_AFTER = Infinity;
  _setRoutineHooksForTest(
    (input) => {
      ROUTINE_CALLS += 1;
      if (ROUTINE_CALLS > ROUTINE_FAIL_AFTER) {
        throw new Error('simulated routine failure');
      }
      const id = `stub-routine-${ROUTINE_CALLS}-${Math.random().toString(36).slice(2, 6)}`;
      CREATED_ROUTINES.push(id);
      void input;
      return { id, enabled: true, created_at: Date.now() } as any;
    },
    (id) => {
      DELETED_ROUTINES.push(id);
      return { ok: true };
    },
  );
}

function resetState() {
  // Blow away write targets but keep the templates dir intact.
  for (const f of [_internal.AGENTS_FILE, _internal.BUDGETS_FILE, _internal.GOALS_FILE]) {
    try { rmSync(f); } catch {}
  }
  // Re-seed agents.json with the canonical 9 atlas agents so collision logic has
  // a baseline to work against (mirrors real ~/atlas/memory/agents.json shape).
  writeFileSync(_internal.AGENTS_FILE, JSON.stringify({
    agents: [
      { id: 'producer', name: '@Producer', role: 'root', reports_to: null, color: '#7c5cff', status: 'idle', current_ticket_id: null, avatar: null },
    ],
  }, null, 2));
  writeFileSync(_internal.BUDGETS_FILE, JSON.stringify({
    month: 'auto',
    default_monthly_usd: 200,
    warn_pct: 0.8,
    hard_pct: 1.0,
    agents: {},
  }, null, 2));
  writeFileSync(_internal.GOALS_FILE, JSON.stringify({
    mission: { id: 'atlas-root', name: 'Atlas', statement: '' },
    goals: [],
  }, null, 2));
  // Wipe projects sandbox.
  try {
    for (const d of readdirSync(_internal.PROJECTS_DIR)) {
      rmSync(join(_internal.PROJECTS_DIR, d), { recursive: true, force: true });
    }
  } catch {}
  installStubRoutines();
}

beforeEach(() => {
  resetState();
});

afterAll(() => {
  // Intentionally do NOT rm TEST_HOME — it is shared with
  // atlas-routine-triggers.test (same /tmp/atlas-routine-test-<pid>) so the
  // other suite's afterAll handles cleanup.
});

// ---------- listTemplates --------------------------------------------------

describe('listTemplates', () => {
  test('returns the three seeded templates', () => {
    const ts = listTemplates();
    const slugs = ts.map(t => t.slug).sort();
    expect(slugs).toEqual(['marketplace', 'native-app', 'saas-vertical']);
    for (const t of ts) {
      expect(t.agent_count).toBeGreaterThan(0);
      expect(t.routine_count).toBeGreaterThan(0);
      expect(t.goal_count).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(0);
    }
  });
});

// ---------- getTemplate ----------------------------------------------------

describe('getTemplate', () => {
  test('loads + validates saas-vertical', () => {
    const t = getTemplate('saas-vertical');
    expect(t.slug).toBe('saas-vertical');
    expect(t.orgchart.agents.length).toBe(6);
    // Every reports_to either null or a known id
    const ids = new Set(t.orgchart.agents.map(a => a.id));
    for (const a of t.orgchart.agents) {
      if (a.reports_to !== null) expect(ids.has(a.reports_to)).toBe(true);
    }
    expect(t.routines.routines.length).toBeGreaterThanOrEqual(2);
    expect(t.goals.goals.length).toBeGreaterThanOrEqual(1);
  });

  test('marketplace has 7 agents', () => {
    expect(getTemplate('marketplace').orgchart.agents.length).toBe(7);
  });

  test('native-app has 5 agents', () => {
    expect(getTemplate('native-app').orgchart.agents.length).toBe(5);
  });

  test('missing template → throws', () => {
    expect(() => getTemplate('does-not-exist')).toThrow(/not found/);
  });

  test('invalid slug → throws', () => {
    expect(() => getTemplate('NOPE!')).toThrow(/invalid/);
  });
});

// ---------- instantiateTemplate dry_run ------------------------------------

describe('instantiateTemplate dry_run', () => {
  test('returns plan, writes nothing', () => {
    const beforeAgents = readFileSync(_internal.AGENTS_FILE, 'utf8');
    const beforeBudgets = readFileSync(_internal.BUDGETS_FILE, 'utf8');
    const beforeGoals = readFileSync(_internal.GOALS_FILE, 'utf8');

    const r = instantiateTemplate({
      template_slug: 'saas-vertical',
      project_slug: 'dryrun-proj',
      project_name: 'Dryrun Proj',
      dry_run: true,
    });

    expect((r as any).ok).toBe(true);
    expect((r as any).dry_run).toBe(true);
    expect((r as any).agents_to_add.length).toBe(6);
    expect((r as any).agents_to_add[0].id).toBe('dryrun-proj-producer');
    expect((r as any).goals_to_add.length).toBeGreaterThan(0);
    expect((r as any).goals_to_add[0].id.startsWith('dryrun-proj-')).toBe(true);

    expect(readFileSync(_internal.AGENTS_FILE, 'utf8')).toBe(beforeAgents);
    expect(readFileSync(_internal.BUDGETS_FILE, 'utf8')).toBe(beforeBudgets);
    expect(readFileSync(_internal.GOALS_FILE, 'utf8')).toBe(beforeGoals);
    expect(existsSync(join(_internal.PROJECTS_DIR, 'dryrun-proj'))).toBe(false);
    expect(ROUTINE_CALLS).toBe(0);
  });
});

// ---------- instantiateTemplate apply --------------------------------------

describe('instantiateTemplate apply', () => {
  test('writes agents / budgets / goals / routines / project dir', () => {
    const r = instantiateTemplate({
      template_slug: 'native-app',
      project_slug: 'newshot',
      project_name: 'Newshot',
    });

    expect((r as any).ok).toBe(true);
    expect((r as any).dry_run).toBe(false);
    expect((r as any).agents_added.length).toBe(5);
    expect((r as any).goals_added.length).toBeGreaterThan(0);
    expect((r as any).routines_created.length).toBe(2);

    // agents.json contains the prefixed agents
    const agentsFile = JSON.parse(readFileSync(_internal.AGENTS_FILE, 'utf8'));
    const ids = agentsFile.agents.map((a: any) => a.id);
    expect(ids).toContain('newshot-producer');
    expect(ids).toContain('newshot-swift');
    expect(ids).toContain('newshot-designer');
    // reports_to remapped to prefixed parent
    const swift = agentsFile.agents.find((a: any) => a.id === 'newshot-swift');
    expect(swift.reports_to).toBe('newshot-producer');
    // root retains null reports_to
    const prod = agentsFile.agents.find((a: any) => a.id === 'newshot-producer');
    expect(prod.reports_to).toBe(null);

    // budgets.json gained prefixed entries
    const budgetsFile = JSON.parse(readFileSync(_internal.BUDGETS_FILE, 'utf8'));
    expect(typeof budgetsFile.agents['newshot-swift']).toBe('object');
    expect(budgetsFile.agents['newshot-swift'].monthly_usd).toBe(400);

    // goals.json gained prefixed goals with project_id=newshot
    const goalsFile = JSON.parse(readFileSync(_internal.GOALS_FILE, 'utf8'));
    const matching = goalsFile.goals.filter((g: any) => g.project_id === 'newshot');
    expect(matching.length).toBeGreaterThan(0);
    expect(matching.every((g: any) => g.id.startsWith('newshot-'))).toBe(true);
    expect(matching.every((g: any) => g.mission_id === 'atlas-root')).toBe(true);

    // Project dir + files
    const dir = join(_internal.PROJECTS_DIR, 'newshot');
    expect(existsSync(dir)).toBe(true);
    expect(existsSync(join(dir, 'WHITEPAPER.md'))).toBe(true);
    expect(existsSync(join(dir, 'GOALS.md'))).toBe(true);
    expect(existsSync(join(dir, '.atlas', 'phase-state.json'))).toBe(true);
    const phase = JSON.parse(readFileSync(join(dir, '.atlas', 'phase-state.json'), 'utf8'));
    expect(phase.phase).toBe('scaffold');
    expect(phase.template_slug).toBe('native-app');

    // Routines: two cron/api routines created
    expect(ROUTINE_CALLS).toBe(2);
    expect(CREATED_ROUTINES.length).toBe(2);
  });

  test('preserves existing agents / budgets / goals (only appends)', () => {
    // Start with a pre-existing custom agent + budget + goal
    const agents = JSON.parse(readFileSync(_internal.AGENTS_FILE, 'utf8'));
    agents.agents.push({ id: 'custom-existing', name: 'Custom', role: 'pre', reports_to: null, color: '#fff', status: 'idle', current_ticket_id: null, avatar: null });
    writeFileSync(_internal.AGENTS_FILE, JSON.stringify(agents, null, 2));

    const goals = JSON.parse(readFileSync(_internal.GOALS_FILE, 'utf8'));
    goals.goals.push({ id: 'pre-existing', name: 'Pre', mission_id: 'atlas-root', project_id: null, parent_goal_id: null, created_at: '2026-01-01T00:00:00Z', status: 'active' });
    writeFileSync(_internal.GOALS_FILE, JSON.stringify(goals, null, 2));

    const r = instantiateTemplate({ template_slug: 'saas-vertical', project_slug: 'preserve-test', project_name: 'Preserve' });
    expect((r as any).ok).toBe(true);

    const after = JSON.parse(readFileSync(_internal.AGENTS_FILE, 'utf8'));
    expect(after.agents.find((a: any) => a.id === 'custom-existing')).toBeTruthy();
    const afterGoals = JSON.parse(readFileSync(_internal.GOALS_FILE, 'utf8'));
    expect(afterGoals.goals.find((g: any) => g.id === 'pre-existing')).toBeTruthy();
  });
});

// ---------- collision detection -------------------------------------------

describe('collision detection', () => {
  test('same project_slug twice → 409 on second', () => {
    const a = instantiateTemplate({ template_slug: 'native-app', project_slug: 'twice', project_name: 'Once' });
    expect((a as any).ok).toBe(true);

    const b = instantiateTemplate({ template_slug: 'native-app', project_slug: 'twice', project_name: 'Twice' });
    expect((b as any).ok).toBe(false);
    expect((b as any).status).toBe(409);
  });

  test('agent id collision → 409', () => {
    // First instantiation populates "collide-*" prefixes.
    instantiateTemplate({ template_slug: 'native-app', project_slug: 'collide', project_name: 'C' });
    // Manually nuke the project dir to bypass the dir-collision check first.
    rmSync(join(_internal.PROJECTS_DIR, 'collide'), { recursive: true, force: true });
    // Now the agents.json still has "collide-*" ids; a second go must 409 on agent collision.
    const r = instantiateTemplate({ template_slug: 'native-app', project_slug: 'collide', project_name: 'C2' });
    expect((r as any).ok).toBe(false);
    expect((r as any).status).toBe(409);
    expect(String((r as any).error)).toMatch(/agent id collision/);
  });

  test('invalid project_slug → 400', () => {
    const r = instantiateTemplate({ template_slug: 'native-app', project_slug: 'NotKebab!', project_name: 'X' });
    expect((r as any).ok).toBe(false);
    expect((r as any).status).toBe(400);
  });

  test('unknown template_slug → 404', () => {
    const r = instantiateTemplate({ template_slug: 'no-such-template', project_slug: 'x-y-z', project_name: 'X' });
    expect((r as any).ok).toBe(false);
    expect((r as any).status).toBe(404);
  });
});

// ---------- concurrency lock ----------------------------------------------

describe('concurrency lock', () => {
  test('held spinup claim blocks instantiate; release unblocks', () => {
    const ticket_id = 'spinup-lock-test-2';
    const foreign = claimTicket({ ticket_id, agent_id: 'foreign-holder', ttl_seconds: 60 });
    expect((foreign as any).ok).toBe(true);

    const blocked = instantiateTemplate({ template_slug: 'saas-vertical', project_slug: 'lock-test-2', project_name: 'Lock' });
    expect((blocked as any).ok).toBe(false);
    expect((blocked as any).error).toBe('instantiation_in_progress');

    const rel = releaseTicket({ ticket_id, agent_id: 'foreign-holder' });
    expect(rel.released).toBe(true);

    const ok = instantiateTemplate({ template_slug: 'saas-vertical', project_slug: 'lock-test-2', project_name: 'Lock' });
    expect((ok as any).ok).toBe(true);
  });
});

// ---------- rollback -------------------------------------------------------

describe('rollback on partial failure', () => {
  test('routine creator throws → prior writes undone', () => {
    const beforeAgents = readFileSync(_internal.AGENTS_FILE, 'utf8');
    const beforeBudgets = readFileSync(_internal.BUDGETS_FILE, 'utf8');
    const beforeGoals = readFileSync(_internal.GOALS_FILE, 'utf8');

    // Saas-vertical has 3 routines; fail after first to test partial rollback too.
    ROUTINE_FAIL_AFTER = 1;
    const r = instantiateTemplate({ template_slug: 'saas-vertical', project_slug: 'rollback-x', project_name: 'Rollback' });
    expect((r as any).ok).toBe(false);
    expect((r as any).status).toBe(500);

    // All three top-level files restored content-equal (atomicWrite adds a
    // trailing newline so we compare parsed JSON, not raw bytes).
    expect(JSON.parse(readFileSync(_internal.AGENTS_FILE, 'utf8'))).toEqual(JSON.parse(beforeAgents));
    expect(JSON.parse(readFileSync(_internal.BUDGETS_FILE, 'utf8'))).toEqual(JSON.parse(beforeBudgets));
    expect(JSON.parse(readFileSync(_internal.GOALS_FILE, 'utf8'))).toEqual(JSON.parse(beforeGoals));

    // Project dir wiped, partial routines deleted.
    expect(existsSync(join(_internal.PROJECTS_DIR, 'rollback-x'))).toBe(false);
    expect(DELETED_ROUTINES.length).toBe(1);
    expect(DELETED_ROUTINES[0]).toBe(CREATED_ROUTINES[0]!);
  });
});

// ---------- HTTP layer -----------------------------------------------------

describe('HTTP /api/atlas/spinup', () => {
  const headers = { 'X-Test': '1' };

  test('GET /templates returns list', async () => {
    const url = new URL('http://localhost/api/atlas/spinup/templates');
    const resp = await registerSpinupRoutes(new Request(url.toString()), url, headers);
    expect(resp!.status).toBe(200);
    const j = await resp!.json() as any;
    expect(Array.isArray(j.templates)).toBe(true);
    expect(j.templates.length).toBe(3);
  });

  test('GET /templates/:slug returns full template', async () => {
    const url = new URL('http://localhost/api/atlas/spinup/templates/saas-vertical');
    const resp = await registerSpinupRoutes(new Request(url.toString()), url, headers);
    expect(resp!.status).toBe(200);
    const j = await resp!.json() as any;
    expect(j.slug).toBe('saas-vertical');
    expect(j.orgchart.agents.length).toBe(6);
  });

  test('GET /templates/:slug missing → 404', async () => {
    const url = new URL('http://localhost/api/atlas/spinup/templates/nope-nope');
    const resp = await registerSpinupRoutes(new Request(url.toString()), url, headers);
    expect(resp!.status).toBe(404);
  });

  test('POST /instantiate without admin → 401', async () => {
    const url = new URL('http://localhost/api/atlas/spinup/instantiate');
    const req = new Request(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template_slug: 'native-app', project_slug: 'noauth-x', project_name: 'X' }),
    });
    const resp = await registerSpinupRoutes(req, url, headers);
    expect(resp!.status).toBe(401);
  });

  test('POST /instantiate with admin + dry_run → 200 plan', async () => {
    const url = new URL('http://localhost/api/atlas/spinup/instantiate');
    const req = new Request(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-atlas-admin': 'test-admin-token' },
      body: JSON.stringify({ template_slug: 'native-app', project_slug: 'http-dry', project_name: 'HTTP Dry', dry_run: true }),
    });
    const resp = await registerSpinupRoutes(req, url, headers);
    expect(resp!.status).toBe(200);
    const j = await resp!.json() as any;
    expect(j.dry_run).toBe(true);
    expect(j.agents_to_add.length).toBe(5);
  });

  test('POST /instantiate body > 16KB → 413', async () => {
    const url = new URL('http://localhost/api/atlas/spinup/instantiate');
    const big = JSON.stringify({
      template_slug: 'native-app', project_slug: 'big-x', project_name: 'X',
      _pad: 'x'.repeat(20 * 1024),
    });
    const req = new Request(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-atlas-admin': 'test-admin-token',
        'Content-Length': String(big.length),
      },
      body: big,
    });
    const resp = await registerSpinupRoutes(req, url, headers);
    expect(resp!.status).toBe(413);
  });

  test('GET unknown spinup path → null (passthrough)', async () => {
    const url = new URL('http://localhost/api/atlas/spinup/whatever');
    const resp = await registerSpinupRoutes(new Request(url.toString()), url, headers);
    expect(resp).toBeNull();
  });
});
