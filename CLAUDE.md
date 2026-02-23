# Claude Code Multi Agent Observability

## Instructions

> Follow these instructions as you work through the project.

### Agent Identification

Use `source_app` + `session_id` to uniquely identify an agent. Every hook event includes both fields.
For display purposes, show the agent ID as `source_app:session_id` with `session_id` truncated to the first 8 characters.

### Project Layout

- **Server**: `apps/server/src/` (Bun, SQLite via bun:sqlite, port 4000)
- **Client**: `apps/client/` (Vue 3, Vite, port 5173)
- **Python hooks**: `.claude/hooks/` (14 scripts, run with `uv run`)
- **TypeScript hooks**: `.claude/hooks-ts/` (TS ports, run with `bun`)
- **Settings**: `.claude/settings.json` (12 hook event types configured)
- **Database**: `events.db` in `apps/server/` (WAL mode, events + themes tables)
- **Justfile**: Root level -- recipes for dev of THIS repo (`just start`, `just stop`, etc.)
- **Setup script**: `scripts/setup-observability.ts` -- scaffolds observability into target projects

### Hook Pattern

All hooks exit 0 always -- they never block Claude. Each hook has its own script plus delegates to `send_event.py`/`send_event.ts` with `--source-app` and `--event-type` flags. The DB uses a migration pattern: `PRAGMA table_info` check before `ALTER TABLE`. The server uses `Bun.serve()` with fetch handler + websocket handler.

### Key Commands

**For development of this repo** (uses justfile):
- `just start` / `just stop` / `just restart`
- `just server` / `just client`
- `just test-event` / `just health`

**For target projects using the toolkit** (added by setup script):
- JS/TS: `bun run obs:start` / `bun run obs:stop` / `bun run obs:status`
- Python: `./.observability/obs.sh start` / `stop` / `status`

## Observability Toolkit

This project has Claude Code observability enabled. Configuration: `.claude/observability.json`

- **Start dashboard:** `bun run obs:start` (JS/TS) or `./.observability/obs.sh start` (Python)
- **Stop dashboard:** `bun run obs:stop` (JS/TS) or `./.observability/obs.sh stop` (Python)
- **Check status:** `bun run obs:status` (JS/TS) or `./.observability/obs.sh status` (Python)
- **Query traces:** Use `/observability query` skill
- **Log a signal:** `bun scripts/observability/log-signal.ts --type <type> --context '<json>'`
- **View learning signals:** `/observability digest`
- **Full docs:** Use `/observability` skill for guided access to all features
