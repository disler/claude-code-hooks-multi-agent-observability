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
      <div class="flex flex-col gap-0.5 flex-1 min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <AgentStatusBadge :status="container.status" />
          <span class="text-sm font-semibold text-slate-100 font-mono">{{ container.id }}</span>
          <span v-if="container.git_branch" class="text-xs text-slate-400">
            branch: <span class="font-mono text-cyan-400">{{ container.git_branch }}</span>
          </span>
          <span v-if="container.git_worktree" class="text-xs text-slate-500">[worktree]</span>
        </div>

        <div v-if="container.workspace_host_path" class="text-xs text-slate-500 truncate font-mono">
          {{ container.workspace_host_path }}
        </div>

        <!-- Commit info -->
        <div v-if="container.git_commit_hash" class="flex items-center gap-2 flex-wrap mt-0.5">
          <span class="text-xs font-mono text-slate-400">{{ container.git_commit_hash }}</span>
          <span class="text-xs text-slate-400 truncate max-w-xs">{{ container.git_commit_message }}</span>
        </div>

        <!-- Git counts -->
        <div v-if="container.connected" class="flex items-center gap-3 mt-0.5">
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
import type { ContainerWithState } from '../types'

const props = defineProps<{
  container: ContainerWithState
}>()

const emit = defineEmits<{
  'tasks-changed': []
}>()

const relativeTime = computed(() => {
  const diff = Math.floor((Date.now() - props.container.last_seen) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
})
</script>
