import type { GitCommit } from '../types'

export interface LaidOutCommit {
  commit: GitCommit
  lane: number
  // Snapshot of active lanes AFTER this commit is processed (= before next commit)
  activeLanesAfter: (string | null)[]
}

/**
 * Assign each commit to a lane using the standard git-graph algorithm.
 * Commits must be in topological order (newest first).
 */
export function computeLayout(commits: GitCommit[]): LaidOutCommit[] {
  const result: LaidOutCommit[] = []
  // activeLanes[i] = hash of the commit we expect next in lane i, or null (free)
  const activeLanes: (string | null)[] = []

  for (const commit of commits) {
    // Find this commit's lane
    let myLane = activeLanes.indexOf(commit.hash)
    if (myLane === -1) {
      // Not reserved by any child — use first free lane or allocate new
      myLane = activeLanes.indexOf(null)
      if (myLane === -1) myLane = activeLanes.length
    }

    // Ensure array is long enough
    while (activeLanes.length <= myLane) activeLanes.push(null)

    // Update: replace this commit's slot with its first parent
    if (commit.parents.length === 0) {
      activeLanes[myLane] = null
    } else {
      activeLanes[myLane] = commit.parents[0]
      // Place additional parents (merge parents) in free slots
      for (let i = 1; i < commit.parents.length; i++) {
        const p = commit.parents[i]
        if (activeLanes.includes(p)) continue
        const free = activeLanes.indexOf(null)
        if (free !== -1) activeLanes[free] = p
        else activeLanes.push(p)
      }
    }

    // Trim trailing nulls
    while (activeLanes.length > 0 && activeLanes[activeLanes.length - 1] === null) {
      activeLanes.pop()
    }

    result.push({ commit, lane: myLane, activeLanesAfter: [...activeLanes] })
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
