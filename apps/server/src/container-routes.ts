import { db } from './db';
import {
  initContainerDatabase,
  upsertContainer,
  setContainerDisconnected,
  getAllContainers,
  getContainer,
  parsePlanqOrder,
  serializePlanqOrder,
  syncPlanqTasksFromParsed,
  getPlanqTasks,
  addPlanqTask,
  updatePlanqTask,
  deletePlanqTask,
  reorderPlanqTasks,
  type ContainerRow,
  type PlanqTaskRow,
} from './container-db';

// ── WebSocket connection stores ───────────────────────────────────────────────

// container_id → WebSocket (planq daemon connection)
const containerWsMap = new Map<string, any>();

// Set of dashboard client WebSocket connections
const dashboardWsClients = new Set<any>();

// Pending file I/O requests: request_id → { resolve, reject, timer }
const pendingFileRequests = new Map<string, {
  resolve: (content: string) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}>();

// Offline grace-period timers: container_id → timer
const offlineTimers = new Map<string, ReturnType<typeof setTimeout>>();

// ── Initialisation ────────────────────────────────────────────────────────────

export function initContainerRoutes(): void {
  initContainerDatabase();
  // Mark all containers offline on server restart
  db.prepare('UPDATE containers SET connected = 0').run();
}

// ── Dashboard broadcast helpers ───────────────────────────────────────────────

function broadcastDashboard(message: object): void {
  const payload = JSON.stringify(message);
  dashboardWsClients.forEach(ws => {
    try { ws.send(payload); } catch { dashboardWsClients.delete(ws); }
  });
}

interface DevcontainerInfo {
  host?: string;
  container_id?: string;
  workspace?: string;
  git_branch?: string;
}

function ensureContainerFromEvent(sourceApp: string, sessionId: string, dc?: DevcontainerInfo): void {
  const rows = db.prepare(
    'SELECT id, machine_hostname, container_hostname, active_session_ids FROM containers WHERE source_repo = ?'
  ).all(sourceApp) as any[];

  // If any container already claims this session, nothing to do
  for (const row of rows) {
    const ids: string[] = JSON.parse(row.active_session_ids || '[]');
    if (ids.includes(sessionId)) return;
  }

  const machineHostname = (dc?.host && dc.host !== 'unknown') ? dc.host : 'unknown';
  const containerHostname = dc?.container_id || 'unknown';

  // Find the best matching existing container to add this session to:
  // 1. Exact match on (machine_hostname, container_hostname) — same physical container
  // 2. Hostname-only match — same host, unknown container
  // 3. Any existing unknown stub
  let match: any =
    (machineHostname !== 'unknown' && containerHostname !== 'unknown'
      ? rows.find((r: any) => r.machine_hostname === machineHostname && r.container_hostname === containerHostname)
      : null) ??
    (machineHostname !== 'unknown'
      ? rows.find((r: any) => r.machine_hostname === machineHostname && r.container_hostname === 'unknown')
      : null) ??
    rows.find((r: any) => r.machine_hostname === 'unknown') ??
    null;

  if (match) {
    const ids: string[] = JSON.parse(match.active_session_ids || '[]');
    ids.push(sessionId);
    // Upgrade stub fields with real devcontainer info where we now know better
    db.prepare(`
      UPDATE containers SET
        active_session_ids = ?, last_seen = ?,
        machine_hostname  = CASE WHEN machine_hostname  = 'unknown' AND ? != 'unknown' THEN ? ELSE machine_hostname  END,
        container_hostname = CASE WHEN container_hostname = 'unknown' AND ? != 'unknown' THEN ? ELSE container_hostname END,
        workspace_host_path = COALESCE(workspace_host_path, ?),
        git_branch          = COALESCE(git_branch, ?)
      WHERE id = ?
    `).run(
      JSON.stringify(ids), Date.now(),
      machineHostname, machineHostname,
      containerHostname, containerHostname,
      dc?.workspace ?? null, dc?.git_branch ?? null,
      match.id,
    );
    const container = getContainer(match.id);
    if (container) broadcastDashboard({ type: 'container_update', data: buildContainerWithState(container) });
    return;
  }

  // No existing container — create one using whatever devcontainer info we have
  const idTaken = rows.some((r: any) => r.id === sourceApp);
  const newId = idTaken
    ? (containerHostname !== 'unknown' ? `${sourceApp}:${containerHostname}` : `${sourceApp}:unknown`)
    : sourceApp;

  db.prepare(`
    INSERT OR IGNORE INTO containers
      (id, source_repo, machine_hostname, container_hostname, workspace_host_path, git_branch, active_session_ids, last_seen, connected)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
  `).run(newId, sourceApp, machineHostname, containerHostname, dc?.workspace ?? null, dc?.git_branch ?? null, JSON.stringify([sessionId]), Date.now());

  const container = getContainer(newId);
  if (container) broadcastDashboard({ type: 'container_update', data: buildContainerWithState(container) });
}

export function broadcastAgentUpdate(data: {
  source_app: string;
  session_id: string;
  hook_event_type: string;
  payload: any;
  summary?: string;
}): void {
  ensureContainerFromEvent(data.source_app, data.session_id, data.payload?._devcontainer);

  // Derive status from hook event type
  let status: string | null = null;
  let last_prompt: string | null = null;
  let last_response_summary: string | null = null;

  if (data.hook_event_type === 'UserPromptSubmit') {
    status = 'busy';
    last_prompt = (data.payload?.prompt as string) ?? null;
  } else if (data.hook_event_type === 'Stop') {
    status = 'idle';
    last_response_summary = data.summary ?? null;
  } else if (data.hook_event_type === 'Notification') {
    const ntype = data.payload?.notification_type as string;
    if (ntype === 'permission_prompt') status = 'awaiting_input';
    else if (ntype === 'idle_prompt') status = 'idle';
  }

  if (status !== null) {
    broadcastDashboard({
      type: 'agent_update',
      data: {
        source_repo: data.source_app,
        session_id: data.session_id,
        status,
        last_prompt,
        last_response_summary,
      },
    });
  }
}

// ── Container WebSocket handlers ──────────────────────────────────────────────

export function handleContainerOpen(_ws: any): void {
  // Wait for first heartbeat to identify the container
}

export function handleContainerMessage(ws: any, raw: string | Buffer): void {
  let msg: any;
  try {
    msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString());
  } catch {
    return;
  }

  if (msg.type === 'heartbeat') {
    const containerId: string = msg.container_id;
    if (!containerId) return;

    // Cancel offline timer if pending
    const timer = offlineTimers.get(containerId);
    if (timer) { clearTimeout(timer); offlineTimers.delete(containerId); }

    // Register WS if not already
    if (!containerWsMap.has(containerId)) {
      containerWsMap.set(containerId, ws);
      ws.__containerId = containerId; // store for close handler
    }

    // Upsert container row
    const container = upsertContainer({
      id: containerId,
      source_repo: msg.source_repo ?? containerId,
      machine_hostname: msg.machine_hostname ?? 'unknown',
      container_hostname: msg.container_hostname ?? '',
      workspace_host_path: msg.workspace_host_path ?? null,
      git_branch: msg.git_branch ?? null,
      git_worktree: msg.git_worktree ?? null,
      git_commit_hash: msg.git_commit_hash ?? null,
      git_commit_message: msg.git_commit_message ?? null,
      git_staged_count: msg.git_staged_count ?? 0,
      git_staged_diffstat: msg.git_staged_diffstat ?? null,
      git_unstaged_count: msg.git_unstaged_count ?? 0,
      git_unstaged_diffstat: msg.git_unstaged_diffstat ?? null,
      planq_order: msg.planq_order ?? null,
      active_session_ids: Array.isArray(msg.active_session_ids) ? msg.active_session_ids : [],
      last_seen: Date.now(),
    });

    // Sync planq tasks from planq_order text
    if (msg.planq_order) {
      const items = parsePlanqOrder(msg.planq_order);
      syncPlanqTasksFromParsed(containerId, items);
    }

    // Remove sessions now claimed by this real container from any event-derived records
    // (stubs matched by unknown hostname, or by the same container_hostname)
    const claimedIds: string[] = Array.isArray(msg.active_session_ids) ? msg.active_session_ids : [];
    if (claimedIds.length > 0) {
      const sourceRepo: string = msg.source_repo ?? containerId;
      const containerHostname: string = msg.container_hostname ?? '';
      const stubs = db.prepare(`
        SELECT id, active_session_ids FROM containers
        WHERE source_repo = ? AND id != ?
          AND (machine_hostname = 'unknown' OR container_hostname = ? OR container_hostname = 'unknown')
      `).all(sourceRepo, containerId, containerHostname) as any[];
      for (const stubRow of stubs) {
        const stubIds: string[] = JSON.parse(stubRow.active_session_ids || '[]');
        const remaining = stubIds.filter((id: string) => !claimedIds.includes(id));
        if (remaining.length !== stubIds.length) {
          db.prepare('UPDATE containers SET active_session_ids = ? WHERE id = ?')
            .run(JSON.stringify(remaining), stubRow.id);
          const stub = getContainer(stubRow.id);
          if (stub) broadcastDashboard({ type: 'container_update', data: buildContainerWithState(stub) });
        }
      }
    }

    // Broadcast to dashboard clients
    const containerWithState = buildContainerWithState(container);
    broadcastDashboard({ type: 'container_update', data: containerWithState });
    return;
  }

  // File read response
  if (msg.type === 'file_read_response') {
    const pending = pendingFileRequests.get(msg.request_id);
    if (pending) {
      clearTimeout(pending.timer);
      pendingFileRequests.delete(msg.request_id);
      pending.resolve(msg.content ?? '');
    }
    return;
  }

  // File write ack
  if (msg.type === 'file_write_ack') {
    const pending = pendingFileRequests.get(msg.request_id);
    if (pending) {
      clearTimeout(pending.timer);
      pendingFileRequests.delete(msg.request_id);
      pending.resolve('');
    }
    return;
  }
}

export function handleContainerClose(ws: any): void {
  const containerId: string = ws.__containerId;
  if (!containerId) return;
  containerWsMap.delete(containerId);

  // Grace period before marking offline
  const timer = setTimeout(() => {
    offlineTimers.delete(containerId);
    setContainerDisconnected(containerId);
    const container = getContainer(containerId);
    if (container) {
      broadcastDashboard({ type: 'container_update', data: buildContainerWithState(container) });
    }
  }, 30_000);
  offlineTimers.set(containerId, timer);
}

// ── Dashboard WebSocket handlers ──────────────────────────────────────────────

export function handleDashboardOpen(ws: any): void {
  dashboardWsClients.add(ws);
  // Send initial state
  const containers = getAllContainers().map(buildContainerWithState);
  ws.send(JSON.stringify({ type: 'initial', data: containers }));
}

export function handleDashboardClose(ws: any): void {
  dashboardWsClients.delete(ws);
}

// ── File relay helpers ────────────────────────────────────────────────────────

async function relayFileRead(containerId: string, filename: string): Promise<string> {
  const ws = containerWsMap.get(containerId);
  if (!ws) throw new Error('Container offline');

  const requestId = crypto.randomUUID();
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingFileRequests.delete(requestId);
      reject(new Error('File read timeout'));
    }, 10_000);
    pendingFileRequests.set(requestId, { resolve, reject, timer });
    ws.send(JSON.stringify({ type: 'file_read', request_id: requestId, filename }));
  });
}

async function relayFileWrite(containerId: string, filename: string, content: string): Promise<void> {
  const ws = containerWsMap.get(containerId);
  if (!ws) throw new Error('Container offline');

  const requestId = crypto.randomUUID();
  await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingFileRequests.delete(requestId);
      reject(new Error('File write timeout'));
    }, 10_000);
    pendingFileRequests.set(requestId, { resolve, reject, timer });
    ws.send(JSON.stringify({ type: 'file_write', request_id: requestId, filename, content }));
  });
}

// ── Derived state builder ─────────────────────────────────────────────────────

interface SessionState {
  session_id: string;
  status: 'busy' | 'awaiting_input' | 'idle';
  last_prompt: string | null;
  last_response_summary: string | null;
  model_name: string | null;
  subagent_count: number;
}

interface ContainerWithState extends ContainerRow {
  sessions: SessionState[];
  overall_status: 'busy' | 'awaiting_input' | 'idle' | 'offline';
  planq_tasks: PlanqTaskRow[];
}

function buildContainerWithState(container: ContainerRow): ContainerWithState {
  const sessions = deriveSessionStates(container.source_repo, container.active_session_ids);

  let overall_status: 'busy' | 'awaiting_input' | 'idle' | 'offline' = 'offline';
  if (container.connected) {
    if (sessions.some(s => s.status === 'busy')) overall_status = 'busy';
    else if (sessions.some(s => s.status === 'awaiting_input')) overall_status = 'awaiting_input';
    else overall_status = 'idle';
  }

  const planq_tasks = getPlanqTasks(container.id);

  return { ...container, sessions, overall_status, planq_tasks };
}

function deriveSessionStates(sourceRepo: string, sessionIds: string[]): SessionState[] {
  if (!sessionIds.length) return [];

  const placeholders = sessionIds.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT session_id, hook_event_type, payload, summary, timestamp, model_name
    FROM events
    WHERE source_app = ? AND session_id IN (${placeholders})
    ORDER BY session_id, timestamp DESC
  `).all(sourceRepo, ...sessionIds) as any[];

  // Group by session_id, take most recent event per session
  const bySession = new Map<string, any[]>();
  for (const row of rows) {
    if (!bySession.has(row.session_id)) bySession.set(row.session_id, []);
    bySession.get(row.session_id)!.push(row);
  }

  const states: SessionState[] = [];
  for (const [sessionId, events] of bySession) {
    // Events are already sorted desc; first is most recent
    const latest = events[0];

    let status: 'busy' | 'awaiting_input' | 'idle' = 'idle';
    if (['UserPromptSubmit', 'PreToolUse', 'PostToolUse'].includes(latest.hook_event_type)) {
      // Check if there's a subsequent Stop/SessionEnd
      const hasStop = events.some(e => ['Stop', 'SessionEnd'].includes(e.hook_event_type)
        && e.timestamp > latest.timestamp);
      status = hasStop ? 'idle' : 'busy';
    } else if (latest.hook_event_type === 'Stop' || latest.hook_event_type === 'SessionEnd') {
      status = 'idle';
    } else if (latest.hook_event_type === 'Notification') {
      const payload = typeof latest.payload === 'string' ? JSON.parse(latest.payload) : latest.payload;
      status = payload?.notification_type === 'permission_prompt' ? 'awaiting_input' : 'idle';
    }

    // Last prompt from most recent UserPromptSubmit
    const promptEvent = events.find(e => e.hook_event_type === 'UserPromptSubmit');
    let last_prompt: string | null = null;
    if (promptEvent) {
      const payload = typeof promptEvent.payload === 'string' ? JSON.parse(promptEvent.payload) : promptEvent.payload;
      last_prompt = payload?.prompt ?? null;
    }

    // Last response summary from most recent Stop
    const stopEvent = events.find(e => e.hook_event_type === 'Stop');
    const last_response_summary = stopEvent?.summary ?? null;

    // Subagent count = SubagentStart - SubagentStop
    const subagentStarts = events.filter(e => e.hook_event_type === 'SubagentStart').length;
    const subagentStops = events.filter(e => e.hook_event_type === 'SubagentStop').length;
    const subagent_count = Math.max(0, subagentStarts - subagentStops);

    const model_name = events.find(e => e.model_name)?.model_name ?? null;

    states.push({ session_id: sessionId, status, last_prompt, last_response_summary, model_name, subagent_count });
  }

  // Also include session IDs from the list that have no events yet
  for (const id of sessionIds) {
    if (!bySession.has(id)) {
      states.push({ session_id: id, status: 'idle', last_prompt: null, last_response_summary: null, model_name: null, subagent_count: 0 });
    }
  }

  return states;
}

// ── HTTP route handler ────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function err(msg: string, status = 400): Response {
  return json({ error: msg }, status);
}

export async function handleContainerRequest(req: Request): Promise<Response | null> {
  const url = new URL(req.url);
  const { pathname, method } = { pathname: url.pathname, method: req.method };

  if (method === 'OPTIONS') {
    return new Response(null, { headers: CORS });
  }

  // GET /dashboard/containers
  if (pathname === '/dashboard/containers' && method === 'GET') {
    const containers = getAllContainers().map(buildContainerWithState);
    return json(containers);
  }

  // GET /planq/:id
  if (pathname.match(/^\/planq\/[^/]+$/) && method === 'GET') {
    const containerId = decodeURIComponent(pathname.split('/')[2]);
    const tasks = getPlanqTasks(containerId);
    return json(tasks);
  }

  // POST /planq/:id/tasks
  if (pathname.match(/^\/planq\/[^/]+\/tasks$/) && method === 'POST') {
    const containerId = decodeURIComponent(pathname.split('/')[2]);
    const container = getContainer(containerId);
    if (!container) return err('Container not found', 404);

    const body = await req.json() as any;
    const { task_type, filename, description } = body;
    if (!task_type) return err('task_type required');

    const task = addPlanqTask(containerId, task_type, filename ?? null, description ?? null);

    // Write updated planq file through daemon
    await writePlanqFile(containerId, container).catch(() => {});

    broadcastDashboard({ type: 'planq_update', data: { container_id: containerId, tasks: getPlanqTasks(containerId) } });
    return json(task, 201);
  }

  // PUT /planq/:id/tasks/:taskId
  if (pathname.match(/^\/planq\/[^/]+\/tasks\/\d+$/) && method === 'PUT') {
    const parts = pathname.split('/');
    const containerId = decodeURIComponent(parts[2]);
    const taskId = parseInt(parts[4]);
    const container = getContainer(containerId);
    if (!container) return err('Container not found', 404);

    const body = await req.json() as any;
    const task = updatePlanqTask(taskId, { description: body.description, status: body.status });
    if (!task) return err('Task not found', 404);

    await writePlanqFile(containerId, container).catch(() => {});
    broadcastDashboard({ type: 'planq_update', data: { container_id: containerId, tasks: getPlanqTasks(containerId) } });
    return json(task);
  }

  // DELETE /planq/:id/tasks/:taskId
  if (pathname.match(/^\/planq\/[^/]+\/tasks\/\d+$/) && method === 'DELETE') {
    const parts = pathname.split('/');
    const containerId = decodeURIComponent(parts[2]);
    const taskId = parseInt(parts[4]);
    const container = getContainer(containerId);
    if (!container) return err('Container not found', 404);

    const deleted = deletePlanqTask(taskId);
    if (!deleted) return err('Task not found', 404);

    await writePlanqFile(containerId, container).catch(() => {});
    broadcastDashboard({ type: 'planq_update', data: { container_id: containerId, tasks: getPlanqTasks(containerId) } });
    return json({ ok: true });
  }

  // POST /planq/:id/tasks/reorder
  if (pathname.match(/^\/planq\/[^/]+\/tasks\/reorder$/) && method === 'POST') {
    const containerId = decodeURIComponent(pathname.split('/')[2]);
    const container = getContainer(containerId);
    if (!container) return err('Container not found', 404);

    const body = await req.json() as any;
    if (!Array.isArray(body)) return err('Body must be array of {id, position}');
    reorderPlanqTasks(body);

    await writePlanqFile(containerId, container).catch(() => {});
    broadcastDashboard({ type: 'planq_update', data: { container_id: containerId, tasks: getPlanqTasks(containerId) } });
    return json({ ok: true });
  }

  // GET /planq/:id/file/:filename
  if (pathname.match(/^\/planq\/[^/]+\/file\/.+$/) && method === 'GET') {
    const parts = pathname.split('/');
    const containerId = decodeURIComponent(parts[2]);
    const filename = parts.slice(4).join('/'); // everything after /file/

    if (!containerWsMap.has(containerId)) return err('Container offline', 503);

    try {
      const content = await relayFileRead(containerId, filename);
      return new Response(content, { headers: { ...CORS, 'Content-Type': 'text/plain; charset=utf-8' } });
    } catch (e: any) {
      return err(e.message || 'File read failed', 503);
    }
  }

  // PUT /planq/:id/file/:filename
  if (pathname.match(/^\/planq\/[^/]+\/file\/.+$/) && method === 'PUT') {
    const parts = pathname.split('/');
    const containerId = decodeURIComponent(parts[2]);
    const filename = parts.slice(4).join('/');

    if (!containerWsMap.has(containerId)) return err('Container offline', 503);

    const content = await req.text();
    try {
      await relayFileWrite(containerId, filename, content);
      return json({ ok: true });
    } catch (e: any) {
      return err(e.message || 'File write failed', 503);
    }
  }

  return null; // not handled
}

// Write the planq-order.txt through the daemon for a given container
async function writePlanqFile(containerId: string, container: ContainerRow): Promise<void> {
  const tasks = getPlanqTasks(containerId);
  const content = serializePlanqOrder(tasks);

  // Determine filename based on git_worktree
  let filename = 'planq-order.txt';
  if (container.git_worktree) {
    const worktreeSuffix = container.git_worktree.replace(/^trees\//, '').replace(/\//g, '-');
    // If container_id ends with source_repo + something, use that suffix
    const suffix = containerId.replace(container.source_repo, '').replace(/^\./, '');
    if (suffix) filename = `planq-order-${suffix}.txt`;
    else filename = `planq-order-${worktreeSuffix}.txt`;
  }

  await relayFileWrite(containerId, filename, content);
}
