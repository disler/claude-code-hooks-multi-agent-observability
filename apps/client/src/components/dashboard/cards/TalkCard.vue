<template>
  <article
    class="card talk"
    :class="{ 'is-compact': compact, 'is-dragover': dragover }"
    @dragover.prevent="onDragOver"
    @dragleave.prevent="onDragLeave"
    @drop.prevent="onDrop"
  >
    <span class="card-eyebrow">Talk to Atlas</span>

    <!-- Compact mobile preview -->
    <div v-if="compact" class="talk__preview" @click="$emit('open-fullscreen')">
      <div v-if="!messages.length" class="talk__preview-empty">Ask Atlas anything…</div>
      <div v-else class="talk__preview-msgs">
        <div v-for="msg in previewMessages" :key="msg.ts" class="talk__preview-line" :class="`is-${msg.role}`">
          <span class="talk__preview-prefix">{{ msg.role === 'user' ? 'You' : 'Atlas' }}</span>
          <span class="talk__preview-text">{{ msg.text }}</span>
        </div>
      </div>
      <a class="talk__cta" href="#" @click.prevent="$emit('open-fullscreen')">Open chat →</a>
    </div>

    <!-- Full thread -->
    <div v-else ref="threadEl" class="talk__thread">
      <div v-if="!messages.length && pinnedActions.length === 0" class="talk__empty">
        <p class="talk__empty-lead">What can Atlas help with?</p>
        <div class="talk__empty-suggestions">
          <button v-for="s in suggestions" :key="s" class="talk__chip" @click="send(s)" :disabled="sending">{{ s }}</button>
        </div>
      </div>

      <!-- Pinned actions -->
      <div v-if="!compact && pinnedActions.length" class="talk__pinned">
        <button v-for="p in pinnedActions" :key="p" class="talk__chip talk__chip--pinned" :disabled="sending" @click="send(p)" :title="p">
          <span class="talk__chip-pin">📌</span>
          <span class="talk__chip-text">{{ p.length > 36 ? p.slice(0, 35) + '…' : p }}</span>
          <span class="talk__chip-x" @click.stop="unpin(p)" title="Unpin">×</span>
        </button>
      </div>

      <div v-for="(msg, i) in messages" :key="i" class="talk__msg" :class="`is-${msg.role}`">
        <div class="talk__bubble">
          <div v-if="msg.attachments?.length" class="talk__attachments-display">
            <span v-for="(att, idx) in msg.attachments" :key="idx" class="talk__attachment-chip">
              <span class="talk__attachment-icon">{{ iconFor(att) }}</span>
              <span class="talk__attachment-name">{{ att }}</span>
            </span>
          </div>
          <div v-if="msg.text">{{ msg.text }}</div>
        </div>
        <div class="talk__msg-tools">
          <div v-if="msg.role === 'atlas' && msg.decision" class="talk__meta">
            @{{ msg.decision.agent }} · {{ msg.decision.project }} · {{ msg.decision.model }}
          </div>
          <div v-else-if="msg.role === 'error'" class="talk__meta is-error">{{ msg.detail || 'error' }}</div>
          <button v-if="msg.role === 'user'" class="talk__pin-btn" :title="isPinned(msg.text) ? 'Pinned' : 'Pin as quick action'" @click="togglePin(msg.text)">
            <span v-if="isPinned(msg.text)">📌</span><span v-else>+pin</span>
          </button>
          <button v-if="msg.role === 'atlas' && voiceSupported" class="talk__speak-btn" :title="speakingId === i ? 'Stop' : 'Speak'" @click="toggleSpeak(i, msg.text)">
            {{ speakingId === i ? '◼' : '🔊' }}
          </button>
        </div>
      </div>

      <!-- Quick-reply suggestions after Atlas's last reply -->
      <div v-if="quickReplies.length && messages[messages.length - 1]?.role === 'atlas'" class="talk__quick">
        <button v-for="q in quickReplies" :key="q" class="talk__chip talk__chip--quick" @click="send(q)" :disabled="sending">{{ q }}</button>
      </div>

      <div v-if="sending" class="talk__msg is-atlas">
        <div class="talk__bubble talk__bubble--pending">
          <span class="dot"></span><span class="dot"></span><span class="dot"></span>
        </div>
      </div>
    </div>

    <!-- Pending attachments row -->
    <div v-if="!compact && pending.length" class="talk__pending">
      <div v-for="(p, i) in pending" :key="i" class="talk__pending-item">
        <div class="talk__pending-thumb" :style="p.preview ? `background-image:url(${p.preview})` : ''">
          <span v-if="!p.preview" class="talk__pending-ext">{{ extOf(p.file.name) }}</span>
        </div>
        <span class="talk__pending-name">{{ truncate(p.file.name, 14) }}</span>
        <button class="talk__pending-x" @click="removePending(i)" aria-label="Remove">×</button>
      </div>
    </div>

    <!-- Composer -->
    <form v-if="!compact" class="talk__composer" @submit.prevent="onSubmit">
      <button type="button" class="talk__clip" @click="filePickerEl?.click()" :disabled="sending" aria-label="Attach files" title="Attach files">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
        </svg>
      </button>
      <input
        ref="filePickerEl"
        type="file"
        :accept="ACCEPT"
        multiple
        class="talk__file-input"
        @change="onFilePick"
      />
      <input
        ref="inputEl"
        type="text"
        class="talk__input"
        v-model="draft"
        placeholder="Message Atlas…"
        @keydown="onKey"
        :disabled="sending"
      />
      <button
        v-if="speechSupported"
        type="button"
        class="talk__mic"
        :class="{ 'is-on': listening }"
        @click="onMic"
        :disabled="sending"
        :aria-label="listening ? 'Stop dictation' : 'Dictate'"
        :title="listening ? 'Stop dictation' : 'Dictate'"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 1.5a3 3 0 0 0-3 3v6a3 3 0 1 0 6 0v-6a3 3 0 0 0-3-3z"/>
          <path d="M5 10v1a7 7 0 0 0 14 0v-1"/>
          <path d="M12 18.5V22"/>
        </svg>
      </button>
      <button type="submit" class="talk__send" :disabled="!canSend || sending" aria-label="Send">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 19V5M5 12l7-7 7 7"/>
        </svg>
      </button>
    </form>

    <!-- Visual model picker — chip row below composer. -->
    <div v-if="!compact" class="talk__models" role="radiogroup" aria-label="Force model">
      <button
        v-for="m in MODELS"
        :key="m.id"
        type="button"
        class="talk__chip-model"
        :class="{ 'is-active': forceModel === m.id }"
        :title="`${m.label} · ${m.detail}`"
        :aria-pressed="forceModel === m.id"
        @click="forceModel = m.id"
      >
        <ModelLogo :family="m.family" :size="20" />
        <span class="talk__chip-label">{{ m.label }}</span>
      </button>
    </div>

    <!-- Error toast -->
    <div v-if="errorToast" class="talk__toast">{{ errorToast }}</div>

    <!-- Drag overlay -->
    <div v-if="dragover" class="talk__drop-overlay">Drop files to attach</div>
  </article>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { API_BASE_URL } from '../../../config';
import { useSpeechToText } from '../../../composables/useSpeechToText';
import { fetchSuggestions } from '../../../composables/useAtlasViews';
import ModelLogo from '../ModelLogo.vue';

interface Msg {
  role: 'user' | 'atlas' | 'error';
  text: string;
  decision?: { agent: string; project: string; model: string; rationale?: string };
  detail?: string;
  attachments?: string[];
  ts: number;
}
interface Pending {
  file: File;
  preview: string;
}

defineProps<{ compact?: boolean }>();
defineEmits<{ (e: 'open-fullscreen'): void }>();

const STORAGE_KEY = 'atlas.talkThread';
const MAX_MESSAGES = 100;
const MAX_FILES = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPT = '.jpg,.jpeg,.png,.heic,.heif,.webp,.gif,.pdf,.txt,.md,.docx,.rtf,.js,.ts,.tsx,.jsx,.py,.swift,.json,.yaml,.yml,.html,.css,image/*,application/pdf,text/*';
const ALLOWED_EXT = new Set('jpg jpeg png heic heif webp gif pdf txt md docx rtf js ts tsx jsx py swift json yaml yml html css'.split(' '));

const suggestions = ['status check', 'what did you find this morning', 'draft a cold email'];

const messages = ref<Msg[]>(load());
const draft = ref('');
const sending = ref(false);
const pending = ref<Pending[]>([]);
const dragover = ref(false);
const errorToast = ref('');
let errorTimer: any = null;

// Force-model picker (persisted across reloads). Empty string = auto/router.
const MODEL_KEY = 'atlas.talkForceModel';
const forceModel = ref<string>(localStorage.getItem(MODEL_KEY) || '');
watch(forceModel, (v) => { try { localStorage.setItem(MODEL_KEY, v); } catch {} });
const MODELS = [
  { id: '',          label: 'Auto',  glyph: '⚡', family: 'auto',      detail: 'Router decides per message' },
  { id: 'opus',      label: 'Opus',  glyph: 'A', family: 'anthropic', detail: 'Anthropic · top reasoning' },
  { id: 'sonnet',    label: 'Sonnet',glyph: 'A', family: 'anthropic', detail: 'Anthropic · default coder' },
  { id: 'haiku',     label: 'Haiku', glyph: 'A', family: 'anthropic', detail: 'Anthropic · fast + cheap' },
  { id: 'gpt5',      label: 'GPT-5', glyph: 'G', family: 'openai',    detail: 'OpenAI · second opinion' },
  { id: 'gpt5-mini', label: 'GPT-5m',glyph: 'g', family: 'openai',    detail: 'OpenAI · cheap second opinion' },
  { id: 'gemma',     label: 'Gemma', glyph: 'g', family: 'ollama',    detail: 'Local (Ollama) · private' },
];

// Pinned actions (operator-favorited quick prompts)
const PIN_KEY = 'atlas.talkPinned';
const pinnedActions = ref<string[]>(loadPinned());
function loadPinned(): string[] {
  try { const raw = localStorage.getItem(PIN_KEY); if (raw) return JSON.parse(raw); } catch {}
  return [];
}
function persistPinned() { try { localStorage.setItem(PIN_KEY, JSON.stringify(pinnedActions.value)); } catch {} }
function isPinned(t: string): boolean { return pinnedActions.value.includes((t || '').trim()); }
function togglePin(t: string) {
  const v = (t || '').trim();
  if (!v) return;
  const i = pinnedActions.value.indexOf(v);
  if (i >= 0) pinnedActions.value.splice(i, 1);
  else pinnedActions.value.push(v);
  pinnedActions.value = pinnedActions.value.slice(-8);
  persistPinned();
}
function unpin(t: string) {
  const i = pinnedActions.value.indexOf(t);
  if (i >= 0) pinnedActions.value.splice(i, 1);
  persistPinned();
}

// Voice replies via Web Speech Synthesis
const voiceSupported = ref(typeof window !== 'undefined' && 'speechSynthesis' in window);
const speakingId = ref<number | null>(null);
function toggleSpeak(idx: number, text: string) {
  if (!voiceSupported.value) return;
  if (speakingId.value === idx) { window.speechSynthesis.cancel(); speakingId.value = null; return; }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text || '');
  u.rate = 1.05;
  u.onend = () => { if (speakingId.value === idx) speakingId.value = null; };
  u.onerror = () => { if (speakingId.value === idx) speakingId.value = null; };
  speakingId.value = idx;
  window.speechSynthesis.speak(u);
}

// Quick-reply suggestions populated after Atlas's reply
const quickReplies = ref<string[]>([]);
async function loadQuickReplies() {
  const msgs = messages.value;
  if (msgs.length < 2) { quickReplies.value = []; return; }
  const last = msgs[msgs.length - 1];
  const prev = msgs[msgs.length - 2];
  if (last?.role !== 'atlas' || prev?.role !== 'user') { quickReplies.value = []; return; }
  quickReplies.value = await fetchSuggestions(prev.text || '', last.text || '');
}

// Dictation. Drops transcript into the draft input as it speaks.
const { supported: speechSupported, listening, transcript: speechTranscript, toggle: speechToggle } = useSpeechToText();
let speechBaseline = '';
watch(speechTranscript, (t) => {
  if (!t) return;
  draft.value = (speechBaseline ? speechBaseline + ' ' : '') + t;
});
function onMic() {
  if (!listening.value) speechBaseline = draft.value.trim();
  speechToggle();
}

const threadEl = ref<HTMLDivElement | null>(null);
const inputEl = ref<HTMLInputElement | null>(null);
const filePickerEl = ref<HTMLInputElement | null>(null);

const previewMessages = computed(() => messages.value.slice(-2));
const canSend = computed(() => draft.value.trim().length > 0 || pending.value.length > 0);

function load(): Msg[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw).slice(-MAX_MESSAGES);
  } catch {/* ignore */}
  return [];
}
function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.value.slice(-MAX_MESSAGES))); } catch {/* ignore */}
}

function showError(msg: string) {
  errorToast.value = msg;
  if (errorTimer) clearTimeout(errorTimer);
  errorTimer = setTimeout(() => { errorToast.value = ''; }, 3000);
}

function extOf(name: string): string {
  const ext = (name.split('.').pop() || '').toLowerCase();
  return ext.slice(0, 4).toUpperCase();
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + '…';
}

function iconFor(name: string): string {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (['jpg','jpeg','png','heic','heif','webp','gif'].includes(ext)) return '🖼';
  if (ext === 'pdf') return '📄';
  return '📎';
}

function acceptFiles(list: FileList | File[]) {
  const files = Array.from(list);
  for (const f of files) {
    if (pending.value.length >= MAX_FILES) { showError(`Max ${MAX_FILES} files per message`); return; }
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    if (!ALLOWED_EXT.has(ext) && !f.type.startsWith('image/') && !f.type.startsWith('text/') && f.type !== 'application/pdf') {
      showError(`Unsupported file type: ${f.name}`); continue;
    }
    if (f.size > MAX_FILE_BYTES) { showError(`File too large (limit 10 MB): ${f.name}`); continue; }
    const p: Pending = { file: f, preview: '' };
    if (f.type.startsWith('image/')) p.preview = URL.createObjectURL(f);
    pending.value.push(p);
  }
}

function onFilePick(e: Event) {
  const target = e.target as HTMLInputElement;
  if (target.files) acceptFiles(target.files);
  target.value = '';
}

function onDragOver(_e: DragEvent) { dragover.value = true; }
function onDragLeave(_e: DragEvent) { dragover.value = false; }
function onDrop(e: DragEvent) {
  dragover.value = false;
  if (e.dataTransfer?.files) acceptFiles(e.dataTransfer.files);
}

function removePending(i: number) {
  const p = pending.value[i];
  if (p.preview) URL.revokeObjectURL(p.preview);
  pending.value.splice(i, 1);
}

async function scrollDown() {
  await nextTick();
  if (threadEl.value) threadEl.value.scrollTop = threadEl.value.scrollHeight;
}

async function send(text: string) {
  const trimmed = text.trim();
  if (!trimmed && pending.value.length === 0) return;
  if (sending.value) return;

  const attachmentNames = pending.value.map(p => p.file.name);
  messages.value.push({ role: 'user', text: trimmed, attachments: attachmentNames.length ? attachmentNames : undefined, ts: Date.now() });
  persist();
  scrollDown();
  sending.value = true;

  const fd = new FormData();
  fd.append('message', trimmed);
  if (forceModel.value) fd.append('forceModel', forceModel.value);
  // Send last 6 turns so claude --print has chat context (each --print call
  // is a fresh process; the server inlines these as conversation history).
  const recentTurns = messages.value.slice(-6).map(m => ({ role: m.role, text: m.text }));
  if (recentTurns.length) fd.append('priorTurns', JSON.stringify(recentTurns));
  for (const p of pending.value) fd.append('files', p.file, p.file.name);

  // clear pending (now consumed)
  const consumed = pending.value.slice();
  pending.value = [];
  consumed.forEach(p => p.preview && URL.revokeObjectURL(p.preview));

  try {
    const res = await fetch(`${API_BASE_URL}/api/atlas/talk`, { method: 'POST', body: fd });
    const data = await res.json();
    if (!res.ok) {
      messages.value.push({ role: 'error', text: 'Atlas could not reply.', detail: data?.error || `HTTP ${res.status}`, ts: Date.now() });
    } else {
      messages.value.push({ role: 'atlas', text: data.reply || '(no reply)', decision: data.decision, ts: Date.now() });
    }
  } catch (err: any) {
    messages.value.push({ role: 'error', text: 'Network error reaching Atlas.', detail: err?.message, ts: Date.now() });
  } finally {
    sending.value = false;
    persist();
    scrollDown();
    // Refresh quick-reply suggestions for whatever just landed
    loadQuickReplies();
  }
}

function onSubmit() {
  const t = draft.value;
  draft.value = '';
  send(t);
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    onSubmit();
  }
}

function onCmdK(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    inputEl.value?.focus();
  }
}

onMounted(() => {
  scrollDown();
  document.addEventListener('keydown', onCmdK);
});
onUnmounted(() => {
  document.removeEventListener('keydown', onCmdK);
  if (errorTimer) clearTimeout(errorTimer);
  pending.value.forEach(p => p.preview && URL.revokeObjectURL(p.preview));
});

// expose for fullscreen usage
defineExpose({ send });
</script>

<style scoped>
.card {
  position: relative;
  background: var(--atlas-card-bg);
  border-radius: 20px;
  padding: 24px 28px;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}
@media (max-width: 1023px) { .card { padding: 20px 22px; } }
.card.is-compact { gap: 12px; cursor: pointer; }
.card.is-dragover {
  outline: 2px dashed var(--atlas-blue);
  outline-offset: -8px;
}

.card-eyebrow {
  display: block;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--atlas-text-secondary);
}

/* Compact preview (mobile) */
.talk__preview {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.talk__preview-empty {
  font-size: 15px;
  color: var(--atlas-text-secondary);
}
.talk__preview-msgs {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.talk__preview-line {
  font-size: 14px;
  line-height: 1.35;
  display: flex;
  gap: 6px;
  overflow: hidden;
}
.talk__preview-prefix {
  font-weight: 500;
  color: var(--atlas-text-strong);
  flex: none;
}
.talk__preview-text {
  color: var(--atlas-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.talk__cta {
  font-size: 14px;
  color: var(--atlas-blue);
  font-weight: 500;
  text-decoration: none;
}

/* Thread */
.talk__thread {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 320px;
  min-height: 0;
  flex: 0 1 auto;
  overflow-y: auto;
  padding-right: 4px;
}
.talk__thread:empty,
.talk__thread:has(.talk__empty) { max-height: none; }

.talk__empty {
  margin: 8px 0 4px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.talk__empty-lead {
  margin: 0;
  font-size: 15px;
  color: var(--atlas-text-secondary);
}
.talk__empty-suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.talk__chip {
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 14px;
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  color: var(--atlas-text-primary);
  background: transparent;
  border: 1px solid var(--atlas-hairline);
  border-radius: 999px;
  cursor: pointer;
  transition: opacity 0.15s ease;
}
.talk__chip:hover:not(:disabled) { opacity: 0.7; }
.talk__chip:disabled { opacity: 0.4; cursor: not-allowed; }

.talk__msg {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 80%;
}
.talk__msg.is-user { align-self: flex-end; align-items: flex-end; }
.talk__msg.is-atlas, .talk__msg.is-error { align-self: flex-start; }

.talk__bubble {
  padding: 10px 16px;
  font-size: 15px;
  font-weight: 400;
  line-height: 1.45;
  border-radius: 18px;
  white-space: pre-wrap;
  word-wrap: break-word;
}
.is-user .talk__bubble {
  background: var(--atlas-blue);
  color: #FFFFFF;
  border-bottom-right-radius: 6px;
}
.is-atlas .talk__bubble {
  background: var(--atlas-card-bg-2);
  color: var(--atlas-text-primary);
  border-bottom-left-radius: 6px;
}
.is-error .talk__bubble {
  background: rgba(255, 59, 48, 0.10);
  color: var(--atlas-red);
  border-bottom-left-radius: 6px;
  font-size: 14px;
}

.talk__attachments-display {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 6px;
}
.talk__attachment-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  font-size: 11.5px;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 6px;
}
.is-atlas .talk__attachment-chip { background: rgba(0, 0, 0, 0.05); }
.talk__attachment-icon { font-size: 12px; }
.talk__attachment-name { font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace; font-size: 11px; }

.talk__bubble--pending {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.dot {
  width: 6px; height: 6px;
  background: var(--atlas-text-muted);
  border-radius: 50%;
  animation: talk-bounce 1.2s infinite ease-in-out;
}
.dot:nth-child(2) { animation-delay: 0.15s; }
.dot:nth-child(3) { animation-delay: 0.30s; }
@keyframes talk-bounce {
  0%, 80%, 100% { opacity: 0.3; transform: translateY(0); }
  40% { opacity: 1; transform: translateY(-2px); }
}

.talk__meta {
  font-size: 13px;
  color: var(--atlas-text-muted);
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
}
.talk__meta.is-error { color: var(--atlas-red); }
.talk__msg-tools { display: flex; align-items: center; gap: 8px; }
.is-user .talk__msg-tools { justify-content: flex-end; }
.is-atlas .talk__msg-tools, .is-error .talk__msg-tools { justify-content: flex-start; }
.talk__pin-btn, .talk__speak-btn {
  background: transparent; border: 0; padding: 0;
  font-size: 11.5px; color: var(--atlas-text-muted, var(--atlas-text-secondary));
  cursor: pointer; font-family: inherit;
}
.talk__pin-btn:hover, .talk__speak-btn:hover { color: var(--atlas-blue); }

.talk__pinned { display: flex; gap: 6px; flex-wrap: wrap; }
.talk__chip--pinned { background: var(--atlas-card-bg-2); padding-right: 6px; }
.talk__chip-pin { font-size: 10px; opacity: 0.75; }
.talk__chip-text { line-height: 1; }
.talk__chip-x { font-size: 14px; line-height: 1; opacity: 0.5; margin-left: 4px; cursor: pointer; }
.talk__chip-x:hover { opacity: 1; color: var(--atlas-red); }
.talk__quick { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
.talk__chip--quick {
  background: transparent; border-color: var(--atlas-blue);
  color: var(--atlas-blue); padding: 4px 12px;
}
.talk__chip--quick:hover:not(:disabled) { background: var(--atlas-blue-soft); }

/* Pending attachments row */
.talk__pending {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 4px 0;
}
.talk__pending-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  flex: none;
  position: relative;
}
.talk__pending-thumb {
  width: 48px;
  height: 48px;
  background-size: cover;
  background-position: center;
  background-color: var(--atlas-card-bg-2);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.talk__pending-ext {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  font-size: 11px;
  font-weight: 500;
  color: var(--atlas-text-secondary);
}
.talk__pending-name {
  font-size: 10px;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  color: var(--atlas-text-secondary);
  max-width: 56px;
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
}
.talk__pending-x {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--atlas-text-primary);
  color: var(--atlas-page-bg);
  border: none;
  border-radius: 50%;
  font-size: 12px;
  cursor: pointer;
  line-height: 1;
}

/* Composer — always pinned visibly at the bottom of the card */
.talk__composer {
  display: flex;
  gap: 6px;
  align-items: center;
  border-top: 1px solid var(--atlas-hairline);
  padding-top: 14px;
  flex: none;
}
.talk__clip,
.talk__send {
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--atlas-text-secondary);
  cursor: pointer;
  border-radius: 8px;
  transition: opacity 0.15s ease, color 0.15s ease, background-color 0.15s ease;
  padding: 0;
}
.talk__clip:hover:not(:disabled) { color: var(--atlas-text-primary); }
.talk__clip:disabled, .talk__send:disabled { opacity: 0.4; cursor: not-allowed; }
.talk__send { color: var(--atlas-blue); }
.talk__send:not(:disabled):hover { background: var(--atlas-blue-soft); }
.talk__send:disabled { color: var(--atlas-text-muted); }

.talk__file-input { display: none; }

.talk__mic {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--atlas-hairline);
  color: var(--atlas-text-secondary);
  cursor: pointer;
  border-radius: 8px;
  padding: 0;
}
.talk__mic:hover:not(:disabled) { color: var(--atlas-text-primary); border-color: var(--atlas-text-secondary); }
.talk__mic.is-on { color: var(--atlas-red); border-color: var(--atlas-red); animation: mic-pulse 1.4s infinite ease-in-out; }
.talk__mic:disabled { opacity: 0.4; cursor: not-allowed; }
@keyframes mic-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(255,59,48,0.30); }
  50%      { box-shadow: 0 0 0 6px rgba(255,59,48,0); }
}

.talk__models {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 8px;
}
.talk__chip-model {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  background: var(--atlas-card-bg-2, #FFF);
  border: 1px solid var(--atlas-hairline);
  color: var(--atlas-text-primary);
  font-size: 12.5px;
  font-weight: 500;
  font-family: inherit;
  padding: 4px 12px 4px 4px;
  border-radius: 999px;
  cursor: pointer;
  transition: border-color 100ms ease, background-color 100ms ease, transform 100ms ease;
}
.talk__chip-model:hover { transform: translateY(-1px); }
.talk__chip-label { line-height: 1; }
.talk__chip-model.is-active {
  border-color: var(--atlas-blue);
  background: var(--atlas-blue-soft);
  color: var(--atlas-blue);
}

.talk__input {
  flex: 1 1 auto;
  height: 40px;
  padding: 0 14px;
  font-size: 15px;
  font-family: inherit;
  color: var(--atlas-text-primary);
  background: var(--atlas-card-bg-2, #FFFFFF);
  border: 1px solid var(--atlas-hairline);
  border-radius: 12px;
  outline: none;
  transition: border-color 0.12s ease, box-shadow 0.12s ease;
  min-width: 0;
  width: 100%;
}
.talk__input:focus {
  border-color: var(--atlas-blue);
  box-shadow: 0 0 0 3px var(--atlas-blue-soft);
}
.talk__input::placeholder { color: var(--atlas-text-muted); }
.talk__input:disabled { opacity: 0.6; }

/* Toast */
.talk__toast {
  position: absolute;
  bottom: 96px;
  left: 50%;
  transform: translateX(-50%);
  padding: 8px 14px;
  font-size: 13px;
  color: #FFFFFF;
  background: rgba(28, 28, 30, 0.92);
  border-radius: 999px;
  pointer-events: none;
  z-index: 10;
}

/* Drag overlay */
.talk__drop-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: 500;
  color: var(--atlas-blue);
  background: rgba(10, 132, 255, 0.08);
  border-radius: 20px;
  pointer-events: none;
  z-index: 5;
}
</style>
