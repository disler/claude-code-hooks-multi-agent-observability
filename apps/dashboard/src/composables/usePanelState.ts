import { ref } from 'vue'

// Module-level singletons: panel open/closed state keyed by hostname or container ID.
// Stored outside components so state survives re-renders and potential remounts.
const hostGroupOpen = new Map<string, boolean>()
const planqPanelOpen = new Map<string, boolean>()

export function useHostGroupState(hostname: string, defaultOpen: boolean) {
  const stored = hostGroupOpen.get(hostname)
  const open = ref(stored !== undefined ? stored : defaultOpen)

  function setOpen(value: boolean) {
    open.value = value
    hostGroupOpen.set(hostname, value)
  }

  function toggle() {
    setOpen(!open.value)
  }

  return { open, setOpen, toggle }
}

export function usePlanqPanelState(containerId: string) {
  const stored = planqPanelOpen.get(containerId)
  const open = ref(stored !== undefined ? stored : true)

  function setOpen(value: boolean) {
    open.value = value
    planqPanelOpen.set(containerId, value)
  }

  function toggle() {
    setOpen(!open.value)
  }

  return { open, toggle }
}
