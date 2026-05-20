<template>
  <div class="drawer-bg" @click.self="$emit('close')">
    <aside class="drawer">
      <header class="drawer__head">
        <div>
          <span class="drawer__eyebrow">{{ task.project_name }} · {{ task.model }} · {{ task.status }}</span>
          <h3 class="drawer__title">{{ task.title }}</h3>
        </div>
        <button class="drawer__x" @click="$emit('close')">✕</button>
      </header>

      <section class="drawer__section">
        <span class="drawer__label">Prompt</span>
        <pre class="drawer__prompt">{{ task.prompt }}</pre>
      </section>

      <section class="drawer__section drawer__section--log">
        <header class="drawer__log-head">
          <span class="drawer__label">Log <span v-if="task.status === 'running'" class="drawer__live">● live</span></span>
          <span class="drawer__bytes">{{ logText.length }} bytes</span>
        </header>
        <pre class="drawer__log" ref="logEl">{{ logText || '(no output yet)' }}</pre>
      </section>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import type { WSTask } from '../../composables/useWorkspace';

const props = defineProps<{ task: WSTask; liveLog: string }>();
defineEmits<{ (e: 'close'): void }>();

const initialLog = ref('');
const logEl = ref<HTMLElement | null>(null);

onMounted(async () => {
  try {
    const r = await fetch(`/api/atlas/workspace/tasks/${props.task.id}/log`).then(r => r.json());
    initialLog.value = r.log || '';
  } catch (e) { /* non-fatal */ }
});

// Live log is appended chunks delivered via WS. Initial fetch primes the
// pump; subsequent text comes from liveLog (already trimmed to 200kb).
const logText = computed(() => {
  // If we got live chunks, prefer them (live stream is authoritative once
  // started). Otherwise show initial-fetched log.
  if (props.liveLog) return initialLog.value + props.liveLog;
  return initialLog.value;
});

watch(logText, () => {
  nextTick(() => {
    if (logEl.value) logEl.value.scrollTop = logEl.value.scrollHeight;
  });
});
</script>

<style scoped>
.drawer-bg {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.45);
  display: flex; justify-content: flex-end;
  z-index: 150;
}
.drawer {
  background: var(--atlas-page-bg);
  width: 100%; max-width: 720px;
  height: 100vh;
  display: flex; flex-direction: column;
  padding: 24px 28px 16px;
  gap: 16px;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
  box-shadow: -20px 0 60px rgba(0,0,0,0.4);
}
.drawer__head {
  display: flex; justify-content: space-between; align-items: flex-start;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--atlas-hairline);
}
.drawer__eyebrow {
  font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--atlas-text-secondary);
}
.drawer__title {
  margin: 4px 0 0;
  font-size: 20px; font-weight: 600; line-height: 1.3;
  color: var(--atlas-text-strong);
}
.drawer__x {
  background: transparent; border: none;
  font-size: 18px; color: var(--atlas-text-secondary);
  cursor: pointer; padding: 4px 8px;
}

.drawer__section {
  display: flex; flex-direction: column; gap: 6px;
}
.drawer__section--log {
  flex: 1;
  min-height: 0;
}
.drawer__label {
  font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--atlas-text-secondary);
  font-weight: 500;
}
.drawer__prompt {
  margin: 0;
  font-family: ui-monospace, Menlo, monospace;
  font-size: 12.5px;
  line-height: 1.5;
  padding: 12px;
  background: var(--atlas-card-bg);
  border-radius: 8px;
  color: var(--atlas-text-primary);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
  overflow-y: auto;
}

.drawer__log-head {
  display: flex; justify-content: space-between; align-items: center;
}
.drawer__bytes {
  font-family: ui-monospace, Menlo, monospace;
  font-size: 11px;
  color: var(--atlas-text-secondary);
  opacity: 0.7;
}
.drawer__live {
  color: var(--atlas-red, #ff453a);
  font-size: 10.5px;
  margin-left: 6px;
  animation: pulse 1.5s ease-in-out infinite;
}
@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }

.drawer__log {
  margin: 0;
  flex: 1;
  font-family: ui-monospace, Menlo, monospace;
  font-size: 12px;
  line-height: 1.4;
  padding: 12px;
  background: #0c0c0c;
  color: #d8d8d8;
  border-radius: 8px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

@media (max-width: 600px) {
  .drawer-bg { background: var(--atlas-page-bg); }
  .drawer {
    max-width: none;
    height: 100vh;
    padding: max(14px, env(safe-area-inset-top)) 16px calc(12px + env(safe-area-inset-bottom));
    box-shadow: none;
    gap: 12px;
  }
  .drawer__head { padding-bottom: 10px; }
  .drawer__title { font-size: 18px; }
  .drawer__x { font-size: 22px; padding: 8px 12px; min-width: 44px; min-height: 44px; }
  .drawer__prompt { font-size: 13px; max-height: 30vh; }
  .drawer__log { font-size: 12.5px; }
}
</style>
