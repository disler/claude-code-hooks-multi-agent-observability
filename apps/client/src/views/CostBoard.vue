<template>
  <div>
    <!-- Metrics Grid -->
    <div class="metric-grid">
      <div class="metric">
        <div class="ml">Sessions</div>
        <div class="mv">{{ costSummary?.session_count || 0 }}</div>
        <div class="ms">tracked</div>
      </div>
      <div class="metric">
        <div class="ml">Input Tokens</div>
        <div class="mv">{{ formatNum(costSummary?.total_input || 0) }}</div>
        <div class="ms">total</div>
      </div>
      <div class="metric">
        <div class="ml">Output Tokens</div>
        <div class="mv">{{ formatNum(costSummary?.total_output || 0) }}</div>
        <div class="ms">total</div>
      </div>
      <div class="metric">
        <div class="ml">Est. Cost</div>
        <div class="mv">¥{{ (costSummary?.total_cost || 0).toFixed(2) }}</div>
        <div class="ms">cumulative</div>
      </div>
    </div>

    <!-- Details Level -->
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
      <!-- Budget Allocation -->
      <div class="cost-card">
        <h3>📊 Token Budget Allocation</h3>
        <template v-if="budget && budget.allocations?.length">
          <div v-for="(a, i) in budget.allocations" :key="i" style="margin-bottom:10px">
            <div class="cost-row">
              <span>{{ a.bu }}</span>
              <span style="font-family:var(--mono);color:var(--text3)">{{ a.percent }} — {{ a.note }}</span>
            </div>
            <div class="progress-bar" style="height:7px">
              <div class="progress-fill" :style="{ width: parseInt(a.percent) + '%', background: colors[i % colors.length] }"></div>
            </div>
          </div>
          <div v-if="budget.alerts?.length" style="margin-top:12px;font-size:10px;color:var(--text3);border-top:1px solid var(--border);padding-top:8px">
            <div v-for="(a, j) in budget.alerts" :key="j" style="margin-bottom:3px">
              {{ a.level === 'red' ? '🔴' : (a.level === 'yellow' ? '🟡' : 'ℹ️') }} {{ a.condition }}
            </div>
          </div>
        </template>
        <template v-else>
          <div class="empty-state">
            <div class="emoji">📋</div>
            <div class="text">Budget data pending CFO update</div>
          </div>
        </template>
      </div>

      <!-- Real-Time Spending -->
      <div class="cost-card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <h3 style="margin:0">💸 Real-Time Spending (7 Days)</h3>
          <span style="font-size:10px;color:var(--text3);font-family:var(--mono)">¥{{ spendingTotal.toFixed(2) }}</span>
        </div>
        <template v-if="spending && spending.length">
          <div v-for="(s, i) in spending" :key="i" style="margin-bottom:10px">
            <div class="cost-row">
              <span>{{ s.date }}</span>
              <span style="font-family:var(--mono);">¥{{ s.cost }}</span>
            </div>
            <div class="progress-bar" style="height:4px;background:var(--surface2)">
              <div class="progress-fill" :style="{ width: getSpendingPct(s.cost) + '%', background: 'var(--red)' }"></div>
            </div>
          </div>
        </template>
        <template v-else>
          <div class="empty-state">
            <div class="emoji">📉</div>
            <div class="text">No spending records in last 7 days.</div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useOpcApi } from '../composables/useOpcApi';

const api = useOpcApi();

const budget = ref<any>(null);
const spending = ref<any[]>([]);
const costSummary = ref<any>(null);

const colors = ['var(--purple)', 'var(--coral)', 'var(--teal)', 'var(--accent)', '#888'];

const spendingTotal = computed(() => {
  return spending.value.reduce((acc, curr) => acc + (curr.cost || 0), 0);
});

const getSpendingPct = (cost: number) => {
  const max = Math.max(...spending.value.map(s => s.cost || 0));
  if (!max) return 0;
  return Math.round((cost / max) * 100);
};

const formatNum = (num: number) => {
  return num > 1000 ? (num / 1000).toFixed(1) + 'k' : String(num);
};

const loadCost = async () => {
  const [b, s, c] = await Promise.all([
    api.get('/api/opc/finance/budget'),
    api.get('/api/opc/finance/spending'),
    api.get('/api/opc/cost/summary')
  ]);
  if (b) budget.value = b;
  if (s) spending.value = s;
  if (c) costSummary.value = c;
};

onMounted(() => {
  loadCost();
});
</script>

<style scoped>
.metric-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  margin-bottom: 12px;
}

.metric {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px 14px;
}

.metric .ml {
  font-size: 10px;
  color: var(--text3);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 600;
}

.metric .mv {
  font-size: 22px;
  font-weight: 600;
  margin-top: 3px;
  font-family: var(--mono);
}

.metric .ms {
  font-size: 10px;
  color: var(--text3);
  margin-top: 1px;
}

.cost-row {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  margin-bottom: 4px;
}

.cost-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow);
  padding: 16px;
  margin-bottom: 12px;
}

.cost-card h3 {
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 12px;
}

.progress-bar {
  height: 5px;
  background: var(--surface3);
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 3px;
  background: var(--accent);
  transition: width 0.4s;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  color: var(--text3);
}

.empty-state .emoji {
  font-size: 32px;
  margin-bottom: 8px;
}

.empty-state .text {
  font-size: 12px;
  text-align: center;
}
</style>
