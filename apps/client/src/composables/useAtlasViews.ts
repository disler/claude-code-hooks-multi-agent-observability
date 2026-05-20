// Client-side composables for the new dashboard views.
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { API_BASE_URL } from '../config';

function makePoller<T>(url: string, intervalMs: number, initial: T) {
  const data = ref<T>(initial);
  const loading = ref(false);
  let activeRefs = 0;
  let timer: number | null = null;

  async function refresh() {
    if (loading.value) return;
    loading.value = true;
    try {
      const r = await fetch(`${API_BASE_URL}${url}`);
      if (r.ok) data.value = await r.json();
    } catch { /* silent */ }
    finally { loading.value = false; }
  }

  function start() {
    activeRefs++;
    if (!timer) {
      refresh();
      timer = window.setInterval(refresh, intervalMs);
    }
  }
  function stop() {
    activeRefs--;
    if (activeRefs <= 0 && timer) { clearInterval(timer); timer = null; }
  }

  return { data, loading, refresh, start, stop };
}

// ---- Proposals (Layer 5 self-improvement queue) ----
export type ProposalRow = {
  id: string;
  source_path: string;
  created: string;
  proposer_division: string;
  proposer_agent: string;
  type: string;
  target_file: string;
  rationale_preview: string;
  diff_preview: string;
  human_only: boolean;
  applyable_in_layer_5a: boolean;
  velocity_state: 'in_window' | 'queued_over_cap';
  status: 'pending' | 'queued' | 'applied' | 'rejected' | 'deferred';
};
export function useAtlasProposals() {
  // Endpoint returns { items: ProposalRow[] }; expose the unwrapped array.
  const { data, loading, refresh, start, stop } = makePoller<{ items: ProposalRow[] }>(
    '/api/atlas/proposals', 30_000, { items: [] });
  onMounted(start); onUnmounted(stop);
  const proposals = computed(() => data.value?.items || []);
  return { proposals, loading, refresh };
}

export async function actOnProposal(
  id: string,
  action: 'approve' | 'reject' | 'defer' | 'rollback',
  opts?: { note?: string },
): Promise<{ ok: boolean; message: string }> {
  try {
    const r = await fetch(`${API_BASE_URL}/api/atlas/proposals/${encodeURIComponent(id)}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ surface: 'dashboard', approver: 'operator', note: opts?.note || '' }),
    });
    return await r.json();
  } catch (err: any) {
    return { ok: false, message: `request failed: ${err.message}` };
  }
}

export async function fetchProposalYaml(id: string): Promise<string | null> {
  try {
    const r = await fetch(`${API_BASE_URL}/api/atlas/proposals/${encodeURIComponent(id)}?format=yaml`);
    if (!r.ok) return null;
    const d = await r.json();
    return d.yaml || null;
  } catch { return null; }
}

export async function editProposalYaml(id: string, yamlText: string): Promise<{ ok: boolean; message: string }> {
  try {
    const r = await fetch(`${API_BASE_URL}/api/atlas/proposals/${encodeURIComponent(id)}/edit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ surface: 'dashboard', approver: 'operator', yaml: yamlText }),
    });
    return await r.json();
  } catch (err: any) {
    return { ok: false, message: `request failed: ${err.message}` };
  }
}

// ---- Missions ----
export function useAtlasMissions() {
  const { data, loading, refresh, start, stop } = makePoller<{ missions: any[] }>('/api/atlas/missions', 60_000, { missions: [] });
  onMounted(start); onUnmounted(stop);
  return { missions: data, loading, refresh };
}

// ---- Scout ----
export function useAtlasScout() {
  const { data, loading, refresh, start, stop } = makePoller<{ candidates: any[]; trials: any[]; sweeps: any[] }>(
    '/api/atlas/scout', 120_000, { candidates: [], trials: [], sweeps: [] });
  onMounted(start); onUnmounted(stop);
  return { scout: data, loading, refresh };
}

// ---- Drift ----
export function useAtlasDrift() {
  const { data, loading, refresh, start, stop } = makePoller<{ report: any | null }>('/api/atlas/drift/latest', 5 * 60_000, { report: null });
  onMounted(start); onUnmounted(stop);
  return { drift: data, loading, refresh };
}

// ---- Routing corrections ----
export function useAtlasRoutingCorrections() {
  const { data, loading, refresh, start, stop } = makePoller<{ entries: any[] }>('/api/atlas/routing/corrections?days=14', 5 * 60_000, { entries: [] });
  onMounted(start); onUnmounted(stop);
  return { corrections: data, loading, refresh };
}

// ---- Spend detail ----
export function useAtlasSpendDetail() {
  const { data, loading, refresh, start, stop } = makePoller<{ by_action_kind: Record<string, number>; sparkline: Array<{ date: string; calls: number }>; window_days: number }>(
    '/api/atlas/spend/detail?days=14', 60_000, { by_action_kind: {}, sparkline: [], window_days: 14 });
  onMounted(start); onUnmounted(stop);
  return { spend: data, loading, refresh };
}

// ---- Division detail (on-demand) ----
export async function fetchDivisionDetail(slug: string): Promise<any | null> {
  try {
    const r = await fetch(`${API_BASE_URL}/api/atlas/divisions/${encodeURIComponent(slug)}`);
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

// ---- Per-model spend ----
export function useAtlasSpendByModel() {
  const { data, loading, refresh, start, stop } = makePoller<{ by_model: Record<string, any>; daily: any[]; days: number }>(
    '/api/atlas/spend/models?days=14', 5 * 60_000, { by_model: {}, daily: [], days: 14 });
  onMounted(start); onUnmounted(stop);
  return { spend: data, loading, refresh };
}

// ---- GitHub feed ----
export function useGitHubFeed() {
  const { data, loading, refresh, start, stop } = makePoller<{ ok: boolean; items: any[]; message?: string }>(
    '/api/atlas/github/feed', 5 * 60_000, { ok: false, items: [] });
  onMounted(start); onUnmounted(stop);
  return { feed: data, loading, refresh };
}

// ---- All agents (for hover-preview) ----
export function useAllAgents() {
  const { data, loading, start, stop } = makePoller<{ agents: any[] }>(
    '/api/atlas/agents', 60 * 60_000, { agents: [] });
  onMounted(start); onUnmounted(stop);
  return { agents: data, loading };
}

// ---- Quick-reply suggestions ----
export async function fetchSuggestions(lastUser: string, lastReply: string): Promise<string[]> {
  try {
    const r = await fetch(`${API_BASE_URL}/api/atlas/suggestions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ last_user: lastUser, last_reply: lastReply }),
    });
    if (!r.ok) return [];
    const d = await r.json();
    return Array.isArray(d.suggestions) ? d.suggestions : [];
  } catch { return []; }
}

// ---- Audit search (on-demand) ----
export type AuditFilter = {
  division?: string; agent?: string; outcome?: string; action?: string;
  q?: string; from?: string; to?: string; limit?: number;
};
export async function searchAudit(filter: AuditFilter): Promise<any[]> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filter)) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  }
  try {
    const r = await fetch(`${API_BASE_URL}/api/atlas/audit/search?${params.toString()}`);
    if (!r.ok) return [];
    const data = await r.json();
    return data.entries || [];
  } catch { return []; }
}
