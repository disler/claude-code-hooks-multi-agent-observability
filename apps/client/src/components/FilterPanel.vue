<template>
  <div class="fp">
    <span class="fp-cap"><AppIcon name="filter" :size="13" />Filters</span>

    <div class="fp-controls">
      <div class="field">
        <label class="field-cap" for="fp-source">Source</label>
        <div class="select-wrap">
          <select
            id="fp-source"
            v-model="localFilters.sourceApp"
            @change="updateFilters"
            class="select"
          >
            <option value="">All sources</option>
            <option v-for="app in filterOptions.source_apps" :key="app" :value="app">
              {{ app }}
            </option>
          </select>
          <AppIcon name="chevron-down" :size="14" class="select-chevron" />
        </div>
      </div>

      <div class="field">
        <label class="field-cap" for="fp-session">Session</label>
        <div class="select-wrap">
          <select
            id="fp-session"
            v-model="localFilters.sessionId"
            @change="updateFilters"
            class="select mono"
          >
            <option value="">All sessions</option>
            <option v-for="session in filterOptions.session_ids" :key="session" :value="session">
              {{ session.slice(0, 8) }}…
            </option>
          </select>
          <AppIcon name="chevron-down" :size="14" class="select-chevron" />
        </div>
      </div>

      <div class="field">
        <label class="field-cap" for="fp-type">Event type</label>
        <div class="select-wrap">
          <select
            id="fp-type"
            v-model="localFilters.eventType"
            @change="updateFilters"
            class="select"
          >
            <option value="">All types</option>
            <option v-for="type in filterOptions.hook_event_types" :key="type" :value="type">
              {{ type }}
            </option>
          </select>
          <AppIcon name="chevron-down" :size="14" class="select-chevron" />
        </div>
      </div>

      <button
        v-if="hasActiveFilters"
        @click="clearFilters"
        class="clear-btn"
      >
        <AppIcon name="x" :size="13" /><span>Clear</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import type { FilterOptions } from '../types';
import { API_BASE_URL } from '../config';
import AppIcon from './AppIcon.vue';

const props = defineProps<{
  filters: {
    sourceApp: string;
    sessionId: string;
    eventType: string;
  };
}>();

const emit = defineEmits<{
  'update:filters': [filters: typeof props.filters];
}>();

const filterOptions = ref<FilterOptions>({
  source_apps: [],
  session_ids: [],
  hook_event_types: []
});

const localFilters = ref({ ...props.filters });

const hasActiveFilters = computed(() => {
  return localFilters.value.sourceApp || localFilters.value.sessionId || localFilters.value.eventType;
});

const updateFilters = () => {
  emit('update:filters', { ...localFilters.value });
};

const clearFilters = () => {
  localFilters.value = {
    sourceApp: '',
    sessionId: '',
    eventType: ''
  };
  updateFilters();
};

const fetchFilterOptions = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/events/filter-options`);
    if (response.ok) {
      filterOptions.value = await response.json();
    }
  } catch (error) {
    console.error('Failed to fetch filter options:', error);
  }
};

onMounted(() => {
  fetchFilterOptions();
  // Refresh filter options periodically
  setInterval(fetchFilterOptions, 10000);
});
</script>

<style scoped>
/* ───────── footer filter toolbar ───────── */
.fp {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: 9px var(--space-4);
  background: var(--surface);
  font-family: var(--font-sans);
}

.fp-cap {
  display: inline-flex; align-items: center; gap: 6px;
  flex: none;
  font-size: var(--text-2xs); font-weight: var(--weight-semibold);
  letter-spacing: var(--tracking-caps); text-transform: uppercase;
  color: var(--text-faint);
}
.fp-cap :deep(.app-icon) { color: var(--text-ghost); }

.fp-controls {
  display: flex; align-items: flex-end; flex-wrap: wrap;
  gap: var(--space-3);
  flex: 1; min-width: 0;
}

/* ───────── field (label + control) ───────── */
.field { display: flex; flex-direction: column; gap: 5px; min-width: 0; flex: 1; }
.field-cap {
  font-size: var(--text-2xs); font-weight: var(--weight-semibold);
  letter-spacing: var(--tracking-caps); text-transform: uppercase;
  color: var(--text-faint);
}

/* ───────── custom select ───────── */
.select-wrap { position: relative; display: flex; align-items: center; }
.select {
  -webkit-appearance: none;
  -moz-appearance: none;
  appearance: none;
  width: 100%;
  padding: 7px 30px 7px 11px;
  border: 1px solid var(--hair);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text-strong);
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  cursor: pointer;
  transition: border-color var(--motion-fast) var(--ease-out), background var(--motion-fast) var(--ease-out);
}
.select.mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
.select:hover { border-color: var(--hair-strong); }
.select:focus {
  outline: none;
  border-color: var(--theme-primary);
}
.select option {
  background: var(--surface);
  color: var(--text-strong);
}
.select-chevron {
  position: absolute; right: 9px;
  color: var(--text-faint);
  pointer-events: none;
  transition: color var(--motion-fast) var(--ease-out);
}
.select-wrap:hover .select-chevron { color: var(--text-muted); }

/* ───────── clear (ghost) button ───────── */
.clear-btn {
  display: inline-flex; align-items: center; gap: 5px;
  flex: none;
  padding: 7px 12px;
  border: 1px solid var(--hair);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-family: var(--font-sans); font-size: var(--text-xs); font-weight: var(--weight-medium);
  transition: color var(--motion-fast) var(--ease-out), border-color var(--motion-fast) var(--ease-out), background var(--motion-fast) var(--ease-out);
}
.clear-btn:hover { color: var(--theme-primary); border-color: var(--primary-line); background: var(--primary-soft); }

/* ───────── responsive ───────── */
@media (max-width: 699px) {
  .fp { flex-direction: column; align-items: stretch; gap: var(--space-3); }
  .fp-cap { align-self: flex-start; }
  .fp-controls { flex-direction: column; align-items: stretch; gap: var(--space-3); }
  .field { width: 100%; }
  .clear-btn { width: 100%; justify-content: center; padding: 9px 12px; }
}
</style>