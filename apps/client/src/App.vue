<template>
  <div class="h-screen flex flex-col bg-[var(--theme-bg-secondary)]">
    <!-- Header with Primary Theme Colors -->
    <header class="bg-gradient-to-r from-[var(--theme-primary)] to-[var(--theme-primary-light)] shadow-lg border-b-2 border-[var(--theme-primary-dark)]">
      <div class="px-3 py-4 mobile:py-2 mobile:flex-col mobile:space-y-2 flex items-center justify-between">
        <!-- Title Section -->
        <div class="mobile:w-full mobile:text-center">
          <h1 class="text-2xl mobile:text-lg font-bold text-white drop-shadow-lg">
            {{ t('header.title') }}
          </h1>
        </div>
        
        <!-- Connection Status -->
        <div class="mobile:w-full mobile:justify-center flex items-center space-x-1.5">
          <div v-if="isConnected" class="flex items-center space-x-1.5">
            <span class="relative flex h-3 w-3">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span class="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
            </span>
            <span class="text-base mobile:text-sm text-white font-semibold drop-shadow-md">{{ t('header.connected') }}</span>
          </div>
          <div v-else class="flex items-center space-x-1.5">
            <span class="relative flex h-3 w-3">
              <span class="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
            </span>
            <span class="text-base mobile:text-sm text-white font-semibold drop-shadow-md">{{ t('header.disconnected') }}</span>
          </div>
        </div>
        
        <!-- Event Count and Theme Toggle -->
        <div class="mobile:w-full mobile:justify-center flex items-center space-x-2">
          <span class="text-base mobile:text-sm text-white font-semibold drop-shadow-md bg-[var(--theme-primary-dark)] px-3 py-1.5 rounded-full border border-white/30">
            {{ t('header.eventCount', { count: events.length }) }}
          </span>
          
          <!-- Filters Toggle Button -->
          <button
            @click="showFilters = !showFilters"
            class="p-3 mobile:p-1.5 rounded-lg bg-white/20 hover:bg-white/30 transition-all duration-200 border border-white/30 hover:border-white/50 backdrop-blur-sm shadow-lg hover:shadow-xl"
            :title="showFilters ? t('header.hideFilters') : t('header.showFilters')"
          >
            <span class="text-2xl mobile:text-lg">📊</span>
          </button>
          
          <!-- Theme Manager Button -->
          <button
            @click="handleThemeManagerClick"
            class="p-3 mobile:p-1.5 rounded-lg bg-white/20 hover:bg-white/30 transition-all duration-200 border border-white/30 hover:border-white/50 backdrop-blur-sm shadow-lg hover:shadow-xl"
            :title="t('header.themeManager')"
          >
            <span class="text-2xl mobile:text-lg">🎨</span>
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
      class="fixed bottom-4 left-4 mobile:bottom-3 mobile:left-3 mobile:right-3 bg-red-100 border border-red-400 text-red-700 px-3 py-2 mobile:px-2 mobile:py-1.5 rounded mobile:text-xs"
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
import { ref, computed, onMounted } from 'vue';
import { useWebSocket } from './composables/useWebSocket';
import { useThemes } from './composables/useThemes';
import { useI18n } from './composables/useI18n';
import EventTimeline from './components/EventTimeline.vue';
import FilterPanel from './components/FilterPanel.vue';
import StickScrollButton from './components/StickScrollButton.vue';
import LivePulseChart from './components/LivePulseChart.vue';
import ThemeManager from './components/ThemeManager.vue';

// WebSocket connection - use current host for WSL2 compatibility
const wsUrl = window.location.hostname === 'localhost' 
  ? 'ws://localhost:4000/stream'
  : `ws://${window.location.hostname}:4000/stream`;
const { events, isConnected, error } = useWebSocket(wsUrl);

// Theme management
const { state: themeState } = useThemes();

// i18n
const { t, setLanguage } = useI18n();

onMounted(() => {
  setLanguage();
});

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

// Computed properties
const isDark = computed(() => {
  return themeState.value.currentTheme === 'dark' || 
         (themeState.value.isCustomTheme && 
          themeState.value.customThemes.find(t => t.id === themeState.value.currentTheme)?.name.includes('dark'));
});

// Debug handler for theme manager
const handleThemeManagerClick = () => {
  console.log('Theme manager button clicked!');
  showThemeManager.value = true;
};
</script>
