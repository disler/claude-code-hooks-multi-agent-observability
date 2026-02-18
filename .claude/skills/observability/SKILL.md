---
name: observability
description: Query, tag, and learn from Claude Code hook event traces. Full observability toolkit for agents.
---

# Observability Toolkit

This project has Claude Code observability enabled. All hook events are captured to a local SQLite database and streamed to a real-time dashboard.

## Quick Start

- **Dashboard (JS/TS projects)**: `bun run obs:start` (server + client)
- **Dashboard (Python projects)**: `./.observability/obs.sh start`
- **Query events**: `/observability query`
- **View signals**: `/observability digest`
- **Log a signal**: `/observability log`

## Modes

### Query Mode (`/observability query`)

Search and filter past hook events from the trace database.

**Server endpoint**: `GET http://localhost:4000/events/query`

**Available filters**:
| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| type | string | Hook event type | PreToolUse, PostToolUseFailure |
| session_id | string | Filter by session | abc123 |
| source_app | string | Filter by source app | my-project |
| since | number | Unix timestamp (ms) | 1708300000000 |
| until | number | Unix timestamp (ms) | 1708400000000 |
| tag | string | Filter by tag | learning_signal |
| signal_only | boolean | Only tagged events | true |
| limit | number | Max results (default 50) | 100 |
| offset | number | Pagination offset | 50 |

**Canned queries** (copy-paste ready):
```bash
# Recent failures
curl -s "http://localhost:4000/events/query?type=PostToolUseFailure&limit=10" | jq .

# Learning signals from last hour
curl -s "http://localhost:4000/events/query?signal_only=true&since=$(date -v-1H +%s000)&limit=20" | jq .

# All events for current session
curl -s "http://localhost:4000/events/query?session_id=$CLAUDE_SESSION_ID&limit=100" | jq .

# Test failures specifically
curl -s "http://localhost:4000/events/query?tag=test_failure&limit=10" | jq .
```

### Digest Mode (`/observability digest`)

Generate a summary of recent learning signals relevant to the current task.

**Usage**: Run these queries to build a digest:
1. Query recent signals: `curl -s "http://localhost:4000/events/query?signal_only=true&limit=20" | jq .`
2. Group by signal type
3. Identify patterns (repeated failures, common error types)
4. Suggest corrective actions

**Time windows**:
- Last hour: `since=$(date -v-1H +%s000)`
- Last session: filter by `session_id`
- Last day: `since=$(date -v-1d +%s000)`

### Tag Mode (`/observability tag <event_id>`)

Label specific events with tags and notes for future reference.

**Server endpoint**: `POST http://localhost:4000/events/<id>/tag`

**Usage**:
```bash
# Tag an event as a learning signal
curl -s -X POST "http://localhost:4000/events/42/tag" \
  -H "Content-Type: application/json" \
  -d '{"tags": ["learning_signal", "test_failure"], "note": "Flaky auth test - needs retry logic"}'
```

**Tag vocabulary** (from `.claude/observability.json`):
- `learning_signal` -- General learning signal
- `test_failure` -- Test runner failure
- `build_failure` -- Build/compile failure
- `qa_rejection` -- QA agent rejected work
- `correction` -- Self-correction event
- `pattern:flaky` -- Flaky/intermittent issue
- `permission_issue` -- Permission-related
- `agent_error` -- Agent tool error
- `resolved` -- Issue has been resolved

### Log Mode (`/observability log`)

Explicitly log a learning signal to the trace database.

**Server endpoint**: `POST http://localhost:4000/signals`

**Usage**:
```bash
# Log a test failure signal
curl -s -X POST "http://localhost:4000/signals" \
  -H "Content-Type: application/json" \
  -d '{"type": "test_failure", "context": {"test": "auth.test.ts", "error": "timeout after 5000ms"}, "tags": ["learning_signal", "test_failure"]}'

# Log a correction
curl -s -X POST "http://localhost:4000/signals" \
  -H "Content-Type: application/json" \
  -d '{"type": "correction", "context": {"original": "used var", "fixed": "used const", "reason": "immutability"}, "tags": ["learning_signal", "correction"]}'

# Log a QA rejection
curl -s -X POST "http://localhost:4000/signals" \
  -H "Content-Type: application/json" \
  -d '{"type": "qa_rejection", "context": {"reviewer": "qa-agent", "reason": "missing input validation"}, "tags": ["learning_signal", "qa_rejection"]}'
```

**CLI tool** (if available): `bun scripts/observability/log-signal.ts`

```bash
# Log a test failure signal via CLI
bun scripts/observability/log-signal.ts \
  --type test_failure \
  --context '{"test": "auth.test.ts", "error": "timeout after 5000ms"}' \
  --tags flaky,needs-retry

# Log a correction via CLI
bun scripts/observability/log-signal.ts \
  --type correction \
  --context '{"original": "used var", "fixed": "used const", "reason": "immutability"}' \
  --note "Pattern: prefer const over var"

# Log a QA rejection via CLI
bun scripts/observability/log-signal.ts \
  --type qa_rejection \
  --context '{"reviewer": "qa-agent", "reason": "missing input validation"}'
```

### Rules Mode (`/observability rules`)

View and manage auto-detection rules that automatically tag events.

**Server endpoints**:
- GET: `curl -s http://localhost:4000/signals/rules | jq .`
- POST: `curl -s -X POST http://localhost:4000/signals/rules -H "Content-Type: application/json" -d '{"rules": [...]}'`

**Default rules** (configured in `.claude/observability.json`):
1. `test_failure` -- Tags PostToolUseFailure events containing test/jest/vitest/pytest
2. `build_failure` -- Tags PostToolUseFailure events containing build/compile/tsc
3. `permission_issue` -- Tags all PermissionRequest events
4. `agent_error` -- Tags non-interrupt PostToolUseFailure events

**Adding a custom rule**:
```bash
# Fetch current rules, add new one, update
RULES=$(curl -s http://localhost:4000/signals/rules | jq '.rules')
NEW_RULE='{"name":"lint_failure","description":"Linting failures","hook_event_type":"PostToolUseFailure","payload_match":"eslint|biome|prettier","auto_tag":["learning_signal","lint_failure"]}'
UPDATED=$(echo $RULES | jq ". + [$NEW_RULE]")
curl -s -X POST http://localhost:4000/signals/rules -H "Content-Type: application/json" -d "{\"rules\": $UPDATED}"
```

### Export Mode (`/observability export`)

Export matching events for external analysis.

**Server endpoint**: `GET http://localhost:4000/events/export`

**Formats**: json, jsonl, csv

**Usage**:
```bash
# Export all failures as JSONL (for ML pipelines)
curl -s "http://localhost:4000/events/export?format=jsonl&type=PostToolUseFailure" > failures.jsonl

# Export learning signals as CSV
curl -s "http://localhost:4000/events/export?format=csv&signal_only=true" > signals.csv

# Export last 24 hours as JSON
curl -s "http://localhost:4000/events/export?format=json&since=$(date -v-1d +%s000)" > events.json
```

## Configuration

Config file: `.claude/observability.json`

See `/observability rules` mode for managing auto-detection rules.

## Architecture

```
Hook Events --> send_event.py/ts --> HTTP POST --> Bun Server (port 4000) --> SQLite
                                                        |
                                                  WebSocket --> Vue Dashboard (port 5173)
```
