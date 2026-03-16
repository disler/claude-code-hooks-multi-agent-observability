<template>
  <div class="flex border-b border-slate-700 bg-slate-900" style="height: calc(100vh - 57px);">


    <!-- Kanban area -->
    <div class="flex-1 min-w-0 flex flex-col overflow-hidden">

      <!-- Columns -->
      <div class="flex gap-3 p-3 overflow-x-auto flex-1 min-h-0">
        <div
          v-for="col in columns"
          :key="col.state"
          class="w-52 flex-none flex flex-col"
          @dragover.prevent
          @dragenter.prevent="dragTarget = col.state"
          @dragleave="dragTarget = null"
          @drop.prevent="onDrop($event, col.state)"
          :class="{ 'ring-1 ring-inset ring-blue-600/50 rounded': dragTarget === col.state }"
        >
          <div class="text-xs font-semibold mb-2 px-1 shrink-0" :class="col.headerClass">
            {{ col.label }}
            <span class="text-slate-500 font-normal ml-1">({{ cardsFor(col.state).length }})</span>
          </div>
          <div class="space-y-2 overflow-y-auto flex-1">
            <div
              v-for="c in cardsFor(col.state)"
              :key="c.id"
              draggable="true"
              class="rounded border p-2 text-xs select-none"
              :class="selectedContainerId === c.id
                ? 'border-blue-500 bg-blue-900/20 cursor-default'
                : 'border-slate-700 bg-slate-800/60 cursor-pointer hover:border-slate-500'"
              @click="toggleSidebar(c)"
              @dragstart="onDragStart($event, c.id)"
            >
              <div class="font-mono font-semibold text-slate-100 truncate" :title="c.source_repo">{{ projectName(c) }}</div>
              <div class="text-slate-400 truncate">{{ c.machine_hostname }}</div>
              <div v-if="c.git_branch" class="text-blue-400 font-mono truncate">{{ c.git_branch }}</div>
              <div class="flex gap-2 mt-1 text-slate-500">
                <span v-if="c.git_staged_count" class="text-yellow-500">±{{ c.git_staged_count }}</span>
                <span v-if="c.git_unstaged_count" class="text-orange-500">~{{ c.git_unstaged_count }}</span>
                <span v-if="!c.git_staged_count && !c.git_unstaged_count">Clean</span>
              </div>
              <div class="mt-1 text-slate-500">
                {{ doneTasks(c) }}✓ {{ pendingTasks(c) }}⏳
                <span v-if="failedTests(c) > 0" class="text-red-400 ml-1">{{ failedTests(c) }} fail</span>
                <span v-if="passedTests(c) > 0 && failedTests(c) === 0" class="text-green-400 ml-1">{{ passedTests(c) }} pass</span>
              </div>
              <div v-if="reviewStatusCounts(c).length > 0" class="flex flex-wrap gap-0.5 mt-1">
                <button
                  v-for="b in reviewStatusCounts(c)"
                  :key="b.status"
                  class="flex items-center gap-0.5 px-1 py-0.5 rounded text-xs bg-slate-700/60 hover:bg-slate-600/60 text-slate-300"
                  :title="b.status + ' (' + b.count + ')'"
                  @click.stop="openWithFilter(c, b.status)"
                >{{ b.icon }}{{ b.count }}</button>
              </div>
              <div class="flex gap-1 mt-1.5 flex-wrap items-center">
                <button
                  v-if="c.source_repo"
                  class="text-slate-400 hover:text-blue-300 text-xs px-1 py-0.5 rounded bg-slate-700/60 hover:bg-slate-600/60"
                  @click.stop="emit('open-git-view', c.source_repo)"
                >Git ↗</button>
                <select
                  class="text-xs bg-slate-700/60 border border-slate-600/50 rounded text-slate-300 px-0.5 cursor-pointer"
                  :value="reviewStateOf(c)"
                  @click.stop
                  @change.stop="setReviewState(c.id, ($event.target as HTMLSelectElement).value)"
                >
                  <option v-for="s in allStates" :key="s" :value="s">{{ s }}</option>
                </select>
              </div>
            </div>
            <div v-if="cardsFor(col.state).length === 0" class="text-xs text-slate-700 px-1">—</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Right sidebar: container detail -->
    <div
      v-if="selectedContainer"
      class="flex-none border-l border-slate-700 flex flex-col overflow-hidden"
      style="width: min(48rem, 50vw);"
    >
      <div class="flex items-center justify-between px-3 py-2 border-b border-slate-700 shrink-0">
        <span class="text-xs text-slate-400 font-semibold truncate">{{ selectedContainer.source_repo }}</span>
        <button
          class="text-slate-500 hover:text-slate-200 text-lg leading-none ml-2 shrink-0"
          @click="selectedContainerId = null; sidebarReviewFilter = null"
          title="Close"
        >×</button>
      </div>
      <div class="overflow-y-auto flex-1 p-2">
        <ContainerCard
          :container="selectedContainer"
          :initial-review-filter="sidebarReviewFilter ?? undefined"
          @tasks-changed="() => {}"
          @open-git-view="(repo, hash) => emit('open-git-view', repo, hash)"
          @open-history="(cid, sid) => emit('open-history', cid, sid)"
        />
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useContainers } from '../composables/useContainers'
import type { ContainerWithState } from '../types'
import { API_BASE } from '../config'
import ContainerCard from './ContainerCard.vue'

const props = defineProps<{
  repoFilter: string
  hostFilter: string
  connFilter: string
}>()

const emit = defineEmits<{
  'open-git-view': [repo: string, hash?: string | null]
  'open-history': [containerId: string, sessionId: string]
}>()

const { containers } = useContainers()

const selectedContainerId = ref<string | null>(null)
const sidebarReviewFilter = ref<string | null>(null)
const dragTarget = ref<string | null>(null)

const REVIEW_BADGE_DEFS: Array<{ status: string; icon: string }> = [
  { status: 'ready',            icon: '🔵' },
  { status: 'testing',          icon: '🧪' },
  { status: 'passed',           icon: '🟢' },
  { status: 'has-issues',       icon: '🔴' },
  { status: 'fix-scheduled',    icon: '🔧' },
  { status: 'follow-up',        icon: '🔄' },
  { status: 'revert-scheduled', icon: '⏪' },
  { status: 'ready-for-merge',  icon: '🚀' },
  { status: 'merged',           icon: '🏁' },
  { status: 'cancelled',        icon: '🚫' },
  { status: 'retry-later',      icon: '⏸️' },
]

function reviewStatusCounts(c: ContainerWithState): Array<{ status: string; icon: string; count: number }> {
  const tasks = c.planq_tasks ?? []
  return REVIEW_BADGE_DEFS
    .map(d => ({ ...d, count: tasks.filter(t => t.review_status === d.status).length }))
    .filter(d => d.count > 0)
}

function openWithFilter(c: ContainerWithState, status: string) {
  selectedContainerId.value = c.id
  sidebarReviewFilter.value = status
}

const columns = [
  { state: 'developing',       label: 'Developing',       headerClass: 'text-slate-300' },
  { state: 'ready-for-review', label: 'Ready for Review', headerClass: 'text-yellow-400' },
  { state: 'in-review',        label: 'In Review',        headerClass: 'text-blue-400' },
  { state: 'approved',         label: 'Approved',         headerClass: 'text-green-400' },
  { state: 'merged',           label: 'Merged',           headerClass: 'text-slate-500' },
]

const allStates = columns.map(c => c.state)

function reviewStateOf(c: ContainerWithState): string {
  if (!c.review_state) return 'developing'
  try {
    const parsed = JSON.parse(c.review_state)
    return parsed.state ?? 'developing'
  } catch { return c.review_state ?? 'developing' }
}

const filteredContainers = computed(() => {
  return [...containers.value.values()].filter(c => {
    if (props.repoFilter && c.source_repo !== props.repoFilter) return false
    if (props.hostFilter && c.machine_hostname !== props.hostFilter) return false
    if (props.connFilter === 'online' && !c.connected) return false
    if (props.connFilter === 'offline' && c.connected) return false
    return true
  })
})

function cardsFor(state: string): ContainerWithState[] {
  return filteredContainers.value.filter(c => reviewStateOf(c) === state)
}

const selectedContainer = computed(() =>
  selectedContainerId.value ? containers.value.get(selectedContainerId.value) ?? null : null
)

function toggleSidebar(c: ContainerWithState) {
  if (selectedContainerId.value === c.id) {
    selectedContainerId.value = null
    sidebarReviewFilter.value = null
  } else {
    selectedContainerId.value = c.id
    sidebarReviewFilter.value = null
  }
}

function worktreeSuffix(c: ContainerWithState): string | null {
  if (c.git_worktree) {
    return c.git_worktree.replace(/^trees\//, '').split('/').pop() ?? c.git_worktree
  }
  if (c.workspace_host_path) {
    const base = c.workspace_host_path.split('/').pop() ?? ''
    const repo = c.source_repo?.split('/').pop() ?? ''
    if (base && repo && base !== repo) {
      const m = base.match(new RegExp(`^${repo}\\.(.+)$`))
      return m ? m[1] : null
    }
  }
  return null
}

function projectName(c: ContainerWithState): string {
  const repo = c.source_repo?.split('/').pop() ?? c.id.slice(0, 12)
  const suffix = worktreeSuffix(c)
  return suffix ? `${repo}.${suffix}` : repo
}

function doneTasks(c: ContainerWithState): number {
  return (c.planq_tasks ?? []).filter(t => t.status === 'done').length
}

function pendingTasks(c: ContainerWithState): number {
  return (c.planq_tasks ?? []).filter(t => t.status !== 'done').length
}

function parseTestResults(c: ContainerWithState): Array<{ result: string }> {
  if (!c.test_results) return []
  try { return JSON.parse(c.test_results) } catch { return [] }
}

function passedTests(c: ContainerWithState): number {
  return parseTestResults(c).filter(t => t.result === 'passed').length
}

function failedTests(c: ContainerWithState): number {
  return parseTestResults(c).filter(t => t.result === 'failed').length
}

async function setReviewState(containerId: string, state: string) {
  await fetch(`${API_BASE}/dashboard/review-state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ containerId, state }),
  })
}

// Drag and drop
function onDragStart(event: DragEvent, containerId: string) {
  event.dataTransfer?.setData('text/plain', containerId)
}

function onDrop(event: DragEvent, targetState: string) {
  dragTarget.value = null
  const containerId = event.dataTransfer?.getData('text/plain')
  if (!containerId) return
  const c = containers.value.get(containerId)
  if (!c || reviewStateOf(c) === targetState) return
  setReviewState(containerId, targetState)
}
</script>
