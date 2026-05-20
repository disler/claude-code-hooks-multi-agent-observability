<template>
  <article class="card today" :class="{ 'today--empty': queue.length === 0 }">
    <div class="today__head">
      <span class="card-eyebrow">Today</span>
      <span v-if="queue.length" class="today__count">{{ queue.length }}</span>
      <span v-if="deferred.length" class="today__deferred">· {{ deferred.length }} deferred</span>
      <span v-if="loading" class="today__loading" aria-hidden="true">·</span>
      <button
        v-if="completedToday.length"
        class="today__viewdone"
        type="button"
        @click="showCompleted = !showCompleted"
      >{{ showCompleted ? 'Hide' : 'Show' }} done ({{ completedToday.length }}) →</button>
    </div>

    <form class="today__add" @submit.prevent="onAdd">
      <input
        v-model="addText"
        class="today__add-input"
        type="text"
        placeholder="Add a task…"
        :disabled="adding"
        maxlength="200"
      />
      <button
        v-if="speechSupported"
        type="button"
        class="today__add-mic"
        :class="{ 'is-on': listening }"
        @click="onMic"
        :disabled="adding"
        :aria-label="listening ? 'Stop' : 'Dictate'"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 1.5a3 3 0 0 0-3 3v6a3 3 0 1 0 6 0v-6a3 3 0 0 0-3-3z"/>
          <path d="M5 10v1a7 7 0 0 0 14 0v-1"/>
          <path d="M12 18.5V22"/>
        </svg>
      </button>
      <select v-model="addUrgency" class="today__add-urgency" :disabled="adding" title="Urgency">
        <option value="green">Normal</option>
        <option value="yellow">Soon</option>
        <option value="red">Blocking</option>
        <option value="white">Later</option>
      </select>
      <button type="submit" class="today__add-btn" :disabled="!addText.trim() || adding">Add</button>
    </form>

    <p v-if="actionMsg" class="today__flash" :class="{ 'today__flash--err': actionMsgIsError }">
      {{ actionMsg }}
    </p>

    <ul v-if="queue.length" class="today__list">
      <li
        v-for="item in queue"
        :key="item.item_id"
        class="row"
        :class="{
          'row--open': openId === item.item_id,
          'row--swipe-left':  swipeId === item.item_id && swipeX < -10,
          'row--swipe-right': swipeId === item.item_id && swipeX > 10,
        }"
      >
        <!-- left tray (revealed on right-swipe) -->
        <div class="row__tray row__tray--left">
          <button
            class="row__tray-btn row__tray-btn--primary"
            @click="onPrimary(item)"
            :disabled="busyId === item.item_id"
          >{{ primaryLabel(item) }}</button>
        </div>

        <!-- right tray (revealed on left-swipe) -->
        <div class="row__tray row__tray--right">
          <button
            class="row__tray-btn row__tray-btn--ghost"
            @click="onAction(item, 'defer')"
            :disabled="busyId === item.item_id"
          >Defer</button>
          <button
            class="row__tray-btn row__tray-btn--pin"
            @click="onAction(item, 'pin')"
            :disabled="busyId === item.item_id"
          >Pin</button>
        </div>

        <!-- swipeable body -->
        <div
          class="row__body"
          :style="bodyStyle(item.item_id)"
          @pointerdown="onPointerDown($event, item.item_id)"
          @pointermove="onPointerMove($event, item.item_id)"
          @pointerup="onPointerUp($event, item.item_id)"
          @pointercancel="onPointerUp($event, item.item_id)"
          @click="onRowClick(item)"
        >
          <span class="row__dot" :class="`row__dot--${item.urgency}`" :title="`urgency: ${item.urgency}`"></span>

          <div class="row__main">
            <div class="row__top">
              <span class="row__title">{{ item.title }}</span>
              <span v-if="item.pinned" class="row__pin" title="pinned">📌</span>
            </div>
            <div v-if="openId === item.item_id" class="row__detail">
              <p v-if="item.preview && item.preview !== item.title" class="row__preview">{{ item.preview }}</p>
              <div class="row__meta">
                <span>{{ item.origin }}</span>
                <span>·</span>
                <span :title="item.created">{{ timeAgo(item.created) }}</span>
                <template v-if="item.related_artifact">
                  <span>·</span>
                  <span class="row__artifact">{{ item.related_artifact }}</span>
                </template>
                <template v-if="item.type">
                  <span>·</span>
                  <span class="row__type">{{ item.type }}</span>
                </template>
              </div>
              <div class="row__actions">
                <button
                  v-for="a in item.actions"
                  :key="a.verb"
                  class="row__act"
                  :class="actClass(a.verb)"
                  :disabled="busyId === item.item_id"
                  @click.stop="onAction(item, a.verb)"
                >{{ a.label }}</button>
              </div>
            </div>
          </div>

          <span v-if="openId !== item.item_id" class="row__time">{{ timeAgo(item.created) }}</span>
        </div>
      </li>
    </ul>

    <div v-else class="today__empty">Queue is empty.</div>

    <ul v-if="showCompleted && completedToday.length" class="today__done-list">
      <li v-for="item in completedToday" :key="item.item_id" class="today__done-row">
        <span class="row__dot row__dot--done" aria-hidden="true"></span>
        <span class="today__done-title">{{ item.title }}</span>
        <span class="row__time">{{ timeAgo(item.operator_done_at || item.updated) }}</span>
      </li>
    </ul>
  </article>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useAtlasToday, type TodayItem, type TodayUrgency } from '../../../composables/useAtlasToday';
import { useSpeechToText } from '../../../composables/useSpeechToText';

const { queue, completedToday, deferred, loading, addItem, actionItem } = useAtlasToday();

const addText = ref('');
const addUrgency = ref<TodayUrgency>('green');
const adding = ref(false);

// Mic dictation for the add field
const { supported: speechSupported, listening, transcript: speechTranscript, toggle: speechToggle } = useSpeechToText();
let speechBaseline = '';
watch(speechTranscript, (t) => { if (t) addText.value = (speechBaseline ? speechBaseline + ' ' : '') + t; });
function onMic() {
  if (!listening.value) speechBaseline = addText.value.trim();
  speechToggle();
}
const busyId = ref<string | null>(null);
const showCompleted = ref(false);
const actionMsg = ref('');
const actionMsgIsError = ref(false);

// expand state — one row open at a time keeps the list scannable
const openId = ref<string | null>(null);

// swipe state — one row swipes at a time
const swipeId = ref<string | null>(null);
const swipeX = ref(0);
const swipeStartX = ref(0);
const swipeStartDx = ref(0);
const swiping = ref(false);
const TRAY_RIGHT_WIDTH = 144; // 2 buttons × 72px
const TRAY_LEFT_WIDTH = 88;
const SWIPE_LOCK_PX = 8;       // dx must exceed this to suppress click

function flash(msg: string, isError = false) {
  actionMsg.value = msg;
  actionMsgIsError.value = isError;
  setTimeout(() => { if (actionMsg.value === msg) actionMsg.value = ''; }, 3000);
}

async function onAdd() {
  const t = addText.value.trim();
  if (!t || adding.value) return;
  adding.value = true;
  try {
    const r = await addItem(t, addUrgency.value);
    if (r.ok) { addText.value = ''; addUrgency.value = 'green'; }
    else flash(r.message, true);
  } finally { adding.value = false; }
}

async function onAction(item: TodayItem, verb: string) {
  if (busyId.value) return;
  busyId.value = item.item_id;
  resetSwipe();
  try {
    const r = await actionItem(item.item_id, verb);
    if (!r.ok) flash(r.message, true);
  } finally { busyId.value = null; }
}

function primaryLabel(item: TodayItem): string {
  const first = item.actions?.[0]?.verb;
  if (first === 'approve') return 'Approve';
  if (first === 'done')    return 'Done';
  return 'Done';
}
async function onPrimary(item: TodayItem) {
  const verb = item.actions?.[0]?.verb || 'done';
  await onAction(item, verb);
}

function onRowClick(item: TodayItem) {
  if (swiping.value) { swiping.value = false; return; } // swipe just ended; eat the click
  if (swipeId.value && swipeX.value !== 0) { resetSwipe(); return; }
  openId.value = openId.value === item.item_id ? null : item.item_id;
}

function actClass(verb: string) {
  if (verb === 'approve' || verb === 'done') return 'row__act--primary';
  if (verb === 'reject')                    return 'row__act--danger';
  return '';
}

// ---- swipe handlers ----
function onPointerDown(e: PointerEvent, id: string) {
  // Mouse-right-button = let the browser handle context menu
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  swipeId.value = id;
  swipeStartX.value = e.clientX;
  swipeStartDx.value = swipeX.value;
  swiping.value = false;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}
function onPointerMove(e: PointerEvent, id: string) {
  if (swipeId.value !== id) return;
  const dx = (e.clientX - swipeStartX.value) + swipeStartDx.value;
  if (Math.abs(dx) > SWIPE_LOCK_PX) swiping.value = true;
  // Constrain — can swipe left up to right-tray width, right up to left-tray width
  swipeX.value = Math.max(-TRAY_RIGHT_WIDTH, Math.min(TRAY_LEFT_WIDTH, dx));
}
function onPointerUp(e: PointerEvent, id: string) {
  if (swipeId.value !== id) return;
  try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
  const dx = swipeX.value;
  // Snap thresholds: ~half the tray width
  if (dx < -TRAY_RIGHT_WIDTH / 2)    swipeX.value = -TRAY_RIGHT_WIDTH;
  else if (dx > TRAY_LEFT_WIDTH / 2) swipeX.value = TRAY_LEFT_WIDTH;
  else                               swipeX.value = 0;
  if (swipeX.value === 0) swipeId.value = null;
}
function resetSwipe() {
  swipeId.value = null;
  swipeX.value = 0;
  swiping.value = false;
}
function bodyStyle(id: string) {
  if (swipeId.value !== id) return {};
  return {
    transform: `translateX(${swipeX.value}px)`,
    transition: swiping.value ? 'none' : 'transform 200ms ease',
  };
}

function timeAgo(iso: string): string {
  try {
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) return '';
    const s = Math.floor((Date.now() - t) / 1000);
    if (s < 60)      return `${s}s`;
    if (s < 3600)    return `${Math.floor(s / 60)}m`;
    if (s < 86_400)  return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86_400)}d`;
  } catch { return ''; }
}
</script>

<style scoped>
.card {
  background: var(--atlas-card-bg);
  border-radius: 20px;
  padding: 24px 28px;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif;
}
@media (max-width: 1023px) { .card { padding: 20px 22px; } }

.today { display: flex; flex-direction: column; }
.today__head { display: flex; align-items: baseline; gap: 8px; }
.card-eyebrow { font-size: 12px; font-weight: 500; letter-spacing: 0.06em; text-transform: uppercase; color: var(--atlas-text-secondary); }
.today__count { font-size: 12px; font-weight: 600; color: var(--atlas-text-secondary); font-variant-numeric: tabular-nums; }
.today__deferred, .today__loading { font-size: 12px; color: var(--atlas-text-muted, var(--atlas-text-secondary)); }
.today__viewdone {
  margin-left: auto;
  background: transparent; border: 0; padding: 0;
  font-size: 13px; font-weight: 500; color: var(--atlas-blue); cursor: pointer;
}
.today__viewdone:hover { opacity: 0.7; }

/* ---- add row ---- */
.today__add {
  display: grid;
  grid-template-columns: 1fr 32px 96px 56px;
  gap: 8px;
  margin-top: 16px;
}
@media (max-width: 1023px) { .today__add { grid-template-columns: 1fr 32px 90px 56px; } }
.today__add-mic {
  width: 32px; height: 32px;
  background: transparent; border: 1px solid var(--atlas-hairline);
  color: var(--atlas-text-secondary); border-radius: 8px;
  cursor: pointer; padding: 0;
  display: inline-flex; align-items: center; justify-content: center;
}
.today__add-mic:hover:not(:disabled) { color: var(--atlas-text-primary); }
.today__add-mic.is-on { color: var(--atlas-red); border-color: var(--atlas-red); animation: today-mic-pulse 1.4s infinite ease-in-out; }
.today__add-mic:disabled { opacity: 0.4; cursor: not-allowed; }
@keyframes today-mic-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(255,59,48,0.30); }
  50%      { box-shadow: 0 0 0 6px rgba(255,59,48,0); }
}
.today__add-input, .today__add-urgency {
  height: 32px; padding: 0 10px; min-width: 0;
  border: 1px solid var(--atlas-hairline); border-radius: 8px;
  background: var(--atlas-card-bg-2, #FFF); color: var(--atlas-text-primary);
  font-size: 13px; outline: none;
}
.today__add-input::placeholder { color: var(--atlas-text-secondary); opacity: 0.7; }
.today__add-input:focus, .today__add-urgency:focus { border-color: var(--atlas-blue); box-shadow: 0 0 0 2px var(--atlas-blue-soft); }
.today__add-urgency { padding: 0 6px; }
.today__add-btn {
  height: 32px; border: 0; border-radius: 8px;
  background: var(--atlas-blue); color: #FFF;
  font-size: 12.5px; font-weight: 600; cursor: pointer;
}
.today__add-btn:hover:not(:disabled) { background: var(--atlas-blue-hover); }
.today__add-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* ---- flash ---- */
.today__flash { margin: 8px 0 0; font-size: 12px; color: var(--atlas-text-secondary); }
.today__flash--err { color: var(--atlas-red); }

/* ---- list ---- */
.today__list { margin: 16px 0 0; padding: 0; list-style: none; }

/* ---- row ---- */
.row {
  position: relative;
  overflow: hidden;
  border-top: 1px solid var(--atlas-hairline);
  user-select: none;
  background: var(--atlas-card-bg);
}
.row:first-child { border-top: 0; }

/* swipe trays sit behind the body, exposed when body slides */
.row__tray {
  position: absolute;
  top: 0;
  bottom: 0;
  display: flex;
  align-items: stretch;
}
.row__tray--right { right: 0; }
.row__tray--left  { left: 0; }

.row__tray-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  border: 0;
  font-size: 13px;
  font-weight: 600;
  color: #FFF;
  cursor: pointer;
  font-family: inherit;
}
.row__tray-btn--ghost   { background: var(--atlas-text-secondary); }
.row__tray-btn--pin     { background: var(--atlas-yellow); }
.row__tray-btn--primary { background: var(--atlas-blue); width: 88px; }
.row__tray-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.row__body {
  position: relative;
  z-index: 1;
  background: var(--atlas-card-bg);
  display: grid;
  grid-template-columns: 10px 1fr auto;
  align-items: center;
  gap: 12px;
  padding: 14px 4px;
  cursor: pointer;
  touch-action: pan-y;
  transition: transform 200ms ease;
}
.row__body:hover { background: var(--atlas-card-bg-2, var(--atlas-card-bg)); }

.row__dot { width: 10px; height: 10px; border-radius: 50%; background: var(--atlas-text-muted, var(--atlas-text-secondary)); }
.row__dot--red    { background: var(--atlas-red); }
.row__dot--yellow { background: var(--atlas-yellow); }
.row__dot--green  { background: var(--atlas-green); }
.row__dot--white  { background: var(--atlas-hairline); }
.row__dot--done   { background: var(--atlas-green); opacity: 0.5; }

.row__main { min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.row__top { display: flex; align-items: baseline; gap: 6px; min-width: 0; }
.row__title {
  font-size: 15px;
  font-weight: 500;
  color: var(--atlas-text-primary);
  line-height: 1.4;
  word-break: break-word;
}
.row--open .row__title { white-space: normal; }
.row:not(.row--open) .row__title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.row__pin { font-size: 12px; line-height: 1; flex: none; }

.row__time {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  font-size: 12.5px;
  color: var(--atlas-text-muted, var(--atlas-text-secondary));
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* expanded detail */
.row__detail { display: flex; flex-direction: column; gap: 8px; }
.row__preview { margin: 0; font-size: 14px; color: var(--atlas-text-primary); opacity: 0.85; line-height: 1.5; word-break: break-word; }
.row__meta {
  display: flex; flex-wrap: wrap; gap: 6px;
  font-size: 12px; color: var(--atlas-text-secondary);
}
.row__artifact, .row__type {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  opacity: 0.85;
}
.row__actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 2px; }
.row__act {
  border: 1px solid var(--atlas-hairline);
  background: transparent;
  color: var(--atlas-text-primary);
  font-size: 13px;
  font-weight: 500;
  padding: 6px 14px;
  border-radius: 7px;
  cursor: pointer;
  font-family: inherit;
  transition: background-color 100ms ease, color 100ms ease, border-color 100ms ease;
}
.row__act:hover:not(:disabled) { background: rgba(0,0,0,0.04); }
.row__act:disabled { opacity: 0.4; cursor: not-allowed; }
.row__act--primary { border-color: var(--atlas-blue); color: var(--atlas-blue); }
.row__act--primary:hover:not(:disabled) { background: var(--atlas-blue); color: #FFF; }
.row__act--danger  { color: var(--atlas-red); }
.row__act--danger:hover:not(:disabled)  { background: var(--atlas-red); border-color: var(--atlas-red); color: #FFF; }

/* swipe-state hints (subtle) */
.row--swipe-left  .row__tray--right { box-shadow: -8px 0 16px rgba(0,0,0,0.05); }
.row--swipe-right .row__tray--left  { box-shadow:  8px 0 16px rgba(0,0,0,0.05); }

/* ---- empty + completed ---- */
.today__empty { margin-top: 16px; font-size: 14px; color: var(--atlas-text-secondary); }

.today__done-list {
  margin: 10px 0 0; padding: 10px 0 0;
  list-style: none; border-top: 1px solid var(--atlas-hairline);
  display: flex; flex-direction: column; gap: 6px;
}
.today__done-row {
  display: grid; grid-template-columns: 10px 1fr auto;
  align-items: center; gap: 10px;
  font-size: 13px; color: var(--atlas-text-secondary);
}
.today__done-title { text-decoration: line-through; opacity: 0.65; }
</style>
