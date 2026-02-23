<template>
  <span class="agent-type-badge" :style="{ backgroundColor: badgeColor + '22', color: badgeColor, borderColor: badgeColor + '44' }">
    {{ agentType }}
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  agentType: string;
}>();

const colorMap: Record<string, string> = {
  'Engineer': '#3B82F6',
  'QATester': '#22C55E',
  'Explore': '#8B5CF6',
  'builder': '#F97316',
  'general-purpose': '#6B7280',
  'Architect': '#EC4899',
  'Designer': '#14B8A6',
  'Intern': '#EAB308',
  'lead': '#F59E0B',
  'Bash': '#64748B',
  'Plan': '#6366F1',
};

const badgeColor = computed(() => colorMap[props.agentType] || '#6B7280');
</script>

<style scoped>
.agent-type-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 600;
  border: 1px solid;
  white-space: nowrap;
}
</style>
