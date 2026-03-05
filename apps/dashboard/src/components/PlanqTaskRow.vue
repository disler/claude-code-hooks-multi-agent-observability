<template>
  <div
    class="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-slate-700/50 group"
    :class="{ 'opacity-50': task.status === 'done', 'bg-yellow-900/20': task.status === 'underway' }"
    draggable="true"
    @dragstart="emit('dragstart', task.id)"
    @dragover.prevent
    @drop="emit('drop', task.id)"
  >
    <!-- Drag handle -->
    <span class="text-slate-600 cursor-grab text-xs select-none">⠿</span>

    <!-- Position -->
    <span class="text-xs text-slate-500 w-4 text-right shrink-0">{{ position }}</span>

    <!-- Status indicator -->
    <span v-if="task.status === 'done'" class="text-green-500 text-xs">✅</span>
    <span v-else-if="task.status === 'underway'" class="text-yellow-400 text-xs">⏳</span>
    <span v-else class="text-slate-600 text-xs">▶</span>

    <!-- Type badge -->
    <span class="text-xs px-1 py-0.5 rounded font-mono shrink-0" :class="typeBadgeClass">{{ task.task_type }}</span>

    <!-- Value -->
    <span v-if="!editingDesc" class="text-xs text-slate-300 flex-1 truncate font-mono">
      {{ task.filename ?? task.description }}
    </span>
    <input
      v-else
      v-model="editDesc"
      @blur="saveDesc"
      @keydown.enter="saveDesc"
      @keydown.escape="editingDesc = false"
      class="flex-1 text-xs bg-slate-700 border border-slate-500 rounded px-1 py-0.5 text-slate-200 font-mono focus:outline-none"
      ref="editInput"
    />

    <!-- Actions (shown on hover) -->
    <div class="hidden group-hover:flex items-center gap-1 shrink-0">
      <!-- Copy to clipboard -->
      <button
        @click.stop="copyToClipboard"
        class="text-xs text-slate-400 hover:text-slate-200 px-1"
        :title="copyTitle"
      >{{ copying ? '…' : copied ? '✓' : '⧉' }}</button>

      <!-- Edit file / prompt -->
      <button
        v-if="task.filename && task.status === 'pending'"
        @click="emit('edit-file', task)"
        class="text-xs text-slate-400 hover:text-slate-200 px-1"
        :title="task.task_type === 'make-plan' ? 'Edit prompt' : 'Edit file'"
      >{{ task.task_type === 'make-plan' ? 'Edit prompt' : 'Edit' }}</button>

      <!-- Edit description (manual tasks) -->
      <button
        v-if="!task.filename && task.status === 'pending'"
        @click="startEditDesc"
        class="text-xs text-slate-400 hover:text-slate-200 px-1"
        title="Edit description"
      >Edit</button>

      <!-- Mark underway -->
      <button
        v-if="task.status === 'pending'"
        @click="emit('set-status', task, 'underway')"
        class="text-xs px-1 text-yellow-500 hover:text-yellow-300"
        title="Mark underway"
      >⏳</button>

      <!-- Mark done / pending -->
      <button
        @click="emit('set-status', task, task.status === 'done' ? 'pending' : 'done')"
        class="text-xs px-1"
        :class="task.status === 'done' ? 'text-slate-400 hover:text-slate-200' : 'text-green-500 hover:text-green-300'"
        :title="task.status === 'done' ? 'Mark pending' : 'Mark done'"
      >{{ task.status === 'done' ? '↩' : '✓' }}</button>

      <!-- Delete -->
      <button
        @click="emit('delete', task.id)"
        class="text-xs text-red-500 hover:text-red-300 px-1"
        title="Delete"
      >✕</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, computed } from 'vue'
import { usePlanq } from '../composables/usePlanq'
import type { PlanqTask } from '../types'

const props = defineProps<{
  task: PlanqTask
  position: number
  containerId: string
}>()

const emit = defineEmits<{
  'edit-file': [task: PlanqTask]
  'set-status': [task: PlanqTask, status: 'pending' | 'done' | 'underway']
  'delete': [id: number]
  'update-desc': [id: number, desc: string]
  'dragstart': [id: number]
  'drop': [id: number]
}>()

const { readFile } = usePlanq()

const editingDesc = ref(false)
const editDesc = ref('')
const editInput = ref<HTMLInputElement | null>(null)

const typeBadgeClass = computed(() => ({
  'task': 'bg-blue-900/60 text-blue-300',
  'plan': 'bg-purple-900/60 text-purple-300',
  'make-plan': 'bg-teal-900/60 text-teal-300',
  'manual-test': 'bg-yellow-900/60 text-yellow-300',
  'manual-commit': 'bg-orange-900/60 text-orange-300',
  'manual-task': 'bg-slate-700 text-slate-300',
  'unnamed-task': 'bg-blue-900/40 text-blue-400',
} as Record<string, string>)[props.task.task_type] ?? 'bg-slate-700 text-slate-300')

async function startEditDesc() {
  editDesc.value = props.task.description ?? ''
  editingDesc.value = true
  await nextTick()
  editInput.value?.focus()
}

function saveDesc() {
  if (editDesc.value.trim() !== (props.task.description ?? '')) {
    emit('update-desc', props.task.id, editDesc.value.trim())
  }
  editingDesc.value = false
}

// ── Clipboard copy ────────────────────────────────────────────────────────────

const copied = ref(false)
const copying = ref(false)

const copyTitle = computed(() => {
  if (!props.task.filename) return 'Copy prompt to clipboard'
  if (props.task.task_type === 'plan') return 'Copy plan instruction to clipboard'
  if (props.task.task_type === 'task') return 'Copy task file contents to clipboard'
  if (props.task.task_type === 'make-plan') return 'Copy make-plan prompt to clipboard'
  return 'Copy to clipboard'
})

async function copyToClipboard() {
  let text = ''

  if (!props.task.filename) {
    // unnamed-task and manual tasks: description is the prompt
    text = props.task.description ?? ''
  } else if (props.task.task_type === 'plan') {
    // plan: claude is told to read and implement the file
    text = `Read plans/${props.task.filename} and implement the plan described in it.`
  } else if (props.task.task_type === 'task') {
    // task: file contents are passed directly as the prompt — fetch them
    copying.value = true
    const content = await readFile(props.containerId, props.task.filename)
    copying.value = false
    text = content ?? ''
  } else if (props.task.task_type === 'make-plan') {
    // make-plan: fetch sidecar prompt file and append the target filename instruction
    copying.value = true
    const sidecarFilename = `make-plan-${props.task.filename}`
    const prompt = await readFile(props.containerId, sidecarFilename)
    copying.value = false
    text = prompt ? `${prompt.trim()} Write the plan to plans/${props.task.filename}.` : ''
  } else {
    text = props.task.filename ?? props.task.description ?? ''
  }

  if (!text) return

  try {
    await navigator.clipboard.writeText(text)
    copied.value = true
    setTimeout(() => { copied.value = false }, 1500)
  } catch {}
}
</script>
