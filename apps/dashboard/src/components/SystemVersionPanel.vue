<template>
  <div class="system-version-panel">
    <div class="panel-header" @click="collapsed = !collapsed">
      <span class="panel-title">
        <span class="icon">&#9881;</span> System Versions
        <span v-if="hasUpdates" class="badge-warn">&#9888; updates available</span>
      </span>
      <span class="collapse-icon">{{ collapsed ? '&#9654;' : '&#9660;' }}</span>
    </div>
    <div v-if="!collapsed" class="panel-body">
      <div v-if="loading" class="loading">Loading...</div>
      <div v-else-if="error" class="error">{{ error }}</div>
      <template v-else>
        <div class="section">
          <div class="section-title">Worktrees</div>
          <table class="version-table">
            <thead>
              <tr>
                <th>Live</th>
                <th>Host</th>
                <th>Worktree</th>
                <th>daemon</th>
                <th>shell</th>
                <th>devc</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in containerVersions" :key="c.id">
                <td class="live-cell">
                  <span :class="c.connected ? 'live-dot live' : 'live-dot offline'" :title="c.connected ? 'Live' : 'Offline'" />
                </td>
                <td class="host-cell">{{ c.machine_hostname }}</td>
                <td class="path" :title="c.workspace_host_path ?? c.id">{{ displayPath(c.workspace_host_path ?? c.id) }}</td>
                <td>
                  <span
                    :class="stampClass(c.versions?.planq_daemon)"
                    :title="stampTooltip(c.versions?.planq_daemon)"
                    @click.stop="showTooltip($event, stampTooltip(c.versions?.planq_daemon))"
                  >{{ stampSymbol(c.versions?.planq_daemon) }}</span>
                </td>
                <td>
                  <span
                    :class="stampClass(c.versions?.planq_shell)"
                    :title="stampTooltip(c.versions?.planq_shell)"
                    @click.stop="showTooltip($event, stampTooltip(c.versions?.planq_shell))"
                  >{{ stampSymbol(c.versions?.planq_shell) }}</span>
                </td>
                <td>
                  <span
                    :class="stampClass(c.versions?.devcontainer)"
                    :title="stampTooltip(c.versions?.devcontainer)"
                    @click.stop="showTooltip($event, stampTooltip(c.versions?.devcontainer))"
                  >{{ stampSymbol(c.versions?.devcontainer) }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="hostReports.length > 0" class="section">
          <div class="section-title">Remote Hosts (source)</div>
          <table class="version-table">
            <thead>
              <tr>
                <th>Host</th>
                <th>sandbox</th>
                <th>observability</th>
                <th>last seen</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="h in hostReports" :key="h.machine_hostname">
                <td>{{ h.machine_hostname }}</td>
                <td>
                  <span class="stamp-hash" :title="h.sandbox_commit ?? ''">
                    {{ h.sandbox_commit ? h.sandbox_commit.substring(0, 7) : '?' }}
                  </span>
                </td>
                <td>
                  <span class="stamp-hash" :title="h.observability_commit ?? ''">
                    {{ h.observability_commit ? h.observability_commit.substring(0, 7) : '?' }}
                  </span>
                </td>
                <td>{{ relativeTime(h.last_reported_at) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="actions">
          <button @click="refresh" class="btn-refresh">&#8635; Refresh</button>
        </div>
      </template>
    </div>

    <!-- Click tooltip popup -->
    <Teleport to="body">
      <div
        v-if="tooltip.visible"
        class="stamp-popup"
        :style="{ top: tooltip.y + 'px', left: tooltip.x + 'px' }"
        @click.stop="tooltip.visible = false"
      >{{ tooltip.text }}</div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { API_BASE } from '../config';

interface ContainerVersion {
  id: string;
  machine_hostname: string;
  workspace_host_path: string | null;
  connected: boolean;
  versions: Record<string, string | null> | null;
}

interface HostReport {
  machine_hostname: string;
  sandbox_commit: string | null;
  observability_commit: string | null;
  last_reported_at: number | null;
}

const collapsed = ref(true);
const loading = ref(false);
const error = ref('');
const containerVersions = ref<ContainerVersion[]>([]);
const hostReports = ref<HostReport[]>([]);
let refreshTimer: ReturnType<typeof setInterval> | null = null;

const tooltip = ref({ visible: false, text: '', x: 0, y: 0 });

const hasUpdates = computed(() => {
  return containerVersions.value.some(c => {
    if (!c.versions) return false;
    return Object.values(c.versions).some(v => v && !v.startsWith('unknown'));
  });
});

async function refresh() {
  loading.value = true;
  error.value = '';
  try {
    const res = await fetch(`${API_BASE}/dashboard/system-versions`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    containerVersions.value = data.containers ?? [];
    hostReports.value = data.host_source_reports ?? [];
  } catch (e: any) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

function stampSymbol(stamp: string | null | undefined): string {
  if (!stamp || stamp === '(no stamp)') return '\u2014';
  return '\u2713';
}

function stampClass(stamp: string | null | undefined): string {
  if (!stamp || stamp === '(no stamp)') return 'stamp stamp-missing';
  return 'stamp stamp-ok';
}

function stampTooltip(stamp: string | null | undefined): string {
  if (!stamp || stamp === '(no stamp)') return 'Unknown status — no version stamp found';
  const [hash, ts, component] = stamp.split(' ');
  const lines = ['This version is up to date'];
  if (component) lines.push(`component: ${component}`);
  if (hash) lines.push(`hash: ${hash}`);
  if (ts) lines.push(`stamped: ${ts}`);
  return lines.join('\n');
}

function showTooltip(event: MouseEvent, text: string) {
  const rect = (event.target as HTMLElement).getBoundingClientRect();
  tooltip.value = {
    visible: true,
    text,
    x: rect.left + window.scrollX,
    y: rect.bottom + window.scrollY + 4,
  };
}

function displayPath(path: string): string {
  // Strip leading /workspace or common long prefixes, show last 3 components
  const stripped = path.replace(/^\/workspace\/?/, '').replace(/\\/g, '/');
  const parts = stripped.split('/').filter(Boolean);
  return parts.length > 0 ? parts.slice(-3).join('/') : path;
}

function relativeTime(ms: number | null): string {
  if (!ms) return 'never';
  const diff = Date.now() - ms;
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return `${Math.floor(diff / 3600000)}h ago`;
}

function onDocClick() { tooltip.value.visible = false; }

onMounted(() => {
  refresh();
  refreshTimer = setInterval(refresh, 60000);
  document.addEventListener('click', onDocClick);
});

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer);
  document.removeEventListener('click', onDocClick);
});
</script>

<style scoped>
.system-version-panel {
  border: 1px solid #333;
  border-radius: 4px;
  margin: 8px 0;
  background: #1a1a2e;
}
.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  cursor: pointer;
  user-select: none;
}
.panel-header:hover { background: #252545; }
.panel-title { font-weight: 600; font-size: 0.9em; }
.badge-warn { margin-left: 8px; color: #f0a500; font-size: 0.8em; }
.collapse-icon { color: #888; font-size: 0.8em; }
.panel-body { padding: 8px 12px; }
.section { margin-bottom: 16px; }
.section-title { font-size: 0.8em; text-transform: uppercase; color: #888; margin-bottom: 6px; }
.version-table { width: 100%; border-collapse: collapse; font-size: 0.85em; }
.version-table th { text-align: left; color: #888; font-weight: normal; padding: 2px 8px; border-bottom: 1px solid #333; }
.version-table td { padding: 3px 8px; }
.version-table tr:hover td { background: #252545; }
.live-cell { width: 28px; text-align: center; }
.live-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; }
.live-dot.live { background: #4ade80; }
.live-dot.offline { background: #555; }
.host-cell { white-space: nowrap; }
.path { font-family: monospace; max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.stamp { font-family: monospace; font-size: 1em; padding: 1px 5px; border-radius: 3px; cursor: pointer; }
.stamp-ok { background: #1a3a1a; color: #6f6; }
.stamp-missing { background: #3a1a1a; color: #f66; }
.stamp-hash { font-family: monospace; }
.actions { margin-top: 8px; }
.btn-refresh { background: #252545; border: 1px solid #444; color: #ccc; padding: 4px 10px; border-radius: 3px; cursor: pointer; font-size: 0.85em; }
.btn-refresh:hover { background: #333365; }
.loading, .error { font-size: 0.85em; padding: 4px 0; }
.error { color: #f66; }
.stamp-popup {
  position: absolute;
  z-index: 9999;
  background: #1e1e3a;
  border: 1px solid #555;
  border-radius: 4px;
  padding: 6px 10px;
  font-size: 0.8em;
  color: #ccc;
  white-space: pre;
  pointer-events: none;
  max-width: 320px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.5);
}
</style>
