// Apple-minimal: text labels, no emojis.
const eventTypeToLabel: Record<string, string> = {
  PreToolUse: 'Tool started',
  PostToolUse: 'Tool finished',
  PostToolUseFailure: 'Tool failed',
  PermissionRequest: 'Permission needed',
  Notification: 'Notification',
  Stop: 'Stopped',
  SubagentStart: 'Subagent started',
  SubagentStop: 'Subagent finished',
  PreCompact: 'Compacting',
  UserPromptSubmit: 'User prompt',
  SessionStart: 'Session started',
  SessionEnd: 'Session ended',
};

const eventTypeToShort: Record<string, string> = {
  PreToolUse: 'tool',
  PostToolUse: 'tool',
  PostToolUseFailure: 'fail',
  PermissionRequest: 'perm',
  Notification: 'note',
  Stop: 'stop',
  SubagentStart: 'sub',
  SubagentStop: 'sub',
  PreCompact: 'compact',
  UserPromptSubmit: 'prompt',
  SessionStart: 'session',
  SessionEnd: 'session',
};

const eventTypeToTone: Record<string, 'default' | 'success' | 'error' | 'warning' | 'info'> = {
  PreToolUse: 'info',
  PostToolUse: 'success',
  PostToolUseFailure: 'error',
  PermissionRequest: 'warning',
  Notification: 'default',
  Stop: 'default',
  SubagentStart: 'success',
  SubagentStop: 'default',
  PreCompact: 'default',
  UserPromptSubmit: 'info',
  SessionStart: 'success',
  SessionEnd: 'default',
};

export function useEventEmojis() {
  // Kept for back-compat; emoji surfaces removed dashboard-wide.
  const getEmojiForEventType = (_eventType: string): string => '';
  const getEmojiForToolName = (_toolName: string): string => '';

  const getLabelForEventType = (eventType: string): string => {
    return eventTypeToLabel[eventType] || eventType || 'Event';
  };

  const getShortLabelForEventType = (eventType: string): string => {
    return eventTypeToShort[eventType] || (eventType ? eventType.toLowerCase() : 'evt');
  };

  const getToneForEventType = (eventType: string): 'default' | 'success' | 'error' | 'warning' | 'info' => {
    return eventTypeToTone[eventType] || 'default';
  };

  const formatEventTypeLabel = (eventTypes: Record<string, number>, toolEvents?: Record<string, number>): string => {
    const counts: Record<string, number> = {};
    if (toolEvents) {
      for (const [key, count] of Object.entries(toolEvents)) {
        const [eventType] = key.split(':');
        counts[eventType] = (counts[eventType] || 0) + count;
      }
    }
    for (const [type, count] of Object.entries(eventTypes)) {
      counts[type] = (counts[type] || 0) + count;
    }
    const top = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([type, count]) => {
        const label = getShortLabelForEventType(type);
        return count > 1 ? `${label}·${count}` : label;
      });
    return top.join(' / ');
  };

  return {
    getEmojiForEventType,
    getEmojiForToolName,
    getLabelForEventType,
    getShortLabelForEventType,
    getToneForEventType,
    formatEventTypeLabel,
  };
}
