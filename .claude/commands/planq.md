Manage and execute tasks from the plan queue.

Supports the same subcommands and aliases as `planq.sh`:
- `/planq` or `/planq run` — execute the next pending task inline, then mark it done
- `/planq run N` or `/planq r N` — execute task #N inline, then mark it done
- `/planq list` or `/planq l` — show the full task queue
- `/planq list -a` or `/planq l -a` — show the archive
- `/planq show [N]` or `/planq s [N]` — show details of the next task, or task #N
- `/planq show -a [N]` or `/planq s -a [N]` — show details of an archive entry
- `/planq create ...` or `/planq c ...` — add a task (pass through to planq.sh)
- `/planq mark <done|underway|inactive> <N|filename|text>` or `/planq m:done <N|filename|text>` — mark a task
- `/planq delete N` or `/planq x N` — delete a task
- `/planq archive [N...]` or `/planq a [N...]` — archive done tasks (all done tasks if no args)
- `/planq archive --unarchive N` or `/planq a -U N` — restore an archived task back to the queue
- `/planq daemon [start|stop|restart|status]` or `/planq d ...` — manage the daemon

Arguments: $ARGUMENTS

## Instructions

Parse `$ARGUMENTS` to determine the subcommand (first word) and any remaining args.

**For `list` / `l` (or no arguments with intent to list):**
Run `bash .claude/planq.sh list` and show the output. Stop.

**For `show` / `s [N]`:**
Run `bash .claude/planq.sh show $REMAINING_ARGS` and show the output. Stop.

**For `create` / `c`, `mark` / `m`, `delete` / `x`, `archive` / `a`, `daemon` / `d`:**
Run `bash .claude/planq.sh $ARGUMENTS` and show the output. Stop.

**For `run` / `r [N]`, or no subcommand (default: run next):**

Step 1 — Get task details:
```bash
bash .claude/planq.sh show [N]
```
If there are no pending tasks, report that and stop.

Step 1b — Mark the task as underway:
- If the task has a filename (task/plan/make-plan): `bash .claude/planq.sh mark:underway <filename>`
- If the task is an unnamed-task or other description-only type: `bash .claude/planq.sh mark:underway "<exact description text>"`

Step 2 — Execute the task **inline** (do NOT call `claude` or spawn any subprocess):

| Task type | What to do |
|---|---|
| `task` | Read `plans/<filename>` and carry out the instructions in it. |
| `plan` | Read `plans/<filename>` and implement the plan described in it. |
| `make-plan` | Read the prompt from `plans/<filename>`. Write a detailed implementation plan to `plans/<target>`, where `<target>` is `<filename>` with `make-plan-` replaced by `plan-`. |
| `unnamed-task` | The description text IS the prompt — execute it directly. |
| `manual-test` / `manual-commit` / `manual-task` | Tell the user this is a manual step, describe what needs to be done, and ask them to confirm when complete. Do NOT mark it done — let the user do that. |

Step 3 — After successfully completing the task (not for manual steps), mark it done using whichever identifier you have:
- If the task has a filename (task/plan/make-plan): `bash .claude/planq.sh mark:done <filename>`
- If the task is an unnamed-task or other description-only type: `bash .claude/planq.sh mark:done "<exact description text>"`
