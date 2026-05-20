<template>
  <header class="wordmark-row">
    <span class="wordmark-row__brand" :class="{ 'is-autonomous': isAutonomous }">atlas</span>
    <nav class="wordmark-row__pages">
      <button
        type="button"
        class="wordmark-row__pages-link is-active"
        aria-current="page"
      >Today</button>
      <button
        v-for="p in otherPages"
        :key="p.key"
        type="button"
        class="wordmark-row__pages-link"
        @click="onNav(p.key)"
      >{{ p.label }}</button>
    </nav>
    <div class="wordmark-row__actions">
      <AutonomyToggle />
      <ThemeToggle />
      <button
        ref="menuBtnRef"
        type="button"
        class="wordmark-row__menu-btn"
        :class="{ 'is-open': menuOpen }"
        :aria-expanded="menuOpen"
        aria-label="Menu"
        @click.stop="menuOpen = !menuOpen"
      >
        <svg v-if="!menuOpen" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <line x1="4"  y1="7"  x2="20" y2="7"/>
          <line x1="10" y1="12" x2="20" y2="12"/>
          <line x1="14" y1="17" x2="20" y2="17"/>
        </svg>
        <svg v-else width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>

    <Transition name="wordmark-row__menu-fade">
      <div v-if="menuOpen" ref="menuPanelRef" class="wordmark-row__menu" role="dialog" aria-modal="true">
        <nav class="wordmark-row__menu-list">
          <button
            v-for="p in PAGES"
            :key="p.key"
            type="button"
            :class="['wordmark-row__menu-item', p.key === 'today' && 'is-active']"
            :aria-current="p.key === 'today' ? 'page' : undefined"
            @click="onNav(p.key)"
          >{{ p.label }}</button>
        </nav>
        <div class="wordmark-row__menu-footer">
          <GlobalLLMChip />
        </div>
      </div>
    </Transition>
  </header>
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import ThemeToggle from './ThemeToggle.vue';
import AutonomyToggle from '../ui/AutonomyToggle.vue';
import GlobalLLMChip from '../ui/GlobalLLMChip.vue';
import { useAtlasAutonomy } from '../../composables/useAtlasAutonomy';

const { state: autonomyState } = useAtlasAutonomy();
const isAutonomous = computed(() => !!autonomyState.value?.active);
import { PAGES } from '../../views/_pages';

const emit = defineEmits<{
  (e: 'open-portfolio'): void;
  (e: 'open-ideas'): void;
  (e: 'open-memory'): void;
  (e: 'open-swarm'): void;
  (e: 'open-orgchart'): void;
  (e: 'open-cost'): void;
}>();

// "Today" is the default home (the existing dashboard cards). Top-nav lists
// everything else. Portfolio | Memory | Swarm.
const otherPages = computed(() => PAGES.filter(p => p.key !== 'today'));

const menuOpen = ref(false);
const menuBtnRef = ref<HTMLButtonElement | null>(null);
const menuPanelRef = ref<HTMLElement | null>(null);

function onNav(key: string) {
  menuOpen.value = false;
  if (key === 'today') return; // Today is the default home — staying on it is a no-op.
  if (key === 'portfolio') emit('open-portfolio');
  else if (key === 'ideas') emit('open-ideas');
  else if (key === 'memory') emit('open-memory');
  else if (key === 'swarm')  emit('open-swarm');
  else if (key === 'orgchart') emit('open-orgchart');
  else if (key === 'cost') emit('open-cost');
}

function onDocClickAway(ev: MouseEvent) {
  if (!menuOpen.value) return;
  const t = ev.target as Node | null;
  if (menuPanelRef.value?.contains(t)) return;
  if (menuBtnRef.value?.contains(t)) return;
  menuOpen.value = false;
}
function onDocKey(ev: KeyboardEvent) {
  if (menuOpen.value && ev.key === 'Escape') menuOpen.value = false;
}

watch(menuOpen, (open) => {
  if (open) {
    document.addEventListener('mousedown', onDocClickAway, true);
    document.addEventListener('keydown', onDocKey);
  } else {
    document.removeEventListener('mousedown', onDocClickAway, true);
    document.removeEventListener('keydown', onDocKey);
  }
});
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocClickAway, true);
  document.removeEventListener('keydown', onDocKey);
});
</script>

<style scoped>
.wordmark-row {
  display: flex;
  align-items: flex-end;
  gap: 0;
  padding: 48px 48px 28px;
  font-family: var(--atlas-font-sans);
  position: relative;
  z-index: var(--atlas-z-modal);
  flex-wrap: wrap;
}
@media (max-width: 1023px) {
  .wordmark-row { padding: 32px 24px 20px; }
}
@media (max-width: 699px) {
  .wordmark-row { padding: 16px 4px 12px; }
  /* Hide inline pages nav on phone — burger menu covers it */
  .wordmark-row__pages { display: none; }
  /* Smaller brand on phone */
  .wordmark-row__brand { font-size: 28px !important; }
}

.wordmark-row__brand {
  font-family: var(--atlas-font-display);
  font-size: var(--atlas-text-display);
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--atlas-text-strong);
  line-height: 1;
  user-select: none;
}
/* Slow ambient color drift — only when autonomy is ON. Same palette as the toggle. */
.wordmark-row__brand.is-autonomous {
  background-image: linear-gradient(120deg,
    #6b2da8,  /* deep purple */
    #0a84ff,  /* blue */
    #137a36,  /* deep green */
    #b07a00,  /* deep amber */
    #6b2da8);
  background-size: 400% 400%;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: wordmark-color-drift 60s ease-in-out infinite;
}
@media (prefers-color-scheme: dark) {
  .wordmark-row__brand.is-autonomous {
    background-image: linear-gradient(120deg,
      #c084fc,
      #60a5fa,
      #4ade80,
      #fbbf24,
      #c084fc);
  }
}
@keyframes wordmark-color-drift {
  0%   { background-position:   0% 50%; }
  50%  { background-position: 100% 50%; }
  100% { background-position:   0% 50%; }
}
@media (prefers-reduced-motion: reduce) {
  .wordmark-row__brand.is-autonomous { animation: none; }
}

.wordmark-row__pages {
  display: flex;
  align-items: baseline;
  gap: 18px;
  margin-left: 20px;
}
.wordmark-row__pages-link {
  background: transparent;
  border: none;
  padding: 0;
  font-family: inherit;
  font-size: var(--atlas-text-base);
  font-weight: 500;
  letter-spacing: -0.005em;
  color: var(--atlas-text-secondary);
  opacity: 0.45;
  cursor: pointer;
  line-height: 1.2;
  transition: color var(--atlas-duration-fast) var(--atlas-ease),
              opacity var(--atlas-duration-fast) var(--atlas-ease);
}
.wordmark-row__pages-link:hover { color: var(--atlas-text-primary); opacity: 1; }
.wordmark-row__pages-link:focus { outline: none; }
.wordmark-row__pages-link:focus-visible {
  outline: 2px solid var(--atlas-blue);
  outline-offset: 4px;
  border-radius: var(--atlas-radius-sm);
}
.wordmark-row__pages-link.is-active {
  color: var(--atlas-text-strong);
  font-weight: 600;
  opacity: 1;
  cursor: default;
}

.wordmark-row__actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.wordmark-row__menu-btn {
  display: none;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--atlas-text-strong);
  width: 36px;
  height: 36px;
  padding: 0;
  cursor: pointer;
  transition: opacity var(--atlas-duration-fast) var(--atlas-ease);
}
.wordmark-row__menu-btn:hover { opacity: 0.65; }
.wordmark-row__menu-btn:focus { outline: none; }
.wordmark-row__menu-btn:focus-visible { outline: 2px solid var(--atlas-blue); outline-offset: 4px; border-radius: var(--atlas-radius-sm); }

.wordmark-row__menu { display: none; }

@media (max-width: 600px) {
  .wordmark-row {
    padding: max(16px, env(safe-area-inset-top)) 16px 16px;
    gap: 8px;
    flex-wrap: nowrap;
  }
  .wordmark-row__brand { font-size: 28px; }
  .wordmark-row__pages { gap: 0; margin-left: 12px; }
  .wordmark-row__pages .wordmark-row__pages-link:not(.is-active) { display: none; }
  .wordmark-row__pages-link.is-active { font-size: var(--atlas-text-base); }
  .wordmark-row__actions :deep(.llm-chip),
  .wordmark-row__actions :deep(.llm-chip-strip) { display: none; }
  .wordmark-row__menu-btn { display: inline-flex; }
  .wordmark-row__actions { gap: 6px; }

  .wordmark-row__menu {
    display: flex;
    flex-direction: column;
    position: fixed;
    inset: 0;
    background: var(--atlas-page-bg);
    z-index: calc(var(--atlas-z-modal) - 1);
    padding-top: calc(max(16px, env(safe-area-inset-top)) + 60px);
    padding-left: 24px;
    padding-right: 24px;
    padding-bottom: calc(24px + env(safe-area-inset-bottom));
  }
  .wordmark-row__menu-list {
    display: flex;
    flex-direction: column;
    gap: 14px;
    margin-top: 32px;
  }
  .wordmark-row__menu-item {
    background: transparent;
    border: none;
    padding: 8px 0;
    font-family: var(--atlas-font-display);
    font-size: 32px;
    font-weight: 600;
    letter-spacing: -0.02em;
    color: var(--atlas-text-secondary);
    text-align: left;
    cursor: pointer;
    line-height: 1.1;
    transition: color var(--atlas-duration-fast) var(--atlas-ease);
  }
  .wordmark-row__menu-item:hover { color: var(--atlas-text-primary); }
  .wordmark-row__menu-item:focus { outline: none; }
  .wordmark-row__menu-item:focus-visible { outline: 2px solid var(--atlas-blue); outline-offset: 4px; border-radius: var(--atlas-radius-sm); }
  .wordmark-row__menu-item.is-active { color: var(--atlas-text-strong); }

  .wordmark-row__menu-footer {
    margin-top: auto;
    padding-top: 28px;
    border-top: 1px solid var(--atlas-hairline);
    display: flex; flex-direction: column; align-items: center; gap: 12px;
  }
  .wordmark-row__menu-footer :deep(.llm-chip) {
    display: flex; align-items: center; gap: 12px;
    padding: 14px 18px;
    min-width: 240px;
    min-height: 56px;
    border: 1px solid var(--atlas-hairline);
    border-radius: 14px;
    background: var(--atlas-card-bg);
  }
  .wordmark-row__menu-footer :deep(.llm-chip:active) {
    background: var(--atlas-card-bg-2);
  }
  .wordmark-row__menu-footer :deep(.llm-chip__mono) { width: 32px; height: 32px; font-size: 14px; }
  .wordmark-row__menu-footer :deep(.llm-chip__body) {
    display: flex !important;
    flex-direction: column;
    align-items: flex-start;
    min-width: 0;
  }
  .wordmark-row__menu-footer :deep(.llm-chip__model) {
    display: inline !important;
    font-size: 16px; font-weight: 600;
    color: var(--atlas-text-strong);
    text-transform: capitalize;
  }
  .wordmark-row__menu-footer :deep(.llm-chip__usage) { font-size: 12px; }
}

.wordmark-row__menu-fade-enter-active,
.wordmark-row__menu-fade-leave-active {
  transition: opacity var(--atlas-duration-base) var(--atlas-ease);
}
.wordmark-row__menu-fade-enter-from,
.wordmark-row__menu-fade-leave-to { opacity: 0; }
.wordmark-row__menu-fade-enter-active .wordmark-row__menu-list,
.wordmark-row__menu-fade-leave-active .wordmark-row__menu-list {
  transition: transform var(--atlas-duration-slow) var(--atlas-ease);
}
.wordmark-row__menu-fade-enter-from .wordmark-row__menu-list { transform: translateY(8px); }
.wordmark-row__menu-fade-leave-to .wordmark-row__menu-list { transform: translateY(8px); }
</style>
