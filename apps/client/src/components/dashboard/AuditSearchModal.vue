<template>
  <div class="modal-backdrop" @click.self="$emit('close')">
    <div class="modal">
      <header class="modal__bar">
        <h2 class="modal__title">Audit search</h2>
        <button class="modal__close" @click="$emit('close')">×</button>
      </header>
      <form class="filters" @submit.prevent="run">
        <input v-model="filter.q" type="text" placeholder="free text (summary/target)" class="f__input" />
        <select v-model="filter.division" class="f__sel">
          <option value="">all divisions</option>
          <option value="atlas-meta">atlas-meta</option>
          <option value="margin">margin</option>
          <option value="industry">industry</option>
        </select>
        <select v-model="filter.outcome" class="f__sel">
          <option value="">any outcome</option>
          <option value="executed">executed</option>
          <option value="queued">queued</option>
          <option value="blocked">blocked</option>
          <option value="rejected">rejected</option>
          <option value="approved">approved</option>
        </select>
        <input v-model="filter.agent" type="text" placeholder="agent" class="f__input f__input--narrow" />
        <button class="f__run" :disabled="loading">{{ loading ? 'Searching…' : 'Search' }}</button>
      </form>
      <div class="modal__body">
        <p v-if="!entries.length && !loading" class="modal__empty">No matches.</p>
        <ul v-else class="results">
          <li v-for="e in entries" :key="e.id || e.ts" :class="`result result--${e.outcome}`">
            <div class="result__head">
              <span class="result__time">{{ formatTs(e.ts) }}</span>
              <span class="result__division">{{ e.division }}</span>
              <span class="result__agent">@{{ e.agent }}</span>
              <span class="result__outcome">{{ e.outcome }}</span>
            </div>
            <div class="result__action">{{ e.action }}</div>
            <div class="result__summary">{{ e.summary }}</div>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { searchAudit } from '../../composables/useAtlasViews';

defineEmits<{ (e: 'close'): void }>();

const filter = ref({
  q: '',
  division: '',
  agent: '',
  outcome: '',
  limit: 200,
});
const entries = ref<any[]>([]);
const loading = ref(false);

async function run() {
  loading.value = true;
  entries.value = await searchAudit(filter.value);
  loading.value = false;
}
function formatTs(iso?: string) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}
// initial load
run();
</script>

<style scoped>
.modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 90; padding: 16px; }
.modal { background: var(--atlas-page-bg); color: var(--atlas-text-primary); border-radius: 16px; width: min(900px, 100%); max-height: 85vh; display: flex; flex-direction: column; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif; }
.modal__bar { display: flex; align-items: center; padding: 16px 20px; border-bottom: 1px solid var(--atlas-hairline); }
.modal__title { margin: 0; font-size: 18px; font-weight: 600; }
.modal__close { margin-left: auto; background: transparent; border: 0; font-size: 24px; line-height: 1; color: var(--atlas-text-secondary); cursor: pointer; padding: 0 6px; }

.filters { display: grid; grid-template-columns: 1fr 140px 140px 100px auto; gap: 8px; padding: 12px 20px; border-bottom: 1px solid var(--atlas-hairline); }
@media (max-width: 720px) { .filters { grid-template-columns: 1fr 1fr; } }
.f__input, .f__sel {
  height: 32px; padding: 0 10px; min-width: 0;
  border: 1px solid var(--atlas-hairline); border-radius: 8px;
  background: var(--atlas-card-bg-2, #FFF); color: var(--atlas-text-primary);
  font-size: 13px; outline: none; font-family: inherit;
}
.f__run { height: 32px; padding: 0 14px; background: var(--atlas-blue); color: #FFF; border: 0; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
.f__run:disabled { opacity: 0.5; }

.modal__body { padding: 12px 20px 20px; overflow-y: auto; }
.modal__empty { font-size: 14px; color: var(--atlas-text-secondary); margin-top: 16px; }
.results { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.result { padding: 10px 12px; background: var(--atlas-card-bg); border-radius: 8px; font-size: 13px; }
.result__head { display: flex; gap: 10px; font-size: 11.5px; color: var(--atlas-text-secondary); margin-bottom: 4px; }
.result__time { font-family: ui-monospace, Menlo, monospace; }
.result__division { font-weight: 500; color: var(--atlas-text-primary); }
.result__agent { font-family: ui-monospace, Menlo, monospace; }
.result__outcome { margin-left: auto; font-family: ui-monospace, Menlo, monospace; }
.result__action { font-family: ui-monospace, Menlo, monospace; font-size: 12.5px; color: var(--atlas-text-primary); margin-bottom: 2px; }
.result__summary { font-size: 12.5px; color: var(--atlas-text-primary); opacity: 0.85; line-height: 1.45; }

.result--blocked .result__outcome { color: var(--atlas-red); }
.result--queued .result__outcome  { color: var(--atlas-yellow); }
.result--executed .result__outcome { color: var(--atlas-green); }
.result--rejected .result__outcome { color: var(--atlas-text-secondary); }
</style>
