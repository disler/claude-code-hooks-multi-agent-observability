<template>
  <div class="tfs">
    <header class="tfs__bar">
      <button class="tfs__back" @click="$emit('close')" aria-label="Back">← Back</button>
      <span class="tfs__title">Atlas</span>
      <span class="tfs__spacer"></span>
    </header>
    <div class="tfs__body">
      <TalkCard :compact="false" />
    </div>
  </div>
</template>

<script setup lang="ts">
import TalkCard from '../components/dashboard/cards/TalkCard.vue';

defineEmits<{ (e: 'close'): void }>();
</script>

<style scoped>
.tfs {
  position: fixed;
  inset: 0;
  z-index: 80;
  background: var(--atlas-page-bg);
  display: flex;
  flex-direction: column;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif;
}

.tfs__bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 20px;
  border-bottom: 1px solid var(--atlas-hairline);
}
.tfs__back {
  font-family: inherit;
  font-size: 15px;
  font-weight: 500;
  color: var(--atlas-blue);
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
}
.tfs__back:hover { opacity: 0.7; }
.tfs__title {
  font-size: 17px;
  font-weight: 600;
  color: var(--atlas-text-strong);
  letter-spacing: -0.01em;
}
.tfs__spacer { flex: 1; }

.tfs__body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 12px;
  overflow: hidden;
}

/* Stretch the inner card to fill the screen */
.tfs__body :deep(.card) {
  flex: 1 1 auto;
  height: 100%;
  border-radius: 16px;
  min-height: 0;
}
</style>
