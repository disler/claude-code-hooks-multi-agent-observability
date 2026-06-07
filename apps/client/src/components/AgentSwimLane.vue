<template>
  <div class="lane">
    <div class="lane-head">
      <span class="agent-tag" :style="{ '--c': getHexColorForApp(appName) }">
        <span class="cdot"></span>
        <span class="mono">{{ appName }}<span class="sid">:{{ sessionId }}</span></span>
      </span>
      <span v-if="modelName" class="model mono" :title="`Model: ${modelName}`">{{ formatModelName(modelName) }}</span>
      <span class="spacer"></span>
      <span class="stats">
        <span class="stat"><span class="sv mono tabular">{{ totalEventCount }}</span><span class="sk">events</span></span>
        <span class="stat"><span class="sv mono tabular">{{ toolCallCount }}</span><span class="sk">tools</span></span>
        <span class="stat"><span class="sv mono tabular">{{ formatGap(agentEventTimingMetrics.avgGap) }}</span><span class="sk">avg gap</span></span>
      </span>
      <button @click="emit('close')" class="close" title="Remove this swim lane" aria-label="Remove swim lane">
        <AppIcon name="x" :size="14" />
      </button>
    </div>
    <div ref="chartContainer" class="chart-wrapper" :style="{ '--c': getHexColorForApp(appName) }">
      <canvas
        ref="canvas"
        class="canvas"
        :style="{ height: chartHeight + 'px' }"
        @mousemove="handleMouseMove"
        @mouseleave="handleMouseLeave"
        role="img"
        :aria-label="chartAriaLabel"
      ></canvas>
      <div v-if="tooltip.visible" class="tooltip mono" :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }">
        {{ tooltip.text }}
      </div>
      <div v-if="!hasData" class="chart-empty">Waiting for events…</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue';
import type { HookEvent, TimeRange, ChartConfig } from '../types';
import { useAgentChartData } from '../composables/useAgentChartData';
import { createChartRenderer, type ChartDimensions } from '../utils/chartRenderer';
import { useEventColors } from '../composables/useEventColors';
import AppIcon from './AppIcon.vue';

const props = defineProps<{
  agentName: string; // Format: "app:session" (e.g., "claude-code:a1b2c3d4")
  events: HookEvent[];
  timeRange: TimeRange;
}>();

const emit = defineEmits<{
  close: [];
}>();

const canvas = ref<HTMLCanvasElement>();
const chartContainer = ref<HTMLDivElement>();
const chartHeight = 56;

// Format gap time in ms to readable string (e.g., "125ms" or "1.2s")
const formatGap = (gapMs: number): string => {
  if (gapMs === 0) return '—';
  if (gapMs < 1000) {
    return `${Math.round(gapMs)}ms`;
  }
  return `${(gapMs / 1000).toFixed(1)}s`;
};

// Extract app name and session ID from agent ID for display
const appName = computed(() => props.agentName.split(':')[0]);
const sessionId = computed(() => props.agentName.split(':')[1]);

// Get model name from most recent event for this agent
const modelName = computed(() => {
  const [targetApp, targetSession] = props.agentName.split(':');
  const agentEvents = props.events
    .filter(e => e.source_app === targetApp && e.session_id.slice(0, 8) === targetSession)
    .filter(e => e.model_name); // Only events with model_name

  if (agentEvents.length === 0) return null;

  // Get most recent event's model name
  const mostRecent = agentEvents[agentEvents.length - 1];
  return mostRecent.model_name;
});

// Format model name for display (e.g., "claude-haiku-4-5-20251001" -> "haiku-4-5")
const formatModelName = (name: string | null | undefined): string => {
  if (!name) return '';

  const parts = name.split('-');
  if (parts.length >= 4) {
    return `${parts[1]}-${parts[2]}-${parts[3]}`;
  }
  return name;
};

const {
  dataPoints,
  addEvent,
  getChartData,
  setTimeRange,
  cleanup: cleanupChartData,
  eventTimingMetrics: agentEventTimingMetrics
} = useAgentChartData(props.agentName);

let renderer: ReturnType<typeof createChartRenderer> | null = null;
let resizeObserver: ResizeObserver | null = null;
let animationFrame: number | null = null;
let idleTimer: number | null = null;
const processedEventIds = new Set<string>();

const { getHexColorForApp } = useEventColors();

const hasData = computed(() => dataPoints.value.some(dp => dp.count > 0));

const totalEventCount = computed(() => {
  return dataPoints.value.reduce((sum, dp) => sum + dp.count, 0);
});

const toolCallCount = computed(() => {
  return dataPoints.value.reduce((sum, dp) => {
    return sum + (dp.eventTypes?.['PreToolUse'] || 0);
  }, 0);
});

const chartAriaLabel = computed(() => {
  const [app, session] = props.agentName.split(':');
  return `Activity chart for ${app} (session: ${session}) showing ${totalEventCount.value} events`;
});

const tooltip = ref({
  visible: false,
  x: 0,
  y: 0,
  text: ''
});

const getThemeColor = (property: string): string => {
  const style = getComputedStyle(document.documentElement);
  const color = style.getPropertyValue(`--theme-${property}`).trim();
  return color || '#3B82F6';
};

const getActiveConfig = (): ChartConfig => {
  return {
    maxDataPoints: 60,
    animationDuration: 300,
    barWidth: 3,
    barGap: 1,
    colors: {
      // The lane sparkline is drawn in the agent's own hue
      primary: getHexColorForApp(appName.value) || getThemeColor('primary'),
      glow: getThemeColor('primary-light'),
      axis: getThemeColor('border-secondary'),
      text: getThemeColor('text-tertiary')
    }
  };
};

const getDimensions = (): ChartDimensions => {
  const width = chartContainer.value?.offsetWidth || 800;
  return {
    width,
    height: chartHeight,
    padding: { top: 8, right: 10, bottom: 8, left: 10 }
  };
};

const render = () => {
  if (!renderer || !canvas.value) return;

  const data = getChartData();
  const maxValue = Math.max(...data.map(d => d.count), 1);

  renderer.clear();
  renderer.drawBars(data, maxValue, 1);
};

const animateNewEvent = (x: number, y: number) => {
  let radius = 0;
  let opacity = 0.8;

  const animate = () => {
    if (!renderer) return;

    render();
    renderer.drawPulseEffect(x, y, radius, opacity);

    radius += 2;
    opacity -= 0.04;

    if (opacity > 0) {
      animationFrame = requestAnimationFrame(animate);
    } else {
      animationFrame = null;
    }
  };

  animate();
};

const handleResize = () => {
  if (!renderer || !canvas.value) return;

  const dimensions = getDimensions();
  renderer.resize(dimensions);
  render();
};

const processNewEvents = () => {
  const currentEvents = props.events;
  const newEventsToProcess: HookEvent[] = [];

  // Find events that haven't been processed yet
  currentEvents.forEach(event => {
    const eventKey = `${event.id}-${event.timestamp}`;
    if (!processedEventIds.has(eventKey)) {
      processedEventIds.add(eventKey);
      newEventsToProcess.push(event);
    }
  });

  // Parse agent ID to get app and session
  const [targetApp, targetSession] = props.agentName.split(':');

  // Process new events (filter by agent ID: app:session)
  newEventsToProcess.forEach(event => {
    if (
      event.hook_event_type !== 'refresh' &&
      event.hook_event_type !== 'initial' &&
      event.source_app === targetApp &&
      event.session_id.slice(0, 8) === targetSession
    ) {
      addEvent(event);

      // Trigger pulse animation for new event
      if (renderer && canvas.value) {
        const chartArea = getDimensions();
        const x = chartArea.width - chartArea.padding.right;
        const y = chartArea.height / 2;
        animateNewEvent(x, y);
      }
    }
  });

  // Clean up old event IDs to prevent memory leak
  const currentEventIds = new Set(currentEvents.map(e => `${e.id}-${e.timestamp}`));
  processedEventIds.forEach(id => {
    if (!currentEventIds.has(id)) {
      processedEventIds.delete(id);
    }
  });

  render();
};

// Watch for new events - immediate: true ensures we process existing events on mount
watch(() => props.events, processNewEvents, { deep: true, immediate: true });

// Watch for time range changes - update internal timeRange and trigger reaggregation
watch(() => props.timeRange, (newRange) => {
  setTimeRange(newRange);
  render();
}, { immediate: true });

const handleMouseMove = (event: MouseEvent) => {
  if (!canvas.value || !chartContainer.value) return;

  const rect = canvas.value.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  const data = getChartData();
  const dimensions = getDimensions();
  const chartArea = {
    x: dimensions.padding.left,
    y: dimensions.padding.top,
    width: dimensions.width - dimensions.padding.left - dimensions.padding.right,
    height: dimensions.height - dimensions.padding.top - dimensions.padding.bottom
  };

  if (data.length < 2) { tooltip.value.visible = false; return; }
  const step = chartArea.width / (data.length - 1);
  const barIndex = Math.round((x - chartArea.x) / step);

  if (barIndex >= 0 && barIndex < data.length && y >= chartArea.y && y <= chartArea.y + chartArea.height) {
    const point = data[barIndex];
    if (point.count > 0) {
      const eventTypesText = Object.entries(point.eventTypes || {})
        .map(([type, count]) => `${type}: ${count}`)
        .join(', ');

      tooltip.value = {
        visible: true,
        x: Math.min(x + 8, chartArea.x + chartArea.width - 4),
        y: event.clientY - rect.top - 30,
        text: `${point.count} events${eventTypesText ? ` (${eventTypesText})` : ''}`
      };
      return;
    }
  }

  tooltip.value.visible = false;
};

const handleMouseLeave = () => {
  tooltip.value.visible = false;
};

// Watch for theme changes (rebuild renderer so axis/theme colors refresh)
const themeObserver = new MutationObserver(() => {
  if (renderer && canvas.value) {
    renderer = createChartRenderer(canvas.value, getDimensions(), getActiveConfig());
    render();
  }
});

onMounted(() => {
  if (!canvas.value || !chartContainer.value) return;

  const dimensions = getDimensions();
  const config = getActiveConfig();

  renderer = createChartRenderer(canvas.value, dimensions, config);

  // Set up resize observer
  resizeObserver = new ResizeObserver(handleResize);
  resizeObserver.observe(chartContainer.value);

  // Observe theme changes
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class']
  });

  // Initial render
  render();

  // Idle redraw once a second (replaces always-on 30fps loop)
  idleTimer = window.setInterval(render, 1000);
});

onUnmounted(() => {
  cleanupChartData();

  if (renderer) {
    renderer.stopAnimation();
  }

  if (resizeObserver && chartContainer.value) {
    resizeObserver.disconnect();
  }

  if (animationFrame) {
    cancelAnimationFrame(animationFrame);
  }

  if (idleTimer !== null) {
    clearInterval(idleTimer);
  }

  themeObserver.disconnect();
});
</script>

<style scoped>
.lane {
  width: 100%;
  display: grid;
  grid-template-columns: 1fr minmax(150px, 230px);
  align-items: center;
  gap: 14px;
  padding: 8px 0;
  border-left: 2px solid var(--c, var(--theme-primary));
  padding-left: 12px;
}

.lane-head {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.agent-tag {
  display: inline-flex; align-items: center; gap: 7px;
  min-width: 0; flex: 0 1 auto;
  font-size: var(--text-xs);
}
.agent-tag .cdot { width: 8px; height: 8px; border-radius: 50%; background: var(--c); flex: none; }
.agent-tag .mono { color: var(--text-strong); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.agent-tag .sid { color: var(--text-faint); }
.model { font-size: var(--text-2xs); color: var(--text-faint); border: 1px dashed var(--hair); border-radius: var(--radius-xs); padding: 1px 6px; flex: none; }
.spacer { flex: 1; }

.stats { display: flex; align-items: center; gap: 16px; flex: none; }
.stat { display: flex; flex-direction: column; align-items: flex-end; line-height: 1.05; }
.stat .sv { font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--text-strong); }
.stat .sk { font-size: 9px; letter-spacing: var(--tracking-caps); text-transform: uppercase; color: var(--text-ghost); margin-top: 2px; }

.close {
  display: inline-flex; align-items: center; justify-content: center;
  width: 24px; height: 24px; flex: none;
  border: 0; background: transparent; color: var(--text-faint); cursor: pointer; border-radius: var(--radius-sm);
  transition: color var(--motion-fast), background var(--motion-fast);
}
.close:hover { color: var(--text-strong); background: var(--surface-hover); }

.chart-wrapper {
  position: relative;
  border: 1px solid var(--hair-faint);
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: var(--surface);
}
.canvas { display: block; width: 100%; cursor: crosshair; }

.tooltip {
  position: absolute; z-index: 5; pointer-events: none;
  padding: 4px 7px; border-radius: var(--radius-sm);
  background: var(--surface-raised); border: 1px solid var(--hair-strong);
  box-shadow: var(--elevation-2);
  color: var(--text-strong); font-size: var(--text-2xs); white-space: nowrap;
}
.chart-empty {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  color: var(--text-faint); font-size: var(--text-xs);
}

@media (max-width: 699px) {
  .lane { grid-template-columns: 1fr; }
  .lane-head { flex-wrap: wrap; }
}
</style>
