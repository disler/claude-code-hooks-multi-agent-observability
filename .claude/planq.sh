#!/usr/bin/env bash
# planq.sh — Plan queue management for devcontainers.
#
# Subcommands:
#   list-tasks    / l   Print queue with status
#   show-next-task / s  Show next pending task (does not run it)
#   run-next-task  / r  Execute next pending task and mark it done
#
# Task line formats:
#   task: <file>          Read file from plans/ and pass its contents to claude
#   plan: <file>          Ask claude to read and implement plans/<file>
#   unnamed-task: <text>  Pass the text directly to claude as a prompt
#   manual-*: <desc>      Pause for a manual step, then continue

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

_mark_done() {
    local line_num="$1" original_line="$2"
    local tmp
    tmp="$(mktemp)"
    awk -v n="$line_num" -v orig="$original_line" \
        'NR == n { print "# done: " orig; next } { print }' \
        "$PLANQ_FILE" > "$tmp"
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

cmd_show_next() {
    local next
    next="$(_find_next_task)"
    if [ -z "$next" ]; then
        echo "No pending tasks in $PLANQ_FILE"
        return 0
    fi
    local task_line task_type task_value
    task_line="$(printf '%s' "$next" | cut -f2-)"
    _parse_task "$task_line"

    echo "Next task:"
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

cmd_run_next() {
    local dry_run="${1:-}"
    local next
    next="$(_find_next_task)"

    if [ -z "$next" ]; then
        echo "No pending tasks in $PLANQ_FILE"
        return 0
    fi

    local line_num task_line task_type task_value
    line_num="$(printf '%s' "$next" | cut -f1)"
    task_line="$(printf '%s' "$next" | cut -f2-)"
    _parse_task "$task_line"

    echo "Next task: $task_line"

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
}

# ── Dispatch ──────────────────────────────────────────────────────────────────

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
    echo "  list-tasks    / l                       List all tasks with status"
    echo "  show-next-task / s                      Show next pending task (no execution)"
    echo "  run-next-task  / r [--dry-run]          Execute next pending task"
    echo "  daemon / d <start|stop|restart|status>  Manage the planq WebSocket daemon"
    echo ""
    echo "Task line formats in planq file:"
    echo "  task: <file>          Read plans/<file> and pass contents to claude"
    echo "  plan: <file>          Ask claude to read and implement plans/<file>"
    echo "  unnamed-task: <text>  Pass text directly to claude as a prompt"
    echo "  manual-*: <desc>      Pause for a manual step"
    echo ""
    echo "Planq file: $PLANQ_FILE"
}

SUBCMD="${1:-}"
shift || true

case "$SUBCMD" in
    list-tasks|l)        cmd_list ;;
    show-next-task|s)    cmd_show_next ;;
    run-next-task|r)
        DRY=""
        for arg in "$@"; do
            [ "$arg" = "--dry-run" ] && DRY=1
        done
        cmd_run_next "$DRY"
        ;;
    daemon|d)              cmd_daemon "$@" ;;
    --help|-h|help|"")   usage ;;
    *)
        echo "Unknown subcommand: $SUBCMD" >&2
        echo ""
        usage
        exit 1
        ;;
esac
