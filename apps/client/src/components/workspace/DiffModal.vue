<template>
  <div class="diff-bg" @click.self="$emit('close')">
    <div class="diff">
      <header class="diff__head">
        <div>
          <span class="diff__eyebrow">{{ task.project_name }} · {{ task.branch || '(no branch)' }}<span v-if="info?.currentBranch"> → {{ info.currentBranch }}</span><span v-if="info?.remote?.isGitHub"> · {{ info.remote.owner }}/{{ info.remote.repo }}</span></span>
          <h3 class="diff__title">{{ task.title }}</h3>
          <p v-if="prUrl" class="diff__prurl">PR: <a :href="prUrl" target="_blank">{{ prUrl }}</a></p>
        </div>
        <div class="diff__actions">
          <button class="diff__btn diff__btn--danger" @click="onDiscard" :disabled="busy" title="Drop the branch + worktree">🗑 Discard</button>
          <button class="diff__btn" @click="onMerge" :disabled="busy || !hasDiff" title="Fast-forward merge into the project's current branch (local only)">↪ Merge</button>
          <button class="diff__btn diff__btn--primary" @click="onMergePush" :disabled="busy || !hasDiff" title="FF merge + git push origin">↪ Merge + Push</button>
          <button v-if="info?.remote?.isGitHub" class="diff__btn diff__btn--primary" @click="onOpenPR" :disabled="busy || !hasDiff" title="Push branch + gh pr create">⏶ Open PR</button>
          <button class="diff__x" @click="$emit('close')">✕</button>
        </div>
      </header>
      <p v-if="error" class="diff__err">{{ error }}</p>
      <pre class="diff__body" v-html="renderedDiff"></pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import type { WSTask } from '../../composables/useWorkspace';

const props = defineProps<{
  task: WSTask;
  fetchDiff: (id: string) => Promise<{ ok: boolean; diff: string; error?: string }>;
  merge: (id: string) => Promise<void>;
  mergePush: (id: string) => Promise<{ pushed_branch?: string }>;
  openPr: (id: string) => Promise<{ pr_url?: string }>;
  discard: (id: string) => Promise<void>;
  projectInfo: (id: string) => Promise<any>;
}>();
const emit = defineEmits<{ (e: 'close'): void; (e: 'merged' | 'discarded', t: WSTask): void }>();

const diff = ref('');
const error = ref<string | null>(null);
const busy = ref(false);
const info = ref<any>(null);
const prUrl = ref<string | null>(null);

const hasDiff = computed(() => diff.value.trim().length > 0);

onMounted(async () => {
  busy.value = true;
  try {
    const [d, i] = await Promise.all([
      props.fetchDiff(props.task.id),
      props.projectInfo(props.task.project_id).catch(() => null),
    ]);
    if (d.ok) diff.value = d.diff;
    else error.value = d.error || 'diff failed';
    info.value = i;
  } catch (e: any) { error.value = e.message; }
  finally { busy.value = false; }
});

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;' }[c]!));
}

const renderedDiff = computed(() => {
  if (!diff.value) return '<span class="muted">No changes.</span>';
  return diff.value.split('\n').map(line => {
    const esc = escapeHtml(line);
    if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++'))
      return `<span class="hdr">${esc}</span>`;
    if (line.startsWith('@@')) return `<span class="hunk">${esc}</span>`;
    if (line.startsWith('+')) return `<span class="add">${esc}</span>`;
    if (line.startsWith('-')) return `<span class="del">${esc}</span>`;
    return esc;
  }).join('\n');
});

async function onMerge() {
  if (!confirm(`Fast-forward merge ${props.task.branch} into ${props.task.project_name}? (This will move the project's HEAD.)`)) return;
  busy.value = true;
  try {
    await props.merge(props.task.id);
    emit('merged', props.task);
    emit('close');
  } catch (e: any) { error.value = e.message; }
  finally { busy.value = false; }
}

async function onMergePush() {
  const target = info.value?.currentBranch || 'the current branch';
  if (!confirm(`FF merge ${props.task.branch} into ${target} and push to origin? This affects the remote.`)) return;
  busy.value = true;
  error.value = null;
  try {
    const r = await props.mergePush(props.task.id);
    emit('merged', props.task);
    alert(`Merged + pushed to origin/${r.pushed_branch}`);
    emit('close');
  } catch (e: any) { error.value = e.message; }
  finally { busy.value = false; }
}

async function onOpenPR() {
  if (!confirm(`Push ${props.task.branch} to origin and open a GitHub PR?`)) return;
  busy.value = true;
  error.value = null;
  try {
    const r = await props.openPr(props.task.id);
    prUrl.value = r.pr_url || null;
    if (r.pr_url) window.open(r.pr_url, '_blank');
  } catch (e: any) { error.value = e.message; }
  finally { busy.value = false; }
}

async function onDiscard() {
  if (!confirm(`Discard ${props.task.branch}? The worktree + branch will be deleted.`)) return;
  busy.value = true;
  try {
    await props.discard(props.task.id);
    emit('discarded', props.task);
    emit('close');
  } catch (e: any) { error.value = e.message; }
  finally { busy.value = false; }
}
</script>

<style scoped>
.diff-bg {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.55);
  display: grid; place-items: center;
  z-index: 240; padding: 28px;
}
.diff {
  background: var(--atlas-page-bg);
  border-radius: 14px;
  width: 100%; max-width: 1100px; max-height: 88vh;
  display: flex; flex-direction: column;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
  box-shadow: 0 30px 80px rgba(0,0,0,0.45);
  overflow: hidden;
}
.diff__head {
  display: flex; align-items: flex-start; justify-content: space-between;
  padding: 18px 22px 14px;
  border-bottom: 1px solid var(--atlas-hairline);
  gap: 12px;
}
.diff__eyebrow {
  font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--atlas-text-secondary);
  font-family: ui-monospace, Menlo, monospace;
}
.diff__title { margin: 4px 0 0; font-size: 18px; font-weight: 600; color: var(--atlas-text-strong); }
.diff__prurl { margin: 6px 0 0; font-size: 12px; color: var(--atlas-blue); font-family: ui-monospace, Menlo, monospace; }
.diff__prurl a { color: var(--atlas-blue); text-decoration: underline; }

.diff__actions { display: flex; gap: 6px; align-items: center; }
.diff__btn {
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: 7px;
  border: 1px solid var(--atlas-hairline);
  background: transparent;
  color: var(--atlas-text-primary);
  cursor: pointer;
}
.diff__btn:hover:not(:disabled) { background: var(--atlas-card-bg); }
.diff__btn:disabled { opacity: 0.4; cursor: not-allowed; }
.diff__btn--primary {
  background: var(--atlas-blue); border-color: var(--atlas-blue); color: white;
}
.diff__btn--primary:hover:not(:disabled) { opacity: 0.92; }
.diff__btn--danger {
  color: var(--atlas-red, #ff453a); border-color: var(--atlas-red, #ff453a);
}
.diff__x { background: transparent; border: none; font-size: 16px; color: var(--atlas-text-secondary); cursor: pointer; padding: 4px 8px; }

.diff__err { margin: 0; padding: 8px 22px; background: rgba(255,69,58,0.10); color: var(--atlas-red, #ff453a); font-size: 12.5px; }

.diff__body {
  flex: 1;
  margin: 0;
  padding: 16px 20px;
  overflow: auto;
  background: #0c0c0c;
  color: #ddd;
  font-family: ui-monospace, Menlo, monospace;
  font-size: 12px;
  line-height: 1.55;
  white-space: pre;
}
.diff__body :deep(.hdr)  { color: #888; }
.diff__body :deep(.hunk) { color: #5e9eff; background: rgba(94,158,255,0.06); display: inline-block; width: 100%; }
.diff__body :deep(.add)  { color: #5ce665; background: rgba(48,209,88,0.08); display: inline-block; width: 100%; }
.diff__body :deep(.del)  { color: #ff6961; background: rgba(255,69,58,0.08); display: inline-block; width: 100%; }
.diff__body :deep(.muted){ color: #888; font-style: italic; }
</style>
