import { ref } from 'vue'
import type { PlanqTask } from '../types'

// Module-level state — persists across component mount/unmount (e.g. panel collapse/expand)
// Keyed by stable task key (filename or description) rather than volatile DB ID.
const openTaskKeys = ref(new Set<string>())
const cachedContent = new Map<string, string | null>()

// Feedback panel state (investigate tasks)
const openFeedbackKeys = ref(new Set<string>())
const cachedFeedback = new Map<string, string | null>()

/** Stable key for a task that survives heartbeat DB sync cycles. */
export function taskStableKey(task: Pick<PlanqTask, 'id' | 'filename' | 'description'>): string {
  return task.filename ?? task.description ?? String(task.id)
}

export function useExpandedTasks() {
  function isOpen(key: string): boolean {
    return openTaskKeys.value.has(key)
  }

  function toggle(key: string): void {
    const s = new Set(openTaskKeys.value)
    if (s.has(key)) s.delete(key)
    else s.add(key)
    openTaskKeys.value = s
  }

  function close(key: string): void {
    if (openTaskKeys.value.has(key)) {
      const s = new Set(openTaskKeys.value)
      s.delete(key)
      openTaskKeys.value = s
    }
  }

  function getCached(key: string): string | null | undefined {
    return cachedContent.get(key)
  }

  function setCached(key: string, content: string | null): void {
    cachedContent.set(key, content)
  }

  function clearCached(key: string): void {
    cachedContent.delete(key)
  }

  function isFeedbackOpen(key: string): boolean {
    return openFeedbackKeys.value.has(key)
  }

  function toggleFeedback(key: string): void {
    const s = new Set(openFeedbackKeys.value)
    if (s.has(key)) s.delete(key)
    else s.add(key)
    openFeedbackKeys.value = s
  }

  function getFeedbackCached(key: string): string | null | undefined {
    return cachedFeedback.get(key)
  }

  function setFeedbackCached(key: string, content: string | null): void {
    cachedFeedback.set(key, content)
  }

  return { isOpen, toggle, close, getCached, setCached, clearCached, isFeedbackOpen, toggleFeedback, getFeedbackCached, setFeedbackCached }
}
