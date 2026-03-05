<template>
  <div class="mb-6">
    <button
      @click="open = !open"
      class="flex items-center gap-2 w-full text-left py-2 px-1 hover:bg-slate-800/50 rounded-lg mb-2"
    >
      <span class="text-slate-400 text-sm">{{ open ? '▾' : '▸' }}</span>
      <span class="text-sm font-semibold text-slate-300">HOST: {{ hostname }}</span>
      <span class="text-xs text-slate-500">({{ containers.length }} container{{ containers.length !== 1 ? 's' : '' }}{{ allOffline ? ', all offline' : '' }})</span>
    </button>

    <div v-if="open" class="pl-2">
      <ContainerCard
        v-for="container in containers"
        :key="container.id"
        :container="container"
        @tasks-changed="emit('tasks-changed')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import ContainerCard from './ContainerCard.vue'
import type { ContainerWithState } from '../types'

const props = defineProps<{
  hostname: string
  containers: ContainerWithState[]
}>()

const emit = defineEmits<{
  'tasks-changed': []
}>()

const hasActive = computed(() => props.containers.some(c => c.status === 'busy' || c.status === 'awaiting_input'))
const allOffline = computed(() => props.containers.every(c => !c.connected))
const open = ref(!allOffline.value || hasActive.value)

// Auto-open the group when containers come back online after being all offline
watch(allOffline, (nowAllOffline) => {
  if (!nowAllOffline) open.value = true
})
</script>
