import { ref, onMounted, onUnmounted } from 'vue';
import { API_BASE_URL } from '../config';

export interface AtlasStats {
  generated_at: string;
  codeburn: {
    today: { dollars: number; calls: number } | null;
    month: { dollars: number; calls: number } | null;
    error: string | null;
  };
  caveman: { sessions: number; error: string | null };
  briefs: {
    recent: Array<{ path: string; filename: string; url: string; title?: string; date?: string; topic?: string }>;
    error: string | null;
  };
  services: {
    healthy: number;
    total: number;
    items: Array<{ name: string; pid: number | null; last_exit: number; status: string }>;
    error: string | null;
  };
}

const stats = ref<AtlasStats | null>(null);
const loading = ref(false);
let activeRefs = 0;
let timer: number | null = null;

async function refresh() {
  if (loading.value) return;
  loading.value = true;
  try {
    const res = await fetch(`${API_BASE_URL}/api/atlas/stats`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    stats.value = await res.json();
  } catch (err) {
    console.error('[atlas-stats] fetch failed', err);
  } finally {
    loading.value = false;
  }
}

export function useAtlasStats() {
  onMounted(() => {
    activeRefs++;
    if (!stats.value) refresh();
    if (timer === null) {
      timer = window.setInterval(refresh, 30_000);
    }
  });

  onUnmounted(() => {
    activeRefs--;
    if (activeRefs <= 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  });

  return { stats, loading, refresh };
}
