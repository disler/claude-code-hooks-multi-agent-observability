<template>
  <div class="flex flex-col" :class="isChild ? 'pl-5 border-l border-slate-700/60 ml-1' : ''">
  <div
    class="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-slate-700/50 group"
    :class="{ 'opacity-50': task.status === 'done', 'opacity-40 grayscale': task.status === 'deferred' || dimmed, 'bg-yellow-900/20': task.status === 'underway', 'bg-cyan-900/20': task.status === 'auto-queue', 'bg-purple-900/20': task.status === 'awaiting-commit', 'bg-teal-900/20': task.status === 'awaiting-plan' }"
    :draggable="!isChild"
    @dragstart="!isChild && emit('dragstart', task.id)"
    @dragenter.prevent
    @dragover.prevent
    @drop="emit('drop', task.id)"
  >
    <!-- Drag handle (hidden for child tasks) / link type badge -->
    <span v-if="!isChild" class="text-slate-600 cursor-grab text-xs select-none">⠿</span>
    <span v-else-if="linkType === 'fix-required'" class="text-red-500 text-xs shrink-0" title="fix-required">🔧</span>
    <span v-else-if="linkType === 'check'" class="text-blue-400 text-xs shrink-0" title="check">✓</span>
    <span v-else-if="linkType === 'other'" class="text-slate-400 text-xs shrink-0" title="other">·</span>
    <span v-else class="text-purple-400 text-xs shrink-0" title="follow-up">↳</span>

    <!-- Position -->
    <span class="text-xs text-slate-500 w-4 text-right shrink-0">{{ position }}</span>

    <!-- Status indicator -->
    <span v-if="task.status === 'done'" class="text-green-500 text-xs">✅</span>
    <span v-else-if="task.status === 'underway'" class="text-yellow-400 text-xs">⏳</span>
    <span v-else-if="task.status === 'auto-queue'" class="text-cyan-400 text-xs">⏱</span>
    <span v-else-if="task.status === 'awaiting-commit'" class="text-purple-400 text-xs">💾</span>
    <span v-else-if="task.status === 'awaiting-plan'" class="text-teal-400 text-xs">📋</span>
    <span v-else-if="task.status === 'deferred'" class="text-slate-500 text-xs">💤</span>
    <span v-else class="text-slate-600 text-xs">▶</span>

    <!-- Type badge -->
    <span class="text-xs px-1 py-0.5 rounded font-mono shrink-0" :class="typeBadgeClass">{{ task.task_type }}</span>

    <!-- Value: filename is clickable to show description popup -->
    <div v-if="!editingDesc" class="flex items-center gap-1 text-xs text-slate-300 flex-1 min-w-0 font-mono">
      <button
        v-if="effectiveFilename"
        @click.stop="toggleDescPopup"
        class="hover:text-slate-100 hover:underline cursor-pointer truncate min-w-0"
        :title="isOpen(taskKey) ? 'Hide description' : 'Show description'"
      >{{ effectiveFilename }}</button>
      <span v-else class="truncate min-w-0">{{ task.description }}</span>
      <!-- Feedback toggle: immediately after filename for investigate tasks -->
      <button
        v-if="task.task_type === 'investigate' && derivedFeedbackFilename"
        @click.stop="toggleFeedbackOpen"
        class="shrink-0 text-xs px-1"
        :class="isFeedbackOpen(taskKey) ? 'text-indigo-300 hover:text-indigo-200' : 'text-slate-500 hover:text-slate-300'"
        title="Show investigation feedback"
      >{{ isFeedbackOpen(taskKey) ? 'hide feedback' : 'feedback' }}</button>
      <span v-if="task.commit_mode === 'auto' || task.auto_commit" class="shrink-0 text-green-500" title="Auto-commit after">⇒</span>
      <span v-else-if="task.commit_mode === 'stage'" class="shrink-0 text-blue-400" title="Stage-commit after (Claude stages, you commit)">⇒</span>
      <span v-else-if="task.commit_mode === 'manual'" class="shrink-0 text-orange-400" title="Manual-commit after (you stage and commit)">⇒</span>
      <template v-if="task.task_type === 'make-plan'">
        <span v-if="task.plan_disposition === 'add-after'" class="shrink-0 text-teal-400" :title="task.auto_queue_plan ? 'Plan will be added after this task (auto-queued)' : 'Plan will be added after this task'">📋⇒{{ task.auto_queue_plan ? '⏱' : '' }}</span>
        <span v-else-if="task.plan_disposition === 'add-end'" class="shrink-0 text-cyan-400" :title="task.auto_queue_plan ? 'Plan will be added to end of queue (auto-queued)' : 'Plan will be added to end of queue'">📋↓{{ task.auto_queue_plan ? '⏱' : '' }}</span>
      </template>
      <!-- Session link badge — visible when task has associated sessions -->
      <button
        v-if="task.session_ids?.length"
        @click.stop="emit('open-session', task.session_ids[task.session_ids.length - 1])"
        class="shrink-0 text-xs px-0.5 leading-none text-indigo-400 hover:text-indigo-200"
        :title="`${task.session_ids.length} linked session${task.session_ids.length === 1 ? '' : 's'} — click to view`"
      >💬</button>

      <!-- Review status badge — always visible for done tasks, hover-only otherwise -->
      <div class="shrink-0">
        <button
          ref="reviewBtnRef"
          @click="toggleReviewDropdown"
          class="text-xs px-0.5 leading-none"
          :class="reviewStatus !== 'none'
            ? reviewDef.color
            : task.status === 'done'
              ? 'text-slate-500 hover:text-slate-300'
              : 'text-slate-700 hover:text-slate-500 opacity-0 group-hover:opacity-100'"
          :title="reviewStatus !== 'none' ? `Review: ${reviewDef.label} — click to change` : 'Set review status'"
        >{{ reviewDef.icon }}</button>
        <Teleport to="body">
        <div
          v-if="showReviewDropdown"
          :style="reviewDropdownStyle"
          class="fixed z-[9999] bg-slate-800 border border-slate-600 rounded shadow-lg py-0.5 min-w-max"
          @click.stop
        >
          <button
            v-for="opt in REVIEW_STATUS_DEFS"
            :key="opt.status"
            @click="selectReviewStatus(opt.status, $event)"
            class="flex items-center gap-1.5 w-full text-left px-2 py-0.5 text-xs hover:bg-slate-700"
            :class="[opt.color, opt.status === reviewStatus ? 'bg-slate-700/50 font-semibold' : '']"
          >
            <span>{{ opt.icon }}</span>
            <span>{{ opt.label }}</span>
          </button>
        </div>
        </Teleport>
      </div>
    </div>
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

      <!-- Cycle commit mode (none → auto → stage → manual → none) -->
      <button
        v-if="task.task_type !== 'auto-commit' && task.task_type !== 'manual-commit' && task.task_type !== 'manual-test' && task.task_type !== 'manual-task' && task.status !== 'awaiting-commit'"
        @click="emit('set-commit-mode', task, nextCommitMode(task.commit_mode))"
        class="text-xs px-1 font-mono"
        :class="commitModeButtonClass"
        :title="commitModeButtonTitle"
      >⇒</button>

      <!-- Toggle auto-queue -->
      <button
        v-if="task.status === 'pending' || task.status === 'auto-queue' || task.status === 'awaiting-commit'"
        @click="emit('set-status', task, task.status === 'auto-queue' ? 'pending' : 'auto-queue')"
        class="text-xs px-1"
        :class="task.status === 'auto-queue' ? 'grayscale opacity-50' : ''"
        :title="task.status === 'auto-queue' ? 'Remove from auto-queue' : 'Add to auto-queue'"
      >⏱</button>

      <!-- Mark underway / un-underway (also from awaiting-commit/awaiting-plan to abort the wait) -->
      <button
        v-if="task.status === 'pending' || task.status === 'underway' || task.status === 'awaiting-commit' || task.status === 'awaiting-plan'"
        @click="emit('set-status', task, task.status === 'underway' ? 'pending' : 'underway')"
        class="text-xs px-1"
        :class="task.status === 'underway' ? 'text-slate-500 hover:text-slate-300' : 'text-yellow-500 hover:text-yellow-300'"
        :title="task.status === 'awaiting-commit' ? 'Abort commit wait (mark underway)' : task.status === 'awaiting-plan' ? 'Abort plan wait (mark underway)' : task.status === 'underway' ? 'Mark inactive' : 'Mark underway'"
      >⏳</button>

      <!-- Toggle deferred -->
      <button
        v-if="task.status === 'pending' || task.status === 'deferred'"
        @click="emit('set-status', task, task.status === 'deferred' ? 'pending' : 'deferred')"
        class="text-xs px-1"
        :class="task.status === 'deferred' ? 'text-slate-300 hover:text-slate-100' : 'text-slate-500 hover:text-slate-300'"
        :title="task.status === 'deferred' ? 'Un-defer (mark pending)' : 'Defer (skip for now)'"
      >💤</button>

      <!-- Mark done / pending -->
      <button
        @click="emit('set-status', task, task.status === 'done' ? 'pending' : 'done')"
        class="text-xs px-1"
        :class="task.status === 'done' ? 'text-slate-400 hover:text-slate-200' : 'text-green-500 hover:text-green-300'"
        :title="task.status === 'done' ? 'Mark pending' : 'Mark done'"
      >{{ task.status === 'done' ? '↩' : '✓' }}</button>

      <!-- Add Plan (done make-plan when plan file exists) -->
      <button
        v-if="showAddPlan"
        @click="emit('add-plan', derivedPlanFilename!)"
        class="text-xs text-purple-400 hover:text-purple-200 px-1"
        :title="`Add ${derivedPlanFilename} to task list`"
      >+ plan</button>

      <!-- Archive (done tasks only) -->
      <button
        v-if="task.status === 'done'"
        @click="emit('archive', task.id)"
        class="text-xs px-1 text-slate-400 hover:text-slate-200"
        title="Archive this task"
      >🗄️</button>

      <!-- Add subtask -->
      <button
        v-if="!isChild && effectiveFilename"
        @click.stop="emit('add-subtask', task)"
        class="text-xs px-1 text-slate-500 hover:text-slate-300"
        title="Add a follow-up or fix-required subtask"
      >⊕</button>

      <!-- Delete -->
      <button
        @click="emit('delete', task.id)"
        class="text-xs text-red-500 hover:text-red-300 px-1"
        title="Delete"
      >✕</button>
    </div>
  </div>

  <!-- Description popup (shown when filename is clicked) -->
  <div
    v-if="isOpen(taskKey)"
    class="mx-2 mb-1 rounded border border-slate-700 bg-slate-900 p-2"
  >
    <div class="flex items-center gap-1.5 text-xs text-slate-500 mb-1.5 pb-1 border-b border-slate-700/60">
      <span v-if="containerInfo?.machine_hostname" class="font-mono">{{ containerInfo.machine_hostname }}</span>
      <span v-if="containerInfo?.machine_hostname && containerInfo?.container_hostname" class="text-slate-700">·</span>
      <span v-if="containerInfo?.container_hostname" class="font-mono">{{ containerInfo.container_hostname }}</span>
      <span v-if="containerInfo" class="text-slate-700">·</span>
      <span class="font-mono text-slate-400">{{ task.task_type }}{{ task.filename ? ': ' + task.filename : '' }}</span>
    </div>
    <div v-if="loadingDesc" class="text-xs text-slate-500">Loading…</div>
    <MarkdownContent v-else-if="getCached(taskKey)" :content="getCached(taskKey)!" />
    <div v-else class="text-xs text-slate-500 italic">No description available.</div>
  </div>

  <!-- Investigate feedback panel -->
  <div
    v-if="isFeedbackOpen(taskKey) && task.task_type === 'investigate' && derivedFeedbackFilename"
    class="mx-2 mb-1 rounded border border-indigo-800/50 bg-indigo-950/30 p-2"
  >
    <div class="flex items-center gap-1.5 text-xs text-slate-500 mb-1.5 pb-1 border-b border-indigo-800/40">
      <span v-if="containerInfo?.machine_hostname" class="font-mono">{{ containerInfo.machine_hostname }}</span>
      <span v-if="containerInfo?.machine_hostname && containerInfo?.container_hostname" class="text-slate-700">·</span>
      <span v-if="containerInfo?.container_hostname" class="font-mono">{{ containerInfo.container_hostname }}</span>
      <span v-if="containerInfo" class="text-slate-700">·</span>
      <span class="font-mono text-slate-400">{{ task.task_type }}: {{ task.filename }} (feedback)</span>
    </div>
    <div v-if="loadingFeedback" class="text-xs text-slate-500">Loading…</div>
    <MarkdownContent v-else-if="getFeedbackCached(taskKey)" :content="getFeedbackCached(taskKey)!" />
    <div v-else class="text-xs text-slate-500 italic">No feedback file found yet (plans/{{ derivedFeedbackFilename }}).</div>
  </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, computed, onMounted, onBeforeUnmount } from 'vue'
import { usePlanq } from '../composables/usePlanq'
import { useExpandedTasks, taskStableKey } from '../composables/useExpandedTasks'
import { useContainers } from '../composables/useContainers'
import type { PlanqTask, ReviewStatus } from '../types'
import MarkdownContent from './MarkdownContent.vue'

const props = defineProps<{
  task: PlanqTask
  position: number | string
  containerId: string
  allTasks?: PlanqTask[]
  isChild?: boolean
  linkType?: 'follow-up' | 'fix-required' | 'check' | 'other' | null
  dimmed?: boolean
}>()

const emit = defineEmits<{
  'edit-file': [task: PlanqTask]
  'set-status': [task: PlanqTask, status: 'pending' | 'done' | 'underway' | 'auto-queue' | 'awaiting-commit' | 'awaiting-plan' | 'deferred']
  'delete': [id: number]
  'update-desc': [id: number, desc: string]
  'set-commit-mode': [task: PlanqTask, mode: 'none' | 'auto' | 'stage' | 'manual']
  'dragstart': [id: number]
  'drop': [id: number]
  'add-plan': [planFilename: string]
  'archive': [id: number]
  'set-review-status': [task: PlanqTask, status: ReviewStatus]
  'add-subtask': [task: PlanqTask]
  'open-session': [sessionId: string]
}>()

const { readFile } = usePlanq()
const { isOpen, toggle, getCached, setCached, isFeedbackOpen, toggleFeedback, getFeedbackCached, setFeedbackCached } = useExpandedTasks()
const { containers } = useContainers()
// Stable key for this task — survives heartbeat ID reassignment
const taskKey = computed(() => taskStableKey(props.task))
const containerInfo = computed(() => containers.value.get(props.containerId))

const editingDesc = ref(false)
const editDesc = ref('')
const editInput = ref<HTMLInputElement | null>(null)

// For done make-plan tasks: derive the target plan filename and check if it exists
const derivedPlanFilename = computed(() => {
  if (props.task.task_type !== 'make-plan' || !props.task.filename) return null
  return props.task.filename.replace(/^make-plan-/, 'plan-')
})

const showAddPlan = computed(() =>
  props.task.task_type === 'make-plan'
  && props.task.status === 'done'
  && !!derivedPlanFilename.value
  && !(props.allTasks ?? []).some(t => t.task_type === 'plan' && t.filename === derivedPlanFilename.value)
)

function nextCommitMode(current: PlanqTask['commit_mode']): PlanqTask['commit_mode'] {
  const cycle: PlanqTask['commit_mode'][] = ['none', 'auto', 'stage', 'manual']
  return cycle[(cycle.indexOf(current) + 1) % cycle.length]
}

const commitModeButtonClass = computed(() => {
  const mode = props.task.commit_mode ?? (props.task.auto_commit ? 'auto' : 'none')
  if (mode === 'auto') return 'text-green-400'
  if (mode === 'stage') return 'text-blue-400'
  if (mode === 'manual') return 'text-orange-400'
  return 'text-slate-500'
})

const commitModeButtonTitle = computed(() => {
  const mode = props.task.commit_mode ?? (props.task.auto_commit ? 'auto' : 'none')
  if (mode === 'auto') return 'Auto-commit after (click: → stage-commit)'
  if (mode === 'stage') return 'Stage-commit after (Claude stages, you commit) (click: → manual-commit)'
  if (mode === 'manual') return 'Manual-commit after (you stage and commit) (click: → none)'
  return 'No commit after (click: → auto-commit)'
})

const typeBadgeClass = computed(() => ({
  'task': 'bg-blue-900/60 text-blue-300',
  'plan': 'bg-purple-900/60 text-purple-300',
  'make-plan': 'bg-teal-900/60 text-teal-300',
  'investigate': 'bg-indigo-900/60 text-indigo-300',
  'auto-test': 'bg-yellow-900/60 text-yellow-300',
  'auto-commit': 'bg-green-900/60 text-green-300',
  'manual-test': 'bg-yellow-900/40 text-yellow-400',
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

// ── Effective filename (falls back to description for file-based task types) ──

// Some tasks were created without a filename in the DB (description = the filename).
// Derive an effective filename so the click-to-view and feedback logic work.
const effectiveFilename = computed(() => {
  if (props.task.filename) return props.task.filename
  const d = props.task.description
  if (d && /^\S+\.md$/.test(d) && ['investigate', 'task', 'plan', 'make-plan'].includes(props.task.task_type)) {
    return d
  }
  return null
})

// ── Investigate feedback ──────────────────────────────────────────────────────

const loadingFeedback = ref(false)

const derivedFeedbackFilename = computed(() => {
  if (props.task.task_type !== 'investigate') return null
  return effectiveFilename.value?.replace(/^investigate-/, 'feedback-') ?? null
})

async function toggleFeedbackOpen() {
  toggleFeedback(taskKey.value)
  if (isFeedbackOpen(taskKey.value) && getFeedbackCached(taskKey.value) === undefined) {
    loadingFeedback.value = true
    setFeedbackCached(taskKey.value, await readFile(props.containerId, derivedFeedbackFilename.value!) ?? null)
    loadingFeedback.value = false
  }
}

// ── Review status ─────────────────────────────────────────────────────────────

const REVIEW_STATUS_DEFS: Array<{ status: ReviewStatus; icon: string; label: string; color: string }> = [
  { status: 'none',             icon: '○',  label: 'None',           color: 'text-slate-500 hover:text-slate-300' },
  { status: 'ready',            icon: '🔵', label: 'Ready',          color: 'text-blue-400 hover:text-blue-200' },
  { status: 'testing',          icon: '🧪', label: 'Testing',        color: 'text-yellow-400 hover:text-yellow-200' },
  { status: 'passed',           icon: '🟢', label: 'Passed',         color: 'text-green-400 hover:text-green-200' },
  { status: 'has-issues',       icon: '🔴', label: 'Has Issues',     color: 'text-red-400 hover:text-red-200' },
  { status: 'fix-scheduled',    icon: '🔧', label: 'Fix Scheduled',  color: 'text-orange-400 hover:text-orange-200' },
  { status: 'follow-up',        icon: '🔄', label: 'Follow-up',      color: 'text-purple-400 hover:text-purple-200' },
  { status: 'revert-scheduled', icon: '⏪', label: 'Revert Sched.',  color: 'text-red-500 hover:text-red-300' },
  { status: 'ready-for-merge',  icon: '🚀', label: 'Ready to Merge', color: 'text-teal-400 hover:text-teal-200' },
  { status: 'merged',           icon: '🏁', label: 'Merged',         color: 'text-green-500 hover:text-green-300' },
  { status: 'cancelled',        icon: '🚫', label: 'Cancelled',      color: 'text-slate-400 hover:text-slate-200' },
  { status: 'retry-later',      icon: '⏸️',  label: 'Retry Later',   color: 'text-yellow-500 hover:text-yellow-300' },
]

const reviewStatus = computed(() => props.task.review_status ?? 'none')
const reviewDef = computed(() => REVIEW_STATUS_DEFS.find(d => d.status === reviewStatus.value) ?? REVIEW_STATUS_DEFS[0])
const showReviewDropdown = ref(false)
const reviewBtnRef = ref<HTMLButtonElement | null>(null)
const reviewDropdownStyle = ref<Record<string, string>>({})

function toggleReviewDropdown(e: Event) {
  e.stopPropagation()
  if (!showReviewDropdown.value && reviewBtnRef.value) {
    const rect = reviewBtnRef.value.getBoundingClientRect()
    reviewDropdownStyle.value = {
      top: `${rect.bottom + 2}px`,
      left: `${rect.left}px`,
    }
  }
  showReviewDropdown.value = !showReviewDropdown.value
}

function selectReviewStatus(status: ReviewStatus, e: Event) {
  e.stopPropagation()
  showReviewDropdown.value = false
  emit('set-review-status', props.task, status)
}

function closeReviewDropdown() {
  showReviewDropdown.value = false
}

onMounted(() => {
  document.addEventListener('click', closeReviewDropdown)
  document.addEventListener('scroll', closeReviewDropdown, true)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', closeReviewDropdown)
  document.removeEventListener('scroll', closeReviewDropdown, true)
})

// ── Description popup ─────────────────────────────────────────────────────────

const loadingDesc = ref(false)

async function toggleDescPopup() {
  toggle(taskKey.value)
  if (!isOpen(taskKey.value) || getCached(taskKey.value) !== undefined) return

  if (effectiveFilename.value) {
    loadingDesc.value = true
    setCached(taskKey.value, await readFile(props.containerId, effectiveFilename.value))
    loadingDesc.value = false
  } else if (props.task.description) {
    setCached(taskKey.value, props.task.description)
  }
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
    // task: use stored description if available, otherwise fetch file
    if (props.task.description) {
      text = props.task.description
    } else {
      copying.value = true
      text = await readFile(props.containerId, props.task.filename) ?? ''
      copying.value = false
    }
  } else if (props.task.task_type === 'make-plan') {
    // make-plan: filename IS the prompt file (make-plan-*.md); derive target plan filename
    copying.value = true
    const prompt = await readFile(props.containerId, props.task.filename)
    copying.value = false
    const targetPlan = props.task.filename!.replace(/^make-plan-/, 'plan-')
    text = prompt ? `${prompt.trim()} Write the plan to plans/${targetPlan}.` : ''
  } else {
    text = props.task.filename ?? props.task.description ?? ''
  }

  if (!text) return

  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text)
    } else {
      // Fallback for non-secure contexts (plain HTTP)
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0'
      document.body.appendChild(ta)
      ta.focus()
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    copied.value = true
    setTimeout(() => { copied.value = false }, 1500)
  } catch {}
}
</script>
