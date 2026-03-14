<template>
  <div ref="scrollEl" class="overflow-auto h-full relative">
    <svg
      ref="svgEl"
      :width="svgWidth"
      :height="svgHeight"
      class="select-none"
    >
      <!-- Edges (drawn first, under circles) -->
      <g v-for="(row, i) in layout" :key="'edges-' + row.commit.hash">
        <!-- Segments from this row to next row -->
        <template v-if="i + 1 < layout.length">
          <template v-for="(laneHash, j) in row.activeLanesAfter" :key="'seg-' + i + '-' + j">
            <line
              v-if="laneHash !== null"
              :x1="(row.activeLanesBefore[j] == null && row.activeLanesAfter[j] != null) ? laneX(row.lane) : laneX(j)"
              :y1="rowY(i)"
              :x2="laneX(targetLane(row.activeLanesAfter, j, i + 1))"
              :y2="rowY(i + 1)"
              :stroke="laneColor(j)"
              stroke-width="1.5"
              opacity="0.7"
            />
          </template>
          <!-- Closing segments: branch lanes whose first parent is already tracked elsewhere -->
          <line
            v-for="(cl, ci) in row.closingLanes"
            :key="'close-' + i + '-' + ci"
            :x1="laneX(cl.from)"
            :y1="rowY(i)"
            :x2="laneX(cl.to)"
            :y2="rowY(i + 1)"
            :stroke="laneColor(cl.from)"
            stroke-width="1.5"
            opacity="0.7"
          />
        </template>
      </g>

      <!-- Commit rows -->
      <g v-for="(row, i) in layout" :key="'commit-' + row.commit.hash">
        <!-- Commit circle -->
        <circle
          :cx="laneX(row.lane)"
          :cy="rowY(i)"
          :r="CIRCLE_R"
          :fill="isHeadCommit(row.commit.hash) ? '#fff' : laneColor(row.lane)"
          :stroke="dirtyRing(row.commit.hash) ? '#fb923c' : 'none'"
          stroke-width="2"
class="cursor-pointer"
          @click="$emit('select-hash', row.commit.hash)"
        />
        <!-- Dirty indicator ring -->
        <circle
          v-if="dirtyRing(row.commit.hash)"
          :cx="laneX(row.lane)"
          :cy="rowY(i)"
          :r="CIRCLE_R + 3"
          fill="none"
          stroke="#fb923c"
          stroke-width="1.5"
          opacity="0.6"
        />

        <!-- Labels (refs + container labels + hash + subject) -->
        <g :transform="`translate(${labelX}, ${rowY(i)})`">
          <!-- Container-specific HEAD labels -->
          <g v-for="(cl, ci) in containerLabels(row.commit.hash)" :key="'cl-' + ci">
            <rect
              :x="containerLabelOffsets[i]?.[ci]?.x ?? 0"
              :y="-7"
              :width="containerLabelOffsets[i]?.[ci]?.w ?? 0"
              height="14"
              rx="3"
              :fill="cl.dirty ? '#4c1d20' : '#1e3a4c'"
              opacity="0.9"
            />
            <text
              :x="(containerLabelOffsets[i]?.[ci]?.x ?? 0) + 4"
              y="4"
              font-size="9"
              font-family="monospace"
              :fill="cl.dirty ? '#fca5a5' : '#7dd3fc'"
            ><tspan v-if="cl.prefix">{{ cl.prefix }}</tspan><tspan font-weight="bold">{{ cl.bold }}</tspan><tspan opacity="0.7">{{ cl.suffix }}</tspan></text>

            <!-- Staged count badge -->
            <g
              v-if="cl.stagedCount > 0"
              class="cursor-pointer"
              @click.stop="onDirtyBadgeClick(i, ci, 'staged', $event)"
            >
              <rect
                :x="containerLabelOffsets[i]?.[ci]?.stagedX ?? 0"
                :y="-6"
                :width="containerLabelOffsets[i]?.[ci]?.stagedW ?? 0"
                height="12"
                rx="2"
                fill="#1e3a5f"
                stroke="#3b82f6"
                stroke-width="0.5"
                opacity="0.9"
              />
              <text
                :x="(containerLabelOffsets[i]?.[ci]?.stagedX ?? 0) + 3"
                y="4"
                font-size="8"
                font-family="monospace"
                fill="#93c5fd"
              >+{{ cl.stagedCount }}</text>
            </g>

            <!-- Unstaged count badge -->
            <g
              v-if="cl.unstagedCount > 0"
              class="cursor-pointer"
              @click.stop="onDirtyBadgeClick(i, ci, 'unstaged', $event)"
            >
              <rect
                :x="containerLabelOffsets[i]?.[ci]?.unstagedX ?? 0"
                :y="-6"
                :width="containerLabelOffsets[i]?.[ci]?.unstagedW ?? 0"
                height="12"
                rx="2"
                fill="#431407"
                stroke="#f97316"
                stroke-width="0.5"
                opacity="0.9"
              />
              <text
                :x="(containerLabelOffsets[i]?.[ci]?.unstagedX ?? 0) + 3"
                y="4"
                font-size="8"
                font-family="monospace"
                fill="#fed7aa"
              >~{{ cl.unstagedCount }}</text>
            </g>
          </g>

          <!-- All ref badges (local branches per-host + HEAD/remote/tag) -->
          <g
            v-for="(badge, bi) in allBadgesForCommit(row.commit)"
            :key="'badge-' + bi"
            class="cursor-pointer"
            :opacity="badge.opacity"
            @click="onRefClick(row.commit.hash)"
          >
            <rect
              :x="badgeOffsets[i]?.[bi]?.x ?? 0"
              :y="-7"
              :width="badgeOffsets[i]?.[bi]?.w ?? 0"
              height="14"
              rx="3"
              :fill="badge.bgColor"
            />
            <text
              :x="(badgeOffsets[i]?.[bi]?.x ?? 0) + 4"
              y="4"
              font-size="9"
              font-family="monospace"
              :fill="badge.textColor"
            >{{ badge.text }}</text>
          </g>

          <!-- PR link icons for local branch badges with remote tracking refs -->
          <a
            v-for="(badge, bi) in allBadgesForCommit(row.commit)"
            :key="'pr-' + bi"
            v-show="badge.prUrl && (badgeOffsets[i]?.[bi]?.prW ?? 0) > 0"
            :href="badge.prUrl"
            target="_blank"
            @click.stop="badge.prUrl && openPrUrl(badge.prUrl)"
            class="cursor-pointer"
            :title="badge.prDirty ? 'Has unstaged changes — open PR anyway?' : (badge.prExists ? (badge.prDraft ? 'View draft PR on GitHub' : 'View PR on GitHub') : 'Create pull request on GitHub')"
          >
            <g :transform="`translate(${badgeOffsets[i]?.[bi]?.prX ?? 0}, -6) scale(0.875)`">
              <rect width="16" height="13" :fill="badge.prDirty ? '#1a1a1a' : (badge.prExists ? (badge.prDraft ? '#1e1e3f' : '#0c1a2e') : '#052e16')" rx="2" opacity="0.85" />
              <path
                d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354Z"
                transform="translate(1, 0) scale(0.8)"
                :fill="badge.prDirty ? '#4b5563' : (badge.prExists ? (badge.prDraft ? '#a78bfa' : '#60a5fa') : '#4ade80')"
              />
            </g>
          </a>

          <!-- ↑ scroll-to-source buttons for out-of-date branch badges -->
          <g
            v-for="(badge, bi) in allBadgesForCommit(row.commit)"
            :key="'up-' + bi"
            v-show="badge.sourceHash && (badgeOffsets[i]?.[bi]?.upW ?? 0) > 0"
            class="cursor-pointer"
            @click.stop="badge.sourceHash && onRefClick(badge.sourceHash)"
            title="Scroll to this branch on the local host"
          >
            <rect
              :x="badgeOffsets[i]?.[bi]?.upX ?? 0"
              y="-6"
              :width="badgeOffsets[i]?.[bi]?.upW ?? 0"
              height="13"
              rx="2"
              fill="#451a03"
              opacity="0.85"
            />
            <text
              :x="(badgeOffsets[i]?.[bi]?.upX ?? 0) + 2"
              y="4"
              font-size="10"
              font-family="monospace"
              fill="#fcd34d"
            >↑</text>
          </g>

          <!-- Commit hash + subject -->
          <text
            :x="badgeOffsets[i]?.[allBadgesForCommit(row.commit).length]?.x ?? 0"
            y="4"
            font-size="10"
            font-family="monospace"
            fill="#94a3b8"
            class="cursor-pointer hover:fill-white"
            @click.stop="$emit('select-hash', row.commit.hash)"
          >{{ row.commit.hash.slice(0, 8) }}</text>
          <text
            :x="(badgeOffsets[i]?.[allBadgesForCommit(row.commit).length]?.x ?? 0) + 60"
            y="4"
            font-size="10"
            font-family="sans-serif"
            fill="#cbd5e1"
            class="cursor-pointer hover:fill-white"
            @click.stop="$emit('select-hash', row.commit.hash)"
          >{{ clippedSubject(i) }}</text>

          <!-- Session link badge -->
          <text
            v-if="row.commit.session_ids?.length"
            :x="svgWidth - AUTHOR_W - DATE_W - labelX - 18"
            y="4"
            font-size="10"
            fill="#818cf8"
            class="cursor-pointer hover:fill-white"
            :title="`${row.commit.session_ids.length} linked session(s)`"
            @click.stop="$emit('open-session', row.commit.session_ids[row.commit.session_ids.length - 1])"
          >💬</text>

          <!-- Author column -->
          <text
            v-if="row.commit.author"
            :x="svgWidth - AUTHOR_W - DATE_W - labelX"
            y="4"
            font-size="9"
            font-family="sans-serif"
            fill="#64748b"
          >{{ row.commit.author.slice(0, 14) }}</text>

          <!-- Date column -->
          <g v-if="row.commit.author_date">
            <title>{{ absoluteDate(row.commit.author_date) }}</title>
            <text
              :x="svgWidth - DATE_W + 4 - labelX"
              y="4"
              font-size="9"
              font-family="monospace"
              fill="#64748b"
            >{{ relativeDate(row.commit.author_date) }}</text>
          </g>
        </g>

        <!-- Selected / flash highlight -->
        <rect
          v-if="selectedHash === row.commit.hash || flashHash === row.commit.hash"
          :x="0"
          :y="rowY(i) - ROW_H / 2"
          :width="svgWidth"
          :height="ROW_H"
          :fill="flashHash === row.commit.hash ? '#fbbf24' : 'white'"
          :opacity="flashHash === row.commit.hash ? '0.12' : '0.04'"
          rx="3"
        />
      </g>

      <!-- Column separator lines (author | date) -->
      <line v-if="layout.length > 0 && layout.some(r => r.commit.author)"
        :x1="svgWidth - AUTHOR_W - DATE_W - 4" y1="0"
        :x2="svgWidth - AUTHOR_W - DATE_W - 4" :y2="svgHeight"
        stroke="#1e293b" stroke-width="1"
      />
      <line v-if="layout.length > 0 && layout.some(r => r.commit.author_date)"
        :x1="svgWidth - DATE_W - 2" y1="0"
        :x2="svgWidth - DATE_W - 2" :y2="svgHeight"
        stroke="#1e293b" stroke-width="1"
      />
    </svg>

    <!-- Dirty diffstat popover (teleported to body to avoid SVG/overflow clipping) -->
    <Teleport to="body">
      <div
        v-if="activeDirtyPopover"
        class="fixed z-[9999] min-w-64 max-w-xl bg-slate-900 border border-slate-600 rounded-lg shadow-2xl p-3"
        :style="{ left: activeDirtyPopover.x + 'px', top: activeDirtyPopover.y + 'px' }"
        @click.stop
      >
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs text-slate-400 font-semibold uppercase tracking-wide">
            {{ activeDirtyPopover.kind === 'staged' ? 'staged' : 'unstaged' }} diffstat
          </span>
          <button @click="closeDirtyPopover" class="text-slate-500 hover:text-slate-300 text-xs">✕</button>
        </div>
        <pre class="text-xs text-slate-200 font-mono overflow-x-auto whitespace-pre">{{ activeDirtyPopover.diffstat }}</pre>
      </div>
    </Teleport>

  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { computeLayout, formatRef, laneColor, containerDirLabel } from '../composables/useGitGraph'
import { useHostnameAliases } from '../composables/useHostnameAliases'
import { API_BASE } from '../config'
import type { GitCommit, GitContainer } from '../types'

const { alias } = useHostnameAliases()

// PR data: branch → { number, url, draft }
interface PrInfo { number: number; url: string; draft: boolean }
const prByBranch = ref<Map<string, PrInfo>>(new Map())

async function fetchPrs() {
  if (!githubInfo.value) return
  try {
    const res = await fetch(`${API_BASE}/dashboard/github-prs/${encodeURIComponent(githubInfo.value.owner)}/${encodeURIComponent(githubInfo.value.repo)}`)
    if (!res.ok) return
    const data = await res.json()
    const map = new Map<string, PrInfo>()
    for (const pr of data.prs ?? []) {
      map.set(pr.branch, { number: pr.number, url: pr.url, draft: pr.draft })
    }
    prByBranch.value = map
  } catch { /* ignore */ }
}

const LANE_W = 18
const ROW_H = 24
const CIRCLE_R = 5
const LABEL_PAD = 12
const AUTHOR_W = 115
const DATE_W = 72

const props = defineProps<{
  commits: GitCommit[]
  containers: GitContainer[]
  selectedHash: string | null
  refsPerHost: Array<{ hash: string; host: string; localBranches: string[] }>
  remoteUrl?: string
  sourceHost?: string
  sourceRepo?: string
}>()

const emit = defineEmits<{
  'select-hash': [hash: string]
  'open-session': [sessionId: string]
}>()

const scrollEl = ref<HTMLElement | null>(null)
const svgEl = ref<SVGSVGElement | null>(null)
const flashHash = ref<string | null>(null)

const layout = computed(() => computeLayout(props.commits))

const maxLanes = computed(() => {
  let m = 1
  for (const row of layout.value) m = Math.max(m, row.lane + 1, row.activeLanesAfter.length)
  return m
})

const labelX = computed(() => maxLanes.value * LANE_W + LABEL_PAD)
const svgWidth = computed(() => Math.max(1100, labelX.value + 800) + AUTHOR_W + DATE_W)
const svgHeight = computed(() => Math.max(layout.value.length * ROW_H + 8, 40))

function laneX(lane: number) { return lane * LANE_W + LANE_W / 2 }
function rowY(i: number) { return i * ROW_H + ROW_H / 2 }

// Find which lane a given hash will be in at the next row
function targetLane(afterLanes: (string | null)[], fromLane: number, nextRow: number): number {
  const hash = afterLanes[fromLane]
  if (!hash) return fromLane
  if (nextRow < layout.value.length && layout.value[nextRow].commit.hash === hash) {
    return layout.value[nextRow].lane
  }
  return fromLane
}

// Containers whose HEAD matches this commit (short-hash-safe comparison)
function headContainers(hash: string) {
  return props.containers.filter(c => c.git_commit_hash && hash.startsWith(c.git_commit_hash))
}
function isHeadCommit(hash: string) { return headContainers(hash).length > 0 }
function dirtyRing(hash: string) {
  return headContainers(hash).some(c => c.git_staged_count > 0 || c.git_unstaged_count > 0)
}

interface ContainerLabel {
  prefix: string
  bold: string
  suffix: string
  dirty: boolean
  stagedCount: number
  stagedDiffstat: string | null
  unstagedCount: number
  unstagedDiffstat: string | null
}

// When in submodule view, return the submodule basename; otherwise use the workspace dir.
function effectiveContainerLabel(c: GitContainer): string {
  const slashIdx = (props.sourceRepo ?? '').indexOf('/')
  if (slashIdx >= 0) {
    // Submodule view: show submodule name (last component of the submodule path) + worktree suffix
    const subPath = props.sourceRepo!.slice(slashIdx + 1)
    const subName = subPath.split('/').pop() ?? subPath
    const wt = c.git_worktree ? c.git_worktree.replace(/^trees\//, '').split('/').pop() ?? null : null
    if (wt && subName !== wt) return `${subName} [${wt}]`
    return subName
  }
  return containerDirLabel(c)
}

function containerLabels(hash: string): ContainerLabel[] {
  return headContainers(hash).map(c => {
    const label = effectiveContainerLabel(c)
    const dirty = c.git_staged_count > 0 || c.git_unstaged_count > 0
    const suffix = `@${alias(c.machine_hostname)}`
    if (c.git_worktree) {
      const bracketIdx = label.lastIndexOf(' [')
      if (bracketIdx >= 0) {
        return {
          prefix: label.slice(0, bracketIdx), bold: label.slice(bracketIdx), suffix, dirty,
          stagedCount: c.git_staged_count, stagedDiffstat: c.git_staged_diffstat,
          unstagedCount: c.git_unstaged_count, unstagedDiffstat: c.git_unstaged_diffstat,
        }
      }
    }
    return {
      prefix: '', bold: label, suffix, dirty,
      stagedCount: c.git_staged_count, stagedDiffstat: c.git_staged_diffstat,
      unstagedCount: c.git_unstaged_count, unstagedDiffstat: c.git_unstaged_diffstat,
    }
  })
}

// Parse GitHub remote URL into { owner, repo } or null
const githubInfo = computed(() => {
  if (!props.remoteUrl) return null
  const m = props.remoteUrl.match(/github\.com[/:]([^/]+)\/([^/\s.]+?)(\.git)?\s*$/)
  if (!m) return null
  return { owner: m[1], repo: m[2] }
})

// Detect the default branch from remote tracking refs (origin/main preferred over origin/master)
const defaultBranch = computed(() => {
  for (const commit of props.commits) {
    for (const ref of commit.refs) {
      if (ref === 'origin/main' || ref.endsWith('/main')) return 'main'
    }
  }
  for (const commit of props.commits) {
    for (const ref of commit.refs) {
      if (ref === 'origin/master' || ref.endsWith('/master')) return 'master'
    }
  }
  return 'main'
})

// Per-host local branch data: map from hash → map from host → branch names
const refsByHash = computed(() => {
  const map = new Map<string, Map<string, string[]>>()
  for (const { hash, host, localBranches } of props.refsPerHost) {
    if (!map.has(hash)) map.set(hash, new Map())
    map.get(hash)!.set(host, localBranches)
  }
  return map
})

// For the source host, map from branch name → commit hash (so we can show ↑ buttons to outdated badges)
const sourceBranchTips = computed(() => {
  const tips = new Map<string, string>()
  if (!props.sourceHost) return tips
  for (const { hash, host, localBranches } of props.refsPerHost) {
    if (host === props.sourceHost) {
      for (const branch of localBranches) tips.set(branch, hash)
    }
  }
  return tips
})

// Branch names that appear at more than one distinct hash (diverged across hosts)
const conflictBranches = computed(() => {
  const branchHashes = new Map<string, Set<string>>()
  for (const { hash, localBranches } of props.refsPerHost) {
    for (const branch of localBranches) {
      if (!branchHashes.has(branch)) branchHashes.set(branch, new Set())
      branchHashes.get(branch)!.add(hash)
    }
  }
  const conflicts = new Set<string>()
  for (const [branch, hashes] of branchHashes) {
    if (hashes.size > 1) conflicts.add(branch)
  }
  return conflicts
})

interface BadgeInfo { text: string; bgColor: string; textColor: string; opacity: string; prUrl?: string; prExists?: boolean; prDraft?: boolean; sourceHash?: string; prDirty?: boolean }

function allBadgesForCommit(commit: GitCommit): BadgeInfo[] {
  const badges: BadgeInfo[] = []

  // 1. Per-host local branch badges
  const hostMap = refsByHash.value.get(commit.hash)
  if (hostMap) {
    for (const [host, branches] of hostMap) {
      for (const branch of branches) {
        const isConflicted = conflictBranches.value.has(branch)
        const dim = !isConflicted
        // Show PR button if this branch has a remote tracking ref at this commit and isn't the default branch
        let prUrl: string | undefined
        let prExists = false
        let prDraft = false
        if (githubInfo.value && branch !== defaultBranch.value) {
          const hasRemote = commit.refs.some(r => r === `origin/${branch}` || (r.includes('/') && r.split('/').slice(1).join('/') === branch))
          if (hasRemote) {
            const existingPr = prByBranch.value.get(branch)
            if (existingPr) {
              prUrl = existingPr.url
              prExists = true
              prDraft = existingPr.draft
            } else {
              prUrl = `https://github.com/${githubInfo.value.owner}/${githubInfo.value.repo}/compare/${defaultBranch.value}...${branch}?expand=1`
            }
          }
        }
        // Amber styling + ↑ button for conflicted branches on non-source hosts
        let bgColor = '#1e3a5f'
        let textColor = '#7dd3fc'
        let opacity = dim ? '0.45' : '0.9'
        let sourceHash: string | undefined
        if (isConflicted && props.sourceHost && host !== props.sourceHost) {
          const tip = sourceBranchTips.value.get(branch)
          if (tip && tip !== commit.hash) {
            bgColor = '#451a03'
            textColor = '#fcd34d'
            opacity = '0.9'
            sourceHash = tip
          }
        }
        // Check if any container on this host at this commit has dirty changes
        const hostContainers = props.containers.filter(c =>
          c.machine_hostname === host && c.git_commit_hash && commit.hash.startsWith(c.git_commit_hash)
        )
        const prDirty = prUrl && !prExists ? hostContainers.some(c => c.git_staged_count > 0 || c.git_unstaged_count > 0) : false
        badges.push({ text: `${branch}@${alias(host)}`, bgColor, textColor, opacity, prUrl, prExists, prDraft, sourceHash, prDirty })
      }
    }
  }

  // Collect branch names already shown via per-host badges to deduplicate HEAD badges
  const perHostBranchNames = new Set<string>()
  if (hostMap) {
    for (const branches of hostMap.values()) {
      for (const b of branches) perHostBranchNames.add(b)
    }
  }

  // 2. Non-local refs: HEAD, remote tracking, tags (from merged commit.refs)
  for (const ref of commit.refs) {
    const fref = formatRef(ref)
    if (fref.type === 'local') continue  // shown via per-host above
    // Skip HEAD -> branch when that branch is already shown as a per-host badge —
    // avoids showing e.g. "git-visibility" and "git-visibility@host" on the same row.
    if (fref.type === 'head' && perHostBranchNames.has(fref.text)) continue
    const bgColor = { head: '#1e40af', remote: '#374151', tag: '#713f12' }[fref.type] ?? '#374151'
    const textColor = { head: '#93c5fd', remote: '#9ca3af', tag: '#fde68a' }[fref.type] ?? '#9ca3af'
    badges.push({ text: fref.text, bgColor, textColor, opacity: '0.8' })
  }

  return badges
}

interface LabelOffset {
  x: number       // label box left edge
  w: number       // label box width
  stagedX: number // staged badge left edge (valid when stagedW > 0)
  stagedW: number // staged badge width (0 = no staged changes)
  unstagedX: number
  unstagedW: number
}

// Compute x-offsets for container labels (and their dirty badges) per row
const containerLabelOffsets = computed(() => {
  const result: Array<Array<LabelOffset>> = []
  for (const row of layout.value) {
    const labels = containerLabels(row.commit.hash)
    const offsets: LabelOffset[] = []
    let x = 0
    for (const cl of labels) {
      const labelW = (cl.prefix.length + cl.bold.length + cl.suffix.length) * 6 + 8
      let nextX = x + labelW + 4

      // Staged badge
      let stagedX = nextX
      let stagedW = 0
      if (cl.stagedCount > 0) {
        stagedW = String(cl.stagedCount).length * 6 + 14  // "+N" text + padding
        nextX = stagedX + stagedW + 3
      }

      // Unstaged badge
      let unstagedX = nextX
      let unstagedW = 0
      if (cl.unstagedCount > 0) {
        unstagedW = String(cl.unstagedCount).length * 6 + 14  // "~N" text + padding
        nextX = unstagedX + unstagedW + 3
      }

      offsets.push({ x, w: labelW, stagedX, stagedW, unstagedX, unstagedW })
      x = nextX + 1
    }
    result.push(offsets)
  }
  return result
})

const PR_ICON_W = 14  // width of pull request icon button
const UP_ICON_W = 12  // width of ↑ scroll-to-source button

// Compute x-offsets for all badge + hash text per row (starting after container labels + dirty badges)
const badgeOffsets = computed(() => {
  const result: Array<Array<{ x: number; w: number; prX: number; prW: number; upX: number; upW: number }>> = []
  for (let i = 0; i < layout.value.length; i++) {
    const row = layout.value[i]
    const badges = allBadgesForCommit(row.commit)
    const offsets: Array<{ x: number; w: number; prX: number; prW: number; upX: number; upW: number }> = []
    const clOffsets = containerLabelOffsets.value[i] ?? []
    const lastCl = clOffsets[clOffsets.length - 1]
    let x: number
    if (!lastCl) {
      x = 0
    } else {
      // Start after last dirty badge (or label box if no dirty badges)
      const unstagedEnd = lastCl.unstagedW > 0 ? lastCl.unstagedX + lastCl.unstagedW : 0
      const stagedEnd = lastCl.stagedW > 0 ? lastCl.stagedX + lastCl.stagedW : 0
      const labelEnd = lastCl.x + lastCl.w
      x = Math.max(unstagedEnd, stagedEnd, labelEnd) + 4
    }
    for (const b of badges) {
      const w = b.text.length * 6 + 8
      const prW = b.prUrl ? PR_ICON_W : 0
      const prX = x + w + 3
      const upW = b.sourceHash ? UP_ICON_W : 0
      const upX = prX + (prW > 0 ? prW + 2 : 0)
      offsets.push({ x, w, prX, prW, upX, upW })
      x += w + 4 + (prW > 0 ? prW + 2 : 0) + (upW > 0 ? upW + 2 : 0)
    }
    // Hash text offset sentinel
    offsets.push({ x, w: 60, prX: 0, prW: 0, upX: 0, upW: 0 })
    result.push(offsets)
  }
  return result
})

/** Return subject text clipped to fit before the author column. */
function clippedSubject(rowIndex: number): string {
  const row = layout.value[rowIndex]
  if (!row) return ''
  const subjectX = (badgeOffsets.value[rowIndex]?.[allBadgesForCommit(row.commit).length]?.x ?? 0) + 60
  const availableWidth = svgWidth.value - AUTHOR_W - DATE_W - labelX.value - subjectX - 12
  const maxChars = Math.max(0, Math.floor(availableWidth / 6))
  const s = row.commit.subject
  if (s.length <= maxChars) return s
  return s.slice(0, Math.max(0, maxChars - 1)) + '…'
}

function absoluteDate(unixTs: number): string {
  return new Date(unixTs * 1000).toLocaleString()
}

function relativeDate(unixTs: number): string {
  const diff = Math.floor(Date.now() / 1000) - unixTs
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d ago`
  if (diff < 86400 * 365) return `${Math.floor(diff / (86400 * 30))}mo ago`
  return `${Math.floor(diff / (86400 * 365))}y ago`
}

function openPrUrl(url: string) {
  window.open(url, '_blank')
}

function onRefClick(hash: string) {
  emit('select-hash', hash)
  scrollToHash(hash)
}

/** Scroll the graph to put a commit's row into view and briefly flash it. */
function scrollToHash(hash: string) {
  const idx = layout.value.findIndex(r => r.commit.hash === hash)
  if (idx === -1 || !scrollEl.value) return
  const y = rowY(idx)
  const el = scrollEl.value
  const targetScroll = y - el.clientHeight / 2
  el.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' })
  flashHash.value = hash
  setTimeout(() => { if (flashHash.value === hash) flashHash.value = null }, 3000)
}

// --- Dirty diffstat popover ---

interface DirtyPopover {
  x: number
  y: number
  kind: 'staged' | 'unstaged'
  diffstat: string | null
}

const activeDirtyPopover = ref<DirtyPopover | null>(null)

function onDirtyBadgeClick(rowIndex: number, labelIndex: number, kind: 'staged' | 'unstaged', event: MouseEvent) {
  if (!svgEl.value || !scrollEl.value) return
  const labels = containerLabels(layout.value[rowIndex].commit.hash)
  const cl = labels[labelIndex]
  if (!cl) return

  const diffstat = kind === 'staged' ? cl.stagedDiffstat : cl.unstagedDiffstat
  if (!diffstat) return

  const offset = containerLabelOffsets.value[rowIndex][labelIndex]
  const badgeSvgX = labelX.value + (kind === 'staged' ? offset.stagedX : offset.unstagedX)
  const badgeSvgY = rowY(rowIndex)

  const svgRect = svgEl.value.getBoundingClientRect()
  const screenX = svgRect.left + badgeSvgX
  const screenY = svgRect.top + badgeSvgY - scrollEl.value.scrollTop + ROW_H / 2 + 4

  // Toggle: clicking the same badge closes the popover
  if (activeDirtyPopover.value && activeDirtyPopover.value.kind === kind
      && Math.abs(activeDirtyPopover.value.x - screenX) < 5) {
    activeDirtyPopover.value = null
  } else {
    activeDirtyPopover.value = { x: screenX, y: screenY, kind, diffstat }
  }
  event.stopPropagation()
}

function closeDirtyPopover() {
  activeDirtyPopover.value = null
}

function onDocumentClick() {
  if (activeDirtyPopover.value) activeDirtyPopover.value = null
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick)
  fetchPrs()
})
onBeforeUnmount(() => document.removeEventListener('click', onDocumentClick))
watch(() => props.remoteUrl, fetchPrs)

defineExpose({ scrollToHash })
</script>
