import { ref, computed } from 'vue';
import type { AgentRegistryEntry } from '../types';
import { API_BASE_URL } from '../config';

const agents = ref<Map<string, AgentRegistryEntry>>(new Map());

export function useAgentRegistry() {
  // Fetch initial state
  async function fetchAgents() {
    try {
      const res = await fetch(`${API_BASE_URL}/api/agents`);
      const data: AgentRegistryEntry[] = await res.json();
      agents.value.clear();
      const flatten = (entries: AgentRegistryEntry[]) => {
        for (const entry of entries) {
          agents.value.set(entry.id, entry);
          if (entry.children) flatten(entry.children);
        }
      };
      flatten(data);
    } catch (e) {
      console.error('Failed to fetch agents:', e);
    }
  }

  // Handle WebSocket agent_update message
  function handleAgentUpdate(entry: AgentRegistryEntry) {
    agents.value.set(entry.id, entry);
  }

  // Handle WebSocket agent_registry message (full initial load)
  function handleAgentRegistry(entries: AgentRegistryEntry[]) {
    agents.value.clear();
    const flatten = (list: AgentRegistryEntry[]) => {
      for (const e of list) {
        agents.value.set(e.id, e);
        if (e.children) flatten(e.children);
      }
    };
    flatten(entries);
  }

  // Computed: tree structure (parents with children nested)
  const agentTree = computed(() => {
    const parents: AgentRegistryEntry[] = [];
    const childMap = new Map<string, AgentRegistryEntry[]>();

    for (const agent of agents.value.values()) {
      if (agent.parent_id) {
        if (!childMap.has(agent.parent_id)) childMap.set(agent.parent_id, []);
        childMap.get(agent.parent_id)!.push(agent);
      } else {
        parents.push({ ...agent, children: [] });
      }
    }

    for (const parent of parents) {
      parent.children = childMap.get(parent.id) || [];
    }

    return parents;
  });

  // Computed: agents grouped by team
  const agentsByTeam = computed(() => {
    const teams = new Map<string, AgentRegistryEntry[]>();
    const standalone: AgentRegistryEntry[] = [];

    for (const agent of agents.value.values()) {
      if (agent.parent_id) continue; // Skip children (they're nested under parents)
      if (agent.team_name) {
        if (!teams.has(agent.team_name)) teams.set(agent.team_name, []);
        teams.get(agent.team_name)!.push(agent);
      } else {
        standalone.push(agent);
      }
    }

    return { teams, standalone };
  });

  function getDisplayName(agentId: string): string {
    return agents.value.get(agentId)?.display_name || agentId;
  }

  function getLifecycleStatus(agentId: string): string {
    return agents.value.get(agentId)?.lifecycle_status || 'active';
  }

  function getAgent(agentId: string): AgentRegistryEntry | undefined {
    return agents.value.get(agentId);
  }

  return {
    agents,
    agentTree,
    agentsByTeam,
    fetchAgents,
    handleAgentUpdate,
    handleAgentRegistry,
    getDisplayName,
    getLifecycleStatus,
    getAgent
  };
}
