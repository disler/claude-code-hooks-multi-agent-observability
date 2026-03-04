<template>
  <div class="min-h-screen bg-slate-900 text-slate-100">
    <!-- Header -->
    <header class="bg-gradient-to-r from-slate-800 to-slate-700 border-b border-slate-600 shadow-lg">
      <div class="px-4 py-3 flex items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <h1 class="text-lg font-bold text-white">Infrastructure Dashboard</h1>
          <div class="flex items-center gap-1.5 text-xs text-slate-400">
            <span>{{ summary.hosts }} host{{ summary.hosts !== 1 ? 's' : '' }}</span>
            <span>·</span>
            <span>{{ summary.containers }} container{{ summary.containers !== 1 ? 's' : '' }}</span>
            <template v-if="summary.active > 0">
              <span>·</span>
              <span class="text-green-400">{{ summary.active }} active</span>
            </template>
            <template v-if="summary.awaitingInput > 0">
              <span>·</span>
              <span class="text-yellow-400">{{ summary.awaitingInput }} awaiting input</span>
            </template>
          </div>
        </div>

        <div class="flex items-center gap-3">
          <!-- Filter bar -->
          <FilterBar
            :repos="allRepos"
            :hosts="allHosts"
            :model-repo-filter="repoFilter"
            :model-host-filter="hostFilter"
            @update:repo-filter="repoFilter = $event"
            @update:host-filter="hostFilter = $event"
          />

          <!-- Connection status -->
          <div class="flex items-center gap-1.5 text-xs">
            <span class="relative flex h-2 w-2">
              <span v-if="connected" class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span class="relative inline-flex rounded-full h-2 w-2" :class="connected ? 'bg-green-500' : 'bg-red-500'" />
            </span>
            <span :class="connected ? 'text-green-400' : 'text-red-400'">{{ connected ? 'Live' : 'Disconnected' }}</span>
          </div>

          <!-- Link to event stream client -->
          <a
            :href="clientUrl"
            class="text-xs text-slate-400 hover:text-slate-200 border border-slate-600 hover:border-slate-400 rounded px-2 py-1 transition-colors"
          >Event Stream ↗</a>
        </div>
      </div>
    </header>

    <!-- Body -->
    <main class="px-4 py-4 max-w-7xl mx-auto">
      <div v-if="filteredHosts.size === 0" class="text-slate-500 text-sm italic mt-8 text-center">
        No containers connected yet. Start a devcontainer with planq-daemon.py configured.
      </div>

      <HostGroup
        v-for="[hostname, containers] in filteredHosts"
        :key="hostname"
        :hostname="hostname"
        :containers="containers"
        @tasks-changed="handleTasksChanged"
      />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useDashboardWs } from './composables/useDashboardWs'
import { useContainers } from './composables/useContainers'
import { CLIENT_BASE } from './config'
import FilterBar from './components/FilterBar.vue'
import HostGroup from './components/HostGroup.vue'

const { byHost, summary, handleMessage, containers } = useContainers()

const { connected } = useDashboardWs(handleMessage)

const repoFilter = ref('')
const hostFilter = ref('')

const allRepos = computed(() => {
  const repos = new Set<string>()
  for (const c of containers.value.values()) repos.add(c.source_repo)
  return [...repos].sort()
})

const allHosts = computed(() => {
  const hosts = new Set<string>()
  for (const c of containers.value.values()) hosts.add(c.machine_hostname)
  return [...hosts].sort()
})

const filteredHosts = computed(() => {
  const map = new Map<string, typeof byHost.value extends Map<string, infer V> ? V : never>()
  for (const [host, conts] of byHost.value) {
    if (hostFilter.value && host !== hostFilter.value) continue
    const filtered = repoFilter.value ? conts.filter(c => c.source_repo === repoFilter.value) : conts
    if (filtered.length > 0) map.set(host, filtered)
  }
  return map
})

// Link back to the event stream client (same host, same port since both served by webclient)
const clientUrl = computed(() => `${CLIENT_BASE}/`)

function handleTasksChanged() {
  // The server will broadcast planq_update via WS; nothing to do here
}
</script>
