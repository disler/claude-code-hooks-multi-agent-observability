<template>
  <div class="agent-swim-lane">
    <div class="lane-header">
      <div class="header-left">
        <div class="agent-label-container">
          <span
            class="agent-label-app"
            :style="{
              backgroundColor: getHexColorForApp(appName),
              borderColor: getHexColorForApp(appName)
            }"
          >
            <span class="font-mono text-xs">{{ appName }}</span>
          </span>
          <span
            class="agent-label-session"
            :style="{
              backgroundColor: getHexColorForSession(sessionId),
              borderColor: getHexColorForSession(sessionId)
            }"
          >
            <span class="font-mono text-xs">{{ sessionId }}</span>
          </span>
        </div>
        <span v-if="modelName" class="lane-metric" :title="`Model: ${modelName}`">
          <span class="lane-metric__label">model</span>
          <span class="lane-metric__value">{{ formatModelName(modelName) }}</span>
        </span>
        <span class="lane-metric" :title="`Events in window`">
          <span class="lane-metric__label">events</span>
          <span class="lane-metric__value">{{ totalEventCount }}</span>
        </span>
        <span class="lane-metric" :title="`Tool calls in window`">
          <span class="lane-metric__label">tools</span>
          <span class="lane-metric__value">{{ toolCallCount }}</span>
        </span>
        <span class="lane-metric" :title="`Avg gap between events`">
          <span class="lane-metric__label">avg gap</span>
          <span class="lane-metric__value">{{ formatGap(agentEventTimingMetrics.avgGap) }}</span>
        </span>
      </div>
      <button @click="emit('close')" class="close-btn" title="Remove swim lane" aria-label="Remove">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="m3 3 6 6M9 3l-6 6"/></svg>
      </button>
    </div>
    <div ref="chartContainer" class="chart-wrapper">
      <canvas
        ref="canvas"
        class="w-full cursor-crosshair"
        :style="{ height: chartHeight + 'px' }"
        @mousemove="handleMouseMove"
        @mouseleave="handleMouseLeave"
        role="img"
        :aria-label="chartAriaLabel"
      ></canvas>
      <div
        v-if="tooltip.visible"
        class="lane-tooltip"
        :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }"
      >{{ tooltip.text }}</div>
      <div v-if="!hasData" class="absolute inset-0 flex items-center justify-center">
        <p class="lane-waiting">Waiting for events…</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue';
import type { HookEvent, TimeRange, ChartConfig } from '../types';
import { useAgentChartData } from '../composables/useAgentChartData';
import { createChartRenderer, type ChartDimensions } from '../utils/chartRenderer';
import { useEventEmojis } from '../composables/useEventEmojis';
import { useEventColors } from '../composables/useEventColors';

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
const chartHeight = 80;
const hoveredEventCount = ref(false);
const hoveredToolCount = ref(false);
const hoveredAvgTime = ref(false);

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

  // Extract model family and version
  // "claude-haiku-4-5-20251001" -> "haiku-4-5"
  // "claude-sonnet-4-5-20250929" -> "sonnet-4-5"
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
const processedEventIds = new Set<string>();

const { formatEventTypeLabel } = useEventEmojis();
const { getHexColorForApp, getHexColorForSession } = useEventColors();

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
      primary: getThemeColor('primary'),
      glow: getThemeColor('primary-light'),
      axis: getThemeColor('border-primary'),
      text: getThemeColor('text-tertiary')
    }
  };
};

const getDimensions = (): ChartDimensions => {
  const width = chartContainer.value?.offsetWidth || 800;
  return {
    width,
    height: chartHeight,
    padding: {
      top: 7,
      right: 7,
      bottom: 20,
      left: 7
    }
  };
};

const render = () => {
  if (!renderer || !canvas.value) return;

  const data = getChartData();
  const maxValue = Math.max(...data.map(d => d.count), 1);

  renderer.clear();
  renderer.drawBackground();
  renderer.drawAxes();
  renderer.drawTimeLabels(props.timeRange);
  renderer.drawBars(data, maxValue, 1, formatEventTypeLabel, getHexColorForSession);
};

const animateNewEvent = (x: number, y: number) => {
  let radius = 0;
  let opacity = 0.8;

  const animate = () => {
    if (!renderer) return;

    render();
    renderer.drawPulseEffect(x, y, radius, opacity);

    radius += 2;
    opacity -= 0.02;

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
        const x = chartArea.width - chartArea.padding.right - 10;
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

  const barWidth = chartArea.width / data.length;
  const barIndex = Math.floor((x - chartArea.x) / barWidth);

  if (barIndex >= 0 && barIndex < data.length && y >= chartArea.y && y <= chartArea.y + chartArea.height) {
    const point = data[barIndex];
    if (point.count > 0) {
      const eventTypesText = Object.entries(point.eventTypes || {})
        .map(([type, count]) => `${type}: ${count}`)
        .join(', ');

      tooltip.value = {
        visible: true,
        x: event.clientX - rect.left,
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

// Watch for theme changes
const themeObserver = new MutationObserver(() => {
  if (renderer) {
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

  // Start optimized render loop with FPS limiting
  let lastRenderTime = 0;
  const targetFPS = 30;
  const frameInterval = 1000 / targetFPS;

  const renderLoop = (currentTime: number) => {
    const deltaTime = currentTime - lastRenderTime;

    if (deltaTime >= frameInterval) {
      render();
      lastRenderTime = currentTime - (deltaTime % frameInterval);
    }

    requestAnimationFrame(renderLoop);
  };
  requestAnimationFrame(renderLoop);
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

  themeObserver.disconnect();
});
</script>

<style scoped>
.agent-swim-lane {
  width: 100%;
  background: transparent;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.lane-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  padding: 0 7px;
  gap: 12px;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

.agent-label-container {
  display: flex;
  align-items: center;
  gap: 0;
  white-space: nowrap;
}

.agent-label-app,
.agent-label-session {
  padding: 4px 8px;
  border: 1px solid currentColor;
  color: #fff;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.02em;
  display: inline-flex;
  align-items: center;
  min-height: 22px;
}
.agent-label-app    { border-radius: 4px 0 0 4px; }
.agent-label-session { border-radius: 0 4px 4px 0; border-left: none; opacity: 0.85; }

.lane-metric {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  padding: 0;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif;
  white-space: nowrap;
}
.lane-metric__label {
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--theme-text-tertiary);
}
.lane-metric__value {
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--theme-text-primary);
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
}

.close-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--theme-text-tertiary);
  padding: 0;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: background-color 0.12s ease, color 0.12s ease;
  flex-shrink: 0;
}

.close-btn:hover {
  background: var(--theme-hover-bg);
  color: var(--theme-text-primary);
}

.chart-wrapper {
  position: relative;
  width: 100%;
  border: 1px solid var(--theme-border-primary);
  border-radius: 6px;
  overflow: hidden;
  background: var(--theme-bg-secondary);
}

.lane-tooltip {
  position: absolute;
  z-index: 10;
  pointer-events: none;
  padding: 4px 8px;
  font-size: 11px;
  font-weight: 500;
  color: #FFFFFF;
  background: rgba(28, 28, 30, 0.92);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-radius: 6px;
  white-space: nowrap;
}
.lane-waiting {
  font-size: 12px;
  color: var(--theme-text-tertiary);
  font-weight: 500;
}
</style>
