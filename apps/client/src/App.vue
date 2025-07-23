<template>
  <div class="h-screen flex flex-col bg-[var(--theme-bg-secondary)]">
    <!-- Header with Subdued Theme Colors - Compact Design -->
    <header class="bg-gradient-to-r from-[var(--theme-bg-tertiary)] to-[var(--theme-bg-quaternary)] shadow-lg border-b-2 border-[var(--theme-border-secondary)]">
      <div class="px-3 py-2.5 mobile:py-1.5 flex items-center justify-between">
        <!-- Title and Connection Status - Left Side -->
        <div class="flex items-center space-x-2 mobile:space-x-1.5">
          <h1 class="text-xl mobile:text-base font-bold text-white drop-shadow-lg">
            M.A.O.
          </h1>
          
          <!-- Connection Status Dot -->
          <div v-if="isConnected" class="flex items-center" title="Connected">
            <span class="relative flex h-3 w-3 mobile:h-2.5 mobile:w-2.5">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span class="relative inline-flex rounded-full h-3 w-3 mobile:h-2.5 mobile:w-2.5 bg-green-500"></span>
            </span>
          </div>
          <div v-else class="flex items-center" title="Disconnected">
            <span class="relative flex h-3 w-3 mobile:h-2.5 mobile:w-2.5">
              <span class="relative inline-flex rounded-full h-3 w-3 mobile:h-2.5 mobile:w-2.5 bg-red-500"></span>
            </span>
          </div>
        </div>
        
        <!-- Event Count and Control Buttons - Right Side -->
        <div class="flex items-center space-x-1.5 mobile:space-x-1">
          <span class="text-sm mobile:text-xs mobile:hidden text-white font-semibold drop-shadow-md bg-[var(--theme-bg-secondary)] px-2.5 py-1 mobile:px-2 mobile:py-0.5 rounded-full border border-white/30">
            {{ events.length }} events
          </span>
          
          <!-- Filters Toggle Button -->
          <button
            @click="showFilters = !showFilters"
            class="p-2 mobile:p-1.5 rounded-lg bg-white/20 hover:bg-white/30 transition-all duration-200 border border-white/30 hover:border-white/50 backdrop-blur-sm shadow-lg hover:shadow-xl"
            :title="showFilters ? 'Hide filters' : 'Show filters'"
          >
            <span class="text-lg mobile:text-sm">📊</span>
          </button>
          
          <!-- Theme Manager Button -->
          <button
            @click="handleThemeManagerClick"
            class="p-2 mobile:p-1.5 rounded-lg bg-white/20 hover:bg-white/30 transition-all duration-200 border border-white/30 hover:border-white/50 backdrop-blur-sm shadow-lg hover:shadow-xl"
            title="Open theme manager"
          >
            <span class="text-lg mobile:text-sm">🎨</span>
          </button>
        </div>
      </div>
    </header>
    
    <!-- Filters -->
    <FilterPanel
      v-if="showFilters"
      :filters="filters"
      @update:filters="filters = $event"
    />
    
    <!-- Live Pulse Chart -->
    <LivePulseChart
      :events="events"
      :filters="filters"
    />
    
    <!-- Timeline -->
    <EventTimeline
      :events="events"
      :filters="filters"
      v-model:stick-to-bottom="stickToBottom"
    />
    
    <!-- Stick to bottom button -->
    <StickScrollButton
      :stick-to-bottom="stickToBottom"
      @toggle="stickToBottom = !stickToBottom"
    />
    
    <!-- Error message -->
    <div
      v-if="error"
      class="fixed bottom-3 left-3 mobile:bottom-2 mobile:left-2 mobile:right-2 bg-red-100 border border-red-400 text-red-700 px-2.5 py-1.5 mobile:px-2 mobile:py-1 rounded text-sm mobile:text-xs"
    >
      {{ error }}
    </div>
    
    <!-- Theme Manager -->
    <ThemeManager 
      :is-open="showThemeManager"
      @close="showThemeManager = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useWebSocket } from './composables/useWebSocket';
import { useThemes } from './composables/useThemes';
import EventTimeline from './components/EventTimeline.vue';
import FilterPanel from './components/FilterPanel.vue';
import StickScrollButton from './components/StickScrollButton.vue';
import LivePulseChart from './components/LivePulseChart.vue';
import ThemeManager from './components/ThemeManager.vue';
import { WS_URL } from './config';

// WebSocket connection
const { events, isConnected, error } = useWebSocket(WS_URL);

// Theme management - Initialize themes
const { initializeTheme } = useThemes();

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

// Computed properties (keeping for future use)
// const isDark = computed(() => {
//   return themeState.value.currentTheme === 'dark' || 
//          (themeState.value.isCustomTheme && 
//           themeState.value.customThemes.find(t => t.id === themeState.value.currentTheme)?.name.includes('dark'));
// });

// Debug handler for theme manager
const handleThemeManagerClick = () => {
  console.log('Theme manager button clicked!');
  showThemeManager.value = true;
};

// Initialize theme on mount
onMounted(() => {
  initializeTheme();
});
</script>