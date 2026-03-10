#!/usr/bin/env bash
# planq.sh — Plan queue management for devcontainers.
#
# Subcommands:
#   list / l         Print queue with status
#   show / s [N]     Show next pending task, or task #N (does not run it)
#   run  / r [N]     Execute next pending task, or task #N, and mark it done
#   create / c       Add a task (default type: unnamed-task)
#   mark / m         Mark a task done/underway/inactive (by number, filename, or text)
#   delete / x       Delete a task
#   daemon / d       Manage the planq WebSocket daemon

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PLANS_DIR="$WORKSPACE_ROOT/plans"

# ── Determine planq file ──────────────────────────────────────────────────────

_get_planq_file() {
    echo "$PLANS_DIR/planq-order.txt"
}

PLANQ_FILE="$(_get_planq_file)"
ARCHIVE_DIR="$PLANS_DIR/archive"
HISTORY_FILE="$ARCHIVE_DIR/planq-history.txt"

# ── Parse helpers ─────────────────────────────────────────────────────────────

_list_tasks() {
    if [ ! -f "$PLANQ_FILE" ]; then
        echo "(no planq file at $PLANQ_FILE)"
        return
    fi
    local i=0
    while IFS= read -r line; do
        local trimmed="${line#"${line%%[![:space:]]*}"}"
        [ -z "$trimmed" ] && continue
        if [[ "$trimmed" == "# done:"* ]]; then
            i=$((i + 1))
            printf "  \033[2m✅ %-3d  %s\033[0m\n" "$i" "${trimmed#"# done: "}"
        elif [[ "$trimmed" == "# underway:"* ]]; then
            i=$((i + 1))
            printf "  \033[33m⏳ %-3d  %s\033[0m\n" "$i" "${trimmed#"# underway: "}"
        elif [[ "$trimmed" == "# auto-queue:"* ]]; then
            i=$((i + 1))
            printf "  \033[36m⏱  %-3d  %s\033[0m\n" "$i" "${trimmed#"# auto-queue: "}"
        elif [[ "$trimmed" == "#"* ]]; then
            continue  # regular comment — skip
        else
            i=$((i + 1))
            printf "  ▶  %-3d  %s\n" "$i" "$trimmed"
        fi
    done < "$PLANQ_FILE"
}

# Outputs: line_number TAB task_line  (first pending task only)
_find_next_task() {
    [ ! -f "$PLANQ_FILE" ] && return
    local n=0
    while IFS= read -r line; do
        n=$((n + 1))
        local trimmed="${line#"${line%%[![:space:]]*}"}"
        [ -z "$trimmed" ] && continue
        [[ "$trimmed" == "#"* ]] && continue  # comments and done lines
        printf '%d\t%s\n' "$n" "$trimmed"
        return
    done < "$PLANQ_FILE"
}

# Outputs: line_number TAB task_line  for the task at visible position N (1-based)
# Visible position counts all non-comment, non-blank lines (pending and done).
_find_task_by_number() {
    local target="$1"
    [ ! -f "$PLANQ_FILE" ] && return
    local n=0 i=0
    while IFS= read -r line; do
        n=$((n + 1))
        local trimmed="${line#"${line%%[![:space:]]*}"}"
        [ -z "$trimmed" ] && continue
        [[ "$trimmed" == "#"* && "$trimmed" != "# done:"* && "$trimmed" != "# underway:"* && "$trimmed" != "# auto-queue:"* ]] && continue  # skip regular comments
        i=$((i + 1))
        if [ "$i" -eq "$target" ]; then
            # Strip status prefixes if present so we get the raw task line
            if [[ "$trimmed" == "# done: "* ]]; then
                trimmed="${trimmed#"# done: "}"
            elif [[ "$trimmed" == "# underway: "* ]]; then
                trimmed="${trimmed#"# underway: "}"
            elif [[ "$trimmed" == "# auto-queue: "* ]]; then
                trimmed="${trimmed#"# auto-queue: "}"
            fi
            printf '%d\t%s\n' "$n" "$trimmed"
            return
        fi
    done < "$PLANQ_FILE"
}

# Outputs: line_number TAB task_line  for a task identified by number, filename, or text
_find_task_by_identifier() {
    local ident="$1"
    if [[ "$ident" =~ ^[0-9]+$ ]]; then
        _find_task_by_number "$ident"
        return
    fi
    [ ! -f "$PLANQ_FILE" ] && return
    local n=0
    while IFS= read -r line; do
        n=$((n + 1))
        local trimmed="${line#"${line%%[![:space:]]*}"}"
        [ -z "$trimmed" ] && continue
        [[ "$trimmed" == "#"* && "$trimmed" != "# done:"* && "$trimmed" != "# underway:"* && "$trimmed" != "# auto-queue:"* ]] && continue
        local task_line="$trimmed"
        if [[ "$task_line" == "# done: "* ]]; then
            task_line="${task_line#"# done: "}"
        elif [[ "$task_line" == "# underway: "* ]]; then
            task_line="${task_line#"# underway: "}"
        elif [[ "$task_line" == "# auto-queue: "* ]]; then
            task_line="${task_line#"# auto-queue: "}"
        fi
        local task_value="${task_line#*: }"
        # Strip +auto-commit suffix for comparison (it's a flag, not part of filename/description)
        local cmp_value="${task_value% +auto-commit}"
        if [ "$cmp_value" = "$ident" ] || [ "$task_value" = "$ident" ]; then
            printf '%d\t%s\n' "$n" "$task_line"
            return
        fi
    done < "$PLANQ_FILE"
}

_mark_done() {
    local line_num="$1" original_line="$2"
    local tmp
    tmp="$(mktemp)"
    awk -v n="$line_num" -v orig="$original_line" \
        'NR == n { print "# done: " orig; next } { print }' \
        "$PLANQ_FILE" > "$tmp"
    mv "$tmp" "$PLANQ_FILE"
}

_mark_underway() {
    local line_num="$1" original_line="$2"
    local tmp
    tmp="$(mktemp)"
    awk -v n="$line_num" -v orig="$original_line" \
        'NR == n { print "# underway: " orig; next } { print }' \
        "$PLANQ_FILE" > "$tmp"
    mv "$tmp" "$PLANQ_FILE"
}

_mark_inactive() {
    local line_num="$1" original_line="$2"
    local tmp
    tmp="$(mktemp)"
    awk -v n="$line_num" -v orig="$original_line" \
        'NR == n { print orig; next } { print }' \
        "$PLANQ_FILE" > "$tmp"
    mv "$tmp" "$PLANQ_FILE"
}

_mark_auto_queue() {
    local line_num="$1" original_line="$2"
    local tmp
    tmp="$(mktemp)"
    awk -v n="$line_num" -v orig="$original_line" \
        'NR == n { print "# auto-queue: " orig; next } { print }' \
        "$PLANQ_FILE" > "$tmp"
    mv "$tmp" "$PLANQ_FILE"
}

# Outputs: line_number TAB task_line  (first auto-queue task only)
_find_next_auto_task() {
    [ ! -f "$PLANQ_FILE" ] && return
    local n=0
    while IFS= read -r line; do
        n=$((n + 1))
        local trimmed="${line#"${line%%[![:space:]]*}"}"
        [ -z "$trimmed" ] && continue
        [[ "$trimmed" == "# auto-queue: "* ]] || continue
        printf '%d\t%s\n' "$n" "${trimmed#"# auto-queue: "}"
        return
    done < "$PLANQ_FILE"
}

_AUTO_TEST_PENDING="$PLANS_DIR/auto-test-pending.json"
_AUTO_TEST_RESPONSE="$PLANS_DIR/auto-test-response.txt"
_AUTO_COMMIT_CONFIG="$PLANS_DIR/auto-commit-config.txt"

# Write an auto-test-pending record so the dashboard can prompt the user
_write_auto_test_pending() {
    local command="$1" output="$2" exit_code="$3"
    # Escape for JSON
    local escaped_output
    escaped_output="$(printf '%s' "$output" | head -c 4096 | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))' 2>/dev/null || printf '""')"
    printf '{"command":%s,"output":%s,"exit_code":%d}\n' \
        "$(printf '%s' "$command" | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))' 2>/dev/null || printf '""')" \
        "$escaped_output" \
        "$exit_code" \
        > "$_AUTO_TEST_PENDING"
}

_clear_auto_test_pending() {
    rm -f "$_AUTO_TEST_PENDING" "$_AUTO_TEST_RESPONSE"
}

# Wait for a response via dashboard or terminal. Returns 0=continue, 1=abort.
_wait_auto_test_response() {
    rm -f "$_AUTO_TEST_RESPONSE"
    # If we're in a terminal, allow local input too
    if [ -t 0 ]; then
        echo ""
        echo "Tests failed. Waiting for response (or press Enter to continue, Ctrl+C to abort):"
        echo "  (dashboard users can also respond via the Plan Queue panel)"
        local resp=""
        read -r -t 60 resp || true
        _clear_auto_test_pending
        case "${resp,,}" in
            abort|a|no|n) return 1 ;;
            *) return 0 ;;
        esac
    fi
    # Non-interactive: poll for response file (written by dashboard via daemon relay)
    echo "Tests failed. Waiting for dashboard response..."
    local waited=0
    while [ "$waited" -lt 3600 ]; do
        sleep 2
        waited=$((waited + 2))
        if [ -f "$_AUTO_TEST_RESPONSE" ]; then
            local resp
            resp="$(cat "$_AUTO_TEST_RESPONSE" 2>/dev/null || true)"
            _clear_auto_test_pending
            case "${resp,,}" in
                abort|a|no|n) return 1 ;;
                *) return 0 ;;
            esac
        fi
    done
    _clear_auto_test_pending
    return 1  # Timed out — abort
}

_delete_line() {
    local line_num="$1"
    local tmp
    tmp="$(mktemp)"
    awk -v n="$line_num" 'NR != n { print }' "$PLANQ_FILE" > "$tmp"
    mv "$tmp" "$PLANQ_FILE"
}

_parse_task() {
    # Args: task_line → sets task_type, task_value, task_auto_commit in caller scope
    local line="$1"
    task_type="${line%%:*}"
    task_value="${line#*: }"
    task_auto_commit=""
    if [[ "$task_value" == *" +auto-commit" ]]; then
        task_auto_commit="1"
        task_value="${task_value% +auto-commit}"
    fi
}

# List entries in the archive history file
_list_archive() {
    if [ ! -f "$HISTORY_FILE" ]; then
        echo "(no archive at $HISTORY_FILE)"
        return
    fi
    local i=0
    while IFS= read -r line; do
        local trimmed="${line#"${line%%[![:space:]]*}"}"
        [ -z "$trimmed" ] && continue
        if [[ "$trimmed" == "# done:"* ]]; then
            i=$((i + 1))
            printf "  \033[2m✅ %-3d  %s\033[0m\n" "$i" "${trimmed#"# done: "}"
        elif [[ "$trimmed" == "# underway:"* ]]; then
            i=$((i + 1))
            printf "  \033[33m⏳ %-3d  %s\033[0m\n" "$i" "${trimmed#"# underway: "}"
        elif [[ "$trimmed" == "#"* ]]; then
            continue  # regular comment — skip
        else
            i=$((i + 1))
            printf "  ▶  %-3d  %s\n" "$i" "$trimmed"
        fi
    done < "$HISTORY_FILE"
}

# Outputs: line_number TAB task_line (stripped)  for the Nth entry in the archive (1-based)
_find_archive_by_number() {
    local target="$1"
    [ ! -f "$HISTORY_FILE" ] && return
    local n=0 i=0
    while IFS= read -r line; do
        n=$((n + 1))
        local trimmed="${line#"${line%%[![:space:]]*}"}"
        [ -z "$trimmed" ] && continue
        [[ "$trimmed" == "#"* && "$trimmed" != "# done:"* && "$trimmed" != "# underway:"* ]] && continue
        i=$((i + 1))
        if [ "$i" -eq "$target" ]; then
            local task_line="$trimmed"
            if [[ "$task_line" == "# done: "* ]]; then
                task_line="${task_line#"# done: "}"
            elif [[ "$task_line" == "# underway: "* ]]; then
                task_line="${task_line#"# underway: "}"
            fi
            printf '%d\t%s\n' "$n" "$task_line"
            return
        fi
    done < "$HISTORY_FILE"
}

# Outputs: line_number TAB task_line (stripped)  for an archive entry by number or text
_find_archive_by_identifier() {
    local ident="$1"
    if [[ "$ident" =~ ^[0-9]+$ ]]; then
        _find_archive_by_number "$ident"
        return
    fi
    [ ! -f "$HISTORY_FILE" ] && return
    local n=0
    while IFS= read -r line; do
        n=$((n + 1))
        local trimmed="${line#"${line%%[![:space:]]*}"}"
        [ -z "$trimmed" ] && continue
        [[ "$trimmed" == "#"* && "$trimmed" != "# done:"* && "$trimmed" != "# underway:"* ]] && continue
        local task_line="$trimmed"
        if [[ "$task_line" == "# done: "* ]]; then
            task_line="${task_line#"# done: "}"
        elif [[ "$task_line" == "# underway: "* ]]; then
            task_line="${task_line#"# underway: "}"
        fi
        local task_value="${task_line#*: }"
        if [ "$task_value" = "$ident" ] || [ "$task_line" = "$ident" ]; then
            printf '%d\t%s\n' "$n" "$task_line"
            return
        fi
    done < "$HISTORY_FILE"
}

# Archive one task: read original line (with status prefix) from planq, store in history,
# move file if applicable, then remove from planq
_archive_one_task() {
    local line_num="$1" task_line="$2"
    local task_type task_value task_auto_commit
    _parse_task "$task_line"

    mkdir -p "$ARCHIVE_DIR"

    if [ "$task_type" = "task" ] || [ "$task_type" = "plan" ] || [ "$task_type" = "make-plan" ]; then
        if [ -f "$PLANS_DIR/$task_value" ]; then
            mv "$PLANS_DIR/$task_value" "$ARCHIVE_DIR/$task_value"
            echo "  Moved: plans/$task_value → plans/archive/$task_value"
        fi
    fi

    # Read original line (preserving status prefix) before deleting
    local original_line
    original_line="$(awk -v n="$line_num" 'NR == n { print; exit }' "$PLANQ_FILE")"
    original_line="${original_line#"${original_line%%[![:space:]]*}"}"
    printf '%s\n' "$original_line" >> "$HISTORY_FILE"
    _delete_line "$line_num"
}

# ── Subcommands ───────────────────────────────────────────────────────────────

cmd_list() {
    local archive=""
    for arg in "$@"; do
        case "$arg" in
            --archive|-a) archive=1 ;;
        esac
    done

    if [ -n "$archive" ]; then
        echo "Archive: $HISTORY_FILE"
        _list_archive
    else
        echo "Planq: $PLANQ_FILE"
        _list_tasks
    fi
}

_show_task_details() {
    local label="$1" task_line="$2" plans_base="$3"
    local task_type task_value task_auto_commit
    _parse_task "$task_line"

    echo "${label}:"
    printf "  Type:  %s\n" "$task_type"
    if [ "$task_type" = "task" ] || [ "$task_type" = "plan" ]; then
        printf "  File:  plans/%s\n" "$task_value"
        if [ -f "$plans_base/$task_value" ]; then
            echo "  --- preview ---"
            head -5 "$plans_base/$task_value" | sed 's/^/  /'
        fi
    elif [ "$task_type" = "make-plan" ]; then
        local target_plan="${task_value/#make-plan-/plan-}"
        printf "  Prompt file: plans/%s\n" "$task_value"
        printf "  Plan target: plans/%s\n" "$target_plan"
        if [ -f "$plans_base/$task_value" ]; then
            echo "  --- prompt preview ---"
            head -5 "$plans_base/$task_value" | sed 's/^/  /'
        else
            echo "  (prompt file not found)"
        fi
    else
        printf "  Desc:  %s\n" "$task_value"
    fi
    [ -n "$task_auto_commit" ] && printf "  Auto-commit after: yes\n"
}

cmd_show() {
    local archive="" task_num=""
    for arg in "$@"; do
        case "$arg" in
            --archive|-a) archive=1 ;;
            [0-9]*)       task_num="$arg" ;;
        esac
    done

    if [ -n "$archive" ]; then
        local next
        if [ -n "$task_num" ]; then
            next="$(_find_archive_by_number "$task_num")"
            if [ -z "$next" ]; then
                echo "No archive entry #$task_num in $HISTORY_FILE" >&2; return 1
            fi
            local label="Archive #$task_num"
        else
            next="$(_find_archive_by_number 1)"
            if [ -z "$next" ]; then
                echo "No entries in archive $HISTORY_FILE"
                return 0
            fi
            local label="Archive #1"
        fi
        local task_line
        task_line="$(printf '%s' "$next" | cut -f2-)"
        _show_task_details "$label" "$task_line" "$ARCHIVE_DIR"
        return 0
    fi

    local next label
    if [ -n "$task_num" ]; then
        next="$(_find_task_by_number "$task_num")"
        if [ -z "$next" ]; then
            echo "No task #$task_num in $PLANQ_FILE" >&2; return 1
        fi
        label="Task #$task_num"
    else
        next="$(_find_next_task)"
        if [ -z "$next" ]; then
            echo "No pending tasks in $PLANQ_FILE"
            return 0
        fi
        label="Next task"
    fi

    local task_line
    task_line="$(printf '%s' "$next" | cut -f2-)"
    _show_task_details "$label" "$task_line" "$PLANS_DIR"
}

cmd_run() {
    local dry_run="" task_num=""
    for arg in "$@"; do
        case "$arg" in
            --dry-run|-n) dry_run=1 ;;
            [0-9]*)    task_num="$arg" ;;
        esac
    done

    local next
    if [ -n "$task_num" ]; then
        next="$(_find_task_by_number "$task_num")"
        if [ -z "$next" ]; then
            echo "No task #$task_num in $PLANQ_FILE" >&2; return 1
        fi
    else
        next="$(_find_next_task)"
        if [ -z "$next" ]; then
            echo "No pending tasks in $PLANQ_FILE"
            return 0
        fi
    fi

    local line_num task_line task_type task_value task_auto_commit
    line_num="$(printf '%s' "$next" | cut -f1)"
    task_line="$(printf '%s' "$next" | cut -f2-)"
    _parse_task "$task_line"

    echo "Running task: $task_line"

    if [ -n "$dry_run" ]; then
        case "$task_type" in
            task)          echo "[dry-run] Would run: claude \"\$(cat $PLANS_DIR/$task_value)\"" ;;
            plan)          echo "[dry-run] Would run: claude \"Read plans/$task_value and implement the plan\"" ;;
            make-plan)     echo "[dry-run] Would run: claude \"\$(cat $PLANS_DIR/$task_value) Write the plan to plans/${task_value/#make-plan-/plan-}.\"" ;;
            unnamed-task)  echo "[dry-run] Would run: claude \"$task_value\"" ;;
            manual-*) echo "[dry-run] Would prompt for manual step: $task_value" ;;
            *)        echo "[dry-run] Unknown task type: $task_type" ;;
        esac
        return 0
    fi

    case "$task_type" in
        task)
            local task_file="$PLANS_DIR/$task_value"
            if [ ! -f "$task_file" ]; then
                echo "Error: task file not found: $task_file" >&2; return 1
            fi
            claude "$(cat "$task_file")"
            _mark_done "$line_num" "$task_line"
            ;;

        plan)
            local task_file="$PLANS_DIR/$task_value"
            if [ ! -f "$task_file" ]; then
                echo "Error: plan file not found: $task_file" >&2; return 1
            fi
            claude "Read plans/$task_value and implement the plan described in it."
            _mark_done "$line_num" "$task_line"
            ;;

        make-plan)
            local prompt_file="$PLANS_DIR/$task_value"
            if [ ! -f "$prompt_file" ]; then
                echo "Error: prompt file not found: $prompt_file" >&2; return 1
            fi
            local prompt target_plan
            prompt="$(cat "$prompt_file")"
            target_plan="${task_value/#make-plan-/plan-}"
            claude "${prompt} Write the plan to plans/${target_plan}."
            _mark_done "$line_num" "$task_line"
            ;;

        unnamed-task)
            claude "$task_value"
            _mark_done "$line_num" "$task_line"
            ;;

        auto-test)
            _run_auto_test "$task_value" || { _mark_inactive "$line_num" "$task_line"; _notify_daemon; return 1; }
            _mark_done "$line_num" "$task_line"
            ;;

        auto-commit)
            _run_auto_commit "$task_value" || { _mark_inactive "$line_num" "$task_line"; _notify_daemon; return 1; }
            _mark_done "$line_num" "$task_line"
            ;;

        manual-test|manual-commit|manual-task)
            echo ""
            echo "━━━ Manual step required ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
            printf "  Type: %s\n" "$task_type"
            printf "  Task: %s\n" "$task_value"
            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
            echo ""
            read -r -p "Press Enter when done (or Ctrl+C to abort): "
            _mark_done "$line_num" "$task_line"
            echo "Marked as done."
            ;;

        *)
            echo "Error: Unknown task type '$task_type' in: $task_line" >&2
            return 1
            ;;
    esac

    # If the task had +auto-commit, ask Claude to commit after completion
    if [ -n "$task_auto_commit" ] && [ "$task_type" != "auto-commit" ]; then
        _run_auto_commit "" || { _notify_daemon; return 1; }
    fi

    _notify_daemon
}

# Run an auto-test: execute the command and handle failure.
# $1 = task_value (command or filename)
# Returns 0 on success/continue, 1 on abort.
_run_auto_test() {
    local task_value="$1"
    local cmd="$task_value"
    # If task_value is a file in plans/, read the command from it
    if [ -f "$PLANS_DIR/$task_value" ]; then
        cmd="$(cat "$PLANS_DIR/$task_value")"
    fi
    echo "Running tests: $cmd"
    local output exit_code
    output="$(eval "$cmd" 2>&1)" || exit_code=$?
    exit_code="${exit_code:-0}"
    echo "$output"
    if [ "$exit_code" -eq 0 ]; then
        echo "Tests passed."
        return 0
    fi
    echo ""
    echo "Tests FAILED (exit code $exit_code)."
    _write_auto_test_pending "$cmd" "$output" "$exit_code"
    _notify_daemon
    if _wait_auto_test_response; then
        return 0
    fi
    echo "Auto-queue aborted by user."
    return 1
}

# Run an auto-commit task by delegating to Claude.
# $1 = task_value (optional extra instructions for Claude)
# Returns 0 on success, 1 on error/abort.
_run_auto_commit() {
    local task_value="$1"

    # Check for git
    if ! git -C "$WORKSPACE_ROOT" rev-parse --git-dir > /dev/null 2>&1; then
        echo "auto-commit: not a git repository." >&2
        return 1
    fi

    local staged_count unstaged_count
    staged_count="$(git -C "$WORKSPACE_ROOT" diff --cached --name-only 2>/dev/null | wc -l | tr -d ' ')"
    unstaged_count="$(git -C "$WORKSPACE_ROOT" diff --name-only 2>/dev/null | wc -l | tr -d ' ')"

    if [ "$staged_count" -eq 0 ] && [ "$unstaged_count" -eq 0 ]; then
        echo "auto-commit: nothing to commit (working tree clean)."
        return 0
    fi

    # Build prompt for Claude, including any config defaults and task instructions
    local claude_prompt="Please commit the current changes to git."

    local extra_instructions=""
    if [ -f "$_AUTO_COMMIT_CONFIG" ]; then
        local conf_title conf_desc
        conf_title="$(grep '^title=' "$_AUTO_COMMIT_CONFIG" 2>/dev/null | head -1 | cut -d= -f2-)"
        conf_desc="$(grep '^description=' "$_AUTO_COMMIT_CONFIG" 2>/dev/null | head -1 | cut -d= -f2-)"
        [ -n "$conf_title" ] && extra_instructions="${extra_instructions}Use this as the commit title: ${conf_title}. "
        [ -n "$conf_desc" ] && extra_instructions="${extra_instructions}Description source: ${conf_desc}. "
    fi
    [ -n "$task_value" ] && extra_instructions="${extra_instructions}${task_value}"

    [ -n "$extra_instructions" ] && claude_prompt="${claude_prompt} ${extra_instructions}"

    echo "auto-commit: asking Claude to commit changes..."
    claude "$claude_prompt"
}

cmd_create() {
    local task_type="unnamed-task" filename="" description="" auto_commit=""
    while [ $# -gt 0 ]; do
        case "$1" in
            --type|-t) task_type="${2:-}"; shift 2 ;;
            --file|-f) filename="${2:-}"; shift 2 ;;
            --auto-commit) auto_commit="1"; shift ;;
            *) description="$1"; shift ;;
        esac
    done

    local task_line
    case "$task_type" in
        task|plan)
            if [ -z "$filename" ]; then
                echo "Error: --file required for task type '$task_type'" >&2; return 1
            fi
            task_line="${task_type}: ${filename}"
            ;;
        make-plan)
            if [ -z "$filename" ]; then
                echo "Error: --file required for make-plan (the prompt filename, e.g. make-plan-001.md)" >&2; return 1
            fi
            if [ -z "$description" ]; then
                echo "Error: description (the prompt) required for make-plan" >&2; return 1
            fi
            task_line="${task_type}: ${filename}"
            mkdir -p "$PLANS_DIR"
            printf '%s\n' "$description" > "$PLANS_DIR/${filename}"
            echo "Wrote prompt to: plans/${filename}"
            ;;
        unnamed-task|manual-test|manual-commit|manual-task)
            if [ -z "$description" ]; then
                echo "Error: description required for task type '$task_type'" >&2; return 1
            fi
            task_line="${task_type}: ${description}"
            ;;
        *)
            echo "Error: unknown task type '$task_type'" >&2; return 1 ;;
    esac

    [ -n "$auto_commit" ] && task_line="${task_line} +auto-commit"

    mkdir -p "$PLANS_DIR"
    printf '%s\n' "$task_line" >> "$PLANQ_FILE"
    echo "Created: $task_line"
    _notify_daemon
}

_notify_daemon() {
    local sandbox_dir="${HOME}/.local/devcontainer-sandbox"
    local pid_file="$sandbox_dir/planq/planq-daemon.pid"
    if [ -f "$pid_file" ]; then
        local pid
        pid="$(cat "$pid_file")"
        kill -USR1 "$pid" 2>/dev/null || true
    fi
}

cmd_mark() {
    local state="${1:-}" ident="${2:-}"
    # Support "state:ident" as a single arg (e.g. m d:7)
    if [ -n "$state" ] && [ -z "$ident" ] && [[ "$state" == *:* ]]; then
        ident="${state#*:}"
        state="${state%%:*}"
    fi
    if [ -z "$state" ] || [ -z "$ident" ]; then
        echo "Usage: planq mark <done|d|underway|u|inactive|i|queue|q> <N|filename|text>" >&2; return 1
    fi
    case "$state" in
        done|d)         state=done ;;
        underway|u)     state=underway ;;
        inactive|i)     state=inactive ;;
        queue|q)        state=queue ;;
        *) echo "Error: state must be done/d, underway/u, inactive/i, or queue/q; got: $state" >&2; return 1 ;;
    esac
    local next
    next="$(_find_task_by_identifier "$ident")"
    if [ -z "$next" ]; then
        echo "No matching task for '$ident' in $PLANQ_FILE" >&2; return 1
    fi
    local line_num task_line
    line_num="$(printf '%s' "$next" | cut -f1)"
    task_line="$(printf '%s' "$next" | cut -f2-)"
    echo "Task: $task_line"
    case "$state" in
        done)     _mark_done       "$line_num" "$task_line"; echo "Marked as done." ;;
        underway) _mark_underway   "$line_num" "$task_line"; echo "Marked as underway." ;;
        inactive) _mark_inactive   "$line_num" "$task_line"; echo "Marked as inactive (pending)." ;;
        queue)    _mark_auto_queue "$line_num" "$task_line"; echo "Marked as auto-queue." ;;
    esac
    _notify_daemon
}

_run_task_inline() {
    # Run a task (already stripped of status prefix) and mark it done.
    # $1 = line_num, $2 = task_line
    local line_num="$1" task_line="$2"
    local task_type task_value task_auto_commit
    _parse_task "$task_line"
    echo "Auto-running: $task_line"
    _mark_underway "$line_num" "$task_line"
    _notify_daemon

    case "$task_type" in
        task)
            local task_file="$PLANS_DIR/$task_value"
            if [ ! -f "$task_file" ]; then
                echo "Error: task file not found: $task_file" >&2
                _mark_inactive "$line_num" "$task_line"
                _notify_daemon
                return 1
            fi
            claude "$(cat "$task_file")"
            ;;
        plan)
            claude "Read plans/$task_value and implement the plan described in it."
            ;;
        make-plan)
            local prompt_file="$PLANS_DIR/$task_value"
            if [ ! -f "$prompt_file" ]; then
                echo "Error: prompt file not found: $prompt_file" >&2
                _mark_inactive "$line_num" "$task_line"
                _notify_daemon
                return 1
            fi
            local prompt target_plan
            prompt="$(cat "$prompt_file")"
            target_plan="${task_value/#make-plan-/plan-}"
            claude "${prompt} Write the plan to plans/${target_plan}."
            ;;
        unnamed-task)
            claude "$task_value"
            ;;
        auto-test)
            if ! _run_auto_test "$task_value"; then
                _mark_inactive "$line_num" "$task_line"
                _notify_daemon
                return 1
            fi
            ;;
        auto-commit)
            if ! _run_auto_commit "$task_value"; then
                _mark_inactive "$line_num" "$task_line"
                _notify_daemon
                return 1
            fi
            ;;
        manual-test|manual-commit|manual-task)
            echo ""
            echo "━━━ Manual step required ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
            printf "  Type: %s\n" "$task_type"
            printf "  Task: %s\n" "$task_value"
            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
            echo ""
            read -r -p "Press Enter when done (or Ctrl+C to abort): "
            ;;
        *)
            echo "Error: Unknown task type '$task_type' in: $task_line" >&2
            _mark_inactive "$line_num" "$task_line"
            _notify_daemon
            return 1
            ;;
    esac

    # If the task had +auto-commit, ask Claude to commit after completion
    if [ -n "$task_auto_commit" ] && [ "$task_type" != "auto-commit" ]; then
        _run_auto_commit "" || { _notify_daemon; return 1; }
    fi

    _mark_done "$line_num" "$task_line"
    _notify_daemon
}

cmd_auto() {
    local auto_pid_file="$HOME/.local/devcontainer-sandbox/planq/planq-auto.pid"
    mkdir -p "$(dirname "$auto_pid_file")"

    # Warn if another auto session appears to be running
    if [ -f "$auto_pid_file" ]; then
        local other_pid
        other_pid="$(cat "$auto_pid_file" 2>/dev/null || true)"
        if [ -n "$other_pid" ] && kill -0 "$other_pid" 2>/dev/null; then
            echo "Warning: Another auto session is already running (PID $other_pid)." >&2
            echo "Stop it first with: kill $other_pid" >&2
            return 1
        fi
    fi

    echo "$$" > "$auto_pid_file"
    echo "Auto-queue started (PID $$). Monitoring $PLANQ_FILE ..."
    echo "Press Ctrl+C to stop."
    echo ""

    # Cleanup PID file on exit
    trap 'rm -f "$auto_pid_file"; echo ""; echo "Auto-queue stopped."' INT TERM EXIT

    local idle_msg_shown=0
    while true; do
        local next
        next="$(_find_next_auto_task)"
        if [ -z "$next" ]; then
            if [ "$idle_msg_shown" -eq 0 ]; then
                echo "No auto-queue tasks. Waiting... (mark tasks with: planq mark queue <N>)"
                idle_msg_shown=1
            fi
            sleep 5
            continue
        fi
        idle_msg_shown=0
        local line_num task_line
        line_num="$(printf '%s' "$next" | cut -f1)"
        task_line="$(printf '%s' "$next" | cut -f2-)"
        _run_task_inline "$line_num" "$task_line"
    done
}

cmd_delete() {
    local task_num="${1:-}"
    if [ -z "$task_num" ]; then
        echo "Usage: planq delete <N>" >&2; return 1
    fi
    local next
    next="$(_find_task_by_number "$task_num")"
    if [ -z "$next" ]; then
        echo "No task #$task_num in $PLANQ_FILE" >&2; return 1
    fi
    local line_num task_line
    line_num="$(printf '%s' "$next" | cut -f1)"
    task_line="$(printf '%s' "$next" | cut -f2-)"
    echo "Deleting task #$task_num: $task_line"
    _delete_line "$line_num"
    echo "Deleted."
    _notify_daemon
}

cmd_archive() {
    local unarchive=""
    local identifiers=()

    while [ $# -gt 0 ]; do
        case "$1" in
            --unarchive|-U) unarchive=1; shift ;;
            *) identifiers+=("$1"); shift ;;
        esac
    done

    if [ -n "$unarchive" ]; then
        if [ ${#identifiers[@]} -eq 0 ]; then
            echo "Error: --unarchive requires task identifier(s)" >&2; return 1
        fi
        for ident in "${identifiers[@]}"; do
            local next
            next="$(_find_archive_by_identifier "$ident")"
            if [ -z "$next" ]; then
                echo "No matching archive entry '$ident' in $HISTORY_FILE" >&2
                continue
            fi
            local line_num task_line task_type task_value
            line_num="$(printf '%s' "$next" | cut -f1)"
            task_line="$(printf '%s' "$next" | cut -f2-)"
            _parse_task "$task_line"

            if [ "$task_type" = "task" ] || [ "$task_type" = "plan" ] || [ "$task_type" = "make-plan" ]; then
                if [ -f "$ARCHIVE_DIR/$task_value" ]; then
                    mv "$ARCHIVE_DIR/$task_value" "$PLANS_DIR/$task_value"
                    echo "  Moved: plans/archive/$task_value → plans/$task_value"
                fi
            fi

            # Read original line (with status prefix) from history before removing
            local original_line
            original_line="$(awk -v n="$line_num" 'NR == n { print; exit }' "$HISTORY_FILE")"
            original_line="${original_line#"${original_line%%[![:space:]]*}"}"

            local tmp
            tmp="$(mktemp)"
            awk -v n="$line_num" 'NR != n { print }' "$HISTORY_FILE" > "$tmp"
            mv "$tmp" "$HISTORY_FILE"

            mkdir -p "$(dirname "$PLANQ_FILE")"
            printf '%s\n' "$original_line" >> "$PLANQ_FILE"
            echo "Unarchived: $task_line"
        done
        _notify_daemon
        return
    fi

    if [ ! -f "$PLANQ_FILE" ]; then
        echo "(no planq file at $PLANQ_FILE)"
        return
    fi

    if [ ${#identifiers[@]} -gt 0 ]; then
        local tmp_tasks
        tmp_tasks="$(mktemp)"
        for ident in "${identifiers[@]}"; do
            local next
            next="$(_find_task_by_identifier "$ident")"
            if [ -z "$next" ]; then
                echo "No matching task '$ident' in planq" >&2
                continue
            fi
            printf '%s\n' "$next" >> "$tmp_tasks"
        done
    else
        local tmp_tasks
        tmp_tasks="$(mktemp)"
        local n=0
        while IFS= read -r line; do
            n=$((n + 1))
            local trimmed="${line#"${line%%[![:space:]]*}"}"
            [ -z "$trimmed" ] && continue
            if [[ "$trimmed" == "# done:"* ]]; then
                local task_line="${trimmed#"# done: "}"
                printf '%d\t%s\n' "$n" "$task_line" >> "$tmp_tasks"
            fi
        done < "$PLANQ_FILE"
    fi

    if [ ! -s "$tmp_tasks" ]; then
        rm -f "$tmp_tasks"
        echo "No done tasks to archive."
        return
    fi

    # Process in reverse line order to preserve validity of line numbers
    while IFS=$'\t' read -r line_num task_line; do
        echo "Archiving: $task_line"
        _archive_one_task "$line_num" "$task_line"
    done < <(sort -t$'\t' -k1 -rn "$tmp_tasks")
    rm -f "$tmp_tasks"
    _notify_daemon
}

cmd_daemon() {
    local daemon_sh="$SCRIPT_DIR/planq-daemon.sh"
    if [ ! -x "$daemon_sh" ]; then
        echo "Error: planq-daemon.sh not found at $daemon_sh" >&2
        exit 1
    fi
    "$daemon_sh" "${1:-status}" "${@:2}"
}

usage_list()   { echo "Usage: planq list [-a|--archive]"; echo "  List all tasks with status, or list the archive with -a."; }
usage_show()   { echo "Usage: planq show [-a|--archive] [N]"; echo "  Show the next pending task, or task #N if given. Use -a for archive entries."; }
usage_archive() {
    echo "Usage: planq archive [N|filename|text ...]"
    echo "       planq archive --unarchive|-U <N|filename|text> ..."
    echo "  Archive done tasks, removing them from the planq and appending to plans/archive/planq-history.txt."
    echo "  With no arguments: archives all done tasks."
    echo "  With identifiers: archives specific tasks (by number, filename, or text)."
    echo "  Associated task files are moved to plans/archive/."
    echo "  --unarchive/-U: restore archived tasks back to the planq."
}
usage_run()    { echo "Usage: planq run [N] [--dry-run|-n]"; echo "  Run the next pending task, or task #N if given, then mark it done."; }
usage_create() {
    echo "Usage: planq create [-t <type>] [-f <file>] [<desc>]"
    echo "  Add a task to the planq file."
    echo "  -t, --type  Task type (default: unnamed-task)"
    echo "  -f, --file  Filename in plans/ (required for task/plan/make-plan types)"
    echo "  Task types: unnamed-task (default), task, plan, make-plan, manual-test, manual-commit, manual-task"
    echo ""
    echo "  For make-plan, -f specifies the prompt filename (make-plan-*.md); Claude writes plan-*.md:"
    echo "    planq create -t make-plan -f make-plan-001.md 'Design a caching layer for the API'"
}
usage_mark()   {
    echo "Usage: planq mark <done|d|underway|u|inactive|i|queue|q> <N|filename|text>"
    echo "       planq mark:<state> <N|filename|text>"
    echo "  Mark a task with a status."
    echo "  Identify the task by number, by its filename (for task/plan/make-plan), or by its exact description text (for unnamed-task etc.)."
    echo "  inactive/i restores a done/underway/auto-queue task to pending."
    echo "  queue/q marks a task for automatic execution by 'planq auto'."
}
usage_auto()   {
    echo "Usage: planq auto"
    echo "  Monitor the queue for tasks with auto-queue status and run them one at a time."
    echo "  Polls for new auto-queue tasks after each run. Press Ctrl+C to stop."
    echo "  Mark tasks for auto-execution with: planq mark queue <N>"
    echo "  Warns if another auto session is already running."
}
usage_delete() { echo "Usage: planq delete <N>"; echo "  Delete task #N from the planq file."; }
usage_daemon() { echo "Usage: planq daemon [start|stop|restart|status]"; echo "  Manage the planq WebSocket daemon (default: status)."; }

usage() {
    echo "Usage: planq.sh <subcommand> [options]"
    echo ""
    echo "Subcommands:"
    echo "  list    / l                                     List all tasks with status"
    echo "  show    / s [-a] [N]                            Show next pending task, or task #N"
    echo "  run     / r [N] [--dry-run|-n]                 Run next pending task, or task #N"
    echo "  auto    / A                                    Run auto-queued tasks continuously"
    echo "  create  / c [-t <type>] [-f <file>] [<desc>]   Add a task (default type: unnamed-task)"
    echo "  mark    / m <done|underway|inactive|queue> <N|…>  Mark a task (also: mark:<state> / m:<state>)"
    echo "  delete  / x <N>                                Delete task #N"
    echo "  archive / a [N|…] [--unarchive|-U <N|…>]      Archive done tasks; -a flag on list/show for archive"
    echo "  daemon  / d [start|stop|restart|status]        Manage the planq WebSocket daemon"
    echo "  shell   / sh                                   Interactive planq REPL"
    echo ""
    echo "Task types:"
    echo "  unnamed-task               Pass description directly to claude as a prompt (default)"
    echo "  task                       Read plans/<file> and pass its contents to claude"
    echo "  plan                       Ask claude to read and implement plans/<file>"
    echo "  make-plan                  Use a prompt file (make-plan-*.md) to create a plan file (plan-*.md)"
    echo "  manual-(test|commit|task)  Pause for a manual step"
    echo ""
    echo "Task line formats in planq file:"
    echo "  unnamed-task: <text>"
    echo "  task: <file>"
    echo "  plan: <file>"
    echo "  make-plan: <make-plan-file>  (prompt in plans/make-plan-*.md; Claude writes plans/plan-*.md)"
    echo "  manual-test: <desc>  (or manual-commit / manual-task)"
    echo ""
    echo "Planq file: $PLANQ_FILE"
}

_has_help_flag() {
    for arg in "$@"; do
        [ "$arg" = "--help" ] || [ "$arg" = "-h" ] && return 0
    done
    return 1
}

SUBCMD="${1:-}"
shift || true

# --help anywhere on the command line: show command-specific help if command is valid,
# otherwise show general usage.
if _has_help_flag "$@"; then
    case "$SUBCMD" in
        list|l)      usage_list ;;
        show|s)      usage_show ;;
        run|r)       usage_run ;;
        auto|A)      usage_auto ;;
        create|c)    usage_create ;;
        mark|m|mark:*|m:*) usage_mark ;;
        delete|x)    usage_delete ;;
        archive|a)   usage_archive ;;
        daemon|d)    usage_daemon ;;
        *)           usage ;;
    esac
    exit 0
fi

case "$SUBCMD" in
    list|l)              cmd_list "$@" ;;
    show|s)              cmd_show "$@" ;;
    run|r)               cmd_run "$@" ;;
    auto|A)              cmd_auto "$@" ;;
    create|c)            cmd_create "$@" ;;
    mark|m)              cmd_mark "$@" ;;
    mark:*|m:*)          cmd_mark "${SUBCMD#*:}" "$@" ;;
    delete|x)            cmd_delete "$@" ;;
    archive|a)           cmd_archive "$@" ;;
    daemon|d)            cmd_daemon "$@" ;;
    shell|sh)            exec bash "$SCRIPT_DIR/planq-shell.sh" "$@" ;;
    --help|-h|help|"")   usage ;;
    *)
        echo "Unknown subcommand: $SUBCMD" >&2
        echo ""
        usage
        exit 1
        ;;
esac
