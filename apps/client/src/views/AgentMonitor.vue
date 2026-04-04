<template>
  <div class="agent-monitor">
    <div class="header">
      <h3>🤖 Live Agent Terminals</h3>
      <p style="font-size:12px;color:var(--text3);margin-top:4px">Real-time execution streams from active agents</p>
    </div>

    <!-- Agent Cards -->
    <div class="agents-grid">
      <div v-for="agent in agents" :key="agent.role" class="agent-card"
           :class="{ 'active': activeTerminal === agent.role, 'has-stream': hasActiveStream(agent.role) }"
           @click="toggleTerminal(agent.role)">
        <div class="agent-card-header">
          <span class="agent-icon">{{ agent.icon }}</span>
          <span class="agent-role" :style="{ color: agent.color }">{{ agent.role.toUpperCase() }}</span>
          <span class="agent-status" :class="hasActiveStream(agent.role) ? 'status-on' : 'status-off'">
            {{ hasActiveStream(agent.role) ? '●' : '○' }}
          </span>
        </div>
        <div class="agent-card-body">
          <div class="agent-title">{{ agent.title }}</div>
          <div class="agent-bu">{{ agent.bu }}</div>
        </div>
        <div class="agent-card-footer">
          <span class="port-label">:{{ agent.port }}</span>
          <span v-if="getStreamForRole(agent.role)" class="tool-pill">
            {{ getLastTool(agent.role) }}
          </span>
        </div>
      </div>
    </div>

    <!-- Live Log Panel -->
    <div class="terminal-container" v-if="activeTerminal && activeStream">
      <div class="terminal-header">
        <span>{{ activeTerminal.toUpperCase() }} — Live Execution</span>
        <span class="terminal-meta">{{ activeStream.tools.length }} tool calls</span>
      </div>
      <div class="terminal-live" ref="termRef">
        <!-- Tools -->
        <div v-for="(tool, i) in activeStream.tools" :key="'t-'+i" class="log-line tool">
          <span class="log-kind">TOOL</span>
          <span class="log-text">{{ tool }}</span>
        </div>
        <!-- Thinking (collapsed) -->
        <details v-if="activeStream.thinking" class="log-thinking">
          <summary>💭 Thinking process ({{ activeStream.thinking.length }} chars)</summary>
          <pre class="log-pre">{{ activeStream.thinking }}</pre>
        </details>
        <!-- Streaming text output -->
        <div v-if="activeStream.text" class="log-line text">
          <span class="log-kind">OUT</span>
          <pre class="log-pre streaming-pre">{{ activeStream.text }}</pre>
        </div>
        <!-- Started at -->
        <div class="log-line meta">
          <span class="log-kind">INFO</span>
          <span class="log-text">started {{ activeStream.startedAt }}</span>
        </div>
      </div>
    </div>

    <div v-else-if="activeTerminal" class="empty-state">
      <div class="emoji">⏳</div>
      <div class="text">No active execution stream for {{ activeTerminal }}. Send a task to this agent to see live output.</div>
    </div>
    
    <div v-else class="empty-state">
      <div class="emoji">💻</div>
      <div class="text">Select an agent above to view its live terminal</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { useOpcApi } from '../composables/useOpcApi';
import { useOpcStore, type StreamingEntry } from '../composables/useOpcStore';

const api = useOpcApi();
const { streamingMessages } = useOpcStore();
const agents = ref<any[]>([]);
const activeTerminal = ref<string | null>(null);
const termRef = ref<HTMLElement | null>(null);

const generateColors = (idx: number) => {
  const c = ['#4f6ef7', '#14b8a6', '#f59e0b', '#8b5cf6', '#f97316', '#22c55e'];
  return c[idx % c.length];
};

const loadAgents = async () => {
  const data = await api.get('/api/opc/org');
  if (data) {
    agents.value = data.filter((a: any) => a.port).map((a: any, i: number) => ({
      ...a,
      icon: a.type === 'c-suite' ? '👑' : (a.type === 'group-leader' ? '👔' : '🛠️'),
      color: a.bgColor || generateColors(i)
    }));
  }
};

/** Check if a role has an active streaming entry */
const hasActiveStream = (role: string): boolean => {
  return Object.values(streamingMessages).some(s => s.role === role);
};

/** Get the streaming entry for a role */
const getStreamForRole = (role: string): StreamingEntry | undefined => {
  return Object.values(streamingMessages).find(s => s.role === role);
};

/** Get the last tool used by a role */
const getLastTool = (role: string): string => {
  const stream = getStreamForRole(role);
  if (!stream || !stream.tools.length) return '';
  return stream.tools[stream.tools.length - 1];
};

/** Current active stream for the selected terminal */
const activeStream = computed(() => {
  if (!activeTerminal.value) return null;
  return getStreamForRole(activeTerminal.value) || null;
});

const toggleTerminal = (role: string) => {
  if (activeTerminal.value === role) {
    activeTerminal.value = null;
  } else {
    activeTerminal.value = role;
  }
};

// Auto-scroll terminal when new content arrives
watch(() => activeStream.value?.text, () => {
  nextTick(() => {
    if (termRef.value) {
      termRef.value.scrollTop = termRef.value.scrollHeight;
    }
  });
});

onMounted(() => {
  loadAgents();
});
</script>

<style scoped>
.agent-monitor {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.agents-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}

.agent-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
}

.agent-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow);
}

.agent-card.active {
  background: var(--surface2);
  border-color: var(--text2);
  box-shadow: 0 0 0 1px var(--text2);
}

.agent-card.has-stream {
  border-color: var(--green, #22c55e);
  box-shadow: 0 0 8px rgba(34, 197, 94, 0.15);
}

.agent-card-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.agent-icon {
  font-size: 14px;
}

.agent-role {
  font-family: var(--mono);
  font-size: 10px;
  font-weight: 700;
  flex: 1;
}

.agent-status {
  font-size: 10px;
}
.status-on { color: var(--green, #22c55e); animation: pulse-dot 1.5s ease-in-out infinite; }
.status-off { color: var(--text3); }

@keyframes pulse-dot {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}

.agent-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.agent-bu {
  font-size: 10px;
  color: var(--text3);
  margin-bottom: 12px;
}

.agent-card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top: 1px solid var(--border);
  padding-top: 8px;
}

.port-label {
  font-family: var(--mono);
  font-size: 10px;
  color: var(--text3);
  background: var(--surface3);
  padding: 2px 6px;
  border-radius: 4px;
}

.tool-pill {
  font-family: var(--mono);
  font-size: 9px;
  color: var(--accent, #4f6ef7);
  background: rgba(79, 110, 247, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Terminal panel ── */

.terminal-container {
  background: #0f1117;
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-lg);
  border: 1px solid rgba(255,255,255,0.1);
}

.terminal-header {
  padding: 8px 16px;
  background: rgba(0,0,0,0.3);
  color: #fff;
  font-family: var(--mono);
  font-size: 11px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid rgba(255,255,255,0.05);
}

.terminal-meta {
  font-size: 10px;
  color: rgba(255,255,255,0.4);
}

.terminal-live {
  padding: 16px;
  font-family: var(--mono);
  font-size: 12px;
  min-height: 300px;
  max-height: 500px;
  overflow-y: auto;
  color: #e2e8f0;
}

.log-line {
  display: flex;
  gap: 8px;
  margin-bottom: 4px;
  align-items: flex-start;
}

.log-kind {
  font-size: 10px;
  font-weight: 700;
  padding: 1px 4px;
  border-radius: 3px;
  min-width: 36px;
  text-align: center;
  flex-shrink: 0;
}

.log-line.tool .log-kind { background: rgba(79, 110, 247, 0.2); color: #4f6ef7; }
.log-line.text .log-kind { background: rgba(34, 197, 94, 0.2); color: #22c55e; }
.log-line.meta .log-kind { background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.3); }

.log-text {
  color: #e2e8f0;
  word-break: break-all;
}

.log-pre {
  margin: 0;
  font-family: var(--mono);
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-word;
  color: #e2e8f0;
  max-height: 400px;
  overflow-y: auto;
}

.streaming-pre {
  border-right: 2px solid #4f6ef7;
  animation: blink-caret 0.75s step-end infinite;
}

@keyframes blink-caret {
  50% { border-right-color: transparent; }
}

.log-thinking {
  margin: 8px 0;
  padding: 6px;
  border: 1px solid rgba(255,255,255,0.05);
  border-radius: 4px;
  color: rgba(255,255,255,0.4);
}

.log-thinking summary {
  cursor: pointer;
  font-size: 11px;
  user-select: none;
}

.log-thinking pre {
  color: rgba(255,255,255,0.3);
  max-height: 200px;
  overflow-y: auto;
}

/* ── Empty state ── */

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  color: var(--text3);
  border: 1px dashed var(--border);
  border-radius: var(--radius-lg);
}

.empty-state .emoji {
  font-size: 32px;
  margin-bottom: 8px;
  opacity: 0.5;
}

.empty-state .text {
  font-size: 12px;
  text-align: center;
}
</style>
