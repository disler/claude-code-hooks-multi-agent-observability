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
                <th>Worktree</th>
                <th>daemon</th>
                <th>shell</th>
                <th>devc</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in containerVersions" :key="c.id">
                <td class="path" :title="c.id">{{ shortPath(c.id) }}</td>
                <td>
                  <span :class="stampClass(c.versions?.planq_daemon)">
                    {{ stampShort(c.versions?.planq_daemon) }}
                  </span>
                </td>
                <td>
                  <span :class="stampClass(c.versions?.planq_shell)">
                    {{ stampShort(c.versions?.planq_shell) }}
                  </span>
                </td>
                <td>
                  <span :class="stampClass(c.versions?.devcontainer)">
                    {{ stampShort(c.versions?.devcontainer) }}
                  </span>
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { API_BASE } from '../config';

interface ContainerVersion {
  id: string;
  machine_hostname: string;
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

function stampShort(stamp: string | null | undefined): string {
  if (!stamp || stamp === '(no stamp)') return '\u2014';
  const hash = stamp.split(' ')[0];
  return hash.substring(0, 7);
}

function stampClass(stamp: string | null | undefined): string {
  if (!stamp || stamp === '(no stamp)') return 'stamp stamp-missing';
  return 'stamp stamp-ok';
}

function shortPath(id: string): string {
  // Show last 2 path components
  const parts = id.replace(/\\/g, '/').split('/');
  return parts.slice(-2).join('/');
}

function relativeTime(ms: number | null): string {
  if (!ms) return 'never';
  const diff = Date.now() - ms;
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return `${Math.floor(diff / 3600000)}h ago`;
}

onMounted(() => {
  refresh();
  refreshTimer = setInterval(refresh, 60000);
});

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer);
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
.path { font-family: monospace; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.stamp { font-family: monospace; font-size: 0.9em; padding: 1px 4px; border-radius: 3px; }
.stamp-ok { background: #1a3a1a; color: #6f6; }
.stamp-missing { background: #3a1a1a; color: #f66; }
.stamp-hash { font-family: monospace; }
.actions { margin-top: 8px; }
.btn-refresh { background: #252545; border: 1px solid #444; color: #ccc; padding: 4px 10px; border-radius: 3px; cursor: pointer; font-size: 0.85em; }
.btn-refresh:hover { background: #333365; }
.loading, .error { font-size: 0.85em; padding: 4px 0; }
.error { color: #f66; }
</style>
