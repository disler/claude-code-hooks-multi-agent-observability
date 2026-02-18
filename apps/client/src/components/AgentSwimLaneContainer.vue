<template>
  <div v-if="selectedAgents.length > 0" class="swim-lane-container">
    <!-- Grouped by team when registry available -->
    <template v-if="hasGroups">
      <div v-for="[teamName, teamAgents] in groupedAgents.teams" :key="teamName" class="team-section">
        <div class="team-header" :style="{ borderLeftColor: teamColor(teamName) }">
          <span class="team-header-label">{{ teamName }}</span>
        </div>
        <div class="lanes-wrapper">
          <AgentSwimLane
            v-for="agent in teamAgents"
            :key="agent"
            :agent-name="agent"
            :events="events"
            :time-range="timeRange"
            :registry-entry="getRegistryEntry(agent)"
            @close="removeAgent(agent)"
          />
        </div>
      </div>
      <div v-if="groupedAgents.standalone.length > 0" class="team-section">
        <div class="team-header" style="border-left-color: #6B7280;">
          <span class="team-header-label">Standalone</span>
        </div>
        <div class="lanes-wrapper">
          <AgentSwimLane
            v-for="agent in groupedAgents.standalone"
            :key="agent"
            :agent-name="agent"
            :events="events"
            :time-range="timeRange"
            :registry-entry="getRegistryEntry(agent)"
            @close="removeAgent(agent)"
          />
        </div>
      </div>
    </template>

    <!-- Flat layout when no registry -->
    <div v-else class="lanes-wrapper">
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
import { computed } from 'vue';
import type { HookEvent, TimeRange, AgentRegistryEntry } from '../types';
import AgentSwimLane from './AgentSwimLane.vue';

const props = defineProps<{
  selectedAgents: string[];
  events: HookEvent[];
  timeRange: TimeRange;
  agentRegistry?: Map<string, AgentRegistryEntry>;
}>();

const emit = defineEmits<{
  'update:selectedAgents': [agents: string[]];
}>();

function removeAgent(agent: string) {
  const updated = props.selectedAgents.filter(a => a !== agent);
  emit('update:selectedAgents', updated);
}

function getRegistryEntry(agentId: string): AgentRegistryEntry | undefined {
  if (!props.agentRegistry || props.agentRegistry.size === 0) return undefined;
  for (const entry of props.agentRegistry.values()) {
    const entryAgentId = `${entry.source_app}:${entry.session_id.slice(0, 8)}`;
    if (entryAgentId === agentId) return entry;
  }
  return undefined;
}

const hasGroups = computed(() => {
  return props.agentRegistry && props.agentRegistry.size > 0;
});

const groupedAgents = computed(() => {
  const teams = new Map<string, string[]>();
  const standalone: string[] = [];

  for (const agentId of props.selectedAgents) {
    const entry = getRegistryEntry(agentId);
    if (entry?.team_name) {
      if (!teams.has(entry.team_name)) teams.set(entry.team_name, []);
      teams.get(entry.team_name)!.push(agentId);
    } else {
      standalone.push(agentId);
    }
  }

  return { teams, standalone };
});

const teamColors = ['#3B82F6', '#8B5CF6', '#22C55E', '#F97316', '#EC4899', '#14B8A6', '#EAB308'];

function teamColor(teamName: string): string {
  let hash = 0;
  for (let i = 0; i < teamName.length; i++) {
    hash = ((hash << 5) - hash) + teamName.charCodeAt(i);
    hash |= 0;
  }
  return teamColors[Math.abs(hash) % teamColors.length];
}
</script>

<style scoped>
.swim-lane-container {
  width: 100%;
  animation: slideIn 0.3s ease;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.team-section {
  margin-bottom: 8px;
}

.team-header {
  border-left: 3px solid;
  padding: 2px 0 2px 8px;
  margin-bottom: 4px;
}

.team-header-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--theme-text-tertiary);
}

.lanes-wrapper {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}
</style>
