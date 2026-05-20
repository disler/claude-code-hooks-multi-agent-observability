<template>
  <div class="plan-phases" v-if="plan && plan.hasPlan">
    <!-- Header strip: project name + lock state + archive action -->
    <div class="pp__head">
      <span class="pp__project">{{ plan.project }}</span>
      <span class="pp__chip" :class="plan.locked ? 'pp__chip--good' : 'pp__chip--warn'">
        {{ plan.locked ? 'locked' : 'drafting' }}
      </span>
      <span v-if="plan.target_done" class="pp__chip pp__chip--info">
        target {{ plan.target_done }}
      </span>
      <span v-if="plan.owner_agent" class="pp__chip">{{ plan.owner_agent }}</span>
      <button
        class="pp__action pp__action--danger"
        @click="confirmArchive"
        title="Archive plan (moves plan/ → plan/archive/<ts>/)"
      >Archive Plan</button>
    </div>

    <!-- Three columns: Backlog / Running / Done -->
    <div class="pp__cols">
      <PlanColumn label="Backlog" :phases="byStatus('backlog')" />
      <PlanColumn label="Running" :phases="byStatus('running')" />
      <PlanColumn label="Done"    :phases="byStatus('done')" />
    </div>

    <!-- Timeline strip: last 10 transitions -->
    <div class="pp__timeline" v-if="plan.timeline.length > 0">
      <div class="pp__timeline-label">Timeline</div>
      <pre class="pp__timeline-body">{{ plan.timeline.join('\n') }}</pre>
    </div>
  </div>

  <!-- Empty state: no plan yet, surface Add Plan -->
  <div class="plan-phases plan-phases--empty" v-else-if="project">
    <div class="pp__empty">
      <span class="pp__empty-label">{{ project }}</span>
      <button class="pp__action" @click="onAddPlan">Add Plan</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PhaseStatus, PhaseSummary, PlanSummary } from '../../types';
import PlanColumn from './cards/PlanColumn.vue';

const props = defineProps<{
  project: string;
  plan: PlanSummary | null;
}>();

const emit = defineEmits<{
  (e: 'add-plan', project: string): void;
  (e: 'archive-plan', project: string): void;
}>();

function byStatus(s: PhaseStatus): PhaseSummary[] {
  if (!props.plan) return [];
  return props.plan.phases.filter(p => p.status === s).sort((a, b) => a.number - b.number);
}

function onAddPlan() {
  emit('add-plan', props.project);
}

function confirmArchive() {
  if (!props.plan) return;
  const ok = window.confirm(
    `Archive ${props.plan.project} plan? plan/ will move to plan/archive/<timestamp>/. ` +
    `Recoverable — the directory is not deleted.`
  );
  if (ok) emit('archive-plan', props.plan.project);
}
</script>

<style scoped>
.plan-phases {
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: var(--atlas-card-bg);
  border-radius: 12px;
  padding: 12px 14px;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
  color: var(--atlas-text-primary);
  min-width: 0;
}

.pp__head {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
}
.pp__project {
  font-size: 13px;
  font-weight: 600;
  color: var(--atlas-text-strong);
}
.pp__chip {
  font-size: 10px;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--atlas-card-bg-2, rgba(127,127,127,0.12));
  color: var(--atlas-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-variant-numeric: tabular-nums;
}
.pp__chip--good { background: rgba(48,209,88,0.18); color: var(--atlas-green); }
.pp__chip--warn { background: rgba(255,159,10,0.18); color: var(--atlas-orange, #ff9f0a); }
.pp__chip--info { background: rgba(10,132,255,0.18); color: var(--atlas-blue, #0a84ff); }

.pp__action {
  margin-left: auto;
  font-size: 11px;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--atlas-hairline);
  background: transparent;
  color: var(--atlas-text-secondary);
  cursor: pointer;
}
.pp__action:hover { background: var(--atlas-card-bg-2, rgba(127,127,127,0.10)); }
.pp__action--danger {
  color: var(--atlas-red, #ff3b30);
  border-color: rgba(255,59,48,0.4);
}

.pp__cols {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
@media (max-width: 720px) {
  .pp__cols { grid-template-columns: 1fr; }
}

.pp__timeline {
  border-top: 1px solid var(--atlas-hairline);
  padding-top: 8px;
}
.pp__timeline-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--atlas-text-secondary);
  margin-bottom: 4px;
}
.pp__timeline-body {
  font-family: ui-monospace, Menlo, monospace;
  font-size: 11px;
  color: var(--atlas-text-secondary);
  white-space: pre;
  overflow-x: auto;
  margin: 0;
}

.plan-phases--empty {
  padding: 10px 12px;
}
.pp__empty {
  display: flex;
  align-items: center;
  gap: 8px;
}
.pp__empty-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--atlas-text-strong);
}
</style>
