<template>
  <div class="atlas-filter">
    <div class="atlas-filter__row">
      <div class="atlas-filter__field">
        <label>Source app</label>
        <select v-model="localFilters.sourceApp" @change="updateFilters">
          <option value="">All</option>
          <option v-for="app in filterOptions.source_apps" :key="app" :value="app">{{ app }}</option>
        </select>
      </div>

      <div class="atlas-filter__field">
        <label>Session</label>
        <select v-model="localFilters.sessionId" @change="updateFilters">
          <option value="">All</option>
          <option v-for="session in filterOptions.session_ids" :key="session" :value="session">{{ session.slice(0, 8) }}…</option>
        </select>
      </div>

      <div class="atlas-filter__field">
        <label>Event type</label>
        <select v-model="localFilters.eventType" @change="updateFilters">
          <option value="">All</option>
          <option v-for="type in filterOptions.hook_event_types" :key="type" :value="type">{{ type }}</option>
        </select>
      </div>

      <button v-if="hasActiveFilters" @click="clearFilters" class="atlas-filter__clear">Clear</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import type { FilterOptions } from '../types';
import { API_BASE_URL } from '../config';

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
.atlas-filter {
  background: var(--theme-bg-primary);
  border-bottom: 1px solid var(--theme-border-primary);
  padding: 12px 20px;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif;
}
@media (max-width: 699px) {
  .atlas-filter { padding: 10px 12px; }
}

.atlas-filter__row {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 12px;
}
@media (max-width: 699px) {
  .atlas-filter__row { gap: 8px; }
}

.atlas-filter__field {
  flex: 1 1 180px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.atlas-filter__field label {
  font-size: 11px;
  font-weight: 500;
  color: var(--theme-text-tertiary);
  letter-spacing: 0.02em;
}
.atlas-filter__field select {
  width: 100%;
  padding: 6px 28px 6px 10px;
  font-size: 12px;
  font-family: inherit;
  color: var(--theme-text-primary);
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border-primary);
  border-radius: 6px;
  appearance: none;
  -webkit-appearance: none;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10' fill='none' stroke='%236E6E73' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'><path d='m2 4 3 3 3-3'/></svg>");
  background-repeat: no-repeat;
  background-position: right 8px center;
  cursor: pointer;
  outline: none;
  transition: border-color 0.12s ease, background-color 0.12s ease;
}
.atlas-filter__field select:hover { border-color: var(--theme-border-secondary); }
.atlas-filter__field select:focus {
  border-color: var(--theme-primary);
  box-shadow: 0 0 0 3px var(--theme-primary-light);
}

.atlas-filter__clear {
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 500;
  color: var(--theme-text-secondary);
  background: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border-primary);
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.12s ease, color 0.12s ease;
}
.atlas-filter__clear:hover { background: var(--theme-hover-bg); color: var(--theme-text-primary); }
</style>