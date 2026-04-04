<template>
  <div class="chat-layout">
    <!-- Contacts Sidebar -->
    <div class="chat-contacts">
      <!-- C-Suite -->
      <div v-for="role in cSuiteRoles" :key="role.id" 
           class="contact" :class="{ active: currentContactId === role.id }"
           @click="selectContact(role)">
        <div class="avatar" :style="{ background: role.bgColor, color: role.textColor }">{{ role.name }}</div>
        <div>
          <div class="name">{{ role.name }}</div>
          <div class="role">{{ role.type }}</div>
        </div>
      </div>

      <!-- Managers -->
      <template v-if="managerRoles.length">
        <div class="contact-section">Managers</div>
        <div v-for="role in managerRoles" :key="role.id"
             class="contact" :class="{ active: currentContactId === role.id }"
             @click="selectContact(role)">
          <div class="avatar" :style="{ background: role.bgColor, color: role.textColor }">{{ getShortName(role) }}</div>
          <div>
            <div class="name">{{ role.name }}</div>
            <div class="role">{{ role.type === 'group-leader' ? `${role.group || ''} · ${role.bu || ''}` : (role.bu || '') }}</div>
          </div>
        </div>
      </template>

      <!-- Roles -->
      <template v-if="executionRoles.length">
        <div class="contact-section">Execution Roles</div>
        <div v-for="role in executionRoles" :key="role.id"
             class="contact" :class="{ active: currentContactId === role.id }"
             @click="selectContact(role)">
          <div class="avatar" :style="{ background: role.bgColor, color: role.textColor }">{{ (role.roleKey || role.name).slice(0, 3).toUpperCase() }}</div>
          <div>
            <div class="name">{{ role.name }}</div>
            <div class="role">{{ role.group || '' }} · {{ role.bu || '' }}</div>
          </div>
        </div>
      </template>
    </div>

    <!-- Chat Main -->
    <div class="chat-main">
      <div class="chat-hdr">
        <div class="chat-hdr-top">
          <div style="min-width:0">
            <div class="name">{{ currentContactName }}</div>
            <div class="chat-topic-meta">{{ currentTopicMeta }}</div>
          </div>
          <div class="chat-hdr-actions">
            <button class="ghost-btn" :disabled="!currentContactId" @click="startNewDirective">+ New Directive</button>
            <div class="st"><span class="dot"></span>active</div>
          </div>
        </div>
        <div class="topic-strip">
          <button v-if="currentContactId"
                  class="topic-pill draft" :class="{ active: newDirectiveMode }"
                  @click="startNewDirective">
            New for {{ currentContact?.name }}
          </button>
          <button v-for="topic in currentContactTopics" :key="topic.id"
                  class="topic-pill" :class="{ active: topic.id === currentTopicId && !newDirectiveMode }"
                  @click="selectTopic(topic.id)">
            {{ topic.title }}<span class="count"> · {{ topic.status || 'active' }}</span>
          </button>
        </div>
      </div>
      
      <div class="chat-msgs" ref="chatMsgsRef">
        <div v-if="!currentContactId" class="empty-state">
          <div class="emoji">💬</div>
          <div class="text">Select a contact on the left to start chatting</div>
        </div>
        <div v-else-if="newDirectiveMode" class="empty-state">
          <div class="emoji">📝</div>
          <div class="text">The next message will create a new directive for {{ currentContact?.name }}.</div>
        </div>
        <div v-else-if="!messages.length" class="empty-state">
          <div class="emoji">📭</div>
          <div class="text">No messages yet.</div>
        </div>
        <template v-else>
          <div v-for="msg in messages" :key="msg.id || msg.created_at"
               class="msg" :class="getMessageClass(msg.sender)">
            <div class="sender">{{ msg.sender }}</div>
            <div v-html="msg.content"></div>
            <div class="time">{{ formatTime(msg.created_at) }}</div>
          </div>
        </template>

        <!-- Streaming reply bubble (Layer ①: ephemeral, real-time UI only) -->
        <div v-if="currentStreamingReply" class="msg from-agent streaming">
          <div class="sender">{{ currentStreamingReply.role }}</div>
          <div class="streaming-indicator">
            <span class="dot-pulse"></span>
            <span class="streaming-label">{{ currentStreamingReply.tools.length ? currentStreamingReply.tools[currentStreamingReply.tools.length - 1] : 'thinking...' }}</span>
          </div>
          <div v-if="currentStreamingReply.text" class="streaming-text">{{ currentStreamingReply.text }}</div>
          <details v-if="currentStreamingReply.thinking" class="thinking-block">
            <summary>💭 Thinking</summary>
            <pre>{{ currentStreamingReply.thinking }}</pre>
          </details>
        </div>
      </div>
      
      <div class="chat-input">
        <input type="text" v-model="inputText" 
               :placeholder="chatPlaceholder" 
               @keydown.enter="sendMessage"
               :disabled="!currentContactId" />
        <button @click="sendMessage" :disabled="!currentContactId || !inputText.trim()">Send</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { useOpcStore } from '../composables/useOpcStore';
import { useOpcApi } from '../composables/useOpcApi';
import { useWebSocket } from '../composables/useWebSocket';

const store = useOpcStore();
const api = useOpcApi();
const { opcMessage } = useWebSocket();

const messages = ref<any[]>([]);
const inputText = ref('');
const chatMsgsRef = ref<HTMLElement | null>(null);

// Mapped state
const { roles, currentContactId, currentContact, currentContactTopics, currentTopicId, newDirectiveMode, streamingMessages } = store;

// Layer ①: Find active streaming reply for current topic (ephemeral UI state)
const currentStreamingReply = computed(() => {
  if (!currentTopicId.value) return null;
  return Object.values(streamingMessages)
    .find(s => s.topicId === currentTopicId.value) || null;
});

const cSuiteRoles = computed(() => roles.value.filter(r => r.type === 'c-suite'));
const managerRoles = computed(() => roles.value.filter(r => r.type === 'bu-leader' || r.type === 'group-leader'));
const executionRoles = computed(() => roles.value.filter(r => r.type === 'role'));

const currentContactName = computed(() => {
  const role = currentContact.value;
  if (!role) return 'Select a contact';
  if (role.type === 'c-suite') {
    const titles: Record<string, string> = { ceo: 'Chief Executive Officer', cfo: 'Chief Financial Officer', cto: 'Chief Technology Officer', cso: 'Chief Strategy Officer' };
    return `${role.name} — ${titles[role.id] || role.id}`;
  }
  if (role.type === 'group-leader') return `${role.name} — ${role.group || ''} · ${role.bu || ''}`;
  return `${role.name} — ${role.bu || ''}`;
});

const currentTopicMeta = computed(() => {
  if (!currentContact.value) return 'Choose a contact to view directives and discussion threads.';
  if (newDirectiveMode.value) return `Draft mode · next message will create a new directive for ${currentContact.value.name}`;
  const topic = currentContactTopics.value.find(t => t.id === currentTopicId.value);
  return topic ? `Topic ${topic.id} · ${topic.status || 'active'}` : `No topic selected for ${currentContact.value.name}`;
});

const chatPlaceholder = computed(() => {
  return currentContact.value ? `Send a message to ${currentContact.value.name}...` : 'Select a contact first';
});

const getShortName = (role: any) => {
  if (role.type === 'group-leader') {
    return (role.group || role.name).replace('-group', '').toUpperCase().slice(0, 3);
  }
  return (role.bu ? role.bu.replace('-bu', '').toUpperCase().slice(0, 3) : role.name.slice(0, 3));
};

const getMessageClass = (sender: string) => {
  if (sender === 'system') return 'from-system';
  if (sender === 'chairman' || sender === 'you') return 'from-user';
  return 'from-agent';
};

const formatTime = (isoString?: string) => {
  if (!isoString) return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  return new Date(isoString).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
};

const scrollToBottom = async () => {
  await nextTick();
  if (chatMsgsRef.value) {
    chatMsgsRef.value.scrollTop = chatMsgsRef.value.scrollHeight;
  }
};

const loadChat = async () => {
  if (!currentContactId.value) return;
  const topics = await api.get(`/api/opc/topics?participant=${encodeURIComponent(currentContactId.value)}`);
  currentContactTopics.value = topics || [];
  
  if (!currentContactTopics.value.length) {
    currentTopicId.value = null;
    newDirectiveMode.value = true;
    messages.value = [];
    return;
  }
  
  const nextTopic = currentContactTopics.value.find(t => t.id === currentTopicId.value) || currentContactTopics.value[0];
  currentTopicId.value = nextTopic.id;
  newDirectiveMode.value = false;
  
  const timeline = await api.get(`/api/opc/topics/${currentTopicId.value}/timeline?participant=${encodeURIComponent(currentContactId.value)}`);
  if (timeline && timeline.events) {
    // Map timeline events to the { sender, content, created_at } shape the template expects
    messages.value = timeline.events
      .filter((ev: any) => ev.type === 'message') // only show chat messages, not dispatch/exec events
      .map((ev: any) => ({
        id: ev.timestamp,
        sender: ev.role || 'system',
        content: ev.detail || ev.summary || '',
        created_at: ev.timestamp || '',
        msg_type: ev.msg_type || 'chat',
      }));
  } else {
    messages.value = [];
  }
  scrollToBottom();
  
  // Reload global task board for the new topic
  store.loadTasks(currentTopicId.value);
};

const selectContact = (role: any) => {
  currentContactId.value = role.id;
  currentContact.value = role;
  loadChat();
};

const selectTopic = (id: string) => {
  currentTopicId.value = id;
  newDirectiveMode.value = false;
  loadChat();
};

const startNewDirective = () => {
  newDirectiveMode.value = true;
  currentTopicId.value = null;
  messages.value = [];
  store.loadTasks(null); // clears task board for new draft
};

const sendMessage = async () => {
  const text = inputText.value.trim();
  if (!text || !currentContactId.value) return;
  
  try {
    // Optimistic UI update
    messages.value = [...messages.value, {
      id: `local-${Date.now()}`,
      sender: 'chairman',
      content: text,
      created_at: new Date().toISOString()
    }];
    inputText.value = '';
    scrollToBottom();
    
    if (newDirectiveMode.value) {
      // Determine title
      const title = text.length > 50 ? text.slice(0, 50) + '...' : text;
      
      // Create new topic/directive
      const created = await api.post('/api/opc/topics', { title, directive: text });
      if (created && created.id) {
        currentTopicId.value = created.id;
        newDirectiveMode.value = false;
        
        // Send the initial message or dispatch
        if (currentContact.value?.type === 'c-suite' || currentContact.value?.type === 'role') {
          await api.post(`/api/opc/topics/${created.id}/messages`, {
            sender: 'chairman',
            receiver: currentContactId.value,
            content: text
          });
        } else {
          await api.post(`/api/opc/topics/${created.id}/dispatch`, {
            target_role: currentContactId.value,
            target_path: currentContact.value?.inboxPath || '',
            title: "New Directive",
            description: text
          });
        }
        
        await loadChat(); // reload full state including timeline and topic strips
      }
    } else {
      // Send message to existing topic
      if (currentContact.value?.type === 'c-suite' || currentContact.value?.type === 'role') {
        await api.post(`/api/opc/topics/${currentTopicId.value}/messages`, {
          sender: 'chairman',
          receiver: currentContactId.value,
          content: text
        });
      } else {
        // Dispatch tasks for manager / bu
        await api.post(`/api/opc/topics/${currentTopicId.value}/dispatch`, {
          target_role: currentContactId.value,
          target_path: currentContact.value?.inboxPath || '',
          title: "Follow-up Instruction",
          description: text
        });
      }
      // Reload chat to show server-confirmed message + any auto-replies
      await loadChat();
    }
  } catch (err) {
    console.error('[sendMessage] Error:', err);
  }
};

// Listen to WebSocket events
watch(opcMessage, (msg) => {
  if (!msg) return;
  if (msg.type === 'message:new' && msg.data) {
    if (!newDirectiveMode.value && msg.data.topic_id === currentTopicId.value) {
      // P7: De-duplicate — remove optimistic local message if server confirms it
      const isDuplicate = messages.value.some(
        m => m.id?.toString().startsWith('local-') &&
             m.sender === msg.data.sender &&
             m.content === msg.data.content
      );
      if (isDuplicate) {
        messages.value = messages.value.filter(
          m => !(m.id?.toString().startsWith('local-') && m.sender === msg.data.sender && m.content === msg.data.content)
        );
      }
      messages.value.push(msg.data);
      scrollToBottom();
    }
  }
  if (msg.type === 'topic:created' || msg.type === 'topic:updated') {
    if (currentContactId.value) loadChat();
  }
  if (msg.type === 'dispatch:created' && currentContactId.value) {
    loadChat();
  }
});

onMounted(() => {
  if (currentContactId.value) {
    loadChat();
  }
});
</script>

<style scoped>
/* Scoped styles ported from mission-control.html */
.chat-layout {
  display: flex;
  height: calc(100vh - 130px);
  background: var(--surface);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  box-shadow: var(--shadow);
  overflow: hidden;
}

.chat-contacts {
  width: 260px;
  background: var(--surface2);
  border-right: 1px solid var(--border);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.contact-section {
  padding: 4px 12px;
  font-size: 9px;
  color: var(--text3);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 600;
  border-bottom: 1px solid var(--border);
}

.contact {
  padding: 10px 14px;
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  border-bottom: 1px solid var(--border);
  transition: all 0.15s;
}

.contact:hover {
  background: rgba(0,0,0,0.02);
}

.contact.active {
  background: var(--surface);
  border-left: 3px solid var(--accent);
}

.contact .avatar {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
}

.contact .name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 2px;
}

.contact .role {
  font-size: 10px;
  color: var(--text3);
  text-transform: capitalize;
}

.chat-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

.chat-hdr {
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}

.chat-hdr-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 12px 16px;
  border-bottom: 1px solid var(--surface2);
}

.chat-hdr .name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}

.chat-topic-meta {
  font-size: 11px;
  color: var(--text3);
  margin-top: 4px;
}

.chat-hdr-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.ghost-btn {
  background: var(--surface2);
  color: var(--text2);
  border: 1px solid var(--border);
  padding: 5px 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}

.ghost-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ghost-btn:hover:not(:disabled) {
  background: var(--border);
}

.st {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 10px;
  font-weight: 600;
  background: var(--green-bg);
  color: var(--green-t);
}

.st .dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--green);
}

.topic-strip {
  display: flex;
  gap: 6px;
  padding: 8px 16px;
  overflow-x: auto;
  background: var(--surface);
}

.topic-pill {
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  border: 1px solid var(--border);
  background: var(--surface2);
  color: var(--text2);
  transition: all 0.2s;
}

.topic-pill:hover {
  background: var(--border);
}

.topic-pill.active {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}

.topic-pill.draft {
  border-style: dashed;
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-bg);
}

.topic-pill.draft.active {
  background: var(--accent);
  color: #fff;
}

.chat-msgs {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: var(--surface);
  min-width: 0;
}

.msg {
  max-width: 88%;
  padding: 8px 12px;
  border-radius: 10px;
  font-size: 12px;
  line-height: 1.55;
}

.msg .sender {
  font-size: 10px;
  font-weight: 600;
  margin-bottom: 2px;
}

.msg .time {
  font-size: 9px;
  color: var(--text3);
  margin-top: 3px;
  text-align: right;
  font-family: var(--mono);
}

.msg.from-system {
  background: var(--bg3);
  align-self: flex-start;
  border-bottom-left-radius: 3px;
}

.msg.from-user {
  background: var(--accent);
  color: #fff;
  align-self: flex-end;
  border-bottom-right-radius: 3px;
}

.msg.from-user .time {
  color: rgba(255, 255, 255, 0.5);
}

.msg.from-agent {
  background: var(--surface2);
  align-self: flex-start;
  border-bottom-left-radius: 3px;
}

.msg pre {
  white-space: pre-wrap;
  word-wrap: break-word;
  overflow-x: hidden;
  max-width: 100%;
}

.msg img, .msg video {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
}

.thinking-block pre {
  white-space: pre-wrap;
  word-wrap: break-word;
  font-family: var(--mono);
  font-size: 10px;
  background: rgba(0,0,0,0.2);
  padding: 8px;
  border-radius: 6px;
  margin-top: 6px;
  max-height: 200px;
  overflow-y: auto;
}

.chat-input {
  padding: 10px 14px;
  border-top: 1px solid var(--border);
  display: flex;
  gap: 6px;
  background: var(--surface);
}

.chat-input input {
  flex: 1;
  border: 1px solid var(--border);
  border-radius: 7px;
  padding: 7px 12px;
  font-size: 12px;
  font-family: var(--sans);
  outline: none;
  transition: border-color 0.15s;
}

.chat-input input:disabled {
  background: var(--surface3);
  cursor: not-allowed;
}

.chat-input input:focus {
  border-color: var(--accent);
}

.chat-input button {
  padding: 7px 14px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 7px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  font-family: var(--sans);
}

.chat-input button:disabled {
  background: var(--text3);
  cursor: not-allowed;
}

.chat-input button:hover:not(:disabled) {
  background: var(--accent2);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  color: var(--text3);
  margin: auto;
}

.empty-state .emoji {
  font-size: 32px;
  margin-bottom: 8px;
}

.empty-state .text {
  font-size: 12px;
  text-align: center;
}

/* ── Streaming bubble (Layer ①: ephemeral real-time UI) ── */

.msg.streaming {
  border-left: 2px solid var(--accent);
  background: rgba(79, 110, 247, 0.05);
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

.streaming-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.dot-pulse {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent, #4f6ef7);
  animation: pulse 1.2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 0.2; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1.2); }
}

.streaming-label {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--text3);
}

.streaming-text {
  white-space: pre-wrap;
  font-size: 13px;
  line-height: 1.6;
  padding-left: 8px;
  border-left: 2px solid var(--accent, #4f6ef7);
  margin-top: 4px;
  /* Typewriter cursor effect */
  border-right: 2px solid var(--accent, #4f6ef7);
  animation: blink-caret 0.75s step-end infinite;
}

@keyframes blink-caret {
  50% { border-right-color: transparent; }
}

.thinking-block {
  margin-top: 8px;
  font-size: 11px;
  color: var(--text3);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 4px 8px;
}

.thinking-block summary {
  cursor: pointer;
  user-select: none;
  font-size: 11px;
}

.thinking-block pre {
  margin: 4px 0 0 0;
  font-family: var(--mono);
  font-size: 11px;
  white-space: pre-wrap;
  max-height: 200px;
  overflow-y: auto;
  color: var(--text2);
}
</style>
