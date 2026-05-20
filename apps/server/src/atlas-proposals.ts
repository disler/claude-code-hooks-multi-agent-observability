// ~/atlas/observability/apps/server/src/atlas-proposals.ts
//
// Layer 5a — proposal pipeline. Reads ~/atlas/proposals/*.yaml (drafts the
// scheduler's autonomous jobs leave behind), surfaces them to the dashboard
// and Telegram, and applies approved diffs in a tracked transaction.
//
// Layer 5a scope: only `router_prompt_patch` proposals are applied
// automatically. Other types (agent_personality_patch, schedule_patch,
// new_skill, etc.) are surfaced but their apply implementations land in
// Layer 5b. Hooks (`hook_patch`) are always operator-only — server refuses
// to apply them, surfaces the diff for manual operator review in
// ~/atlas/ Claude Code session.

import { spawnSync } from 'child_process';
import { writeFileSync, mkdirSync, existsSync, readFileSync, renameSync, appendFileSync, readdirSync, statSync, copyFileSync } from 'fs';
import { join, basename } from 'path';
import crypto from 'crypto';
import { regenerateWhitepaper } from './atlas-whitepaper';

const ATLAS_HOME = '/Users/hrmacnair/atlas';
const PROPOSALS_DIR = join(ATLAS_HOME, 'proposals');
const APPLIED_DIR = join(PROPOSALS_DIR, 'applied');
const QUEUED_DIR = join(PROPOSALS_DIR, 'queued');
const REJECTED_DIR = join(PROPOSALS_DIR, 'rejected');
const AUDIT_DIR = join(ATLAS_HOME, 'audit');
const UV_BIN = '/opt/homebrew/bin/uv';

const VELOCITY_CAP_PER_DAY = 5;
// Apply pipeline coverage. Layer 5a shipped just router_prompt_patch.
// Layer 5b extends to the full set, leaving only hook_patch operator-only.
const APPLIED_TYPES_LAYER_5A = new Set([
  'router_prompt_patch',
  'agent_personality_patch',
  'schedule_patch',
  'lessons_addition',
  'scout_retirement',
  'feature_proposal',
  'trial_concern',
  'architecture_change',
]);
const HUMAN_ONLY_TYPES = new Set(['hook_patch']);
const ELEVATION_TYPES = new Set(['autonomy_upgrade', 'scope_expansion', 'safety_hook_removal']);

type ProposalYaml = {
  id?: string;
  created?: string;
  proposer_division?: string;
  proposer_agent?: string;
  proposer_model?: string;
  type?: string;
  target_file?: string;
  evidence?: any[];
  proposed_diff?: string;
  rationale?: string;
  [k: string]: any;
};

export type ProposalSummary = {
  id: string;
  source_path: string;
  created: string;
  proposer_division: string;
  proposer_agent: string;
  type: string;
  target_file: string;
  rationale_preview: string;
  diff_preview: string;
  human_only: boolean;
  applyable_in_layer_5a: boolean;
  velocity_state: 'in_window' | 'queued_over_cap';
  status: 'pending' | 'queued' | 'applied' | 'rejected' | 'deferred';
};

// ----- yaml parsing via uv-pyyaml shell-out --------------------------------

function readYaml(path: string): ProposalYaml | null {
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
  } catch {
    return null;
  }
}

function writeYaml(path: string, data: any): boolean {
  try {
    const json = JSON.stringify(data);
    const res = spawnSync(
      UV_BIN,
      ['run', '--quiet', '--with', 'pyyaml', 'python3', '-c',
       'import sys,json,yaml; d=json.loads(sys.stdin.read()); print(yaml.safe_dump(d, sort_keys=False), end="")'],
      { input: json, encoding: 'utf8' }
    );
    if (res.status !== 0) return false;
    writeFileSync(path, res.stdout);
    return true;
  } catch {
    return false;
  }
}

// ----- file scanning -------------------------------------------------------

function isProposalFile(name: string): boolean {
  return name.endsWith('.yaml') && !name.startsWith('.');
}

function scanDir(dir: string): string[] {
  try {
    if (!existsSync(dir)) return [];
    return readdirSync(dir).filter(isProposalFile).map(n => join(dir, n));
  } catch {
    return [];
  }
}

function utf8Slice(s: string, n: number): string {
  return (s || '').slice(0, n).replace(/\n+/g, ' ').trim();
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

// ----- audit --------------------------------------------------------------

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
    appendFileSync(join(AUDIT_DIR, `${month}.log`), JSON.stringify(entry) + '\n');
  } catch {
    // swallow — never break approval flow on audit write failure
  }
  try {
    if (entry && entry.division) {
      bumpDivisionState(entry.division, entry.id || null, entry.ts || '');
    }
  } catch {}
}

// ----- velocity cap --------------------------------------------------------

function countAppliedToday(division: string): number {
  const today = todayKey();
  return scanDir(APPLIED_DIR).filter(p => {
    const fname = basename(p);
    if (!fname.startsWith(today)) {
      // applied filename format: applied/{id}.yaml; embed date in filename when
      // the source filename was {YYYY-MM-DD}-slug.yaml. Fallback: read.
      const y = readYaml(p);
      if (y?.proposer_division !== division) return false;
      const ts = y?.applied_at || y?.created || '';
      return ts.startsWith(today);
    }
    const y = readYaml(p);
    return y?.proposer_division === division;
  }).length;
}

function velocityState(division: string, sourceDir: string): 'in_window' | 'queued_over_cap' {
  if (sourceDir === QUEUED_DIR) return 'queued_over_cap';
  const applied = countAppliedToday(division);
  return applied >= VELOCITY_CAP_PER_DAY ? 'queued_over_cap' : 'in_window';
}

// ----- self-elevation guard ------------------------------------------------

function isSelfElevation(p: ProposalYaml): { blocked: boolean; reason?: string } {
  if (!p.type) return { blocked: false };
  if (ELEVATION_TYPES.has(p.type)) {
    return { blocked: true, reason: `proposal type ${p.type} is self-elevation; operator must edit manually` };
  }
  // Scan diff for autonomy upgrades
  const diff = p.proposed_diff || '';
  if (/\+\s*autonomy:\s*(bold|restricted-elevation)/i.test(diff) &&
      /-\s*autonomy:\s*(cautious|restricted)/i.test(diff)) {
    return { blocked: true, reason: 'diff increases autonomy level (cautious/restricted → bold)' };
  }
  // Detect new scope.paths additions
  if (/\+\s+-\s+~?\/atlas\//.test(diff) && /scope:|paths:/.test(diff)) {
    return { blocked: true, reason: 'diff appears to expand division scope.paths' };
  }
  return { blocked: false };
}

// ----- public API ---------------------------------------------------------

export function listProposals(): ProposalSummary[] {
  const summaries: ProposalSummary[] = [];
  const sources: Array<[string, ProposalSummary['status']]> = [
    [PROPOSALS_DIR, 'pending'],
    [QUEUED_DIR, 'queued'],
    [APPLIED_DIR, 'applied'],
    [REJECTED_DIR, 'rejected'],
  ];

  for (const [dir, status] of sources) {
    for (const path of scanDir(dir)) {
      const y = readYaml(path);
      if (!y) continue;
      const id = y.id || basename(path).replace(/\.yaml$/, '');
      const division = (y.proposer_division || 'atlas-meta');
      summaries.push({
        id,
        source_path: path,
        created: y.created || statSync(path).mtime.toISOString(),
        proposer_division: division,
        proposer_agent: y.proposer_agent || 'unknown',
        type: y.type || 'unknown',
        target_file: y.target_file || '',
        rationale_preview: utf8Slice(y.rationale || '', 200),
        diff_preview: (y.proposed_diff || '').split('\n').slice(0, 12).join('\n'),
        human_only: HUMAN_ONLY_TYPES.has(y.type || ''),
        applyable_in_layer_5a: APPLIED_TYPES_LAYER_5A.has(y.type || ''),
        velocity_state: velocityState(division, dir),
        status,
      });
    }
  }
  // newest first
  summaries.sort((a, b) => (b.created > a.created ? 1 : -1));
  return summaries;
}

export function loadProposal(id: string): { path: string; data: ProposalYaml; status: ProposalSummary['status'] } | null {
  // Partial-prefix match: search every dir
  const dirs: Array<[string, ProposalSummary['status']]> = [
    [PROPOSALS_DIR, 'pending'],
    [QUEUED_DIR, 'queued'],
    [APPLIED_DIR, 'applied'],
    [REJECTED_DIR, 'rejected'],
  ];
  for (const [dir, status] of dirs) {
    for (const path of scanDir(dir)) {
      const y = readYaml(path);
      if (!y) continue;
      const fileId = y.id || basename(path).replace(/\.yaml$/, '');
      if (fileId === id || fileId.startsWith(id)) {
        return { path, data: y, status };
      }
    }
  }
  return null;
}

// Per-type apply dispatcher. Returns { ok, backup_path?, error? }.
// Each type has a distinct apply shape — some patch files, some append to
// state files, some only flip status flags. backup_path is set whenever a
// real file rollback is possible; the rollback() path uses it.
function applyByType(p: ProposalYaml, propId: string): { ok: boolean; backup_path?: string; error?: string } {
  const type = p.type || '';

  // Diff-based types: patch a file. router/agent/schedule/architecture all do this.
  const DIFF_TYPES = new Set(['router_prompt_patch', 'agent_personality_patch', 'schedule_patch', 'architecture_change']);
  if (DIFF_TYPES.has(type)) {
    if (!p.target_file || !p.proposed_diff) {
      return { ok: false, error: 'proposal missing target_file or proposed_diff' };
    }
    return applyDiff(p.target_file, p.proposed_diff, propId);
  }

  // lessons_addition — append entries to ~/atlas/memory/lessons.md.
  // Shape: { proposed_additions: [ { text, evidence: [...] } ] }
  if (type === 'lessons_addition') {
    const additions = Array.isArray(p.proposed_additions) ? p.proposed_additions : [];
    if (additions.length === 0) return { ok: false, error: 'no proposed_additions in lessons_addition' };
    const target = `${process.env.HOME || ''}/atlas/memory/lessons.md`;
    if (!existsSync(target)) return { ok: false, error: `lessons.md not found at ${target}` };
    const backup = `${target}.pre-${propId}.bak`;
    try { copyFileSync(target, backup); } catch (err: any) { return { ok: false, error: `backup failed: ${err.message}` }; }
    try {
      const today = new Date().toISOString().slice(0, 10);
      let block = `\n## ${today} — ${propId}\n`;
      for (const a of additions) {
        const text = (a && typeof a === 'object') ? (a.text || '') : String(a);
        block += `- ${text}\n`;
        if (a?.evidence && Array.isArray(a.evidence) && a.evidence.length > 0) {
          for (const e of a.evidence) block += `  - evidence: ${e}\n`;
        }
      }
      const { appendFileSync } = require('fs');
      appendFileSync(target, block);
      return { ok: true, backup_path: backup };
    } catch (err: any) {
      copyFileSync(backup, target);
      return { ok: false, error: err.message };
    }
  }

  // feature_proposal — append entries to division's missions.yaml as status=review.
  // Shape: { proposer_division, proposed_features: [ { name, rationale, ... } ] }
  if (type === 'feature_proposal') {
    const features = Array.isArray(p.proposed_features) ? p.proposed_features : [];
    if (features.length === 0) return { ok: false, error: 'no proposed_features' };
    const div = p.proposer_division || 'atlas-meta';
    const target = `${process.env.HOME || ''}/atlas/divisions/${div}/missions.yaml`;
    if (!existsSync(target)) return { ok: false, error: `missions.yaml not found for division ${div}` };
    const backup = `${target}.pre-${propId}.bak`;
    try { copyFileSync(target, backup); } catch (err: any) { return { ok: false, error: `backup failed: ${err.message}` }; }
    try {
      // Read existing missions via uv-pyyaml, append, write back.
      const existing = (function () {
        const r = spawnSync(UV_BIN, ['run', '--quiet', '--with', 'pyyaml', 'python3', '-c',
          'import sys,json,yaml; d=yaml.safe_load(open(sys.argv[1])); print(json.dumps(d or [], default=str))', target],
          { encoding: 'utf8' });
        if (r.status !== 0) return [];
        try { return JSON.parse(r.stdout); } catch { return []; }
      })();
      const updated = Array.isArray(existing) ? [...existing] : [];
      for (const f of features) {
        updated.push({
          id: `mish_${Math.floor(Date.now() / 1000)}_${Math.random().toString(36).slice(2, 5)}`,
          title: f.name || 'untitled',
          agent: p.proposer_agent || 'producer',
          origin: 'self-improvement',
          priority: 3,
          created: nowIso(),
          status: 'review',
          related_proposal: propId,
          rationale: f.rationale || '',
          rough_effort: f.rough_effort || 'unknown',
        });
      }
      const json = JSON.stringify(updated);
      const w = spawnSync(UV_BIN, ['run', '--quiet', '--with', 'pyyaml', 'python3', '-c',
        'import sys,json,yaml; d=json.loads(sys.stdin.read()); print(yaml.safe_dump(d, sort_keys=False, default_flow_style=False, allow_unicode=True), end="")'],
        { input: json, encoding: 'utf8' });
      if (w.status !== 0) {
        copyFileSync(backup, target);
        return { ok: false, error: `yaml write failed: ${(w.stderr || '').slice(0, 200)}` };
      }
      writeFileSync(target, w.stdout);
      return { ok: true, backup_path: backup };
    } catch (err: any) {
      copyFileSync(backup, target);
      return { ok: false, error: err.message };
    }
  }

  // scout_retirement — flip ~/atlas/scout/installed/{candidate_id}.yaml status to "retired".
  // No actual uninstall — operator runs the uninstall command manually.
  if (type === 'scout_retirement') {
    const candId = p.candidate_id;
    if (!candId) return { ok: false, error: 'missing candidate_id' };
    const target = `${process.env.HOME || ''}/atlas/scout/installed/${candId}.yaml`;
    if (!existsSync(target)) return { ok: false, error: `installed candidate yaml not found: ${target}` };
    const backup = `${target}.pre-${propId}.bak`;
    try { copyFileSync(target, backup); } catch (err: any) { return { ok: false, error: `backup failed: ${err.message}` }; }
    try {
      const data = readYaml(target) || {};
      data.status = 'retired';
      data.retired_at = nowIso();
      data.retired_via_proposal = propId;
      writeYaml(target, data);
      return { ok: true, backup_path: backup };
    } catch (err: any) {
      copyFileSync(backup, target);
      return { ok: false, error: err.message };
    }
  }

  // trial_concern — flag the trial as paused. No file change beyond the trial yaml.
  if (type === 'trial_concern') {
    const candId = p.candidate_id;
    if (!candId) return { ok: false, error: 'missing candidate_id' };
    const target = `${process.env.HOME || ''}/atlas/scout/trials/${candId}.yaml`;
    if (!existsSync(target)) return { ok: false, error: `trial yaml not found: ${target}` };
    const backup = `${target}.pre-${propId}.bak`;
    try { copyFileSync(target, backup); } catch (err: any) { return { ok: false, error: `backup failed: ${err.message}` }; }
    try {
      const data = readYaml(target) || {};
      data.status = 'paused';
      data.concerns = data.concerns || [];
      data.concerns.push({ ts: nowIso(), reason: p.rationale || 'operator-flagged via proposal' });
      writeYaml(target, data);
      return { ok: true, backup_path: backup };
    } catch (err: any) {
      copyFileSync(backup, target);
      return { ok: false, error: err.message };
    }
  }

  return { ok: false, error: `unknown proposal type: ${type}` };
}

// Apply a unified diff with `patch`. Returns { ok, backup_path, error }.
function applyDiff(targetFile: string, diff: string, propId: string): { ok: boolean; backup_path?: string; error?: string } {
  try {
    const resolvedTarget = targetFile.replace(/^~/, process.env.HOME || '');
    if (!existsSync(resolvedTarget)) {
      return { ok: false, error: `target file not found: ${resolvedTarget}` };
    }
    const backupPath = `${resolvedTarget}.pre-${propId}.bak`;
    copyFileSync(resolvedTarget, backupPath);
    // Use `patch` — most portable on macOS. -p1 mirrors git's a/ b/ prefix.
    // Some diffs may not include a/ b/ prefixes; fall back to -p0.
    const tryPatch = (p: string) => spawnSync(
      'patch',
      ['-p', p, '--silent', '--forward', resolvedTarget],
      { input: diff, encoding: 'utf8' }
    );
    let res = tryPatch('1');
    if (res.status !== 0) {
      // restore + try p0
      copyFileSync(backupPath, resolvedTarget);
      res = tryPatch('0');
    }
    if (res.status !== 0) {
      copyFileSync(backupPath, resolvedTarget);
      return { ok: false, error: `patch failed: ${(res.stderr || res.stdout || '').slice(0, 240)}` };
    }
    return { ok: true, backup_path: backupPath };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

export function approveProposal(id: string, approver: string, surface: string): { ok: boolean; message: string; applied_path?: string } {
  const found = loadProposal(id);
  if (!found) return { ok: false, message: `proposal ${id} not found` };
  if (found.status !== 'pending' && found.status !== 'queued' && found.status !== 'deferred') {
    return { ok: false, message: `proposal ${found.data.id} already in state '${found.status}'` };
  }
  const p = found.data;
  const propId = p.id || basename(found.path).replace(/\.yaml$/, '');

  // Human-only types — refuse
  if (HUMAN_ONLY_TYPES.has(p.type || '')) {
    appendAudit({
      ts: nowIso(), id: actId(),
      division: p.proposer_division || 'atlas-meta',
      agent: p.proposer_agent || 'producer',
      action: 'proposal_approval_refused',
      target: propId,
      summary: `Approval refused: type=${p.type} requires operator-only review (not via ${surface})`,
      autonomy: 'restricted',
      outcome: 'blocked',
      approver,
      correlation_id: propId,
    });
    return { ok: false, message: `proposal type "${p.type}" is operator-only; edit in a Claude Code session in ~/atlas` };
  }

  // Self-elevation guard
  const elev = isSelfElevation(p);
  if (elev.blocked) {
    appendAudit({
      ts: nowIso(), id: actId(),
      division: p.proposer_division || 'atlas-meta',
      agent: p.proposer_agent || 'producer',
      action: 'proposal_approval_refused',
      target: propId,
      summary: `Self-elevation guard tripped: ${elev.reason}`,
      autonomy: 'restricted',
      outcome: 'blocked',
      approver,
      correlation_id: propId,
    });
    return { ok: false, message: `self-elevation guard: ${elev.reason}` };
  }

  // Apply
  if (!APPLIED_TYPES_LAYER_5A.has(p.type || '')) {
    appendAudit({
      ts: nowIso(), id: actId(),
      division: p.proposer_division || 'atlas-meta',
      agent: p.proposer_agent || 'producer',
      action: 'proposal_approval_deferred_layer',
      target: propId,
      summary: `Approval recorded but apply for type ${p.type} lands in Layer 5b`,
      autonomy: 'bold',
      outcome: 'queued',
      approver,
      correlation_id: propId,
    });
    return { ok: false, message: `approval logged, but apply for type "${p.type}" is implemented in Layer 5b` };
  }

  // Dispatch on type — different apply paths per proposal kind.
  const result = applyByType(p, propId);
  if (!result.ok) {
    appendAudit({
      ts: nowIso(), id: actId(),
      division: p.proposer_division || 'atlas-meta',
      agent: p.proposer_agent || 'producer',
      action: 'proposal_apply_failed',
      target: propId,
      summary: `Apply failed: ${result.error}`,
      autonomy: 'bold',
      outcome: 'blocked',
      approver,
      correlation_id: propId,
    });
    return { ok: false, message: `apply failed: ${result.error}` };
  }

  // Move to applied/, write applied yaml with audit fields
  mkdirSync(APPLIED_DIR, { recursive: true });
  const appliedYaml = {
    ...p,
    id: propId,
    approved_by: approver,
    approved_via: surface,
    approved_at: nowIso(),
    applied_at: nowIso(),
    backup_path: result.backup_path,
    status: 'applied',
  };
  const appliedPath = join(APPLIED_DIR, `${propId}.yaml`);
  writeYaml(appliedPath, appliedYaml);

  // Remove source file (only if it was in pending/queued/deferred; applied dups are skipped)
  try {
    if (found.status !== 'applied' && existsSync(found.path) && found.path !== appliedPath) {
      const { unlinkSync } = require('fs');
      unlinkSync(found.path);
    }
  } catch {}

  const targetDesc = p.target_file
    || (p.type === 'lessons_addition' ? '~/atlas/memory/lessons.md'
      : p.type === 'feature_proposal' ? `~/atlas/divisions/${p.proposer_division}/missions.yaml`
      : p.type === 'scout_retirement' ? `~/atlas/scout/installed/${p.candidate_id}.yaml`
      : p.type === 'trial_concern' ? `~/atlas/scout/trials/${p.candidate_id}.yaml`
      : '(no target)');

  appendAudit({
    ts: nowIso(), id: actId(),
    division: p.proposer_division || 'atlas-meta',
    agent: p.proposer_agent || 'producer',
    action: 'proposal_applied',
    target: propId,
    summary: `Applied ${p.type} to ${targetDesc} (backup: ${result.backup_path || 'none'})`,
    autonomy: 'bold',
    outcome: 'executed',
    approver,
    correlation_id: propId,
  });

  // architecture_change proposals trigger a white-paper regenerate so the
  // public spec stays in sync with whatever just changed.
  if (p.type === 'architecture_change') {
    try { regenerateWhitepaper(`architecture_change:${propId}`); } catch {}
  }

  return { ok: true, message: `applied ${propId} → ${targetDesc}`, applied_path: appliedPath };
}

export function rejectProposal(id: string, approver: string, surface: string, note?: string): { ok: boolean; message: string } {
  const found = loadProposal(id);
  if (!found) return { ok: false, message: `proposal ${id} not found` };
  if (found.status === 'applied') return { ok: false, message: 'already applied; use rollback' };
  const p = found.data;
  const propId = p.id || basename(found.path).replace(/\.yaml$/, '');

  mkdirSync(REJECTED_DIR, { recursive: true });
  const rejected = {
    ...p,
    id: propId,
    rejected_by: approver,
    rejected_via: surface,
    rejected_at: nowIso(),
    rejection_note: note || '',
    status: 'rejected',
  };
  const dest = join(REJECTED_DIR, `${propId}.yaml`);
  writeYaml(dest, rejected);
  try {
    if (existsSync(found.path) && found.path !== dest) {
      const { unlinkSync } = require('fs');
      unlinkSync(found.path);
    }
  } catch {}

  appendAudit({
    ts: nowIso(), id: actId(),
    division: p.proposer_division || 'atlas-meta',
    agent: p.proposer_agent || 'producer',
    action: 'proposal_rejected',
    target: propId,
    summary: `Rejected: ${note || '(no note)'}`,
    autonomy: 'bold',
    outcome: 'rejected',
    approver,
    correlation_id: propId,
  });

  return { ok: true, message: `rejected ${propId}` };
}

export function deferProposal(id: string, approver: string, surface: string): { ok: boolean; message: string } {
  const found = loadProposal(id);
  if (!found) return { ok: false, message: `proposal ${id} not found` };
  if (found.status === 'applied' || found.status === 'rejected') {
    return { ok: false, message: `cannot defer a proposal already in state '${found.status}'` };
  }
  const propId = found.data.id || basename(found.path).replace(/\.yaml$/, '');
  // Mark deferred in-place (no move).
  const updated = { ...found.data, deferred_by: approver, deferred_via: surface, deferred_at: nowIso(), status: 'deferred' };
  writeYaml(found.path, updated);
  appendAudit({
    ts: nowIso(), id: actId(),
    division: found.data.proposer_division || 'atlas-meta',
    agent: found.data.proposer_agent || 'producer',
    action: 'proposal_deferred',
    target: propId,
    summary: `Deferred via ${surface}`,
    autonomy: 'bold',
    outcome: 'queued',
    approver,
    correlation_id: propId,
  });
  return { ok: true, message: `deferred ${propId}` };
}

export function rollbackProposal(id: string, approver: string, surface: string): { ok: boolean; message: string } {
  const found = loadProposal(id);
  if (!found) return { ok: false, message: `proposal ${id} not found` };
  if (found.status !== 'applied') return { ok: false, message: 'only applied proposals can be rolled back' };
  const p = found.data;
  const propId = p.id || basename(found.path).replace(/\.yaml$/, '');
  const backup = p.backup_path;
  if (!backup || !existsSync(backup)) {
    return { ok: false, message: `backup not found at ${backup}` };
  }
  // Infer the target file from the proposal type when target_file isn't set
  // (lessons_addition, feature_proposal, scout_retirement, trial_concern).
  let target = (p.target_file || '').replace(/^~/, process.env.HOME || '');
  if (!target) {
    if (p.type === 'lessons_addition')   target = `${process.env.HOME}/atlas/memory/lessons.md`;
    else if (p.type === 'feature_proposal') target = `${process.env.HOME}/atlas/divisions/${p.proposer_division}/missions.yaml`;
    else if (p.type === 'scout_retirement') target = `${process.env.HOME}/atlas/scout/installed/${p.candidate_id}.yaml`;
    else if (p.type === 'trial_concern')    target = `${process.env.HOME}/atlas/scout/trials/${p.candidate_id}.yaml`;
  }
  if (!target) return { ok: false, message: `cannot infer rollback target for type ${p.type}` };
  try {
    copyFileSync(backup, target);
    appendAudit({
      ts: nowIso(), id: actId(),
      division: p.proposer_division || 'atlas-meta',
      agent: p.proposer_agent || 'producer',
      action: 'proposal_rolled_back',
      target: propId,
      summary: `Rolled back ${target} from ${backup}`,
      autonomy: 'bold',
      outcome: 'executed',
      approver,
      correlation_id: propId,
    });
    return { ok: true, message: `rolled back ${propId} → ${target}` };
  } catch (err: any) {
    return { ok: false, message: `rollback failed: ${err.message}` };
  }
}

// ----- edit (Layer 5b verb) -----------------------------------------------
//
// Operator edits a queued/pending/deferred proposal before approving. Two-step
// flow from Telegram: `edit prop_xxx` → bot replies with current YAML →
// operator's next message is treated as the new YAML body → POSTed here.
// Self-elevation re-check runs on the edited content: Atlas's proposal
// pipeline never applies elevation types, even when operator-edited.
//
// Id is preserved (operator can't rename the proposal via edit). Original
// file is backed up to ~/atlas/proposals/edits/<id>-<ts>.yaml.bak before
// overwrite. edit_history is appended.

export function editProposal(
  id: string,
  newYamlText: string,
  approver: string,
  surface: string,
): { ok: boolean; message: string; edited_path?: string } {
  const found = loadProposal(id);
  if (!found) return { ok: false, message: `proposal ${id} not found` };
  if (found.status === 'applied' || found.status === 'rejected') {
    return { ok: false, message: `cannot edit a proposal in state '${found.status}'` };
  }

  // Parse the edited YAML via uv+pyyaml shell-out (same path as readYaml).
  let parsed: ProposalYaml;
  try {
    const result = spawnSync(
      UV_BIN,
      ['run', '--quiet', '--with', 'pyyaml', 'python3', '-c',
       'import sys, json, yaml; print(json.dumps(yaml.safe_load(sys.stdin) or {}))'],
      { input: newYamlText, encoding: 'utf8' },
    );
    if (result.status !== 0) {
      return { ok: false, message: `invalid YAML: ${(result.stderr || '').trim().slice(0, 200)}` };
    }
    parsed = JSON.parse(result.stdout);
  } catch (err: any) {
    return { ok: false, message: `YAML parse failed: ${err.message}` };
  }
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, message: 'YAML did not parse to an object' };
  }

  const propId = found.data.id || basename(found.path).replace(/\.yaml$/, '');
  parsed.id = propId;                    // preserve identity

  // Re-run self-elevation guard on the edited content.
  const elev = isSelfElevation(parsed);
  if (elev.blocked) {
    return { ok: false, message: `edit rejected: ${elev.reason}` };
  }

  // Backup original.
  const editsDir = join(PROPOSALS_DIR, 'edits');
  mkdirSync(editsDir, { recursive: true });
  const stamp = nowIso().replace(/:/g, '-');
  const backup = join(editsDir, `${propId}-${stamp}.yaml.bak`);
  try { copyFileSync(found.path, backup); } catch {}

  // Stamp edit metadata, preserve history.
  parsed.edited_by = approver;
  parsed.edited_via = surface;
  parsed.edited_at = nowIso();
  const prior = Array.isArray(parsed.edit_history) ? parsed.edit_history : [];
  parsed.edit_history = [...prior, { at: nowIso(), by: approver, via: surface, backup }];

  writeYaml(found.path, parsed);

  appendAudit({
    ts: nowIso(), id: actId(),
    division: parsed.proposer_division || 'atlas-meta',
    agent: parsed.proposer_agent || 'producer',
    action: 'proposal_edited',
    target: propId,
    summary: `Edited via ${surface}; backup: ${backup}`,
    autonomy: 'bold',
    outcome: 'executed',
    approver,
    correlation_id: propId,
  });

  return { ok: true, message: `edited ${propId}`, edited_path: found.path };
}
