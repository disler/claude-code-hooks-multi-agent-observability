<template>
  <div
    class="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-slate-700/50 group"
    :class="{ 'opacity-50': task.status === 'done' }"
    draggable="true"
    @dragstart="emit('dragstart', task.id)"
    @dragover.prevent
    @drop="emit('drop', task.id)"
  >
    <!-- Drag handle -->
    <span class="text-slate-600 cursor-grab text-xs select-none">⠿</span>

    <!-- Position -->
    <span class="text-xs text-slate-500 w-4 text-right shrink-0">{{ position }}</span>

    <!-- Done indicator -->
    <span v-if="task.status === 'done'" class="text-green-500 text-xs">✅</span>
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
      <!-- Edit file -->
      <button
        v-if="task.filename && task.status !== 'done'"
        @click="emit('edit-file', task)"
        class="text-xs text-slate-400 hover:text-slate-200 px-1"
        title="Edit file"
      >Edit</button>

      <!-- Edit description (manual tasks) -->
      <button
        v-if="!task.filename && task.status !== 'done'"
        @click="startEditDesc"
        class="text-xs text-slate-400 hover:text-slate-200 px-1"
        title="Edit description"
      >Edit</button>

      <!-- Mark done / pending -->
      <button
        @click="emit('toggle-status', task)"
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
import type { PlanqTask } from '../types'

const props = defineProps<{
  task: PlanqTask
  position: number
}>()

const emit = defineEmits<{
  'edit-file': [task: PlanqTask]
  'toggle-status': [task: PlanqTask]
  'delete': [id: number]
  'update-desc': [id: number, desc: string]
  'dragstart': [id: number]
  'drop': [id: number]
}>()

const editingDesc = ref(false)
const editDesc = ref('')
const editInput = ref<HTMLInputElement | null>(null)

const typeBadgeClass = computed(() => ({
  'task': 'bg-blue-900/60 text-blue-300',
  'plan': 'bg-purple-900/60 text-purple-300',
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
</script>
