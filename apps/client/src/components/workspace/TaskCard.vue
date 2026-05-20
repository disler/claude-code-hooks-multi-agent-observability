<template>
  <article
    class="ws-card"
    :class="[`ws-card--${task.status}`, { 'is-pinned': pinned, 'is-dragging': dragging }]"
    draggable="true"
    @click="$emit('open', task)"
    @dragstart="onDragStart"
    @dragend="onDragEnd"
  >
    <header class="ws-card__head">
      <span class="ws-card__model" :class="`ws-card__model--${task.model}`">{{ task.model }}</span>
      <span v-if="task.mode === 'auto'" class="ws-card__mode" title="Bypass permissions">auto</span>
      <span v-if="task.pid" class="ws-card__pid">PID {{ task.pid }}</span>
      <span v-if="pinned" class="ws-card__pin-flag" title="Pinned to pane grid">📌</span>
    </header>
    <h4 class="ws-card__title">{{ task.title }}</h4>
    <p class="ws-card__prompt">{{ task.prompt }}</p>
    <footer class="ws-card__actions" @click.stop>
      <button v-if="task.status === 'backlog'" class="ws-card__btn ws-card__btn--primary" @click="$emit('spawn', task)">▶ Run</button>
      <button v-if="task.status === 'queued'" class="ws-card__btn ws-card__btn--ghost" disabled>⏳ Queued</button>
      <button v-if="task.status === 'running'" class="ws-card__btn ws-card__btn--danger" @click="$emit('kill', task)">■ Kill</button>
      <button v-if="task.status === 'review'" class="ws-card__btn ws-card__btn--primary" @click="$emit('done', task)">✓ Done</button>
      <button class="ws-card__btn ws-card__btn--ghost" @click="$emit('toggle-pin', task)" :title="pinned ? 'Unpin' : 'Pin to pane grid'">
        {{ pinned ? '📌 Unpin' : '📌 Pin' }}
      </button>
      <button v-if="['backlog','review','done','failed'].includes(task.status)" class="ws-card__btn ws-card__btn--ghost" @click="$emit('delete', task)">Delete</button>
      <span v-if="task.cost_usd != null && task.cost_usd > 0" class="ws-card__cost">${{ task.cost_usd.toFixed(3) }}</span>
      <span v-if="task.status === 'failed'" class="ws-card__exit">exit {{ task.exit_code }}</span>
    </footer>
  </article>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { WSTask } from '../../composables/useWorkspace';

const props = defineProps<{ task: WSTask; pinned?: boolean }>();
const emit = defineEmits<{
  (e: 'open', t: WSTask): void;
  (e: 'spawn', t: WSTask): void;
  (e: 'kill', t: WSTask): void;
  (e: 'done', t: WSTask): void;
  (e: 'delete', t: WSTask): void;
  (e: 'toggle-pin', t: WSTask): void;
}>();

const dragging = ref(false);
function onDragStart(ev: DragEvent) {
  dragging.value = true;
  if (ev.dataTransfer) {
    ev.dataTransfer.effectAllowed = 'move';
    ev.dataTransfer.setData('application/x-workspace-task', props.task.id);
    ev.dataTransfer.setData('text/plain', props.task.id);
  }
}
function onDragEnd() { dragging.value = false; }
</script>

<style scoped>
.ws-card {
  background: var(--atlas-card-bg);
  border-radius: 10px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  cursor: grab;
  border-left: 3px solid transparent;
  transition: background-color 100ms ease, opacity 100ms ease, transform 100ms ease;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
}
.ws-card:hover { background: var(--atlas-card-bg-2, rgba(127,127,127,0.06)); }
.ws-card:active { cursor: grabbing; }
.ws-card.is-dragging { opacity: 0.4; transform: scale(0.98); }
.ws-card.is-pinned { background: linear-gradient(180deg, rgba(94,158,255,0.06), var(--atlas-card-bg)); }

.ws-card__pin-flag { margin-left: auto; font-size: 11px; opacity: 0.7; }

.ws-card--queued  { border-left-color: var(--atlas-text-secondary); opacity: 0.7; }
.ws-card--running { border-left-color: var(--atlas-blue); }
.ws-card--review  { border-left-color: var(--atlas-orange, #ff9f0a); }
.ws-card--done    { opacity: 0.6; }
.ws-card--failed  { border-left-color: var(--atlas-red, #ff453a); opacity: 0.85; }

.ws-card__head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--atlas-text-secondary);
}
.ws-card__model {
  font-weight: 600;
  color: var(--atlas-text-strong);
}
.ws-card__model--opus   { color: #b96cff; }
.ws-card__model--sonnet { color: #5e9eff; }
.ws-card__model--haiku  { color: #8ad3a7; }
.ws-card__model--gpt5,
.ws-card__model--gpt5-mini { color: #10a37f; }
.ws-card__model--gemma  { color: #ff7d4d; }

.ws-card__mode {
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(255,159,10,0.15);
  color: var(--atlas-orange, #ff9f0a);
  font-weight: 600;
}
.ws-card__pid { font-family: ui-monospace, Menlo, monospace; opacity: 0.7; }

.ws-card__title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--atlas-text-strong);
  line-height: 1.3;
}
.ws-card__prompt {
  margin: 0;
  font-size: 12px;
  color: var(--atlas-text-secondary);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.ws-card__actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
  margin-top: 2px;
}
.ws-card__btn {
  font-family: inherit;
  font-size: 11.5px;
  font-weight: 500;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--atlas-hairline);
  background: transparent;
  color: var(--atlas-text-primary);
  cursor: pointer;
  transition: background-color 100ms ease;
}
.ws-card__btn:hover { background: var(--atlas-card-bg-2, rgba(127,127,127,0.08)); }
.ws-card__btn--primary { color: var(--atlas-blue); border-color: var(--atlas-blue); }
.ws-card__btn--primary:hover { background: var(--atlas-blue-soft, rgba(94,158,255,0.12)); }
.ws-card__btn--danger { color: var(--atlas-red, #ff453a); border-color: var(--atlas-red, #ff453a); }
.ws-card__btn--ghost { color: var(--atlas-text-secondary); }

.ws-card__cost {
  font-family: ui-monospace, Menlo, monospace;
  font-size: 10.5px;
  color: var(--atlas-text-secondary);
  margin-left: auto;
  opacity: 0.75;
}
.ws-card__exit {
  font-family: ui-monospace, Menlo, monospace;
  font-size: 10.5px;
  color: var(--atlas-red, #ff453a);
  margin-left: 4px;
}

@media (max-width: 600px) {
  .ws-card { padding: 14px; gap: 10px; }
  .ws-card__title { font-size: 15px; }
  .ws-card__prompt { font-size: 13px; -webkit-line-clamp: 3; }
  .ws-card__btn { font-size: 13px; padding: 8px 14px; min-height: 36px; }
}
</style>
