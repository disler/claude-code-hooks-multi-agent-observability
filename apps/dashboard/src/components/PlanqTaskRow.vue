<template>
  <div class="flex flex-col">
  <div
    class="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-slate-700/50 group"
    :class="{ 'opacity-50': task.status === 'done', 'opacity-40 grayscale': task.status === 'deferred', 'bg-yellow-900/20': task.status === 'underway', 'bg-cyan-900/20': task.status === 'auto-queue', 'bg-purple-900/20': task.status === 'awaiting-commit', 'bg-teal-900/20': task.status === 'awaiting-plan' }"
    draggable="true"
    @dragstart="emit('dragstart', task.id)"
    @dragenter.prevent
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
        v-if="task.filename"
        @click.stop="toggleDescPopup"
        class="hover:text-slate-100 hover:underline cursor-pointer truncate min-w-0"
        :title="isOpen(task.id) ? 'Hide description' : 'Show description'"
      >{{ task.filename }}</button>
      <span v-else class="truncate min-w-0">{{ task.description }}</span>
      <!-- Feedback toggle: immediately after filename for investigate tasks -->
      <button
        v-if="task.task_type === 'investigate' && derivedFeedbackFilename !== null"
        @click.stop="toggleFeedbackOpen"
        class="shrink-0 text-xs px-1"
        :class="isFeedbackOpen(task.id) ? 'text-indigo-300 hover:text-indigo-200' : 'text-slate-500 hover:text-slate-300'"
        title="Show investigation feedback"
      >{{ isFeedbackOpen(task.id) ? 'hide feedback' : 'feedback' }}</button>
      <span v-if="task.commit_mode === 'auto' || task.auto_commit" class="shrink-0 text-green-500" title="Auto-commit after">⇒</span>
      <span v-else-if="task.commit_mode === 'stage'" class="shrink-0 text-blue-400" title="Stage-commit after (Claude stages, you commit)">⇒</span>
      <span v-else-if="task.commit_mode === 'manual'" class="shrink-0 text-orange-400" title="Manual-commit after (you stage and commit)">⇒</span>
      <template v-if="task.task_type === 'make-plan'">
        <span v-if="task.plan_disposition === 'add-after'" class="shrink-0 text-teal-400" :title="task.auto_queue_plan ? 'Plan will be added after this task (auto-queued)' : 'Plan will be added after this task'">📋⇒{{ task.auto_queue_plan ? '⏱' : '' }}</span>
        <span v-else-if="task.plan_disposition === 'add-end'" class="shrink-0 text-cyan-400" :title="task.auto_queue_plan ? 'Plan will be added to end of queue (auto-queued)' : 'Plan will be added to end of queue'">📋↓{{ task.auto_queue_plan ? '⏱' : '' }}</span>
      </template>
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
    v-if="isOpen(task.id)"
    class="mx-2 mb-1 rounded border border-slate-700 bg-slate-900 p-2"
  >
    <div v-if="loadingDesc" class="text-xs text-slate-500">Loading…</div>
    <MarkdownContent v-else-if="getCached(task.id)" :content="getCached(task.id)!" />
    <div v-else class="text-xs text-slate-500 italic">No description available.</div>
  </div>

  <!-- Investigate feedback panel -->
  <div
    v-if="isFeedbackOpen(task.id) && task.task_type === 'investigate' && derivedFeedbackFilename !== null"
    class="mx-2 mb-1 rounded border border-indigo-800/50 bg-indigo-950/30 p-2"
  >
    <div v-if="loadingFeedback" class="text-xs text-slate-500">Loading…</div>
    <MarkdownContent v-else-if="getFeedbackCached(task.id)" :content="getFeedbackCached(task.id)!" />
    <div v-else class="text-xs text-slate-500 italic">No feedback file found yet (plans/{{ derivedFeedbackFilename }}).</div>
  </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, computed } from 'vue'
import { usePlanq } from '../composables/usePlanq'
import { useExpandedTasks } from '../composables/useExpandedTasks'
import type { PlanqTask } from '../types'
import MarkdownContent from './MarkdownContent.vue'

const props = defineProps<{
  task: PlanqTask
  position: number
  containerId: string
  allTasks?: PlanqTask[]
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
}>()

const { readFile } = usePlanq()
const { isOpen, toggle, getCached, setCached, isFeedbackOpen, toggleFeedback, getFeedbackCached, setFeedbackCached } = useExpandedTasks()

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

// ── Investigate feedback ──────────────────────────────────────────────────────

const loadingFeedback = ref(false)

const derivedFeedbackFilename = computed(() => {
  if (props.task.task_type !== 'investigate' || !props.task.filename) return null
  return props.task.filename.replace(/^investigate-/, 'feedback-')
})

async function toggleFeedbackOpen() {
  toggleFeedback(props.task.id)
  if (isFeedbackOpen(props.task.id) && getFeedbackCached(props.task.id) === undefined) {
    loadingFeedback.value = true
    setFeedbackCached(props.task.id, await readFile(props.containerId, derivedFeedbackFilename.value!) ?? null)
    loadingFeedback.value = false
  }
}

// ── Description popup ─────────────────────────────────────────────────────────

const loadingDesc = ref(false)

async function toggleDescPopup() {
  toggle(props.task.id)
  if (!isOpen(props.task.id) || getCached(props.task.id) !== undefined) return

  if (props.task.description) {
    setCached(props.task.id, props.task.description)
    return
  }
  if (props.task.filename) {
    loadingDesc.value = true
    setCached(props.task.id, await readFile(props.containerId, props.task.filename))
    loadingDesc.value = false
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
