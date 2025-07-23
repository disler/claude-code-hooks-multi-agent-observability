<template>
  <button
    @click="$emit('toggle')"
    class="fixed bottom-4 right-4 mobile:bottom-3 mobile:right-3 p-3 mobile:p-2.5 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 min-w-[40px] min-h-[40px] flex items-center justify-center border-2 transform hover:scale-110"
    :class="[
      stickToBottom 
        ? 'bg-gradient-to-r from-[var(--theme-primary)] to-[var(--theme-primary-light)] text-white border-[var(--theme-primary-dark)] drop-shadow-md' 
        : 'bg-[var(--theme-bg-primary)] hover:bg-[var(--theme-bg-secondary)] text-[var(--theme-text-primary)] border-[var(--theme-border-primary)] hover:border-[var(--theme-primary)]'
    ]"
    :title="stickToBottom ? 'Disable auto-scroll' : 'Enable auto-scroll'"
  >
    <svg
      class="w-5 h-5 mobile:w-4 mobile:h-4 drop-shadow-sm"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        v-if="stickToBottom"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M19 14l-7 7m0 0l-7-7m7 7V3"
      />
      <path
        v-else
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6v.01"
      />
    </svg>
  </button>
</template>

<script setup lang="ts">
defineProps<{
  stickToBottom: boolean;
}>();

defineEmits<{
  toggle: [];
}>();
</script>