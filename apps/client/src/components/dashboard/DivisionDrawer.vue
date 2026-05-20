<template>
  <div class="modal-backdrop" @click.self="$emit('close')">
    <aside class="drawer">
      <header class="drawer__bar">
        <h2 class="drawer__title">
          {{ slug }}
          <span v-if="data?.division?.on_call" class="drawer__autonomy">{{ data.division.on_call }}</span>
        </h2>
        <button class="drawer__close" @click="$emit('close')">×</button>
      </header>

      <div class="drawer__body">
        <p v-if="loading" class="drawer__loading">Loading…</p>
        <template v-else-if="data">
          <p v-if="data.division?.description" class="drawer__desc">{{ data.division.description }}</p>

          <section>
            <h3 class="drawer__h3">Agents</h3>
            <ul class="agents">
              <li v-for="a in data.agents" :key="a.role">
                <span class="agents__role">@{{ a.role }}</span>
                <span class="agents__autonomy">{{ agentAutonomy(a.role) }}</span>
              </li>
            </ul>
          </section>

          <section v-if="(data.missions || []).length">
            <h3 class="drawer__h3">Missions ({{ data.missions.length }})</h3>
            <ul class="missions">
              <li v-for="m in data.missions.slice(0, 8)" :key="m.id || m.title">
                <span class="missions__dot" :class="`missions__dot--${m.status}`"></span>
                <span class="missions__title">{{ m.title }}</span>
                <span class="missions__status">{{ m.status }}</span>
              </li>
            </ul>
          </section>

          <section v-if="(data.schedule || []).length">
            <h3 class="drawer__h3">Schedule</h3>
            <ul class="sched">
              <li v-for="j in data.schedule" :key="j.id">
                <code class="sched__cron">{{ j.cron }}</code>
                <span class="sched__id">{{ j.id }}</span>
                <span class="sched__agent">@{{ j.agent }}</span>
              </li>
            </ul>
          </section>

          <section v-if="(data.audit || []).length">
            <h3 class="drawer__h3">Recent audit ({{ data.audit.length }})</h3>
            <ul class="audit">
              <li v-for="e in data.audit.slice(0, 10)" :key="e.id" :class="`audit__row audit__row--${e.outcome}`">
                <span class="audit__time">{{ relTime(e.ts) }}</span>
                <span class="audit__action">{{ e.action }}</span>
                <span class="audit__summary">{{ truncate(e.summary, 90) }}</span>
              </li>
            </ul>
          </section>
        </template>
        <p v-else class="drawer__loading">Division not found.</p>
      </div>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { fetchDivisionDetail } from '../../composables/useAtlasViews';

const props = defineProps<{ slug: string }>();
defineEmits<{ (e: 'close'): void }>();

const data = ref<any>(null);
const loading = ref(true);

async function load() {
  loading.value = true;
  data.value = await fetchDivisionDetail(props.slug);
  loading.value = false;
}
onMounted(load);
watch(() => props.slug, load);

function agentAutonomy(role: string): string {
  const agents = data.value?.division?.agents || [];
  const found = agents.find((a: any) => a.role === role);
  return found?.autonomy || '?';
}
function truncate(s?: string, n = 80) { if (!s) return ''; return s.length <= n ? s : s.slice(0, n - 1) + '…'; }
function relTime(iso?: string): string {
  if (!iso) return '';
  try {
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return '';
    const s = Math.floor((Date.now() - t) / 1000);
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86_400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86_400)}d`;
  } catch { return ''; }
}
</script>

<style scoped>
.modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; justify-content: flex-end; z-index: 90; }
.drawer { background: var(--atlas-page-bg); color: var(--atlas-text-primary); width: min(560px, 100%); height: 100%; display: flex; flex-direction: column; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif; box-shadow: -8px 0 32px rgba(0,0,0,0.20); }
.drawer__bar { display: flex; align-items: center; padding: 16px 20px; border-bottom: 1px solid var(--atlas-hairline); }
.drawer__title { margin: 0; font-size: 20px; font-weight: 600; display: flex; align-items: baseline; gap: 8px; }
.drawer__autonomy { font-size: 12px; font-weight: 500; color: var(--atlas-blue); background: var(--atlas-blue-soft); padding: 2px 8px; border-radius: 6px; }
.drawer__close { margin-left: auto; background: transparent; border: 0; font-size: 24px; line-height: 1; color: var(--atlas-text-secondary); cursor: pointer; padding: 0 6px; }
.drawer__body { padding: 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 24px; }
.drawer__desc { margin: 0; font-size: 14px; color: var(--atlas-text-secondary); line-height: 1.55; }
.drawer__h3 { margin: 0 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--atlas-text-secondary); font-weight: 500; }
.drawer__loading { font-size: 14px; color: var(--atlas-text-secondary); }

.agents { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; }
.agents li { display: inline-flex; align-items: baseline; gap: 6px; padding: 4px 10px; background: var(--atlas-card-bg); border-radius: 999px; font-size: 13px; }
.agents__role { font-weight: 500; }
.agents__autonomy { font-family: ui-monospace, Menlo, monospace; font-size: 11px; color: var(--atlas-text-secondary); }

.missions, .sched, .audit { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.missions li { display: grid; grid-template-columns: 8px 1fr auto; gap: 10px; align-items: center; font-size: 13px; }
.missions__dot { width: 8px; height: 8px; border-radius: 50%; background: var(--atlas-text-secondary); }
.missions__dot--in_progress { background: var(--atlas-yellow); }
.missions__dot--review      { background: var(--atlas-blue); }
.missions__status { font-family: ui-monospace, Menlo, monospace; color: var(--atlas-text-secondary); font-size: 12px; }

.sched li { display: grid; grid-template-columns: auto 1fr auto; gap: 10px; align-items: baseline; font-size: 13px; }
.sched__cron { font-family: ui-monospace, Menlo, monospace; font-size: 11.5px; color: var(--atlas-text-secondary); }
.sched__id { color: var(--atlas-text-primary); }
.sched__agent { color: var(--atlas-text-secondary); font-size: 12px; }

.audit__row { display: grid; grid-template-columns: 40px auto 1fr; gap: 10px; font-size: 12.5px; color: var(--atlas-text-secondary); align-items: baseline; }
.audit__time { font-family: ui-monospace, Menlo, monospace; font-size: 11px; color: var(--atlas-text-muted); }
.audit__action { font-family: ui-monospace, Menlo, monospace; color: var(--atlas-text-primary); }
.audit__summary { opacity: 0.85; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.audit__row--blocked .audit__action { color: var(--atlas-red); }
.audit__row--queued  .audit__action { color: var(--atlas-yellow); }
</style>
