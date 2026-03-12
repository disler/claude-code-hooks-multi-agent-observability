import { db } from './db';

export interface GitSubmoduleInfo {
  path: string;
  branch: string | null;
  commit_hash: string;
  commit_message: string;
  staged_count: number;
  staged_diffstat: string | null;
  unstaged_count: number;
  unstaged_diffstat: string | null;
}

export interface ContainerRow {
  id: string;
  source_repo: string;
  machine_hostname: string;
  container_hostname: string;
  workspace_host_path: string | null;
  git_branch: string | null;
  git_worktree: string | null;
  git_commit_hash: string | null;
  git_commit_message: string | null;
  git_staged_count: number;
  git_staged_diffstat: string | null;
  git_unstaged_count: number;
  git_unstaged_diffstat: string | null;
  git_remote_url: string | null;
  git_submodules: GitSubmoduleInfo[]; // parsed from JSON
  planq_order: string | null;
  planq_history: string | null;
  auto_test_pending: { command: string; output: string; exit_code: number } | null;
  active_session_ids: string[]; // parsed from JSON
  running_session_ids: string[]; // parsed from JSON — sessions with live claude processes
  last_seen: number;
  connected: boolean;
}

export interface PlanqTaskRow {
  id: number;
  container_id: string;
  task_type: string;
  filename: string | null;
  description: string | null;
  position: number;
  status: string;
  auto_commit: boolean;
  commit_mode: 'none' | 'auto' | 'stage' | 'manual';
  plan_disposition: 'manual' | 'add-after' | 'add-end';
  auto_queue_plan: boolean;
}

export interface PlanqItem {
  task_type: string;
  filename: string | null;
  description: string | null;
  status: 'pending' | 'done' | 'underway' | 'auto-queue' | 'awaiting-commit' | 'awaiting-plan';
  auto_commit: boolean;
  commit_mode: 'none' | 'auto' | 'stage' | 'manual';
  plan_disposition?: 'manual' | 'add-after' | 'add-end';
  auto_queue_plan?: boolean;
}

export function initContainerDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS containers (
      id TEXT PRIMARY KEY,
      source_repo TEXT NOT NULL,
      machine_hostname TEXT NOT NULL,
      container_hostname TEXT NOT NULL,
      workspace_host_path TEXT,
      git_branch TEXT,
      git_worktree TEXT,
      git_commit_hash TEXT,
      git_commit_message TEXT,
      git_staged_count INTEGER DEFAULT 0,
      git_staged_diffstat TEXT,
      git_unstaged_count INTEGER DEFAULT 0,
      git_unstaged_diffstat TEXT,
      git_remote_url TEXT,
      git_submodules TEXT DEFAULT '[]',
      planq_order TEXT,
      planq_history TEXT,
      auto_test_pending TEXT,
      active_session_ids TEXT DEFAULT '[]',
      running_session_ids TEXT DEFAULT '[]',
      last_seen INTEGER NOT NULL,
      connected INTEGER DEFAULT 0
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS planq_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      container_id TEXT NOT NULL,
      task_type TEXT NOT NULL,
      filename TEXT,
      description TEXT,
      position INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      auto_commit INTEGER DEFAULT 0,
      commit_mode TEXT DEFAULT 'none',
      FOREIGN KEY (container_id) REFERENCES containers(id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS git_commits (
      source_repo TEXT NOT NULL,
      hash TEXT NOT NULL,
      parents TEXT NOT NULL,
      refs TEXT NOT NULL,
      subject TEXT NOT NULL,
      author TEXT,
      author_date INTEGER,
      PRIMARY KEY (source_repo, hash)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS git_commit_refs (
      source_repo TEXT NOT NULL,
      hash TEXT NOT NULL,
      machine_hostname TEXT NOT NULL,
      refs TEXT NOT NULL,
      PRIMARY KEY (source_repo, hash, machine_hostname)
    )
  `);

  db.exec('CREATE INDEX IF NOT EXISTS idx_containers_source_repo ON containers(source_repo)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_containers_machine ON containers(machine_hostname)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_planq_container ON planq_tasks(container_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_planq_position ON planq_tasks(container_id, position)');

  // Migrations for columns added after initial schema
  const columns = (db.prepare('PRAGMA table_info(containers)').all() as any[]).map((r: any) => r.name);
  if (!columns.includes('git_submodules')) {
    db.exec("ALTER TABLE containers ADD COLUMN git_submodules TEXT DEFAULT '[]'");
  }
  if (!columns.includes('running_session_ids')) {
    db.exec("ALTER TABLE containers ADD COLUMN running_session_ids TEXT DEFAULT '[]'");
  }
  if (!columns.includes('planq_server_modified_at')) {
    db.exec('ALTER TABLE containers ADD COLUMN planq_server_modified_at INTEGER');
  }
  if (!columns.includes('planq_history')) {
    db.exec('ALTER TABLE containers ADD COLUMN planq_history TEXT');
  }
  if (!columns.includes('auto_test_pending')) {
    db.exec('ALTER TABLE containers ADD COLUMN auto_test_pending TEXT');
  }
  if (!columns.includes('git_remote_url')) {
    db.exec('ALTER TABLE containers ADD COLUMN git_remote_url TEXT');
  }

  // Migration for planq_tasks columns added after initial schema
  const taskColumns = (db.prepare('PRAGMA table_info(planq_tasks)').all() as any[]).map((r: any) => r.name);
  if (!taskColumns.includes('auto_commit')) {
    db.exec('ALTER TABLE planq_tasks ADD COLUMN auto_commit INTEGER DEFAULT 0');
  }
  if (!taskColumns.includes('commit_mode')) {
    db.exec("ALTER TABLE planq_tasks ADD COLUMN commit_mode TEXT DEFAULT 'none'");
    // Migrate existing auto_commit=1 rows to commit_mode='auto'
    db.exec("UPDATE planq_tasks SET commit_mode = 'auto' WHERE auto_commit = 1");
  }
  if (!taskColumns.includes('plan_disposition')) {
    db.exec("ALTER TABLE planq_tasks ADD COLUMN plan_disposition TEXT DEFAULT 'manual'");
  }
  if (!taskColumns.includes('auto_queue_plan')) {
    db.exec('ALTER TABLE planq_tasks ADD COLUMN auto_queue_plan INTEGER DEFAULT 0');
  }

  // Migration for git_commits columns added after initial schema
  const commitColumns = (db.prepare('PRAGMA table_info(git_commits)').all() as any[]).map((r: any) => r.name);
  if (!commitColumns.includes('author')) {
    db.exec('ALTER TABLE git_commits ADD COLUMN author TEXT');
  }
  if (!commitColumns.includes('author_date')) {
    db.exec('ALTER TABLE git_commits ADD COLUMN author_date INTEGER');
  }
}

export function touchPlanqServerModified(containerId: string): void {
  db.prepare('UPDATE containers SET planq_server_modified_at = ? WHERE id = ?').run(Date.now(), containerId);
}

export function getPlanqServerModifiedAt(containerId: string): number {
  const row = db.prepare('SELECT planq_server_modified_at FROM containers WHERE id = ?').get(containerId) as any;
  return row?.planq_server_modified_at ?? 0;
}

export function upsertContainer(data: Omit<ContainerRow, 'connected'>): ContainerRow {
  const stmt = db.prepare(`
    INSERT INTO containers
      (id, source_repo, machine_hostname, container_hostname, workspace_host_path,
       git_branch, git_worktree, git_commit_hash, git_commit_message,
       git_staged_count, git_staged_diffstat, git_unstaged_count, git_unstaged_diffstat,
       git_remote_url, git_submodules, planq_order, planq_history, auto_test_pending, active_session_ids, running_session_ids, last_seen, connected)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)
    ON CONFLICT(id) DO UPDATE SET
      source_repo=excluded.source_repo,
      machine_hostname=excluded.machine_hostname,
      container_hostname=excluded.container_hostname,
      workspace_host_path=excluded.workspace_host_path,
      git_branch=excluded.git_branch,
      git_worktree=excluded.git_worktree,
      git_commit_hash=excluded.git_commit_hash,
      git_commit_message=excluded.git_commit_message,
      git_staged_count=excluded.git_staged_count,
      git_staged_diffstat=excluded.git_staged_diffstat,
      git_unstaged_count=excluded.git_unstaged_count,
      git_unstaged_diffstat=excluded.git_unstaged_diffstat,
      git_remote_url=excluded.git_remote_url,
      git_submodules=excluded.git_submodules,
      planq_order=excluded.planq_order,
      planq_history=COALESCE(excluded.planq_history, planq_history),
      auto_test_pending=excluded.auto_test_pending,
      active_session_ids=excluded.active_session_ids,
      running_session_ids=excluded.running_session_ids,
      last_seen=excluded.last_seen,
      connected=1
  `);

  stmt.run(
    data.id,
    data.source_repo,
    data.machine_hostname,
    data.container_hostname,
    data.workspace_host_path ?? null,
    data.git_branch ?? null,
    data.git_worktree ?? null,
    data.git_commit_hash ?? null,
    data.git_commit_message ?? null,
    data.git_staged_count,
    data.git_staged_diffstat ?? null,
    data.git_unstaged_count,
    data.git_unstaged_diffstat ?? null,
    data.git_remote_url ?? null,
    JSON.stringify(data.git_submodules ?? []),
    data.planq_order ?? null,
    data.planq_history ?? null,
    data.auto_test_pending ? JSON.stringify(data.auto_test_pending) : null,
    JSON.stringify(data.active_session_ids),
    JSON.stringify(data.running_session_ids ?? []),
    data.last_seen
  );

  return getContainer(data.id)!;
}

export function setContainerDisconnected(id: string): void {
  db.prepare('UPDATE containers SET connected = 0 WHERE id = ?').run(id);
}

export function getContainer(id: string): ContainerRow | null {
  const row = db.prepare('SELECT * FROM containers WHERE id = ?').get(id) as any;
  return row ? rowToContainer(row) : null;
}

export function deleteContainer(id: string): boolean {
  const result = db.prepare('DELETE FROM containers WHERE id = ?').run(id);
  return result.changes > 0;
}

export function mergeContainerSessions(sourceId: string, targetId: string): void {
  const source = db.prepare('SELECT active_session_ids FROM containers WHERE id = ?').get(sourceId) as any;
  const target = db.prepare('SELECT active_session_ids FROM containers WHERE id = ?').get(targetId) as any;
  if (!source || !target) return;
  const sourceIds: string[] = JSON.parse(source.active_session_ids || '[]');
  const targetIds: string[] = JSON.parse(target.active_session_ids || '[]');
  const merged = [...targetIds];
  for (const id of sourceIds) {
    if (!merged.includes(id)) merged.push(id);
  }
  db.prepare('UPDATE containers SET active_session_ids = ? WHERE id = ?')
    .run(JSON.stringify(merged), targetId);
}

export function getAllContainers(): ContainerRow[] {
  const rows = db.prepare('SELECT * FROM containers ORDER BY machine_hostname, source_repo').all() as any[];
  return rows.map(rowToContainer);
}

function rowToContainer(row: any): ContainerRow {
  return {
    id: row.id,
    source_repo: row.source_repo,
    machine_hostname: row.machine_hostname,
    container_hostname: row.container_hostname,
    workspace_host_path: row.workspace_host_path,
    git_branch: row.git_branch,
    git_worktree: row.git_worktree,
    git_commit_hash: row.git_commit_hash,
    git_commit_message: row.git_commit_message,
    git_staged_count: row.git_staged_count ?? 0,
    git_staged_diffstat: row.git_staged_diffstat,
    git_unstaged_count: row.git_unstaged_count ?? 0,
    git_unstaged_diffstat: row.git_unstaged_diffstat,
    git_remote_url: row.git_remote_url ?? null,
    git_submodules: JSON.parse(row.git_submodules || '[]'),
    planq_order: row.planq_order,
    planq_history: row.planq_history ?? null,
    auto_test_pending: row.auto_test_pending ? JSON.parse(row.auto_test_pending) : null,
    active_session_ids: JSON.parse(row.active_session_ids || '[]'),
    running_session_ids: JSON.parse(row.running_session_ids || '[]'),
    last_seen: row.last_seen,
    connected: Boolean(row.connected),
  };
}

// ── Planq task helpers ────────────────────────────────────────────────────────

export function parsePlanqOrder(text: string): PlanqItem[] {
  const items: PlanqItem[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let status: PlanqItem['status'] = 'pending';
    let activeLine = trimmed;
    if (trimmed.startsWith('# done:')) {
      status = 'done';
      activeLine = trimmed.slice('# done:'.length).trim();
    } else if (trimmed.startsWith('# underway:')) {
      status = 'underway';
      activeLine = trimmed.slice('# underway:'.length).trim();
    } else if (trimmed.startsWith('# auto-queue:')) {
      status = 'auto-queue';
      activeLine = trimmed.slice('# auto-queue:'.length).trim();
    } else if (trimmed.startsWith('# awaiting-commit:')) {
      status = 'awaiting-commit';
      activeLine = trimmed.slice('# awaiting-commit:'.length).trim();
    } else if (trimmed.startsWith('# awaiting-plan:')) {
      status = 'awaiting-plan';
      activeLine = trimmed.slice('# awaiting-plan:'.length).trim();
    } else if (trimmed.startsWith('#')) {
      continue; // regular comment
    }

    const colonIdx = activeLine.indexOf(':');
    if (colonIdx < 0) continue;

    const taskType = activeLine.slice(0, colonIdx).trim();
    let value = activeLine.slice(colonIdx + 1).trim();
    const validTypes = ['task', 'plan', 'make-plan', 'manual-test', 'manual-commit', 'manual-task', 'unnamed-task', 'auto-test', 'auto-commit'];
    if (!validTypes.includes(taskType)) continue;

    // Parse plan disposition flags (for make-plan tasks)
    let plan_disposition: PlanqItem['plan_disposition'] = 'manual';
    let auto_queue_plan = false;
    if (value.endsWith(' +auto-queue-plan')) {
      auto_queue_plan = true;
      value = value.slice(0, -' +auto-queue-plan'.length);
    }
    if (value.endsWith(' +add-after')) {
      plan_disposition = 'add-after';
      value = value.slice(0, -' +add-after'.length);
    } else if (value.endsWith(' +add-end')) {
      plan_disposition = 'add-end';
      value = value.slice(0, -' +add-end'.length);
    }

    // Parse commit mode flags (mutually exclusive suffixes)
    let auto_commit = false;
    let commit_mode: PlanqItem['commit_mode'] = 'none';
    if (value.endsWith(' +auto-commit')) {
      auto_commit = true;
      commit_mode = 'auto';
      value = value.slice(0, -' +auto-commit'.length);
    } else if (value.endsWith(' +stage-commit')) {
      commit_mode = 'stage';
      value = value.slice(0, -' +stage-commit'.length);
    } else if (value.endsWith(' +manual-commit')) {
      commit_mode = 'manual';
      value = value.slice(0, -' +manual-commit'.length);
    }

    if (taskType === 'task' || taskType === 'plan' || taskType === 'make-plan') {
      items.push({ task_type: taskType, filename: value, description: null, status, auto_commit, commit_mode, plan_disposition, auto_queue_plan });
    } else {
      items.push({ task_type: taskType, filename: null, description: value, status, auto_commit, commit_mode });
    }
  }
  return items;
}

export function serializePlanqOrder(tasks: PlanqTaskRow[]): string {
  const sorted = [...tasks].sort((a, b) => a.position - b.position);
  const lines: string[] = [];
  for (const t of sorted) {
    let value = t.filename ? `${t.task_type}: ${t.filename}` : `${t.task_type}: ${t.description || ''}`;
    const mode = t.commit_mode ?? (t.auto_commit ? 'auto' : 'none');
    if (mode === 'auto') value += ' +auto-commit';
    else if (mode === 'stage') value += ' +stage-commit';
    else if (mode === 'manual') value += ' +manual-commit';
    if (t.task_type === 'make-plan') {
      if (t.plan_disposition === 'add-after') value += ' +add-after';
      else if (t.plan_disposition === 'add-end') value += ' +add-end';
      if (t.auto_queue_plan) value += ' +auto-queue-plan';
    }
    if (t.status === 'done') value = `# done: ${value}`;
    else if (t.status === 'underway') value = `# underway: ${value}`;
    else if (t.status === 'auto-queue') value = `# auto-queue: ${value}`;
    else if (t.status === 'awaiting-commit') value = `# awaiting-commit: ${value}`;
    else if (t.status === 'awaiting-plan') value = `# awaiting-plan: ${value}`;
    lines.push(value);
  }
  return lines.join('\n') + '\n';
}

export function syncPlanqTasksFromParsed(containerId: string, items: PlanqItem[]): void {
  db.prepare('DELETE FROM planq_tasks WHERE container_id = ?').run(containerId);
  const insert = db.prepare(`
    INSERT INTO planq_tasks (container_id, task_type, filename, description, position, status, auto_commit, commit_mode, plan_disposition, auto_queue_plan)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  items.forEach((item, i) => {
    insert.run(containerId, item.task_type, item.filename ?? null, item.description ?? null, i, item.status, item.auto_commit ? 1 : 0, item.commit_mode ?? 'none', item.plan_disposition ?? 'manual', item.auto_queue_plan ? 1 : 0);
  });
}

export function getPlanqTasks(containerId: string): PlanqTaskRow[] {
  const rows = db.prepare(
    'SELECT * FROM planq_tasks WHERE container_id = ? ORDER BY position'
  ).all(containerId) as any[];
  return rows.map(r => ({
    ...r,
    auto_commit: Boolean(r.auto_commit),
    commit_mode: (r.commit_mode ?? (r.auto_commit ? 'auto' : 'none')) as PlanqTaskRow['commit_mode'],
    plan_disposition: (r.plan_disposition ?? 'manual') as PlanqTaskRow['plan_disposition'],
    auto_queue_plan: Boolean(r.auto_queue_plan),
  })) as PlanqTaskRow[];
}

export function addPlanqTask(
  containerId: string,
  taskType: string,
  filename: string | null,
  description: string | null,
  autoCommit = false,
  commitMode: 'none' | 'auto' | 'stage' | 'manual' = 'none',
  planDisposition: 'manual' | 'add-after' | 'add-end' = 'manual',
  autoQueuePlan = false
): PlanqTaskRow {
  const maxPos = (db.prepare(
    'SELECT MAX(position) as m FROM planq_tasks WHERE container_id = ?'
  ).get(containerId) as any)?.m ?? -1;
  // Reconcile: if autoCommit=true and commitMode='none', treat as 'auto'
  const effectiveMode = commitMode !== 'none' ? commitMode : (autoCommit ? 'auto' : 'none');
  const result = db.prepare(`
    INSERT INTO planq_tasks (container_id, task_type, filename, description, position, status, auto_commit, commit_mode, plan_disposition, auto_queue_plan)
    VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)
  `).run(containerId, taskType, filename ?? null, description ?? null, maxPos + 1, effectiveMode === 'auto' ? 1 : 0, effectiveMode, planDisposition, autoQueuePlan ? 1 : 0);
  const row = db.prepare('SELECT * FROM planq_tasks WHERE id = ?').get(result.lastInsertRowid) as any;
  return { ...row, auto_commit: Boolean(row.auto_commit), commit_mode: row.commit_mode ?? 'none', plan_disposition: row.plan_disposition ?? 'manual', auto_queue_plan: Boolean(row.auto_queue_plan) } as PlanqTaskRow;
}

export function updatePlanqTask(
  taskId: number,
  updates: { description?: string; status?: string; auto_commit?: boolean; commit_mode?: 'none' | 'auto' | 'stage' | 'manual' }
): PlanqTaskRow | null {
  const fields: string[] = [];
  const values: any[] = [];
  if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description); }
  if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
  if (updates.commit_mode !== undefined) {
    fields.push('commit_mode = ?'); values.push(updates.commit_mode);
    fields.push('auto_commit = ?'); values.push(updates.commit_mode === 'auto' ? 1 : 0);
  } else if (updates.auto_commit !== undefined) {
    fields.push('auto_commit = ?'); values.push(updates.auto_commit ? 1 : 0);
    fields.push('commit_mode = ?'); values.push(updates.auto_commit ? 'auto' : 'none');
  }
  if (!fields.length) return null;
  values.push(taskId);
  db.prepare(`UPDATE planq_tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  const row = db.prepare('SELECT * FROM planq_tasks WHERE id = ?').get(taskId) as any;
  if (!row) return null;
  return { ...row, auto_commit: Boolean(row.auto_commit), commit_mode: row.commit_mode ?? 'none', plan_disposition: row.plan_disposition ?? 'manual', auto_queue_plan: Boolean(row.auto_queue_plan) } as PlanqTaskRow;
}

export function deletePlanqTask(taskId: number): boolean {
  const result = db.prepare('DELETE FROM planq_tasks WHERE id = ?').run(taskId);
  return result.changes > 0;
}

export function reorderPlanqTasks(reorder: Array<{ id: number; position: number }>): void {
  const stmt = db.prepare('UPDATE planq_tasks SET position = ? WHERE id = ?');
  for (const { id, position } of reorder) {
    stmt.run(position, id);
  }
}

export function getArchiveTasks(containerId: string): PlanqItem[] {
  const row = db.prepare('SELECT planq_history FROM containers WHERE id = ?').get(containerId) as any;
  if (!row?.planq_history) return [];
  return parsePlanqOrder(row.planq_history);
}

export function archiveTask(taskId: number): { ok: boolean; historyContent: string; containerId: string } {
  const row = db.prepare('SELECT * FROM planq_tasks WHERE id = ?').get(taskId) as any;
  if (!row) return { ok: false, historyContent: '', containerId: '' };
  const task: PlanqTaskRow = { ...row, auto_commit: Boolean(row.auto_commit), commit_mode: row.commit_mode ?? 'none', plan_disposition: row.plan_disposition ?? 'manual', auto_queue_plan: Boolean(row.auto_queue_plan) };
  const containerId: string = row.container_id;

  const existingRow = db.prepare('SELECT planq_history FROM containers WHERE id = ?').get(containerId) as any;
  const existingHistory: string = existingRow?.planq_history ?? '';
  const newEntry = serializePlanqOrder([task]);
  const updatedHistory = (existingHistory ? existingHistory.trimEnd() + '\n' : '') + newEntry;

  db.prepare('UPDATE containers SET planq_history = ? WHERE id = ?').run(updatedHistory, containerId);
  db.prepare('DELETE FROM planq_tasks WHERE id = ?').run(taskId);

  return { ok: true, historyContent: updatedHistory, containerId };
}

export interface StoredGitCommit {
  hash: string;
  parents: string[];
  refs: string[];
  subject: string;
  author?: string;
  author_date?: number;
}

export function upsertGitCommits(sourceRepo: string, commits: StoredGitCommit[]): void {
  const upsert = db.prepare(
    'INSERT INTO git_commits (source_repo, hash, parents, refs, subject, author, author_date) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(source_repo, hash) DO UPDATE SET refs = excluded.refs, subject = excluded.subject, author = COALESCE(excluded.author, author), author_date = COALESCE(excluded.author_date, author_date)'
  );
  const tx = db.transaction(() => {
    for (const c of commits) {
      upsert.run(sourceRepo, c.hash, JSON.stringify(c.parents), JSON.stringify(c.refs), c.subject, c.author ?? null, c.author_date ?? null);
    }
  });
  tx();
}

export function getGitCommits(sourceRepo: string): StoredGitCommit[] {
  const rows = db.prepare(
    'SELECT hash, parents, refs, subject, author, author_date FROM git_commits WHERE source_repo = ?'
  ).all(sourceRepo) as any[];
  return rows.map(r => ({
    hash: r.hash,
    parents: JSON.parse(r.parents),
    refs: JSON.parse(r.refs),
    subject: r.subject,
    author: r.author ?? undefined,
    author_date: r.author_date ?? undefined,
  }));
}

/** Return hashes that are not a parent of any other stored commit — the DAG frontier. */
export function getGitTips(sourceRepo: string): string[] {
  const rows = db.prepare(
    'SELECT hash, parents FROM git_commits WHERE source_repo = ?'
  ).all(sourceRepo) as any[];
  if (rows.length === 0) return [];
  const parentSet = new Set<string>();
  for (const r of rows) {
    for (const p of JSON.parse(r.parents)) parentSet.add(p);
  }
  return rows.filter(r => !parentSet.has(r.hash)).map(r => r.hash);
}

export function upsertGitCommitRefs(sourceRepo: string, machineHostname: string, commits: StoredGitCommit[]): void {
  const upsert = db.prepare(
    'INSERT INTO git_commit_refs (source_repo, hash, machine_hostname, refs) VALUES (?, ?, ?, ?) ON CONFLICT(source_repo, hash, machine_hostname) DO UPDATE SET refs = excluded.refs'
  );
  const tx = db.transaction(() => {
    for (const c of commits) {
      upsert.run(sourceRepo, c.hash, machineHostname, JSON.stringify(c.refs));
    }
  });
  tx();
}

export function getGitCommitRefs(sourceRepo: string): Array<{ hash: string; machine_hostname: string; refs: string[] }> {
  const rows = db.prepare(
    'SELECT hash, machine_hostname, refs FROM git_commit_refs WHERE source_repo = ?'
  ).all(sourceRepo) as any[];
  return rows.map(r => ({ hash: r.hash, machine_hostname: r.machine_hostname, refs: JSON.parse(r.refs) }));
}

export function archiveDoneTasks(containerId: string): { count: number; historyContent: string } {
  const doneTasks = (db.prepare(
    "SELECT * FROM planq_tasks WHERE container_id = ? AND status = 'done' ORDER BY position"
  ).all(containerId) as any[]).map(r => ({ ...r, auto_commit: Boolean(r.auto_commit), commit_mode: r.commit_mode ?? 'none', plan_disposition: r.plan_disposition ?? 'manual', auto_queue_plan: Boolean(r.auto_queue_plan) })) as PlanqTaskRow[];

  if (doneTasks.length === 0) return { count: 0, historyContent: '' };

  const existingRow = db.prepare('SELECT planq_history FROM containers WHERE id = ?').get(containerId) as any;
  const existingHistory: string = existingRow?.planq_history ?? '';
  const newEntries = serializePlanqOrder(doneTasks);
  const updatedHistory = (existingHistory ? existingHistory.trimEnd() + '\n' : '') + newEntries;

  db.prepare('UPDATE containers SET planq_history = ? WHERE id = ?').run(updatedHistory, containerId);
  const stmt = db.prepare('DELETE FROM planq_tasks WHERE id = ?');
  for (const task of doneTasks) stmt.run(task.id);

  return { count: doneTasks.length, historyContent: updatedHistory };
}
