# Gemini Agent Instructions

## Project Overview

This is a Claude Code multi-agent observability toolkit. It provides real-time monitoring and visualization for Claude Code agents through hook event tracking.

## Key Information

- **Server**: Bun TypeScript server at `apps/server/` (port 4000, SQLite with WAL mode)
- **Client**: Vue 3 dashboard at `apps/client/` (port 5173)
- **Hooks**: Python (`.claude/hooks/`) and TypeScript (`.claude/hooks-ts/`) scripts that intercept Claude Code lifecycle events
- **Setup script**: `scripts/setup-observability.ts` scaffolds observability into any JS/TS or Python project

## Agent Identification

Use `source_app` + `session_id` to uniquely identify an agent. Display as `source_app:session_id` with `session_id` truncated to the first 8 characters.

## Commands

**For development of this repo** (uses justfile):
- `just start` / `just stop` -- start/stop server + client
- `just test-event` -- send a test event
- `just health` -- check service status

**For target projects using the toolkit:**
- JS/TS projects: `bun run obs:start` / `bun run obs:stop` / `bun run obs:status`
- Python projects: `./.observability/obs.sh start` / `stop` / `status`

## Architecture

```
Claude Agents --> Hook Scripts --> HTTP POST --> Bun Server (port 4000) --> SQLite
                                                      |
                                                WebSocket --> Vue Dashboard (port 5173)
```

## API Endpoints

- `POST /events` -- Receive events from hooks
- `GET /events/recent` -- Paginated event retrieval
- `GET /events/query` -- Search and filter events
- `GET /events/export` -- Export events (json, jsonl, csv)
- `POST /events/<id>/tag` -- Tag events
- `POST /signals` -- Log learning signals
- `GET/POST /signals/rules` -- Auto-detection rules
- `WS /stream` -- Real-time event broadcast
