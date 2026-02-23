<template>
  <Transition name="toast">
    <div
      v-if="isVisible"
      class="fixed left-1/2 transform -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-3 bg-[var(--theme-bg-secondary)] rounded-lg border font-semibold transition-all duration-300"
      :style="{
        top: `${16 + (index * 68)}px`,
        borderColor: 'var(--theme-border-primary)'
      }"
    >
      <div
        class="w-3 h-3 rounded-full"
        :style="{ backgroundColor: agentColor }"
      ></div>
      <span class="text-sm text-[var(--theme-text-primary)]">
        New Agent <span class="font-bold px-1.5 py-0.5 bg-[var(--theme-bg-tertiary)] rounded text-[var(--theme-text-primary)]">"{{ agentName }}"</span> Joined
      </span>
      <button
        @click="dismiss"
        class="ml-2 text-[var(--theme-text-tertiary)] hover:text-[var(--theme-text-primary)] transition-colors duration-200 font-bold text-lg leading-none"
        aria-label="Dismiss notification"
      >
        ×
      </button>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';

const props = defineProps<{
  agentName: string;
  agentColor: string;
  index: number;
  duration?: number;
}>();

const emit = defineEmits<{
  dismiss: [];
}>();

const isVisible = ref(false);
let dismissTimer: number | null = null;

const dismiss = () => {
  isVisible.value = false;
  if (dismissTimer !== null) {
    clearTimeout(dismissTimer);
    dismissTimer = null;
  }
  // Wait for animation to complete before emitting
  setTimeout(() => {
    emit('dismiss');
  }, 300);
};

onMounted(() => {
  // Show toast with slight delay for animation
  requestAnimationFrame(() => {
    isVisible.value = true;
  });

  // Auto-dismiss after duration (default 4s)
  const totalDuration = props.duration || 4000;
  dismissTimer = window.setTimeout(() => {
    dismiss();
  }, totalDuration);
});

onUnmounted(() => {
  if (dismissTimer !== null) {
    clearTimeout(dismissTimer);
  }
});
</script>

<style scoped>
.toast-enter-active {
  transition: all 0.3s ease-out;
}

.toast-leave-active {
  transition: all 0.3s ease-in;
}

.toast-enter-from {
  opacity: 0;
  transform: translate(-50%, -20px);
}

.toast-leave-to {
  opacity: 0;
  transform: translate(-50%, -20px);
}
</style>
