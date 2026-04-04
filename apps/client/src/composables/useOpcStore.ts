import { ref, computed, reactive } from 'vue';
import { useOpcApi } from './useOpcApi';

/** Ephemeral streaming state — exists only during active process, never stored in DB */
export interface StreamingEntry {
  role: string;
  topicId: string;
  taskId?: string;    // present for execution:stream
  text: string;       // accumulated incremental text
  thinking: string;   // accumulated thinking (collapsible)
  tools: string[];    // list of tool uses ("🔧 Bash", "🔧 Read", ...)
  startedAt: string;
}
const roles = ref<any[]>([]);
const currentTopicId = ref<string | null>(null);
const currentContactId = ref<string | null>(null);
const currentContact = ref<any>(null);
const currentContactTopics = ref<any[]>([]);
const newDirectiveMode = ref(false);
const taskBoard = ref<any>(null);

// Ephemeral streaming state — only for real-time UI, discarded when process ends
const streamingMessages = reactive<Record<string, StreamingEntry>>({});

export function useOpcStore() {
  const api = useOpcApi();

  const loadOrg = async () => {
    const data = await api.get('/api/opc/org');
    if (data) {
      roles.value = data;
      if (currentContactId.value) {
        currentContact.value = data.find((r: any) => r.id === currentContactId.value) || null;
      }
    }
  };

  const loadTasks = async (topicId?: string | null) => {
    const query = topicId ? `?topic_id=${encodeURIComponent(topicId)}` : '';
    const board = await api.get(`/api/opc/board${query}`);
    if (board) {
      taskBoard.value = board;
    }
  };

  const cSuiteCount = computed(() => roles.value.filter(r => r.type === 'c-suite').length);
  const managerCount = computed(() => roles.value.filter(r => r.type === 'bu-leader' || r.type === 'group-leader').length);
  const roleCount = computed(() => roles.value.filter(r => r.type === 'role').length);

  return {
    roles,
    currentTopicId,
    currentContactId,
    currentContact,
    currentContactTopics,
    newDirectiveMode,
    taskBoard,
    streamingMessages,
    cSuiteCount,
    managerCount,
    roleCount,
    loadOrg,
    loadTasks,
  };
}
