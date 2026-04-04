import { ref, computed } from 'vue';
import type { HookEvent } from '../types';

export function useEventSearch() {
  const searchPattern = ref<string>('');
  const searchError = ref<string>('');

  // Validate regex pattern
  const validateRegex = (pattern: string): { valid: boolean; error?: string } => {
    if (!pattern || pattern.trim() === '') {
      return { valid: true };
    }

    try {
      new RegExp(pattern);
      return { valid: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Invalid regex pattern';
      return { valid: false, error: errorMessage };
    }
  };

  // Extract searchable text from event
  const getSearchableText = (event: HookEvent): string => {
    const parts: string[] = [];
    const payload = event.payload || {};
    const model = event.model_name || (typeof payload.model === 'string' ? payload.model : undefined);
    const toolName = typeof payload.tool_name === 'string' ? payload.tool_name : undefined;
    const toolCommand = typeof payload.tool_command === 'string' ? payload.tool_command : undefined;
    const toolFilePath = typeof payload.tool_file === 'string'
      ? payload.tool_file
      : (payload.tool_file && typeof payload.tool_file.path === 'string' ? payload.tool_file.path : undefined);
    const hitlQuestion = event.humanInTheLoop?.question;
    const hitlPermission = event.humanInTheLoop?.type === 'permission' ? 'permission' : undefined;

    // Event type
    if (event.hook_event_type) {
      parts.push(event.hook_event_type);
    }

    // Source app and session
    if (event.source_app) {
      parts.push(event.source_app);
    }
    if (event.session_id) {
      parts.push(event.session_id);
    }

    // Model name
    if (model) {
      parts.push(model);
    }

    // Tool information
    if (toolName) {
      parts.push(toolName);
    }
    if (toolCommand) {
      parts.push(toolCommand);
    }
    if (toolFilePath) {
      parts.push(toolFilePath);
    }

    // Summary text
    if (event.summary) {
      parts.push(event.summary);
    }

    // HITL information
    if (hitlQuestion) {
      parts.push(hitlQuestion);
    }
    if (hitlPermission) {
      parts.push(hitlPermission);
    }

    return parts.join(' ').toLowerCase();
  };

  // Check if event matches pattern
  const matchesPattern = (event: HookEvent, pattern: string): boolean => {
    if (!pattern || pattern.trim() === '') {
      return true;
    }

    const validation = validateRegex(pattern);
    if (!validation.valid) {
      return false;
    }

    try {
      const regex = new RegExp(pattern, 'i'); // Case-insensitive
      const searchableText = getSearchableText(event);
      return regex.test(searchableText);
    } catch {
      return false;
    }
  };

  // Filter events by pattern
  const searchEvents = (events: HookEvent[], pattern: string): HookEvent[] => {
    if (!pattern || pattern.trim() === '') {
      return events;
    }

    return events.filter(event => matchesPattern(event, pattern));
  };

  // Computed property for current error
  const hasError = computed(() => searchError.value.length > 0);

  // Update search pattern and validate
  const updateSearchPattern = (pattern: string) => {
    searchPattern.value = pattern;

    if (!pattern || pattern.trim() === '') {
      searchError.value = '';
      return;
    }

    const validation = validateRegex(pattern);
    if (!validation.valid) {
      searchError.value = validation.error || 'Invalid regex pattern';
    } else {
      searchError.value = '';
    }
  };

  // Clear search
  const clearSearch = () => {
    searchPattern.value = '';
    searchError.value = '';
  };

  return {
    searchPattern,
    searchError,
    hasError,
    validateRegex,
    matchesPattern,
    searchEvents,
    updateSearchPattern,
    clearSearch,
    getSearchableText
  };
}
