import { ref, computed } from 'vue'
import { API_BASE } from '../config'
import type { ContainerWithState, DashboardMessage } from '../types'

// Singleton state — shared across all callers so WS updates propagate everywhere.
const containers = ref<Map<string, ContainerWithState>>(new Map())

async function fetchInitial() {
  try {
    const res = await fetch(`${API_BASE}/dashboard/containers`)
    if (!res.ok) return
    const data: ContainerWithState[] = await res.json()
    const map = new Map<string, ContainerWithState>()
    for (const c of data) map.set(c.id, c)
    containers.value = map
  } catch {
    // ignore
  }
}

function handleMessage(msg: DashboardMessage) {
  if (msg.type === 'initial') {
    const map = new Map<string, ContainerWithState>()
    for (const c of msg.data) map.set(c.id, c)
    containers.value = map
  } else if (msg.type === 'container_update') {
    const updated = new Map(containers.value)
    updated.set(msg.data.id, msg.data)
    containers.value = updated
  } else if (msg.type === 'container_removed') {
    const updated = new Map(containers.value)
    updated.delete(msg.data.id)
    containers.value = updated
  } else if (msg.type === 'planq_update') {
    const updated = new Map(containers.value)
    const c = updated.get(msg.data.container_id)
    if (c) updated.set(c.id, { ...c, planq_tasks: msg.data.tasks })
    containers.value = updated
  } else if (msg.type === 'agent_update') {
    // Update session status within matching containers
    const updated = new Map(containers.value)
    for (const [id, c] of updated) {
      if (c.source_repo === msg.data.source_repo && c.active_session_ids.includes(msg.data.session_id)) {
        const sessions = c.sessions.map(s =>
          s.session_id === msg.data.session_id
            ? { ...s, status: msg.data.status as any, last_prompt: msg.data.last_prompt, last_response_summary: msg.data.last_response_summary }
            : s
        )
        updated.set(id, { ...c, sessions })
      }
    }
    containers.value = updated
  }
}

// Group by machine_hostname
const byHost = computed(() => {
  const map = new Map<string, ContainerWithState[]>()
  for (const c of containers.value.values()) {
    const host = c.machine_hostname
    if (!map.has(host)) map.set(host, [])
    map.get(host)!.push(c)
  }
  // Sort containers within each host
  for (const [, list] of map) {
    list.sort((a, b) => a.id.localeCompare(b.id))
  }
  return map
})

// Summary counts
const summary = computed(() => {
  let active = 0, awaitingInput = 0
  for (const c of containers.value.values()) {
    if (c.status === 'busy') active++
    else if (c.status === 'awaiting_input') awaitingInput++
  }
  return { hosts: byHost.value.size, containers: containers.value.size, active, awaitingInput }
})

fetchInitial()

export function useContainers() {
  return { containers, byHost, summary, handleMessage }
}
