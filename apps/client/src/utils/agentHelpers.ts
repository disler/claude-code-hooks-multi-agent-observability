import type { AgentRegistryEntry } from '../types';

/** Lifecycle status color map — single source of truth */
export const LIFECYCLE_COLORS: Record<string, string> = {
  active: '#22C55E',
  completed: '#6B7280',
  errored: '#EF4444',
  idle: '#F59E0B',
};

/** CSS class map for lifecycle status dots */
export const LIFECYCLE_CLASSES: Record<string, string> = {
  active: 'status-active',
  completed: 'status-completed',
  errored: 'status-errored',
  idle: 'status-idle',
};

/** Get hex color for a lifecycle status */
export function getLifecycleColor(status: string): string {
  return LIFECYCLE_COLORS[status] || '#6B7280';
}

/** Get CSS class for a lifecycle status */
export function getLifecycleClass(status: string): string {
  return LIFECYCLE_CLASSES[status] || 'status-active';
}

/** Format a duration in milliseconds to a human-readable string */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

/** Find a registry entry by short agent ID (format: "app:session8chars") */
export function findRegistryEntryByShortId(
  registry: Map<string, AgentRegistryEntry> | undefined,
  agentId: string
): AgentRegistryEntry | undefined {
  if (!registry || registry.size === 0) return undefined;
  for (const entry of registry.values()) {
    const entryAgentId = `${entry.source_app}:${entry.session_id.slice(0, 8)}`;
    if (entryAgentId === agentId) return entry;
  }
  return undefined;
}

/** Group agent IDs by team name using the registry */
export function groupAgentsByTeam(
  agentIds: string[],
  registry: Map<string, AgentRegistryEntry> | undefined
): { teams: Map<string, string[]>; standalone: string[] } {
  const teams = new Map<string, string[]>();
  const standalone: string[] = [];

  for (const agentId of agentIds) {
    const entry = findRegistryEntryByShortId(registry, agentId);
    if (entry?.team_name) {
      if (!teams.has(entry.team_name)) teams.set(entry.team_name, []);
      teams.get(entry.team_name)!.push(agentId);
    } else {
      standalone.push(agentId);
    }
  }

  return { teams, standalone };
}
