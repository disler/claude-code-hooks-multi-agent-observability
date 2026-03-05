#!/usr/bin/env bash
# planq-daemon.sh — Manage the planq WebSocket daemon lifecycle.
#
# Usage:
#   planq-daemon.sh [--]start     Set up venv and start daemon in background
#   planq-daemon.sh [--]stop      Stop running daemon
#   planq-daemon.sh [--]restart   Stop then start
#   planq-daemon.sh [--]status    Show whether daemon is running and connected

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="$SCRIPT_DIR/.venv"

SANDBOX_DIR="${HOME}/.local/devcontainer-sandbox"
PID_FILE="$SANDBOX_DIR/planq/planq-daemon.pid"
STATUS_FILE="$SANDBOX_DIR/planq/planq-daemon.status"
LOG_FILE="$SANDBOX_DIR/logs/planq-daemon.log"

_setup_venv() {
    if [ ! -x "$VENV/bin/python3" ]; then
        python3 -m venv "$VENV"
    fi
    "$VENV/bin/pip" install -q -r "$SCRIPT_DIR/requirements.txt"
}

_get_pid() {
    [ -f "$PID_FILE" ] && cat "$PID_FILE"
}

_is_running() {
    local pid
    pid="$(_get_pid)"
    [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

_read_status() {
    [ -f "$STATUS_FILE" ] && cat "$STATUS_FILE" || echo "unknown"
}

cmd_start() {
    if _is_running; then
        echo "planq-daemon already running (pid $(_get_pid))"
        return 0
    fi
    _setup_venv
    mkdir -p "$(dirname "$PID_FILE")" "$(dirname "$LOG_FILE")"
    "$VENV/bin/python3" -u "$SCRIPT_DIR/planq-daemon.py" >> "$LOG_FILE" 2>&1 &
    echo $! > "$PID_FILE"
    echo "planq-daemon started (pid $(_get_pid)), log: $LOG_FILE"
}

cmd_stop() {
    local pid
    pid="$(_get_pid)"
    if [ -z "$pid" ] || ! kill -0 "$pid" 2>/dev/null; then
        echo "planq-daemon not running"
        rm -f "$PID_FILE"
        return 0
    fi
    kill "$pid"
    rm -f "$PID_FILE"
    echo "planq-daemon stopped (pid $pid)"
}

cmd_restart() {
    cmd_stop
    cmd_start
}

cmd_status() {
    if _is_running; then
        local status_line
        status_line="$(_read_status)"
        echo "planq-daemon running (pid $(_get_pid))"
        echo "  status: $status_line"
        echo "  log:    $LOG_FILE"
    else
        echo "planq-daemon not running"
        if [ -f "$STATUS_FILE" ]; then
            echo "  last status: $(_read_status)"
        fi
    fi
}

SUBCMD="${1:-start}"
SUBCMD="${SUBCMD#--}"   # strip leading -- so --start == start
case "$SUBCMD" in
    start)   cmd_start ;;
    stop)    cmd_stop ;;
    restart) cmd_restart ;;
    status)  cmd_status ;;
    *)
        echo "Usage: planq-daemon.sh {start|stop|restart|status}" >&2
        exit 1
        ;;
esac
