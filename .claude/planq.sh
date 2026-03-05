#!/usr/bin/env bash
# planq.sh — Plan queue management for devcontainers.
#
# Subcommands:
#   list / l         Print queue with status
#   show / s [N]     Show next pending task, or task #N (does not run it)
#   run  / r [N]     Execute next pending task, or task #N, and mark it done
#   create / c       Add a task (default type: unnamed-task)
#   mark / m         Mark a task done/underway/inactive
#   delete / x       Delete a task
#   daemon / d       Manage the planq WebSocket daemon

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PLANS_DIR="$WORKSPACE_ROOT/plans"

# ── Determine planq file ──────────────────────────────────────────────────────

_get_planq_file() {
    local source_repo="${SOURCE_REPO:-}"
    if [ -z "$source_repo" ]; then
        source_repo="$(basename "$WORKSPACE_ROOT")"
    fi

    # Check if we're in a worktree by looking for any non-current entry
    local worktree
    worktree="$(git -C "$WORKSPACE_ROOT" worktree list --porcelain 2>/dev/null \
        | awk -v ws="$WORKSPACE_ROOT" '
            /^worktree / { wt=$2 }
            /^HEAD/ && wt != ws { print wt; exit }
        ')"

    if [ -n "$worktree" ]; then
        local basename container_id
        basename="$(basename "$worktree")"
        if [[ "$basename" == "${source_repo}."* ]]; then
            container_id="${basename}"
        else
            container_id="${source_repo}.${basename}"
        fi
        echo "$PLANS_DIR/planq-order-${container_id}.txt"
    else
        echo "$PLANS_DIR/planq-order.txt"
    fi
}

PLANQ_FILE="$(_get_planq_file)"

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
        [[ "$trimmed" == "#"* && "$trimmed" != "# done:"* && "$trimmed" != "# underway:"* ]] && continue  # skip regular comments
        i=$((i + 1))
        if [ "$i" -eq "$target" ]; then
            # Strip status prefixes if present so we get the raw task line
            if [[ "$trimmed" == "# done: "* ]]; then
                trimmed="${trimmed#"# done: "}"
            elif [[ "$trimmed" == "# underway: "* ]]; then
                trimmed="${trimmed#"# underway: "}"
            fi
            printf '%d\t%s\n' "$n" "$trimmed"
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

_delete_line() {
    local line_num="$1"
    local tmp
    tmp="$(mktemp)"
    awk -v n="$line_num" 'NR != n { print }' "$PLANQ_FILE" > "$tmp"
    mv "$tmp" "$PLANQ_FILE"
}

_parse_task() {
    # Args: task_line → sets task_type and task_value in caller scope
    local line="$1"
    task_type="${line%%:*}"
    task_value="${line#*: }"
}

# ── Subcommands ───────────────────────────────────────────────────────────────

cmd_list() {
    echo "Planq: $PLANQ_FILE"
    _list_tasks
}

cmd_show() {
    local task_num="${1:-}"
    local next task_line task_type task_value label

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

    task_line="$(printf '%s' "$next" | cut -f2-)"
    _parse_task "$task_line"

    echo "${label}:"
    printf "  Type:  %s\n" "$task_type"
    if [ "$task_type" = "task" ] || [ "$task_type" = "plan" ]; then
        printf "  File:  plans/%s\n" "$task_value"
        if [ -f "$PLANS_DIR/$task_value" ]; then
            echo "  --- preview ---"
            head -5 "$PLANS_DIR/$task_value" | sed 's/^/  /'
        fi
    else
        printf "  Desc:  %s\n" "$task_value"
    fi
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

    local line_num task_line task_type task_value
    line_num="$(printf '%s' "$next" | cut -f1)"
    task_line="$(printf '%s' "$next" | cut -f2-)"
    _parse_task "$task_line"

    echo "Running task: $task_line"

    if [ -n "$dry_run" ]; then
        case "$task_type" in
            task)          echo "[dry-run] Would run: claude \"\$(cat $PLANS_DIR/$task_value)\"" ;;
            plan)          echo "[dry-run] Would run: claude \"Read plans/$task_value and implement the plan\"" ;;
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

        unnamed-task)
            claude "$task_value"
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
    _notify_daemon
}

cmd_create() {
    local task_type="unnamed-task" filename="" description=""
    while [ $# -gt 0 ]; do
        case "$1" in
            --type|-t) task_type="${2:-}"; shift 2 ;;
            --file|-f) filename="${2:-}"; shift 2 ;;
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
        unnamed-task|manual-test|manual-commit|manual-task)
            if [ -z "$description" ]; then
                echo "Error: description required for task type '$task_type'" >&2; return 1
            fi
            task_line="${task_type}: ${description}"
            ;;
        *)
            echo "Error: unknown task type '$task_type'" >&2; return 1 ;;
    esac

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
    local task_num="${1:-}" state="${2:-done}"
    if [ -z "$task_num" ]; then
        echo "Usage: planq mark <N> [done|d|underway|u|inactive|i]" >&2; return 1
    fi
    case "$state" in
        done|d)         state=done ;;
        underway|u)     state=underway ;;
        inactive|i)     state=inactive ;;
        *) echo "Error: state must be done/d, underway/u, or inactive/i; got: $state" >&2; return 1 ;;
    esac
    local next
    next="$(_find_task_by_number "$task_num")"
    if [ -z "$next" ]; then
        echo "No task #$task_num in $PLANQ_FILE" >&2; return 1
    fi
    local line_num task_line
    line_num="$(printf '%s' "$next" | cut -f1)"
    task_line="$(printf '%s' "$next" | cut -f2-)"
    echo "Task #$task_num: $task_line"
    case "$state" in
        done)     _mark_done     "$line_num" "$task_line"; echo "Marked as done." ;;
        underway) _mark_underway "$line_num" "$task_line"; echo "Marked as underway." ;;
        inactive) _mark_inactive "$line_num" "$task_line"; echo "Marked as inactive (pending)." ;;
    esac
    _notify_daemon
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

cmd_daemon() {
    local daemon_sh="$SCRIPT_DIR/planq-daemon.sh"
    if [ ! -x "$daemon_sh" ]; then
        echo "Error: planq-daemon.sh not found at $daemon_sh" >&2
        exit 1
    fi
    "$daemon_sh" "${1:-status}" "${@:2}"
}

usage() {
    echo "Usage: planq.sh <subcommand> [options]"
    echo ""
    echo "Subcommands:"
    echo "  list   / l                                     List all tasks with status"
    echo "  show   / s [N]                                 Show next pending task, or task #N"
    echo "  run    / r [N] [--dry-run|-n]                  Run next pending task, or task #N"
    echo "  create / c [-t <type>] [-f <file>] [<desc>]    Add a task (default type: unnamed-task)"
    echo "  mark   / m <N> [done|d|underway|u|inactive|i]  Mark task #N (default: done)"
    echo "  delete / x <N>                                 Delete task #N"
    echo "  daemon / d [start|stop|restart|status]         Manage the planq WebSocket daemon"
    echo ""
    echo "Task types:"
    echo "  unnamed-task               Pass description directly to claude as a prompt (default)"
    echo "  task                       Read plans/<file> and pass its contents to claude"
    echo "  plan                       Ask claude to read and implement plans/<file>"
    echo "  manual-(test|commit|task)  Pause for a manual step"
    echo ""
    echo "Task line formats in planq file:"
    echo "  unnamed-task: <text>"
    echo "  task: <file>"
    echo "  plan: <file>"
    echo "  manual-test: <desc>  (or manual-commit / manual-task)"
    echo ""
    echo "Planq file: $PLANQ_FILE"
}

SUBCMD="${1:-}"
shift || true

case "$SUBCMD" in
    list|l)              cmd_list ;;
    show|s)              cmd_show "$@" ;;
    run|r)               cmd_run "$@" ;;
    create|c)            cmd_create "$@" ;;
    mark|m)              cmd_mark "$@" ;;
    delete|x)            cmd_delete "$@" ;;
    daemon|d)            cmd_daemon "$@" ;;
    --help|-h|help|"")   usage ;;
    *)
        echo "Unknown subcommand: $SUBCMD" >&2
        echo ""
        usage
        exit 1
        ;;
esac
