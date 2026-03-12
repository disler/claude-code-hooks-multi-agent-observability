<template>
  <div class="p-4 overflow-x-auto">
    <div class="flex gap-3 min-w-max">
      <div v-for="col in columns" :key="col.state" class="w-52 flex-none">
        <div class="text-xs font-semibold mb-2 px-1" :class="col.headerClass">
          {{ col.label }}
          <span class="text-slate-500 font-normal ml-1">({{ cardsFor(col.state).length }})</span>
        </div>
        <div class="space-y-2">
          <div
            v-for="c in cardsFor(col.state)"
            :key="c.id"
            class="rounded border border-slate-700 bg-slate-800/60 p-2 text-xs cursor-default"
          >
            <div class="font-mono font-semibold text-slate-100 truncate" :title="c.source_repo">{{ projectName(c) }}</div>
            <div class="text-slate-400 truncate">{{ c.machine_hostname }}</div>
            <div v-if="c.git_branch" class="text-blue-400 font-mono truncate">{{ c.git_branch }}</div>
            <div class="flex gap-2 mt-1 text-slate-500">
              <span v-if="c.git_staged_count" class="text-yellow-500">±{{ c.git_staged_count }}</span>
              <span v-if="c.git_unstaged_count" class="text-orange-500">~{{ c.git_unstaged_count }}</span>
              <span v-if="!c.git_staged_count && !c.git_unstaged_count">Clean</span>
            </div>
            <div class="mt-1 text-slate-500">
              {{ doneTasks(c) }}✓ {{ pendingTasks(c) }}⏳
              <span v-if="failedTests(c) > 0" class="text-red-400 ml-1">{{ failedTests(c) }} test fail</span>
              <span v-if="passedTests(c) > 0 && failedTests(c) === 0" class="text-green-400 ml-1">{{ passedTests(c) }} test pass</span>
            </div>
            <div class="flex gap-1 mt-1.5 flex-wrap">
              <button
                v-if="c.source_repo"
                class="text-slate-400 hover:text-blue-300 text-xs px-1 py-0.5 rounded bg-slate-700/60 hover:bg-slate-600/60"
                @click="$emit('open-git-view', c.source_repo)"
              >Git ↗</button>
              <select
                class="text-xs bg-slate-700/60 border border-slate-600/50 rounded text-slate-300 px-0.5 cursor-pointer"
                :value="reviewStateOf(c)"
                @change="setReviewState(c.id, ($event.target as HTMLSelectElement).value)"
              >
                <option v-for="s in allStates" :key="s" :value="s">{{ s }}</option>
              </select>
            </div>
          </div>
          <div v-if="cardsFor(col.state).length === 0" class="text-xs text-slate-700 px-1">—</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useContainers } from '../composables/useContainers'
import type { ContainerWithState } from '../types'

defineEmits<{ 'open-git-view': [repo: string] }>()

const { containers } = useContainers()

const columns = [
  { state: 'developing', label: 'Developing', headerClass: 'text-slate-300' },
  { state: 'ready-for-review', label: 'Ready for Review', headerClass: 'text-yellow-400' },
  { state: 'in-review', label: 'In Review', headerClass: 'text-blue-400' },
  { state: 'approved', label: 'Approved', headerClass: 'text-green-400' },
  { state: 'merged', label: 'Merged', headerClass: 'text-slate-500' },
]

const allStates = columns.map(c => c.state)

function reviewStateOf(c: ContainerWithState): string {
  if (!c.review_state) return 'developing'
  try {
    const parsed = JSON.parse(c.review_state)
    return parsed.state ?? 'developing'
  } catch { return c.review_state ?? 'developing' }
}

function cardsFor(state: string): ContainerWithState[] {
  return [...containers.value.values()].filter(c => reviewStateOf(c) === state)
}

function projectName(c: ContainerWithState): string {
  return c.source_repo?.split('/').pop() ?? c.id.slice(0, 12)
}

function doneTasks(c: ContainerWithState): number {
  return (c.planq_tasks ?? []).filter(t => t.status === 'done').length
}

function pendingTasks(c: ContainerWithState): number {
  return (c.planq_tasks ?? []).filter(t => t.status !== 'done').length
}

function parseTestResults(c: ContainerWithState): Array<{ result: string }> {
  if (!c.test_results) return []
  try { return JSON.parse(c.test_results) } catch { return [] }
}

function passedTests(c: ContainerWithState): number {
  return parseTestResults(c).filter(t => t.result === 'passed').length
}

function failedTests(c: ContainerWithState): number {
  return parseTestResults(c).filter(t => t.result === 'failed').length
}

async function setReviewState(containerId: string, state: string) {
  await fetch('/dashboard/review-state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ containerId, state }),
  })
}
</script>
