<template>
  <div class="timeline">
    <!-- Header -->
    <div class="tl-head">
      <span class="cap">Event timeline</span>
      <span class="rule"></span>
      <span class="count mono tabular">
        {{ shownCount.toLocaleString() }}<span class="muted"> {{ countSuffix }}</span>
      </span>
      <span class="live" :class="{ off: !hasEvents }"><span class="ld"></span>streaming</span>
    </div>

    <!-- Search -->
    <div class="search-wrap">
      <div class="search" :class="{ 'has-error': !!searchError }">
        <AppIcon name="search" :size="14" class="s-ico" />
        <input
          type="text"
          :value="searchPattern"
          @input="updateSearchPattern(($event.target as HTMLInputElement).value)"
          placeholder="Filter events — regex enabled, e.g. tool.*error"
          aria-label="Search events with regex pattern"
        />
        <button v-if="searchPattern" class="s-clear" @click="clearSearch" title="Clear search" aria-label="Clear search">
          <AppIcon name="x" :size="13" />
        </button>
      </div>
      <div v-if="searchError" class="search-err" role="alert">
        <AppIcon name="alert" :size="12" />
        <span>Invalid pattern<span class="raw mono"> · {{ searchError }}</span></span>
      </div>
    </div>

    <!-- Feed (newest on top) -->
    <div ref="scrollContainer" class="feed" @scroll="handleScroll">
      <TransitionGroup name="event" tag="div" class="feed-list">
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

      <div v-if="filteredEvents.length === 0" class="empty">
        <div class="empty-icon"><AppIcon :name="hasEvents ? 'search' : 'activity'" :size="26" /></div>
        <p class="empty-title">{{ hasEvents ? 'No matching events' : 'Waiting for events' }}</p>
        <p class="empty-sub">{{ hasEvents ? 'Adjust the filters or search above.' : 'Events stream in as your agents emit hook events.' }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import type { HookEvent } from '../types';
import EventRow from './EventRow.vue';
import AppIcon from './AppIcon.vue';
import { useEventColors } from '../composables/useEventColors';
import { useEventSearch } from '../composables/useEventSearch';

const props = defineProps<{
  events: HookEvent[];
  filters: {
    sourceApp: string;
    sessionId: string;
    eventType: string;
  };
  stickToBottom: boolean; // "follow newest" — with newest-on-top this means stick to the TOP
}>();

const emit = defineEmits<{
  'update:stickToBottom': [value: boolean];
}>();

const scrollContainer = ref<HTMLElement>();
const { getGradientForSession, getColorForSession, getGradientForApp, getColorForApp, getHexColorForApp } = useEventColors();
const { searchPattern, searchError, searchEvents, updateSearchPattern, clearSearch } = useEventSearch();

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

  // Newest first: events arrive oldest-first, so reverse for top-of-feed display
  return filtered.slice().reverse();
});

const hasEvents = computed(() => props.events.length > 0);
const shownCount = computed(() => filteredEvents.value.length);
const isNarrowed = computed(() =>
  !!(searchPattern.value || props.filters.sourceApp || props.filters.sessionId || props.filters.eventType)
);
const countSuffix = computed(() =>
  isNarrowed.value ? `of ${props.events.length.toLocaleString()}` : (shownCount.value === 1 ? 'event' : 'events')
);

// Follow newest: with newest-on-top, "following" means pinned to the TOP of the feed
const scrollToNewest = () => {
  if (scrollContainer.value) {
    scrollContainer.value.scrollTop = 0;
  }
};

const handleScroll = () => {
  if (!scrollContainer.value) return;

  const isFollowing = scrollContainer.value.scrollTop < 50;

  if (isFollowing !== props.stickToBottom) {
    emit('update:stickToBottom', isFollowing);
  }
};

watch(() => props.events.length, async () => {
  if (props.stickToBottom) {
    await nextTick();
    scrollToNewest();
  }
});

watch(() => props.stickToBottom, (shouldFollow) => {
  if (shouldFollow) {
    scrollToNewest();
  }
});
</script>

<style scoped>
.timeline {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--surface-canvas);
}

/* Header */
.tl-head {
  display: flex; align-items: center; gap: 10px;
  padding: 11px 16px 10px;
  border-bottom: 1px solid var(--hair-faint);
  flex: none;
}
.tl-head .cap {
  font-size: var(--text-2xs); font-weight: var(--weight-semibold);
  letter-spacing: var(--tracking-caps); text-transform: uppercase; color: var(--text-faint);
  flex: none;
}
.tl-head .rule { height: 1px; flex: 1; background: var(--hair-faint); }
.tl-head .count { font-size: var(--text-xs); color: var(--text-base); flex: none; }
.tl-head .count .muted { color: var(--text-ghost); }
.tl-head .live { display: inline-flex; align-items: center; gap: 6px; font-size: var(--text-2xs); color: var(--text-muted); flex: none; }
.tl-head .live .ld { width: 5px; height: 5px; border-radius: 50%; background: var(--theme-accent-success); }
.tl-head .live.off .ld { background: var(--text-ghost); }

/* Search */
.search-wrap { padding: 10px 16px; border-bottom: 1px solid var(--hair-faint); flex: none; }
.search { position: relative; display: flex; align-items: center; }
.search .s-ico { position: absolute; left: 10px; color: var(--text-faint); pointer-events: none; }
.search input {
  width: 100%; padding: 7px 30px 7px 32px;
  border: 1px solid var(--hair); border-radius: var(--radius-sm);
  background: var(--surface); color: var(--text-strong);
  font-family: var(--font-mono); font-size: var(--text-sm);
  transition: border-color var(--motion-fast);
}
.search input::placeholder { color: var(--text-ghost); font-family: var(--font-sans); }
.search input:focus { outline: none; border-color: var(--theme-primary); }
.search.has-error input { border-color: var(--theme-accent-error); }
.search .s-clear {
  position: absolute; right: 7px; display: inline-flex; padding: 3px;
  border: 0; background: transparent; color: var(--text-faint); cursor: pointer; border-radius: var(--radius-xs);
}
.search .s-clear:hover { color: var(--text-strong); }
.search-err {
  display: flex; align-items: center; gap: 6px; margin-top: 7px;
  color: var(--theme-accent-error); font-size: var(--text-xs);
}
.search-err .raw { color: color-mix(in srgb, var(--theme-accent-error) 70%, var(--text-faint)); }

/* Feed */
.feed { flex: 1; min-height: 0; overflow-y: auto; }
.feed-list { display: flex; flex-direction: column; }

/* Empty state */
.empty { text-align: center; padding: 56px 24px; color: var(--text-muted); }
.empty-icon { display: inline-flex; padding: 14px; border: 1px solid var(--hair-faint); border-radius: var(--radius-lg); color: var(--text-faint); margin-bottom: 14px; }
.empty-title { font-size: var(--text-md); font-weight: var(--weight-semibold); color: var(--text-base); margin: 0 0 4px; }
.empty-sub { font-size: var(--text-sm); color: var(--text-faint); margin: 0; }

/* TransitionGroup — new rows slide in from the top */
.event-enter-active, .event-leave-active { transition: opacity 0.28s var(--ease-out), transform 0.28s var(--ease-out); }
.event-enter-from { opacity: 0; transform: translateY(-10px); }
.event-leave-to { opacity: 0; transform: translateY(8px); }

@media (max-width: 699px) {
  .timeline { height: 50vh; }
}
</style>
