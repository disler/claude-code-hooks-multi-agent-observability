import { ref, onUnmounted } from 'vue'
import { WS_BASE } from '../config'
import type { DashboardMessage } from '../types'

export function useDashboardWs(onMessage: (msg: DashboardMessage) => void) {
  const connected = ref(false)
  let ws: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let backoff = 1000

  function connect() {
    ws = new WebSocket(`${WS_BASE}/dashboard/stream`)

    ws.onopen = () => {
      connected.value = true
      backoff = 1000
    }

    ws.onmessage = (event) => {
      try {
        const msg: DashboardMessage = JSON.parse(event.data)
        onMessage(msg)
      } catch {
        // ignore malformed messages
      }
    }

    ws.onclose = () => {
      connected.value = false
      ws = null
      reconnectTimer = setTimeout(() => {
        backoff = Math.min(backoff * 2, 30000)
        connect()
      }, backoff)
    }

    ws.onerror = () => {
      ws?.close()
    }
  }

  connect()

  onUnmounted(() => {
    if (reconnectTimer) clearTimeout(reconnectTimer)
    ws?.close()
  })

  return { connected }
}
