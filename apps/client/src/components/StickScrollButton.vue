<template>
  <button
    class="stick-fab"
    :class="{ on: stickToBottom }"
    @click="$emit('toggle')"
    :aria-pressed="stickToBottom"
    :title="stickToBottom ? 'Disable auto-scroll' : 'Enable auto-scroll'"
  >
    <AppIcon :name="stickToBottom ? 'pin' : 'chevron-down'" :size="18" />
  </button>
</template>

<script setup lang="ts">
import AppIcon from './AppIcon.vue';

defineProps<{
  stickToBottom: boolean;
}>();

defineEmits<{
  toggle: [];
}>();
</script>

<style scoped>
.stick-fab {
  position: fixed;
  bottom: var(--space-6);
  right: var(--space-6);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  min-width: 44px;
  min-height: 44px;
  border: 1px solid var(--hair);
  border-radius: var(--radius-full);
  background: var(--surface-raised);
  color: var(--text-muted);
  box-shadow: var(--elevation-2);
  cursor: pointer;
  z-index: 50;
  transition: color var(--motion-fast) var(--ease-out),
    background var(--motion-fast) var(--ease-out),
    border-color var(--motion-fast) var(--ease-out);
}
.stick-fab:hover { color: var(--text-strong); border-color: var(--hair-strong); }
.stick-fab.on {
  background: var(--theme-primary);
  border-color: var(--theme-primary);
  color: #fff;
}
.stick-fab.on:hover { background: var(--theme-primary); border-color: var(--theme-primary); }

@media (max-width: 699px) {
  .stick-fab { bottom: var(--space-4); right: var(--space-4); }
}
</style>
