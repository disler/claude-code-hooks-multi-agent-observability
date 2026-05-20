#!/usr/bin/env bun
// Atlas Workspace — MCP server
//
// Speaks JSON-RPC 2.0 over stdio. Each line is one JSON message.
// Implements just enough of the Model Context Protocol for Claude Code,
// Cursor, Codex (any MCP client) to drive the workspace:
//
// Methods: initialize, tools/list, tools/call, ping
//
// Tools call into the existing HTTP API at localhost:4000 so the live state
// (DB, worktrees, broadcasts) stays single-sourced through the dashboard server.
//
// Install (Claude Code):
//   add to ~/.claude/mcp.json (or the equivalent for your client):
//   {
//     "mcpServers": {
//       "atlas-workspace": {
//         "command": "bun",
//         "args": ["/Users/hrmacnair/atlas/observability/apps/server/src/mcp-server.ts"]
//       }
//     }
//   }

import { readFileSync, writeFileSync, readdirSync, existsSync, appendFileSync } from 'fs';
import { join } from 'path';

const API = process.env.ATLAS_API || 'http://localhost:4000';
const PROTOCOL_VERSION = '2025-06-18';
const SERVER_INFO = { name: 'atlas-workspace', version: '1.1.0' };

const ATLAS_HOME = process.env.ATLAS_HOME || '/Users/hrmacnair/atlas';
const MEMORY_DIR = join(ATLAS_HOME, 'memory');
const ROOT_CLAUDE_MD = join(ATLAS_HOME, 'CLAUDE.md');

// ---- Tool definitions ----

interface Tool {
  name: string;
  description: string;
  inputSchema: any;
  handler: (args: any) => Promise<any>;
}

async function api(method: string, path: string, body?: any): Promise<any> {
  const opts: any = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${API}${path}`, opts);
  const text = await res.text();
  try { return JSON.parse(text); }
  catch { return { ok: false, error: text.slice(0, 500) }; }
}

const TOOLS: Tool[] = [
  {
    name: 'list_projects',
    description: 'List registered Atlas workspace projects, with task counts and spend.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => (await api('GET', '/api/atlas/workspace/projects')).projects || [],
  },
  {
    name: 'list_tasks',
    description: 'List tasks across all projects (or filter to one).',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Optional — filter to one project.' },
        includeArchived: { type: 'boolean', default: false },
      },
    },
    handler: async (args) => {
      const qs = new URLSearchParams();
      if (args?.projectId) qs.set('projectId', args.projectId);
      if (args?.includeArchived) qs.set('archived', '1');
      return (await api('GET', `/api/atlas/workspace/tasks?${qs}`)).tasks || [];
    },
  },
  {
    name: 'get_task',
    description: 'Fetch a single task by id (with status, branch, worktree path, cost, session id).',
    inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
    handler: async (args) => (await api('GET', `/api/atlas/workspace/tasks/${args.id}`)).task,
  },
  {
    name: 'create_task',
    description: 'Create a new task on a project. Does NOT spawn — call spawn_task next.',
    inputSchema: {
      type: 'object',
      required: ['project_id', 'title', 'prompt'],
      properties: {
        project_id: { type: 'string' },
        title:      { type: 'string' },
        prompt:     { type: 'string' },
        model:      { type: 'string', enum: ['haiku', 'sonnet', 'opus', 'gpt5', 'gpt5-mini', 'gemma'], default: 'sonnet' },
        mode:       { type: 'string', enum: ['safe', 'auto'], default: 'safe' },
      },
    },
    handler: async (args) => (await api('POST', '/api/atlas/workspace/tasks', args)).task,
  },
  {
    name: 'spawn_task',
    description: 'Spawn a backlog task. If concurrent limit reached, the task is queued (auto-drained on next exit).',
    inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
    handler: async (args) => api('POST', `/api/atlas/workspace/tasks/${args.id}/spawn`),
  },
  {
    name: 'kill_task',
    description: 'SIGTERM a running task (SIGKILL after 5s).',
    inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
    handler: async (args) => api('POST', `/api/atlas/workspace/tasks/${args.id}/kill`),
  },
  {
    name: 'get_task_log',
    description: 'Return the parsed pretty log (ANSI codes) for a task — tail by bytes if needed.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string' }, tail: { type: 'integer', default: 50000 } },
    },
    handler: async (args) => (await api('GET', `/api/atlas/workspace/tasks/${args.id}/log?tail=${args.tail || 50000}`)).log || '',
  },
  {
    name: 'get_task_diff',
    description: 'Git diff for a task that has a worktree branch. Empty string if no changes.',
    inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
    handler: async (args) => (await api('GET', `/api/atlas/workspace/tasks/${args.id}/diff`)).diff || '',
  },
  {
    name: 'merge_task',
    description: 'FF-merge the task branch into the project (local only). Cleans up worktree + branch.',
    inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
    handler: async (args) => api('POST', `/api/atlas/workspace/tasks/${args.id}/merge`),
  },
  {
    name: 'merge_and_push_task',
    description: 'FF-merge + git push origin <currentBranch>. Confirm before invoking — affects the remote.',
    inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
    handler: async (args) => api('POST', `/api/atlas/workspace/tasks/${args.id}/merge-push`),
  },
  {
    name: 'open_pr_for_task',
    description: 'Push the workspace branch and open a GitHub PR (gh pr create). Requires gh CLI authed.',
    inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
    handler: async (args) => api('POST', `/api/atlas/workspace/tasks/${args.id}/pr`),
  },
  {
    name: 'discard_task_worktree',
    description: 'Drop the worktree + branch for a task. The task itself stays in the DB.',
    inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
    handler: async (args) => api('POST', `/api/atlas/workspace/tasks/${args.id}/discard`),
  },
  {
    name: 'follow_up_task',
    description: 'Continue an existing task with a follow-up prompt. Resumes the parent claude session.',
    inputSchema: {
      type: 'object',
      required: ['parent_id', 'prompt'],
      properties: { parent_id: { type: 'string' }, prompt: { type: 'string' } },
    },
    handler: async (args) => api('POST', `/api/atlas/workspace/tasks/${args.parent_id}/follow-up`, { prompt: args.prompt }),
  },
  {
    name: 'get_project_memory',
    description: 'Read the per-project CLAUDE.md memory (auto-injected into spawns).',
    inputSchema: { type: 'object', required: ['project_id'], properties: { project_id: { type: 'string' } } },
    handler: async (args) => (await api('GET', `/api/atlas/workspace/projects/${args.project_id}/memory`)).body || '',
  },
  {
    name: 'set_project_memory',
    description: 'Replace the per-project CLAUDE.md memory.',
    inputSchema: {
      type: 'object',
      required: ['project_id', 'body'],
      properties: { project_id: { type: 'string' }, body: { type: 'string' } },
    },
    handler: async (args) => api('PUT', `/api/atlas/workspace/projects/${args.project_id}/memory`, { body: args.body }),
  },
  {
    name: 'list_templates',
    description: 'List vibe templates (built-in + custom).',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => (await api('GET', '/api/atlas/workspace/templates')).templates || [],
  },

  // ---- Atlas memory tools (Phase 2 — BridgeMemory parity, flat markdown) ----

  {
    name: 'memory_list',
    description: 'List Atlas memory files in ~/atlas/memory/ (you.md, businesses.md, decisions.md, lessons.md, contacts.md, playbooks.md, etc.) plus root CLAUDE.md identity file.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      const files = readdirSync(MEMORY_DIR).filter(f => f.endsWith('.md'));
      const out = files.map(f => ({ slug: f.replace(/\.md$/, ''), path: join(MEMORY_DIR, f) }));
      out.unshift({ slug: 'CLAUDE', path: ROOT_CLAUDE_MD });
      return out;
    },
  },
  {
    name: 'memory_read',
    description: 'Read an Atlas memory file by slug. Slugs: CLAUDE (root identity), you, businesses, decisions, lessons, contacts, playbooks, or any *.md filename in ~/atlas/memory/.',
    inputSchema: {
      type: 'object',
      required: ['slug'],
      properties: { slug: { type: 'string', description: 'Filename without .md, or "CLAUDE" for root identity.' } },
    },
    handler: async (args) => {
      const slug = String(args.slug).replace(/\.md$/, '');
      const path = slug === 'CLAUDE' ? ROOT_CLAUDE_MD : join(MEMORY_DIR, `${slug}.md`);
      if (!existsSync(path)) return { ok: false, error: `No memory file: ${slug}` };
      return { slug, path, body: readFileSync(path, 'utf8') };
    },
  },
  {
    name: 'memory_search',
    description: 'Case-insensitive substring search across all Atlas memory files + root CLAUDE.md. Returns matches with file:line.',
    inputSchema: {
      type: 'object',
      required: ['query'],
      properties: {
        query:   { type: 'string', description: 'Substring to search for (case-insensitive).' },
        limit:   { type: 'integer', default: 50, description: 'Max matches to return.' },
        context: { type: 'integer', default: 1,  description: 'Lines of context before/after each hit.' },
      },
    },
    handler: async (args) => {
      const q = String(args.query).toLowerCase();
      const limit = args.limit ?? 50;
      const ctx = args.context ?? 1;
      const files = readdirSync(MEMORY_DIR).filter(f => f.endsWith('.md')).map(f => join(MEMORY_DIR, f));
      files.unshift(ROOT_CLAUDE_MD);
      const hits: { slug: string; line: number; text: string }[] = [];
      for (const path of files) {
        if (!existsSync(path)) continue;
        const slug = path === ROOT_CLAUDE_MD ? 'CLAUDE' : path.split('/').pop()!.replace(/\.md$/, '');
        const lines = readFileSync(path, 'utf8').split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(q)) {
            const lo = Math.max(0, i - ctx);
            const hi = Math.min(lines.length - 1, i + ctx);
            hits.push({ slug, line: i + 1, text: lines.slice(lo, hi + 1).join('\n') });
            if (hits.length >= limit) return hits;
          }
        }
      }
      return hits;
    },
  },
  {
    name: 'memory_append',
    description: 'Append a section to an Atlas memory file. Prepends a horizontal rule + ISO date heading if header is provided. Use log_decision / log_lesson for those specific files (they have a stricter schema).',
    inputSchema: {
      type: 'object',
      required: ['slug', 'body'],
      properties: {
        slug:   { type: 'string', description: 'Target memory file (no .md). Cannot be "CLAUDE" — root identity is hand-edited only.' },
        header: { type: 'string', description: 'Optional H2 heading. Auto-prefixed with today\'s date if it does not start with one.' },
        body:   { type: 'string', description: 'Markdown body to append.' },
      },
    },
    handler: async (args) => {
      const slug = String(args.slug).replace(/\.md$/, '');
      if (slug === 'CLAUDE') return { ok: false, error: 'Root CLAUDE.md is hand-edited only.' };
      const path = join(MEMORY_DIR, `${slug}.md`);
      const today = new Date().toISOString().slice(0, 10);
      let chunk = '\n\n---\n\n';
      if (args.header) {
        const h = String(args.header).trim();
        chunk += /^\d{4}-\d{2}-\d{2}/.test(h) ? `## ${h}\n\n` : `## ${today} — ${h}\n\n`;
      }
      chunk += String(args.body).trimEnd() + '\n';
      appendFileSync(path, chunk);
      return { ok: true, path, appended_bytes: chunk.length };
    },
  },
  {
    name: 'log_decision',
    description: 'Append a decision entry to ~/atlas/memory/decisions.md with today\'s date. One of the core Atlas operating principles: every decision the moment it is made. Auto-runs the wikilink suggester after write and returns top related memory slugs the caller should consider linking.',
    inputSchema: {
      type: 'object',
      required: ['title', 'decision'],
      properties: {
        title:    { type: 'string', description: 'Short title (will become H2: "## <DATE> — <title>").' },
        decision: { type: 'string', description: 'What was decided.' },
        why:      { type: 'string', description: 'Why (optional but strongly preferred).' },
        impact:   { type: 'string', description: 'What changes / who is affected (optional).' },
      },
    },
    handler: async (args) => {
      const path = join(MEMORY_DIR, 'decisions.md');
      const today = new Date().toISOString().slice(0, 10);
      let body = `\n\n---\n\n## ${today} — ${args.title}\n\n**Decision:** ${args.decision}\n`;
      if (args.why)    body += `\n**Why:** ${args.why}\n`;
      if (args.impact) body += `\n**Impact:** ${args.impact}\n`;
      appendFileSync(path, body);
      const sugg = await api('GET', '/api/atlas/memory/suggest?slug=decisions&limit=5').catch(() => ({ suggestions: [] }));
      return { ok: true, path, date: today, suggested_wikilinks: sugg.suggestions || [] };
    },
  },
  {
    name: 'log_lesson',
    description: 'Append a lesson entry to ~/atlas/memory/lessons.md with today\'s date. Use when something was learned the hard way and the operator should not relearn it. Auto-runs the wikilink suggester and returns related memory slugs the caller should consider linking.',
    inputSchema: {
      type: 'object',
      required: ['title', 'lesson'],
      properties: {
        title:   { type: 'string' },
        lesson:  { type: 'string', description: 'The lesson itself, stated as a rule for future-you.' },
        context: { type: 'string', description: 'What triggered the lesson (incident / pattern observed). Optional.' },
      },
    },
    handler: async (args) => {
      const path = join(MEMORY_DIR, 'lessons.md');
      const today = new Date().toISOString().slice(0, 10);
      let body = `\n\n---\n\n## ${today} — ${args.title}\n\n**Lesson:** ${args.lesson}\n`;
      if (args.context) body += `\n**Context:** ${args.context}\n`;
      appendFileSync(path, body);
      const sugg = await api('GET', '/api/atlas/memory/suggest?slug=lessons&limit=5').catch(() => ({ suggestions: [] }));
      return { ok: true, path, date: today, suggested_wikilinks: sugg.suggestions || [] };
    },
  },

  // ---- Atlas memory graph (Phase 3 — wikilinks, backlinks, suggestions) ----

  {
    name: 'memory_graph',
    description: 'Build the full Atlas memory wikilink graph. Returns { nodes, edges, orphans }. Nodes are memory files; edges are `[[slug]]` references; orphans are files with no incoming or outgoing links.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => (await api('GET', '/api/atlas/memory/graph')),
  },
  {
    name: 'memory_backlinks',
    description: 'List every file:line where another memory file references this slug via `[[slug]]`.',
    inputSchema: {
      type: 'object',
      required: ['slug'],
      properties: { slug: { type: 'string' } },
    },
    handler: async (args) => (await api('GET', `/api/atlas/memory/backlinks?slug=${encodeURIComponent(args.slug)}`)),
  },
  {
    name: 'memory_suggest',
    description: 'Suggest related memory files via shared-term TF-IDF score. Use when starting a task to surface relevant prior context the operator did not explicitly link.',
    inputSchema: {
      type: 'object',
      required: ['slug'],
      properties: {
        slug:  { type: 'string' },
        limit: { type: 'integer', default: 8 },
      },
    },
    handler: async (args) => (await api('GET', `/api/atlas/memory/suggest?slug=${encodeURIComponent(args.slug)}&limit=${args.limit || 8}`)),
  },

  // ---- Phase 10: Reviewer verdict + protocol event timeline ----

  {
    name: 'swarm_review_decision',
    description: 'Reviewer agent records its verdict on a Builder task. APPROVED → task moves to "done" (operator still merges). CHANGES_REQUESTED → stays in review, Inbox surfaces it as reviewer_rejected with Telegram ping. BLOCKED → same as reportBlocked (status=failed).',
    inputSchema: {
      type: 'object',
      required: ['task_id', 'decision'],
      properties: {
        task_id:  { type: 'string' },
        decision: { type: 'string', enum: ['APPROVED', 'CHANGES_REQUESTED', 'BLOCKED'] },
        notes:    { type: 'string', description: 'Reviewer rationale / change list.' },
      },
    },
    handler: async (args) => (await api('POST', '/api/atlas/swarm/review-decision', args)),
  },
  {
    name: 'swarm_shadow_disagree',
    description: 'Shadow Reviewer records its re-review verdict alongside the original Reviewer\'s. If decisions differ, an Inbox entry surfaces and the operator gets a Telegram ping. Use to catch Reviewer rubber-stamping over time. Both decisions are recorded in protocol_events regardless of match.',
    inputSchema: {
      type: 'object',
      required: ['task_id', 'original_decision', 'shadow_decision'],
      properties: {
        task_id:           { type: 'string' },
        original_decision: { type: 'string', enum: ['APPROVED', 'CHANGES_REQUESTED'] },
        shadow_decision:   { type: 'string', enum: ['APPROVED', 'CHANGES_REQUESTED'] },
        shadow_model:      { type: 'string', default: 'haiku' },
        notes:             { type: 'string' },
      },
    },
    handler: async (args) => (await api('POST', '/api/atlas/swarm/shadow-disagree', args)),
  },
  {
    name: 'swarm_task_events',
    description: 'Fetch the protocol-event timeline for a task: dag_created, deps_satisfied, blocked, reviewer_approved, changes_requested, etc. Each event has {ts, event, payload}.',
    inputSchema: {
      type: 'object',
      required: ['task_id'],
      properties: { task_id: { type: 'string' } },
    },
    handler: async (args) => (await api('GET', `/api/atlas/workspace/tasks/${args.task_id}/events`)),
  },

  // ---- Phase 9 #7: DAG templates ----

  {
    name: 'dag_templates_list',
    description: 'List installed DAG templates from ~/atlas/skills/dags/ — each entry has {slug, name, description, vars, nodes (raw with placeholders)}.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => (await api('GET', '/api/atlas/dag/templates')).templates || [],
  },
  {
    name: 'dag_templates_instantiate',
    description: 'Fill a DAG template with variable values. Produces ready-to-validate nodes for swarm_dispatch. {{var}} placeholders get substituted; {{var | slugify}} produces a URL-safe slug.',
    inputSchema: {
      type: 'object',
      required: ['slug', 'vars'],
      properties: {
        slug: { type: 'string', description: 'Template slug (filename without .json).' },
        vars: { type: 'object', description: 'Map of variable name → value. Every var declared in the template must be provided.' },
      },
    },
    handler: async (args) => (await api('POST', '/api/atlas/dag/instantiate', args)),
  },
  {
    name: 'dag_template_dispatch',
    description: 'One-shot: instantiate a DAG template with vars, validate, and dispatch into a project. Equivalent to dag_templates_instantiate + swarm_dispatch but saves a round-trip. Use dry_run=true to validate-only.',
    inputSchema: {
      type: 'object',
      required: ['slug', 'vars', 'project_id'],
      properties: {
        slug:       { type: 'string' },
        vars:       { type: 'object' },
        project_id: { type: 'string', description: 'Atlas workspace project to dispatch into.' },
        dry_run:    { type: 'boolean', default: false },
      },
    },
    handler: async (args) => {
      const inst = await api('POST', '/api/atlas/dag/instantiate', { slug: args.slug, vars: args.vars });
      if (!inst.ok) return inst;
      return api('POST', '/api/atlas/swarm/dispatch', {
        project_id: args.project_id,
        dry_run: args.dry_run === true,
        nodes: inst.nodes,
        template_slug: args.slug,
      });
    },
  },

  // ---- Phase 8 #3: Scout cache ----

  {
    name: 'scout_cache_lookup',
    description: 'Check if a recent @Scout mapping for (project, question, file-globs) exists and is still fresh (all mapped files unchanged since the scout ran). Returns the cached result + creation time, or null if miss / stale. Use BEFORE running a fresh scout so the swarm does not re-discover the same surface twice.',
    inputSchema: {
      type: 'object',
      required: ['project_id', 'question', 'globs'],
      properties: {
        project_id: { type: 'string' },
        question:   { type: 'string', description: 'The scout question — same string used to key the cache.' },
        globs:      { type: 'array', items: { type: 'string' }, description: 'File globs the scout will map.' },
      },
    },
    handler: async (args) => (await api('POST', '/api/atlas/scout-cache/lookup', args)),
  },
  {
    name: 'scout_cache_store',
    description: 'Persist a @Scout result for future re-use. Pass the actual file paths the scout touched (used for mtime-based invalidation) and the final mapping output.',
    inputSchema: {
      type: 'object',
      required: ['project_id', 'question', 'globs', 'files', 'result'],
      properties: {
        project_id: { type: 'string' },
        question:   { type: 'string' },
        globs:      { type: 'array', items: { type: 'string' } },
        files:      { type: 'array', items: { type: 'string' }, description: 'Absolute paths the scout actually read.' },
        result:     { type: 'string', description: 'The scout output to cache.' },
      },
    },
    handler: async (args) => (await api('POST', '/api/atlas/scout-cache/store', args)),
  },

  // ---- Swarm dispatch (Phase 6 — actually create + spawn tasks from a DAG) ----

  {
    name: 'swarm_dispatch',
    description: 'Dispatch a Swarm Protocol DAG. Always start with dry_run=true. requires_approval=true holds all spawns until the operator approves (POST /swarm/dag/:id/approve or swarm_dag_approve MCP tool). transactional=true holds individual merges until every Reviewer is green, then operator runs swarm_dag_merge_all. cost_cap_usd auto-aborts remaining tasks once the DAG total crosses the cap.',
    inputSchema: {
      type: 'object',
      required: ['project_id', 'nodes'],
      properties: {
        project_id:        { type: 'string', description: 'Atlas workspace project ID to dispatch into.' },
        dry_run:           { type: 'boolean', default: false },
        requires_approval: { type: 'boolean', default: false, description: 'Hold the DAG pending operator approval before any spawn.' },
        transactional:     { type: 'boolean', default: false, description: 'Hold all merges until every task in the DAG is done; operator merges as a batch.' },
        cost_cap_usd:      { type: 'number', description: 'Auto-abort once DAG cost crosses this dollar amount.' },
        nodes: {
          type: 'array',
          description: 'DAG task blocks per Phase 1 protocol.',
          items: {
            type: 'object',
            required: ['task', 'owner', 'prompt'],
            properties: {
              task:   { type: 'string', description: 'Within-DAG slug (e.g. scout-stripe).' },
              owner:  { type: 'string', description: '@Producer | @Scout | @Swift | @Web | @Designer | @Reviewer | @Researcher | @Writer | @Ops' },
              title:  { type: 'string', description: 'Optional human title; defaults to slug.' },
              prompt: { type: 'string', description: 'Full instruction for the agent that runs the task.' },
              files:  { type: 'array', items: { type: 'string' }, default: [] },
              deps:   { type: 'array', items: { type: 'string' }, default: [] },
              accept: { type: 'string' },
              model:  { type: 'string', enum: ['haiku', 'sonnet', 'opus', 'gpt5', 'gpt5-mini', 'gemma'] },
              mode:   { type: 'string', enum: ['safe', 'auto'], default: 'safe' },
            },
          },
        },
      },
    },
    handler: async (args) => (await api('POST', '/api/atlas/swarm/dispatch', args)),
  },

  // ---- Service secrets (Telegram / Discord / Stripe / GitHub / etc.) ----

  {
    name: 'secrets_list',
    description: 'List all registered service-integration secret slots (Telegram, Discord, Stripe, GitHub, etc.) with metadata + has_key flag. NEVER returns actual values — values live in macOS Keychain under service `atlas.service.<id>` and only the spawning daemon reads them. Use to inspect which integrations have been configured.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => (await api('GET', '/api/atlas/secrets')).secrets || [],
  },
  {
    name: 'secrets_set',
    description: 'Set or update a service secret. Stores in macOS Keychain (atlas.service.<id>) and mirrors to any registered .env file. Optionally kickstarts the associated launchd job so the new value lands without manual restart. Operator-only — never call from an autonomous agent unless explicitly requested.',
    inputSchema: {
      type: 'object',
      required: ['id', 'value'],
      properties: {
        id:    { type: 'string', description: 'secret id from secrets_list (e.g. telegram_bot_token, discord_token, stripe_test_secret)' },
        value: { type: 'string', description: 'the secret value' },
      },
    },
    handler: async (args) => (await api('POST', `/api/atlas/secrets/${encodeURIComponent(args.id)}`, { value: args.value })),
  },
  {
    name: 'secrets_clear',
    description: 'Clear a registered service secret. Deletes the Keychain entry, blanks the .env mirror, and kickstarts the associated daemon (which will then fail/exit if the secret was required). Operator-only.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string' } },
    },
    handler: async (args) => (await api('DELETE', `/api/atlas/secrets/${encodeURIComponent(args.id)}`)),
  },

  // ---- Phase A: Incubator pipeline ----

  {
    name: 'incubator_pipeline',
    description: 'Pipeline view: missions grouped by stage (backlog/validating/drafted/review/graduated/killed). Graduated reads from divisions registry — Margin + Industry show there once their division.yaml status is active. Use to render the dashboard PipelineCard or audit pipeline health.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => (await api('GET', '/api/atlas/incubator/pipeline')),
  },
  {
    name: 'incubator_mission_list',
    description: 'List all incubator missions (every status). For status-filtered or stage-grouped view use incubator_pipeline instead.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => (await api('GET', '/api/atlas/incubator/missions')).missions || [],
  },
  {
    name: 'incubator_mission_get',
    description: 'Read one mission by id. Returns full schema including score, validation, evidence, deep-dive fields.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string' } },
    },
    handler: async (args) => (await api('GET', `/api/atlas/incubator/missions/${encodeURIComponent(args.id)}`)),
  },
  {
    name: 'incubator_mission_create',
    description: 'Append a new mission. Status defaults to queued. Score is the 5-factor rubric ({demand, competition_inverse, build_speed, monetization, pain_urgency} each 1-10). Total computed automatically.',
    inputSchema: {
      type: 'object',
      required: ['title'],
      properties: {
        title:            { type: 'string' },
        type:             { type: 'string', enum: ['EXT', 'SAAS', 'HYBRID'] },
        category:         { type: 'string' },
        origin:           { type: 'string', enum: ['scheduled', 'operator', 'seed'] },
        score:            {
          type: 'object',
          properties: {
            demand:              { type: 'integer', minimum: 0, maximum: 10 },
            competition_inverse: { type: 'integer', minimum: 0, maximum: 10 },
            build_speed:         { type: 'integer', minimum: 0, maximum: 10 },
            monetization:        { type: 'integer', minimum: 0, maximum: 10 },
            pain_urgency:        { type: 'integer', minimum: 0, maximum: 10 },
          },
        },
        evidence:         { type: 'array', items: { type: 'string' } },
        gap:              { type: 'string' },
        landscape:        { type: 'string' },
        build_path:       { type: 'string' },
        monetization:     { type: 'string' },
        validation_move:  { type: 'string' },
        notes:            { type: 'string' },
      },
    },
    handler: async (args) => (await api('POST', '/api/atlas/incubator/missions', args)),
  },
  {
    name: 'incubator_mission_transition',
    description: 'Move a mission to a new stage. Allowed transitions: queued→{in_progress,abandoned}, in_progress→{drafted,abandoned}, drafted→{review,abandoned}, review→{graduated,abandoned}. graduated + abandoned are terminal. For graduated pass graduated_to_division (the new division slug). For abandoned pass reason. For drafted pass landing_url.',
    inputSchema: {
      type: 'object',
      required: ['id', 'to'],
      properties: {
        id: { type: 'string' },
        to: { type: 'string', enum: ['in_progress', 'drafted', 'review', 'graduated', 'abandoned'] },
        reason: { type: 'string' },
        graduated_to_division: { type: 'string' },
        landing_url: { type: 'string' },
      },
    },
    handler: async (args) => (await api('POST', `/api/atlas/incubator/missions/${encodeURIComponent(args.id)}/transition`, args)),
  },
  {
    name: 'incubator_seed_bulk',
    description: 'Bulk-import an array of missions (used by Phase C dossier seed). Each mission needs at minimum title; score block recommended. Idempotent-ish: every call generates fresh ids, so re-running duplicates. Use once.',
    inputSchema: {
      type: 'object',
      required: ['missions'],
      properties: {
        missions: { type: 'array', items: { type: 'object' } },
      },
    },
    handler: async (args) => (await api('POST', '/api/atlas/incubator/seed', args)),
  },

  // ---- Phase A0: Autonomy toggle ----

  {
    name: 'autonomy_get',
    description: 'Read current autonomy mode. Returns {mode: "guarded"|"autonomous", active, expires_at, ms_remaining, set_by, set_at, reason}. In autonomous mode, the atlas autonomy-gate auto-approves must_approve actions and logs them with auto_approved_by_autonomous_mode=true. hard_block actions are NEVER bypassed.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => (await api('GET', '/api/atlas/autonomy')),
  },
  {
    name: 'autonomy_set',
    description: 'Flip autonomy mode. mode="autonomous" turns the gate to auto-approve must_approve actions (NOT hard_block — those always stop). ttl_hours: positive = expiry window in hours; 0 or negative = indefinite (operator must manually toggle back); omit = default 2h. mode="guarded" restores normal queueing.',
    inputSchema: {
      type: 'object',
      required: ['mode'],
      properties: {
        mode:       { type: 'string', enum: ['guarded', 'autonomous'] },
        ttl_hours:  { type: 'number', description: 'Expiry window in hours. 0 or negative = indefinite. Omit = default 2h.' },
        reason:     { type: 'string', description: 'Free-text reason for the toggle. Recorded in audit log and history.' },
      },
    },
    handler: async (args) => (await api('POST', '/api/atlas/autonomy', args)),
  },

  // ---- Phase 14: DAG telemetry ----

  {
    name: 'dag_stats',
    description: 'Per-DAG roll-up + per-template aggregates. Returns {dags: [{dag_id, status, total_tasks, done_tasks, failed_tasks, blocked_tasks, cost_total_usd, duration_ms}], templates: [{template_slug, runs, succeeded, failed, avg_cost_usd, avg_duration_ms}]}. Use for "which templates are paying off" and "did this DAG run cleanly".',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'integer', default: 50 } },
    },
    handler: async (args) => (await api('GET', `/api/atlas/dag/stats?limit=${args.limit || 50}`)),
  },

  // ---- Phase 13: DAG schedules (cron / interval / one-shot) ----

  {
    name: 'dag_schedule_list',
    description: 'List all scheduled DAG dispatches. Each entry has template_slug, vars, project_id, the cron/interval/one-shot spec, and bookkeeping (last_run_at, last_dag_id, last_error).',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => (await api('GET', '/api/atlas/dag/schedules')).schedules || [],
  },
  {
    name: 'dag_schedule_create',
    description: 'Schedule a DAG template to dispatch on cron / interval / one-shot, or attach a non-cron trigger (webhook / api). Cron supports: */15 * * * * (every N minutes), 0 9 * * * (daily HH:MM), 0 9 * * mon (weekly DOW HH:MM). Use interval_ms for arbitrary intervals. Use next_run_ms for one-shot future runs (schedule self-disables after firing). Optionally pass `trigger: {kind: "cron", expr}` (equivalent to top-level cron), `trigger: {kind: "api"}` (only fires via routine_fire / POST /routine/:id/fire), or attach a webhook later via routine_webhook_attach. Concurrency: "allow" | "skip" | "queue" (default "allow"). Note: "queue" behaves the same as "allow" today — upstream callers enforce single-writer; reserved for future true queueing. Forwards requires_approval / transactional / cost_cap_usd to the dispatch.',
    inputSchema: {
      type: 'object',
      required: ['name', 'template_slug', 'vars', 'project_id'],
      properties: {
        name:           { type: 'string' },
        template_slug:  { type: 'string' },
        vars:           { type: 'object' },
        project_id:     { type: 'string' },
        cron:           { type: 'string' },
        interval_ms:    { type: 'number' },
        next_run_ms:    { type: 'number' },
        requires_approval: { type: 'boolean' },
        transactional:     { type: 'boolean' },
        cost_cap_usd:      { type: 'number' },
        trigger: {
          type: 'object',
          description: 'Optional trigger discriminator. Omit for legacy cron behavior.',
          properties: {
            kind: { type: 'string', enum: ['cron', 'webhook', 'api'] },
            expr: { type: 'string', description: 'cron expression (only when kind="cron")' },
          },
        },
        concurrency: { type: 'string', enum: ['allow', 'skip', 'queue'] },
        catch_up:    { type: 'boolean' },
      },
    },
    handler: async (args) => (await api('POST', '/api/atlas/dag/schedules', args)),
  },
  {
    name: 'routine_fire',
    description: 'Admin "fire now" for a schedule. Equivalent to POST /api/atlas/routine/:id/fire with x-atlas-admin. Calls fireSchedule(..., "api"). Returns { ok, ticket_id?, dag_id?, skipped?, reason?, error? }.',
    inputSchema: {
      type: 'object',
      required: ['schedule_id'],
      properties: { schedule_id: { type: 'string' } },
    },
    handler: async (args) => (await api('POST', `/api/atlas/routine/${args.schedule_id}/fire`)),
  },
  {
    name: 'routine_webhook_attach',
    description: 'Attach a webhook trigger to a schedule. Generates a 32-byte plaintext secret, stores SHA256(secret) on the schedule row, returns the plaintext ONCE. The webhook URL is POST /api/atlas/routine/webhook/<secret>. Optional HMAC: x-atlas-signature: sha256=<hex(hmac_sha256(secret, raw_body))>.',
    inputSchema: {
      type: 'object',
      required: ['schedule_id'],
      properties: { schedule_id: { type: 'string' } },
    },
    handler: async (args) => (await api('POST', `/api/atlas/routine/${args.schedule_id}/webhook/attach`)),
  },
  {
    name: 'routine_webhook_detach',
    description: 'Detach the webhook trigger from a schedule. Reverts to the legacy cron field (if set) or leaves the schedule with no trigger.',
    inputSchema: {
      type: 'object',
      required: ['schedule_id'],
      properties: { schedule_id: { type: 'string' } },
    },
    handler: async (args) => (await api('POST', `/api/atlas/routine/${args.schedule_id}/webhook/detach`)),
  },
  {
    name: 'dag_schedule_toggle',
    description: 'Enable or disable a schedule without deleting it. Disabled schedules are skipped by the ticker.',
    inputSchema: {
      type: 'object',
      required: ['id', 'enabled'],
      properties: {
        id:      { type: 'string' },
        enabled: { type: 'boolean' },
      },
    },
    handler: async (args) => (await api('POST', `/api/atlas/dag/schedules/${args.id}/${args.enabled ? 'enable' : 'disable'}`)),
  },

  // ---- Phase 12: DAG lifecycle (approve / abort / merge-all) ----

  {
    name: 'swarm_dag_approve',
    description: 'Approve a DAG dispatched with requires_approval=true. Flips status running → spawns the root tasks. Use when the operator has reviewed the DAG plan.',
    inputSchema: {
      type: 'object',
      required: ['dag_id'],
      properties: { dag_id: { type: 'string' } },
    },
    handler: async (args) => (await api('POST', `/api/atlas/swarm/dag/${args.dag_id}/approve`)),
  },
  {
    name: 'swarm_dag_abort',
    description: 'Abort a DAG. Kills any backlog/queued/running tasks in it. Used by operator when a DAG is wrong, or auto-fired when a cost_cap is hit.',
    inputSchema: {
      type: 'object',
      required: ['dag_id'],
      properties: {
        dag_id: { type: 'string' },
        reason: { type: 'string' },
      },
    },
    handler: async (args) => (await api('POST', `/api/atlas/swarm/dag/${args.dag_id}/abort`, { reason: args.reason })),
  },
  {
    name: 'swarm_dag_merge_all',
    description: 'Bulk-merge every done task in a transactional DAG. Use after every Reviewer has approved. Returns {merged, failed[]}.',
    inputSchema: {
      type: 'object',
      required: ['dag_id'],
      properties: { dag_id: { type: 'string' } },
    },
    handler: async (args) => (await api('POST', `/api/atlas/swarm/dag/${args.dag_id}/merge-all`)),
  },

  // ---- Swarm DAG validator (Phase 1 protocol — file-ownership lock check) ----

  {
    name: 'swarm_validate_dag',
    description: 'Validate a Swarm Protocol task DAG against the Phase 1 rules: file-ownership lock (no two tasks own the same path), dependency closure, valid owners, Scout-before-Builder for ≥2-file tasks, Reviewer gate per Builder task. Returns conflicts + missing-gate warnings. Does NOT dispatch.',
    inputSchema: {
      type: 'object',
      required: ['tasks'],
      properties: {
        tasks: {
          type: 'array',
          description: 'List of task blocks. Each: { task, owner, files, deps, accept }.',
          items: {
            type: 'object',
            required: ['task', 'owner'],
            properties: {
              task:   { type: 'string' },
              owner:  { type: 'string', description: '@Producer|@Scout|@Swift|@Web|@Designer|@Reviewer|@Researcher|@Writer|@Ops' },
              files:  { type: 'array', items: { type: 'string' }, default: [] },
              deps:   { type: 'array', items: { type: 'string' }, default: [] },
              accept: { type: 'string' },
            },
          },
        },
      },
    },
    handler: async (args) => {
      const tasks = args.tasks || [];
      const ids = new Set(tasks.map((t: any) => t.task));
      const validOwners = new Set(['@Producer', '@Scout', '@Swift', '@Web', '@Designer', '@Reviewer', '@Researcher', '@Writer', '@Ops']);
      const builderOwners = new Set(['@Swift', '@Web']);
      const errors: string[] = [];
      const warnings: string[] = [];

      const fileToTasks: Record<string, string[]> = {};
      for (const t of tasks) {
        if (!validOwners.has(t.owner)) errors.push(`task ${t.task}: invalid owner ${t.owner}`);
        for (const d of t.deps || []) {
          if (!ids.has(d)) errors.push(`task ${t.task}: dep ${d} not in DAG`);
        }
        for (const f of t.files || []) {
          (fileToTasks[f] ||= []).push(t.task);
        }
        if (!t.accept) warnings.push(`task ${t.task}: missing accept criterion`);
      }

      for (const [file, owners] of Object.entries(fileToTasks)) {
        if (owners.length > 1) {
          const tied = owners.map(id => {
            const t = tasks.find((x: any) => x.task === id);
            const depsClosed = (t.deps || []).some((d: string) => owners.includes(d)) ||
              owners.some(o => (tasks.find((x: any) => x.task === o)?.deps || []).includes(id));
            return { id, depsClosed };
          });
          if (!tied.every(x => x.depsClosed)) {
            errors.push(`file-ownership conflict on ${file}: ${owners.join(', ')} — add a dep edge to serialize`);
          }
        }
      }

      for (const t of tasks) {
        if (builderOwners.has(t.owner)) {
          const fileCount = (t.files || []).length;
          if (fileCount >= 2) {
            const hasScout = (t.deps || []).some((d: string) => {
              const dep = tasks.find((x: any) => x.task === d);
              return dep?.owner === '@Scout';
            });
            if (!hasScout) warnings.push(`task ${t.task}: ${fileCount}-file Builder task should depend on a @Scout task`);
          }
          const hasReviewer = tasks.some((r: any) => r.owner === '@Reviewer' && (r.deps || []).includes(t.task));
          if (!hasReviewer) warnings.push(`task ${t.task}: Builder task missing paired @Reviewer task`);
        }
      }

      return {
        ok: errors.length === 0,
        task_count: tasks.length,
        errors,
        warnings,
      };
    },
  },

  // ---- Paperclip-5: HTTP adapter contract (admin-only register/revoke) ----
  // adapter_register / adapter_revoke require ATLAS_ADMIN_TOKEN in env and
  // forward it as the x-atlas-admin header. adapter_list is read-only.
  {
    name: 'adapter_register',
    description: 'Register a new HTTP webhook adapter for non-Claude workers (Codex, Cursor, bash, external bots). Returns plaintext api_key exactly once — store it immediately. Admin-only: requires ATLAS_ADMIN_TOKEN env var set on both the MCP server and the API server.',
    inputSchema: {
      type: 'object',
      required: ['name', 'agent_id', 'kind'],
      properties: {
        name: { type: 'string', description: 'Human-readable adapter label.' },
        agent_id: { type: 'string', description: 'Atlas agent id from agents.json (producer|scout|swift|web|designer|reviewer|researcher|writer|ops).' },
        kind: { type: 'string', enum: ['claude', 'codex', 'cursor', 'bash', 'http'] },
      },
    },
    handler: async (args) => {
      const admin = process.env.ATLAS_ADMIN_TOKEN;
      if (!admin) return { ok: false, error: 'ATLAS_ADMIN_TOKEN not set on MCP server' };
      const res = await fetch(`${API}/api/atlas/adapter/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-atlas-admin': admin },
        body: JSON.stringify(args),
      });
      const text = await res.text();
      try { return JSON.parse(text); } catch { return { ok: false, error: text.slice(0, 500) }; }
    },
  },
  {
    name: 'adapter_revoke',
    description: 'Revoke an HTTP adapter by id. Sets revoked=true; subsequent authenticate() calls fail with 410. Admin-only.',
    inputSchema: {
      type: 'object',
      required: ['adapter_id'],
      properties: { adapter_id: { type: 'string' } },
    },
    handler: async (args) => {
      const admin = process.env.ATLAS_ADMIN_TOKEN;
      if (!admin) return { ok: false, error: 'ATLAS_ADMIN_TOKEN not set on MCP server' };
      const res = await fetch(`${API}/api/atlas/adapter/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-atlas-admin': admin },
        body: JSON.stringify(args),
      });
      const text = await res.text();
      try { return JSON.parse(text); } catch { return { ok: false, error: text.slice(0, 500) }; }
    },
  },
  {
    name: 'adapter_list',
    description: 'List all HTTP adapters (revoked included, flagged via the revoked field). Never returns api_key_hash.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      try {
        const file = join(ATLAS_HOME, 'memory', 'adapters.json');
        if (!existsSync(file)) return { adapters: [] };
        const parsed = JSON.parse(readFileSync(file, 'utf8'));
        const arr = Array.isArray(parsed?.adapters) ? parsed.adapters : [];
        return {
          adapters: arr.map((a: any) => {
            const { api_key_hash, ...rest } = a || {};
            return rest;
          }),
        };
      } catch (e: any) {
        return { adapters: [], error: e?.message };
      }
    },
  },

  // ---- Paperclip-8: company templates / spinup ----

  {
    name: 'spinup_templates_list',
    description: 'List the Cliphub-style company templates registered under ~/atlas/templates/company/. Each entry: { slug, name, description, agent_count, routine_count, goal_count }.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => (await api('GET', '/api/atlas/spinup/templates')),
  },
  {
    name: 'spinup_template_get',
    description: 'Return full content of one company template — orgchart, routines, budgets, goals, README.',
    inputSchema: {
      type: 'object',
      required: ['slug'],
      properties: { slug: { type: 'string' } },
    },
    handler: async (args) => (await api('GET', `/api/atlas/spinup/templates/${encodeURIComponent(args.slug)}`)),
  },
  {
    name: 'spinup_instantiate',
    description: 'Instantiate a company template into a new project. With dry_run=true, returns the plan describing every agent / budget / goal / routine that would be created and the target project_dir. Without dry_run, writes everything atomically with best-effort rollback on failure. Requires server ATLAS_ADMIN_TOKEN env var; uses the same header the budget admin routes use.',
    inputSchema: {
      type: 'object',
      required: ['template_slug', 'project_slug', 'project_name'],
      properties: {
        template_slug: { type: 'string', description: 'one of saas-vertical | marketplace | native-app' },
        project_slug:  { type: 'string', description: 'kebab-case 3-32 chars' },
        project_name:  { type: 'string' },
        dry_run:       { type: 'boolean', default: false },
      },
    },
    handler: async (args) => {
      const admin = process.env.ATLAS_ADMIN_TOKEN;
      if (!admin) return { ok: false, error: 'ATLAS_ADMIN_TOKEN not set on MCP server' };
      const res = await fetch(`${API}/api/atlas/spinup/instantiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-atlas-admin': admin },
        body: JSON.stringify(args),
      });
      const text = await res.text();
      try { return JSON.parse(text); } catch { return { ok: false, error: text.slice(0, 500) }; }
    },
  },
];

// ---- JSON-RPC plumbing ----

interface RpcRequest { jsonrpc: '2.0'; id?: number | string; method: string; params?: any }
interface RpcResponse { jsonrpc: '2.0'; id?: number | string | null; result?: any; error?: { code: number; message: string; data?: any } }

function ok(id: any, result: any): RpcResponse { return { jsonrpc: '2.0', id, result }; }
function err(id: any, code: number, message: string, data?: any): RpcResponse {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message, ...(data ? { data } : {}) } };
}

async function handle(req: RpcRequest): Promise<RpcResponse | null> {
  if (req.method === 'initialize') {
    return ok(req.id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: SERVER_INFO,
    });
  }
  if (req.method === 'notifications/initialized') {
    return null; // notification, no response
  }
  if (req.method === 'ping') {
    return ok(req.id, {});
  }
  if (req.method === 'tools/list') {
    return ok(req.id, {
      tools: TOOLS.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
    });
  }
  if (req.method === 'tools/call') {
    const name = req.params?.name;
    const args = req.params?.arguments || {};
    const tool = TOOLS.find(t => t.name === name);
    if (!tool) return err(req.id, -32601, `Unknown tool: ${name}`);
    try {
      const result = await tool.handler(args);
      return ok(req.id, {
        content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }],
      });
    } catch (e: any) {
      return ok(req.id, {
        content: [{ type: 'text', text: `Error: ${e.message}` }],
        isError: true,
      });
    }
  }
  return err(req.id, -32601, `Method not found: ${req.method}`);
}

// ---- stdio loop ----

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', async (chunk: string) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let req: RpcRequest;
    try { req = JSON.parse(line); }
    catch (e: any) {
      process.stdout.write(JSON.stringify(err(null, -32700, `Parse error: ${e.message}`)) + '\n');
      continue;
    }
    const res = await handle(req);
    if (res) process.stdout.write(JSON.stringify(res) + '\n');
  }
});

process.stdin.on('end', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT',  () => process.exit(0));

// Log startup banner to stderr (stdout reserved for JSON-RPC).
process.stderr.write(`[atlas-mcp] ready · ${TOOLS.length} tools · API=${API}\n`);
