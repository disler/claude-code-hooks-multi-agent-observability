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
import { computed } from 'vue'
import AgentStatusBadge from './AgentStatusBadge.vue'
import type { SessionState } from '../types'

const props = defineProps<{ session: SessionState }>()

const shortId = computed(() => props.session.session_id.slice(0, 8))

function truncate(s: string, max: number) {
  return s.length > max ? s.slice(0, max) + '…' : s
}
</script>
