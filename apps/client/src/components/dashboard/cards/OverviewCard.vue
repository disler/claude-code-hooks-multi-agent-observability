<template>
  <TabbedCard title="Overview" v-model="tab" :tabs="tabs">
    <template #default="{ tab }">
      <!-- Spend -->
      <div v-show="tab === 'spend'" class="ov__spend" @click="$emit('open-spend')">
        <div class="sp__row">
          <div class="sp__hero">
            <span class="sp__hero-value">${{ todayDollars }}</span>
            <span class="sp__hero-unit">today</span>
          </div>
          <div class="sp__trend" :class="trendClass">{{ trendLabel }}</div>
        </div>
        <div class="sp__meta">
          <span>${{ monthDollars }}/mo</span>
          <span class="sp__meta-sep">·</span>
          <span>{{ todayCalls }} calls today</span>
          <span class="sp__meta-sep">·</span>
          <span>proj ${{ projection }}/mo</span>
          <span v-if="budgetPct != null" class="sp__meta-sep">·</span>
          <span v-if="budgetPct != null" :class="budgetClass">{{ budgetPct }}% of budget</span>
        </div>
        <div class="sp__spark" v-if="spark.length">
          <div v-for="(d, i) in spark" :key="d.date"
               class="sp__bar" :class="{ 'is-today': i === spark.length - 1 }"
               :style="{ height: barH(d.calls) + '%' }" :title="`${d.date}: ${d.calls} events`"/>
        </div>
        <div class="sp__by-model" v-if="topModels.length">
          <span class="sp__by-model-label">by model · last 14d</span>
          <div class="sp__bars-models">
            <div v-for="m in topModels" :key="m.name" class="sp__mrow" :title="`${m.name} · $${m.cost.toFixed(2)} · ${m.calls} calls`">
              <span class="sp__mname">{{ m.short }}</span>
              <span class="sp__mbar"><span :style="{ width: pctOfMax(m.cost) + '%' }" :class="modelClass(m.family)"/></span>
              <span class="sp__mcost">${{ m.cost.toFixed(2) }}</span>
            </div>
          </div>
        </div>
        <p class="sp__hint">Click for detail</p>
      </div>

      <!-- Services -->
      <div v-show="tab === 'services'" class="ov__services">
        <div class="srv__hero">
          <span class="srv__dot" :class="srvClass"></span>
          <span class="srv__count">{{ serviceCount }}</span>
          <span class="srv__label">{{ serviceLabel }}</span>
        </div>
        <ul v-if="services.length" class="srv__list">
          <li v-for="s in services" :key="s.name">
            <span class="srv__row-dot" :class="rowClass(s.status)"></span>
            <span class="srv__row-name">{{ shortName(s.name) }}</span>
            <span class="srv__row-pid">{{ s.pid ?? '—' }}</span>
          </li>
        </ul>
      </div>

      <!-- Drift -->
      <div v-show="tab === 'drift'" class="ov__drift" :class="{ 'is-alert': driftTriggered }">
        <div class="dr__head">
          <span v-if="driftReport?.week" class="dr__week">{{ driftReport.week }}</span>
          <button class="dr__run" :disabled="driftRunning" @click="runDrift">{{ driftRunning ? 'Scanning…' : 'Scan now' }}</button>
        </div>
        <p v-if="!driftReport" class="dr__none">No drift report yet.</p>
        <template v-else>
          <p class="dr__summary" :class="{ 'is-alert': driftTriggered }">{{ driftHeadline }}</p>
          <div v-if="driftSignals.length" class="dr__signals">
            <span v-for="s in driftSignals" :key="s" class="dr__sig">{{ s }}</span>
          </div>
        </template>
      </div>

      <!-- Portability -->
      <div v-show="tab === 'portability'" class="ov__port">
        <ul class="port__rows">
          <li><span class="port__label">GitHub</span><span class="port__value">{{ ghLine }}</span></li>
          <li><span class="port__label">iCloud</span><span class="port__value">{{ icLine }}</span></li>
          <li><span class="port__label">Bootstrap</span><span class="port__value"><code v-if="portability?.bootstrap_script">bootstrap.sh</code><span v-else class="port__missing">missing</span></span></li>
        </ul>
        <button class="port__btn" :disabled="portBusy" @click="backupNow">{{ portBusy ? 'Backing up…' : 'Back up now' }}</button>
      </div>

      <!-- Reference (whitepaper + portability + audit links) -->
      <div v-show="tab === 'reference'" class="ov__ref">
        <ul class="ref__list">
          <li>
            <a :href="wpMeta?.spec_url" target="_blank" rel="noopener">Full spec →</a>
            <span class="ref__sub">last updated {{ wpUpdated }}</span>
          </li>
          <li>
            <a :href="wpMeta?.quick_url" target="_blank" rel="noopener">Quick reference →</a>
          </li>
          <li>
            <a href="#" @click.prevent="$emit('open-audit')">Audit search →</a>
          </li>
        </ul>
        <button class="ref__btn" :disabled="wpBusy" @click="regenWp">{{ wpBusy ? 'Regenerating…' : 'Regenerate docs' }}</button>
      </div>
    </template>
  </TabbedCard>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import TabbedCard from '../TabbedCard.vue';
import { useAtlasStats } from '../../../composables/useAtlasStats';
import { useAtlasSpendDetail, useAtlasDrift, useAtlasSpendByModel } from '../../../composables/useAtlasViews';
import { API_BASE_URL } from '../../../config';

defineEmits<{ (e: 'open-spend'): void; (e: 'open-audit'): void }>();

const tab = ref('spend');

const { stats } = useAtlasStats();
const { spend: spendDaily } = useAtlasSpendDetail();
const { drift } = useAtlasDrift();
const { spend: spendModels } = useAtlasSpendByModel();

// -- Spend computed --
const todayDollars = computed(() => stats.value?.codeburn.today?.dollars?.toFixed(2) ?? '—');
const todayCalls   = computed(() => stats.value?.codeburn.today?.calls ?? 0);
const monthDollars = computed(() => stats.value?.codeburn.month?.dollars?.toFixed(2) ?? '—');
const spark = computed(() => spendDaily.value?.sparkline || []);
const maxBar = computed(() => Math.max(1, ...spark.value.map(d => d.calls)));
function barH(n: number) { return Math.max(3, (n / maxBar.value) * 100); }

const trend = computed<'up'|'down'|'flat'>(() => {
  const s = spark.value;
  if (s.length < 4) return 'flat';
  const today = s[s.length - 1].calls;
  const prior = s.slice(Math.max(0, s.length - 8), -1);
  if (!prior.length) return 'flat';
  const avg = prior.reduce((a, b) => a + b.calls, 0) / prior.length;
  if (avg < 1) return today > 1 ? 'up' : 'flat';
  const r = today / avg;
  if (r > 1.25) return 'up';
  if (r < 0.75) return 'down';
  return 'flat';
});
const trendLabel = computed(() => trend.value === 'up' ? '↑ above avg' : trend.value === 'down' ? '↓ below avg' : '≈ on pace');
const trendClass = computed(() => ({ 'sp__trend--up': trend.value === 'up', 'sp__trend--down': trend.value === 'down' }));

// Projection: today's daily rate ($/call avg from month) * 30
const projection = computed(() => {
  const m = stats.value?.codeburn.month;
  if (!m || !m.dollars || !m.calls) return '—';
  const now = new Date();
  const daySoFar = now.getDate();
  if (daySoFar < 1) return '—';
  const rate = m.dollars / daySoFar;
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return (rate * daysInMonth).toFixed(0);
});

// Budget (operator can set ATLAS_MONTHLY_BUDGET via localStorage)
const budget = computed<number | null>(() => {
  const v = localStorage.getItem('atlas.monthlyBudget');
  if (!v) return null;
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : null;
});
const budgetPct = computed<number | null>(() => {
  const b = budget.value;
  const m = stats.value?.codeburn.month?.dollars;
  if (!b || !m) return null;
  return Math.round((m / b) * 100);
});
const budgetClass = computed(() => {
  const p = budgetPct.value;
  if (p == null) return '';
  if (p >= 100) return 'sp__budget--red';
  if (p >= 80)  return 'sp__budget--yellow';
  return 'sp__budget--ok';
});

// Per-model top 4
const topModels = computed(() => {
  const m = spendModels.value?.by_model || {};
  const arr = Object.entries(m).map(([name, v]: any) => {
    const short = name.replace(/-2\d{7}.*$/, '').replace(/^claude-/, '');
    const family = name.startsWith('claude') ? 'anthropic' : name.startsWith('gpt') ? 'openai' : 'ollama';
    return { name, short, family, calls: v.calls, cost: v.est_cost, tokens: v.input_tok + v.output_tok };
  });
  arr.sort((a, b) => b.cost - a.cost);
  return arr.slice(0, 4);
});
const maxCost = computed(() => Math.max(0.01, ...topModels.value.map(m => m.cost)));
function pctOfMax(c: number) { return (c / maxCost.value) * 100; }
function modelClass(f: string) { return `sp__mbar-fill sp__mbar-fill--${f}`; }

// -- Services --
const services = computed(() => stats.value?.services.items ?? []);
const serviceCount = computed(() => `${stats.value?.services.healthy ?? 0}/${stats.value?.services.total ?? 0}`);
const serviceLabel = computed(() => 'healthy');
const srvClass = computed(() => {
  const h = stats.value?.services.healthy ?? 0;
  const t = stats.value?.services.total ?? 0;
  if (!t) return '';
  if (h === t) return 'is-ok';
  return (t - h) >= t / 2 ? 'is-bad' : 'is-warn';
});
function rowClass(s: string) { return (s === 'running' || s === 'idle') ? 'is-ok' : 'is-bad'; }
function shortName(name: string) { return name.replace(/^com\.atlas\./, ''); }

// -- Drift --
const driftReport = computed<any>(() => drift.value?.report || null);
const driftHeadline = computed(() => {
  const md: string = driftReport.value?.markdown || '';
  const parts = md.split(/\n\n/).map(s => s.trim());
  for (const p of parts) { if (p.startsWith('#') || p.startsWith('_')) continue; return p.replace(/\*\*/g, '').slice(0, 220); }
  return '';
});
const driftSignals = computed<string[]>(() => {
  const md: string = driftReport.value?.markdown || '';
  const sigs: string[] = [];
  for (const l of md.split('\n')) {
    const m = l.match(/^###\s+`([^`]+)`/);
    if (m) sigs.push(m[1]);
  }
  return sigs;
});
const driftTriggered = computed(() => driftSignals.value.length > 0);
const driftRunning = ref(false);
async function runDrift() {
  driftRunning.value = true;
  try {
    await fetch(`${API_BASE_URL}/api/atlas/drift/run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"days":7}' });
  } catch {} finally { driftRunning.value = false; }
}

// -- Portability --
const portability = ref<any>(null);
const portBusy = ref(false);
async function loadPort() { try { portability.value = await (await fetch(`${API_BASE_URL}/api/atlas/portability`)).json(); } catch {} }
async function backupNow() {
  if (portBusy.value) return;
  portBusy.value = true;
  try { await fetch(`${API_BASE_URL}/api/atlas/portability/backup-now`, { method: 'POST' }); await loadPort(); } catch {} finally { portBusy.value = false; }
}
const ghLine = computed(() => {
  const g = portability.value?.github;
  if (!g) return '—';
  if (!g.remote) return 'no remote';
  if (!g.last_ts) return 'never · pending';
  return relTime(g.last_ts);
});
const icLine = computed(() => {
  const i = portability.value?.icloud;
  if (!i) return '—';
  if (!i.enabled) return 'iCloud disabled';
  if (!i.last_ts) return 'never · pending';
  return relTime(i.last_ts);
});

// -- Whitepaper --
const wpMeta = ref<any>(null);
const wpBusy = ref(false);
async function loadWp() { try { wpMeta.value = await (await fetch(`${API_BASE_URL}/api/atlas/whitepaper`)).json(); } catch {} }
async function regenWp() {
  if (wpBusy.value) return;
  wpBusy.value = true;
  try {
    await fetch(`${API_BASE_URL}/api/atlas/whitepaper/regenerate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"trigger":"dashboard"}' });
    await loadWp();
  } catch {} finally { wpBusy.value = false; }
}
const wpUpdated = computed(() => relTime(wpMeta.value?.generated_at));

// utility
function relTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return iso;
    const s = Math.floor((Date.now() - t) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s/60)}m ago`;
    if (s < 86_400) return `${Math.floor(s/3600)}h ago`;
    return `${Math.floor(s/86_400)}d ago`;
  } catch { return iso; }
}

let timer: number | null = null;
onMounted(() => { loadPort(); loadWp(); timer = window.setInterval(() => { loadPort(); loadWp(); }, 60_000); });
onUnmounted(() => { if (timer) clearInterval(timer); });

const tabs = computed(() => [
  { id: 'spend',       label: 'Spend' },
  { id: 'services',    label: 'Services', count: services.value.length || null, dot: srvClass.value === 'is-bad' || srvClass.value === 'is-warn', dotClass: srvClass.value === 'is-bad' ? 'is-red' : 'is-yellow' },
  { id: 'drift',       label: 'Drift',    dot: driftTriggered.value, dotClass: 'is-red' },
  { id: 'portability', label: 'Backups' },
  { id: 'reference',   label: 'Docs' },
]);
</script>

<style scoped>
/* ===== Spend ===== */
.ov__spend { cursor: pointer; display: flex; flex-direction: column; gap: 8px; }
.sp__row { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.sp__hero { display: flex; align-items: baseline; gap: 8px; color: var(--atlas-text-strong); }
.sp__hero-value { font-size: 38px; font-weight: 600; letter-spacing: -0.03em; line-height: 1; font-variant-numeric: tabular-nums; }
.sp__hero-unit { font-size: 12.5px; color: var(--atlas-text-secondary); text-transform: uppercase; letter-spacing: 0.06em; font-weight: 500; }
.sp__trend { font-size: 11.5px; font-weight: 500; color: var(--atlas-text-muted, var(--atlas-text-secondary)); font-variant-numeric: tabular-nums; }
.sp__trend--up   { color: var(--atlas-red); }
.sp__trend--down { color: var(--atlas-green); }

.sp__meta { display: flex; flex-wrap: wrap; gap: 6px; font-size: 12px; color: var(--atlas-text-secondary); font-variant-numeric: tabular-nums; }
.sp__meta-sep { color: var(--atlas-text-muted); }
.sp__budget--red    { color: var(--atlas-red); font-weight: 500; }
.sp__budget--yellow { color: var(--atlas-yellow); font-weight: 500; }
.sp__budget--ok     { color: var(--atlas-green); }

.sp__spark { display: flex; align-items: flex-end; gap: 2px; height: 36px; }
.sp__bar { flex: 1 1 auto; min-width: 3px; background: var(--atlas-blue); border-radius: 2px 2px 0 0; opacity: 0.55; }
.sp__bar.is-today { opacity: 1; }

.sp__by-model { display: flex; flex-direction: column; gap: 4px; margin-top: 4px; }
.sp__by-model-label { font-size: 10.5px; color: var(--atlas-text-muted, var(--atlas-text-secondary)); text-transform: uppercase; letter-spacing: 0.06em; }
.sp__bars-models { display: flex; flex-direction: column; gap: 3px; }
.sp__mrow { display: grid; grid-template-columns: 80px 1fr 50px; gap: 8px; align-items: center; font-size: 11.5px; }
.sp__mname { font-family: ui-monospace, Menlo, monospace; color: var(--atlas-text-primary); }
.sp__mbar { height: 6px; background: var(--atlas-card-bg-2); border-radius: 3px; overflow: hidden; }
.sp__mbar-fill { display: block; height: 100%; }
.sp__mbar-fill--anthropic { background: #C15F3C; }
.sp__mbar-fill--openai    { background: #10A37F; }
.sp__mbar-fill--ollama    { background: #4285F4; }
.sp__mcost { text-align: right; color: var(--atlas-text-secondary); font-variant-numeric: tabular-nums; }

.sp__hint { margin: 0; font-size: 11px; color: var(--atlas-blue); }

/* ===== Services ===== */
.ov__services { display: flex; flex-direction: column; gap: 10px; }
.srv__hero { display: flex; align-items: baseline; gap: 8px; }
.srv__dot { width: 12px; height: 12px; border-radius: 50%; background: var(--atlas-text-muted); }
.srv__dot.is-ok { background: var(--atlas-green); }
.srv__dot.is-warn { background: var(--atlas-yellow); }
.srv__dot.is-bad { background: var(--atlas-red); }
.srv__count { font-size: 24px; font-weight: 600; font-variant-numeric: tabular-nums; }
.srv__label { font-size: 12px; color: var(--atlas-text-secondary); }
.srv__list { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 4px 12px; }
.srv__list li { display: grid; grid-template-columns: 7px 1fr auto; gap: 8px; align-items: center; font-size: 12.5px; color: var(--atlas-text-secondary); }
.srv__row-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--atlas-text-muted); }
.srv__row-dot.is-ok { background: var(--atlas-green); }
.srv__row-dot.is-bad { background: var(--atlas-red); }
.srv__row-name { font-family: ui-monospace, Menlo, monospace; font-size: 11.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.srv__row-pid { font-family: ui-monospace, Menlo, monospace; font-size: 10.5px; color: var(--atlas-text-muted); }

/* ===== Drift ===== */
.ov__drift.is-alert { border-left: 3px solid var(--atlas-red); padding-left: 12px; margin-left: -15px; }
.dr__head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 6px; }
.dr__week { font-size: 11.5px; color: var(--atlas-text-muted); font-family: ui-monospace, Menlo, monospace; }
.dr__run {
  margin-left: auto;
  background: transparent; border: 1px solid var(--atlas-hairline);
  color: var(--atlas-text-primary); font-size: 11.5px; font-weight: 500;
  padding: 3px 9px; border-radius: 6px; cursor: pointer; font-family: inherit;
}
.dr__run:hover:not(:disabled) { background: rgba(0,0,0,0.04); }
.dr__run:disabled { opacity: 0.5; cursor: not-allowed; }
.dr__none, .dr__summary { margin: 0; font-size: 13px; line-height: 1.5; color: var(--atlas-text-primary); opacity: 0.92; }
.dr__summary.is-alert { color: var(--atlas-red); font-weight: 500; }
.dr__signals { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px; }
.dr__sig {
  font-family: ui-monospace, Menlo, monospace; font-size: 11px;
  color: var(--atlas-red); background: rgba(255,59,48,0.10);
  padding: 2px 7px; border-radius: 5px;
}

/* ===== Portability ===== */
.ov__port { display: flex; flex-direction: column; gap: 10px; }
.port__rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 5px; }
.port__rows li { display: grid; grid-template-columns: 80px 1fr; gap: 12px; align-items: baseline; font-size: 13px; }
.port__label { color: var(--atlas-text-secondary); font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.04em; }
.port__value { color: var(--atlas-text-primary); font-variant-numeric: tabular-nums; }
.port__missing { color: var(--atlas-red); }
.port__btn { align-self: flex-start; background: transparent; border: 1px solid var(--atlas-hairline); color: var(--atlas-text-primary); font-size: 12.5px; font-weight: 500; padding: 5px 11px; border-radius: 7px; cursor: pointer; font-family: inherit; }
.port__btn:hover:not(:disabled) { background: rgba(0,0,0,0.04); }
.port__btn:disabled { opacity: 0.5; }

/* ===== Reference ===== */
.ov__ref { display: flex; flex-direction: column; gap: 10px; }
.ref__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.ref__list li { display: flex; align-items: baseline; gap: 10px; font-size: 13.5px; }
.ref__list a { color: var(--atlas-blue); text-decoration: none; font-weight: 500; }
.ref__list a:hover { text-decoration: underline; }
.ref__sub { font-size: 11.5px; color: var(--atlas-text-muted, var(--atlas-text-secondary)); }
.ref__btn { align-self: flex-start; background: transparent; border: 1px solid var(--atlas-hairline); color: var(--atlas-text-primary); font-size: 12.5px; font-weight: 500; padding: 5px 11px; border-radius: 7px; cursor: pointer; font-family: inherit; }
.ref__btn:hover:not(:disabled) { background: rgba(0,0,0,0.04); }
</style>
