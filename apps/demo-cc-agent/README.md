# Demo Claude Code Agent

This is a demonstration agent showing how to integrate Claude Code hooks with the Multi-Agent Observability system.

## Setup

1. Copy the `.claude` directory to your Claude Code project
1. Update the `--source-app` parameter in `.claude/settings.json` to identify your agent (currently set to `demo-agent`)
1. Optionally update the `--server-url` if your observability server runs on a different host/port

## Directory Structure

```
.claude/
├── hooks/              # Hook scripts
│   ├── send_event.py  # Core event sender (sends to observability server)
│   ├── pre_tool_use.py    # Validates and blocks dangerous commands
│   ├── post_tool_use.py   # Captures tool execution results
│   ├── notification.py    # Handles user notifications with optional TTS
│   ├── stop.py           # Session completion handler
│   ├── subagent_stop.py  # Subagent completion handler
│   └── utils/           # Shared utilities
├── commands/           # Custom slash commands
│   ├── convert_paths_absolute.md  # Convert relative to absolute paths
└── settings.json      # Hook configuration
```

## Testing

You can test the hook integration by running Claude Code in this directory:

```bash
cd apps/demo-cc-agent
claude -p --verbose --model sonnet --output-format stream-json "read the README.md and run ls" > "claude-output.json"
```

The hooks will automatically send events to the observability server at `http://localhost:4000/events`.

## Hook Events

The following events are captured and sent:

- **PreToolUse**: Before any tool execution (with validation and blocking)
- **PostToolUse**: After tool execution with results
- **Notification**: When Claude needs user input (with optional TTS support)
- **Stop**: When Claude completes a response (includes chat history)
- **SubagentStop**: When a subagent completes a response
- **PreCompact**: Before compacting the conversation

## Features

### Event Summarization

Most hooks use the `--summarize` flag to include a brief summary of the event data for easier monitoring.

### Chat History

The Stop event includes the full chat history with the `--add-chat` flag, allowing you to review complete conversations.

### Text-to-Speech

The notification hook supports TTS via ElevenLabs or OpenAI when API keys are configured.

### Custom Commands

The `.claude/commands/` directory contains helpful slash commands:

- `/convert_paths_absolute` - Converts all relative paths in settings.json to absolute paths

## Customization

You can customize the hook behavior by:

1. Modifying the `--source-app` to uniquely identify your agent
1. Adding filters to only capture specific tools using the `matcher` field
1. Adding additional processing in the Python scripts
1. Configuring TTS providers via environment variables
