// ~/atlas/observability/apps/server/src/atlas-whitepaper.ts
//
// White paper auto-publish. Per the Phase 10 spec, both the long-form spec
// (`atlas-spec.html`) and the quick reference (`atlas-quick-reference.html`)
// are operator-facing reference documents that get regenerated whenever
// the underlying source files change.
//
// Sources of truth:
//   - ~/atlas/memory/phase10-architecture.md
//   - ~/atlas/memory/decisions.md
//   - state of ~/atlas/divisions/*
//   - state of ~/atlas/.claude/agents/*
//   - state of ~/atlas/.claude/skills/*
//
// Output URLs (briefs-server serves ~/atlas/briefs/archive/ on port 5174):
//   - http://100.105.173.78:5174/atlas/spec.html
//   - http://100.105.173.78:5174/atlas/quick-reference.html
//
// Triggers:
//   - any approved proposal of type `architecture_change` → regenerate.
//   - weekly job `weekly_doc_sync` Sunday 22:00 → regenerate regardless (drift catch).

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, appendFileSync } from 'fs';
import { join } from 'path';
import crypto from 'crypto';

const ATLAS_HOME = '/Users/hrmacnair/atlas';
const SPEC_PATH = join(ATLAS_HOME, 'memory', 'phase10-architecture.md');
const DECISIONS_PATH = join(ATLAS_HOME, 'memory', 'decisions.md');
const DIVISIONS_DIR = join(ATLAS_HOME, 'divisions');
const SKILLS_DIR = join(ATLAS_HOME, '.claude', 'skills');
const OUT_DIR = join(ATLAS_HOME, 'briefs', 'archive', 'atlas');
const SPEC_OUT = join(OUT_DIR, 'spec.html');
const QUICK_OUT = join(OUT_DIR, 'quick-reference.html');
const META_OUT = join(OUT_DIR, '.meta.json');
const AUDIT_DIR = join(ATLAS_HOME, 'audit');

function nowIso(): string { return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'); }
function actId(): string { return `act_${Math.floor(Date.now() / 1000)}_${crypto.randomBytes(3).toString('hex')}`; }
import { bumpDivisionState } from './atlas-division-state';

function appendAudit(entry: any): void {
  try {
    mkdirSync(AUDIT_DIR, { recursive: true });
    const month = new Date().toISOString().slice(0, 7);
    appendFileSync(join(AUDIT_DIR, `${month}.log`), JSON.stringify(entry) + '\n');
  } catch {}
  try {
    if (entry && entry.division) {
      bumpDivisionState(entry.division, entry.id || null, entry.ts || '');
    }
  } catch {}
}

// ----- minimal markdown → HTML ---------------------------------------------
// Subset adequate for phase10-architecture.md + decisions.md: headings,
// paragraphs, lists, code fences, inline code, bold, italic, links, tables.

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderInline(s: string): string {
  s = escapeHtml(s);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return s;
}

function mdToHtml(md: string): string {
  const lines = md.split('\n');
  const out: string[] = [];
  let inCode = false;
  let codeLang = '';
  let codeBuf: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let inTable = false;
  let tableRows: string[][] = [];
  let paraBuf: string[] = [];

  function flushPara() {
    if (paraBuf.length === 0) return;
    out.push(`<p>${renderInline(paraBuf.join(' '))}</p>`);
    paraBuf = [];
  }
  function closeList() {
    if (listType) { out.push(`</${listType}>`); listType = null; }
  }
  function closeTable() {
    if (!inTable || tableRows.length === 0) { inTable = false; tableRows = []; return; }
    const header = tableRows[0];
    const body = tableRows.slice(2); // skip the separator row
    let h = '<table><thead><tr>';
    for (const c of header) h += `<th>${renderInline(c.trim())}</th>`;
    h += '</tr></thead><tbody>';
    for (const r of body) {
      h += '<tr>';
      for (const c of r) h += `<td>${renderInline(c.trim())}</td>`;
      h += '</tr>';
    }
    h += '</tbody></table>';
    out.push(h);
    inTable = false; tableRows = [];
  }

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');

    if (inCode) {
      if (/^```/.test(line)) {
        out.push(`<pre><code class="lang-${codeLang}">${escapeHtml(codeBuf.join('\n'))}</code></pre>`);
        codeBuf = []; inCode = false; codeLang = '';
      } else {
        codeBuf.push(raw);
      }
      continue;
    }

    if (/^```/.test(line)) {
      flushPara(); closeList(); closeTable();
      inCode = true;
      codeLang = (line.match(/^```(\w+)?/) || [, ''])[1] || '';
      continue;
    }

    // table row?
    if (/^\s*\|.+\|\s*$/.test(line)) {
      flushPara(); closeList();
      const cells = line.trim().replace(/^\||\|$/g, '').split('|');
      tableRows.push(cells);
      inTable = true;
      continue;
    } else if (inTable) {
      closeTable();
    }

    // heading
    const h = line.match(/^(#{1,4})\s+(.+)$/);
    if (h) {
      flushPara(); closeList();
      const level = h[1].length;
      out.push(`<h${level}>${renderInline(h[2])}</h${level}>`);
      continue;
    }

    // hr
    if (/^---+\s*$/.test(line)) {
      flushPara(); closeList();
      out.push('<hr/>');
      continue;
    }

    // list
    const ul = line.match(/^(\s*)[-*]\s+(.+)$/);
    const ol = line.match(/^(\s*)\d+\.\s+(.+)$/);
    if (ul || ol) {
      flushPara();
      const want: 'ul' | 'ol' = ul ? 'ul' : 'ol';
      if (listType !== want) { closeList(); out.push(`<${want}>`); listType = want; }
      out.push(`<li>${renderInline((ul || ol)![2])}</li>`);
      continue;
    } else if (listType) {
      closeList();
    }

    // blank
    if (!line.trim()) { flushPara(); continue; }

    paraBuf.push(line);
  }
  flushPara(); closeList(); closeTable();
  if (inCode) out.push(`<pre><code class="lang-${codeLang}">${escapeHtml(codeBuf.join('\n'))}</code></pre>`);
  return out.join('\n');
}

// ----- snapshot helpers -----------------------------------------------------

function divisionsSummary(): string {
  if (!existsSync(DIVISIONS_DIR)) return '<p><em>No divisions scaffolded yet.</em></p>';
  let html = '<table><thead><tr><th>Division</th><th>Owner agent</th><th>Autonomy</th><th>Agents</th></tr></thead><tbody>';
  for (const d of readdirSync(DIVISIONS_DIR, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const yaml = join(DIVISIONS_DIR, d.name, 'division.yaml');
    if (!existsSync(yaml)) continue;
    const text = readFileSync(yaml, 'utf8');
    const owner = (text.match(/^owner_agent:\s*(.+)$/m) || [])[1] || '?';
    const autonomy = (text.match(/^on_call:\s*(.+)$/m) || [])[1] || '?';
    let agents: string[] = [];
    try {
      agents = readdirSync(join(DIVISIONS_DIR, d.name, 'agents')).filter(f => f.endsWith('.md')).map(f => f.replace(/\.md$/, ''));
    } catch {}
    html += `<tr><td><code>${d.name}</code></td><td>${escapeHtml(owner)}</td><td>${escapeHtml(autonomy)}</td><td>${agents.map(a => `<code>${a}</code>`).join(', ')}</td></tr>`;
  }
  html += '</tbody></table>';
  return html;
}

function skillsSummary(): string {
  if (!existsSync(SKILLS_DIR)) return '<p><em>No skills directory.</em></p>';
  const skills: string[] = [];
  try {
    for (const d of readdirSync(SKILLS_DIR, { withFileTypes: true })) {
      if (d.isDirectory()) skills.push(d.name);
    }
  } catch {}
  if (skills.length === 0) return '<p><em>No skills found.</em></p>';
  return `<ul>${skills.map(s => `<li><code>${escapeHtml(s)}</code></li>`).join('')}</ul>`;
}

function recentDecisionsHtml(maxBlocks = 6): string {
  if (!existsSync(DECISIONS_PATH)) return '';
  const md = readFileSync(DECISIONS_PATH, 'utf8');
  const sections = md.split(/^## /m).filter(Boolean).slice(-maxBlocks).reverse();
  let html = '';
  for (const s of sections) {
    html += '<section class="decision-block"><h2>' + renderInline(s.split('\n')[0]) + '</h2>';
    const body = s.split('\n').slice(1).join('\n');
    html += mdToHtml(body) + '</section>';
  }
  return html;
}

// ----- templates -----------------------------------------------------------

const COMMON_CSS = `
:root { --bg:#fff; --text:#1d1d1f; --soft:#6e6e73; --muted:#86868b; --rule:#d2d2d7; --accent:#007AFF; --code-bg:#f5f5f7; }
@media (prefers-color-scheme: dark) {
  :root { --bg:#0a0a0a; --text:#f5f5f7; --soft:#aeaeb2; --muted:#6e6e73; --rule:#2c2c2e; --accent:#0a84ff; --code-bg:#1a1a1c; }
}
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--text); font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",sans-serif; line-height:1.55; }
main { max-width: 820px; margin: 0 auto; padding: 48px 24px 96px; }
h1 { font-size:32px; margin:0 0 8px; letter-spacing:-0.02em; }
h2 { font-size:22px; margin:32px 0 12px; letter-spacing:-0.01em; border-bottom:1px solid var(--rule); padding-bottom:6px; }
h3 { font-size:17px; margin:24px 0 8px; }
h4 { font-size:14px; margin:18px 0 6px; color:var(--soft); text-transform:uppercase; letter-spacing:0.06em; }
p { margin: 10px 0; }
ul, ol { margin: 10px 0; padding-left: 24px; }
li { margin: 4px 0; }
code { background: var(--code-bg); padding: 1px 6px; border-radius: 4px; font-family: ui-monospace,SFMono-Regular,Menlo,monospace; font-size: 13px; }
pre { background: var(--code-bg); padding: 12px 14px; border-radius: 8px; overflow-x: auto; font-size: 12.5px; }
pre code { background: transparent; padding: 0; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
hr { border: 0; border-top: 1px solid var(--rule); margin: 28px 0; }
table { width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 13.5px; }
th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--rule); vertical-align: top; }
th { font-weight: 600; color: var(--soft); }
.eyebrow { font-size: 12px; color: var(--soft); letter-spacing: 0.06em; text-transform: uppercase; }
.footer { margin-top: 64px; padding-top: 20px; border-top: 1px solid var(--rule); font-size: 12px; color: var(--muted); }
section.decision-block h2 { font-size: 18px; }
`;

function renderSpec(): string {
  const archMd = existsSync(SPEC_PATH) ? readFileSync(SPEC_PATH, 'utf8') : '';
  const archHtml = mdToHtml(archMd);
  const generatedAt = new Date().toISOString();
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Atlas spec · phase 10</title>
<style>${COMMON_CSS}</style></head>
<body><main>
<div class="eyebrow">Atlas · architecture</div>
<h1>Phase 10 — Autonomous Workforce</h1>
<p><em>Generated ${generatedAt}. Source: <code>~/atlas/memory/phase10-architecture.md</code>. Regenerated on every <code>architecture_change</code> proposal apply + weekly Sunday 22:00.</em></p>
<hr/>
${archHtml}
<hr/>
<h2>Live state — divisions</h2>
${divisionsSummary()}
<h2>Live state — skills installed</h2>
${skillsSummary()}
<h2>Recent decisions (latest 6)</h2>
${recentDecisionsHtml(6)}
<div class="footer">Generated ${generatedAt} · regenerator: <code>atlas-whitepaper.ts</code> · briefs server: <code>http://100.105.173.78:5174/atlas/spec.html</code></div>
</main></body></html>`;
}

function renderQuickReference(): string {
  const generatedAt = new Date().toISOString();
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Atlas quick reference</title>
<style>${COMMON_CSS}</style></head>
<body><main>
<div class="eyebrow">Atlas · quick reference</div>
<h1>What this thing is</h1>
<p>Atlas is McNair's personal agentic OS. Listens through Telegram. Runs on a Mac. Builds and runs the businesses below it.</p>

<h2>Divisions</h2>
${divisionsSummary()}

<h2>Approval verbs (Telegram)</h2>
<table><thead><tr><th>Verb</th><th>Targets</th><th>Notes</th></tr></thead><tbody>
<tr><td><code>approve</code></td><td>proposal · today_item · scout_candidate</td><td>Aliases <code>✓ &lt;id&gt;</code></td></tr>
<tr><td><code>reject</code></td><td>proposal · today_item · scout_candidate</td><td>Aliases <code>✗ &lt;id&gt;</code>. Trailing text = note.</td></tr>
<tr><td><code>defer</code></td><td>any</td><td>Re-surfaces tomorrow.</td></tr>
<tr><td><code>rollback</code></td><td>applied proposal</td><td>Reverses the diff using the .bak file.</td></tr>
<tr><td><code>done</code></td><td>operator_added today item</td><td>Archives to <code>~/atlas/today/done/{date}.yaml</code> at midnight.</td></tr>
<tr><td><code>pin</code></td><td>today item</td><td>Forces to top of queue.</td></tr>
<tr><td><code>add: &lt;text&gt;</code></td><td>—</td><td>Operator-added free-text task. Urgent keywords auto-bump to yellow.</td></tr>
</tbody></table>

<h2>Slash commands</h2>
<ul>
<li><code>/spinup &lt;slug&gt;</code> — scaffold a new Next.js SaaS under <code>~/atlas/projects/&lt;slug&gt;</code>.</li>
<li><code>/spinup-division &lt;slug&gt;</code> — scaffold a new Atlas division. Refuses reserved slugs (<code>atlas-meta</code>, <code>margin</code>, <code>industry</code>, <code>trading</code>) and money-keyword slugs.</li>
<li><code>/spinup-trading-desk</code> — scaffolds the reserved trading division. Confirmation-gated, prints required safety-hook patches, broker-agnostic Alpaca-paper adapter.</li>
</ul>

<h2>Endpoints (dashboard server, localhost:4000)</h2>
<table><thead><tr><th>Path</th><th>What</th></tr></thead><tbody>
<tr><td><code>GET /api/atlas/today</code></td><td>Ranked queue + completed + (optional) deferred.</td></tr>
<tr><td><code>POST /api/atlas/today/add</code></td><td>Free-text operator task.</td></tr>
<tr><td><code>POST /api/atlas/today/:id/{approve|reject|defer|done|pin}</code></td><td>Today item action.</td></tr>
<tr><td><code>GET /api/atlas/today/digest</code></td><td>Telegram-format string.</td></tr>
<tr><td><code>POST /api/atlas/today/archive</code></td><td>Manual midnight-archive trigger.</td></tr>
<tr><td><code>GET /api/atlas/proposals</code></td><td>All proposals across pending / queued / applied / rejected.</td></tr>
<tr><td><code>POST /api/atlas/proposals/:id/{approve|reject|defer|rollback}</code></td><td>Proposal action.</td></tr>
<tr><td><code>GET /api/atlas/scout</code></td><td>Candidates + trials + sweep summaries.</td></tr>
<tr><td><code>POST /api/atlas/scout/:id/{install|decline|concern}</code></td><td>Scout action.</td></tr>
<tr><td><code>POST /api/atlas/scout/maintenance</code></td><td>Daily trial-period sweep.</td></tr>
<tr><td><code>GET /api/atlas/drift/latest</code></td><td>Latest weekly drift scan markdown.</td></tr>
<tr><td><code>POST /api/atlas/drift/run</code></td><td>Manual drift scan.</td></tr>
<tr><td><code>GET /api/atlas/whitepaper</code></td><td>Doc regeneration metadata + last-updated.</td></tr>
<tr><td><code>POST /api/atlas/whitepaper/regenerate</code></td><td>Force regenerate spec + quick-reference.</td></tr>
<tr><td><code>POST /api/atlas/events/inbound/{github|stripe|ntfy|manual}</code></td><td>Inbound webhooks.</td></tr>
<tr><td><code>POST /api/atlas/portability/backup-now</code></td><td>Trigger immediate GitHub + iCloud backup.</td></tr>
</tbody></table>

<h2>Scheduled jobs (cron)</h2>
<p>14 jobs across 3 divisions. atlas-meta runs the OS-level work; margin + industry run their daily product jobs.</p>
<ul>
<li><strong>atlas-meta</strong>: nightly_priorities (22:00), morning_telegram_digest (06:00), hourly_health_check (:00), weekly_router_review (Sun 06:00), weekly_lesson_sweep (Mon 07:00), weekly_scout_sweep (Sun 04:00), weekly_scout_retirement_review (Sun 05:00), daily_scout_trial_check (03:00), weekly_drift_check (Sun 06:30), archive_done (23:59).</li>
<li><strong>margin</strong>: daily_test_suite (05:00), weekly_competitor_brief (Thu 05:00).</li>
<li><strong>industry</strong>: daily_integration_health (05:30), daily_lead_sweep (06:00).</li>
</ul>

<h2>Safety hooks (6, all PreToolUse)</h2>
<ol>
<li><code>safety_check.py</code> — rm -rf, force-push to main, sudo, curl | bash patterns.</li>
<li><code>scope_guard.py</code> — write outside <code>~/atlas</code> + cwd.</li>
<li><code>secret_scanner.py</code> — Anthropic keys, GitHub tokens, AWS keys, Discord webhooks, etc.</li>
<li><code>autonomy_gate.py</code> — division-aware capability check (must_approve / hard_block).</li>
<li><code>memory_capture.py</code> — captures "decision:" / "lesson:" prompts to memory.</li>
<li><code>discord_notify.py</code> — Stop / Notification side-effects.</li>
</ol>
<p>Hooks are operator-only. <code>hook_patch</code> proposals are refused at the server layer; modifications must go through a Claude Code session in <code>~/atlas</code>.</p>

<div class="footer">Generated ${generatedAt} · <a href="spec.html">full spec →</a></div>
</main></body></html>`;
}

// ----- public API ---------------------------------------------------------

export function regenerateWhitepaper(trigger: string = 'manual'): { ok: boolean; spec_path: string; quick_path: string; generated_at: string } {
  mkdirSync(OUT_DIR, { recursive: true });
  const generated = nowIso();
  const spec = renderSpec();
  const quick = renderQuickReference();
  writeFileSync(SPEC_OUT, spec);
  writeFileSync(QUICK_OUT, quick);

  // Write meta for the /whitepaper endpoint
  const meta = {
    generated_at: generated,
    triggered_by: trigger,
    spec_size_bytes: Buffer.byteLength(spec, 'utf8'),
    quick_size_bytes: Buffer.byteLength(quick, 'utf8'),
    spec_url: 'http://100.105.173.78:5174/atlas/spec.html',
    quick_url: 'http://100.105.173.78:5174/atlas/quick-reference.html',
  };
  writeFileSync(META_OUT, JSON.stringify(meta, null, 2));

  appendAudit({
    ts: generated, id: actId(),
    division: 'atlas-meta', agent: 'producer',
    action: 'whitepaper_regenerated',
    target: SPEC_OUT,
    summary: `Regenerated spec.html (${meta.spec_size_bytes}B) + quick-reference.html (${meta.quick_size_bytes}B). Trigger: ${trigger}`,
    autonomy: 'bold', outcome: 'executed',
    approver: null,
    correlation_id: `wp_${generated}`,
  });

  return { ok: true, spec_path: SPEC_OUT, quick_path: QUICK_OUT, generated_at: generated };
}

export function whitepaperMeta(): any {
  if (!existsSync(META_OUT)) return { generated_at: null, spec_url: 'http://100.105.173.78:5174/atlas/spec.html', quick_url: 'http://100.105.173.78:5174/atlas/quick-reference.html' };
  try { return JSON.parse(readFileSync(META_OUT, 'utf8')); } catch { return { generated_at: null }; }
}
