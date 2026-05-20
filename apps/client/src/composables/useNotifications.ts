// Web Notifications integration. Subscribes once to drift signals + audit
// "blocked" outcomes. Operator must grant permission once.
import { onMounted, onUnmounted } from 'vue';
import type { Ref } from 'vue';
import type { HookEvent } from '../types';

const SEEN_KEY = 'atlas.notifiedEvents';
function loadSeen(): Set<string> {
  try { const raw = localStorage.getItem(SEEN_KEY); if (raw) return new Set(JSON.parse(raw)); } catch {}
  return new Set();
}
function persistSeen(s: Set<string>) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...s].slice(-200))); } catch {}
}

export function useNotifications(events: Ref<HookEvent[]>) {
  let lastSeenIds = loadSeen();
  let timer: number | null = null;

  async function ensurePermission() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    const r = await Notification.requestPermission();
    return r === 'granted';
  }

  function notify(title: string, body: string) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try { new Notification(title, { body, icon: '/favicon.ico' }); } catch {}
  }

  function scan() {
    for (const e of events.value) {
      const id = `${e.id || ''}-${e.timestamp || ''}`;
      if (lastSeenIds.has(id)) continue;
      lastSeenIds.add(id);
      // Surface noteworthy events:
      const p: any = e.payload || {};
      const sum = p.summary || e.summary || '';
      if (e.hook_event_type === 'EventHandlerAutoPaused' || /auto[-_]paused/i.test(sum)) {
        notify('Atlas: handler auto-paused', sum.slice(0, 140));
      } else if (e.hook_event_type === 'SecurityBadSignatureBurst') {
        notify('Atlas: bad webhook signatures', `Burst on ${p.source || 'webhook'}`);
      } else if (e.hook_event_type === 'ScoutTrialConcern') {
        notify('Atlas: scout trial concern', sum.slice(0, 140));
      } else if (p.outcome === 'blocked' && /hard_block|escalation|drift/i.test(p.action || '')) {
        notify('Atlas: blocked autonomous action', `${p.action}: ${sum.slice(0, 100)}`);
      }
    }
    persistSeen(lastSeenIds);
  }

  onMounted(() => {
    ensurePermission();
    // First scan after a short delay so initial event load doesn't fire 30 toasts.
    setTimeout(() => { scan(); }, 4000);
    timer = window.setInterval(scan, 20_000);
  });
  onUnmounted(() => { if (timer) clearInterval(timer); });

  return { ensurePermission };
}
