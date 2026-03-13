<template>
  <div class="mb-6">
    <button
      @click="toggle()"
      class="flex items-center gap-2 w-full text-left py-2 px-1 hover:bg-slate-800/50 rounded-lg mb-2"
    >
      <span class="text-slate-400 text-sm">{{ open ? '▾' : '▸' }}</span>
      <span class="text-sm font-semibold text-slate-300">HOST: {{ alias(hostname) }}</span>
      <span class="text-xs text-slate-500">({{ containers.length }} container{{ containers.length !== 1 ? 's' : '' }}{{ allOffline ? ', all offline' : '' }})</span>
    </button>

    <div v-if="open" class="pl-2">
      <ContainerCard
        v-for="container in containers"
        :key="container.id"
        :container="container"
        @tasks-changed="emit('tasks-changed')"
        @open-git-view="(repo, hash) => emit('open-git-view', repo, hash)"
        @open-history="(cid, sid) => emit('open-history', cid, sid)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import ContainerCard from './ContainerCard.vue'
import type { ContainerWithState } from '../types'
import { useHostnameAliases } from '../composables/useHostnameAliases'
import { useHostGroupState } from '../composables/usePanelState'

const { alias } = useHostnameAliases()

const props = defineProps<{
  hostname: string
  containers: ContainerWithState[]
}>()

const emit = defineEmits<{
  'tasks-changed': []
  'open-git-view': [repo: string, hash?: string | null]
  'open-history': [containerId: string, sessionId: string]
}>()

const hasActive = computed(() => props.containers.some(c => c.status === 'busy' || c.status === 'awaiting_input'))
const allOffline = computed(() => props.containers.every(c => !c.connected))

const { open, setOpen, toggle } = useHostGroupState(props.hostname, !allOffline.value || hasActive.value)

// Auto-open the group when containers come back online after being all offline
watch(allOffline, (nowAllOffline) => {
  if (!nowAllOffline) setOpen(true)
})
</script>
