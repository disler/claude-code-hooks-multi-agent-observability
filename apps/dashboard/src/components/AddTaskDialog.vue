<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60" @click.self="emit('close')" @keydown="onConfirmKey($event, submit)">
    <div class="bg-slate-800 border border-slate-600 rounded-xl shadow-2xl p-5 w-[32rem] flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
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
          <option value="make-plan">make-plan — generate a plan file from a prompt</option>
          <option value="manual-test">manual-test — manual testing step</option>
          <option value="manual-commit">manual-commit — manual git commit</option>
          <option value="manual-task">manual-task — any manual step</option>
        </select>
      </div>

      <!-- task: optional slug + description -->
      <template v-if="taskType === 'task'">
        <div class="flex flex-col gap-1">
          <label class="text-xs text-slate-400">
            Filename <span class="text-slate-500">(optional — leave blank for a one-liner)</span>
          </label>
          <div class="flex items-center gap-1">
            <span class="text-xs text-slate-500 font-mono shrink-0">task-</span>
            <input
              v-model="taskSlug"
              list="task-slugs"
              type="text"
              class="flex-1 text-sm bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-slate-200 font-mono focus:outline-none focus:border-slate-400"
              :class="{ 'border-red-500': taskSlug && !isSlugValid }"
              placeholder="fix-login"
              @input="onSlugInput"
            />
            <span class="text-xs text-slate-500 font-mono shrink-0">.md</span>
            <datalist id="task-slugs">
              <option v-for="s in taskSlugs" :key="s" :value="s" />
            </datalist>
          </div>
          <p v-if="taskSlug && !isSlugValid" class="text-xs text-red-400">Letters, digits, hyphens and underscores only</p>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs text-slate-400">
            Description
            <span v-if="loadingFileContents" class="text-slate-500">— loading…</span>
            <span v-else-if="taskSlug && isExistingTaskFile" class="text-slate-500">— from existing file</span>
          </label>
          <textarea
            v-model="description"
            rows="6"
            class="text-sm bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-slate-200 font-mono focus:outline-none focus:border-slate-400 resize-y min-h-24 max-h-80"
            placeholder="Describe what Claude should do…"
          />
        </div>
      </template>

      <!-- plan: slug combobox + read-only preview -->
      <template v-else-if="taskType === 'plan'">
        <div class="flex flex-col gap-1">
          <label class="text-xs text-slate-400">Filename</label>
          <div class="flex items-center gap-1">
            <span class="text-xs text-slate-500 font-mono shrink-0">plan-</span>
            <input
              v-model="planSlug"
              list="plan-slugs"
              type="text"
              class="flex-1 text-sm bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-slate-200 font-mono focus:outline-none focus:border-slate-400"
              placeholder="001"
              @input="onPlanSlugInput"
            />
            <span class="text-xs text-slate-500 font-mono shrink-0">.md</span>
            <datalist id="plan-slugs">
              <option v-for="s in planSlugs" :key="s" :value="s" />
            </datalist>
          </div>
        </div>
        <div v-if="planSlug" class="flex flex-col gap-1">
          <label class="text-xs text-slate-400">
            File preview
            <span v-if="loadingFileContents" class="text-slate-500">— loading…</span>
            <span v-else-if="!filePreview && planSlug" class="text-slate-500">— new file (will be created by Claude)</span>
          </label>
          <pre
            v-if="filePreview"
            class="text-xs text-slate-300 font-mono bg-slate-900 border border-slate-700 rounded p-2 overflow-y-auto max-h-60 whitespace-pre-wrap break-words"
          >{{ filePreview }}</pre>
        </div>
      </template>

      <!-- make-plan: prompt filename + prompt (target plan file is plan-*.md derived at run time) -->
      <template v-else-if="taskType === 'make-plan'">
        <div class="flex flex-col gap-1">
          <label class="text-xs text-slate-400">Prompt filename <span class="text-slate-500">(Claude will write the plan to plan-*.md)</span></label>
          <div class="flex items-center gap-1">
            <span class="text-xs text-slate-500 font-mono shrink-0">make-plan-</span>
            <input
              v-model="makePlanSlug"
              type="text"
              class="flex-1 text-sm bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-slate-200 font-mono focus:outline-none focus:border-slate-400"
              placeholder="001"
            />
            <span class="text-xs text-slate-500 font-mono shrink-0">.md</span>
          </div>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs text-slate-400">Prompt <span class="text-slate-500">(what kind of plan to create)</span></label>
          <textarea
            v-model="description"
            rows="4"
            class="text-sm bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-slate-200 font-mono focus:outline-none focus:border-slate-400 resize-y"
            placeholder="Design a caching layer for the API…"
          />
        </div>
      </template>

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
import { ref, computed, watch, onMounted } from 'vue'
import { usePlanq } from '../composables/usePlanq'
import { useConfirmKey } from '../composables/useConfirmKey'

const props = defineProps<{ containerId: string }>()

const emit = defineEmits<{
  close: []
  add: [taskType: string, filename: string | null, description: string | null, createFile: boolean]
}>()

const { readFile, listPlansFiles } = usePlanq()
const { onConfirmKey } = useConfirmKey()

const taskType = ref('task')
const taskSlug = ref('')
const planSlug = ref('')
const makePlanSlug = ref('')
const description = ref('')

const plansFiles = ref<string[]>([])
const filePreview = ref<string | null>(null)
const loadingFileContents = ref(false)

// Slug-only lists filtered by prefix
const taskSlugs = computed(() =>
  plansFiles.value
    .filter(f => f.startsWith('task-') && f.endsWith('.md'))
    .map(f => f.slice('task-'.length, -'.md'.length))
)
const planSlugs = computed(() =>
  plansFiles.value
    .filter(f => f.startsWith('plan-') && f.endsWith('.md'))
    .map(f => f.slice('plan-'.length, -'.md'.length))
)

const taskFilename = computed(() => taskSlug.value ? `task-${taskSlug.value}.md` : null)
const planFilename = computed(() => planSlug.value ? `plan-${planSlug.value}.md` : null)
const makePlanFilename = computed(() => makePlanSlug.value ? `make-plan-${makePlanSlug.value}.md` : null)

const isExistingTaskFile = computed(() => !!taskFilename.value && plansFiles.value.includes(taskFilename.value))
const isExistingPlanFile = computed(() => !!planFilename.value && plansFiles.value.includes(planFilename.value))

onMounted(async () => {
  plansFiles.value = await listPlansFiles(props.containerId)
})

// Reset slug/preview when task type changes, but preserve description
watch(taskType, () => {
  taskSlug.value = ''
  planSlug.value = ''
  makePlanSlug.value = ''
  filePreview.value = null
})

const SLUG_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/

const isSlugValid = computed(() => !taskSlug.value || SLUG_RE.test(taskSlug.value))

async function onSlugInput() {
  if (!taskFilename.value || !isExistingTaskFile.value) return
  loadingFileContents.value = true
  description.value = await readFile(props.containerId, taskFilename.value) ?? ''
  loadingFileContents.value = false
}

async function onPlanSlugInput() {
  filePreview.value = null
  if (!planFilename.value || !isExistingPlanFile.value) return
  loadingFileContents.value = true
  filePreview.value = await readFile(props.containerId, planFilename.value)
  loadingFileContents.value = false
}

const isValid = computed(() => {
  if (taskType.value === 'task') {
    return description.value.trim().length > 0 && isSlugValid.value
  }
  if (taskType.value === 'plan') return !!planFilename.value
  if (taskType.value === 'make-plan') {
    return !!makePlanFilename.value && description.value.trim().length > 0
  }
  return description.value.trim().length > 0
})

function submit() {
  if (!isValid.value) return

  if (taskType.value === 'task') {
    if (taskFilename.value) {
      const createFile = !isExistingTaskFile.value
      emit('add', 'task', taskFilename.value, description.value.trim(), createFile)
    } else {
      emit('add', 'unnamed-task', null, description.value.trim(), false)
    }
  } else if (taskType.value === 'plan') {
    emit('add', 'plan', planFilename.value, null, false)
  } else if (taskType.value === 'make-plan') {
    emit('add', 'make-plan', makePlanFilename.value, description.value.trim(), false)
  } else {
    emit('add', taskType.value, null, description.value.trim(), false)
  }
  emit('close')
}
</script>
