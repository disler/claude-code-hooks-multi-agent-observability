<template>
  <div class="talk-dock" :class="{ 'is-expanded': expanded }">
    <button class="talk-dock__handle" @click="toggle" :aria-expanded="expanded" :title="expanded ? 'Collapse' : 'Expand'">
      <span class="talk-dock__caret">{{ expanded ? '▾' : '▴' }}</span>
      <span class="talk-dock__label">Atlas</span>
      <span v-if="lastReply" class="talk-dock__hint">{{ lastReply }}</span>
    </button>

    <div v-if="expanded" ref="scrollEl" class="talk-dock__thread">
      <div v-if="!messages.length" class="talk-empty">
        <span class="talk-empty__lead">What can Atlas help with?</span>
        <div class="talk-empty__suggestions">
          <button
            v-for="s in suggestions"
            :key="s"
            class="atb-pill"
            @click="sendMessage(s)"
            :disabled="sending"
          >{{ s }}</button>
        </div>
      </div>

      <div
        v-for="(msg, i) in messages"
        :key="i"
        class="talk-msg"
        :class="`is-${msg.role}`"
      >
        <div class="talk-bubble">{{ msg.text }}</div>
        <div v-if="msg.role === 'atlas' && msg.decision" class="talk-meta">
          @{{ msg.decision.agent }} · {{ msg.decision.project }} · {{ msg.decision.model }}
        </div>
        <div v-else-if="msg.role === 'error'" class="talk-meta is-error">{{ msg.detail || 'error' }}</div>
      </div>

      <div v-if="sending" class="talk-msg is-atlas">
        <div class="talk-bubble talk-bubble--pending">
          <span class="talk-dot"></span><span class="talk-dot"></span><span class="talk-dot"></span>
        </div>
      </div>
    </div>

    <form class="talk-dock__composer" @submit.prevent="onSubmit">
      <textarea
        ref="inputEl"
        v-model="draft"
        class="talk-dock__input"
        :placeholder="expanded ? 'Talk to Atlas…' : 'Talk to Atlas… (click to expand)'"
        rows="1"
        @keydown="onKeyDown"
        @focus="expanded = true"
        :disabled="sending"
      ></textarea>
      <button
        type="submit"
        class="btn btn--primary"
        :disabled="!draft.trim() || sending"
      >{{ sending ? '…' : 'Send' }}</button>
    </form>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue';
import { API_BASE_URL } from '../config';

interface Msg {
  role: 'user' | 'atlas' | 'error';
  text: string;
  decision?: { agent: string; project: string; model: string; rationale?: string };
  detail?: string;
  ts: number;
}

const STORAGE_KEY = 'atlas.talkThread';
const EXPAND_KEY = 'atlas.talkExpanded';
const MAX_MESSAGES = 100;

const suggestions = [
  'status check',
  'what did you find this morning',
  'draft a cold email',
];

const messages = ref<Msg[]>(loadThread());
const draft = ref('');
const sending = ref(false);
const expanded = ref<boolean>(loadExpanded());
const scrollEl = ref<HTMLDivElement | null>(null);
const inputEl = ref<HTMLTextAreaElement | null>(null);

const lastReply = ref<string>(deriveHint());

function deriveHint(): string {
  const last = [...messages.value].reverse().find(m => m.role === 'atlas');
  if (!last) return '';
  return last.text.slice(0, 80).replace(/\n+/g, ' ') + (last.text.length > 80 ? '…' : '');
}

function loadThread(): Msg[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw).slice(-MAX_MESSAGES);
  } catch {/* ignore */}
  return [];
}
function loadExpanded(): boolean {
  try { return localStorage.getItem(EXPAND_KEY) === '1'; } catch { return false; }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.value.slice(-MAX_MESSAGES)));
  } catch {/* ignore */}
}

watch(expanded, (v) => {
  try { localStorage.setItem(EXPAND_KEY, v ? '1' : '0'); } catch {/* ignore */}
  if (v) scrollToBottom();
});

function toggle() { expanded.value = !expanded.value; }

async function scrollToBottom() {
  await nextTick();
  if (scrollEl.value) scrollEl.value.scrollTop = scrollEl.value.scrollHeight;
}

async function sendMessage(text: string) {
  const trimmed = text.trim();
  if (!trimmed || sending.value) return;
  expanded.value = true;
  messages.value.push({ role: 'user', text: trimmed, ts: Date.now() });
  persist();
  scrollToBottom();
  sending.value = true;
  try {
    const res = await fetch(`${API_BASE_URL}/api/atlas/talk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: trimmed }),
    });
    const data = await res.json();
    if (!res.ok) {
      messages.value.push({ role: 'error', text: 'Atlas could not reply.', detail: data?.error || `HTTP ${res.status}`, ts: Date.now() });
    } else {
      messages.value.push({ role: 'atlas', text: data.reply || '(no reply)', decision: data.decision, ts: Date.now() });
      lastReply.value = deriveHint();
    }
  } catch (err: any) {
    messages.value.push({ role: 'error', text: 'Network error reaching Atlas.', detail: err?.message, ts: Date.now() });
  } finally {
    sending.value = false;
    persist();
    scrollToBottom();
  }
}

function onSubmit() {
  const text = draft.value;
  draft.value = '';
  sendMessage(text);
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    onSubmit();
  }
}

onMounted(() => { if (expanded.value) scrollToBottom(); });
</script>

<style scoped>
.talk-dock {
  display: flex;
  flex-direction: column;
  background: var(--theme-bg-primary);
  border-top: 1px solid var(--theme-border-primary);
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif;
  max-height: 320px;
}
.talk-dock.is-expanded { max-height: 320px; }

.talk-dock__handle {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 26px;
  padding: 0 12px;
  background: var(--theme-bg-secondary);
  border: none;
  border-bottom: 1px solid var(--theme-border-primary);
  color: var(--theme-text-tertiary);
  cursor: pointer;
  font-family: inherit;
  text-align: left;
}
.talk-dock__caret { font-size: 9px; color: var(--theme-text-tertiary); }
.talk-dock__label {
  font-size: 11px;
  font-weight: 600;
  color: var(--theme-text-primary);
  letter-spacing: -0.005em;
}
.talk-dock__hint {
  font-size: 11px;
  color: var(--theme-text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  font-weight: 400;
}

.talk-dock__thread {
  overflow-y: auto;
  padding: 8px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 240px;
}

.talk-empty {
  margin: 12px auto;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.talk-empty__lead { font-size: 13px; color: var(--theme-text-secondary); font-weight: 500; }
.talk-empty__suggestions { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; }
.atb-pill {
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 12px;
  font-size: 11px;
  font-weight: 500;
  color: var(--theme-text-secondary);
  background: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border-primary);
  border-radius: 999px;
  cursor: pointer;
  font-family: inherit;
}
.atb-pill:hover:not(:disabled) { background: var(--theme-bg-tertiary); color: var(--theme-text-primary); }
.atb-pill:disabled { opacity: 0.5; cursor: not-allowed; }

.talk-msg {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-width: 80%;
}
.talk-msg.is-user { align-self: flex-end; align-items: flex-end; }
.talk-msg.is-atlas, .talk-msg.is-error { align-self: flex-start; }

.talk-bubble {
  padding: 6px 10px;
  font-size: 13px;
  font-weight: 400;
  line-height: 1.35;
  border-radius: 14px;
  white-space: pre-wrap;
  word-wrap: break-word;
}
.is-user .talk-bubble {
  background: var(--theme-primary);
  color: #fff;
  border-bottom-right-radius: 4px;
}
.is-atlas .talk-bubble {
  background: var(--theme-bg-secondary);
  color: var(--theme-text-primary);
  border: 1px solid var(--theme-border-primary);
  border-bottom-left-radius: 4px;
}
.is-error .talk-bubble {
  background: rgba(255, 69, 58, 0.10);
  color: var(--theme-accent-error);
  border: 1px solid rgba(255, 69, 58, 0.30);
  border-bottom-left-radius: 4px;
  font-size: 12px;
}

.talk-bubble--pending {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.talk-dot {
  width: 5px;
  height: 5px;
  background: var(--theme-text-tertiary);
  border-radius: 50%;
  animation: talk-bounce 1.2s infinite ease-in-out;
}
.talk-dot:nth-child(2) { animation-delay: 0.15s; }
.talk-dot:nth-child(3) { animation-delay: 0.30s; }
@keyframes talk-bounce {
  0%, 80%, 100% { opacity: 0.3; transform: translateY(0); }
  40% { opacity: 1; transform: translateY(-3px); }
}

.talk-meta {
  font-size: 10px;
  color: var(--theme-text-tertiary);
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
}
.talk-meta.is-error { color: var(--theme-accent-error); }

.talk-dock__composer {
  display: flex;
  gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid var(--theme-border-primary);
  background: var(--theme-bg-primary);
}
.talk-dock__input {
  flex: 1;
  min-height: 32px;
  max-height: 120px;
  padding: 6px 10px;
  font-size: 13px;
  font-family: inherit;
  font-weight: 400;
  color: var(--theme-text-primary);
  background: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border-primary);
  border-radius: 14px;
  outline: none;
  resize: none;
  line-height: 1.35;
}
.talk-dock__input::placeholder { color: var(--theme-text-tertiary); }
.talk-dock__input:focus {
  border-color: var(--theme-primary);
  box-shadow: 0 0 0 3px var(--theme-primary-light);
}
.talk-dock__input:disabled { opacity: 0.6; }

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  border-radius: 14px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: background-color 0.12s ease;
}
.btn--primary {
  background: var(--theme-primary);
  color: #fff;
  border-color: var(--theme-primary);
}
.btn--primary:hover:not(:disabled) { background: var(--theme-primary-hover); }
.btn--primary:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
