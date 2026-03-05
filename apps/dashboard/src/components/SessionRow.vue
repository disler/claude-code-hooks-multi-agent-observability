<template>
  <div class="flex flex-col gap-0.5 py-1.5 pl-3 border-l-2"
    :class="{
      'border-green-500': session.status === 'busy',
      'border-yellow-500': session.status === 'awaiting_input',
      'border-slate-600': session.status === 'idle',
    }"
  >
    <div class="flex items-center gap-2 flex-wrap">
      <AgentStatusBadge :status="session.status" />
      <span class="text-xs text-slate-400 font-mono">{{ shortId }}</span>
      <span v-if="session.model_name" class="text-xs text-slate-500">{{ session.model_name }}</span>
      <span
        v-if="session.last_event_at"
        class="text-xs text-slate-500 cursor-default"
        :title="isoTime"
      >{{ relativeTime }}</span>
      <span v-if="session.subagent_count > 0" class="text-xs text-purple-400">
        + {{ session.subagent_count }} subagent{{ session.subagent_count > 1 ? 's' : '' }}
      </span>
    </div>

    <div v-if="session.last_prompt" class="text-xs text-slate-300 truncate max-w-prose">
      <span class="text-slate-500">Prompt: </span>{{ truncate(session.last_prompt, 120) }}
    </div>
    <div v-if="session.last_response_summary" class="text-xs text-slate-400 truncate max-w-prose">
      <span class="text-slate-500">Response: </span>{{ truncate(session.last_response_summary, 120) }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import AgentStatusBadge from './AgentStatusBadge.vue'
import type { SessionState } from '../types'

const props = defineProps<{ session: SessionState }>()

const shortId = computed(() => props.session.session_id.slice(0, 8))

// Reactive now-tick so relative time updates live
const now = ref(Date.now())
let ticker: ReturnType<typeof setInterval> | null = null
onMounted(() => { ticker = setInterval(() => { now.value = Date.now() }, 10_000) })
onUnmounted(() => { if (ticker) clearInterval(ticker) })

const isoTime = computed(() => {
  if (!props.session.last_event_at) return ''
  return new Date(props.session.last_event_at).toISOString()
})

const relativeTime = computed(() => {
  if (!props.session.last_event_at) return ''
  const diffMs = now.value - props.session.last_event_at
  const diffSec = Math.floor(diffMs / 1000)
  if (diffSec < 30) return 'now'
  if (diffSec < 90) return `${diffSec}s ago`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  return `${diffDay}d ago`
})

function truncate(s: string, max: number) {
  return s.length > max ? s.slice(0, max) + '…' : s
}
</script>
