<template>
  <div class="dock" :class="{ 'is-open': open }">
    <header class="dock__bar" @click="open = !open">
      <span class="dock__chev">{{ open ? '▼' : '▲' }}</span>
      <span class="dock__title">Broadcast prompt</span>
      <span class="dock__count" v-if="targetCount > 0">→ {{ targetCount }} task{{ targetCount === 1 ? '' : 's' }}</span>
      <span class="dock__hint" v-else>Pin tasks then send a prompt to all of them.</span>
    </header>

    <div v-if="open" class="dock__body">
      <div class="dock__targets">
        <span class="dock__label">Targets</span>
        <div class="dock__chips">
          <label v-for="t in candidates" :key="t.id" class="dock__chip" :class="{ 'is-on': selected.has(t.id) }">
            <input type="checkbox" :checked="selected.has(t.id)" @change="toggle(t.id)" />
            <span class="dock__chip-model" :class="`dock__chip-model--${t.model}`">{{ t.model }}</span>
            <span class="dock__chip-title">{{ t.title }}</span>
          </label>
          <span v-if="candidates.length === 0" class="dock__empty">Pin tasks above to enable broadcast.</span>
        </div>
      </div>

      <div class="dock__prompt-wrap">
        <textarea
          v-model="prompt"
          class="dock__textarea"
          rows="3"
          placeholder="Send the same prompt to every selected pinned task. Creates a fresh task per target with the same model + mode, then spawns it."
        ></textarea>
        <VoiceMic v-model="prompt" class="dock__mic" />
      </div>

      <footer class="dock__foot">
        <label class="dock__mode">
          <span>Title prefix</span>
          <input v-model="titlePrefix" placeholder="broadcast" />
        </label>
        <span v-if="error" class="dock__err">{{ error }}</span>
        <button class="dock__send" :disabled="!canSend || sending" @click="onSend">
          {{ sending ? 'Sending…' : `Send to ${targetCount}` }}
        </button>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { WSTask } from '../../composables/useWorkspace';
import VoiceMic from './VoiceMic.vue';

const props = defineProps<{ candidates: WSTask[] }>();
const emit = defineEmits<{
  (e: 'broadcast', payload: { prompt: string; titlePrefix: string; targetIds: string[] }): void;
}>();

const open = ref(false);
const prompt = ref('');
const titlePrefix = ref('broadcast');
const sending = ref(false);
const error = ref<string | null>(null);
const selected = ref(new Set<string>());

// Default-select all candidates whenever the set changes
watch(() => props.candidates.map(c => c.id).join(','), (ids) => {
  const idSet = new Set(props.candidates.map(c => c.id));
  // drop any no-longer-pinned
  for (const id of [...selected.value]) if (!idSet.has(id)) selected.value.delete(id);
  // add any newly-pinned
  for (const c of props.candidates) selected.value.add(c.id);
}, { immediate: true });

const targetCount = computed(() => selected.value.size);
const canSend = computed(() => prompt.value.trim().length > 0 && targetCount.value > 0);

function toggle(id: string) {
  if (selected.value.has(id)) selected.value.delete(id);
  else selected.value.add(id);
  selected.value = new Set(selected.value);
}

function onSend() {
  if (!canSend.value) return;
  error.value = null;
  sending.value = true;
  emit('broadcast', {
    prompt: prompt.value.trim(),
    titlePrefix: titlePrefix.value.trim() || 'broadcast',
    targetIds: [...selected.value],
  });
  prompt.value = '';
  sending.value = false;
}
</script>

<style scoped>
.dock {
  position: sticky;
  bottom: 0;
  background: var(--atlas-card-bg);
  border: 1px solid var(--atlas-hairline);
  border-radius: 12px;
  margin-top: 12px;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
  z-index: 5;
}
.dock__bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  cursor: pointer;
  user-select: none;
}
.dock__chev {
  font-size: 10px;
  color: var(--atlas-text-secondary);
  width: 14px;
}
.dock__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--atlas-text-strong);
}
.dock__count {
  font-size: 12px;
  color: var(--atlas-blue);
  font-family: ui-monospace, Menlo, monospace;
}
.dock__hint {
  font-size: 12px;
  color: var(--atlas-text-secondary);
  opacity: 0.7;
  margin-left: auto;
}

.dock__body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 0 14px 14px;
  border-top: 1px solid var(--atlas-hairline);
  padding-top: 12px;
}

.dock__targets { display: flex; flex-direction: column; gap: 6px; }
.dock__label {
  font-size: 10.5px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--atlas-text-secondary);
}
.dock__chips { display: flex; flex-wrap: wrap; gap: 6px; }
.dock__chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 9px;
  border-radius: 6px;
  background: transparent;
  border: 1px solid var(--atlas-hairline);
  font-size: 11.5px;
  cursor: pointer;
  color: var(--atlas-text-primary);
  max-width: 260px;
}
.dock__chip.is-on { border-color: var(--atlas-blue); background: rgba(94,158,255,0.08); }
.dock__chip input { cursor: pointer; }
.dock__chip-model {
  font-size: 9.5px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  font-weight: 700;
  color: var(--atlas-text-strong);
}
.dock__chip-model--opus   { color: #b96cff; }
.dock__chip-model--sonnet { color: #5e9eff; }
.dock__chip-model--haiku  { color: #8ad3a7; }
.dock__chip-model--gpt5,
.dock__chip-model--gpt5-mini { color: #10a37f; }
.dock__chip-model--gemma  { color: #ff7d4d; }
.dock__chip-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 200px; }
.dock__empty { font-size: 12px; color: var(--atlas-text-secondary); opacity: 0.7; padding: 4px; }

.dock__prompt-wrap { position: relative; }
.dock__textarea {
  background: var(--atlas-page-bg);
  border: 1px solid var(--atlas-hairline);
  border-radius: 8px;
  padding: 10px 12px;
  font-family: ui-monospace, Menlo, monospace;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--atlas-text-primary);
  outline: none;
  resize: vertical;
  width: 100%;
  box-sizing: border-box;
}
.dock__textarea:focus { border-color: var(--atlas-blue); }
.dock__mic { position: absolute; right: 8px; top: 8px; }

.dock__foot {
  display: flex;
  align-items: center;
  gap: 12px;
}
.dock__mode {
  display: flex; align-items: center; gap: 6px;
  font-size: 11px; color: var(--atlas-text-secondary);
}
.dock__mode input {
  background: var(--atlas-page-bg);
  border: 1px solid var(--atlas-hairline);
  border-radius: 6px;
  padding: 4px 8px;
  font-family: inherit;
  font-size: 12px;
  color: var(--atlas-text-primary);
  width: 120px;
  outline: none;
}
.dock__err { font-size: 12px; color: var(--atlas-red, #ff453a); }
.dock__send {
  margin-left: auto;
  background: var(--atlas-blue);
  color: white;
  border: none;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  padding: 8px 18px;
  border-radius: 8px;
  cursor: pointer;
}
.dock__send:disabled { opacity: 0.4; cursor: not-allowed; }
.dock__send:hover:not(:disabled) { opacity: 0.92; }

@media (max-width: 600px) {
  .dock__bar { padding: 12px; gap: 8px; min-height: 48px; }
  .dock__hint { display: none; }
  .dock__body { padding: 0 12px 12px; padding-top: 10px; }
  .dock__chip { max-width: 100%; padding: 8px 12px; font-size: 13px; }
  .dock__chip-title { max-width: 60vw; }
  .dock__textarea { font-size: 16px; min-height: 80px; }
  .dock__foot { flex-wrap: wrap; gap: 10px; }
  .dock__mode { flex: 1 1 100%; }
  .dock__mode input { flex: 1; width: auto; font-size: 16px; padding: 10px 12px; min-height: 40px; }
  .dock__send { flex: 1 1 100%; margin-left: 0; padding: 12px 18px; font-size: 15px; min-height: 44px; }
}
</style>
