// Workspace state — fetch projects/tasks, listen for ws.* events on the
// existing dashboard WebSocket, expose mutating actions.
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { API_BASE_URL, WS_URL } from '../config';

export interface WSProject {
  id: string;
  name: string;
  path: string;
  created_at: number;
  task_counts: { backlog: number; running: number; review: number; done: number };
  spend?: { cost_usd: number; tasks: number };
}
export interface WSTask {
  id: string;
  project_id: string;
  project_name?: string;
  project_path?: string;
  title: string;
  prompt: string;
  model: string;
  mode: 'safe' | 'auto';
  status: 'backlog' | 'queued' | 'running' | 'review' | 'done' | 'failed';
  pid: number | null;
  exit_code: number | null;
  created_at: number;
  started_at: number | null;
  finished_at: number | null;
  log_path: string | null;
  cost_usd: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cache_create_tokens: number | null;
  session_id?: string | null;
  parent_task_id?: string | null;
  worktree_path?: string | null;
  branch?: string | null;
}
export interface VibeTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  body: string;
  builtin: boolean;
  created_at?: number;
  updated_at?: number;
}

export function useWorkspace() {
  const projects = ref<WSProject[]>([]);
  const tasks = ref<WSTask[]>([]);
  const pinnedIds = ref<string[]>([]);
  const templates = ref<VibeTemplate[]>([]);
  const error = ref<string | null>(null);
  const loading = ref(false);
  // Live log buffers per task: taskId → string (rolling tail)
  const liveLogs = ref<Record<string, string>>({});

  async function refresh() {
    loading.value = true;
    try {
      const [pr, tr, pn, tp] = await Promise.all([
        fetch(`${API_BASE_URL}/api/atlas/workspace/projects`).then(r => r.json()),
        fetch(`${API_BASE_URL}/api/atlas/workspace/tasks`).then(r => r.json()),
        fetch(`${API_BASE_URL}/api/atlas/workspace/pins`).then(r => r.json()),
        fetch(`${API_BASE_URL}/api/atlas/workspace/templates`).then(r => r.json()),
      ]);
      projects.value = pr.projects || [];
      tasks.value = tr.tasks || [];
      pinnedIds.value = pn.pinnedIds || [];
      templates.value = tp.templates || [];
      error.value = null;
    } catch (e: any) {
      error.value = e.message;
    } finally {
      loading.value = false;
    }
  }

  async function pinTaskRemote(id: string): Promise<void> {
    const r = await fetch(`${API_BASE_URL}/api/atlas/workspace/pins`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: id }),
    }).then(r => r.json());
    if (!r.ok) throw new Error(r.error || 'pin failed');
    if (!pinnedIds.value.includes(id)) pinnedIds.value = [...pinnedIds.value, id];
  }
  async function unpinTaskRemote(id: string): Promise<void> {
    await fetch(`${API_BASE_URL}/api/atlas/workspace/pins/${id}`, { method: 'DELETE' });
    pinnedIds.value = pinnedIds.value.filter(x => x !== id);
  }
  async function unpinAllRemote(): Promise<void> {
    await fetch(`${API_BASE_URL}/api/atlas/workspace/pins`, { method: 'DELETE' });
    pinnedIds.value = [];
  }

  async function getProjectMemory(projectId: string): Promise<string> {
    const r = await fetch(`${API_BASE_URL}/api/atlas/workspace/projects/${projectId}/memory`).then(r => r.json());
    return r.body || '';
  }
  async function setProjectMemory(projectId: string, body: string): Promise<void> {
    const r = await fetch(`${API_BASE_URL}/api/atlas/workspace/projects/${projectId}/memory`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    }).then(r => r.json());
    if (!r.ok) throw new Error(r.error || 'save failed');
  }

  async function createProject(name: string, path: string) {
    const r = await fetch(`${API_BASE_URL}/api/atlas/workspace/projects`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, path }),
    }).then(r => r.json());
    if (!r.ok) throw new Error(r.error || 'create failed');
    await refresh();
    return r.project as WSProject;
  }

  async function deleteProject(id: string) {
    const r = await fetch(`${API_BASE_URL}/api/atlas/workspace/projects/${id}`, { method: 'DELETE' }).then(r => r.json());
    if (!r.ok) throw new Error(r.error || 'delete failed');
    await refresh();
  }

  async function createTask(input: { project_id: string; title: string; prompt: string; model: string; mode: 'safe' | 'auto' }) {
    const r = await fetch(`${API_BASE_URL}/api/atlas/workspace/tasks`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }).then(r => r.json());
    if (!r.ok) throw new Error(r.error || 'create failed');
    tasks.value = [r.task, ...tasks.value];
    return r.task as WSTask;
  }

  async function taskAction(id: string, action: 'spawn' | 'kill' | 'move' | 'delete', body: any = {}) {
    const r = await fetch(`${API_BASE_URL}/api/atlas/workspace/tasks/${id}/${action}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(r => r.json());
    if (!r.ok) throw new Error(r.error || `${action} failed`);
    return r;
  }

  async function fetchTaskLog(id: string): Promise<string> {
    const r = await fetch(`${API_BASE_URL}/api/atlas/workspace/tasks/${id}/log`).then(r => r.json());
    return r.log || '';
  }

  async function createTemplate(input: { name: string; category?: string; description?: string; body: string }): Promise<VibeTemplate> {
    const r = await fetch(`${API_BASE_URL}/api/atlas/workspace/templates`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }).then(r => r.json());
    if (!r.ok) throw new Error(r.error || 'create template failed');
    templates.value = [...templates.value, r.template];
    return r.template as VibeTemplate;
  }
  async function updateTemplate(id: string, input: { name?: string; category?: string; description?: string; body?: string }): Promise<void> {
    const r = await fetch(`${API_BASE_URL}/api/atlas/workspace/templates/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }).then(r => r.json());
    if (!r.ok) throw new Error(r.error || 'update template failed');
    const idx = templates.value.findIndex(t => t.id === id);
    if (idx >= 0) templates.value[idx] = { ...templates.value[idx], ...input };
  }
  async function deleteTemplate(id: string): Promise<void> {
    const r = await fetch(`${API_BASE_URL}/api/atlas/workspace/templates/${id}`, {
      method: 'DELETE',
    }).then(r => r.json());
    if (!r.ok) throw new Error(r.error || 'delete template failed');
    templates.value = templates.value.filter(t => t.id !== id);
  }
  async function fetchTaskDiff(id: string): Promise<{ ok: boolean; diff: string; error?: string }> {
    const r = await fetch(`${API_BASE_URL}/api/atlas/workspace/tasks/${id}/diff`).then(r => r.json());
    return { ok: r.ok, diff: r.diff || '', error: r.error };
  }
  async function mergeTask(id: string): Promise<void> {
    const r = await fetch(`${API_BASE_URL}/api/atlas/workspace/tasks/${id}/merge`, { method: 'POST' }).then(r => r.json());
    if (!r.ok) throw new Error(r.error || 'merge failed');
    await refresh();
  }
  async function discardTaskWorktree(id: string): Promise<void> {
    const r = await fetch(`${API_BASE_URL}/api/atlas/workspace/tasks/${id}/discard`, { method: 'POST' }).then(r => r.json());
    if (!r.ok) throw new Error(r.error || 'discard failed');
    const t = tasks.value.find(x => x.id === id);
    if (t) { t.worktree_path = null; t.branch = null; tasks.value = [...tasks.value]; }
  }

  async function mergeAndPushTask(id: string): Promise<{ pushed_branch?: string }> {
    const r = await fetch(`${API_BASE_URL}/api/atlas/workspace/tasks/${id}/merge-push`, { method: 'POST' }).then(r => r.json());
    if (!r.ok) throw new Error(r.error || 'merge+push failed');
    await refresh();
    return { pushed_branch: r.pushed_branch };
  }
  async function openPRForTask(id: string): Promise<{ pr_url?: string }> {
    const r = await fetch(`${API_BASE_URL}/api/atlas/workspace/tasks/${id}/pr`, { method: 'POST' }).then(r => r.json());
    if (!r.ok) throw new Error(r.error || 'PR failed');
    return { pr_url: r.pr_url };
  }
  async function getProjectInfo(projectId: string): Promise<any> {
    const r = await fetch(`${API_BASE_URL}/api/atlas/workspace/projects/${projectId}/info`).then(r => r.json());
    if (!r.ok) throw new Error(r.error || 'info failed');
    return r;
  }

  async function archiveTask(id: string): Promise<void> {
    await fetch(`${API_BASE_URL}/api/atlas/workspace/tasks/${id}/archive`, { method: 'POST' });
    tasks.value = tasks.value.filter(t => t.id !== id);
    pinnedIds.value = pinnedIds.value.filter(x => x !== id);
  }
  async function archiveDone(projectId?: string): Promise<{ archived: number }> {
    const r = await fetch(`${API_BASE_URL}/api/atlas/workspace/archive/done`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(projectId ? { project_id: projectId } : {}),
    }).then(r => r.json());
    await refresh();
    return r;
  }

  async function followUpTask(parentId: string, prompt: string): Promise<WSTask> {
    const r = await fetch(`${API_BASE_URL}/api/atlas/workspace/tasks/${parentId}/follow-up`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    }).then(r => r.json());
    if (!r.ok) throw new Error(r.error || 'follow-up failed');
    tasks.value = [r.task, ...tasks.value];
    return r.task as WSTask;
  }

  // Subscribe to workspace WebSocket events. Reuse the same /stream socket
  // the dashboard already opens — but we want our own subscription so we
  // get every event independent of useWebSocket's filter.
  let ws: WebSocket | null = null;
  function attachWS() {
    try {
      ws = new WebSocket(WS_URL);
      ws.onmessage = (ev) => {
        let m: any;
        try { m = JSON.parse(ev.data); } catch { return; }
        if (m?.type === 'workspace.log') {
          const tid = m.data?.taskId;
          if (!tid) return;
          const prev = liveLogs.value[tid] || '';
          const next = (prev + m.data.text).slice(-200_000);
          liveLogs.value = { ...liveLogs.value, [tid]: next };
        } else if (m?.type === 'workspace.task') {
          const tid = m.data?.taskId;
          if (!tid) return;
          const t = tasks.value.find(t => t.id === tid);
          if (t) {
            if (m.data.status) t.status = m.data.status;
            if (typeof m.data.pid === 'number') t.pid = m.data.pid;
            if (typeof m.data.exit_code === 'number') t.exit_code = m.data.exit_code;
            // mutate triggers reactivity via array replacement
            tasks.value = [...tasks.value];
          } else {
            refresh();
          }
        }
      };
    } catch (e: any) {
      console.warn('[workspace] WS attach failed:', e.message);
    }
  }

  onMounted(() => {
    refresh();
    attachWS();
  });
  onUnmounted(() => { try { ws?.close(); } catch {} });

  const tasksByProject = computed(() => {
    const m: Record<string, WSTask[]> = {};
    for (const t of tasks.value) {
      if (!m[t.project_id]) m[t.project_id] = [];
      m[t.project_id].push(t);
    }
    return m;
  });

  return {
    projects, tasks, pinnedIds, templates, tasksByProject, liveLogs, error, loading,
    refresh, createProject, deleteProject, createTask, taskAction, fetchTaskLog,
    pinTaskRemote, unpinTaskRemote, unpinAllRemote,
    getProjectMemory, setProjectMemory,
    followUpTask,
    createTemplate, updateTemplate, deleteTemplate,
    archiveTask, archiveDone,
    fetchTaskDiff, mergeTask, discardTaskWorktree,
    mergeAndPushTask, openPRForTask, getProjectInfo,
  };
}
