<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center" @click.self="$emit('close')">
    <div class="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-[80vw] h-[90vh] flex flex-col">
      <!-- Header top row: title + controls (always visible) -->
      <div class="flex items-center justify-between px-4 pt-3 pb-1 border-b border-slate-700/50 shrink-0">
        <div class="flex items-center gap-2">
          <span class="text-sm font-semibold text-slate-400">Git View</span>
          <!-- Repo dropdown -->
          <select
            v-if="visibleRepoItems.length > 1"
            :value="isSubmoduleInListMode ? parentRepo : sourceRepo"
            @change="$emit('switch-repo', ($event.target as HTMLSelectElement).value)"
            class="text-sm font-semibold text-slate-200 bg-slate-800 border border-slate-600 rounded px-1.5 py-0.5 cursor-pointer"
          >
            <option v-for="r in visibleRepoItems" :key="r.value" :value="r.value">{{ r.label }}</option>
          </select>
          <span v-else class="text-sm font-semibold text-slate-200">{{ repoDisplayName(isSubmoduleInListMode ? parentRepo : sourceRepo) }}</span>
          <!-- Submodule quick links (graph mode only): show submodules from parent,
               or show parent + siblings when currently viewing a submodule. -->
          <template v-if="mode === 'graph' && repoQuickLinks.length > 0">
            <span class="text-slate-600 text-xs">·</span>
            <!-- Parent link when viewing a submodule -->
            <button
              v-if="isSubmoduleRepo(sourceRepo)"
              class="text-xs text-slate-400 hover:text-blue-300 cursor-pointer"
              @click="$emit('switch-repo', parentRepo)"
            >{{ repoDisplayName(parentRepo) }}</button>
            <!-- Submodule links -->
            <button
              v-for="sub in repoQuickLinks"
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
              <option v-if="browserHost" value="_local">Local</option>
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
          <template v-for="c in conts" :key="c.id">
            <button
              class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-700/60 hover:bg-slate-600/60 text-xs cursor-pointer transition-colors"
              :title="`Jump to ${c.container_hostname}`"
              @click="jumpToContainer(c)"
            >
              <span class="w-1.5 h-1.5 rounded-full inline-block" :class="c.connected ? 'bg-green-500' : 'bg-slate-500'" />
              <span class="text-slate-200 font-mono">{{ containerDirLabel(c) }}</span>
              <span v-if="c.git_branch" class="text-blue-400 font-bold">{{ c.git_branch }}</span>
            </button>
            <!-- Submodule branch chips -->
            <button
              v-for="sub in (c.git_submodules ?? []).filter((s: any) => s.branch)"
              :key="`${c.id}-sub-${sub.path}`"
              class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-800/80 hover:bg-slate-700/60 text-xs cursor-pointer transition-colors border border-slate-600/50"
              :title="`Jump to submodule ${sub.path}`"
              @click.stop="jumpToSubmodule(sub.path, sub.commit_hash)"
            >
              <span class="text-slate-500 font-mono">{{ sub.path.split('/').pop() }}</span>
              <span class="text-cyan-400 font-bold">{{ sub.branch }}</span>
            </button>
          </template>
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
            :source-host="browserHost ?? undefined"
            :source-repo="fetchRepo"
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
            @switch-to-graph="handleSwitchToGraph"
            @switch-to-graph-sub="handleSwitchToGraphSub"
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
  sendWs?: (msg: object) => void
  gitRefreshSignal?: number
}>()

const emit = defineEmits<{
  close: []
  'switch-repo': [repo: string, hash?: string | null]
}>()

const { data: gitData, loading, error, fetchGitView, fetchDiffstat } = useGitView()
const mode = ref<'graph' | 'list'>('graph')
const selectedHash = ref<string | null>(null)
const currentDiffstat = ref('')
const loadingDiffstat = ref(false)
const selectedHost = ref<string | null>(null)
const graphRef = ref<InstanceType<typeof GitGraphView> | null>(null)
const listRef = ref<InstanceType<typeof GitListView> | null>(null)

// Merge props.allRepos with submodule source_repos discovered from gitData
const effectiveAllRepos = computed(() => {
  const subRepos = (gitData.value?.submodules ?? []).map((s: any) => s.source_repo)
  return [...new Set([...(props.allRepos ?? []), ...subRepos])].sort()
})

// Returns true if repo is a submodule of another repo in effectiveAllRepos
function isSubmoduleRepo(repo: string): boolean {
  return effectiveAllRepos.value.some(p => p !== repo && repo.startsWith(p + '/'))
}

// The parent repo of the current sourceRepo (if it's a submodule)
const parentRepo = computed((): string => {
  return effectiveAllRepos.value.find(p => p !== props.sourceRepo && props.sourceRepo.startsWith(p + '/')) ?? props.sourceRepo
})

// True when in list mode AND currently viewing a submodule
const isSubmoduleInListMode = computed(() => mode.value === 'list' && isSubmoduleRepo(props.sourceRepo))

// Compute display name for a repo path (basename, or parent/subname for submodules)
function repoDisplayName(repo: string): string {
  const parent = effectiveAllRepos.value.find(p => p !== repo && repo.startsWith(p + '/'))
  if (parent) {
    const parentBase = parent.split('/').pop() ?? parent
    const subName = repo.slice(parent.length + 1)
    return `${parentBase}/${subName}`
  }
  return repo.split('/').pop() ?? repo
}

// All repo items with proper display labels (parent/subName format)
const sortedRepoItems = computed(() => {
  return effectiveAllRepos.value.map(r => ({ value: r, label: repoDisplayName(r) }))
})

// Quick links for graph mode: submodules of current repo, or siblings when viewing a submodule.
// Derived from effectiveAllRepos (passed from parent) so they work even when gitData.submodules is empty.
const repoQuickLinks = computed((): Array<{ path: string; source_repo: string }> => {
  if (isSubmoduleRepo(props.sourceRepo)) {
    // Viewing a submodule: show all sibling submodules (other children of the same parent)
    return effectiveAllRepos.value
      .filter(r => r !== props.sourceRepo && r !== parentRepo.value && r.startsWith(parentRepo.value + '/'))
      .map(r => ({ source_repo: r, path: r.slice(parentRepo.value.length + 1) }))
  }
  // Viewing a parent repo: show its submodules from gitData
  return (gitData.value?.submodules ?? [])
})

// In list mode, hide submodule repos from the dropdown
const visibleRepoItems = computed(() => {
  if (mode.value === 'list') return sortedRepoItems.value.filter(r => !isSubmoduleRepo(r.value))
  return sortedRepoItems.value
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

/** Detect which known host the browser is running on by matching window.location.hostname */
const browserHost = computed((): string | null => {
  const hostname = typeof window !== 'undefined' ? window.location.hostname : ''
  if (!hostname) return null
  const hosts = allHosts.value
  const exact = hosts.find(h => h === hostname)
  if (exact) return exact
  return hosts.find(h => hostname.startsWith(h) || h.startsWith(hostname)) ?? null
})

/** Resolve the effective host filter (handles '_local' virtual value) */
const effectiveHost = computed((): string | null => {
  if (!selectedHost.value) return null
  if (selectedHost.value === '_local') return browserHost.value
  return selectedHost.value
})

/** Chips visible in the header — all hosts, or just the selected one */
const visibleContainersByHost = computed(() => {
  if (!effectiveHost.value) return containersByHost.value
  const map = new Map<string, GitContainer[]>()
  const conts = containersByHost.value.get(effectiveHost.value)
  if (conts) map.set(effectiveHost.value, conts)
  return map
})

/** Containers passed to graph / list views */
const filteredContainers = computed(() => {
  if (!effectiveHost.value) return gitData.value?.containers ?? []
  return (gitData.value?.containers ?? []).filter(c => c.machine_hostname === effectiveHost.value)
})

/** Per-host branch refs passed to graph view */
const filteredRefsPerHost = computed(() => {
  const all = gitData.value?.refsPerHost ?? []
  if (!effectiveHost.value) return all
  return all.filter(r => r.host === effectiveHost.value)
})

// The repo to actually fetch: in list mode, use the parent repo for submodules
const fetchRepo = computed(() => isSubmoduleInListMode.value ? parentRepo.value : props.sourceRepo)

async function load() {
  // Send request to server to fetch fresh data from connected containers
  if (props.sendWs) {
    props.sendWs({
      type: 'git_fetch_fresh',
      source_repo: fetchRepo.value,
      host_filter: effectiveHost.value,
    })
  }
  await fetchGitView(fetchRepo.value)
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
  currentDiffstat.value = await fetchDiffstat(fetchRepo.value, hash)
  loadingDiffstat.value = false
}

async function handleSwitchToGraph(hash: string) {
  mode.value = 'graph'
  await nextTick()
  const fullHash = gitData.value?.commits.find((cm: any) => cm.hash.startsWith(hash) || hash.startsWith(cm.hash))?.hash ?? hash
  await selectHash(fullHash)
  await nextTick()
  graphRef.value?.scrollToHash(fullHash)
}

async function handleSwitchToGraphSub(subPath: string, _hash: string) {
  const subRepo = _resolveSubmoduleRepo(subPath)
  if (subRepo) {
    mode.value = 'graph'
    emit('switch-repo', subRepo, _hash || null)
  }
}

function jumpToSubmodule(subPath: string, _commitHash: string | null) {
  const subRepo = _resolveSubmoduleRepo(subPath)
  if (subRepo) emit('switch-repo', subRepo, _commitHash)
}

// Resolve a submodule path to its source_repo.
// Looks in effectiveAllRepos first (reliable even when gitData.submodules is empty),
// then falls back to gitData.submodules.
function _resolveSubmoduleRepo(subPath: string): string | null {
  const base = isSubmoduleRepo(props.sourceRepo) ? parentRepo.value : props.sourceRepo
  const candidate = base + '/' + subPath
  if (effectiveAllRepos.value.includes(candidate)) return candidate
  const sub = gitData.value?.submodules?.find((s: any) => s.path === subPath)
  return sub ? (sub as any).source_repo : null
}

async function jumpToContainer(c: GitContainer) {
  if (!c.git_commit_hash) return
  // If we're in submodule view, container chips belong to the parent repo — switch back.
  if (isSubmoduleRepo(props.sourceRepo) && c.parent_commit_hash) {
    emit('switch-repo', parentRepo.value, c.parent_commit_hash)
    return
  }
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
watch(fetchRepo, (newRepo, oldRepo) => { if (newRepo !== oldRepo) load() })

// When the server signals that containers have sent fresh heartbeats, re-fetch HTTP data
watch(() => props.gitRefreshSignal, (newVal, oldVal) => {
  if (newVal !== undefined && oldVal !== undefined && newVal !== oldVal) {
    fetchGitView(fetchRepo.value)
  }
})

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
