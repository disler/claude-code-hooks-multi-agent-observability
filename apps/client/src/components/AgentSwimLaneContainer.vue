<template>
  <div v-if="selectedAgents.length > 0" class="swim-lane-container">
    <div class="lanes-head">
      <span class="cap">Agent lanes</span>
      <span class="rule"></span>
      <span class="count mono tabular">{{ selectedAgents.length }} <span class="muted">comparing</span></span>
      <button class="clear" @click="clearAll" title="Clear all lanes">
        <AppIcon name="x" :size="13" /><span>Clear</span>
      </button>
    </div>
    <div class="lanes-wrapper">
      <AgentSwimLane
        v-for="agent in selectedAgents"
        :key="agent"
        :agent-name="agent"
        :events="events"
        :time-range="timeRange"
        @close="removeAgent(agent)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { HookEvent, TimeRange } from '../types';
import AgentSwimLane from './AgentSwimLane.vue';
import AppIcon from './AppIcon.vue';

const props = defineProps<{
  selectedAgents: string[];
  events: HookEvent[];
  timeRange: TimeRange;
}>();

const emit = defineEmits<{
  'update:selectedAgents': [agents: string[]];
}>();

function removeAgent(agent: string) {
  const updated = props.selectedAgents.filter(a => a !== agent);
  emit('update:selectedAgents', updated);
}

function clearAll() {
  emit('update:selectedAgents', []);
}
</script>

<style scoped>
.swim-lane-container {
  width: 100%;
  animation: laneIn 0.28s var(--ease-out);
}

@keyframes laneIn {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}

.lanes-head {
  display: flex; align-items: center; gap: 10px;
  margin-bottom: 4px;
}
.lanes-head .cap {
  font-size: var(--text-2xs); font-weight: var(--weight-semibold);
  letter-spacing: var(--tracking-caps); text-transform: uppercase; color: var(--text-faint); flex: none;
}
.lanes-head .rule { height: 1px; flex: 1; background: var(--hair-faint); }
.lanes-head .count { font-size: var(--text-xs); color: var(--text-base); flex: none; }
.lanes-head .count .muted { color: var(--text-ghost); }
.lanes-head .clear {
  display: inline-flex; align-items: center; gap: 5px; flex: none;
  padding: 3px 8px; border: 1px solid var(--hair); border-radius: var(--radius-sm);
  background: transparent; color: var(--text-muted); cursor: pointer;
  font-family: var(--font-sans); font-size: var(--text-2xs); font-weight: var(--weight-medium);
  transition: color var(--motion-fast), border-color var(--motion-fast);
}
.lanes-head .clear:hover { color: var(--theme-accent-error); border-color: color-mix(in srgb, var(--theme-accent-error) 50%, transparent); }

.lanes-wrapper {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-height: 320px;
  overflow-y: auto;
}
.lanes-wrapper > :not(:last-child) { border-bottom: 1px solid var(--hair-faint); }
</style>
