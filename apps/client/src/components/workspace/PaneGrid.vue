<template>
  <section v-if="pinnedTasks.length > 0" class="pane-grid-wrap">
    <header class="pane-grid__head">
      <span class="pane-grid__eyebrow">Pinned · {{ pinnedTasks.length }}/{{ MAX }}</span>
      <button class="pane-grid__clear" @click="$emit('unpin-all')">Unpin all</button>
    </header>
    <div class="pane-grid" :class="`pane-grid--${cols}`">
      <TerminalPane
        v-for="t in pinnedTasks"
        :key="t.id"
        :task="t"
        :live-log="liveLogs[t.id] || ''"
        @kill="(t) => $emit('kill', t)"
        @rerun="(t) => $emit('rerun', t)"
        @expand="(t) => $emit('expand', t)"
        @unpin="(t) => $emit('unpin', t)"
        @follow-up="(t, p) => $emit('follow-up', t, p)"
        @diff="(t) => $emit('diff', t)"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import TerminalPane from './TerminalPane.vue';
import type { WSTask } from '../../composables/useWorkspace';

const MAX = 8;

const props = defineProps<{
  pinnedTasks: WSTask[];
  liveLogs: Record<string, string>;
}>();
defineEmits<{
  (e: 'kill' | 'rerun' | 'expand' | 'unpin' | 'diff', t: WSTask): void;
  (e: 'follow-up', t: WSTask, prompt: string): void;
  (e: 'unpin-all'): void;
}>();

// Auto column count by pane count: 1→1, 2→2, 3-4→2, 5-6→3, 7-8→4
const cols = computed(() => {
  const n = props.pinnedTasks.length;
  if (n <= 1) return 1;
  if (n <= 4) return 2;
  if (n <= 6) return 3;
  return 4;
});
</script>

<style scoped>
.pane-grid-wrap {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 8px;
  /* Stick to the bottom of the workspace main so terminals stay visible
     even when the Kanban backlog gets long. Kanban scrolls behind. */
  position: sticky;
  bottom: 0;
  background: var(--atlas-bg-page);
  z-index: 5;
  /* Hairline separator from the scrolling kanban above. */
  border-top: 1px solid var(--atlas-border-subtle);
  padding-top: 10px;
  /* Cap total pane area at ~40% of viewport so kanban stays usable. */
  max-height: 40vh;
  overflow-y: auto;
}
.pane-grid__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 0 4px;
}
.pane-grid__eyebrow {
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--atlas-text-secondary);
  font-weight: 600;
}
.pane-grid__clear {
  background: transparent;
  border: none;
  color: var(--atlas-text-secondary);
  font-family: inherit;
  font-size: 11.5px;
  cursor: pointer;
}
.pane-grid__clear:hover { color: var(--atlas-text-primary); }

.pane-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(var(--cols, 1), minmax(0, 1fr));
  grid-auto-rows: minmax(220px, 1fr);
}
.pane-grid--1 { --cols: 1; }
.pane-grid--2 { --cols: 2; }
.pane-grid--3 { --cols: 3; }
.pane-grid--4 { --cols: 4; }

@media (max-width: 1279px) {
  .pane-grid--3, .pane-grid--4 { --cols: 2; }
}
@media (max-width: 1023px) {
  .pane-grid--2, .pane-grid--3, .pane-grid--4 { --cols: 1; }
}
</style>
