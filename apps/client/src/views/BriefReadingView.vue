<template>
  <div class="bread">
    <header class="bread__bar">
      <button class="bread__back" @click="$emit('close')" aria-label="Back">← Back</button>
    </header>
    <div class="bread__content">
      <span class="card-eyebrow">Today's brief · {{ formatDate(brief?.date) }}</span>
      <h1 class="bread__title">{{ brief?.title }}</h1>
      <div v-if="brief?.htmlBody" ref="bodyEl" class="bread__body" v-html="brief.htmlBody"></div>
      <p v-else class="bread__loading">Loading…</p>
    </div>
    <div v-if="toast" class="bread__toast" :class="{ 'is-err': toastIsErr }">{{ toast }}</div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';

defineProps<{ brief: any }>();
defineEmits<{ (e: 'close'): void }>();

const bodyEl = ref<HTMLDivElement | null>(null);
const toast = ref('');
const toastIsErr = ref(false);
let toastTimer: any = null;
function flashToast(msg: string, isErr = false) {
  toast.value = msg;
  toastIsErr.value = isErr;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.value = ''; }, 1800);
}

function formatDate(iso?: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
  } catch { return iso; }
}

// Copy via secure-context clipboard API, then fall back to legacy
// document.execCommand('copy'). The fallback is essential because the
// dashboard is served over plain HTTP via Tailscale (100.x.y.z:5173) and
// `navigator.clipboard.writeText` is gated behind a secure context.
async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  // Modern path
  try {
    if (typeof navigator !== 'undefined' &&
        (navigator as any).clipboard?.writeText &&
        (window as any).isSecureContext) {
      await (navigator as any).clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through */ }
  // Legacy path — works on plain HTTP (Tailscale)
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    // iOS needs the textarea to be selectable in the viewport.
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '0';
    ta.style.width = '1px';
    ta.style.height = '1px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}

function flashCopied(el: Element, mode: 'icon' | 'all' = 'icon') {
  el.classList.add('copied');
  if (mode === 'all') {
    const orig = (el as HTMLElement).getAttribute('data-original-text') || el.textContent || 'Copy all';
    if (!(el as HTMLElement).hasAttribute('data-original-text')) {
      (el as HTMLElement).setAttribute('data-original-text', orig);
    }
    el.textContent = '✓ Copied';
    setTimeout(() => {
      el.classList.remove('copied');
      el.textContent = orig;
    }, 1500);
  } else {
    setTimeout(() => el.classList.remove('copied'), 1500);
  }
}

// Single delegated click handler — survives any v-html re-render without
// needing to re-bind, and catches clicks on the inner <svg> too.
async function onBodyClick(e: Event) {
  const target = e.target as Element | null;
  if (!target) return;
  const copyBtn = target.closest('.copy-btn[data-copy]') as HTMLElement | null;
  if (copyBtn) {
    e.preventDefault();
    e.stopPropagation();
    const text = copyBtn.getAttribute('data-copy') || '';
    const ok = await copyToClipboard(text);
    if (ok) { flashCopied(copyBtn, 'icon'); flashToast('Copied prompt'); }
    else flashToast('Copy failed — browser blocked clipboard', true);
    return;
  }
  const allBtn = target.closest('.copy-all-btn[data-copy-all]') as HTMLElement | null;
  if (allBtn) {
    e.preventDefault();
    e.stopPropagation();
    const root = bodyEl.value;
    if (!root) return;
    const prompts = [...root.querySelectorAll<HTMLElement>('.copy-btn[data-copy]')]
      .map(b => b.getAttribute('data-copy') || '')
      .filter(Boolean);
    const ok = await copyToClipboard(prompts.join('\n\n'));
    if (ok) { flashCopied(allBtn, 'all'); flashToast(`Copied ${prompts.length} prompts`); }
    else flashToast('Copy failed — browser blocked clipboard', true);
    return;
  }
}

onMounted(() => {
  bodyEl.value?.addEventListener('click', onBodyClick);
});
onUnmounted(() => {
  bodyEl.value?.removeEventListener('click', onBodyClick);
});
</script>

<style scoped>
.bread {
  position: fixed;
  inset: 0;
  z-index: 80;
  background: var(--atlas-page-bg);
  color: var(--atlas-text-primary);
  overflow-y: auto;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif;
}

.bread__bar {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  padding: 16px 24px;
  background: var(--atlas-page-bg);
  border-bottom: 1px solid var(--atlas-hairline);
}
.bread__back {
  font-family: inherit;
  font-size: 15px;
  font-weight: 500;
  color: var(--atlas-blue);
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
}
.bread__back:hover { opacity: 0.7; }

.bread__content {
  max-width: 680px;
  margin: 0 auto;
  padding: 32px 24px 80px;
}
.card-eyebrow {
  display: block;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--atlas-text-secondary);
  margin-bottom: 12px;
}
.bread__title {
  margin: 0 0 24px;
  font-size: 32px;
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1.1;
  color: var(--atlas-text-strong);
}

.bread__body :deep(p) {
  margin: 0 0 24px;
  font-size: 17px;
  line-height: 1.6;
  color: var(--atlas-text-primary);
}
.bread__body :deep(h2) {
  margin: 40px 0 16px;
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--atlas-text-strong);
}
.bread__body :deep(ul),
.bread__body :deep(ol) {
  margin: 0 0 24px;
  padding-left: 22px;
  font-size: 17px;
  line-height: 1.6;
}
.bread__body :deep(li) { margin-bottom: 6px; }
.bread__body :deep(a) { color: var(--atlas-blue); text-decoration: none; }
.bread__body :deep(a:hover) { opacity: 0.7; }
.bread__body :deep(code) {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  font-size: 0.92em;
  background: var(--atlas-card-bg);
  padding: 2px 6px;
  border-radius: 4px;
}
.bread__body :deep(.brief-eyebrow),
.bread__body :deep(.brief-meta) { display: none; }

.bread__loading { font-size: 15px; color: var(--atlas-text-secondary); }

.bread__toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(28,28,30,0.95);
  color: #FFF;
  font-size: 13px;
  font-weight: 500;
  padding: 9px 16px;
  border-radius: 999px;
  z-index: 90;
  pointer-events: none;
  box-shadow: 0 8px 24px rgba(0,0,0,0.25);
  animation: bread-toast-in 160ms ease;
}
.bread__toast.is-err { background: rgba(255,59,48,0.95); }
@keyframes bread-toast-in {
  from { opacity: 0; transform: translate(-50%, 8px); }
  to   { opacity: 1; transform: translate(-50%, 0); }
}
</style>
