<template>
  <div class="mt-2">
    <!-- Header -->
    <button
      @click="open = !open"
      class="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-200 font-semibold w-full text-left py-1"
    >
      <span>{{ open ? '▾' : '▸' }}</span>
      <span>Plan Queue</span>
      <span class="text-slate-500">({{ pendingCount }} pending{{ underwayCount > 0 ? `, ${underwayCount} underway` : '' }}{{ doneCount > 0 ? `, ${doneCount} done` : '' }})</span>
    </button>

    <div v-if="open" class="mt-1 bg-slate-900/50 rounded-lg border border-slate-700 p-2">
      <!-- Offline notice -->
      <div v-if="!connected" class="text-xs text-slate-500 italic mb-2">
        Container offline — queue shown from last heartbeat; edits will fail.
      </div>

      <!-- Task list -->
      <div v-if="tasks.length > 0">
        <PlanqTaskRow
          v-for="(task, i) in tasks"
          :key="task.id"
          :task="task"
          :position="i + 1"
          :container-id="containerId"
          :all-tasks="tasks"
          @edit-file="editingFile = task"
          @set-status="(t, s) => setStatus(t, s)"
          @delete="deleteTask(task.id)"
          @update-desc="(id, desc) => updateDesc(id, desc)"
          @add-plan="addPlanFromMakePlan"
          @dragstart="dragFrom = task.id"
          @drop="dropOn(task.id)"
        />
      </div>
      <div v-else class="text-xs text-slate-500 italic py-1">No tasks queued.</div>

      <!-- Add buttons -->
      <div class="flex gap-2 mt-2 pt-2 border-t border-slate-700">
        <button
          @click="showAddDialog = true"
          class="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-300"
        >+ Add task</button>
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
      @add="(type, fn, desc, createFile) => addTask(type, fn, desc, createFile)"
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
import { ref, computed } from 'vue'
import { usePlanq } from '../composables/usePlanq'
import PlanqTaskRow from './PlanqTaskRow.vue'
import AddTaskDialog from './AddTaskDialog.vue'
import PlanqFileEditor from './PlanqFileEditor.vue'
import type { PlanqTask, PlanqItem } from '../types'

const props = defineProps<{
  containerId: string
  tasks: PlanqTask[]
  connected: boolean
}>()

const emit = defineEmits<{
  'tasks-changed': []
}>()

const { addTask: apiAdd, updateTask: apiUpdate, deleteTask: apiDelete, reorderTasks: apiReorder, fetchArchive: apiFetchArchive } = usePlanq()

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
  if (archiveOpen.value && archiveTasks.value.length === 0) {
    archiveLoading.value = true
    archiveTasks.value = await apiFetchArchive(props.containerId)
    archiveLoading.value = false
  }
}

const pendingCount = computed(() => props.tasks.filter(t => t.status === 'pending').length)
const underwayCount = computed(() => props.tasks.filter(t => t.status === 'underway').length)
const doneCount = computed(() => props.tasks.filter(t => t.status === 'done').length)

function archiveBadgeClass(taskType: string): string {
  return ({
    'task': 'bg-blue-900/40 text-blue-400',
    'plan': 'bg-purple-900/40 text-purple-400',
    'make-plan': 'bg-teal-900/40 text-teal-400',
    'manual-test': 'bg-yellow-900/40 text-yellow-400',
    'manual-commit': 'bg-orange-900/40 text-orange-400',
    'manual-task': 'bg-slate-700/60 text-slate-400',
    'unnamed-task': 'bg-blue-900/30 text-blue-500',
  } as Record<string, string>)[taskType] ?? 'bg-slate-700/60 text-slate-400'
}

const cid = () => props.containerId

async function addTask(taskType: string, filename: string | null, description: string | null, createFile = false) {
  console.log(`[planq] add task type=${taskType} file=${filename ?? '—'} container=${cid()}`)
  await apiAdd(props.containerId, taskType, filename, description, createFile)
  emit('tasks-changed')
}

async function setStatus(task: PlanqTask, status: 'pending' | 'done' | 'underway') {
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
