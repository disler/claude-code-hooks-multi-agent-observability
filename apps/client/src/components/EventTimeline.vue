<template>
  <div class="flex-1 mobile:h-[50vh] overflow-hidden flex flex-col">
    <!-- Fixed Header -->
    <div class="px-3 py-3 mobile:py-2 bg-[var(--theme-bg-secondary)] border-b border-[var(--theme-border-primary)] relative z-10">
      <h2 class="text-base mobile:text-sm font-semibold text-[var(--theme-text-primary)] text-center" style="letter-spacing: -0.01em;">
        Agent Event Stream
      </h2>

      <!-- Agent/App Tags Row -->
      <div v-if="displayedAgentIds.length > 0" :class="isStudio ? 'studio-agents-section' : 'mt-3 flex flex-wrap gap-2 mobile:gap-1.5 justify-start'">
        <span v-if="isStudio" class="studio-agents-label">Agents</span>
        <button
          v-for="agentId in displayedAgentIds"
          :key="agentId"
          @click="emit('selectAgent', agentId)"
          :class="isStudio
            ? [
                'studio-agent-chip',
                !isAgentActive(agentId) ? 'studio-agent-chip-inactive' : ''
              ]
            : [
                'text-sm mobile:text-xs font-medium px-2.5 mobile:px-2 py-1 rounded-full border transition-all duration-200 cursor-pointer',
                isAgentActive(agentId)
                  ? 'text-[var(--theme-text-primary)] bg-[var(--theme-bg-tertiary)]'
                  : 'text-[var(--theme-text-tertiary)] bg-[var(--theme-bg-tertiary)] opacity-50 hover:opacity-75'
              ]"
          :style="isStudio
            ? undefined
            : {
                borderColor: getHexColorForApp(getAppNameFromAgentId(agentId)),
                backgroundColor: getHexColorForApp(getAppNameFromAgentId(agentId)) + (isAgentActive(agentId) ? '33' : '1a')
              }"
          :title="`${isAgentActive(agentId) ? 'Active: Click to add' : 'Sleeping: No recent events. Click to add'} ${agentId} to comparison lanes`"
        >
          <span :class="isStudio ? 'studio-chip-dot' : 'inline-block w-2 h-2 rounded-full mr-1.5'" :style="{ backgroundColor: getHexColorForApp(getAppNameFromAgentId(agentId)) }"></span>
          <span class="font-mono text-xs">{{ agentId }}</span>
        </button>
      </div>

      <!-- Search Bar -->
      <div :class="isStudio ? 'studio-search-section' : 'mt-3 mobile:mt-2 w-full'">
        <div class="flex items-center gap-2 mobile:gap-1">
          <div class="relative flex-1">
            <input
              type="text"
              :value="searchPattern"
              @input="updateSearchPattern(($event.target as HTMLInputElement).value)"
              :placeholder="isStudio ? 'Search events (regex)...' : 'Search events (regex enabled)... e.g., \'tool.*error\' or \'^GET\''"
              :class="isStudio
                ? [
                    'studio-search-input',
                    searchError ? 'border-[var(--theme-accent-error)]' : ''
                  ]
                : [
                    'w-full px-3 mobile:px-2 py-2 mobile:py-1.5 rounded-lg text-sm mobile:text-xs font-mono border transition-all duration-200',
                    'bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-primary)] placeholder-[var(--theme-text-quaternary)]',
                    'border-[var(--theme-border-primary)] focus:border-[var(--theme-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-primary)]/20',
                    searchError ? 'border-[var(--theme-accent-error)]' : ''
                  ]"
              aria-label="Search events with regex pattern"
            />
            <button
              v-if="searchPattern"
              @click="clearSearch"
              class="absolute right-2 top-1/2 transform -translate-y-1/2 text-[var(--theme-text-tertiary)] hover:text-[var(--theme-primary)] transition-colors duration-200"
              title="Clear search"
              aria-label="Clear search"
            >
              ✕
            </button>
          </div>
        </div>
        <div
          v-if="searchError"
          class="mt-1.5 mobile:mt-1 px-2 py-1.5 mobile:py-1 bg-[var(--theme-accent-error)]/10 border border-[var(--theme-accent-error)] rounded-lg text-xs mobile:text-[11px] text-[var(--theme-accent-error)] font-semibold"
          role="alert"
        >
          <span class="inline-block mr-1">⚠️</span> {{ searchError }}
        </div>
      </div>
    </div>
    
    <!-- Scrollable Event List -->
    <div
      ref="scrollContainer"
      :class="[
        'flex-1 overflow-y-auto relative',
        isStudio ? 'studio-event-list' : 'px-3 py-3 mobile:px-2 mobile:py-1.5'
      ]"
      @scroll="handleScroll"
    >
      <TransitionGroup
        name="event"
        tag="div"
        class="space-y-2 mobile:space-y-1.5"
      >
        <EventRow
          v-for="event in filteredEvents"
          :key="`${event.id}-${event.timestamp}`"
          :event="event"
          :gradient-class="getGradientForSession(event.session_id)"
          :color-class="getColorForSession(event.session_id)"
          :app-gradient-class="getGradientForApp(event.source_app)"
          :app-color-class="getColorForApp(event.source_app)"
          :app-hex-color="getHexColorForApp(event.source_app)"
        />
      </TransitionGroup>
      
      <div v-if="filteredEvents.length === 0" class="text-center py-8 mobile:py-6 text-[var(--theme-text-tertiary)]">
        <div class="text-4xl mobile:text-3xl mb-3">🔳</div>
        <p class="text-lg mobile:text-base font-semibold text-[var(--theme-primary)] mb-1.5">No events to display</p>
        <p class="text-base mobile:text-sm">Events will appear here as they are received</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import type { HookEvent } from '../types';
import EventRow from './EventRow.vue';
import { useEventColors } from '../composables/useEventColors';
import { useEventSearch } from '../composables/useEventSearch';
import { useThemes } from '../composables/useThemes';

const props = defineProps<{
  events: HookEvent[];
  filters: {
    sourceApp: string;
    sessionId: string;
    eventType: string;
  };
  stickToBottom: boolean;
  uniqueAppNames?: string[]; // Agent IDs (app:session) active in current time window
  allAppNames?: string[]; // All agent IDs (app:session) ever seen in session
}>();

const emit = defineEmits<{
  'update:stickToBottom': [value: boolean];
  selectAgent: [agentName: string];
}>();

const scrollContainer = ref<HTMLElement>();
const { getGradientForSession, getColorForSession, getGradientForApp, getColorForApp, getHexColorForApp } = useEventColors();
const { searchPattern, searchError, searchEvents, updateSearchPattern, clearSearch } = useEventSearch();
const { state: themeState } = useThemes();
const isStudio = computed(() => themeState.value.currentTheme === 'studio');

// Use all agent IDs, preferring allAppNames if available (all ever seen), fallback to uniqueAppNames (active in time window)
const displayedAgentIds = computed(() => {
  return props.allAppNames?.length ? props.allAppNames : (props.uniqueAppNames || []);
});

// Extract app name from agent ID (format: "app:session")
const getAppNameFromAgentId = (agentId: string): string => {
  return agentId.split(':')[0];
};

// Check if an agent is currently active (has events in the current time window)
const isAgentActive = (agentId: string): boolean => {
  return (props.uniqueAppNames || []).includes(agentId);
};

const filteredEvents = computed(() => {
  let filtered = props.events.filter(event => {
    if (props.filters.sourceApp && event.source_app !== props.filters.sourceApp) {
      return false;
    }
    if (props.filters.sessionId && event.session_id !== props.filters.sessionId) {
      return false;
    }
    if (props.filters.eventType && event.hook_event_type !== props.filters.eventType) {
      return false;
    }
    return true;
  });

  // Apply regex search filter
  if (searchPattern.value) {
    filtered = searchEvents(filtered, searchPattern.value);
  }

  return filtered;
});

const scrollToBottom = () => {
  if (scrollContainer.value) {
    scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight;
  }
};

const handleScroll = () => {
  if (!scrollContainer.value) return;
  
  const { scrollTop, scrollHeight, clientHeight } = scrollContainer.value;
  const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
  
  if (isAtBottom !== props.stickToBottom) {
    emit('update:stickToBottom', isAtBottom);
  }
};

watch(() => props.events.length, async () => {
  if (props.stickToBottom) {
    await nextTick();
    scrollToBottom();
  }
});

watch(() => props.stickToBottom, (shouldStick) => {
  if (shouldStick) {
    scrollToBottom();
  }
});
</script>

<style scoped>
.event-enter-active {
  transition: all 0.3s ease;
}

.event-enter-from {
  opacity: 0;
  transform: translateY(-20px);
}

.event-leave-active {
  transition: all 0.3s ease;
}

.event-leave-to {
  opacity: 0;
  transform: translateY(20px);
}
</style>