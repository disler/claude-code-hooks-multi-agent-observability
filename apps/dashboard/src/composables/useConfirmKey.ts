/**
 * Returns a keydown handler that fires `fn` when the platform confirm shortcut
 * is pressed: Cmd+Enter or Cmd+S on macOS, Ctrl+Enter or Ctrl+S elsewhere.
 *
 * Usage: @keydown="onConfirmKey($event, save)"
 */
export function useConfirmKey() {
  function onConfirmKey(e: KeyboardEvent, fn: () => void) {
    const mod = e.metaKey || e.ctrlKey
    if (!mod) return
    if (e.key === 'Enter' || e.key === 's' || e.key === 'S') {
      e.preventDefault()
      fn()
    }
  }
  return { onConfirmKey }
}
