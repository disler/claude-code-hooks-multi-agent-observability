import { ref, onMounted } from 'vue';
import type { PlanSummary } from '../types';
import { API_BASE_URL, WS_URL } from '../config';

// Shared store so every consumer of the dashboard (DivisionTile, PlanPhases)
// sees the same plan map.
const plans = ref<Record<string, PlanSummary>>({});
let _wsAttached = false;

async function refreshAll() {
  try {
    const r = await fetch(`${API_BASE_URL}/api/atlas/plans`);
    if (!r.ok) return;
    const body = await r.json() as { plans: PlanSummary[] };
    const next: Record<string, PlanSummary> = {};
    for (const p of body.plans) next[p.project] = p;
    plans.value = next;
  } catch { /* swallow */ }
}

function attachWs() {
  if (_wsAttached) return;
  _wsAttached = true;
  // Parallel listener — keeps the main useWebSocket() events stream untouched.
  // The dashboard's primary socket carries event records; this one mirrors
  // plan_update messages into the shared store.
  try {
    const ws = new WebSocket(WS_URL);
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'plan_update' && msg.project && msg.plan) {
          plans.value = { ...plans.value, [msg.project]: msg.plan };
        }
      } catch { /* ignore */ }
    };
    ws.onclose = () => {
      _wsAttached = false;
      // Reconnect on a 3s timer to match the main WS composable's behaviour.
      setTimeout(attachWs, 3000);
    };
    ws.onerror = () => {
      try { ws.close(); } catch {}
    };
  } catch {
    _wsAttached = false;
  }
}

export function postAtlasEvent(event: string, payload: Record<string, any>): Promise<void> {
  return fetch(`${API_BASE_URL}/api/atlas/events/dispatch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, payload }),
  }).then(() => undefined).catch(() => undefined);
}

export function useAtlasPlans() {
  onMounted(() => {
    refreshAll();
    attachWs();
  });
  return { plans, refreshAll };
}
