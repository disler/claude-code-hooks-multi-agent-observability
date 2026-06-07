<template>
  <Teleport to="body">
    <div v-if="isOpen" class="overlay" role="dialog" aria-modal="true" aria-label="Chat transcript">
      <!-- Backdrop -->
      <div class="scrim" @click="close"></div>

      <!-- Modal -->
      <div class="modal" @click.stop>
        <!-- Header -->
        <div class="modal-head">
          <div class="head-row">
            <h2 class="title">
              <span class="title-ico"><AppIcon name="prompt" :size="16" /></span>
              Chat Transcript
            </h2>
            <button class="iconbtn" title="Close" aria-label="Close" @click="close">
              <AppIcon name="x" :size="16" />
            </button>
          </div>

          <!-- Search and Filters -->
          <div class="controls">
            <!-- Search Input -->
            <div class="search-row">
              <div class="search">
                <AppIcon name="search" :size="14" class="s-ico" />
                <input
                  v-model="searchQuery"
                  type="text"
                  placeholder="Search transcript…"
                  @keyup.enter="executeSearch"
                >
              </div>
              <button class="ghost-btn" @click="executeSearch">
                <AppIcon name="search" :size="13" />
                <span>Search</span>
              </button>
              <button class="ghost-btn" title="Copy all messages as JSON" @click="copyAllMessages">
                <AppIcon :name="copyAllIcon" :size="13" />
                <span>{{ copyAllLabel }}</span>
              </button>
            </div>

            <!-- Filters -->
            <div class="filters">
              <button
                v-for="filter in filters"
                :key="filter.type"
                class="chip"
                :class="{ on: activeFilters.includes(filter.type) }"
                @click="toggleFilter(filter.type)"
              >
                <AppIcon :name="filter.icon" :size="12" />
                <span>{{ filter.label }}</span>
              </button>

              <!-- Clear Filters -->
              <button
                v-if="searchQuery || activeSearchQuery || activeFilters.length > 0"
                class="chip chip-clear"
                @click="clearSearch"
              >
                <AppIcon name="x" :size="12" />
                <span>Clear All</span>
              </button>
            </div>

            <!-- Results Count -->
            <div v-if="activeSearchQuery || activeFilters.length > 0" class="results">
              Showing <span class="mono tabular">{{ filteredChat.length }}</span> of <span class="mono tabular">{{ chat.length }}</span> messages
              <span v-if="activeSearchQuery" class="results-q">
                · searching for "<span class="mono">{{ activeSearchQuery }}</span>"
              </span>
            </div>
          </div>
        </div>

        <!-- Content -->
        <div class="modal-body">
          <ChatTranscript :chat="filteredChat" />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import ChatTranscript from './ChatTranscript.vue';
import AppIcon from './AppIcon.vue';

const props = defineProps<{
  isOpen: boolean;
  chat: any[];
}>();

const emit = defineEmits<{
  close: [];
}>();

const searchQuery = ref('');
const activeSearchQuery = ref('');
const activeFilters = ref<string[]>([]);
const copyAllIcon = ref('copy');
const copyAllLabel = ref('Copy All');

const filters = [
  // Message types
  { type: 'user', label: 'User', icon: 'prompt' },
  { type: 'assistant', label: 'Assistant', icon: 'zap' },
  { type: 'system', label: 'System', icon: 'tool' },

  // Tool actions
  { type: 'tool_use', label: 'Tool Use', icon: 'pre-tool' },
  { type: 'tool_result', label: 'Tool Result', icon: 'post-tool' },

  // Specific tools
  { type: 'Read', label: 'Read', icon: 'read' },
  { type: 'Write', label: 'Write', icon: 'write' },
  { type: 'Edit', label: 'Edit', icon: 'edit' },
  { type: 'Glob', label: 'Glob', icon: 'glob' },
];

const toggleFilter = (type: string) => {
  const index = activeFilters.value.indexOf(type);
  if (index > -1) {
    activeFilters.value.splice(index, 1);
  } else {
    activeFilters.value.push(type);
  }
};

const executeSearch = () => {
  activeSearchQuery.value = searchQuery.value;
};

const clearSearch = () => {
  searchQuery.value = '';
  activeSearchQuery.value = '';
  activeFilters.value = [];
};

const close = () => {
  emit('close');
};

const copyAllMessages = async () => {
  try {
    // Copy all chat messages as formatted JSON
    const jsonPayload = JSON.stringify(props.chat, null, 2);
    await navigator.clipboard.writeText(jsonPayload);

    copyAllIcon.value = 'check';
    copyAllLabel.value = 'Copied!';
    setTimeout(() => {
      copyAllIcon.value = 'copy';
      copyAllLabel.value = 'Copy All';
    }, 2000);
  } catch (err) {
    console.error('Failed to copy all messages:', err);
    copyAllIcon.value = 'x';
    copyAllLabel.value = 'Failed';
    setTimeout(() => {
      copyAllIcon.value = 'copy';
      copyAllLabel.value = 'Copy All';
    }, 2000);
  }
};

const matchesSearch = (item: any, query: string): boolean => {
  const lowerQuery = query.toLowerCase().trim();

  // Check direct content (for system messages and simple chat)
  if (typeof item.content === 'string') {
    // Remove ANSI codes before searching
    const cleanContent = item.content.replace(/\[[0-9;]*m/g, '').toLowerCase();
    if (cleanContent.includes(lowerQuery)) {
      return true;
    }
  }

  // Check role in simple format
  if (item.role && item.role.toLowerCase().includes(lowerQuery)) {
    return true;
  }

  // Check message object (complex format)
  if (item.message) {
    // Check message role
    if (item.message.role && item.message.role.toLowerCase().includes(lowerQuery)) {
      return true;
    }

    // Check message content
    if (item.message.content) {
      if (typeof item.message.content === 'string' && item.message.content.toLowerCase().includes(lowerQuery)) {
        return true;
      }
      // Check array content
      if (Array.isArray(item.message.content)) {
        for (const content of item.message.content) {
          if (content.text && content.text.toLowerCase().includes(lowerQuery)) {
            return true;
          }
          if (content.name && content.name.toLowerCase().includes(lowerQuery)) {
            return true;
          }
          if (content.input && JSON.stringify(content.input).toLowerCase().includes(lowerQuery)) {
            return true;
          }
          if (content.content && typeof content.content === 'string' && content.content.toLowerCase().includes(lowerQuery)) {
            return true;
          }
        }
      }
    }
  }

  // Check type
  if (item.type && item.type.toLowerCase().includes(lowerQuery)) {
    return true;
  }

  // Check parentUuid, uuid, sessionId
  if (item.uuid && item.uuid.toLowerCase().includes(lowerQuery)) {
    return true;
  }
  if (item.sessionId && item.sessionId.toLowerCase().includes(lowerQuery)) {
    return true;
  }

  // Check toolUseResult
  if (item.toolUseResult) {
    if (JSON.stringify(item.toolUseResult).toLowerCase().includes(lowerQuery)) {
      return true;
    }
  }

  return false;
};

const matchesFilters = (item: any): boolean => {
  if (activeFilters.value.length === 0) return true;

  // Check message type
  if (item.type && activeFilters.value.includes(item.type)) {
    return true;
  }

  // Check role (simple format)
  if (item.role && activeFilters.value.includes(item.role)) {
    return true;
  }

  // Check for system messages with hook types
  if (item.type === 'system' && item.content) {
    // Extract hook type from system content (e.g., "PreToolUse:Read")
    const hookMatch = item.content.match(/([A-Za-z]+):/)?.[1];
    if (hookMatch && activeFilters.value.includes(hookMatch)) {
      return true;
    }
    // Also check if content contains "Running"
    if (item.content.includes('Running') && activeFilters.value.includes('Running')) {
      return true;
    }
    // Check for specific tool names in system messages
    const toolNames = ['Read', 'Write', 'Edit', 'Glob'];
    for (const tool of toolNames) {
      if (item.content.includes(tool) && activeFilters.value.includes(tool)) {
        return true;
      }
    }
  }

  // Check for command messages
  if (item.message?.content && typeof item.message.content === 'string') {
    if (item.message.content.includes('<command-') && activeFilters.value.includes('command')) {
      return true;
    }
  }

  // Check for meta messages
  if (item.isMeta && activeFilters.value.includes('meta')) {
    return true;
  }

  // Check for tool use in content
  if (item.message?.content && Array.isArray(item.message.content)) {
    for (const content of item.message.content) {
      if (content.type === 'tool_use') {
        if (activeFilters.value.includes('tool_use')) {
          return true;
        }
        // Check for specific tool names
        if (content.name && activeFilters.value.includes(content.name)) {
          return true;
        }
      }
      if (content.type === 'tool_result' && activeFilters.value.includes('tool_result')) {
        return true;
      }
    }
  }

  return false;
};

const filteredChat = computed(() => {
  if (!activeSearchQuery.value && activeFilters.value.length === 0) {
    return props.chat;
  }

  return props.chat.filter(item => {
    const matchesQueryCondition = !activeSearchQuery.value || matchesSearch(item, activeSearchQuery.value);
    const matchesFilterCondition = matchesFilters(item);
    return matchesQueryCondition && matchesFilterCondition;
  });
});

// Handle ESC key
const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && props.isOpen) {
    close();
  }
};

onMounted(() => {
  document.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown);
});

// Reset search when modal closes
watch(() => props.isOpen, (newVal) => {
  if (!newVal) {
    clearSearch();
  }
});

</script>

<style scoped>
.overlay {
  position: fixed; inset: 0; z-index: 50;
  display: flex; align-items: center; justify-content: center;
  padding: var(--space-4);
}
.scrim {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.6);
}

/* ───────── modal shell ───────── */
.modal {
  position: relative; z-index: 1;
  width: 85vw; height: 85vh;
  display: flex; flex-direction: column;
  overflow: hidden;
  background: var(--surface);
  border: 1px solid var(--hair);
  border-radius: var(--radius-lg);
  box-shadow: var(--elevation-2);
  font-family: var(--font-sans);
}

/* ───────── header ───────── */
.modal-head {
  flex: none;
  padding: var(--space-4);
  border-bottom: 1px solid var(--hair-faint);
  background: var(--surface);
}
.head-row {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: var(--space-3);
}
.title {
  display: flex; align-items: center; gap: var(--space-2);
  margin: 0;
  font-size: var(--text-lg); font-weight: var(--weight-semibold);
  color: var(--text-strong);
}
.title-ico { display: inline-flex; color: var(--theme-primary); }

.iconbtn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; border: 0; border-radius: var(--radius-sm);
  background: transparent; color: var(--text-faint); cursor: pointer;
  transition: color var(--motion-fast) var(--ease-out), background var(--motion-fast) var(--ease-out);
}
.iconbtn:hover { color: var(--text-strong); background: var(--surface-hover); }

/* ───────── controls ───────── */
.controls { display: flex; flex-direction: column; gap: var(--space-3); }

.search-row { display: flex; align-items: center; gap: var(--space-2); }
.search { position: relative; display: flex; align-items: center; flex: 1; min-width: 0; }
.search .s-ico { position: absolute; left: 10px; color: var(--text-faint); pointer-events: none; }
.search input {
  width: 100%; padding: 7px 12px 7px 32px;
  border: 1px solid var(--hair); border-radius: var(--radius-sm);
  background: var(--surface); color: var(--text-strong);
  font-family: var(--font-mono); font-size: var(--text-sm);
  transition: border-color var(--motion-fast);
}
.search input::placeholder { color: var(--text-ghost); font-family: var(--font-sans); }
.search input:focus { outline: none; border-color: var(--theme-primary); }

.ghost-btn {
  display: inline-flex; align-items: center; gap: 6px; flex: none;
  padding: 7px 11px; border: 1px solid var(--hair); border-radius: var(--radius-sm);
  background: transparent; color: var(--text-muted); cursor: pointer;
  font-family: var(--font-sans); font-size: var(--text-xs); font-weight: var(--weight-medium);
  transition: color var(--motion-fast), border-color var(--motion-fast);
}
.ghost-btn:hover { color: var(--theme-primary); border-color: var(--primary-line); }

/* ───────── filter chips ───────── */
.filters { display: flex; flex-wrap: wrap; gap: 6px; }
.chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 10px; border-radius: var(--radius-full);
  border: 1px solid var(--hair); background: transparent;
  color: var(--text-muted); cursor: pointer;
  font-family: var(--font-sans); font-size: var(--text-xs); font-weight: var(--weight-medium);
  white-space: nowrap;
  transition: color var(--motion-fast), border-color var(--motion-fast), background var(--motion-fast);
}
.chip:hover { color: var(--text-strong); border-color: var(--hair-strong); }
.chip.on {
  color: var(--theme-primary);
  border-color: var(--primary-line);
  background: var(--primary-soft);
}
.chip-clear { color: var(--text-faint); }
.chip-clear:hover {
  color: var(--theme-accent-error);
  border-color: color-mix(in srgb, var(--theme-accent-error) 55%, transparent);
  background: color-mix(in srgb, var(--theme-accent-error) 10%, transparent);
}

/* ───────── results count ───────── */
.results { font-size: var(--text-xs); color: var(--text-faint); }
.results .mono { color: var(--text-base); }
.results-q { color: var(--text-muted); }

/* ───────── body ───────── */
.modal-body {
  flex: 1; min-height: 0;
  display: flex; flex-direction: column;
  overflow: hidden;
}

@media (max-width: 699px) {
  .overlay { padding: 0; }
  .modal {
    width: 100%; height: 100%;
    border: 0; border-radius: 0;
  }
  .modal-head { padding: var(--space-3); }
  .filters { max-height: 96px; overflow-y: auto; }
}
</style>
