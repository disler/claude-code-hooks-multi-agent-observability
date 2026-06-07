<template>
  <div class="pulse">
    <div class="pulse-head">
      <span class="cap">Live pulse</span>
      <span class="rule"></span>
      <span class="meta mono mobile:hidden">events / sec · last {{ rangeText }}</span>
      <div class="tabs" role="tablist" aria-label="Time range selector">
        <button
          v-for="(range, index) in timeRanges"
          :key="range"
          @click="setTimeRange(range)"
          @keydown="handleTimeRangeKeyDown($event, index)"
          :class="{ on: timeRange === range }"
          role="tab"
          :aria-selected="timeRange === range"
          :aria-label="`Show ${range === '1m' ? '1 minute' : range === '3m' ? '3 minutes' : range === '5m' ? '5 minutes' : '10 minutes'} of activity`"
          :tabindex="timeRange === range ? 0 : -1"
        >{{ range }}</button>
      </div>
    </div>

    <div ref="chartContainer" class="chart-box">
      <div class="legend">
        <span class="item"><span class="sw sw-primary"></span>all events</span>
        <span class="item"><span class="sw sw-tool"></span>tool calls</span>
      </div>
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
import { useChartData } from '../composables/useChartData';
import { createChartRenderer, type ChartDimensions } from '../utils/chartRenderer';

const props = defineProps<{
  events: HookEvent[];
  filters: {
    sourceApp: string;
    sessionId: string;
    eventType: string;
  };
}>();

const emit = defineEmits<{
  updateUniqueApps: [appNames: string[]];
  updateAllApps: [appNames: string[]];
  updateTimeRange: [timeRange: TimeRange];
  updateMetrics: [metrics: { totalEvents: number; toolCalls: number; avgGap: number; minGap: number; maxGap: number }];
}>();

const canvas = ref<HTMLCanvasElement>();
const chartContainer = ref<HTMLDivElement>();
const windowHeight = ref(typeof window !== 'undefined' ? window.innerHeight : 600);
const chartHeight = computed(() => windowHeight.value <= 400 ? 210 : 184);

const timeRanges: TimeRange[] = ['1m', '3m', '5m', '10m'];

const {
  timeRange,
  dataPoints,
  addEvent,
  getChartData,
  setTimeRange,
  cleanup: cleanupChartData,
  clearData,
  uniqueAgentIdsInWindow,
  allUniqueAgentIds,
  toolCallCount,
  eventTimingMetrics
} = useChartData();

const rangeText = computed(() =>
  timeRange.value === '1m' ? '60s' : timeRange.value === '3m' ? '3m' : timeRange.value === '5m' ? '5m' : '10m'
);

// Watch uniqueAgentIdsInWindow and emit updates (for active agents in time window)
watch(uniqueAgentIdsInWindow, (agentIds) => {
  emit('updateUniqueApps', agentIds);
}, { immediate: true });

// Watch allUniqueAgentIds and emit updates (for all agents ever seen)
watch(allUniqueAgentIds, (agentIds) => {
  emit('updateAllApps', agentIds);
}, { immediate: true });

// Watch timeRange and emit updates
watch(timeRange, (range) => {
  emit('updateTimeRange', range);
}, { immediate: true });

let renderer: ReturnType<typeof createChartRenderer> | null = null;
let resizeObserver: ResizeObserver | null = null;
let animationFrame: number | null = null;
let idleTimer: number | null = null;
const processedEventIds = new Set<string>();

const hasData = computed(() => dataPoints.value.some(dp => dp.count > 0));

const totalEventCount = computed(() => {
  return dataPoints.value.reduce((sum, dp) => sum + dp.count, 0);
});

const chartAriaLabel = computed(() => {
  const rangeTextLong = timeRange.value === '1m' ? '1 minute' : timeRange.value === '3m' ? '3 minutes' : timeRange.value === '5m' ? '5 minutes' : '10 minutes';
  return `Activity chart showing ${totalEventCount.value} events over the last ${rangeTextLong}`;
});

// Surface window metrics to the parent (MetricsBar lives in the left column now)
const metricsPayload = computed(() => ({
  totalEvents: totalEventCount.value,
  toolCalls: toolCallCount.value,
  avgGap: eventTimingMetrics.value.avgGap,
  minGap: eventTimingMetrics.value.minGap,
  maxGap: eventTimingMetrics.value.maxGap,
}));
watch(metricsPayload, (m) => emit('updateMetrics', m), { immediate: true, deep: true });

const tooltip = ref({
  visible: false,
  x: 0,
  y: 0,
  text: ''
});

const getThemeColor = (property: string): string => {
  const style = getComputedStyle(document.documentElement);
  const color = style.getPropertyValue(`--theme-${property}`).trim();
  return color || '#3B82F6'; // fallback
};

const getActiveConfig = (): ChartConfig => {
  return {
    maxDataPoints: 60,
    animationDuration: 300,
    barWidth: 3,
    barGap: 1,
    colors: {
      primary: getThemeColor('primary'),
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
    height: chartHeight.value,
    padding: {
      top: 14,
      right: 14,
      bottom: 22,
      left: 30
    }
  };
};

const render = () => {
  if (!renderer || !canvas.value) return;

  const data = getChartData();
  const maxValue = Math.max(...data.map(d => d.count), 1);

  renderer.clear();
  renderer.drawBackground();
  renderer.drawAxes(maxValue);
  renderer.drawTimeLabels(timeRange.value);
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

const handleWindowResize = () => {
  windowHeight.value = window.innerHeight;
};

const handleResize = () => {
  if (!renderer || !canvas.value) return;

  const dimensions = getDimensions();
  renderer.resize(dimensions);
  render();
};

const isEventFiltered = (event: HookEvent): boolean => {
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

  // Process new events
  newEventsToProcess.forEach(event => {
    if (event.hook_event_type !== 'refresh' && event.hook_event_type !== 'initial' && isEventFiltered(event)) {
      addEvent(event);

      // Trigger pulse animation for new event
      if (renderer && canvas.value) {
        const chartArea = getDimensions();
        const x = chartArea.width - chartArea.padding.right;
        const y = chartArea.padding.top + (chartArea.height - chartArea.padding.top - chartArea.padding.bottom) / 2;
        animateNewEvent(x, y);
      }
    }
  });

  // Clean up old event IDs to prevent memory leak (keep only current ids)
  const currentEventIds = new Set(currentEvents.map(e => `${e.id}-${e.timestamp}`));
  processedEventIds.forEach(id => {
    if (!currentEventIds.has(id)) {
      processedEventIds.delete(id);
    }
  });

  render();
};

// Watch for new events
watch(() => props.events, (newEvents) => {
  // If events array is empty, clear all internal state
  if (newEvents.length === 0) {
    clearData();
    processedEventIds.clear();
    render();
    return;
  }
  processNewEvents();
}, { deep: true });

// Watch for filter changes
watch(() => props.filters, () => {
  // Reset and reprocess all events with new filters
  dataPoints.value = [];
  processedEventIds.clear();
  processNewEvents();
}, { deep: true });

// Watch for time range changes
watch(timeRange, () => {
  render();
});

// Watch for chart height changes
watch(chartHeight, () => {
  handleResize();
});

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
        y: event.clientY - rect.top - 34,
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

const handleTimeRangeKeyDown = (event: KeyboardEvent, currentIndex: number) => {
  let newIndex = currentIndex;

  switch (event.key) {
    case 'ArrowLeft':
      newIndex = Math.max(0, currentIndex - 1);
      break;
    case 'ArrowRight':
      newIndex = Math.min(timeRanges.length - 1, currentIndex + 1);
      break;
    case 'Home':
      newIndex = 0;
      break;
    case 'End':
      newIndex = timeRanges.length - 1;
      break;
    default:
      return;
  }

  if (newIndex !== currentIndex) {
    event.preventDefault();
    setTimeRange(timeRanges[newIndex]);
    // Focus the new button
    const buttons = (event.currentTarget as HTMLElement)?.parentElement?.querySelectorAll('button');
    if (buttons && buttons[newIndex]) {
      (buttons[newIndex] as HTMLButtonElement).focus();
    }
  }
};

// Watch for theme changes
const themeObserver = new MutationObserver(() => {
  if (renderer) {
    renderer = createChartRenderer(canvas.value!, getDimensions(), getActiveConfig());
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

  // Listen for window height changes
  window.addEventListener('resize', handleWindowResize);

  // Initial render
  render();

  // Idle redraw once a second so the time axis slides even without new events
  // (replaces the old always-on 30fps loop).
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

  // Remove window resize listener
  window.removeEventListener('resize', handleWindowResize);
});
</script>

<style scoped>
.pulse {
  padding: 12px 16px 16px;
}
.pulse-head {
  display: flex; align-items: center; gap: 10px; margin-bottom: 10px;
}
.pulse-head .cap {
  font-size: var(--text-2xs); font-weight: var(--weight-semibold);
  letter-spacing: var(--tracking-caps); text-transform: uppercase; color: var(--text-faint); flex: none;
}
.pulse-head .rule { height: 1px; flex: 1; background: var(--hair-faint); }
.pulse-head .meta { font-size: var(--text-2xs); color: var(--text-faint); flex: none; }

.tabs { display: inline-flex; padding: 2px; gap: 2px; border: 1px solid var(--hair-faint); border-radius: var(--radius-md); background: var(--surface-canvas); flex: none; }
.tabs button {
  min-width: 30px; padding: 3px 9px; border: 0; border-radius: var(--radius-sm);
  background: transparent; color: var(--text-faint); cursor: pointer;
  font-family: var(--font-mono); font-size: var(--text-xs); font-weight: var(--weight-medium);
  font-variant-numeric: tabular-nums;
  transition: color var(--motion-fast), background var(--motion-fast);
}
.tabs button:hover { color: var(--text-base); }
.tabs button.on { background: var(--theme-primary); color: #fff; }

.chart-box {
  position: relative;
  border: 1px solid var(--hair-faint);
  border-radius: var(--radius-lg);
  background: var(--surface);
  padding: 4px 6px 2px 2px;
}
.canvas { display: block; width: 100%; cursor: crosshair; }

.legend {
  position: absolute; top: 10px; right: 14px; z-index: 2;
  display: flex; align-items: center; gap: 12px;
  font-size: var(--text-2xs); color: var(--text-faint);
}
.legend .item { display: inline-flex; align-items: center; gap: 5px; }
.legend .sw { width: 11px; height: 2px; border-radius: 2px; }
.legend .sw-primary { background: var(--theme-primary); }
.legend .sw-tool { background: var(--theme-accent-success); }

.tooltip {
  position: absolute; z-index: 5; pointer-events: none;
  padding: 5px 8px; border-radius: var(--radius-sm);
  background: var(--surface-raised); border: 1px solid var(--hair-strong);
  box-shadow: var(--elevation-2);
  color: var(--text-strong); font-size: var(--text-2xs); white-space: nowrap;
}

.chart-empty {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  color: var(--text-faint); font-size: var(--text-sm);
}
</style>
