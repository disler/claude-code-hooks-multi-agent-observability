# Claude Code Multi Agent Observability

## Instructions
> Follow these instructions as you work through the project.

### REMEMBER: Use source_app + session_id to uniquely identify an agent.

Every hook event will include a source_app and session_id. Use these to uniquely identify an agent.
For display purposes, we want to show the agent ID as "source_app:session_id" with session_id truncated to the first 8 characters.

## Observability Toolkit

This project has Claude Code observability enabled. Configuration: `.claude/observability.json`

- **Start dashboard:** `just obs-start`
- **Query traces:** Use `/observability query` skill or `just obs-query type=PostToolUseFailure`
- **Log a signal:** `bun scripts/observability/log-signal.ts --type <type> --context '<json>'`
- **View learning signals:** `just obs-signals` or `/observability digest`
- **Export events:** `just obs-export format=jsonl`
- **Full docs:** Use `/observability` skill for guided access to all features