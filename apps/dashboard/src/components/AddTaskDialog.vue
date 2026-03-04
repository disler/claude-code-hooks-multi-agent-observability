<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60" @click.self="emit('close')">
    <div class="bg-slate-800 border border-slate-600 rounded-xl shadow-2xl p-5 w-96 flex flex-col gap-4">
      <div class="flex items-center justify-between">
        <h3 class="text-sm font-semibold text-slate-200">Add Task</h3>
        <button @click="emit('close')" class="text-slate-500 hover:text-slate-300 text-sm">✕</button>
      </div>

      <div class="flex flex-col gap-1">
        <label class="text-xs text-slate-400">Type</label>
        <select
          v-model="taskType"
          class="text-sm bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-slate-200 focus:outline-none"
        >
          <option value="task">task — run as Claude prompt</option>
          <option value="plan">plan — implement plan from file</option>
          <option value="manual-test">manual-test — manual testing step</option>
          <option value="manual-commit">manual-commit — manual git commit</option>
          <option value="manual-task">manual-task — any manual step</option>
        </select>
      </div>

      <!-- task: name (optional) + description (required) -->
      <template v-if="taskType === 'task'">
        <div class="flex flex-col gap-1">
          <label class="text-xs text-slate-400">Name <span class="text-slate-500">(optional — leave blank for a one-liner)</span></label>
          <input
            v-model="taskName"
            type="text"
            class="text-sm bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-slate-200 font-mono focus:outline-none focus:border-slate-400"
            :class="{ 'border-red-500': taskName && !isNameValid }"
            placeholder="fix-login  →  plans/task-fix-login.md"
          />
          <p v-if="taskName && !isNameValid" class="text-xs text-red-400">Lowercase letters, numbers and hyphens only</p>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs text-slate-400">Description</label>
          <textarea
            v-model="description"
            rows="4"
            class="text-sm bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-slate-200 font-mono focus:outline-none focus:border-slate-400 resize-y"
            placeholder="Describe what Claude should do…"
          />
        </div>
      </template>

      <!-- plan: filename only -->
      <div v-else-if="taskType === 'plan'" class="flex flex-col gap-1">
        <label class="text-xs text-slate-400">Filename (relative to plans/)</label>
        <input
          v-model="planFilename"
          type="text"
          class="text-sm bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-slate-200 font-mono focus:outline-none focus:border-slate-400"
          placeholder="plan-001.md"
        />
      </div>

      <!-- manual-*: description only -->
      <div v-else class="flex flex-col gap-1">
        <label class="text-xs text-slate-400">Description</label>
        <input
          v-model="description"
          type="text"
          class="text-sm bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-slate-200 focus:outline-none focus:border-slate-400"
          placeholder="What needs to be done manually?"
        />
      </div>

      <div class="flex justify-end gap-2">
        <button
          @click="emit('close')"
          class="text-xs px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-300"
        >Cancel</button>
        <button
          @click="submit"
          :disabled="!isValid"
          class="text-xs px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold"
        >Add</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const emit = defineEmits<{
  close: []
  add: [taskType: string, filename: string | null, description: string | null]
}>()

const taskType = ref('task')
const taskName = ref('')   // slug for named tasks
const planFilename = ref('')
const description = ref('')

const NAME_RE = /^[a-z0-9][a-z0-9-]*$/

const isNameValid = computed(() => !taskName.value || NAME_RE.test(taskName.value))

const isValid = computed(() => {
  if (taskType.value === 'task') {
    return description.value.trim().length > 0 && isNameValid.value
  }
  if (taskType.value === 'plan') return planFilename.value.trim().length > 0
  return description.value.trim().length > 0
})

function submit() {
  if (!isValid.value) return
  if (taskType.value === 'task') {
    const name = taskName.value.trim()
    if (name) {
      emit('add', 'task', `task-${name}.md`, description.value.trim())
    } else {
      emit('add', 'unnamed-task', null, description.value.trim())
    }
  } else if (taskType.value === 'plan') {
    emit('add', 'plan', planFilename.value.trim(), null)
  } else {
    emit('add', taskType.value, null, description.value.trim())
  }
  emit('close')
}
</script>
