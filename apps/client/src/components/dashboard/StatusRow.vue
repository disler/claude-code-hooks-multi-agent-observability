<template>
  <div class="status-row">
    <a class="status-row__item" href="#stats" @click.prevent="scrollTo('stats')">
      <span class="status-row__value">${{ todayDollars }}</span>
      <span class="status-row__label">today</span>
    </a>
    <span class="status-row__sep">·</span>
    <a class="status-row__item" href="#services" @click.prevent="scrollTo('services')">
      <span class="status-row__dot" :class="healthClass"></span>
      <span>{{ healthyCount }} healthy</span>
    </a>
    <span class="status-row__sep">·</span>
    <a v-if="latestBriefTitle" class="status-row__item" href="#brief" @click.prevent="scrollTo('brief')">
      <span class="status-row__brief-icon" aria-hidden="true">◐</span>
      <span class="status-row__brief-text">{{ latestBriefTitle }}</span>
    </a>
    <span v-else class="status-row__item status-row__item--muted">no brief yet</span>
    <span class="status-row__sep">·</span>
    <span class="status-row__host" :title="`Connected to ${hostName} via ${connection}`">
      <span class="status-row__host-dot" :class="`status-row__host-dot--${connection}`"></span>
      {{ hostLabel }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useAtlasStats } from '../../composables/useAtlasStats';

const { stats } = useAtlasStats();

const todayDollars = computed(() => stats.value?.codeburn.today?.dollars?.toFixed(2) ?? '—');
const healthyCount = computed(() => stats.value?.services.healthy ?? 0);

const healthClass = computed(() => {
  const items = stats.value?.services.items || [];
  const failing = items.filter(i => i.status === 'failing').length;
  if (failing > 0 && failing >= items.length / 2) return 'is-bad';
  if (failing > 0) return 'is-warn';
  return 'is-ok';
});

const latestBriefTitle = computed(() => {
  const first = stats.value?.briefs.recent?.[0];
  if (!first) return '';
  const t: string | undefined = (first as any).title;
  return t || first.filename?.replace(/[-_]/g, ' ') || '';
});

function scrollTo(id: string) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Connection awareness: localhost / tailscale (100.x) / LAN / other.
const hostName = computed(() => (typeof window !== 'undefined' ? window.location.hostname : ''));
const connection = computed<'local' | 'tailscale' | 'lan' | 'other'>(() => {
  const h = hostName.value;
  if (!h || h === 'localhost' || h === '127.0.0.1') return 'local';
  if (/^100\.[0-9]+\./.test(h)) return 'tailscale';
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(h)) return 'lan';
  return 'other';
});
const hostLabel = computed(() => {
  const c = connection.value;
  if (c === 'local') return 'local';
  if (c === 'tailscale') return 'tailscale';
  if (c === 'lan') return 'lan';
  return hostName.value || 'remote';
});
</script>

<style scoped>
.status-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  padding: 24px 48px;
  font-size: 15px;
  font-weight: 400;
  color: var(--atlas-text-secondary);
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif;
}
@media (max-width: 1023px) {
  .status-row { padding: 20px 24px; gap: 10px; font-size: 14px; }
}

.status-row__item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: inherit;
  text-decoration: none;
  transition: opacity 0.15s ease;
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.status-row__item:hover { opacity: 0.7; }
.status-row__item--muted { color: var(--atlas-text-muted); cursor: default; }

.status-row__value {
  color: var(--atlas-text-primary);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.status-row__label { color: var(--atlas-text-secondary); }
.status-row__sep { color: var(--atlas-text-muted); }

.status-row__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--atlas-text-muted);
}
.status-row__dot.is-ok   { background: var(--atlas-green); }
.status-row__dot.is-warn { background: var(--atlas-yellow); }
.status-row__dot.is-bad  { background: var(--atlas-red); }

.status-row__brief-icon { color: var(--atlas-yellow); font-size: 14px; }
.status-row__brief-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 280px;
}

.status-row__host {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  color: var(--atlas-text-muted, var(--atlas-text-secondary));
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.status-row__host-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--atlas-text-muted); }
.status-row__host-dot--tailscale { background: #845EF7; }
.status-row__host-dot--local     { background: var(--atlas-green); }
.status-row__host-dot--lan       { background: var(--atlas-blue); }
.status-row__host-dot--other     { background: var(--atlas-yellow); }
</style>
