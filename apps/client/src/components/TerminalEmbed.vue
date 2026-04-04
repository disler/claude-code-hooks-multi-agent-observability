<template>
  <div class="terminal-embed" :class="{ 'terminal-fullscreen': isFullscreen }">
    <!-- Header -->
    <div class="terminal-header">
      <div class="terminal-header-left">
        <span class="status-dot" :class="connected ? 'dot-online' : 'dot-offline'"></span>
        <span class="role-badge" :style="{ background: roleColor }">{{ role.toUpperCase() }}</span>
        <span class="role-label">{{ roleLabel }}</span>
      </div>
      <div class="terminal-header-right">
        <button class="term-btn" @click="toggleFullscreen" :title="isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'">
          {{ isFullscreen ? '⊡' : '⊞' }}
        </button>
        <button class="term-btn" @click="reconnect" title="Reconnect" v-if="!connected">
          ↻
        </button>
        <button class="term-btn term-btn-close" @click="emit('close')" title="Close">
          ✕
        </button>
      </div>
    </div>

    <!-- xterm.js Terminal -->
    <div ref="terminalRef" class="xterm-container"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

const props = defineProps<{
  role: string;
  port: number;
  roleLabel?: string;
  roleColor?: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const terminalRef = ref<HTMLElement>();
const connected = ref(false);
const isFullscreen = ref(false);

let terminal: Terminal | null = null;
let fitAddon: FitAddon | null = null;
let ws: WebSocket | null = null;
let resizeObserver: ResizeObserver | null = null;

const THEME = {
  background: '#1a1b26',
  foreground: '#a9b1d6',
  cursor: '#c0caf5',
  cursorAccent: '#1a1b26',
  selectionBackground: '#33467c',
  selectionForeground: '#c0caf5',
  black: '#15161e',
  red: '#f7768e',
  green: '#9ece6a',
  yellow: '#e0af68',
  blue: '#7aa2f7',
  magenta: '#bb9af7',
  cyan: '#7dcfff',
  white: '#a9b1d6',
  brightBlack: '#414868',
  brightRed: '#f7768e',
  brightGreen: '#9ece6a',
  brightYellow: '#e0af68',
  brightBlue: '#7aa2f7',
  brightMagenta: '#bb9af7',
  brightCyan: '#7dcfff',
  brightWhite: '#c0caf5',
};

function initTerminal() {
  if (!terminalRef.value) return;

  terminal = new Terminal({
    fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Menlo, monospace',
    fontSize: 14,
    lineHeight: 1.3,
    cursorBlink: true,
    cursorStyle: 'block',
    theme: THEME,
    allowProposedApi: true,
    scrollback: 5000,
  });

  fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.loadAddon(new WebLinksAddon());

  terminal.open(terminalRef.value);

  nextTick(() => {
    fitAddon?.fit();
  });

  // Auto-fit on resize
  resizeObserver = new ResizeObserver(() => {
    fitAddon?.fit();
  });
  resizeObserver.observe(terminalRef.value);

  connectWebSocket();
}

function connectWebSocket() {
  if (ws) {
    ws.close();
  }

  // ttyd uses a specific WebSocket protocol
  const wsUrl = `ws://localhost:${props.port}/ws`;
  ws = new WebSocket(wsUrl, ['tty']);

  ws.binaryType = 'arraybuffer';

  ws.onopen = () => {
    connected.value = true;
    terminal?.writeln(`\r\n\x1b[32m✓ Connected to ${props.role.toUpperCase()} terminal\x1b[0m\r\n`);
  };

  ws.onmessage = (event) => {
    if (event.data instanceof ArrayBuffer) {
      const data = new Uint8Array(event.data);
      // ttyd protocol: first byte is message type
      // 0 = output, 1 = set window title, 2 = set preferences
      if (data[0] === 0) {
        terminal?.write(data.slice(1));
      }
    } else if (typeof event.data === 'string') {
      terminal?.write(event.data);
    }
  };

  ws.onclose = () => {
    connected.value = false;
    terminal?.writeln('\r\n\x1b[31m✗ Disconnected from terminal\x1b[0m');
  };

  ws.onerror = () => {
    connected.value = false;
  };

  // Send terminal input to ttyd
  terminal?.onData((data) => {
    if (ws?.readyState === WebSocket.OPEN) {
      // ttyd protocol: prepend type byte 0 for input
      const encoder = new TextEncoder();
      const encoded = encoder.encode(data);
      const message = new Uint8Array(encoded.length + 1);
      message[0] = 0; // input type
      message.set(encoded, 1);
      ws.send(message);
    }
  });

  // Send terminal resize to ttyd
  terminal?.onResize(({ cols, rows }) => {
    if (ws?.readyState === WebSocket.OPEN) {
      // ttyd protocol: type 1 for resize, JSON payload
      const resizePayload = JSON.stringify({ columns: cols, rows: rows });
      const encoder = new TextEncoder();
      const encoded = encoder.encode(resizePayload);
      const message = new Uint8Array(encoded.length + 1);
      message[0] = 1; // resize type
      message.set(encoded, 1);
      ws.send(message);
    }
  });
}

function reconnect() {
  terminal?.writeln('\r\n\x1b[33m↻ Reconnecting...\x1b[0m');
  connectWebSocket();
}

function toggleFullscreen() {
  isFullscreen.value = !isFullscreen.value;
  nextTick(() => {
    fitAddon?.fit();
  });
}

onMounted(() => {
  initTerminal();
});

onUnmounted(() => {
  ws?.close();
  resizeObserver?.disconnect();
  terminal?.dispose();
});

watch(() => props.port, () => {
  connectWebSocket();
});
</script>

<style scoped>
.terminal-embed {
  display: flex;
  flex-direction: column;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: #1a1b26;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  height: 100%;
  min-height: 300px;
}

.terminal-fullscreen {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 9999;
  border-radius: 0;
}

.terminal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: #16161e;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.terminal-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.terminal-header-right {
  display: flex;
  align-items: center;
  gap: 4px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.dot-online {
  background: #9ece6a;
  box-shadow: 0 0 6px rgba(158, 206, 106, 0.5);
}

.dot-offline {
  background: #f7768e;
  box-shadow: 0 0 6px rgba(247, 118, 142, 0.5);
}

.role-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
  color: white;
  letter-spacing: 0.5px;
}

.role-label {
  font-size: 12px;
  color: #565f89;
}

.term-btn {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #565f89;
  padding: 2px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.15s;
}

.term-btn:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #a9b1d6;
}

.term-btn-close:hover {
  background: rgba(247, 118, 142, 0.2);
  color: #f7768e;
}

.xterm-container {
  flex: 1;
  padding: 4px;
  overflow: hidden;
}

/* Override xterm.js default styles for better integration */
.xterm-container :deep(.xterm) {
  height: 100%;
}

.xterm-container :deep(.xterm-viewport) {
  overflow-y: auto !important;
}

.xterm-container :deep(.xterm-viewport::-webkit-scrollbar) {
  width: 6px;
}

.xterm-container :deep(.xterm-viewport::-webkit-scrollbar-track) {
  background: transparent;
}

.xterm-container :deep(.xterm-viewport::-webkit-scrollbar-thumb) {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
}

.xterm-container :deep(.xterm-viewport::-webkit-scrollbar-thumb:hover) {
  background: rgba(255, 255, 255, 0.2);
}
</style>
