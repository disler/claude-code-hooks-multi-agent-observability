<template>
  <div class="briefs-panel">
    <header class="briefs-panel__head">
      <div class="briefs-panel__filters">
        <button
          v-for="topic in topics"
          :key="topic"
          class="atb-pill"
          :class="{ 'is-on': activeTopic === topic }"
          @click="activeTopic = topic"
        >{{ topic === 'all' ? 'All' : capitalize(topic) }}</button>
      </div>
      <input
        type="text"
        v-model="search"
        placeholder="Search briefs"
        class="briefs-panel__search"
      />
    </header>

    <div class="briefs-panel__body">
      <ul v-if="filtered.length" class="briefs-list">
        <li
          v-for="b in filtered"
          :key="b.path"
          class="briefs-list__row"
          @click="$emit('open-brief', b)"
        >
          <div class="briefs-list__meta">
            <span class="briefs-list__date">{{ b.date }}</span>
            <span class="briefs-list__topic">{{ b.topic }}</span>
          </div>
          <div class="briefs-list__title">{{ b.title }}</div>
          <div v-if="b.tldr" class="briefs-list__tldr">{{ b.tldr }}</div>
        </li>
      </ul>
      <div v-else-if="loading" class="briefs-empty">Loading briefs…</div>
      <div v-else class="briefs-empty">No briefs match.</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { API_BASE_URL } from '../config';

defineEmits<{ (e: 'open-brief', brief: any): void }>();

const briefs = ref<any[]>([]);
const loading = ref(false);
const search = ref('');
const activeTopic = ref<string>('all');

const topics = computed(() => {
  const set = new Set<string>(['all']);
  briefs.value.forEach(b => set.add(b.topic));
  return Array.from(set);
});

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  return briefs.value.filter(b => {
    if (activeTopic.value !== 'all' && b.topic !== activeTopic.value) return false;
    if (q && !(`${b.title} ${b.tldr}`.toLowerCase().includes(q))) return false;
    return true;
  });
});

function capitalize(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }

onMounted(async () => {
  loading.value = true;
  try {
    const res = await fetch(`${API_BASE_URL}/api/atlas/briefs`);
    if (res.ok) {
      const data = await res.json();
      briefs.value = data.briefs || [];
    }
  } catch (err) {
    console.error('[briefs] load failed', err);
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.briefs-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif;
}

.briefs-panel__head {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 12px;
  background: var(--theme-bg-primary);
  border-bottom: 1px solid var(--theme-border-primary);
}

.briefs-panel__filters { display: flex; flex-wrap: wrap; gap: 4px; }
.atb-pill {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 10px;
  font-size: 11px;
  font-weight: 500;
  color: var(--theme-text-secondary);
  background: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border-primary);
  border-radius: 999px;
  cursor: pointer;
  font-family: inherit;
}
.atb-pill:hover { background: var(--theme-bg-tertiary); color: var(--theme-text-primary); }
.atb-pill.is-on {
  background: var(--theme-primary-light);
  color: var(--theme-primary);
  border-color: rgba(10,132,255,0.35);
}

.briefs-panel__search {
  width: 100%;
  padding: 5px 10px;
  font-size: 11.5px;
  font-family: inherit;
  font-weight: 400;
  color: var(--theme-text-primary);
  background: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border-primary);
  border-radius: 6px;
  outline: none;
}
.briefs-panel__search:focus {
  border-color: var(--theme-primary);
  box-shadow: 0 0 0 3px var(--theme-primary-light);
}

.briefs-panel__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  background: var(--theme-bg-primary);
}

.briefs-list { margin: 0; padding: 0; list-style: none; }
.briefs-list__row {
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-rows: auto auto auto;
  align-items: baseline;
  row-gap: 1px;
  column-gap: 8px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--theme-border-primary);
  cursor: pointer;
  transition: background-color 0.12s ease;
}
.briefs-list__row:hover { background: var(--theme-hover-bg); }
.briefs-list__meta {
  grid-column: 1 / -1;
  display: flex;
  gap: 6px;
  font-size: 10px;
  color: var(--theme-text-tertiary);
}
.briefs-list__date {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  font-variant-numeric: tabular-nums;
}
.briefs-list__topic {
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 500;
}
.briefs-list__title {
  grid-column: 1 / -1;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--theme-text-primary);
  letter-spacing: -0.005em;
  line-height: 1.3;
}
.briefs-list__tldr {
  grid-column: 1 / -1;
  font-size: 11px;
  font-weight: 400;
  color: var(--theme-text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  line-height: 1.35;
}

.briefs-empty {
  padding: 20px 14px;
  font-size: 12px;
  color: var(--theme-text-tertiary);
}
</style>
