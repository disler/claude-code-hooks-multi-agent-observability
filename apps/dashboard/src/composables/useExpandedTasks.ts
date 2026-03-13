import { ref } from 'vue'

// Module-level state — persists across component mount/unmount (e.g. panel collapse/expand)
const openTaskIds = ref(new Set<number>())
const cachedContent = new Map<number, string | null>()

// Feedback panel state (investigate tasks)
const openFeedbackIds = ref(new Set<number>())
const cachedFeedback = new Map<number, string | null>()

export function useExpandedTasks() {
  function isOpen(taskId: number): boolean {
    return openTaskIds.value.has(taskId)
  }

  function toggle(taskId: number): void {
    const s = new Set(openTaskIds.value)
    if (s.has(taskId)) s.delete(taskId)
    else s.add(taskId)
    openTaskIds.value = s
  }

  function close(taskId: number): void {
    if (openTaskIds.value.has(taskId)) {
      const s = new Set(openTaskIds.value)
      s.delete(taskId)
      openTaskIds.value = s
    }
  }

  function getCached(taskId: number): string | null | undefined {
    return cachedContent.get(taskId)
  }

  function setCached(taskId: number, content: string | null): void {
    cachedContent.set(taskId, content)
  }

  function isFeedbackOpen(taskId: number): boolean {
    return openFeedbackIds.value.has(taskId)
  }

  function toggleFeedback(taskId: number): void {
    const s = new Set(openFeedbackIds.value)
    if (s.has(taskId)) s.delete(taskId)
    else s.add(taskId)
    openFeedbackIds.value = s
  }

  function getFeedbackCached(taskId: number): string | null | undefined {
    return cachedFeedback.get(taskId)
  }

  function setFeedbackCached(taskId: number, content: string | null): void {
    cachedFeedback.set(taskId, content)
  }

  return { isOpen, toggle, close, getCached, setCached, isFeedbackOpen, toggleFeedback, getFeedbackCached, setFeedbackCached }
}
