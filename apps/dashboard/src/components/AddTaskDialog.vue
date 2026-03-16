<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60" @click.self="emit('close')" @keydown="onConfirmKey($event, submit)" @keydown.escape="emit('close')">
    <div class="bg-slate-800 border border-slate-600 rounded-xl shadow-2xl p-5 min-w-[32rem] flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-sm font-semibold text-slate-200">{{ props.parentTask ? 'Add Subtask' : 'Add Task' }}</h3>
          <div v-if="props.parentTask" class="text-xs text-slate-400 mt-0.5">
            Adding subtask to: <span class="font-mono text-slate-300">{{ props.parentTask.filename ?? props.parentTask.description }}</span>
          </div>
        </div>
        <button @click="emit('close')" class="text-slate-500 hover:text-slate-300 text-sm">✕</button>
      </div>

      <!-- Offline warning -->
      <div v-if="offlineWarning" class="flex items-start gap-2 bg-amber-900/30 border border-amber-700/60 rounded px-3 py-2 text-xs text-amber-300">
        <span class="shrink-0 mt-0.5">⚠️</span>
        <span>{{ offlineWarning }}</span>
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
          <option value="investigate">investigate — research a question and write findings</option>
          <option value="auto-test">auto-test — run shell command as automated test</option>
          <option value="agent-test">agent-test — invoke Claude as a testing agent</option>
          <option value="manual-test">manual-test — manual testing step</option>
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
          <div class="flex items-center gap-1 relative">
            <span class="text-xs text-slate-500 font-mono shrink-0">plan-</span>
            <div class="relative flex-1">
              <input
                v-model="planSlug"
                type="text"
                class="w-full text-sm bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-slate-200 font-mono focus:outline-none focus:border-slate-400"
                placeholder="001"
                autocomplete="off"
                @input="onPlanSlugInput"
                @focus="showPlanDropdown = true"
                @blur="onPlanInputBlur"
              />
              <div
                v-if="showPlanDropdown && filteredPlanItems.length"
                class="absolute z-50 left-0 right-0 top-full mt-0.5 bg-slate-800 border border-slate-600 rounded shadow-xl max-h-56 overflow-y-auto"
              >
                <button
                  v-for="item in filteredPlanItems"
                  :key="item.slug"
                  type="button"
                  class="w-full text-left px-2 py-1.5 flex items-center gap-2 hover:bg-slate-700 transition-colors"
                  @mousedown.prevent="selectPlanSlug(item.slug)"
                >
                  <span class="font-mono text-xs text-slate-200 flex-1">{{ item.slug }}</span>
                  <span v-if="item.makePlanStatus" class="text-xs shrink-0" :class="makePlanStatusClass(item.makePlanStatus)">{{ makePlanStatusLabel(item.makePlanStatus) }}</span>
                  <span v-else class="text-xs text-slate-500 shrink-0">plan</span>
                </button>
              </div>
            </div>
            <span class="text-xs text-slate-500 font-mono shrink-0">.md</span>
          </div>
        </div>
        <div v-if="planSlug" class="flex flex-col gap-1">
          <label class="text-xs text-slate-400">
            File preview
            <span v-if="loadingFileContents" class="text-slate-500">— loading…</span>
            <span v-else-if="!filePreview && planSlug" class="text-slate-500">— new file (will be created by Claude)</span>
          </label>
          <div v-if="filePreview" class="bg-slate-900 border border-slate-700 rounded p-2">
            <MarkdownContent :content="filePreview" />
          </div>
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

      <!-- investigate: slug + prompt -->
      <template v-else-if="taskType === 'investigate'">
        <div class="flex flex-col gap-1">
          <label class="text-xs text-slate-400">Filename <span class="text-slate-500">(Claude will write findings to feedback-*.md)</span></label>
          <div class="flex items-center gap-1">
            <span class="text-xs text-slate-500 font-mono shrink-0">investigate-</span>
            <input
              v-model="investigateSlug"
              type="text"
              class="flex-1 text-sm bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-slate-200 font-mono focus:outline-none focus:border-slate-400"
              placeholder="api-performance"
            />
            <span class="text-xs text-slate-500 font-mono shrink-0">.md</span>
          </div>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs text-slate-400">Prompt <span class="text-slate-500">(what to investigate)</span></label>
          <textarea
            v-model="description"
            rows="4"
            class="text-sm bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-slate-200 font-mono focus:outline-none focus:border-slate-400 resize"
            placeholder="Investigate the performance bottlenecks in the API…"
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

      <!-- agent-test: description passed to Claude as testing prompt -->
      <template v-else-if="taskType === 'agent-test'">
        <div class="flex flex-col gap-1">
          <label class="text-xs text-slate-400">Testing prompt <span class="text-slate-500">(passed to Claude as a testing task)</span></label>
          <textarea
            v-model="description"
            rows="4"
            class="text-sm bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-slate-200 font-mono focus:outline-none focus:border-slate-400 resize"
            placeholder="Test that the login flow works end-to-end…"
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

      <!-- Link type selector (only when adding a subtask) -->
      <div v-if="props.parentTask" class="flex flex-col gap-1">
        <label class="text-xs text-slate-400">Link type</label>
        <div class="flex gap-1">
          <button
            type="button"
            @click="linkType = 'follow-up'"
            class="text-xs px-2 py-1 rounded border transition-colors"
            :class="linkType === 'follow-up' ? 'border-purple-600 bg-purple-900/50 text-purple-300' : 'border-slate-600 bg-slate-700 text-slate-400 hover:bg-slate-600'"
          >↳ follow-up</button>
          <button
            type="button"
            @click="linkType = 'fix-required'"
            class="text-xs px-2 py-1 rounded border transition-colors"
            :class="linkType === 'fix-required' ? 'border-orange-600 bg-orange-900/50 text-orange-300' : 'border-slate-600 bg-slate-700 text-slate-400 hover:bg-slate-600'"
          >🔧 fix-required</button>
          <button
            type="button"
            @click="linkType = 'check'"
            class="text-xs px-2 py-1 rounded border transition-colors"
            :class="linkType === 'check' ? 'border-blue-600 bg-blue-900/50 text-blue-300' : 'border-slate-600 bg-slate-700 text-slate-400 hover:bg-slate-600'"
          >✓ check</button>
          <button
            type="button"
            @click="linkType = 'other'"
            class="text-xs px-2 py-1 rounded border transition-colors"
            :class="linkType === 'other' ? 'border-slate-500 bg-slate-600 text-slate-200' : 'border-slate-600 bg-slate-700 text-slate-400 hover:bg-slate-600'"
          >· other</button>
        </div>
      </div>

      <!-- Commit mode selector (for non-manual, non-make-plan task types) -->
      <div
        v-if="taskType !== 'manual-test' && taskType !== 'manual-task' && taskType !== 'make-plan'"
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

      <!-- Subtasks (only when not already adding a subtask and task is file-based) -->
      <div v-if="!props.parentTask && isFileBasedTask" class="flex flex-col gap-1.5">
        <div class="flex items-center justify-between">
          <label class="text-xs text-slate-400">Subtasks</label>
          <button
            type="button"
            @click="addSubtask"
            class="text-xs text-slate-500 hover:text-slate-300 px-1"
          >+ add</button>
        </div>
        <div v-if="pendingSubtasks.length === 0" class="text-xs text-slate-600 italic">None — use + add to attach follow-up or fix tasks</div>
        <div
          v-for="(sub, i) in pendingSubtasks"
          :key="i"
          class="flex items-center gap-1.5 bg-slate-900/40 border border-slate-700/50 rounded px-2 py-1"
        >
          <select
            v-model="sub.linkType"
            class="text-xs bg-slate-700 border border-slate-600 rounded px-1 py-0.5 shrink-0"
          >
            <option value="follow-up">↳ follow-up</option>
            <option value="fix-required">🔧 fix-required</option>
            <option value="check">✓ check</option>
            <option value="other">· other</option>
          </select>
          <select
            v-model="sub.type"
            class="text-xs bg-slate-700 border border-slate-600 rounded px-1 py-0.5 shrink-0"
          >
            <option v-for="t in SUBTASK_TYPES" :key="t" :value="t">{{ t }}</option>
          </select>
          <input
            v-if="isSubtaskFileBased(sub.type)"
            v-model="sub.filename"
            type="text"
            class="text-xs bg-slate-700 border border-slate-600 rounded px-1.5 py-0.5 font-mono w-32 shrink-0 focus:outline-none focus:border-slate-400"
            :placeholder="subtaskFilenamePlaceholder(sub.type)"
          />
          <input
            v-model="sub.description"
            type="text"
            class="flex-1 text-xs bg-slate-700 border border-slate-600 rounded px-1.5 py-0.5 focus:outline-none focus:border-slate-400 min-w-0"
            placeholder="description"
          />
          <button
            type="button"
            @click="pendingSubtasks.splice(i, 1)"
            class="text-xs text-slate-600 hover:text-red-400 shrink-0 px-0.5"
          >✕</button>
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
import { useContainers } from '../composables/useContainers'
import MarkdownContent from './MarkdownContent.vue'
import type { PlanqTask } from '../types'

const props = defineProps<{ containerId: string; allTasks?: PlanqTask[]; parentTask?: PlanqTask }>()

export interface SubtaskEntry {
  linkType: 'follow-up' | 'fix-required' | 'check' | 'other'
  type: string
  filename: string
  description: string
}

const emit = defineEmits<{
  close: []
  add: [taskType: string, filename: string | null, description: string | null, createFile: boolean, commitMode: 'none' | 'auto' | 'stage' | 'manual' | undefined, planDisposition?: 'manual' | 'add-after' | 'add-end', autoQueuePlan?: boolean, parentTaskId?: number, linkType?: 'follow-up' | 'fix-required' | 'check' | 'other', subtasks?: SubtaskEntry[]]
}>()

const { readFile, listPlansFiles } = usePlanq()
const { onConfirmKey } = useConfirmKey()
const { containers } = useContainers()

// Warn if this container is offline and a sibling (same host + workspace) is online
const offlineWarning = computed(() => {
  const self = containers.value.get(props.containerId)
  if (!self || self.connected) return null
  const sibling = [...containers.value.values()].find(c =>
    c.id !== self.id &&
    c.connected &&
    c.machine_hostname === self.machine_hostname &&
    c.workspace_host_path === self.workspace_host_path
  )
  if (!sibling) return null
  return `This container is offline. A newer instance (${sibling.id.slice(0, 8)}) is online for the same workspace. Tasks added here may not be scheduled.`
})

const SUBTASK_TYPES = ['task', 'investigate', 'auto-test', 'agent-test', 'manual-test', 'manual-task']

const taskType = ref('task')
const taskSlug = ref('')
const planSlug = ref('')
const makePlanSlug = ref('')
const investigateSlug = ref('')
const description = ref('')
const commitMode = ref<'none' | 'auto' | 'stage' | 'manual'>('none')
const planDisposition = ref<'manual' | 'add-after' | 'add-end'>('manual')
const autoQueuePlan = ref(false)
const linkType = ref<'follow-up' | 'fix-required' | 'check' | 'other'>('follow-up')

const pendingSubtasks = ref<SubtaskEntry[]>([])

const isFileBasedTask = computed(() =>
  ['task', 'plan', 'make-plan', 'investigate'].includes(taskType.value)
)

function isSubtaskFileBased(type: string): boolean {
  return ['task', 'investigate'].includes(type)
}

function subtaskFilenamePlaceholder(type: string): string {
  if (type === 'investigate') return 'investigate-*.md'
  return 'task-*.md'
}

function addSubtask() {
  pendingSubtasks.value.push({ linkType: 'follow-up', type: 'task', filename: '', description: '' })
}

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

// Plan combobox
const showPlanDropdown = ref(false)

interface PlanItem { slug: string; makePlanStatus: PlanqTask['status'] | null; makePlanPosition: number }

const sortedPlanItems = computed((): PlanItem[] => {
  const allTasks = props.allTasks ?? []
  // Build a map: plan slug → corresponding make-plan task (if exists in queue)
  const makePlanMap = new Map<string, PlanqTask>()
  for (const t of allTasks) {
    if (t.task_type === 'make-plan' && t.filename) {
      const derived = t.filename.replace(/^make-plan-/, 'plan-').replace(/\.md$/, '')
      // slug without prefix
      const slug = derived.replace(/^plan-/, '')
      if (!makePlanMap.has(slug)) makePlanMap.set(slug, t)
    }
  }
  // Separate slugs: those with a make-plan task, and others
  const withMakePlan: PlanItem[] = []
  const standalone: PlanItem[] = []
  for (const slug of planSlugs.value) {
    const mp = makePlanMap.get(slug)
    if (mp) {
      withMakePlan.push({ slug, makePlanStatus: mp.status, makePlanPosition: mp.position })
    } else {
      standalone.push({ slug, makePlanStatus: null, makePlanPosition: Infinity })
    }
  }
  withMakePlan.sort((a, b) => a.makePlanPosition - b.makePlanPosition)
  standalone.sort((a, b) => a.slug.localeCompare(b.slug))
  return [...withMakePlan, ...standalone]
})

const filteredPlanItems = computed((): PlanItem[] => {
  const q = planSlug.value.toLowerCase()
  if (!q) return sortedPlanItems.value
  return sortedPlanItems.value.filter(i => i.slug.toLowerCase().includes(q))
})

function selectPlanSlug(slug: string) {
  planSlug.value = slug
  showPlanDropdown.value = false
  onPlanSlugInput()
}

function onPlanInputBlur() {
  // Small delay so mousedown on dropdown item fires first
  setTimeout(() => { showPlanDropdown.value = false }, 120)
}

function makePlanStatusLabel(status: PlanqTask['status']): string {
  switch (status) {
    case 'done': return 'done'
    case 'underway': return 'running'
    case 'auto-queue': return '⏱'
    case 'awaiting-plan': return 'awaiting'
    default: return status
  }
}

function makePlanStatusClass(status: PlanqTask['status']): string {
  switch (status) {
    case 'done': return 'text-green-400'
    case 'underway': return 'text-blue-400'
    case 'pending': return 'text-slate-400'
    case 'auto-queue': return 'text-amber-400'
    default: return 'text-slate-500'
  }
}

const taskFilename = computed(() => taskSlug.value ? `task-${taskSlug.value}.md` : null)
const planFilename = computed(() => planSlug.value ? `plan-${planSlug.value}.md` : null)
const makePlanFilename = computed(() => makePlanSlug.value ? `make-plan-${makePlanSlug.value}.md` : null)
const investigateFilename = computed(() => investigateSlug.value ? `investigate-${investigateSlug.value}.md` : null)

const isExistingTaskFile = computed(() => !!taskFilename.value && plansFiles.value.includes(taskFilename.value))
const isExistingPlanFile = computed(() => !!planFilename.value && plansFiles.value.includes(planFilename.value))

onMounted(async () => {
  plansFiles.value = await listPlansFiles(props.containerId)
})

// Reset slug/preview when task type changes; preserve description and carry slug across file-based types.
watch(taskType, (newType, oldType) => {
  const slugTypes = ['task', 'plan', 'make-plan', 'investigate']
  let preserved = ''
  if (slugTypes.includes(oldType)) {
    preserved = oldType === 'task' ? taskSlug.value
              : oldType === 'plan' ? planSlug.value
              : oldType === 'make-plan' ? makePlanSlug.value
              : investigateSlug.value
  }
  taskSlug.value = ''
  planSlug.value = ''
  makePlanSlug.value = ''
  investigateSlug.value = ''
  filePreview.value = null
  if (preserved && slugTypes.includes(newType)) {
    if (newType === 'task') taskSlug.value = preserved
    else if (newType === 'plan') planSlug.value = preserved
    else if (newType === 'make-plan') makePlanSlug.value = preserved
    else investigateSlug.value = preserved
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
  if (taskType.value === 'investigate') {
    return !!investigateFilename.value && description.value.trim().length > 0
  }
  if (taskType.value === 'auto-commit') return true  // options are optional
  if (taskType.value === 'auto-test') return description.value.trim().length > 0
  if (taskType.value === 'agent-test') return description.value.trim().length > 0
  return description.value.trim().length > 0
})

function submit() {
  if (!isValid.value) return

  const cm = commitMode.value
  const parentTaskId = props.parentTask?.id
  const lt = props.parentTask ? linkType.value : undefined
  const subs = pendingSubtasks.value.length > 0 ? [...pendingSubtasks.value] : undefined

  if (taskType.value === 'task') {
    if (taskFilename.value) {
      const createFile = !isExistingTaskFile.value
      emit('add', 'task', taskFilename.value, description.value.trim(), createFile, cm, undefined, undefined, parentTaskId, lt, subs)
    } else {
      const unnamedDesc = description.value.trim().split('\n').map(l => l.trim()).filter(Boolean).join('. ')
      emit('add', 'unnamed-task', null, unnamedDesc, false, cm, undefined, undefined, parentTaskId, lt, subs)
    }
  } else if (taskType.value === 'plan') {
    emit('add', 'plan', planFilename.value, null, false, cm, undefined, undefined, parentTaskId, lt, subs)
  } else if (taskType.value === 'make-plan') {
    emit('add', 'make-plan', makePlanFilename.value, description.value.trim(), false, undefined, planDisposition.value, planDisposition.value !== 'manual' ? autoQueuePlan.value : undefined, parentTaskId, lt, subs)
  } else if (taskType.value === 'investigate') {
    emit('add', 'investigate', investigateFilename.value, description.value.trim(), false, cm, undefined, undefined, parentTaskId, lt, subs)
  } else if (taskType.value === 'auto-test') {
    emit('add', 'auto-test', null, description.value.trim(), false, cm, undefined, undefined, parentTaskId, lt, subs)
  } else if (taskType.value === 'agent-test') {
    emit('add', 'agent-test', null, description.value.trim(), false, cm, undefined, undefined, parentTaskId, lt, subs)
  } else {
    emit('add', taskType.value, null, description.value.trim(), false, cm, undefined, undefined, parentTaskId, lt, subs)
  }
  emit('close')
}
</script>
