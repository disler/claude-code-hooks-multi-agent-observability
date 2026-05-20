<template>
  <div class="orgchart">
    <header class="orgchart__header">
      <button type="button" class="orgchart__back" @click="$emit('close')">← Today</button>
      <div class="orgchart__title-block">
        <h1>Org Chart</h1>
        <p>Atlas agents · live status from the event store · click any card for recent activity.</p>
      </div>
      <div class="orgchart__meta">
        <span class="orgchart__updated" :title="generatedAt">
          updated {{ relativeTime(generatedAt) }}
        </span>
        <button type="button" class="orgchart__close" @click="$emit('close')" aria-label="Close">×</button>
      </div>
    </header>

    <main class="orgchart__body">
      <p v-if="error" class="orgchart__error">{{ error }}</p>

      <section v-if="root" class="orgchart__tree">
        <div class="orgchart__root">
          <AgentCard :agent="root" :selected="selected?.id === root.id" :budget="budgets[root.id] || null" @select="onSelect(root)" />
        </div>
        <div v-if="root.children.length" class="orgchart__edge" aria-hidden="true"></div>
        <div v-if="root.children.length" class="orgchart__row">
          <AgentCard
            v-for="child in root.children"
            :key="child.id"
            :agent="child"
            :selected="selected?.id === child.id"
            :budget="budgets[child.id] || null"
            @select="onSelect(child)"
          />
        </div>
      </section>

      <p v-else-if="!loading" class="orgchart__empty">
        No agents seeded. Add entries to <code>~/atlas/memory/agents.json</code>.
      </p>
    </main>

    <aside v-if="selected" class="orgchart__drawer" role="dialog" aria-label="Agent activity">
      <header class="orgchart__drawer-head">
        <span class="orgchart__avatar" :style="{ background: selected.color }">
          {{ initial(selected.name) }}
        </span>
        <div class="orgchart__drawer-id">
          <div class="orgchart__drawer-name">{{ selected.name }}</div>
          <div class="orgchart__drawer-role">{{ selected.role }}</div>
        </div>
        <button class="orgchart__drawer-close" type="button" @click="selected = null" aria-label="Close">×</button>
      </header>
      <div class="orgchart__drawer-status">
        <span :class="['orgchart__dot', `is-${selected.status}`]"></span>
        <span class="orgchart__drawer-statustxt">{{ selected.status }}</span>
        <span v-if="selected.current_ticket_id" class="orgchart__drawer-ticket">
          ticket {{ selected.current_ticket_id }}
        </span>
      </div>

      <div class="orgchart__drawer-body">
        <h3 class="orgchart__drawer-h3">Recent events</h3>
        <p v-if="eventsLoading" class="orgchart__drawer-loading">loading…</p>
        <ul v-else-if="events.length" class="orgchart__events">
          <li v-for="ev in events" :key="ev.id" class="orgchart__event">
            <div class="orgchart__event-row1">
              <span class="orgchart__event-type">{{ ev.hook_event_type }}</span>
              <span class="orgchart__event-ts">{{ relativeTime(new Date(ev.ts).toISOString()) }}</span>
            </div>
            <div class="orgchart__event-row2">
              <span class="orgchart__event-app">{{ ev.source_app }}</span>
              <span v-if="ev.summary" class="orgchart__event-summary">{{ ev.summary }}</span>
            </div>
          </li>
        </ul>
        <p v-else class="orgchart__drawer-empty">No recent activity in the event store.</p>
      </div>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, h, defineComponent, type PropType } from 'vue';

defineEmits<{ (e: 'close'): void }>();

interface AgentNode {
  id: string;
  name: string;
  role: string;
  reports_to: string | null;
  status: 'idle' | 'running' | 'blocked';
  current_ticket_id: string | null;
  avatar: string | null;
  color: string;
  children: AgentNode[];
}
interface AgentEvent {
  id: number;
  ts: number;
  source_app: string;
  hook_event_type: string;
  session_id: string;
  summary: string | null;
  payload: Record<string, unknown>;
}
interface OrgChartResponse {
  root: AgentNode | null;
  generatedAt: string;
  agents: AgentNode[];
}

interface BudgetStatus {
  agent_id: string;
  monthly_usd: number;
  spent_usd: number;
  pct: number;
  state: 'ok' | 'warn' | 'paused';
}

const API = (import.meta as any).env?.VITE_API_URL || 'http://localhost:4000';

const root = ref<AgentNode | null>(null);
const agents = ref<AgentNode[]>([]);
const generatedAt = ref<string>('');
const loading = ref(false);
const error = ref<string | null>(null);

const selected = ref<AgentNode | null>(null);
const events = ref<AgentEvent[]>([]);
const eventsLoading = ref(false);

const budgets = ref<Record<string, BudgetStatus>>({});

let poll: number | null = null;

async function loadChart() {
  loading.value = true;
  try {
    // Fetch orgchart + budgets in parallel. Budget failure is silent — pills
    // simply don't render. Orgchart failure is loud.
    const [chartResp, budgetResp] = await Promise.allSettled([
      fetch(`${API}/api/atlas/orgchart`),
      fetch(`${API}/api/atlas/budget`),
    ]);

    if (chartResp.status === 'rejected' || !chartResp.value.ok) {
      throw new Error(
        chartResp.status === 'rejected'
          ? (chartResp.reason?.message || 'network error')
          : `HTTP ${chartResp.value.status}`
      );
    }
    const j = (await chartResp.value.json()) as OrgChartResponse;
    root.value = j.root;
    agents.value = j.agents || [];
    generatedAt.value = j.generatedAt;
    error.value = null;
    if (selected.value) {
      const fresh = agents.value.find(a => a.id === selected.value!.id);
      if (fresh) selected.value = fresh;
    }

    if (budgetResp.status === 'fulfilled' && budgetResp.value.ok) {
      try {
        const bj = (await budgetResp.value.json()) as { agents: BudgetStatus[] };
        const map: Record<string, BudgetStatus> = {};
        for (const b of bj.agents || []) map[b.agent_id] = b;
        budgets.value = map;
      } catch {
        budgets.value = {};
      }
    } else {
      budgets.value = {};
    }
  } catch (e: any) {
    error.value = e?.message || 'failed to load org chart';
  } finally {
    loading.value = false;
  }
}

function fmtUsd(n: number): string {
  if (!Number.isFinite(n)) return '0.00';
  return n.toFixed(2);
}

async function loadEvents(agentId: string) {
  eventsLoading.value = true;
  events.value = [];
  try {
    const r = await fetch(`${API}/api/atlas/orgchart/events?agent=${encodeURIComponent(agentId)}&limit=10`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    events.value = Array.isArray(j.events) ? j.events : [];
  } catch {
    events.value = [];
  } finally {
    eventsLoading.value = false;
  }
}

function onSelect(node: AgentNode) {
  selected.value = node;
  loadEvents(node.id);
}

function initial(name: string): string {
  const stripped = name.replace(/^@/, '').trim();
  return stripped.slice(0, 1).toUpperCase() || '?';
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

// Tiny inline card component — kept local so this view is one file.
const AgentCard = defineComponent({
  props: {
    agent: { type: Object as PropType<AgentNode>, required: true },
    selected: { type: Boolean, default: false },
    budget: { type: Object as PropType<BudgetStatus | null>, default: null },
  },
  emits: ['select'],
  setup(props, { emit }) {
    return () => {
      const children: any[] = [
        h(
          'span',
          { class: 'orgchart__avatar', style: { background: props.agent.color } },
          initial(props.agent.name)
        ),
        h('span', { class: 'orgchart__card-name' }, props.agent.name),
        h('span', { class: 'orgchart__card-role' }, props.agent.role),
        h('span', { class: ['orgchart__dot', `is-${props.agent.status}`] }),
      ];
      if (props.budget) {
        const b = props.budget;
        const pctPp = Math.round(b.pct * 100);
        children.push(
          h(
            'span',
            {
              class: ['orgchart__budget-pill', `is-${b.state}`],
              title: `$${fmtUsd(b.spent_usd)} / $${fmtUsd(b.monthly_usd)} (${pctPp}%)`,
            },
            `${pctPp}%`
          )
        );
      }
      return h(
        'button',
        {
          type: 'button',
          class: ['orgchart__card', { 'is-selected': props.selected }],
          onClick: () => emit('select'),
        },
        children
      );
    };
  },
});

onMounted(() => {
  loadChart();
  poll = window.setInterval(loadChart, 5000);
});
onBeforeUnmount(() => {
  if (poll !== null) clearInterval(poll);
});
</script>

<style scoped>
.orgchart {
  position: fixed; inset: 0;
  background: var(--atlas-page-bg);
  color: var(--atlas-text-primary);
  z-index: var(--atlas-z-modal);
  overflow: auto;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif;
  display: flex; flex-direction: column;
}
.orgchart__header {
  display: flex; align-items: flex-start; gap: 16px;
  padding: 28px 48px 18px;
  border-bottom: 1px solid var(--atlas-hairline);
}
@media (max-width: 1023px) { .orgchart__header { padding: 18px 16px 14px; } }
.orgchart__back {
  background: transparent; border: none; cursor: pointer;
  color: var(--atlas-text-muted); font-size: var(--atlas-text-sm);
  padding: 4px 8px; margin-top: 4px;
}
.orgchart__back:hover { color: var(--atlas-text-strong); }
.orgchart__title-block { flex: 1; }
.orgchart__title-block h1 {
  font-size: 32px; font-weight: 700; margin: 0 0 6px; letter-spacing: -0.02em;
}
.orgchart__title-block p {
  margin: 0; font-size: var(--atlas-text-sm); color: var(--atlas-text-muted);
}
.orgchart__meta { display: flex; align-items: center; gap: 12px; }
.orgchart__updated {
  font-size: var(--atlas-text-xs);
  color: var(--atlas-text-muted);
  font-variant-numeric: tabular-nums;
}
.orgchart__close {
  background: transparent; border: none; color: var(--atlas-text-muted);
  font-size: 28px; line-height: 1; cursor: pointer; padding: 4px 8px;
}
.orgchart__close:hover { color: var(--atlas-text-strong); }

.orgchart__body {
  padding: 48px 48px 64px;
  max-width: 1400px; margin: 0 auto;
  width: 100%; box-sizing: border-box;
  flex: 1;
}
@media (max-width: 1023px) { .orgchart__body { padding: 24px 16px 48px; } }

.orgchart__error {
  color: var(--atlas-danger);
  font-size: var(--atlas-text-sm);
  margin: 0 0 16px;
}
.orgchart__empty {
  color: var(--atlas-text-muted);
  font-size: var(--atlas-text-sm);
  text-align: center; margin-top: 80px;
}

/* Tree layout */
.orgchart__tree {
  display: flex; flex-direction: column; align-items: center; gap: 0;
}
.orgchart__root { margin-bottom: 8px; }
.orgchart__edge {
  width: 1px; height: 32px; background: var(--atlas-hairline);
}
.orgchart__row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 16px;
  width: 100%;
  padding-top: 16px;
  border-top: 1px solid var(--atlas-hairline);
}
@media (max-width: 1023px) {
  .orgchart__row { grid-template-columns: repeat(2, 1fr); }
}

/* Card */
.orgchart__card {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  padding: 16px 12px;
  background: var(--atlas-card-bg);
  border: 1px solid var(--atlas-hairline);
  border-radius: var(--atlas-radius-md);
  cursor: pointer;
  color: var(--atlas-text-primary);
  font-family: inherit;
  transition: border-color var(--atlas-duration-fast) var(--atlas-ease),
              background var(--atlas-duration-fast) var(--atlas-ease);
  position: relative;
  text-align: center;
  min-width: 140px;
}
.orgchart__card:hover { border-color: var(--atlas-text-muted); }
.orgchart__card.is-selected {
  border-color: var(--atlas-blue);
  background: var(--atlas-blue-soft);
}
.orgchart__card-name {
  font-size: var(--atlas-text-sm);
  font-weight: 600;
  color: var(--atlas-text-strong);
}
.orgchart__card-role {
  font-size: var(--atlas-text-xs);
  color: var(--atlas-text-muted);
  line-height: 1.3;
}

/* Avatar */
.orgchart__avatar {
  width: 40px; height: 40px;
  border-radius: var(--atlas-radius-full);
  display: inline-flex; align-items: center; justify-content: center;
  color: #ffffff;
  font-weight: 700;
  font-size: 16px;
  letter-spacing: -0.02em;
  flex-shrink: 0;
}

/* Status dot */
.orgchart__dot {
  position: absolute; top: 8px; right: 8px;
  width: 8px; height: 8px;
  border-radius: var(--atlas-radius-full);
  background: var(--atlas-text-muted);
}
.orgchart__dot.is-running { background: var(--atlas-green, #22c55e); box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.18); }
.orgchart__dot.is-blocked { background: var(--atlas-red, #ef4444); box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.20); }
.orgchart__dot.is-idle    { background: var(--atlas-text-muted); opacity: 0.6; }

/* Budget pill — sits below the role text, colour-coded per state. */
.orgchart__budget-pill {
  margin-top: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.02em;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
  border: 1px solid transparent;
}
.orgchart__budget-pill.is-ok {
  background: rgba(34, 197, 94, 0.12);
  color: var(--atlas-green, #16a34a);
  border-color: rgba(34, 197, 94, 0.25);
}
.orgchart__budget-pill.is-warn {
  background: rgba(245, 158, 11, 0.14);
  color: #b45309;
  border-color: rgba(245, 158, 11, 0.32);
}
.orgchart__budget-pill.is-paused {
  background: rgba(239, 68, 68, 0.14);
  color: var(--atlas-red, #dc2626);
  border-color: rgba(239, 68, 68, 0.32);
}

/* Drawer */
.orgchart__drawer {
  position: fixed; top: 0; right: 0; bottom: 0;
  width: min(420px, 100vw);
  background: var(--atlas-bg, var(--atlas-page-bg));
  border-left: 1px solid var(--atlas-hairline);
  display: flex; flex-direction: column;
  z-index: calc(var(--atlas-z-modal) + 1);
  box-shadow: -16px 0 32px rgba(0, 0, 0, 0.25);
}
.orgchart__drawer-head {
  display: flex; align-items: center; gap: 12px;
  padding: 20px 20px 14px;
  border-bottom: 1px solid var(--atlas-hairline);
}
.orgchart__drawer-id { flex: 1; min-width: 0; }
.orgchart__drawer-name {
  font-size: var(--atlas-text-md);
  font-weight: 600;
  color: var(--atlas-text-strong);
}
.orgchart__drawer-role {
  font-size: var(--atlas-text-xs);
  color: var(--atlas-text-muted);
  line-height: 1.3;
}
.orgchart__drawer-close {
  background: transparent; border: none;
  color: var(--atlas-text-muted);
  font-size: 24px; line-height: 1;
  cursor: pointer; padding: 4px 8px;
}
.orgchart__drawer-status {
  display: flex; align-items: center; gap: 8px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--atlas-hairline);
  font-size: var(--atlas-text-xs);
  color: var(--atlas-text-muted);
}
.orgchart__drawer-status .orgchart__dot {
  position: static; box-shadow: none;
}
.orgchart__drawer-statustxt {
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--atlas-text-secondary);
}
.orgchart__drawer-ticket {
  margin-left: auto;
  font-family: var(--atlas-font-mono);
}
.orgchart__drawer-body {
  flex: 1; overflow: auto;
  padding: 16px 20px;
}
.orgchart__drawer-h3 {
  margin: 0 0 12px;
  font-size: var(--atlas-text-xs);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--atlas-text-muted);
  font-weight: 600;
}
.orgchart__drawer-loading,
.orgchart__drawer-empty {
  font-size: var(--atlas-text-sm);
  color: var(--atlas-text-muted);
}

.orgchart__events {
  list-style: none; padding: 0; margin: 0;
  display: flex; flex-direction: column; gap: 8px;
}
.orgchart__event {
  padding: 10px 12px;
  background: var(--atlas-card-bg);
  border: 1px solid var(--atlas-hairline);
  border-radius: var(--atlas-radius-sm);
}
.orgchart__event-row1 {
  display: flex; justify-content: space-between; align-items: baseline;
  gap: 8px;
  font-size: var(--atlas-text-xs);
}
.orgchart__event-type {
  font-weight: 600;
  color: var(--atlas-text-strong);
}
.orgchart__event-ts {
  color: var(--atlas-text-muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.orgchart__event-row2 {
  margin-top: 4px;
  font-size: var(--atlas-text-xs);
  color: var(--atlas-text-muted);
  display: flex; gap: 8px; flex-wrap: wrap;
}
.orgchart__event-app { font-family: var(--atlas-font-mono); }
.orgchart__event-summary {
  color: var(--atlas-text-secondary);
  flex: 1; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
</style>
