import { db } from './db';
import { mkdirSync, unlinkSync } from 'node:fs';
import {
  initContainerDatabase,
  upsertContainer,
  touchContainerSeen,
  setContainerDisconnected,
  getAllContainers,
  deleteContainer,
  mergeContainerSessions,
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
  archiveTask,
  archiveDoneTasks,
  touchPlanqServerModified,
  getPlanqServerModifiedAt,
  setPlanqLastSynced,
  getPlanqLastSynced,
  upsertGitCommits,
  getGitCommits,
  getGitTips,
  upsertGitCommitRefs,
  getGitCommitRefs,
  upsertHostSourceReport,
  getAllHostSourceReports,
  insertPendingDashboardChange,
  getPendingDashboardChanges,
  markPendingChangesSent,
  ackPendingDashboardChanges,
  cleanupOldPendingChanges,
  reapplyPendingChangesToProjection,
  upsertSessionLog,
  getSessionLog,
  touchSessionLogAccessed,
  getSessionLogsByContainer,
  listSessionLogsOlderThan,
  deleteSessionLogs,
  addTaskSessionLink,
  addCommitSessionLink,
  getSessionsForTask,
  getTasksForSession,
  getCommitsForSession,
  type ChangeRequest,
  type ContainerRow,
  type PlanqTaskRow,
  type PlanqItem,
  type StoredGitCommit,
  type HostSourceReport,
} from './container-db';

// ── Heartbeat change detection ────────────────────────────────────────────────
// Returns true if the incoming heartbeat data differs from the stored row in any
// way that warrants a DB write and dashboard broadcast.
function containerDataChanged(
  existing: ContainerRow,
  msg: { machine_hostname?: string; container_hostname?: string; workspace_host_path?: string;
         git_branch?: string; git_commit_hash?: string; git_staged_count?: number;
         git_unstaged_count?: number; git_staged_diffstat?: string; git_unstaged_diffstat?: string;
         versions?: Record<string, string>; planq_order?: string; review_state?: unknown;
         test_results?: unknown; auto_test_pending?: unknown; running_session_ids?: string[] },
  resolvedMachineHostname: string,
  mergedSessionIds: string[],
): boolean {
  if (!existing.connected) return true; // was offline — must reconnect
  // Sort session arrays for stable comparison
  const sortedMerged = [...mergedSessionIds].sort().join(',');
  const sortedExisting = [...existing.active_session_ids].sort().join(',');
  const sortedRunning = [...(Array.isArray(msg.running_session_ids) ? msg.running_session_ids : [])].sort().join(',');
  const sortedExistingRunning = [...(existing.running_session_ids ?? [])].sort().join(',');
  return (
    existing.machine_hostname       !== resolvedMachineHostname ||
    existing.container_hostname     !== (msg.container_hostname ?? '') ||
    existing.workspace_host_path    !== (msg.workspace_host_path ?? null) ||
    existing.git_branch             !== (msg.git_branch ?? null) ||
    existing.git_commit_hash        !== (msg.git_commit_hash ?? null) ||
    existing.git_staged_count       !== (msg.git_staged_count ?? 0) ||
    existing.git_unstaged_count     !== (msg.git_unstaged_count ?? 0) ||
    existing.git_staged_diffstat    !== (msg.git_staged_diffstat ?? null) ||
    existing.git_unstaged_diffstat  !== (msg.git_unstaged_diffstat ?? null) ||
    sortedExisting                  !== sortedMerged ||
    sortedExistingRunning           !== sortedRunning ||
    JSON.stringify(existing.versions ?? {}) !== JSON.stringify(msg.versions ?? {}) ||
    existing.planq_order            !== (msg.planq_order ?? null) ||
    existing.review_state           !== (msg.review_state != null ? JSON.stringify(msg.review_state) : null) ||
    existing.test_results           !== (Array.isArray(msg.test_results) ? JSON.stringify(msg.test_results) : null) ||
    existing.auto_test_pending      !== (msg.auto_test_pending ? JSON.stringify(msg.auto_test_pending) : null)
  );
}

// ── Git show cache (LRU-style, max 200 entries) ───────────────────────────────
const gitShowCache = new Map<string, { diffstat: string; message: string }>();

// ── Branch update tracking (in-memory, per repo per host) ─────────────────────
// Records timestamp of the last heartbeat where a host sent new commits.
// sourceRepo → host → epoch ms
const branchLastCommit = new Map<string, Map<string, number>>();

// ── GitHub PR cache (in-memory, 5-minute TTL) ─────────────────────────────────
interface GithubPrData { prs: Array<{ branch: string; number: number; url: string; state: string; draft: boolean }> }
const githubPrCache = new Map<string, { fetchedAt: number; data: GithubPrData }>();

// ── Planq sync tracking (in-memory) ───────────────────────────────────────────
// Records timestamp of the last successful planq file write to each daemon.
// Used to detect unsynced server-side changes on daemon reconnection.
// containerId → epoch ms
const planqSyncedAt = new Map<string, number>();

// ── ChangeRequest helpers ─────────────────────────────────────────────────────

let _crSeq = 0;
function crId(): string {
  return `cr_${Date.now()}_${(++_crSeq).toString(36)}`;
}

/** Send apply_changes to the container and record in pending_dashboard_changes. */
function sendApplyChanges(containerId: string, changes: ChangeRequest[]): void {
  if (!changes.length) return;
  for (const c of changes) insertPendingDashboardChange(containerId, c);
  const ws = containerWsMap.get(containerId);
  if (!ws) return; // changes stored; will drain on reconnect
  try {
    ws.send(JSON.stringify({ type: 'apply_changes', changes }));
    markPendingChangesSent(changes.map(c => c.id));
  } catch {
    // send failed; changes remain as 'pending' and will be retried on reconnect
  }
}

// ── Session log filesystem cache ──────────────────────────────────────────────
// Stored under data/session-logs/ next to the server's working directory.
// Configurable via OBSERVABILITY_DATA_DIR env var.

const SESSION_LOG_DIR = (() => {
  const base = process.env.OBSERVABILITY_DATA_DIR ?? 'data';
  return `${base}/session-logs`;
})();

const SESSION_LOG_TTL_DAYS = parseInt(process.env.OBSERVABILITY_SESSION_LOG_TTL_DAYS ?? '30', 10);

// Ensure the session-logs directory exists on startup (best-effort)
try { mkdirSync(SESSION_LOG_DIR, { recursive: true }); } catch {}

/** Path to the on-disk JSONL file for a session. */
function sessionLogPath(sessionId: string): string {
  return `${SESSION_LOG_DIR}/${sessionId}.jsonl`;
}

/** Write (or append) session log content to the filesystem and update DB index. */
async function writeSessionLogFile(
  sessionId: string,
  containerId: string,
  sourceRepo: string,
  lineOffset: number,
  lineCount: number,
  content: string,
  isComplete: boolean,
): Promise<void> {
  const path = sessionLogPath(sessionId);
  if (lineOffset === 0) {
    // First chunk — full overwrite
    await Bun.write(path, content);
  } else {
    // Incremental append
    const existing = Bun.file(path);
    const existingContent = (await existing.exists()) ? await existing.text() : '';
    await Bun.write(path, existingContent + content);
  }
  const fileSize = (await Bun.file(path).stat()).size;
  // total_lines stores lines-received-so-far, used for alignment checks and acks.
  upsertSessionLog({
    session_id: sessionId,
    container_id: containerId,
    source_repo: sourceRepo,
    total_lines: lineOffset + lineCount,
    file_size: fileSize,
    is_complete: isComplete,
    last_pushed: Date.now(),
  });
}

/**
 * Scan JSONL session log content for references to planq task filenames or descriptions.
 * Returns task IDs that are mentioned in the content.
 */
function findTaskRefsInSessionContent(content: string, containerId: string): number[] {
  const tasks = getPlanqTasks(containerId);
  if (tasks.length === 0) return [];

  // Extract all text from JSONL lines (user messages, assistant text, tool inputs)
  const textParts: string[] = [];
  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    try {
      const obj = JSON.parse(line);
      const msg = obj.message;
      if (!msg) continue;
      const extractContent = (c: any) => {
        if (typeof c === 'string') { textParts.push(c); return; }
        if (!Array.isArray(c)) return;
        for (const part of c) {
          if (part.type === 'text' && part.text) textParts.push(part.text);
          else if (part.type === 'tool_use' && part.input) {
            // tool input values (e.g. Bash command, file path)
            for (const v of Object.values(part.input as Record<string, any>)) {
              if (typeof v === 'string') textParts.push(v);
            }
          }
        }
      };
      extractContent(msg.content);
    } catch {}
  }

  if (textParts.length === 0) return [];
  const combined = textParts.join('\n');

  // Match tasks whose filename or description appears in the combined text
  const matched: number[] = [];
  for (const task of tasks) {
    const needle = task.filename ?? task.description;
    if (needle && combined.includes(needle)) matched.push(task.id);
  }
  return matched;
}

/** Handle session_log_push from daemon. */
async function handleSessionLogPush(ws: any, msg: any): Promise<void> {
  const containerId: string = ws.__containerId;
  if (!containerId) return;
  const container = getContainer(containerId);
  if (!container) return;

  const sessionId: string = msg.session_id ?? '';
  if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) return;

  const lineOffset: number = Math.max(0, parseInt(msg.line_offset ?? '0', 10) || 0);
  const content: string = msg.content ?? '';
  const isComplete: boolean = Boolean(msg.is_complete);

  // line_count from daemon; fall back to counting newlines in content.
  const lineCount: number = msg.line_count != null
    ? Math.max(0, parseInt(msg.line_count, 10) || 0)
    : content.split('\n').filter(Boolean).length;

  // Verify alignment for every chunk (including the first incremental one).
  // total_lines in the DB records lines-received-so-far, so it must equal lineOffset.
  if (lineOffset > 0) {
    const existing = getSessionLog(sessionId);
    if (!existing || existing.total_lines !== lineOffset) {
      const fromLine = existing?.total_lines ?? 0;
      console.warn(`[session_log_push] ${sessionId}: alignment mismatch — expected offset ${fromLine}, got ${lineOffset}; requesting resend`);
      try { ws.send(JSON.stringify({ type: 'session_log_resend', session_id: sessionId, from_line: fromLine })); } catch {}
      return;
    }
  }

  try {
    console.log(`[session_log_push] ${sessionId.slice(0, 8)}: received lines ${lineOffset}–${lineOffset + lineCount - 1}${isComplete ? ' (complete)' : ''}`);
    await writeSessionLogFile(sessionId, containerId, container.source_repo, lineOffset, lineCount, content, isComplete);
  } catch (e) {
    console.error(`[session_log_push] Error writing ${sessionId}:`, e);
  }

  // Link any tasks mentioned in this content chunk to the session
  if (content) {
    const linkNow = Math.floor(Date.now() / 1000);
    for (const taskId of findTaskRefsInSessionContent(content, containerId)) {
      addTaskSessionLink(taskId, sessionId, linkNow);
    }
  }
}

/** Eviction sweep: delete logs not accessed within TTL. Called on startup + hourly. */
async function evictOldSessionLogs(): Promise<void> {
  const cutoff = Date.now() - SESSION_LOG_TTL_DAYS * 24 * 3600 * 1000;
  const stale = listSessionLogsOlderThan(cutoff);
  if (!stale.length) return;
  for (const sessionId of stale) {
    try { unlinkSync(sessionLogPath(sessionId)); } catch {}
  }
  deleteSessionLogs(stale);
  console.log(`[session-log-eviction] Deleted ${stale.length} stale session log(s)`);
}

// evictOldSessionLogs() and its interval are started from initContainerRoutes()
// so that db is guaranteed to be initialized before the first call.

// ── Plans files cache (populated from daemon heartbeats) ───────────────────────
// containerId → filename → content (most recent content pushed by daemon)
const plansFilesCache = new Map<string, Map<string, string>>();
// containerIds whose plans/ directory has been fully initialised (first push received)
const plansFilesCacheReady = new Set<string>();

// ── Session log cache ─────────────────────────────────────────────────────────
// Accumulates JSONL text per session as chunks are fetched.
// cachedLines holds all lines from 0..cachedLines-1 as a single raw string.
// Evicted after SESSION_LOG_CACHE_TTL_MS of inactivity, or when the session
// goes active again (UserPromptSubmit) which may add new lines.
const SESSION_LOG_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
interface SessionLogCache { rawText: string; cachedLines: number; totalLines: number; ts: number }
const sessionLogCache = new Map<string, SessionLogCache>();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of sessionLogCache) {
    if (now - v.ts >= SESSION_LOG_CACHE_TTL_MS) sessionLogCache.delete(k);
  }
}, 5 * 60 * 1000).unref?.();

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

// Pending session log chunk requests (resolve with full message for chunk metadata)
const pendingSessionLogRequests = new Map<string, {
  resolve: (msg: any) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}>();

// Offline grace-period timers: container_id → timer
const offlineTimers = new Map<string, ReturnType<typeof setTimeout>>();

// Track last time we sent a daemon restart so we don't spam it on every heartbeat.
const daemonRestartSentAt = new Map<string, number>();

// Pending git fresh-fetch operations: repo → { pendingContainerIds, dashboardClients, timer }
const pendingGitRefresh = new Map<string, {
  pendingContainerIds: Set<string>;
  dashboardClients: Set<any>;
  timer: ReturnType<typeof setTimeout>;
}>();

// ── Host identity helpers ─────────────────────────────────────────────────────

/** Returns true if the string looks like a Docker short container ID (12 lowercase hex chars). */
function looksLikeContainerId(name: string): boolean {
  return /^[0-9a-f]{12}$/.test(name);
}

/**
 * Resolve the machine_hostname to store, preferring a real hostname over
 * 'unknown' or a Docker container ID.  If the incoming value is unusable,
 * fall back to the existing DB value (if it is real), then to 'unknown'.
 */
function resolveMachineHostname(incoming: string | undefined, existing: string | undefined): string {
  const isReal = (h: string | undefined): h is string =>
    !!h && h !== 'unknown' && !looksLikeContainerId(h);
  if (isReal(incoming)) return incoming;
  if (isReal(existing)) return existing;
  return incoming ?? 'unknown';
}

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
  // Periodically clean up old acked change records (daily)
  setInterval(() => cleanupOldPendingChanges(), 24 * 3600 * 1000);
  // Session log eviction: run on startup and every hour (must be after db init)
  evictOldSessionLogs();
  setInterval(evictOldSessionLogs, 60 * 60 * 1000);
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
      // correctly claimed — no log needed
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
    // New prompt submitted: mark session log cache as no longer complete so the
    // next incremental fetch will relay to the daemon for the new lines.
    const slc = sessionLogCache.get(data.session_id);
    if (slc) slc.totalLines = 0; // force re-check on next request
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

    // Detect reconnection: WS not yet registered for this container
    const isReconnect = !containerWsMap.has(containerId);

    // Register WS if not already and update its label with full identity
    if (isReconnect) {
      containerWsMap.set(containerId, ws);
      ws.__containerId = containerId;
      const addr = (ws.data as any)?.addr ?? 'unknown';
      ws.__wsLabel = `container@${addr} ${hbCtx}`;
      console.log(`[ws-identified] ${ws.__wsLabel}`);
      // Clear the plans-files cache on reconnect so the daemon's fresh full
      // push (triggered by clearing _plans_file_mtimes in on_open) populates
      // the cache from scratch rather than being marked ready prematurely.
      plansFilesCache.delete(containerId);
      plansFilesCacheReady.delete(containerId);
      // Drain any pending dashboard changes (both unsent and previously sent but unacked)
      const pendingChanges = [
        ...getPendingDashboardChanges(containerId, 'pending'),
        ...getPendingDashboardChanges(containerId, 'sent'),
      ];
      if (pendingChanges.length > 0) {
        try {
          ws.send(JSON.stringify({ type: 'apply_changes', changes: pendingChanges }));
          markPendingChangesSent(pendingChanges.map(c => c.id));
          console.log(`[ws-identified] ${ws.__wsLabel}: drained ${pendingChanges.length} pending change(s)`);
        } catch {}
      }
      // Always send session_log_ack so daemon knows what we have and pushes the rest.
      // An empty map tells the daemon "I have nothing — push all active sessions."
      const cachedSessions = getSessionLogsByContainer(containerId);
      const ackMap: Record<string, number> = {};
      for (const s of cachedSessions) ackMap[s.session_id] = s.total_lines;
      try { ws.send(JSON.stringify({ type: 'session_log_ack', sessions: ackMap })); } catch {}
    }

    const existingContainer = getContainer(containerId);

    // Warn if this heartbeat would overwrite an existing row's host/container identity
    if (existingContainer) {
      const hostChanging = existingContainer.machine_hostname !== 'unknown'
        && msg.machine_hostname
        && existingContainer.machine_hostname !== msg.machine_hostname
        && !looksLikeContainerId(msg.machine_hostname);
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

    // Resolve machine_hostname — never downgrade a real hostname to 'unknown' or a container ID
    const resolvedMachineHostname = resolveMachineHostname(msg.machine_hostname, existingContainer?.machine_hostname);
    if (resolvedMachineHostname !== (msg.machine_hostname ?? 'unknown')) {
      console.log(`[heartbeat] ${hbCtx}: machine_hostname in message (${JSON.stringify(msg.machine_hostname)}) rejected — keeping ${JSON.stringify(resolvedMachineHostname)}`);
    }

    // Upsert container row only when data has actually changed; otherwise just touch last_seen.
    const now = Date.now();
    const changed = !existingContainer || containerDataChanged(existingContainer, msg, resolvedMachineHostname, mergedSessionIds);
    let container: ContainerRow;
    if (changed) {
      container = upsertContainer({
        id: containerId,
        source_repo: msg.source_repo ?? containerId,
        machine_hostname: resolvedMachineHostname,
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
        git_remote_url: msg.git_remote_url ?? null,
        git_submodules: Array.isArray(msg.git_submodules) ? msg.git_submodules : [],
        versions: (msg.versions && typeof msg.versions === 'object') ? msg.versions : {},
        planq_order: msg.planq_order ?? null,
        planq_history: msg.planq_history ?? null,
        auto_test_pending: msg.auto_test_pending ?? null,
        active_session_ids: mergedSessionIds,
        running_session_ids: Array.isArray(msg.running_session_ids) ? msg.running_session_ids : [],
        review_state: msg.review_state != null ? JSON.stringify(msg.review_state) : null,
        test_results: Array.isArray(msg.test_results) ? JSON.stringify(msg.test_results) : null,
        last_seen: now,
      });
      console.log(`[heartbeat] ${hbCtx}: updated sessions=[${mergedSessionIds.map(s => s.slice(0,8)).join(', ')}] git: staged=${msg.git_staged_count ?? 'n/a'} unstaged=${msg.git_unstaged_count ?? 'n/a'} branch=${msg.git_branch ?? '-'}`);
    } else {
      touchContainerSeen(containerId, now);
      container = existingContainer;
    }

    // Sync planq tasks from container — container is the authoritative source.
    // No writeback: dashboard changes are delivered via apply_changes messages.
    if (msg.planq_order) {
      const containerItems: PlanqItem[] = parsePlanqOrder(msg.planq_order);
      syncPlanqTasksFromParsed(containerId, containerItems);
      // Re-apply unacked dashboard changes so they survive the heartbeat wipe.
      reapplyPendingChangesToProjection(containerId);
      setPlanqLastSynced(containerId, msg.planq_order);

      // Record which sessions were running while each underway task was active.
      const runningSessions: string[] = Array.isArray(msg.running_session_ids) ? msg.running_session_ids : [];
      if (runningSessions.length > 0) {
        const linkNow = Math.floor(Date.now() / 1000);
        for (const t of getPlanqTasks(containerId)) {
          if (t.status === 'underway') {
            for (const sid of runningSessions) {
              addTaskSessionLink(t.id, sid, linkNow);
            }
          }
        }
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
      // 0 sessions — skip unknown-stub cleanup
    }

    // Upsert incremental git commits sent by daemon
    if (Array.isArray(msg.git_commits) && msg.git_commits.length > 0) {
      const runningSidsForCommits: string[] = Array.isArray(msg.running_session_ids) ? msg.running_session_ids : [];
      upsertGitCommits(sourceRepo, msg.git_commits, runningSidsForCommits);
      upsertGitCommitRefs(sourceRepo, container.machine_hostname, msg.git_commits);
      // Record that this host has new commits (for auto-fetch polling)
      if (!branchLastCommit.has(sourceRepo)) branchLastCommit.set(sourceRepo, new Map());
      branchLastCommit.get(sourceRepo)!.set(container.machine_hostname, Date.now());
    }

    // Upsert submodule commits sent by daemon, then send back tips per submodule
    if (msg.submodule_commits && typeof msg.submodule_commits === 'object') {
      const submoduleTips: Record<string, string[]> = {};
      for (const [subRepo, commits] of Object.entries(msg.submodule_commits)) {
        if (Array.isArray(commits) && commits.length > 0) {
          upsertGitCommits(subRepo, commits as any[]);
          upsertGitCommitRefs(subRepo, container.machine_hostname, commits as any[]);
        }
        submoduleTips[subRepo] = getGitTips(subRepo);
      }
      try { ws.send(JSON.stringify({ type: 'submodule_git_known_hashes', tips: submoduleTips })); } catch {}
    }

    // Send DAG frontier back so daemon can send only new commits next time
    const tips = getGitTips(sourceRepo);
    try { ws.send(JSON.stringify({ type: 'git_known_hashes', hashes: tips })); } catch {}

    // Merge plans files pushed proactively by the daemon
    if (msg.plans_files && typeof msg.plans_files === 'object') {
      if (!plansFilesCache.has(containerId)) plansFilesCache.set(containerId, new Map());
      const cache = plansFilesCache.get(containerId)!;
      for (const [filename, content] of Object.entries(msg.plans_files as Record<string, string>)) {
        cache.set(filename, content);
        // Sync review_status from task file content
        const task = getPlanqTasks(containerId).find(t => t.filename === filename);
        if (task) {
          const m = (content as string).match(/^review:\s*(\S+)/m);
          const newStatus = m ? m[1] : 'none';
          if (newStatus !== task.review_status) updatePlanqTask(task.id, { review_status: newStatus });
        }
      }
      if (Array.isArray(msg.plans_files_deleted)) {
        for (const filename of msg.plans_files_deleted as string[]) cache.delete(filename);
      }
      plansFilesCacheReady.add(containerId);
    }

    // Broadcast to dashboard clients only when something changed
    if (changed) {
      const containerWithState = buildContainerWithState(container);
      broadcastDashboard({ type: 'container_update', data: containerWithState });
    }

    // Auto-restart daemon if it is running an outdated version of itself.
    // Only send once per 5 minutes to avoid restart loops.
    const versions = container.versions as Record<string, string | null> | null | undefined;
    if (versions) {
      const fileStamp = versions.planq_daemon;
      const runningHash = versions.planq_daemon_running;
      if (fileStamp && fileStamp !== '(no stamp)' && runningHash) {
        const fileHash = fileStamp.split(' ')[0];
        if (fileHash && runningHash !== fileHash) {
          const lastSent = daemonRestartSentAt.get(containerId) ?? 0;
          if (Date.now() - lastSent > 5 * 60 * 1000) {
            daemonRestartSentAt.set(containerId, Date.now());
            console.log(`[heartbeat] ${hbCtx}: daemon hash mismatch (running=${runningHash} file=${fileHash}) — sending restart`);
            try { ws.send(JSON.stringify({ type: 'restart' })); } catch {}
          }
        }
      }
    }

    // Resolve any pending git fresh-fetch waiting on this container
    for (const [repo, pending] of pendingGitRefresh.entries()) {
      if (pending.pendingContainerIds.has(containerId)) {
        pending.pendingContainerIds.delete(containerId);
        if (pending.pendingContainerIds.size === 0) {
          clearTimeout(pending.timer);
          pendingGitRefresh.delete(repo);
          const payload = JSON.stringify({ type: 'git_refresh_ready', source_repo: repo });
          pending.dashboardClients.forEach(dws => { try { dws.send(payload); } catch {} });
        }
      }
    }
    return;
  }

  // File read response
  if (msg.type === 'file_read_response') {
    // Check session log chunk requests first (they need the full message)
    const slPending = pendingSessionLogRequests.get(msg.request_id);
    if (slPending) {
      clearTimeout(slPending.timer);
      pendingSessionLogRequests.delete(msg.request_id);
      if (msg.ok === false) {
        console.log(`[session_log_read] relay response error for req=${msg.request_id}: ${msg.error}`);
        slPending.reject(new Error(msg.error || 'Session log read failed'));
      } else {
        const lineCount = (msg.content ?? '').split('\n').filter(Boolean).length;
        console.log(`[session_log_read] relay response for req=${msg.request_id}: ${lineCount} lines`);
        slPending.resolve(msg);
      }
      return;
    }
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

  // Host source report (from host-source-reporter.py running outside containers)
  if (msg.type === 'host_source_report') {
    upsertHostSourceReport({
      machine_hostname: msg.machine_hostname,
      sandbox_dir: msg.sandbox_dir ?? null,
      sandbox_commit: msg.sandbox_commit ?? null,
      sandbox_commit_ts: msg.sandbox_commit_ts ?? null,
      observability_commit: msg.observability_commit ?? null,
      observability_commit_ts: msg.observability_commit_ts ?? null,
      last_reported_at: Date.now(),
    });
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

  // Daemon acknowledges applied dashboard changes
  if (msg.type === 'change_ack') {
    const ids: string[] = Array.isArray(msg.ids) ? msg.ids : [];
    if (ids.length > 0) {
      ackPendingDashboardChanges(ids);
      const cid = ws.__containerId;
      if (cid) console.log(`[change_ack] ${cid}: acked ${ids.length} change(s)`);
    }
    return;
  }

  // Daemon pushes session JSONL content to server filesystem cache
  if (msg.type === 'session_log_push') {
    handleSessionLogPush(ws, msg).catch(e => console.error('[session_log_push] unexpected error:', e));
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

export function handleDashboardMessage(ws: any, raw: string | Buffer): void {
  let msg: any;
  try { msg = JSON.parse(raw as string); } catch { return; }

  if (msg.type === 'git_fetch_fresh') {
    const repo: string = msg.source_repo ?? '';
    const hostFilter: string | null = msg.host_filter ?? null;
    if (!repo) return;

    // Resolve effective repo (submodule → parent)
    let effectiveRepo = repo;
    let directContainers = getAllContainers().filter(c => c.source_repo === repo);
    if (directContainers.length === 0) {
      const parts = repo.split('/');
      for (let i = parts.length - 1; i >= 1; i--) {
        const candidate = parts.slice(0, i).join('/');
        const parentContainers = getAllContainers().filter(c => c.source_repo === candidate);
        if (parentContainers.length > 0) {
          effectiveRepo = candidate;
          directContainers = parentContainers;
          break;
        }
      }
    }

    // Apply host filter
    const targetContainers = hostFilter
      ? directContainers.filter(c => c.machine_hostname === hostFilter)
      : directContainers;

    // Find connected containers
    const connectedIds = targetContainers
      .filter(c => c.connected && containerWsMap.has(c.id))
      .map(c => c.id);

    if (connectedIds.length === 0) {
      // Nothing to wait for — signal immediately
      try { ws.send(JSON.stringify({ type: 'git_refresh_ready', source_repo: repo })); } catch {}
      return;
    }

    // Cancel any existing refresh for this repo
    const existing = pendingGitRefresh.get(effectiveRepo);
    if (existing) {
      clearTimeout(existing.timer);
    }

    const pendingContainerIds = new Set(connectedIds);
    const dashboardClients = new Set<any>([ws]);

    const timer = setTimeout(() => {
      pendingGitRefresh.delete(effectiveRepo);
      const payload = JSON.stringify({ type: 'git_refresh_ready', source_repo: repo });
      dashboardClients.forEach(dws => { try { dws.send(payload); } catch {} });
    }, 8_000);

    pendingGitRefresh.set(effectiveRepo, { pendingContainerIds, dashboardClients, timer });

    // Request fresh heartbeat from each connected container
    for (const id of connectedIds) {
      const cws = containerWsMap.get(id);
      if (cws) try { cws.send(JSON.stringify({ type: 'request_heartbeat' })); } catch {}
    }
  }
}

// ── File relay helpers ────────────────────────────────────────────────────────

const SESSION_LOG_DEFAULT_LIMIT = 1000;
const SESSION_LOG_MAX_LIMIT = 5000;

interface SessionLogChunk {
  content: string;
  lineOffset: number;
  lineCount: number;
  totalLines: number;
}

async function relaySessionLogChunk(
  containerId: string,
  sessionId: string,
  lineOffset: number,
  limit: number,
): Promise<SessionLogChunk> {
  const clampedLimit = Math.min(limit, SESSION_LOG_MAX_LIMIT);

  // 1. Try filesystem cache (persistent, survives container disconnect)
  const dbRow = getSessionLog(sessionId);
  if (dbRow) {
    const filePath = sessionLogPath(sessionId);
    const file = Bun.file(filePath);
    if (await file.exists()) {
      touchSessionLogAccessed(sessionId);
      const allContent = await file.text();
      const lines = allContent.split('\n');
      // Remove trailing empty element from final newline
      if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
      const totalLines = dbRow.total_lines || lines.length;

      if (lineOffset >= totalLines) {
        return { content: '', lineOffset, lineCount: 0, totalLines };
      }
      const chunk = lines.slice(lineOffset, lineOffset + clampedLimit);
      return { content: chunk.join('\n') + (chunk.length ? '\n' : ''), lineOffset, lineCount: chunk.length, totalLines };
    }
  }

  // 2. Try in-memory cache
  const cached = sessionLogCache.get(sessionId);
  if (cached && lineOffset + clampedLimit <= cached.cachedLines) {
    const lines = cached.rawText.split('\n');
    const chunk = lines.slice(lineOffset, lineOffset + clampedLimit);
    return { content: chunk.join('\n') + (chunk.length ? '\n' : ''), lineOffset, lineCount: chunk.length, totalLines: cached.totalLines };
  }
  if (cached && cached.totalLines > 0 && lineOffset >= cached.totalLines) {
    return { content: '', lineOffset, lineCount: 0, totalLines: cached.totalLines };
  }

  // 3. Relay to container daemon
  const ws = containerWsMap.get(containerId);
  if (!ws) throw new Error('Container offline');

  const requestId = crypto.randomUUID();
  const raw = await new Promise<any>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingSessionLogRequests.delete(requestId);
      reject(new Error('Session log read timeout'));
    }, 20_000);
    pendingSessionLogRequests.set(requestId, { resolve, reject, timer });
    console.log(`[session_log_read] relaying req=${requestId} session=${sessionId.slice(0, 8)} offset=${lineOffset} limit=${clampedLimit}`);
    ws.send(JSON.stringify({ type: 'session_log_read', request_id: requestId, session_id: sessionId, line_offset: lineOffset, limit: clampedLimit }));
  });

  const content: string = raw.content ?? '';
  const lineCount: number = raw.line_count ?? content.split('\n').filter(Boolean).length;
  const totalLines: number = raw.total_lines ?? lineCount;

  // Cache to filesystem as a side-effect when this is a full response from offset 0
  if (lineOffset === 0 && content) {
    const container = getContainer(containerId);
    if (container) {
      writeSessionLogFile(sessionId, containerId, container.source_repo, 0, lineCount, content, false).catch(() => {});
    }
  }

  // Also update in-memory cache
  const entry = sessionLogCache.get(sessionId) ?? { rawText: '', cachedLines: 0, totalLines: 0, ts: 0 };
  if (lineOffset === 0) {
    entry.rawText = content;
    entry.cachedLines = lineCount;
  } else if (lineOffset === entry.cachedLines) {
    entry.rawText += content;
    entry.cachedLines += lineCount;
  }
  entry.totalLines = totalLines;
  entry.ts = Date.now();
  sessionLogCache.set(sessionId, entry);

  return { content, lineOffset, lineCount, totalLines };
}

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

  // POST /dashboard/containers/:id/merge — merge an offline container's sessions into another
  if (pathname.match(/^\/dashboard\/containers\/[^/]+\/merge$/) && method === 'POST') {
    const containerId = decodeURIComponent(pathname.split('/')[3]!);
    const container = getContainer(containerId);
    if (!container) return err('Container not found', 404);
    if (container.connected) return err('Cannot merge a connected container', 409);

    const body = await req.json() as any;
    const targetId: string = body.target_id;
    if (!targetId) return err('target_id required');
    if (targetId === containerId) return err('Cannot merge container into itself', 400);

    const target = getContainer(targetId);
    if (!target) return err('Target container not found', 404);

    mergeContainerSessions(containerId, targetId);
    deleteContainer(containerId);
    console.log(`[dashboard] merged container id=${containerId} into id=${targetId}`);

    broadcastDashboard({ type: 'container_removed', data: { id: containerId } });
    const updatedTarget = getContainer(targetId);
    if (updatedTarget) broadcastDashboard({ type: 'container_update', data: buildContainerWithState(updatedTarget) });

    return json({ ok: true });
  }

  // POST /dashboard/review-state
  if (pathname === '/dashboard/review-state' && method === 'POST') {
    const body = await req.json().catch(() => null);
    if (!body?.containerId || !body?.state) return new Response('Bad request', { status: 400 });
    const validStates = ['developing', 'ready-for-review', 'in-review', 'approved', 'merged'];
    if (!validStates.includes(body.state)) return new Response('Invalid state', { status: 400 });
    const stateObj = { state: body.state, notes: body.notes ?? undefined, updated: new Date().toISOString() };
    db.prepare('UPDATE containers SET review_state = ? WHERE id = ?').run(JSON.stringify(stateObj), body.containerId);
    const updated = getContainer(body.containerId);
    if (updated) broadcastDashboard({ type: 'container_update', data: buildContainerWithState(updated) });
    return json({ ok: true });
  }

  // GET /dashboard/git-view/:repo
  if (pathname.match(/^\/dashboard\/git-view\//) && method === 'GET') {
    const repo = decodeURIComponent(pathname.slice('/dashboard/git-view/'.length));
    let allContainers = getAllContainers().filter(c => c.source_repo === repo);

    // If no containers found, check if this is a submodule repo (e.g. "myproject/observability")
    // and fall back to parent containers with submodule git info substituted.
    let submodulePath = '';
    if (allContainers.length === 0) {
      const parts = repo.split('/');
      for (let i = parts.length - 1; i >= 1; i--) {
        const candidate = parts.slice(0, i).join('/');
        const parentContainers = getAllContainers().filter(c => c.source_repo === candidate);
        if (parentContainers.length > 0) {
          submodulePath = parts.slice(i).join('/');
          allContainers = parentContainers;
          break;
        }
      }
    }

    // Primary: use DB-stored commits sent by daemons (works for local and remote hosts)
    let storedCommits = getGitCommits(repo);

    // Extract local branch names from a ref list (strips HEAD ->, ignores remote/tag/HEAD)
    function extractLocalBranches(refs: string[]): string[] {
      const branches: string[] = [];
      for (const ref of refs) {
        if (ref.startsWith('HEAD -> ')) branches.push(ref.slice('HEAD -> '.length));
        else if (ref !== 'HEAD' && !ref.startsWith('tag: ') && !ref.includes('/')) branches.push(ref);
      }
      return [...new Set(branches)];
    }

    // Fallback: if DB is empty and server has local filesystem access, run git log directly
    const fallbackRefsPerHost: Array<{ hash: string; host: string; localBranches: string[] }> = [];
    if (storedCommits.length === 0) {
      const basePaths = [...new Set(allContainers.filter(c => c.workspace_host_path).map(c => c.workspace_host_path!))];
      const paths = basePaths.map(p => submodulePath ? `${p}/${submodulePath}` : p);
      const commitMap = new Map<string, StoredGitCommit>();
      for (const wpath of paths) {
        const host = allContainers.find(c => {
          const p = submodulePath ? `${c.workspace_host_path}/${submodulePath}` : c.workspace_host_path;
          return p === wpath;
        })?.machine_hostname ?? 'unknown';
        const [procMeta, procBody, procStat] = [
          Bun.spawn(['git', '-C', wpath, 'log', '--all', '--pretty=format:%H|%P|%D|%s|%an|%at', '--date-order', '-n', '200'], { stdout: 'pipe', stderr: 'ignore' }),
          Bun.spawn(['git', '-C', wpath, 'log', '--all', '-z', '--format=%H%n%B', '--date-order', '-n', '200'], { stdout: 'pipe', stderr: 'ignore' }),
          Bun.spawn(['git', '-C', wpath, 'log', '--all', '--pretty=tformat:COMMIT_SEP=%H', '--stat', '--date-order', '-n', '200'], { stdout: 'pipe', stderr: 'ignore' }),
        ];
        const [text, bodyText, statText] = await Promise.all([
          new Response(procMeta.stdout).text().catch(() => ''),
          new Response(procBody.stdout).text().catch(() => ''),
          new Response(procStat.stdout).text().catch(() => ''),
        ]);
        await Promise.all([procMeta.exited, procBody.exited, procStat.exited]);
        const bodyMap = new Map<string, string>();
        for (const record of bodyText.split('\0')) {
          const stripped = record.replace(/^\n+/, '');
          if (!stripped.trim()) continue;
          const nl = stripped.indexOf('\n');
          if (nl < 0) continue;
          const bHash = stripped.slice(0, nl).trim();
          const body = stripped.slice(nl + 1);
          if (bHash && body.trim()) bodyMap.set(bHash, body);
        }
        const diffstatMap = new Map<string, string>();
        let dsHash: string | null = null;
        const dsLines: string[] = [];
        for (const line of statText.split('\n')) {
          if (line.startsWith('COMMIT_SEP=')) {
            if (dsHash && dsLines.length) diffstatMap.set(dsHash, dsLines.join('\n').trim());
            dsHash = line.slice('COMMIT_SEP='.length).trim();
            dsLines.length = 0;
          } else if (dsHash && line.trim()) {
            dsLines.push(line);
          }
        }
        if (dsHash && dsLines.length) diffstatMap.set(dsHash, dsLines.join('\n').trim());
        const hostRefMap = new Map<string, string[]>();
        for (const line of text.split('\n')) {
          if (!line.trim()) continue;
          const parts = line.split('|');
          const hash = parts[0];
          const parentsStr = parts[1] ?? '';
          const refsStr = parts[2] ?? '';
          const authorTs = parseInt(parts[parts.length - 1] ?? '0', 10) || undefined;
          const authorName = parts[parts.length - 2] ?? '';
          const subject = parts.slice(3, parts.length - 2).join('|');
          if (!hash?.trim() || hash.trim().length < 7) continue;
          const parents = parentsStr?.trim() ? parentsStr.trim().split(' ').filter(Boolean) : [];
          const refs = refsStr?.trim() ? refsStr.trim().split(',').map(r => r.trim()).filter(Boolean) : [];
          const h = hash.trim();
          if (commitMap.has(h)) {
            const ex = commitMap.get(h)!;
            commitMap.set(h, { ...ex, refs: [...new Set([...ex.refs, ...refs])] });
          } else {
            const body = bodyMap.get(h);
            const diffstat = diffstatMap.get(h);
            commitMap.set(h, { hash: h, parents, refs, subject, author: authorName || undefined, author_date: authorTs, body: body?.trim() || undefined, diffstat: diffstat || undefined });
          }
          hostRefMap.set(h, [...(hostRefMap.get(h) ?? []), ...refs]);
        }
        for (const [hash, refs] of hostRefMap) {
          const localBranches = extractLocalBranches(refs);
          if (localBranches.length > 0) fallbackRefsPerHost.push({ hash, host, localBranches });
        }
      }
      storedCommits = [...commitMap.values()];
    }

    const containers = allContainers.map(c => {
      const subData = submodulePath
        ? (c.git_submodules ?? []).find((s: any) => s.path === submodulePath)
        : null;
      return {
        id: c.id, machine_hostname: c.machine_hostname, container_hostname: c.container_hostname,
        // When viewing a submodule: keep parent's git_branch so the header shows parent branch context.
        // Use the submodule's commit_hash so container chips navigate correctly within the submodule graph.
        git_branch: c.git_branch,
        git_worktree: c.git_worktree,
        // Preserve the parent's original commit hash so clicking a container chip in submodule view
        // can navigate back to the parent repo when the submodule commit isn't in the current graph.
        // Always set (not just when subData exists) so detached-HEAD containers without the submodule
        // can still navigate back to the parent.
        parent_commit_hash: submodulePath ? c.git_commit_hash : null,
        git_commit_hash: subData ? (subData as any).commit_hash ?? null : c.git_commit_hash,
        git_staged_count: subData ? (subData as any).staged_count ?? 0 : c.git_staged_count,
        git_unstaged_count: subData ? (subData as any).unstaged_count ?? 0 : c.git_unstaged_count,
        git_unstaged_diffstat: subData ? (subData as any).unstaged_diffstat ?? null : c.git_unstaged_diffstat,
        git_staged_diffstat: subData ? (subData as any).staged_diffstat ?? null : c.git_staged_diffstat,
        workspace_host_path: c.workspace_host_path, connected: c.connected,
        // Keep full submodule list so the submodule chips remain visible in the header.
        git_submodules: c.git_submodules ?? [],
      };
    });

    // Per-host local branch data (from DB for primary path, from fallback for direct git log)
    const dbRefs = getGitCommitRefs(repo);

    // Only show branch@host badges for commits where a container currently exists on that host.
    // This prevents stale badges from appearing at old commit positions after container rebuilds.
    // Use the `containers` array here (not `allContainers`) because when viewing a submodule,
    // `containers` has been remapped to use the submodule's commit_hash instead of the parent's.
    const currentPositions = new Map<string, Set<string>>(); // host → Set of short commit hashes
    for (const c of containers) {
      if (!c.git_commit_hash) continue;
      if (!currentPositions.has(c.machine_hostname)) currentPositions.set(c.machine_hostname, new Set());
      currentPositions.get(c.machine_hostname)!.add(c.git_commit_hash);
    }

    const refsPerHost = dbRefs.length > 0
      ? dbRefs
          .filter(r => {
            const hashes = currentPositions.get(r.machine_hostname);
            if (!hashes) return false;
            // Support short hashes from containers (7-8 chars) vs full hashes in DB
            return [...hashes].some(h => r.hash.startsWith(h) || h.startsWith(r.hash));
          })
          .map(r => ({ hash: r.hash, host: r.machine_hostname, localBranches: extractLocalBranches(r.refs) }))
          .filter(r => r.localBranches.length > 0)
      : fallbackRefsPerHost;

    const remoteUrl = allContainers.find(c => c.git_remote_url)?.git_remote_url ?? null;

    // Collect unique submodules across all containers for this repo.
    // Only collect when viewing the primary repo — skip when viewing a submodule to avoid
    // producing spurious entries like $project/$submodule/$submodule.
    const submoduleMap = new Map<string, string>()  // path → source_repo
    if (!submodulePath) {
      for (const c of allContainers) {
        for (const sub of (c.git_submodules ?? [])) {
          const subPath = (sub as any).path as string
          if (subPath) submoduleMap.set(subPath, `${repo}/${subPath}`)
        }
      }
    }
    const submodules = [...submoduleMap.entries()].map(([path, source_repo]) => ({ path, source_repo }))

    return json({ containers, commits: storedCommits, refsPerHost, remote_url: remoteUrl, submodules });
  }

  // GET /dashboard/git-show/:repo/:hash
  if (pathname.match(/^\/dashboard\/git-show\/[^/]+\/[0-9a-f]+$/) && method === 'GET') {
    const parts = pathname.split('/');
    const hash = parts[parts.length - 1]!;
    const repo = decodeURIComponent(parts.slice(3, -1).join('/'));
    const cached = gitShowCache.get(hash);
    if (cached !== undefined) return json(cached);

    // Prefer what the daemon stored in the DB (works even when server has no filesystem access)
    const storedCommits = getGitCommits(repo);
    const storedCommit = storedCommits.find(c => c.hash === hash || c.hash.startsWith(hash) || hash.startsWith(c.hash));
    const storedMessage = storedCommit?.body?.trim() ?? null;
    const storedDiffstat = storedCommit?.diffstat?.trim() ?? null;

    const allContainers = getAllContainers().filter(c => c.source_repo === repo && c.workspace_host_path);
    const wpath = allContainers[0]?.workspace_host_path;
    if (!wpath) {
      // No local git access — serve whatever the daemon stored
      const result = { diffstat: storedDiffstat ?? '', message: storedMessage ?? '' };
      if (storedMessage !== null || storedDiffstat !== null) gitShowCache.set(hash, result);
      return json(result);
    }

    // Use stored values where available; fall back to fresh git only for fields not yet in DB
    const messagePromise = storedMessage !== null
      ? Promise.resolve(storedMessage)
      : (async () => {
          const p = Bun.spawn(['git', '-C', wpath!, 'log', '-1', '--format=%B', hash], { stdout: 'pipe', stderr: 'ignore' });
          const msg = await new Response(p.stdout).text().catch(() => '');
          await p.exited;
          return msg;
        })();
    const diffstatPromise = storedDiffstat !== null
      ? Promise.resolve(storedDiffstat)
      : (async () => {
          const p = Bun.spawn(['git', '-C', wpath!, 'diff-tree', '--no-commit-id', '-r', '--stat', hash], { stdout: 'pipe', stderr: 'ignore' });
          const ds = await new Response(p.stdout).text().catch(() => '');
          await p.exited;
          return ds;
        })();
    const [message, diffstat] = await Promise.all([messagePromise, diffstatPromise]);
    if (gitShowCache.size >= 200) {
      const firstKey = gitShowCache.keys().next().value;
      if (firstKey !== undefined) gitShowCache.delete(firstKey);
    }
    gitShowCache.set(hash, { diffstat, message });
    return json({ diffstat, message });
  }

  // GET /dashboard/git-hosts/:repo — list known hosts + workspace paths for a repo
  if (pathname.match(/^\/dashboard\/git-hosts\//) && method === 'GET') {
    const repo = decodeURIComponent(pathname.slice('/dashboard/git-hosts/'.length));
    const repoContainers = getAllContainers().filter(c => c.source_repo === repo);
    const hostMap = new Map<string, { hostname: string; workspacePath: string | null; lastSeen: number }>();
    for (const c of repoContainers) {
      const existing = hostMap.get(c.machine_hostname);
      if (!existing || c.last_seen > existing.lastSeen) {
        // Canonicalise the workspace path: if the daemon reported a worktree
        // directory (basename ≠ source_repo), replace the basename with
        // source_repo so git-hosts.conf points at the main checkout.
        let workspacePath = c.workspace_host_path ?? null;
        if (workspacePath) {
          const sep = workspacePath.includes('\\') ? '\\' : '/';
          const parts = workspacePath.split(sep);
          if (parts[parts.length - 1] !== repo) {
            parts[parts.length - 1] = repo;
            workspacePath = parts.join(sep);
          }
        }
        hostMap.set(c.machine_hostname, {
          hostname: c.machine_hostname,
          workspacePath,
          lastSeen: c.last_seen,
        });
      }
    }
    return json([...hostMap.values()]);
  }

  // GET /dashboard/git-updates/:repo — timestamps of last new-commit event per host
  if (pathname.match(/^\/dashboard\/git-updates\//) && method === 'GET') {
    const repo = decodeURIComponent(pathname.slice('/dashboard/git-updates/'.length));
    const hostMap = branchLastCommit.get(repo) ?? new Map<string, number>();
    const updates = [...hostMap.entries()].map(([host, lastCommitAt]) => ({ host, lastCommitAt }));
    return json(updates);
  }

  // GET /dashboard/github-prs/:owner/:repo — fetch open PRs from GitHub API
  if (pathname.match(/^\/dashboard\/github-prs\/[^/]+\/[^/]+$/) && method === 'GET') {
    const parts = pathname.split('/');
    const owner = decodeURIComponent(parts[3]!);
    const repo = decodeURIComponent(parts[4]!);
    if (!/^[a-zA-Z0-9._-]+$/.test(owner) || !/^[a-zA-Z0-9._-]+$/.test(repo)) return err('Invalid owner/repo', 400);
    try {
      const cacheKey = `${owner}/${repo}`;
      const cached = githubPrCache.get(cacheKey);
      if (cached && Date.now() - cached.fetchedAt < 300_000) {
        return json(cached.data);
      }
      const token = process.env.GITHUB_TOKEN;
      const headers: Record<string, string> = { 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      // Fetch open PRs (up to 100)
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls?state=open&per_page=100`, { headers });
      if (!res.ok) return json({ prs: [], error: `GitHub API ${res.status}` });
      const rawPrs = await res.json() as any[];
      const prs = rawPrs.map((pr: any) => ({
        branch: pr.head?.ref as string,
        number: pr.number as number,
        url: pr.html_url as string,
        state: pr.state as string,
        draft: Boolean(pr.draft),
      }));
      const data = { prs };
      githubPrCache.set(cacheKey, { fetchedAt: Date.now(), data });
      return json(data);
    } catch (e: any) {
      return json({ prs: [], error: e?.message ?? 'fetch failed' });
    }
  }

  // GET /dashboard/session-log/:containerId/:sessionId?offset=<lines>&limit=<lines>
  if (pathname.match(/^\/dashboard\/session-log\/[^/]+\/[^/]+$/) && method === 'GET') {
    const parts = pathname.split('/');
    const containerId = decodeURIComponent(parts[3]!);
    const sessionId = decodeURIComponent(parts[4]!);
    if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) return err('Invalid session ID', 400);
    if (!getContainer(containerId)) return err('Container not found', 404);
    const lineOffset = Math.max(0, parseInt(url.searchParams.get('offset') ?? '0', 10) || 0);
    const limit = Math.min(
      Math.max(1, parseInt(url.searchParams.get('limit') ?? String(SESSION_LOG_DEFAULT_LIMIT), 10) || SESSION_LOG_DEFAULT_LIMIT),
      SESSION_LOG_MAX_LIMIT,
    );
    try {
      const chunk = await relaySessionLogChunk(containerId, sessionId, lineOffset, limit);
      return json(chunk);
    } catch (e: any) {
      return err(e.message || 'Session log not found', 503);
    }
  }

  // GET /dashboard/hostname-aliases
  if (pathname === '/dashboard/hostname-aliases' && method === 'GET') {
    try {
      const home = process.env.HOME || process.env.USERPROFILE || '/root';
      const aliasPath = `${home}/.local/devcontainer-sandbox/hostname-aliases.json`;
      const content = await Bun.file(aliasPath).text();
      return json(JSON.parse(content));
    } catch {
      return json({});
    }
  }

  // GET /planq/:id
  if (pathname.match(/^\/planq\/[^/]+$/) && method === 'GET') {
    const containerId = decodeURIComponent(pathname.split('/')[2]!);
    const tasks = getPlanqTasks(containerId);
    return json(tasks);
  }

  // GET /planq/:id/archive
  if (pathname.match(/^\/planq\/[^/]+\/archive$/) && method === 'GET') {
    const containerId = decodeURIComponent(pathname.split('/')[2]!);
    const tasks = getArchiveTasks(containerId);
    return json(tasks);
  }

  // POST /planq/:id/tasks
  if (pathname.match(/^\/planq\/[^/]+\/tasks$/) && method === 'POST') {
    const containerId = decodeURIComponent(pathname.split('/')[2]!);
    const container = getContainer(containerId);
    if (!container) return err('Container not found', 404);

    const body = await req.json() as any;
    const { task_type, description, create_file, auto_commit, commit_mode, plan_disposition, auto_queue_plan, parent_task_id, link_type: rawLinkType } = body;
    const linkType = (['follow-up', 'fix-required', 'check', 'other'].includes(rawLinkType) ? rawLinkType : 'follow-up') as 'follow-up' | 'fix-required' | 'check' | 'other';
    let { filename } = body;
    if (!task_type) return err('task_type required');

    // For named tasks: if create_file is set, write the description to a new file
    // (daemon picks a non-conflicting name and returns the actual filename used).
    if (create_file && filename && description && containerWsMap.has(containerId)) {
      const actualFn = await relayFileWriteNew(containerId, filename, description).catch(() => null);
      if (actualFn) {
        filename = actualFn;
        // Cache immediately so clicking the filename works without waiting for daemon heartbeat
        if (!plansFilesCache.has(containerId)) plansFilesCache.set(containerId, new Map());
        plansFilesCache.get(containerId)!.set(actualFn, description);
      }
    }

    const effectiveMode = (['auto', 'stage', 'manual'].includes(commit_mode) ? commit_mode : (auto_commit ? 'auto' : 'none')) as 'none' | 'auto' | 'stage' | 'manual';
    const effectiveDisposition = (['add-after', 'add-end'].includes(plan_disposition) ? plan_disposition : 'manual') as 'manual' | 'add-after' | 'add-end';
    const task = addPlanqTask(containerId, task_type, filename ?? null, description ?? null, effectiveMode === 'auto', effectiveMode, effectiveDisposition, Boolean(auto_queue_plan));
    touchPlanqServerModified(containerId);
    // For make-plan, write the prompt to the filename directly (filename IS make-plan-*.md)
    if (task_type === 'make-plan' && filename && description) {
      await relayFileWrite(containerId, filename, description).catch(() => {});
      if (!plansFilesCache.has(containerId)) plansFilesCache.set(containerId, new Map());
      plansFilesCache.get(containerId)!.set(filename, description);
    }
    // For investigate, write the prompt to the filename directly (filename IS investigate-*.md)
    if (task_type === 'investigate' && filename && description) {
      await relayFileWrite(containerId, filename, description).catch(() => {});
      if (!plansFilesCache.has(containerId)) plansFilesCache.set(containerId, new Map());
      plansFilesCache.get(containerId)!.set(filename, description);
    }

    // Resolve parent task key for subtask insertion (used by daemon to place it after the parent)
    let parentTaskKey: string | undefined;
    if (parent_task_id) {
      const parentTask = getPlanqTasks(containerId).find(t => t.id === parent_task_id);
      if (parentTask) {
        updatePlanqTask(task.id, { parent_task_id, link_type: linkType });
        parentTaskKey = parentTask.filename ?? parentTask.description ?? undefined;
      }
    }

    sendApplyChanges(containerId, [{
      id: crId(), type: 'add_task', source: 'dashboard', timestamp: Date.now() / 1000,
      task_key: task.filename ?? task.description,
      payload: {
        task_type: task.task_type, filename: task.filename, description: task.description,
        status: task.status, commit_mode: task.commit_mode,
        plan_disposition: task.plan_disposition, auto_queue_plan: task.auto_queue_plan,
        parent_task_key: parentTaskKey,
      },
    }]);

    broadcastDashboard({ type: 'planq_update', data: { container_id: containerId, tasks: getPlanqTasks(containerId) } });
    return json(task, 201);
  }

  // PUT /planq/:id/tasks/:taskId
  if (pathname.match(/^\/planq\/[^/]+\/tasks\/\d+$/) && method === 'PUT') {
    const parts = pathname.split('/');
    const containerId = decodeURIComponent(parts[2]!);
    const taskId = parseInt(parts[4]!);
    const container = getContainer(containerId);
    if (!container) return err('Container not found', 404);

    const body = await req.json() as any;
    const updates: { description?: string; status?: string; auto_commit?: boolean; commit_mode?: 'none' | 'auto' | 'stage' | 'manual'; review_status?: string } = {};
    if (body.description !== undefined) updates.description = body.description;
    if (body.status !== undefined) updates.status = body.status;
    if (body.commit_mode !== undefined && ['none', 'auto', 'stage', 'manual'].includes(body.commit_mode)) {
      updates.commit_mode = body.commit_mode;
    } else if (body.auto_commit !== undefined) {
      updates.auto_commit = Boolean(body.auto_commit);
    }
    if (body.review_status !== undefined) updates.review_status = body.review_status;
    const task = updatePlanqTask(taskId, updates);
    if (!task) return err('Task not found', 404);
    touchPlanqServerModified(containerId);

    // Write review status back to the task file
    if (body.review_status !== undefined && task.filename && containerWsMap.has(containerId)) {
      const cache = plansFilesCache.get(containerId);
      const currentContent = cache?.get(task.filename) ?? '';
      const reviewStatus = body.review_status as string;
      let newContent: string;
      if (!reviewStatus || reviewStatus === 'none') {
        newContent = currentContent.replace(/^review:\s*\S+[^\n]*/m, '').replace(/^\n/, '');
      } else if (/^review:\s*/m.test(currentContent)) {
        newContent = currentContent.replace(/^review:\s*\S*/m, `review: ${reviewStatus}`);
      } else {
        const trimmed = currentContent.trimEnd();
        newContent = trimmed + (trimmed ? '\n' : '') + `review: ${reviewStatus}\n`;
      }
      if (cache) cache.set(task.filename, newContent);
      relayFileWrite(containerId, task.filename, newContent).catch(() => {});
    }

    // Build ChangeRequests for fields that the container cares about
    const task_key = task.filename ?? task.description ?? '';
    const containerChanges: ChangeRequest[] = [];
    if (body.status !== undefined)
      containerChanges.push({ id: crId(), type: 'update_status', source: 'dashboard', timestamp: Date.now() / 1000, task_key, payload: { status: body.status } });
    if (body.commit_mode !== undefined)
      containerChanges.push({ id: crId(), type: 'update_content', source: 'dashboard', timestamp: Date.now() / 1000, task_key, payload: { field: 'commit_mode', value: task.commit_mode } });
    else if (body.auto_commit !== undefined)
      containerChanges.push({ id: crId(), type: 'update_content', source: 'dashboard', timestamp: Date.now() / 1000, task_key, payload: { field: 'commit_mode', value: task.commit_mode } });
    if (body.description !== undefined)
      containerChanges.push({ id: crId(), type: 'update_content', source: 'dashboard', timestamp: Date.now() / 1000, task_key, payload: { field: 'description', value: body.description } });
    sendApplyChanges(containerId, containerChanges);

    broadcastDashboard({ type: 'planq_update', data: { container_id: containerId, tasks: getPlanqTasks(containerId) } });
    return json(task);
  }

  // POST /planq/:id/tasks/:taskId/archive
  if (pathname.match(/^\/planq\/[^/]+\/tasks\/\d+\/archive$/) && method === 'POST') {
    const parts = pathname.split('/');
    const containerId = decodeURIComponent(parts[2]!);
    const taskId = parseInt(parts[4]!);
    const container = getContainer(containerId);
    if (!container) return err('Container not found', 404);

    const taskBeforeArchive = getPlanqTasks(containerId).find(t => t.id === taskId);
    const result = archiveTask(taskId);
    if (!result.ok) return err('Task not found', 404);
    touchPlanqServerModified(containerId);

    if (taskBeforeArchive) {
      sendApplyChanges(containerId, [{
        id: crId(), type: 'delete_task', source: 'dashboard', timestamp: Date.now() / 1000,
        task_key: taskBeforeArchive.filename ?? taskBeforeArchive.description,
        payload: {},
      }]);
    }
    if (containerWsMap.has(containerId)) {
      await relayFileWrite(containerId, 'archive/planq-history.txt', result.historyContent).catch(() => {});
    }
    broadcastDashboard({ type: 'planq_update', data: { container_id: containerId, tasks: getPlanqTasks(containerId) } });
    return json({ ok: true });
  }

  // DELETE /planq/:id/tasks/:taskId
  if (pathname.match(/^\/planq\/[^/]+\/tasks\/\d+$/) && method === 'DELETE') {
    const parts = pathname.split('/');
    const containerId = decodeURIComponent(parts[2]!);
    const taskId = parseInt(parts[4]!);
    const container = getContainer(containerId);
    if (!container) return err('Container not found', 404);

    const taskBeforeDelete = (db.prepare('SELECT * FROM planq_tasks WHERE id = ?').get(taskId) as any);
    const deleted = deletePlanqTask(taskId);
    if (!deleted) return err('Task not found', 404);
    touchPlanqServerModified(containerId);

    if (taskBeforeDelete) {
      sendApplyChanges(containerId, [{
        id: crId(), type: 'delete_task', source: 'dashboard', timestamp: Date.now() / 1000,
        task_key: taskBeforeDelete.filename ?? taskBeforeDelete.description,
        payload: {},
      }]);
    }
    broadcastDashboard({ type: 'planq_update', data: { container_id: containerId, tasks: getPlanqTasks(containerId) } });
    return json({ ok: true });
  }

  // POST /planq/:id/tasks/reorder
  if (pathname.match(/^\/planq\/[^/]+\/tasks\/reorder$/) && method === 'POST') {
    const containerId = decodeURIComponent(pathname.split('/')[2]!);
    const container = getContainer(containerId);
    if (!container) return err('Container not found', 404);

    const body = await req.json() as any;
    if (!Array.isArray(body)) return err('Body must be array of {id, position}');
    reorderPlanqTasks(body);
    touchPlanqServerModified(containerId);

    const tasksAfterReorder = getPlanqTasks(containerId);
    const newOrder = tasksAfterReorder.map(t => t.filename ?? t.description ?? '').filter(Boolean);
    sendApplyChanges(containerId, [{
      id: crId(), type: 'reorder', source: 'dashboard', timestamp: Date.now() / 1000,
      task_key: null, payload: { order: newOrder },
    }]);
    broadcastDashboard({ type: 'planq_update', data: { container_id: containerId, tasks: tasksAfterReorder } });
    return json({ ok: true });
  }

  // POST /planq/:id/tasks/archive-done
  if (pathname.match(/^\/planq\/[^/]+\/tasks\/archive-done$/) && method === 'POST') {
    const containerId = decodeURIComponent(pathname.split('/')[2]!);
    const container = getContainer(containerId);
    if (!container) return err('Container not found', 404);

    // Collect done tasks before archiving so we can build delete ChangeRequests
    const doneTasks = getPlanqTasks(containerId).filter(t => t.status === 'done');
    const { count, historyContent } = archiveDoneTasks(containerId);
    touchPlanqServerModified(containerId);

    if (doneTasks.length > 0) {
      const deleteChanges: ChangeRequest[] = doneTasks.map(t => ({
        id: crId(), type: 'delete_task' as const, source: 'dashboard' as const,
        timestamp: Date.now() / 1000,
        task_key: t.filename ?? t.description,
        payload: {},
      }));
      sendApplyChanges(containerId, deleteChanges);
    }
    if (count > 0 && containerWsMap.has(containerId)) {
      await relayFileWrite(containerId, 'archive/planq-history.txt', historyContent).catch(() => {});
    }
    broadcastDashboard({ type: 'planq_update', data: { container_id: containerId, tasks: getPlanqTasks(containerId) } });
    return json({ ok: true, archived: count });
  }

  // POST /planq/:id/auto-test/respond
  if (pathname.match(/^\/planq\/[^/]+\/auto-test\/respond$/) && method === 'POST') {
    const containerId = decodeURIComponent(pathname.split('/')[2]!);
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
    const containerId = decodeURIComponent(pathname.split('/')[2]!);

    // Serve from push cache when initialised (works even when container is offline)
    if (plansFilesCacheReady.has(containerId)) {
      const files = [...(plansFilesCache.get(containerId)?.keys() ?? [])].sort();
      return json(files);
    }

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
    const containerId = decodeURIComponent(parts[2]!);
    const filename = parts.slice(4).join('/'); // everything after /file/

    // Serve from push cache when available (works even when container is offline)
    const cached = plansFilesCache.get(containerId)?.get(filename);
    if (cached !== undefined) return json({ content: cached });

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
    const containerId = decodeURIComponent(parts[2]!);
    const filename = parts.slice(4).join('/');

    if (!containerWsMap.has(containerId)) return err('Container offline', 503);

    const body = await req.json() as any;
    const content = body.content ?? '';
    try {
      await relayFileWrite(containerId, filename, content);
      // Update cache so subsequent reads reflect the new content immediately
      if (!plansFilesCache.has(containerId)) plansFilesCache.set(containerId, new Map());
      plansFilesCache.get(containerId)!.set(filename, content);
      return json({ ok: true });
    } catch (e: any) {
      return err(e.message || 'File write failed', 503);
    }
  }

  // GET /dashboard/system-versions
  if (pathname === '/dashboard/system-versions' && method === 'GET') {
    const containers = getAllContainers().map(c => ({
      id: c.id,
      source_repo: c.source_repo,
      machine_hostname: c.machine_hostname,
      workspace_host_path: c.workspace_host_path,
      connected: c.connected,
      versions: c.versions,
    }));
    const host_source_reports = getAllHostSourceReports();
    // Read the canonical reference stamp for the given component.
    // Priority:
    //   1. ~/.local/devcontainer-sandbox/versions/<name>  — written by apply-daemon/apply-shell
    //      on the host each time components are updated across projects.  Always reflects the
    //      most recently applied version, regardless of whether the sandbox repo itself is a
    //      registered project.
    //   2. /workspace/.devcontainer/versions/<name>       — the server container's own stamp
    //   3. Relative to server source (devcontainer-sandbox repo's .devcontainer/versions/)
    async function readServerStamp(name: string): Promise<string | null> {
      const homeDir = process.env.HOME || '';
      const candidates = [
        homeDir ? homeDir + '/.local/devcontainer-sandbox/versions/' + name : '',
        '/workspace/.devcontainer/versions/' + name,
        new URL('../../../../.devcontainer/versions/' + name, import.meta.url).pathname,
      ].filter(Boolean);
      for (const p of candidates) {
        try { return (await Bun.file(p).text()).trim(); } catch {}
      }
      return null;
    }
    const server_stamps = {
      devcontainer: await readServerStamp('devcontainer'),
      planq_daemon: await readServerStamp('planq-daemon'),
      planq_shell: await readServerStamp('planq-shell'),
    };
    return json({ containers, host_source_reports, server_stamps });
  }

  // POST /dashboard/restart-planq/:containerId
  if (pathname.match(/^\/dashboard\/restart-planq\/[^/]+$/) && method === 'POST') {
    const containerId = decodeURIComponent(pathname.slice('/dashboard/restart-planq/'.length));
    const ws = containerWsMap.get(containerId);
    if (!ws) {
      console.log(`[restart-planq] container not found or offline: ${containerId}`);
      return err('Container offline or not found', 404);
    }
    try {
      ws.send(JSON.stringify({ type: 'restart' }));
      console.log(`[restart-planq] sent restart to container ${containerId}`);
      return json({ ok: true });
    } catch (e: any) {
      console.log(`[restart-planq] send failed for ${containerId}: ${e.message}`);
      return err(e.message || 'Send failed', 503);
    }
  }

  // GET /planq/:containerId/tasks/:taskId/sessions — sessions associated with a task
  if (pathname.match(/^\/planq\/[^/]+\/tasks\/\d+\/sessions$/) && method === 'GET') {
    const parts = pathname.split('/');
    const taskId = parseInt(parts[4] ?? '', 10);
    const sessionIds = getSessionsForTask(taskId);
    return json({ session_ids: sessionIds });
  }

  // GET /planq/:containerId/sessions/:sessionId/tasks — tasks associated with a session
  if (pathname.match(/^\/planq\/[^/]+\/sessions\/[^/]+\/tasks$/) && method === 'GET') {
    const parts = pathname.split('/');
    const containerId = decodeURIComponent(parts[2] ?? '');
    const sessionId = decodeURIComponent(parts[4] ?? '');
    const tasks = getTasksForSession(containerId, sessionId);
    return json({ tasks });
  }

  // GET /planq/:containerId/sessions/:sessionId/commits — commits associated with a session
  if (pathname.match(/^\/planq\/[^/]+\/sessions\/[^/]+\/commits$/) && method === 'GET') {
    const parts = pathname.split('/');
    const containerId = decodeURIComponent(parts[2] ?? '');
    const sessionId = decodeURIComponent(parts[4] ?? '');
    const container = getContainer(containerId);
    if (!container) return err('Container not found', 404);
    const hashes = getCommitsForSession(container.source_repo, sessionId);
    return json({ hashes });
  }

  return null; // not handled
}

// ── Planq three-way merge (kept for reference; replaced by reapplyPendingChangesToProjection) ──

// Status ordering: higher = more advanced/done
const STATUS_ORDER: Record<string, number> = {
  'pending': 0,
  'auto-queue': 1,
  'underway': 2,
  'awaiting-commit': 3,
  'awaiting-plan': 3,
  'done': 4,
};

function taskKey(item: PlanqItem): string {
  return item.filename ?? item.description ?? '';
}

function statusLevel(status: string): number {
  return STATUS_ORDER[status] ?? 0;
}

interface MergeConflict {
  key: string;
  type: 'text-changed' | 'status-conflict' | 'new-in-both';
  base?: PlanqItem;
  server: PlanqItem;
  container: PlanqItem;
}

/**
 * Merge planq task lists from server DB and container daemon heartbeat.
 * base: last state that was successfully synced to both sides (for status tracking)
 * server: current server DB state — AUTHORITATIVE for ordering
 * container: current container state (from daemon heartbeat) — contributes status changes + new tasks
 *
 * Ordering is always determined by the server. The container can only:
 *   - Change task statuses (picked up via three-way merge against base)
 *   - Add new tasks (container-only tasks are appended after server tasks)
 *
 * hasChanges is true if the merged result differs from the container state (need to push to container)
 */
function mergePlanqLists(
  base: PlanqItem[],
  server: PlanqItem[],
  container: PlanqItem[]
): { merged: PlanqItem[]; conflicts: MergeConflict[]; hasChanges: boolean } {
  const baseMap = new Map<string, PlanqItem>();
  const serverMap = new Map<string, PlanqItem>();
  const containerMap = new Map<string, PlanqItem>();

  for (const t of base) { const k = taskKey(t); if (k) baseMap.set(k, t); }
  for (const t of server) { const k = taskKey(t); if (k) serverMap.set(k, t); }
  for (const t of container) { const k = taskKey(t); if (k) containerMap.set(k, t); }

  const result: PlanqItem[] = [];
  const conflicts: MergeConflict[] = [];

  // Server ordering is authoritative — process tasks in server order
  const serverKeysInOrder = server.map(taskKey).filter(k => k) as string[];
  // Container order is only used to pick up new tasks added by the container
  const containerKeysInOrder = container.map(taskKey).filter(k => k) as string[];
  const processedKeys = new Set<string>();

  function mergeOne(key: string): PlanqItem | null {
    const baseTask = baseMap.get(key);
    const serverTask = serverMap.get(key);
    const containerTask = containerMap.get(key);

    // Not in server: container-only task (container added it) — keep as-is
    if (!serverTask) {
      return containerTask ?? null;
    }

    // In server but not in container
    if (!containerTask) {
      if (!baseTask) {
        // New in server, not yet received by container → include (container will get it on push)
        return serverTask;
      }
      // Was in base, container removed it → respect container removal
      return null;
    }

    // In both server and container — apply three-way status merge
    const baseTask_ = baseTask ?? serverTask; // fallback: treat server as base if no base known
    const serverStatusChanged = serverTask.status !== baseTask_.status;
    const containerStatusChanged = containerTask.status !== baseTask_.status;
    const serverTextChanged = serverTask.description !== baseTask_.description;
    const containerTextChanged = containerTask.description !== baseTask_.description;
    const serverCommitModeChanged = serverTask.commit_mode !== baseTask_.commit_mode;
    const containerCommitModeChanged = containerTask.commit_mode !== baseTask_.commit_mode;

    let mergedStatus = serverTask.status; // server is default
    let mergedDescription = serverTask.description;
    let mergedCommitMode = serverTask.commit_mode;

    // Status: container changes propagate up; server changes propagate down
    if (serverStatusChanged && containerStatusChanged && serverTask.status !== containerTask.status) {
      // Both changed to different values — pick the more advanced one
      const containerLevel = statusLevel(containerTask.status);
      const serverLevel = statusLevel(serverTask.status);
      if (containerLevel >= statusLevel('done') && serverLevel < statusLevel('done')) {
        mergedStatus = containerTask.status; // Container done → don't downgrade
      } else if (containerLevel > serverLevel) {
        mergedStatus = containerTask.status; // Container further along
      } else if (serverLevel > containerLevel) {
        mergedStatus = serverTask.status; // Server further along
      } else {
        conflicts.push({ key, type: 'status-conflict', base: baseTask, server: serverTask, container: containerTask });
        mergedStatus = serverTask.status; // Same level — server wins
      }
    } else if (containerStatusChanged && !serverStatusChanged) {
      // Only container changed status → apply it (container ran/completed the task)
      mergedStatus = containerTask.status;
    }
    // If only server changed (or neither changed), server's status is already the default

    // Text: container change wins (user may have edited locally); server change wins if container unchanged
    if (containerTextChanged) {
      mergedDescription = containerTask.description;
    } else if (serverTextChanged && !containerTextChanged) {
      if (!baseTask) {
        // new-in-both with different text — keep both (conflict)
        conflicts.push({ key, type: 'new-in-both', server: serverTask, container: containerTask });
      }
      mergedDescription = serverTask.description;
    }

    // Commit mode: server wins (set via dashboard)
    if (!containerCommitModeChanged) {
      mergedCommitMode = serverTask.commit_mode; // already the default
    } else if (!serverCommitModeChanged && containerCommitModeChanged) {
      mergedCommitMode = containerTask.commit_mode; // container changed it, server didn't
    }

    return {
      ...serverTask,
      status: mergedStatus,
      description: mergedDescription,
      commit_mode: mergedCommitMode,
    };
  }

  // Pass 1: server order (authoritative)
  for (const key of serverKeysInOrder) {
    processedKeys.add(key);
    const merged = mergeOne(key);
    if (merged) result.push(merged);
  }

  // Pass 2: container-only new tasks (not yet known to server) — append after server tasks
  for (const key of containerKeysInOrder) {
    if (processedKeys.has(key)) continue;
    processedKeys.add(key);
    const merged = mergeOne(key);
    if (merged) result.push(merged);
  }

  // Add conflict tasks (text conflicts: append duplicate with conflict marker)
  for (const conflict of conflicts) {
    if (conflict.type === 'text-changed' && conflict.server) {
      result.push({
        ...conflict.server,
        description: `[CONFLICT: text changed] ${conflict.server.description ?? ''}`.trim(),
        status: 'pending',
      });
    }
  }

  // Check if merged differs from container
  const containerSerialized = container.map(t => `${taskKey(t)}|${t.status}|${t.description ?? ''}`).join('\n');
  const mergedSerialized = result.map(t => `${taskKey(t)}|${t.status}|${t.description ?? ''}`).join('\n');
  const hasChanges = mergedSerialized !== containerSerialized;

  return { merged: result, conflicts, hasChanges };
}

// Write the planq-order.txt through the daemon for a given container.
// Does NOT update planq_last_synced — that is only updated once the daemon
// acknowledges the new state via a heartbeat, so the three-way merge can
// correctly detect which side made an intentional change.
async function writePlanqFile(containerId: string, _container: ContainerRow): Promise<void> {
  const tasks = getPlanqTasks(containerId);
  const content = serializePlanqOrder(tasks);
  await relayFileWrite(containerId, 'planq-order.txt', content);
  planqSyncedAt.set(containerId, Date.now());
}
