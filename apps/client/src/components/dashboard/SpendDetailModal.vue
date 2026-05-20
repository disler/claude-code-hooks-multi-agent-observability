<template>
  <div class="modal-backdrop" @click.self="$emit('close')">
    <div class="modal">
      <header class="modal__bar">
        <h2 class="modal__title">Spend · last {{ spendDaily.window_days }} days</h2>
        <button class="modal__close" @click="$emit('close')">×</button>
      </header>
      <div class="modal__body">
        <!-- Today / month / projected hero -->
        <div class="modal__hero">
          <div class="hero__cell">
            <span class="hero__label">Today</span>
            <span class="hero__value">${{ todayDollars }}</span>
            <span class="hero__sub">{{ todayCalls }} calls</span>
          </div>
          <div class="hero__cell">
            <span class="hero__label">Month-to-date</span>
            <span class="hero__value">${{ monthDollars }}</span>
            <span class="hero__sub">{{ monthCalls }} calls</span>
          </div>
          <div class="hero__cell">
            <span class="hero__label">Projected month</span>
            <span class="hero__value">${{ projection }}</span>
            <span class="hero__sub">at current pace</span>
          </div>
        </div>

        <h3 class="modal__h3">Daily activity</h3>
        <div class="spark">
          <div
            v-for="d in spendDaily.sparkline"
            :key="d.date"
            class="spark__bar"
            :class="{ 'is-today': d.date === todayKey }"
            :style="{ height: barHeight(d.calls) + '%' }"
            :title="`${d.date}: ${d.calls} events`"
          />
        </div>
        <div class="spark__labels">
          <span>{{ spendDaily.sparkline[0]?.date }}</span>
          <span>today</span>
        </div>

        <h3 class="modal__h3">By model · estimated</h3>
        <p class="modal__caveat">Estimate from session transcripts. Codeburn (top of card) is authoritative; this view is a relative breakdown — useful for "what's eating my spend", not for invoicing.</p>
        <ul class="model-list" v-if="modelRows.length">
          <li v-for="m in modelRows" :key="m.name">
            <span class="model__glyph" :class="`model__glyph--${m.family}`">{{ m.familyInitial }}</span>
            <span class="model__name">{{ m.short }}</span>
            <span class="model__bar"><span :style="{ width: m.pct + '%' }" :class="`model__bar-fill--${m.family}`"/></span>
            <span class="model__cost">${{ m.cost.toFixed(2) }}</span>
            <span class="model__share">{{ m.pct.toFixed(0) }}%</span>
          </li>
        </ul>
        <p v-else class="modal__empty">No model data yet — parser reads ~/.claude/projects/*/*.jsonl, populates once you use the Talk surface.</p>

        <h3 class="modal__h3">By token type · top model</h3>
        <div v-if="topModel" class="token-mix">
          <div class="tm__row">
            <span class="tm__label">Input</span>
            <span class="tm__bar"><span :style="{ width: tokPct(topModel.input_tok) + '%' }"/></span>
            <span class="tm__val">{{ fmtTok(topModel.input_tok) }}</span>
          </div>
          <div class="tm__row">
            <span class="tm__label">Cache write</span>
            <span class="tm__bar"><span :style="{ width: tokPct(topModel.cache_create_tok) + '%' }"/></span>
            <span class="tm__val">{{ fmtTok(topModel.cache_create_tok) }}</span>
          </div>
          <div class="tm__row">
            <span class="tm__label">Cache read</span>
            <span class="tm__bar"><span :style="{ width: tokPct(topModel.cache_read_tok) + '%' }"/></span>
            <span class="tm__val">{{ fmtTok(topModel.cache_read_tok) }}</span>
          </div>
          <div class="tm__row">
            <span class="tm__label">Output</span>
            <span class="tm__bar"><span :style="{ width: tokPct(topModel.output_tok) + '%' }"/></span>
            <span class="tm__val">{{ fmtTok(topModel.output_tok) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useAtlasSpendDetail, useAtlasSpendByModel } from '../../composables/useAtlasViews';
import { useAtlasStats } from '../../composables/useAtlasStats';

defineEmits<{ (e: 'close'): void }>();

const { spend: spendDailyRef } = useAtlasSpendDetail();
const spendDaily = computed(() => spendDailyRef.value);

const { spend: spendModelsRef } = useAtlasSpendByModel();
const spendModels = computed(() => spendModelsRef.value);

const { stats } = useAtlasStats();
const todayDollars = computed(() => stats.value?.codeburn.today?.dollars?.toFixed(2) ?? '—');
const todayCalls   = computed(() => stats.value?.codeburn.today?.calls ?? 0);
const monthDollars = computed(() => stats.value?.codeburn.month?.dollars?.toFixed(2) ?? '—');
const monthCalls   = computed(() => stats.value?.codeburn.month?.calls ?? 0);

const projection = computed(() => {
  const m = stats.value?.codeburn.month;
  if (!m || !m.dollars) return '—';
  const now = new Date();
  const daySoFar = now.getDate();
  const rate = m.dollars / Math.max(1, daySoFar);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return (rate * daysInMonth).toFixed(0);
});

const todayKey = computed(() => new Date().toISOString().slice(0, 10));

const maxBar = computed(() => Math.max(1, ...(spendDaily.value.sparkline || []).map(d => d.calls)));
function barHeight(n: number) { return Math.max(3, (n / maxBar.value) * 100); }

// Per-model rows: short name + brand glyph + cost + share %
type ModelRow = { name: string; short: string; family: 'anthropic' | 'openai' | 'ollama'; familyInitial: string; calls: number; cost: number; pct: number; input_tok: number; cache_create_tok: number; cache_read_tok: number; output_tok: number };

const modelRows = computed<ModelRow[]>(() => {
  const m = spendModels.value?.by_model || {};
  const entries = Object.entries(m);
  if (!entries.length) return [];
  const totalCost = entries.reduce((a, [, v]: any) => a + (v.est_cost || 0), 0) || 1;
  const rows: ModelRow[] = entries.map(([name, v]: any) => {
    const short = name.replace(/-2\d{7}.*$/, '').replace(/^claude-/, '');
    const family: 'anthropic' | 'openai' | 'ollama' =
      name.startsWith('claude') ? 'anthropic'
        : name.startsWith('gpt') ? 'openai'
        : 'ollama';
    const familyInitial = family === 'anthropic' ? 'A' : family === 'openai' ? 'G' : 'g';
    return {
      name, short, family, familyInitial,
      calls: v.calls || 0,
      cost:  v.est_cost || 0,
      pct:   ((v.est_cost || 0) / totalCost) * 100,
      input_tok: v.input_tok || 0,
      cache_create_tok: v.cache_create_tok || 0,
      cache_read_tok:   v.cache_read_tok || 0,
      output_tok: v.output_tok || 0,
    };
  });
  rows.sort((a, b) => b.cost - a.cost);
  return rows;
});

const topModel = computed(() => modelRows.value[0] || null);
const maxTok = computed(() => {
  const t = topModel.value;
  if (!t) return 1;
  return Math.max(t.input_tok, t.cache_create_tok, t.cache_read_tok, t.output_tok, 1);
});
function tokPct(n: number) { return Math.max(2, (n / maxTok.value) * 100); }
function fmtTok(n: number) {
  if (!n) return '0';
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
}
</script>

<style scoped>
.modal-backdrop {
  position: fixed; inset: 0; background: rgba(0,0,0,0.45);
  display: flex; align-items: center; justify-content: center; z-index: 90; padding: 16px;
}
.modal {
  background: var(--atlas-page-bg);
  color: var(--atlas-text-primary);
  border-radius: 16px;
  width: min(760px, 100%);
  max-height: 85vh;
  display: flex; flex-direction: column;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
}
.modal__bar { display: flex; align-items: center; padding: 16px 20px; border-bottom: 1px solid var(--atlas-hairline); }
.modal__title { margin: 0; font-size: 17px; font-weight: 600; letter-spacing: -0.01em; }
.modal__close { margin-left: auto; background: transparent; border: 0; font-size: 22px; line-height: 1; color: var(--atlas-text-secondary); cursor: pointer; padding: 0 4px; }
.modal__body { padding: 20px 24px 24px; overflow-y: auto; display: flex; flex-direction: column; gap: 18px; }
.modal__h3 { margin: 4px 0 -4px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--atlas-text-secondary); font-weight: 500; }
.modal__caveat { margin: 0; font-size: 11.5px; color: var(--atlas-text-muted, var(--atlas-text-secondary)); }
.modal__empty { font-size: 13px; color: var(--atlas-text-secondary); margin: 0; }

/* hero */
.modal__hero { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
@media (max-width: 600px) { .modal__hero { grid-template-columns: 1fr; } }
.hero__cell { display: flex; flex-direction: column; gap: 2px; padding: 14px 16px; background: var(--atlas-card-bg); border-radius: 10px; min-width: 0; }
.hero__label { font-size: 10.5px; color: var(--atlas-text-secondary); text-transform: uppercase; letter-spacing: 0.08em; font-weight: 500; }
.hero__value { font-size: 26px; font-weight: 600; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; line-height: 1; margin-top: 2px; }
.hero__sub { font-size: 11.5px; color: var(--atlas-text-secondary); margin-top: 2px; }

/* sparkline */
.spark { display: flex; align-items: flex-end; gap: 3px; height: 56px; }
.spark__bar { flex: 1 1 auto; min-width: 4px; background: var(--atlas-blue); border-radius: 2px 2px 0 0; opacity: 0.55; }
.spark__bar.is-today { opacity: 1; }
.spark__labels { display: flex; justify-content: space-between; font-size: 10.5px; color: var(--atlas-text-muted, var(--atlas-text-secondary)); }

/* model rows */
.model-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.model-list li { display: grid; grid-template-columns: 22px 1fr 1fr 64px 40px; gap: 10px; align-items: center; font-size: 13px; }
.model__glyph {
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; border-radius: 6px;
  font-size: 11px; font-weight: 700; color: #FFF;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif; letter-spacing: -0.02em;
}
.model__glyph--anthropic { background: #D97757; }
.model__glyph--openai    { background: #10A37F; }
.model__glyph--ollama    { background: #1A73E8; }
.model__name { font-family: ui-monospace, Menlo, monospace; font-size: 12.5px; color: var(--atlas-text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.model__bar { height: 6px; background: var(--atlas-card-bg-2); border-radius: 3px; overflow: hidden; }
.model__bar span { display: block; height: 100%; }
.model__bar-fill--anthropic { background: #D97757; }
.model__bar-fill--openai    { background: #10A37F; }
.model__bar-fill--ollama    { background: #1A73E8; }
.model__cost { text-align: right; font-variant-numeric: tabular-nums; color: var(--atlas-text-strong); }
.model__share { text-align: right; font-variant-numeric: tabular-nums; color: var(--atlas-text-secondary); font-size: 11.5px; }

/* token mix */
.token-mix { display: flex; flex-direction: column; gap: 6px; }
.tm__row { display: grid; grid-template-columns: 96px 1fr 70px; gap: 10px; align-items: center; font-size: 12.5px; }
.tm__label { color: var(--atlas-text-secondary); font-size: 11.5px; }
.tm__bar { height: 6px; background: var(--atlas-card-bg); border-radius: 3px; overflow: hidden; }
.tm__bar span { display: block; height: 100%; background: var(--atlas-blue); opacity: 0.7; }
.tm__val { text-align: right; font-variant-numeric: tabular-nums; font-family: ui-monospace, Menlo, monospace; color: var(--atlas-text-primary); }
</style>
