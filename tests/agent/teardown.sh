#!/usr/bin/env bash
# teardown.sh — Stop all agent test services (server + planq-daemons).
#
# Usage:
#   tests/agent/teardown.sh            # stop services, keep test data
#   tests/agent/teardown.sh --clean    # stop services and delete all test data

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="$SCRIPT_DIR/test-data"
PIDS_DIR="$DATA_DIR/pids"

_stop_pid() {
    local label="$1" pidfile="$2"
    if [[ -f "$pidfile" ]]; then
        local pid
        pid=$(cat "$pidfile")
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null
            echo "  Stopped $label (PID $pid)"
        else
            echo "  $label was not running (PID $pid)"
        fi
        rm -f "$pidfile"
    fi
}

echo "Stopping agent test services..."
_stop_pid "server"        "$PIDS_DIR/server.pid"
_stop_pid "daemon-alpha"  "$PIDS_DIR/daemon-alpha.pid"
_stop_pid "daemon-alpha.1" "$PIDS_DIR/daemon-alpha.1.pid"
_stop_pid "daemon-beta"   "$PIDS_DIR/daemon-beta.pid"
_stop_pid "dashboard"     "$PIDS_DIR/dashboard.pid"

if [[ "$1" == "--clean" ]]; then
    echo "Removing test data at $DATA_DIR..."
    rm -rf "$DATA_DIR"
    echo "  Done."
else
    echo "Test data retained at $DATA_DIR (use --clean to remove)."
fi
