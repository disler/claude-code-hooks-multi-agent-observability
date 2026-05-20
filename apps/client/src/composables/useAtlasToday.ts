import { ref, onMounted, onUnmounted, computed } from 'vue';
import { API_BASE_URL } from '../config';

export type TodayUrgency = 'red' | 'yellow' | 'green' | 'white';

export type TodayItem = {
  item_id: string;
  type: string;
  title: string;
  urgency: TodayUrgency;
  priority_rank: number;
  origin: string;
  related_artifact?: string;
  preview: string;
  actions: Array<{ label: string; verb: string; target?: string }>;
  created: string;
  updated: string;
  operator_done: boolean;
  operator_done_at: string | null;
  pinned?: boolean;
};

export type TodayState = {
  queue: TodayItem[];
  deferred: TodayItem[];
  completed_today: TodayItem[];
};

const data = ref<TodayState>({ queue: [], deferred: [], completed_today: [] });
const loading = ref(false);
const lastError = ref<string | null>(null);
let activeRefs = 0;
let timer: number | null = null;

async function refresh() {
  if (loading.value) return;
  loading.value = true;
  try {
    const res = await fetch(`${API_BASE_URL}/api/atlas/today?deferred=1`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data.value = await res.json();
    lastError.value = null;
  } catch (err: any) {
    lastError.value = err.message || String(err);
    console.error('[atlas-today] fetch failed', err);
  } finally {
    loading.value = false;
  }
}

async function postJSON(path: string, body: any): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok && json.ok !== false, message: json.message || (res.ok ? 'ok' : `HTTP ${res.status}`) };
  } catch (err: any) {
    return { ok: false, message: err.message || String(err) };
  }
}

export function useAtlasToday() {
  onMounted(() => {
    activeRefs++;
    if (data.value.queue.length === 0 && data.value.completed_today.length === 0) refresh();
    if (timer === null) timer = window.setInterval(refresh, 15_000);
  });

  onUnmounted(() => {
    activeRefs--;
    if (activeRefs <= 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  });

  const queue = computed(() => data.value.queue);
  const completedToday = computed(() => data.value.completed_today);
  const deferred = computed(() => data.value.deferred);

  async function addItem(text: string, urgency: TodayUrgency = 'green'): Promise<{ ok: boolean; message: string }> {
    const r = await postJSON('/api/atlas/today/add', { text, urgency, surface: 'dashboard' });
    if (r.ok) await refresh();
    return r;
  }

  async function actionItem(itemId: string, verb: string, note?: string): Promise<{ ok: boolean; message: string }> {
    const r = await postJSON(`/api/atlas/today/${encodeURIComponent(itemId)}/${verb}`, { surface: 'dashboard', note });
    if (r.ok) await refresh();
    return r;
  }

  return { queue, completedToday, deferred, loading, lastError, refresh, addItem, actionItem };
}
