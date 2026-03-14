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
              <span v-if="c.git_branch" class="text-blue-400 font-bold">{{ c.git_branch === 'HEAD' ? (c.git_commit_hash?.slice(0, 8) ?? 'HEAD') : c.git_branch }}</span>
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
              <span class="text-cyan-400 font-bold">{{ sub.branch === 'HEAD' ? (sub.commit_hash?.slice(0, 8) ?? 'HEAD') : sub.branch }}</span>
            </button>
          </template>
        </div>
      </div>

      <!-- Body: main content fills all space; side panel overlays from the right -->
      <div class="flex-1 relative overflow-hidden">

        <!-- Main content: graph fills full height, list scrolls with padding -->
        <div class="w-full h-full">
          <!-- Show loading/error only on initial load (no data yet); during refreshes keep graph mounted -->
          <div v-if="loading && !gitData" class="p-4 text-xs text-slate-500 italic">Loading…</div>
          <div v-else-if="error && !gitData" class="p-4 text-xs text-red-400">{{ error }}</div>
          <template v-else-if="gitData">
            <!-- Graph: manages its own scroll, fills full height, no outer overflow -->
            <GitGraphView
              v-if="mode === 'graph'"
              ref="graphRef"
              class="h-full"
              :commits="gitData.commits"
              :containers="filteredContainers"
              :refs-per-host="filteredRefsPerHost"
              :selected-hash="selectedHash"
              :remote-url="gitData.remote_url ?? undefined"
              :source-host="browserHost ?? undefined"
              :source-repo="fetchRepo"
              @select-hash="selectHash"
              @open-session="sid => emit('open-history', sid)"
            />
            <!-- List: outer div scrolls, content has padding -->
            <div v-else class="h-full overflow-auto p-4">
              <GitListView
                ref="listRef"
                :containers="filteredContainers"
                :commits="gitData.commits"
                :selected-hash="selectedHash"
                :diffstat="currentDiffstat"
                @select-hash="selectHash"
                @switch-to-graph="handleSwitchToGraph"
                @switch-to-graph-sub="handleSwitchToGraphSub"
                @open-session="sid => emit('open-history', sid)"
              />
            </div>
          </template>
          <div v-else class="p-4 text-xs text-slate-500 italic">No git data available.</div>
        </div>

        <!-- Commit detail panel: absolute overlay, right side, full height -->
        <div
          v-if="selectedHash"
          class="absolute right-0 top-0 bottom-0 w-80 z-10 bg-slate-900 border-l border-slate-700 flex flex-col shadow-2xl"
        >
          <!-- Panel header -->
          <div class="flex items-center justify-between px-3 py-2 border-b border-slate-700 shrink-0">
            <span class="text-xs font-semibold text-slate-400 uppercase tracking-wide">Commit</span>
            <button
              @click="selectedHash = null; currentDiffstat = ''; currentMessage = ''"
              class="text-slate-400 hover:text-slate-200 text-lg leading-none px-1"
              title="Close"
            >×</button>
          </div>

          <!-- Panel body -->
          <div class="flex-1 overflow-y-auto p-3 space-y-3 text-xs">
            <!-- Hash (short display, copy full) -->
            <div class="flex items-center gap-1.5">
              <span class="font-mono text-yellow-400">{{ selectedHash?.slice(0, 8) }}</span>
              <button
                @click="copyToClipboard(selectedHash!)"
                class="text-slate-500 hover:text-slate-300 transition-colors"
                :title="selectedHash ?? ''"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" stroke="currentColor" fill="none"/>
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" fill="none"/>
                </svg>
              </button>
            </div>

            <!-- Branch / ref badges -->
            <div v-if="selectedCommitBadges.length" class="flex flex-wrap gap-1">
              <span
                v-for="b in selectedCommitBadges"
                :key="b.text"
                class="px-1.5 py-0.5 rounded font-mono"
                :class="b.cls"
              >{{ b.text }}</span>
            </div>

            <!-- Author + timestamp -->
            <div v-if="selectedCommit?.author || selectedCommitDate" class="space-y-0.5">
              <div v-if="selectedCommit?.author" class="text-slate-300">{{ selectedCommit.author }}</div>
              <div v-if="selectedCommitDate" class="text-slate-500">{{ selectedCommitDate }}</div>
            </div>

            <!-- Subject (always available without API call) -->
            <div v-if="selectedCommit?.subject" class="text-slate-200 font-semibold">{{ selectedCommit.subject }}</div>

            <!-- Parent commits -->
            <div v-if="selectedCommitParents.length" class="space-y-1 border-t border-slate-700/60 pt-2">
              <div class="text-slate-500 text-xs uppercase tracking-wide">{{ selectedCommitParents.length > 1 ? 'Parents' : 'Parent' }}</div>
              <div
                v-for="p in selectedCommitParents"
                :key="p.hash"
                class="flex items-center gap-1.5 min-w-0"
              >
                <button
                  @click="selectHash(p.hash)"
                  class="font-mono text-yellow-500 hover:text-yellow-300 shrink-0 text-xs"
                  :title="p.hash"
                >{{ p.hash.slice(0, 8) }}</button>
                <button
                  @click.stop="copyToClipboard(p.hash)"
                  class="text-slate-500 hover:text-slate-300 transition-colors shrink-0"
                  :title="p.hash"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" stroke="currentColor" fill="none"/>
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" fill="none"/>
                  </svg>
                </button>
                <span class="text-slate-400 truncate text-xs">{{ p.subject }}</span>
              </div>
            </div>

            <!-- Full message + diffstat (fetched) -->
            <div v-if="loadingDetail" class="text-slate-500 italic">Loading…</div>
            <template v-else>
              <pre
                v-if="currentMessage && currentMessage.trim() !== selectedCommit?.subject?.trim()"
                class="text-slate-300 whitespace-pre-wrap font-sans leading-relaxed"
              >{{ currentMessage.trim() }}</pre>
              <pre
                v-if="currentDiffstat"
                class="text-slate-400 font-mono whitespace-pre overflow-x-auto border-t border-slate-700/60 pt-2"
              >{{ currentDiffstat.trim() }}</pre>
            </template>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useGitView } from '../composables/useGitView'
import { containerDirLabel, formatRef } from '../composables/useGitGraph'
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
  'open-history': [sessionId: string]
}>()

const { data: gitData, loading, error, fetchGitView, fetchCommitDetail } = useGitView()
const mode = ref<'graph' | 'list'>('graph')
const selectedHash = ref<string | null>(null)
const currentDiffstat = ref('')
const currentMessage = ref('')
const loadingDetail = ref(false)
const selectedHost = ref<string | null>(null)
const graphRef = ref<InstanceType<typeof GitGraphView> | null>(null)
const listRef = ref<InstanceType<typeof GitListView> | null>(null)
// Generation counter: incremented on each new load() call so stale concurrent loads bail out.
let loadGen = 0

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

// --- Commit detail side panel ---

const selectedCommit = computed(() =>
  selectedHash.value ? (gitData.value?.commits.find(c => c.hash === selectedHash.value) ?? null) : null
)

const selectedCommitDate = computed(() => {
  const ts = selectedCommit.value?.author_date
  return ts ? new Date(ts * 1000).toLocaleString() : ''
})

const selectedCommitParents = computed(() => {
  const commit = selectedCommit.value
  if (!commit || !commit.parents.length) return []
  const commitMap = new Map((gitData.value?.commits ?? []).map((c: any) => [c.hash, c]))
  return commit.parents.map((hash: string) => {
    const parent = commitMap.get(hash)
    return { hash, subject: parent?.subject ?? hash.slice(0, 8) }
  })
})

interface RefBadge { text: string; cls: string }
const selectedCommitBadges = computed((): RefBadge[] => {
  const commit = selectedCommit.value
  if (!commit) return []
  const badges: RefBadge[] = []
  // Per-host local branches
  for (const { hash, host, localBranches } of filteredRefsPerHost.value) {
    if (hash === commit.hash) {
      for (const b of localBranches)
        badges.push({ text: `${b}@${alias(host)}`, cls: 'bg-blue-900/60 text-blue-300' })
    }
  }
  // HEAD / remote / tag refs from the commit object
  for (const ref of commit.refs) {
    const f = formatRef(ref)
    const cls = f.type === 'head' ? 'bg-blue-700/60 text-blue-200'
              : f.type === 'tag'  ? 'bg-amber-900/60 text-amber-300'
              : f.type === 'local' ? 'bg-blue-900/60 text-blue-300'
              : 'bg-slate-700/60 text-slate-300'
    badges.push({ text: f.text, cls })
  }
  return badges
})

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {})
}

async function load() {
  const myGen = ++loadGen
  // Send request to server to fetch fresh data from connected containers
  if (props.sendWs) {
    props.sendWs({
      type: 'git_fetch_fresh',
      source_repo: fetchRepo.value,
      host_filter: effectiveHost.value,
    })
  }
  await fetchGitView(fetchRepo.value)
  // If a newer load() started while we were fetching, bail out — don't clobber its state.
  if (myGen !== loadGen) return
  selectedHash.value = null
  currentDiffstat.value = ''
  currentMessage.value = ''
  selectedHost.value = null
  // Apply navigation hash if provided (e.g. from switch-repo or openGitView).
  const hashToApply = props.initialHash
  if (hashToApply && gitData.value) {
    const fullHash = gitData.value.commits.find(cm => cm.hash.startsWith(hashToApply))?.hash ?? hashToApply
    await nextTick()
    if (myGen !== loadGen) return
    await selectHash(fullHash)
    if (mode.value === 'graph') {
      await nextTick()
      if (myGen !== loadGen) return
      graphRef.value?.scrollToHash(fullHash)
    }
  }
}

async function selectHash(hash: string) {
  if (selectedHash.value === hash) {
    selectedHash.value = null
    currentDiffstat.value = ''
    currentMessage.value = ''
    return
  }
  selectedHash.value = hash
  loadingDetail.value = true
  currentDiffstat.value = ''
  currentMessage.value = ''
  const detail = await fetchCommitDetail(fetchRepo.value, hash)
  currentDiffstat.value = detail.diffstat
  currentMessage.value = detail.message
  loadingDetail.value = false
}

async function handleSwitchToGraph(hash: string) {
  if (isSubmoduleInListMode.value) {
    // Commits shown are from the parent repo (fetchRepo = parentRepo in submodule list mode).
    // fetchRepo stays parentRepo after the mode switch (parent graph mode also uses parentRepo),
    // so the fetchRepo watcher won't fire and load() won't run. Emit switch-repo to update
    // App.vue state, then navigate directly since gitData already has the parent commits.
    mode.value = 'graph'
    emit('switch-repo', parentRepo.value, hash)
    await nextTick()
    const fullHash = gitData.value?.commits.find((cm: any) => cm.hash.startsWith(hash) || hash.startsWith(cm.hash))?.hash ?? hash
    if (selectedHash.value !== fullHash) await selectHash(fullHash)
    await nextTick()
    graphRef.value?.scrollToHash(fullHash)
    return
  }
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

async function jumpToSubmodule(subPath: string, _commitHash: string | null) {
  const subRepo = _resolveSubmoduleRepo(subPath)
  if (!subRepo) return
  if (subRepo === props.sourceRepo) {
    // Already in this submodule — scroll directly without a repo switch (which would be a no-op
    // on props.sourceRepo, so the watcher wouldn't fire and load() wouldn't run).
    if (_commitHash) {
      const fullHash = gitData.value?.commits.find(cm => cm.hash.startsWith(_commitHash) || _commitHash.startsWith(cm.hash))?.hash ?? _commitHash
      if (selectedHash.value !== fullHash) await selectHash(fullHash)
      await nextTick()
      if (mode.value === 'graph') graphRef.value?.scrollToHash(fullHash)
    }
    return
  }
  emit('switch-repo', subRepo, _commitHash)
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
  // Container chips in submodule view belong to the parent repo — switch back to it.
  if (isSubmoduleRepo(props.sourceRepo)) {
    emit('switch-repo', parentRepo.value, c.parent_commit_hash ?? null)
    return
  }
  // In the parent view: scroll to / highlight the container's commit.
  // Bidirectional startsWith handles short (7-8 char) and full (40 char) hash formats.
  const found = gitData.value?.commits.find(cm =>
    cm.hash === c.git_commit_hash! ||
    cm.hash.startsWith(c.git_commit_hash!) ||
    c.git_commit_hash!.startsWith(cm.hash)
  )
  const targetHash = found?.hash ?? c.git_commit_hash
  // Don't toggle off if already selected — chip clicks should always navigate, not deselect.
  if (selectedHash.value !== targetHash) {
    await selectHash(targetHash)
  }
  await nextTick()
  if (mode.value === 'graph') {
    graphRef.value?.scrollToHash(targetHash)
  } else {
    listRef.value?.scrollToContainer(c.id)
  }
}

// Single watcher on fetchRepo covers both sourceRepo changes and isSubmoduleInListMode
// toggling (list↔graph on a submodule), avoiding double-load when both change at once.
watch(fetchRepo, load, { immediate: true })

// When the server signals that containers have sent fresh heartbeats, re-fetch HTTP data
watch(() => props.gitRefreshSignal, (newVal, oldVal) => {
  if (newVal !== undefined && oldVal !== undefined && newVal !== oldVal) {
    fetchGitView(fetchRepo.value)
  }
})

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>
