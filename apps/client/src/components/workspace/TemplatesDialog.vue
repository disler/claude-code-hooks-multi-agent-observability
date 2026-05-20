<template>
  <div class="tpl-bg" @click.self="$emit('close')">
    <div class="tpl">
      <header class="tpl__head">
        <div>
          <span class="tpl__eyebrow">Workspace · Vibe templates</span>
          <h3 class="tpl__title">Manage templates</h3>
        </div>
        <button class="tpl__x" @click="$emit('close')">✕</button>
      </header>

      <div class="tpl__cols">
        <!-- List -->
        <aside class="tpl__list">
          <button class="tpl__new" @click="newTemplate">+ New template</button>
          <ul class="tpl__rows">
            <li
              v-for="t in templates"
              :key="t.id"
              class="tpl__row"
              :class="{ 'is-active': active?.id === t.id }"
              @click="selectTemplate(t)"
            >
              <span class="tpl__row-cat">{{ t.category }}</span>
              <span class="tpl__row-name">{{ t.name }}</span>
              <span v-if="t.builtin" class="tpl__row-tag">built-in</span>
            </li>
          </ul>
        </aside>

        <!-- Editor -->
        <section class="tpl__edit">
          <p v-if="!active" class="tpl__empty">Pick a template on the left, or create a new one.</p>
          <template v-else>
            <label class="tpl__field">
              <span>Name</span>
              <input v-model="form.name" :disabled="active.builtin" />
            </label>
            <div class="tpl__row2">
              <label class="tpl__field">
                <span>Category</span>
                <input v-model="form.category" :disabled="active.builtin" placeholder="web · swift · design · custom" />
              </label>
              <label class="tpl__field">
                <span>Description</span>
                <input v-model="form.description" :disabled="active.builtin" />
              </label>
            </div>
            <label class="tpl__field">
              <span>Prompt body</span>
              <textarea v-model="form.body" :disabled="active.builtin" rows="10"></textarea>
            </label>
            <p v-if="active.builtin" class="tpl__hint">Built-in templates are read-only. Duplicate to make a custom version.</p>
            <p v-if="error" class="tpl__err">{{ error }}</p>
            <footer class="tpl__foot">
              <button v-if="!active.builtin" class="tpl__btn tpl__btn--danger" @click="onDelete" :disabled="busy">Delete</button>
              <button class="tpl__btn tpl__btn--ghost" @click="onDuplicate" :disabled="busy">Duplicate</button>
              <span class="tpl__spacer"></span>
              <button v-if="!active.builtin" class="tpl__btn tpl__btn--primary" @click="onSave" :disabled="busy || !dirty">
                {{ busy ? 'Saving…' : 'Save' }}
              </button>
            </footer>
          </template>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue';
import type { VibeTemplate } from '../../composables/useWorkspace';

const props = defineProps<{
  templates: VibeTemplate[];
  create: (input: { name: string; category?: string; description?: string; body: string }) => Promise<VibeTemplate>;
  update: (id: string, input: any) => Promise<void>;
  remove: (id: string) => Promise<void>;
}>();
const emit = defineEmits<{ (e: 'close'): void }>();

const active = ref<VibeTemplate | null>(props.templates[0] || null);
const form = reactive({ name: '', category: '', description: '', body: '' });
const busy = ref(false);
const error = ref<string | null>(null);

watch(active, (t) => {
  if (!t) return;
  form.name = t.name;
  form.category = t.category;
  form.description = t.description;
  form.body = t.body;
  error.value = null;
}, { immediate: true });

const dirty = computed(() => {
  if (!active.value) return false;
  return active.value.name !== form.name
    || active.value.category !== form.category
    || active.value.description !== form.description
    || active.value.body !== form.body;
});

function selectTemplate(t: VibeTemplate) { active.value = t; }

async function newTemplate() {
  try {
    const t = await props.create({
      name: 'New template',
      category: 'custom',
      description: '',
      body: 'Describe the task here. Use placeholders like <FILE> or <PATH> for inputs.',
    });
    active.value = t;
  } catch (e: any) { error.value = e.message; }
}

async function onSave() {
  if (!active.value) return;
  busy.value = true;
  error.value = null;
  try {
    await props.update(active.value.id, { ...form });
    active.value = { ...active.value, ...form };
  } catch (e: any) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}

async function onDelete() {
  if (!active.value || active.value.builtin) return;
  if (!confirm(`Delete "${active.value.name}"?`)) return;
  busy.value = true;
  try {
    await props.remove(active.value.id);
    active.value = props.templates[0] || null;
  } catch (e: any) { error.value = e.message; }
  finally { busy.value = false; }
}

async function onDuplicate() {
  if (!active.value) return;
  busy.value = true;
  try {
    const t = await props.create({
      name: `${active.value.name} (copy)`,
      category: active.value.category,
      description: active.value.description,
      body: active.value.body,
    });
    active.value = t;
  } catch (e: any) { error.value = e.message; }
  finally { busy.value = false; }
}
</script>

<style scoped>
.tpl-bg {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.5);
  display: grid; place-items: center;
  z-index: 220; padding: 32px;
}
.tpl {
  background: var(--atlas-page-bg);
  border-radius: 14px;
  width: 100%; max-width: 1000px; max-height: 86vh;
  display: flex; flex-direction: column;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
  box-shadow: 0 30px 80px rgba(0,0,0,0.45);
  overflow: hidden;
}
.tpl__head {
  display: flex; justify-content: space-between; align-items: flex-start;
  padding: 20px 24px;
  border-bottom: 1px solid var(--atlas-hairline);
}
.tpl__eyebrow {
  font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--atlas-text-secondary);
}
.tpl__title { margin: 4px 0 0; font-size: 20px; font-weight: 600; color: var(--atlas-text-strong); }
.tpl__x { background: transparent; border: none; font-size: 16px; color: var(--atlas-text-secondary); cursor: pointer; padding: 4px 8px; }

.tpl__cols {
  display: grid;
  grid-template-columns: 260px 1fr;
  flex: 1;
  min-height: 0;
}

.tpl__list {
  border-right: 1px solid var(--atlas-hairline);
  display: flex; flex-direction: column; gap: 8px;
  padding: 14px 12px;
  overflow-y: auto;
}
.tpl__new {
  background: var(--atlas-blue);
  color: white;
  border: none;
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 600;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
  flex: none;
}
.tpl__new:hover { opacity: 0.9; }
.tpl__rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.tpl__row {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12.5px;
  color: var(--atlas-text-primary);
}
.tpl__row:hover { background: var(--atlas-card-bg); }
.tpl__row.is-active { background: rgba(94,158,255,0.10); color: var(--atlas-text-strong); font-weight: 600; }
.tpl__row-cat {
  font-size: 9.5px; letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--atlas-text-secondary); opacity: 0.7;
  font-weight: 600;
  min-width: 50px;
}
.tpl__row-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tpl__row-tag {
  font-size: 9.5px; padding: 1px 5px; border-radius: 3px;
  background: rgba(127,127,127,0.15); color: var(--atlas-text-secondary);
}

.tpl__edit {
  padding: 18px 22px;
  display: flex; flex-direction: column; gap: 12px;
  overflow-y: auto;
}
.tpl__empty {
  margin: auto; color: var(--atlas-text-secondary); font-size: 13px;
}
.tpl__field { display: flex; flex-direction: column; gap: 5px; }
.tpl__field span {
  font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--atlas-text-secondary);
}
.tpl__field input, .tpl__field textarea {
  background: var(--atlas-card-bg);
  border: 1px solid var(--atlas-hairline);
  border-radius: 8px;
  padding: 8px 10px;
  font-family: inherit;
  font-size: 13px;
  color: var(--atlas-text-primary);
  outline: none;
}
.tpl__field textarea {
  font-family: ui-monospace, Menlo, monospace;
  font-size: 12px;
  line-height: 1.5;
  resize: vertical;
}
.tpl__field input:focus, .tpl__field textarea:focus { border-color: var(--atlas-blue); }
.tpl__field input:disabled, .tpl__field textarea:disabled { opacity: 0.5; }

.tpl__row2 { display: grid; grid-template-columns: 1fr 2fr; gap: 10px; }

.tpl__hint { margin: 0; font-size: 12px; color: var(--atlas-text-secondary); }
.tpl__err  { margin: 0; font-size: 12.5px; color: var(--atlas-red, #ff453a); }

.tpl__foot { display: flex; gap: 8px; align-items: center; margin-top: 6px; }
.tpl__spacer { flex: 1; }
.tpl__btn {
  font-family: inherit; font-size: 12.5px; font-weight: 500;
  padding: 7px 14px; border-radius: 8px;
  border: 1px solid var(--atlas-hairline);
  background: transparent;
  color: var(--atlas-text-primary);
  cursor: pointer;
}
.tpl__btn:hover { background: var(--atlas-card-bg); }
.tpl__btn:disabled { opacity: 0.4; cursor: not-allowed; }
.tpl__btn--primary { background: var(--atlas-blue); border-color: var(--atlas-blue); color: white; }
.tpl__btn--primary:hover:not(:disabled) { opacity: 0.9; }
.tpl__btn--danger { color: var(--atlas-red, #ff453a); border-color: var(--atlas-red, #ff453a); }
.tpl__btn--ghost { color: var(--atlas-text-secondary); }
</style>
