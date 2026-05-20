<template>
  <article class="card proposals" :class="{ 'proposals--empty': queued.length === 0 }">
    <div class="proposals__head">
      <span class="card-eyebrow">Proposals</span>
      <span v-if="queued.length" class="proposals__count">{{ queued.length }}</span>
      <span v-if="loading" class="proposals__loading" aria-hidden="true">·</span>
      <button
        v-if="proposals.length > queued.length"
        type="button"
        class="proposals__filter"
        :class="{ 'is-on': showAll }"
        @click="showAll = !showAll"
      >{{ showAll ? 'Queued only' : `All ${proposals.length}` }}</button>
    </div>

    <p v-if="actionMsg" class="proposals__flash" :class="{ 'proposals__flash--err': actionMsgIsError }">
      {{ actionMsg }}
    </p>

    <p v-if="visible.length === 0" class="proposals__empty">
      <template v-if="proposals.length === 0">No proposals in the queue.</template>
      <template v-else>Nothing pending — toggle "All {{ proposals.length }}" to see history.</template>
    </p>

    <ul v-else class="proposals__list">
      <li
        v-for="p in visible"
        :key="p.id"
        class="row"
        :class="{
          'row--open': openId === p.id,
          'row--human-only': p.human_only,
          [`row--${p.status}`]: true,
        }"
      >
        <header class="row__head" @click="toggle(p.id)">
          <span class="row__status" :title="p.status">{{ statusGlyph(p.status) }}</span>
          <span class="row__type">{{ p.type }}</span>
          <span class="row__division">{{ p.proposer_division }}</span>
          <span class="row__agent">@{{ p.proposer_agent }}</span>
          <span class="row__id">{{ shortId(p.id) }}</span>
        </header>
        <p v-if="openId === p.id" class="row__rationale">{{ p.rationale_preview }}</p>

        <div v-if="openId === p.id" class="row__details">
          <pre v-if="p.diff_preview" class="row__diff">{{ p.diff_preview }}</pre>

          <div v-if="editingId === p.id" class="row__edit">
            <textarea
              v-model="editBuffer"
              class="row__edit-area"
              spellcheck="false"
              rows="14"
            ></textarea>
            <div class="row__edit-actions">
              <button
                class="btn btn--primary"
                :disabled="busyId === p.id"
                @click="onSaveEdit(p)"
              >Save</button>
              <button class="btn btn--ghost" :disabled="busyId === p.id" @click="cancelEdit()">Cancel</button>
            </div>
          </div>

          <div v-else class="row__actions">
            <button
              v-if="p.status === 'queued' || p.status === 'pending' || p.status === 'deferred'"
              class="btn btn--primary"
              :disabled="busyId === p.id || p.human_only || !p.applyable_in_layer_5a"
              :title="actionTitle(p, 'approve')"
              @click="act(p, 'approve')"
            >Approve</button>
            <button
              v-if="p.status === 'queued' || p.status === 'pending' || p.status === 'deferred'"
              class="btn btn--ghost"
              :disabled="busyId === p.id"
              @click="act(p, 'reject')"
            >Reject</button>
            <button
              v-if="p.status === 'queued' || p.status === 'pending'"
              class="btn btn--ghost"
              :disabled="busyId === p.id"
              @click="act(p, 'defer')"
            >Defer</button>
            <button
              v-if="p.status === 'queued' || p.status === 'pending' || p.status === 'deferred'"
              class="btn btn--ghost"
              :disabled="busyId === p.id"
              @click="onEdit(p)"
            >Edit</button>
            <button
              v-if="p.status === 'applied'"
              class="btn btn--warn"
              :disabled="busyId === p.id"
              @click="act(p, 'rollback')"
            >Rollback</button>
          </div>

          <p v-if="p.human_only" class="row__note">
            <strong>Operator-only.</strong> {{ p.type }} cannot be approved from the dashboard.
            Apply manually in a Claude Code session in <code>~/atlas</code>.
          </p>
          <p v-else-if="!p.applyable_in_layer_5a" class="row__note">
            Apply not yet implemented for type <code>{{ p.type }}</code> (Layer 5d).
            Surface only — use <code>reject</code> or <code>defer</code> until the apply path lands.
          </p>
          <p v-if="p.velocity_state === 'queued_over_cap'" class="row__note">
            Velocity-capped: 5 applied/day per division reached. Approval succeeds but apply
            blocks until tomorrow.
          </p>
        </div>
      </li>
    </ul>
  </article>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  useAtlasProposals,
  actOnProposal,
  fetchProposalYaml,
  editProposalYaml,
} from '../../../composables/useAtlasViews';

const { proposals, loading, refresh } = useAtlasProposals();

const showAll = ref(false);
const openId = ref<string | null>(null);
const editingId = ref<string | null>(null);
const editBuffer = ref('');
const busyId = ref<string | null>(null);
const actionMsg = ref('');
const actionMsgIsError = ref(false);

const queued = computed(() =>
  (proposals.value || []).filter(p =>
    p.status === 'queued' || p.status === 'pending' || p.status === 'deferred'),
);
const visible = computed(() => showAll.value ? (proposals.value || []) : queued.value);

function shortId(id: string) {
  if (id.length <= 20) return id;
  return id.slice(0, 8) + '…' + id.slice(-8);
}
function statusGlyph(status: string) {
  return {
    queued: '○',
    pending: '○',
    deferred: '◐',
    applied: '●',
    rejected: '✗',
  }[status] || '?';
}
function actionTitle(p: any, _action: string) {
  if (p.human_only) return 'Operator-only — apply manually in ~/atlas';
  if (!p.applyable_in_layer_5a) return `Apply not yet implemented for ${p.type}`;
  return 'Apply this proposal';
}

function flash(msg: string, isError = false) {
  actionMsg.value = msg;
  actionMsgIsError.value = isError;
  setTimeout(() => { if (actionMsg.value === msg) actionMsg.value = ''; }, 4000);
}

function toggle(id: string) {
  openId.value = openId.value === id ? null : id;
  if (openId.value !== id) cancelEdit();
}

async function act(p: any, action: 'approve' | 'reject' | 'defer' | 'rollback') {
  if (busyId.value) return;
  busyId.value = p.id;
  try {
    const r = await actOnProposal(p.id, action);
    if (r.ok) {
      flash(`${action} ${shortId(p.id)} — ${r.message}`);
      refresh();
    } else {
      flash(`${action} failed: ${r.message}`, true);
    }
  } finally {
    busyId.value = null;
  }
}

async function onEdit(p: any) {
  busyId.value = p.id;
  try {
    const yamlText = await fetchProposalYaml(p.id);
    if (!yamlText) {
      flash('failed to load YAML body', true);
      return;
    }
    editBuffer.value = yamlText;
    editingId.value = p.id;
  } finally {
    busyId.value = null;
  }
}
function cancelEdit() {
  editingId.value = null;
  editBuffer.value = '';
}
async function onSaveEdit(p: any) {
  if (!editBuffer.value.trim()) {
    flash('YAML body cannot be empty', true);
    return;
  }
  busyId.value = p.id;
  try {
    const r = await editProposalYaml(p.id, editBuffer.value);
    if (r.ok) {
      flash(`edited ${shortId(p.id)}`);
      cancelEdit();
      refresh();
    } else {
      flash(`edit failed: ${r.message}`, true);
    }
  } finally {
    busyId.value = null;
  }
}
</script>

<style scoped>
.proposals { display: flex; flex-direction: column; gap: 8px; }
.proposals__head { display: flex; align-items: baseline; gap: 8px; }
.proposals__count {
  background: var(--atlas-bg-subtle); color: var(--atlas-text-primary);
  font-size: 11px; padding: 1px 7px; border-radius: 8px; font-weight: 500;
}
.proposals__loading { color: var(--atlas-text-muted); }
.proposals__filter {
  margin-left: auto; font-size: 11px; color: var(--atlas-text-muted);
  background: none; border: none; cursor: pointer; padding: 2px 6px;
}
.proposals__filter:hover { color: var(--atlas-text-primary); }
.proposals__filter.is-on { color: var(--atlas-accent); }
.proposals__flash {
  margin: 0; font-size: 12px; padding: 6px 8px; border-radius: 6px;
  background: var(--atlas-bg-subtle); color: var(--atlas-text-primary);
}
.proposals__flash--err {
  background: rgba(255, 90, 90, 0.12); color: #ff8a8a;
}
.proposals__empty { color: var(--atlas-text-muted); font-size: 13px; margin: 6px 0 0; }
.proposals__list {
  list-style: none; padding: 0; margin: 0;
  display: flex; flex-direction: column; gap: 4px;
  max-height: 320px; overflow-y: auto;
  /* Pad right so scrollbar doesn't sit on top of rows. */
  padding-right: 4px;
}

.row {
  border: 1px solid var(--atlas-border-subtle);
  border-radius: 8px;
  padding: 8px 10px;
  background: var(--atlas-bg-surface);
  transition: border-color 120ms ease;
}
.row:hover { border-color: var(--atlas-border); }
.row--open { border-color: var(--atlas-accent); background: var(--atlas-bg-subtle); }
.row--applied { opacity: 0.7; }
.row--rejected { opacity: 0.5; }
.row--human-only .row__status { color: #ffb84a; }

.row__head {
  display: flex; align-items: baseline; gap: 8px;
  cursor: pointer; font-size: 12px;
}
.row__status { color: var(--atlas-text-muted); width: 14px; text-align: center; }
.row__type { font-weight: 500; color: var(--atlas-text-primary); }
.row__division { color: var(--atlas-text-muted); }
.row__agent { color: var(--atlas-text-muted); }
.row__id { margin-left: auto; font-family: ui-monospace, monospace; font-size: 10.5px; color: var(--atlas-text-muted); }
.row__rationale {
  margin: 4px 0 0;
  font-size: 12.5px; line-height: 1.45;
  color: var(--atlas-text-primary);
}
.row__details { margin-top: 8px; display: flex; flex-direction: column; gap: 8px; }
.row__diff {
  margin: 0; padding: 8px;
  background: var(--atlas-bg-page); color: var(--atlas-text-primary);
  border-radius: 6px; overflow-x: auto;
  font-family: ui-monospace, monospace; font-size: 11px; line-height: 1.5;
  white-space: pre; max-height: 240px;
}
.row__edit { display: flex; flex-direction: column; gap: 6px; }
.row__edit-area {
  width: 100%; min-height: 220px; padding: 8px;
  background: var(--atlas-bg-page); color: var(--atlas-text-primary);
  border: 1px solid var(--atlas-border); border-radius: 6px;
  font-family: ui-monospace, monospace; font-size: 12px; line-height: 1.5;
  resize: vertical;
}
.row__edit-actions { display: flex; gap: 6px; }
.row__actions { display: flex; gap: 6px; flex-wrap: wrap; }
.btn {
  padding: 4px 10px; border-radius: 6px; cursor: pointer; font-size: 12px;
  border: 1px solid var(--atlas-border);
  background: var(--atlas-bg-surface); color: var(--atlas-text-primary);
}
.btn:hover:not(:disabled) { border-color: var(--atlas-accent); }
.btn:disabled { opacity: 0.4; cursor: not-allowed; }
.btn--primary {
  background: var(--atlas-accent); color: var(--atlas-accent-text);
  border-color: var(--atlas-accent);
}
.btn--ghost { background: transparent; }
.btn--warn { background: transparent; color: #ff8a8a; border-color: rgba(255, 138, 138, 0.4); }
.row__note {
  margin: 0; font-size: 11.5px; color: var(--atlas-text-muted);
  padding: 6px 8px; background: var(--atlas-bg-page); border-radius: 6px;
}
.row__note code { font-family: ui-monospace, monospace; font-size: 11px; }
</style>
