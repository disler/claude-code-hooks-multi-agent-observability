<template>
  <div>
    <!-- HITL Question Section (NEW) -->
    <div
      v-if="event.humanInTheLoop && (event.humanInTheLoopStatus?.status === 'pending' || hasSubmittedResponse)"
      class="mb-4 p-4 rounded-lg border-2 shadow-lg"
      :class="hasSubmittedResponse || event.humanInTheLoopStatus?.status === 'responded' ? 'border-green-500 bg-gradient-to-r from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20' : 'border-yellow-500 bg-gradient-to-r from-yellow-50 to-yellow-100 dark:from-yellow-900/20 dark:to-yellow-800/20 animate-pulse-slow'"
      @click.stop
    >
      <!-- Question Header -->
      <div class="mb-3">
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center space-x-2">
            <span class="text-2xl">{{ hitlTypeEmoji }}</span>
            <h3 class="text-lg font-bold" :class="hasSubmittedResponse || event.humanInTheLoopStatus?.status === 'responded' ? 'text-green-900 dark:text-green-100' : 'text-yellow-900 dark:text-yellow-100'">
              {{ hitlTypeLabel }}
            </h3>
            <span v-if="permissionType" class="text-xs font-mono font-semibold px-2 py-1 rounded border-2 bg-blue-50 dark:bg-blue-900/20 border-blue-500 text-blue-900 dark:text-blue-100">
              {{ permissionType }}
            </span>
          </div>
          <span v-if="!hasSubmittedResponse && event.humanInTheLoopStatus?.status !== 'responded'" class="text-xs font-semibold text-yellow-700 dark:text-yellow-300">
            ⏱️ Waiting for response...
          </span>
        </div>
        <div class="flex items-center space-x-2 ml-9">
          <span
            class="text-xs font-semibold text-[var(--theme-text-primary)] px-1.5 py-0.5 rounded-full border-2 bg-[var(--theme-bg-tertiary)] shadow-sm"
            :style="{ ...appBgStyle, ...appBorderStyle }"
          >
            {{ event.source_app }}
          </span>
          <span class="text-xs text-[var(--theme-text-secondary)] px-1.5 py-0.5 rounded-full border bg-[var(--theme-bg-tertiary)]/50 shadow-sm" :class="borderColorClass">
            {{ sessionIdShort }}
          </span>
          <span class="text-xs text-[var(--theme-text-tertiary)] font-medium">
            {{ formatTime(event.timestamp) }}
          </span>
        </div>
      </div>

      <!-- Question Text -->
      <div class="mb-4 p-3 bg-white dark:bg-gray-800 rounded-lg border" :class="hasSubmittedResponse || event.humanInTheLoopStatus?.status === 'responded' ? 'border-green-300' : 'border-yellow-300'">
        <p class="text-base font-medium text-gray-900 dark:text-gray-100">
          {{ event.humanInTheLoop.question }}
        </p>
      </div>

      <!-- Inline Response Display (Optimistic UI) -->
      <div v-if="localResponse || (event.humanInTheLoopStatus?.status === 'responded' && event.humanInTheLoopStatus.response)" class="mb-4 p-3 bg-white dark:bg-gray-800 rounded-lg border border-green-400">
        <div class="flex items-center mb-2">
          <span class="text-xl mr-2">✅</span>
          <strong class="text-green-900 dark:text-green-100">Your Response:</strong>
        </div>
        <div v-if="(localResponse?.response || event.humanInTheLoopStatus?.response?.response)" class="text-gray-900 dark:text-gray-100 ml-7">
          {{ localResponse?.response || event.humanInTheLoopStatus?.response?.response }}
        </div>
        <div v-if="(localResponse?.permission !== undefined || event.humanInTheLoopStatus?.response?.permission !== undefined)" class="text-gray-900 dark:text-gray-100 ml-7">
          {{ (localResponse?.permission ?? event.humanInTheLoopStatus?.response?.permission) ? 'Approved ✅' : 'Denied ❌' }}
        </div>
        <div v-if="(localResponse?.choice || event.humanInTheLoopStatus?.response?.choice)" class="text-gray-900 dark:text-gray-100 ml-7">
          {{ localResponse?.choice || event.humanInTheLoopStatus?.response?.choice }}
        </div>
      </div>

      <!-- Response UI -->
      <div v-if="event.humanInTheLoop.type === 'question'">
        <!-- Text Input for Questions -->
        <textarea
          v-model="responseText"
          class="w-full p-3 border-2 border-yellow-500 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent resize-none"
          rows="3"
          placeholder="Type your response here..."
          @click.stop
        ></textarea>
        <div class="flex justify-end space-x-2 mt-2">
          <button
            @click.stop="submitResponse"
            :disabled="!responseText.trim() || isSubmitting || hasSubmittedResponse"
            class="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-bold rounded-lg transition-all duration-200 shadow-md hover:shadow-lg transform hover:scale-105 disabled:transform-none disabled:cursor-not-allowed"
          >
            {{ isSubmitting ? '⏳ Sending...' : '✅ Submit Response' }}
          </button>
        </div>
      </div>

      <div v-else-if="event.humanInTheLoop.type === 'permission'">
        <!-- Yes/No Buttons for Permissions -->
        <div class="flex justify-end items-center space-x-3">
          <div v-if="hasSubmittedResponse || event.humanInTheLoopStatus?.status === 'responded'" class="flex items-center px-3 py-2 bg-green-100 dark:bg-green-900/30 rounded-lg border border-green-500">
            <span class="text-sm font-bold text-green-900 dark:text-green-100">Responded</span>
          </div>
          <button
            @click.stop="submitPermission(false)"
            :disabled="isSubmitting || hasSubmittedResponse"
            class="px-6 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition-all duration-200 shadow-md hover:shadow-lg transform hover:scale-105"
            :class="hasSubmittedResponse ? 'opacity-40 cursor-not-allowed' : ''"
          >
            {{ isSubmitting ? '⏳' : '❌ Deny' }}
          </button>
          <button
            @click.stop="submitPermission(true)"
            :disabled="isSubmitting || hasSubmittedResponse"
            class="px-6 py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg transition-all duration-200 shadow-md hover:shadow-lg transform hover:scale-105"
            :class="hasSubmittedResponse ? 'opacity-40 cursor-not-allowed' : ''"
          >
            {{ isSubmitting ? '⏳' : '✅ Approve' }}
          </button>
        </div>
      </div>

      <div v-else-if="event.humanInTheLoop.type === 'choice'">
        <!-- Multiple Choice Buttons -->
        <div class="flex flex-wrap gap-2 justify-end">
          <button
            v-for="choice in event.humanInTheLoop.choices"
            :key="choice"
            @click.stop="submitChoice(choice)"
            :disabled="isSubmitting || hasSubmittedResponse"
            class="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-bold rounded-lg transition-all duration-200 shadow-md hover:shadow-lg transform hover:scale-105 disabled:transform-none"
          >
            {{ isSubmitting ? '⏳' : choice }}
          </button>
        </div>
      </div>
    </div>

    <!-- Special card: SubagentStart -->
    <div
      v-if="!event.humanInTheLoop && isSubagentStart && subagentStartInfo"
      class="special-event-card subagent-start-card"
      @click="toggleExpanded"
    >
      <div class="special-card-indicator" style="background-color: #8B5CF6;"></div>
      <div class="special-card-content">
        <div class="special-card-row">
          <span class="special-card-icon">&#x1F7E2;</span>
          <span class="special-card-label">Spawned</span>
          <span class="special-card-app" :style="{ ...appBgStyle, ...appBorderStyle }">{{ subagentStartInfo.appName }}</span>
          <AgentTypeBadge :agent-type="subagentStartInfo.agentType" />
          <span v-if="subagentStartInfo.model" class="special-card-model">({{ formatModelName(subagentStartInfo.model) }})</span>
          <span class="special-card-time">{{ formatTime(event.timestamp) }}</span>
        </div>
      </div>
      <div v-if="isExpanded" class="mt-2 pt-2 border-t border-[var(--theme-border-primary)] bg-[var(--theme-bg-primary)] rounded-b-lg p-3">
        <pre class="text-sm text-[var(--theme-text-primary)] bg-[var(--theme-bg-tertiary)] p-3 rounded-lg overflow-x-auto max-h-64 overflow-y-auto font-mono border border-[var(--theme-border-primary)]">{{ formattedPayload }}</pre>
      </div>
    </div>

    <!-- Special card: SubagentStop -->
    <div
      v-if="!event.humanInTheLoop && isSubagentStop && subagentStopInfo"
      class="special-event-card subagent-stop-card"
      @click="toggleExpanded"
    >
      <div class="special-card-indicator" style="background-color: #6366F1;"></div>
      <div class="special-card-content">
        <div class="special-card-row">
          <span class="special-card-icon">&#x1F6D1;</span>
          <span class="special-card-label">Completed</span>
          <span class="special-card-app" :style="{ ...appBgStyle, ...appBorderStyle }">{{ subagentStopInfo.appName }}</span>
          <AgentTypeBadge :agent-type="subagentStopInfo.agentType" />
          <span v-if="subagentStopInfo.duration" class="special-card-duration">({{ subagentStopInfo.duration }})</span>
          <span class="special-card-time">{{ formatTime(event.timestamp) }}</span>
        </div>
      </div>
      <div v-if="isExpanded" class="mt-2 pt-2 border-t border-[var(--theme-border-primary)] bg-[var(--theme-bg-primary)] rounded-b-lg p-3">
        <pre class="text-sm text-[var(--theme-text-primary)] bg-[var(--theme-bg-tertiary)] p-3 rounded-lg overflow-x-auto max-h-64 overflow-y-auto font-mono border border-[var(--theme-border-primary)]">{{ formattedPayload }}</pre>
      </div>
    </div>

    <!-- Special card: SendMessage -->
    <div
      v-if="!event.humanInTheLoop && isSendMessage && sendMessageInfo"
      class="special-event-card send-message-card"
      @click="toggleExpanded"
    >
      <div class="special-card-indicator" style="background-color: #3B82F6;"></div>
      <div class="special-card-content">
        <div class="special-card-row">
          <span class="special-card-icon">&#x1F4AC;</span>
          <span class="special-card-app" :style="{ ...appBgStyle, ...appBorderStyle }">{{ event.source_app }}</span>
          <span class="send-message-arrow">&#x2192;</span>
          <span class="send-message-recipient">{{ sendMessageInfo.recipient }}</span>
          <span v-if="sendMessageInfo.summary" class="send-message-summary">{{ sendMessageInfo.summary }}</span>
          <span class="special-card-time">{{ formatTime(event.timestamp) }}</span>
        </div>
      </div>
      <div v-if="isExpanded" class="mt-2 pt-2 border-t border-[var(--theme-border-primary)] bg-[var(--theme-bg-primary)] rounded-b-lg p-3">
        <pre class="text-sm text-[var(--theme-text-primary)] bg-[var(--theme-bg-tertiary)] p-3 rounded-lg overflow-x-auto max-h-64 overflow-y-auto font-mono border border-[var(--theme-border-primary)]">{{ formattedPayload }}</pre>
      </div>
    </div>

    <!-- Special card: TeamCreate -->
    <div
      v-if="!event.humanInTheLoop && isTeamCreate && teamCreateInfo"
      class="special-event-card team-create-card"
      @click="toggleExpanded"
    >
      <div class="special-card-indicator" style="background-color: #F59E0B;"></div>
      <div class="special-card-content">
        <div class="special-card-row">
          <span class="special-card-icon">&#x1F465;</span>
          <span class="special-card-label">Team created</span>
          <span class="team-create-name">'{{ teamCreateInfo.teamName }}'</span>
          <span class="special-card-time">{{ formatTime(event.timestamp) }}</span>
        </div>
      </div>
      <div v-if="isExpanded" class="mt-2 pt-2 border-t border-[var(--theme-border-primary)] bg-[var(--theme-bg-primary)] rounded-b-lg p-3">
        <pre class="text-sm text-[var(--theme-text-primary)] bg-[var(--theme-bg-tertiary)] p-3 rounded-lg overflow-x-auto max-h-64 overflow-y-auto font-mono border border-[var(--theme-border-primary)]">{{ formattedPayload }}</pre>
      </div>
    </div>

    <!-- Original Event Row Content (skip if HITL with humanInTheLoop or special event) -->
    <!-- STUDIO LAYOUT -->
    <div
      v-if="!event.humanInTheLoop && !isSubagentStart && !isSubagentStop && !isSendMessage && !isTeamCreate && isStudio"
      class="studio-event-card"
      :class="{ 'ring-1 ring-[var(--theme-primary)] border-[var(--theme-primary)]': isExpanded }"
      @click="toggleExpanded"
    >
      <!-- Top row: indicator | app | session | type | tool | time -->
      <div class="studio-event-top">
        <div class="studio-event-indicator" :style="{ backgroundColor: appHexColor }"></div>
        <span class="studio-event-app" :style="{ ...appBgStyle, ...appBorderStyle, color: appHexColor }">{{ event.source_app }}</span>
        <span class="studio-event-session">{{ sessionIdShort }}</span>
        <span class="studio-event-type" :style="{ backgroundColor: eventTypeColor }">{{ event.hook_event_type }}</span>
        <span v-if="toolName" class="studio-event-tool">{{ toolName }}</span>
        <span class="studio-event-time">{{ formatTime(event.timestamp) }}</span>
      </div>
      <!-- Summary -->
      <div v-if="event.summary || (toolInfo && toolInfo.detail)" class="studio-event-summary">
        {{ event.summary || (toolInfo ? toolInfo.detail : '') }}
      </div>

      <!-- Expanded content (studio) -->
      <div v-if="isExpanded" class="mt-2 pt-2 border-t border-[var(--theme-border-primary)] bg-[var(--theme-bg-primary)] rounded-b-lg p-3 space-y-3">
        <div>
          <div class="flex items-center justify-between mb-2">
            <h4 class="text-base mobile:text-sm font-semibold text-[var(--theme-text-primary)]">Payload</h4>
            <button @click.stop="copyPayload" class="px-3 py-1 text-sm font-medium rounded-lg bg-[var(--theme-bg-tertiary)] hover:bg-[var(--theme-bg-quaternary)] text-[var(--theme-text-secondary)] transition-all duration-200 border border-[var(--theme-border-primary)]">
              <span>{{ copyButtonText }}</span>
            </button>
          </div>
          <pre class="text-sm text-[var(--theme-text-primary)] bg-[var(--theme-bg-tertiary)] p-3 rounded-lg overflow-x-auto max-h-64 overflow-y-auto font-mono border border-[var(--theme-border-primary)]">{{ formattedPayload }}</pre>
        </div>
        <div v-if="event.chat && event.chat.length > 0" class="flex justify-end">
          <button @click.stop="!isMobile && (showChatModal = true)" :class="isMobile ? 'bg-[var(--theme-bg-quaternary)] cursor-not-allowed opacity-50 text-[var(--theme-text-quaternary)]' : 'bg-[var(--theme-primary)] hover:bg-[var(--theme-primary-dark)] text-white'" class="px-4 py-2 font-semibold rounded-lg transition-all duration-200 border border-[var(--theme-border-primary)]" :disabled="isMobile">
            <span class="text-sm font-semibold">{{ isMobile ? 'Not available in mobile' : `View Chat Transcript (${event.chat.length} messages)` }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- DEFAULT LAYOUT -->
    <div
      v-if="!event.humanInTheLoop && !isSubagentStart && !isSubagentStop && !isSendMessage && !isTeamCreate && !isStudio"
      class="group relative p-4 mobile:p-2 rounded-[10px] transition-all duration-200 cursor-pointer border border-[var(--theme-border-primary)] hover:border-[var(--theme-border-secondary)] hover:shadow-sm bg-[var(--theme-bg-secondary)]"
      :class="{ 'ring-1 ring-[var(--theme-primary)] border-[var(--theme-primary)]': isExpanded }"
      @click="toggleExpanded"
    >
    <!-- App color indicator -->
    <div
      class="absolute left-0 top-0 bottom-0 w-3 rounded-l-lg"
      :style="{ backgroundColor: appHexColor }"
    ></div>

    <!-- Session color indicator -->
    <div
      class="absolute left-3 top-0 bottom-0 w-0.5"
      :class="gradientClass"
    ></div>

    <div class="ml-4">
      <!-- Desktop Layout: Original horizontal layout -->
      <div class="hidden mobile:block mb-2">
        <!-- Mobile: App + Time on first row -->
        <div class="flex items-center justify-between mb-1">
          <span
            class="text-xs font-semibold text-[var(--theme-text-primary)] px-1.5 py-0.5 rounded-full border bg-[var(--theme-bg-tertiary)]"
            :style="{ ...appBgStyle, ...appBorderStyle }"
          >
            {{ event.source_app }}
          </span>
          <span class="text-xs text-[var(--theme-text-tertiary)] font-medium">
            {{ formatTime(event.timestamp) }}
          </span>
        </div>

        <!-- Mobile: Session + Event Type on second row -->
        <div class="flex items-center space-x-2">
          <span class="text-xs text-[var(--theme-text-secondary)] px-1.5 py-0.5 rounded-full border bg-[var(--theme-bg-tertiary)]/50" :class="borderColorClass">
            {{ sessionIdShort }}
          </span>
          <span v-if="event.model_name" class="text-xs text-[var(--theme-text-secondary)] px-1.5 py-0.5 rounded-full border bg-[var(--theme-bg-tertiary)]/50" :title="`Model: ${event.model_name}`">
            {{ formatModelName(event.model_name) }}
          </span>
          <span class="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-bold bg-[var(--theme-primary)] text-white">
            <span class="mr-1 text-sm">{{ hookEmoji }}</span>
            {{ event.hook_event_type }}
          </span>
          <span v-if="toolName" class="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-semibold border border-[var(--theme-border-primary)] text-[var(--theme-text-secondary)] bg-[var(--theme-bg-tertiary)]">
            <span class="mr-0.5">{{ toolEmoji }}</span>{{ toolName }}
          </span>
        </div>
      </div>

      <!-- Desktop Layout: Original single row layout -->
      <div class="flex items-center justify-between mb-2 mobile:hidden">
        <div class="flex items-center space-x-4">
          <span
            class="text-base font-semibold text-[var(--theme-text-primary)] px-2 py-0.5 rounded-full border bg-[var(--theme-bg-tertiary)]"
            :style="{ ...appBgStyle, ...appBorderStyle }"
          >
            {{ event.source_app }}
          </span>
          <span class="text-sm text-[var(--theme-text-secondary)] px-2 py-0.5 rounded-full border bg-[var(--theme-bg-tertiary)]/50" :class="borderColorClass">
            {{ sessionIdShort }}
          </span>
          <span v-if="event.model_name" class="text-sm text-[var(--theme-text-secondary)] px-2 py-0.5 rounded-full border bg-[var(--theme-bg-tertiary)]/50" :title="`Model: ${event.model_name}`">
            {{ formatModelName(event.model_name) }}
          </span>
          <span class="inline-flex items-center px-3 py-0.5 rounded-full text-sm font-bold bg-[var(--theme-primary)] text-white">
            <span class="mr-1.5 text-base">{{ hookEmoji }}</span>
            {{ event.hook_event_type }}
          </span>
          <span v-if="toolName" class="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-semibold border border-[var(--theme-border-primary)] text-[var(--theme-text-secondary)] bg-[var(--theme-bg-tertiary)]">
            <span class="mr-1">{{ toolEmoji }}</span>{{ toolName }}
          </span>
        </div>
        <span class="text-sm text-[var(--theme-text-tertiary)] font-semibold">
          {{ formatTime(event.timestamp) }}
        </span>
      </div>

      <!-- Tool info and Summary - Desktop Layout -->
      <div class="flex items-center justify-between mb-2 mobile:hidden">
        <div v-if="toolInfo" class="text-base text-[var(--theme-text-secondary)] font-semibold">
          <span class="font-medium italic px-2 py-0.5 rounded border border-[var(--theme-border-primary)] bg-[var(--theme-bg-tertiary)]">{{ toolInfo.tool }}</span>
          <span v-if="toolInfo.detail" class="ml-2 text-[var(--theme-text-tertiary)]" :class="{ 'italic': event.hook_event_type === 'UserPromptSubmit' }">{{ toolInfo.detail }}</span>
        </div>

        <!-- Summary aligned to the right -->
        <div v-if="event.summary" class="max-w-[50%] border-l-2 border-[var(--theme-primary)] pl-3 py-1">
          <span class="text-sm text-[var(--theme-text-primary)] font-medium">
            {{ event.summary }}
          </span>
        </div>
      </div>

      <!-- Tool info and Summary - Mobile Layout -->
      <div class="space-y-2 hidden mobile:block mb-2">
        <div v-if="toolInfo" class="text-sm text-[var(--theme-text-secondary)] font-semibold w-full">
          <span class="font-medium italic px-1.5 py-0.5 rounded border border-[var(--theme-border-primary)] bg-[var(--theme-bg-tertiary)]">{{ toolInfo.tool }}</span>
          <span v-if="toolInfo.detail" class="ml-2 text-[var(--theme-text-tertiary)]" :class="{ 'italic': event.hook_event_type === 'UserPromptSubmit' }">{{ toolInfo.detail }}</span>
        </div>

        <div v-if="event.summary" class="w-full border-l-2 border-[var(--theme-primary)] pl-3 py-0.5">
          <span class="text-xs text-[var(--theme-text-primary)] font-medium">
            {{ event.summary }}
          </span>
        </div>
      </div>
      
      <!-- Expanded content -->
      <div v-if="isExpanded" class="mt-2 pt-2 border-t border-[var(--theme-border-primary)] bg-[var(--theme-bg-primary)] rounded-b-lg p-3 space-y-3">
        <!-- Payload -->
        <div>
          <div class="flex items-center justify-between mb-2">
            <h4 class="text-base mobile:text-sm font-semibold text-[var(--theme-text-primary)] flex items-center">
              Payload
            </h4>
            <button
              @click.stop="copyPayload"
              class="px-3 py-1 mobile:px-2 mobile:py-0.5 text-sm mobile:text-xs font-medium rounded-lg bg-[var(--theme-bg-tertiary)] hover:bg-[var(--theme-bg-quaternary)] text-[var(--theme-text-secondary)] transition-all duration-200 border border-[var(--theme-border-primary)] flex items-center space-x-1"
            >
              <span>{{ copyButtonText }}</span>
            </button>
          </div>
          <pre class="text-sm mobile:text-xs text-[var(--theme-text-primary)] bg-[var(--theme-bg-tertiary)] p-3 mobile:p-2 rounded-lg overflow-x-auto max-h-64 overflow-y-auto font-mono border border-[var(--theme-border-primary)]">{{ formattedPayload }}</pre>
        </div>

        <!-- Chat transcript button -->
        <div v-if="event.chat && event.chat.length > 0" class="flex justify-end">
          <button
            @click.stop="!isMobile && (showChatModal = true)"
            :class="[
              'px-4 py-2 mobile:px-3 mobile:py-1.5 font-semibold rounded-lg transition-all duration-200 flex items-center space-x-1.5',
              isMobile
                ? 'bg-[var(--theme-bg-quaternary)] cursor-not-allowed opacity-50 text-[var(--theme-text-quaternary)] border border-[var(--theme-border-tertiary)]'
                : 'bg-[var(--theme-primary)] hover:bg-[var(--theme-primary-dark)] text-white border border-[var(--theme-primary)]'
            ]"
            :disabled="isMobile"
          >
            <span class="text-sm mobile:text-xs font-semibold">
              {{ isMobile ? 'Not available in mobile' : `View Chat Transcript (${event.chat.length} messages)` }}
            </span>
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
import { useThemes } from '../composables/useThemes';
import ChatTranscriptModal from './ChatTranscriptModal.vue';
import AgentTypeBadge from './AgentTypeBadge.vue';
import { API_BASE_URL } from '../config';

const { getEmojiForToolName } = useEventEmojis();

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
const copyButtonText = ref('📋 Copy');

// New refs for HITL
const responseText = ref('');
const isSubmitting = ref(false);
const hasSubmittedResponse = ref(false);
const localResponse = ref<HumanInTheLoopResponse | null>(null); // Optimistic UI

// Media query for responsive design
const { isMobile } = useMediaQuery();

// Theme detection
const { state: themeState } = useThemes();
const isStudio = computed(() => themeState.value.currentTheme === 'studio');

// Event type color for studio theme type badges
const eventTypeColor = computed(() => {
  const colorMap: Record<string, string> = {
    'PreToolUse': '#f59e0b',
    'PostToolUse': '#22c55e',
    'PostToolUseFailure': '#ef4444',
    'PermissionRequest': '#8b5cf6',
    'Notification': '#3b82f6',
    'Stop': '#ef4444',
    'SubagentStart': '#8b5cf6',
    'SubagentStop': '#6366f1',
    'PreCompact': '#6b7280',
    'UserPromptSubmit': '#3b82f6',
    'SessionStart': '#22c55e',
    'SessionEnd': '#6b7280'
  };
  return colorMap[props.event.hook_event_type] || '#333333';
});

const toggleExpanded = () => {
  isExpanded.value = !isExpanded.value;
};

const sessionIdShort = computed(() => {
  return props.event.session_id.slice(0, 8);
});

const hookEmoji = computed(() => {
  const emojiMap: Record<string, string> = {
    'PreToolUse': '🔧',
    'PostToolUse': '✅',
    'PostToolUseFailure': '❌',
    'PermissionRequest': '🔐',
    'Notification': '🔔',
    'Stop': '🛑',
    'SubagentStart': '🟢',
    'SubagentStop': '👥',
    'PreCompact': '📦',
    'UserPromptSubmit': '💬',
    'SessionStart': '🚀',
    'SessionEnd': '🏁'
  };
  const baseEmoji = emojiMap[props.event.hook_event_type] || '❓';

  // For tool events, show combo: event emoji + tool emoji (e.g., 🔧💻)
  const toolEventTypes = ['PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PermissionRequest'];
  if (toolEventTypes.includes(props.event.hook_event_type) && props.event.payload?.tool_name) {
    return `${baseEmoji}${getEmojiForToolName(props.event.payload.tool_name)}`;
  }

  return baseEmoji;
});

const borderColorClass = computed(() => {
  // Convert bg-color-500 to border-color-500
  return props.colorClass.replace('bg-', 'border-');
});


const appBorderStyle = computed(() => {
  return {
    borderColor: props.appHexColor
  };
});

const appBgStyle = computed(() => {
  // Use the hex color with 20% opacity
  return {
    backgroundColor: props.appHexColor + '33' // Add 33 for 20% opacity in hex
  };
});

const formattedPayload = computed(() => {
  return JSON.stringify(props.event.payload, null, 2);
});

const toolName = computed(() => {
  const eventType = props.event.hook_event_type;
  const toolEvents = ['PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PermissionRequest'];
  if (toolEvents.includes(eventType) && props.event.payload?.tool_name) {
    return props.event.payload.tool_name;
  }
  return null;
});

const toolEmoji = computed(() => {
  if (!toolName.value) return '';
  return getEmojiForToolName(toolName.value);
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

// Special event detection
const isSubagentStart = computed(() => props.event.hook_event_type === 'SubagentStart');
const isSubagentStop = computed(() => props.event.hook_event_type === 'SubagentStop');

const subagentStartInfo = computed(() => {
  if (!isSubagentStart.value) return null;
  const payload = props.event.payload;
  return {
    agentType: payload.subagent_type || payload.agent_type || 'unknown',
    model: payload.model || props.event.model_name || null,
    appName: props.event.source_app,
  };
});

const subagentStopInfo = computed(() => {
  if (!isSubagentStop.value) return null;
  const payload = props.event.payload;
  const duration = payload.duration_ms || payload.duration || null;
  return {
    agentType: payload.subagent_type || payload.agent_type || 'unknown',
    appName: props.event.source_app,
    duration: duration ? formatDuration(duration) : null,
  };
});

// SendMessage detection (PreToolUse where tool_name is "SendMessage")
const isSendMessage = computed(() => {
  return props.event.hook_event_type === 'PreToolUse' && props.event.payload?.tool_name === 'SendMessage';
});

const sendMessageInfo = computed(() => {
  if (!isSendMessage.value) return null;
  const input = props.event.payload?.tool_input || {};
  return {
    recipient: input.recipient || 'unknown',
    summary: input.summary || input.content?.slice(0, 80) || '',
    type: input.type || 'message',
  };
});

// TeamCreate detection (PreToolUse where tool_name is "TeamCreate")
const isTeamCreate = computed(() => {
  return props.event.hook_event_type === 'PreToolUse' && props.event.payload?.tool_name === 'TeamCreate';
});

const teamCreateInfo = computed(() => {
  if (!isTeamCreate.value) return null;
  const input = props.event.payload?.tool_input || {};
  return {
    teamName: input.team_name || 'unnamed',
  };
});

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

const formatTime = (timestamp?: number) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleTimeString();
};

// Format model name for display (e.g., "claude-haiku-4-5-20251001" -> "haiku-4-5")
const formatModelName = (name: string | null | undefined): string => {
  if (!name) return '';

  // Extract model family and version
  // "claude-haiku-4-5-20251001" -> "haiku-4-5"
  // "claude-sonnet-4-5-20250929" -> "sonnet-4-5"
  const parts = name.split('-');
  if (parts.length >= 4) {
    return `${parts[1]}-${parts[2]}-${parts[3]}`;
  }
  return name;
};

const copyPayload = async () => {
  try {
    await navigator.clipboard.writeText(formattedPayload.value);
    copyButtonText.value = '✅ Copied!';
    setTimeout(() => {
      copyButtonText.value = '📋 Copy';
    }, 2000);
  } catch (err) {
    console.error('Failed to copy:', err);
    copyButtonText.value = '❌ Failed';
    setTimeout(() => {
      copyButtonText.value = '📋 Copy';
    }, 2000);
  }
};

// New computed properties for HITL
const hitlTypeEmoji = computed(() => {
  if (!props.event.humanInTheLoop) return '';
  const emojiMap = {
    question: '❓',
    permission: '🔐',
    choice: '🎯'
  };
  return emojiMap[props.event.humanInTheLoop.type] || '❓';
});

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
@keyframes pulse-slow {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.95;
  }
}

.animate-pulse-slow {
  animation: pulse-slow 2s ease-in-out infinite;
}

/* Special event cards */
.special-event-card {
  position: relative;
  padding: 10px 14px 10px 18px;
  border-radius: 10px;
  border: 1px solid var(--theme-border-primary);
  background: var(--theme-bg-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.special-event-card:hover {
  border-color: var(--theme-border-secondary);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
}

.special-card-indicator {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  border-radius: 10px 0 0 10px;
}

.special-card-content {
  margin-left: 4px;
}

.special-card-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.special-card-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.special-card-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--theme-text-primary);
}

.special-card-app {
  font-size: 12px;
  font-weight: 600;
  padding: 1px 8px;
  border-radius: 9999px;
  border: 1px solid;
  color: var(--theme-text-primary);
}

.special-card-model,
.special-card-duration {
  font-size: 12px;
  color: var(--theme-text-tertiary);
  font-weight: 500;
}

.special-card-time {
  font-size: 11px;
  color: var(--theme-text-tertiary);
  margin-left: auto;
  flex-shrink: 0;
}

.send-message-arrow {
  font-size: 16px;
  font-weight: 700;
  color: var(--theme-primary);
}

.send-message-recipient {
  font-size: 13px;
  font-weight: 600;
  color: var(--theme-text-primary);
  background: var(--theme-bg-tertiary);
  padding: 1px 8px;
  border-radius: 6px;
  border: 1px solid var(--theme-border-primary);
}

.send-message-summary {
  font-size: 12px;
  color: var(--theme-text-secondary);
  font-style: italic;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 300px;
}

.team-create-name {
  font-size: 13px;
  font-weight: 700;
  color: var(--theme-primary);
}
</style>