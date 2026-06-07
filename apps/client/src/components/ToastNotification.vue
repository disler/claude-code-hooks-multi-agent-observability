<template>
  <Transition name="toast">
    <div
      v-if="isVisible"
      class="toast"
      role="status"
      aria-live="polite"
      :style="{
        '--toast-c': agentColor,
        top: `${16 + index * 56}px`,
      }"
    >
      <span class="spine" aria-hidden="true"></span>
      <span class="swatch" aria-hidden="true"></span>
      <span class="msg">
        <span class="caption">New agent</span>
        <span class="aname mono">{{ agentName }}</span>
        <span class="caption">joined</span>
      </span>
      <button
        class="dismiss"
        @click="dismiss"
        aria-label="Dismiss notification"
      >
        <AppIcon name="x" :size="14" />
      </button>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import AppIcon from './AppIcon.vue';

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
.toast {
  position: fixed;
  right: 16px;
  z-index: 50;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 40px;
  padding: 8px 10px 8px 16px;
  background: var(--surface-raised);
  border: 1px solid var(--hair);
  border-radius: var(--radius-md);
  box-shadow: var(--elevation-2);
  overflow: hidden;
  transition: top var(--motion-base) var(--ease-out);
}

.spine {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--toast-c, var(--theme-primary));
}

.swatch {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: var(--radius-full);
  background: var(--toast-c, var(--theme-primary));
}

.msg {
  display: flex;
  align-items: baseline;
  gap: 6px;
  white-space: nowrap;
  font-size: var(--text-sm);
}
.caption {
  color: var(--text-faint);
  font-weight: var(--weight-medium);
}
.aname {
  color: var(--text-strong);
  font-size: var(--text-body);
  font-weight: var(--weight-semibold);
  font-variant-numeric: tabular-nums;
}

.dismiss {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 24px;
  height: 24px;
  margin-left: var(--space-1);
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-faint);
  cursor: pointer;
  transition: color var(--motion-fast) var(--ease-out),
    border-color var(--motion-fast) var(--ease-out),
    background var(--motion-fast) var(--ease-out);
}
.dismiss:hover {
  color: var(--text-strong);
  border-color: var(--hair);
  background: var(--surface-hover);
}
.dismiss:focus-visible {
  outline: none;
  border-color: var(--theme-focus-ring);
}

/* ───────── transitions ───────── */
.toast-enter-active {
  transition: opacity var(--motion-base) var(--ease-out),
    transform var(--motion-base) var(--ease-out);
}
.toast-leave-active {
  transition: opacity var(--motion-base) var(--ease-out),
    transform var(--motion-base) var(--ease-out);
}
.toast-enter-from {
  opacity: 0;
  transform: translateX(16px);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(16px);
}
</style>
