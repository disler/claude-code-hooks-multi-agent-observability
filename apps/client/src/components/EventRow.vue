<template>
  <div class="evt-wrap">
    <!-- ───────── HITL row (question / permission / choice) ───────── -->
    <div
      v-if="event.humanInTheLoop && (event.humanInTheLoopStatus?.status === 'pending' || hasSubmittedResponse)"
      class="row row-hitl"
      :class="isResponded ? 'is-responded' : 'is-pending'"
      :style="{ '--row-c': appHexColor }"
      @click.stop
    >
      <span class="spine"></span>
      <span class="ico"><AppIcon :name="isResponded ? 'check' : 'bell'" :size="15" /></span>
      <span class="aid mono"><span class="app">{{ event.source_app }}</span><span class="sid">:{{ sessionIdShort }}</span></span>
      <span class="etype">{{ hitlTypeLabel }}</span>
      <span class="body">
        <span class="chip chip-hitl">HITL</span>
        <span v-if="permissionType" class="chip mono">{{ permissionType }}</span>
        <span class="detail">{{ event.humanInTheLoop.question }}</span>
      </span>
      <span class="ts mono tabular">{{ formatTime(event.timestamp) }}</span>

      <!-- controls -->
      <div class="hitl-controls">
        <div v-if="responseShown" class="hitl-resp">
          <AppIcon name="check" :size="14" /><span>{{ responseSummary }}</span>
        </div>
        <template v-else>
          <div v-if="event.humanInTheLoop.type === 'question'" class="hitl-q">
            <textarea v-model="responseText" rows="2" placeholder="Type your response…" @click.stop></textarea>
            <button class="btn btn-approve" :disabled="!responseText.trim() || isSubmitting || hasSubmittedResponse" @click.stop="submitResponse">
              {{ isSubmitting ? 'Sending…' : 'Submit' }}
            </button>
          </div>
          <div v-else-if="event.humanInTheLoop.type === 'permission'" class="hitl-actions">
            <button class="btn btn-deny" :disabled="isSubmitting || hasSubmittedResponse" @click.stop="submitPermission(false)">
              <AppIcon name="x" :size="13" />Deny
            </button>
            <button class="btn btn-approve" :disabled="isSubmitting || hasSubmittedResponse" @click.stop="submitPermission(true)">
              <AppIcon name="check" :size="13" />Approve
            </button>
          </div>
          <div v-else-if="event.humanInTheLoop.type === 'choice'" class="hitl-actions">
            <button
              v-for="choice in event.humanInTheLoop.choices"
              :key="choice"
              class="btn btn-choice"
              :disabled="isSubmitting || hasSubmittedResponse"
              @click.stop="submitChoice(choice)"
            >{{ choice }}</button>
          </div>
        </template>
      </div>
    </div>

    <!-- ───────── normal event row ───────── -->
    <div
      v-if="!event.humanInTheLoop"
      class="row"
      :class="{ 'is-expanded': isExpanded }"
      :style="{ '--row-c': appHexColor }"
      @click="toggleExpanded"
    >
      <span class="spine"></span>
      <span class="ico"><AppIcon :name="rowIcon" :size="15" /></span>
      <span class="aid mono"><span class="app">{{ event.source_app }}</span><span class="sid">:{{ sessionIdShort }}</span></span>
      <span class="etype">{{ event.hook_event_type }}</span>
      <span class="body">
        <span v-if="event.model_name" class="chip chip-model mono" :title="`Model: ${event.model_name}`">{{ formatModelName(event.model_name) }}</span>
        <span v-if="toolName" class="chip">{{ toolName }}</span>
        <AppIcon v-if="bodyText" name="chevron-right" :size="11" class="body-arrow" />
        <span class="detail">{{ bodyText }}</span>
      </span>
      <span class="ts mono tabular">{{ formatTime(event.timestamp) }}</span>

      <!-- expanded: the single elevated surface on the feed -->
      <div v-if="isExpanded" class="expand" @click.stop>
        <div class="payload-card">
          <div class="payload-head">
            <span class="payload-title">PAYLOAD<span class="muted mono">{{ payloadSize }}</span></span>
            <button class="copybtn" @click.stop="copyPayload"><AppIcon name="copy" :size="13" /><span>{{ copyButtonText }}</span></button>
          </div>
          <pre class="payload-body mono">{{ formattedPayload }}</pre>
        </div>
        <div v-if="event.chat && event.chat.length > 0" class="chat-row">
          <button class="chatbtn" :disabled="isMobile" @click.stop="!isMobile && (showChatModal = true)">
            <AppIcon name="prompt" :size="13" />
            <span>{{ isMobile ? 'Transcript unavailable on mobile' : `View transcript · ${event.chat.length} messages` }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Chat Modal -->
    <ChatTranscriptModal
      v-if="event.chat && event.chat.length > 0"
      :is-open="showChatModal"
      :chat="event.chat"
      @close="showChatModal = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { HookEvent, HumanInTheLoopResponse } from '../types';
import { useMediaQuery } from '../composables/useMediaQuery';
import { useEventIcons } from '../composables/useEventIcons';
import ChatTranscriptModal from './ChatTranscriptModal.vue';
import AppIcon from './AppIcon.vue';
import { API_BASE_URL } from '../config';

const { getIconForEventType, getIconForToolName } = useEventIcons();

const props = defineProps<{
  event: HookEvent;
  gradientClass: string;
  colorClass: string;
  appGradientClass: string;
  appColorClass: string;
  appHexColor: string;
}>();

const emit = defineEmits<{
  (e: 'response-submitted', response: HumanInTheLoopResponse): void;
}>();

// Existing refs
const isExpanded = ref(false);
const showChatModal = ref(false);
const copyButtonText = ref('Copy');

// HITL refs
const responseText = ref('');
const isSubmitting = ref(false);
const hasSubmittedResponse = ref(false);
const localResponse = ref<HumanInTheLoopResponse | null>(null); // Optimistic UI

// Media query for responsive design
const { isMobile } = useMediaQuery();

const toggleExpanded = () => {
  isExpanded.value = !isExpanded.value;
};

const sessionIdShort = computed(() => {
  return props.event.session_id.slice(0, 8);
});

// Icon for the row: prefer the tool glyph for tool events, else the event-type glyph
const toolName = computed(() => {
  const eventType = props.event.hook_event_type;
  const toolEvents = ['PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PermissionRequest'];
  if (toolEvents.includes(eventType) && props.event.payload?.tool_name) {
    return props.event.payload.tool_name;
  }
  return null;
});

const rowIcon = computed(() => {
  return toolName.value ? getIconForToolName(toolName.value) : getIconForEventType(props.event.hook_event_type);
});

const formattedPayload = computed(() => {
  return JSON.stringify(props.event.payload, null, 2);
});

const payloadSize = computed(() => {
  const bytes = new Blob([formattedPayload.value]).size;
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
});

const toolInfo = computed(() => {
  const payload = props.event.payload;

  // Handle UserPromptSubmit events
  if (props.event.hook_event_type === 'UserPromptSubmit' && payload.prompt) {
    return {
      tool: 'Prompt:',
      detail: `"${payload.prompt.slice(0, 100)}${payload.prompt.length > 100 ? '...' : ''}"`
    };
  }

  // Handle PreCompact events
  if (props.event.hook_event_type === 'PreCompact') {
    const trigger = payload.trigger || 'unknown';
    return {
      tool: 'Compaction:',
      detail: trigger === 'manual' ? 'Manual compaction' : 'Auto-compaction (full context)'
    };
  }

  // Handle SessionStart events
  if (props.event.hook_event_type === 'SessionStart') {
    const source = payload.source || 'unknown';
    const sourceLabels: Record<string, string> = {
      'startup': 'New session',
      'resume': 'Resuming session',
      'clear': 'Fresh session'
    };
    return {
      tool: 'Session:',
      detail: sourceLabels[source] || source
    };
  }

  // Handle tool-based events
  if (payload.tool_name) {
    const info: { tool: string; detail?: string } = { tool: payload.tool_name };

    if (payload.tool_input) {
      const input = payload.tool_input;
      if (input.command) {
        info.detail = input.command.slice(0, 50) + (input.command.length > 50 ? '...' : '');
      } else if (input.file_path) {
        info.detail = input.file_path.split('/').pop();
      } else if (input.pattern) {
        info.detail = input.pattern;
      } else if (input.url) {
        // WebFetch
        info.detail = input.url.slice(0, 60) + (input.url.length > 60 ? '...' : '');
      } else if (input.query) {
        // WebSearch
        info.detail = `"${input.query.slice(0, 50)}${input.query.length > 50 ? '...' : ''}"`;
      } else if (input.notebook_path) {
        // NotebookEdit
        info.detail = input.notebook_path.split('/').pop();
      } else if (input.recipient) {
        // SendMessage
        info.detail = `→ ${input.recipient}${input.summary ? ': ' + input.summary : ''}`;
      } else if (input.subject) {
        // TaskCreate
        info.detail = input.subject;
      } else if (input.taskId) {
        // TaskGet, TaskUpdate
        info.detail = `#${input.taskId}${input.status ? ' → ' + input.status : ''}`;
      } else if (input.description && input.subagent_type) {
        // Task (launch agent)
        info.detail = `${input.subagent_type}: ${input.description}`;
      } else if (input.task_id) {
        // TaskOutput, TaskStop
        info.detail = `task: ${input.task_id}`;
      } else if (input.team_name) {
        // TeamCreate
        info.detail = input.team_name;
      } else if (input.skill) {
        // Skill
        info.detail = input.skill;
      }
    }

    return info;
  }

  return null;
});

// Single-line body text: prefer the AI summary, fall back to the tool detail
const bodyText = computed(() => {
  return props.event.summary || toolInfo.value?.detail || '';
});

const formatTime = (timestamp?: number) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleTimeString();
};

// Format model name for display (e.g., "claude-haiku-4-5-20251001" -> "haiku-4-5")
const formatModelName = (name: string | null | undefined): string => {
  if (!name) return '';

  // Extract model family and version
  const parts = name.split('-');
  if (parts.length >= 4) {
    return `${parts[1]}-${parts[2]}-${parts[3]}`;
  }
  return name;
};

const copyPayload = async () => {
  try {
    await navigator.clipboard.writeText(formattedPayload.value);
    copyButtonText.value = 'Copied!';
    setTimeout(() => {
      copyButtonText.value = 'Copy';
    }, 2000);
  } catch (err) {
    console.error('Failed to copy:', err);
    copyButtonText.value = 'Failed';
    setTimeout(() => {
      copyButtonText.value = 'Copy';
    }, 2000);
  }
};

// HITL display helpers
const hitlTypeLabel = computed(() => {
  if (!props.event.humanInTheLoop) return '';
  const labelMap = {
    question: 'Agent Question',
    permission: 'Permission Request',
    choice: 'Choice Required'
  };
  return labelMap[props.event.humanInTheLoop.type] || 'Question';
});

const permissionType = computed(() => {
  return props.event.payload?.permission_type || null;
});

const isResponded = computed(() => {
  return hasSubmittedResponse.value || props.event.humanInTheLoopStatus?.status === 'responded';
});

const responseShown = computed(() => {
  return !!(localResponse.value || (props.event.humanInTheLoopStatus?.status === 'responded' && props.event.humanInTheLoopStatus.response));
});

const responseSummary = computed(() => {
  const r = localResponse.value || props.event.humanInTheLoopStatus?.response;
  if (!r) return '';
  if (r.response) return r.response;
  if (r.permission !== undefined) return r.permission ? 'Approved' : 'Denied';
  if (r.choice) return r.choice;
  return 'Responded';
});

// Methods for HITL responses
const submitResponse = async () => {
  if (!responseText.value.trim() || !props.event.id) return;

  const response: HumanInTheLoopResponse = {
    response: responseText.value.trim(),
    hookEvent: props.event,
    respondedAt: Date.now()
  };

  // Optimistic UI: Show response immediately
  localResponse.value = response;
  hasSubmittedResponse.value = true;
  const savedText = responseText.value;
  responseText.value = '';
  isSubmitting.value = true;

  try {
    const res = await fetch(`${API_BASE_URL}/events/${props.event.id}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(response)
    });

    if (!res.ok) throw new Error('Failed to submit response');

    emit('response-submitted', response);
  } catch (error) {
    console.error('Error submitting response:', error);
    // Rollback optimistic update
    localResponse.value = null;
    hasSubmittedResponse.value = false;
    responseText.value = savedText;
    alert('Failed to submit response. Please try again.');
  } finally {
    isSubmitting.value = false;
  }
};

const submitPermission = async (approved: boolean) => {
  if (!props.event.id) return;

  const response: HumanInTheLoopResponse = {
    permission: approved,
    hookEvent: props.event,
    respondedAt: Date.now()
  };

  // Optimistic UI: Show response immediately
  localResponse.value = response;
  hasSubmittedResponse.value = true;
  isSubmitting.value = true;

  try {
    const res = await fetch(`${API_BASE_URL}/events/${props.event.id}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(response)
    });

    if (!res.ok) throw new Error('Failed to submit permission');

    emit('response-submitted', response);
  } catch (error) {
    console.error('Error submitting permission:', error);
    // Rollback optimistic update
    localResponse.value = null;
    hasSubmittedResponse.value = false;
    alert('Failed to submit permission. Please try again.');
  } finally {
    isSubmitting.value = false;
  }
};

const submitChoice = async (choice: string) => {
  if (!props.event.id) return;

  const response: HumanInTheLoopResponse = {
    choice,
    hookEvent: props.event,
    respondedAt: Date.now()
  };

  // Optimistic UI: Show response immediately
  localResponse.value = response;
  hasSubmittedResponse.value = true;
  isSubmitting.value = true;

  try {
    const res = await fetch(`${API_BASE_URL}/events/${props.event.id}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(response)
    });

    if (!res.ok) throw new Error('Failed to submit choice');

    emit('response-submitted', response);
  } catch (error) {
    console.error('Error submitting choice:', error);
    // Rollback optimistic update
    localResponse.value = null;
    hasSubmittedResponse.value = false;
    alert('Failed to submit choice. Please try again.');
  } finally {
    isSubmitting.value = false;
  }
};
</script>

<style scoped>
.evt-wrap { display: block; }

/* ───────── row ───────── */
.row {
  position: relative;
  display: grid;
  grid-template-columns: 18px minmax(120px, 196px) 92px 1fr auto;
  align-items: center;
  column-gap: 10px;
  min-height: var(--row-h);
  padding: var(--row-pad-y) 14px var(--row-pad-y) 18px;
  border-bottom: 1px solid var(--hair-faint);
  cursor: pointer;
  font-size: var(--text-body);
  transition: background var(--motion-fast) var(--ease-out);
}
.row:hover { background: var(--surface-hover); }
.row.is-expanded { background: var(--surface-hover); }

.spine { position: absolute; left: 0; top: 0; bottom: 0; width: 2px; background: var(--row-c, var(--theme-primary)); }

.ico { color: var(--text-muted); display: inline-flex; }
.row:hover .ico, .row.is-expanded .ico { color: var(--text-base); }

.aid { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--text-sm); }
.aid .app { color: var(--text-strong); font-weight: var(--weight-medium); }
.aid .sid { color: var(--text-faint); }

.etype { color: var(--text-muted); font-size: var(--text-xs); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.body { display: flex; align-items: center; gap: 8px; min-width: 0; overflow: hidden; }
.body .body-arrow { color: var(--text-ghost); flex: none; }
.detail { color: var(--text-base); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.chip {
  display: inline-flex; align-items: center; flex: none;
  padding: 1px 7px; border: 1px solid var(--hair); border-radius: var(--radius-xs);
  font-size: var(--text-2xs); font-weight: var(--weight-medium); color: var(--text-muted);
  background: var(--surface);
}
.chip-model { color: var(--text-faint); border-style: dashed; }
.chip-hitl { color: var(--theme-accent-warning); border-color: color-mix(in srgb, var(--theme-accent-warning) 45%, transparent); background: color-mix(in srgb, var(--theme-accent-warning) 10%, transparent); }

.ts { color: var(--text-faint); font-size: var(--text-xs); text-align: right; white-space: nowrap; }

/* ───────── expanded ───────── */
.expand { grid-column: 1 / -1; padding: 4px 0 12px; cursor: default; }
.payload-card {
  background: var(--surface-raised);
  border: 1px solid var(--hair);
  border-radius: var(--radius-md);
  box-shadow: var(--elevation-2);
  overflow: hidden;
}
.payload-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 12px; border-bottom: 1px solid var(--hair-faint);
}
.payload-title { font-size: var(--text-2xs); font-weight: var(--weight-semibold); letter-spacing: var(--tracking-caps); text-transform: uppercase; color: var(--text-faint); display: flex; gap: 8px; align-items: center; }
.payload-title .muted { color: var(--text-ghost); text-transform: none; letter-spacing: 0; font-weight: var(--weight-regular); }
.copybtn {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 3px 8px; border: 1px solid var(--hair); border-radius: var(--radius-sm);
  background: transparent; color: var(--text-muted); cursor: pointer;
  font-family: var(--font-sans); font-size: var(--text-2xs); font-weight: var(--weight-medium);
  transition: color var(--motion-fast), border-color var(--motion-fast);
}
.copybtn:hover { color: var(--text-strong); border-color: var(--hair-strong); }
.payload-body {
  margin: 0; padding: 12px; max-height: 280px; overflow: auto;
  font-size: var(--text-sm); line-height: 1.6; color: var(--text-base);
  white-space: pre; tab-size: 2;
}

.chat-row { display: flex; justify-content: flex-end; margin-top: 8px; }
.chatbtn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 5px 11px; border: 1px solid var(--hair); border-radius: var(--radius-sm);
  background: transparent; color: var(--text-muted); cursor: pointer;
  font-family: var(--font-sans); font-size: var(--text-xs); font-weight: var(--weight-medium);
  transition: color var(--motion-fast), border-color var(--motion-fast);
}
.chatbtn:hover:not(:disabled) { color: var(--theme-primary); border-color: var(--primary-line); }
.chatbtn:disabled { opacity: 0.45; cursor: not-allowed; }

/* ───────── HITL ───────── */
.row-hitl { cursor: default; align-items: start; padding-top: 9px; padding-bottom: 9px; }
.row-hitl .ico { color: var(--theme-accent-warning); margin-top: 1px; }
.row-hitl.is-responded .ico { color: var(--theme-accent-success); }
.row-hitl.is-pending { background: color-mix(in srgb, var(--theme-accent-warning) 5%, transparent); }
.row-hitl .aid, .row-hitl .etype, .row-hitl .body, .row-hitl .ts { margin-top: 1px; }

.hitl-controls { grid-column: 3 / -1; margin-top: 9px; }
.hitl-actions { display: flex; gap: 8px; justify-content: flex-end; }
.hitl-q { display: flex; gap: 8px; align-items: flex-end; }
.hitl-q textarea {
  flex: 1; resize: vertical; min-height: 38px;
  padding: 8px 10px; border: 1px solid var(--hair); border-radius: var(--radius-sm);
  background: var(--surface); color: var(--text-strong);
  font-family: var(--font-sans); font-size: var(--text-sm);
}
.hitl-q textarea:focus { outline: none; border-color: var(--theme-accent-warning); }
.btn {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 6px 13px; border: 1px solid var(--hair); border-radius: var(--radius-sm);
  background: transparent; color: var(--text-muted); cursor: pointer;
  font-family: var(--font-sans); font-size: var(--text-xs); font-weight: var(--weight-semibold);
  transition: color var(--motion-fast), border-color var(--motion-fast), background var(--motion-fast);
}
.btn:disabled { opacity: 0.45; cursor: not-allowed; }
.btn-approve:hover:not(:disabled) { color: var(--theme-accent-success); border-color: color-mix(in srgb, var(--theme-accent-success) 55%, transparent); background: color-mix(in srgb, var(--theme-accent-success) 10%, transparent); }
.btn-deny:hover:not(:disabled) { color: var(--theme-accent-error); border-color: color-mix(in srgb, var(--theme-accent-error) 55%, transparent); background: color-mix(in srgb, var(--theme-accent-error) 10%, transparent); }
.btn-choice:hover:not(:disabled) { color: var(--theme-primary); border-color: var(--primary-line); background: var(--primary-soft); }
.hitl-resp {
  display: flex; align-items: center; gap: 7px;
  color: var(--theme-accent-success); font-size: var(--text-sm); font-weight: var(--weight-medium);
}

@media (max-width: 699px) {
  .row { grid-template-columns: 16px minmax(0, 1fr) auto; column-gap: 8px; }
  .etype { display: none; }
  .chip-model { display: none; }
}
</style>
