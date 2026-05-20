<template>
  <button
    v-if="supported"
    type="button"
    class="mic"
    :class="{ 'is-on': listening }"
    @click="toggle"
    :title="listening ? 'Stop dictation' : 'Voice input'"
  >
    <span class="mic__dot"></span>
    {{ listening ? 'Listening…' : '🎙' }}
  </button>
</template>

<script setup lang="ts">
import { useVoiceDictation } from '../../composables/useVoiceDictation';

const props = defineProps<{ modelValue: string }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>();

const { supported, listening, start, stop } = useVoiceDictation({
  onFinal: (text) => {
    const cur = props.modelValue || '';
    const sep = cur && !cur.endsWith(' ') && !cur.endsWith('\n') ? ' ' : '';
    emit('update:modelValue', cur + sep + text.trim());
  },
});

function toggle() { listening.value ? stop() : start(); }
</script>

<style scoped>
.mic {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: 1px solid var(--atlas-hairline);
  color: var(--atlas-text-secondary);
  font-family: inherit;
  font-size: 11.5px;
  padding: 4px 9px;
  border-radius: 6px;
  cursor: pointer;
  transition: color 100ms ease, border-color 100ms ease, background-color 100ms ease;
}
.mic:hover { color: var(--atlas-text-primary); border-color: var(--atlas-text-secondary); }
.mic.is-on {
  color: var(--atlas-red, #ff453a);
  border-color: var(--atlas-red, #ff453a);
  background: rgba(255,69,58,0.08);
}
.mic__dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: currentColor;
  opacity: 0.5;
}
.mic.is-on .mic__dot {
  opacity: 1;
  animation: mic-pulse 1.2s ease-in-out infinite;
}
@keyframes mic-pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.6); opacity: 0.6; } }
</style>
