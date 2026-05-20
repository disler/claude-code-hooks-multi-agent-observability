<template>
  <div class="dialog-bg" @click.self="$emit('close')">
    <div class="dialog">
      <header class="dialog__head">
        <h3>New task</h3>
        <button class="dialog__x" @click="$emit('close')">✕</button>
      </header>

      <!-- Vibe templates -->
      <div v-if="templates.length" class="templates">
        <span class="templates__label">Templates</span>
        <div class="templates__chips">
          <button
            v-for="t in templates"
            :key="t.id"
            type="button"
            class="templates__chip"
            :title="t.description"
            @click="applyTemplate(t)"
          >
            <span class="templates__cat">{{ t.category }}</span>{{ t.name }}
          </button>
        </div>
      </div>

      <label class="field">
        <span class="field__label">Project</span>
        <select v-model="projectId" class="field__input">
          <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.name }} · {{ p.path }}</option>
        </select>
      </label>

      <label class="field">
        <span class="field__label">Title</span>
        <input v-model="title" class="field__input" placeholder="e.g. fix autosave bug" />
      </label>

      <label class="field">
        <span class="field__label">
          <span>Prompt</span>
          <VoiceMic v-model="prompt" />
        </span>
        <textarea v-model="prompt" class="field__input field__input--textarea" rows="6"
          placeholder="Describe what you want the agent to do. Be specific — files, behavior, tests."></textarea>
      </label>

      <div class="field-row">
        <label class="field">
          <span class="field__label">Model</span>
          <select v-model="model" class="field__input">
            <option value="haiku">Claude · Haiku 4.5</option>
            <option value="sonnet">Claude · Sonnet 4.6</option>
            <option value="opus">Claude · Opus 4.7</option>
            <option value="gpt5">GPT-5.5 (Codex)</option>
            <option value="gemma">Gemma (local)</option>
          </select>
        </label>
        <label class="field">
          <span class="field__label">Mode</span>
          <select v-model="mode" class="field__input">
            <option value="safe">Safe · accept edits, ask for shell</option>
            <option value="auto">Auto · bypass all prompts (vibe)</option>
          </select>
        </label>
      </div>

      <label class="field-checkbox">
        <input type="checkbox" v-model="planFirst" />
        <span><strong>Plan first</strong> — first task outputs a plan only; "Approve & Execute" follow-up runs it. (Safer for ambiguous prompts.)</span>
      </label>

      <p v-if="error" class="dialog__error">{{ error }}</p>

      <footer class="dialog__foot">
        <button class="dialog__btn dialog__btn--ghost" @click="$emit('close')">Cancel</button>
        <button class="dialog__btn dialog__btn--primary" :disabled="!canSubmit || saving" @click="submit">
          {{ saving ? 'Creating…' : 'Add to Backlog' }}
        </button>
        <button class="dialog__btn dialog__btn--primary" :disabled="!canSubmit || saving" @click="submitAndRun">
          {{ saving ? '…' : 'Create + Run' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { WSProject, VibeTemplate } from '../../composables/useWorkspace';
import VoiceMic from './VoiceMic.vue';

const props = defineProps<{ projects: WSProject[]; defaultProjectId?: string | null; templates?: VibeTemplate[] }>();
const templates = computed(() => props.templates || []);

function applyTemplate(t: VibeTemplate) {
  if (!title.value.trim()) title.value = t.name;
  prompt.value = prompt.value ? `${prompt.value}\n\n${t.body}` : t.body;
}
const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'create', payload: { project_id: string; title: string; prompt: string; model: string; mode: 'safe' | 'auto' }, runImmediately: boolean): void;
}>();

const projectId = ref(props.defaultProjectId || props.projects[0]?.id || '');
const title = ref('');
const prompt = ref('');
const model = ref('sonnet');
const mode = ref<'safe' | 'auto'>('safe');
const planFirst = ref(false);
const saving = ref(false);
const error = ref<string | null>(null);

const PLAN_PREFIX =
`PLAN MODE. Do not modify any files yet. Read whatever you need with the Read tool, then output a numbered plan (1-8 steps) for the request below. Each step: file path, function/section to touch, what changes, and any risks. End with "Ready to execute on approval."

REQUEST:
`;

watch(() => props.projects, (p) => {
  if (!projectId.value && p.length) projectId.value = p[0].id;
});

const canSubmit = computed(() => projectId.value && title.value.trim() && prompt.value.trim());

async function submit() { doSubmit(false); }
async function submitAndRun() { doSubmit(true); }
function doSubmit(run: boolean) {
  if (!canSubmit.value) return;
  error.value = null;
  saving.value = true;
  const useTitle = planFirst.value ? `[Plan] ${title.value.trim()}` : title.value.trim();
  const usePrompt = planFirst.value ? PLAN_PREFIX + prompt.value.trim() : prompt.value.trim();
  emit('create', {
    project_id: projectId.value,
    title: useTitle,
    prompt: usePrompt,
    model: model.value,
    mode: mode.value,
  }, run);
}
</script>

<style scoped>
.dialog-bg {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.45);
  display: grid; place-items: center;
  z-index: 200;
  padding: 40px;
}
.dialog {
  background: var(--atlas-page-bg);
  border-radius: 14px;
  padding: 24px;
  width: 100%; max-width: 580px;
  display: flex; flex-direction: column; gap: 14px;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
  box-shadow: 0 30px 80px rgba(0,0,0,0.45);
}
.dialog__head {
  display: flex; justify-content: space-between; align-items: center;
}
.dialog__head h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--atlas-text-strong);
}
.dialog__x {
  background: transparent; border: none;
  font-size: 16px; color: var(--atlas-text-secondary);
  cursor: pointer; padding: 4px 8px;
}

.field { display: flex; flex-direction: column; gap: 6px; }
.field__label {
  font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--atlas-text-secondary);
  display: flex; justify-content: space-between; align-items: center;
}

.templates { display: flex; flex-direction: column; gap: 6px; }
.templates__label {
  font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--atlas-text-secondary);
}
.templates__chips { display: flex; flex-wrap: wrap; gap: 6px; }
.templates__chip {
  background: var(--atlas-card-bg);
  border: 1px solid var(--atlas-hairline);
  font-family: inherit;
  font-size: 11.5px;
  color: var(--atlas-text-primary);
  padding: 5px 10px;
  border-radius: 6px;
  cursor: pointer;
  display: inline-flex; align-items: center; gap: 6px;
}
.templates__chip:hover { border-color: var(--atlas-blue); background: rgba(94,158,255,0.06); }
.templates__cat {
  font-size: 9.5px; letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--atlas-text-secondary); opacity: 0.7;
}
.field__input {
  background: var(--atlas-card-bg);
  border: 1px solid var(--atlas-hairline);
  border-radius: 8px;
  padding: 8px 10px;
  font-family: inherit;
  font-size: 14px;
  color: var(--atlas-text-primary);
  outline: none;
}
.field__input:focus {
  border-color: var(--atlas-blue);
}
.field__input--textarea {
  font-family: ui-monospace, Menlo, monospace;
  font-size: 12.5px;
  line-height: 1.5;
  resize: vertical;
}

.field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.field-checkbox {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12.5px;
  color: var(--atlas-text-secondary);
  line-height: 1.45;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--atlas-hairline);
  cursor: pointer;
}
.field-checkbox input { margin-top: 2px; }
.field-checkbox strong { color: var(--atlas-text-strong); }

.dialog__foot {
  display: flex; gap: 10px; justify-content: flex-end; margin-top: 6px;
}
.dialog__btn {
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid var(--atlas-hairline);
  background: transparent;
  color: var(--atlas-text-primary);
  cursor: pointer;
}
.dialog__btn:hover { background: var(--atlas-card-bg); }
.dialog__btn--primary {
  background: var(--atlas-blue);
  border-color: var(--atlas-blue);
  color: white;
}
.dialog__btn--primary:hover { opacity: 0.9; }
.dialog__btn--primary:disabled { opacity: 0.4; cursor: not-allowed; }
.dialog__btn--ghost { color: var(--atlas-text-secondary); }

.dialog__error {
  margin: 0;
  font-size: 13px;
  color: var(--atlas-red, #ff453a);
}

@media (max-width: 600px) {
  .dialog-bg { padding: 0; align-items: stretch; place-items: stretch; }
  .dialog {
    border-radius: 0;
    padding: max(16px, env(safe-area-inset-top)) 16px calc(16px + env(safe-area-inset-bottom));
    max-width: none;
    min-height: 100vh;
    gap: 12px;
  }
  .dialog__head h3 { font-size: 20px; }
  .dialog__x { font-size: 22px; padding: 8px 12px; min-width: 44px; min-height: 44px; }
  .field__input { font-size: 16px; padding: 12px; min-height: 44px; }
  .field__input--textarea { min-height: 140px; }
  .field-row { grid-template-columns: 1fr; gap: 10px; }
  .dialog__foot { flex-wrap: wrap; gap: 8px; }
  .dialog__btn { flex: 1 1 100%; padding: 14px 16px; font-size: 15px; min-height: 44px; }
  .dialog__btn--ghost { order: 99; }
  .templates__chip { padding: 8px 12px; font-size: 13px; min-height: 38px; }
}
</style>
