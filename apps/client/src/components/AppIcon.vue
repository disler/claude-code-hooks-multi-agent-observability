<template>
  <svg
    class="app-icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    v-html="path"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue';

/**
 * Cohesive Lucide-style line-icon set. Replaces the emoji iconography used
 * across the dashboard. Every glyph inherits `currentColor` so it themes
 * automatically. Look up by semantic `name`; unknown names fall back to `tool`.
 */
const ICONS: Record<string, string> = {
  // ── event types ──────────────────────────────────────────────
  'session-start': '<circle cx="12" cy="12" r="9"/><path d="M10 8l5 4-5 4z"/>',
  'prompt': '<path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z"/>',
  'pre-tool': '<circle cx="12" cy="12" r="9"/><path d="M7.5 12h6"/><path d="M11.5 9l3 3-3 3"/>',
  'post-tool': '<circle cx="12" cy="12" r="9"/><path d="M8.2 12.4l2.4 2.4 4.6-5.2"/>',
  'notification': '<path d="M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7z"/><path d="M10.5 21a1.7 1.7 0 0 0 3 0"/>',
  'stop': '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  'subagent-stop': '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M10 14l4-4"/>',
  'pre-compact': '<path d="M4 9h16M4 15h16"/><path d="M9 4l3 3 3-3M9 20l3-3 3 3"/>',

  // ── tools ────────────────────────────────────────────────────
  'bash': '<path d="M4 6l5 5-5 5"/><path d="M12 17h8"/>',
  'edit': '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  'read': '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  'write': '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>',
  'task': '<path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>',
  'web-fetch': '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z"/>',
  'grep': '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  'glob': '<path d="M15 2H7a2 2 0 0 0-2 2v2"/><rect x="8" y="7" width="12" height="14" rx="2"/>',
  'mcp': '<path d="M9 2v6M15 2v6"/><path d="M7 8h10v3a5 5 0 0 1-10 0z"/><path d="M12 16v6"/>',
  'tool': '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.3 2.3-2-2 2.3-2.3z"/>',

  // ── ui actions / status ──────────────────────────────────────
  'filter': '<path d="M3 5h18l-7 8v6l-4-2v-4z"/>',
  'theme': '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  'trash': '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
  'copy': '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
  'search': '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  'x': '<path d="M6 6l12 12M18 6L6 18"/>',
  'check': '<path d="M5 12.5l4.5 4.5L19 7"/>',
  'chevron-right': '<path d="M9 6l6 6-6 6"/>',
  'chevron-down': '<path d="M6 9l6 6 6-6"/>',
  'pin': '<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/>',
  'alert': '<path d="M12 3l9 16H3z"/><path d="M12 10v4"/><path d="M12 17h.01"/>',
  'bell': '<path d="M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7z"/><path d="M10.5 21a1.7 1.7 0 0 0 3 0"/>',
  'dot': '<circle cx="12" cy="12" r="4"/>',
  'activity': '<path d="M3 12h4l2 6 4-14 2 8h6"/>',
  'zap': '<path d="M14 3l-9 11h6l-1 7 9-11h-6z"/>',
  'clock': '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2"/><path d="M9 2h6"/>',
  'users': '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><path d="M16 6.2a3.2 3.2 0 0 1 0 6M18 19a5.5 5.5 0 0 0-3.2-5"/>',
};

const props = withDefaults(defineProps<{
  name: string;
  size?: number | string;
  strokeWidth?: number | string;
}>(), {
  size: 16,
  strokeWidth: 1.6,
});

const path = computed(() => ICONS[props.name] ?? ICONS.tool);
</script>

<style scoped>
.app-icon { display: inline-block; flex: none; vertical-align: middle; }
</style>
