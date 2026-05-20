<template>
  <div class="activity-panel">
    <!-- Toolbar: Filters / Clear / segctrl / count -->
    <div class="activity-toolbar">
      <button class="atb-pill" :class="{ 'is-on': showFilters }" @click="showFilters = !showFilters">Filters</button>
      <button class="atb-pill" @click="handleClearClick">Clear</button>

      <div class="atlas-segctrl" role="tablist" aria-label="Time range">
        <button
          v-for="r in timeRanges"
          :key="r"
          class="atlas-segctrl__btn"
          :class="{ 'is-active': currentTimeRange === r }"
          @click="currentTimeRange = r"
          role="tab"
          :aria-selected="currentTimeRange === r"
        >{{ r }}</button>
      </div>

      <span class="activity-toolbar__spacer"></span>
      <span class="activity-toolbar__count">{{ filteredCount }} of {{ events.length }} events</span>
    </div>

    <FilterPanel
      v-if="showFilters"
      :filters="filters"
      @update:filters="filters = $event"
    />

    <!-- Pulse + agent pills + search header strip -->
    <LivePulseChart
      :events="events"
      :filters="filters"
      :time-range="currentTimeRange"
      @update-unique-apps="uniqueAppNames = $event"
      @update-all-apps="allAppNames = $event"
      @update-time-range="currentTimeRange = $event"
    />

    <div class="activity-pills" v-if="displayedAgentIds.length">
      <button
        v-for="agentId in displayedAgentIds"
        :key="agentId"
        @click="toggleAgentLane(agentId)"
        class="atlas-pill"
        :class="{ 'is-inactive': !isAgentActive(agentId), 'is-on': selectedAgentLanes.includes(agentId) }"
        :style="{ '--pill-accent': getHexColorForApp(getAppNameFromAgentId(agentId)) }"
        :title="agentId"
      >
        <span class="atlas-pill__dot"></span>
        <span class="atlas-pill__label">{{ agentId }}</span>
      </button>
    </div>

    <div class="activity-search">
      <svg class="activity-search__icon" width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6" cy="6" r="4.5"/><path d="m12 12-2.5-2.5"/></svg>
      <input
        type="text"
        v-model="searchInput"
        placeholder="Search events — regex (e.g. ^GET)"
        class="activity-search__input"
        :class="{ 'is-error': !!searchErrorMsg }"
      />
      <button v-if="searchInput" class="activity-search__clear" @click="searchInput = ''" aria-label="Clear">✕</button>
    </div>
    <div v-if="searchErrorMsg" class="activity-search__error">{{ searchErrorMsg }}</div>

    <!-- Swim lanes -->
    <div v-if="selectedAgentLanes.length > 0" class="activity-lanes">
      <AgentSwimLaneContainer
        :selected-agents="selectedAgentLanes"
        :events="events"
        :time-range="currentTimeRange"
        @update:selected-agents="selectedAgentLanes = $event"
      />
    </div>

    <!-- Event timeline -->
    <EventTimeline
      :events="events"
      :filters="filters"
      :search-pattern="validatedSearch"
      v-model:stick-to-bottom="stickToBottom"
      @select-agent="toggleAgentLane"
    />

    <StickScrollButton
      class="short:hidden"
      :stick-to-bottom="stickToBottom"
      @toggle="stickToBottom = !stickToBottom"
    />

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
import { computed, ref, watch } from 'vue';
import type { HookEvent, TimeRange } from '../types';
import { useEventColors } from '../composables/useEventColors';
import { useEventSearch } from '../composables/useEventSearch';
import FilterPanel from '../components/FilterPanel.vue';
import LivePulseChart from '../components/LivePulseChart.vue';
import AgentSwimLaneContainer from '../components/AgentSwimLaneContainer.vue';
import EventTimeline from '../components/EventTimeline.vue';
import StickScrollButton from '../components/StickScrollButton.vue';
import ToastNotification from '../components/ToastNotification.vue';

const props = defineProps<{ events: HookEvent[] }>();
const emit = defineEmits<{ (e: 'clear-events'): void }>();

const { getHexColorForApp } = useEventColors();
const { searchEvents, searchError } = useEventSearch();

const filters = ref({ sourceApp: '', sessionId: '', eventType: '' });
const showFilters = ref(false);
const stickToBottom = ref(true);
const uniqueAppNames = ref<string[]>([]);
const allAppNames = ref<string[]>([]);
const selectedAgentLanes = ref<string[]>([]);
const currentTimeRange = ref<TimeRange>('1m');
const searchInput = ref('');
const timeRanges: TimeRange[] = ['1m', '3m', '5m', '10m'];

const validatedSearch = computed(() => searchInput.value.trim());
const searchErrorMsg = computed(() => searchError.value);

const displayedAgentIds = computed(() => allAppNames.value.length ? allAppNames.value : uniqueAppNames.value);
const getAppNameFromAgentId = (agentId: string) => agentId.split(':')[0];
const isAgentActive = (agentId: string) => uniqueAppNames.value.includes(agentId);

const filteredCount = computed(() => {
  let list = props.events.filter(e => {
    if (filters.value.sourceApp && e.source_app !== filters.value.sourceApp) return false;
    if (filters.value.sessionId && e.session_id !== filters.value.sessionId) return false;
    if (filters.value.eventType && e.hook_event_type !== filters.value.eventType) return false;
    return true;
  });
  if (validatedSearch.value) list = searchEvents(list, validatedSearch.value);
  return list.length;
});

interface Toast { id: number; agentName: string; agentColor: string; }
const toasts = ref<Toast[]>([]);
let toastIdCounter = 0;
const seenAgents = new Set<string>();
watch(uniqueAppNames, (newAppNames) => {
  newAppNames.forEach(appName => {
    if (!seenAgents.has(appName)) {
      seenAgents.add(appName);
      toasts.value.push({ id: toastIdCounter++, agentName: appName, agentColor: getHexColorForApp(appName) });
    }
  });
}, { deep: true });
const dismissToast = (id: number) => {
  const i = toasts.value.findIndex(t => t.id === id);
  if (i !== -1) toasts.value.splice(i, 1);
};

const toggleAgentLane = (agentName: string) => {
  const i = selectedAgentLanes.value.indexOf(agentName);
  if (i >= 0) selectedAgentLanes.value.splice(i, 1);
  else selectedAgentLanes.value.push(agentName);
};

const handleClearClick = () => {
  emit('clear-events');
  selectedAgentLanes.value = [];
};
</script>

<style scoped>
.activity-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--theme-bg-secondary);
}

.activity-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  background: var(--theme-bg-primary);
  border-bottom: 1px solid var(--theme-border-primary);
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif;
}
@media (max-width: 699px) {
  .activity-toolbar { padding: 6px 10px; }
}

.atb-pill {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 10px;
  font-size: 11px;
  font-weight: 500;
  font-family: inherit;
  color: var(--theme-text-secondary);
  background: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border-primary);
  border-radius: 999px;
  cursor: pointer;
  transition: background-color 0.12s ease, color 0.12s ease, border-color 0.12s ease;
}
.atb-pill:hover { background: var(--theme-bg-tertiary); color: var(--theme-text-primary); }
.atb-pill.is-on {
  background: var(--theme-primary-light);
  color: var(--theme-primary);
  border-color: rgba(10, 132, 255, 0.35);
}

.atlas-segctrl {
  display: inline-flex;
  padding: 2px;
  background: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border-primary);
  border-radius: 6px;
}
.atlas-segctrl__btn {
  padding: 2px 8px;
  font-size: 10.5px;
  font-weight: 500;
  color: var(--theme-text-tertiary);
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-variant-numeric: tabular-nums;
}
.atlas-segctrl__btn:hover { color: var(--theme-text-primary); }
.atlas-segctrl__btn.is-active {
  background: var(--theme-bg-primary);
  color: var(--theme-text-primary);
}

.activity-toolbar__spacer { flex: 1 1 auto; }
.activity-toolbar__count {
  font-size: 10.5px;
  color: var(--theme-text-tertiary);
  font-variant-numeric: tabular-nums;
}

.activity-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 6px 14px;
  background: var(--theme-bg-primary);
  border-bottom: 1px solid var(--theme-border-primary);
}
@media (max-width: 699px) {
  .activity-pills { padding: 6px 10px; }
}
.atlas-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 8px 2px 6px;
  font-size: 10.5px;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  font-weight: 500;
  color: var(--theme-text-primary);
  background: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border-primary);
  border-radius: 999px;
  cursor: pointer;
  white-space: nowrap;
}
.atlas-pill:hover { background: var(--theme-bg-tertiary); }
.atlas-pill.is-inactive { color: var(--theme-text-tertiary); opacity: 0.55; }
.atlas-pill.is-on { background: var(--theme-primary-light); border-color: rgba(10,132,255,0.40); color: var(--theme-primary); }
.atlas-pill__dot { width: 6px; height: 6px; border-radius: 50%; background: var(--pill-accent, var(--theme-text-tertiary)); flex: none; }
.atlas-pill.is-inactive .atlas-pill__dot { opacity: 0.5; }

.activity-search {
  position: relative;
  display: flex;
  align-items: center;
  margin: 6px 14px 4px;
}
.activity-search__icon {
  position: absolute;
  left: 9px;
  color: var(--theme-text-tertiary);
  pointer-events: none;
}
.activity-search__input {
  width: 100%;
  padding: 5px 26px 5px 26px;
  font-size: 11px;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  color: var(--theme-text-primary);
  background: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border-primary);
  border-radius: 6px;
  outline: none;
}
.activity-search__input::placeholder { color: var(--theme-text-tertiary); }
.activity-search__input:focus {
  border-color: var(--theme-primary);
  box-shadow: 0 0 0 3px var(--theme-primary-light);
}
.activity-search__input.is-error { border-color: var(--theme-accent-error); }
.activity-search__clear {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--theme-text-tertiary);
  cursor: pointer;
  font-size: 10px;
  border-radius: 4px;
}
.activity-search__clear:hover { color: var(--theme-text-primary); background: var(--theme-hover-bg); }
.activity-search__error {
  margin: 0 14px 4px;
  font-size: 11px;
  color: var(--theme-accent-error);
}

.activity-lanes {
  padding: 6px 14px;
  background: var(--theme-bg-secondary);
  border-bottom: 1px solid var(--theme-border-primary);
}
@media (max-width: 699px) {
  .activity-lanes { padding: 6px 10px; }
}
</style>
