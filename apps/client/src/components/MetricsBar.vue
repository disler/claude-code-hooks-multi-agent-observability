<template>
  <div class="metrics">
    <div class="metric">
      <div class="k"><AppIcon name="users" :size="13" /><span>Active agents</span></div>
      <div class="v tabular">{{ activeAgents }}</div>
      <div class="d"><span class="sub">{{ agentSummary }}</span></div>
    </div>
    <div class="metric">
      <div class="k"><AppIcon name="activity" :size="13" /><span>Events</span></div>
      <div class="v tabular">{{ formatCount(totalEvents) }}</div>
      <div class="d"><span class="sub">last {{ rangeLabel }}</span></div>
    </div>
    <div class="metric">
      <div class="k"><AppIcon name="zap" :size="13" /><span>Tool calls</span></div>
      <div class="v tabular">{{ formatCount(toolCalls) }}</div>
      <div class="d"><span class="sub">PreToolUse</span></div>
    </div>
    <div class="metric">
      <div class="k"><AppIcon name="clock" :size="13" /><span>Avg gap</span></div>
      <div class="v tabular">{{ formatGap(avgGap) }}</div>
      <div class="d"><span class="sub">min {{ formatGap(minGap) }} · max {{ formatGap(maxGap) }}</span></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import AppIcon from './AppIcon.vue';

const props = withDefaults(defineProps<{
  activeAgents: number;
  agentNames?: string[];
  totalEvents: number;
  toolCalls: number;
  avgGap: number;
  minGap: number;
  maxGap: number;
  rangeLabel?: string;
}>(), {
  agentNames: () => [],
  rangeLabel: '60s',
});

const formatCount = (n: number): string => n.toLocaleString();

const formatGap = (gapMs: number): string => {
  if (!gapMs) return '—';
  if (gapMs < 1000) return `${Math.round(gapMs)}ms`;
  return `${(gapMs / 1000).toFixed(1)}s`;
};

// Show the first agent name(s) without the session hash, e.g. "orchestrator · code-writer · +2"
const agentSummary = computed(() => {
  const names = props.agentNames.map((id) => id.split(':')[0]);
  if (names.length === 0) return 'none active';
  const shown = names.slice(0, 2);
  const extra = names.length - shown.length;
  return shown.join(' · ') + (extra > 0 ? ` · +${extra}` : '');
});
</script>

<style scoped>
.metrics {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border-top: 1px solid var(--hair-faint);
  border-bottom: 1px solid var(--hair-faint);
  background: var(--surface);
}
.metric {
  padding: var(--space-3) var(--space-4) 14px;
  border-right: 1px solid var(--hair-faint);
  min-width: 0;
}
.metric:last-child { border-right: 0; }
.metric .k {
  display: flex; align-items: center; gap: 6px;
  color: var(--text-faint);
}
.metric .k span {
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: var(--tracking-caps);
  text-transform: uppercase;
  white-space: nowrap;
}
.metric .v {
  margin-top: 9px;
  font-family: var(--font-mono);
  font-size: var(--text-2xl);
  font-weight: var(--weight-medium);
  line-height: 1;
  color: var(--text-strong);
  letter-spacing: -0.01em;
}
.metric .d {
  margin-top: 7px;
  font-size: var(--text-xs);
  min-height: 14px;
}
.metric .d .sub {
  color: var(--text-faint);
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
  white-space: nowrap;
}

@media (max-width: 699px) {
  .metrics { grid-template-columns: repeat(2, 1fr); }
  .metric:nth-child(2) { border-right: 0; }
  .metric:nth-child(1), .metric:nth-child(2) { border-bottom: 1px solid var(--hair-faint); }
  .metric .v { font-size: var(--text-xl); }
}
</style>
