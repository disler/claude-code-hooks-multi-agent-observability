<template>
  <article class="card tabbed">
    <header class="tabbed__head">
      <span class="card-eyebrow">{{ title }}</span>
      <nav class="tabbed__tabs" role="tablist">
        <button
          v-for="t in tabs"
          :key="t.id"
          class="tabbed__tab"
          :class="{ 'is-active': modelValue === t.id }"
          :title="t.title || t.label"
          @click="$emit('update:modelValue', t.id)"
        >
          <span v-if="t.dot" class="tabbed__tab-dot" :class="t.dotClass" />
          {{ t.label }}<span v-if="t.count != null" class="tabbed__tab-count">{{ t.count }}</span>
        </button>
      </nav>
    </header>
    <div class="tabbed__body">
      <slot :tab="modelValue" />
    </div>
  </article>
</template>

<script setup lang="ts">
defineProps<{
  title: string;
  modelValue: string;
  tabs: Array<{ id: string; label: string; title?: string; count?: number | null; dot?: boolean; dotClass?: string }>;
}>();
defineEmits<{ (e: 'update:modelValue', v: string): void }>();
</script>

<style scoped>
.card {
  background: var(--atlas-card-bg);
  border-radius: 20px;
  padding: 20px 24px 22px;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
  display: flex; flex-direction: column; gap: 12px;
}
@media (max-width: 1023px) { .card { padding: 18px 20px; } }

.tabbed__head { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.card-eyebrow {
  font-size: 12px; font-weight: 500; letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--atlas-text-secondary);
  flex: none;
}

.tabbed__tabs {
  display: flex;
  gap: 4px;
  margin-left: auto;
  border-bottom: 0;
  flex-wrap: wrap;
}
.tabbed__tab {
  background: transparent;
  border: 0;
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--atlas-text-secondary);
  padding: 6px 12px;
  border-radius: 7px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: background-color 100ms ease, color 100ms ease;
}
.tabbed__tab:hover:not(.is-active) { background: rgba(0,0,0,0.04); color: var(--atlas-text-primary); }
.tabbed__tab.is-active { background: var(--atlas-blue-soft); color: var(--atlas-blue); }
.tabbed__tab-count {
  font-variant-numeric: tabular-nums;
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--atlas-card-bg-2, rgba(0,0,0,0.06));
  color: var(--atlas-text-secondary);
}
.tabbed__tab.is-active .tabbed__tab-count { background: var(--atlas-blue); color: #FFF; }
.tabbed__tab-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--atlas-text-muted); }
.tabbed__tab-dot.is-red    { background: var(--atlas-red); }
.tabbed__tab-dot.is-yellow { background: var(--atlas-yellow); }
.tabbed__tab-dot.is-green  { background: var(--atlas-green); }

.tabbed__body { display: flex; flex-direction: column; gap: 10px; }
</style>
