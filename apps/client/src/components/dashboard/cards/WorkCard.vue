<template>
  <TabbedCard title="Work" v-model="tab" :tabs="tabs">
    <template #default="{ tab }">
      <!-- Missions tab -->
      <div v-show="tab === 'missions'">
        <ul v-if="activeMissions.length" class="m__list">
          <li v-for="m in activeMissions.slice(0, 8)" :key="m.id || (m.division + m.title)" class="m__row" @click="$emit('open-division', m.division)">
            <span class="m__dot" :class="`m__dot--${m.status}`"></span>
            <div class="m__body">
              <div class="m__title">{{ m.title }}</div>
              <div class="m__meta">
                <span class="m__division">{{ m.division }}</span>
                <span>·</span><span>@{{ m.agent }}</span>
                <span>·</span><span class="m__status">{{ m.status }}</span>
                <template v-if="m.branch"><span>·</span><code class="m__branch">{{ m.branch }}</code></template>
              </div>
            </div>
          </li>
        </ul>
        <p v-else class="m__empty">No active missions yet.</p>
      </div>

      <!-- Projects tab -->
      <div v-show="tab === 'projects'">
        <ul class="p__list">
          <li
            v-for="d in projectRows"
            :key="d.slug"
            class="p__row"
            @click="$emit('open-division', d.slug)"
          >
            <div class="p__row-head">
              <span class="p__name">{{ d.slug }}</span>
              <span class="p__autonomy">{{ d.autonomy }}</span>
              <span class="p__health" :class="`p__health--${d.health}`"></span>
            </div>
            <div class="p__metrics">
              <span class="p__metric"><b>{{ d.events24h }}</b> events 24h</span>
              <span class="p__metric"><b>{{ d.activeMissions }}</b> missions</span>
              <span class="p__metric"><b>{{ d.lastActionAgo }}</b> ago</span>
            </div>
            <div v-if="d.lastSummary" class="p__last">{{ truncate(d.lastSummary, 100) }}</div>
          </li>
        </ul>
      </div>

      <!-- Scout tab -->
      <div v-show="tab === 'scout'">
        <ul v-if="topScout.length" class="s__list">
          <li v-for="c in topScout" :key="c.candidate_id" class="s__row">
            <span class="s__score" :class="scoreClass(c.score_total)">{{ c.score_total.toFixed(1) }}</span>
            <div class="s__body">
              <div class="s__title">{{ c.name }}</div>
              <div class="s__meta">
                <span class="s__type">{{ c.type }}</span>
                <span v-if="c.human_only" class="s__human">operator-only</span>
                <span class="s__repo">{{ c.repo }}</span>
              </div>
            </div>
            <div class="s__actions">
              <button class="s__btn s__btn--primary" :disabled="busy === c.candidate_id || c.human_only" @click="scoutAction(c.candidate_id, 'install')">Install</button>
              <button class="s__btn" :disabled="busy === c.candidate_id" @click="scoutAction(c.candidate_id, 'decline')">Skip</button>
            </div>
          </li>
        </ul>
        <p v-else class="s__empty">No candidates this week. First sweep fires Sun 04:00.</p>
        <p v-if="scoutTrials.length" class="s__trials">{{ scoutTrials.length }} components on 7-day trial.</p>
      </div>

      <!-- Corrections tab -->
      <div v-show="tab === 'corrections'">
        <ul v-if="corrections.length" class="r__list">
          <li v-for="(e, i) in corrections.slice(0, 6)" :key="i" class="r__row">
            <span class="r__time">{{ relTime(e.timestamp) }}</span>
            <span class="r__before">@{{ e.decision?.agent || '?' }}</span>
            <span class="r__arrow">→</span>
            <span class="r__after">{{ e.correction }}</span>
            <span class="r__msg" :title="e.message_preview">{{ truncate(e.message_preview, 64) }}</span>
          </li>
        </ul>
        <p v-else class="r__empty">No router corrections in 14d.</p>
      </div>

      <!-- Agents tab -->
      <div v-show="tab === 'agents'">
        <div v-if="!agents.length" class="ag__empty">Loading agents…</div>
        <div v-else class="ag__groups">
          <section v-for="[division, list] in agentsByDivision" :key="division" class="ag__group">
            <button class="ag__division" @click="$emit('open-division', division)" :title="`Open ${division}`">
              <span class="ag__division-name">{{ division }}</span>
              <span class="ag__division-arrow">→</span>
            </button>
            <ul class="ag__list">
              <li v-for="a in list" :key="`${division}/${a.role}`" class="ag__row">
                <span class="ag__avatar" :style="{ background: roleColor(a.role) }">{{ initial(a.role) }}</span>
                <div class="ag__body">
                  <div class="ag__name-row">
                    <span class="ag__name">@{{ a.role }}</span>
                    <span class="ag__autonomy" :class="`ag__autonomy--${a.autonomy}`">{{ a.autonomy }}</span>
                  </div>
                  <p class="ag__desc">{{ describe(a) }}</p>
                </div>
              </li>
            </ul>
          </section>
        </div>
      </div>

      <!-- GitHub feed tab -->
      <div v-show="tab === 'github'">
        <ul v-if="ghItems.length" class="g__list">
          <li v-for="i in ghItems" :key="i.url" class="g__row">
            <span class="g__kind" :class="`g__kind--${i.kind}`">{{ i.kind }}</span>
            <a class="g__title" :href="i.url" target="_blank" rel="noopener">{{ i.title }}</a>
            <span class="g__repo">{{ i.repo.replace(/^hrmacnair\//, '') }}</span>
            <span class="g__time">{{ relTime(i.updatedAt) }}</span>
          </li>
        </ul>
        <p v-else class="g__empty">{{ ghMessage || 'No open PRs or issues.' }}</p>
      </div>
    </template>
  </TabbedCard>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import TabbedCard from '../TabbedCard.vue';
import type { HookEvent } from '../../../types';
import { useAtlasMissions, useAtlasScout, useAtlasRoutingCorrections, useGitHubFeed, useAllAgents } from '../../../composables/useAtlasViews';
import { API_BASE_URL } from '../../../config';

defineEmits<{ (e: 'open-division', slug: string): void }>();
const props = defineProps<{ events: HookEvent[] }>();

const tab = ref('missions');

const { missions } = useAtlasMissions();
const { scout, refresh: refreshScout } = useAtlasScout();
const { corrections: corrRef } = useAtlasRoutingCorrections();
const { feed: ghFeed } = useGitHubFeed();
const { agents: agentsRef } = useAllAgents();

const activeMissions = computed<any[]>(() => (missions.value?.missions || []).filter((m: any) =>
  m.status !== 'done' && m.status !== 'abandoned'
));

const topScout = computed<any[]>(() =>
  (scout.value?.candidates || []).filter((c: any) => c.status === 'pending' && c.recommendation === 'install_proposed').slice(0, 5)
);
const scoutTrials = computed<any[]>(() => scout.value?.trials || []);
const corrections = computed<any[]>(() => corrRef.value?.entries || []);
const ghItems = computed<any[]>(() => ghFeed.value?.items || []);
const ghMessage = computed(() => ghFeed.value?.message || '');

// Project rows
const KNOWN = [
  { slug: 'atlas-meta', autonomy: 'bold' },
  { slug: 'margin',     autonomy: 'bold' },
  { slug: 'industry',   autonomy: 'bold' },
];
const projectRows = computed(() => {
  const now = Date.now();
  const cutoff = now - 24 * 3600_000;
  const all = missions.value?.missions || [];
  return KNOWN.map((d) => {
    const events24h = props.events.filter(e => {
      if (!e.timestamp || e.timestamp < cutoff) return false;
      if ((e.source_app || '').includes(d.slug)) return true;
      const p: any = e.payload || {};
      if (p.division === d.slug) return true;
      return false;
    });
    const activeMissions = all.filter((m: any) =>
      m.division === d.slug && m.status !== 'done' && m.status !== 'abandoned'
    ).length;
    const last = events24h[events24h.length - 1];
    const lastTs = last?.timestamp;
    const lastSummary = last?.summary || last?.payload?.summary || (last?.payload?.tool_input?.command ?? '');
    return {
      slug: d.slug,
      autonomy: d.autonomy,
      health: events24h.length === 0 ? 'idle' : 'active',
      events24h: events24h.length,
      activeMissions,
      lastActionAgo: lastTs ? relTimeNum(lastTs) : '—',
      lastSummary,
    };
  });
});

const agents = computed<any[]>(() => agentsRef.value?.agents || []);
const agentsByDivision = computed(() => {
  const m = new Map<string, any[]>();
  for (const a of agents.value) {
    if (!m.has(a.division)) m.set(a.division, []);
    m.get(a.division)!.push(a);
  }
  const order = ['producer', 'swift', 'web', 'designer', 'researcher', 'writer', 'ops',
                 'analyst', 'risk-manager', 'executor', 'compliance'];
  for (const [, v] of m) {
    v.sort((a, b) => {
      const ia = order.indexOf(a.role); const ib = order.indexOf(b.role);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  }
  return m;
});
const ROLE_COLORS: Record<string, string> = {
  producer: '#845EF7', swift: '#D97757', web: '#1A73E8', designer: '#EC4899',
  researcher: '#10B981', writer: '#0EA5E9', ops: '#6B7280', analyst: '#F59E0B',
  'risk-manager': '#EF4444', executor: '#A855F7', compliance: '#0F766E',
};
function roleColor(role: string): string { return ROLE_COLORS[role] || '#6B7280'; }
function initial(role: string): string { return (role || '?').charAt(0).toUpperCase(); }
function describe(a: any): string {
  const md: string = a.markdown || '';
  if (!md) return roleFallback(a.role);
  const job = md.match(/^Job:\s*(.+)$/im);
  if (job) return cleanLine(job[1]);
  for (const l of md.split('\n').map(s => s.trim()).filter(Boolean)) {
    if (/^you are/i.test(l)) continue;
    if (l.startsWith('#') || l.startsWith('-')) continue;
    return cleanLine(l);
  }
  return roleFallback(a.role);
}
function cleanLine(s: string): string {
  return s.replace(/[`*_]/g, '').replace(/\s+/g, ' ').trim().replace(/\.$/, '').slice(0, 140);
}
function roleFallback(role: string): string {
  const map: Record<string, string> = {
    producer:   'Orchestrates work, breaks down brain-dumps, delegates to specialists',
    swift:      'Owns Margin native macOS/iOS code',
    web:        'Owns Industry web stack — Next.js, Supabase, Stripe',
    designer:   'UI/UX critic, mockups, design tokens',
    researcher: 'Web research, competitor intel, lead gen',
    writer:     'Cold emails, marketing copy, product writing',
    ops:        'Invoices, scheduling, contracts, CRM, service health',
    analyst:    'Technical trading signals + indicators',
    'risk-manager': 'Position sizing, correlation, VaR sanity',
    executor:   'Places paper orders via broker API (restricted)',
    compliance: 'Logs every signal/order, enforces observation period',
  };
  return map[role] || '(no description)';
}

const tabs = computed(() => [
  { id: 'missions',    label: 'Missions',    count: activeMissions.value.length || null },
  { id: 'projects',    label: 'Projects',    count: KNOWN.length },
  { id: 'agents',      label: 'Agents',      count: agents.value.length || null },
  { id: 'scout',       label: 'Scout',       count: topScout.value.length || null,
    dot: topScout.value.length > 0, dotClass: 'is-green' },
  { id: 'corrections', label: 'Routing',     count: corrections.value.length || null },
  { id: 'github',      label: 'GitHub',      count: ghItems.value.length || null },
]);

const busy = ref<string | null>(null);
async function scoutAction(id: string, action: 'install' | 'decline') {
  busy.value = id;
  try {
    await fetch(`${API_BASE_URL}/api/atlas/scout/${encodeURIComponent(id)}/${action}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ surface: 'dashboard' }),
    });
    await refreshScout();
  } catch {/* silent */} finally { busy.value = null; }
}
function scoreClass(s: number) {
  if (s >= 8) return 's__score--high';
  if (s >= 6) return 's__score--mid';
  return 's__score--low';
}
function relTimeNum(t: number): string {
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s/60)}m`;
  if (s < 86_400) return `${Math.floor(s/3600)}h`;
  return `${Math.floor(s/86_400)}d`;
}
function relTime(iso?: string): string {
  if (!iso) return '—';
  try {
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return '';
    return relTimeNum(t);
  } catch { return ''; }
}
function truncate(s: string | undefined, n: number) {
  if (!s) return '';
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}
</script>

<style scoped>
/* ---- shared ---- */
.m__empty, .s__empty, .r__empty, .g__empty { margin: 0; font-size: 13px; color: var(--atlas-text-secondary); }

/* Missions */
.m__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.m__row { display: grid; grid-template-columns: 8px 1fr; gap: 12px; align-items: start; cursor: pointer; padding: 6px 0; border-radius: 6px; }
.m__row:hover { background: rgba(0,0,0,0.03); }
.m__dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 6px; background: var(--atlas-text-muted, var(--atlas-text-secondary)); }
.m__dot--in_progress { background: var(--atlas-yellow); }
.m__dot--review      { background: var(--atlas-blue); }
.m__dot--drafted     { background: var(--atlas-blue); }
.m__title { font-size: 14px; font-weight: 500; color: var(--atlas-text-primary); line-height: 1.35; }
.m__meta { display: flex; flex-wrap: wrap; gap: 5px; font-size: 12px; color: var(--atlas-text-secondary); margin-top: 2px; }
.m__division { color: var(--atlas-text-primary); font-weight: 500; }
.m__status { font-family: ui-monospace, Menlo, monospace; }
.m__branch { font-family: ui-monospace, Menlo, monospace; font-size: 11px; background: var(--atlas-card-bg-2); padding: 1px 5px; border-radius: 4px; }

/* Projects */
.p__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.p__row {
  background: var(--atlas-card-bg-2, transparent);
  border: 1px solid var(--atlas-hairline);
  border-radius: 10px; padding: 10px 12px;
  display: flex; flex-direction: column; gap: 6px;
  cursor: pointer; transition: border-color 100ms ease, transform 100ms ease;
}
.p__row:hover { border-color: var(--atlas-text-secondary); transform: translateY(-1px); }
.p__row-head { display: flex; align-items: baseline; gap: 8px; }
.p__name { font-size: 14px; font-weight: 600; color: var(--atlas-text-strong); }
.p__autonomy { font-size: 11px; padding: 2px 7px; border-radius: 5px; background: var(--atlas-blue-soft); color: var(--atlas-blue); font-family: ui-monospace, Menlo, monospace; }
.p__health { margin-left: auto; width: 8px; height: 8px; border-radius: 50%; background: var(--atlas-text-muted); }
.p__health--active { background: var(--atlas-green); animation: p-pulse 2s ease-in-out infinite; }
.p__health--idle   { background: var(--atlas-hairline); }
@keyframes p-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(48,209,88,0.30); } 50% { box-shadow: 0 0 0 4px rgba(48,209,88,0); } }
.p__metrics { display: flex; gap: 12px; flex-wrap: wrap; font-size: 12px; color: var(--atlas-text-secondary); }
.p__metric b { color: var(--atlas-text-strong); font-weight: 600; font-variant-numeric: tabular-nums; }
.p__last { font-size: 12px; color: var(--atlas-text-secondary); font-family: ui-monospace, Menlo, monospace; opacity: 0.85; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* Scout */
.s__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.s__row { display: grid; grid-template-columns: 40px 1fr auto; gap: 10px; align-items: center; }
.s__score { font-size: 15px; font-weight: 600; font-variant-numeric: tabular-nums; text-align: center; padding: 5px 0; border-radius: 7px; background: var(--atlas-card-bg-2); }
.s__score--high { color: var(--atlas-green); }
.s__score--mid  { color: var(--atlas-yellow); }
.s__score--low  { color: var(--atlas-text-secondary); }
.s__title { font-size: 13.5px; font-weight: 500; color: var(--atlas-text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.s__meta { display: flex; gap: 6px; font-size: 11.5px; color: var(--atlas-text-secondary); margin-top: 2px; flex-wrap: wrap; }
.s__type { font-family: ui-monospace, Menlo, monospace; }
.s__human { color: var(--atlas-red); font-weight: 500; }
.s__repo { font-family: ui-monospace, Menlo, monospace; opacity: 0.75; max-width: 180px; overflow: hidden; text-overflow: ellipsis; }
.s__actions { display: flex; gap: 4px; }
.s__btn {
  border: 1px solid var(--atlas-hairline); background: transparent;
  color: var(--atlas-text-primary); font-size: 11.5px; font-weight: 500;
  padding: 4px 9px; border-radius: 6px; cursor: pointer; font-family: inherit;
}
.s__btn:hover:not(:disabled) { background: rgba(0,0,0,0.04); }
.s__btn:disabled { opacity: 0.4; cursor: not-allowed; }
.s__btn--primary { color: var(--atlas-blue); border-color: var(--atlas-blue); }
.s__btn--primary:hover:not(:disabled) { background: var(--atlas-blue); color: #FFF; }
.s__trials { margin: 8px 0 0; font-size: 11.5px; color: var(--atlas-text-secondary); padding-top: 6px; border-top: 1px solid var(--atlas-hairline); }

/* Corrections */
.r__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 5px; }
.r__row { display: grid; grid-template-columns: 36px auto auto 1fr; gap: 8px; font-size: 12.5px; color: var(--atlas-text-secondary); align-items: baseline; }
.r__time { font-family: ui-monospace, Menlo, monospace; font-size: 11.5px; color: var(--atlas-text-muted); }
.r__before { font-family: ui-monospace, Menlo, monospace; }
.r__arrow { color: var(--atlas-text-muted); }
.r__after { font-family: ui-monospace, Menlo, monospace; color: var(--atlas-blue); font-weight: 500; }
.r__msg { font-size: 12px; opacity: 0.75; grid-column: 4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
@media (max-width: 1023px) { .r__row { grid-template-columns: 1fr auto; } .r__msg { grid-column: 1 / -1; } }

/* Agents */
.ag__empty { font-size: 13px; color: var(--atlas-text-secondary); margin: 0; }
.ag__groups { display: flex; flex-direction: column; gap: 14px; }
.ag__group  { display: flex; flex-direction: column; gap: 4px; }
.ag__division {
  display: inline-flex; align-items: baseline; gap: 4px;
  background: transparent; border: 0; padding: 0;
  font-size: 11px; font-weight: 600; letter-spacing: 0.06em;
  text-transform: uppercase; color: var(--atlas-text-secondary);
  cursor: pointer; font-family: inherit; align-self: flex-start;
  transition: color 100ms ease;
}
.ag__division:hover { color: var(--atlas-blue); }
.ag__division-arrow { opacity: 0.6; font-size: 10px; }
.ag__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.ag__row {
  display: grid; grid-template-columns: 28px 1fr;
  gap: 10px; align-items: center;
  padding: 5px 6px; border-radius: 7px;
  transition: background-color 100ms ease;
}
.ag__row:hover { background: rgba(0,0,0,0.04); }
.ag__avatar {
  width: 28px; height: 28px; border-radius: 50%;
  display: inline-flex; align-items: center; justify-content: center;
  color: #FFF; font-size: 12px; font-weight: 600;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif;
  letter-spacing: -0.02em; flex: none;
}
.ag__body { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.ag__name-row { display: flex; align-items: baseline; gap: 6px; }
.ag__name {
  font-size: 13px; font-weight: 600; color: var(--atlas-text-strong);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
.ag__autonomy {
  font-size: 9.5px; font-family: ui-monospace, Menlo, monospace;
  padding: 1px 5px; border-radius: 4px;
  letter-spacing: 0.02em; text-transform: uppercase;
}
.ag__autonomy--bold       { background: var(--atlas-blue-soft); color: var(--atlas-blue); }
.ag__autonomy--cautious   { background: rgba(255,159,10,0.15); color: var(--atlas-yellow); }
.ag__autonomy--restricted { background: rgba(255,59,48,0.12); color: var(--atlas-red); }
.ag__desc {
  margin: 0; font-size: 11.5px; line-height: 1.45;
  color: var(--atlas-text-secondary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
@media (max-width: 1023px) { .ag__desc { white-space: normal; } }

/* GitHub */
.g__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.g__row { display: grid; grid-template-columns: 50px 1fr auto auto; gap: 10px; align-items: baseline; font-size: 13px; }
.g__kind {
  font-family: ui-monospace, Menlo, monospace; font-size: 11px;
  padding: 2px 6px; border-radius: 5px; text-align: center;
}
.g__kind--pr    { background: var(--atlas-blue-soft); color: var(--atlas-blue); }
.g__kind--issue { background: rgba(255,159,10,0.15); color: var(--atlas-yellow); }
.g__title { color: var(--atlas-text-primary); text-decoration: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.g__title:hover { color: var(--atlas-blue); }
.g__repo { font-family: ui-monospace, Menlo, monospace; font-size: 11.5px; color: var(--atlas-text-secondary); }
.g__time { font-family: ui-monospace, Menlo, monospace; font-size: 11px; color: var(--atlas-text-muted); }
</style>
