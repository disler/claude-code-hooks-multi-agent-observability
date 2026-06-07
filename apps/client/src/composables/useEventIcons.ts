/**
 * Maps hook event types and tool names to AppIcon names — the line-icon
 * replacement for the emoji vocabulary in useEventEmojis. Same classification
 * shape (incl. `mcp__*` handling) so swim lanes / timeline / filters stay
 * consistent. useEventEmojis is preserved as a stable contract; redesigned
 * templates render <AppIcon> via these mappings instead of raw glyphs.
 */
const eventTypeToIcon: Record<string, string> = {
  'PreToolUse': 'pre-tool',
  'PostToolUse': 'post-tool',
  'PostToolUseFailure': 'alert',
  'PermissionRequest': 'bell',
  'Notification': 'notification',
  'Stop': 'stop',
  'SubagentStart': 'users',
  'SubagentStop': 'subagent-stop',
  'PreCompact': 'pre-compact',
  'UserPromptSubmit': 'prompt',
  'SessionStart': 'session-start',
  'SessionEnd': 'check',
  'default': 'dot',
};

const toolNameToIcon: Record<string, string> = {
  'Bash': 'bash',
  'Read': 'read',
  'Write': 'write',
  'Edit': 'edit',
  'MultiEdit': 'edit',
  'NotebookEdit': 'edit',
  'Glob': 'glob',
  'Grep': 'grep',
  'WebFetch': 'web-fetch',
  'WebSearch': 'search',
  'Task': 'task',
  'TaskCreate': 'task',
  'TaskGet': 'task',
  'TaskUpdate': 'task',
  'TaskList': 'task',
  'TaskOutput': 'task',
  'TaskStop': 'task',
  'TeamCreate': 'users',
  'TeamDelete': 'users',
  'SendMessage': 'prompt',
  'EnterPlanMode': 'task',
  'ExitPlanMode': 'task',
  'AskUserQuestion': 'notification',
  'Skill': 'zap',
  'default': 'tool',
};

export function useEventIcons() {
  const getIconForEventType = (eventType: string): string => {
    return eventTypeToIcon[eventType] || eventTypeToIcon.default;
  };

  const getIconForToolName = (toolName: string): string => {
    if (toolNameToIcon[toolName]) return toolNameToIcon[toolName];
    if (toolName.startsWith('mcp__')) return 'mcp';
    return toolNameToIcon.default;
  };

  return {
    getIconForEventType,
    getIconForToolName,
  };
}
