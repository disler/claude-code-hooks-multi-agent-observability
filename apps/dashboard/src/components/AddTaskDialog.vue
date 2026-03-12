<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60" @click.self="emit('close')" @keydown="onConfirmKey($event, submit)">
    <div class="bg-slate-800 border border-slate-600 rounded-xl shadow-2xl p-5 min-w-[32rem] flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
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
          <option value="auto-test">auto-test — run shell command as automated test</option>
          <option value="auto-commit">auto-commit — commit staged/unstaged changes</option>
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
            class="text-sm bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-slate-200 font-mono focus:outline-none focus:border-slate-400 resize min-h-24 max-h-80"
            placeholder="Describe what Claude should do…"
          />
          <p v-if="isUnnamedMultiLine" class="text-xs text-amber-400">Multiple lines will be joined with ". " for unnamed tasks — add a filename to use a multi-line task file instead.</p>
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
            class="text-sm bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-slate-200 font-mono focus:outline-none focus:border-slate-400 resize"
            placeholder="Design a caching layer for the API…"
          />
        </div>
      </template>

      <!-- auto-test: command or file -->
      <template v-else-if="taskType === 'auto-test'">
        <div class="flex flex-col gap-1">
          <label class="text-xs text-slate-400">Shell command <span class="text-slate-500">(or leave blank and use a task file)</span></label>
          <input
            v-model="description"
            type="text"
            class="text-sm bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-slate-200 font-mono focus:outline-none focus:border-slate-400"
            placeholder="npm test"
          />
        </div>
      </template>

      <!-- auto-commit: optional options -->
      <template v-else-if="taskType === 'auto-commit'">
        <div class="flex flex-col gap-1">
          <label class="text-xs text-slate-400">Options <span class="text-slate-500">(optional — e.g. description=prompt or title=My commit)</span></label>
          <input
            v-model="description"
            type="text"
            class="text-sm bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-slate-200 font-mono focus:outline-none focus:border-slate-400"
            placeholder="description=prompt"
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

      <!-- Plan disposition selector (for make-plan type only) -->
      <div v-if="taskType === 'make-plan'" class="flex flex-col gap-1">
        <label class="text-xs text-slate-400">After plan is created</label>
        <div class="flex gap-1">
          <button
            v-for="opt in planDispositionOptions"
            :key="opt.value"
            type="button"
            @click="planDisposition = opt.value"
            class="text-xs px-2 py-1 rounded border transition-colors"
            :class="planDisposition === opt.value
              ? opt.activeClass
              : 'border-slate-600 bg-slate-700 text-slate-400 hover:bg-slate-600'"
          >{{ opt.label }}</button>
        </div>
        <div v-if="planDisposition !== 'manual'" class="flex items-center gap-2 mt-1">
          <input
            id="auto-queue-plan"
            v-model="autoQueuePlan"
            type="checkbox"
            class="rounded"
          />
          <label for="auto-queue-plan" class="text-xs text-slate-400">Auto-queue the added plan <span class="text-slate-500">(⏱ mark it for auto-run)</span></label>
        </div>
        <p v-if="planDisposition === 'manual'" class="text-xs text-slate-500">Auto-queue will pause until you add the plan to the queue manually.</p>
      </div>

      <!-- Commit mode selector (for non-auto-commit, non-manual, non-make-plan task types) -->
      <div
        v-if="taskType !== 'auto-commit' && taskType !== 'manual-commit' && taskType !== 'manual-test' && taskType !== 'manual-task' && taskType !== 'make-plan'"
        class="flex flex-col gap-1"
      >
        <label class="text-xs text-slate-400">After this task</label>
        <div class="flex gap-1">
          <button
            v-for="opt in commitModeOptions"
            :key="opt.value"
            type="button"
            @click="commitMode = opt.value"
            class="text-xs px-2 py-1 rounded border transition-colors"
            :class="commitMode === opt.value
              ? opt.activeClass
              : 'border-slate-600 bg-slate-700 text-slate-400 hover:bg-slate-600'"
          >{{ opt.label }}</button>
        </div>
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
  add: [taskType: string, filename: string | null, description: string | null, createFile: boolean, commitMode: 'none' | 'auto' | 'stage' | 'manual' | undefined, planDisposition?: 'manual' | 'add-after' | 'add-end', autoQueuePlan?: boolean]
}>()

const { readFile, listPlansFiles } = usePlanq()
const { onConfirmKey } = useConfirmKey()

const taskType = ref('task')
const taskSlug = ref('')
const planSlug = ref('')
const makePlanSlug = ref('')
const description = ref('')
const commitMode = ref<'none' | 'auto' | 'stage' | 'manual'>('none')
const planDisposition = ref<'manual' | 'add-after' | 'add-end'>('manual')
const autoQueuePlan = ref(false)

const commitModeOptions = [
  { value: 'none' as const, label: 'Nothing', activeClass: 'border-slate-500 bg-slate-600 text-slate-200' },
  { value: 'auto' as const, label: '⇒ Auto-commit', activeClass: 'border-green-600 bg-green-900/50 text-green-300' },
  { value: 'stage' as const, label: '⇒ Stage-commit', activeClass: 'border-blue-600 bg-blue-900/50 text-blue-300' },
  { value: 'manual' as const, label: '⇒ Manual-commit', activeClass: 'border-orange-600 bg-orange-900/50 text-orange-300' },
]

const planDispositionOptions = [
  { value: 'manual' as const, label: 'Manual review', activeClass: 'border-slate-500 bg-slate-600 text-slate-200' },
  { value: 'add-after' as const, label: '⇒ Add after current', activeClass: 'border-teal-600 bg-teal-900/50 text-teal-300' },
  { value: 'add-end' as const, label: '⇒ Add to end', activeClass: 'border-cyan-600 bg-cyan-900/50 text-cyan-300' },
]

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

// Reset slug/preview when task type changes; preserve description and carry slug across file-based types.
watch(taskType, (newType, oldType) => {
  const slugTypes = ['task', 'plan', 'make-plan']
  let preserved = ''
  if (slugTypes.includes(oldType)) {
    preserved = oldType === 'task' ? taskSlug.value
              : oldType === 'plan' ? planSlug.value
              : makePlanSlug.value
  }
  taskSlug.value = ''
  planSlug.value = ''
  makePlanSlug.value = ''
  filePreview.value = null
  if (preserved && slugTypes.includes(newType)) {
    if (newType === 'task') taskSlug.value = preserved
    else if (newType === 'plan') planSlug.value = preserved
    else makePlanSlug.value = preserved
  }
})

const SLUG_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/

const isSlugValid = computed(() => !taskSlug.value || SLUG_RE.test(taskSlug.value))

const isUnnamedMultiLine = computed(() =>
  taskType.value === 'task' && !taskSlug.value && description.value.includes('\n')
)

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
  if (taskType.value === 'auto-commit') return true  // options are optional
  if (taskType.value === 'auto-test') return description.value.trim().length > 0
  return description.value.trim().length > 0
})

function submit() {
  if (!isValid.value) return

  const cm = commitMode.value

  if (taskType.value === 'task') {
    if (taskFilename.value) {
      const createFile = !isExistingTaskFile.value
      emit('add', 'task', taskFilename.value, description.value.trim(), createFile, cm)
    } else {
      const unnamedDesc = description.value.trim().split('\n').map(l => l.trim()).filter(Boolean).join('. ')
      emit('add', 'unnamed-task', null, unnamedDesc, false, cm)
    }
  } else if (taskType.value === 'plan') {
    emit('add', 'plan', planFilename.value, null, false, cm)
  } else if (taskType.value === 'make-plan') {
    emit('add', 'make-plan', makePlanFilename.value, description.value.trim(), false, undefined, planDisposition.value, planDisposition.value !== 'manual' ? autoQueuePlan.value : undefined)
  } else if (taskType.value === 'auto-commit') {
    const opts = description.value.trim() || null
    emit('add', 'auto-commit', null, opts, false, 'none')
  } else if (taskType.value === 'auto-test') {
    emit('add', 'auto-test', null, description.value.trim(), false, cm)
  } else {
    emit('add', taskType.value, null, description.value.trim(), false, cm)
  }
  emit('close')
}
</script>
