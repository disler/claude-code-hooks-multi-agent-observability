<template>
  <span class="relative inline-block">
    <button
      v-if="count > 0"
      @click.stop="toggle"
      class="text-xs px-1.5 py-0.5 rounded font-mono cursor-pointer hover:opacity-80 transition-opacity"
      :class="buttonClass"
    >
      {{ count }} {{ label }}
    </button>
    <span v-else class="text-xs text-slate-600">0 {{ label }}</span>

    <!-- Popover -->
    <div
      v-if="open && diffstat"
      class="absolute z-50 top-6 left-0 min-w-64 max-w-xl bg-slate-900 border border-slate-600 rounded-lg shadow-2xl p-3"
    >
      <div class="flex items-center justify-between mb-2">
        <span class="text-xs text-slate-400 font-semibold uppercase tracking-wide">{{ label }} diffstat</span>
        <button @click="open = false" class="text-slate-500 hover:text-slate-300 text-xs">✕</button>
      </div>
      <pre class="text-xs text-slate-200 font-mono overflow-x-auto whitespace-pre">{{ diffstat }}</pre>
    </div>
  </span>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  count: number
  diffstat: string | null
  label: string
  kind: 'staged' | 'unstaged'
}>()

const open = ref(false)

function toggle() {
  if (props.count > 0 && props.diffstat) {
    open.value = !open.value
  }
}

const buttonClass = computed(() => props.kind === 'staged'
  ? 'bg-blue-900/60 text-blue-300 border border-blue-700'
  : 'bg-orange-900/60 text-orange-300 border border-orange-700'
)

import { computed } from 'vue'
</script>
