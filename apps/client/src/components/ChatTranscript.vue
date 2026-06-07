<template>
  <div class="transcript">
    <div v-for="(item, index) in chatItems" :key="index" class="turn-wrap">
      <!-- User Message -->
      <div v-if="item.type === 'user' && item.message" class="turn turn-user">
        <div class="gutter">
          <span class="avatar"><AppIcon name="prompt" :size="13" /></span>
          <span class="role-lbl">User</span>
        </div>
        <div class="turn-main">
          <div class="turn-head">
            <div class="turn-actions">
              <button class="ghost-btn" @click="toggleDetails(index)">
                <AppIcon :name="isDetailsExpanded(index) ? 'chevron-down' : 'chevron-right'" :size="12" />
                <span>{{ isDetailsExpanded(index) ? 'Hide' : 'Show' }} Details</span>
              </button>
              <button class="ghost-btn" :title="'Copy message'" @click="copyMessage(index, item.type || item.role)">
                <AppIcon :name="getCopyIcon(index)" :size="12" />
              </button>
            </div>
          </div>
          <div class="msg-body">
            <!-- Handle string content -->
            <p v-if="typeof item.message.content === 'string'" class="msg-text">
              {{ item.message.content.includes('<command-') ? cleanCommandContent(item.message.content) : item.message.content }}
            </p>
            <!-- Handle array content -->
            <div v-else-if="Array.isArray(item.message.content)" class="msg-parts">
              <div v-for="(content, cIndex) in item.message.content" :key="cIndex">
                <!-- Text content -->
                <p v-if="content.type === 'text'" class="msg-text">
                  {{ content.text }}
                </p>
                <!-- Tool result -->
                <div v-else-if="content.type === 'tool_result'" class="code-card">
                  <div class="code-head">
                    <span class="code-cap"><AppIcon name="post-tool" :size="12" />Tool Result</span>
                  </div>
                  <pre class="code-body mono">{{ content.content }}</pre>
                </div>
              </div>
            </div>
          </div>
          <!-- Metadata -->
          <div v-if="item.timestamp" class="meta mono tabular">
            {{ formatTimestamp(item.timestamp) }}
          </div>
          <!-- Details Section -->
          <div v-if="isDetailsExpanded(index)" class="code-card details">
            <pre class="code-body mono">{{ JSON.stringify(item, null, 2) }}</pre>
          </div>
        </div>
      </div>

      <!-- Assistant Message -->
      <div v-else-if="item.type === 'assistant' && item.message" class="turn turn-assistant">
        <div class="gutter">
          <span class="avatar"><AppIcon name="zap" :size="13" /></span>
          <span class="role-lbl">Assistant</span>
        </div>
        <div class="turn-main">
          <div class="turn-head">
            <div class="turn-actions">
              <button class="ghost-btn" @click="toggleDetails(index)">
                <AppIcon :name="isDetailsExpanded(index) ? 'chevron-down' : 'chevron-right'" :size="12" />
                <span>{{ isDetailsExpanded(index) ? 'Hide' : 'Show' }} Details</span>
              </button>
              <button class="ghost-btn" :title="'Copy message'" @click="copyMessage(index, item.type || item.role)">
                <AppIcon :name="getCopyIcon(index)" :size="12" />
              </button>
            </div>
          </div>
          <div class="msg-body">
            <!-- Handle content array -->
            <div v-if="Array.isArray(item.message.content)" class="msg-parts">
              <div v-for="(content, cIndex) in item.message.content" :key="cIndex">
                <!-- Text content -->
                <p v-if="content.type === 'text'" class="msg-text">
                  {{ content.text }}
                </p>
                <!-- Tool use -->
                <div v-else-if="content.type === 'tool_use'" class="code-card">
                  <div class="code-head">
                    <span class="code-cap code-cap-tool"><AppIcon name="tool" :size="12" />{{ content.name }}</span>
                  </div>
                  <pre class="code-body mono">{{ JSON.stringify(content.input, null, 2) }}</pre>
                </div>
              </div>
            </div>
          </div>
          <!-- Usage info -->
          <div v-if="item.message.usage" class="meta mono tabular">
            {{ item.message.usage.input_tokens }} in / {{ item.message.usage.output_tokens }} out
          </div>
          <!-- Timestamp -->
          <div v-if="item.timestamp" class="meta mono tabular">
            {{ formatTimestamp(item.timestamp) }}
          </div>
          <!-- Details Section -->
          <div v-if="isDetailsExpanded(index)" class="code-card details">
            <pre class="code-body mono">{{ JSON.stringify(item, null, 2) }}</pre>
          </div>
        </div>
      </div>

      <!-- System Message -->
      <div v-else-if="item.type === 'system'" class="turn turn-system">
        <div class="gutter">
          <span class="avatar"><AppIcon name="tool" :size="13" /></span>
          <span class="role-lbl">System</span>
        </div>
        <div class="turn-main">
          <div class="turn-head">
            <div class="turn-actions">
              <button class="ghost-btn" @click="toggleDetails(index)">
                <AppIcon :name="isDetailsExpanded(index) ? 'chevron-down' : 'chevron-right'" :size="12" />
                <span>{{ isDetailsExpanded(index) ? 'Hide' : 'Show' }} Details</span>
              </button>
              <button class="ghost-btn" :title="'Copy message'" @click="copyMessage(index, item.type || item.role)">
                <AppIcon :name="getCopyIcon(index)" :size="12" />
              </button>
            </div>
          </div>
          <div class="msg-body">
            <p class="msg-text">
              {{ cleanSystemContent(item.content || '') }}
            </p>
          </div>
          <!-- Tool use ID if present -->
          <div v-if="item.toolUseID" class="meta mono">
            Tool ID: {{ item.toolUseID }}
          </div>
          <!-- Timestamp -->
          <div v-if="item.timestamp" class="meta mono tabular">
            {{ formatTimestamp(item.timestamp) }}
          </div>
          <!-- Details Section -->
          <div v-if="isDetailsExpanded(index)" class="code-card details">
            <pre class="code-body mono">{{ JSON.stringify(item, null, 2) }}</pre>
          </div>
        </div>
      </div>

      <!-- Fallback for simple chat format -->
      <div v-else-if="item.role" class="turn" :class="item.role === 'user' ? 'turn-user' : 'turn-assistant'">
        <div class="gutter">
          <span class="avatar"><AppIcon :name="item.role === 'user' ? 'prompt' : 'zap'" :size="13" /></span>
          <span class="role-lbl">{{ item.role === 'user' ? 'User' : 'Assistant' }}</span>
        </div>
        <div class="turn-main">
          <div class="turn-head">
            <div class="turn-actions">
              <button class="ghost-btn" @click="toggleDetails(index)">
                <AppIcon :name="isDetailsExpanded(index) ? 'chevron-down' : 'chevron-right'" :size="12" />
                <span>{{ isDetailsExpanded(index) ? 'Hide' : 'Show' }} Details</span>
              </button>
              <button class="ghost-btn" :title="'Copy message'" @click="copyMessage(index, item.type || item.role)">
                <AppIcon :name="getCopyIcon(index)" :size="12" />
              </button>
            </div>
          </div>
          <div class="msg-body">
            <p class="msg-text">
              {{ item.content }}
            </p>
          </div>
          <!-- Details Section -->
          <div v-if="isDetailsExpanded(index)" class="code-card details">
            <pre class="code-body mono">{{ JSON.stringify(item, null, 2) }}</pre>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import AppIcon from './AppIcon.vue';

const props = defineProps<{
  chat: any[];
}>();

// Track which items have details expanded
const expandedDetails = ref<Set<number>>(new Set());

const toggleDetails = (index: number) => {
  if (expandedDetails.value.has(index)) {
    expandedDetails.value.delete(index);
  } else {
    expandedDetails.value.add(index);
  }
  // Force reactivity
  expandedDetails.value = new Set(expandedDetails.value);
};

const isDetailsExpanded = (index: number) => {
  return expandedDetails.value.has(index);
};

const chatItems = computed(() => {
  // Handle both simple chat format and complex claude-code format
  if (props.chat.length > 0 && props.chat[0].type) {
    // Complex format from chat.json
    return props.chat;
  } else {
    // Simple format with role/content
    return props.chat;
  }
});

const formatTimestamp = (timestamp: string) => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString();
};

// const cleanContent = (content: string) => {
//   // Remove command message tags
//   return content
//     .replace(/<command-message>.*?<\/command-message>/gs, '')
//     .replace(/<command-name>.*?<\/command-name>/gs, '')
//     .trim();
// };

const cleanSystemContent = (content: string) => {
  // Remove ANSI escape codes
  return content.replace(/\[[0-9;]*m/g, '');
};

const cleanCommandContent = (content: string) => {
  // Remove command tags and clean content
  return content
    .replace(/<command-message>.*?<\/command-message>/gs, '')
    .replace(/<command-name>(.*?)<\/command-name>/gs, '$1')
    .trim();
};

// Track copy button states
const copyButtonStates = ref<Map<number, string>>(new Map());

const getCopyIcon = (index: number) => {
  return copyButtonStates.value.get(index) || 'copy';
};

const copyMessage = async (index: number, _type: string) => {
  const item = chatItems.value[index];

  try {
    // Copy the entire JSON payload
    const jsonPayload = JSON.stringify(item, null, 2);
    await navigator.clipboard.writeText(jsonPayload);

    copyButtonStates.value.set(index, 'check');
    setTimeout(() => {
      copyButtonStates.value.delete(index);
      copyButtonStates.value = new Map(copyButtonStates.value);
    }, 2000);
  } catch (err) {
    console.error('Failed to copy:', err);
    copyButtonStates.value.set(index, 'x');
    setTimeout(() => {
      copyButtonStates.value.delete(index);
      copyButtonStates.value = new Map(copyButtonStates.value);
    }, 2000);
  }
  // Force reactivity
  copyButtonStates.value = new Map(copyButtonStates.value);
};
</script>

<style scoped>
.transcript {
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.turn-wrap { border-bottom: 1px solid var(--hair-faint); }
.turn-wrap:last-child { border-bottom: 0; }

/* ───────── turn layout: role gutter + body ───────── */
.turn {
  display: grid;
  grid-template-columns: 92px 1fr;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  --role-c: var(--text-muted);
}
.turn-user { --role-c: var(--theme-primary); }
.turn-assistant { --role-c: var(--theme-accent-success); }
.turn-system { --role-c: var(--theme-accent-warning); }

/* ───────── role gutter ───────── */
.gutter {
  display: flex;
  align-items: center;
  gap: 7px;
  height: fit-content;
  padding-top: 1px;
}
.avatar {
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; flex: none;
  border-radius: var(--radius-full);
  border: 1px solid color-mix(in srgb, var(--role-c) 45%, transparent);
  background: color-mix(in srgb, var(--role-c) 12%, transparent);
  color: var(--role-c);
}
.role-lbl {
  font-size: var(--text-2xs); font-weight: var(--weight-semibold);
  letter-spacing: var(--tracking-caps); text-transform: uppercase;
  color: var(--role-c);
}

/* ───────── body ───────── */
.turn-main { min-width: 0; }
.turn-head { display: flex; justify-content: flex-end; }
.turn-actions { display: flex; align-items: center; gap: 4px; }

.ghost-btn {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 3px 8px; border: 1px solid var(--hair); border-radius: var(--radius-sm);
  background: transparent; color: var(--text-muted); cursor: pointer;
  font-family: var(--font-sans); font-size: var(--text-2xs); font-weight: var(--weight-medium);
  transition: color var(--motion-fast), border-color var(--motion-fast);
}
.ghost-btn:hover { color: var(--text-strong); border-color: var(--hair-strong); }

.msg-body { margin-top: var(--space-1); }
.msg-parts { display: flex; flex-direction: column; gap: var(--space-2); }
.msg-text {
  margin: 0;
  font-size: var(--text-body); line-height: var(--leading-normal);
  color: var(--text-base); white-space: pre-wrap; word-break: break-word;
}

.meta {
  margin-top: var(--space-2);
  font-size: var(--text-2xs); color: var(--text-faint);
}

/* ───────── mono code card (tool / json / details) ───────── */
.code-card {
  background: var(--surface-raised);
  border: 1px solid var(--hair);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.code-card.details { margin-top: var(--space-2); }
.code-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 10px; border-bottom: 1px solid var(--hair-faint);
}
.code-cap {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: var(--text-2xs); font-weight: var(--weight-semibold);
  letter-spacing: var(--tracking-caps); text-transform: uppercase;
  color: var(--text-faint);
}
.code-cap-tool { color: var(--theme-accent-warning); text-transform: none; letter-spacing: 0; font-family: var(--font-mono); }
.code-body {
  margin: 0; padding: 10px;
  max-height: 280px; overflow: auto;
  font-size: var(--text-sm); line-height: 1.6; color: var(--text-base);
  white-space: pre; tab-size: 2;
}

@media (max-width: 699px) {
  .turn { grid-template-columns: 1fr; gap: var(--space-2); }
  .gutter { padding-top: 0; }
}
</style>
