<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
    @click.self="$emit('close')"
  >
    <div
      class="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-[92vw] h-[92vh] flex flex-col"
    >
      <!-- Header -->
      <div
        class="flex items-center justify-between px-4 pt-3 pb-2 border-b border-slate-700 shrink-0"
      >
        <div class="flex items-center gap-3 flex-wrap">
          <span class="text-sm font-semibold text-slate-400">Prompt History</span>

          <!-- Host filter -->
          <select
            v-model="selectedHost"
            class="text-xs text-slate-200 bg-slate-800 border border-slate-600 rounded px-1.5 py-0.5 cursor-pointer"
          >
            <option v-for="h in allHosts" :key="h" :value="h">{{ alias(h) }}</option>
          </select>

          <!-- Repo filter -->
          <select
            v-model="selectedRepo"
            class="text-xs text-slate-200 bg-slate-800 border border-slate-600 rounded px-1.5 py-0.5 cursor-pointer"
          >
            <option v-for="r in availableRepos" :key="r" :value="r">{{ r.split('/').pop() }}</option>
          </select>

          <!-- Session filter -->
          <select
            v-model="selectedSessionId"
            class="text-xs text-slate-200 bg-slate-800 border border-slate-600 rounded px-1.5 py-0.5 cursor-pointer font-mono"
          >
            <option v-for="s in availableSessions" :key="s.session_id" :value="s.session_id">
              {{ s.session_id.slice(0, 8) }}{{ s.status ? ' · ' + s.status : '' }}
            </option>
          </select>

          <span v-if="loading" class="text-xs text-slate-500 italic">Loading…</span>
          <span v-else-if="loadingMore" class="text-xs text-slate-500 italic">Loading more…</span>
          <span v-else-if="selectedSessionId" class="text-xs text-slate-500">
            {{ promptBlocks.length }} prompt{{ promptBlocks.length !== 1 ? "s" : "" }}
            <template v-if="loadedLines < totalLines"> · {{ loadedLines }}/{{ totalLines }} lines</template>
          </span>
        </div>
        <div class="flex items-center gap-3">
          <!-- Refresh button -->
          <button
            @click="refresh"
            :disabled="refreshing || !selectedSessionId"
            class="text-xs px-2 py-0.5 rounded border border-slate-600 text-slate-400 hover:text-slate-200 hover:border-slate-500 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Request fresh session log from daemon"
          >{{ refreshing ? 'Refreshing…' : 'Refresh' }}</button>
          <!-- Rendered / Raw toggle -->
          <div class="flex items-center gap-1 text-xs">
            <button
              @click="renderMarkdown = true"
              class="px-2 py-0.5 rounded border"
              :class="renderMarkdown ? 'bg-slate-600 border-slate-500 text-slate-200' : 'bg-transparent border-slate-700 text-slate-500 hover:text-slate-400'"
            >Rendered</button>
            <button
              @click="renderMarkdown = false"
              class="px-2 py-0.5 rounded border"
              :class="!renderMarkdown ? 'bg-slate-600 border-slate-500 text-slate-200' : 'bg-transparent border-slate-700 text-slate-500 hover:text-slate-400'"
            >Raw</button>
          </div>
          <!-- Prompt navigation -->
          <div
            v-if="promptBlocks.length > 1"
            class="flex items-center gap-1 text-xs text-slate-400"
          >
            <button
              @click="prevPrompt"
              :disabled="currentPromptIndex <= 0"
              class="px-2 py-0.5 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Previous prompt (↑)"
            >
              ↑
            </button>
            <span>{{ currentPromptIndex + 1 }} / {{ promptBlocks.length }}</span>
            <button
              @click="nextPrompt"
              :disabled="currentPromptIndex >= promptBlocks.length - 1"
              class="px-2 py-0.5 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Next prompt (↓)"
            >
              ↓
            </button>
          </div>
          <button
            @click="$emit('close')"
            class="text-slate-400 hover:text-slate-200 text-lg leading-none px-1"
          >
            ×
          </button>
        </div>
      </div>

      <!-- Error -->
      <div v-if="error" class="px-4 py-3 text-sm text-red-400">{{ error }}</div>

      <!-- Content -->
      <div
        ref="scrollContainer"
        class="flex-1 overflow-y-auto px-4 py-3 space-y-4"
        @keydown="handleKey"
        tabindex="0"
      >
        <template v-for="(block, idx) in renderBlocks" :key="idx">
          <!-- User prompt block -->
          <div
            v-if="block.role === 'user'"
            :id="`prompt-${block.promptIndex}`"
            class="rounded-lg bg-slate-800/80 border border-slate-600 px-4 py-3"
          >
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs font-semibold text-slate-400 uppercase tracking-wide">User</span>
              <button
                @click="copyText(block.text)"
                class="text-xs text-slate-600 hover:text-slate-300 transition-colors"
                title="Copy"
              >
                copy
              </button>
            </div>
            <MarkdownContent v-if="renderMarkdown" :content="block.text" class="text-sm text-slate-100" />
            <pre v-else class="text-sm text-slate-100 whitespace-pre-wrap font-sans leading-relaxed">{{ block.text }}</pre>
          </div>

          <!-- Assistant response block -->
          <div v-else-if="block.role === 'assistant'" class="px-4 py-2">
            <div class="flex items-center justify-between mb-1">
              <span class="text-xs text-slate-500 uppercase tracking-wide">Assistant</span>
              <button
                @click="copyText(block.text)"
                class="text-xs text-slate-600 hover:text-slate-300 transition-colors"
                title="Copy"
              >
                copy
              </button>
            </div>
            <MarkdownContent v-if="renderMarkdown" :content="block.text" class="text-sm text-slate-300" />
            <pre v-else class="text-sm text-slate-300 whitespace-pre-wrap font-sans leading-relaxed">{{ block.text }}</pre>
          </div>

          <!-- Tool use block -->
          <div
            v-else-if="block.role === 'tool'"
            class="pl-4 border-l-2 border-slate-700 py-1"
          >
            <div class="flex items-center gap-2 mb-1">
              <span class="text-xs text-slate-600 font-mono">{{ block.toolName }}</span>
              <button
                v-if="block.text"
                @click="copyText(block.text)"
                class="text-xs text-slate-700 hover:text-slate-500 transition-colors"
                title="Copy"
              >
                copy
              </button>
            </div>
            <pre
              v-if="block.text"
              class="text-xs text-slate-500 whitespace-pre-wrap font-mono max-h-40 overflow-y-auto"
            >{{ block.text }}</pre>
          </div>
        </template>
        <div
          v-if="!loading && renderBlocks.length === 0 && !error && selectedSessionId"
          class="text-xs text-slate-500 italic"
        >
          No messages found.
        </div>
        <div v-if="!selectedSessionId" class="text-xs text-slate-500 italic">
          No sessions available.
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from "vue";
import { API_BASE } from "../config";
import { useHostnameAliases } from "../composables/useHostnameAliases";
import MarkdownContent from "./MarkdownContent.vue";
import type { ContainerWithState } from "../types";

const props = defineProps<{
  containers: ContainerWithState[];
  initialContainerId: string;
  initialSessionId: string;
}>();

const emit = defineEmits<{ close: [] }>();

const { alias } = useHostnameAliases();

const renderMarkdown = ref(true);
const loading = ref(false);
const loadingMore = ref(false);
const refreshing = ref(false);
const error = ref("");
const rawLines = ref<any[]>([]);
const loadedLines = ref(0);
const totalLines = ref(0);
const scrollContainer = ref<HTMLElement | null>(null);
const currentPromptIndex = ref(0);

// ── Filter state ──────────────────────────────────────────────────────────────

// Find the initial container to seed defaults
const initialContainer = computed(() =>
  props.containers.find(c => c.id === props.initialContainerId)
);

const selectedHost = ref(initialContainer.value?.machine_hostname ?? '');
const selectedRepo = ref(initialContainer.value?.source_repo ?? '');
const selectedSessionId = ref(props.initialSessionId);

// ── Dropdown options ──────────────────────────────────────────────────────────

const allHosts = computed(() => {
  const hosts = new Set<string>();
  for (const c of props.containers) hosts.add(c.machine_hostname);
  return [...hosts].sort();
});

const availableRepos = computed(() => {
  const repos = new Set<string>();
  for (const c of props.containers) {
    if (!selectedHost.value || c.machine_hostname === selectedHost.value) {
      repos.add(c.source_repo);
    }
  }
  return [...repos].sort();
});

interface SessionOption {
  session_id: string;
  container_id: string;
  status: string;
}

const availableSessions = computed((): SessionOption[] => {
  const sessions: SessionOption[] = [];
  for (const c of props.containers) {
    if (selectedHost.value && c.machine_hostname !== selectedHost.value) continue;
    if (selectedRepo.value && c.source_repo !== selectedRepo.value) continue;
    for (const s of c.sessions) {
      sessions.push({ session_id: s.session_id, container_id: c.id, status: s.status });
    }
  }
  // Sort: most recently active first (by position in sessions array which is already sorted)
  return sessions;
});

// Container that owns the currently selected session
const activeContainerId = computed(() => {
  return availableSessions.value.find(s => s.session_id === selectedSessionId.value)?.container_id
    ?? props.initialContainerId;
});

// ── Cascade resets when filters change ───────────────────────────────────────

watch(selectedHost, () => {
  // Reset repo if it's not in the new host's repos
  if (!availableRepos.value.includes(selectedRepo.value)) {
    selectedRepo.value = availableRepos.value[0] ?? '';
  }
});

watch(availableSessions, (sessions) => {
  // Reset session if it's not in the new session list
  if (!sessions.find(s => s.session_id === selectedSessionId.value)) {
    selectedSessionId.value = sessions[0]?.session_id ?? '';
  }
});

// ── Data loading ──────────────────────────────────────────────────────────────

interface RenderBlock {
  role: "user" | "assistant" | "tool";
  text: string;
  toolName?: string;
  promptIndex?: number;
}

const renderBlocks = computed((): RenderBlock[] => {
  const blocks: RenderBlock[] = [];
  let promptCount = 0;

  for (const line of rawLines.value) {
    const type = line.type;
    const msg = line.message;

    if (type === "user" && msg?.role === "user") {
      const text = extractText(msg.content);
      if (text.trim()) {
        blocks.push({ role: "user", text, promptIndex: promptCount++ });
      }
    } else if (type === "assistant" && msg?.role === "assistant") {
      const content = Array.isArray(msg.content) ? msg.content : [];
      for (const part of content) {
        if (part.type === "text" && part.text?.trim()) {
          blocks.push({ role: "assistant", text: part.text });
        } else if (part.type === "tool_use") {
          const inputText = part.input ? formatToolInput(part.name, part.input) : "";
          blocks.push({ role: "tool", text: inputText, toolName: part.name });
        }
      }
    }
  }

  return blocks;
});

const promptBlocks = computed(() =>
  renderBlocks.value.filter((b) => b.role === "user"),
);

function extractText(content: any): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((p: any) => p.type === "text")
      .map((p: any) => p.text ?? "")
      .join("\n");
  }
  return "";
}

function formatToolInput(name: string, input: any): string {
  if (name === "Bash" && input.command) return input.command;
  if (name === "Write" && input.file_path)
    return `${input.file_path}\n${(input.content ?? "").slice(0, 200)}${(input.content ?? "").length > 200 ? "…" : ""}`;
  if (name === "Edit" && input.file_path)
    return `${input.file_path}: ${(input.old_string ?? "").slice(0, 80)} → ${(input.new_string ?? "").slice(0, 80)}`;
  if (name === "Read" && input.file_path) return input.file_path;
  if (name === "Grep" && input.pattern)
    return `${input.pattern}${input.path ? " in " + input.path : ""}`;
  if (name === "Glob" && input.pattern) return input.pattern;
  try {
    return JSON.stringify(input, null, 2).slice(0, 300);
  } catch {
    return "";
  }
}

const CHUNK_SIZE = 1000;

function parseLines(content: string): any[] {
  return content
    .split("\n")
    .filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

async function loadChunk(offset: number, isIncremental = false): Promise<boolean> {
  if (!selectedSessionId.value || !activeContainerId.value) return false;
  const url = `${API_BASE}/dashboard/session-log/${encodeURIComponent(activeContainerId.value)}/${encodeURIComponent(selectedSessionId.value)}?offset=${offset}&limit=${CHUNK_SIZE}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const { content, lineCount, totalLines: total } = await res.json();
  totalLines.value = total;
  if (lineCount > 0) {
    const parsed = parseLines(content);
    if (isIncremental) {
      rawLines.value = [...rawLines.value, ...parsed];
    } else {
      rawLines.value = [...rawLines.value, ...parsed];
    }
    loadedLines.value = offset + lineCount;
  }
  return lineCount > 0;
}

async function load() {
  if (!selectedSessionId.value || !activeContainerId.value) return;
  loading.value = true;
  loadingMore.value = false;
  error.value = "";
  rawLines.value = [];
  loadedLines.value = 0;
  totalLines.value = 0;
  try {
    await loadChunk(0);
    await nextTick();
    if (promptBlocks.value.length > 0) {
      currentPromptIndex.value = promptBlocks.value.length - 1;
      scrollToPrompt(currentPromptIndex.value);
    }
    // Auto-load remaining chunks in the background
    while (loadedLines.value < totalLines.value) {
      loadingMore.value = true;
      await loadChunk(loadedLines.value);
    }
  } catch (e: any) {
    error.value = e?.message ?? "Unknown error";
  } finally {
    loading.value = false;
    loadingMore.value = false;
  }
}

async function loadIncremental() {
  if (!selectedSessionId.value || !activeContainerId.value) return;
  if (loadedLines.value === 0) return; // not yet loaded
  try {
    let fetched = true;
    while (fetched && loadedLines.value < totalLines.value || totalLines.value === 0) {
      fetched = await loadChunk(loadedLines.value, true);
      if (totalLines.value > 0 && loadedLines.value >= totalLines.value) break;
      if (!fetched) break;
    }
  } catch { /* ignore incremental errors */ }
}

// Watch session status: fetch incremental content when session stops being busy
const activeSessionStatus = computed(() => {
  const session = availableSessions.value.find(s => s.session_id === selectedSessionId.value);
  if (!session) return null;
  const container = props.containers.find(c => c.id === session.container_id);
  return container?.sessions.find(s => s.session_id === selectedSessionId.value)?.status ?? null;
});

watch(activeSessionStatus, (newStatus, oldStatus) => {
  if (oldStatus === 'busy' && newStatus !== 'busy' && loadedLines.value > 0) {
    loadIncremental();
  }
});

watch(selectedSessionId, () => {
  currentPromptIndex.value = 0;
  load();
});

function scrollToPrompt(idx: number) {
  const el = scrollContainer.value?.querySelector(`#prompt-${idx}`);
  el?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function prevPrompt() {
  if (currentPromptIndex.value > 0) {
    currentPromptIndex.value--;
    scrollToPrompt(currentPromptIndex.value);
  }
}

function nextPrompt() {
  if (currentPromptIndex.value < promptBlocks.value.length - 1) {
    currentPromptIndex.value++;
    scrollToPrompt(currentPromptIndex.value);
  }
}

function handleKey(e: KeyboardEvent) {
  if (e.key === "ArrowUp" || e.key === "PageUp") {
    e.preventDefault();
    prevPrompt();
  }
  if (e.key === "ArrowDown" || e.key === "PageDown") {
    e.preventDefault();
    nextPrompt();
  }
}

async function refresh() {
  if (!selectedSessionId.value || !activeContainerId.value || refreshing.value) return;
  refreshing.value = true;
  error.value = "";
  try {
    const res = await fetch(
      `${API_BASE}/dashboard/session-log/${encodeURIComponent(activeContainerId.value)}/${encodeURIComponent(selectedSessionId.value)}/refresh`,
      { method: 'POST' }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // Wait briefly for daemon to start sending, then reload
    await new Promise(r => setTimeout(r, 500));
    await load();
  } catch (e: any) {
    error.value = e?.message ?? 'Refresh failed';
  } finally {
    refreshing.value = false;
  }
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* ignore */
  }
}

function onGlobalKey(e: KeyboardEvent) {
  if (e.key === "Escape") { emit("close"); return; }
  if (e.key === "ArrowUp") prevPrompt();
  if (e.key === "ArrowDown") nextPrompt();
}

onMounted(() => {
  load();
  window.addEventListener("keydown", onGlobalKey);
  nextTick(() => scrollContainer.value?.focus());
});
onUnmounted(() => window.removeEventListener("keydown", onGlobalKey));
</script>
