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
    // In-place mutation — never replace containers.value, so Vue preserves all
    // component instances and their local state (filters, open panels, etc.).
    for (const c of data) containers.value.set(c.id, c)
  } catch {
    // ignore
  }
}

function handleMessage(msg: DashboardMessage) {
  if (msg.type === 'initial') {
    // Merge rather than replace: update/add containers from the server's list, but
    // keep any existing containers that are absent from this message (they may have
    // temporarily dropped during a WS reconnect window).  Explicit removals arrive
    // via container_removed messages; an absence from 'initial' alone is not
    // authoritative enough to destroy component state such as open dialogs or
    // in-progress task edits.
    //
    // Mutate in-place so Vue never destroys and recreates component instances —
    // this preserves ephemeral UI state (open dialogs, filter selections, etc.).
    for (const c of msg.data) containers.value.set(c.id, c)
  } else if (msg.type === 'container_update') {
    containers.value.set(msg.data.id, msg.data)
  } else if (msg.type === 'container_removed') {
    containers.value.delete(msg.data.id)
  } else if (msg.type === 'planq_update') {
    const c = containers.value.get(msg.data.container_id)
    if (c) containers.value.set(c.id, { ...c, planq_tasks: msg.data.tasks })
  } else if (msg.type === 'agent_update') {
    // Update session status within matching containers
    for (const [id, c] of containers.value) {
      if (c.source_repo === msg.data.source_repo && c.active_session_ids.includes(msg.data.session_id)) {
        const sessions = c.sessions.map(s =>
          s.session_id === msg.data.session_id
            ? { ...s, status: msg.data.status as any, last_prompt: msg.data.last_prompt, last_response_summary: msg.data.last_response_summary }
            : s
        )
        containers.value.set(id, { ...c, sessions })
      }
    }
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

function updatePlanqTaskOptimistic(containerId: string, taskId: number, updates: Record<string, unknown>) {
  const c = containers.value.get(containerId)
  if (!c) return
  const tasks = c.planq_tasks?.map(t => t.id === taskId ? { ...t, ...updates } : t) ?? []
  containers.value.set(c.id, { ...c, planq_tasks: tasks })
}

export function useContainers() {
  return { containers, byHost, summary, handleMessage, updatePlanqTaskOptimistic }
}
