<template>
  <!-- Inline view -->
  <div class="md-wrap">
    <div class="md-toolbar">
      <button
        v-if="isMultiLine"
        @click="expanded = true"
        class="md-btn"
        title="Expand"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/>
        </svg>
      </button>
      <button
        @click="rendered = !rendered"
        class="md-btn md-toggle"
        :title="rendered ? 'Switch to plain text' : 'Switch to rendered markdown'"
      >{{ rendered ? 'txt' : 'md' }}</button>
    </div>
    <div v-if="rendered" class="md-body md-scroll" v-html="html" />
    <pre v-else class="md-pre md-scroll">{{ content }}</pre>
  </div>

  <!-- Expanded modal -->
  <Teleport to="body">
    <div
      v-if="expanded"
      class="fixed inset-0 z-[200] flex items-center justify-center bg-black/70"
      @click.self="expanded = false"
    >
      <div class="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-[82vw] h-[88vh] flex flex-col">
        <div class="flex items-center justify-between px-4 py-2 border-b border-slate-700 shrink-0">
          <div class="flex items-center gap-2">
            <button
              @click="rendered = !rendered"
              class="text-xs px-2 py-0.5 rounded border font-mono transition-colors"
              :class="rendered
                ? 'border-blue-600 text-blue-300 bg-blue-900/30'
                : 'border-slate-600 text-slate-400 bg-slate-800'"
            >{{ rendered ? 'Rendered' : 'Plain text' }}</button>
          </div>
          <button @click="expanded = false" class="text-slate-400 hover:text-slate-200 text-xl leading-none px-1">×</button>
        </div>
        <div class="flex-1 overflow-y-auto p-6 min-h-0">
          <div v-if="rendered" class="md-body md-modal-body" v-html="html" />
          <pre v-else class="text-sm font-mono whitespace-pre-wrap break-words text-slate-300">{{ content }}</pre>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { renderMarkdown } from '../composables/useMarkdown'

const props = defineProps<{ content: string }>()

const rendered = ref(true)
const expanded = ref(false)

const isMultiLine = computed(() => props.content.trim().includes('\n'))
const html = computed(() => renderMarkdown(props.content))
</script>

<style scoped>
.md-wrap { position: relative; }

.md-toolbar {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 3px;
  margin-bottom: 3px;
}

.md-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1px 3px;
  color: rgb(100 116 139); /* slate-500 */
  border-radius: 3px;
  transition: color 0.15s;
  line-height: 1;
}
.md-btn:hover { color: rgb(203 213 225); /* slate-300 */ }
.md-toggle { font-size: 10px; font-family: monospace; }

.md-scroll { overflow-y: auto; max-height: 16rem; }
.md-pre {
  font-size: 0.75rem;
  font-family: monospace;
  white-space: pre-wrap;
  word-break: break-words;
  color: rgb(203 213 225); /* slate-300 */
}

/* Rendered markdown body — inline */
.md-body {
  font-size: 0.75rem;
  line-height: 1.6;
  color: rgb(203 213 225); /* slate-300 */
}

/* Modal body slightly larger */
.md-modal-body { font-size: 0.875rem; }

.md-body :deep(h1) { font-size: 1rem; font-weight: 700; color: #f1f5f9; margin: 0.75rem 0 0.25rem; }
.md-body :deep(h2) { font-size: 0.875rem; font-weight: 700; color: #e2e8f0; margin: 0.6rem 0 0.2rem; border-bottom: 1px solid rgba(100,116,139,0.3); padding-bottom: 0.15rem; }
.md-body :deep(h3) { font-size: 0.8125rem; font-weight: 600; color: #cbd5e1; margin: 0.5rem 0 0.15rem; }
.md-body :deep(h4),
.md-body :deep(h5),
.md-body :deep(h6) { font-size: 0.75rem; font-weight: 600; color: #94a3b8; margin: 0.4rem 0 0.1rem; }

.md-body :deep(p) { margin: 0.2rem 0; }

.md-body :deep(strong) { font-weight: 600; color: #e2e8f0; }
.md-body :deep(em) { font-style: italic; color: #cbd5e1; }
.md-body :deep(del) { text-decoration: line-through; color: #64748b; }

.md-body :deep(a) { color: #60a5fa; text-decoration: underline; }
.md-body :deep(a:hover) { color: #93c5fd; }

.md-body :deep(code) {
  font-family: monospace;
  font-size: 0.7rem;
  background: rgba(0,0,0,0.35);
  color: #fde68a; /* amber-200 */
  padding: 0 3px;
  border-radius: 3px;
}

.md-body :deep(pre) {
  background: rgba(0,0,0,0.4);
  border-radius: 6px;
  padding: 0.6rem 0.75rem;
  overflow-x: auto;
  margin: 0.4rem 0;
  position: relative;
}
.md-body :deep(pre code) {
  font-size: 0.7rem;
  background: none;
  color: #d1d5db; /* gray-300 */
  padding: 0;
}
.md-body :deep(pre[data-lang])::before {
  content: attr(data-lang);
  position: absolute;
  top: 3px;
  right: 8px;
  font-size: 0.6rem;
  color: #475569;
  font-family: monospace;
}

.md-body :deep(ul) { list-style: disc; padding-left: 1.25rem; margin: 0.25rem 0; }
.md-body :deep(ol) { list-style: decimal; padding-left: 1.25rem; margin: 0.25rem 0; }
.md-body :deep(li) { margin: 0.1rem 0; }

.md-body :deep(blockquote) {
  border-left: 3px solid #475569;
  padding-left: 0.75rem;
  color: #94a3b8;
  margin: 0.3rem 0;
  font-style: italic;
}

.md-body :deep(hr) {
  border: none;
  border-top: 1px solid rgba(100,116,139,0.4);
  margin: 0.5rem 0;
}

.md-body :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 0.4rem 0;
  font-size: 0.7rem;
}
.md-body :deep(th) {
  background: rgba(30,41,59,0.7);
  color: #94a3b8;
  font-weight: 600;
  text-align: left;
  padding: 3px 6px;
  border: 1px solid rgba(71,85,105,0.5);
}
.md-body :deep(td) {
  padding: 3px 6px;
  border: 1px solid rgba(71,85,105,0.3);
  color: #cbd5e1;
}
.md-body :deep(tr:nth-child(even) td) { background: rgba(15,23,42,0.3); }
</style>
