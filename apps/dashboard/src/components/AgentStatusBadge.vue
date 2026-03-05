<template>
  <span class="inline-flex items-center gap-1.5 text-xs font-semibold">
    <span class="relative flex h-2 w-2">
      <span
        v-if="status === 'busy'"
        class="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
        :class="dotColor"
      />
      <span class="relative inline-flex rounded-full h-2 w-2" :class="dotColor" />
    </span>
    <span :class="textColor">{{ label }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  status: 'busy' | 'idle' | 'awaiting_input' | 'offline' | 'terminated'
}>()

const dotColor = computed(() => ({
  busy: 'bg-green-400',
  idle: 'bg-slate-400',
  awaiting_input: 'bg-yellow-400',
  offline: 'bg-slate-600',
  terminated: 'bg-red-700',
}[props.status]))

const textColor = computed(() => ({
  busy: 'text-green-400',
  idle: 'text-slate-400',
  awaiting_input: 'text-yellow-400',
  offline: 'text-slate-600',
  terminated: 'text-red-700',
}[props.status]))

const label = computed(() => ({
  busy: 'BUSY',
  idle: 'IDLE',
  awaiting_input: 'AWAITING INPUT',
  offline: 'OFFLINE',
  terminated: 'TERMINATED',
}[props.status]))
</script>
