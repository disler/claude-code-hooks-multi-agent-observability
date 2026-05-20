<template>
  <div class="today-view">
    <!-- Latest brief hero -->
    <section class="today-section">
      <h2 class="today-section__head">Latest brief</h2>
      <article v-if="latestBrief" class="today-hero">
        <div class="today-hero__meta">
          <span class="today-hero__topic">{{ latestBrief.topic }}</span>
          <span class="meta-sep">·</span>
          <span class="today-hero__date">{{ latestBrief.date }}</span>
        </div>
        <h3 class="today-hero__title">{{ latestBrief.title }}</h3>
        <p v-if="latestBrief.tldr" class="today-hero__tldr">{{ latestBrief.tldr }}</p>
        <a class="today-hero__cta" :href="briefServeUrl(latestBrief)" target="_blank" rel="noopener">Read full brief →</a>
      </article>
      <div v-else-if="briefsLoading" class="today-empty">Loading…</div>
      <div v-else class="today-empty">No briefs yet.</div>
    </section>

    <!-- What Atlas did -->
    <section class="today-section">
      <h2 class="today-section__head">What Atlas did</h2>
      <ul v-if="importantEvents.length" class="today-feed">
        <li v-for="e in importantEvents" :key="`${e.id}-${e.timestamp}`" class="today-feed__row">
          <span class="today-feed__time">{{ formatHM(e.timestamp) }}</span>
          <span class="today-feed__app">{{ e.source_app }}</span>
          <span class="today-feed__type" :class="`tone-${toneFor(e.hook_event_type)}`">{{ labelFor(e.hook_event_type) }}</span>
          <span v-if="eventSummary(e)" class="today-feed__sum">{{ eventSummary(e) }}</span>
        </li>
      </ul>
      <div v-else class="today-empty">No recent activity yet.</div>
    </section>

    <!-- Pending review -->
    <section class="today-section">
      <h2 class="today-section__head">Pending review</h2>
      <ul v-if="pending.length" class="today-pending">
        <li v-for="item in pending" :key="item.id" class="today-pending__card">
          <div class="today-pending__head">
            <span class="today-pending__type">{{ item.type }}</span>
            <span class="meta-sep">·</span>
            <span class="today-pending__title">{{ item.title }}</span>
          </div>
          <div v-if="item.preview" class="today-pending__preview">{{ item.preview }}</div>
          <div class="today-pending__actions">
            <button class="btn btn--ghost btn--sm" @click="reject(item.id)">Reject</button>
            <button class="btn btn--primary btn--sm" @click="approve(item.id)">Approve</button>
          </div>
        </li>
      </ul>
      <div v-else class="today-empty">Nothing waiting on you.</div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { HookEvent } from '../types';
import { API_BASE_URL } from '../config';
import { useEventEmojis } from '../composables/useEventEmojis';

const props = defineProps<{ events: HookEvent[] }>();

const { getLabelForEventType, getToneForEventType } = useEventEmojis();

const briefs = ref<any[]>([]);
const briefsLoading = ref(false);
const pending = ref<any[]>([]);
let pollTimer: number | null = null;

const latestBrief = computed(() => briefs.value[0] || null);

const importantTypes = new Set([
  'SubagentStop',
  'ResearchBriefCompleted',
  'PostToolUseFailure',
  'Stop',
]);

const importantEvents = computed(() => {
  return props.events
    .filter(e => importantTypes.has(e.hook_event_type) || !!e.summary)
    .slice(-10)
    .reverse();
});

function formatHM(ts?: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function labelFor(type: string) { return getLabelForEventType(type); }
function toneFor(type: string) { return getToneForEventType(type); }

function eventSummary(e: HookEvent): string {
  if (e.summary) return e.summary;
  const p: any = e.payload || {};
  if (p.tool_name && p.tool_input) {
    const t = p.tool_input;
    if (t.command) return `${p.tool_name}: ${String(t.command).slice(0, 60)}`;
    if (t.file_path) return `${p.tool_name}: ${String(t.file_path).split('/').pop()}`;
    if (t.url) return `${p.tool_name}: ${String(t.url).slice(0, 60)}`;
  }
  return '';
}

function briefServeUrl(b: any): string {
  return `${API_BASE_URL}/api/atlas/briefs/file?path=${encodeURIComponent(b.path)}`;
}

async function loadBriefs() {
  briefsLoading.value = true;
  try {
    const res = await fetch(`${API_BASE_URL}/api/atlas/briefs`);
    if (res.ok) {
      const data = await res.json();
      briefs.value = data.briefs || [];
    }
  } catch (err) {
    console.error('[today] briefs fetch failed', err);
  } finally {
    briefsLoading.value = false;
  }
}

async function loadPending() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/atlas/pending`);
    if (res.ok) {
      const data = await res.json();
      pending.value = data.items || [];
    }
  } catch (err) {
    console.error('[today] pending fetch failed', err);
  }
}

async function approve(id: string) {
  try {
    await fetch(`${API_BASE_URL}/api/atlas/pending/${encodeURIComponent(id)}/approve`, { method: 'POST' });
    pending.value = pending.value.filter(p => p.id !== id);
  } catch {/* ignore */}
}

async function reject(id: string) {
  try {
    await fetch(`${API_BASE_URL}/api/atlas/pending/${encodeURIComponent(id)}/reject`, { method: 'POST' });
    pending.value = pending.value.filter(p => p.id !== id);
  } catch {/* ignore */}
}

onMounted(() => {
  loadBriefs();
  loadPending();
  pollTimer = window.setInterval(() => { loadPending(); }, 30_000);
});
onUnmounted(() => {
  if (pollTimer !== null) clearInterval(pollTimer);
});
</script>

<style scoped>
.today-view {
  height: 100%;
  overflow-y: auto;
  background: var(--theme-bg-secondary);
  padding: 10px 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif;
}
@media (max-width: 699px) {
  .today-view { padding: 12px 12px 24px; gap: 10px; }
}

.today-section { max-width: 100%; }
.today-section__head {
  margin: 0 0 6px;
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--theme-text-tertiary);
}

.today-hero {
  padding: 12px 14px;
  background: var(--theme-bg-primary);
  border: 1px solid var(--theme-border-primary);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.today-hero__meta {
  font-size: 10.5px;
  color: var(--theme-text-tertiary);
  display: inline-flex;
  gap: 6px;
}
.today-hero__topic {
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 500;
  color: var(--theme-text-tertiary);
}
.today-hero__date {
  font-variant-numeric: tabular-nums;
  color: var(--theme-text-tertiary);
}
.meta-sep { color: var(--theme-text-quaternary); }

.today-hero__title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: -0.016em;
  color: var(--theme-text-primary);
}
.today-hero__tldr {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--theme-text-secondary);
  font-weight: 400;
}
.today-hero__cta {
  margin-top: 2px;
  color: var(--theme-primary);
  font-size: 12px;
  font-weight: 500;
  text-decoration: none;
}
.today-hero__cta:hover { text-decoration: underline; }

.today-feed {
  margin: 0;
  padding: 0;
  list-style: none;
  background: var(--theme-bg-primary);
  border: 1px solid var(--theme-border-primary);
  border-radius: 8px;
  overflow: hidden;
}
.today-feed__row {
  display: grid;
  grid-template-columns: 46px auto 1fr;
  align-items: center;
  gap: 8px;
  padding: 5px 10px;
  font-size: 12px;
  border-bottom: 1px solid var(--theme-border-primary);
}
.today-feed__row:last-child { border-bottom: none; }
.today-feed__time {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  font-size: 10.5px;
  color: var(--theme-text-tertiary);
  font-variant-numeric: tabular-nums;
}
.today-feed__app {
  font-size: 11px;
  font-weight: 500;
  color: var(--theme-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 110px;
}
.today-feed__type {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 3px;
  letter-spacing: 0.01em;
  background: var(--theme-bg-tertiary);
  color: var(--theme-text-secondary);
  white-space: nowrap;
  font-weight: 500;
  grid-column: 3;
  justify-self: end;
}
.today-feed__type.tone-success { color: var(--theme-accent-success); background: rgba(48, 209, 88, 0.10); }
.today-feed__type.tone-error   { color: var(--theme-accent-error);   background: rgba(255, 69, 58, 0.10); }
.today-feed__type.tone-warning { color: var(--theme-accent-warning); background: rgba(255, 214, 10, 0.10); }
.today-feed__type.tone-info    { color: var(--theme-primary);        background: var(--theme-primary-light); }
.today-feed__sum {
  grid-column: 1 / -1;
  font-size: 11px;
  color: var(--theme-text-tertiary);
  margin-top: 1px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 400;
}

.today-pending {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.today-pending__card {
  padding: 10px;
  background: var(--theme-bg-primary);
  border: 1px solid var(--theme-border-primary);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.today-pending__head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}
.today-pending__type {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 500;
  color: var(--theme-text-tertiary);
}
.today-pending__title { color: var(--theme-text-primary); font-weight: 500; }
.today-pending__preview {
  font-size: 11.5px;
  color: var(--theme-text-secondary);
  line-height: 1.4;
}
.today-pending__actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

.today-empty {
  padding: 10px 12px;
  font-size: 11.5px;
  color: var(--theme-text-tertiary);
  background: var(--theme-bg-primary);
  border: 1px solid var(--theme-border-primary);
  border-radius: 8px;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  border-radius: 6px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: background-color 0.12s ease, border-color 0.12s ease, color 0.12s ease;
}
.btn--sm { padding: 4px 10px; font-size: 11px; }
.btn--primary { background: var(--theme-primary); color: #fff; border-color: var(--theme-primary); }
.btn--primary:hover { background: var(--theme-primary-hover); border-color: var(--theme-primary-hover); }
.btn--ghost {
  background: var(--theme-bg-secondary);
  color: var(--theme-text-secondary);
  border-color: var(--theme-border-primary);
}
.btn--ghost:hover { background: var(--theme-bg-tertiary); color: var(--theme-text-primary); }
</style>
