<template>
  <div class="agent-hover-card-wrapper" @mouseenter="show = true" @mouseleave="show = false">
    <slot />
    <div v-if="show && agent" class="agent-hover-card" :style="positionStyle">
      <div class="hover-card-header">
        <span class="hover-card-name">{{ agent.display_name }}</span>
        <span class="hover-card-status" :class="statusClass"></span>
      </div>
      <div class="hover-card-rows">
        <div class="hover-card-row">
          <span class="hover-card-label">Session</span>
          <span class="hover-card-value font-mono">{{ agent.session_id.slice(0, 8) }}</span>
        </div>
        <div v-if="agent.agent_type" class="hover-card-row">
          <span class="hover-card-label">Type</span>
          <AgentTypeBadge :agent-type="agent.agent_type" />
        </div>
        <div v-if="agent.model_name" class="hover-card-row">
          <span class="hover-card-label">Model</span>
          <span class="hover-card-value">{{ agent.model_name }}</span>
        </div>
        <div v-if="agent.team_name" class="hover-card-row">
          <span class="hover-card-label">Team</span>
          <span class="hover-card-value">{{ agent.team_name }}</span>
        </div>
        <div v-if="agent.parent_id" class="hover-card-row">
          <span class="hover-card-label">Parent</span>
          <span class="hover-card-value font-mono">{{ agent.parent_id.slice(0, 12) }}</span>
        </div>
        <div class="hover-card-row">
          <span class="hover-card-label">Started</span>
          <span class="hover-card-value">{{ formatTime(agent.first_seen_at) }}</span>
        </div>
        <div class="hover-card-row">
          <span class="hover-card-label">Duration</span>
          <span class="hover-card-value">{{ duration }}</span>
        </div>
        <div class="hover-card-row">
          <span class="hover-card-label">Events</span>
          <span class="hover-card-value">{{ agent.event_count }}</span>
        </div>
        <div v-if="agent.first_prompt" class="hover-card-prompt">
          <span class="hover-card-label">Prompt</span>
          <span class="hover-card-prompt-text">{{ agent.first_prompt.slice(0, 120) }}{{ agent.first_prompt.length > 120 ? '...' : '' }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { AgentRegistryEntry } from '../types';
import AgentTypeBadge from './AgentTypeBadge.vue';
import { getLifecycleClass, formatDuration } from '../utils/agentHelpers';

const props = defineProps<{
  agent: AgentRegistryEntry | undefined;
  position?: 'top' | 'bottom';
}>();

const show = ref(false);

const positionStyle = computed(() => {
  if (props.position === 'top') {
    return { bottom: '100%', left: '0', marginBottom: '8px' };
  }
  return { top: '100%', left: '0', marginTop: '8px' };
});

const statusClass = computed(() => {
  if (!props.agent) return '';
  return getLifecycleClass(props.agent.lifecycle_status);
});

const duration = computed(() => {
  if (!props.agent) return '--';
  return formatDuration(props.agent.last_seen_at - props.agent.first_seen_at);
});

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString();
}
</script>

<style scoped>
.agent-hover-card-wrapper {
  position: relative;
  display: inline-flex;
}

.agent-hover-card {
  position: absolute;
  z-index: 50;
  min-width: 260px;
  max-width: 320px;
  background: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border-primary);
  border-radius: 8px;
  padding: 10px 12px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  pointer-events: none;
}

.hover-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--theme-border-primary);
}

.hover-card-name {
  font-size: 13px;
  font-weight: 700;
  color: var(--theme-text-primary);
}

.hover-card-status {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-active { background-color: #22C55E; }
.status-completed { background-color: #6B7280; }
.status-errored { background-color: #EF4444; }
.status-idle { background-color: #F59E0B; }

.hover-card-rows {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.hover-card-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.hover-card-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--theme-text-tertiary);
  white-space: nowrap;
}

.hover-card-value {
  font-size: 11px;
  color: var(--theme-text-secondary);
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hover-card-prompt {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px solid var(--theme-border-primary);
}

.hover-card-prompt-text {
  font-size: 11px;
  color: var(--theme-text-secondary);
  font-style: italic;
  line-height: 1.4;
  word-break: break-word;
}
</style>
