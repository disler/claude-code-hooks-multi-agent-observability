<template>
  <div class="mem-bg" @click.self="$emit('close')">
    <div class="mem">
      <header class="mem__head">
        <div>
          <span class="mem__eyebrow">{{ project.name }} · CLAUDE.md</span>
          <h3 class="mem__title">Project memory</h3>
        </div>
        <button class="mem__x" @click="$emit('close')">✕</button>
      </header>

      <p class="mem__hint">
        Auto-appended to every Claude spawn's system prompt for this project. Add conventions, paths, gotchas, style notes — the things you'd otherwise re-type per task.
      </p>

      <textarea
        v-model="body"
        class="mem__ta"
        rows="18"
        placeholder="# Conventions&#10;- Use SwiftUI, no UIKit&#10;- All views in MarginUI module&#10;- Hairline borders, 12pt radii&#10;&#10;# Paths&#10;- Cards: Packages/MarginUI/Sources/MarginUI/Cards/&#10;- Outline: ..."></textarea>

      <p v-if="error" class="mem__err">{{ error }}</p>

      <footer class="mem__foot">
        <span class="mem__bytes">{{ body.length }} chars</span>
        <button class="mem__btn mem__btn--ghost" @click="$emit('close')">Cancel</button>
        <button class="mem__btn mem__btn--primary" :disabled="saving" @click="onSave">
          {{ saving ? 'Saving…' : 'Save' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import type { WSProject } from '../../composables/useWorkspace';

const props = defineProps<{ project: WSProject; load: () => Promise<string>; save: (body: string) => Promise<void> }>();
const emit = defineEmits<{ (e: 'close'): void; (e: 'saved'): void }>();

const body = ref('');
const saving = ref(false);
const error = ref<string | null>(null);

onMounted(async () => {
  try { body.value = await props.load(); } catch (e: any) { error.value = e.message; }
});

async function onSave() {
  saving.value = true;
  error.value = null;
  try {
    await props.save(body.value);
    emit('saved');
    emit('close');
  } catch (e: any) {
    error.value = e.message;
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.mem-bg {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.5);
  display: grid; place-items: center;
  z-index: 210; padding: 40px;
}
.mem {
  background: var(--atlas-page-bg);
  border-radius: 14px;
  padding: 24px;
  width: 100%; max-width: 720px;
  display: flex; flex-direction: column; gap: 14px;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
  box-shadow: 0 30px 80px rgba(0,0,0,0.45);
}
.mem__head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.mem__eyebrow {
  font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--atlas-text-secondary);
}
.mem__title { margin: 4px 0 0; font-size: 20px; font-weight: 600; color: var(--atlas-text-strong); }
.mem__x { background: transparent; border: none; font-size: 16px; color: var(--atlas-text-secondary); cursor: pointer; padding: 4px 8px; }
.mem__hint { margin: 0; font-size: 12.5px; color: var(--atlas-text-secondary); line-height: 1.5; }
.mem__ta {
  background: var(--atlas-card-bg);
  border: 1px solid var(--atlas-hairline);
  border-radius: 8px;
  padding: 12px;
  font-family: ui-monospace, Menlo, monospace;
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--atlas-text-primary);
  outline: none;
  resize: vertical;
  min-height: 280px;
}
.mem__ta:focus { border-color: var(--atlas-blue); }
.mem__err { margin: 0; font-size: 13px; color: var(--atlas-red, #ff453a); }
.mem__foot {
  display: flex; align-items: center; gap: 10px; margin-top: 4px;
}
.mem__bytes {
  font-family: ui-monospace, Menlo, monospace;
  font-size: 11.5px; color: var(--atlas-text-secondary);
  opacity: 0.7; margin-right: auto;
}
.mem__btn {
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
.mem__btn:hover { background: var(--atlas-card-bg); }
.mem__btn--primary { background: var(--atlas-blue); border-color: var(--atlas-blue); color: white; }
.mem__btn--primary:disabled { opacity: 0.4; cursor: not-allowed; }
.mem__btn--ghost { color: var(--atlas-text-secondary); }

@media (max-width: 600px) {
  .mem-bg { padding: 0; align-items: stretch; place-items: stretch; }
  .mem {
    border-radius: 0;
    padding: max(16px, env(safe-area-inset-top)) 16px calc(16px + env(safe-area-inset-bottom));
    max-width: none;
    min-height: 100vh;
  }
  .mem__title { font-size: 19px; }
  .mem__x { font-size: 22px; padding: 8px 12px; min-width: 44px; min-height: 44px; }
  .mem__ta { font-size: 16px; min-height: 50vh; }
  .mem__foot { flex-wrap: wrap; gap: 8px; }
  .mem__bytes { flex: 1 1 100%; margin-right: 0; }
  .mem__btn { flex: 1 1 45%; padding: 12px 16px; font-size: 14px; min-height: 44px; }
}
</style>
