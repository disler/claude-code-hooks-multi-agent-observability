// ~/atlas/observability/apps/server/src/atlas-views.ts
//
// Read-only data views feeding the dashboard cards added in the
// "12 features" pass. Each function reads disk state and returns a
// JSON-ready object. No mutation.

import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { spawnSync } from 'child_process';
import { join } from 'path';

const ATLAS_HOME = '/Users/hrmacnair/atlas';
const DIVISIONS_DIR = join(ATLAS_HOME, 'divisions');
const AUDIT_DIR = join(ATLAS_HOME, 'audit');
const ROUTING_LOG = join(ATLAS_HOME, 'memory', 'routing.log');
const UV_BIN = '/opt/homebrew/bin/uv';

function readYaml(path: string): any {
  try {
    if (!existsSync(path)) return null;
    const r = spawnSync(UV_BIN,
      ['run', '--quiet', '--with', 'pyyaml', 'python3', '-c',
       'import sys,json,yaml; d=yaml.safe_load(open(sys.argv[1])); print(json.dumps(d if d is not None else None, default=str))',
       path],
      { encoding: 'utf8' });
    if (r.status !== 0) return null;
    return JSON.parse(r.stdout);
  } catch { return null; }
}

// ----- missions across all divisions -------------------------------------

export type MissionSummary = {
  id: string;
  division: string;
  title: string;
  agent: string;
  origin: string;
  status: string;
  priority?: number;
  created?: string;
  branch?: string | null;
  pr?: string | null;
  related_audit_ids?: string[];
  rationale?: string;
  rough_effort?: string;
};

export function listMissions(): MissionSummary[] {
  const out: MissionSummary[] = [];
  if (!existsSync(DIVISIONS_DIR)) return out;
  for (const d of readdirSync(DIVISIONS_DIR, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const path = join(DIVISIONS_DIR, d.name, 'missions.yaml');
    const data = readYaml(path);
    if (!Array.isArray(data)) continue;
    for (const m of data) {
      if (!m || typeof m !== 'object') continue;
      out.push({
        id: m.id || '',
        division: d.name,
        title: m.title || '(no title)',
        agent: m.agent || 'unknown',
        origin: m.origin || 'unknown',
        status: m.status || 'queued',
        priority: m.priority,
        created: m.created,
        branch: m.branch ?? null,
        pr: m.pr ?? null,
        related_audit_ids: m.related_audit_ids,
        rationale: m.rationale,
        rough_effort: m.rough_effort,
      });
    }
  }
  // newest first
  out.sort((a, b) => (b.created || '') > (a.created || '') ? 1 : -1);
  return out;
}

// ----- per-division focus bundle -----------------------------------------

export function getDivisionDetail(slug: string): any | null {
  const dir = join(DIVISIONS_DIR, slug);
  if (!existsSync(dir)) return null;
  const division = readYaml(join(dir, 'division.yaml')) || {};
  const schedule = readYaml(join(dir, 'schedule.yaml')) || [];
  const missions = readYaml(join(dir, 'missions.yaml')) || [];
  let state: any = {};
  try { state = JSON.parse(readFileSync(join(dir, 'state.json'), 'utf8')); } catch {}
  const agents: Array<{ role: string; markdown: string }> = [];
  try {
    for (const f of readdirSync(join(dir, 'agents'))) {
      if (!f.endsWith('.md')) continue;
      try {
        agents.push({
          role: f.replace(/\.md$/, ''),
          markdown: readFileSync(join(dir, 'agents', f), 'utf8'),
        });
      } catch {}
    }
  } catch {}
  // Recent audit entries for this division (last 50)
  const audit: any[] = [];
  try {
    const month = new Date().toISOString().slice(0, 7);
    const auditFile = join(AUDIT_DIR, `${month}.log`);
    if (existsSync(auditFile)) {
      const lines = readFileSync(auditFile, 'utf8').split('\n').reverse();
      for (const l of lines) {
        if (!l.trim()) continue;
        try {
          const e = JSON.parse(l);
          if (e.division === slug) audit.push(e);
          if (audit.length >= 50) break;
        } catch {}
      }
    }
  } catch {}
  return { slug, division, schedule, missions, state, agents, audit };
}

// ----- routing corrections (for the auto-improver loop) -------------------

export type RoutingEntry = {
  timestamp: string;
  surface: string;
  message_preview: string;
  decision: any;
  correction?: string;
  attachments?: string[];
};

export function recentRoutingLog(days = 7, limit = 200): RoutingEntry[] {
  if (!existsSync(ROUTING_LOG)) return [];
  const cutoff = Date.now() - days * 86_400_000;
  const out: RoutingEntry[] = [];
  try {
    const lines = readFileSync(ROUTING_LOG, 'utf8').split('\n').reverse();
    for (const l of lines) {
      if (!l.trim()) continue;
      try {
        const e: RoutingEntry = JSON.parse(l);
        const t = Date.parse(e.timestamp);
        if (Number.isFinite(t) && t < cutoff) break;
        out.push(e);
        if (out.length >= limit) break;
      } catch {}
    }
  } catch {}
  return out;
}

export function recentCorrections(days = 14, limit = 50): RoutingEntry[] {
  return recentRoutingLog(days, 500).filter(e => !!e.correction).slice(0, limit);
}

// ----- audit search ------------------------------------------------------

export type AuditFilter = {
  division?: string;
  agent?: string;
  outcome?: string;
  action?: string;
  q?: string;       // free-text in summary/target
  from?: string;    // ISO
  to?: string;      // ISO
  limit?: number;
};

export function searchAudit(filter: AuditFilter): any[] {
  const out: any[] = [];
  if (!existsSync(AUDIT_DIR)) return out;
  const limit = Math.min(filter.limit || 200, 1000);
  const fromMs = filter.from ? Date.parse(filter.from) : 0;
  const toMs = filter.to ? Date.parse(filter.to) : Date.now() + 86_400_000;
  const q = (filter.q || '').toLowerCase();

  // Walk all log files newest first (sortable by YYYY-MM).
  let files: string[] = [];
  try { files = readdirSync(AUDIT_DIR).filter(f => /^\d{4}-\d{2}\.log$/.test(f)).sort().reverse(); }
  catch { return out; }

  outer: for (const f of files) {
    const path = join(AUDIT_DIR, f);
    let lines: string[] = [];
    try { lines = readFileSync(path, 'utf8').split('\n').reverse(); } catch { continue; }
    for (const l of lines) {
      if (!l.trim()) continue;
      try {
        const e = JSON.parse(l);
        const t = Date.parse(e.ts);
        if (Number.isFinite(t)) {
          if (t < fromMs) continue;
          if (t > toMs) continue;
        }
        if (filter.division && e.division !== filter.division) continue;
        if (filter.agent && e.agent !== filter.agent) continue;
        if (filter.outcome && e.outcome !== filter.outcome) continue;
        if (filter.action && !(e.action || '').includes(filter.action)) continue;
        if (q) {
          const blob = `${e.summary || ''} ${e.target || ''} ${e.action || ''}`.toLowerCase();
          if (!blob.includes(q)) continue;
        }
        out.push(e);
        if (out.length >= limit) break outer;
      } catch {}
    }
  }
  return out;
}

// ----- per-model spend (parse ~/.claude/projects/*/*.jsonl) ---------------

// Anthropic pricing per 1M tokens (approximate, ~Q1 2026).
// Cache_creation = 1.25× input. Cache_read = 0.10× input. Output unchanged.
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-4-7':         { input: 15.0, output: 75.0 },
  'claude-opus-4-6':         { input: 15.0, output: 75.0 },
  'claude-opus-4-1':         { input: 15.0, output: 75.0 },
  'claude-sonnet-4-6':       { input: 3.0,  output: 15.0 },
  'claude-sonnet-4-5':       { input: 3.0,  output: 15.0 },
  'claude-haiku-4-5':        { input: 1.0,  output: 5.0 },
  'gpt-5':                   { input: 1.25, output: 10.0 },
  'gpt-5.5':                 { input: 1.25, output: 10.0 },
  'gpt-5-mini':              { input: 0.25, output: 2.0 },
  'gemma':                   { input: 0,    output: 0 },
};
function normalizeModel(m: string): string {
  if (!m) return 'unknown';
  return m.replace(/-2\d{7}.*$/, '').replace(/^claude-/, 'claude-');
}
function estimatedCost(model: string, inTok: number, outTok: number, cacheCreate: number, cacheRead: number): number {
  const norm = normalizeModel(model);
  const p = PRICING[norm] || PRICING[norm.split('-').slice(0, 3).join('-')] || { input: 0, output: 0 };
  const cost =
    (inTok * p.input) +
    (cacheCreate * p.input * 1.25) +
    (cacheRead * p.input * 0.02) +
    (outTok * p.output);
  return cost / 1_000_000;
}

export function spendByModel(days = 14) {
  const home = process.env.HOME || '/Users/hrmacnair';
  const projectsRoot = join(home, '.claude', 'projects');
  const cutoff = Date.now() - days * 86_400_000;
  const byModel: Record<string, { calls: number; input_tok: number; output_tok: number; est_cost: number }> = {};
  const dailyByModel: Record<string, Record<string, number>> = {}; // date → model → calls

  if (!existsSync(projectsRoot)) return { by_model: {}, daily: [], days };

  let projDirs: string[] = [];
  try { projDirs = readdirSync(projectsRoot); } catch { return { by_model: {}, daily: [], days }; }

  for (const proj of projDirs) {
    const projPath = join(projectsRoot, proj);
    let files: string[] = [];
    try { files = readdirSync(projPath).filter(f => f.endsWith('.jsonl')); } catch { continue; }
    for (const f of files) {
      const filePath = join(projPath, f);
      let stat;
      try { stat = statSync(filePath); } catch { continue; }
      if (stat.mtimeMs < cutoff) continue;
      let text: string;
      try { text = readFileSync(filePath, 'utf8'); } catch { continue; }
      const lines = text.split('\n');
      for (const l of lines) {
        if (!l.trim()) continue;
        let entry: any;
        try { entry = JSON.parse(l); } catch { continue; }
        const ts = Date.parse(entry.timestamp || '');
        if (!Number.isFinite(ts) || ts < cutoff) continue;
        // Find model + usage. Anthropic sdk transcript shape:
        // { message: { model, usage: { input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens } } }
        const m = entry.message || entry;
        const model = (m?.model || entry?.model || '').toString();
        if (!model) continue;
        const usage = m?.usage || {};
        const inTok        = usage.input_tokens || 0;
        const cacheCreate  = usage.cache_creation_input_tokens || 0;
        const cacheRead    = usage.cache_read_input_tokens || 0;
        const outTok       = usage.output_tokens || 0;
        if (inTok === 0 && cacheCreate === 0 && cacheRead === 0 && outTok === 0) continue;
        if (!byModel[model]) byModel[model] = { calls: 0, input_tok: 0, cache_create_tok: 0, cache_read_tok: 0, output_tok: 0, est_cost: 0 };
        byModel[model].calls += 1;
        byModel[model].input_tok       += inTok;
        byModel[model].cache_create_tok += cacheCreate;
        byModel[model].cache_read_tok   += cacheRead;
        byModel[model].output_tok      += outTok;
        byModel[model].est_cost += estimatedCost(model, inTok, outTok, cacheCreate, cacheRead);

        const day = new Date(ts).toISOString().slice(0, 10);
        if (!dailyByModel[day]) dailyByModel[day] = {};
        dailyByModel[day][model] = (dailyByModel[day][model] || 0) + 1;
      }
    }
  }

  // Build daily array oldest→newest
  const daily: Array<{ date: string; by_model: Record<string, number> }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    daily.push({ date: d, by_model: dailyByModel[d] || {} });
  }
  return { by_model: byModel, daily, days };
}

// ----- GitHub PR/issue feed via gh CLI -----------------------------------

export async function githubFeed(): Promise<any> {
  const home = process.env.HOME || '';
  const ghBin = '/opt/homebrew/bin/gh';
  if (!existsSync(ghBin)) return { ok: false, items: [], message: 'gh CLI not installed' };
  // Query open PRs + issues across configured repos.
  const repos = ['hrmacnair/margin', 'hrmacnair/industry'];
  const items: any[] = [];
  for (const repo of repos) {
    const prRes = spawnSync(ghBin,
      ['pr', 'list', '--repo', repo, '--state', 'open', '--limit', '5', '--json', 'number,title,author,updatedAt,isDraft,url'],
      { encoding: 'utf8', timeout: 6000 });
    if (prRes.status === 0) {
      try {
        const arr = JSON.parse(prRes.stdout || '[]');
        for (const p of arr) items.push({ kind: 'pr', repo, ...p });
      } catch {}
    }
    const issRes = spawnSync(ghBin,
      ['issue', 'list', '--repo', repo, '--state', 'open', '--limit', '5', '--json', 'number,title,author,updatedAt,labels,url'],
      { encoding: 'utf8', timeout: 6000 });
    if (issRes.status === 0) {
      try {
        const arr = JSON.parse(issRes.stdout || '[]');
        for (const i of arr) items.push({ kind: 'issue', repo, ...i });
      } catch {}
    }
  }
  items.sort((a, b) => (b.updatedAt || '') > (a.updatedAt || '') ? 1 : -1);
  return { ok: true, items: items.slice(0, 20) };
}

// ----- All agents across divisions (flat list, for hover-preview) --------

export function listAllAgents(): Array<{ division: string; role: string; markdown: string; autonomy: string }> {
  const out: Array<{ division: string; role: string; markdown: string; autonomy: string }> = [];
  if (!existsSync(DIVISIONS_DIR)) return out;
  for (const d of readdirSync(DIVISIONS_DIR, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const yaml = readYaml(join(DIVISIONS_DIR, d.name, 'division.yaml'));
    const agentsList = yaml?.agents || [];
    const agentsDir = join(DIVISIONS_DIR, d.name, 'agents');
    let files: string[] = [];
    try { files = readdirSync(agentsDir).filter(f => f.endsWith('.md')); } catch { continue; }
    for (const f of files) {
      const role = f.replace(/\.md$/, '');
      let markdown = '';
      try { markdown = readFileSync(join(agentsDir, f), 'utf8'); } catch {}
      const auto = (agentsList.find((a: any) => a.role === role) || {}).autonomy || 'bold';
      out.push({ division: d.name, role, markdown, autonomy: auto });
    }
  }
  return out;
}

// ----- Quick-reply suggestions via haiku ---------------------------------

export async function generateSuggestions(lastUser: string, lastReply: string): Promise<string[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return [];
  const body = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    system: `You generate 3 short follow-up suggestions for a chat between an operator and Atlas (their agentic OS). Each suggestion is a single short imperative line, under 9 words, that the operator might say next. Reply with ONLY a JSON array of 3 strings. No prose. Example: ["explain the trade-off","show me the file","what would you change"]`,
    messages: [
      { role: 'user', content: `Previous turn:\nOperator: ${lastUser.slice(0, 400)}\nAtlas: ${lastReply.slice(0, 800)}\n\nThree follow-ups:` }
    ],
  });
  return new Promise((resolve) => {
    const https = require('https');
    const req = https.request({
      hostname: 'api.anthropic.com', port: 443, path: '/v1/messages', method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 6000,
    }, (res: any) => {
      let data = '';
      res.on('data', (c: any) => { data += c.toString(); });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const txt = (parsed.content || []).map((b: any) => b.text || '').join('').trim();
          const arr = JSON.parse(txt.match(/\[[\s\S]*\]/)?.[0] || '[]');
          resolve(Array.isArray(arr) ? arr.slice(0, 3).map(String) : []);
        } catch { resolve([]); }
      });
    });
    req.on('error', () => resolve([]));
    req.on('timeout', () => { req.destroy(); resolve([]); });
    req.write(body); req.end();
  });
}

export function spendDetail(days = 14) {
  // Per-source-app event counts over the requested window
  const perApp: Record<string, number> = {};
  const dailyCalls: Record<string, number> = {};
  if (existsSync(AUDIT_DIR)) {
    const cutoff = Date.now() - days * 86_400_000;
    let files: string[] = [];
    try { files = readdirSync(AUDIT_DIR).filter(f => /^\d{4}-\d{2}\.log$/.test(f)).sort().reverse(); } catch {}
    for (const f of files) {
      let lines: string[] = [];
      try { lines = readFileSync(join(AUDIT_DIR, f), 'utf8').split('\n'); } catch { continue; }
      for (const l of lines) {
        if (!l.trim()) continue;
        try {
          const e = JSON.parse(l);
          const t = Date.parse(e.ts || '');
          if (!Number.isFinite(t) || t < cutoff) continue;
          // count by action prefix (mission/event/proposal/etc)
          const a = (e.action || 'unknown').split('_')[0];
          perApp[a] = (perApp[a] || 0) + 1;
          const day = (e.ts || '').slice(0, 10);
          if (day) dailyCalls[day] = (dailyCalls[day] || 0) + 1;
        } catch {}
      }
    }
  }
  // sparkline: last `days` days oldest→newest
  const sparkline: Array<{ date: string; calls: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    sparkline.push({ date: d, calls: dailyCalls[d] || 0 });
  }
  return {
    by_action_kind: perApp,
    sparkline,
    window_days: days,
  };
}
