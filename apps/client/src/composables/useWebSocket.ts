import { ref } from 'vue';
import type { HookEvent } from '../types';
import { WS_URL } from '../config';
import { useOpcStore } from './useOpcStore';

// Global state for singleton WebSocket connection
const events = ref<HookEvent[]>([]);
const opcMessage = ref<any>(null); // For OPC-specific event components to watch
const isConnected = ref(false);
const error = ref<string | null>(null);

let ws: WebSocket | null = null;
let reconnectTimeout: number | null = null;
let subscribersCount = 0;

export function useWebSocket() {
  const maxEvents = parseInt(import.meta.env.VITE_MAX_EVENTS_TO_DISPLAY || '300');
  const { streamingMessages: streamingState } = useOpcStore();  
  const connect = () => {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return; // Already connecting or open
    }
    
    try {
      ws = new WebSocket(WS_URL);
      
      ws.onopen = () => {
        console.log('WebSocket connected');
        isConnected.value = true;
        error.value = null;
      };
      
      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          if (message.type === 'initial') {
            const initialEvents = Array.isArray(message.data) ? message.data : [];
            events.value = initialEvents.slice(-maxEvents);
          } else if (message.type === 'event') {
            const newEvent = message.data as HookEvent;
            events.value.push(newEvent);
            
            if (events.value.length > maxEvents) {
              events.value = events.value.slice(events.value.length - maxEvents + 10);
            }
          } else if (message.type === 'autoreply:stream') {
            // Layer ①: Ephemeral incremental text for UI streaming
            const d = message.data;
            const key = `autoreply:${d.role}:${d.topicId}`;
            if (!streamingState[key]) {
              streamingState[key] = {
                role: d.role, topicId: d.topicId,
                text: '', thinking: '', tools: [],
                startedAt: new Date().toISOString(),
              };
            }
            streamingState[key].text += d.text || '';
            if (d.thinking) streamingState[key].thinking += d.thinking;
          } else if (message.type === 'autoreply:done') {
            const d = message.data;
            const key = `autoreply:${d.role}:${d.topicId}`;
            delete streamingState[key];
          } else if (message.type === 'execution:stream') {
            // Layer ①: Ephemeral execution stream events for UI
            const d = message.data;
            const key = `exec:${d.taskId}`;
            if (!streamingState[key]) {
              streamingState[key] = {
                role: d.role, topicId: d.topicId, taskId: d.taskId,
                text: '', thinking: '', tools: [],
                startedAt: d.timestamp || new Date().toISOString(),
              };
            }
            const entry = streamingState[key];
            if (d.kind === 'text') entry.text += d.text || '';
            if (d.kind === 'thinking') entry.thinking += d.text || '';
            if (d.kind === 'tool_use') entry.tools.push(`🔧 ${d.toolName || 'unknown'}`);
            if (d.kind === 'init') entry.text += `[${d.text}]\n`;
          } else if (message.type === 'execution:completed') {
            // Clean up streaming state for completed executions
            const d = message.data;
            if (d?.taskId) {
              delete streamingState[`exec:${d.taskId}`];
            }
          } else if (message.type === 'board:updated') {
            const { taskBoard } = useOpcStore();
            taskBoard.value = message.data;
            // Provide a reactive trigger for the animation
            document.body.classList.remove('board-flash');
            void document.body.offsetWidth; // trigger reflow
            document.body.classList.add('board-flash');
          } else if (message.type === 'cost:updated') {
            // Can be picked up by the CostBoard if it listens, or we can add a global hook
            opcMessage.value = message;
          } else {
            // Other OPC events (message:new, topic:created, dispatch:created, etc.)
            opcMessage.value = message;
          }
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };
      
      ws.onerror = (err) => {
        console.error('WebSocket error:', err);
        error.value = 'WebSocket connection error';
      };
      
      ws.onclose = () => {
        console.log('WebSocket disconnected');
        isConnected.value = false;
        ws = null;
        
        if (subscribersCount > 0) {
          reconnectTimeout = window.setTimeout(() => {
            console.log('Attempting to reconnect...');
            connect();
          }, 3000);
        }
      };
    } catch (err) {
      console.error('Failed to connect:', err);
      error.value = 'Failed to connect to server';
    }
  };
  
  const disconnect = () => {
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
    
    if (ws) {
      ws.close();
      ws = null;
    }
  };

  const subscribe = () => {
    subscribersCount++;
    if (subscribersCount === 1) {
      connect();
    }
  };

  const unsubscribe = () => {
    subscribersCount--;
    if (subscribersCount <= 0) {
      subscribersCount = 0;
      disconnect();
    }
  };

  const clearEvents = () => {
    events.value = [];
  };

  return {
    events,
    opcMessage,
    isConnected,
    error,
    clearEvents,
    subscribe,
    unsubscribe
  };
}