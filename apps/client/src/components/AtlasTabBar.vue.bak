<template>
  <nav class="atlas-tabbar" aria-label="Atlas views">
    <button
      v-for="tab in tabs"
      :key="tab.id"
      class="atlas-tabbar__tab"
      :class="{ 'is-active': modelValue === tab.id }"
      @click="$emit('update:modelValue', tab.id)"
      :aria-pressed="modelValue === tab.id"
    >{{ tab.label }}</button>
  </nav>
</template>

<script setup lang="ts">
defineProps<{ modelValue: string }>();
defineEmits<{ (e: 'update:modelValue', v: string): void }>();

const tabs = [
  { id: 'today',    label: 'Today' },
  { id: 'activity', label: 'Activity' },
  { id: 'briefs',   label: 'Briefs' },
  { id: 'talk',     label: 'Talk' },
];
</script>

<style scoped>
.atlas-tabbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 14px;
  background: var(--theme-bg-primary);
  border-bottom: 1px solid var(--theme-border-primary);
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif;
}

.atlas-tabbar__tab {
  position: relative;
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 400;
  color: var(--theme-text-tertiary);
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: color 0.12s ease, background-color 0.12s ease;
  font-family: inherit;
}
.atlas-tabbar__tab:hover { color: var(--theme-text-primary); background: var(--theme-hover-bg); }
.atlas-tabbar__tab.is-active {
  color: var(--theme-text-primary);
  font-weight: 600;
}
.atlas-tabbar__tab.is-active::after {
  content: '';
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: -7px;
  height: 1.5px;
  background: var(--theme-primary);
  border-radius: 1px;
}

/* Mobile: bottom tab bar */
@media (max-width: 699px) {
  .atlas-tabbar {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 40;
    justify-content: space-around;
    padding: 6px 8px calc(6px + env(safe-area-inset-bottom));
    border-top: 1px solid var(--theme-border-primary);
    border-bottom: none;
    background: var(--theme-bg-primary);
  }
  .atlas-tabbar__tab {
    flex: 1;
    padding: 10px 6px;
    text-align: center;
  }
  .atlas-tabbar__tab.is-active::after {
    left: 50%;
    right: auto;
    bottom: 2px;
    width: 24px;
    transform: translateX(-50%);
  }
}
</style>
