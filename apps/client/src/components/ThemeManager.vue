<template>
  <Teleport to="body">
    <div v-if="isOpen" class="tm-overlay" role="dialog" aria-modal="true" aria-label="Theme Manager">
      <!-- Scrim -->
      <div class="tm-scrim" @click="close"></div>

      <!-- Modal -->
      <div class="tm-modal" @click.stop>
        <!-- Header -->
        <header class="tm-head">
          <div class="tm-title">
            <span class="tm-title-ico"><AppIcon name="theme" :size="18" /></span>
            <h2>Theme Manager</h2>
          </div>
          <button class="tm-close" type="button" aria-label="Close" @click="close">
            <AppIcon name="x" :size="16" />
          </button>
        </header>

        <!-- Content -->
        <div class="tm-content">
          <p class="tm-caption">Predefined Themes</p>

          <!-- Theme Grid -->
          <div class="tm-grid">
            <button
              v-for="theme in predefinedThemes"
              :key="theme.name"
              type="button"
              class="tm-card"
              :class="{ 'is-active': currentTheme === theme.name }"
              :aria-pressed="currentTheme === theme.name"
              @click="selectTheme(theme.name)"
            >
              <!-- Color preview -->
              <div class="tm-swatches">
                <span class="tm-swatch" :style="{ backgroundColor: theme.preview.primary }"></span>
                <span class="tm-swatch" :style="{ backgroundColor: theme.preview.secondary }"></span>
                <span class="tm-swatch" :style="{ backgroundColor: theme.preview.accent }"></span>
              </div>

              <!-- Info -->
              <div class="tm-card-body">
                <div class="tm-card-name">
                  <span class="tm-name">{{ theme.displayName }}</span>
                  <span v-if="currentTheme === theme.name" class="tm-current">
                    <AppIcon name="check" :size="12" /><span>Current</span>
                  </span>
                </div>
                <p class="tm-desc">{{ theme.description }}</p>
              </div>
            </button>
          </div>
        </div>

        <!-- Footer -->
        <footer class="tm-foot">
          <span class="tm-count">
            <span class="mono tabular">{{ predefinedThemes.length }}</span> themes available
          </span>
          <button class="tm-btn" type="button" @click="close">Close</button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useThemes } from '../composables/useThemes';
import AppIcon from './AppIcon.vue';

defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

// Theme management
const { state, predefinedThemes, setTheme } = useThemes();

// Computed properties
const currentTheme = computed(() => state.value.currentTheme);

// Methods
const selectTheme = (themeName: string) => {
  setTheme(themeName);
  close();
};

const close = () => {
  emit('close');
};
</script>

<style scoped>
.tm-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
}

.tm-scrim {
  position: fixed;
  inset: 0;
  background: color-mix(in srgb, var(--theme-shadow-lg) 80%, transparent);
}

/* ───────── modal ───────── */
.tm-modal {
  position: relative;
  z-index: 10;
  display: flex;
  flex-direction: column;
  width: 75vw;
  height: 75vh;
  overflow: hidden;
  background: var(--surface);
  border: 1px solid var(--hair);
  border-radius: var(--radius-lg);
  box-shadow: var(--elevation-2);
  color: var(--text-base);
  font-family: var(--font-sans);
}

/* ───────── header ───────── */
.tm-head {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--hair-faint);
}
.tm-title { display: flex; align-items: center; gap: var(--space-3); }
.tm-title-ico { display: inline-flex; color: var(--theme-primary); }
.tm-title h2 {
  margin: 0;
  font-size: var(--text-lg);
  font-weight: var(--weight-semibold);
  letter-spacing: -0.01em;
  color: var(--text-strong);
}
.tm-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-faint);
  cursor: pointer;
  transition: color var(--motion-fast) var(--ease-out), background var(--motion-fast) var(--ease-out);
}
.tm-close:hover { color: var(--text-strong); background: var(--surface-hover); }

/* ───────── content ───────── */
.tm-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: var(--space-5);
}
.tm-caption {
  margin: 0 0 var(--space-4);
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: var(--tracking-caps);
  text-transform: uppercase;
  color: var(--text-faint);
}

.tm-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-3);
}

/* ───────── theme card ───────── */
.tm-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-3);
  text-align: left;
  background: var(--surface-raised);
  border: 1px solid var(--hair);
  border-radius: var(--radius-md);
  cursor: pointer;
  font-family: var(--font-sans);
  transition: border-color var(--motion-fast) var(--ease-out), background var(--motion-fast) var(--ease-out);
}
.tm-card:hover { border-color: var(--hair-strong); background: var(--surface-hover); }
.tm-card:focus-visible { outline: 2px solid var(--theme-focus-ring); outline-offset: 2px; }
.tm-card.is-active { border-color: var(--theme-primary); background: var(--primary-soft); }

.tm-swatches {
  display: flex;
  height: 56px;
  overflow: hidden;
  border: 1px solid var(--hair-faint);
  border-radius: var(--radius-sm);
}
.tm-swatch { flex: 1; }
.tm-swatch + .tm-swatch { border-left: 1px solid var(--hair-faint); }

.tm-card-body { display: flex; flex-direction: column; gap: var(--space-1); }
.tm-card-name { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); }
.tm-name {
  font-size: var(--text-md);
  font-weight: var(--weight-medium);
  color: var(--text-strong);
}
.tm-current {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: none;
  padding: 1px 7px;
  border: 1px solid var(--primary-line);
  border-radius: var(--radius-full);
  color: var(--theme-primary);
  font-size: var(--text-2xs);
  font-weight: var(--weight-semibold);
  letter-spacing: var(--tracking-caps);
  text-transform: uppercase;
}
.tm-desc {
  margin: 0;
  font-size: var(--text-sm);
  line-height: var(--leading-snug);
  color: var(--text-muted);
}

/* ───────── footer ───────── */
.tm-foot {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-5);
  border-top: 1px solid var(--hair-faint);
}
.tm-count { font-size: var(--text-sm); color: var(--text-faint); }
.tm-count .mono { color: var(--text-muted); }
.tm-btn {
  padding: 6px 14px;
  border: 1px solid var(--hair);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-family: var(--font-sans);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  transition: color var(--motion-fast) var(--ease-out), border-color var(--motion-fast) var(--ease-out), background var(--motion-fast) var(--ease-out);
}
.tm-btn:hover { color: var(--theme-primary); border-color: var(--primary-line); background: var(--primary-soft); }

.mono { font-family: var(--font-mono); }
.tabular { font-variant-numeric: tabular-nums; }

@media (max-width: 1023px) {
  .tm-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 699px) {
  .tm-modal { width: 100%; height: 100%; border-radius: 0; border: 0; }
  .tm-grid { grid-template-columns: 1fr; }
}
</style>
