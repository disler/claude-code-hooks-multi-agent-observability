<template>
  <div class="h-screen flex flex-col bg-[var(--theme-bg-secondary)]">
    <!-- Header with Primary Theme Colors -->
    <header class="short:hidden bg-[var(--theme-bg-secondary)] border-b border-[var(--theme-border-primary)]">
      <div class="px-3 py-3 mobile:py-1.5 mobile:px-2 flex items-center justify-between mobile:gap-2">
        <!-- Title Section - Hidden on mobile -->
        <div class="mobile:hidden">
          <h1 class="text-[17px] font-bold text-[var(--theme-text-primary)]" style="letter-spacing: -0.02em;">
            Multi-Agent Observability
          </h1>
        </div>

        <!-- Connection Status -->
        <div class="flex items-center mobile:space-x-1 space-x-1.5">
          <div v-if="isConnected" class="flex items-center mobile:space-x-0.5 space-x-1.5">
            <span class="relative flex mobile:h-1.5 mobile:w-1.5 h-2 w-2">
              <span class="relative inline-flex rounded-full mobile:h-1.5 mobile:w-1.5 h-2 w-2 bg-green-500"></span>
            </span>
            <span class="text-sm mobile:text-xs text-[var(--theme-text-secondary)] font-medium mobile:hidden">Connected</span>
          </div>
          <div v-else class="flex items-center mobile:space-x-0.5 space-x-1.5">
            <span class="relative flex mobile:h-1.5 mobile:w-1.5 h-2 w-2">
              <span class="relative inline-flex rounded-full mobile:h-1.5 mobile:w-1.5 h-2 w-2 bg-red-500"></span>
            </span>
            <span class="text-sm mobile:text-xs text-[var(--theme-text-secondary)] font-medium mobile:hidden">Disconnected</span>
          </div>
        </div>

        <!-- Event Count and Theme Toggle -->
        <div class="flex items-center mobile:space-x-1 space-x-2">
          <span class="text-sm mobile:text-xs text-[var(--theme-text-secondary)] font-medium bg-[var(--theme-bg-tertiary)] mobile:px-2 mobile:py-0.5 px-2.5 py-1 rounded-full border border-[var(--theme-border-primary)]">
            {{ events.length }}
          </span>

          <!-- Clear Button -->
          <button
            @click="handleClearClick"
            class="p-2 mobile:p-1 rounded-lg bg-[var(--theme-bg-secondary)] hover:bg-[var(--theme-bg-tertiary)] transition-all duration-200 border border-[var(--theme-border-primary)] hover:border-[var(--theme-border-secondary)]"
            title="Clear events"
          >
            <svg class="w-5 h-5 mobile:w-4 mobile:h-4 text-[var(--theme-text-tertiary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          </button>

          <!-- Filters Toggle Button -->
          <button
            @click="showFilters = !showFilters"
            class="p-2 mobile:p-1 rounded-lg bg-[var(--theme-bg-secondary)] hover:bg-[var(--theme-bg-tertiary)] transition-all duration-200 border border-[var(--theme-border-primary)] hover:border-[var(--theme-border-secondary)]"
            :title="showFilters ? 'Hide filters' : 'Show filters'"
          >
            <svg class="w-5 h-5 mobile:w-4 mobile:h-4 text-[var(--theme-text-tertiary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"/></svg>
          </button>

          <!-- Theme Manager Button -->
          <button
            @click="handleThemeManagerClick"
            class="p-2 mobile:p-1 rounded-lg bg-[var(--theme-bg-secondary)] hover:bg-[var(--theme-bg-tertiary)] transition-all duration-200 border border-[var(--theme-border-primary)] hover:border-[var(--theme-border-secondary)]"
            title="Open theme manager"
          >
            <svg class="w-5 h-5 mobile:w-4 mobile:h-4 text-[var(--theme-text-tertiary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"/></svg>
          </button>
        </div>
      </div>
    </header>
    
    <!-- Filters -->
    <FilterPanel
      v-if="showFilters"
      class="short:hidden"
      :filters="filters"
      @update:filters="filters = $event"
    />
    
    <!-- Live Pulse Chart -->
    <LivePulseChart
      :events="events"
      :filters="filters"
      @update-unique-apps="uniqueAppNames = $event"
      @update-all-apps="allAppNames = $event"
      @update-time-range="currentTimeRange = $event"
    />

    <!-- Agent Swim Lane Container (below pulse chart, full width, hidden when empty) -->
    <div v-if="selectedAgentLanes.length > 0" class="w-full bg-[var(--theme-bg-secondary)] px-3 py-4 mobile:px-2 mobile:py-2 overflow-hidden">
      <AgentSwimLaneContainer
        :selected-agents="selectedAgentLanes"
        :events="events"
        :time-range="currentTimeRange"
        :agent-registry="agentRegistry"
        @update:selected-agents="selectedAgentLanes = $event"
      />
    </div>
    
    <!-- Timeline -->
    <div class="flex flex-col flex-1 overflow-hidden">
      <EventTimeline
        :events="events"
        :filters="filters"
        :unique-app-names="uniqueAppNames"
        :all-app-names="allAppNames"
        :agent-registry="agentRegistry"
        v-model:stick-to-bottom="stickToBottom"
        @select-agent="toggleAgentLane"
      />
    </div>
    
    <!-- Stick to bottom button -->
    <StickScrollButton
      class="short:hidden"
      :stick-to-bottom="stickToBottom"
      @toggle="stickToBottom = !stickToBottom"
    />
    
    <!-- Error message -->
    <div
      v-if="error"
      class="fixed bottom-4 left-4 mobile:bottom-3 mobile:left-3 mobile:right-3 bg-red-100 border border-red-400 text-red-700 px-3 py-2 mobile:px-2 mobile:py-1.5 rounded mobile:text-xs"
    >
      {{ error }}
    </div>
    
    <!-- Theme Manager -->
    <ThemeManager
      :is-open="showThemeManager"
      @close="showThemeManager = false"
    />

    <!-- Toast Notifications -->
    <ToastNotification
      v-for="(toast, index) in toasts"
      :key="toast.id"
      :index="index"
      :agent-name="toast.agentName"
      :agent-color="toast.agentColor"
      @dismiss="dismissToast(toast.id)"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import type { TimeRange } from './types';
import { useWebSocket } from './composables/useWebSocket';
import { useAgentRegistry } from './composables/useAgentRegistry';
import { useThemes } from './composables/useThemes';
import { useEventColors } from './composables/useEventColors';
import EventTimeline from './components/EventTimeline.vue';
import FilterPanel from './components/FilterPanel.vue';
import StickScrollButton from './components/StickScrollButton.vue';
import LivePulseChart from './components/LivePulseChart.vue';
import ThemeManager from './components/ThemeManager.vue';
import ToastNotification from './components/ToastNotification.vue';
import AgentSwimLaneContainer from './components/AgentSwimLaneContainer.vue';
import { WS_URL } from './config';

// WebSocket connection
const { events, isConnected, error, clearEvents, setAgentHandlers } = useWebSocket(WS_URL);

// Agent registry
const { agents: agentRegistry, fetchAgents, handleAgentUpdate, handleAgentRegistry } = useAgentRegistry();

// Wire agent WebSocket handlers
setAgentHandlers(handleAgentUpdate, handleAgentRegistry);

// Fetch agents on mount
onMounted(() => {
  fetchAgents();
});

// Theme management (sets up theme system)
useThemes();

// Event colors
const { getHexColorForApp } = useEventColors();

// Filters
const filters = ref({
  sourceApp: '',
  sessionId: '',
  eventType: ''
});

// UI state
const stickToBottom = ref(true);
const showThemeManager = ref(false);
const showFilters = ref(false);
const uniqueAppNames = ref<string[]>([]); // Apps active in current time window
const allAppNames = ref<string[]>([]); // All apps ever seen in session
const selectedAgentLanes = ref<string[]>([]);
const currentTimeRange = ref<TimeRange>('1m'); // Current time range from LivePulseChart

// Toast notifications
interface Toast {
  id: number;
  agentName: string;
  agentColor: string;
}
const toasts = ref<Toast[]>([]);
let toastIdCounter = 0;
const seenAgents = new Set<string>();

// Watch for new agents and show toast
watch(uniqueAppNames, (newAppNames) => {
  // Find agents that are new (not in seenAgents set)
  newAppNames.forEach(appName => {
    if (!seenAgents.has(appName)) {
      seenAgents.add(appName);
      // Show toast for new agent
      const toast: Toast = {
        id: toastIdCounter++,
        agentName: appName,
        agentColor: getHexColorForApp(appName)
      };
      toasts.value.push(toast);
    }
  });
}, { deep: true });

const dismissToast = (id: number) => {
  const index = toasts.value.findIndex(t => t.id === id);
  if (index !== -1) {
    toasts.value.splice(index, 1);
  }
};

// Handle agent tag clicks for swim lanes
const toggleAgentLane = (agentName: string) => {
  const index = selectedAgentLanes.value.indexOf(agentName);
  if (index >= 0) {
    // Remove from comparison
    selectedAgentLanes.value.splice(index, 1);
  } else {
    // Add to comparison
    selectedAgentLanes.value.push(agentName);
  }
};

// Handle clear button click
const handleClearClick = () => {
  clearEvents();
  selectedAgentLanes.value = [];
};

// Debug handler for theme manager
const handleThemeManagerClick = () => {
  console.log('Theme manager button clicked!');
  showThemeManager.value = true;
};
</script>