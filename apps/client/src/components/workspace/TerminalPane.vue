<template>
  <article class="pane" :class="[`pane--${task.status}`, { 'pane--fullscreen': fullscreen }]">
    <header class="pane__head">
      <div class="pane__title-block">
        <span class="pane__model" :class="`pane__model--${task.model}`">{{ task.model }}</span>
        <span v-if="task.parent_task_id" class="pane__chain" title="Follow-up of a prior task">↳</span>
        <span class="pane__title" :title="task.title">{{ task.title }}</span>
        <span class="pane__status">
          {{ task.status }}<span v-if="task.exit_code != null"> · exit {{ task.exit_code }}</span><span v-if="task.cost_usd != null"> · ${{ task.cost_usd.toFixed(3) }}</span>
        </span>
      </div>
      <div class="pane__actions">
        <button v-if="canDiff" class="pane__btn pane__btn--diff" @click="$emit('diff', task)" title="View diff / merge / discard">🔍 Diff</button>
        <button v-if="task.status === 'running'" class="pane__btn pane__btn--danger" @click="$emit('kill', task)" title="Kill">■</button>
        <button v-if="task.status === 'backlog' || task.status === 'failed' || task.status === 'review' || task.status === 'done'"
                class="pane__btn" @click="$emit('rerun', task)" title="Re-run from scratch">↻</button>
        <button class="pane__btn" @click="toggleFullscreen" :title="fullscreen ? 'Collapse' : 'Fullscreen'">{{ fullscreen ? '⤡' : '⤢' }}</button>
        <button v-if="!fullscreen" class="pane__btn" @click="$emit('expand', task)" title="Open in drawer">⊞</button>
        <button class="pane__btn" @click="$emit('unpin', task)" title="Unpin">✕</button>
      </div>
    </header>
    <div class="pane__body" ref="termHost"></div>
    <footer
      v-if="canFollowUp"
      class="pane__chat"
      @keydown.enter.exact.prevent="onSubmit"
    >
      <button
        v-if="isPlan"
        type="button"
        class="pane__chat-approve"
        @click="onApprovePlan"
        :disabled="sending"
        title="Resume session and execute the plan above"
      >✓ Approve &amp; Execute</button>
      <textarea
        v-model="followUpText"
        :disabled="sending"
        class="pane__chat-input"
        rows="1"
        :placeholder="sending ? 'Sending…' : (isPlan ? 'Or refine the plan…' : 'Follow up — Enter to send, Shift+Enter for newline')"
        @keydown.enter.shift.stop
      ></textarea>
      <button
        type="button"
        class="pane__chat-send"
        :disabled="!followUpText.trim() || sending"
        @click="onSubmit"
      >Send ↩</button>
    </footer>
    <footer
      v-else-if="task.status !== 'running' && task.status !== 'backlog' && !task.session_id"
      class="pane__chat pane__chat--disabled"
    >
      <span>Session not captured (Codex/Gemma tasks can't be resumed).</span>
    </footer>
  </article>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch, computed, nextTick } from 'vue';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import type { WSTask } from '../../composables/useWorkspace';
import { API_BASE_URL } from '../../config';

const props = defineProps<{ task: WSTask; liveLog: string }>();
const emit = defineEmits<{
  (e: 'kill' | 'rerun' | 'expand' | 'unpin' | 'diff', t: WSTask): void;
  (e: 'follow-up', t: WSTask, prompt: string): void;
}>();

const canDiff = computed(() => !!props.task.worktree_path && !!props.task.branch);

const followUpText = ref('');
const sending = ref(false);
const fullscreen = ref(false);

function toggleFullscreen() {
  fullscreen.value = !fullscreen.value;
  // Allow next tick for layout, then refit
  nextTick(() => { try { fit?.fit(); } catch {} });
}

function onEscape(ev: KeyboardEvent) {
  if (ev.key === 'Escape' && fullscreen.value) {
    fullscreen.value = false;
    nextTick(() => { try { fit?.fit(); } catch {} });
  }
}

const canFollowUp = computed(() =>
  !!props.task.session_id &&
  (props.task.status === 'review' || props.task.status === 'done' || props.task.status === 'failed')
);
const isPlan = computed(() => props.task.title.startsWith('[Plan]'));

async function onSubmit() {
  const txt = followUpText.value.trim();
  if (!txt || sending.value) return;
  sending.value = true;
  try {
    emit('follow-up', props.task, txt);
    followUpText.value = '';
  } finally {
    setTimeout(() => { sending.value = false; }, 1500);
  }
}

async function onApprovePlan() {
  if (sending.value) return;
  sending.value = true;
  try {
    emit('follow-up', props.task, 'Approved. Execute the plan you just outlined. Apply all the edits described. Do not re-output the plan.');
  } finally {
    setTimeout(() => { sending.value = false; }, 1500);
  }
}

const termHost = ref<HTMLElement | null>(null);
let term: Terminal | null = null;
let fit: FitAddon | null = null;
let lastLiveLength = 0;
let resizeObs: ResizeObserver | null = null;

const THEME = {
  background: '#0c0c0c',
  foreground: '#dadada',
  cursor: '#dadada',
  selectionBackground: '#264f78',
  black: '#0c0c0c',
  red: '#ff453a',
  green: '#30d158',
  yellow: '#ffd60a',
  blue: '#5e9eff',
  magenta: '#b96cff',
  cyan: '#64d2ff',
  white: '#dadada',
  brightBlack: '#7d7d7d',
  brightRed: '#ff6961',
  brightGreen: '#5ce665',
  brightYellow: '#ffe066',
  brightBlue: '#7aaaff',
  brightMagenta: '#cf8aff',
  brightCyan: '#85e0ff',
  brightWhite: '#ffffff',
};

onMounted(async () => {
  window.addEventListener('keydown', onEscape);
  if (!termHost.value) return;
  term = new Terminal({
    fontFamily: 'ui-monospace, Menlo, monospace',
    fontSize: 11.5,
    lineHeight: 1.25,
    convertEol: true,
    cursorBlink: false,
    cursorStyle: 'bar',
    scrollback: 5000,
    theme: THEME,
    allowProposedApi: true,
  });
  fit = new FitAddon();
  term.loadAddon(fit);
  term.open(termHost.value);
  await nextTick();
  try { fit.fit(); } catch { /* ignore */ }

  // Resize fit on container size change
  if (typeof ResizeObserver !== 'undefined') {
    resizeObs = new ResizeObserver(() => { try { fit?.fit(); } catch {} });
    resizeObs.observe(termHost.value);
  }

  // Initial log fetch
  try {
    const r = await fetch(`${API_BASE_URL}/api/atlas/workspace/tasks/${props.task.id}/log`).then(r => r.json());
    if (r.log) term.write(r.log.replace(/\n/g, '\r\n'));
  } catch { /* non-fatal */ }

  // Replay any liveLog buffered before mount
  if (props.liveLog) {
    term.write(props.liveLog.replace(/\n/g, '\r\n'));
    lastLiveLength = props.liveLog.length;
  }
});

watch(() => props.liveLog, (val) => {
  if (!term || !val) return;
  if (val.length < lastLiveLength) {
    // Buffer was trimmed (200kb rolling tail wrapped). Clear + rewrite.
    term.clear();
    term.write(val.replace(/\n/g, '\r\n'));
  } else {
    const delta = val.slice(lastLiveLength);
    if (delta) term.write(delta.replace(/\n/g, '\r\n'));
  }
  lastLiveLength = val.length;
});

watch(() => props.task.id, () => {
  // task swapped — reset
  if (term) { term.clear(); }
  lastLiveLength = 0;
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onEscape);
  resizeObs?.disconnect();
  term?.dispose();
});
</script>

<style scoped>
.pane {
  display: flex;
  flex-direction: column;
  background: #0c0c0c;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid transparent;
  min-height: 0;
  transition: border-color 100ms ease;
}
.pane--fullscreen {
  position: fixed;
  inset: 0;
  z-index: 500;
  border-radius: 0;
}
.pane--fullscreen .pane__body { font-size: 14px; }
.pane--running { border-color: var(--atlas-blue); }
.pane--review  { border-color: var(--atlas-orange, #ff9f0a); }
.pane--failed  { border-color: var(--atlas-red, #ff453a); }
.pane--done    { opacity: 0.7; }

.pane__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px;
  background: rgba(255,255,255,0.04);
  border-bottom: 1px solid rgba(255,255,255,0.06);
  min-height: 32px;
}
.pane__title-block {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}
.pane__model {
  font-family: -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 1px 5px;
  border-radius: 3px;
  background: rgba(255,255,255,0.08);
  color: #dadada;
  flex: none;
}
.pane__model--opus   { background: rgba(185,108,255,0.18); color: #cf8aff; }
.pane__model--sonnet { background: rgba(94,158,255,0.18); color: #7aaaff; }
.pane__model--haiku  { background: rgba(138,211,167,0.18); color: #8ad3a7; }
.pane__model--gpt5,
.pane__model--gpt5-mini { background: rgba(16,163,127,0.18); color: #10a37f; }
.pane__model--gemma  { background: rgba(255,125,77,0.18); color: #ff7d4d; }

.pane__title {
  font-family: -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: 12px;
  font-weight: 500;
  color: #ededed;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}
.pane__status {
  font-family: ui-monospace, Menlo, monospace;
  font-size: 10px;
  color: #888;
  flex: none;
}

.pane__actions {
  display: flex;
  gap: 4px;
  flex: none;
}
.pane__btn {
  background: rgba(255,255,255,0.06);
  border: none;
  color: #dadada;
  font-family: inherit;
  font-size: 11px;
  width: 22px;
  height: 22px;
  border-radius: 4px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.pane__btn:hover { background: rgba(255,255,255,0.12); }
.pane__btn--danger { color: #ff6961; }
.pane__btn--diff { color: #5e9eff; width: auto; padding: 0 8px; font-size: 10.5px; font-weight: 600; }

.pane__body {
  flex: 1;
  min-height: 180px;
  padding: 6px 4px 6px 10px;
}
.pane__body :deep(.xterm) { height: 100%; }
.pane__body :deep(.xterm-viewport) { background-color: transparent !important; }

.pane__chain {
  font-family: -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: 12px;
  color: #5e9eff;
  flex: none;
  opacity: 0.9;
}

.pane__chat {
  display: flex;
  align-items: stretch;
  gap: 6px;
  padding: 6px 8px;
  background: rgba(255,255,255,0.04);
  border-top: 1px solid rgba(255,255,255,0.06);
}
.pane__chat--disabled {
  font-family: -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: 11px;
  color: #888;
  padding: 8px 10px;
  font-style: italic;
}
.pane__chat-input {
  flex: 1;
  resize: none;
  background: rgba(0,0,0,0.3);
  border: 1px solid rgba(255,255,255,0.10);
  color: #ededed;
  font-family: ui-monospace, Menlo, monospace;
  font-size: 12px;
  line-height: 1.4;
  padding: 6px 8px;
  border-radius: 5px;
  outline: none;
  max-height: 80px;
}
.pane__chat-input:focus { border-color: #5e9eff; }
.pane__chat-input:disabled { opacity: 0.5; }

.pane__chat-send {
  background: rgba(94,158,255,0.18);
  color: #7aaaff;
  border: 1px solid rgba(94,158,255,0.35);
  font-family: -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: 11px;
  font-weight: 600;
  padding: 0 12px;
  border-radius: 5px;
  cursor: pointer;
}
.pane__chat-approve {
  background: rgba(48,209,88,0.18);
  color: #5ce665;
  border: 1px solid rgba(48,209,88,0.40);
  font-family: -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: 11px;
  font-weight: 600;
  padding: 0 10px;
  border-radius: 5px;
  cursor: pointer;
  white-space: nowrap;
}
.pane__chat-approve:hover:not(:disabled) { background: rgba(48,209,88,0.28); }
.pane__chat-approve:disabled { opacity: 0.4; cursor: not-allowed; }
.pane__chat-send:disabled { opacity: 0.4; cursor: not-allowed; }
.pane__chat-send:hover:not(:disabled) {
  background: rgba(94,158,255,0.3);
}
</style>
