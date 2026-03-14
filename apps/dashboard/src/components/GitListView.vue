<template>
  <div class="space-y-3">
    <div
      v-for="c in sortedContainers"
      :key="c.id"
      :id="`container-${c.id}`"
      class="rounded border p-3 transition-colors duration-300"
      :class="flashId === c.id ? 'bg-yellow-500/10 border-yellow-500/50' : 'border-slate-700 bg-slate-800/50'"
    >
      <div class="flex items-center gap-2 mb-1">
        <span class="inline-block w-2 h-2 rounded-full" :class="c.connected ? 'bg-green-500' : 'bg-slate-500'" />
        <span class="text-xs text-slate-200 font-semibold font-mono">{{ containerDirLabel(c) }}</span>
        <span class="text-xs text-slate-500">{{ alias(c.machine_hostname) }} / {{ c.container_hostname }}</span>
        <button v-if="c.git_branch && c.git_commit_hash" class="text-xs bg-blue-900/50 text-blue-300 px-1.5 py-0.5 rounded font-mono hover:bg-blue-800/60 cursor-pointer" @click="$emit('switch-to-graph', c.git_commit_hash)">{{ c.git_branch }}</button>
        <span v-if="c.git_worktree" class="text-xs text-slate-500 font-mono">{{ c.git_worktree }}</span>
      </div>

      <div v-if="c.git_commit_hash" class="flex items-center gap-2 text-xs">
        <button class="font-mono text-yellow-400 hover:text-yellow-300 cursor-pointer" @click="$emit('switch-to-graph', c.git_commit_hash)">{{ c.git_commit_hash.slice(0, 8) }}</button>
        <span class="text-slate-400 truncate">{{ headCommitSubject(c.git_commit_hash) }}</span>
        <button
          v-if="headCommitSessions(c.git_commit_hash).length"
          @click="emit('open-session', headCommitSessions(c.git_commit_hash)[headCommitSessions(c.git_commit_hash).length - 1])"
          class="text-indigo-400 hover:text-indigo-200 shrink-0 text-xs"
          :title="`${headCommitSessions(c.git_commit_hash).length} linked session(s)`"
        >💬</button>
        <button
          v-if="c.git_commit_hash"
          @click="$emit('select-hash', c.git_commit_hash)"
          class="text-slate-500 hover:text-slate-300 shrink-0"
          title="View diffstat"
        >diff</button>
      </div>

      <div class="flex gap-3 mt-1 text-xs">
        <button v-if="c.git_staged_count > 0 && c.git_staged_diffstat" class="text-yellow-400 hover:text-yellow-200 cursor-pointer" @click="toggleInlineDiffstat(c.id, 'staged', c.git_staged_diffstat!)">Staged: {{ c.git_staged_count }}</button>
        <span v-else-if="c.git_staged_count > 0" class="text-yellow-400">Staged: {{ c.git_staged_count }}</span>
        <button v-if="c.git_unstaged_count > 0 && c.git_unstaged_diffstat" class="text-orange-400 hover:text-orange-200 cursor-pointer" @click="toggleInlineDiffstat(c.id, 'unstaged', c.git_unstaged_diffstat!)">Unstaged: {{ c.git_unstaged_count }}</button>
        <span v-else-if="c.git_unstaged_count > 0" class="text-orange-400">Unstaged: {{ c.git_unstaged_count }}</span>
        <span v-if="c.git_staged_count === 0 && c.git_unstaged_count === 0" class="text-slate-500">Clean</span>
      </div>

      <!-- Inline diffstat (staged/unstaged) -->
      <pre
        v-if="inlineDiffstat?.containerId === c.id"
        class="mt-2 text-xs text-slate-300 font-mono whitespace-pre-wrap bg-black/30 rounded p-2 max-h-40 overflow-y-auto"
      >{{ inlineDiffstat.diffstat }}</pre>

      <!-- Submodule info -->
      <div
        v-for="sub in (c.git_submodules ?? [])"
        :key="sub.path"
        class="mt-1 pl-3 border-l border-slate-700 text-xs flex items-center gap-2 flex-wrap"
      >
        <span class="text-slate-500">submodule</span>
        <span class="font-mono text-slate-300">{{ sub.path }}</span>
        <button v-if="sub.branch && sub.commit_hash" class="font-mono text-cyan-400 hover:text-cyan-300 cursor-pointer" @click="$emit('switch-to-graph-sub', sub.path, sub.commit_hash!)">{{ sub.branch }}</button>
        <button v-if="sub.commit_hash" class="font-mono text-yellow-400 hover:text-yellow-300 cursor-pointer" @click="$emit('switch-to-graph-sub', sub.path, sub.commit_hash!)">{{ sub.commit_hash.slice(0, 8) }}</button>
        <span v-if="sub.commit_message" class="text-slate-400 truncate max-w-xs">{{ sub.commit_message }}</span>
        <button v-if="sub.staged_count > 0 && sub.staged_diffstat" class="text-yellow-400 hover:text-yellow-200 cursor-pointer" @click="toggleInlineDiffstat(`${c.id}-sub-${sub.path}`, 'staged', sub.staged_diffstat!)">Staged: {{ sub.staged_count }}</button>
        <span v-else-if="sub.staged_count > 0" class="text-yellow-400">Staged: {{ sub.staged_count }}</span>
        <button v-if="sub.unstaged_count > 0 && sub.unstaged_diffstat" class="text-orange-400 hover:text-orange-200 cursor-pointer" @click="toggleInlineDiffstat(`${c.id}-sub-${sub.path}`, 'unstaged', sub.unstaged_diffstat!)">Unstaged: {{ sub.unstaged_count }}</button>
        <span v-else-if="sub.unstaged_count > 0" class="text-orange-400">Unstaged: {{ sub.unstaged_count }}</span>
        <span v-if="sub.staged_count === 0 && sub.unstaged_count === 0" class="text-slate-500">Clean</span>
        <pre v-if="inlineDiffstat?.containerId === `${c.id}-sub-${sub.path}`" class="w-full mt-1 text-xs text-slate-300 font-mono whitespace-pre-wrap bg-black/30 rounded p-2 max-h-40 overflow-y-auto">{{ inlineDiffstat.diffstat }}</pre>
      </div>

      <!-- Diffstat popover (commit hash) -->
      <pre
        v-if="selectedHash === c.git_commit_hash && diffstat"
        class="mt-2 text-xs text-slate-300 font-mono whitespace-pre-wrap bg-black/30 rounded p-2 max-h-40 overflow-y-auto"
      >{{ diffstat }}</pre>
    </div>

    <div v-if="containers.length === 0" class="text-xs text-slate-500 italic">No containers for this repo.</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { GitContainer, GitCommit } from '../types'
import { containerDirLabel } from '../composables/useGitGraph'
import { useHostnameAliases } from '../composables/useHostnameAliases'

const { alias } = useHostnameAliases()

const props = defineProps<{
  containers: GitContainer[]
  commits: GitCommit[]
  selectedHash: string | null
  diffstat: string
}>()

const emit = defineEmits<{
  'select-hash': [hash: string]
  'switch-to-graph': [hash: string]
  'switch-to-graph-sub': [subPath: string, hash: string]
  'open-session': [sessionId: string]
}>()

const flashId = ref<string | null>(null)
const inlineDiffstat = ref<{ containerId: string; type: 'staged' | 'unstaged'; diffstat: string } | null>(null)

function toggleInlineDiffstat(containerId: string, type: 'staged' | 'unstaged', diffstat: string) {
  if (inlineDiffstat.value?.containerId === containerId && inlineDiffstat.value?.type === type) {
    inlineDiffstat.value = null
  } else {
    inlineDiffstat.value = { containerId, type, diffstat }
  }
}

const sortedContainers = computed(() => {
  return [...props.containers].sort((a, b) => {
    const hostCmp = a.machine_hostname.localeCompare(b.machine_hostname)
    if (hostCmp !== 0) return hostCmp
    return containerDirLabel(a).localeCompare(containerDirLabel(b))
  })
})

function headCommitSubject(hash: string): string {
  return props.commits.find(c => c.hash.startsWith(hash) || hash.startsWith(c.hash))?.subject ?? ''
}

function headCommitSessions(hash: string): string[] {
  return props.commits.find(c => c.hash.startsWith(hash) || hash.startsWith(c.hash))?.session_ids ?? []
}

function scrollToContainer(id: string) {
  const el = document.getElementById(`container-${id}`)
  el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  flashId.value = id
  setTimeout(() => { if (flashId.value === id) flashId.value = null }, 3000)
}

defineExpose({ scrollToContainer })
</script>
