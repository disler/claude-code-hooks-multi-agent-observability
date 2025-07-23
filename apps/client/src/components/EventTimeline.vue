<template>
  <div class="flex-1 mobile:h-[50vh] overflow-hidden flex flex-col">
    <!-- Event Stream Header -->
    <div class="px-3 py-2.5 mobile:py-2 bg-gradient-to-r from-[var(--theme-bg-primary)] to-[var(--theme-bg-secondary)] shadow-lg">
      <h3 class="text-sm mobile:text-xs font-bold text-[var(--theme-primary)] drop-shadow-sm flex items-center">
        <span class="mr-1 text-base mobile:text-sm">📋</span>
        Event Stream
      </h3>
    </div>
    
    <!-- Scrollable Event List - Compact -->
    <div 
      ref="scrollContainer"
      class="flex-1 overflow-y-auto px-2.5 py-2 mobile:px-2 mobile:py-1 relative"
      @scroll="handleScroll"
    >
      <TransitionGroup
        name="event"
        tag="div"
        class="space-y-1.5 mobile:space-y-1"
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
      
      <div v-if="filteredEvents.length === 0" class="text-center py-6 mobile:py-4 text-[var(--theme-text-tertiary)]">
        <div class="text-3xl mobile:text-2xl mb-2">🔳</div>
        <p class="text-base mobile:text-sm font-semibold text-[var(--theme-primary)] mb-1">No events to display</p>
        <p class="text-sm mobile:text-xs">Events will appear here as they are received</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import type { HookEvent } from '../types';
import EventRow from './EventRow.vue';
import { useEventColors } from '../composables/useEventColors';

const props = defineProps<{
  events: HookEvent[];
  filters: {
    sourceApp: string;
    sessionId: string;
    eventType: string;
  };
  stickToBottom: boolean;
}>();

const emit = defineEmits<{
  'update:stickToBottom': [value: boolean];
}>();

const scrollContainer = ref<HTMLElement>();
const { getGradientForSession, getColorForSession, getGradientForApp, getColorForApp, getHexColorForApp } = useEventColors();

const filteredEvents = computed(() => {
  return props.events.filter(event => {
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