import type { GitCommit, GitContainer } from '../types'

export interface LaidOutCommit {
  commit: GitCommit
  lane: number
  activeLanesAfter: (string | null)[]
  activeLanesBefore: (string | null)[]
  /** Lanes being closed at this row because their first parent is already tracked elsewhere. */
  closingLanes: Array<{ from: number; to: number }>
}

/** Topologically sort commits (tips/newest first) using Kahn's algorithm. */
function topoSort(commits: GitCommit[]): GitCommit[] {
  const map = new Map<string, GitCommit>()
  for (const c of commits) map.set(c.hash, c)

  const childCount = new Map<string, number>()
  for (const c of commits) {
    if (!childCount.has(c.hash)) childCount.set(c.hash, 0)
    for (const p of c.parents) {
      if (map.has(p)) childCount.set(p, (childCount.get(p) ?? 0) + 1)
    }
  }

  // Tips first (no children within the set), newest first so HEAD's chain
  // is processed before older orphan tips — keeps orphans visually lower.
  const queue: GitCommit[] = commits
    .filter(c => (childCount.get(c.hash) ?? 0) === 0)
    .sort((a, b) => (b.author_date ?? 0) - (a.author_date ?? 0))
  const seen = new Set(queue.map(c => c.hash))
  const result: GitCommit[] = []

  while (queue.length > 0) {
    const c = queue.shift()!
    result.push(c)
    for (const p of c.parents) {
      if (!map.has(p)) continue
      const cnt = (childCount.get(p) ?? 0) - 1
      childCount.set(p, cnt)
      if (cnt === 0 && !seen.has(p)) {
        queue.push(map.get(p)!)
        seen.add(p)
      }
    }
  }

  // Safety net for cycles or disconnected nodes
  for (const c of commits) {
    if (!seen.has(c.hash)) result.push(c)
  }

  return result
}

/**
 * Assign each commit to a lane using the standard git-graph algorithm.
 * Commits are topologically sorted internally (tips first).
 */
export function computeLayout(commits: GitCommit[]): LaidOutCommit[] {
  const sorted = topoSort(commits)
  const result: LaidOutCommit[] = []
  const activeLanes: (string | null)[] = []

  for (const commit of sorted) {
    let myLane = activeLanes.indexOf(commit.hash)
    if (myLane === -1) {
      myLane = activeLanes.indexOf(null)
      if (myLane === -1) myLane = activeLanes.length
    }

    while (activeLanes.length <= myLane) activeLanes.push(null)

    // Snapshot BEFORE updating lanes — used by renderer to detect newly-opened lanes
    const activeLanesBefore = [...activeLanes]
    const closingLanes: Array<{ from: number; to: number }> = []

    if (commit.parents.length === 0) {
      activeLanes[myLane] = null
    } else {
      const firstParent = commit.parents[0]
      // If the first parent is already tracked in a different lane, close this lane
      // toward that lane rather than duplicating the tracking.
      const existingFirstParentLane = activeLanes.indexOf(firstParent)
      if (existingFirstParentLane !== -1 && existingFirstParentLane !== myLane) {
        closingLanes.push({ from: myLane, to: existingFirstParentLane })
        activeLanes[myLane] = null
      } else {
        activeLanes[myLane] = firstParent
      }
      for (let i = 1; i < commit.parents.length; i++) {
        const p = commit.parents[i]
        if (activeLanes.includes(p)) continue
        const free = activeLanes.indexOf(null)
        if (free !== -1) activeLanes[free] = p
        else activeLanes.push(p)
      }
    }

    while (activeLanes.length > 0 && activeLanes[activeLanes.length - 1] === null) {
      activeLanes.pop()
    }

    result.push({ commit, lane: myLane, activeLanesAfter: [...activeLanes], activeLanesBefore, closingLanes })
  }

  return result
}

/**
 * Format a ref string for display.
 * "HEAD -> main"      → { text: "main", type: "head" }
 * "origin/main"       → { text: "orig/main", type: "remote" }
 * "tag: v1.0"         → { text: "tag/v1.0", type: "tag" }
 * "main"              → { text: "main", type: "local" }
 */
export interface FormattedRef {
  text: string
  type: 'head' | 'local' | 'remote' | 'tag'
}

export function formatRef(ref: string): FormattedRef {
  if (ref.startsWith('HEAD -> ')) return { text: ref.slice('HEAD -> '.length), type: 'head' }
  if (ref === 'HEAD') return { text: 'HEAD', type: 'head' }
  if (ref.startsWith('tag: ')) return { text: 'tag/' + ref.slice('tag: '.length), type: 'tag' }
  if (ref.includes('/')) return { text: ref.replace(/^[^/]+\//, 'orig/'), type: 'remote' }
  return { text: ref, type: 'local' }
}

/** Lane color palette (cycles) */
const LANE_COLORS = [
  '#60a5fa', // blue-400
  '#34d399', // emerald-400
  '#f87171', // red-400
  '#a78bfa', // violet-400
  '#fbbf24', // amber-400
  '#38bdf8', // sky-400
  '#fb923c', // orange-400
  '#4ade80', // green-400
]

export function laneColor(lane: number): string {
  return LANE_COLORS[lane % LANE_COLORS.length]
}

/** Derive a display label for a container (workspace dir + worktree if applicable). */
export function containerDirLabel(c: GitContainer): string {
  const dir = c.workspace_host_path ? c.workspace_host_path.split('/').pop()! : null
  const wt = c.git_worktree ? c.git_worktree.replace(/^trees\//, '').split('/').pop() ?? null : null
  if (dir && wt && dir !== wt) return `${dir} [${wt}]`
  return dir ?? c.id
}
