import { db } from './db';

export interface GitSubmoduleInfo {
  path: string;
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
  git_submodules: GitSubmoduleInfo[]; // parsed from JSON
  planq_order: string | null;
  active_session_ids: string[]; // parsed from JSON
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
}

export interface PlanqItem {
  task_type: string;
  filename: string | null;
  description: string | null;
  status: 'pending' | 'done';
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
      git_submodules TEXT DEFAULT '[]',
      planq_order TEXT,
      active_session_ids TEXT DEFAULT '[]',
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
      FOREIGN KEY (container_id) REFERENCES containers(id)
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
}

export function upsertContainer(data: Omit<ContainerRow, 'connected'>): ContainerRow {
  const stmt = db.prepare(`
    INSERT INTO containers
      (id, source_repo, machine_hostname, container_hostname, workspace_host_path,
       git_branch, git_worktree, git_commit_hash, git_commit_message,
       git_staged_count, git_staged_diffstat, git_unstaged_count, git_unstaged_diffstat,
       git_submodules, planq_order, active_session_ids, last_seen, connected)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)
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
      git_submodules=excluded.git_submodules,
      planq_order=excluded.planq_order,
      active_session_ids=excluded.active_session_ids,
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
    JSON.stringify(data.git_submodules ?? []),
    data.planq_order ?? null,
    JSON.stringify(data.active_session_ids),
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
    git_submodules: JSON.parse(row.git_submodules || '[]'),
    planq_order: row.planq_order,
    active_session_ids: JSON.parse(row.active_session_ids || '[]'),
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

    let isDone = false;
    let activeLine = trimmed;
    if (trimmed.startsWith('# done:')) {
      isDone = true;
      activeLine = trimmed.slice('# done:'.length).trim();
    } else if (trimmed.startsWith('#')) {
      continue; // regular comment
    }

    const colonIdx = activeLine.indexOf(':');
    if (colonIdx < 0) continue;

    const taskType = activeLine.slice(0, colonIdx).trim();
    const value = activeLine.slice(colonIdx + 1).trim();
    const validTypes = ['task', 'plan', 'manual-test', 'manual-commit', 'manual-task', 'unnamed-task'];
    if (!validTypes.includes(taskType)) continue;

    if (taskType === 'task' || taskType === 'plan') {
      items.push({ task_type: taskType, filename: value, description: null, status: isDone ? 'done' : 'pending' });
    } else {
      items.push({ task_type: taskType, filename: null, description: value, status: isDone ? 'done' : 'pending' });
    }
  }
  return items;
}

export function serializePlanqOrder(tasks: PlanqTaskRow[]): string {
  const sorted = [...tasks].sort((a, b) => a.position - b.position);
  const lines: string[] = [];
  for (const t of sorted) {
    let line = t.filename ? `${t.task_type}: ${t.filename}` : `${t.task_type}: ${t.description || ''}`;
    if (t.status === 'done') line = `# done: ${line}`;
    lines.push(line);
  }
  return lines.join('\n') + '\n';
}

export function syncPlanqTasksFromParsed(containerId: string, items: PlanqItem[]): void {
  db.prepare('DELETE FROM planq_tasks WHERE container_id = ?').run(containerId);
  const insert = db.prepare(`
    INSERT INTO planq_tasks (container_id, task_type, filename, description, position, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  items.forEach((item, i) => {
    insert.run(containerId, item.task_type, item.filename ?? null, item.description ?? null, i, item.status);
  });
}

export function getPlanqTasks(containerId: string): PlanqTaskRow[] {
  return db.prepare(
    'SELECT * FROM planq_tasks WHERE container_id = ? ORDER BY position'
  ).all(containerId) as PlanqTaskRow[];
}

export function addPlanqTask(
  containerId: string,
  taskType: string,
  filename: string | null,
  description: string | null
): PlanqTaskRow {
  const maxPos = (db.prepare(
    'SELECT MAX(position) as m FROM planq_tasks WHERE container_id = ?'
  ).get(containerId) as any)?.m ?? -1;
  const result = db.prepare(`
    INSERT INTO planq_tasks (container_id, task_type, filename, description, position, status)
    VALUES (?, ?, ?, ?, ?, 'pending')
  `).run(containerId, taskType, filename ?? null, description ?? null, maxPos + 1);
  return db.prepare('SELECT * FROM planq_tasks WHERE id = ?').get(result.lastInsertRowid) as PlanqTaskRow;
}

export function updatePlanqTask(
  taskId: number,
  updates: { description?: string; status?: string }
): PlanqTaskRow | null {
  const fields: string[] = [];
  const values: any[] = [];
  if (updates.description !== undefined) { fields.push('description = ?'); values.push(updates.description); }
  if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
  if (!fields.length) return null;
  values.push(taskId);
  db.prepare(`UPDATE planq_tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return db.prepare('SELECT * FROM planq_tasks WHERE id = ?').get(taskId) as PlanqTaskRow ?? null;
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
