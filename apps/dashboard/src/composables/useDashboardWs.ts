import { ref, onUnmounted } from 'vue'
import { WS_BASE } from '../config'
import type { DashboardMessage } from '../types'

const LOG_CONNECTIVITY = false

export function useDashboardWs(onMessage: (msg: DashboardMessage) => void) {
  const connected = ref(false)
  let ws: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let backoff = 1000

  function connect() {
    ws = new WebSocket(`${WS_BASE}/dashboard/stream`)

    ws.onopen = () => {
      if (LOG_CONNECTIVITY) console.log('[dashboard-ws] connected to', `${WS_BASE}/dashboard/stream`)
      connected.value = true
      backoff = 1000
    }

    ws.onmessage = (event) => {
      try {
        const msg: DashboardMessage = JSON.parse(event.data)
        if (LOG_CONNECTIVITY) {
          if (msg.type === 'initial') {
            const summary = msg.data.map(c => `${c.id}(host=${c.machine_hostname},connected=${c.connected},status=${c.status})`).join(', ')
            console.log(`[dashboard-ws] initial: ${msg.data.length} container(s): [${summary}]`)
          } else if (msg.type === 'container_update') {
            console.log(`[dashboard-ws] container_update: ${msg.data.id} host=${msg.data.machine_hostname} container=${msg.data.container_hostname} connected=${msg.data.connected} status=${msg.data.status}`)
          } else if (msg.type === 'container_removed') {
            console.log(`[dashboard-ws] container_removed: ${msg.data.id}`)
          } else if (msg.type === 'agent_update') {
            console.log(`[dashboard-ws] agent_update: source=${msg.data.source_repo} session=${msg.data.session_id?.slice(0,8)} status=${msg.data.status}`)
          } else {
            console.log(`[dashboard-ws] message type=${(msg as any).type}`)
          }
        }
        onMessage(msg)
      } catch (e) {
        console.error('[dashboard-ws] failed to parse message:', e, 'raw:', event.data?.slice(0, 200))
      }
    }

    ws.onclose = () => {
      if (LOG_CONNECTIVITY) console.log('[dashboard-ws] disconnected, reconnecting in', backoff, 'ms')
      connected.value = false
      ws = null
      reconnectTimer = setTimeout(() => {
        backoff = Math.min(backoff * 2, 30000)
        connect()
      }, backoff)
    }

    ws.onerror = (e) => {
      if (LOG_CONNECTIVITY) console.error('[dashboard-ws] error:', e)
      ws?.close()
    }
  }

  connect()

  onUnmounted(() => {
    if (reconnectTimer) clearTimeout(reconnectTimer)
    ws?.close()
  })

  function send(msg: object): void {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg))
    }
  }

  return { connected, send }
}
