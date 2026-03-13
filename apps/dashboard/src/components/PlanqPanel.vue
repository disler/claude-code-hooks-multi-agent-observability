<template>
  <div class="mt-2">
    <!-- Header -->
    <button
      @click="open = !open"
      class="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-200 font-semibold w-full text-left py-1"
    >
      <span>{{ open ? '▾' : '▸' }}</span>
      <span>Plan Queue</span>
      <span class="text-slate-500">({{ pendingCount }} pending{{ autoQueueCount > 0 ? `, ${autoQueueCount} queued` : '' }}{{ underwayCount > 0 ? `, ${underwayCount} underway` : '' }}{{ awaitingCommitCount > 0 ? `, ${awaitingCommitCount} awaiting commit` : '' }}{{ awaitingPlanCount > 0 ? `, ${awaitingPlanCount} awaiting plan` : '' }}{{ doneCount > 0 ? `, ${doneCount} done` : '' }})</span>
    </button>

    <div v-if="open" class="mt-1 bg-slate-900/50 rounded-lg border border-slate-700 p-2">
      <!-- Offline notice -->
      <div v-if="!connected" class="text-xs text-slate-500 italic mb-2">
        Container offline — queue shown from last heartbeat; edits will fail.
      </div>

      <!-- Auto-queue notice -->
      <div v-if="autoQueueCount > 0" class="text-xs text-cyan-400 mb-2 flex items-center gap-1">
        <span>⏱</span>
        <span>{{ autoQueueCount }} task{{ autoQueueCount > 1 ? 's' : '' }} queued for auto-run</span>
        <span v-if="multipleAutoWarning" class="text-yellow-400 ml-1">⚠ multiple auto-queue sessions may be running</span>
      </div>

      <!-- Awaiting-commit notice -->
      <div v-if="awaitingCommitCount > 0" class="text-xs text-purple-400 mb-2 flex items-center gap-1">
        <span>💾</span>
        <span>{{ awaitingCommitCount }} task{{ awaitingCommitCount > 1 ? 's' : '' }} awaiting commit — commit staged changes to continue</span>
      </div>

      <!-- Awaiting-plan notice -->
      <div v-if="awaitingPlanCount > 0" class="text-xs text-teal-400 mb-2 flex items-center gap-1">
        <span>📋</span>
        <span>{{ awaitingPlanCount }} task{{ awaitingPlanCount > 1 ? 's' : '' }} awaiting plan review — add the generated plan to the queue to continue</span>
      </div>

      <!-- Auto-test pending prompt -->
      <div v-if="autoTestPending" class="mb-2 rounded border border-red-700 bg-red-950/40 p-2">
        <div class="flex items-center gap-2 mb-1">
          <span class="text-red-400 text-xs font-semibold">⚠ Auto-test failed</span>
          <span class="text-red-500 text-xs font-mono">(exit {{ autoTestPending.exit_code }})</span>
        </div>
        <div class="text-xs text-slate-400 font-mono mb-1">$ {{ autoTestPending.command }}</div>
        <pre class="text-xs text-red-300 font-mono whitespace-pre-wrap break-words overflow-y-auto max-h-32 mb-2 bg-black/30 rounded p-1">{{ autoTestPending.output }}</pre>
        <div class="flex gap-2">
          <button
            @click="respondAutoTest('continue')"
            :disabled="respondingAutoTest"
            class="text-xs px-2 py-1 rounded bg-green-800 hover:bg-green-700 text-green-200 disabled:opacity-50"
          >Continue auto-queue</button>
          <button
            @click="respondAutoTest('abort')"
            :disabled="respondingAutoTest"
            class="text-xs px-2 py-1 rounded bg-red-800 hover:bg-red-700 text-red-200 disabled:opacity-50"
          >Abort</button>
        </div>
      </div>

      <!-- Status filters -->
      <div v-if="tasks.length > 0" class="flex items-center gap-1 mb-2 flex-wrap">
        <button
          v-for="f in statusFilters"
          :key="f.status"
          @click.exact="toggleFilterExclusive(f.status)"
          @click.ctrl.exact="toggleFilter(f.status)"
          @click.meta.exact="toggleFilter(f.status)"
          :title="`${f.label} (${f.count}) — click to filter, Ctrl/Cmd+click to multi-select`"
          class="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs transition-all"
          :class="activeFilters.size === 0 || activeFilters.has(f.status)
            ? [f.activeClass, 'opacity-100']
            : 'bg-slate-800 text-slate-600 opacity-50'"
        >
          <span>{{ f.icon }}</span>
          <span>{{ f.count }}</span>
        </button>
        <button
          v-if="activeFilters.size > 0"
          @click="activeFilters.clear()"
          class="px-1.5 py-0.5 rounded text-xs bg-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-600"
          title="Clear filters"
        >✕</button>
      </div>

      <!-- Task list -->
      <div v-if="filteredTasks.length > 0">
        <PlanqTaskRow
          v-for="(task, i) in filteredTasks"
          :key="task.id"
          :task="task"
          :position="tasks.indexOf(task) + 1"
          :container-id="containerId"
          :all-tasks="tasks"
          @edit-file="editingFile = task"
          @set-status="(t, s) => setStatus(t, s)"
          @delete="deleteTask(task.id)"
          @update-desc="(id, desc) => updateDesc(id, desc)"
          @set-commit-mode="(t, m) => setCommitMode(t, m)"
          @add-plan="addPlanFromMakePlan"
          @archive="archiveTask(task.id)"
          @dragstart="dragFrom = task.id"
          @drop="dropOn(task.id)"
        />
      </div>
      <div v-else-if="tasks.length > 0 && filteredTasks.length === 0" class="text-xs text-slate-500 italic py-1">No tasks match filter.</div>
      <div v-else class="text-xs text-slate-500 italic py-1">No tasks queued.</div>

      <!-- Add buttons -->
      <div class="flex gap-2 mt-2 pt-2 border-t border-slate-700">
        <button
          @click="showAddDialog = true"
          class="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-300"
        >+ Add task</button>
        <button
          v-if="doneCount > 0"
          @click="archiveDone"
          class="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-400"
          title="Move done tasks to archive"
        >Archive done</button>
      </div>

      <!-- Archive section -->
      <div class="mt-2 pt-2 border-t border-slate-700/50">
        <button
          @click="toggleArchive"
          class="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-400 w-full text-left py-0.5"
        >
          <span>{{ archiveOpen ? '▾' : '▸' }}</span>
          <span>Archive</span>
        </button>
        <div v-if="archiveOpen" class="mt-1">
          <div v-if="archiveLoading" class="text-xs text-slate-500 italic py-1">Loading…</div>
          <div v-else-if="archiveTasks.length === 0" class="text-xs text-slate-500 italic py-1">No archived tasks.</div>
          <div v-else>
            <div
              v-for="(item, i) in archiveTasks"
              :key="i"
              class="flex items-center gap-2 py-1 px-2 rounded text-xs opacity-60"
            >
              <span class="text-green-600">✓</span>
              <span
                class="px-1 py-0.5 rounded font-mono shrink-0"
                :class="archiveBadgeClass(item.task_type)"
              >{{ item.task_type }}</span>
              <span class="text-slate-400 truncate font-mono">{{ item.filename ?? item.description }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Dialogs -->
    <AddTaskDialog
      v-if="showAddDialog"
      :container-id="containerId"
      @close="showAddDialog = false"
      @add="(type, fn, desc, createFile, commitMode, planDisposition, autoQueuePlan) => addTask(type, fn, desc, createFile, commitMode, planDisposition, autoQueuePlan)"
    />

    <PlanqFileEditor
      v-if="editingFile"
      :container-id="containerId"
      :filename="editingFile.filename!"
      @close="editingFile = null"
      @saved="editingFile = null"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive } from 'vue'
import { usePlanq } from '../composables/usePlanq'
import PlanqTaskRow from './PlanqTaskRow.vue'
import AddTaskDialog from './AddTaskDialog.vue'
import PlanqFileEditor from './PlanqFileEditor.vue'
import type { PlanqTask, PlanqItem, AutoTestPending } from '../types'

const props = defineProps<{
  containerId: string
  tasks: PlanqTask[]
  connected: boolean
  autoTestPending?: AutoTestPending | null
}>()

const emit = defineEmits<{
  'tasks-changed': []
}>()

const { addTask: apiAdd, updateTask: apiUpdate, deleteTask: apiDelete, reorderTasks: apiReorder, fetchArchive: apiFetchArchive, archiveTask: apiArchiveTask, archiveDone: apiArchiveDone, respondToAutoTest: apiRespondAutoTest } = usePlanq()

const open = ref(true)
const showAddDialog = ref(false)
const editingFile = ref<PlanqTask | null>(null)
const dragFrom = ref<number | null>(null)

// Archive
const archiveOpen = ref(false)
const archiveTasks = ref<PlanqItem[]>([])
const archiveLoading = ref(false)

async function toggleArchive() {
  archiveOpen.value = !archiveOpen.value
  if (archiveOpen.value) {
    archiveLoading.value = true
    archiveTasks.value = await apiFetchArchive(props.containerId)
    archiveLoading.value = false
  }
}

// Status filters
const activeFilters = reactive(new Set<string>())

function toggleFilter(status: string) {
  if (activeFilters.has(status)) activeFilters.delete(status)
  else activeFilters.add(status)
}

function toggleFilterExclusive(status: string) {
  if (activeFilters.size === 1 && activeFilters.has(status)) {
    activeFilters.clear()
  } else {
    activeFilters.clear()
    activeFilters.add(status)
  }
}

const filteredTasks = computed(() =>
  activeFilters.size === 0 ? props.tasks : props.tasks.filter(t => activeFilters.has(t.status))
)

const STATUS_FILTER_DEFS = [
  { status: 'pending',         icon: '▶',  label: 'Pending',         activeClass: 'bg-slate-700 text-slate-300' },
  { status: 'underway',        icon: '⚡', label: 'Underway',        activeClass: 'bg-amber-900/60 text-amber-300' },
  { status: 'auto-queue',      icon: '⏱',  label: 'Auto-queued',     activeClass: 'bg-cyan-900/60 text-cyan-300' },
  { status: 'awaiting-commit', icon: '💾', label: 'Awaiting commit', activeClass: 'bg-purple-900/60 text-purple-300' },
  { status: 'awaiting-plan',   icon: '📋', label: 'Awaiting plan',   activeClass: 'bg-teal-900/60 text-teal-300' },
  { status: 'done',            icon: '✅', label: 'Done',            activeClass: 'bg-green-900/40 text-green-400' },
]

const statusFilters = computed(() =>
  STATUS_FILTER_DEFS.map(f => ({
    ...f,
    count: props.tasks.filter(t => t.status === f.status).length,
  })).filter(f => f.count > 0)
)

const pendingCount = computed(() => props.tasks.filter(t => t.status === 'pending').length)
const underwayCount = computed(() => props.tasks.filter(t => t.status === 'underway').length)
const doneCount = computed(() => props.tasks.filter(t => t.status === 'done').length)
const autoQueueCount = computed(() => props.tasks.filter(t => t.status === 'auto-queue').length)
const awaitingCommitCount = computed(() => props.tasks.filter(t => t.status === 'awaiting-commit').length)
const awaitingPlanCount = computed(() => props.tasks.filter(t => t.status === 'awaiting-plan').length)
// Warn if there are multiple underway tasks alongside auto-queue tasks (suggests >1 auto runner)
const multipleAutoWarning = computed(() => autoQueueCount.value > 0 && underwayCount.value > 1)

function archiveBadgeClass(taskType: string): string {
  return ({
    'task': 'bg-blue-900/40 text-blue-400',
    'plan': 'bg-purple-900/40 text-purple-400',
    'make-plan': 'bg-teal-900/40 text-teal-400',
    'investigate': 'bg-indigo-900/40 text-indigo-400',
    'auto-test': 'bg-yellow-900/40 text-yellow-400',
    'auto-commit': 'bg-green-900/40 text-green-400',
    'manual-test': 'bg-yellow-900/30 text-yellow-500',
    'manual-commit': 'bg-orange-900/40 text-orange-400',
    'manual-task': 'bg-slate-700/60 text-slate-400',
    'unnamed-task': 'bg-blue-900/30 text-blue-500',
  } as Record<string, string>)[taskType] ?? 'bg-slate-700/60 text-slate-400'
}

const cid = () => props.containerId

async function addTask(taskType: string, filename: string | null, description: string | null, createFile = false, commitMode: 'none' | 'auto' | 'stage' | 'manual' = 'none', planDisposition?: 'manual' | 'add-after' | 'add-end', autoQueuePlan?: boolean) {
  console.log(`[planq] add task type=${taskType} file=${filename ?? '—'} commit_mode=${commitMode} container=${cid()}`)
  await apiAdd(props.containerId, taskType, filename, description, createFile, commitMode, planDisposition, autoQueuePlan)
  emit('tasks-changed')
}

async function setStatus(task: PlanqTask, status: 'pending' | 'done' | 'underway' | 'auto-queue' | 'awaiting-commit' | 'awaiting-plan') {
  console.log(`[planq] set status ${task.status}→${status} task=${task.filename ?? task.description} container=${cid()}`)
  await apiUpdate(props.containerId, task.id, { status })
  emit('tasks-changed')
}

async function deleteTask(id: number) {
  const task = props.tasks.find(t => t.id === id)
  console.log(`[planq] delete task=${task?.filename ?? task?.description ?? id} container=${cid()}`)
  await apiDelete(props.containerId, id)
  emit('tasks-changed')
}

async function updateDesc(id: number, desc: string) {
  console.log(`[planq] update desc task=${id} container=${cid()}`)
  await apiUpdate(props.containerId, id, { description: desc })
  emit('tasks-changed')
}

async function archiveTask(id: number) {
  await apiArchiveTask(props.containerId, id)
  emit('tasks-changed')
  if (archiveOpen.value) {
    archiveTasks.value = await apiFetchArchive(props.containerId)
  }
}

async function archiveDone() {
  const count = await apiArchiveDone(props.containerId)
  emit('tasks-changed')
  if (archiveOpen.value && count > 0) {
    archiveTasks.value = await apiFetchArchive(props.containerId)
  }
}

async function setCommitMode(task: PlanqTask, mode: 'none' | 'auto' | 'stage' | 'manual') {
  console.log(`[planq] set commit_mode=${mode} task=${task.filename ?? task.description} container=${cid()}`)
  await apiUpdate(props.containerId, task.id, { commit_mode: mode })
  emit('tasks-changed')
}

const respondingAutoTest = ref(false)

async function respondAutoTest(response: 'continue' | 'abort') {
  respondingAutoTest.value = true
  await apiRespondAutoTest(props.containerId, response)
  respondingAutoTest.value = false
}

async function addPlanFromMakePlan(planFilename: string) {
  console.log(`[planq] add plan from make-plan file=${planFilename} container=${cid()}`)
  await apiAdd(props.containerId, 'plan', planFilename, null, false)
  emit('tasks-changed')
}

async function dropOn(targetId: number) {
  if (dragFrom.value === null || dragFrom.value === targetId) {
    dragFrom.value = null
    return
  }
  const tasks = [...props.tasks]
  const fromIdx = tasks.findIndex(t => t.id === dragFrom.value)
  const toIdx = tasks.findIndex(t => t.id === targetId)
  if (fromIdx < 0 || toIdx < 0) { dragFrom.value = null; return }
  const [moved] = tasks.splice(fromIdx, 1)
  tasks.splice(toIdx, 0, moved)
  const reorder = tasks.map((t, i) => ({ id: t.id, position: i }))
  dragFrom.value = null
  await apiReorder(props.containerId, reorder)
  emit('tasks-changed')
}
</script>
