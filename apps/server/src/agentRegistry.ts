import { upsertAgent, getAgent, getAllAgents, updateAgentField } from './db';
import type { HookEvent, AgentRegistryEntry } from './types';

export function processEventForRegistry(event: HookEvent): { entry: AgentRegistryEntry | null; isNew: boolean; changed: boolean } {
  const now = event.timestamp || Date.now();
  const sessionShort = event.session_id.slice(0, 8);
  const baseId = `${event.source_app}:${sessionShort}`;

  // Check if this is a SubagentStart — creates a new child entry
  if (event.hook_event_type === 'SubagentStart') {
    const agentId = event.payload?.agent_id?.slice(0, 7) || `sub-${Date.now().toString(36)}`;
    const childId = `${event.source_app}:${agentId}`;
    const existing = getAgent(childId);
    const isNew = !existing;

    upsertAgent({
      id: childId,
      source_app: event.source_app,
      session_id: event.session_id,
      agent_type: event.payload?.agent_type || event.payload?.subagent_type || '',
      model_name: event.model_name || event.payload?.model_name || null,
      short_agent_id: agentId,
      parent_id: baseId,
      lifecycle_status: 'active',
      first_seen_at: isNew ? now : undefined,
      last_seen_at: now,
      event_count: (existing?.event_count || 0) + 1,
    });

    const entry = getAgent(childId);
    if (entry) {
      entry.display_name = computeDisplayName(entry);
      updateAgentField(childId, 'display_name', entry.display_name);
    }

    // Also ensure parent exists
    ensureParentAgent(event, now);

    return { entry, isNew, changed: true };
  }

  // SubagentStop — mark child as completed
  if (event.hook_event_type === 'SubagentStop') {
    const agentId = event.payload?.agent_id?.slice(0, 7) || `sub-${Date.now().toString(36)}`;
    const childId = `${event.source_app}:${agentId}`;
    const existing = getAgent(childId);

    if (existing) {
      updateAgentField(childId, 'lifecycle_status', 'completed');
      updateAgentField(childId, 'last_seen_at', now);
      updateAgentField(childId, 'event_count', existing.event_count + 1);
      const entry = getAgent(childId);
      return { entry, isNew: false, changed: true };
    }

    // If child doesn't exist yet, create it as completed
    upsertAgent({
      id: childId,
      source_app: event.source_app,
      session_id: event.session_id,
      short_agent_id: agentId,
      parent_id: baseId,
      lifecycle_status: 'completed',
      first_seen_at: now,
      last_seen_at: now,
      event_count: 1,
    });
    const entry = getAgent(childId);
    if (entry) {
      entry.display_name = computeDisplayName(entry);
      updateAgentField(childId, 'display_name', entry.display_name);
    }
    return { entry, isNew: true, changed: true };
  }

  // All other events apply to the session-level agent (parent)
  const existing = getAgent(baseId);
  const isNew = !existing;
  let changed = isNew;

  // Ensure the agent entry exists
  if (isNew) {
    upsertAgent({
      id: baseId,
      source_app: event.source_app,
      session_id: event.session_id,
      model_name: event.model_name || null,
      lifecycle_status: 'active',
      first_seen_at: now,
      last_seen_at: now,
      event_count: 1,
    });
  } else {
    updateAgentField(baseId, 'last_seen_at', now);
    updateAgentField(baseId, 'event_count', (existing.event_count || 0) + 1);
  }

  // Event-specific processing
  switch (event.hook_event_type) {
    case 'SessionStart': {
      const agentType = event.payload?.agent_type || event.payload?.subagent_type || '';
      const modelName = event.model_name || event.payload?.model_name || null;
      if (agentType) { updateAgentField(baseId, 'agent_type', agentType); changed = true; }
      if (modelName) { updateAgentField(baseId, 'model_name', modelName); changed = true; }
      break;
    }

    case 'SessionEnd':
    case 'Stop': {
      updateAgentField(baseId, 'lifecycle_status', 'completed');
      changed = true;
      break;
    }

    case 'UserPromptSubmit': {
      const current = getAgent(baseId);
      if (current && !current.first_prompt && event.payload?.prompt) {
        const prompt = String(event.payload.prompt).slice(0, 80);
        updateAgentField(baseId, 'first_prompt', prompt);
        changed = true;
      }
      break;
    }

    case 'TeammateIdle': {
      updateAgentField(baseId, 'lifecycle_status', 'idle');
      changed = true;
      break;
    }

    case 'PreToolUse': {
      const toolName = event.payload?.tool_name;
      if (toolName === 'TeamCreate' && event.payload?.tool_input?.team_name) {
        updateAgentField(baseId, 'team_name', event.payload.tool_input.team_name);
        changed = true;
      }
      break;
    }
  }

  // Update display name if this is a new agent or something changed
  if (changed) {
    const entry = getAgent(baseId);
    if (entry) {
      const newName = computeDisplayName(entry);
      if (newName !== entry.display_name) {
        updateAgentField(baseId, 'display_name', newName);
      }
    }
  }

  const entry = getAgent(baseId);
  return { entry, isNew, changed };
}

function ensureParentAgent(event: HookEvent, now: number): void {
  const sessionShort = event.session_id.slice(0, 8);
  const baseId = `${event.source_app}:${sessionShort}`;
  const existing = getAgent(baseId);

  if (!existing) {
    upsertAgent({
      id: baseId,
      source_app: event.source_app,
      session_id: event.session_id,
      model_name: event.model_name || null,
      lifecycle_status: 'active',
      first_seen_at: now,
      last_seen_at: now,
      event_count: 0,
    });
    const entry = getAgent(baseId);
    if (entry) {
      entry.display_name = computeDisplayName(entry);
      updateAgentField(baseId, 'display_name', entry.display_name);
    }
  }
}

export function getAgentHierarchy(): AgentRegistryEntry[] {
  const all = getAllAgents();

  // Assign disambiguated display names
  assignDisplayNames(all);

  const parentMap = new Map<string, AgentRegistryEntry>();
  const children: AgentRegistryEntry[] = [];

  for (const agent of all) {
    if (agent.parent_id) {
      children.push(agent);
    } else {
      agent.children = [];
      parentMap.set(agent.id, agent);
    }
  }

  for (const child of children) {
    const parent = parentMap.get(child.parent_id!);
    if (parent) {
      parent.children!.push(child);
    }
  }

  return Array.from(parentMap.values());
}

// Display name computation

export function computeDisplayName(entry: { source_app: string; agent_type: string | null; short_agent_id: string | null; session_id: string }): string {
  const projectShort = deriveProjectShort(entry.source_app);

  if (entry.agent_type) {
    return `${projectShort}/${entry.agent_type}`;
  }

  // Fallback: use truncated session ID
  return `${projectShort}/${entry.session_id.slice(0, 8)}`;
}

function deriveProjectShort(sourceApp: string): string {
  const parts = sourceApp.split('-');
  const meaningful = parts.filter(p => !['cc', 'hook', 'claude', 'code'].includes(p));
  if (meaningful.length === 0) return sourceApp.slice(0, 6);

  // Use last segment, abbreviated
  const last = meaningful[meaningful.length - 1] ?? sourceApp.slice(0, 6);
  return last.length > 10 ? last.slice(0, 8) : last;
}

export function assignDisplayNames(agents: AgentRegistryEntry[]): void {
  const typeAgents: Record<string, AgentRegistryEntry[]> = {};

  for (const agent of agents) {
    const base = computeDisplayName(agent);
    if (!typeAgents[base]) typeAgents[base] = [];
    typeAgents[base].push(agent);
  }

  for (const [base, group] of Object.entries(typeAgents)) {
    if (group.length === 1) {
      group[0]!.display_name = base;
    } else {
      group.forEach((agent, i) => {
        agent.display_name = `${base}-${String.fromCharCode(97 + i)}`;
      });
    }
  }
}
