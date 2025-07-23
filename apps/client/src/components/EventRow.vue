<template>
  <div 
    class="group relative p-3 mobile:p-1.5 rounded-lg shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer border border-[var(--theme-border-primary)] hover:border-[var(--theme-primary)] bg-gradient-to-r from-[var(--theme-bg-primary)] to-[var(--theme-bg-secondary)]"
    :class="{ 'ring-2 ring-[var(--theme-primary)] border-[var(--theme-primary)] shadow-2xl': isExpanded }"
    @click="toggleExpanded"
  >
    <!-- App color indicator -->
    <div 
      class="absolute left-0 top-0 bottom-0 w-3 rounded-l-lg"
      :style="{ backgroundColor: appHexColor }"
    ></div>
    
    <!-- Session color indicator -->
    <div 
      class="absolute left-3 top-0 bottom-0 w-1.5"
      :class="gradientClass"
    ></div>
    
    <div class="ml-4">
      <!-- Desktop Layout: Original horizontal layout -->
      <div class="hidden mobile:block mb-1.5">
        <!-- Mobile: App + Time on first row -->
        <div class="flex items-center justify-between mb-0.5">
          <span 
            class="text-xs font-semibold text-[var(--theme-text-primary)] px-1.5 py-0.5 rounded-full border-2 bg-[var(--theme-bg-tertiary)] shadow-md"
            :style="{ ...appBgStyle, ...appBorderStyle }"
          >
            {{ event.source_app }}
          </span>
          <span class="text-xs text-[var(--theme-text-tertiary)] font-medium">
            {{ formatTime(event.timestamp) }}
          </span>
        </div>
        
        <!-- Mobile: Session + Event Type on second row -->
        <div class="flex items-center space-x-1.5">
          <span class="text-xs text-[var(--theme-text-secondary)] px-1.5 py-0.5 rounded-full border bg-[var(--theme-bg-tertiary)]/50" :class="borderColorClass">
            {{ sessionIdShort }}
          </span>
          <span class="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-bold bg-[var(--theme-primary)] text-white shadow-md">
            <span class="mr-1 text-sm">{{ hookEmoji }}</span>
            {{ event.hook_event_type }}
          </span>
        </div>
      </div>

      <!-- Desktop Layout: Original single row layout -->
      <div class="flex items-center justify-between mb-1.5 mobile:hidden">
        <div class="flex items-center space-x-3">
          <span 
            class="text-sm font-bold text-[var(--theme-text-primary)] px-2 py-0.5 rounded-full border-2 bg-[var(--theme-bg-tertiary)] shadow-lg"
            :style="{ ...appBgStyle, ...appBorderStyle }"
          >
            {{ event.source_app }}
          </span>
          <span class="text-sm text-[var(--theme-text-secondary)] px-2 py-0.5 rounded-full border bg-[var(--theme-bg-tertiary)]/50 shadow-md" :class="borderColorClass">
            {{ sessionIdShort }}
          </span>
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-bold bg-[var(--theme-primary)] text-white shadow-lg">
            <span class="mr-1 text-sm">{{ hookEmoji }}</span>
            {{ event.hook_event_type }}
          </span>
        </div>
        <span class="text-sm text-[var(--theme-text-tertiary)] font-semibold">
          {{ formatTime(event.timestamp) }}
        </span>
      </div>
      
      <!-- Tool info and Summary - Desktop Layout -->
      <div class="flex items-center justify-between mb-1.5 mobile:hidden">
        <div v-if="toolInfo" class="text-sm text-[var(--theme-text-secondary)] font-semibold">
          <span class="font-medium">{{ toolInfo.tool }}</span>
          <span v-if="toolInfo.detail" class="ml-2 text-[var(--theme-text-tertiary)]" :class="{ 'italic': event.hook_event_type === 'UserPromptSubmit' }">{{ toolInfo.detail }}</span>
        </div>
        
        <!-- Summary aligned to the right -->
        <div v-if="event.summary" class="max-w-[50%] px-2.5 py-1 bg-[var(--theme-primary)]/10 border border-[var(--theme-primary)]/30 rounded-lg shadow-md">
          <span class="text-sm text-[var(--theme-text-primary)] font-semibold">
            <span class="mr-1">📝</span>
            {{ event.summary }}
          </span>
        </div>
      </div>

      <!-- Tool info and Summary - Mobile Layout -->
      <div class="space-y-1.5 hidden mobile:block mb-1.5">
        <div v-if="toolInfo" class="text-sm text-[var(--theme-text-secondary)] font-semibold w-full">
          <span class="font-medium">{{ toolInfo.tool }}</span>
          <span v-if="toolInfo.detail" class="ml-2 text-[var(--theme-text-tertiary)]" :class="{ 'italic': event.hook_event_type === 'UserPromptSubmit' }">{{ toolInfo.detail }}</span>
        </div>
        
        <div v-if="event.summary" class="w-full px-2 py-0.5 bg-[var(--theme-primary)]/10 border border-[var(--theme-primary)]/30 rounded-lg shadow-md">
          <span class="text-xs text-[var(--theme-text-primary)] font-semibold">
            <span class="mr-1">📝</span>
            {{ event.summary }}
          </span>
        </div>
      </div>
      
      <!-- Expanded content -->
      <div v-if="isExpanded" class="mt-1.5 pt-1.5 border-t-2 border-[var(--theme-primary)] bg-gradient-to-r from-[var(--theme-bg-primary)] to-[var(--theme-bg-secondary)] rounded-b-lg p-2.5 space-y-2.5">
        <!-- Payload -->
        <div>
          <div class="flex items-center justify-between mb-1.5">
            <h4 class="text-sm mobile:text-xs font-bold text-[var(--theme-primary)] drop-shadow-sm flex items-center">
              <span class="mr-1 text-base mobile:text-sm">📦</span>
              Payload
            </h4>
            <button
              @click.stop="copyPayload"
              class="px-2.5 py-0.5 mobile:px-2 mobile:py-0.5 text-xs mobile:text-xs font-bold rounded-lg bg-[var(--theme-primary)] hover:bg-[var(--theme-primary-dark)] text-white transition-all duration-200 shadow-md hover:shadow-lg transform hover:scale-105 flex items-center space-x-1"
            >
              <span>{{ copyButtonText }}</span>
            </button>
          </div>
          <pre class="text-xs mobile:text-xs text-[var(--theme-text-primary)] bg-[var(--theme-bg-tertiary)] p-2.5 mobile:p-2 rounded-lg overflow-x-auto max-h-48 overflow-y-auto font-mono border border-[var(--theme-primary)]/30 shadow-md hover:shadow-lg transition-shadow duration-200">{{ formattedPayload }}</pre>
        </div>
        
        <!-- Chat transcript button -->
        <div v-if="event.chat && event.chat.length > 0" class="flex justify-end">
          <button
            @click.stop="!isMobile && (showChatModal = true)"
            :class="[
              'px-4 py-2 mobile:px-3 mobile:py-1.5 font-bold rounded-lg transition-all duration-200 flex items-center space-x-1.5 shadow-md hover:shadow-lg',
              isMobile 
                ? 'bg-[var(--theme-bg-quaternary)] cursor-not-allowed opacity-50 text-[var(--theme-text-quaternary)] border border-[var(--theme-border-tertiary)]' 
                : 'bg-gradient-to-r from-[var(--theme-primary)] to-[var(--theme-primary-light)] hover:from-[var(--theme-primary-dark)] hover:to-[var(--theme-primary)] text-white border border-[var(--theme-primary-dark)] transform hover:scale-105'
            ]"
            :disabled="isMobile"
          >
            <span class="text-base mobile:text-sm">💬</span>
            <span class="text-sm mobile:text-xs font-bold drop-shadow-sm">
              {{ isMobile ? 'Not available in mobile' : `View Chat Transcript (${event.chat.length} messages)` }}
            </span>
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
import type { HookEvent } from '../types';
import { useMediaQuery } from '../composables/useMediaQuery';
import ChatTranscriptModal from './ChatTranscriptModal.vue';

const props = defineProps<{
  event: HookEvent;
  gradientClass: string;
  colorClass: string;
  appGradientClass: string;
  appColorClass: string;
  appHexColor: string;
}>();

const isExpanded = ref(false);
const showChatModal = ref(false);
const copyButtonText = ref('📋 Copy');

// Media query for responsive design
const { isMobile } = useMediaQuery();

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
    'Notification': '🔔',
    'Stop': '🛑',
    'SubagentStop': '👥',
    'PreCompact': '📦',
    'UserPromptSubmit': '💬'
  };
  return emojiMap[props.event.hook_event_type] || '❓';
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

const toolInfo = computed(() => {
  const payload = props.event.payload;
  
  // Handle UserPromptSubmit events
  if (props.event.hook_event_type === 'UserPromptSubmit' && payload.prompt) {
    return {
      tool: 'Prompt:',
      detail: `"${payload.prompt.slice(0, 100)}${payload.prompt.length > 100 ? '...' : ''}"`
    };
  }
  
  // Handle tool-based events
  if (payload.tool_name) {
    const info: { tool: string; detail?: string } = { tool: payload.tool_name };
    
    if (payload.tool_input) {
      if (payload.tool_input.command) {
        info.detail = payload.tool_input.command.slice(0, 50) + (payload.tool_input.command.length > 50 ? '...' : '');
      } else if (payload.tool_input.file_path) {
        info.detail = payload.tool_input.file_path.split('/').pop();
      } else if (payload.tool_input.pattern) {
        info.detail = payload.tool_input.pattern;
      }
    }
    
    return info;
  }
  
  return null;
});

const formatTime = (timestamp?: number) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleTimeString();
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
</script>