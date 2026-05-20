<template>
  <div class="evt-list">
    <div
      ref="scrollContainer"
      class="evt-list__scroll"
      @scroll="handleScroll"
    >
      <TransitionGroup
        name="event"
        tag="div"
        class="evt-list__rows"
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

      <div v-if="filteredEvents.length === 0" class="evt-list__empty">
        <p class="evt-list__empty-title">No events</p>
        <p class="evt-list__empty-sub">Events stream in here as agents fire hooks.</p>
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

const props = defineProps<{
  events: HookEvent[];
  filters: { sourceApp: string; sessionId: string; eventType: string };
  searchPattern?: string;
  stickToBottom: boolean;
}>();

const emit = defineEmits<{
  'update:stickToBottom': [value: boolean];
}>();

const scrollContainer = ref<HTMLElement>();
const { getGradientForSession, getColorForSession, getGradientForApp, getColorForApp, getHexColorForApp } = useEventColors();
const { searchEvents } = useEventSearch();

const filteredEvents = computed(() => {
  let filtered = props.events.filter(e => {
    if (props.filters.sourceApp && e.source_app !== props.filters.sourceApp) return false;
    if (props.filters.sessionId && e.session_id !== props.filters.sessionId) return false;
    if (props.filters.eventType && e.hook_event_type !== props.filters.eventType) return false;
    return true;
  });
  if (props.searchPattern) filtered = searchEvents(filtered, props.searchPattern);
  return filtered;
});

const scrollToBottom = () => {
  if (scrollContainer.value) scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight;
};

const handleScroll = () => {
  if (!scrollContainer.value) return;
  const { scrollTop, scrollHeight, clientHeight } = scrollContainer.value;
  const atBottom = scrollHeight - scrollTop - clientHeight < 50;
  if (atBottom !== props.stickToBottom) emit('update:stickToBottom', atBottom);
};

watch(() => props.events.length, async () => {
  if (props.stickToBottom) {
    await nextTick();
    scrollToBottom();
  }
});

watch(() => props.stickToBottom, (s) => { if (s) scrollToBottom(); });
</script>

<style scoped>
.evt-list {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.evt-list__scroll {
  flex: 1;
  overflow-y: auto;
  padding: 6px 12px 8px;
  position: relative;
}
.evt-list__rows {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
@media (max-width: 699px) {
  .evt-list__scroll { padding: 4px 10px 8px; }
}

.event-enter-active,
.event-leave-active { transition: all 0.18s ease; }
.event-enter-from { opacity: 0; transform: translateY(-4px); }
.event-leave-to { opacity: 0; transform: translateY(4px); }

.evt-list__empty {
  padding: 32px 16px;
  text-align: center;
}
.evt-list__empty-title {
  margin: 0 0 4px;
  font-size: 13px;
  font-weight: 600;
  color: var(--theme-text-primary);
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif;
}
.evt-list__empty-sub {
  margin: 0;
  font-size: 12px;
  color: var(--theme-text-tertiary);
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif;
}
</style>
