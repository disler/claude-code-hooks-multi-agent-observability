# Claude Code Multi-Agent Observability

One-command observability for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) projects. Real-time monitoring and visualization for Claude Code agents through comprehensive [hook event](https://docs.anthropic.com/en/docs/claude-code/hooks) tracking.

> Forked from [disler/claude-code-hooks-multi-agent-observability](https://github.com/disler/claude-code-hooks-multi-agent-observability). Extended with setup scaffolding, TypeScript hook ports, server API extensions, auto-detection rules, CLI signal logger, observability skill, and npm package distribution.

<img src="images/app.png" alt="Multi-Agent Observability Dashboard" style="max-width: 800px; width: 100%;">

## What It Does

This toolkit captures, stores, and visualizes every Claude Code hook event in real-time. When you (or your agents) use Claude Code, each tool call, prompt submission, notification, session start/stop, subagent lifecycle event, and permission request is sent to a local SQLite database and streamed live to a Vue dashboard.

Key capabilities:

- **12 hook event types** captured automatically (PreToolUse, PostToolUse, Stop, SubagentStart, etc.)
- **Multi-agent swim lanes** showing parallel agent activity side by side
- **Live pulse chart** with session-colored bars and event type indicators
- **Filtering** by app, session, and event type
- **Query, tag, and export APIs** for programmatic access to trace data
- **Learning signals** with auto-detection rules for test failures, build errors, and permission issues

## Architecture

```
Claude Agents --> Hook Scripts --> HTTP POST --> Bun Server (port 4000) --> SQLite
                                                      |
                                                WebSocket --> Vue Dashboard (port 5173)
```

![Agent Data Flow Animation](images/AgentDataFlowV2.gif)

## Quick Start

### Install into Your Project

Run the setup script to scaffold observability into any JS/TS or Python project:

```bash
# Via bunx (recommended)
bunx @ajbmachon/setup-observability --project /path/to/your/project --source-app my-app

# Or clone this repo and run directly
bun scripts/setup-observability.ts --project /path/to/your/project --source-app my-app
```

The setup script is **idempotent** -- running it twice produces identical results. It will:

1. Copy hook scripts (TypeScript or Python, auto-detected)
2. Merge hook configuration into `.claude/settings.json`
3. Copy the server and client into `.observability/`
4. Install dependencies
5. Add management commands to your project

### Managing the Dashboard

**For JS/TS projects** (scripts added to your `package.json`):

```bash
bun run obs:start     # Start server + client in background
bun run obs:stop      # Stop all observability processes
bun run obs:status    # Check if server and client are running
```

**For Python projects** (shell script created at `.observability/obs.sh`):

```bash
./.observability/obs.sh start    # Start server + client
./.observability/obs.sh stop     # Stop all processes
./.observability/obs.sh status   # Check service status
```

Then open **http://localhost:5173** in your browser and run Claude Code -- events will stream in automatically.

### Setup Options

```
Usage:
  bun scripts/setup-observability.ts --project <path> --source-app <name> [--port 4000] [--language ts|py]

Options:
  --project      Target project directory (required)
  --source-app   Application identifier for hook events (required)
  --port         Observability server port (default: 4000)
  --language     Hook language: ts or py (auto-detect if omitted)
```

## Requirements

- **[Claude Code](https://docs.anthropic.com/en/docs/claude-code)** -- Anthropic's official CLI
- **[Bun](https://bun.sh/)** -- JavaScript/TypeScript runtime (for server, client, and TS hooks)
- **[Astral uv](https://docs.astral.sh/uv/)** -- Fast Python package manager (only if using Python hooks)

## Hook System

The toolkit supports all 12 Claude Code hook event types:

| Event Type | Purpose | Special Features |
|---|---|---|
| PreToolUse | Before tool execution | Tool blocking, input summarization |
| PostToolUse | After tool completion | MCP tool detection, result logging |
| PostToolUseFailure | Tool execution failed | Error details, interrupt status |
| PermissionRequest | Permission requested | Tool name, permission suggestions |
| Notification | User interactions | Type-aware TTS support |
| Stop | Response completion | Chat transcript capture |
| SubagentStart | Subagent started | Agent ID and type tracking |
| SubagentStop | Subagent finished | Transcript path tracking |
| PreCompact | Context compaction | Custom instructions |
| UserPromptSubmit | User prompt submission | Prompt logging, validation |
| SessionStart | Session started | Source, model, agent type |
| SessionEnd | Session ended | End reason tracking |

Each hook sends events to the server via `send_event.py` (or `send_event.ts`), which includes `--source-app` and `--event-type` flags for routing. Events include `source_app` and `session_id` fields to uniquely identify each agent instance.

## Dashboard Features

- **Agent Swim Lanes** -- Side-by-side view of parallel agent activity
- **Event Timeline** -- Chronological event list with auto-scroll and manual override
- **Live Pulse Chart** -- Canvas-based real-time activity visualization with session-colored bars
- **Filter Panel** -- Multi-select filtering by app, session, and event type
- **Tool Emoji System** -- Visual tool identification (Bash: terminal, Read: book, Write: pen, etc.)
- **Chat Transcript Viewer** -- Inspect full conversation history from Stop events
- **Dark/Light Theme** -- Dual theme support with smooth transitions

## API Endpoints

The server exposes REST and WebSocket endpoints:

| Endpoint | Method | Description |
|---|---|---|
| `/events` | POST | Receive events from hooks |
| `/events/recent` | GET | Paginated event retrieval with filtering |
| `/events/filter-options` | GET | Available filter values |
| `/events/query` | GET | Search and filter past events |
| `/events/export` | GET | Export events (json, jsonl, csv) |
| `/events/<id>/tag` | POST | Tag events with labels and notes |
| `/signals` | POST | Log learning signals |
| `/signals/rules` | GET/POST | Manage auto-detection rules |
| `/health` | GET | Server health check |
| `/stream` | WS | Real-time event broadcast |

### Query Examples

```bash
# Recent failures
curl -s "http://localhost:4000/events/query?type=PostToolUseFailure&limit=10" | jq .

# Learning signals from last hour
curl -s "http://localhost:4000/events/query?signal_only=true&since=$(date -v-1H +%s000)&limit=20" | jq .

# Export all events as JSONL
curl -s "http://localhost:4000/events/export?format=jsonl" > events.jsonl

# Tag an event as a learning signal
curl -s -X POST "http://localhost:4000/events/42/tag" \
  -H "Content-Type: application/json" \
  -d '{"tags": ["learning_signal", "test_failure"], "note": "Flaky auth test"}'
```

### CLI Signal Logger

```bash
bun .observability/scripts/log-signal.ts \
  --type test_failure \
  --context '{"test": "auth.test.ts", "error": "timeout"}' \
  --tags flaky,needs-retry
```

## Project Structure

```
claude-code-hooks-multi-agent-observability/
|
|-- apps/
|   |-- server/              # Bun TypeScript server (port 4000)
|   |   |-- src/
|   |   |   |-- index.ts     # HTTP/WebSocket endpoints
|   |   |   |-- db.ts        # SQLite database & migrations
|   |   |   |-- types.ts     # TypeScript interfaces
|   |   |-- package.json
|   |   |-- events.db        # SQLite database (gitignored)
|   |
|   |-- client/              # Vue 3 TypeScript client (port 5173)
|       |-- src/
|       |   |-- App.vue
|       |   |-- components/  # EventTimeline, FilterPanel, LivePulseChart, etc.
|       |   |-- composables/ # useWebSocket, useEventColors, useChartData
|       |   |-- types.ts
|       |-- package.json
|
|-- .claude/
|   |-- hooks/               # Python hook scripts (14 files)
|   |-- hooks-ts/            # TypeScript hook ports
|   |-- skills/observability/ # Observability skill for Claude Code
|   |-- settings.json        # Hook configuration (all 12 event types)
|   |-- observability.json   # Auto-detection rules and tag vocabulary
|
|-- scripts/
|   |-- setup-observability.ts  # Setup scaffolding script (the npm bin)
|   |-- observability/          # CLI tools (log-signal.ts)
|   |-- start-system.sh        # Launch server & client
|   |-- reset-system.sh        # Stop all processes
|
|-- justfile                 # Task runner for development of THIS repo
|-- package.json             # npm package config (@ajbmachon/setup-observability)
```

## Multi-Agent Orchestration

With Claude Opus 4 and multi-agent orchestration, you can spin up teams of specialized agents that work in parallel. This observability system traces every tool call, task handoff, and agent lifecycle event across the entire swarm.

[![Multi-Agent Orchestration with Claude Code](images/claude-code-multi-agent-orchestration.png)](https://youtu.be/RpUTF_U4kiw)

The orchestration lifecycle:

1. **Create a team** -- `TeamCreate` sets up the coordination layer
2. **Create tasks** -- `TaskCreate` builds the centralized task list
3. **Spawn agents** -- `Task` deploys specialized agents into independent context windows
4. **Work in parallel** -- Agents execute simultaneously, communicating via `SendMessage`
5. **Shut down agents** -- Completed agents are gracefully terminated
6. **Delete the team** -- `TeamDelete` cleans up coordination state

See the official [Claude Code Agent Teams documentation](https://code.claude.com/docs/en/agent-teams) for the full reference.

## Development

This section is for contributing to **this repository itself** (the observability toolkit), not for using it in your projects.

### Prerequisites

- [Bun](https://bun.sh/) (runtime and package manager)
- [just](https://github.com/casey/just) (task runner for dev workflows)
- [Astral uv](https://docs.astral.sh/uv/) (for Python hooks)

### Dev Commands (justfile)

The `justfile` at the repo root provides recipes for developing this toolkit:

```bash
just              # List all available recipes
just start        # Start server + client
just stop         # Stop all processes
just restart      # Stop then start
just server       # Start server only (dev mode)
just client       # Start client only
just install      # Install all dependencies
just health       # Check server/client status
just test-event   # Send a test event
just db-reset     # Reset the database
just hooks        # List all hook scripts
just open         # Open dashboard in browser
```

### Testing

```bash
# System validation
./scripts/test-system.sh

# Send a test event
just test-event

# Manual event test
curl -X POST http://localhost:4000/events \
  -H "Content-Type: application/json" \
  -d '{
    "source_app": "test",
    "session_id": "test-123",
    "hook_event_type": "PreToolUse",
    "payload": {"tool_name": "Bash", "tool_input": {"command": "ls"}}
  }'
```

## Security

- Blocks dangerous `rm -rf` commands via `deny_tool()` JSON pattern
- Prevents access to sensitive files (`.env`, private keys)
- `stop_hook_active` guard prevents infinite hook loops
- Stop hook validators ensure plan files contain required sections
- All hooks exit 0 always -- they never block Claude Code

## Technical Stack

- **Server**: Bun, TypeScript, SQLite (WAL mode)
- **Client**: Vue 3, TypeScript, Vite, Tailwind CSS
- **Hooks**: Python 3.11+ (uv) or TypeScript (Bun)
- **Communication**: HTTP REST, WebSocket

## License

[MIT](LICENSE)

## Credits

- **Original project**: [Peter Disler](https://github.com/disler) ([disler/claude-code-hooks-multi-agent-observability](https://github.com/disler/claude-code-hooks-multi-agent-observability))
- **Fork maintainer**: [Andre Machon](https://github.com/ajbmachon) ([Two Magnitudes](https://twomagnitudes.com))
- **Learn more**: [Tactical Agentic Coding](https://agenticengineer.com/tactical-agentic-coding?y=opsorch) | [IndyDevDan YouTube](https://www.youtube.com/@indydevdan)
