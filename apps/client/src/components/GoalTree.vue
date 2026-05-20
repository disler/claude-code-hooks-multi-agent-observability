<template>
  <div class="goal-tree">
    <div v-if="loading" class="goal-tree__state">Loading goals…</div>
    <div v-else-if="error" class="goal-tree__state is-error">{{ error }}</div>
    <template v-else>
      <div class="goal-tree__mission" v-if="mission">
        <span class="goal-tree__mission-label">Mission</span>
        <strong class="goal-tree__mission-name">{{ mission.name }}</strong>
      </div>
      <p v-if="flat.length === 0" class="goal-tree__state is-muted">
        No goals attached to this project. POST /api/atlas/goals to add one.
      </p>
      <ul v-else class="goal-tree__list">
        <li
          v-for="row in flat"
          :key="row.node.id"
          class="goal-tree__item"
        >
          <button
            class="goal-tree__row"
            :class="{ 'is-active': props.goalId === row.node.id }"
            :style="{ paddingLeft: 8 + row.depth * 14 + 'px' }"
            @click="emit('select', row.node.id)"
          >
            <span class="goal-tree__name">{{ row.node.name }}</span>
            <span :class="['goal-tree__pill', 'is-' + row.node.status]">{{ row.node.status }}</span>
            <span class="goal-tree__count" title="Attached Kanban cards (TODO)">—</span>
          </button>
        </li>
      </ul>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { API_BASE_URL } from '../config';

type GoalStatus = 'active' | 'done' | 'abandoned';

interface Mission {
  id: string;
  name: string;
  statement: string;
}

interface GoalNode {
  id: string;
  name: string;
  mission_id: string;
  project_id: string | null;
  parent_goal_id: string | null;
  created_at: string;
  status: GoalStatus;
  children: GoalNode[];
}

const props = defineProps<{
  projectId?: string;
  goalId?: string;
}>();

const emit = defineEmits<{
  (e: 'select', goalId: string): void;
}>();

const mission = ref<Mission | null>(null);
const tree = ref<GoalNode[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

// DFS-flatten the tree into render rows so the template stays non-recursive.
const flat = computed<Array<{ node: GoalNode; depth: number }>>(() => {
  const out: Array<{ node: GoalNode; depth: number }> = [];
  const walk = (nodes: GoalNode[], depth: number) => {
    for (const n of nodes) {
      out.push({ node: n, depth });
      if (n.children && n.children.length > 0) walk(n.children, depth + 1);
    }
  };
  walk(tree.value, 0);
  return out;
});

async function fetchTree() {
  loading.value = true;
  error.value = null;
  try {
    const params = new URLSearchParams();
    if (props.projectId) params.set('project', props.projectId);
    const url = `${API_BASE_URL}/api/atlas/goals/tree${params.toString() ? '?' + params.toString() : ''}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json() as { mission: Mission; tree: GoalNode[] };
    mission.value = data.mission || null;
    tree.value = Array.isArray(data.tree) ? data.tree : [];
  } catch (err: any) {
    error.value = err?.message || String(err);
  } finally {
    loading.value = false;
  }
}

onMounted(fetchTree);
watch(() => props.projectId, fetchTree);

defineExpose({ refresh: fetchTree });
</script>

<style scoped>
.goal-tree {
  font-family: inherit;
  font-size: 13px;
  color: var(--atlas-text-primary);
}
.goal-tree__state {
  padding: 12px 4px;
  color: var(--atlas-text-secondary);
  font-size: 12.5px;
}
.goal-tree__state.is-error { color: var(--atlas-red); }
.goal-tree__state.is-muted { color: var(--atlas-text-muted); font-style: italic; }
.goal-tree__mission {
  display: flex; align-items: baseline; gap: 8px;
  padding: 6px 4px 10px;
  border-bottom: 1px solid var(--atlas-hairline);
  margin-bottom: 6px;
}
.goal-tree__mission-label {
  font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em;
  color: var(--atlas-text-muted); font-weight: 600;
}
.goal-tree__mission-name {
  color: var(--atlas-text-strong);
  font-size: 13.5px;
}
.goal-tree__list {
  list-style: none; padding: 0; margin: 0;
}
.goal-tree__item { margin: 1px 0; }
.goal-tree__row {
  display: flex; align-items: center; gap: 8px;
  width: 100%;
  background: none; border: none;
  font-family: inherit; font-size: 13px;
  color: var(--atlas-text-primary);
  padding: 6px 8px; border-radius: 6px;
  cursor: pointer;
  text-align: left;
}
.goal-tree__row:hover { background: var(--atlas-card-bg-2); }
.goal-tree__row.is-active {
  background: var(--atlas-blue-soft);
  color: var(--atlas-text-strong);
  font-weight: 600;
}
.goal-tree__name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.goal-tree__count {
  font-size: 11px;
  background: var(--atlas-card-bg-2);
  border: 1px solid var(--atlas-hairline);
  padding: 1px 7px; border-radius: 999px;
  color: var(--atlas-text-secondary);
}
.goal-tree__pill {
  font-size: 10.5px;
  padding: 1px 7px; border-radius: 999px;
  text-transform: uppercase; letter-spacing: 0.04em;
  border: 1px solid transparent;
}
.goal-tree__pill.is-active {
  background: color-mix(in srgb, var(--atlas-green) 16%, transparent);
  color: var(--atlas-green);
}
.goal-tree__pill.is-done {
  background: var(--atlas-card-bg-2);
  color: var(--atlas-text-muted);
}
.goal-tree__pill.is-abandoned {
  background: color-mix(in srgb, var(--atlas-red) 14%, transparent);
  color: var(--atlas-red);
}
</style>
