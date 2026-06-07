<template>
  <div v-if="displayedAgentIds.length > 0" class="agent-chips-panel">
    <div class="chips-head">
      <span class="cap">Agents</span>
      <span class="rule"></span>
      <span class="count mono tabular">{{ activeCount }} <span class="muted">active</span></span>
    </div>
    <div class="chips">
      <button
        v-for="agentId in displayedAgentIds"
        :key="agentId"
        class="chip-agent"
        :class="{ sleeping: !isAgentActive(agentId) }"
        :style="{ '--c': getHexColorForApp(getAppNameFromAgentId(agentId)) }"
        @click="emit('selectAgent', agentId)"
        :title="`${isAgentActive(agentId) ? 'Active' : 'Sleeping'} · click to add/remove ${agentId} in comparison lanes`"
      >
        <span class="cdot"></span>
        <span class="mono">{{ agentId }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useEventColors } from '../composables/useEventColors';

const props = defineProps<{
  uniqueAppNames?: string[]; // Agent IDs (app:session) active in current time window
  allAppNames?: string[];    // All agent IDs (app:session) ever seen in session
}>();

const emit = defineEmits<{
  selectAgent: [agentName: string];
}>();

const { getHexColorForApp } = useEventColors();

// Prefer all agents ever seen, fall back to the active set
const displayedAgentIds = computed(() => {
  return props.allAppNames?.length ? props.allAppNames : (props.uniqueAppNames || []);
});

const getAppNameFromAgentId = (agentId: string): string => agentId.split(':')[0];
const isAgentActive = (agentId: string): boolean => (props.uniqueAppNames || []).includes(agentId);
const activeCount = computed(() => (props.uniqueAppNames || []).length);
</script>

<style scoped>
.agent-chips-panel { padding: 12px 16px 4px; }
.chips-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.chips-head .cap {
  font-size: var(--text-2xs); font-weight: var(--weight-semibold);
  letter-spacing: var(--tracking-caps); text-transform: uppercase; color: var(--text-faint); flex: none;
}
.chips-head .rule { height: 1px; flex: 1; background: var(--hair-faint); }
.chips-head .count { font-size: var(--text-xs); color: var(--text-base); flex: none; }
.chips-head .count .muted { color: var(--text-ghost); }

.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip-agent {
  display: inline-flex; align-items: center; gap: 7px;
  padding: 3px 9px; border-radius: var(--radius-full);
  border: 1px solid color-mix(in srgb, var(--c) 42%, transparent);
  background: color-mix(in srgb, var(--c) 12%, transparent);
  color: var(--text-base); cursor: pointer;
  font-size: var(--text-xs);
  transition: background var(--motion-fast), border-color var(--motion-fast), opacity var(--motion-fast);
}
.chip-agent:hover { border-color: color-mix(in srgb, var(--c) 70%, transparent); }
.chip-agent .cdot { width: 7px; height: 7px; border-radius: 50%; background: var(--c); flex: none; }
.chip-agent.sleeping { opacity: 0.5; background: transparent; }
.chip-agent.sleeping .cdot { background: transparent; border: 1.5px solid var(--c); }
.chip-agent .mono { font-size: var(--text-xs); }
</style>
