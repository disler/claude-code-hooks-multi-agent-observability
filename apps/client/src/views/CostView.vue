<template>
  <div class="costview">
    <header class="costview__header">
      <button type="button" class="costview__back" @click="$emit('close')">← Today</button>
      <div class="costview__title-block">
        <h1>Cost</h1>
        <p>Spend sliced by agent, project, goal, or task · tokens + USD · ledger + event store.</p>
      </div>
      <div class="costview__meta">
        <span class="costview__updated" :title="generatedAt">updated {{ relativeTime(generatedAt) }}</span>
        <button type="button" class="costview__close" @click="$emit('close')" aria-label="Close">×</button>
      </div>
    </header>

    <main class="costview__body">
      <p v-if="error" class="costview__error">{{ error }}</p>

      <!-- Over-budget banner (warn + paused agents this month) -->
      <section v-if="overBudget.length" class="costview__budget-banner" role="status">
        <span class="costview__budget-banner-label">Agents over budget:</span>
        <span
          v-for="a in overBudget"
          :key="a.agent_id"
          :class="['costview__budget-chip', `is-${a.state}`]"
          :title="`$${a.spent_usd.toFixed(2)} / $${a.monthly_usd.toFixed(2)}`"
        >
          {{ a.agent_id }} · {{ Math.round(a.pct * 100) }}%
        </span>
      </section>

      <!-- KPI cards -->
      <section class="costview__kpis">
        <article class="costview__kpi">
          <div class="costview__kpi-label">Total cost</div>
          <div class="costview__kpi-value">${{ fmtUsd(totals.cost_usd) }}</div>
        </article>
        <article class="costview__kpi">
          <div class="costview__kpi-label">Total tokens</div>
          <div class="costview__kpi-value">{{ fmtTokens(totals.tokens_in + totals.tokens_out) }}</div>
          <div class="costview__kpi-sub">
            <span>in {{ fmtTokens(totals.tokens_in) }}</span>
            <span>out {{ fmtTokens(totals.tokens_out) }}</span>
          </div>
        </article>
        <article class="costview__kpi">
          <div class="costview__kpi-label">Active agents</div>
          <div class="costview__kpi-value">{{ activeAgentCount }}</div>
          <div class="costview__kpi-sub"><span>{{ totals.count }} entries</span></div>
        </article>
        <article class="costview__kpi costview__kpi--ctl">
          <div class="costview__kpi-label">Window</div>
          <div class="costview__window">
            <button
              v-for="w in WINDOWS" :key="w.id"
              type="button"
              :class="['costview__win-btn', { 'is-active': window === w.id }]"
              @click="window = w.id"
            >{{ w.label }}</button>
          </div>
        </article>
      </section>

      <!-- Tab strip -->
      <nav class="costview__tabs" role="tablist">
        <button
          v-for="t in TABS" :key="t.id"
          type="button"
          role="tab"
          :aria-selected="slice === t.id"
          :class="['costview__tab', { 'is-active': slice === t.id }]"
          @click="slice = t.id"
        >{{ t.label }}</button>
      </nav>

      <!-- Slice table -->
      <section v-if="rows.length" class="costview__table-wrap">
        <table class="costview__table">
          <thead>
            <tr>
              <th class="costview__col-key">{{ sliceLabel }}</th>
              <th class="costview__col-num">Cost</th>
              <th class="costview__col-num">Tokens in</th>
              <th class="costview__col-num">Tokens out</th>
              <th class="costview__col-num">Entries</th>
              <th class="costview__col-bar" aria-label="Share"></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in rows"
              :key="row.key"
              :class="['costview__row', { 'is-selected': selected?.key === row.key }]"
              @click="onSelect(row)"
            >
              <td class="costview__col-key">
                <span class="costview__key-text">{{ row.key }}</span>
              </td>
              <td class="costview__col-num costview__col-cost">${{ fmtUsd(row.cost_usd) }}</td>
              <td class="costview__col-num costview__col-mono">{{ fmtTokens(row.tokens_in) }}</td>
              <td class="costview__col-num costview__col-mono">{{ fmtTokens(row.tokens_out) }}</td>
              <td class="costview__col-num costview__col-mono">{{ row.count }}</td>
              <td class="costview__col-bar">
                <div class="costview__bar-track">
                  <div class="costview__bar-fill" :style="{ width: pct(row.cost_usd) + '%' }"></div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <p v-else-if="!loading" class="costview__empty">
        No spend recorded yet. See <code>docs/agent-adapter-contract.md</code> for how to log agent spend.
      </p>
    </main>

    <!-- Drawer -->
    <aside v-if="selected" class="costview__drawer" role="dialog" aria-label="Cost detail">
      <header class="costview__drawer-head">
        <div class="costview__drawer-id">
          <div class="costview__drawer-eyebrow">{{ sliceLabel }}</div>
          <div class="costview__drawer-name">{{ selected.key }}</div>
        </div>
        <button class="costview__drawer-close" type="button" @click="selected = null" aria-label="Close">×</button>
      </header>
      <div class="costview__drawer-stats">
        <div><span>Cost</span><b>${{ fmtUsd(selected.cost_usd) }}</b></div>
        <div><span>In</span><b>{{ fmtTokens(selected.tokens_in) }}</b></div>
        <div><span>Out</span><b>{{ fmtTokens(selected.tokens_out) }}</b></div>
        <div><span>Entries</span><b>{{ selected.count }}</b></div>
      </div>
      <div class="costview__drawer-body">
        <h3 class="costview__drawer-h3">Last 30 days</h3>
        <p v-if="sparkLoading" class="costview__drawer-loading">loading…</p>
        <div v-else-if="sparkPoints.length" class="costview__spark">
          <div class="costview__spark-row">
            <div
              v-for="(p, i) in sparkPoints"
              :key="i"
              class="costview__spark-bar"
              :style="{ height: sparkHeight(p.cost_usd) + '%' }"
              :title="`${new Date(p.bucket_ts).toISOString().slice(0,10)} — $${fmtUsd(p.cost_usd)}`"
            ></div>
          </div>
          <div class="costview__spark-axis">
            <span>{{ axisStart }}</span>
            <span>{{ axisEnd }}</span>
          </div>
        </div>
        <p v-else class="costview__drawer-empty">No history in the last 30 days.</p>
      </div>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';

defineEmits<{ (e: 'close'): void }>();

type Slice = 'agent' | 'project' | 'goal' | 'task';
type WindowId = '24h' | '7d' | '30d' | 'all';

interface Row { key: string; tokens_in: number; tokens_out: number; cost_usd: number; count: number }
interface Totals { tokens_in: number; tokens_out: number; cost_usd: number; count: number }
interface SparkPoint { bucket_ts: number; cost_usd: number }

const TABS: Array<{ id: Slice; label: string }> = [
  { id: 'agent',   label: 'Agent' },
  { id: 'project', label: 'Project' },
  { id: 'goal',    label: 'Goal' },
  { id: 'task',    label: 'Task' },
];

const WINDOWS: Array<{ id: WindowId; label: string }> = [
  { id: '24h', label: '24h' },
  { id: '7d',  label: '7d'  },
  { id: '30d', label: '30d' },
  { id: 'all', label: 'All' },
];

const API = (import.meta as any).env?.VITE_API_URL || 'http://localhost:4000';

const slice = ref<Slice>('agent');
const window_ = ref<WindowId>('30d');
// shadow alias so template can read `window` without colliding with browser global
const window = window_;

const rows = ref<Row[]>([]);
const totals = ref<Totals>({ tokens_in: 0, tokens_out: 0, cost_usd: 0, count: 0 });
const loading = ref(false);
const error = ref<string | null>(null);
const generatedAt = ref<string>('');

const selected = ref<Row | null>(null);
const sparkPoints = ref<SparkPoint[]>([]);
const sparkLoading = ref(false);

interface BudgetStatus {
  agent_id: string;
  monthly_usd: number;
  spent_usd: number;
  pct: number;
  state: 'ok' | 'warn' | 'paused';
}
const budgetStatuses = ref<BudgetStatus[]>([]);
const overBudget = computed(() =>
  budgetStatuses.value
    .filter(b => b.state === 'warn' || b.state === 'paused')
    .sort((a, b) => b.pct - a.pct)
);

let poll: number | null = null;

const sliceLabel = computed(() => TABS.find(t => t.id === slice.value)?.label || 'Agent');

const activeAgentCount = computed(() => {
  if (slice.value === 'agent') return rows.value.length;
  // fall back to "rows.length" for non-agent slices; users still get a sane signal.
  return rows.value.length;
});

function sinceMs(): number | undefined {
  const now = Date.now();
  switch (window_.value) {
    case '24h': return now - 86_400_000;
    case '7d':  return now - 7 * 86_400_000;
    case '30d': return now - 30 * 86_400_000;
    case 'all': return undefined;
  }
}

async function loadCost() {
  loading.value = true;
  try {
    const since = sinceMs();
    const params = new URLSearchParams({ slice: slice.value });
    if (since !== undefined) params.set('since', String(since));
    const [costR, budgetR] = await Promise.allSettled([
      fetch(`${API}/api/atlas/cost?${params.toString()}`),
      fetch(`${API}/api/atlas/budget`),
    ]);
    if (costR.status === 'rejected' || !costR.value.ok) {
      throw new Error(
        costR.status === 'rejected'
          ? (costR.reason?.message || 'network error')
          : `HTTP ${costR.value.status}`
      );
    }
    const j = await costR.value.json();
    rows.value = Array.isArray(j.rows) ? j.rows : [];
    totals.value = j.totals || { tokens_in: 0, tokens_out: 0, cost_usd: 0, count: 0 };
    generatedAt.value = new Date().toISOString();
    error.value = null;
    if (selected.value) {
      const fresh = rows.value.find(r => r.key === selected.value!.key);
      selected.value = fresh || null;
    }
    // Budget fetch is best-effort. Failure hides the banner silently.
    if (budgetR.status === 'fulfilled' && budgetR.value.ok) {
      try {
        const bj = await budgetR.value.json();
        budgetStatuses.value = Array.isArray(bj.agents) ? bj.agents : [];
      } catch {
        budgetStatuses.value = [];
      }
    } else {
      budgetStatuses.value = [];
    }
  } catch (e: any) {
    error.value = e?.message || 'failed to load cost view';
  } finally {
    loading.value = false;
  }
}

async function loadSpark(row: Row) {
  sparkLoading.value = true;
  sparkPoints.value = [];
  try {
    const params = new URLSearchParams({ slice: slice.value, key: row.key, bucket: 'day' });
    const r = await fetch(`${API}/api/atlas/cost/sparkline?${params.toString()}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    sparkPoints.value = Array.isArray(j.points) ? j.points : [];
  } catch {
    sparkPoints.value = [];
  } finally {
    sparkLoading.value = false;
  }
}

function onSelect(row: Row) {
  selected.value = row;
  loadSpark(row);
}

function fmtUsd(n: number): string {
  if (!Number.isFinite(n)) return '0.00';
  if (n >= 100) return n.toFixed(2);
  if (n >= 1)   return n.toFixed(3);
  return n.toFixed(4);
}

function fmtTokens(n: number): string {
  if (!Number.isFinite(n)) return '0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'k';
  return String(Math.round(n));
}

function pct(cost: number): number {
  const max = rows.value[0]?.cost_usd || 0;
  if (!max || !Number.isFinite(cost)) return 0;
  return Math.max(2, Math.round((cost / max) * 100));
}

function sparkHeight(c: number): number {
  const max = sparkPoints.value.reduce((m, p) => Math.max(m, p.cost_usd || 0), 0);
  if (!max) return 0;
  return Math.max(2, Math.round((c / max) * 100));
}

function relativeTime(iso: string): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  if (diff < 5_000) return 'just now';
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return `${Math.round(diff / 86_400_000)}d ago`;
}

const axisStart = computed(() => {
  if (!sparkPoints.value.length) return '';
  return new Date(sparkPoints.value[0].bucket_ts).toISOString().slice(5, 10);
});
const axisEnd = computed(() => {
  if (!sparkPoints.value.length) return '';
  return new Date(sparkPoints.value[sparkPoints.value.length - 1].bucket_ts).toISOString().slice(5, 10);
});

watch([slice, window_], () => {
  selected.value = null;
  loadCost();
});

onMounted(() => {
  loadCost();
  poll = (globalThis as any).setInterval(loadCost, 10000) as unknown as number;
});
onBeforeUnmount(() => {
  if (poll !== null) (globalThis as any).clearInterval(poll);
});
</script>

<style scoped>
.costview {
  position: fixed; inset: 0;
  background: var(--atlas-page-bg);
  color: var(--atlas-text-primary);
  z-index: var(--atlas-z-modal);
  overflow: auto;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif;
  display: flex; flex-direction: column;
}

.costview__header {
  display: flex; align-items: flex-start; gap: 16px;
  padding: 28px 48px 18px;
  border-bottom: 1px solid var(--atlas-hairline);
}
@media (max-width: 1023px) { .costview__header { padding: 18px 16px 14px; } }
.costview__back {
  background: transparent; border: none; cursor: pointer;
  color: var(--atlas-text-muted); font-size: var(--atlas-text-sm);
  padding: 4px 8px; margin-top: 4px;
}
.costview__back:hover { color: var(--atlas-text-strong); }
.costview__title-block { flex: 1; }
.costview__title-block h1 {
  font-size: 32px; font-weight: 700; margin: 0 0 6px; letter-spacing: -0.02em;
}
.costview__title-block p {
  margin: 0; font-size: var(--atlas-text-sm); color: var(--atlas-text-muted);
}
.costview__meta { display: flex; align-items: center; gap: 12px; }
.costview__updated {
  font-size: var(--atlas-text-xs);
  color: var(--atlas-text-muted);
  font-variant-numeric: tabular-nums;
}
.costview__close {
  background: transparent; border: none; color: var(--atlas-text-muted);
  font-size: 28px; line-height: 1; cursor: pointer; padding: 4px 8px;
}
.costview__close:hover { color: var(--atlas-text-strong); }

.costview__body {
  padding: 32px 48px 64px;
  max-width: 1400px; margin: 0 auto;
  width: 100%; box-sizing: border-box;
  flex: 1;
}
@media (max-width: 1023px) { .costview__body { padding: 20px 16px 48px; } }
.costview__error {
  color: var(--atlas-danger);
  font-size: var(--atlas-text-sm);
  margin: 0 0 16px;
}
.costview__empty {
  color: var(--atlas-text-muted);
  font-size: var(--atlas-text-sm);
  text-align: center; margin-top: 80px;
}
.costview__empty a { color: var(--atlas-blue); text-decoration: none; }
.costview__empty a:hover { text-decoration: underline; }

/* Budget banner — over-budget agents */
.costview__budget-banner {
  display: flex; align-items: center; flex-wrap: wrap;
  gap: 8px;
  padding: 10px 14px;
  margin: 0 0 16px;
  background: var(--atlas-card-bg);
  border: 1px solid var(--atlas-hairline);
  border-radius: var(--atlas-radius-sm);
  font-size: var(--atlas-text-sm);
}
.costview__budget-banner-label {
  color: var(--atlas-text-muted);
  font-weight: 600;
  font-size: var(--atlas-text-xs);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.costview__budget-chip {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: var(--atlas-text-xs);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  border: 1px solid transparent;
}
.costview__budget-chip.is-warn {
  background: rgba(245, 158, 11, 0.14);
  color: #b45309;
  border-color: rgba(245, 158, 11, 0.32);
}
.costview__budget-chip.is-paused {
  background: rgba(239, 68, 68, 0.14);
  color: var(--atlas-red, #dc2626);
  border-color: rgba(239, 68, 68, 0.32);
}

/* KPIs */
.costview__kpis {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 28px;
}
@media (max-width: 900px) { .costview__kpis { grid-template-columns: repeat(2, 1fr); } }
.costview__kpi {
  background: var(--atlas-card-bg);
  border: 1px solid var(--atlas-hairline);
  border-radius: var(--atlas-radius-md);
  padding: 14px 16px;
  display: flex; flex-direction: column; gap: 4px;
}
.costview__kpi-label {
  font-size: var(--atlas-text-xs);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--atlas-text-muted);
}
.costview__kpi-value {
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--atlas-text-strong);
  font-variant-numeric: tabular-nums;
}
.costview__kpi-sub {
  display: flex; gap: 12px;
  font-size: var(--atlas-text-xs);
  color: var(--atlas-text-muted);
  font-variant-numeric: tabular-nums;
}
.costview__kpi--ctl { gap: 8px; }
.costview__window { display: flex; gap: 4px; }
.costview__win-btn {
  background: transparent;
  border: 1px solid var(--atlas-hairline);
  color: var(--atlas-text-secondary);
  font-size: var(--atlas-text-xs);
  padding: 5px 9px;
  border-radius: var(--atlas-radius-sm);
  cursor: pointer;
  font-family: inherit;
  transition: background var(--atlas-duration-fast) var(--atlas-ease);
}
.costview__win-btn:hover { background: var(--atlas-card-bg-2, var(--atlas-card-bg)); }
.costview__win-btn.is-active {
  background: var(--atlas-blue-soft);
  border-color: var(--atlas-blue);
  color: var(--atlas-text-strong);
}

/* Tabs */
.costview__tabs {
  display: flex; gap: 0;
  border-bottom: 1px solid var(--atlas-hairline);
  margin-bottom: 20px;
}
.costview__tab {
  background: transparent;
  border: none;
  padding: 10px 16px;
  cursor: pointer;
  color: var(--atlas-text-muted);
  font-family: inherit;
  font-size: var(--atlas-text-sm);
  font-weight: 500;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: color var(--atlas-duration-fast) var(--atlas-ease);
}
.costview__tab:hover { color: var(--atlas-text-primary); }
.costview__tab.is-active {
  color: var(--atlas-text-strong);
  border-bottom-color: var(--atlas-blue);
  font-weight: 600;
}

/* Table */
.costview__table-wrap { width: 100%; overflow-x: auto; }
.costview__table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--atlas-text-sm);
}
.costview__table thead th {
  text-align: left;
  font-weight: 600;
  font-size: var(--atlas-text-xs);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--atlas-text-muted);
  padding: 10px 12px;
  border-bottom: 1px solid var(--atlas-hairline);
}
.costview__table .costview__col-num { text-align: right; }
.costview__row {
  cursor: pointer;
  transition: background var(--atlas-duration-fast) var(--atlas-ease);
}
.costview__row:hover { background: var(--atlas-card-bg); }
.costview__row.is-selected { background: var(--atlas-blue-soft); }
.costview__row td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--atlas-hairline);
  vertical-align: middle;
}
.costview__col-key { font-weight: 500; color: var(--atlas-text-strong); }
.costview__key-text { font-family: var(--atlas-font-mono); }
.costview__col-cost {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: var(--atlas-text-strong);
}
.costview__col-mono { font-family: var(--atlas-font-mono); font-variant-numeric: tabular-nums; }
.costview__col-bar { width: 30%; min-width: 100px; }
.costview__bar-track {
  width: 100%; height: 6px;
  background: var(--atlas-hairline);
  border-radius: 3px;
  overflow: hidden;
}
.costview__bar-fill {
  height: 100%;
  background: var(--atlas-blue);
  border-radius: 3px;
  transition: width var(--atlas-duration-base) var(--atlas-ease);
}

/* Drawer */
.costview__drawer {
  position: fixed; top: 0; right: 0; bottom: 0;
  width: min(420px, 100vw);
  background: var(--atlas-bg, var(--atlas-page-bg));
  border-left: 1px solid var(--atlas-hairline);
  display: flex; flex-direction: column;
  z-index: calc(var(--atlas-z-modal) + 1);
  box-shadow: -16px 0 32px rgba(0, 0, 0, 0.25);
}
.costview__drawer-head {
  display: flex; align-items: center; gap: 12px;
  padding: 20px 20px 14px;
  border-bottom: 1px solid var(--atlas-hairline);
}
.costview__drawer-id { flex: 1; min-width: 0; }
.costview__drawer-eyebrow {
  font-size: var(--atlas-text-xs);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--atlas-text-muted);
}
.costview__drawer-name {
  font-size: var(--atlas-text-md);
  font-weight: 600;
  color: var(--atlas-text-strong);
  font-family: var(--atlas-font-mono);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.costview__drawer-close {
  background: transparent; border: none;
  color: var(--atlas-text-muted);
  font-size: 24px; line-height: 1;
  cursor: pointer; padding: 4px 8px;
}
.costview__drawer-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  padding: 12px 20px;
  gap: 8px;
  border-bottom: 1px solid var(--atlas-hairline);
}
.costview__drawer-stats > div { display: flex; flex-direction: column; gap: 2px; }
.costview__drawer-stats span {
  font-size: var(--atlas-text-xs);
  color: var(--atlas-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.costview__drawer-stats b {
  font-size: var(--atlas-text-sm);
  color: var(--atlas-text-strong);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
.costview__drawer-body {
  flex: 1; overflow: auto;
  padding: 16px 20px;
}
.costview__drawer-h3 {
  margin: 0 0 12px;
  font-size: var(--atlas-text-xs);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--atlas-text-muted);
  font-weight: 600;
}
.costview__drawer-loading,
.costview__drawer-empty {
  font-size: var(--atlas-text-sm);
  color: var(--atlas-text-muted);
}

/* Sparkline */
.costview__spark {
  display: flex; flex-direction: column; gap: 6px;
}
.costview__spark-row {
  display: flex; align-items: flex-end;
  gap: 2px;
  height: 80px;
  padding: 4px 0;
  border-bottom: 1px solid var(--atlas-hairline);
}
.costview__spark-bar {
  flex: 1;
  min-height: 1px;
  background: var(--atlas-blue);
  border-radius: 1px;
  opacity: 0.85;
  transition: opacity var(--atlas-duration-fast) var(--atlas-ease);
}
.costview__spark-bar:hover { opacity: 1; }
.costview__spark-axis {
  display: flex; justify-content: space-between;
  font-size: var(--atlas-text-xs);
  color: var(--atlas-text-muted);
  font-variant-numeric: tabular-nums;
}
</style>
