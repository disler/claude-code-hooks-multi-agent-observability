<template>
  <button class="div-tile" :class="`div-tile--${health}`" @click="$emit('open')">
    <div class="dt__head">
      <span class="dt__name">{{ name }}</span>
      <span
        v-if="planSlug"
        class="dt__plan-chip"
        :class="hasPlan ? (planLocked ? 'dt__plan-chip--locked' : 'dt__plan-chip--draft') : 'dt__plan-chip--empty'"
      >
        {{ hasPlan ? (planLocked ? 'plan locked' : 'drafting') : 'no plan' }}
      </span>
      <span class="dt__dot" :class="`dt__dot--${health}`"></span>
    </div>
    <div class="dt__metrics">
      <div class="dt__metric">
        <span class="dt__num">{{ events24h }}</span>
        <span class="dt__lbl">events 24h</span>
      </div>
      <div class="dt__metric">
        <span class="dt__num">{{ activeMissions }}</span>
        <span class="dt__lbl">missions</span>
      </div>
      <div class="dt__metric">
        <span class="dt__num">{{ lastActionAgo }}</span>
        <span class="dt__lbl">last action</span>
      </div>
    </div>
    <div v-if="lastSummary" class="dt__last">{{ lastSummary }}</div>
    <!-- When this tile represents an Atlas project with no plan yet, surface
         a compact Add Plan button. Click stops propagation so the tile's
         "open division drawer" handler doesn't also fire. -->
    <div v-if="planSlug && !hasPlan" class="dt__plan-row">
      <span
        class="dt__plan-btn"
        role="button"
        tabindex="0"
        @click.stop="$emit('add-plan', planSlug!)"
        @keydown.enter.stop="$emit('add-plan', planSlug!)"
        @keydown.space.stop="$emit('add-plan', planSlug!)"
      >Add Plan</span>
    </div>
  </button>
</template>

<script setup lang="ts">
defineProps<{
  name: string;
  health: 'active' | 'idle';
  events24h: number;
  activeMissions: number;
  lastActionAgo: string;
  lastSummary?: string;
  // Plan integration — `planSlug` is the project slug under ~/atlas/projects/
  // when the tile represents a project (not all divisions map 1:1). When
  // omitted, the plan chip + Add Plan button stay hidden.
  planSlug?: string;
  hasPlan?: boolean;
  planLocked?: boolean;
}>();
defineEmits<{
  (e: 'open'): void;
  (e: 'add-plan', slug: string): void;
}>();
</script>

<style scoped>
.div-tile {
  background: var(--atlas-card-bg);
  border: 0;
  border-radius: 12px;
  padding: 14px 16px;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
  display: flex;
  flex-direction: column;
  gap: 10px;
  text-align: left;
  cursor: pointer;
  min-width: 0;
  overflow: hidden;
  transition: background-color 120ms ease;
}
.div-tile:hover { background: var(--atlas-card-bg-2, var(--atlas-card-bg)); }

.dt__head { display: flex; align-items: center; gap: 8px; }
.dt__name { font-size: 14px; font-weight: 600; color: var(--atlas-text-strong); }
.dt__dot { margin-left: auto; width: 8px; height: 8px; border-radius: 50%; background: var(--atlas-hairline); }
.dt__dot--active { background: var(--atlas-green); animation: dt-pulse 2s ease-in-out infinite; }
@keyframes dt-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(48,209,88,0.30); }
  50%      { box-shadow: 0 0 0 4px rgba(48,209,88,0); }
}

.dt__metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.dt__metric { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.dt__num {
  font-size: 18px; font-weight: 600;
  color: var(--atlas-text-strong);
  font-variant-numeric: tabular-nums;
  line-height: 1.05;
}
.dt__lbl {
  font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em;
  color: var(--atlas-text-muted, var(--atlas-text-secondary));
}

.dt__last {
  font-size: 11.5px;
  color: var(--atlas-text-secondary);
  font-family: ui-monospace, Menlo, monospace;
  opacity: 0.85;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dt__plan-chip {
  font-size: 9px;
  padding: 1px 6px;
  border-radius: 999px;
  background: rgba(127,127,127,0.18);
  color: var(--atlas-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 500;
}
.dt__plan-chip--locked { background: rgba(48,209,88,0.18); color: var(--atlas-green); }
.dt__plan-chip--draft  { background: rgba(10,132,255,0.18); color: var(--atlas-blue, #0a84ff); }
.dt__plan-chip--empty  { background: rgba(255,159,10,0.14); color: var(--atlas-orange, #ff9f0a); }

.dt__plan-row { display: flex; }
.dt__plan-btn {
  font-size: 11px;
  padding: 3px 9px;
  border-radius: 6px;
  border: 1px solid var(--atlas-hairline);
  background: transparent;
  color: var(--atlas-text-secondary);
  cursor: pointer;
  user-select: none;
}
.dt__plan-btn:hover { background: var(--atlas-card-bg-2, rgba(127,127,127,0.10)); }
</style>
