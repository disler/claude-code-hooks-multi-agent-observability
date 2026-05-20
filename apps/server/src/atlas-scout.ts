// ~/atlas/observability/apps/server/src/atlas-scout.ts
//
// Layer 5c — Scout ecosystem discovery + curation.
//
// Three components per spec:
//   A. Discovery + scoring   — runs as the `weekly_scout_sweep` scheduled job.
//                              That job (a claude/opus session) walks GitHub,
//                              awesome-lists, r/ClaudeAI, HN, Anthropic plugin
//                              marketplace + Caveman marketplace and writes
//                              scorecard yamls to ~/atlas/scout/candidates/.
//   B. Sandboxed evaluation  — runs inside the same job: git clone --depth=1
//                              into /tmp/atlas-scout-{cand_id}/, static-analyze,
//                              write inspection report. NEVER executes the
//                              candidate's code.
//   C. Operator approval     — server-side endpoint. Approval = re-read the
//                              inspection report, run the install command
//                              (claude /plugin install | npm install | mcp
//                              register), enter 7-day trial period. Hooks
//                              refused server-side (operator-only).
//
// This module is the SERVER-side surface: list candidates / inspections /
// trials, surface to dashboard + Today queue, accept install/refuse calls
// from operator. The autonomous DISCOVERY half happens in the scheduled
// job's claude session.

import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, appendFileSync } from 'fs';
import { join, basename } from 'path';
import crypto from 'crypto';

const ATLAS_HOME = '/Users/hrmacnair/atlas';
const SCOUT_DIR = join(ATLAS_HOME, 'scout');
const CANDIDATES_DIR = join(SCOUT_DIR, 'candidates');
const INSPECTIONS_DIR = join(SCOUT_DIR, 'inspections');
const TRIALS_DIR = join(SCOUT_DIR, 'trials');
const SWEEPS_DIR = join(SCOUT_DIR, 'sweeps');
const INSTALLED_DIR = join(SCOUT_DIR, 'installed');
const AUDIT_DIR = join(ATLAS_HOME, 'audit');
const UV_BIN = '/opt/homebrew/bin/uv';

const HUMAN_ONLY_TYPES = new Set(['hook']);  // candidate.type === 'hook' → operator-only install
const TRIAL_DAYS = 7;

type ScoutCandidate = {
  candidate_id: string;
  name: string;
  repo: string;
  discovered: string;
  type: 'skill' | 'plugin' | 'mcp_server' | 'hook' | 'command';
  description: string;
  relevance: { score: number; reasoning: string };
  quality_signals: Record<string, any>;
  safety_signals: Record<string, any>;
  score_total: number;
  recommendation: 'install_proposed' | 'watch' | 'skip';
  inspection_report?: string;
  reasoning: string;
  source_path?: string;
};

type ScoutSummary = {
  candidate_id: string;
  name: string;
  repo: string;
  type: string;
  score_total: number;
  recommendation: string;
  discovered: string;
  human_only: boolean;
  status: 'pending' | 'installed' | 'declined' | 'trial';
  source_path: string;
  inspection_report_path?: string;
};

// ----- yaml I/O ------------------------------------------------------------

function readYaml(path: string): any {
  try {
    if (!existsSync(path)) return null;
    const res = spawnSync(
      UV_BIN,
      ['run', '--quiet', '--with', 'pyyaml', 'python3', '-c',
       'import sys,json,yaml; d=yaml.safe_load(open(sys.argv[1])); print(json.dumps(d or {}, default=str))',
       path],
      { encoding: 'utf8' }
    );
    if (res.status !== 0) return null;
    return JSON.parse(res.stdout);
  } catch { return null; }
}

function writeYaml(path: string, data: any): boolean {
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
    writeFileSync(path, res.stdout);
    return true;
  } catch { return false; }
}

// ----- audit ---------------------------------------------------------------

function nowIso(): string { return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'); }
function actId(): string { return `act_${Math.floor(Date.now() / 1000)}_${crypto.randomBytes(3).toString('hex')}`; }
function appendAudit(entry: any): void {
  try {
    mkdirSync(AUDIT_DIR, { recursive: true });
    const month = new Date().toISOString().slice(0, 7);
    appendFileSync(join(AUDIT_DIR, `${month}.log`), JSON.stringify(entry) + '\n');
  } catch {}
}

// ----- candidate scanning --------------------------------------------------

function walkCandidates(): Array<{ path: string; data: any }> {
  const out: Array<{ path: string; data: any }> = [];
  if (!existsSync(CANDIDATES_DIR)) return out;
  // candidates organized by date subdirs: YYYY-MM-DD/cand_XXX.yaml
  for (const ent of readdirSync(CANDIDATES_DIR, { withFileTypes: true })) {
    if (ent.isDirectory()) {
      const sub = join(CANDIDATES_DIR, ent.name);
      for (const f of readdirSync(sub)) {
        if (!f.endsWith('.yaml')) continue;
        const p = join(sub, f);
        const d = readYaml(p);
        if (d) out.push({ path: p, data: d });
      }
    } else if (ent.name.endsWith('.yaml')) {
      const p = join(CANDIDATES_DIR, ent.name);
      const d = readYaml(p);
      if (d) out.push({ path: p, data: d });
    }
  }
  return out;
}

function statusForCandidate(candId: string): 'pending' | 'installed' | 'declined' | 'trial' {
  if (existsSync(join(INSTALLED_DIR, `${candId}.yaml`))) {
    const trialPath = join(TRIALS_DIR, `${candId}.yaml`);
    if (existsSync(trialPath)) {
      const t = readYaml(trialPath);
      if (t?.status === 'active') return 'trial';
    }
    return 'installed';
  }
  return 'pending';
}

// ----- public API ----------------------------------------------------------

export function listCandidates(): ScoutSummary[] {
  const out: ScoutSummary[] = [];
  for (const { path, data } of walkCandidates()) {
    const id = data.candidate_id || basename(path).replace(/\.yaml$/, '');
    out.push({
      candidate_id: id,
      name: data.name || id,
      repo: data.repo || '',
      type: data.type || 'unknown',
      score_total: typeof data.score_total === 'number' ? data.score_total : 0,
      recommendation: data.recommendation || 'watch',
      discovered: data.discovered || statSync(path).mtime.toISOString(),
      human_only: HUMAN_ONLY_TYPES.has(data.type || ''),
      status: statusForCandidate(id),
      source_path: path,
      inspection_report_path: data.inspection_report,
    });
  }
  // Newest-first by discovered timestamp.
  out.sort((a, b) => (b.discovered > a.discovered ? 1 : -1));
  return out;
}

export function getCandidate(id: string): { path: string; data: any } | null {
  for (const c of walkCandidates()) {
    const cid = c.data.candidate_id || basename(c.path).replace(/\.yaml$/, '');
    if (cid === id || cid.startsWith(id)) return c;
  }
  return null;
}

export function listTrials(): Array<{ candidate_id: string; data: any }> {
  const out: Array<{ candidate_id: string; data: any }> = [];
  if (!existsSync(TRIALS_DIR)) return out;
  for (const f of readdirSync(TRIALS_DIR)) {
    if (!f.endsWith('.yaml')) continue;
    const p = join(TRIALS_DIR, f);
    const d = readYaml(p);
    if (d) out.push({ candidate_id: f.replace(/\.yaml$/, ''), data: d });
  }
  return out;
}

export function listSweeps(): Array<{ week: string; path: string }> {
  const out: Array<{ week: string; path: string }> = [];
  if (!existsSync(SWEEPS_DIR)) return out;
  for (const f of readdirSync(SWEEPS_DIR)) {
    if (!f.endsWith('.md')) continue;
    out.push({ week: f.replace(/\.md$/, ''), path: join(SWEEPS_DIR, f) });
  }
  out.sort((a, b) => (b.week > a.week ? 1 : -1));
  return out;
}

// ----- install pipeline ----------------------------------------------------
//
// Operator approves a candidate (via dashboard, Telegram, or Today queue).
// installCandidate() runs the install command + opens the 7-day trial.
//
// Per locked decision: hooks are REFUSED server-side. Markdown skills and
// MCP servers and Claude Code plugins are all `must_approve` at autonomy_gate
// regardless of division autonomy (Scout safety guard #2).

export function installCandidate(id: string, approver: string, surface: string): { ok: boolean; message: string; install_command?: string } {
  const found = getCandidate(id);
  if (!found) return { ok: false, message: `candidate ${id} not found` };
  const c = found.data as ScoutCandidate;
  const candId = c.candidate_id || basename(found.path).replace(/\.yaml$/, '');

  // 1. Hooks are operator-only.
  if (HUMAN_ONLY_TYPES.has(c.type)) {
    appendAudit({
      ts: nowIso(), id: actId(),
      division: 'atlas-meta', agent: 'scout',
      action: 'scout_install_refused',
      target: candId,
      summary: `Refused: type=${c.type} requires manual operator install`,
      autonomy: 'restricted', outcome: 'blocked',
      approver, correlation_id: candId,
    });
    return {
      ok: false,
      message: `type "${c.type}" requires manual operator install in a Claude Code session in ~/atlas. Inspect ${c.inspection_report || '(no report)'} first.`,
    };
  }

  // 2. Re-read the inspection report (sanity — operator should have seen it)
  if (c.inspection_report && !existsSync(c.inspection_report)) {
    return { ok: false, message: `inspection report missing: ${c.inspection_report}` };
  }

  // 3. Render the install command per type. Layer 5c first slice surfaces the
  //    command for operator to copy-paste — does NOT run npm/claude itself.
  //    The autonomy_gate would queue any `npm add` regardless, so this is the
  //    cleanest hand-off.
  let installCmd = '';
  switch (c.type) {
    case 'plugin':
      installCmd = `claude /plugin install ${c.repo}`;
      break;
    case 'skill':
      installCmd = `cp -r ./skill-files ~/atlas/.claude/skills/${c.name}  # or: npm install --prefix ~/.npm-global ${c.repo}`;
      break;
    case 'mcp_server':
      installCmd = `# Edit ~/.claude/settings.json to add an entry under "mcpServers":\n#   "${c.name}": { "command": "...", "args": [...], "env": {...} }`;
      break;
    case 'command':
      installCmd = `cp ./command.md ~/atlas/.claude/commands/${c.name}.md`;
      break;
    default:
      return { ok: false, message: `unknown candidate type: ${c.type}` };
  }

  // 4. Open the trial. Mark candidate as installed.
  mkdirSync(TRIALS_DIR, { recursive: true });
  mkdirSync(INSTALLED_DIR, { recursive: true });
  const trial = {
    candidate_id: candId,
    name: c.name,
    type: c.type,
    repo: c.repo,
    installed_at: nowIso(),
    trial_ends_at: new Date(Date.now() + TRIAL_DAYS * 86_400_000).toISOString(),
    approved_by: approver,
    approved_via: surface,
    status: 'active' as const,
    concerns: [],
  };
  writeYaml(join(TRIALS_DIR, `${candId}.yaml`), trial);

  const installedRecord = {
    candidate_id: candId,
    name: c.name,
    type: c.type,
    repo: c.repo,
    installed_at: nowIso(),
    install_command: installCmd,
    inspection_report: c.inspection_report,
    score_total: c.score_total,
    approved_by: approver,
    approved_via: surface,
  };
  writeYaml(join(INSTALLED_DIR, `${candId}.yaml`), installedRecord);

  appendAudit({
    ts: nowIso(), id: actId(),
    division: 'atlas-meta', agent: 'scout',
    action: 'scout_installed',
    target: candId,
    summary: `Installed ${c.type} ${c.name} from ${c.repo}. ${TRIAL_DAYS}-day trial begins.`,
    autonomy: 'bold', outcome: 'executed',
    approver, correlation_id: candId,
  });

  return {
    ok: true,
    message: `installed ${c.name} — ${TRIAL_DAYS}-day trial open. Run: ${installCmd.split('\n')[0]}`,
    install_command: installCmd,
  };
}

export function declineCandidate(id: string, approver: string, surface: string, note?: string): { ok: boolean; message: string } {
  const found = getCandidate(id);
  if (!found) return { ok: false, message: `candidate ${id} not found` };
  const candId = found.data.candidate_id || basename(found.path).replace(/\.yaml$/, '');

  // Append decline marker to the candidate yaml (in-place edit)
  const updated = { ...found.data, declined_by: approver, declined_via: surface, declined_at: nowIso(), decline_note: note || '', recommendation: 'skip' };
  writeYaml(found.path, updated);
  appendAudit({
    ts: nowIso(), id: actId(),
    division: 'atlas-meta', agent: 'scout',
    action: 'scout_declined',
    target: candId,
    summary: `Declined: ${note || '(no note)'}`,
    autonomy: 'bold', outcome: 'rejected',
    approver, correlation_id: candId,
  });
  return { ok: true, message: `declined ${candId}` };
}

// Trial concern: a watchdog flagged something during the 7-day trial. Pauses
// the trial and surfaces as a `trial_concern` Today item via the existing sync.
export function markTrialConcern(id: string, reason: string): { ok: boolean; message: string } {
  const trialPath = join(TRIALS_DIR, `${id}.yaml`);
  if (!existsSync(trialPath)) return { ok: false, message: `trial ${id} not found` };
  const trial = readYaml(trialPath) || {};
  trial.concerns = trial.concerns || [];
  trial.concerns.push({ ts: nowIso(), reason });
  trial.status = 'paused';
  writeYaml(trialPath, trial);
  appendAudit({
    ts: nowIso(), id: actId(),
    division: 'atlas-meta', agent: 'scout',
    action: 'scout_trial_concern',
    target: id,
    summary: `Trial paused: ${reason}`,
    autonomy: 'bold', outcome: 'blocked',
    approver: null, correlation_id: id,
  });
  return { ok: true, message: `trial ${id} paused; concern recorded` };
}

// Daily check called by the morning scheduled job. Looks at trials:
//   - status=active && trial_ends_at < now      → promote to permanent (clean)
//   - status=paused                              → surface as `trial_concern` Today item
// Returns counts.
export function dailyTrialMaintenance(): { promoted: number; paused: number } {
  const trials = listTrials();
  let promoted = 0;
  let paused = 0;
  const now = Date.now();
  for (const t of trials) {
    if (t.data.status === 'active' && t.data.trial_ends_at) {
      if (new Date(t.data.trial_ends_at).getTime() < now) {
        const updated = { ...t.data, status: 'promoted', promoted_at: nowIso() };
        writeYaml(join(TRIALS_DIR, `${t.candidate_id}.yaml`), updated);
        appendAudit({
          ts: nowIso(), id: actId(),
          division: 'atlas-meta', agent: 'scout',
          action: 'scout_trial_promoted',
          target: t.candidate_id,
          summary: `Trial complete (${TRIAL_DAYS}d clean) — promoted to permanent`,
          autonomy: 'bold', outcome: 'executed',
          approver: null, correlation_id: t.candidate_id,
        });
        promoted++;
      }
    } else if (t.data.status === 'paused') {
      paused++;
    }
  }
  return { promoted, paused };
}
