<template>
  <div>
    <div v-if="loading" class="loading">Loading decisions...</div>
    <div v-else-if="!topics.length" class="empty-state">
      <div class="emoji">📭</div>
      <div class="text">No decisions or topics found.</div>
    </div>
    
    <div v-else v-for="topic in topics" :key="topic.id" class="topic-card">
      <div class="topic-hdr">
        <div class="topic-icon" :style="{ background: topic.status === 'awaiting_decision' ? 'var(--amber-bg)' : (topic.status === 'completed' ? 'var(--green-bg)' : 'var(--surface2)'), color: topic.status === 'awaiting_decision' ? 'var(--amber)' : (topic.status === 'completed' ? 'var(--green)' : 'var(--text)') }">
          <svg v-if="topic.status === 'awaiting_decision'" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <svg v-else-if="topic.status === 'completed'" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          <svg v-else viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
        </div>
        <div class="topic-title">
          <h4>{{ topic.title }}</h4>
          <div class="topic-sub">Topic ID: {{ topic.id }} · Status: <span style="font-weight:600" :style="{ color: topic.status === 'awaiting_decision' ? 'var(--amber)' : 'inherit' }">{{ topic.status }}</span></div>
        </div>
      </div>
      
      <!-- Approval Meta -->
      <div v-if="topic.approval" class="topic-detail" style="font-size:11px;color:var(--text2)">
        审批人: {{ topic.approval.approved_by }} · 状态: {{ topic.approval.status }}
        <span v-if="topic.approval.approved_at"> · {{ new Date(topic.approval.approved_at).toLocaleString('zh-CN') }}</span>
      </div>

      <!-- Action Items preview -->
      <div v-if="topic.action_items?.length" class="topic-detail">
        <div style="font-size:11px;font-weight:600;margin-bottom:6px">行动项 ({{ topic.action_items.length }})</div>
        <div class="timeline">
          <div v-for="(ai, idx) in topic.action_items" :key="idx" 
               class="tl-item" :class="{ 'done': idx < 2 }">
            <div class="tl-time">{{ ai.id }}</div>
            <div class="tl-text">{{ ai.action }} — <strong>{{ ai.owner }}</strong><span v-if="ai.deadline"> ({{ ai.deadline }})</span></div>
          </div>
        </div>
      </div>

      <div v-if="topic.status === 'awaiting_decision'" class="topic-actions">
        <button class="approve" @click="submitDecision(topic.id, 'approved', $event)">Approve & Proceed</button>
        <button class="reject" @click="submitDecision(topic.id, 'rejected', $event)">Reject & Revert</button>
        <button class="ghost" @click="goToChat(topic.id)">Discuss in Chat</button>
      </div>
      <div v-else class="topic-actions">
        <button class="ghost" @click="goToChat(topic.id)">View Discussion</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useOpcApi } from '../composables/useOpcApi';
import { useOpcStore } from '../composables/useOpcStore';

const api = useOpcApi();
const store = useOpcStore();
const router = useRouter();

const topics = ref<any[]>([]);
const loading = ref(true);

const loadDecisions = async () => {
  loading.value = true;
  const data = await api.get('/api/opc/decisions');
  if (data) {
    topics.value = data;
  }
  loading.value = false;
};

const goToChat = (topicId: string) => {
  store.currentTopicId.value = topicId;
  // Let the user select the topic in the chat globally
  router.push('/chat');
};

const submitDecision = async (id: string, decision: string, e: Event) => {
  const btn = e.target as HTMLButtonElement;
  btn.textContent = 'Submitting...';
  btn.disabled = true;
  
  await api.post(`/api/opc/topics/${id}/decisions`, { decision });
  await loadDecisions();
};

onMounted(() => {
  loadDecisions();
});
</script>

<style scoped>
.loading {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px;
  color: var(--text3);
  font-size: 12px;
}

@keyframes spin {
  from { transform: rotate(0); }
  to { transform: rotate(360deg); }
}

.loading::before {
  content: '⟳';
  animation: spin 1s linear infinite;
  font-size: 14px;
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

.topic-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow);
  margin-bottom: 16px;
  overflow: hidden;
}

.topic-hdr {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
}

.topic-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.topic-title h4 {
  font-size: 15px;
  font-weight: 600;
  margin: 0;
}

.topic-title .topic-sub {
  font-size: 12px;
  color: var(--text3);
  margin-top: 4px;
  font-family: var(--mono);
}

.topic-detail {
  border-top: 1px solid var(--border);
  padding: 16px;
  background: var(--surface2);
}

.timeline {
  position: relative;
  padding-left: 22px;
}

.timeline::before {
  content: '';
  position: absolute;
  left: 6px;
  top: 5px;
  bottom: 5px;
  width: 1.5px;
  background: var(--border);
}

.tl-item {
  position: relative;
  padding: 6px 0;
  font-size: 13px;
}

.tl-item::before {
  content: '';
  position: absolute;
  left: -19.5px;
  top: 10px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 2px solid var(--border2);
  background: var(--surface);
}

.tl-item.done::before {
  background: var(--green);
  border-color: var(--green);
}

.tl-item.active::before {
  background: var(--accent);
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-bg);
}

.tl-item .tl-time {
  font-size: 10px;
  font-family: var(--mono);
  color: var(--text3);
  margin-bottom: 2px;
}

.tl-item .tl-text {
  color: var(--text2);
}

.tl-item.done .tl-text {
  color: var(--text);
}

.topic-actions {
  display: flex;
  gap: 8px;
  padding: 12px 16px 16px;
  background: var(--surface);
  border-top: 1px solid var(--border);
}

.topic-actions button {
  padding: 8px 14px;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.topic-actions .approve {
  background: var(--green);
  color: #fff;
}

.topic-actions .approve:hover {
  background: var(--green-t);
}

.topic-actions .reject {
  background: var(--red);
  color: #fff;
}

.topic-actions .reject:hover {
  background: var(--red-t);
}

.topic-actions .ghost {
  background: var(--surface2);
  color: var(--text2);
  border: 1px solid var(--border);
}

.topic-actions .ghost:hover {
  background: var(--border);
  color: var(--text);
}
</style>
