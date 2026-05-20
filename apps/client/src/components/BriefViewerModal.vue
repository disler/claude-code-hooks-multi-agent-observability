<template>
  <Teleport to="body">
    <div class="bvm" @click.self="emit('close')" @keydown.esc="emit('close')" tabindex="-1" ref="root">
      <div class="bvm__panel" role="dialog" :aria-label="brief?.title || 'Brief'">
        <header class="bvm__bar">
          <div class="bvm__meta">
            <span class="bvm__date">{{ brief?.date }}</span>
            <span class="bvm__topic">{{ brief?.topic }}</span>
            <span class="bvm__title">{{ brief?.title }}</span>
          </div>
          <a class="bvm__open" :href="proxyUrl" target="_blank" rel="noopener">Open ↗</a>
          <button class="bvm__close" @click="emit('close')" aria-label="Close">✕</button>
        </header>
        <iframe class="bvm__iframe" :src="proxyUrl" :title="brief?.title"></iframe>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { API_BASE_URL } from '../config';

const props = defineProps<{ brief: any }>();
const emit = defineEmits<{ (e: 'close'): void }>();

const root = ref<HTMLDivElement | null>(null);

const proxyUrl = computed(() =>
  props.brief?.path
    ? `${API_BASE_URL}/api/atlas/briefs/file?path=${encodeURIComponent(props.brief.path)}`
    : ''
);

const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') emit('close'); };
onMounted(() => {
  document.addEventListener('keydown', onKey);
  root.value?.focus();
});
onUnmounted(() => document.removeEventListener('keydown', onKey));
</script>

<style scoped>
.bvm {
  position: fixed;
  inset: 0;
  z-index: 70;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: stretch;
  justify-content: center;
  padding: 24px;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif;
}
@media (max-width: 699px) { .bvm { padding: 0; } }

.bvm__panel {
  width: min(960px, 100%);
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--theme-bg-primary);
  border: 1px solid var(--theme-border-primary);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 14px 40px var(--theme-shadow-lg);
}
@media (max-width: 699px) {
  .bvm__panel { border-radius: 0; border: none; }
}

.bvm__bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--theme-border-primary);
}
.bvm__meta {
  flex: 1;
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  font-size: 12px;
  color: var(--theme-text-tertiary);
}
.bvm__date { font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace; }
.bvm__topic { text-transform: uppercase; letter-spacing: 0.05em; font-weight: 500; }
.bvm__title {
  font-size: 13px;
  font-weight: 500;
  color: var(--theme-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  letter-spacing: -0.005em;
}
.bvm__open {
  font-size: 12px;
  color: var(--theme-primary);
  text-decoration: none;
  font-weight: 500;
}
.bvm__open:hover { text-decoration: underline; }
.bvm__close {
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--theme-border-primary);
  border-radius: 6px;
  color: var(--theme-text-secondary);
  cursor: pointer;
  font-size: 11px;
}
.bvm__close:hover { background: var(--theme-hover-bg); color: var(--theme-text-primary); }

.bvm__iframe {
  flex: 1;
  width: 100%;
  border: none;
  background: var(--theme-bg-primary);
}
</style>
