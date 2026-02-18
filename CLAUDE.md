# Claude Code Multi Agent Observability

## Instructions
> Follow these instructions as you work through the project.

### REMEMBER: Use source_app + session_id to uniquely identify an agent.

Every hook event will include a source_app and session_id. Use these to uniquely identify an agent.
For display purposes, we want to show the agent ID as "source_app:session_id" with session_id truncated to the first 8 characters.

## Observability Toolkit

This project has Claude Code observability enabled. Configuration: `.claude/observability.json`

- **Start dashboard:** `bun run obs:start` (JS/TS) or `./.observability/obs.sh start` (Python)
- **Stop dashboard:** `bun run obs:stop` (JS/TS) or `./.observability/obs.sh stop` (Python)
- **Check status:** `bun run obs:status` (JS/TS) or `./.observability/obs.sh status` (Python)
- **Query traces:** Use `/observability query` skill
- **Log a signal:** `bun scripts/observability/log-signal.ts --type <type> --context '<json>'`
- **View learning signals:** `/observability digest`
- **Full docs:** Use `/observability` skill for guided access to all features