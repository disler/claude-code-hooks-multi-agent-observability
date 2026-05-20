<template>
  <!-- Brand mark for an LLM family. Stylized — recognizable but not pixel-
       perfect reproductions, to avoid trademark drift. -->
  <span class="logo" :class="`logo--${family}`" :style="{ width: size + 'px', height: size + 'px' }" :title="title">
    <!-- Auto -->
    <svg v-if="family === 'auto'" :width="size" :height="size" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="15" fill="#5B6CFF"/>
      <path d="M17 7 L10 17.5 L14 17.5 L13 25 L22 14 L18 14 Z"
            fill="#FFFFFF"/>
    </svg>

    <!-- Anthropic (Claude family: opus / sonnet / haiku) -->
    <svg v-else-if="family === 'anthropic'" :width="size" :height="size" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="6" fill="#D97757"/>
      <!-- Stylized "A" — two angled strokes + horizontal bar -->
      <path d="M10.5 23 L16 8 L21.5 23 M13.2 19 L18.8 19"
            stroke="#181210" stroke-width="2.4"
            fill="none" stroke-linecap="butt" stroke-linejoin="miter"/>
    </svg>

    <!-- OpenAI (gpt-5 / gpt-5-mini) -->
    <svg v-else-if="family === 'openai'" :width="size" :height="size" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="6" fill="#0D0D0D"/>
      <!-- Simplified 6-fold knot/flower mark -->
      <g stroke="#10A37F" stroke-width="2.2" stroke-linecap="round" fill="none">
        <path d="M16 6 L16 26"/>
        <path d="M7.5 11 L24.5 21"/>
        <path d="M7.5 21 L24.5 11"/>
      </g>
      <circle cx="16" cy="16" r="2.4" fill="#10A37F"/>
    </svg>

    <!-- Google / Gemma -->
    <svg v-else-if="family === 'ollama'" :width="size" :height="size" viewBox="0 0 32 32" aria-hidden="true">
      <!-- Gem-shaped polygon in Google-ish blue. Gemma = Google's small model. -->
      <polygon points="16,3 28,11 24,27 8,27 4,11" fill="#1A73E8"/>
      <polygon points="16,3 28,11 16,16" fill="#4285F4"/>
      <polygon points="4,11 16,16 8,27" fill="#0B4FA8"/>
      <polygon points="16,16 24,27 8,27" fill="#1A73E8"/>
    </svg>

    <!-- Fallback -->
    <svg v-else :width="size" :height="size" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="14" fill="var(--atlas-text-secondary)"/>
    </svg>
  </span>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  family: 'auto' | 'anthropic' | 'openai' | 'ollama';
  size?: number;
  title?: string;
}>(), { size: 22, title: '' });
</script>

<style scoped>
.logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  overflow: hidden;
  flex: none;
  line-height: 0;
}
.logo svg { display: block; }
</style>
