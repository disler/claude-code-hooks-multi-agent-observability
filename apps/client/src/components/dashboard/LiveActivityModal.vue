<template>
  <Teleport to="body">
    <div class="lam" @click.self="$emit('close')">
      <div class="lam__panel" role="dialog" aria-label="All activity">
        <header class="lam__bar">
          <span class="card-eyebrow">All activity</span>
          <button class="lam__close" @click="$emit('close')" aria-label="Close">✕</button>
        </header>
        <ul class="lam__list">
          <li v-for="e in rows" :key="`${e.id}-${e.timestamp}`" class="lam__row">
            <span class="lam__time">{{ formatHM(e.timestamp) }}</span>
            <span class="lam__dot" :class="dotClass(e)"></span>
            <span class="lam__app">{{ e.source_app }}</span>
            <span class="lam__type">{{ labelFor(e.hook_event_type) }}</span>
            <span v-if="summaryOf(e)" class="lam__sum">{{ summaryOf(e) }}</span>
          </li>
        </ul>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import type { HookEvent } from '../../types';
import { useEventEmojis } from '../../composables/useEventEmojis';

const props = defineProps<{ events: HookEvent[] }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const { getLabelForEventType, getToneForEventType } = useEventEmojis();

const rows = computed(() => [...props.events].reverse());

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
    if (i.command) return String(i.command).slice(0, 80);
    if (i.file_path) return String(i.file_path).split('/').pop() || '';
    if (i.url) return String(i.url).slice(0, 80);
  }
  return '';
}
function formatHM(ts?: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function onKey(e: KeyboardEvent) { if (e.key === 'Escape') emit('close'); }
onMounted(() => document.addEventListener('keydown', onKey));
onUnmounted(() => document.removeEventListener('keydown', onKey));
</script>

<style scoped>
.lam {
  position: fixed;
  inset: 0;
  z-index: 70;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.lam__panel {
  width: min(900px, 100%);
  height: min(640px, 90vh);
  display: flex;
  flex-direction: column;
  background: var(--atlas-card-bg);
  border-radius: 20px;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif;
}

.lam__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 24px;
  border-bottom: 1px solid var(--atlas-hairline);
}
.card-eyebrow {
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--atlas-text-secondary);
}
.lam__close {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--atlas-hairline);
  border-radius: 6px;
  color: var(--atlas-text-secondary);
  cursor: pointer;
  font-size: 12px;
  font-family: inherit;
}
.lam__close:hover { color: var(--atlas-text-primary); }

.lam__list {
  margin: 0;
  padding: 8px 24px 16px;
  list-style: none;
  flex: 1;
  overflow-y: auto;
}
.lam__row {
  display: grid;
  grid-template-columns: 64px 10px auto auto 1fr;
  align-items: baseline;
  gap: 10px;
  padding: 6px 0;
  font-size: 14px;
  color: var(--atlas-text-secondary);
}
.lam__time {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  font-size: 12.5px;
  color: var(--atlas-text-muted);
  font-variant-numeric: tabular-nums;
}
.lam__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--atlas-text-muted);
  align-self: center;
}
.lam__dot.is-ok { background: var(--atlas-green); }
.lam__dot.is-bad { background: var(--atlas-red); }
.lam__dot.is-warn { background: var(--atlas-yellow); }
.lam__app { font-weight: 500; color: var(--atlas-text-primary); white-space: nowrap; }
.lam__type { color: var(--atlas-text-secondary); font-size: 13px; white-space: nowrap; }
.lam__sum {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  font-size: 12.5px;
  color: var(--atlas-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
</style>
