<template>
  <div>
    <!-- Metrics Grid -->
    <div class="metric-grid">
      <div class="metric">
        <div class="ml">Total Tasks</div>
        <div class="mv">{{ taskBoard?.total || 0 }}</div>
        <div class="ms">{{ currentTopicId ? 'Filtered by active topic' : 'All topics' }}</div>
      </div>
      <div class="metric">
        <div class="ml">
          Done (<span style="color:var(--green)">{{ progressPct }}%</span>)
        </div>
        <div class="mv">{{ taskBoard?.done?.length || 0 }}</div>
      </div>
      <div class="metric">
        <div class="ml">In Progress</div>
        <div class="mv">{{ taskBoard?.in_progress?.length || 0 }}</div>
      </div>
      <div class="metric">
        <div class="ml">To Do</div>
        <div class="mv">{{ taskBoard?.todo?.length || 0 }}</div>
      </div>
    </div>

    <!-- Kanban Board -->
    <div class="task-board">
      <div class="task-col">
        <div class="task-col-hdr">
          To Do <span class="cnt">{{ taskBoard?.todo?.length || 0 }}</span>
        </div>
        <div v-for="t in taskBoard?.todo || []" :key="t.id" class="tcard">
          <div class="tid">{{ t.id }}</div>
          <div class="ttitle">{{ t.title }}</div>
          <div class="tmeta">
            <span class="towner" style="background:var(--purple-bg);color:var(--purple-t)">{{ t.owner }}</span>
            <span v-if="t.depends_on && t.depends_on.length" class="tdep">waits on {{ t.depends_on.join(', ') }}</span>
          </div>
        </div>
      </div>

      <div class="task-col">
        <div class="task-col-hdr">
          In Progress <span class="cnt">{{ taskBoard?.in_progress?.length || 0 }}</span>
        </div>
        <div v-for="t in taskBoard?.in_progress || []" :key="t.id" class="tcard">
          <div class="tid">{{ t.id }}</div>
          <div class="ttitle">{{ t.title }}</div>
          <div class="tmeta">
            <span class="towner" style="background:var(--accent-bg);color:var(--accent2)">{{ t.owner }}</span>
            <span class="tdep" style="background:none;color:var(--accent)">Active</span>
          </div>
        </div>
      </div>

      <div class="task-col" style="opacity:0.8">
        <div class="task-col-hdr">
          Done <span class="cnt">{{ taskBoard?.done?.length || 0 }}</span>
        </div>
        <div v-for="t in taskBoard?.done || []" :key="t.id" class="tcard" style="box-shadow:none">
          <div class="tid">{{ t.id }}</div>
          <div class="ttitle" style="text-decoration:line-through;color:var(--text2)">{{ t.title }}</div>
          <div class="tmeta">
            <span class="towner" style="background:var(--green-bg);color:var(--green-t)">{{ t.owner }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useOpcStore } from '../composables/useOpcStore';

const store = useOpcStore();
const { taskBoard, currentTopicId } = store;

const progressPct = computed(() => {
  const t = taskBoard.value?.total || 0;
  const d = taskBoard.value?.done?.length || 0;
  if (!t) return 0;
  return Math.round((d / t) * 100);
});
</script>

<style scoped>
.metric-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}

.metric {
  background: var(--surface2);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 16px 20px;
  box-shadow: var(--shadow);
  transition: transform 0.2s, box-shadow 0.2s;
}

.metric:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
  border-color: rgba(255, 255, 255, 0.2);
}

.metric .ml {
  font-size: 11px;
  color: var(--text3);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 600;
}

.metric .mv {
  font-size: 28px;
  font-weight: 600;
  margin-top: 6px;
  font-family: var(--mono);
  color: #fff;
  text-shadow: 0 0 10px rgba(255,255,255,0.1);
}

.metric .ms {
  font-size: 11px;
  color: var(--text3);
  margin-top: 4px;
}

.task-board {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  height: calc(100vh - 220px);
  min-height: 400px;
}

.task-col {
  background: rgba(15, 15, 20, 0.4);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-radius: var(--radius-lg);
  padding: 16px;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  border: 1px solid var(--border);
  box-shadow: inset 0 2px 10px rgba(0,0,0,0.2);
}

.task-col-hdr {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 0 4px 14px;
  display: flex;
  align-items: center;
  gap: 8px;
  position: sticky;
  top: 0;
  background: transparent;
  color: #fff;
  z-index: 2;
  text-shadow: 0 2px 4px rgba(0,0,0,0.5);
}

.task-col-hdr .cnt {
  font-family: var(--mono);
  font-size: 11px;
  background: rgba(255,255,255,0.1);
  padding: 2px 8px;
  border-radius: 8px;
  color: var(--text2);
}

.tcard {
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 12px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(0,0,0,0.2);
  position: relative;
  overflow: hidden;
}

.tcard::before {
  content: '';
  position: absolute;
  top: 0; left: 0; width: 3px; height: 100%;
  background: var(--border2);
  opacity: 0.5;
}

.task-col:nth-child(2) .tcard::before {
  background: var(--accent);
  box-shadow: 0 0 8px var(--accent);
  opacity: 1;
}

.task-col:nth-child(3) .tcard::before {
  background: var(--green);
  opacity: 0.5;
}

.tcard:hover {
  transform: translateY(-2px) scale(1.01);
  box-shadow: var(--shadow-lg);
  border-color: rgba(255, 255, 255, 0.2);
  background: rgba(39, 39, 42, 0.8);
}

.tcard .tid {
  font-size: 10px;
  font-family: var(--mono);
  color: var(--text3);
  margin-bottom: 6px;
  letter-spacing: 0.05em;
}

.tcard .ttitle {
  font-size: 13px;
  font-weight: 500;
  color: #f4f4f5;
  margin-bottom: 12px;
  line-height: 1.5;
}

.tcard .tmeta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.tcard .towner {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 6px;
  font-weight: 500;
  letter-spacing: 0.02em;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.tcard .tdep {
  font-size: 10px;
  color: var(--text3);
  font-family: var(--mono);
}
</style>
