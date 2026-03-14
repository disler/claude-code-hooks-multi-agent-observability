<template>
  <div class="system-version-panel">
    <!-- Title bar -->
    <div class="title-bar">
      <span class="title-text">System Versions</span>
      <div class="toggle-group">
        <button
          class="btn-toggle"
          :class="!showAll ? 'btn-toggle-active' : ''"
          @click="showAll = false"
        >filtered</button>
        <button
          class="btn-toggle"
          :class="showAll ? 'btn-toggle-active' : ''"
          @click="showAll = true"
        >show all</button>
        <button @click="refresh" class="btn-toggle" title="Refresh">&#8635;</button>
      </div>
    </div>
    <div class="panel-body">
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
              <tr v-for="c in displayedVersions" :key="c.id">
                <td class="live-cell">
                  <span :class="c.connected ? 'live-dot live' : 'live-dot offline'" :title="c.connected ? 'Live' : 'Offline'" />
                </td>
                <td
                  class="host-cell"
                  :class="isHostStale(c.machine_hostname) ? 'host-stale' : ''"
                  :title="isHostStale(c.machine_hostname) ? 'Host devcontainer is outdated — update the devcontainer on this host first, then rebuild containers' : undefined"
                >{{ c.machine_hostname }}</td>
                <td class="path" :title="c.workspace_host_path ?? c.id">{{ displayPath(c.workspace_host_path ?? c.id, c.machine_hostname) }}</td>
                <td class="daemon-cell">
                  <span
                    :class="daemonStampClass(c.versions)"
                    :title="daemonStampTooltip(c.versions)"
                    @click.stop="showTooltip($event, daemonStampTooltip(c.versions))"
                  >{{ daemonStampSymbol(c.versions) }}</span>
                  <button
                    v-if="daemonNeedsRestart(c.versions)"
                    class="daemon-restart-btn"
                    title="Send restart signal to daemon"
                    @click.stop="restartDaemon(c.id)"
                  >&#x1F504;</button>
                </td>
                <td>
                  <span
                    :class="stampClass(c.versions?.planq_shell, serverStamps.planq_shell)"
                    :title="stampTooltip(c.versions?.planq_shell, serverStamps.planq_shell, !serverStamps.devcontainer || isStale(c.versions?.devcontainer, serverStamps.devcontainer))"
                    @click.stop="showTooltip($event, stampTooltip(c.versions?.planq_shell, serverStamps.planq_shell, !serverStamps.devcontainer || isStale(c.versions?.devcontainer, serverStamps.devcontainer)))"
                  >{{ stampSymbol(c.versions?.planq_shell) }}</span>
                </td>
                <td>
                  <span
                    :class="stampClass(c.versions?.devcontainer, serverStamps.devcontainer)"
                    :title="stampTooltip(c.versions?.devcontainer, serverStamps.devcontainer, true)"
                    @click.stop="showTooltip($event, stampTooltip(c.versions?.devcontainer, serverStamps.devcontainer, true))"
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
      </template>
    </div>

    <!-- Click tooltip popup -->
    <Teleport to="body">
      <div
        v-if="tooltip.visible"
        class="stamp-popup"
        :style="{ top: tooltip.y + 'px', left: tooltip.x + 'px' }"
        @click.stop
      >
        <button class="popup-close-btn" @click.stop="tooltip.visible = false">✕</button>
        <button class="popup-copy-btn" @click.stop="copyPopup">⎘</button>
        <pre class="popup-content">{{ tooltip.text }}</pre>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { API_BASE } from '../config';

const props = defineProps<{
  repoFilter: string;
  hostFilter: string;
  connectionFilter: string;
}>();

const emit = defineEmits<{
  (e: 'has-updates', value: boolean): void;
}>();

interface ContainerVersion {
  id: string;
  source_repo: string;
  machine_hostname: string;
  workspace_host_path: string | null;
  connected: boolean;
  versions: Record<string, string | null> | null;
}

// Derive the installed stamp hash (first word) from a stamp string.
function stampHash(stamp: string | null | undefined): string | null {
  if (!stamp || stamp === '(no stamp)') return null;
  return stamp.split(' ')[0] ?? null;
}

interface HostReport {
  machine_hostname: string;
  sandbox_commit: string | null;
  observability_commit: string | null;
  last_reported_at: number | null;
}

interface ServerStamps {
  devcontainer: string | null;
  planq_daemon: string | null;
  planq_shell: string | null;
}

const showAll = ref(false);
const loading = ref(false);
const error = ref('');
const containerVersions = ref<ContainerVersion[]>([]);
const hostReports = ref<HostReport[]>([]);
const serverStamps = ref<ServerStamps>({ devcontainer: null, planq_daemon: null, planq_shell: null });
let refreshTimer: ReturnType<typeof setInterval> | null = null;

const tooltip = ref({ visible: false, text: '', x: 0, y: 0 });

const hasUpdates = computed(() => {
  return containerVersions.value.some(c => isContainerStale(c));
});

// Versions filtered by top-row filters when showAll is false
const displayedVersions = computed(() => {
  if (showAll.value) return containerVersions.value;
  return containerVersions.value.filter(c => {
    if (props.repoFilter && c.source_repo !== props.repoFilter) return false;
    if (props.hostFilter && c.machine_hostname !== props.hostFilter) return false;
    if (props.connectionFilter === 'online' && !c.connected) return false;
    if (props.connectionFilter === 'offline' && c.connected) return false;
    return true;
  });
});

watch(hasUpdates, v => emit('has-updates', v), { immediate: true });

async function refresh() {
  loading.value = true;
  error.value = '';
  try {
    const res = await fetch(`${API_BASE}/dashboard/system-versions`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    containerVersions.value = data.containers ?? [];
    hostReports.value = data.host_source_reports ?? [];
    serverStamps.value = data.server_stamps ?? { devcontainer: null, planq_daemon: null, planq_shell: null };
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

// Returns true if the container stamp is present but its hash differs from the server reference stamp.
function isStale(stamp: string | null | undefined, serverStamp: string | null | undefined): boolean {
  if (!stamp || stamp === '(no stamp)') return false;
  if (!serverStamp) return false;
  const containerHash = stampHash(stamp);
  const serverHash = stampHash(serverStamp);
  return !!containerHash && !!serverHash && containerHash !== serverHash;
}

function stampClass(stamp: string | null | undefined, serverStamp?: string | null): string {
  if (!stamp || stamp === '(no stamp)') return 'stamp stamp-missing';
  if (isStale(stamp, serverStamp)) return 'stamp stamp-stale';
  if (!serverStamp) return 'stamp stamp-unknown';  // stamp exists but no reference — can't compare
  return 'stamp stamp-ok';
}

// devcStale: pass isStale(versions?.devcontainer, serverStamps.devcontainer) from the call site.
// undefined means "unknown" — defaults to the safe rebuild advice.
function stampTooltip(stamp: string | null | undefined, serverStamp?: string | null, devcStale?: boolean): string {
  if (!stamp || stamp === '(no stamp)') return 'Unknown status — no version stamp found';
  const [hash, ts, component] = stamp.split(' ');
  if (isStale(stamp, serverStamp)) {
    const serverHash = stampHash(serverStamp);
    const needsRebuild = devcStale !== false; // undefined → assume yes (safe default)
    const advice = needsRebuild
      ? 'Update the devcontainer on the host first, then rebuild the container.'
      : component === 'planq-shell'
        ? 'Run: update-projects.sh apply-shell'
        : 'Run: update-projects.sh apply-all';
    const lines = [`Outdated — ${component ?? 'component'} needs updating`, advice];
    if (hash) lines.push(`installed: ${hash}`);
    if (serverHash) lines.push(`current:   ${serverHash}`);
    if (ts) lines.push(`stamped: ${ts}`);
    return lines.join('\n');
  }
  if (!serverStamp) {
    const lines = [`Cannot compare — no server reference for ${component ?? 'this component'}`,
      'Run apply-devcontainer on this host to establish a reference, then check again.'];
    if (hash) lines.push(`installed: ${hash}`);
    if (ts) lines.push(`stamped: ${ts}`);
    return lines.join('\n');
  }
  const lines = ['Up to date'];
  if (component) lines.push(`component: ${component}`);
  if (hash) lines.push(`hash: ${hash}`);
  if (ts) lines.push(`stamped: ${ts}`);
  return lines.join('\n');
}

// Returns true when the running daemon hash differs from the installed file hash.
function daemonNeedsRestart(versions: Record<string, string | null> | null | undefined): boolean {
  const fileStamp = versions?.planq_daemon;
  const runningHash = versions?.planq_daemon_running;
  if (!fileStamp || fileStamp === '(no stamp)') return false;
  const fileHash = stampHash(fileStamp);
  return !!(fileHash && runningHash && runningHash !== fileHash);
}

async function restartDaemon(containerId: string) {
  try {
    await fetch(`${API_BASE}/dashboard/restart-planq/${encodeURIComponent(containerId)}`, { method: 'POST' });
  } catch {}
}

// Daemon-specific helpers: distinguish "needs update" vs "needs restart"
function daemonStampSymbol(versions: Record<string, string | null> | null | undefined): string {
  const fileStamp = versions?.planq_daemon;
  const runningHash = versions?.planq_daemon_running;
  if (!fileStamp || fileStamp === '(no stamp)') return '\u2014';
  const fileHash = stampHash(fileStamp);
  if (runningHash && fileHash && runningHash !== fileHash) return '\u21BA'; // ↺ restart symbol
  return '\u2713';
}

function daemonStampClass(versions: Record<string, string | null> | null | undefined): string {
  const fileStamp = versions?.planq_daemon;
  const runningHash = versions?.planq_daemon_running;
  if (!fileStamp || fileStamp === '(no stamp)') return 'stamp stamp-missing';
  const fileHash = stampHash(fileStamp);
  if (runningHash && fileHash && runningHash !== fileHash) return 'stamp stamp-restart';
  if (isStale(fileStamp, serverStamps.value.planq_daemon)) return 'stamp stamp-stale';
  return 'stamp stamp-ok';
}

function daemonStampTooltip(versions: Record<string, string | null> | null | undefined): string {
  const fileStamp = versions?.planq_daemon;
  const runningHash = versions?.planq_daemon_running;
  if (!fileStamp || fileStamp === '(no stamp)') return 'Unknown status — no version stamp found';
  const [fileHash, ts] = fileStamp.split(' ');
  if (runningHash && fileHash && runningHash !== fileHash) {
    return [
      'File updated — daemon needs restart',
      `file hash:    ${fileHash}`,
      `running hash: ${runningHash}`,
      `stamped: ${ts ?? '?'}`,
    ].join('\n');
  }
  if (isStale(fileStamp, serverStamps.value.planq_daemon)) {
    const serverHash = stampHash(serverStamps.value.planq_daemon);
    // Treat devcontainer as stale when the server has no reference (null) — safe default.
    const devcStale = !serverStamps.value.devcontainer
      || isStale(versions?.devcontainer, serverStamps.value.devcontainer);
    const advice = devcStale
      ? 'Update the devcontainer on the host first, then rebuild the container.'
      : 'Run: update-projects.sh apply-daemon';
    return [
      'Outdated — planq-daemon needs updating',
      advice,
      `installed: ${fileHash}`,
      `current:   ${serverHash ?? '?'}`,
      `stamped: ${ts ?? '?'}`,
    ].join('\n');
  }
  return ['Daemon up to date', `hash: ${fileHash}`, `stamped: ${ts ?? '?'}`].join('\n');
}

// Returns true if any stamp on this container is stale or unverifiable vs the server reference.
// "unverifiable" = stamp exists but serverStamp is null (can't confirm it's current).
function isStampProblem(stamp: string | null | undefined, serverStamp: string | null | undefined): boolean {
  if (!stamp || stamp === '(no stamp)') return false;
  if (!serverStamp) return true;  // stamp present but no reference — warn
  return isStale(stamp, serverStamp);
}

function isContainerStale(c: ContainerVersion): boolean {
  if (!c.versions) return false;
  return (
    isStampProblem(c.versions.devcontainer, serverStamps.value.devcontainer) ||
    isStale(c.versions.planq_daemon, serverStamps.value.planq_daemon) ||
    isStale(c.versions.planq_shell, serverStamps.value.planq_shell)
  );
}

// Returns true if any container on the given hostname is stale.
function isHostStale(hostname: string): boolean {
  return containerVersions.value.some(c => c.machine_hostname === hostname && isContainerStale(c));
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

async function copyPopup() {
  const text = tooltip.value.text;
  if (navigator.clipboard) {
    try { await navigator.clipboard.writeText(text); return; } catch {}
  }
  // Fallback for non-HTTPS contexts where clipboard API is unavailable
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;opacity:0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch {}
  document.body.removeChild(ta);
}

// Compute the longest common path prefix for worktrees on each host.
const hostPathPrefixes = computed(() => {
  const byHost = new Map<string, string[]>();
  for (const c of containerVersions.value) {
    if (!c.workspace_host_path) continue;
    const list = byHost.get(c.machine_hostname) ?? [];
    list.push(c.workspace_host_path.replace(/\\/g, '/'));
    byHost.set(c.machine_hostname, list);
  }
  const result = new Map<string, string>();
  for (const [host, paths] of byHost) {
    if (paths.length === 0) continue;
    let prefix = paths[0];
    for (const p of paths.slice(1)) {
      while (prefix && !p.startsWith(prefix)) {
        const last = prefix.lastIndexOf('/', prefix.length - 2);
        prefix = last > 0 ? prefix.substring(0, last + 1) : '';
      }
    }
    // Only strip a prefix that ends at a / boundary with at least one component left
    if (prefix && prefix !== '/' && paths.some(p => p !== prefix)) {
      result.set(host, prefix);
    }
  }
  return result;
});

function displayPath(path: string, hostname: string): string {
  const norm = path.replace(/\\/g, '/');
  const prefix = hostPathPrefixes.value.get(hostname) ?? '';
  if (prefix && norm.startsWith(prefix)) return norm.substring(prefix.length) || norm;
  return norm;
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
.title-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 12px;
  border-bottom: 1px solid #2a2a45;
  background: #14142a;
  border-radius: 4px 4px 0 0;
}
.title-text {
  font-size: 0.78em;
  font-weight: 600;
  color: #99a;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.toggle-group {
  display: flex;
  gap: 2px;
}
.btn-toggle {
  font-size: 0.75em;
  padding: 2px 8px;
  border-radius: 3px;
  border: 1px solid #444;
  background: #252545;
  color: #888;
  cursor: pointer;
}
.btn-toggle:hover { background: #333365; }
.btn-toggle-active { color: #dde; border-color: #668; background: #2a2a55; }
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
.stamp-restart { background: #3a2a00; color: #fa0; }
.stamp-stale { background: #3a3000; color: #fa0; }
.stamp-unknown { background: #2a2040; color: #a08; }
.host-stale { color: #fa0; cursor: help; }
.stamp-hash { font-family: monospace; }
.loading, .error { font-size: 0.85em; padding: 4px 0; }
.error { color: #f66; }
.daemon-cell { white-space: nowrap; }
.daemon-restart-btn {
  margin-left: 4px;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1em;
  padding: 0 2px;
  vertical-align: middle;
  opacity: 0.8;
}
.daemon-restart-btn:hover { opacity: 1; }
.stamp-popup {
  position: absolute;
  z-index: 9999;
  background: #1e1e3a;
  border: 1px solid #555;
  border-radius: 4px;
  padding: 6px 10px;
  padding-top: 24px;
  font-size: 0.8em;
  color: #ccc;
  max-width: 360px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.5);
}
.popup-content {
  margin: 0;
  white-space: pre;
  user-select: text;
  cursor: text;
}
.popup-close-btn, .popup-copy-btn {
  position: absolute;
  top: 4px;
  background: transparent;
  border: none;
  color: #888;
  cursor: pointer;
  font-size: 0.9em;
  padding: 0 4px;
  line-height: 1;
}
.popup-close-btn { right: 4px; }
.popup-copy-btn  { right: 24px; }
.popup-close-btn:hover, .popup-copy-btn:hover { color: #fff; }
</style>
