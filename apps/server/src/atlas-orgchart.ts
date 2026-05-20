// atlas-orgchart.ts
//
// Paperclip → Atlas integration, slice 1: READ-ONLY org-chart view.
//
// Source of truth: ~/atlas/memory/agents.json (seeded with the 9 canonical
// Atlas agents from CLAUDE.md). Live status is derived by scanning the
// observability event store (events.db) for events in the last 60s.
//
// Status rules:
//   - blocked  : last event payload (within window) contains "BLOCKED"
//   - running  : at least one event seen in window
//   - idle     : no event seen in window (default state from agents.json)
//
// Out of scope this slice: mutations, agent reassignment, ticket pinning,
// historical timelines. Only GET endpoints.
//
// Endpoints (mounted in index.ts):
//   GET /api/atlas/orgchart                  → full tree + flat list
//   GET /api/atlas/orgchart/events?agent=X   → last N events for one agent
//
// AgentNode shape returned by /orgchart:
//   { id, name, role, reports_to, status, current_ticket_id, color, children: AgentNode[] }

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { Database } from 'bun:sqlite';

const ATLAS_HOME = process.env.ATLAS_HOME || '/Users/hrmacnair/atlas';
const AGENTS_FILE = join(ATLAS_HOME, 'memory', 'agents.json');

// Window for "is this agent active right now?" derivation.
const LIVE_WINDOW_MS = 60_000;

// ---------- types ----------------------------------------------------------

export type AgentStatus = 'idle' | 'running' | 'blocked';

export interface AgentSeed {
  id: string;
  name: string;
  role: string;
  reports_to: string | null;
  status: AgentStatus;
  current_ticket_id: string | null;
  avatar: string | null;
  color: string;
}

export interface AgentNode extends AgentSeed {
  children: AgentNode[];
}

export interface OrgChartView {
  root: AgentNode | null;
  generatedAt: string;
  agents: AgentNode[];
}

export interface AgentEvent {
  id: number;
  ts: number;
  source_app: string;
  hook_event_type: string;
  session_id: string;
  summary: string | null;
  payload: Record<string, unknown>;
}

// ---------- agent file -----------------------------------------------------

function readAgentSeeds(): AgentSeed[] {
  try {
    if (!existsSync(AGENTS_FILE)) return [];
    const raw = readFileSync(AGENTS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.agents) ? parsed.agents : [];
    return arr.filter((a: any) => a && typeof a.id === 'string').map((a: any) => ({
      id: String(a.id),
      name: String(a.name || a.id),
      role: String(a.role || ''),
      reports_to: a.reports_to ? String(a.reports_to) : null,
      status: (a.status === 'running' || a.status === 'blocked') ? a.status : 'idle',
      current_ticket_id: a.current_ticket_id ? String(a.current_ticket_id) : null,
      avatar: a.avatar ? String(a.avatar) : null,
      color: String(a.color || '#888888'),
    }));
  } catch {
    return [];
  }
}

// ---------- live status from events.db -------------------------------------

// The events table stores `payload` as JSON text. Atlas event producers
// embed an `agent` field (e.g. "ops", "producer", "scout") — confirmed from
// atlas-scheduler ScheduledMissionRan / ScheduledMissionStarted samples.
// We normalise to lowercase and strip a leading '@' so "@Scout", "Scout",
// and "scout" all collapse to "scout".
function normaliseAgentTag(s: string | undefined | null): string | null {
  if (!s || typeof s !== 'string') return null;
  const trimmed = s.trim().toLowerCase().replace(/^@/, '');
  return trimmed || null;
}

interface LiveSignal {
  status: AgentStatus;
  latestTs: number;
}

function readLiveSignals(agentIds: string[]): Map<string, LiveSignal> {
  const out = new Map<string, LiveSignal>();
  if (agentIds.length === 0) return out;
  let db: Database | null = null;
  try {
    db = new Database('events.db', { readonly: true });
    const sinceMs = Date.now() - LIVE_WINDOW_MS;
    const rows = db
      .prepare(
        `SELECT payload, timestamp FROM events
         WHERE timestamp >= ?
         ORDER BY timestamp ASC`
      )
      .all(sinceMs) as Array<{ payload: string; timestamp: number }>;

    const idSet = new Set(agentIds);
    for (const row of rows) {
      let p: any = null;
      try { p = JSON.parse(row.payload); } catch { continue; }
      if (!p || typeof p !== 'object') continue;

      const tag = normaliseAgentTag(p.agent || p.owner || p.assignee);
      if (!tag || !idSet.has(tag)) continue;

      const blocked = typeof row.payload === 'string' && /\bBLOCKED\b/.test(row.payload);
      const status: AgentStatus = blocked ? 'blocked' : 'running';
      out.set(tag, { status, latestTs: row.timestamp });
    }
  } catch {
    // events.db unreadable → every agent stays idle. Non-fatal.
  } finally {
    try { db?.close(); } catch {}
  }
  return out;
}

// ---------- tree build -----------------------------------------------------

function buildTree(seeds: AgentSeed[], live: Map<string, LiveSignal>): {
  root: AgentNode | null;
  flat: AgentNode[];
} {
  const nodes = new Map<string, AgentNode>();
  for (const seed of seeds) {
    const signal = live.get(seed.id);
    const status: AgentStatus = signal ? signal.status : 'idle';
    nodes.set(seed.id, { ...seed, status, children: [] });
  }

  let root: AgentNode | null = null;
  for (const node of nodes.values()) {
    if (node.reports_to === null) {
      // First reports_to=null wins as root. Multiple null entries → only
      // one becomes root; others float as orphan top-level cards.
      if (root === null) root = node;
      continue;
    }
    const parent = nodes.get(node.reports_to);
    if (parent) parent.children.push(node);
  }

  return { root, flat: Array.from(nodes.values()) };
}

// ---------- public api -----------------------------------------------------

export function getOrgChart(): OrgChartView {
  const seeds = readAgentSeeds();
  const live = readLiveSignals(seeds.map(s => s.id));
  const { root, flat } = buildTree(seeds, live);
  return {
    root,
    generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    agents: flat,
  };
}

// Last N events for one agent. Used by the OrgChartView drawer.
// Defaults: limit 10, capped at 100.
export function getAgentEvents(agentId: string, limit = 10): AgentEvent[] {
  const norm = normaliseAgentTag(agentId);
  if (!norm) return [];
  const lim = Math.max(1, Math.min(100, Math.floor(limit) || 10));
  let db: Database | null = null;
  const out: AgentEvent[] = [];
  try {
    db = new Database('events.db', { readonly: true });
    // Tag lives inside JSON payload — pre-filter by LIKE to cut scan size,
    // then verify exact match in JS. Cheap, correct, no JSON1 dependency.
    const rows = db
      .prepare(
        `SELECT id, timestamp, source_app, hook_event_type, session_id, summary, payload
         FROM events
         WHERE payload LIKE ?
         ORDER BY timestamp DESC
         LIMIT ?`
      )
      .all(`%"agent"%`, lim * 5) as Array<{
        id: number;
        timestamp: number;
        source_app: string;
        hook_event_type: string;
        session_id: string;
        summary: string | null;
        payload: string;
      }>;

    for (const row of rows) {
      if (out.length >= lim) break;
      let p: any = null;
      try { p = JSON.parse(row.payload); } catch { continue; }
      if (!p || typeof p !== 'object') continue;
      const tag = normaliseAgentTag(p.agent || p.owner || p.assignee);
      if (tag !== norm) continue;
      out.push({
        id: row.id,
        ts: row.timestamp,
        source_app: row.source_app,
        hook_event_type: row.hook_event_type,
        session_id: row.session_id,
        summary: row.summary,
        payload: p,
      });
    }
  } catch {
    // swallow — return whatever we collected (possibly empty)
  } finally {
    try { db?.close(); } catch {}
  }
  return out;
}
