<template>
  <div class="app" :class="{ 'is-compact': density === 'compact' }">
    <!-- ───────── TOP BAR ───────── -->
    <header class="topbar short:hidden">
      <div class="brand">
        <span class="logo" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
            <rect x="2.5" y="2.5" width="19" height="19" rx="5" stroke="var(--theme-primary)" stroke-width="1.6"/>
            <circle cx="12" cy="12" r="2.6" fill="var(--theme-primary)"/>
            <path d="M12 4.6v3.2M12 16.2v3.2M4.6 12h3.2M16.2 12h3.2" stroke="var(--theme-primary)" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </span>
        <div class="brand-text mobile:hidden">
          <span class="name">Swarm</span>
          <span class="kicker">Observability</span>
        </div>
      </div>

      <!-- connection status -->
      <div class="status" :class="isConnected ? 'is-on' : 'is-off'">
        <span class="dot"><span v-if="isConnected" class="ring"></span></span>
        <span class="lbl mobile:hidden">{{ isConnected ? 'Connected' : 'Disconnected' }}</span>
        <span class="meta mono mobile:hidden" v-if="isConnected && lastEventAgo">· last event {{ lastEventAgo }}</span>
      </div>

      <div class="tb-spacer"></div>

      <div class="count">
        <span class="n mono tabular">{{ events.length.toLocaleString() }}</span>
        <span class="u mobile:hidden">events</span>
      </div>

      <div class="divider mobile:hidden"></div>

      <!-- density -->
      <div class="seg mobile:hidden" role="group" aria-label="Row density">
        <button :aria-pressed="density === 'comfortable'" :class="{ on: density === 'comfortable' }" @click="density = 'comfortable'">
          <AppIcon name="activity" :size="13" /><span>Comfortable</span>
        </button>
        <button :aria-pressed="density === 'compact'" :class="{ on: density === 'compact' }" @click="density = 'compact'">
          <AppIcon name="pre-compact" :size="13" /><span>Compact</span>
        </button>
      </div>

      <div class="divider"></div>

      <div class="tb-actions">
        <button class="iconbtn" :class="{ on: showFilters }" @click="showFilters = !showFilters" :title="showFilters ? 'Hide filters' : 'Show filters'">
          <AppIcon name="filter" :size="17" />
        </button>
        <button class="iconbtn" @click="handleThemeManagerClick" title="Theme manager">
          <AppIcon name="theme" :size="17" />
        </button>
        <button class="iconbtn" @click="handleClearClick" title="Clear events">
          <AppIcon name="trash" :size="17" />
        </button>
      </div>
    </header>

    <!-- ───────── BODY ───────── -->
    <div class="body">
      <!-- LEFT: metrics + event timeline (wider) -->
      <section class="col col-feed">
        <MetricsBar
          :active-agents="uniqueAppNames.length"
          :agent-names="uniqueAppNames"
          :total-events="metrics.totalEvents"
          :tool-calls="metrics.toolCalls"
          :avg-gap="metrics.avgGap"
          :min-gap="metrics.minGap"
          :max-gap="metrics.maxGap"
          :range-label="rangeLabel"
        />
        <div class="tl-region">
          <EventTimeline
            :events="events"
            :filters="filters"
            v-model:stick-to-bottom="stickToBottom"
          />
        </div>
      </section>

      <!-- RIGHT: live pulse + swim lanes -->
      <aside class="col col-aside">
        <LivePulseChart
          :events="events"
          :filters="filters"
          @update-unique-apps="uniqueAppNames = $event"
          @update-all-apps="allAppNames = $event"
          @update-time-range="currentTimeRange = $event"
          @update-metrics="metrics = $event"
        />
        <AgentChips
          :unique-app-names="uniqueAppNames"
          :all-app-names="allAppNames"
          @select-agent="toggleAgentLane"
        />
        <div v-if="selectedAgentLanes.length > 0" class="lanes-wrap">
          <AgentSwimLaneContainer
            :selected-agents="selectedAgentLanes"
            :events="events"
            :time-range="currentTimeRange"
            @update:selected-agents="selectedAgentLanes = $event"
          />
        </div>
      </aside>
    </div>

    <!-- ───────── FOOTER: filter bar ───────── -->
    <footer v-if="showFilters" class="filterbar short:hidden">
      <FilterPanel
        :filters="filters"
        @update:filters="filters = $event"
      />
    </footer>

    <!-- Stick to bottom button -->
    <StickScrollButton
      class="short:hidden"
      :stick-to-bottom="stickToBottom"
      @toggle="stickToBottom = !stickToBottom"
    />

    <!-- Error message -->
    <div v-if="error" class="error-banner" role="alert">
      <AppIcon name="alert" :size="15" />
      <span>{{ error }}</span>
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
import { ref, watch, computed, onUnmounted } from 'vue';
import type { TimeRange } from './types';
import { useWebSocket } from './composables/useWebSocket';
import { useThemes } from './composables/useThemes';
import { useEventColors } from './composables/useEventColors';
import EventTimeline from './components/EventTimeline.vue';
import FilterPanel from './components/FilterPanel.vue';
import StickScrollButton from './components/StickScrollButton.vue';
import LivePulseChart from './components/LivePulseChart.vue';
import ThemeManager from './components/ThemeManager.vue';
import ToastNotification from './components/ToastNotification.vue';
import AgentSwimLaneContainer from './components/AgentSwimLaneContainer.vue';
import MetricsBar from './components/MetricsBar.vue';
import AgentChips from './components/AgentChips.vue';
import AppIcon from './components/AppIcon.vue';
import { WS_URL } from './config';

// WebSocket connection
const { events, isConnected, error, clearEvents } = useWebSocket(WS_URL);

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
const showFilters = ref(true);
const density = ref<'comfortable' | 'compact'>('comfortable');
const uniqueAppNames = ref<string[]>([]); // Apps active in current time window
const allAppNames = ref<string[]>([]); // All apps ever seen in session
const selectedAgentLanes = ref<string[]>([]);
const currentTimeRange = ref<TimeRange>('1m'); // Current time range from LivePulseChart

// Window metrics surfaced by LivePulseChart for the MetricsBar
const metrics = ref({ totalEvents: 0, toolCalls: 0, avgGap: 0, minGap: 0, maxGap: 0 });

const rangeLabel = computed(() => (currentTimeRange.value === '1m' ? '60s' : currentTimeRange.value));

// "last event N ago" — ticked once a second so it stays live without per-event work
const nowTick = ref(Date.now());
const tickTimer = window.setInterval(() => { nowTick.value = Date.now(); }, 1000);
const lastEventAgo = computed(() => {
  const last = events.value[events.value.length - 1];
  if (!last?.timestamp) return '';
  const diff = Math.max(0, nowTick.value - last.timestamp);
  if (diff < 1000) return `${(diff / 1000).toFixed(1)}s ago`;
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`;
  return `${Math.round(diff / 60_000)}m ago`;
});

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

// Open the theme manager
const handleThemeManagerClick = () => {
  showThemeManager.value = true;
};

onUnmounted(() => {
  clearInterval(tickTimer);
});
</script>

<style scoped>
.app {
  height: 100vh;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  grid-template-columns: 1fr;
  background:
    radial-gradient(1100px 520px at 82% -8%, color-mix(in srgb, var(--theme-primary) 5%, transparent), transparent 60%),
    var(--surface-canvas);
  color: var(--text-base);
  font-family: var(--font-sans);
}

/* ───────── TOP BAR ───────── */
.topbar {
  height: 52px;
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: 0 var(--space-4);
  background: var(--surface);
  border-bottom: 1px solid var(--hair-faint);
}
.brand { display: flex; align-items: center; gap: 9px; flex: none; }
.brand .logo { display: inline-flex; }
.brand-text { display: flex; flex-direction: column; line-height: 1.05; }
.brand-text .name { font-size: var(--text-lg); font-weight: var(--weight-bold); color: var(--text-strong); letter-spacing: -0.01em; }
.brand-text .kicker { font-size: 9px; font-weight: var(--weight-semibold); letter-spacing: var(--tracking-caps); text-transform: uppercase; color: var(--text-faint); }

.status { display: flex; align-items: center; gap: 8px; flex: none; font-size: var(--text-sm); }
.status .dot { position: relative; width: 8px; height: 8px; border-radius: var(--radius-full); background: var(--theme-accent-error); }
.status.is-on .dot { background: var(--theme-accent-success); }
.status .dot .ring {
  position: absolute; inset: -3px; border-radius: var(--radius-full);
  border: 1.5px solid var(--theme-accent-success);
  animation: statusPulse 1.8s ease-out infinite;
}
@keyframes statusPulse { 0% { transform: scale(0.6); opacity: 0.8; } 100% { transform: scale(1.5); opacity: 0; } }
.status .lbl { color: var(--text-base); font-weight: var(--weight-medium); }
.status .meta { color: var(--text-faint); font-size: var(--text-xs); }

.tb-spacer { flex: 1; }

.count { display: flex; align-items: baseline; gap: 6px; flex: none; }
.count .n { font-size: var(--text-md); font-weight: var(--weight-semibold); color: var(--text-strong); }
.count .u { font-size: var(--text-xs); color: var(--text-faint); }

.divider { width: 1px; height: 22px; background: var(--hair-faint); flex: none; }

.seg { display: inline-flex; padding: 2px; gap: 2px; border: 1px solid var(--hair-faint); border-radius: var(--radius-md); background: var(--surface-canvas); }
.seg button {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 9px; border: 0; border-radius: var(--radius-sm);
  background: transparent; color: var(--text-faint);
  font-family: var(--font-sans); font-size: var(--text-xs); font-weight: var(--weight-medium);
  cursor: pointer; transition: color var(--motion-fast) var(--ease-out), background var(--motion-fast) var(--ease-out);
}
.seg button:hover { color: var(--text-base); }
.seg button.on { background: var(--surface-raised); color: var(--text-strong); }

.tb-actions { display: flex; align-items: center; gap: 2px; flex: none; }
.iconbtn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; border: 0; border-radius: var(--radius-sm);
  background: transparent; color: var(--text-faint); cursor: pointer;
  transition: color var(--motion-fast) var(--ease-out), background var(--motion-fast) var(--ease-out);
}
.iconbtn:hover { color: var(--text-strong); background: var(--surface-hover); }
.iconbtn.on { color: var(--theme-primary); background: var(--primary-soft); }

/* ───────── BODY ───────── */
.body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(420px, 500px);
  gap: 1px;
  background: var(--hair-faint);
  min-height: 0;
  overflow: hidden;
}
.col { background: var(--surface-canvas); min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.col-feed { }
.tl-region { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.col-aside { overflow-y: auto; }
.lanes-wrap { padding: var(--space-3) var(--space-4) var(--space-4); border-top: 1px solid var(--hair-faint); }

/* ───────── FOOTER ───────── */
.filterbar {
  border-top: 1px solid var(--hair-faint);
  background: var(--surface);
}

/* ───────── ERROR BANNER ───────── */
.error-banner {
  position: fixed; bottom: var(--space-4); left: var(--space-4);
  display: flex; align-items: center; gap: 8px;
  padding: 9px var(--space-3);
  background: var(--surface-raised);
  border: 1px solid var(--theme-accent-error);
  color: var(--theme-accent-error);
  border-radius: var(--radius-md);
  box-shadow: var(--elevation-2);
  font-size: var(--text-sm); font-weight: var(--weight-medium);
  z-index: 60; max-width: 420px;
}
@media (max-width: 699px) {
  .error-banner { left: var(--space-3); right: var(--space-3); bottom: var(--space-3); max-width: none; }
}

/* ───────── DENSITY ───────── */
.app.is-compact { --row-h: var(--row-h-compact); --row-pad-y: 5px; }

/* On narrow screens collapse to a single column with the feed on top */
@media (max-width: 699px) {
  .body { grid-template-columns: 1fr; grid-auto-rows: minmax(0, auto); }
  .col-aside { order: -1; }
}
</style>
