<template>
  <div>
    <!-- HITL block -->
    <div
      v-if="event.humanInTheLoop && (event.humanInTheLoopStatus?.status === 'pending' || hasSubmittedResponse)"
      class="hitl-card"
      :class="hitlResolved ? 'is-responded' : 'is-pending'"
      @click.stop
    >
      <div class="hitl-card__head">
        <span class="hitl-card__kind">{{ hitlTypeLabel }}</span>
        <span v-if="permissionType" class="hitl-card__perm">{{ permissionType }}</span>
        <span v-if="!hitlResolved" class="hitl-card__status">Awaiting response</span>
        <span v-else class="hitl-card__status is-ok">Responded</span>
      </div>

      <div class="hitl-card__meta">
        <span class="hitl-card__app" :style="{ color: appHexColor }">{{ event.source_app }}</span>
        <span class="meta-sep">·</span>
        <span class="hitl-card__sess">{{ sessionIdShort }}</span>
        <span class="meta-sep">·</span>
        <span>{{ formatTime(event.timestamp) }}</span>
      </div>

      <p class="hitl-card__q">{{ event.humanInTheLoop.question }}</p>

      <!-- Inline response display -->
      <div
        v-if="localResponse || (event.humanInTheLoopStatus?.status === 'responded' && event.humanInTheLoopStatus.response)"
        class="hitl-card__response"
      >
        <span class="hitl-card__response-label">Response</span>
        <div v-if="(localResponse?.response || event.humanInTheLoopStatus?.response?.response)" class="hitl-card__response-body">
          {{ localResponse?.response || event.humanInTheLoopStatus?.response?.response }}
        </div>
        <div v-if="(localResponse?.permission !== undefined || event.humanInTheLoopStatus?.response?.permission !== undefined)" class="hitl-card__response-body">
          {{ (localResponse?.permission ?? event.humanInTheLoopStatus?.response?.permission) ? 'Approved' : 'Denied' }}
        </div>
        <div v-if="(localResponse?.choice || event.humanInTheLoopStatus?.response?.choice)" class="hitl-card__response-body">
          {{ localResponse?.choice || event.humanInTheLoopStatus?.response?.choice }}
        </div>
      </div>

      <!-- Question -->
      <div v-if="event.humanInTheLoop.type === 'question'" class="hitl-card__form">
        <textarea
          v-model="responseText"
          class="hitl-card__textarea"
          rows="3"
          placeholder="Type your response…"
          @click.stop
        ></textarea>
        <div class="hitl-card__actions">
          <button
            @click.stop="submitResponse"
            :disabled="!responseText.trim() || isSubmitting || hasSubmittedResponse"
            class="btn btn--primary"
          >{{ isSubmitting ? 'Sending…' : 'Submit' }}</button>
        </div>
      </div>

      <!-- Permission -->
      <div v-else-if="event.humanInTheLoop.type === 'permission'" class="hitl-card__actions">
        <button
          @click.stop="submitPermission(false)"
          :disabled="isSubmitting || hasSubmittedResponse"
          class="btn btn--danger"
        >{{ isSubmitting ? '…' : 'Deny' }}</button>
        <button
          @click.stop="submitPermission(true)"
          :disabled="isSubmitting || hasSubmittedResponse"
          class="btn btn--primary"
        >{{ isSubmitting ? '…' : 'Approve' }}</button>
      </div>

      <!-- Choice -->
      <div v-else-if="event.humanInTheLoop.type === 'choice'" class="hitl-card__actions">
        <button
          v-for="choice in event.humanInTheLoop.choices"
          :key="choice"
          @click.stop="submitChoice(choice)"
          :disabled="isSubmitting || hasSubmittedResponse"
          class="btn btn--primary"
        >{{ isSubmitting ? '…' : choice }}</button>
      </div>
    </div>

    <!-- Standard event card -->
    <div
      v-if="!event.humanInTheLoop"
      class="evt-card"
      :class="{ 'is-expanded': isExpanded }"
      @click="toggleExpanded"
    >
      <span class="evt-card__app-stripe" :style="{ background: appHexColor }"></span>
      <span class="evt-card__sess-stripe" :class="gradientClass"></span>

      <div class="evt-card__body">
        <!-- Line 1: tag, tool, app·session·model, time -->
        <div class="evt-card__top">
          <span class="evt-tag" :class="`evt-tag--${tone}`">{{ hookLabel }}</span>
          <span v-if="toolName" class="evt-tool">{{ toolName }}</span>
          <span class="evt-id-app" :style="{ color: appHexColor }">{{ event.source_app }}</span>
          <span class="meta-sep">·</span>
          <span class="evt-id-session">{{ sessionIdShort }}</span>
          <template v-if="event.model_name">
            <span class="meta-sep">·</span>
            <span class="evt-id-model">{{ formatModelName(event.model_name) }}</span>
          </template>
          <span class="evt-card__spacer"></span>
          <span class="evt-time">{{ formatTime(event.timestamp) }}</span>
        </div>

        <!-- Line 2: tool detail OR summary, truncated -->
        <div v-if="lineTwo" class="evt-card__detail">
          <span v-if="lineTwo.label" class="evt-detail-label">{{ lineTwo.label }}</span>
          <span class="evt-detail-text">{{ lineTwo.text }}</span>
        </div>

        <!-- Expanded -->
        <div v-if="isExpanded" class="evt-card__expanded">
          <div class="evt-payload-head">
            <span class="evt-payload-title">Payload</span>
            <button @click.stop="copyPayload" class="btn btn--ghost btn--sm">{{ copyButtonText }}</button>
          </div>
          <pre class="evt-payload-pre">{{ formattedPayload }}</pre>

          <div v-if="event.chat && event.chat.length > 0" class="evt-card__chat">
            <button
              @click.stop="!isMobile && (showChatModal = true)"
              :disabled="isMobile"
              class="btn btn--ghost"
            >
              {{ isMobile ? 'Transcript not available on mobile' : `View transcript · ${event.chat.length} messages` }}
            </button>
          </div>
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
import { useEventEmojis } from '../composables/useEventEmojis';
import ChatTranscriptModal from './ChatTranscriptModal.vue';
import { API_BASE_URL } from '../config';

const { getLabelForEventType, getToneForEventType } = useEventEmojis();

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

const isExpanded = ref(false);
const showChatModal = ref(false);
const copyButtonText = ref('Copy');

const responseText = ref('');
const isSubmitting = ref(false);
const hasSubmittedResponse = ref(false);
const localResponse = ref<HumanInTheLoopResponse | null>(null);

const { isMobile } = useMediaQuery();

const toggleExpanded = () => { isExpanded.value = !isExpanded.value; };

const sessionIdShort = computed(() => props.event.session_id.slice(0, 8));

const hookLabel = computed(() => getLabelForEventType(props.event.hook_event_type));
const tone = computed(() => getToneForEventType(props.event.hook_event_type));

const formattedPayload = computed(() => JSON.stringify(props.event.payload, null, 2));

const toolName = computed(() => {
  const eventType = props.event.hook_event_type;
  const toolEvents = ['PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PermissionRequest'];
  if (toolEvents.includes(eventType) && props.event.payload?.tool_name) {
    return props.event.payload.tool_name;
  }
  return null;
});

const lineTwo = computed<{ label?: string; text: string } | null>(() => {
  if (props.event.summary) return { label: '', text: props.event.summary };
  const info = toolInfo.value;
  if (info && info.detail) return { label: info.tool, text: info.detail };
  if (info) return { label: '', text: info.tool };
  return null;
});

const toolInfo = computed(() => {
  const payload = props.event.payload;

  if (props.event.hook_event_type === 'UserPromptSubmit' && payload.prompt) {
    return {
      tool: 'Prompt',
      detail: `"${payload.prompt.slice(0, 100)}${payload.prompt.length > 100 ? '…' : ''}"`,
    };
  }

  if (props.event.hook_event_type === 'PreCompact') {
    const trigger = payload.trigger || 'unknown';
    return {
      tool: 'Compaction',
      detail: trigger === 'manual' ? 'Manual' : 'Auto (full context)',
    };
  }

  if (props.event.hook_event_type === 'SessionStart') {
    const source = payload.source || 'unknown';
    const sourceLabels: Record<string, string> = {
      startup: 'New session',
      resume: 'Resuming session',
      clear: 'Fresh session',
    };
    return { tool: 'Session', detail: sourceLabels[source] || source };
  }

  if (payload.tool_name) {
    const info: { tool: string; detail?: string } = { tool: payload.tool_name };
    if (payload.tool_input) {
      const input = payload.tool_input;
      if (input.command) info.detail = input.command.slice(0, 80) + (input.command.length > 80 ? '…' : '');
      else if (input.file_path) info.detail = input.file_path.split('/').pop();
      else if (input.pattern) info.detail = input.pattern;
      else if (input.url) info.detail = input.url.slice(0, 80) + (input.url.length > 80 ? '…' : '');
      else if (input.query) info.detail = `"${input.query.slice(0, 60)}${input.query.length > 60 ? '…' : ''}"`;
      else if (input.notebook_path) info.detail = input.notebook_path.split('/').pop();
      else if (input.recipient) info.detail = `→ ${input.recipient}${input.summary ? ': ' + input.summary : ''}`;
      else if (input.subject) info.detail = input.subject;
      else if (input.taskId) info.detail = `#${input.taskId}${input.status ? ' → ' + input.status : ''}`;
      else if (input.description && input.subagent_type) info.detail = `${input.subagent_type}: ${input.description}`;
      else if (input.task_id) info.detail = `task: ${input.task_id}`;
      else if (input.team_name) info.detail = input.team_name;
      else if (input.skill) info.detail = input.skill;
    }
    return info;
  }

  return null;
});

const formatTime = (timestamp?: number) => {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleTimeString();
};

const formatModelName = (name: string | null | undefined): string => {
  if (!name) return '';
  const parts = name.split('-');
  if (parts.length >= 4) return `${parts[1]}-${parts[2]}-${parts[3]}`;
  return name;
};

const copyPayload = async () => {
  try {
    await navigator.clipboard.writeText(formattedPayload.value);
    copyButtonText.value = 'Copied';
    setTimeout(() => { copyButtonText.value = 'Copy'; }, 1500);
  } catch (err) {
    console.error('Failed to copy:', err);
    copyButtonText.value = 'Failed';
    setTimeout(() => { copyButtonText.value = 'Copy'; }, 1500);
  }
};

// HITL
const hitlResolved = computed(() =>
  hasSubmittedResponse.value || props.event.humanInTheLoopStatus?.status === 'responded'
);

const hitlTypeLabel = computed(() => {
  if (!props.event.humanInTheLoop) return '';
  const labelMap = {
    question: 'Question',
    permission: 'Permission',
    choice: 'Choice',
  };
  return labelMap[props.event.humanInTheLoop.type] || 'Question';
});

const permissionType = computed(() => props.event.payload?.permission_type || null);

const submitResponse = async () => {
  if (!responseText.value.trim() || !props.event.id) return;
  const response: HumanInTheLoopResponse = {
    response: responseText.value.trim(),
    hookEvent: props.event,
    respondedAt: Date.now(),
  };
  localResponse.value = response;
  hasSubmittedResponse.value = true;
  const savedText = responseText.value;
  responseText.value = '';
  isSubmitting.value = true;
  try {
    const res = await fetch(`${API_BASE_URL}/events/${props.event.id}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(response),
    });
    if (!res.ok) throw new Error('Failed to submit response');
    emit('response-submitted', response);
  } catch (error) {
    console.error('Error submitting response:', error);
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
    respondedAt: Date.now(),
  };
  localResponse.value = response;
  hasSubmittedResponse.value = true;
  isSubmitting.value = true;
  try {
    const res = await fetch(`${API_BASE_URL}/events/${props.event.id}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(response),
    });
    if (!res.ok) throw new Error('Failed to submit permission');
    emit('response-submitted', response);
  } catch (error) {
    console.error('Error submitting permission:', error);
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
    respondedAt: Date.now(),
  };
  localResponse.value = response;
  hasSubmittedResponse.value = true;
  isSubmitting.value = true;
  try {
    const res = await fetch(`${API_BASE_URL}/events/${props.event.id}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(response),
    });
    if (!res.ok) throw new Error('Failed to submit choice');
    emit('response-submitted', response);
  } catch (error) {
    console.error('Error submitting choice:', error);
    localResponse.value = null;
    hasSubmittedResponse.value = false;
    alert('Failed to submit choice. Please try again.');
  } finally {
    isSubmitting.value = false;
  }
};
</script>

<style scoped>
/* Apple-minimal event card */
.evt-card {
  position: relative;
  display: flex;
  padding: 5px 10px 5px 14px;
  background: var(--theme-bg-primary);
  border: 1px solid var(--theme-border-primary);
  border-radius: 7px;
  cursor: pointer;
  transition: border-color 0.12s ease, background-color 0.12s ease;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif;
}
.evt-card:hover { border-color: var(--theme-border-secondary); }
.evt-card.is-expanded {
  border-color: var(--theme-primary);
  background: var(--theme-bg-secondary);
}

.evt-card__app-stripe {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  border-radius: 7px 0 0 7px;
}
.evt-card__sess-stripe {
  position: absolute;
  left: 2px;
  top: 0;
  bottom: 0;
  width: 1px;
  opacity: 0.55;
}

.evt-card__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-left: 4px;
  min-width: 0;
}

.evt-card__top {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: nowrap;
  overflow: hidden;
}
.evt-card__spacer { flex: 1 1 auto; }

.evt-tag {
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 7px;
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: -0.005em;
  border-radius: 4px;
  background: var(--theme-bg-tertiary);
  color: var(--theme-text-secondary);
  border: 1px solid var(--theme-border-primary);
  white-space: nowrap;
  flex: none;
}
.evt-tag--success { color: var(--theme-accent-success); border-color: rgba(48, 209, 88, 0.35); background: rgba(48, 209, 88, 0.10); }
.evt-tag--error   { color: var(--theme-accent-error);   border-color: rgba(255, 69, 58, 0.40); background: rgba(255, 69, 58, 0.10); }
.evt-tag--warning { color: var(--theme-accent-warning); border-color: rgba(255, 214, 10, 0.40); background: rgba(255, 214, 10, 0.10); }
.evt-tag--info    { color: var(--theme-primary);        border-color: rgba(10, 132, 255, 0.40); background: var(--theme-primary-light); }

.evt-tool {
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 6px;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  font-size: 10.5px;
  font-weight: 400;
  color: var(--theme-text-primary);
  background: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border-primary);
  border-radius: 4px;
  flex: none;
}

.evt-time {
  font-size: 10.5px;
  color: var(--theme-text-tertiary);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.003em;
  white-space: nowrap;
  flex: none;
}

.evt-id-app {
  font-size: 11px;
  font-weight: 500;
  letter-spacing: -0.005em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 160px;
}
.evt-id-session,
.evt-id-model {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  font-size: 10.5px;
  color: var(--theme-text-tertiary);
  font-weight: 400;
  white-space: nowrap;
}
.meta-sep { color: var(--theme-text-quaternary); font-size: 10.5px; }

.evt-card__detail {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 11.5px;
  color: var(--theme-text-secondary);
  min-width: 0;
  overflow: hidden;
}
.evt-detail-label {
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--theme-text-tertiary);
  white-space: nowrap;
  flex: none;
}
.evt-detail-text {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  font-size: 11.5px;
  font-weight: 400;
  color: var(--theme-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  flex: 1;
}

.evt-card__expanded {
  margin-top: 6px;
  padding-top: 8px;
  border-top: 1px solid var(--theme-border-primary);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.evt-payload-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.evt-payload-title {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--theme-text-tertiary);
}
.evt-payload-pre {
  margin: 0;
  padding: 10px 12px;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--theme-text-primary);
  background: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border-primary);
  border-radius: 6px;
  max-height: 320px;
  overflow: auto;
}
.evt-card__chat { display: flex; justify-content: flex-end; }

/* Buttons */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  border-radius: 6px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: background-color 0.12s ease, border-color 0.12s ease, color 0.12s ease;
  user-select: none;
}
.btn--sm { padding: 3px 8px; font-size: 11px; }
.btn--primary {
  background: var(--theme-primary);
  color: #fff;
  border-color: var(--theme-primary);
}
.btn--primary:hover:not(:disabled) { background: var(--theme-primary-hover); border-color: var(--theme-primary-hover); }
.btn--primary:disabled { opacity: 0.4; cursor: not-allowed; }
.btn--danger {
  background: var(--theme-accent-error);
  color: #fff;
  border-color: var(--theme-accent-error);
}
.btn--danger:hover:not(:disabled) { filter: brightness(1.05); }
.btn--danger:disabled { opacity: 0.4; cursor: not-allowed; }
.btn--ghost {
  background: var(--theme-bg-secondary);
  color: var(--theme-text-secondary);
  border-color: var(--theme-border-primary);
}
.btn--ghost:hover:not(:disabled) {
  background: var(--theme-bg-tertiary);
  color: var(--theme-text-primary);
}
.btn--ghost:disabled { opacity: 0.5; cursor: not-allowed; }

/* HITL card */
.hitl-card {
  margin-bottom: 12px;
  padding: 14px 16px;
  border-radius: 10px;
  background: var(--theme-bg-primary);
  border: 1px solid var(--theme-border-primary);
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.hitl-card.is-pending {
  border-color: rgba(255, 214, 10, 0.45);
  background: rgba(255, 214, 10, 0.04);
}
.hitl-card.is-responded {
  border-color: rgba(48, 209, 88, 0.45);
  background: rgba(48, 209, 88, 0.04);
}

.hitl-card__head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.hitl-card__kind {
  font-size: 13px;
  font-weight: 600;
  color: var(--theme-text-primary);
}
.hitl-card__perm {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  font-size: 11px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--theme-primary-light);
  color: var(--theme-primary);
  border: 1px solid rgba(10, 132, 255, 0.30);
}
.hitl-card__status {
  margin-left: auto;
  font-size: 11px;
  color: var(--theme-accent-warning);
  letter-spacing: 0.01em;
}
.hitl-card__status.is-ok {
  color: var(--theme-accent-success);
}

.hitl-card__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--theme-text-tertiary);
  flex-wrap: wrap;
}
.hitl-card__app { font-weight: 600; }
.hitl-card__sess { font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace; }

.hitl-card__q {
  margin: 0;
  padding: 10px 12px;
  font-size: 13px;
  color: var(--theme-text-primary);
  background: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border-primary);
  border-radius: 8px;
  line-height: 1.4;
}

.hitl-card__response {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  background: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border-primary);
  border-radius: 8px;
}
.hitl-card__response-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--theme-text-tertiary);
}
.hitl-card__response-body {
  font-size: 12px;
  color: var(--theme-text-primary);
  line-height: 1.4;
}

.hitl-card__form { display: flex; flex-direction: column; gap: 8px; }
.hitl-card__textarea {
  width: 100%;
  padding: 10px 12px;
  font-family: inherit;
  font-size: 12px;
  color: var(--theme-text-primary);
  background: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border-primary);
  border-radius: 8px;
  resize: vertical;
  outline: none;
}
.hitl-card__textarea:focus {
  border-color: var(--theme-primary);
  box-shadow: 0 0 0 3px var(--theme-primary-light);
}

.hitl-card__actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
}
</style>
