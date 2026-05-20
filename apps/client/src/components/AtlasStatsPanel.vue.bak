<template>
  <aside class="atlas-panel" :class="{ 'is-collapsed': collapsed }">
    <button class="atlas-panel__toggle" @click="collapsed = !collapsed" :title="collapsed ? 'Show Atlas stats' : 'Hide Atlas stats'">
      <span v-if="collapsed">‹</span>
      <span v-else>›</span>
    </button>

    <div v-if="!collapsed" class="atlas-panel__body">
      <header class="atlas-panel__header">
        <h2>Atlas</h2>
        <button class="atlas-panel__refresh" @click="refresh" :disabled="loading" title="Refresh">↻</button>
      </header>

      <!-- Codeburn -->
      <section class="atlas-card">
        <h3>Token spend</h3>
        <div v-if="stats?.codeburn?.error" class="atlas-error">{{ stats.codeburn.error }}</div>
        <template v-else-if="stats?.codeburn">
          <div class="atlas-stat">
            <span class="atlas-stat__label">Today</span>
            <span class="atlas-stat__value">${{ stats.codeburn.today?.dollars?.toFixed(2) ?? '—' }}</span>
            <span class="atlas-stat__unit">{{ stats.codeburn.today?.calls ?? 0 }} calls</span>
          </div>
          <div class="atlas-stat">
            <span class="atlas-stat__label">Month</span>
            <span class="atlas-stat__value">${{ stats.codeburn.month?.dollars?.toFixed(2) ?? '—' }}</span>
            <span class="atlas-stat__unit">{{ stats.codeburn.month?.calls ?? 0 }} calls</span>
          </div>
        </template>
        <div v-else class="atlas-skeleton">…</div>
      </section>

      <!-- Caveman -->
      <section class="atlas-card">
        <h3>Caveman</h3>
        <div v-if="stats?.caveman?.error" class="atlas-error">{{ stats.caveman.error }}</div>
        <template v-else-if="stats?.caveman">
          <div class="atlas-stat">
            <span class="atlas-stat__label">Sessions logged</span>
            <span class="atlas-stat__value">{{ stats.caveman.sessions }}</span>
            <span class="atlas-stat__unit">~{{ Math.round(stats.caveman.sessions * 0.6) }} kT saved est.</span>
          </div>
        </template>
        <div v-else class="atlas-skeleton">…</div>
      </section>

      <!-- Recent briefs -->
      <section class="atlas-card">
        <h3>Recent briefs</h3>
        <div v-if="stats?.briefs?.error" class="atlas-error">{{ stats.briefs.error }}</div>
        <ul v-else-if="stats?.briefs?.recent?.length" class="atlas-list">
          <li v-for="b in stats.briefs.recent" :key="b.path">
            <a :href="b.url" target="_blank" rel="noopener">{{ b.filename }}</a>
          </li>
        </ul>
        <div v-else class="atlas-empty">no briefs yet</div>
      </section>

      <footer class="atlas-panel__footer" v-if="stats?.generated_at">
        <small>{{ formatTime(stats.generated_at) }}</small>
      </footer>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';

const stats = ref<any>(null);
const loading = ref(false);
const collapsed = ref(false);
let timer: number | null = null;

async function refresh() {
  if (loading.value) return;
  loading.value = true;
  try {
    const url = (import.meta as any).env?.VITE_SERVER_URL?.replace(/\/$/, '') ?? 'http://localhost:4000';
    const res = await fetch(`${url}/api/atlas/stats`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    stats.value = await res.json();
  } catch (err) {
    console.error('atlas stats fetch failed', err);
  } finally {
    loading.value = false;
  }
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString();
  } catch {
    return iso;
  }
}

onMounted(() => {
  refresh();
  timer = window.setInterval(refresh, 60_000);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<style scoped>
.atlas-panel {
  position: fixed;
  top: 72px;
  right: 0;
  width: 320px;
  max-width: 90vw;
  height: calc(100vh - 80px);
  background: rgba(28, 28, 30, 0.85);
  backdrop-filter: saturate(180%) blur(20px);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
  border-left: 0.5px solid rgba(255, 255, 255, 0.1);
  font-family: -apple-system, "SF Pro Text", "Helvetica Neue", sans-serif;
  font-size: 13px;
  color: #f5f5f7;
  z-index: 40;
  transform: translateX(0);
  transition: transform 200ms cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
}
.atlas-panel.is-collapsed {
  transform: translateX(calc(100% - 32px));
}

.atlas-panel__toggle {
  position: absolute;
  left: 0;
  top: 16px;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  font-size: 18px;
  cursor: pointer;
  color: inherit;
  opacity: 0.6;
}
.atlas-panel__toggle:hover { opacity: 1; }

.atlas-panel__body {
  flex: 1;
  padding: 20px 16px 16px 36px;
  overflow-y: auto;
}

.atlas-panel__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 16px;
}
.atlas-panel__header h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.atlas-panel__refresh {
  border: none;
  background: transparent;
  font-size: 14px;
  cursor: pointer;
  opacity: 0.6;
  color: inherit;
}
.atlas-panel__refresh:hover { opacity: 1; }
.atlas-panel__refresh:disabled { opacity: 0.3; cursor: wait; }

.atlas-card {
  margin-bottom: 14px;
  padding: 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.05);
}

.atlas-card h3 {
  margin: 0 0 8px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  opacity: 0.6;
}

.atlas-stat {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: baseline;
  gap: 4px 8px;
  padding: 6px 0;
}
.atlas-stat + .atlas-stat {
  border-top: 0.5px solid rgba(255, 255, 255, 0.08);
}
.atlas-stat__label {
  font-size: 13px;
  opacity: 0.7;
}
.atlas-stat__value {
  font-size: 15px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}
.atlas-stat__unit {
  grid-column: 1 / -1;
  font-size: 11px;
  opacity: 0.5;
  margin-top: -2px;
}

.atlas-list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.atlas-list li {
  padding: 4px 0;
  font-size: 12px;
  border-bottom: 0.5px solid rgba(255, 255, 255, 0.08);
}
.atlas-list li:last-child { border-bottom: none; }
.atlas-list a {
  color: inherit;
  text-decoration: none;
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.atlas-list a:hover { text-decoration: underline; }

.atlas-error { font-size: 11px; color: #d70015; opacity: 0.8; }
.atlas-empty { font-size: 12px; opacity: 0.4; font-style: italic; }
.atlas-skeleton { font-size: 14px; opacity: 0.3; }

.atlas-panel__footer {
  margin-top: 16px;
  text-align: right;
  opacity: 0.4;
  font-size: 10px;
}
</style>
