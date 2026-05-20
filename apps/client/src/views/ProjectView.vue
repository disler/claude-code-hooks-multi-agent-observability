<template>
  <PageShell
    :pages="PAGES"
    active="project"
    body-class="proj-body-shell"
    :back="false"
    :project-name="active?.name || null"
    @nav="onNav"
  >
    <template #chipStrip>
      <div v-if="projectList.length > 0" class="proj-projsel">
        <button
          v-for="p in projectList"
          :key="p.slug"
          class="proj-head__projsel-chip"
          :class="{ 'is-active': p.slug === activeSlug }"
          @click="activeSlug = p.slug"
        >{{ p.name }}</button>
      </div>
    </template>

    <!-- Title bar -->
    <div class="proj-titlebar" v-if="active">
      <h1 class="proj-titlebar__name">{{ active.name }}</h1>
      <span class="proj-chip" :class="`is-${active.phase_tone}`">Phase: {{ active.phase_label }}</span>
      <span class="proj-chip">{{ active.updated_label }}</span>
      <span class="proj-chip is-info">{{ active.overall_progress }}% complete</span>
      <div class="proj-titlebar__spacer"></div>
      <select
        class="proj-btn"
        :value="active.granularity"
        @change="onGranularityChange(($event.target as HTMLSelectElement).value)"
        title="Card spawn granularity"
      >
        <option value="coarse">Coarse: 1 card per phase</option>
        <option value="fine">Fine: 1 card per task</option>
      </select>
      <button class="proj-btn proj-btn--primary" :disabled="active.overall_progress < 100">Export deliverable</button>
    </div>

    <!-- Scaffold prompt -->
    <div v-if="active && !active.has_projectview" class="proj-scaffold">
      <p class="proj-section__lead">
        <strong>{{ active.name }}</strong> has no ProjectView yet. Scaffold a fresh
        white paper, goals doc, and 7-phase tree under <code>~/atlas/projects/{{ active.slug }}/</code>.
      </p>
      <input
        v-model="scaffoldOneLiner"
        class="proj-input"
        placeholder="One-line north star (optional)"
      />
      <div class="proj-scaffold__actions">
        <button class="proj-btn proj-btn--primary" @click="onScaffold">Scaffold ProjectView</button>
      </div>
    </div>

    <!-- Empty list state -->
    <div v-if="!active" class="proj-empty">
      <p class="proj-section__lead">No projects detected under <code>~/atlas/projects/</code>.</p>
      <p class="proj-section__lead proj-section__lead--muted">
        Run <code>/atlas-plan &lt;slug&gt; "&lt;one-line vision&gt;"</code> to create one.
      </p>
    </div>

    <!-- Main split layout -->
    <main class="proj-body" v-if="active">
      <!-- LEFT: sticky phase tree + summary chips -->
      <aside class="proj-left">
        <section class="proj-card">
          <h3 class="proj-card__title">Phase Tree</h3>
          <ul class="proj-tree">
            <li v-for="phase in active.phases" :key="phase.id" class="proj-tree__phase">
              <button
                class="proj-tree__phase-row"
                :class="{ 'is-done': phase.status === 'done', 'is-active': phase.status === 'active' }"
                @click="togglePhase(phase.id)"
              >
                <span class="proj-tree__caret">{{ expanded[phase.id] ? '▼' : '▶' }}</span>
                <span class="proj-tree__phase-name">{{ phase.title }}</span>
                <span class="proj-tree__phase-count">
                  {{ phase.tasks.filter(t => t.done).length }}/{{ phase.tasks.length }}
                </span>
                <span v-if="phase.status === 'done'" class="proj-tree__check">✓</span>
              </button>
              <ul v-if="expanded[phase.id]" class="proj-tree__tasks">
                <li v-for="task in phase.tasks" :key="task.id" class="proj-tree__task">
                  <label class="proj-tree__task-row" :class="{ 'is-done': task.done }">
                    <input
                      type="checkbox"
                      :checked="task.done"
                      @change="onToggleTask(phase.id, task.id, !task.done)"
                    />
                    <span class="proj-tree__task-name">{{ task.title }}</span>
                    <button
                      v-if="!task.done && !task.in_kanban"
                      class="proj-tree__send"
                      @click.prevent="onSendToKanban(phase.id, task.id)"
                      title="Create Kanban card"
                    >→ Kanban</button>
                    <span v-else-if="task.in_kanban && !task.done" class="proj-tree__pill is-warn">in kanban</span>
                  </label>
                </li>
                <li class="proj-tree__task">
                  <input
                    class="proj-input proj-input--inline"
                    placeholder="+ add task (Enter to save)"
                    @keyup.enter="onAddTask(phase.id, $event)"
                  />
                </li>
              </ul>
            </li>
          </ul>
          <div class="proj-add-phase">
            <input
              class="proj-input proj-input--inline"
              placeholder="+ add phase (Enter to save)"
              @keyup.enter="onAddPhase($event)"
            />
          </div>
        </section>

        <section class="proj-card proj-card--summary">
          <h3 class="proj-card__title">Quick stats</h3>
          <ul class="proj-stat-list">
            <li><span>Goals</span><strong>{{ active.goals.length }} active</strong></li>
            <li><span>Assets</span><strong>{{ active.assets.length }} files</strong></li>
            <li><span>Risks</span><strong>{{ active.risks.filter(r => !r.resolved).length }} open</strong></li>
            <li><span>Decisions</span><strong>{{ active.decisions.length }} logged</strong></li>
            <li><span>Open questions</span><strong>{{ active.open_questions.length }}</strong></li>
            <li><span>Features</span><strong>{{ active.features_log.length }} entries</strong></li>
          </ul>
        </section>
      </aside>

      <!-- RIGHT: white paper scroll + bottom panels -->
      <section class="proj-right">
        <!-- White paper sections -->
        <article id="sec-north-star" class="proj-card">
          <h2 class="proj-section__title">
            North Star
            <button class="proj-edit" @click="openEditor('North Star', active.north_star)">edit</button>
          </h2>
          <p class="proj-section__lead">{{ active.north_star || '_(no north star yet — click edit)_' }}</p>
        </article>

        <article id="sec-discovery" class="proj-card">
          <h2 class="proj-section__title">
            Discovery
            <button class="proj-edit" @click="openSectionEditor('Discovery')">edit</button>
          </h2>
          <dl class="proj-kv">
            <dt>Problem</dt><dd>{{ active.discovery.problem || '—' }}</dd>
            <dt>Target</dt><dd>{{ active.discovery.target || '—' }}</dd>
            <dt>Wedge</dt><dd>{{ active.discovery.wedge || '—' }}</dd>
            <dt>Competitors</dt>
            <dd>
              <span v-for="c in active.discovery.competitors" :key="c" class="proj-tag">{{ c }}</span>
              <span v-if="active.discovery.competitors.length === 0">—</span>
            </dd>
            <dt>Demand signal</dt><dd>{{ active.discovery.demand || '—' }}</dd>
          </dl>
        </article>

        <article id="sec-requirements" class="proj-card">
          <h2 class="proj-section__title">
            Requirements
            <button class="proj-edit" @click="openSectionEditor('Requirements')">edit</button>
          </h2>
          <h4 class="proj-section__sub">User stories</h4>
          <ul class="proj-list">
            <li v-for="s in active.requirements.stories" :key="s">{{ s }}</li>
            <li v-if="active.requirements.stories.length === 0" class="is-muted">— none yet —</li>
          </ul>
          <h4 class="proj-section__sub">Non-goals</h4>
          <ul class="proj-list proj-list--muted">
            <li v-for="n in active.requirements.non_goals" :key="n">{{ n }}</li>
            <li v-if="active.requirements.non_goals.length === 0" class="is-muted">— none yet —</li>
          </ul>
        </article>

        <article id="sec-architecture" class="proj-card">
          <h2 class="proj-section__title">
            Architecture
            <button class="proj-edit" @click="openSectionEditor('Architecture')">edit</button>
          </h2>
          <dl class="proj-kv">
            <dt>Stack</dt><dd>{{ active.architecture.stack || '—' }}</dd>
            <dt>Data model</dt><dd>{{ active.architecture.data_model || '—' }}</dd>
            <dt>Auth</dt><dd>{{ active.architecture.auth || '—' }}</dd>
            <dt>Integrations</dt>
            <dd>
              <span v-for="i in active.architecture.integrations" :key="i" class="proj-tag">{{ i }}</span>
              <span v-if="active.architecture.integrations.length === 0">—</span>
            </dd>
          </dl>
        </article>

        <article id="sec-roadmap" class="proj-card">
          <h2 class="proj-section__title">
            Roadmap
            <button class="proj-edit" @click="openSectionEditor('Roadmap')">edit</button>
          </h2>
          <ul class="proj-roadmap">
            <li v-for="m in active.roadmap" :key="m.id" :class="{ 'is-done': m.done }">
              <span class="proj-roadmap__dot" :class="{ 'is-done': m.done }"></span>
              <span class="proj-roadmap__name">{{ m.title }}</span>
              <span class="proj-roadmap__date">{{ m.target }}</span>
            </li>
            <li v-if="active.roadmap.length === 0" class="is-muted">— no milestones yet —</li>
          </ul>
        </article>

        <article id="sec-risks" class="proj-card">
          <h2 class="proj-section__title">
            Risks
            <button class="proj-edit" @click="openSectionEditor('Risks')">edit</button>
          </h2>
          <ul class="proj-list">
            <li v-for="r in active.risks" :key="r.id" :class="{ 'is-resolved': r.resolved }">
              <strong>{{ r.title }}</strong> — {{ r.mitigation }}
              <span v-if="r.resolved" class="proj-pill is-good">resolved</span>
            </li>
            <li v-if="active.risks.length === 0" class="is-muted">— none yet —</li>
          </ul>
        </article>

        <article id="sec-decisions" class="proj-card">
          <h2 class="proj-section__title">
            Decisions Log
            <button class="proj-edit" @click="decisionOpen = true">+ add</button>
          </h2>
          <ul class="proj-decisions">
            <li v-for="d in active.decisions" :key="d.id">
              <span class="proj-decisions__date">{{ d.date }}</span>
              <span class="proj-decisions__body">
                <strong>{{ d.title }}</strong> — {{ d.why }}
              </span>
            </li>
            <li v-if="active.decisions.length === 0" class="is-muted">— no decisions logged —</li>
          </ul>
          <div v-if="decisionOpen" class="proj-add-row">
            <input v-model="decisionTitle" class="proj-input" placeholder="Decision title" />
            <input v-model="decisionWhy" class="proj-input" placeholder="Why (one line)" />
            <button class="proj-btn proj-btn--primary" @click="onAddDecision">Save</button>
            <button class="proj-btn" @click="decisionOpen = false">Cancel</button>
          </div>
        </article>

        <article id="sec-questions" class="proj-card">
          <h2 class="proj-section__title">
            Open Questions
            <button class="proj-edit" @click="openSectionEditor('Open Questions')">edit</button>
          </h2>
          <ul class="proj-list">
            <li v-for="q in active.open_questions" :key="q">{{ q }}</li>
            <li v-if="active.open_questions.length === 0" class="is-muted">— none open —</li>
          </ul>
        </article>

        <article id="sec-features" class="proj-card">
          <h2 class="proj-section__title">
            Features Log
            <button class="proj-edit" @click="featureOpen = true">+ add</button>
          </h2>
          <ul class="proj-list">
            <li v-for="f in active.features_log" :key="f">{{ f }}</li>
            <li v-if="active.features_log.length === 0" class="is-muted">— no features logged —</li>
          </ul>
          <div v-if="featureOpen" class="proj-add-row">
            <input v-model="featureText" class="proj-input" placeholder="Feature description" />
            <button class="proj-btn proj-btn--primary" @click="onAddFeature">Save</button>
            <button class="proj-btn" @click="featureOpen = false">Cancel</button>
          </div>
        </article>

        <!-- Bottom collapsible panels -->
        <article id="panel-goals" class="proj-card proj-panel">
          <button class="proj-panel__head" @click="panels.goals = !panels.goals">
            <span class="proj-panel__caret">{{ panels.goals ? '▼' : '▶' }}</span>
            <h2 class="proj-section__title proj-panel__title">Goals</h2>
            <span class="proj-chip">{{ active.goals.length }} active</span>
            <span class="proj-panel__spacer"></span>
            <span class="proj-panel__hint">Long-running. Edit ~/atlas/projects/{{ active.slug }}/GOALS.md.</span>
          </button>
          <div v-if="panels.goals" class="proj-panel__body">
            <div v-for="g in active.goals" :key="g.id" class="proj-goal">
              <div class="proj-goal__head">
                <strong>{{ g.title }}</strong>
                <span class="proj-chip is-info">{{ g.progress }}%</span>
                <span class="proj-chip" v-if="g.target">target {{ g.target }}</span>
              </div>
              <p class="proj-goal__metric" v-if="g.metric">Measure: {{ g.metric }}</p>
              <div class="proj-bar"><span :style="{ width: g.progress + '%' }"></span></div>
              <ul class="proj-goal__milestones">
                <li v-for="m in g.milestones" :key="m.title" :class="{ 'is-done': m.done }">
                  <input type="checkbox" :checked="m.done" disabled /> {{ m.title }}
                </li>
              </ul>
            </div>
            <p v-if="active.goals.length === 0" class="is-muted">No goals yet — edit GOALS.md directly.</p>
          </div>
        </article>

        <article id="panel-cascade" class="proj-card proj-panel">
          <button class="proj-panel__head" @click="panels.cascade = !panels.cascade">
            <span class="proj-panel__caret">{{ panels.cascade ? '▼' : '▶' }}</span>
            <h2 class="proj-section__title proj-panel__title">Goal cascade</h2>
            <span class="proj-chip is-info">Mission → Project → Goal → Task</span>
            <span
              v-if="orphanCount > 0"
              class="proj-chip is-bad"
              :title="orphanCount + ' Kanban card(s) have no goal_id'"
            >
              <span class="proj-orphan-dot"></span>
              {{ orphanCount }} unassigned
            </span>
            <span class="proj-panel__spacer"></span>
            <span class="proj-panel__hint">~/atlas/memory/goals.json</span>
          </button>
          <div v-if="panels.cascade" class="proj-panel__body">
            <GoalTree
              :projectId="active.slug"
              :goalId="selectedGoalId || undefined"
              @select="onGoalSelected"
            />
            <p v-if="selectedGoalId" class="proj-section__lead--muted" style="margin-top: 10px;">
              Selected goal id: <code>{{ selectedGoalId }}</code>
            </p>
          </div>
        </article>

        <article id="panel-assets" class="proj-card proj-panel">
          <button class="proj-panel__head" @click="panels.assets = !panels.assets">
            <span class="proj-panel__caret">{{ panels.assets ? '▼' : '▶' }}</span>
            <h2 class="proj-section__title proj-panel__title">Assets</h2>
            <span class="proj-chip">{{ active.assets.length }} files</span>
            <span class="proj-panel__spacer"></span>
            <span class="proj-panel__hint">Drop files into ~/atlas/projects/{{ active.slug }}/assets/</span>
          </button>
          <div v-if="panels.assets" class="proj-panel__body">
            <table class="proj-assets" v-if="active.assets.length > 0">
              <thead>
                <tr><th>Name</th><th>Type</th><th>Updated</th><th>Size</th></tr>
              </thead>
              <tbody>
                <tr v-for="a in active.assets" :key="a.path">
                  <td>{{ a.name }}</td>
                  <td><span class="proj-tag">{{ a.type }}</span></td>
                  <td class="proj-assets__date">{{ a.updated }}</td>
                  <td class="proj-assets__date">{{ formatSize(a.size) }}</td>
                </tr>
              </tbody>
            </table>
            <p v-else class="is-muted">No assets yet.</p>
          </div>
        </article>

        <article id="panel-done" class="proj-card proj-panel">
          <button class="proj-panel__head" @click="panels.done = !panels.done">
            <span class="proj-panel__caret">{{ panels.done ? '▼' : '▶' }}</span>
            <h2 class="proj-section__title proj-panel__title">Done bundle</h2>
            <span class="proj-chip" :class="active.overall_progress === 100 ? 'is-good' : 'is-warn'">
              {{ active.overall_progress === 100 ? 'Ready' : 'Locked' }}
            </span>
            <span class="proj-panel__spacer"></span>
            <span class="proj-panel__hint">Unlocks when phases hit 100%</span>
          </button>
          <div v-if="panels.done" class="proj-panel__body">
            <p v-if="active.overall_progress < 100" class="proj-section__lead proj-section__lead--muted">
              Bundle locked. {{ 100 - active.overall_progress }}% remaining to complete all phases.
            </p>
            <div v-else class="proj-done">
              <p>All phases complete. Deliverable bundle ready.</p>
              <button class="proj-btn proj-btn--primary">Export {{ active.name }} bundle (.zip)</button>
            </div>
          </div>
        </article>
      </section>
    </main>

    <!-- Section editor modal -->
    <div v-if="editor.open" class="proj-modal" @click.self="editor.open = false">
      <div class="proj-modal__panel">
        <div class="proj-modal__head">
          <h3>Edit · {{ editor.section }}</h3>
          <button class="proj-btn" @click="editor.open = false">Close</button>
        </div>
        <textarea
          v-model="editor.body"
          class="proj-textarea"
          rows="18"
          spellcheck="false"
        ></textarea>
        <div class="proj-modal__actions">
          <span class="proj-section__lead--muted">
            Writes ## {{ editor.section }} in ~/atlas/projects/{{ activeSlug }}/WHITEPAPER.md
          </span>
          <button class="proj-btn proj-btn--primary" @click="onSaveSection">Save</button>
        </div>
      </div>
    </div>
  </PageShell>
</template>

<script setup lang="ts">
import { ref, computed, reactive, watch, onMounted } from 'vue';
import PageShell from '../components/ui/PageShell.vue';
import GoalTree from '../components/GoalTree.vue';
import { PAGES } from './_pages';
import { API_BASE_URL } from '../config';
import {
  useProjectView,
  saveSection,
  appendDecision,
  appendFeature,
  toggleTask,
  addPhase,
  addTask,
  setGranularity,
  sendToKanban,
  scaffoldProject,
} from '../composables/useProjectView';

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'nav', key: string): void;
}>();

function onNav(key: string) {
  if (key === 'dashboard') { emit('close'); return; }
  if (key === 'project') return;
  emit('nav', key);
}

const { projectList, refreshAll, refreshOne } = useProjectView();

const activeSlug = ref<string>('');
const active = computed(() => activeSlug.value ? projectList.value.find(p => p.slug === activeSlug.value) || null : null);

// Pick the first project on load (or whatever's listed in URL).
function pickInitial() {
  const params = new URLSearchParams(window.location.search);
  const wanted = params.get('slug');
  if (wanted && projectList.value.some(p => p.slug === wanted)) {
    activeSlug.value = wanted;
    return;
  }
  if (projectList.value.length > 0) {
    activeSlug.value = projectList.value[0]!.slug;
  }
}

watch(projectList, (list) => {
  if (!activeSlug.value && list.length > 0) pickInitial();
}, { immediate: true });

onMounted(() => {
  setTimeout(pickInitial, 200);
});

// Phase tree expansion state — per slug + phase id.
const expanded = reactive<Record<string, boolean>>({});
function togglePhase(id: string) { expanded[id] = !expanded[id]; }

watch(active, (pv) => {
  if (!pv) return;
  for (const p of pv.phases) {
    if (expanded[p.id] === undefined) expanded[p.id] = p.status === 'active';
  }
});

const panels = reactive({ goals: true, cascade: true, assets: false, done: false });
const selectedGoalId = ref<string | null>(null);
function onGoalSelected(id: string) { selectedGoalId.value = id; }

// Paperclip-3: pull orphan count from the Today summary so the cascade panel
// can show "N unassigned" — a red dot if any Kanban card lacks a goal_id.
const orphanCount = ref<number>(0);
async function refreshOrphanCount() {
  try {
    const r = await fetch(`${API_BASE_URL}/api/atlas/today`);
    if (!r.ok) return;
    const data = await r.json();
    orphanCount.value = data?.summary?.orphan_count ?? 0;
  } catch {
    /* non-fatal */
  }
}
onMounted(refreshOrphanCount);

// Section editor modal
const editor = reactive({ open: false, section: '', body: '' });
function openSectionEditor(section: string) {
  if (!active.value) return;
  const slug = active.value.slug;
  // Pull the raw section body from disk so the operator edits the canonical form.
  fetch(`${API_BASE_URL}/api/atlas/projectview/${encodeURIComponent(slug)}`)
    .then(r => r.json())
    .then((pv: any) => {
      // The composable doesn't surface raw section markdown — fall back to a
      // best-effort reconstruction from parsed fields. The operator can rewrite
      // it freely; the server replaces the entire section on save.
      editor.section = section;
      editor.body = reconstructSection(section, pv);
      editor.open = true;
    })
    .catch(() => {
      editor.section = section;
      editor.body = '';
      editor.open = true;
    });
}

function openEditor(section: string, current: string) {
  editor.section = section;
  editor.body = current || '';
  editor.open = true;
}

function reconstructSection(section: string, pv: any): string {
  switch (section) {
    case 'North Star': return pv.north_star || '';
    case 'Discovery': return [
      `- **Problem:** ${pv.discovery.problem}`,
      `- **Target:** ${pv.discovery.target}`,
      `- **Wedge:** ${pv.discovery.wedge}`,
      `- **Competitors:** ${pv.discovery.competitors.join(', ')}`,
      `- **Demand:** ${pv.discovery.demand}`,
    ].join('\n');
    case 'Requirements': return [
      `### Stories`,
      ...pv.requirements.stories.map((s: string) => `- ${s}`),
      ``,
      `### Non-goals`,
      ...pv.requirements.non_goals.map((s: string) => `- ${s}`),
    ].join('\n');
    case 'Architecture': return [
      `- **Stack:** ${pv.architecture.stack}`,
      `- **Data model:** ${pv.architecture.data_model}`,
      `- **Auth:** ${pv.architecture.auth}`,
      `- **Integrations:** ${pv.architecture.integrations.join(', ')}`,
    ].join('\n');
    case 'Roadmap': return pv.roadmap.map((m: any) =>
      `- **${m.id}** — ${m.title}${m.target ? ` — target ${m.target}` : ''}${m.done ? ' — done' : ''}`
    ).join('\n');
    case 'Risks': return pv.risks.map((r: any) =>
      `- ${r.title}${r.resolved ? ' (resolved)' : ''} — Mitigation: ${r.mitigation}.`
    ).join('\n');
    case 'Open Questions': return pv.open_questions.map((q: string) => `- ${q}`).join('\n');
    default: return '';
  }
}

async function onSaveSection() {
  if (!active.value) return;
  try {
    await saveSection(active.value.slug, editor.section, editor.body);
    editor.open = false;
  } catch (err: any) {
    alert(`Save failed: ${err?.message || err}`);
  }
}

// Decision add
const decisionOpen = ref(false);
const decisionTitle = ref('');
const decisionWhy = ref('');
async function onAddDecision() {
  if (!active.value) return;
  if (!decisionTitle.value.trim() || !decisionWhy.value.trim()) return;
  try {
    await appendDecision(active.value.slug, { title: decisionTitle.value, why: decisionWhy.value });
    decisionTitle.value = '';
    decisionWhy.value = '';
    decisionOpen.value = false;
  } catch (err: any) {
    alert(`Save failed: ${err?.message || err}`);
  }
}

// Feature add
const featureOpen = ref(false);
const featureText = ref('');
async function onAddFeature() {
  if (!active.value || !featureText.value.trim()) return;
  try {
    await appendFeature(active.value.slug, featureText.value);
    featureText.value = '';
    featureOpen.value = false;
  } catch (err: any) {
    alert(`Save failed: ${err?.message || err}`);
  }
}

// Tasks + phases
async function onToggleTask(phase_id: string, task_id: string, done: boolean) {
  if (!active.value) return;
  await toggleTask(active.value.slug, phase_id, task_id, done);
}

async function onAddTask(phase_id: string, event: Event) {
  const input = event.target as HTMLInputElement;
  const title = input.value.trim();
  if (!title || !active.value) return;
  await addTask(active.value.slug, phase_id, title);
  input.value = '';
}

async function onAddPhase(event: Event) {
  const input = event.target as HTMLInputElement;
  const title = input.value.trim();
  if (!title || !active.value) return;
  await addPhase(active.value.slug, title);
  input.value = '';
}

async function onGranularityChange(value: string) {
  if (!active.value) return;
  if (value !== 'coarse' && value !== 'fine') return;
  await setGranularity(active.value.slug, value);
}

// Send to Kanban — requires a workspace project_id. Resolve by name = slug.
async function onSendToKanban(phase_id: string, task_id: string) {
  if (!active.value) return;
  const slug = active.value.slug;
  try {
    const projects = await fetch(`${API_BASE_URL}/api/atlas/workspace/projects`).then(r => r.json());
    const list: any[] = projects.projects || projects || [];
    const match = list.find((p: any) =>
      (p.name || '').toLowerCase() === slug.toLowerCase() ||
      (p.path || '').endsWith(`/${slug}`) ||
      (p.path || '').endsWith(`/${slug}/`)
    );
    const projectId = match?.id;
    if (!projectId) {
      alert(`No Kanban project matches "${slug}". Create one under /workspace first.`);
      return;
    }
    await sendToKanban(slug, phase_id, task_id, projectId);
  } catch (err: any) {
    alert(`Send failed: ${err?.message || err}`);
  }
}

// Scaffold
const scaffoldOneLiner = ref('');
async function onScaffold() {
  if (!active.value) return;
  try {
    await scaffoldProject(active.value.slug, { one_liner: scaffoldOneLiner.value });
    scaffoldOneLiner.value = '';
  } catch (err: any) {
    alert(`Scaffold failed: ${err?.message || err}`);
  }
}

function formatSize(bytes: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

// Suppress unused warnings on watch helpers.
void refreshAll;
void refreshOne;
</script>

<style scoped>
.proj-page {
  min-height: 100vh;
  background: var(--atlas-page-bg);
  color: var(--atlas-text-primary);
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
  font-size: 13.5px;
  line-height: 1.5;
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
}

.proj-head {
  display: flex; align-items: baseline; gap: 18px;
  padding: 40px 48px 16px;
  background: var(--atlas-page-bg);
  position: sticky; top: 0; z-index: 10;
}
@media (max-width: 1023px) { .proj-head { padding: 28px 24px 14px; gap: 12px; } }
@media (max-width: 600px) {
  .proj-head { padding: max(20px, env(safe-area-inset-top)) 16px 12px; flex-wrap: wrap; gap: 10px; }
  .proj-head__brand { font-size: 28px; }
  .proj-head__pages-link { font-size: 14px; }
}
.proj-head__brand {
  background: none; border: none; padding: 0;
  font-family: inherit;
  font-weight: 700; font-size: 36px; letter-spacing: -0.02em;
  color: var(--atlas-text-strong); cursor: pointer;
  line-height: 1;
}
.proj-head__pages { display: flex; gap: 14px; align-items: baseline; }
.proj-head__pages-link {
  background: none; border: none; padding: 0;
  font-family: inherit;
  font-size: 15px; color: var(--atlas-text-secondary);
  cursor: pointer;
  transition: color 120ms ease;
}
.proj-head__pages-link:hover { color: var(--atlas-text-primary); }
.proj-head__pages-link.is-active { color: var(--atlas-text-strong); font-weight: 600; }
.proj-head__spacer { flex: 1; }
.proj-head__projsel { display: flex; gap: 8px; flex-wrap: wrap; }
.proj-head__projsel-chip {
  background: var(--atlas-card-bg);
  border: 1px solid transparent;
  font-family: inherit; font-size: 13px;
  color: var(--atlas-text-primary);
  padding: 6px 12px; border-radius: 8px; cursor: pointer;
  transition: background-color 100ms ease, border-color 100ms ease;
}
.proj-head__projsel-chip:hover { background: var(--atlas-card-bg-2); }
.proj-head__projsel-chip.is-active {
  border-color: var(--atlas-blue);
  color: var(--atlas-text-strong);
  font-weight: 600;
}

.proj-titlebar {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 0 48px 20px;
  border-bottom: 1px solid var(--atlas-hairline);
}
@media (max-width: 1023px) { .proj-titlebar { padding: 0 24px 16px; } }
.proj-titlebar__name {
  font-size: 22px; font-weight: 700; letter-spacing: -0.01em;
  margin: 0; color: var(--atlas-text-strong);
}
.proj-titlebar__spacer { flex: 1; }

.proj-chip {
  font-size: 12.5px;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--atlas-card-bg);
  border: 1px solid var(--atlas-hairline);
  color: var(--atlas-text-secondary);
  white-space: nowrap;
}
.proj-chip.is-info { background: var(--atlas-blue-soft); border-color: transparent; color: var(--atlas-blue); }
.proj-chip.is-good { background: color-mix(in srgb, var(--atlas-green) 16%, transparent); border-color: transparent; color: var(--atlas-green); }
.proj-chip.is-warn { background: color-mix(in srgb, var(--atlas-yellow) 16%, transparent); border-color: transparent; color: var(--atlas-yellow); }
.proj-chip.is-bad  { background: color-mix(in srgb, var(--atlas-red) 16%, transparent); border-color: transparent; color: var(--atlas-red); }

.proj-btn {
  background: var(--atlas-card-bg);
  border: 1px solid var(--atlas-hairline);
  font-family: inherit; font-size: 12.5px; font-weight: 500;
  color: var(--atlas-text-primary);
  padding: 8px 12px; border-radius: 8px; cursor: pointer;
  transition: background-color 100ms ease;
}
.proj-btn:hover:not(:disabled) { background: var(--atlas-card-bg-2); color: var(--atlas-text-strong); }
.proj-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.proj-btn--primary {
  background: var(--atlas-blue); color: #fff; border-color: transparent; font-weight: 600;
}
.proj-btn--primary:hover:not(:disabled) { background: var(--atlas-blue-hover); color: #fff; }
.proj-btn--ghost { background: transparent; }
select.proj-btn { appearance: none; padding-right: 28px;
  background-image: linear-gradient(45deg, transparent 50%, var(--atlas-text-secondary) 50%),
                    linear-gradient(135deg, var(--atlas-text-secondary) 50%, transparent 50%);
  background-position: calc(100% - 14px) 50%, calc(100% - 9px) 50%;
  background-size: 5px 5px, 5px 5px;
  background-repeat: no-repeat;
}

.proj-body {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 20px;
  padding: 24px 48px 48px;
  align-items: start;
}
@media (max-width: 1023px) { .proj-body { grid-template-columns: 1fr; padding: 18px 24px 40px; gap: 14px; } }

.proj-left {
  position: sticky; top: 110px;
  display: flex; flex-direction: column; gap: 14px;
  max-height: calc(100vh - 130px);
  overflow-y: auto;
}
.proj-right { display: flex; flex-direction: column; gap: 14px; min-width: 0; }

.proj-card {
  background: var(--atlas-card-bg);
  border: 1px solid var(--atlas-hairline);
  border-radius: 10px;
  padding: 18px 20px;
}
.proj-card__title {
  margin: 0 0 12px 0;
  font-size: 11px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.06em;
  color: var(--atlas-text-muted);
}
.proj-stat-list { list-style: none; padding: 0; margin: 0; }
.proj-stat-list li {
  display: flex; justify-content: space-between; align-items: center;
  padding: 7px 0;
  border-bottom: 1px solid var(--atlas-hairline);
  font-size: 13px;
}
.proj-stat-list li:last-child { border-bottom: none; }
.proj-stat-list span { color: var(--atlas-text-secondary); }
.proj-stat-list strong { color: var(--atlas-text-strong); font-weight: 600; }

.proj-tree { list-style: none; padding: 0; margin: 0; }
.proj-tree__phase { margin-bottom: 2px; }
.proj-tree__phase-row {
  display: flex; align-items: center; gap: 8px; width: 100%;
  background: none; border: none; font-family: inherit;
  font-size: 13.5px; color: var(--atlas-text-primary);
  padding: 7px 8px; border-radius: 6px; cursor: pointer;
  text-align: left;
}
.proj-tree__phase-row:hover { background: var(--atlas-card-bg-2); }
.proj-tree__phase-row.is-active { background: var(--atlas-blue-soft); color: var(--atlas-text-strong); font-weight: 600; }
.proj-tree__phase-row.is-done { color: var(--atlas-text-secondary); }
.proj-tree__caret { font-size: 9px; color: var(--atlas-text-muted); width: 12px; }
.proj-tree__phase-name { flex: 1; }
.proj-tree__phase-count {
  font-size: 11px;
  background: var(--atlas-card-bg-2);
  border: 1px solid var(--atlas-hairline);
  padding: 1px 7px; border-radius: 999px;
  color: var(--atlas-text-secondary);
}
.proj-tree__check { color: var(--atlas-green); font-weight: 700; }
.proj-tree__tasks { list-style: none; padding: 2px 0 4px 24px; margin: 0; }
.proj-tree__task-row {
  display: flex; align-items: center; gap: 8px;
  padding: 5px 6px; border-radius: 6px;
  font-size: 13px; cursor: pointer;
}
.proj-tree__task-row:hover { background: var(--atlas-card-bg-2); }
.proj-tree__task-row.is-done { color: var(--atlas-text-muted); text-decoration: line-through; }
.proj-tree__task-row input[type="checkbox"] { margin: 0; accent-color: var(--atlas-blue); }
.proj-tree__task-name { flex: 1; }
.proj-tree__send {
  background: transparent; border: 1px solid var(--atlas-blue);
  color: var(--atlas-blue);
  font-family: inherit; font-size: 11px;
  padding: 2px 8px; border-radius: 6px; cursor: pointer;
}
.proj-tree__send:hover { background: var(--atlas-blue-soft); }
.proj-tree__pill {
  font-size: 11px; padding: 2px 8px; border-radius: 999px;
  border: 1px solid transparent;
}
.proj-tree__pill.is-warn { background: color-mix(in srgb, var(--atlas-yellow) 16%, transparent); color: var(--atlas-yellow); }

.proj-add-phase { padding: 10px 8px 4px; }

.proj-section__title {
  margin: 0 0 12px 0;
  font-size: 17px; font-weight: 600; letter-spacing: -0.01em;
  color: var(--atlas-text-strong);
  display: flex; align-items: center; gap: 10px;
}
.proj-section__sub {
  margin: 16px 0 8px 0;
  font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em;
  color: var(--atlas-text-muted);
}
.proj-section__lead { margin: 0; color: var(--atlas-text-primary); font-size: 14px; }
.proj-section__lead--muted { color: var(--atlas-text-secondary); font-size: 13px; }

.proj-edit {
  background: transparent;
  border: 1px solid var(--atlas-hairline);
  font-family: inherit; font-size: 11px;
  color: var(--atlas-text-secondary);
  padding: 2px 8px; border-radius: 6px;
  cursor: pointer;
  margin-left: auto;
}
.proj-edit:hover { background: var(--atlas-card-bg-2); color: var(--atlas-text-strong); }

.proj-kv { display: grid; grid-template-columns: 130px 1fr; gap: 8px 16px; margin: 0; }
.proj-kv dt { color: var(--atlas-text-secondary); font-size: 12.5px; padding-top: 1px; }
.proj-kv dd { margin: 0; color: var(--atlas-text-primary); font-size: 13.5px; }

.proj-list { list-style: none; padding: 0; margin: 0; }
.proj-list li {
  padding: 8px 0;
  border-bottom: 1px solid var(--atlas-hairline);
  font-size: 13.5px;
}
.proj-list li:last-child { border-bottom: none; }
.proj-list--muted li { color: var(--atlas-text-secondary); }
.proj-list li.is-resolved { color: var(--atlas-text-muted); }
.proj-list li.is-resolved strong { text-decoration: line-through; }
.proj-list li.is-muted, .is-muted { color: var(--atlas-text-muted); font-style: italic; font-size: 12.5px; }

.proj-tag {
  display: inline-block;
  font-size: 11.5px;
  padding: 2px 8px;
  margin: 0 4px 4px 0;
  border-radius: 999px;
  background: var(--atlas-card-bg-2);
  border: 1px solid var(--atlas-hairline);
  color: var(--atlas-text-secondary);
}
.proj-pill {
  font-size: 11px; padding: 2px 8px; border-radius: 999px; margin-left: 8px;
  border: 1px solid transparent;
}
.proj-pill.is-good { background: color-mix(in srgb, var(--atlas-green) 16%, transparent); color: var(--atlas-green); }

.proj-orphan-dot {
  display: inline-block;
  width: 7px; height: 7px;
  border-radius: 50%;
  background: var(--atlas-red);
  margin-right: 6px;
  vertical-align: middle;
}

.proj-roadmap { list-style: none; padding: 0; margin: 0; }
.proj-roadmap li {
  display: flex; align-items: center; gap: 12px;
  padding: 9px 0;
  border-bottom: 1px solid var(--atlas-hairline);
  font-size: 13.5px;
}
.proj-roadmap li:last-child { border-bottom: none; }
.proj-roadmap li.is-done .proj-roadmap__name { color: var(--atlas-text-muted); text-decoration: line-through; }
.proj-roadmap__dot { width: 10px; height: 10px; border-radius: 50%; background: var(--atlas-hairline); flex-shrink: 0; }
.proj-roadmap__dot.is-done { background: var(--atlas-green); }
.proj-roadmap__name { flex: 1; }
.proj-roadmap__date { color: var(--atlas-text-muted); font-size: 12px; font-family: ui-monospace, "SF Mono", Menlo, monospace; }

.proj-decisions { list-style: none; padding: 0; margin: 0; }
.proj-decisions li {
  display: flex; gap: 14px;
  padding: 9px 0;
  border-bottom: 1px solid var(--atlas-hairline);
  font-size: 13.5px;
}
.proj-decisions li:last-child { border-bottom: none; }
.proj-decisions__date { flex-shrink: 0; color: var(--atlas-text-muted); font-size: 12px; font-family: ui-monospace, "SF Mono", Menlo, monospace; width: 90px; }
.proj-decisions__body { color: var(--atlas-text-primary); }
.proj-decisions__body strong { color: var(--atlas-text-strong); }

.proj-panel { padding: 0; overflow: hidden; }
.proj-panel__head {
  display: flex; align-items: center; gap: 10px;
  width: 100%;
  background: none; border: none;
  padding: 14px 20px;
  font-family: inherit; text-align: left;
  cursor: pointer;
  color: var(--atlas-text-primary);
}
.proj-panel__head:hover { background: var(--atlas-card-bg-2); }
.proj-panel__caret { font-size: 10px; color: var(--atlas-text-muted); width: 12px; }
.proj-panel__title { margin: 0; font-size: 15px; }
.proj-panel__spacer { flex: 1; }
.proj-panel__hint { font-size: 12px; color: var(--atlas-text-muted); }
.proj-panel__body { padding: 6px 20px 20px; border-top: 1px solid var(--atlas-hairline); }

.proj-goal { padding: 14px 0; border-bottom: 1px solid var(--atlas-hairline); }
.proj-goal:last-child { border-bottom: none; }
.proj-goal__head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.proj-goal__head strong { color: var(--atlas-text-strong); }
.proj-goal__metric { margin: 6px 0 8px 0; font-size: 12.5px; color: var(--atlas-text-secondary); }
.proj-bar { height: 6px; background: var(--atlas-card-bg-2); border: 1px solid var(--atlas-hairline); border-radius: 999px; overflow: hidden; margin-bottom: 10px; }
.proj-bar span { display: block; height: 100%; background: var(--atlas-blue); transition: width 200ms ease; }
.proj-goal__milestones { list-style: none; padding: 0; margin: 0; }
.proj-goal__milestones li { display: flex; align-items: center; gap: 6px; font-size: 12.5px; padding: 3px 0; color: var(--atlas-text-secondary); }
.proj-goal__milestones li.is-done { color: var(--atlas-text-primary); text-decoration: line-through; }
.proj-goal__milestones input[type="checkbox"] { accent-color: var(--atlas-blue); }

.proj-assets { width: 100%; border-collapse: collapse; font-size: 13px; }
.proj-assets th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--atlas-text-muted); font-weight: 600; padding: 8px 4px; border-bottom: 1px solid var(--atlas-hairline); }
.proj-assets td { padding: 9px 4px; border-bottom: 1px solid var(--atlas-hairline); color: var(--atlas-text-primary); }
.proj-assets tr:last-child td { border-bottom: none; }
.proj-assets__date { color: var(--atlas-text-muted); font-size: 12px; font-family: ui-monospace, "SF Mono", Menlo, monospace; }

.proj-done { display: flex; flex-direction: column; gap: 12px; padding: 8px 0; }

.proj-empty, .proj-scaffold {
  padding: 24px 48px;
  display: flex; flex-direction: column; gap: 12px;
  max-width: 720px;
}
.proj-scaffold__actions { display: flex; gap: 10px; }

.proj-input {
  font-family: inherit; font-size: 13.5px;
  background: var(--atlas-card-bg);
  border: 1px solid var(--atlas-hairline);
  color: var(--atlas-text-primary);
  padding: 8px 10px; border-radius: 8px;
  width: 100%;
}
.proj-input--inline {
  font-size: 12.5px; padding: 4px 8px;
  background: transparent;
}
.proj-input:focus { outline: none; border-color: var(--atlas-blue); }

.proj-add-row {
  display: flex; gap: 8px; flex-wrap: wrap;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px dashed var(--atlas-hairline);
}
.proj-add-row .proj-input { flex: 1; min-width: 180px; }

.proj-modal {
  position: fixed; inset: 0;
  background: color-mix(in srgb, var(--atlas-page-bg) 80%, black);
  display: flex; align-items: center; justify-content: center;
  z-index: 100;
  padding: 24px;
}
.proj-modal__panel {
  background: var(--atlas-card-bg);
  border: 1px solid var(--atlas-hairline);
  border-radius: 12px;
  max-width: 720px; width: 100%;
  display: flex; flex-direction: column; gap: 12px;
  padding: 18px 20px;
}
.proj-modal__head { display: flex; align-items: center; justify-content: space-between; }
.proj-modal__head h3 { margin: 0; font-size: 16px; color: var(--atlas-text-strong); }
.proj-modal__actions { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.proj-textarea {
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: 12.5px;
  background: var(--atlas-page-bg);
  border: 1px solid var(--atlas-hairline);
  color: var(--atlas-text-primary);
  border-radius: 8px;
  padding: 12px;
  width: 100%; resize: vertical;
  min-height: 240px;
}
</style>
