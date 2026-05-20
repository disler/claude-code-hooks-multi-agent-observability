<template>
  <button
    class="theme-toggle"
    :title="`Theme: ${mode}`"
    :aria-label="`Toggle theme — current ${mode}`"
    @click="cycle"
  >
    <svg v-if="mode === 'auto'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9"/>
      <path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor"/>
    </svg>
    <svg v-else-if="mode === 'light'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4.2"/>
      <path d="M12 3v2.4M12 18.6V21M3 12h2.4M18.6 12H21M5.6 5.6l1.7 1.7M16.7 16.7l1.7 1.7M5.6 18.4l1.7-1.7M16.7 7.3l1.7-1.7"/>
    </svg>
    <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>
    </svg>
  </button>
</template>

<script setup lang="ts">
import { useTheme } from '../../composables/useTheme';

const { mode, cycle } = useTheme();
</script>

<style scoped>
.theme-toggle {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--atlas-text-primary);
  cursor: pointer;
  border-radius: 8px;
  transition: opacity 0.15s ease;
}
.theme-toggle:hover { opacity: 0.7; }
</style>
