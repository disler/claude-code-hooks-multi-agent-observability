<template>
  <div class="pc">
    <div class="pc__head">
      <span class="pc__label">{{ label }}</span>
      <span class="pc__count">{{ phases.length }}</span>
    </div>
    <div class="pc__list" v-if="phases.length > 0">
      <div v-for="p in phases" :key="p.file" class="pc__card" :title="p.outcome || ''">
        <div class="pc__card-head">
          <span class="pc__num">{{ padded(p.number) }}</span>
          <span class="pc__slug">{{ p.slug }}</span>
        </div>
        <div class="pc__chips">
          <span v-if="p.target_days != null" class="pc__chip">
            {{ p.target_days }}d
          </span>
          <span v-if="p.started" class="pc__chip pc__chip--ts">
            start {{ p.started }}
          </span>
          <span v-if="p.finished" class="pc__chip pc__chip--ts">
            done {{ p.finished }}
          </span>
        </div>
        <div v-if="p.outcome" class="pc__outcome">{{ p.outcome }}</div>
      </div>
    </div>
    <div v-else class="pc__empty">—</div>
  </div>
</template>

<script setup lang="ts">
import type { PhaseSummary } from '../../../types';

defineProps<{
  label: string;
  phases: PhaseSummary[];
}>();

function padded(n: number): string {
  return String(n).padStart(2, '0');
}
</script>

<style scoped>
.pc {
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: var(--atlas-card-bg-2, rgba(127,127,127,0.06));
  border-radius: 8px;
  padding: 8px 10px;
  min-width: 0;
}
.pc__head {
  display: flex; align-items: center; gap: 6px;
}
.pc__label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--atlas-text-secondary);
  font-weight: 600;
}
.pc__count {
  margin-left: auto;
  font-size: 11px;
  color: var(--atlas-text-secondary);
  font-variant-numeric: tabular-nums;
}

.pc__list { display: flex; flex-direction: column; gap: 6px; }

.pc__card {
  background: var(--atlas-card-bg);
  border-radius: 6px;
  padding: 6px 8px;
  display: flex; flex-direction: column; gap: 4px;
  min-width: 0;
}
.pc__card-head { display: flex; align-items: baseline; gap: 6px; }
.pc__num {
  font-size: 10px;
  color: var(--atlas-text-secondary);
  font-variant-numeric: tabular-nums;
  font-family: ui-monospace, Menlo, monospace;
}
.pc__slug {
  font-size: 12px;
  font-weight: 500;
  color: var(--atlas-text-strong);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pc__chips { display: flex; flex-wrap: wrap; gap: 4px; }
.pc__chip {
  font-size: 9.5px;
  padding: 1px 6px;
  border-radius: 999px;
  background: rgba(127,127,127,0.14);
  color: var(--atlas-text-secondary);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.pc__chip--ts { background: rgba(10,132,255,0.15); color: var(--atlas-blue, #0a84ff); }
.pc__outcome {
  font-size: 11px;
  color: var(--atlas-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pc__empty {
  font-size: 11px;
  color: var(--atlas-text-secondary);
  opacity: 0.5;
  padding: 2px 0;
}
</style>
