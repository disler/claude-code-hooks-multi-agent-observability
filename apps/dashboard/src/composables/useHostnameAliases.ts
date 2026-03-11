import { ref } from 'vue'
import { API_BASE } from '../config'

// Singleton state
const aliases = ref<Record<string, string>>({})
let loaded = false

export function useHostnameAliases() {
  async function load() {
    if (loaded) return
    loaded = true
    try {
      const res = await fetch(`${API_BASE}/dashboard/hostname-aliases`)
      if (res.ok) aliases.value = await res.json()
    } catch {
      // ignore — no aliases
    }
  }

  function alias(hostname: string): string {
    return aliases.value[hostname] ?? hostname
  }

  return { aliases, load, alias }
}
