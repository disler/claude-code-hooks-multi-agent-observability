<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center" @click.self="$emit('close')">
    <div class="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-[80vw] h-[90vh] flex flex-col">
      <!-- Header top row: title + controls (always visible) -->
      <div class="flex items-center justify-between px-4 pt-3 pb-1 border-b border-slate-700/50 shrink-0">
        <div class="flex items-center gap-2">
          <span class="text-sm font-semibold text-slate-400">Git View</span>
          <!-- Repo dropdown -->
          <select
            v-if="allRepos && allRepos.length > 1"
            :value="sourceRepo"
            @change="$emit('switch-repo', ($event.target as HTMLSelectElement).value)"
            class="text-sm font-semibold text-slate-200 bg-slate-800 border border-slate-600 rounded px-1.5 py-0.5 cursor-pointer"
          >
            <option v-for="r in sortedRepoItems" :key="r.value" :value="r.value">{{ r.label }}</option>
          </select>
          <span v-else class="text-sm font-semibold text-slate-200">{{ repoDisplayName(sourceRepo) }}</span>
          <!-- Submodule quick links -->
          <template v-if="gitData?.submodules?.length">
            <span class="text-slate-600 text-xs">·</span>
            <button
              v-for="sub in gitData.submodules"
              :key="sub.source_repo"
              class="text-xs text-slate-400 hover:text-blue-300 cursor-pointer"
              :class="sourceRepo === sub.source_repo ? 'text-blue-400 font-semibold' : ''"
              @click="$emit('switch-repo', sub.source_repo)"
            >{{ sub.path }}</button>
          </template>
        </div>
        <div class="flex items-center gap-3">
          <!-- Host filter -->
          <div v-if="allHosts.length > 1" class="flex items-center gap-1 text-xs">
            <span class="text-slate-500">Host:</span>
            <select
              v-model="selectedHost"
              class="text-slate-200 bg-slate-800 border border-slate-600 rounded px-1.5 py-0.5 cursor-pointer text-xs"
            >
              <option :value="null">All</option>
              <option v-for="h in allHosts" :key="h" :value="h">{{ alias(h) }}</option>
            </select>
          </div>
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

      <!-- Header second row: container chips grouped by host, with hostname label -->
      <div v-if="gitData?.containers?.length" class="flex flex-col gap-0.5 px-4 py-1.5 border-b border-slate-700 shrink-0">
        <div v-for="[host, conts] in visibleContainersByHost" :key="host" class="flex flex-wrap items-center gap-1">
          <span class="text-xs text-slate-500 font-mono shrink-0 mr-0.5">{{ alias(host) }}</span>
          <button
            v-for="c in conts"
            :key="c.id"
            class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-700/60 hover:bg-slate-600/60 text-xs cursor-pointer transition-colors"
            :title="`Jump to ${c.container_hostname}`"
            @click="jumpToContainer(c)"
          >
            <span class="w-1.5 h-1.5 rounded-full inline-block" :class="c.connected ? 'bg-green-500' : 'bg-slate-500'" />
            <span class="text-slate-200 font-mono">{{ containerDirLabel(c) }}</span>
            <span v-if="c.git_branch" class="text-blue-400 font-bold">{{ c.git_branch }}</span>
          </button>
        </div>
      </div>

      <!-- Body -->
      <div class="flex-1 overflow-auto p-4">
        <div v-if="loading" class="text-xs text-slate-500 italic">Loading…</div>
        <div v-else-if="error" class="text-xs text-red-400">{{ error }}</div>
        <template v-else-if="gitData">
          <GitGraphView
            v-if="mode === 'graph'"
            ref="graphRef"
            :commits="gitData.commits"
            :containers="filteredContainers"
            :refs-per-host="filteredRefsPerHost"
            :selected-hash="selectedHash"
            :remote-url="gitData.remote_url ?? undefined"
            @select-hash="selectHash"
          />
          <GitListView
            v-else
            ref="listRef"
            :containers="filteredContainers"
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
import { ref, computed, watch, nextTick } from 'vue'
import { useGitView } from '../composables/useGitView'
import { containerDirLabel } from '../composables/useGitGraph'
import { useHostnameAliases } from '../composables/useHostnameAliases'
import GitGraphView from './GitGraphView.vue'
import GitListView from './GitListView.vue'
import type { GitContainer } from '../types'

const { alias } = useHostnameAliases()

const props = defineProps<{
  sourceRepo: string
  allRepos?: string[]
  initialHash?: string | null
}>()

defineEmits<{
  close: []
  'switch-repo': [repo: string]
}>()

const { data: gitData, loading, error, fetchGitView, fetchDiffstat } = useGitView()
const mode = ref<'graph' | 'list'>('graph')
const selectedHash = ref<string | null>(null)
const currentDiffstat = ref('')
const loadingDiffstat = ref(false)
const selectedHost = ref<string | null>(null)
const graphRef = ref<InstanceType<typeof GitGraphView> | null>(null)
const listRef = ref<InstanceType<typeof GitListView> | null>(null)

// Compute display name for a repo path (basename, or parent/subname for submodules)
function repoDisplayName(repo: string): string {
  const allRepoList = props.allRepos ?? []
  const parent = allRepoList.find(p => p !== repo && repo.startsWith(p + '/'))
  if (parent) {
    const parentBase = parent.split('/').pop() ?? parent
    const subName = repo.slice(parent.length + 1)
    return `${parentBase}/${subName}`
  }
  return repo.split('/').pop() ?? repo
}

// Sorted repo list with display labels (submodules indented under parents)
const sortedRepoItems = computed(() => {
  const allRepoList = [...(props.allRepos ?? [])].sort()
  return allRepoList.map(r => {
    const parent = allRepoList.find(p => p !== r && r.startsWith(p + '/'))
    const label = parent
      ? `  ${r.slice(parent.length + 1)}`
      : (r.split('/').pop() ?? r)
    return { value: r, label }
  })
})

const sortedContainers = computed(() => {
  if (!gitData.value?.containers) return []
  return [...gitData.value.containers].sort((a, b) => {
    const hostCmp = a.machine_hostname.localeCompare(b.machine_hostname)
    if (hostCmp !== 0) return hostCmp
    return containerDirLabel(a).localeCompare(containerDirLabel(b))
  })
})

const containersByHost = computed(() => {
  const groups = new Map<string, GitContainer[]>()
  for (const c of sortedContainers.value) {
    if (!groups.has(c.machine_hostname)) groups.set(c.machine_hostname, [])
    groups.get(c.machine_hostname)!.push(c)
  }
  return groups
})

const allHosts = computed(() => [...containersByHost.value.keys()])

/** Chips visible in the header — all hosts, or just the selected one */
const visibleContainersByHost = computed(() => {
  if (!selectedHost.value) return containersByHost.value
  const map = new Map<string, GitContainer[]>()
  const conts = containersByHost.value.get(selectedHost.value)
  if (conts) map.set(selectedHost.value, conts)
  return map
})

/** Containers passed to graph / list views */
const filteredContainers = computed(() => {
  if (!selectedHost.value) return gitData.value?.containers ?? []
  return (gitData.value?.containers ?? []).filter(c => c.machine_hostname === selectedHost.value)
})

/** Per-host branch refs passed to graph view */
const filteredRefsPerHost = computed(() => {
  const all = gitData.value?.refsPerHost ?? []
  if (!selectedHost.value) return all
  return all.filter(r => r.host === selectedHost.value)
})

async function load() {
  await fetchGitView(props.sourceRepo)
  selectedHash.value = null
  currentDiffstat.value = ''
  selectedHost.value = null
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

async function jumpToContainer(c: GitContainer) {
  if (!c.git_commit_hash) return
  // Resolve short hash (from daemon %h) to full hash used in the commit graph
  const fullHash = gitData.value?.commits.find(cm => cm.hash.startsWith(c.git_commit_hash!))?.hash ?? c.git_commit_hash
  await selectHash(fullHash)
  await nextTick()
  if (mode.value === 'graph') {
    graphRef.value?.scrollToHash(fullHash)
  } else {
    listRef.value?.scrollToContainer(c.id)
  }
}

watch(() => props.sourceRepo, load, { immediate: true })

// Focus initial hash after data loads (e.g. opened by clicking branch/commit in ContainerCard)
watch(gitData, async (data) => {
  if (!data || !props.initialHash) return
  const fullHash = data.commits.find(cm => cm.hash.startsWith(props.initialHash!))?.hash ?? props.initialHash
  await nextTick()
  await selectHash(fullHash)
  if (mode.value === 'graph') {
    await nextTick()
    graphRef.value?.scrollToHash(fullHash)
  }
}, { once: true })
</script>
