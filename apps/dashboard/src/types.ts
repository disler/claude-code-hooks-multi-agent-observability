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

export type ReviewStatus =
  | 'none' | 'ready' | 'testing' | 'passed' | 'has-issues'
  | 'fix-scheduled' | 'follow-up' | 'revert-scheduled'
  | 'ready-for-merge' | 'merged' | 'cancelled' | 'retry-later'

export interface PlanqTask {
  id: number
  container_id: string
  task_type: 'task' | 'plan' | 'make-plan' | 'investigate' | 'manual-test' | 'manual-commit' | 'manual-task' | 'unnamed-task' | 'auto-test' | 'auto-commit'
  filename: string | null
  description: string | null
  position: number
  status: 'pending' | 'done' | 'underway' | 'auto-queue' | 'awaiting-commit' | 'awaiting-plan' | 'deferred'
  auto_commit: boolean
  commit_mode: 'none' | 'auto' | 'stage' | 'manual'
  plan_disposition: 'manual' | 'add-after' | 'add-end'
  auto_queue_plan: boolean
  review_status: ReviewStatus
  parent_task_id: number | null
  link_type: 'follow-up' | 'fix-required' | 'check' | 'other' | null
  session_ids: string[]
}

export interface PlanqItem {
  task_type: string
  filename: string | null
  description: string | null
  status: 'pending' | 'done' | 'underway' | 'auto-queue' | 'awaiting-commit' | 'awaiting-plan' | 'deferred'
  auto_commit: boolean
  commit_mode: 'none' | 'auto' | 'stage' | 'manual'
}

export interface AutoTestPending {
  command: string
  output: string
  exit_code: number
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
  auto_test_pending: AutoTestPending | null
  review_state?: string | null
  test_results?: string | null
}

export interface GitCommit {
  hash: string
  parents: string[]
  refs: string[]
  subject: string
  author?: string
  author_date?: number
  session_ids?: string[]
}

export interface GitContainer {
  id: string
  machine_hostname: string
  container_hostname: string
  git_branch: string | null
  git_worktree: string | null
  git_commit_hash: string | null
  parent_commit_hash?: string | null
  git_staged_count: number
  git_unstaged_count: number
  git_unstaged_diffstat: string | null
  git_staged_diffstat: string | null
  workspace_host_path: string | null
  connected: boolean
  git_submodules?: Array<{ path: string; branch: string | null; commit_hash: string | null; commit_message?: string; staged_count: number; staged_diffstat?: string | null; unstaged_count: number; unstaged_diffstat?: string | null }>
}

export interface GitViewData {
  containers: GitContainer[]
  commits: GitCommit[]
  refsPerHost: Array<{ hash: string; host: string; localBranches: string[] }>
  remote_url?: string | null
  submodules?: Array<{ path: string; source_repo: string }>
}

export type DashboardMessage =
  | { type: 'initial'; data: ContainerWithState[] }
  | { type: 'container_update'; data: ContainerWithState }
  | { type: 'container_removed'; data: { id: string } }
  | { type: 'planq_update'; data: { container_id: string; tasks: PlanqTask[] } }
  | { type: 'agent_update'; data: { source_repo: string; session_id: string; status: string; last_prompt: string | null; last_response_summary: string | null } }
  | { type: 'git_refresh_ready'; source_repo: string }
