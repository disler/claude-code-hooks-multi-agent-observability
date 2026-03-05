import { ref, watch } from 'vue'

const STORAGE_KEY = 'planq-hidden-sessions'

function loadFromStorage(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return new Set<string>(parsed)
  } catch {}
  return new Set()
}

function saveToStorage(ids: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]))
  } catch {}
}

// Singleton — shared across all component instances
const hiddenIds = ref<Set<string>>(loadFromStorage())
watch(hiddenIds, (ids) => saveToStorage(ids), { deep: true })

export function useHiddenSessions() {
  function hide(sessionId: string) {
    const next = new Set(hiddenIds.value)
    next.add(sessionId)
    hiddenIds.value = next
  }

  function show(sessionId: string) {
    const next = new Set(hiddenIds.value)
    next.delete(sessionId)
    hiddenIds.value = next
  }

  function showAll(sessionIds: string[]) {
    const next = new Set(hiddenIds.value)
    for (const id of sessionIds) next.delete(id)
    hiddenIds.value = next
  }

  function isExplicitlyHidden(sessionId: string): boolean {
    return hiddenIds.value.has(sessionId)
  }

  return { hide, show, showAll, isExplicitlyHidden }
}
