Manage and execute tasks from the plan queue.

Supports the same subcommands and aliases as `planq.sh`:
- `/planq` or `/planq run` — execute the next pending task inline, then mark it done
- `/planq run N` or `/planq r N` — execute task #N inline, then mark it done
- `/planq auto` or `/planq A` — run all auto-queued tasks continuously in this session
- `/planq list` or `/planq l` — show the full task queue
- `/planq list -a` or `/planq l -a` — show the archive
- `/planq show [N]` or `/planq s [N]` — show details of the next task, or task #N
- `/planq show -a [N]` or `/planq s -a [N]` — show details of an archive entry
- `/planq create ...` or `/planq c ...` — add a task (pass through to planq.sh)
- `/planq follow-up <parent> [opts] [desc]` or `/planq fu ...` — create subtask under parent, mark underway, then execute inline
- `/planq fixup <parent> [opts] [desc]` or `/planq fx ...` — same but with fix-required link type
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

**For `auto` / `A`:**

Run auto-queued tasks continuously in this Claude session (inline, no subprocess).

Step 1 — Reload the full task list to get current state:
```bash
bash .claude/planq.sh list
```
Find the first task with `auto-queue` status (shown as `⏱`). If none exist, show the list and tell the user there are no auto-queue tasks. Stop.

Step 2 — Get full details for that task using its identifier (filename or description text, NOT its position number — position numbers shift as tasks complete):
```bash
bash .claude/planq.sh show <filename-or-next-with-no-arg>
```

Step 3 — Execute the task inline using the same steps as `run`:
- Mark the task underway: `bash .claude/planq.sh mark:underway <identifier>`
- Execute the task inline (do NOT call `claude` or spawn any subprocess) per the task-type table below
- Mark the task done: `bash .claude/planq.sh mark:done <identifier>`
- If `Auto-commit after: yes` was shown in the details, perform a git commit now.

Step 4 — After completing a task, go back to Step 1 (reload the full list fresh — do NOT reuse cached task numbers or positions). Repeat until no more auto-queue tasks remain.

If the user interrupts (says stop, or presses Ctrl-C), stop the loop immediately without running further tasks.

**For `follow-up` / `fu` / `fixup` / `fx`:**

Create a subtask and immediately execute it inline (unless it is a manual task type).

Step 1 — Run the shell command and capture its output:
```bash
bash .claude/planq.sh follow-up $REMAINING_ARGS   # (or fixup, fu, fx as appropriate)
```
Look for a line `Marked underway: <type>: <identifier>` in the output. Extract `<type>` and `<identifier>` (the part after `<type>: `).

If the output contains a warning or error instead (no "Marked underway:" line), show the output to the user and stop.

Step 2 — Get full task details using the identifier:
```bash
bash .claude/planq.sh show <identifier>
```

Step 3 — Execute the task **inline** (do NOT call `claude` or spawn any subprocess) based on the task type from the execution table below. The task is already marked underway — do NOT mark it underway again.

| Task type | What to do |
|---|---|
| `task` | Read `plans/<identifier>` and carry out the instructions in it. |
| `plan` | Read `plans/<identifier>` and implement the plan described in it. |
| `make-plan` | Read the prompt from `plans/<identifier>`. Write a detailed implementation plan to `plans/<target>`, where `<target>` is `<identifier>` with `make-plan-` replaced by `plan-`. |
| `investigate` | Read the prompt from `plans/<identifier>`. Research the question thoroughly and write your findings and conclusions to `plans/<feedback>`, where `<feedback>` is `<identifier>` with `investigate-` replaced by `feedback-`. |
| `unnamed-task` | The description text (the identifier) IS the prompt — execute it directly. |
| `manual-test` / `manual-commit` / `manual-task` | Tell the user this is a manual step, describe what needs to be done, and ask them to confirm when complete. Do NOT mark it done — let the user do that. Stop here. |

Step 4 — After successfully completing the task, mark it done:
- If the task has a filename (task/plan/make-plan/investigate): `bash .claude/planq.sh mark:done <identifier>`
- If it is an unnamed-task: `bash .claude/planq.sh mark:done "<identifier>"`

Step 5 — If the task details showed `Auto-commit after: yes`, perform a git commit now. Follow the standard commit protocol: stage relevant files, write a concise commit message describing what was done, and create the commit.

**For `create` / `c`, `mark` / `m`, `delete` / `x`, `archive` / `a`, `daemon` / `d`:**
Run `bash .claude/planq.sh $ARGUMENTS` and show the output. Stop.

**For `run` / `r [N]`, or no subcommand (default: run next):**

Step 1 — Reload the task list to get current state, then get task details:
```bash
bash .claude/planq.sh show [N]
```
If there are no pending tasks, report that and stop. Note: if N was specified, verify the task at that position matches expectations — task positions shift as tasks complete.

Step 1b — Mark the task as underway using its **identifier** (filename or description), never by position number:
- If the task has a filename (task/plan/make-plan/investigate): `bash .claude/planq.sh mark:underway <filename>`
- If the task is an unnamed-task or other description-only type: `bash .claude/planq.sh mark:underway "<exact description text>"`

Step 2 — Execute the task **inline** (do NOT call `claude` or spawn any subprocess):

| Task type | What to do |
|---|---|
| `task` | Read `plans/<filename>` and carry out the instructions in it. |
| `plan` | Read `plans/<filename>` and implement the plan described in it. |
| `make-plan` | Read the prompt from `plans/<filename>`. Write a detailed implementation plan to `plans/<target>`, where `<target>` is `<filename>` with `make-plan-` replaced by `plan-`. |
| `investigate` | Read the prompt from `plans/<filename>`. Research the question thoroughly and write your findings and conclusions to `plans/<feedback>`, where `<feedback>` is `<filename>` with `investigate-` replaced by `feedback-`. |
| `unnamed-task` | The description text IS the prompt — execute it directly. |
| `manual-test` / `manual-commit` / `manual-task` | Tell the user this is a manual step, describe what needs to be done, and ask them to confirm when complete. Do NOT mark it done — let the user do that. |

Step 3 — After successfully completing the task (not for manual steps), mark it done using whichever identifier you have:
- If the task has a filename (task/plan/make-plan/investigate): `bash .claude/planq.sh mark:done <filename>`
- If the task is an unnamed-task or other description-only type: `bash .claude/planq.sh mark:done "<exact description text>"`

Step 4 — If the task details showed `Auto-commit after: yes`, perform a git commit now. Follow the standard commit protocol: stage relevant files, write a concise commit message describing what was done, and create the commit. Do NOT skip this step if the flag was present.
