<template>
  <div :class="['mission-control-app', theme]">
    <aside class="sidebar">
      <div class="sidebar-brand">
        <h1><span class="logo">MC</span>Mission Control</h1>
        <div class="sub">OPC Multi-Agent System</div>
      </div>
      <nav class="sidebar-nav">
        <div class="nav-section">Command</div>
        <router-link to="/chat" class="nav-item" active-class="active">
          <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
          Executive chat<span class="badge" id="badge-chat">{{ roleCount || '—' }}</span>
        </router-link>
        
        <div class="nav-section">Operations</div>
        <router-link to="/tasks" class="nav-item" active-class="active">
          <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
          Task board<span class="badge" id="badge-tasks">{{ taskBoard?.total ?? '—' }}</span>
        </router-link>
        
        <router-link to="/decisions" class="nav-item" active-class="active">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
          Decisions<span class="badge" id="badge-topics">—</span>
        </router-link>
        
        <div class="nav-section">Analytics</div>
        <router-link to="/cost" class="nav-item" active-class="active">
          <svg viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
          Cost &amp; budget
        </router-link>

        <div class="nav-section">Observability</div>
        <router-link to="/observability" class="nav-item" active-class="active">
          <svg viewBox="0 0 24 24"><path d="M2 12h4l3-9 5 18 3-9h5"/></svg>
          Agent Monitor
        </router-link>

        <div class="nav-section">Channels</div>
        <div id="sidebar-channels">
          <div class="nav-item" style="color:rgba(255,255,255,0.35);font-size:11px;cursor:default">No channels</div>
        </div>
      </nav>
      <div class="sidebar-status" id="sidebar-status">
        <template v-if="isConnected">
          <span class="status-pill" style="background:var(--green-bg);color:var(--green-t)"><span class="dot live-dot" style="background:var(--green)"></span>{{ cSuiteCount }} C-Suite</span>
          <span class="status-pill" style="background:var(--amber-bg);color:var(--amber-t)"><span class="dot" style="background:var(--amber)"></span>{{ managerCount }} Managers</span>
          <span class="status-pill" style="background:var(--accent-bg);color:var(--accent2)"><span class="dot" style="background:var(--accent)"></span>{{ roleCount }} Roles</span>
        </template>
        <template v-else>
          <span class="status-pill" style="background:var(--red-bg);color:var(--red-t)">
            <span class="dot" style="background:var(--red)"></span>Disconnected
          </span>
        </template>
      </div>
    </aside>

    <main class="main">
      <div class="topbar">
        <h2 id="view-title">{{ routeTitle }}</h2>
        <span class="crumb" id="view-crumb">{{ routeCrumb }}</span>
        <div style="margin-left:auto; display:flex; gap:8px;">
          <button class="refresh-btn" @click="toggleTheme">{{ theme === 'light' ? '🌙 Dark' : '☀️ Light' }}</button>
          <button class="refresh-btn" @click="refreshAll" style="margin-left:0;">⟳ Refresh</button>
        </div>
      </div>
      
      <!-- Directive Bar -->
      <div class="directive-bar" id="directive-bar">
        <div class="label">Current directive</div>
        <div class="row">
          <div class="title" id="dir-title">{{ directiveTitle }}</div>
          <div style="display:flex;align-items:center;gap:8px">
            <div class="progress-bar" style="width:120px">
              <div class="progress-fill" id="dir-progress" :style="{ width: directiveProgressPct + '%' }"></div>
            </div>
            <span class="progress-text" id="dir-progress-text">{{ directiveProgressText }}</span>
          </div>
        </div>
      </div>

      <div class="content-area">
        <router-view></router-view>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useWebSocket } from '../composables/useWebSocket';
import { useOpcStore } from '../composables/useOpcStore';

const route = useRoute();
const { isConnected, subscribe, unsubscribe } = useWebSocket();
const { cSuiteCount, managerCount, roleCount, loadOrg, loadTasks, taskBoard, newDirectiveMode, currentContact, currentContactTopics, currentTopicId } = useOpcStore();

onMounted(async () => {
  subscribe();
  await loadOrg();
  await loadTasks();
});

onUnmounted(() => {
  unsubscribe();
});

const viewMeta: Record<string, [string, string]> = {
  chat: ['Executive chat', 'command / c-suite'],
  tasks: ['Task board', 'operations / board.md'],
  decisions: ['Decisions', 'governance / c-suite'],
  cost: ['Cost & budget', 'analytics / finance'],
  observability: ['Agent Monitor', 'observability / system']
};

const routeTitle = computed(() => {
  const name = route.name as string;
  return viewMeta[name]?.[0] || 'Mission Control';
});

const routeCrumb = computed(() => {
  const name = route.name as string;
  return viewMeta[name]?.[1] || '';
});

// Directive bar logic
const directiveTitle = computed(() => {
  if (newDirectiveMode.value && currentContact.value) {
    return `Draft directive for ${currentContact.value.name}`;
  }
  const board = taskBoard.value;
  if (!board) return 'Loading...';

  const inProgress = board.in_progress.length;
  const topic = currentContactTopics.value.find((item: any) => item.id === currentTopicId.value);
  
  if (inProgress > 0) return board.in_progress[0].title;
  if (board.todo.length > 0) return board.todo[0].title;
  if (!board.total && topic) return topic.title;
  return 'No active tasks';
});

const directiveProgressPct = computed(() => {
  if (newDirectiveMode.value && currentContact.value) return 0;
  const board = taskBoard.value;
  if (!board || !board.total) return 0;
  return Math.round((board.done.length / board.total) * 100);
});

const directiveProgressText = computed(() => {
  if (newDirectiveMode.value && currentContact.value) return 'draft';
  const board = taskBoard.value;
  if (!board) return '—';
  const topic = currentContactTopics.value.find((item: any) => item.id === currentTopicId.value);
  
  if (topic) return `${board.done.length}/${board.total} · ${topic.id}`;
  if (board.total) return `${board.done.length}/${board.total}`;
  return '0/0';
});

const refreshAll = async () => {
  await loadOrg();
  await loadTasks(currentTopicId.value);
};

const theme = ref('light');
const toggleTheme = () => {
  theme.value = theme.value === 'light' ? 'dark' : 'light';
};
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');

.mission-control-app {
  /* Light Mode Default */
  --bg: #f8fafc;
  --bg2: #f1f5f9;
  --bg3: #e2e8f0;
  --bg4: #cbd5e1;
  --surface: #ffffff;
  --surface2: #f8fafc;
  --surface3: #f1f5f9;
  --text: #0f172a;
  --text2: #475569;
  --text3: #64748b;
  --accent: #2563eb;
  --accent2: #3b82f6;
  --accent-bg: rgba(37, 99, 235, 0.08);
  --green: #16a34a;
  --green-bg: rgba(22, 163, 74, 0.08);
  --green-t: #166534;
  --amber: #d97706;
  --amber-bg: rgba(217, 119, 6, 0.08);
  --amber-t: #92400e;
  --red: #dc2626;
  --red-bg: rgba(220, 38, 38, 0.08);
  --red-t: #991b1b;
  --purple: #7c3aed;
  --purple-bg: rgba(124, 58, 237, 0.08);
  --purple-t: #5b21b6;
  --teal: #0d9488;
  --teal-bg: rgba(13, 148, 136, 0.08);
  --teal-t: #115e59;
  --coral: #ea580c;
  --coral-bg: rgba(234, 88, 12, 0.08);
  --coral-t: #9a3412;
  --border: #e2e8f0;
  --border2: #cbd5e1;
  --radius: 10px;
  --radius-lg: 14px;
  --shadow: 0 1px 3px rgba(0, 0, 0, 0.04), 0 4px 12px rgba(0, 0, 0, 0.03);
  --shadow-lg: 0 4px 24px rgba(0, 0, 0, 0.06);
  --mono: 'JetBrains Mono', monospace;
  --sans: 'Inter', system-ui, sans-serif;

  font-family: var(--sans);
  background: var(--surface2);
  color: var(--text);
  min-height: 100vh;
  display: flex;
}

.mission-control-app.dark {
  /* Dark Glassmorphism */
  --bg: #09090b;
  --bg2: rgba(24, 24, 27, 0.45);
  --bg3: rgba(39, 39, 42, 0.65);
  --bg4: rgba(63, 63, 70, 0.5);
  --surface: rgba(24, 24, 27, 0.4);
  --surface2: rgba(9, 9, 11, 0.8);
  --surface3: rgba(39, 39, 42, 0.4);
  --text: #f4f4f5;
  --text2: #a1a1aa;
  --text3: #71717a;
  --accent: #3b82f6;
  --accent2: #60a5fa;
  --accent-bg: rgba(59, 130, 246, 0.15);
  --green: #10b981;
  --green-bg: rgba(16, 185, 129, 0.15);
  --green-t: #34d399;
  --amber: #f59e0b;
  --amber-bg: rgba(245, 158, 11, 0.15);
  --amber-t: #fbbf24;
  --red: #ef4444;
  --red-bg: rgba(239, 68, 68, 0.15);
  --red-t: #f87171;
  --purple: #8b5cf6;
  --purple-bg: rgba(139, 92, 246, 0.15);
  --purple-t: #a78bfa;
  --teal: #14b8a6;
  --teal-bg: rgba(20, 184, 166, 0.15);
  --teal-t: #5eead4;
  --coral: #f97316;
  --coral-bg: rgba(249, 115, 22, 0.15);
  --coral-t: #fb923c;
  --border: rgba(255, 255, 255, 0.08);
  --border2: rgba(255, 255, 255, 0.12);
  --radius: 12px;
  --radius-lg: 16px;
  --shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 8px 30px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.05);

  background: var(--bg);
  background-image: 
    radial-gradient(ellipse at top right, rgba(59, 130, 246, 0.08) 0%, transparent 50%),
    radial-gradient(ellipse at bottom left, rgba(139, 92, 246, 0.05) 0%, transparent 50%);
  background-attachment: fixed;
}

:global(@keyframes badge-flash) {
  0% { transform: scale(1); box-shadow: 0 0 0 rgba(59, 130, 246, 0); }
  30% { transform: scale(1.4); background: var(--accent); color: #fff; box-shadow: 0 0 15px rgba(59, 130, 246, 0.8); }
  100% { transform: scale(1); }
}

:global(body.board-flash) #badge-tasks {
  animation: badge-flash 0.8s ease-out;
}


/* Base styles that need to bleed can go to global css, but we scope what we can */
.mission-control-app * {
  box-sizing: border-box;
}

.sidebar {
  width: 240px;
  background: var(--bg2);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-right: 1px solid var(--border);
  color: var(--text);
  display: flex;
  flex-direction: column;
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  z-index: 10;
}

.sidebar-brand {
  padding: 20px 16px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.sidebar-brand h1 {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.02em;
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
}

.sidebar-brand h1 .logo {
  width: 28px;
  height: 28px;
  background: var(--accent);
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--mono);
  font-size: 11px;
  font-weight: 600;
  box-shadow: 0 0 10px rgba(59, 130, 246, 0.4);
}

.sidebar-brand .sub {
  font-size: 10px;
  color: var(--text3);
  margin-top: 4px;
  font-family: var(--mono);
}

.sidebar-nav {
  flex: 1;
  padding: 8px 6px;
  overflow-y: auto;
}

.nav-section {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text3);
  padding: 14px 10px 4px;
  font-weight: 600;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 7px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  color: var(--text2);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  margin-bottom: 2px;
  text-decoration: none;
}

.nav-item:hover {
  background: var(--surface);
  color: var(--text);
}

.nav-item.active {
  background: var(--accent-bg);
  border: 1px solid rgba(59, 130, 246, 0.3);
  color: var(--accent2);
}

.nav-item svg {
  width: 16px;
  height: 16px;
  stroke: currentColor;
  fill: none;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
  flex-shrink: 0;
  transition: transform 0.2s;
}

.nav-item:hover svg {
  transform: scale(1.1);
}

.nav-item .badge {
  margin-left: auto;
  font-size: 9px;
  font-family: var(--mono);
  padding: 2px 7px;
  border-radius: 10px;
  background: var(--surface);
  color: var(--text2);
  font-weight: 500;
  transition: all 0.3s ease;
  border: 1px solid var(--border);
}

.nav-item.active .badge {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
  box-shadow: 0 0 8px var(--accent-bg);
}

.sidebar-status {
  padding: 12px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.status-pill {
  font-size: 9px;
  font-family: var(--mono);
  padding: 2px 7px;
  border-radius: 5px;
  display: flex;
  align-items: center;
  gap: 4px;
  font-weight: 500;
  border: 1px solid var(--border);
}

.dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  display: inline-block;
  box-shadow: 0 0 5px currentColor;
}

@keyframes pulse {
  0%, 100% { opacity: 1; box-shadow: 0 0 8px currentColor; }
  50% { opacity: 0.4; box-shadow: 0 0 2px currentColor; }
}

.live-dot {
  animation: pulse 2s ease-in-out infinite;
}

.main {
  margin-left: 240px;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-width: 0;
}

.topbar {
  background: var(--bg2);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-bottom: 1px solid var(--border);
  padding: 16px 24px;
  display: flex;
  align-items: center;
  gap: 12px;
  position: sticky;
  top: 0;
  z-index: 5;
}

.topbar h2 {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.02em;
  margin: 0;
}

.topbar .crumb {
  font-size: 11px;
  color: var(--text3);
  font-family: var(--mono);
}

.topbar .refresh-btn {
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 11px;
  cursor: pointer;
  background: var(--surface);
  color: var(--text2);
  transition: all 0.2s;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}

.topbar .refresh-btn:hover {
  background: var(--surface2);
  color: var(--text);
  border-color: var(--border2);
}

.directive-bar {
  margin: 20px 24px 0;
  background: var(--surface2);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 14px 20px;
  box-shadow: var(--shadow);
  position: relative;
  overflow: hidden;
}

.directive-bar::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--accent2), transparent);
  opacity: 0.5;
}

.directive-bar .label {
  font-size: 10px;
  color: var(--text3);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 600;
  margin-bottom: 8px;
}

.directive-bar .row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.directive-bar .title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
  flex: 1;
}

.progress-bar {
  height: 6px;
  background: var(--bg4);
  border-radius: 4px;
  overflow: hidden;
  box-shadow: inset 0 1px 2px rgba(0,0,0,0.3);
}

.progress-fill {
  height: 100%;
  border-radius: 4px;
  background: linear-gradient(90deg, var(--accent), var(--accent2));
  box-shadow: 0 0 8px var(--accent);
  transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}

.progress-text {
  font-size: 11px;
  font-family: var(--mono);
  color: var(--text2);
  font-weight: 500;
}

.content-area {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
  min-height: 0;
}

</style>
