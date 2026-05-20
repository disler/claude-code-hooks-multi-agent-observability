<template>
  <div class="kanban">
    <section
      v-for="col in COLUMNS"
      :key="col.key"
      class="kanban__col"
      :class="{ 'is-drop-target': dragOver === col.key }"
      @dragover.prevent="onDragOver(col.key, $event)"
      @dragleave="onDragLeave(col.key)"
      @drop.prevent="onDrop(col.key, $event)"
    >
      <header class="kanban__col-head">
        <span class="kanban__col-name">{{ col.name }}</span>
        <span class="kanban__col-count">{{ countFor(col.key) }}</span>
      </header>
      <div class="kanban__col-body">
        <TaskCard
          v-for="t in tasksFor(col.key)"
          :key="t.id"
          :task="t"
          :pinned="pinnedIds.includes(t.id)"
          @open="(t) => $emit('open', t)"
          @spawn="(t) => $emit('spawn', t)"
          @kill="(t) => $emit('kill', t)"
          @done="(t) => $emit('done', t)"
          @delete="(t) => $emit('delete', t)"
          @toggle-pin="(t) => $emit('toggle-pin', t)"
        />
        <div v-if="tasksFor(col.key).length === 0" class="kanban__empty">
          <span v-if="col.key === 'backlog'">No tasks. Drop or add one.</span>
          <span v-else>Drop here</span>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import TaskCard from './TaskCard.vue';
import type { WSTask } from '../../composables/useWorkspace';

const props = defineProps<{ tasks: WSTask[]; pinnedIds: string[] }>();
const emit = defineEmits<{
  (e: 'open' | 'spawn' | 'kill' | 'done' | 'delete' | 'toggle-pin', t: WSTask): void;
  (e: 'drop-task', payload: { taskId: string; toColumn: string }): void;
}>();

const COLUMNS = [
  { key: 'backlog', name: 'Backlog' },
  { key: 'running', name: 'Running' },
  { key: 'review',  name: 'Review' },
  { key: 'done',    name: 'Done' },
] as const;

const dragOver = ref<string | null>(null);

function tasksFor(status: string): WSTask[] {
  if (status === 'review') return props.tasks.filter(t => t.status === 'review' || t.status === 'failed');
  if (status === 'running') return props.tasks.filter(t => t.status === 'running' || t.status === 'queued');
  return props.tasks.filter(t => t.status === status);
}
function countFor(status: string): number {
  return tasksFor(status).length;
}

function onDragOver(col: string, ev: DragEvent) {
  if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
  dragOver.value = col;
}
function onDragLeave(col: string) {
  if (dragOver.value === col) dragOver.value = null;
}
function onDrop(col: string, ev: DragEvent) {
  dragOver.value = null;
  const taskId = ev.dataTransfer?.getData('application/x-workspace-task');
  if (!taskId) return;
  emit('drop-task', { taskId, toColumn: col });
}
</script>

<style scoped>
.kanban {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  min-height: 400px;
}
@media (max-width: 1023px) {
  .kanban { grid-template-columns: 1fr; gap: 12px; }
}

.kanban__col {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}
.kanban__col-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 0 4px;
}
.kanban__col-name {
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--atlas-text-secondary);
}
.kanban__col-count {
  font-size: 11.5px;
  font-family: ui-monospace, Menlo, monospace;
  color: var(--atlas-text-secondary);
  opacity: 0.7;
}
.kanban__col-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: rgba(127,127,127,0.04);
  border-radius: 12px;
  padding: 10px;
  min-height: 320px;
  transition: background-color 100ms ease, outline-color 100ms ease;
  outline: 2px dashed transparent;
  outline-offset: -2px;
}
.kanban__col.is-drop-target .kanban__col-body {
  background: rgba(94,158,255,0.08);
  outline-color: var(--atlas-blue);
}
.kanban__empty {
  font-size: 12px;
  color: var(--atlas-text-secondary);
  text-align: center;
  padding: 20px 8px;
  opacity: 0.55;
}
</style>
