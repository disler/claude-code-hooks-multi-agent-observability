# Agent Configuration

## Agent Identification

Every hook event includes `source_app` and `session_id`. Use these together to uniquely identify an agent instance. Display as `source_app:session_id` with `session_id` truncated to the first 8 characters.

## Team Agents

This project supports Claude Code Agent Teams for orchestrating multi-agent workflows. Teams are enabled via the `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` environment variable in `.claude/settings.json`.

### Builder

Defined in `.claude/agents/team/builder.md`. Engineering agent that executes one task at a time. Includes PostToolUse hooks for `ruff` and `ty` validation on Write/Edit operations.

### Validator

Defined in `.claude/agents/team/validator.md`. Read-only validation agent that inspects work without modifying files. Cannot use Write, Edit, or NotebookEdit tools.

## Planning with Teams

Use the `/plan_w_team` slash command to create team-based implementation plans:

```bash
/plan_w_team "Add a new feature for X"
```

This generates a spec document in `specs/` with task breakdowns, team member assignments, dependencies, and acceptance criteria. Plans are validated by Stop hook validators that ensure required sections are present.

Execute a plan with:

```bash
/build specs/<plan-name>.md
```

## Observability for Agents

All agent activity is captured through the hook system and streamed to the dashboard. Each agent gets its own swim lane based on its `source_app:session_id` combination.

**Managing the dashboard in target projects:**
- JS/TS projects: `bun run obs:start` / `bun run obs:stop` / `bun run obs:status`
- Python projects: `./.observability/obs.sh start` / `stop` / `status`

**Developing this repo:** Use `just start` / `just stop` (see justfile for all recipes).
