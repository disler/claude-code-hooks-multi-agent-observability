import { db } from './db';
import {
  initContainerDatabase,
  upsertContainer,
  setContainerDisconnected,
  getAllContainers,
  deleteContainer,
  getArchiveTasks,
  getContainer,
  parsePlanqOrder,
  serializePlanqOrder,
  syncPlanqTasksFromParsed,
  getPlanqTasks,
  addPlanqTask,
  updatePlanqTask,
  deletePlanqTask,
  reorderPlanqTasks,
  touchPlanqServerModified,
  getPlanqServerModifiedAt,
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
  // Only mark containers offline if they haven't been seen recently.
  // Using a 60s window (4x the heartbeat interval) avoids the race condition
  // where the dashboard loads during the brief window between server startup
  // and the first heartbeat from each daemon — which happens on every hot-reload.
  const cutoff = Date.now() - 60_000;
  const result = db.prepare('UPDATE containers SET connected = 0 WHERE last_seen < ?').run(cutoff);
  console.log(`[init] marked ${result.changes} stale container(s) offline (last_seen > 60s ago)`);
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
  const machineHostname = (dc?.host && dc.host !== 'unknown') ? dc.host : 'unknown';
  const containerHostname = dc?.container_id || 'unknown';
  const hasExplicitHost = machineHostname !== 'unknown' || containerHostname !== 'unknown';
  const evCtx = `source=${sourceApp} host=${machineHostname} container=${containerHostname} workspace=${dc?.workspace ?? '-'} session=${sessionId.slice(0,8)}`;

  const rows = db.prepare(
    'SELECT id, machine_hostname, container_hostname, active_session_ids FROM containers WHERE source_repo = ?'
  ).all(sourceApp) as any[];

  // Check if a container already claims this session. If so, verify it's the right one.
  // If the event has explicit host info and the claimant doesn't match, strip and re-assign.
  for (const row of rows) {
    const ids: string[] = JSON.parse(row.active_session_ids || '[]');
    if (!ids.includes(sessionId)) continue;

    const containerMatches = containerHostname !== 'unknown' && row.container_hostname === containerHostname;
    const machineMatches = machineHostname !== 'unknown' && row.machine_hostname === machineHostname;

    if (containerMatches || machineMatches || !hasExplicitHost) {
      console.log(`[ensureContainer] ${evCtx}: correctly claimed by id=${row.id} host=${row.machine_hostname} container=${row.container_hostname}`);
      return;
    }

    // Explicit host info contradicts the claimant — strip and re-assign
    console.log(`[ensureContainer] ${evCtx}: MISMATCH — claimed by id=${row.id} host=${row.machine_hostname} container=${row.container_hostname} — stripping and re-assigning`);
    const corrected = ids.filter(id => id !== sessionId);
    db.prepare('UPDATE containers SET active_session_ids = ? WHERE id = ?')
      .run(JSON.stringify(corrected), row.id);
    const wrongContainer = getContainer(row.id);
    if (wrongContainer) broadcastDashboard({ type: 'container_update', data: buildContainerWithState(wrongContainer) });
    break;
  }

  // Re-fetch after any strip above
  const freshRows = db.prepare(
    'SELECT id, machine_hostname, container_hostname, active_session_ids FROM containers WHERE source_repo = ?'
  ).all(sourceApp) as any[];

  console.log(`[ensureContainer] ${evCtx}: finding container among [${freshRows.map((r: any) => `${r.id}(host=${r.machine_hostname} container=${r.container_hostname})`).join(', ')}]`);

  let match: any = null;
  let matchDesc = '';

  if (hasExplicitHost) {
    // Event carries real host info — only match on that, never fall back to unknown stubs
    if (containerHostname !== 'unknown') {
      match = freshRows.find((r: any) => r.container_hostname === containerHostname) ?? null;
      if (match) matchDesc = `container_hostname=${containerHostname}`;
    }
    if (!match && machineHostname !== 'unknown') {
      match = freshRows.find((r: any) => r.machine_hostname === machineHostname && (r.container_hostname === 'unknown' || r.container_hostname === '')) ?? null;
      if (match) matchDesc = `machine_hostname=${machineHostname} (container unknown in DB)`;
    }
    if (!match) {
      console.log(`[ensureContainer] ${evCtx}: no container matched explicit host info — creating new row`);
    }
  } else {
    // No host info in payload — fall back to heuristics, log clearly
    match = freshRows.find((r: any) => r.machine_hostname === 'unknown' && r.container_hostname === 'unknown') ?? null;
    if (match) {
      matchDesc = `unknown stub id=${match.id}`;
      console.log(`[ensureContainer] ${evCtx}: payload has no host info — using unknown stub id=${match.id}`);
    } else if (freshRows.length === 1) {
      match = freshRows[0];
      matchDesc = `sole container id=${match.id} host=${match.machine_hostname}`;
      console.log(`[ensureContainer] ${evCtx}: payload has no host info — only one container, using id=${match.id} host=${match.machine_hostname} (heuristic)`);
    } else {
      console.log(`[ensureContainer] ${evCtx}: payload has no host info and ${freshRows.length} containers exist — creating stub`);
    }
  }

  if (match) {
    console.log(`[ensureContainer] ${evCtx}: → matched ${matchDesc}`);
    const ids: string[] = JSON.parse(match.active_session_ids || '[]');
    if (!ids.includes(sessionId)) ids.push(sessionId);
    db.prepare(`
      UPDATE containers SET
        active_session_ids = ?, last_seen = ?,
        machine_hostname   = CASE WHEN machine_hostname  = 'unknown' AND ? != 'unknown' THEN ? ELSE machine_hostname  END,
        container_hostname = CASE WHEN (container_hostname = 'unknown' OR container_hostname = '') AND ? != 'unknown' THEN ? ELSE container_hostname END,
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

  // No match — create new row with whatever info we have
  const idTaken = freshRows.some((r: any) => r.id === sourceApp);
  const newId = idTaken
    ? (containerHostname !== 'unknown' ? `${sourceApp}:${containerHostname}` : `${sourceApp}:unknown`)
    : sourceApp;

  console.log(`[ensureContainer] ${evCtx}: creating new row id=${newId}`);
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
  } else if (data.hook_event_type === 'SessionEnd') {
    status = 'terminated';
  } else if (data.hook_event_type === 'Notification') {
    const ntype = data.payload?.notification_type as string;
    if (ntype === 'permission_prompt') status = 'awaiting_input';
    else if (ntype === 'idle_prompt') status = 'idle';
  }

  if (status !== null) {
    // Log which containers will be affected by this agent_update on the client side
    // (client matches on source_repo + session_id in active_session_ids)
    const claimants = (db.prepare(
      'SELECT id, machine_hostname, container_hostname, workspace_host_path, active_session_ids FROM containers WHERE source_repo = ?'
    ).all(data.source_app) as any[]).filter((r: any) => {
      const ids: string[] = JSON.parse(r.active_session_ids || '[]');
      return ids.includes(data.session_id);
    });
    const claimantStr = claimants.length
      ? claimants.map((r: any) => `${r.id}(host=${r.machine_hostname} workspace=${r.workspace_host_path ?? '-'})`).join(', ')
      : 'none';
    console.log(`[agent_update] source=${data.source_app} session=${data.session_id.slice(0,8)} event=${data.hook_event_type} status=${status} → will update containers: [${claimantStr}]`);
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

export function handleContainerOpen(ws: any): void {
  const addr = (ws.data as any)?.addr ?? 'unknown';
  ws.__wsLabel = `container@${addr}`;
  console.log(`[ws-open] ${ws.__wsLabel}`);
}

export function handleContainerMessage(ws: any, raw: string | Buffer): void {
  let msg: any;
  try {
    msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString());
  } catch {
    return;
  }

  if (msg.type === 'heartbeat') {
    const claimedId: string = msg.container_id;
    if (!claimedId) return;

    const daemonSessionIds: string[] = Array.isArray(msg.active_session_ids) ? msg.active_session_ids : [];
    const sourceRepo: string = msg.source_repo ?? claimedId;
    const containerHostname: string = msg.container_hostname ?? '';

    // Resolve effective container ID.
    // Multiple physical containers can report the same container_id (same repo on different
    // machines, or multiple worktrees). Use container_hostname to give each its own stable row.
    let containerId = claimedId;
    if (containerHostname && containerHostname !== 'unknown') {
      // Check if a row already exists for this exact physical container
      const byHostname = db.prepare(
        'SELECT id FROM containers WHERE source_repo = ? AND container_hostname = ?'
      ).get(sourceRepo, containerHostname) as { id: string } | null;

      if (byHostname) {
        // Reuse the existing row (may be source_repo:hex from a prior stub or heartbeat)
        containerId = byHostname.id;
      } else {
        // Check whether the claimed row is already owned by a different container_hostname
        const claimedRow = db.prepare(
          'SELECT container_hostname FROM containers WHERE id = ?'
        ).get(claimedId) as { container_hostname: string } | null;
        const takenByOther = claimedRow?.container_hostname
          && claimedRow.container_hostname !== 'unknown'
          && claimedRow.container_hostname !== containerHostname;
        if (takenByOther) {
          containerId = `${sourceRepo}:${containerHostname}`;
          console.log(`[heartbeat] claimed id=${claimedId} already owned by container=${claimedRow!.container_hostname} — using id=${containerId}`);
        }
      }
    }

    const hbCtx = `id=${containerId} host=${msg.machine_hostname ?? 'unknown'} container=${containerHostname || '-'} workspace=${msg.workspace_host_path ?? '-'}`;

    // Cancel offline timer if pending
    const timer = offlineTimers.get(containerId);
    if (timer) {
      clearTimeout(timer);
      offlineTimers.delete(containerId);
      console.log(`[heartbeat] ${hbCtx}: cancelled pending offline timer (reconnected)`);
    }

    // Register WS if not already and update its label with full identity
    if (!containerWsMap.has(containerId)) {
      containerWsMap.set(containerId, ws);
      ws.__containerId = containerId;
      const addr = (ws.data as any)?.addr ?? 'unknown';
      ws.__wsLabel = `container@${addr} ${hbCtx}`;
      console.log(`[ws-identified] ${ws.__wsLabel}`);
    }

    const existingContainer = getContainer(containerId);

    // Warn if this heartbeat would overwrite an existing row's host/container identity
    if (existingContainer) {
      const hostChanging = existingContainer.machine_hostname !== 'unknown'
        && msg.machine_hostname
        && existingContainer.machine_hostname !== msg.machine_hostname;
      const containerChanging = existingContainer.container_hostname
        && existingContainer.container_hostname !== 'unknown'
        && containerHostname
        && containerHostname !== 'unknown'
        && existingContainer.container_hostname !== containerHostname;
      if (hostChanging || containerChanging) {
        console.log(`[heartbeat] ${hbCtx}: WARNING — overwriting existing row identity: was host=${existingContainer.machine_hostname} container=${existingContainer.container_hostname} workspace=${existingContainer.workspace_host_path ?? '-'}`);
      }
    }
    let mergedSessionIds = daemonSessionIds;
    if (existingContainer) {
      const toCheck = existingContainer.active_session_ids.filter(id => !daemonSessionIds.includes(id));
      if (toCheck.length > 0) {
        const cutoff = Date.now() - 4 * 60 * 60 * 1000;
        const placeholders = toCheck.map(() => '?').join(',');
        const recentRows = db.prepare(
          `SELECT DISTINCT session_id FROM events WHERE source_app = ? AND session_id IN (${placeholders}) AND timestamp >= ?`
        ).all(sourceRepo, ...toCheck, cutoff) as any[];
        const recentIds = recentRows.map((r: any) => r.session_id);
        if (recentIds.length > 0) mergedSessionIds = [...daemonSessionIds, ...recentIds];
      }
    }

    // Find stubs for the same physical container (same Docker container_hostname) and absorb
    // ALL their sessions. These stubs were created by hook events that arrived before the
    // heartbeat established the real container row, and must be deleted unconditionally.
    const sameContainerStubIds: string[] = [];
    if (containerHostname && containerHostname !== 'unknown') {
      const sameContainerStubs = db.prepare(`
        SELECT id, active_session_ids FROM containers
        WHERE source_repo = ? AND id != ? AND container_hostname = ?
      `).all(sourceRepo, containerId, containerHostname) as any[];
      for (const stubRow of sameContainerStubs) {
        sameContainerStubIds.push(stubRow.id);
        const stubIds: string[] = JSON.parse(stubRow.active_session_ids || '[]');
        const toAbsorb = stubIds.filter(id => !mergedSessionIds.includes(id));
        if (toAbsorb.length > 0) {
          console.log(`[heartbeat] ${hbCtx}: absorbing ${toAbsorb.length} session(s) from same-container stub ${stubRow.id}: [${toAbsorb.map(s => s.slice(0,8)).join(', ')}]`);
          mergedSessionIds = [...mergedSessionIds, ...toAbsorb];
        } else {
          console.log(`[heartbeat] ${hbCtx}: will delete empty same-container stub ${stubRow.id}`);
        }
      }
    } else {
      console.log(`[heartbeat] ${hbCtx}: container_hostname=${JSON.stringify(containerHostname)}, skipping same-container stub search`);
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
      git_submodules: Array.isArray(msg.git_submodules) ? msg.git_submodules : [],
      planq_order: msg.planq_order ?? null,
      planq_history: msg.planq_history ?? null,
      auto_test_pending: msg.auto_test_pending ?? null,
      active_session_ids: mergedSessionIds,
      running_session_ids: Array.isArray(msg.running_session_ids) ? msg.running_session_ids : [],
      last_seen: Date.now(),
    });

    console.log(`[heartbeat] ${hbCtx}: upserted connected=${container.connected} sessions=[${mergedSessionIds.map(s => s.slice(0,8)).join(', ')}] git: staged=${msg.git_staged_count ?? 'n/a'} unstaged=${msg.git_unstaged_count ?? 'n/a'} branch=${msg.git_branch ?? '-'}`);

    // Sync planq tasks from planq_order text — but only if the server hasn't made local
    // edits more recently (30s grace period avoids a race where the heartbeat file read
    // predates a server-initiated file write, which would revert server-side changes).
    if (msg.planq_order) {
      const lastServerEdit = getPlanqServerModifiedAt(containerId);
      if (Date.now() - lastServerEdit > 30_000) {
        const items = parsePlanqOrder(msg.planq_order);
        syncPlanqTasksFromParsed(containerId, items);
      }
    }

    // Delete same-container stubs — same physical Docker container absorbed into heartbeat container.
    for (const stubId of sameContainerStubIds) {
      const deleted = db.prepare('DELETE FROM containers WHERE id = ?').run(stubId);
      if (deleted.changes > 0) {
        console.log(`[heartbeat] ${hbCtx}: deleted same-container stub ${stubId}`);
        broadcastDashboard({ type: 'container_removed', data: { id: stubId } });
      }
    }

    // Also remove claimed sessions from any remaining unknown-hostname stubs.
    const claimedIds: string[] = Array.isArray(msg.active_session_ids) ? msg.active_session_ids : [];
    if (claimedIds.length > 0) {
      const unknownStubs = db.prepare(`
        SELECT id, active_session_ids FROM containers
        WHERE source_repo = ? AND id != ?
          AND (machine_hostname = 'unknown' OR container_hostname = 'unknown')
      `).all(sourceRepo, containerId) as any[];
      for (const stubRow of unknownStubs) {
        if (sameContainerStubIds.includes(stubRow.id)) continue; // already deleted
        const stubIds: string[] = JSON.parse(stubRow.active_session_ids || '[]');
        const remaining = stubIds.filter((id: string) => !claimedIds.includes(id));
        if (remaining.length !== stubIds.length) {
          if (remaining.length === 0) {
            const deleted = db.prepare(
              'DELETE FROM containers WHERE id = ? AND connected = 0'
            ).run(stubRow.id);
            if (deleted.changes > 0) {
              console.log(`[heartbeat] ${hbCtx}: deleted emptied unknown stub ${stubRow.id}`);
              broadcastDashboard({ type: 'container_removed', data: { id: stubRow.id } });
              continue;
            }
          }
          console.log(`[heartbeat] ${hbCtx}: removed ${stubIds.length - remaining.length} claimed session(s) from unknown stub ${stubRow.id}`);
          db.prepare('UPDATE containers SET active_session_ids = ? WHERE id = ?')
            .run(JSON.stringify(remaining), stubRow.id);
          const stub = getContainer(stubRow.id);
          if (stub) broadcastDashboard({ type: 'container_update', data: buildContainerWithState(stub) });
        }
      }
    } else if (mergedSessionIds.length === 0) {
      console.log(`[heartbeat] ${hbCtx}: daemon reported 0 sessions, skipping unknown-stub cleanup`);
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

  // File list response
  if (msg.type === 'file_list_response') {
    const pending = pendingFileRequests.get(msg.request_id);
    if (pending) {
      clearTimeout(pending.timer);
      pendingFileRequests.delete(msg.request_id);
      pending.resolve(JSON.stringify(Array.isArray(msg.files) ? msg.files : []));
    }
    return;
  }

  // File write-new ack (non-overwriting write; returns actual filename used)
  if (msg.type === 'file_write_new_ack') {
    const pending = pendingFileRequests.get(msg.request_id);
    if (pending) {
      clearTimeout(pending.timer);
      pendingFileRequests.delete(msg.request_id);
      if (msg.ok) {
        pending.resolve(msg.filename ?? '');
      } else {
        pending.reject(new Error(msg.error ?? 'File write failed'));
      }
    }
    return;
  }
}

export function handleContainerClose(ws: any): void {
  const containerId: string = ws.__containerId;
  if (!containerId) {
    // WS closed before it ever sent a heartbeat
    console.log(`[ws-close] ${ws.__wsLabel ?? `container@${(ws.data as any)?.addr ?? 'unknown'}`}: closed before identifying`);
    return;
  }
  containerWsMap.delete(containerId);
  // Grace period before marking offline
  const timer = setTimeout(() => {
    offlineTimers.delete(containerId);
    const offlineRow = getContainer(containerId);
    const offCtx = offlineRow
      ? `id=${containerId} host=${offlineRow.machine_hostname} container=${offlineRow.container_hostname || '-'} workspace=${offlineRow.workspace_host_path ?? '-'}`
      : `id=${containerId}`;
    console.log(`[offline] ${offCtx}: grace period expired, marking disconnected`);
    setContainerDisconnected(containerId);
    if (offlineRow) {
      broadcastDashboard({ type: 'container_update', data: buildContainerWithState(offlineRow) });
    }
  }, 30_000);
  offlineTimers.set(containerId, timer);
}

// ── Dashboard WebSocket handlers ──────────────────────────────────────────────

export function handleDashboardOpen(ws: any): void {
  dashboardWsClients.add(ws);
  const containers = getAllContainers().map(buildContainerWithState);
  const addr = (ws.data as any)?.addr ?? 'unknown';
  const summary = containers.map(c => `${c.id}(connected=${c.connected},status=${c.status})`).join(', ');
  console.log(`[dashboard-open] ${addr}: sending initial with ${containers.length} container(s): [${summary}]`);
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

function ensureTrailingNewline(content: string): string {
  return content.endsWith('\n') ? content : content + '\n';
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
    ws.send(JSON.stringify({ type: 'file_write', request_id: requestId, filename, content: ensureTrailingNewline(content) }));
  });
}

// Write to a new file only — daemon picks a non-conflicting name and returns it.
async function relayFileWriteNew(containerId: string, filename: string, content: string): Promise<string> {
  const ws = containerWsMap.get(containerId);
  if (!ws) throw new Error('Container offline');

  const requestId = crypto.randomUUID();
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingFileRequests.delete(requestId);
      reject(new Error('File write timeout'));
    }, 10_000);
    pendingFileRequests.set(requestId, { resolve, reject, timer });
    ws.send(JSON.stringify({ type: 'file_write_new', request_id: requestId, filename, content: ensureTrailingNewline(content) }));
  });
}

async function relayFileList(containerId: string): Promise<string[]> {
  const ws = containerWsMap.get(containerId);
  if (!ws) throw new Error('Container offline');

  const requestId = crypto.randomUUID();
  const serialized = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingFileRequests.delete(requestId);
      reject(new Error('File list timeout'));
    }, 10_000);
    pendingFileRequests.set(requestId, { resolve, reject, timer });
    ws.send(JSON.stringify({ type: 'file_list', request_id: requestId }));
  });
  return JSON.parse(serialized) as string[];
}

// ── Derived state builder ─────────────────────────────────────────────────────

interface SessionState {
  session_id: string;
  status: 'busy' | 'awaiting_input' | 'idle' | 'terminated';
  last_prompt: string | null;
  last_response_summary: string | null;
  model_name: string | null;
  subagent_count: number;
  last_event_at: number | null;
}

interface ContainerWithState extends ContainerRow {
  sessions: SessionState[];
  status: 'busy' | 'awaiting_input' | 'idle' | 'offline';
  planq_tasks: PlanqTaskRow[];
  // auto_test_pending is already in ContainerRow via the spread
}

function buildContainerWithState(container: ContainerRow): ContainerWithState {
  const sessions = deriveSessionStates(container.source_repo, container.active_session_ids);

  let status: 'busy' | 'awaiting_input' | 'idle' | 'offline' = 'offline';
  if (container.connected) {
    if (sessions.some(s => s.status === 'busy')) status = 'busy';
    else if (sessions.some(s => s.status === 'awaiting_input')) status = 'awaiting_input';
    else status = 'idle';
  }

  const planq_tasks = getPlanqTasks(container.id);

  return { ...container, sessions, status, planq_tasks };
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

    let status: 'busy' | 'awaiting_input' | 'idle' | 'terminated' = 'idle';
    if (['UserPromptSubmit', 'PreToolUse', 'PostToolUse'].includes(latest.hook_event_type)) {
      // Check if there's a subsequent Stop/SessionEnd
      const hasStop = events.some(e => ['Stop', 'SessionEnd'].includes(e.hook_event_type)
        && e.timestamp > latest.timestamp);
      status = hasStop ? 'idle' : 'busy';
    } else if (latest.hook_event_type === 'SessionEnd') {
      status = 'terminated';
    } else if (latest.hook_event_type === 'Stop') {
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
    const last_event_at: number | null = latest.timestamp ?? null;

    states.push({ session_id: sessionId, status, last_prompt, last_response_summary, model_name, subagent_count, last_event_at });
  }

  // Also include session IDs from the list that have no events yet — show as idle until hooks say otherwise
  for (const id of sessionIds) {
    if (!bySession.has(id)) {
      states.push({ session_id: id, status: 'idle', last_prompt: null, last_response_summary: null, model_name: null, subagent_count: 0, last_event_at: null });
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

  // DELETE /dashboard/containers/:id — discard a container (e.g. stale offline entry)
  if (pathname.startsWith('/dashboard/containers/') && method === 'DELETE') {
    const containerId = decodeURIComponent(pathname.slice('/dashboard/containers/'.length));
    const container = getContainer(containerId);
    if (!container) return err('Container not found', 404);
    if (container.connected) return err('Cannot delete a connected container', 409);
    deleteContainer(containerId);
    console.log(`[dashboard] deleted offline container id=${containerId}`);
    broadcastDashboard({ type: 'container_removed', data: { id: containerId } });
    return json({ ok: true });
  }

  // GET /planq/:id
  if (pathname.match(/^\/planq\/[^/]+$/) && method === 'GET') {
    const containerId = decodeURIComponent(pathname.split('/')[2]);
    const tasks = getPlanqTasks(containerId);
    return json(tasks);
  }

  // GET /planq/:id/archive
  if (pathname.match(/^\/planq\/[^/]+\/archive$/) && method === 'GET') {
    const containerId = decodeURIComponent(pathname.split('/')[2]);
    const tasks = getArchiveTasks(containerId);
    return json(tasks);
  }

  // POST /planq/:id/tasks
  if (pathname.match(/^\/planq\/[^/]+\/tasks$/) && method === 'POST') {
    const containerId = decodeURIComponent(pathname.split('/')[2]);
    const container = getContainer(containerId);
    if (!container) return err('Container not found', 404);

    const body = await req.json() as any;
    const { task_type, description, create_file } = body;
    let { filename } = body;
    if (!task_type) return err('task_type required');

    // For named tasks: if create_file is set, write the description to a new file
    // (daemon picks a non-conflicting name and returns the actual filename used).
    if (create_file && filename && description && containerWsMap.has(containerId)) {
      const actualFn = await relayFileWriteNew(containerId, filename, description).catch(() => null);
      if (actualFn) filename = actualFn;
    }

    const task = addPlanqTask(containerId, task_type, filename ?? null, description ?? null);
    touchPlanqServerModified(containerId);
    // For make-plan, write the prompt to the filename directly (filename IS make-plan-*.md)
    if (task_type === 'make-plan' && filename && description) {
      await relayFileWrite(containerId, filename, description).catch(() => {});
    }

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
    touchPlanqServerModified(containerId);

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
    touchPlanqServerModified(containerId);

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
    touchPlanqServerModified(containerId);

    await writePlanqFile(containerId, container).catch(() => {});
    broadcastDashboard({ type: 'planq_update', data: { container_id: containerId, tasks: getPlanqTasks(containerId) } });
    return json({ ok: true });
  }

  // POST /planq/:id/auto-test/respond
  if (pathname.match(/^\/planq\/[^/]+\/auto-test\/respond$/) && method === 'POST') {
    const containerId = decodeURIComponent(pathname.split('/')[2]);
    if (!containerWsMap.has(containerId)) return err('Container offline', 503);
    const body = await req.json() as any;
    const response: string = body.response === 'abort' ? 'abort' : 'continue';
    try {
      await relayFileWrite(containerId, 'auto-test-response.txt', response);
      return json({ ok: true });
    } catch (e: any) {
      return err(e.message || 'Write failed', 503);
    }
  }

  // GET /planq/:id/plans-files
  if (pathname.match(/^\/planq\/[^/]+\/plans-files$/) && method === 'GET') {
    const containerId = decodeURIComponent(pathname.split('/')[2]);
    if (!containerWsMap.has(containerId)) return err('Container offline', 503);
    try {
      const files = await relayFileList(containerId);
      return json(files);
    } catch (e: any) {
      return err(e.message || 'File list failed', 503);
    }
  }

  // GET /planq/:id/file/:filename
  if (pathname.match(/^\/planq\/[^/]+\/file\/.+$/) && method === 'GET') {
    const parts = pathname.split('/');
    const containerId = decodeURIComponent(parts[2]);
    const filename = parts.slice(4).join('/'); // everything after /file/

    if (!containerWsMap.has(containerId)) return err('Container offline', 503);

    try {
      const content = await relayFileRead(containerId, filename);
      return json({ content });
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

    const body = await req.json() as any;
    const content = body.content ?? '';
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
async function writePlanqFile(containerId: string, _container: ContainerRow): Promise<void> {
  const tasks = getPlanqTasks(containerId);
  const content = serializePlanqOrder(tasks);
  await relayFileWrite(containerId, 'planq-order.txt', content);
}
