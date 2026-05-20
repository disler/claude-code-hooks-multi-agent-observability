<template>
  <header class="atlas-topbar">
    <div class="atlas-topbar__inner">
      <span class="atlas-topbar__brand">atlas</span>

      <span class="atlas-topbar__sep">·</span>
      <span class="atlas-topbar__metric" :title="spendTitle">
        ${{ todayDollars }}
        <span class="atlas-topbar__metric-sub">today</span>
      </span>

      <span class="atlas-topbar__sep">·</span>
      <span class="atlas-topbar__health" :class="healthClass" :title="healthTitle">
        <span class="atlas-topbar__health-dot"></span>
        {{ healthyCount }} healthy
      </span>

      <span class="atlas-topbar__sep">·</span>
      <a
        v-if="latestBrief"
        :href="latestBriefUrl"
        target="_blank"
        rel="noopener"
        class="atlas-topbar__brief"
        :title="latestBrief"
      >
        <span class="atlas-topbar__brief-icon" aria-hidden="true">◐</span>
        <span class="atlas-topbar__brief-text">{{ latestBrief }}</span>
      </a>
      <span v-else class="atlas-topbar__brief is-empty">no brief yet</span>

      <span class="atlas-topbar__spacer"></span>

      <!-- Mobile collapse: status dot -->
      <button class="atlas-topbar__mobile-dot" :class="healthClass" @click="showMobilePopover = !showMobilePopover" :aria-expanded="showMobilePopover" aria-label="Atlas status">
        <span class="atlas-topbar__health-dot"></span>
      </button>
    </div>

    <!-- Mobile popover -->
    <div v-if="showMobilePopover" class="atlas-topbar__popover" @click.stop>
      <div class="atlas-topbar__popover-row">
        <span class="atlas-topbar__popover-label">Today</span>
        <span class="atlas-topbar__popover-value">${{ todayDollars }}</span>
      </div>
      <div class="atlas-topbar__popover-row">
        <span class="atlas-topbar__popover-label">Services</span>
        <span class="atlas-topbar__popover-value" :class="healthClass">{{ healthyCount }} of {{ totalCount }} healthy</span>
      </div>
      <div class="atlas-topbar__popover-row">
        <span class="atlas-topbar__popover-label">Latest brief</span>
        <a v-if="latestBriefUrl" :href="latestBriefUrl" target="_blank" rel="noopener" class="atlas-topbar__popover-value is-link">{{ latestBrief }}</a>
        <span v-else class="atlas-topbar__popover-value">—</span>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useAtlasStats } from '../composables/useAtlasStats';
import { API_BASE_URL } from '../config';

const { stats } = useAtlasStats();
const showMobilePopover = ref(false);

const todayDollars = computed(() => stats.value?.codeburn.today?.dollars?.toFixed(2) ?? '—');
const monthDollars = computed(() => stats.value?.codeburn.month?.dollars?.toFixed(2) ?? '—');
const spendTitle = computed(() => `Today ${todayDollars.value} · Month ${monthDollars.value}`);

const healthyCount = computed(() => stats.value?.services.healthy ?? 0);
const totalCount = computed(() => stats.value?.services.total ?? 0);
const healthClass = computed(() => {
  const items = stats.value?.services.items || [];
  const failing = items.filter(i => i.status === 'failing').length;
  if (failing > 0 && failing >= items.length / 2) return 'is-bad';
  if (failing > 0) return 'is-warn';
  return 'is-ok';
});
const healthTitle = computed(() => {
  const items = stats.value?.services.items || [];
  return items.map(i => `${i.name} · ${i.status}`).join('\n');
});

const latestBrief = computed(() => {
  const first = stats.value?.briefs.recent?.[0];
  if (!first) return '';
  const t: string | undefined = (first as any).title;
  if (t) return t;
  return first.filename.replace(/[-_]/g, ' ');
});
const latestBriefUrl = computed(() => {
  const u = stats.value?.briefs.recent?.[0]?.url ?? '';
  if (!u) return '';
  return u.startsWith('http') ? u : `${API_BASE_URL}${u}`;
});
</script>

<style scoped>
.atlas-topbar {
  position: relative;
  background: var(--theme-bg-primary);
  border-bottom: 1px solid var(--theme-border-primary);
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif;
  color: var(--theme-text-primary);
}
.atlas-topbar__inner {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 48px;
  padding: 0 16px;
}
@media (max-width: 699px) {
  .atlas-topbar__inner { padding: 0 12px; gap: 8px; }
}

.atlas-topbar__brand {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.016em;
  color: var(--theme-text-primary);
}

.atlas-topbar__sep {
  color: var(--theme-text-quaternary);
  font-size: 12px;
}
@media (max-width: 699px) {
  .atlas-topbar__sep, .atlas-topbar__metric, .atlas-topbar__health, .atlas-topbar__brief { display: none; }
}

.atlas-topbar__metric {
  font-size: 12px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  color: var(--theme-text-primary);
  letter-spacing: -0.005em;
}
.atlas-topbar__metric-sub {
  margin-left: 4px;
  font-weight: 400;
  color: var(--theme-text-tertiary);
}

.atlas-topbar__health {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 400;
  color: var(--theme-text-secondary);
  font-variant-numeric: tabular-nums;
}
.atlas-topbar__health-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--theme-text-tertiary);
}
.is-ok .atlas-topbar__health-dot { background: var(--theme-accent-success); box-shadow: 0 0 0 3px rgba(48, 209, 88, 0.16); }
.is-warn .atlas-topbar__health-dot { background: var(--theme-accent-warning); box-shadow: 0 0 0 3px rgba(255, 214, 10, 0.16); }
.is-bad .atlas-topbar__health-dot { background: var(--theme-accent-error); box-shadow: 0 0 0 3px rgba(255, 69, 58, 0.16); }

.atlas-topbar__brief {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 400;
  color: var(--theme-text-secondary);
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 320px;
  letter-spacing: -0.005em;
}
.atlas-topbar__brief:hover { color: var(--theme-primary); }
.atlas-topbar__brief.is-empty { color: var(--theme-text-tertiary); }
.atlas-topbar__brief-icon { color: var(--theme-accent-warning); font-size: 11px; }

.atlas-topbar__spacer { flex: 1 1 auto; }

.atlas-topbar__mobile-dot {
  display: none;
  background: none;
  border: 1px solid var(--theme-border-primary);
  border-radius: 999px;
  padding: 6px;
  cursor: pointer;
}
@media (max-width: 699px) {
  .atlas-topbar__mobile-dot { display: inline-flex; margin-left: auto; }
}

.atlas-topbar__popover {
  position: absolute;
  top: 48px;
  right: 14px;
  z-index: 50;
  min-width: 240px;
  padding: 12px;
  background: var(--theme-bg-primary);
  border: 1px solid var(--theme-border-primary);
  border-radius: 10px;
  box-shadow: 0 8px 24px var(--theme-shadow-lg);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.atlas-topbar__popover-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
}
.atlas-topbar__popover-label {
  color: var(--theme-text-tertiary);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 600;
}
.atlas-topbar__popover-value {
  color: var(--theme-text-primary);
  font-weight: 500;
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
}
.atlas-topbar__popover-value.is-link { color: var(--theme-primary); text-decoration: none; }
.atlas-topbar__popover-value.is-ok { color: var(--theme-accent-success); }
.atlas-topbar__popover-value.is-warn { color: var(--theme-accent-warning); }
.atlas-topbar__popover-value.is-bad { color: var(--theme-accent-error); }
</style>
