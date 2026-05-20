<template>
  <div class="portfolio">
    <header class="portfolio__header">
      <h1>Portfolio</h1>
      <p class="portfolio__sub">Every project. Every stage. Click any cell to drop into that stage.</p>
      <div class="portfolio__header-actions">
        <button type="button" class="portfolio__new-btn" @click="openTemplatePicker">+ New project from template</button>
      </div>
      <button type="button" class="portfolio__close" @click="$emit('close')" aria-label="Close">×</button>
    </header>

    <div class="portfolio__grid-wrap">
      <table class="portfolio__grid">
        <thead>
          <tr>
            <th class="portfolio__col-proj">Project</th>
            <th v-for="s in LIFECYCLE_STAGES" :key="s.id">{{ s.n }}·{{ s.label }}</th>
            <th class="portfolio__col-actions" aria-label="Actions"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in projectList" :key="p.slug" class="portfolio__row">
            <td class="portfolio__col-proj">
              <div class="portfolio__proj-name">{{ p.name }}</div>
              <div class="portfolio__proj-meta">
                <span class="portfolio__chip portfolio__chip--type">{{ p.type || 'UNKNOWN' }}</span>
                <span class="portfolio__chip portfolio__chip--prog">{{ p.overall_progress }}%</span>
              </div>
            </td>
            <td v-for="s in LIFECYCLE_STAGES" :key="s.id"
                :class="['portfolio__cell', cellClass(p, s.id)]"
                @click="$emit('open-project', p.slug, s.id)">
              <span class="portfolio__cell-mark">{{ cellMark(p, s.id) }}</span>
              <span v-if="cellCount(p, s.id) !== null" class="portfolio__cell-count">{{ cellCount(p, s.id) }}</span>
            </td>
            <td class="portfolio__col-actions">
              <button
                type="button"
                class="portfolio__row-discard"
                :title="`Discard ${p.name}`"
                :aria-label="`Discard ${p.name}`"
                @click.stop="askDiscard(p)"
              >×</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="portfolio__legend">
      <span><b>✓</b> stage complete</span>
      <span><b>●N</b> active with N open items</span>
      <span><b>─</b> not reached</span>
      <span class="portfolio__legend-spacer"></span>
      <span class="portfolio__legend-note">click any cell to enter project shell at that stage</span>
    </div>

    <!-- New project from template modal -->
    <div v-if="spinupOpen" class="portfolio__modal" role="dialog" aria-modal="true" @click.self="closeSpinup">
      <div class="portfolio__modal-card portfolio__modal-card--wide">
        <h2 class="portfolio__modal-h">New project from template</h2>

        <!-- Step 1: pick template -->
        <div v-if="spinupStep === 'pick'">
          <p class="portfolio__modal-body" v-if="!templates.length && !templatesError">Loading templates…</p>
          <p class="portfolio__modal-body" v-else-if="templatesError">Couldn't load templates: {{ templatesError }}</p>
          <ul v-else class="portfolio__tpl-list">
            <li v-for="t in templates" :key="t.slug">
              <button type="button" class="portfolio__tpl-btn" @click="selectTemplate(t)">
                <div class="portfolio__tpl-name">{{ t.name || t.slug }}</div>
                <div class="portfolio__tpl-desc">{{ t.description }}</div>
                <div class="portfolio__tpl-meta">
                  <span>{{ t.agent_count }} agents</span>
                  <span>{{ t.routine_count }} routines</span>
                  <span>{{ t.goal_count }} goals</span>
                </div>
              </button>
            </li>
          </ul>
          <div class="portfolio__modal-actions">
            <button type="button" class="portfolio__btn" @click="closeSpinup">Cancel</button>
          </div>
        </div>

        <!-- Step 2: form -->
        <div v-else-if="spinupStep === 'form'">
          <p class="portfolio__modal-body">Template: <b>{{ selectedTemplate?.slug }}</b></p>
          <label class="portfolio__field">
            <span>Project slug</span>
            <input v-model="projectSlug" type="text" placeholder="my-new-project" autofocus />
            <small>kebab-case, 3-32 chars, a-z 0-9 -</small>
          </label>
          <label class="portfolio__field">
            <span>Project name</span>
            <input v-model="projectName" type="text" placeholder="My New Project" />
          </label>
          <p v-if="spinupError" class="portfolio__modal-warn">{{ spinupError }}</p>
          <div class="portfolio__modal-actions">
            <button type="button" class="portfolio__btn" @click="spinupStep = 'pick'">Back</button>
            <button type="button" class="portfolio__btn portfolio__btn--primary"
                    :disabled="!canPreview || spinupLoading"
                    @click="loadPreview">
              {{ spinupLoading ? 'Loading…' : 'Preview plan' }}
            </button>
          </div>
        </div>

        <!-- Step 3: preview + confirm -->
        <div v-else-if="spinupStep === 'preview' && previewPlan">
          <p class="portfolio__modal-body">
            <b>{{ projectName }}</b> (<code>{{ projectSlug }}</code>) will create:
          </p>
          <div class="portfolio__plan">
            <div class="portfolio__plan-section">
              <h3>{{ previewPlan.agents_to_add.length }} agents</h3>
              <ul>
                <li v-for="a in previewPlan.agents_to_add" :key="a.id">
                  <span class="portfolio__dot" :style="{ background: a.color }"></span>
                  <code>{{ a.id }}</code> — {{ a.role }}
                </li>
              </ul>
            </div>
            <div class="portfolio__plan-section">
              <h3>{{ Object.keys(previewPlan.budgets_to_add).length }} budget entries</h3>
              <ul>
                <li v-for="(b, id) in previewPlan.budgets_to_add" :key="id">
                  <code>{{ id }}</code> — ${{ b.monthly_usd }}/mo
                </li>
              </ul>
            </div>
            <div class="portfolio__plan-section">
              <h3>{{ previewPlan.goals_to_add.length }} goals</h3>
              <ul>
                <li v-for="g in previewPlan.goals_to_add" :key="g.id"><code>{{ g.id }}</code> — {{ g.name }}</li>
              </ul>
            </div>
            <div class="portfolio__plan-section">
              <h3>{{ previewPlan.routines_to_create.length }} routines</h3>
              <ul>
                <li v-for="r in previewPlan.routines_to_create" :key="r.name">
                  <code>{{ r.name }}</code> — {{ r.trigger.kind }}{{ r.trigger.kind === 'cron' ? ' · ' + r.trigger.expr : '' }}
                </li>
              </ul>
            </div>
            <div class="portfolio__plan-section">
              <h3>Project directory</h3>
              <code>{{ previewPlan.project_dir }}</code>
            </div>
          </div>
          <p v-if="spinupError" class="portfolio__modal-warn">{{ spinupError }}</p>
          <div class="portfolio__modal-actions">
            <button type="button" class="portfolio__btn" @click="spinupStep = 'form'">Back</button>
            <button type="button" class="portfolio__btn portfolio__btn--primary"
                    :disabled="spinupLoading"
                    @click="applyPlan">
              {{ spinupLoading ? 'Creating…' : 'Create project' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Confirm discard modal -->
    <div v-if="discardTarget" class="portfolio__modal" role="dialog" aria-modal="true" @click.self="discardTarget = null">
      <div class="portfolio__modal-card">
        <h2 class="portfolio__modal-h">Discard project?</h2>
        <p class="portfolio__modal-body">
          <b>{{ discardTarget.name }}</b> will be moved to <code>~/atlas/.archive/{{ discardTarget.slug }}-{{ todayStamp }}/</code>.
          Reversible by hand — not a hard delete.
        </p>
        <p class="portfolio__modal-warn">
          Phase progress: <b>{{ discardTarget.overall_progress }}%</b>. Files preserved in the archive.
        </p>
        <div class="portfolio__modal-actions">
          <button type="button" class="portfolio__btn" @click="discardTarget = null">Cancel</button>
          <button type="button" class="portfolio__btn portfolio__btn--danger" :disabled="discardLoading" @click="confirmDiscard">
            {{ discardLoading ? 'Discarding…' : 'Discard project' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useProjectView, archiveProject, LIFECYCLE_STAGES, type ProjectView, type LifecycleStage } from '../composables/useProjectView';

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'open-project', slug: string, stage: LifecycleStage): void;
}>();

const { projectList, refreshAll } = useProjectView();
onMounted(refreshAll);

const discardTarget = ref<ProjectView | null>(null);
const discardLoading = ref(false);
const todayStamp = computed(() => new Date().toISOString().slice(0, 10));

function askDiscard(p: ProjectView) {
  discardTarget.value = p;
}
async function confirmDiscard() {
  if (!discardTarget.value || discardLoading.value) return;
  const slug = discardTarget.value.slug;
  discardLoading.value = true;
  try {
    const r = await archiveProject(slug);
    if (!r.ok) {
      alert(r.error || 'Discard failed');
      return;
    }
    discardTarget.value = null;
  } finally {
    discardLoading.value = false;
  }
}

// Stage index map: incubate=0, plan=1, build=2, launch=3, operate=4, sunset=5.
const STAGE_IDX: Record<LifecycleStage, number> = {
  plan: 0, build: 1, launch: 2, operate: 3, sunset: 4,
};

function activeIdx(p: ProjectView): number {
  // Legacy `incubate` values map to plan (now the first stage on a project).
  const s = (p.current_stage || 'plan') as LifecycleStage;
  return STAGE_IDX[s] ?? 0;
}

function cellMark(p: ProjectView, stage: LifecycleStage): string {
  const idx = STAGE_IDX[stage];
  const cur = activeIdx(p);
  if (idx < cur) return '✓';
  if (idx === cur) return '●';
  return '─';
}

function cellClass(p: ProjectView, stage: LifecycleStage): string {
  const idx = STAGE_IDX[stage];
  const cur = activeIdx(p);
  if (idx < cur)  return 'is-done';
  if (idx === cur) return 'is-active';
  return 'is-future';
}

// ---- Paperclip-8: New project from template -----------------------------

interface TemplateSummary {
  slug: string;
  name: string;
  description: string;
  agent_count: number;
  routine_count: number;
  goal_count: number;
}

interface PreviewAgent { id: string; name: string; role: string; reports_to: string | null; color: string }
interface PreviewBudget { monthly_usd: number; notes?: string }
interface PreviewGoal { id: string; name: string; project_id?: string | null; status?: string }
interface PreviewRoutine { name: string; template_slug: string; trigger: { kind: string; expr?: string } }
interface PreviewPlan {
  ok: true; dry_run: true;
  project_slug: string; project_name: string;
  agents_to_add: PreviewAgent[];
  budgets_to_add: Record<string, PreviewBudget>;
  goals_to_add: PreviewGoal[];
  routines_to_create: PreviewRoutine[];
  project_dir: string;
}

const spinupOpen = ref(false);
const spinupStep = ref<'pick' | 'form' | 'preview'>('pick');
const templates = ref<TemplateSummary[]>([]);
const templatesError = ref<string | null>(null);
const selectedTemplate = ref<TemplateSummary | null>(null);
const projectSlug = ref('');
const projectName = ref('');
const previewPlan = ref<PreviewPlan | null>(null);
const spinupError = ref<string | null>(null);
const spinupLoading = ref(false);

const canPreview = computed(() => {
  return /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(projectSlug.value.trim())
      && projectName.value.trim().length > 0;
});

async function openTemplatePicker() {
  spinupOpen.value = true;
  spinupStep.value = 'pick';
  selectedTemplate.value = null;
  projectSlug.value = '';
  projectName.value = '';
  previewPlan.value = null;
  spinupError.value = null;
  templatesError.value = null;
  templates.value = [];
  try {
    const res = await fetch('/api/atlas/spinup/templates');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    templates.value = j.templates || [];
  } catch (e: any) {
    templatesError.value = e?.message || String(e);
  }
}

function closeSpinup() {
  spinupOpen.value = false;
}

function selectTemplate(t: TemplateSummary) {
  selectedTemplate.value = t;
  spinupStep.value = 'form';
}

async function loadPreview() {
  if (!selectedTemplate.value || !canPreview.value) return;
  spinupLoading.value = true;
  spinupError.value = null;
  try {
    const res = await fetch('/api/atlas/spinup/instantiate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        template_slug: selectedTemplate.value.slug,
        project_slug: projectSlug.value.trim(),
        project_name: projectName.value.trim(),
        dry_run: true,
      }),
    });
    const j = await res.json();
    if (!res.ok) {
      spinupError.value = j?.error || `HTTP ${res.status}`;
      return;
    }
    previewPlan.value = j as PreviewPlan;
    spinupStep.value = 'preview';
  } catch (e: any) {
    spinupError.value = e?.message || String(e);
  } finally {
    spinupLoading.value = false;
  }
}

async function applyPlan() {
  if (!selectedTemplate.value) return;
  spinupLoading.value = true;
  spinupError.value = null;
  try {
    const res = await fetch('/api/atlas/spinup/instantiate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        template_slug: selectedTemplate.value.slug,
        project_slug: projectSlug.value.trim(),
        project_name: projectName.value.trim(),
        dry_run: false,
      }),
    });
    const j = await res.json();
    if (!res.ok) {
      spinupError.value = j?.error || `HTTP ${res.status}`;
      return;
    }
    const slug = projectSlug.value.trim();
    closeSpinup();
    await refreshAll();
    emit('open-project', slug, 'plan');
  } catch (e: any) {
    spinupError.value = e?.message || String(e);
  } finally {
    spinupLoading.value = false;
  }
}

function cellCount(p: ProjectView, stage: LifecycleStage): number | null {
  if (stage !== p.current_stage) return null;
  // Best-effort open-item count per stage.
  if (stage === 'build') {
    const build = p.phases.find(ph => ph.id === 'build');
    if (build) return build.tasks.filter(t => !t.done).length;
  }
  if (stage === 'plan') {
    const total = p.phases.reduce((s, ph) => s + ph.tasks.length, 0);
    const open  = p.phases.reduce((s, ph) => s + ph.tasks.filter(t => !t.done).length, 0);
    return total ? open : null;
  }
  return null;
}
</script>

<style scoped>
.portfolio {
  position: fixed; inset: 0;
  background: var(--atlas-page-bg);
  color: var(--atlas-text-primary);
  z-index: var(--atlas-z-modal);
  overflow: auto;
  padding: 40px 48px 64px;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif;
}
@media (max-width: 1023px) { .portfolio { padding: 24px 16px 48px; } }

.portfolio__header { position: relative; margin-bottom: 24px; }
.portfolio__header h1 { font-size: 36px; font-weight: 700; letter-spacing: -0.02em; margin: 0 0 6px; }
.portfolio__sub { font-size: 14px; color: var(--atlas-text-muted); margin: 0; }
.portfolio__close {
  position: absolute; top: -6px; right: 0;
  background: transparent; border: none; color: var(--atlas-text-muted);
  font-size: 28px; line-height: 1; cursor: pointer; padding: 4px 8px;
}
.portfolio__close:hover { color: var(--atlas-text-strong); }

.portfolio__grid-wrap { overflow-x: auto; border: 1px solid var(--atlas-hairline); border-radius: 12px; background: var(--atlas-card-bg); }
.portfolio__grid {
  width: 100%; min-width: 720px;
  border-collapse: separate; border-spacing: 0;
  font-size: 13px;
}
.portfolio__grid th, .portfolio__grid td {
  text-align: left; padding: 14px 14px;
  border-bottom: 1px solid var(--atlas-hairline);
}
.portfolio__grid th {
  font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em;
  color: var(--atlas-text-muted); font-weight: 600;
}
.portfolio__col-proj { min-width: 220px; }
.portfolio__proj-name { font-weight: 600; color: var(--atlas-text-strong); }
.portfolio__proj-meta { display: inline-flex; gap: 6px; margin-top: 4px; }
.portfolio__chip {
  display: inline-block; padding: 2px 8px; border-radius: 999px;
  font-size: 11px; font-weight: 500;
  background: var(--atlas-card-bg-2); color: var(--atlas-text-secondary);
}
.portfolio__chip--type { font-variant-numeric: tabular-nums; }

.portfolio__cell {
  text-align: center; cursor: pointer;
  user-select: none;
  transition: background var(--atlas-duration-fast) var(--atlas-ease);
  min-width: 90px;
}
.portfolio__cell:hover { background: var(--atlas-card-bg-2); }
.portfolio__cell-mark { font-size: 18px; font-weight: 600; }
.portfolio__cell-count {
  display: inline-block; margin-left: 6px;
  padding: 1px 6px; border-radius: 999px;
  background: var(--atlas-blue); color: white;
  font-size: 11px; font-weight: 600; min-width: 18px;
}
.portfolio__cell.is-done   { color: var(--atlas-text-muted); }
.portfolio__cell.is-active { color: var(--atlas-text-strong); }
.portfolio__cell.is-future { color: var(--atlas-text-muted); opacity: 0.4; }

.portfolio__legend {
  display: flex; gap: 18px; align-items: center;
  margin-top: 16px; font-size: 12px; color: var(--atlas-text-muted);
  flex-wrap: wrap;
}
.portfolio__legend b { color: var(--atlas-text-strong); font-weight: 600; margin-right: 4px; }
.portfolio__legend-spacer { flex: 1; }
.portfolio__legend-note { font-style: italic; }

/* Row discard button */
.portfolio__col-actions { width: 40px; text-align: right; padding-right: 14px !important; }
.portfolio__row-discard {
  background: transparent; border: none; cursor: pointer;
  color: var(--atlas-text-muted);
  font-size: 18px; line-height: 1; padding: 4px 8px;
  border-radius: 6px;
  transition: background 80ms ease, color 80ms ease;
}
.portfolio__row-discard:hover {
  background: rgba(255, 59, 48, 0.10);
  color: var(--atlas-red);
}

/* Confirm modal */
.portfolio__modal {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: calc(var(--atlas-z-modal) + 10);
  display: flex; align-items: center; justify-content: center;
  padding: 16px;
}
.portfolio__modal-card {
  background: var(--atlas-card-bg);
  border: 1px solid var(--atlas-hairline);
  border-radius: 12px;
  padding: 22px 24px;
  max-width: 460px; width: 100%;
  font-family: inherit;
}
.portfolio__modal-h { font-size: 18px; font-weight: 700; margin: 0 0 10px; color: var(--atlas-text-strong); }
.portfolio__modal-body { font-size: 13px; color: var(--atlas-text-secondary); margin: 0 0 8px; line-height: 1.5; }
.portfolio__modal-body code { background: var(--atlas-card-bg-2); padding: 1px 6px; border-radius: 4px; font-size: 11px; }
.portfolio__modal-warn { font-size: 12px; color: var(--atlas-text-muted); margin: 0 0 18px; }
.portfolio__modal-actions { display: flex; gap: 8px; justify-content: flex-end; }
.portfolio__btn {
  background: var(--atlas-card-bg-2); color: var(--atlas-text-strong);
  border: 1px solid var(--atlas-hairline);
  font-family: inherit; font-size: 13px; font-weight: 600;
  padding: 7px 14px; border-radius: 7px; cursor: pointer;
}
.portfolio__btn:hover:not(:disabled) { background: var(--atlas-page-bg); }
.portfolio__btn:disabled { opacity: 0.5; cursor: default; }
.portfolio__btn--danger {
  background: rgba(255, 59, 48, 0.12); color: var(--atlas-red);
  border-color: rgba(255, 59, 48, 0.32);
}
.portfolio__btn--danger:hover:not(:disabled) { background: rgba(255, 59, 48, 0.22); }
.portfolio__btn--primary {
  background: var(--atlas-blue); color: white;
  border-color: var(--atlas-blue);
}
.portfolio__btn--primary:hover:not(:disabled) { filter: brightness(1.1); }

/* New project button */
.portfolio__header-actions { position: absolute; top: 0; right: 56px; display: flex; gap: 8px; }
.portfolio__new-btn {
  background: var(--atlas-card-bg-2); color: var(--atlas-text-strong);
  border: 1px solid var(--atlas-hairline);
  font-family: inherit; font-size: 13px; font-weight: 600;
  padding: 8px 14px; border-radius: 8px; cursor: pointer;
}
.portfolio__new-btn:hover { background: var(--atlas-page-bg); }

/* Template picker modal */
.portfolio__modal-card--wide { max-width: 640px; }
.portfolio__tpl-list { list-style: none; margin: 0 0 16px; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.portfolio__tpl-btn {
  width: 100%; text-align: left;
  background: var(--atlas-card-bg-2); border: 1px solid var(--atlas-hairline);
  padding: 12px 14px; border-radius: 8px; cursor: pointer;
  font-family: inherit;
  transition: background 80ms ease, border-color 80ms ease;
}
.portfolio__tpl-btn:hover { background: var(--atlas-page-bg); border-color: var(--atlas-blue); }
.portfolio__tpl-name { font-size: 14px; font-weight: 600; color: var(--atlas-text-strong); margin-bottom: 4px; text-transform: capitalize; }
.portfolio__tpl-desc { font-size: 12px; color: var(--atlas-text-secondary); line-height: 1.4; margin-bottom: 6px; }
.portfolio__tpl-meta { display: flex; gap: 12px; font-size: 11px; color: var(--atlas-text-muted); }

.portfolio__field { display: block; margin-bottom: 14px; }
.portfolio__field span { display: block; font-size: 12px; font-weight: 600; color: var(--atlas-text-strong); margin-bottom: 4px; }
.portfolio__field input {
  width: 100%; padding: 8px 10px; box-sizing: border-box;
  font-family: inherit; font-size: 13px;
  background: var(--atlas-card-bg-2); color: var(--atlas-text-strong);
  border: 1px solid var(--atlas-hairline); border-radius: 6px;
}
.portfolio__field input:focus { outline: none; border-color: var(--atlas-blue); }
.portfolio__field small { display: block; font-size: 11px; color: var(--atlas-text-muted); margin-top: 4px; }

.portfolio__plan { max-height: 360px; overflow-y: auto; margin-bottom: 14px; }
.portfolio__plan-section { margin-bottom: 14px; }
.portfolio__plan-section h3 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--atlas-text-muted); font-weight: 600; margin: 0 0 6px; }
.portfolio__plan-section ul { list-style: none; margin: 0; padding: 0; font-size: 12px; color: var(--atlas-text-secondary); }
.portfolio__plan-section li { padding: 3px 0; line-height: 1.45; }
.portfolio__plan-section code { background: var(--atlas-card-bg-2); padding: 1px 5px; border-radius: 3px; font-size: 11px; }
.portfolio__dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; vertical-align: middle; }
</style>
