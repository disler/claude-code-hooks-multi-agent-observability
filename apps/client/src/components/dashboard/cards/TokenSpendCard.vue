<template>
  <article
    class="card token-spend"
    @click="$emit('open-detail')"
    role="button"
    tabindex="0"
    @keydown.enter="$emit('open-detail')"
  >
    <div class="ts__head">
      <span class="card-eyebrow">Token spend</span>
      <span class="ts__trend" :class="trendClass">{{ trendLabel }}</span>
    </div>

    <div class="ts__hero" :title="`Month $${monthDollars} · ${monthCalls} calls — click for detail`">
      <span class="ts__hero-value">${{ todayDollars }}</span>
      <span class="ts__hero-unit">today</span>
    </div>
    <div class="ts__meta">
      <span class="hide-mobile">{{ todayCalls }} calls today</span>
      <span class="ts__meta-sep">·</span>
      <span>${{ monthDollars }}/mo</span>
    </div>

    <!-- 14-day sparkline -->
    <div class="ts__spark" v-if="spark.length">
      <div
        v-for="(d, i) in spark"
        :key="d.date"
        class="ts__bar"
        :class="{ 'is-today': i === spark.length - 1 }"
        :style="{ height: barHeight(d.calls) + '%' }"
        :title="`${d.date}: ${d.calls} events`"
      />
    </div>
    <div class="ts__spark-labels" v-if="spark.length">
      <span>{{ shortDate(spark[0].date) }}</span>
      <span>today</span>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useAtlasStats } from '../../../composables/useAtlasStats';
import { useAtlasSpendDetail } from '../../../composables/useAtlasViews';

defineEmits<{ (e: 'open-detail'): void }>();

const { stats } = useAtlasStats();
const { spend } = useAtlasSpendDetail();

const todayDollars = computed(() => stats.value?.codeburn.today?.dollars?.toFixed(2) ?? '—');
const todayCalls   = computed(() => stats.value?.codeburn.today?.calls ?? 0);
const monthDollars = computed(() => stats.value?.codeburn.month?.dollars?.toFixed(2) ?? '—');
const monthCalls   = computed(() => stats.value?.codeburn.month?.calls ?? 0);

const spark = computed(() => spend.value?.sparkline || []);
const maxBar = computed(() => Math.max(1, ...spark.value.map(d => d.calls)));
function barHeight(n: number) { return Math.max(3, (n / maxBar.value) * 100); }
function shortDate(iso?: string) {
  if (!iso) return '';
  try {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch { return iso; }
}

// Today vs prior-7-day-avg = simple trend signal
const trend = computed<'up' | 'down' | 'flat'>(() => {
  const s = spark.value;
  if (s.length < 4) return 'flat';
  const todayCalls = s[s.length - 1].calls;
  const prior = s.slice(Math.max(0, s.length - 8), -1);
  if (prior.length === 0) return 'flat';
  const avg = prior.reduce((a, b) => a + b.calls, 0) / prior.length;
  if (avg < 1) return todayCalls > 1 ? 'up' : 'flat';
  const ratio = todayCalls / avg;
  if (ratio > 1.25) return 'up';
  if (ratio < 0.75) return 'down';
  return 'flat';
});
const trendLabel = computed(() =>
  trend.value === 'up' ? '↑ above avg' :
  trend.value === 'down' ? '↓ below avg' :
  '≈ on pace'
);
const trendClass = computed(() => ({
  'ts__trend--up': trend.value === 'up',
  'ts__trend--down': trend.value === 'down',
}));
</script>

<style scoped>
.card {
  background: var(--atlas-card-bg);
  border-radius: 20px;
  padding: 24px 26px;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif;
  cursor: pointer;
  transition: transform 120ms ease;
  min-width: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.card:hover { transform: translateY(-1px); }
@media (max-width: 1023px) { .card { padding: 20px 22px; } }
@media (max-width: 480px)  { .card { padding: 18px 18px; border-radius: 16px; } }

.ts__head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.card-eyebrow {
  font-size: 12px; font-weight: 500; letter-spacing: 0.06em;
  text-transform: uppercase; color: var(--atlas-text-secondary);
}
.ts__trend {
  font-size: 11px; font-weight: 500;
  font-variant-numeric: tabular-nums;
  color: var(--atlas-text-muted, var(--atlas-text-secondary));
}
.ts__trend--up   { color: var(--atlas-red); }
.ts__trend--down { color: var(--atlas-green); }

.ts__hero {
  margin-top: 4px;
  display: flex;
  align-items: baseline;
  gap: 8px;
  color: var(--atlas-text-strong);
}
.ts__hero-value {
  font-size: 40px;
  font-weight: 600;
  letter-spacing: -0.03em;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.ts__hero-unit {
  font-size: 13px;
  color: var(--atlas-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 500;
}
@media (max-width: 480px) { .ts__hero-value { font-size: 32px; } }
@media (max-width: 360px) { .ts__hero-value { font-size: 28px; } .hide-mobile { display: none; } }

.ts__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 12.5px;
  color: var(--atlas-text-secondary);
  font-variant-numeric: tabular-nums;
}
.ts__meta-sep { color: var(--atlas-text-muted); }

.ts__spark {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 36px;
  margin-top: 8px;
}
.ts__bar {
  flex: 1 1 auto;
  min-width: 3px;
  background: var(--atlas-blue);
  border-radius: 2px 2px 0 0;
  opacity: 0.55;
  transition: opacity 120ms ease;
}
.ts__bar.is-today { opacity: 1; }
.card:hover .ts__bar { opacity: 0.75; }
.card:hover .ts__bar.is-today { opacity: 1; }

.ts__spark-labels {
  display: flex;
  justify-content: space-between;
  font-size: 10.5px;
  color: var(--atlas-text-muted, var(--atlas-text-secondary));
  margin-top: 2px;
  font-variant-numeric: tabular-nums;
}
</style>
