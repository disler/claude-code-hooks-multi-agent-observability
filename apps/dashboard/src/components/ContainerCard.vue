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
          <span v-if="container.git_branch" class="text-xs text-slate-400">
            branch: <span class="font-mono text-cyan-400">{{ container.git_branch }}</span>
          </span>
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
          <span v-if="firstSub.branch" class="text-xs text-slate-400">
            branch: <span class="font-mono text-cyan-400">{{ firstSub.branch }}</span>
          </span>
        </div>

        <!-- Row 3, Col 1: main repo commit -->
        <div
          v-if="container.git_commit_hash"
          class="flex items-center gap-2 flex-wrap"
          :style="firstSub ? { gridRow: 3, gridColumn: 1 } : {}"
        >
          <span class="text-xs font-mono text-slate-400">{{ container.git_commit_hash }}</span>
          <span class="text-xs text-slate-400 truncate max-w-xs">{{ container.git_commit_message }}</span>
        </div>

        <!-- Row 3, Col 2: first submodule commit -->
        <div
          v-if="firstSub"
          class="flex items-center gap-2 flex-wrap"
          style="grid-row: 3; grid-column: 2"
        >
          <span class="text-xs font-mono text-slate-400">{{ firstSub.commit_hash }}</span>
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
                  <span v-if="sub.branch" class="text-xs text-slate-400">
                    branch: <span class="font-mono text-cyan-400">{{ sub.branch }}</span>
                  </span>
                </div>
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="text-xs font-mono text-slate-400">{{ sub.commit_hash }}</span>
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

      <!-- Last seen (offline) -->
      <div v-if="!container.connected" class="text-xs text-slate-500 shrink-0">
        {{ relativeTime }}
      </div>
    </div>

    <!-- Sessions -->
    <div v-if="container.sessions.length > 0" class="mt-3 flex flex-col gap-1">
      <SessionRow
        v-for="session in container.sessions"
        :key="session.session_id"
        :session="session"
      />
    </div>
    <div v-else-if="container.connected" class="mt-2 text-xs text-slate-600 italic">No active sessions</div>

    <!-- Planq panel -->
    <PlanqPanel
      :container-id="container.id"
      :tasks="container.planq_tasks ?? []"
      :connected="container.connected"
      @tasks-changed="emit('tasks-changed')"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import AgentStatusBadge from './AgentStatusBadge.vue'
import GitDiffstatPopover from './GitDiffstatPopover.vue'
import SessionRow from './SessionRow.vue'
import PlanqPanel from './PlanqPanel.vue'
import type { ContainerWithState, GitSubmoduleInfo } from '../types'

const props = defineProps<{
  container: ContainerWithState
}>()

const emit = defineEmits<{
  'tasks-changed': []
}>()

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

const relativeTime = computed(() => {
  const diff = Math.floor((Date.now() - props.container.last_seen) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
})
</script>
