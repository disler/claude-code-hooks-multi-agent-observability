export default {
  header: {
    title: 'Multi-Agent Observability',
    connected: 'Connected',
    disconnected: 'Disconnected',
    eventCount: '{count} events',
    hideFilters: 'Hide filters',
    showFilters: 'Show filters',
    themeManager: 'Open theme manager'
  },
  filters: {
    sourceApp: 'Source App',
    allSources: 'All Sources',
    sessionId: 'Session ID',
    allSessions: 'All Sessions',
    eventType: 'Event Type',
    allTypes: 'All Types',
    clear: 'Clear Filters'
  },
  pulse: {
    title: 'Live Activity Pulse',
    waiting: 'Waiting for events...',
    tooltip: '{count} events',
    tooltipDetail: '{count} events ({details})'
  },
  timeline: {
    title: 'Agent Event Stream',
    noEvents: 'No events to display',
    eventsAppear: 'Events will appear here as they are received'
  },
  eventRow: {
    prompt: 'Prompt:',
    payload: 'Payload',
    copy: '📋 Copy',
    copied: '✅ Copied!',
    copyFail: '❌ Failed',
    viewChat: 'View Chat Transcript ({count} messages)',
    notAvailableMobile: 'Not available in mobile'
  },
  chat: {
    title: '💬 Chat Transcript',
    searchPlaceholder: 'Search transcript...',
    search: 'Search',
    copyAll: '📋 Copy All',
    copiedAll: '✅ Copied All',
    copyAllFail: '❌ Failed',
    user: 'User',
    assistant: 'Assistant',
    system: 'System',
    toolResult: 'Tool Result:',
    toolUse: 'Tool Use',
    toolId: 'Tool ID:',
    tokens: 'Tokens: {input} in / {output} out',
    showDetails: 'Show Details',
    hideDetails: 'Hide Details',
    copyMessage: 'Copy message',
    showingMessages: 'Showing {filteredCount} of {totalCount} messages',
    searchingFor: '(searching for "{query}")',
    clearAll: 'Clear All',
    filters: {
      user: 'User',
      assistant: 'Assistant',
      system: 'System',
      toolUse: 'Tool Use',
      toolResult: 'Tool Result',
      read: 'Read',
      write: 'Write',
      edit: 'Edit',
      glob: 'Glob'
    }
  },
  scroll: {
    enable: 'Enable auto-scroll',
    disable: 'Disable auto-scroll'
  },
  themeManager: {
    title: '🎨 Theme Manager',
    numThemes: '{count} themes available',
    close: 'Close',
    current: 'Current'
  }
};