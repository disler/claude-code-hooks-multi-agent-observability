<template>
  <div
    class="bg-slate-800 border rounded-xl p-4 mb-3"
    :class="{
      'border-green-700': container.status === 'busy',
      'border-yellow-700': container.status === 'awaiting_input',
      'border-slate-700': container.status === 'idle',
      'border-slate-700 opacity-60': container.status === 'offline',
    }"
  >
    <!-- Header -->
    <div class="flex items-start justify-between gap-3">
      <!--
        Inner content area: CSS grid when submodules present so that:
          - submodule label/name/branch aligns with the workspace path row
          - submodule commit aligns with main commit row
          - submodule staged/unstaged aligns with main staged/unstaged row
        Falls back to plain flex-col when no submodules.
      -->
      <div
        class="flex-1 min-w-0"
        :class="firstSub ? 'grid gap-x-4 gap-y-1' : 'flex flex-col gap-0.5'"
        :style="firstSub ? { gridTemplateColumns: 'auto 1fr' } : {}"
      >
        <!-- Row 1: badge / project name / worktree / branch -->
        <div
          class="flex items-center gap-2 flex-wrap"
          :style="firstSub ? { gridRow: 1, gridColumn: 1 } : {}"
        >
          <AgentStatusBadge :status="container.status" />
          <span class="text-sm font-semibold text-slate-100 font-mono">{{ container.source_repo }}</span>
          <span v-if="worktreeLabel" class="text-xs text-slate-500 font-mono">
            [worktree <span class="text-sm font-semibold text-slate-100">{{ worktreeLabel }}</span>]
          </span>
          <button
            v-if="container.git_branch"
            class="text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
            @click="emit('open-git-view', container.source_repo, container.git_commit_hash)"
          >branch: <span class="font-mono text-cyan-400">{{ container.git_branch }}</span></button>
        </div>

        <!-- Row 2, Col 1: workspace host path + container hostname -->
        <div
          class="text-xs text-slate-500 truncate font-mono flex items-center gap-2"
          :style="firstSub ? { gridRow: 2, gridColumn: 1 } : {}"
        >
          <span v-if="container.workspace_host_path">{{ container.workspace_host_path }}</span>
          <span v-if="container.container_hostname" class="text-slate-600">{{ container.container_hostname }}</span>
        </div>

        <!-- Row 2, Col 2: first submodule label / name / branch -->
        <div
          v-if="firstSub"
          class="flex items-center gap-2 flex-wrap"
          style="grid-row: 2; grid-column: 2"
        >
          <div class="w-px bg-slate-700 self-stretch shrink-0" />
          <span class="text-xs text-slate-500">submodule</span>
          <span class="text-xs font-mono text-slate-100">{{ firstSub.path }}</span>
          <button
            v-if="firstSub.branch"
            class="text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
            @click="emit('open-git-view', `${container.source_repo}/${firstSub.path}`, firstSub.commit_hash)"
          >branch: <span class="font-mono text-cyan-400">{{ firstSub.branch }}</span></button>
        </div>

        <!-- Row 3, Col 1: main repo commit -->
        <div
          v-if="container.git_commit_hash"
          class="flex items-center gap-2 flex-wrap"
          :style="firstSub ? { gridRow: 3, gridColumn: 1 } : {}"
        >
          <button
            class="text-xs font-mono text-slate-400 hover:text-slate-200 cursor-pointer"
            @click="emit('open-git-view', container.source_repo, container.git_commit_hash)"
          >{{ container.git_commit_hash }}</button>
          <span class="text-xs text-slate-400 truncate max-w-xs">{{ container.git_commit_message }}</span>
        </div>

        <!-- Row 3, Col 2: first submodule commit -->
        <div
          v-if="firstSub"
          class="flex items-center gap-2 flex-wrap"
          style="grid-row: 3; grid-column: 2"
        >
          <button
            class="text-xs font-mono text-slate-400 hover:text-slate-200 cursor-pointer"
            @click="emit('open-git-view', `${container.source_repo}/${firstSub.path}`, firstSub.commit_hash)"
          >{{ firstSub.commit_hash }}</button>
          <span class="text-xs text-slate-400 truncate max-w-xs">{{ firstSub.commit_message }}</span>
        </div>

        <!-- Row 4, Col 1: main repo staged / unstaged -->
        <div
          v-if="container.connected"
          class="flex items-center gap-3"
          :style="firstSub ? { gridRow: 4, gridColumn: 1 } : {}"
        >
          <GitDiffstatPopover
            :count="container.git_staged_count"
            :diffstat="container.git_staged_diffstat"
            label="staged"
            kind="staged"
          />
          <GitDiffstatPopover
            :count="container.git_unstaged_count"
            :diffstat="container.git_unstaged_diffstat"
            label="unstaged"
            kind="unstaged"
          />
        </div>

        <!-- Row 4, Col 2: first submodule staged / unstaged -->
        <div
          v-if="firstSub && container.connected"
          class="flex items-center gap-3"
          style="grid-row: 4; grid-column: 2"
        >
          <GitDiffstatPopover
            :count="firstSub.staged_count"
            :diffstat="firstSub.staged_diffstat"
            label="staged"
            kind="staged"
          />
          <GitDiffstatPopover
            :count="firstSub.unstaged_count"
            :diffstat="firstSub.unstaged_diffstat"
            label="unstaged"
            kind="unstaged"
          />
        </div>

        <!-- Row 5: additional submodules (2nd onward) shown below -->
        <template v-if="extraSubs.length">
          <div
            class="flex flex-col gap-1 mt-1"
            :style="firstSub ? { gridRow: 5, gridColumn: '1 / -1' } : {}"
          >
            <div
              v-for="sub in extraSubs"
              :key="sub.path"
              class="flex gap-4 items-start pl-2 border-l border-slate-700"
            >
              <div class="flex flex-col gap-0.5">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="text-xs text-slate-500">submodule</span>
                  <span class="text-xs font-mono text-slate-100">{{ sub.path }}</span>
                  <button
                    v-if="sub.branch"
                    class="text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
                    @click="emit('open-git-view', `${container.source_repo}/${sub.path}`, sub.commit_hash)"
                  >branch: <span class="font-mono text-cyan-400">{{ sub.branch }}</span></button>
                </div>
                <div class="flex items-center gap-2 flex-wrap">
                  <button
                    class="text-xs font-mono text-slate-400 hover:text-slate-200 cursor-pointer"
                    @click="emit('open-git-view', `${container.source_repo}/${sub.path}`, sub.commit_hash)"
                  >{{ sub.commit_hash }}</button>
                  <span class="text-xs text-slate-400 truncate max-w-xs">{{ sub.commit_message }}</span>
                </div>
                <div v-if="container.connected" class="flex items-center gap-3">
                  <GitDiffstatPopover :count="sub.staged_count" :diffstat="sub.staged_diffstat" label="staged" kind="staged" />
                  <GitDiffstatPopover :count="sub.unstaged_count" :diffstat="sub.unstaged_diffstat" label="unstaged" kind="unstaged" />
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- Last seen (offline) + discard/merge buttons -->
      <div v-if="!container.connected" class="flex flex-col items-end gap-1 shrink-0">
        <span class="text-xs text-slate-500">{{ relativeTime }}</span>
        <div class="flex gap-2">
          <button
            class="text-xs text-slate-600 hover:text-blue-400 transition-colors"
            title="Merge this container's history into another"
            @click="startMerge"
          >merge</button>
          <button
            class="text-xs text-slate-600 hover:text-red-400 transition-colors"
            title="Discard this offline container"
            @click="discardContainer"
          >discard</button>
        </div>
      </div>
    </div>

    <!-- Merge panel -->
    <div v-if="merging" class="mt-2 p-2 rounded border border-blue-800 bg-blue-950/30">
      <div class="text-xs text-slate-400 mb-1">Merge session history into:</div>
      <div v-if="mergeTargets.length === 0" class="text-xs text-slate-500 italic">No other containers with repo <span class="font-mono">{{ container.source_repo }}</span> found.</div>
      <template v-else>
        <select
          v-model="mergeTargetId"
          class="w-full text-xs bg-slate-700 border border-slate-600 rounded px-2 py-1 text-slate-200 focus:outline-none mb-2"
        >
          <option v-for="c in mergeTargets" :key="c.id" :value="c.id">
            {{ c.machine_hostname !== 'unknown' ? c.machine_hostname + ' · ' : '' }}{{ c.workspace_host_path || c.container_hostname || c.id }}{{ !c.connected ? ' (offline)' : '' }} · {{ relativeTimeFor(c.last_seen) }}{{ c.git_commit_hash ? ' · ' + c.git_commit_hash : '' }}
          </option>
        </select>
        <div class="text-xs text-slate-500 mb-2">
          This will transfer all session history from this container into the selected one, then remove this container entry.
        </div>
      </template>
      <div class="flex gap-2">
        <button
          v-if="mergeTargets.length > 0"
          @click="confirmMerge"
          :disabled="!mergeTargetId || merging && mergeLoading"
          class="text-xs px-2 py-1 rounded bg-blue-700 hover:bg-blue-600 disabled:opacity-40 text-white"
        >{{ mergeLoading ? 'Merging…' : 'Merge' }}</button>
        <button
          @click="merging = false"
          class="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-300"
        >Cancel</button>
      </div>
    </div>

    <!-- Sessions -->
    <div v-if="visibleSessions.length > 0 || hiddenSessionCount > 0" class="mt-3 flex flex-col gap-1">
      <SessionRow
        v-for="session in visibleSessions"
        :key="session.session_id"
        :session="session"
        :explicitly-hidden="isExplicitlyHidden(session.session_id)"
        @hide="hideSession(session.session_id)"
        @unhide="unhideSession(session.session_id)"
        @open-history="emit('open-history', container.id, session.session_id)"
      />
      <!-- show/hide hidden sessions toggle -->
      <div v-if="hiddenSessionCount > 0" class="mt-0.5 pl-3">
        <button
          @click="showHidden = !showHidden"
          class="text-xs text-slate-600 hover:text-slate-400 transition-colors"
        >{{ showHidden ? 'hide previous sessions' : `show ${hiddenSessionCount} previous session${hiddenSessionCount > 1 ? 's' : ''}` }}</button>
      </div>
    </div>
    <div v-else-if="container.connected" class="mt-2 text-xs text-slate-600 italic">No active sessions</div>

    <!-- Prompt History link -->
    <div v-if="container.sessions.length > 0" class="mt-1">
      <button
        class="text-xs text-slate-600 hover:text-slate-400 transition-colors"
        @click="emit('open-history', container.id, container.sessions[0].session_id)"
      >Prompt History</button>
    </div>

    <!-- Planq panel -->
    <PlanqPanel
      :container-id="container.id"
      :tasks="container.planq_tasks ?? []"
      :connected="container.connected"
      :auto-test-pending="container.auto_test_pending ?? null"
      :initial-review-filter="initialReviewFilter"
      @tasks-changed="emit('tasks-changed')"
      @open-history="sid => emit('open-history', container.id, sid)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import AgentStatusBadge from './AgentStatusBadge.vue'
import GitDiffstatPopover from './GitDiffstatPopover.vue'
import SessionRow from './SessionRow.vue'
import PlanqPanel from './PlanqPanel.vue'
import { API_BASE } from '../config'
import { useHiddenSessions } from '../composables/useHiddenSessions'
import type { ContainerWithState, GitSubmoduleInfo, SessionState } from '../types'

const props = defineProps<{
  container: ContainerWithState
  initialReviewFilter?: string
}>()

const emit = defineEmits<{
  'tasks-changed': []
  'open-git-view': [repo: string, hash?: string | null]
  'open-history': [containerId: string, sessionId: string]
}>()

// ── Session hiding ────────────────────────────────────────────────────────────

const { hide, show, isExplicitlyHidden } = useHiddenSessions()
const showHidden = ref(false)

const now = ref(Date.now())
let nowTicker: ReturnType<typeof setInterval> | null = null
onMounted(() => { nowTicker = setInterval(() => { now.value = Date.now() }, 60_000) })
onUnmounted(() => { if (nowTicker) clearInterval(nowTicker) })

const ONE_HOUR = 3_600_000

function isAutoHidden(session: SessionState): boolean {
  return session.status === 'terminated'
    && session.last_event_at !== null
    && session.last_event_at < now.value - ONE_HOUR
}

const hiddenSessions = computed(() =>
  props.container.sessions.filter(s => isAutoHidden(s) || isExplicitlyHidden(s.session_id))
)

const hiddenSessionCount = computed(() => hiddenSessions.value.length)

function byRecency(a: typeof props.container.sessions[0], b: typeof props.container.sessions[0]) {
  return (b.last_event_at ?? 0) - (a.last_event_at ?? 0)
}

const visibleSessions = computed(() =>
  (showHidden.value
    ? [...props.container.sessions]
    : props.container.sessions.filter(s => !isAutoHidden(s) && !isExplicitlyHidden(s.session_id))
  ).sort(byRecency)
)

const cLabel = () => `${props.container.source_repo}@${props.container.container_hostname}`

function hideSession(sessionId: string) {
  console.log(`[dashboard] hide session=${sessionId.slice(0, 8)} container=${cLabel()}`)
  hide(sessionId)
}

function unhideSession(sessionId: string) {
  console.log(`[dashboard] unhide session=${sessionId.slice(0, 8)} container=${cLabel()}`)
  show(sessionId)
}

// ── Container actions ─────────────────────────────────────────────────────────

async function discardContainer() {
  const label = `${props.container.source_repo}${props.container.workspace_host_path ? ' (' + props.container.workspace_host_path + ')' : ''}`
  if (!confirm(`Discard offline container ${label}?\n\nThis removes it from the dashboard. It will reappear if the planq daemon reconnects.`)) return
  console.log(`[dashboard] discard container=${cLabel()}`)
  await fetch(`${API_BASE}/dashboard/containers/${encodeURIComponent(props.container.id)}`, { method: 'DELETE' })
  // Server broadcasts container_removed; no local state needed
}

// ── Merge ─────────────────────────────────────────────────────────────────────

const merging = ref(false)
const mergeLoading = ref(false)
const mergeTargets = ref<import('../types').ContainerWithState[]>([])
const mergeTargetId = ref<string>('')

async function startMerge() {
  mergeLoading.value = false
  // Fetch all containers and filter to same source_repo, excluding this one
  const res = await fetch(`${API_BASE}/dashboard/containers`).catch(() => null)
  const all: import('../types').ContainerWithState[] = res?.ok ? await res.json() : []
  const targets = all.filter(c => c.source_repo === props.container.source_repo && c.id !== props.container.id)
  // Sort by most recently live first
  targets.sort((a, b) => b.last_seen - a.last_seen)
  mergeTargets.value = targets
  // Default: same host + same worktree → same host → overall most recent (all filtered by source_repo above)
  const sameHost = props.container.machine_hostname !== 'unknown'
    ? targets.filter(c => c.machine_hostname === props.container.machine_hostname)
    : []
  const sameHostAndWorktree = props.container.git_worktree
    ? sameHost.filter(c => c.git_worktree === props.container.git_worktree)
    : []
  mergeTargetId.value = (sameHostAndWorktree[0] ?? sameHost[0] ?? targets[0])?.id ?? ''
  merging.value = true
}

async function confirmMerge() {
  if (!mergeTargetId.value) return
  mergeLoading.value = true
  console.log(`[dashboard] merge container=${cLabel()} into=${mergeTargetId.value}`)
  await fetch(`${API_BASE}/dashboard/containers/${encodeURIComponent(props.container.id)}/merge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target_id: mergeTargetId.value }),
  })
  merging.value = false
  mergeLoading.value = false
  // Server broadcasts container_removed + container_update; no local state needed
}

const firstSub = computed<GitSubmoduleInfo | null>(() => props.container.git_submodules?.[0] ?? null)
const extraSubs = computed<GitSubmoduleInfo[]>(() => props.container.git_submodules?.slice(1) ?? [])

// Derive a human-readable worktree label, or null if this is the main worktree.
// Priority: git_worktree field → workspace path basename if it differs from source_repo.
// If the basename matches "$source_repo.$suffix" (e.g. "livepace.2"), show just the suffix.
const worktreeLabel = computed<string | null>(() => {
  if (props.container.git_worktree) {
    // e.g. "trees/my-feature" → "my-feature"
    return props.container.git_worktree.replace(/^trees\//, '').split('/').pop() ?? props.container.git_worktree
  }
  if (props.container.workspace_host_path) {
    const base = props.container.workspace_host_path.split('/').pop() ?? ''
    if (base && base !== props.container.source_repo) {
      // "livepace.2" with source_repo "livepace" → show "2"
      const numMatch = base.match(new RegExp(`^${props.container.source_repo}\\.(.+)$`))
      return numMatch ? numMatch[1] : base
    }
  }
  return null
})

function relativeTimeFor(ts: number): string {
  const diff = Math.floor((now.value - ts) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
}

const relativeTime = computed(() => relativeTimeFor(props.container.last_seen))
</script>
