<template>
  <component
    :is="clickable ? 'button' : 'div'"
    class="tile"
    :class="[`tile--${tone || 'neutral'}`, { 'tile--clickable': clickable }]"
    :title="hint || ''"
    @click="$emit('click')"
  >
    <div class="tile__head">
      <span class="tile__eyebrow">{{ label }}</span>
      <span v-if="trend" class="tile__trend" :class="`tile__trend--${trend}`">{{ trendLabel[trend] }}</span>
      <span v-else-if="dot" class="tile__dot" :class="`tile__dot--${dot}`"></span>
    </div>
    <div class="tile__value">{{ value }}</div>
    <div v-if="sub" class="tile__sub">{{ sub }}</div>
  </component>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  label: string;
  value: string | number;
  sub?: string;
  tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'info';
  trend?: 'up' | 'down' | 'flat' | null;
  dot?: 'green' | 'yellow' | 'red' | 'gray' | null;
  hint?: string;
  clickable?: boolean;
}>(), { tone: 'neutral', clickable: false });
defineEmits<{ (e: 'click'): void }>();

const trendLabel: any = {
  up: '↑', down: '↓', flat: '≈',
};
</script>

<style scoped>
.tile {
  background: var(--atlas-card-bg);
  border: 0;
  border-radius: 12px;
  padding: 14px 16px 16px;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
  display: flex;
  flex-direction: column;
  gap: 8px;
  text-align: left;
  min-width: 0;
  overflow: hidden;
  transition: background-color 120ms ease;
  position: relative;
}
.tile--clickable { cursor: pointer; }
.tile--clickable:hover { background: var(--atlas-card-bg-2, var(--atlas-card-bg)); }

/* Tone signal: thin top accent strip — only when condition fires.
   Apple-minimal: tone is information, not decoration. */
.tile--good::before,
.tile--warn::before,
.tile--bad::before,
.tile--info::before {
  content: '';
  position: absolute;
  left: 16px;
  right: 16px;
  top: 0;
  height: 2px;
  border-radius: 0 0 2px 2px;
}
.tile--good::before { background: var(--atlas-green); }
.tile--warn::before { background: var(--atlas-yellow); }
.tile--bad::before  { background: var(--atlas-red); }
.tile--info::before { background: var(--atlas-blue); opacity: 0.55; }

.tile__head { display: flex; align-items: center; gap: 6px; min-height: 14px; }
.tile__eyebrow {
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--atlas-text-secondary);
}
.tile__trend {
  margin-left: auto;
  font-size: 11px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  color: var(--atlas-text-muted, var(--atlas-text-secondary));
}
.tile__trend--up   { color: var(--atlas-red); }
.tile__trend--down { color: var(--atlas-green); }
.tile__dot { margin-left: auto; width: 6px; height: 6px; border-radius: 50%; background: var(--atlas-text-muted); }
.tile__dot--green  { background: var(--atlas-green); }
.tile__dot--yellow { background: var(--atlas-yellow); }
.tile__dot--red    { background: var(--atlas-red); }

.tile__value {
  font-size: 26px;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--atlas-text-strong);
  font-variant-numeric: tabular-nums;
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 2px;
}
.tile__sub {
  font-size: 11.5px;
  color: var(--atlas-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: 0.005em;
}

@media (max-width: 1023px) {
  .tile { padding: 12px 14px 14px; border-radius: 10px; }
  .tile__value { font-size: 24px; }
}
@media (max-width: 480px) {
  .tile__value { font-size: 22px; }
}
</style>
