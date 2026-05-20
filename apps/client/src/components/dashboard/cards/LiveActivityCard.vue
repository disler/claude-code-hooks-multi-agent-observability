<template>
  <article class="card live-activity" :class="{ 'is-expanded': expanded }">
    <button class="la__strip" @click="expanded = !expanded" :aria-expanded="expanded">
      <span class="card-eyebrow">Activity</span>

      <!-- Inline 24h micro-graph -->
      <div v-if="totalLast24h" class="la__chart" :title="`${totalLast24h} events · last 24h`">
        <div
          v-for="(b, i) in hourBins"
          :key="i"
          class="la__chart-col"
          :title="`${b.label}: ${b.total} events`"
        >
          <span class="la__chart-stack" :style="{ height: colHeight(b.total) + '%' }">
            <span class="la__chart-seg la__chart-seg--ok"   :style="{ flex: b.ok }"   v-if="b.ok"/>
            <span class="la__chart-seg la__chart-seg--info" :style="{ flex: b.info }" v-if="b.info"/>
            <span class="la__chart-seg la__chart-seg--warn" :style="{ flex: b.warn }" v-if="b.warn"/>
            <span class="la__chart-seg la__chart-seg--bad"  :style="{ flex: b.bad }"  v-if="b.bad"/>
          </span>
        </div>
      </div>

      <span class="la__count">{{ totalLast24h }}<span class="la__count-unit">/24h</span></span>
      <span class="la__caret">{{ expanded ? '▾' : '▸' }}</span>
    </button>

    <div v-if="expanded" class="la__body">
      <div class="la__actions">
        <a class="la__link" href="#" @click.prevent="$emit('open-search')">Search audit →</a>
        <a v-if="props.events.length > rows.length" class="la__link" href="#" @click.prevent="$emit('view-all')">View all →</a>
      </div>
      <ul v-if="rows.length" class="la__list">
        <li v-for="e in rows" :key="`${e.id}-${e.timestamp}`" class="la__row">
          <span class="la__time">{{ formatHM(e.timestamp) }}</span>
          <span class="la__dot" :class="dotClass(e)"></span>
          <span class="la__app">{{ e.source_app }}</span>
          <span class="la__type">{{ labelFor(e.hook_event_type) }}</span>
          <span v-if="summaryOf(e)" class="la__sum">{{ summaryOf(e) }}</span>
        </li>
      </ul>
      <div v-else class="la__empty">Stream is quiet.</div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { HookEvent } from '../../../types';
import { useEventEmojis } from '../../../composables/useEventEmojis';

const expanded = ref(false);

const props = defineProps<{ events: HookEvent[] }>();
defineEmits<{ (e: 'view-all'): void; (e: 'open-search'): void }>();
const { getLabelForEventType, getToneForEventType } = useEventEmojis();

const rows = computed(() => props.events.slice(-8).reverse());

// 24h hourly bins. Each bin counts events by tone.
const HOURS = 24;
const hourBins = computed(() => {
  const now = new Date();
  const buckets: Array<{ label: string; ok: number; info: number; warn: number; bad: number; total: number }> = [];
  for (let i = HOURS - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 3600_000);
    const hr = d.getHours();
    buckets.push({ label: `${String(hr).padStart(2, '0')}:00`, ok: 0, info: 0, warn: 0, bad: 0, total: 0 });
  }
  const cutoff = now.getTime() - HOURS * 3600_000;
  for (const e of props.events) {
    if (!e.timestamp || e.timestamp < cutoff) continue;
    const idx = HOURS - 1 - Math.floor((now.getTime() - e.timestamp) / 3600_000);
    if (idx < 0 || idx >= HOURS) continue;
    const tone = getToneForEventType(e.hook_event_type);
    if (tone === 'success')      buckets[idx].ok++;
    else if (tone === 'error')   buckets[idx].bad++;
    else if (tone === 'warning') buckets[idx].warn++;
    else                          buckets[idx].info++;
    buckets[idx].total++;
  }
  return buckets;
});
const totalLast24h = computed(() => hourBins.value.reduce((a, b) => a + b.total, 0));
const maxBin = computed(() => Math.max(1, ...hourBins.value.map(b => b.total)));
function colHeight(n: number) { return Math.max(2, (n / maxBin.value) * 100); }

function labelFor(t: string): string { return getLabelForEventType(t); }

function dotClass(e: HookEvent): string {
  const tone = getToneForEventType(e.hook_event_type);
  if (tone === 'success') return 'is-ok';
  if (tone === 'error') return 'is-bad';
  if (tone === 'warning') return 'is-warn';
  return '';
}

function summaryOf(e: HookEvent): string {
  if (e.summary) return e.summary;
  const p: any = e.payload || {};
  if (p.tool_name && p.tool_input) {
    const i = p.tool_input;
    if (i.command) return String(i.command).slice(0, 60);
    if (i.file_path) return String(i.file_path).split('/').pop() || '';
    if (i.url) return String(i.url).slice(0, 60);
  }
  return '';
}

function formatHM(ts?: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
</script>

<style scoped>
.card {
  background: var(--atlas-card-bg);
  border-radius: 14px;
  padding: 0;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Whole strip is a button — click to expand. Compact one-line header. */
.la__strip {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 9px 14px;
  background: transparent;
  border: 0;
  width: 100%;
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  transition: background-color 100ms ease;
}
.la__strip:hover { background: rgba(0,0,0,0.03); }
.la__caret {
  font-size: 10px;
  color: var(--atlas-text-muted, var(--atlas-text-secondary));
  flex: none;
  width: 12px;
  text-align: center;
}
.card-eyebrow {
  display: block;
  font-size: 11.5px;
  font-weight: 500;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--atlas-text-secondary);
  flex: none;
}

.la__chart {
  flex: 1 1 auto;
  display: flex;
  align-items: flex-end;
  gap: 1px;
  height: 22px;
  min-width: 0;
}
.la__chart-col {
  flex: 1 1 auto;
  min-width: 2px;
  height: 100%;
  display: flex;
  align-items: flex-end;
  border-radius: 2px;
  transition: background-color 100ms ease;
}
.la__chart-col:hover { background: rgba(0,0,0,0.04); }
.la__chart-stack {
  width: 100%;
  display: flex;
  flex-direction: column-reverse;
  border-radius: 2px 2px 0 0;
  overflow: hidden;
  min-height: 2px;
}
.la__chart-seg { display: block; min-height: 1px; }
.la__chart-seg--ok   { background: var(--atlas-green); }
.la__chart-seg--info { background: var(--atlas-blue); opacity: 0.65; }
.la__chart-seg--warn { background: var(--atlas-yellow); }
.la__chart-seg--bad  { background: var(--atlas-red); }

.la__count {
  font-size: 12px;
  font-weight: 500;
  color: var(--atlas-text-primary);
  font-variant-numeric: tabular-nums;
  flex: none;
}
.la__count-unit { color: var(--atlas-text-muted, var(--atlas-text-secondary)); font-weight: 400; }
.la__link {
  font-size: 12px;
  font-weight: 500;
  color: var(--atlas-blue);
  text-decoration: none;
  flex: none;
}
.la__link:hover { opacity: 0.7; }

.la__body {
  border-top: 1px solid var(--atlas-hairline);
  padding: 8px 14px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.la__actions { display: flex; gap: 12px; }
.la__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.la__row {
  display: grid;
  grid-template-columns: 50px 6px auto auto 1fr;
  align-items: baseline;
  gap: 8px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--atlas-text-secondary);
  overflow: hidden;
}
.la__time {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  font-size: 11px;
  color: var(--atlas-text-muted);
  font-variant-numeric: tabular-nums;
}
.la__dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--atlas-text-muted);
  align-self: center;
}
.la__dot.is-ok { background: var(--atlas-green); }
.la__dot.is-bad { background: var(--atlas-red); }
.la__dot.is-warn { background: var(--atlas-yellow); }
.la__app {
  font-weight: 500;
  color: var(--atlas-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 130px;
  font-size: 11.5px;
}
.la__type {
  color: var(--atlas-text-secondary);
  font-size: 11.5px;
  white-space: nowrap;
}
.la__sum {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  font-size: 11px;
  color: var(--atlas-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.la__empty {
  margin: 0;
  font-size: 12px;
  color: var(--atlas-text-secondary);
}
</style>
