export interface GitSubmoduleInfo {
  path: string
  branch: string | null
  commit_hash: string
  commit_message: string
  staged_count: number
  staged_diffstat: string | null
  unstaged_count: number
  unstaged_diffstat: string | null
}

export interface SessionState {
  session_id: string
  status: 'busy' | 'idle' | 'awaiting_input' | 'terminated'
  last_prompt: string | null
  last_response_summary: string | null
  subagent_count: number
  model_name: string | null
  last_event_at: number | null
}

export interface PlanqTask {
  id: number
  container_id: string
  task_type: 'task' | 'plan' | 'make-plan' | 'manual-test' | 'manual-commit' | 'manual-task' | 'unnamed-task'
  filename: string | null
  description: string | null
  position: number
  status: 'pending' | 'done' | 'underway' | 'auto-queue'
}

export interface PlanqItem {
  task_type: string
  filename: string | null
  description: string | null
  status: 'pending' | 'done' | 'underway' | 'auto-queue'
}

export interface ContainerWithState {
  id: string
  source_repo: string
  machine_hostname: string
  container_hostname: string
  workspace_host_path: string | null
  git_branch: string | null
  git_worktree: string | null
  git_commit_hash: string | null
  git_commit_message: string | null
  git_staged_count: number
  git_staged_diffstat: string | null
  git_unstaged_count: number
  git_unstaged_diffstat: string | null
  git_submodules: GitSubmoduleInfo[]
  planq_order: string | null
  active_session_ids: string[]
  running_session_ids: string[]
  last_seen: number
  connected: boolean
  sessions: SessionState[]
  status: 'busy' | 'idle' | 'awaiting_input' | 'offline'
  planq_tasks: PlanqTask[]
}

export type DashboardMessage =
  | { type: 'initial'; data: ContainerWithState[] }
  | { type: 'container_update'; data: ContainerWithState }
  | { type: 'container_removed'; data: { id: string } }
  | { type: 'planq_update'; data: { container_id: string; tasks: PlanqTask[] } }
  | { type: 'agent_update'; data: { source_repo: string; session_id: string; status: string; last_prompt: string | null; last_response_summary: string | null } }
