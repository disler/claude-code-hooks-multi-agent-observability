<template>
  <div class="fixed inset-0 z-50 flex items-start justify-center pt-8 px-4" @click.self="$emit('close')">
    <div class="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col">
      <!-- Header -->
      <div class="flex items-center justify-between px-4 py-3 border-b border-slate-700 shrink-0">
        <div class="flex items-center gap-3">
          <span class="text-sm font-semibold text-slate-200">Git View: {{ sourceRepo }}</span>
          <div class="flex items-center gap-1 text-xs">
            <span
              v-for="c in gitData?.containers ?? []"
              :key="c.id"
              class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-700/60"
            >
              <span class="w-1.5 h-1.5 rounded-full inline-block" :class="c.connected ? 'bg-green-500' : 'bg-slate-500'" />
              <span class="text-slate-300">{{ c.container_hostname }}</span>
              <span v-if="c.git_branch" class="text-blue-400">{{ c.git_branch }}</span>
            </span>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <!-- View toggle -->
          <div class="flex bg-slate-800 rounded overflow-hidden text-xs">
            <button
              @click="mode = 'graph'"
              :class="mode === 'graph' ? 'bg-slate-600 text-slate-100' : 'text-slate-400 hover:text-slate-200'"
              class="px-2 py-1"
            >Graph</button>
            <button
              @click="mode = 'list'"
              :class="mode === 'list' ? 'bg-slate-600 text-slate-100' : 'text-slate-400 hover:text-slate-200'"
              class="px-2 py-1"
            >List</button>
          </div>
          <!-- Refresh -->
          <button
            @click="load"
            :disabled="loading"
            class="text-xs text-slate-400 hover:text-slate-200 disabled:opacity-50"
            title="Refresh"
          >↺</button>
          <!-- Close -->
          <button @click="$emit('close')" class="text-slate-400 hover:text-slate-200 text-lg leading-none px-1">×</button>
        </div>
      </div>

      <!-- Body -->
      <div class="flex-1 overflow-auto p-4">
        <div v-if="loading" class="text-xs text-slate-500 italic">Loading…</div>
        <div v-else-if="error" class="text-xs text-red-400">{{ error }}</div>
        <template v-else-if="gitData">
          <GitGraphView
            v-if="mode === 'graph'"
            :commits="gitData.commits"
            :containers="gitData.containers"
            :selected-hash="selectedHash"
            @select-hash="selectHash"
          />
          <GitListView
            v-else
            :containers="gitData.containers"
            :commits="gitData.commits"
            :selected-hash="selectedHash"
            :diffstat="currentDiffstat"
            @select-hash="selectHash"
          />

          <!-- Diffstat popover (graph mode) -->
          <div
            v-if="mode === 'graph' && selectedHash && currentDiffstat"
            class="mt-3 border border-slate-700 rounded bg-slate-800/80 p-3"
          >
            <div class="flex items-center justify-between mb-1">
              <span class="text-xs font-mono text-yellow-400">{{ selectedHash.slice(0, 8) }}</span>
              <button @click="selectedHash = null" class="text-slate-500 hover:text-slate-300 text-xs">×</button>
            </div>
            <pre class="text-xs text-slate-300 font-mono whitespace-pre-wrap max-h-48 overflow-y-auto">{{ currentDiffstat }}</pre>
          </div>
          <div v-else-if="mode === 'graph' && selectedHash && loadingDiffstat" class="mt-3 text-xs text-slate-500 italic">
            Loading diff…
          </div>
        </template>
        <div v-else class="text-xs text-slate-500 italic">No git data available.</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useGitView } from '../composables/useGitView'
import GitGraphView from './GitGraphView.vue'
import GitListView from './GitListView.vue'

const props = defineProps<{
  sourceRepo: string
}>()

defineEmits<{
  close: []
}>()

const { data: gitData, loading, error, fetchGitView, fetchDiffstat } = useGitView()
const mode = ref<'graph' | 'list'>('graph')
const selectedHash = ref<string | null>(null)
const currentDiffstat = ref('')
const loadingDiffstat = ref(false)

async function load() {
  await fetchGitView(props.sourceRepo)
  selectedHash.value = null
  currentDiffstat.value = ''
}

async function selectHash(hash: string) {
  if (selectedHash.value === hash) {
    selectedHash.value = null
    currentDiffstat.value = ''
    return
  }
  selectedHash.value = hash
  loadingDiffstat.value = true
  currentDiffstat.value = await fetchDiffstat(props.sourceRepo, hash)
  loadingDiffstat.value = false
}

watch(() => props.sourceRepo, load, { immediate: true })
</script>
