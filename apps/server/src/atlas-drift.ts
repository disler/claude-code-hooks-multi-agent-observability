// ~/atlas/observability/apps/server/src/atlas-drift.ts
//
// Layer 5b — drift detection. Weekly scan of audit + proposal state to surface
// any of the four trigger conditions (locked decision 11):
//   1. 3+ rolled-back proposals in a 7d window.
//   2. Any autonomy escalation (cautious → bold, etc.).
//   3. Any proposal of type hook_patch (operator-only by design;
//      its appearance alone is a drift signal — Atlas shouldn't be drafting these).
//   4. Any change to ~/atlas/divisions/atlas-meta/agents/*.md
//      (load-bearing fallbacks for every division per Layer 1).
//
// Output: ~/atlas/audit/drift-{YYYY-WW}.md — one-paragraph summary + the
// triggered signals + audit entry refs.

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, appendFileSync } from 'fs';
import { join } from 'path';

const ATLAS_HOME = '/Users/hrmacnair/atlas';
const AUDIT_DIR = join(ATLAS_HOME, 'audit');
const PROPOSALS_DIR = join(ATLAS_HOME, 'proposals');

type AuditEntry = {
  ts: string;
  id: string;
  division?: string;
  agent?: string;
  action?: string;
  target?: string;
  summary?: string;
  outcome?: string;
  approver?: string | null;
  correlation_id?: string | null;
};

type DriftSignal = {
  trigger: 'rollback_burst' | 'autonomy_escalation' | 'hook_patch_attempt' | 'meta_personality_change';
  count: number;
  refs: string[];   // audit ids / proposal ids
  detail: string;
};

type DriftReport = {
  week: string;          // YYYY-WW
  from: string;          // ISO
  to: string;            // ISO
  signals: DriftSignal[];
  any_triggered: boolean;
  rolled_back: number;
  total_applied: number;
  total_rejected: number;
  summary: string;
  written_to: string;
};

function nowIso(): string { return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'); }

function weekKey(d: Date): string {
  // ISO week key: YYYY-WW
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (target.getUTCDay() + 6) % 7;       // Mon=0
  target.setUTCDate(target.getUTCDate() - dayNum + 3);
  const firstThursday = target.valueOf();
  target.setUTCMonth(0, 1);
  if (target.getUTCDay() !== 4) target.setUTCMonth(0, 1 + ((4 - target.getUTCDay()) + 7) % 7);
  const week = 1 + Math.ceil((firstThursday - target.valueOf()) / 604_800_000);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function readAuditWindow(fromMs: number, toMs: number): AuditEntry[] {
  const out: AuditEntry[] = [];
  if (!existsSync(AUDIT_DIR)) return out;
  // Walk the relevant monthly files. A 7-day window can span at most 2 months.
  const monthOf = (t: number) => new Date(t).toISOString().slice(0, 7);
  const months = new Set([monthOf(fromMs), monthOf(toMs)]);
  for (const m of months) {
    const file = join(AUDIT_DIR, `${m}.log`);
    if (!existsSync(file)) continue;
    const lines = readFileSync(file, 'utf8').split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const e: AuditEntry = JSON.parse(line);
        const t = Date.parse(e.ts);
        if (Number.isFinite(t) && t >= fromMs && t <= toMs) out.push(e);
      } catch {}
    }
  }
  return out;
}

function scanProposalsForHookPatches(): { refs: string[]; count: number } {
  // Walk pending + queued + rejected + applied — any hook_patch surface counts.
  const dirs = ['', 'queued', 'applied', 'rejected'];
  const refs: string[] = [];
  for (const sub of dirs) {
    const d = sub ? join(PROPOSALS_DIR, sub) : PROPOSALS_DIR;
    if (!existsSync(d)) continue;
    let files: string[] = [];
    try { files = readdirSync(d); } catch { continue; }
    for (const f of files) {
      if (!f.endsWith('.yaml')) continue;
      const path = join(d, f);
      try {
        const txt = readFileSync(path, 'utf8');
        if (/^type:\s*hook_patch\b/m.test(txt)) refs.push(f.replace(/\.yaml$/, ''));
      } catch {}
    }
  }
  return { refs, count: refs.length };
}

// ----- public API ---------------------------------------------------------

export function analyzeDrift(daysBack = 7): DriftReport {
  const to = Date.now();
  const from = to - daysBack * 86_400_000;
  const entries = readAuditWindow(from, to);

  const signals: DriftSignal[] = [];

  // Signal 1: rolled-back proposals.
  const rolledBack = entries.filter(e => e.action === 'proposal_rolled_back');
  if (rolledBack.length >= 3) {
    signals.push({
      trigger: 'rollback_burst',
      count: rolledBack.length,
      refs: rolledBack.map(e => e.id),
      detail: `${rolledBack.length} rollbacks in the last ${daysBack} days`,
    });
  }

  // Signal 2: any autonomy escalation event.
  // Detected via proposal_applied for type=autonomy_upgrade (would only land
  // if operator manually approved + bypassed the self-elevation guard) OR
  // any audit entry whose summary mentions "autonomy" + "→ bold".
  const escalations = entries.filter(e =>
    (e.action === 'proposal_applied' && /autonomy/i.test(e.summary || '')) ||
    /(cautious|restricted)\s*[→\-]>\s*bold/i.test(e.summary || ''));
  if (escalations.length > 0) {
    signals.push({
      trigger: 'autonomy_escalation',
      count: escalations.length,
      refs: escalations.map(e => e.id),
      detail: `${escalations.length} autonomy escalation(s) detected in audit`,
    });
  }

  // Signal 3: any hook_patch proposal in any state.
  const hp = scanProposalsForHookPatches();
  if (hp.count > 0) {
    signals.push({
      trigger: 'hook_patch_attempt',
      count: hp.count,
      refs: hp.refs,
      detail: `${hp.count} hook_patch proposal(s) on disk (pending/applied/rejected). Hooks are operator-only — any draft is a drift signal.`,
    });
  }

  // Signal 4: any change to atlas-meta personality files.
  const metaPersonalityChange = entries.filter(e =>
    /\/divisions\/atlas-meta\/agents\/[\w-]+\.md/.test(e.target || '') ||
    /atlas-meta\/agents/.test(e.summary || ''));
  if (metaPersonalityChange.length > 0) {
    signals.push({
      trigger: 'meta_personality_change',
      count: metaPersonalityChange.length,
      refs: metaPersonalityChange.map(e => e.id),
      detail: `atlas-meta personality file touched ${metaPersonalityChange.length}x — these are load-bearing fallbacks for every division.`,
    });
  }

  const totalApplied = entries.filter(e => e.action === 'proposal_applied').length;
  const totalRejected = entries.filter(e => e.action === 'proposal_rejected').length;

  const anyTriggered = signals.length > 0;
  const week = weekKey(new Date());

  // Compose a brief paragraph summary.
  let summary = `Drift scan ${week} (${new Date(from).toISOString().slice(0,10)} → ${new Date(to).toISOString().slice(0,10)}). `;
  summary += `Applied ${totalApplied} proposals · Rejected ${totalRejected} · Rolled back ${rolledBack.length}. `;
  if (anyTriggered) {
    summary += `**${signals.length} drift trigger(s) FIRED**: ${signals.map(s => s.trigger).join(', ')}. Operator-only weekly review required per locked decision 11.`;
  } else {
    summary += `No drift triggers fired this week. System behavior within expected envelope.`;
  }

  const writtenTo = join(AUDIT_DIR, `drift-${week}.md`);
  const md = renderDriftMarkdown({ week, from: new Date(from).toISOString(), to: new Date(to).toISOString(), signals, any_triggered: anyTriggered, rolled_back: rolledBack.length, total_applied: totalApplied, total_rejected: totalRejected, summary, written_to: writtenTo });
  try {
    mkdirSync(AUDIT_DIR, { recursive: true });
    writeFileSync(writtenTo, md);
  } catch {}

  // Audit the drift scan itself.
  try {
    const month = new Date().toISOString().slice(0, 7);
    appendFileSync(join(AUDIT_DIR, `${month}.log`), JSON.stringify({
      ts: nowIso(),
      id: `drift_${week}`,
      division: 'atlas-meta',
      agent: 'producer',
      action: 'drift_check',
      target: writtenTo,
      summary: anyTriggered ? `Drift triggered: ${signals.length} signal(s) [${signals.map(s => s.trigger).join(',')}]` : 'Drift scan clean',
      autonomy: 'bold',
      outcome: anyTriggered ? 'blocked' : 'executed',  // triggered = needs operator review
      approver: null,
      correlation_id: `drift_${week}`,
    }) + '\n');
  } catch {}

  return { week, from: new Date(from).toISOString(), to: new Date(to).toISOString(), signals, any_triggered: anyTriggered, rolled_back: rolledBack.length, total_applied: totalApplied, total_rejected: totalRejected, summary, written_to: writtenTo };
}

function renderDriftMarkdown(r: DriftReport): string {
  let md = `# Atlas drift scan · ${r.week}\n\n`;
  md += `_${r.from} → ${r.to}_\n\n`;
  md += `${r.summary}\n\n`;
  md += `## Counts\n- Applied proposals: ${r.total_applied}\n- Rejected proposals: ${r.total_rejected}\n- Rolled-back proposals: ${r.rolled_back}\n\n`;
  if (r.signals.length === 0) {
    md += `## Signals\n_None fired this week._\n`;
    return md;
  }
  md += `## Triggered signals (${r.signals.length})\n\n`;
  for (const s of r.signals) {
    md += `### \`${s.trigger}\` — count ${s.count}\n${s.detail}\n\nRefs: ${s.refs.slice(0, 10).map(r => '`' + r + '`').join(', ')}${s.refs.length > 10 ? ` _(+${s.refs.length - 10} more)_` : ''}\n\n`;
  }
  md += `\n## Next step\nMandatory operator-only weekly review per locked decision 11. Open the relevant audit entries, rollback or investigate per the trigger type. Hook patches must be applied manually in a Claude Code session in \`~/atlas\`.\n`;
  return md;
}

export function getLatestDriftReport(): { week: string; markdown: string; path: string } | null {
  if (!existsSync(AUDIT_DIR)) return null;
  const files = readdirSync(AUDIT_DIR).filter(f => /^drift-\d{4}-W\d{2}\.md$/.test(f));
  if (files.length === 0) return null;
  files.sort();
  const latest = files[files.length - 1];
  const path = join(AUDIT_DIR, latest);
  return {
    week: latest.replace(/^drift-/, '').replace(/\.md$/, ''),
    markdown: readFileSync(path, 'utf8'),
    path,
  };
}
