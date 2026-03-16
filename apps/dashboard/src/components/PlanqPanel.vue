<template>
  <div class="mt-2">
    <!-- Header -->
    <button
      @click="toggleOpen()"
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

      <!-- Status / review / type filters (single wrapping row) -->
      <div class="flex items-center gap-1 mb-1 flex-wrap">
        <span class="text-xs text-slate-600 shrink-0">status:</span>
        <button
          v-for="f in statusFilters"
          :key="f.status"
          @click.exact="toggleFilterExclusive(f.status)"
          @click.ctrl.exact="toggleFilter(f.status)"
          @click.meta.exact="toggleFilter(f.status)"
          @click.alt.exact="toggleFilterInverted(f.status)"
          :title="`${f.label} (${f.count}) — click to filter, Ctrl/Cmd+click to multi-select, Alt+click to invert`"
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
          title="Clear work status filter"
        >✕</button>
        <template v-if="reviewFilterVisible">
          <span class="text-slate-700 select-none shrink-0">|</span>
          <span class="text-xs text-slate-600 shrink-0">review:</span>
          <button
            v-for="f in reviewFilters"
            :key="f.status"
            @click.exact="toggleReviewFilterExclusive(f.status)"
            @click.ctrl.exact="toggleReviewFilter(f.status)"
            @click.meta.exact="toggleReviewFilter(f.status)"
            :title="`${f.label} (${f.count}) — click to filter, Ctrl/Cmd+click to multi-select`"
            class="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs transition-all"
            :class="activeReviewFilters.size === 0 || activeReviewFilters.has(f.status)
              ? [f.activeClass, 'opacity-100']
              : 'bg-slate-800 text-slate-600 opacity-50'"
          >
            <span>{{ f.icon }}</span>
            <span>{{ f.count }}</span>
          </button>
          <button
            v-if="activeReviewFilters.size > 0"
            @click="activeReviewFilters.clear()"
            class="px-1.5 py-0.5 rounded text-xs bg-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-600"
            title="Clear review status filter"
          >✕</button>
        </template>
        <template v-if="typeFilters.some(f => f.count > 0)">
          <span class="text-slate-700 select-none shrink-0">|</span>
          <span class="text-xs text-slate-600 shrink-0">type:</span>
          <button
            v-for="f in typeFilters.filter(f => f.count > 0)"
            :key="f.type"
            @click.exact="toggleTypeFilterExclusive(f.type)"
            @click.ctrl.exact="toggleTypeFilter(f.type)"
            @click.meta.exact="toggleTypeFilter(f.type)"
            @click.alt.exact="toggleTypeFilterInverted(f.type)"
            :title="`${f.label} (${f.count}) — click to filter, Ctrl/Cmd+click to multi-select, Alt+click to invert`"
            class="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs transition-all"
            :class="activeTypeFilters.size === 0 || activeTypeFilters.has(f.type)
              ? [f.activeClass, 'opacity-100']
              : 'bg-slate-800 text-slate-600 opacity-50'"
          >
            <span>{{ f.icon }}</span>
            <span>{{ f.count }}</span>
          </button>
          <button
            v-if="activeTypeFilters.size > 0"
            @click="activeTypeFilters.clear()"
            class="px-1.5 py-0.5 rounded text-xs bg-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-600"
            title="Clear type filter"
          >✕</button>
        </template>
      </div>

      <!-- Task list -->
      <div v-if="filteredTasksWithMeta.length > 0">
        <template v-for="{ task, dimmed } in filteredTasksWithMeta" :key="task.id">
          <PlanqTaskRow
            :task="task"
            :position="tasks.indexOf(task) + 1"
            :container-id="containerId"
            :all-tasks="tasks"
            :dimmed="dimmed"
            @edit-file="editingFile = task"
            @set-status="(t, s) => setStatus(t, s)"
            @delete="deleteTask(task.id)"
            @update-desc="(id, desc) => updateDesc(id, desc)"
            @set-commit-mode="(t, m) => setCommitMode(t, m)"
            @add-plan="addPlanFromMakePlan"
            @archive="archiveTask(task.id)"
            @set-review-status="(t, s) => setReviewStatus(t, s)"
            @add-subtask="addingSubtaskTo = task"
            @dragstart="dragFrom = task.id"
            @drop="dropOn(task.id)"
            @open-session="sid => emit('open-history', sid)"
          />
          <!-- Subtasks (children of this task), filtered when filters active -->
          <template v-for="(child, childIdx) in filteredChildren(task.id)" :key="child.id">
            <PlanqTaskRow
              :task="child"
              :position="`${tasks.indexOf(task) + 1}.${childIdx + 1}`"
              :container-id="containerId"
              :all-tasks="tasks"
              :is-child="true"
              :link-type="child.link_type"
              @edit-file="editingFile = child"
              @set-status="(t, s) => setStatus(t, s)"
              @delete="deleteTask(child.id)"
              @update-desc="(id, desc) => updateDesc(id, desc)"
              @set-commit-mode="(t, m) => setCommitMode(t, m)"
              @add-plan="addPlanFromMakePlan"
              @archive="archiveTask(child.id)"
              @set-review-status="(t, s) => setReviewStatus(t, s)"
              @dragstart="dragFrom = child.id"
              @drop="dropOn(child.id)"
              @open-session="sid => emit('open-history', sid)"
            />
          </template>
        </template>
      </div>
      <div v-else-if="tasks.length > 0 && filteredTasksWithMeta.length === 0" class="text-xs text-slate-500 italic py-1">No tasks match filter.</div>
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
              <button
                v-if="item.filename"
                @click="archiveViewingFile = item.filename"
                class="text-slate-400 truncate font-mono hover:text-slate-200 hover:underline text-left min-w-0"
              >{{ item.filename }}</button>
              <span v-else class="text-slate-400 truncate font-mono">{{ item.description }}</span>
              <button
                v-if="item.task_type === 'investigate' && item.filename"
                @click="archiveViewingFile = item.filename.replace(/^investigate-/, 'feedback-')"
                class="shrink-0 text-indigo-500 hover:text-indigo-300 text-xs"
                title="View investigation feedback"
              >feedback</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Dialogs -->
    <AddTaskDialog
      v-if="showAddDialog"
      :container-id="containerId"
      :all-tasks="tasks"
      @close="showAddDialog = false"
      @add="(type, fn, desc, createFile, commitMode, planDisposition, autoQueuePlan, parentTaskId, linkType, subtasks) => addTask(type, fn, desc, createFile, commitMode, planDisposition, autoQueuePlan, parentTaskId, linkType, subtasks)"
    />
    <AddTaskDialog
      v-if="addingSubtaskTo"
      :container-id="containerId"
      :all-tasks="tasks"
      :parent-task="addingSubtaskTo"
      @close="addingSubtaskTo = null"
      @add="(type, fn, desc, createFile, commitMode, planDisposition, autoQueuePlan, parentTaskId, linkType) => addTask(type, fn, desc, createFile, commitMode, planDisposition, autoQueuePlan, parentTaskId, linkType)"
    />

    <PlanqFileEditor
      v-if="editingFile"
      :container-id="containerId"
      :filename="editingFile.filename!"
      @close="editingFile = null"
      @saved="clearCached(editingFile!.filename!); editingFile = null"
    />
    <PlanqFileEditor
      v-if="archiveViewingFile"
      :container-id="containerId"
      :filename="archiveViewingFile"
      @close="archiveViewingFile = null"
      @saved="archiveViewingFile = null"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive } from 'vue'
import { usePlanq } from '../composables/usePlanq'
import { useContainers } from '../composables/useContainers'
import { usePlanqPanelState } from '../composables/usePanelState'
import { useExpandedTasks } from '../composables/useExpandedTasks'
import PlanqTaskRow from './PlanqTaskRow.vue'
import AddTaskDialog from './AddTaskDialog.vue'
import PlanqFileEditor from './PlanqFileEditor.vue'
import type { PlanqTask, PlanqItem, AutoTestPending, ReviewStatus } from '../types'
import type { SubtaskEntry } from './AddTaskDialog.vue'

const props = defineProps<{
  containerId: string
  tasks: PlanqTask[]
  connected: boolean
  autoTestPending?: AutoTestPending | null
  initialReviewFilter?: string
}>()

const emit = defineEmits<{
  'tasks-changed': []
  'open-history': [sessionId: string]
}>()

const { addTask: apiAdd, updateTask: apiUpdate, deleteTask: apiDelete, reorderTasks: apiReorder, fetchArchive: apiFetchArchive, archiveTask: apiArchiveTask, archiveDone: apiArchiveDone, respondToAutoTest: apiRespondAutoTest } = usePlanq()
const { updatePlanqTaskOptimistic } = useContainers()
const { clearCached } = useExpandedTasks()

const { open, toggle: toggleOpen } = usePlanqPanelState(props.containerId)
const showAddDialog = ref(false)
const addingSubtaskTo = ref<PlanqTask | null>(null)
const editingFile = ref<PlanqTask | null>(null)
const archiveViewingFile = ref<string | null>(null)
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

// Work status filters
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

function toggleFilterInverted(status: string) {
  if (activeFilters.has(status)) {
    activeFilters.delete(status)
  } else {
    activeFilters.clear()
    for (const f of STATUS_FILTER_DEFS) { if (f.status !== status) activeFilters.add(f.status) }
  }
}

// Review status filters
const activeReviewFilters = reactive(new Set<string>(
  props.initialReviewFilter ? [props.initialReviewFilter] : []
))

function toggleReviewFilter(status: string) {
  if (activeReviewFilters.has(status)) activeReviewFilters.delete(status)
  else activeReviewFilters.add(status)
}

function toggleReviewFilterExclusive(status: string) {
  if (activeReviewFilters.size === 1 && activeReviewFilters.has(status)) {
    activeReviewFilters.clear()
  } else {
    activeReviewFilters.clear()
    activeReviewFilters.add(status)
  }
}

// Map from parent task ID to its child tasks (in position order)
const taskChildren = computed(() => {
  const map = new Map<number, typeof props.tasks>()
  for (const t of props.tasks) {
    if (t.parent_task_id != null) {
      if (!map.has(t.parent_task_id)) map.set(t.parent_task_id, [])
      map.get(t.parent_task_id)!.push(t)
    }
  }
  return map
})

// IDs of tasks that are children of another task (should not appear at top level)
const childTaskIds = computed(() => new Set(props.tasks.filter(t => t.parent_task_id != null).map(t => t.id)))

// Deferred tasks always appear at the bottom; child tasks are excluded from top level
const sortedTasks = computed(() => {
  const topLevel = props.tasks.filter(t => !childTaskIds.value.has(t.id))
  const nonDeferred = topLevel.filter(t => t.status !== 'deferred')
  const deferred = topLevel.filter(t => t.status === 'deferred')
  return [...nonDeferred, ...deferred]
})

const hasActiveFilters = computed(() =>
  activeFilters.size > 0 || activeTypeFilters.size > 0 || activeReviewFilters.size > 0
)

function taskMatchesFilters(t: PlanqTask): boolean {
  if (activeFilters.size > 0 && !activeFilters.has(t.status)) return false
  if (activeTypeFilters.size > 0 && !activeTypeFilters.has(t.task_type)) return false
  if (activeReviewFilters.size > 0 && !activeReviewFilters.has(t.review_status ?? 'none')) return false
  return true
}

function anyDescendantMatchesFilters(taskId: number): boolean {
  const children = taskChildren.value.get(taskId) ?? []
  return children.some(c => taskMatchesFilters(c) || anyDescendantMatchesFilters(c.id))
}

// Returns top-level tasks that should be visible, with a flag indicating whether
// the task is shown only because a descendant matches (in which case it is dimmed).
const filteredTasksWithMeta = computed((): { task: PlanqTask; dimmed: boolean }[] => {
  if (!hasActiveFilters.value) return sortedTasks.value.map(t => ({ task: t, dimmed: false }))
  const result: { task: PlanqTask; dimmed: boolean }[] = []
  for (const t of sortedTasks.value) {
    const direct = taskMatchesFilters(t)
    const childMatch = anyDescendantMatchesFilters(t.id)
    if (direct || childMatch) result.push({ task: t, dimmed: !direct && childMatch })
  }
  return result
})

// When filters are active, only show subtasks that match or have matching descendants.
function filteredChildren(parentId: number): PlanqTask[] {
  const children = taskChildren.value.get(parentId) ?? []
  if (!hasActiveFilters.value) return children
  return children.filter(c => taskMatchesFilters(c) || anyDescendantMatchesFilters(c.id))
}

const REVIEW_STATUS_DEFS: Array<{ status: string; icon: string; label: string; activeClass: string }> = [
  { status: 'ready',          icon: '🔵', label: 'Ready',          activeClass: 'bg-blue-900/60 text-blue-300' },
  { status: 'testing',        icon: '🧪', label: 'Testing',        activeClass: 'bg-yellow-900/60 text-yellow-300' },
  { status: 'passed',         icon: '🟢', label: 'Passed',         activeClass: 'bg-green-900/60 text-green-300' },
  { status: 'has-issues',     icon: '🔴', label: 'Has Issues',     activeClass: 'bg-red-900/60 text-red-300' },
  { status: 'fix-scheduled',  icon: '🔧', label: 'Fix Scheduled',  activeClass: 'bg-orange-900/60 text-orange-300' },
  { status: 'follow-up',      icon: '🔄', label: 'Follow-up',      activeClass: 'bg-purple-900/60 text-purple-300' },
  { status: 'revert-scheduled', icon: '⏪', label: 'Revert Sched.', activeClass: 'bg-red-950/80 text-red-400' },
  { status: 'ready-for-merge', icon: '🚀', label: 'Ready to Merge', activeClass: 'bg-teal-900/60 text-teal-300' },
  { status: 'merged',         icon: '🏁', label: 'Merged',         activeClass: 'bg-green-950/80 text-green-500' },
  { status: 'cancelled',      icon: '🚫', label: 'Cancelled',      activeClass: 'bg-slate-700 text-slate-400' },
  { status: 'retry-later',    icon: '⏸️',  label: 'Retry Later',   activeClass: 'bg-yellow-950/80 text-yellow-500' },
]

const reviewFilters = computed(() =>
  REVIEW_STATUS_DEFS.map(f => ({
    ...f,
    count: props.tasks.filter(t => (t.review_status ?? 'none') === f.status).length,
  })).filter(f => f.count > 0)
)

const reviewFilterVisible = computed(() =>
  props.tasks.some(t => t.review_status && t.review_status !== 'none')
)

const STATUS_FILTER_DEFS = [
  { status: 'pending',         icon: '▶',  label: 'Pending',         activeClass: 'bg-slate-700 text-slate-300' },
  { status: 'underway',        icon: '⚡', label: 'Underway',        activeClass: 'bg-amber-900/60 text-amber-300' },
  { status: 'auto-queue',      icon: '⏱',  label: 'Auto-queued',     activeClass: 'bg-cyan-900/60 text-cyan-300' },
  { status: 'awaiting-commit', icon: '💾', label: 'Awaiting commit', activeClass: 'bg-purple-900/60 text-purple-300' },
  { status: 'awaiting-plan',   icon: '📋', label: 'Awaiting plan',   activeClass: 'bg-teal-900/60 text-teal-300' },
  { status: 'done',            icon: '✅', label: 'Done',            activeClass: 'bg-green-900/40 text-green-400' },
  { status: 'deferred',        icon: '💤', label: 'Deferred',        activeClass: 'bg-slate-700 text-slate-400' },
]

const statusFilters = computed(() =>
  STATUS_FILTER_DEFS.map(f => ({
    ...f,
    count: props.tasks.filter(t => t.status === f.status).length,
  }))
)

const TYPE_FILTER_DEFS = [
  { type: 'task',          icon: '📝', label: 'Task',          activeClass: 'bg-blue-900/60 text-blue-300' },
  { type: 'plan',          icon: '📜', label: 'Plan',          activeClass: 'bg-purple-900/60 text-purple-300' },
  { type: 'make-plan',     icon: '🗂️', label: 'Make-plan',     activeClass: 'bg-teal-900/60 text-teal-300' },
  { type: 'investigate',   icon: '🔍', label: 'Investigate',   activeClass: 'bg-indigo-900/60 text-indigo-300' },
  { type: 'auto-test',     icon: '🧪', label: 'Auto-test',     activeClass: 'bg-yellow-900/60 text-yellow-300' },
  { type: 'auto-commit',   icon: '⚙️', label: 'Auto-commit',   activeClass: 'bg-green-900/60 text-green-300' },
  { type: 'manual-test',   icon: '🔬', label: 'Manual-test',   activeClass: 'bg-yellow-900/40 text-yellow-400' },
  { type: 'manual-commit', icon: '✍️', label: 'Manual-commit', activeClass: 'bg-orange-900/60 text-orange-300' },
  { type: 'manual-task',   icon: '👤', label: 'Manual-task',   activeClass: 'bg-slate-700 text-slate-300' },
  { type: 'unnamed-task',  icon: '💬', label: 'Unnamed-task',  activeClass: 'bg-blue-900/40 text-blue-400' },
]

const activeTypeFilters = reactive(new Set<string>())

function toggleTypeFilter(type: string) {
  if (activeTypeFilters.has(type)) activeTypeFilters.delete(type)
  else activeTypeFilters.add(type)
}

function toggleTypeFilterExclusive(type: string) {
  if (activeTypeFilters.size === 1 && activeTypeFilters.has(type)) {
    activeTypeFilters.clear()
  } else {
    activeTypeFilters.clear()
    activeTypeFilters.add(type)
  }
}

function toggleTypeFilterInverted(type: string) {
  if (activeTypeFilters.has(type)) {
    activeTypeFilters.delete(type)
  } else {
    activeTypeFilters.clear()
    for (const f of TYPE_FILTER_DEFS) { if (f.type !== type) activeTypeFilters.add(f.type) }
  }
}

const typeFilters = computed(() =>
  TYPE_FILTER_DEFS.map(f => ({
    ...f,
    count: props.tasks.filter(t => t.task_type === f.type).length,
  }))
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

async function addTask(taskType: string, filename: string | null, description: string | null, createFile = false, commitMode: 'none' | 'auto' | 'stage' | 'manual' = 'none', planDisposition?: 'manual' | 'add-after' | 'add-end', autoQueuePlan?: boolean, parentTaskId?: number, linkType?: 'follow-up' | 'fix-required' | 'check' | 'other', subtasks?: SubtaskEntry[]) {
  console.log(`[planq] add task type=${taskType} file=${filename ?? '—'} commit_mode=${commitMode} container=${cid()}`)
  const created = await apiAdd(props.containerId, taskType, filename, description, createFile, commitMode, planDisposition, autoQueuePlan, parentTaskId, linkType)
  if (created && subtasks?.length) {
    for (const sub of subtasks) {
      const subFile = sub.filename.trim() || null
      const subDesc = sub.description.trim() || null
      if (!subFile && !subDesc) continue
      // A file-based type with no filename becomes an unnamed-task (avoids description-as-filename confusion)
      const subType = !subFile && sub.type === 'task' ? 'unnamed-task' : sub.type
      await apiAdd(props.containerId, subType, subFile, subDesc, !!subFile, 'none', undefined, undefined, created.id, sub.linkType)
    }
  }
  emit('tasks-changed')
}

async function setStatus(task: PlanqTask, status: 'pending' | 'done' | 'underway' | 'auto-queue' | 'awaiting-commit' | 'awaiting-plan' | 'deferred') {
  console.log(`[planq] set status ${task.status}→${status} task=${task.filename ?? task.description} container=${cid()}`)
  updatePlanqTaskOptimistic(props.containerId, task.id, { status })
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

async function setReviewStatus(task: PlanqTask, status: ReviewStatus) {
  updatePlanqTaskOptimistic(props.containerId, task.id, { review_status: status })
  await apiUpdate(props.containerId, task.id, { review_status: status })
  emit('tasks-changed')
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
