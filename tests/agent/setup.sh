#!/usr/bin/env bash
# setup.sh — Start the agent testing environment for observability + planq-daemon.
#
# Creates test data (if absent), starts a test observability server on port 4100,
# and starts planq-daemon instances for each simulated container.
#
# Usage:
#   tests/agent/setup.sh [--reset]    # --reset recreates all test data from scratch
#
# After setup, the server is at http://127.0.0.1:4100 and ws://127.0.0.1:4100/container-heartbeat

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OBS_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SERVER_DIR="$OBS_ROOT/apps/server"
DASHBOARD_DIR="$OBS_ROOT/apps/dashboard"
DATA_DIR="$SCRIPT_DIR/test-data"
PIDS_DIR="$DATA_DIR/pids"
LOGS_DIR="$DATA_DIR/logs"
SERVER_DB_DIR="$DATA_DIR/server"

TEST_SERVER_PORT=4100
TEST_SERVER_HOST=127.0.0.1
TEST_SERVER_URL="ws://${TEST_SERVER_HOST}:${TEST_SERVER_PORT}/container-heartbeat"

die() { echo "ERROR: $*" >&2; exit 1; }
ok() { echo "  OK: $*"; }

_find_bun() {
    for b in "$(command -v bun 2>/dev/null)" "$HOME/.bun/bin/bun" "$HOME/.local/bin/bun"; do
        [[ -x "$b" ]] && echo "$b" && return
    done
    die "bun not found — install bun (https://bun.sh) to run the observability server"
}

_find_venv_python() {
    local venv="$HOME/.local/devcontainer-sandbox/planq-venv"
    if [[ -x "$venv/bin/python3" ]]; then
        echo "$venv/bin/python3"
    elif command -v python3 &>/dev/null; then
        echo "$(command -v python3)"
    else
        die "python3 not found"
    fi
}

# ── (Re)create test data ───────────────────────────────────────────────────────

if [[ "$1" == "--reset" ]] || [[ ! -d "$DATA_DIR" ]]; then
    echo "Populating test data..."
    bash "$SCRIPT_DIR/populate-data.sh" || die "populate-data.sh failed"
fi
mkdir -p "$PIDS_DIR" "$LOGS_DIR" "$SERVER_DB_DIR"

# ── Check for already-running test environment ─────────────────────────────────

_is_running() {
    local pidfile="$1"
    [[ -f "$pidfile" ]] && kill -0 "$(cat "$pidfile")" 2>/dev/null
}

if _is_running "$PIDS_DIR/server.pid"; then
    echo "Test server is already running (PID $(cat "$PIDS_DIR/server.pid"))"
    echo "Use teardown.sh first, or pass --reset to reset everything."
    exit 0
fi

# ── Start test observability server ───────────────────────────────────────────

BUN="$(_find_bun)"
echo "Starting test observability server on ${TEST_SERVER_HOST}:${TEST_SERVER_PORT}..."
(
    cd "$SERVER_DB_DIR"
    exec env \
        SERVER_PORT="$TEST_SERVER_PORT" \
        SERVER_HOST="$TEST_SERVER_HOST" \
        "$BUN" "$SERVER_DIR/src/index.ts" >> "$LOGS_DIR/server.log" 2>&1
) &
SERVER_PID=$!
echo "$SERVER_PID" > "$PIDS_DIR/server.pid"

# Health check
retries=20
while [[ "$retries" -gt 0 ]]; do
    sleep 0.5
    if ! kill -0 "$SERVER_PID" 2>/dev/null; then
        rm -f "$PIDS_DIR/server.pid"
        die "Server failed to start — check $LOGS_DIR/server.log"
    fi
    if curl -sf "http://${TEST_SERVER_HOST}:${TEST_SERVER_PORT}/events" &>/dev/null; then
        ok "Test server started (PID $SERVER_PID)"
        break
    fi
    retries=$((retries - 1))
done
if [[ "$retries" -eq 0 ]]; then
    kill "$SERVER_PID" 2>/dev/null
    rm -f "$PIDS_DIR/server.pid"
    die "Server health check timed out — check $LOGS_DIR/server.log"
fi

# ── Start planq-daemon instances ───────────────────────────────────────────────

PYTHON="$(_find_venv_python)"
DAEMON="$OBS_ROOT/.claude/planq-daemon.py"
[[ -f "$DAEMON" ]] || die "planq-daemon.py not found at $DAEMON"

_start_daemon() {
    local label="$1" workspace="$2" source_repo="$3" hostname="$4"
    local pidfile="$PIDS_DIR/daemon-${label}.pid"
    local logfile="$LOGS_DIR/daemon-${label}.log"

    if _is_running "$pidfile"; then
        ok "daemon-$label already running (PID $(cat "$pidfile"))"
        return
    fi

    (
        exec env \
            OBSERVABILITY_SERVER_URL="$TEST_SERVER_URL" \
            WORKSPACE_PATH="$workspace" \
            WORKSPACE_HOST_PATH="$workspace" \
            SOURCE_REPO="$source_repo" \
            HOSTNAME="test-container-$label" \
            OBSERVABILITY_HEARTBEAT_INTERVAL=5 \
            "$PYTHON" "$DAEMON" >> "$logfile" 2>&1
    ) &
    local pid=$!
    echo "$pid" > "$pidfile"
    sleep 1
    if kill -0 "$pid" 2>/dev/null; then
        ok "daemon-$label started (PID $pid, workspace=$workspace)"
    else
        rm -f "$pidfile"
        echo "  WARN: daemon-$label failed to start — check $logfile"
    fi
}

_start_daemon "alpha" \
    "$DATA_DIR/host1/container-alpha" \
    "container-alpha" \
    "test-host1"

_start_daemon "alpha.1" \
    "$DATA_DIR/host1/container-alpha.1" \
    "container-alpha" \
    "test-host1"

_start_daemon "beta" \
    "$DATA_DIR/host2/container-beta" \
    "container-beta" \
    "test-host2"

# ── Optionally start the dashboard dev server ──────────────────────────────────
#
# Pass --dashboard (or --web) to also start the Vite dev server for the dashboard,
# configured to point at the test server on port 4100.  Useful for Playwright tests
# and manual UI exploration.

DASHBOARD_PORT=5174
START_DASHBOARD=0
for arg in "$@"; do
    [[ "$arg" == "--dashboard" || "$arg" == "--web" ]] && START_DASHBOARD=1
done

if [[ "$START_DASHBOARD" == 1 ]]; then
    DASHBOARD_PID_FILE="$PIDS_DIR/dashboard.pid"
    if _is_running "$DASHBOARD_PID_FILE"; then
        ok "Dashboard already running (PID $(cat "$DASHBOARD_PID_FILE"))"
    else
        # The repo's node_modules may have been installed on a different platform
        # (e.g. macOS/x86 host mounting into an arm64 Linux container).  We never
        # touch the shared node_modules; instead we prepend a container-local path
        # that holds the platform-native rollup binary pre-installed by the
        # Dockerfile, so Vite can find it without modifying the workspace.
        ROLLUP_NATIVE_PATH="/home/node/.local/lib/rollup-native/node_modules"
        if [[ -d "$ROLLUP_NATIVE_PATH" ]]; then
            EXTRA_NODE_PATH="$ROLLUP_NATIVE_PATH"
        else
            EXTRA_NODE_PATH=""
        fi

        echo "Starting dashboard dev server on 127.0.0.1:${DASHBOARD_PORT}..."
        (
            cd "$DASHBOARD_DIR"
            exec env \
                VITE_SERVER_PORT="$TEST_SERVER_PORT" \
                VITE_HOST=127.0.0.1 \
                NODE_PATH="${EXTRA_NODE_PATH}${EXTRA_NODE_PATH:+:}${NODE_PATH:-}" \
                npx vite --port "$DASHBOARD_PORT" --strictPort \
                >> "$LOGS_DIR/dashboard.log" 2>&1
        ) &
        DASHBOARD_PID=$!
        echo "$DASHBOARD_PID" > "$DASHBOARD_PID_FILE"

        retries=60
        while [[ "$retries" -gt 0 ]]; do
            sleep 0.5
            if ! kill -0 "$DASHBOARD_PID" 2>/dev/null; then
                rm -f "$DASHBOARD_PID_FILE"
                die "Dashboard failed to start — check $LOGS_DIR/dashboard.log"
            fi
            if curl -sf "http://127.0.0.1:${DASHBOARD_PORT}/dashboard/" &>/dev/null; then
                ok "Dashboard started (PID $DASHBOARD_PID, http://127.0.0.1:${DASHBOARD_PORT}/dashboard/)"
                break
            fi
            retries=$((retries - 1))
        done
        if [[ "$retries" -eq 0 ]]; then
            kill "$DASHBOARD_PID" 2>/dev/null
            rm -f "$DASHBOARD_PID_FILE"
            die "Dashboard health check timed out — check $LOGS_DIR/dashboard.log"
        fi
    fi
fi

# ── Summary ────────────────────────────────────────────────────────────────────

echo ""
echo "Agent test environment ready."
echo "  Server:     http://${TEST_SERVER_HOST}:${TEST_SERVER_PORT}"
echo "  Server WS:  $TEST_SERVER_URL"
echo "  Server log: $LOGS_DIR/server.log"
echo "  Data dir:   $DATA_DIR"
if [[ "$START_DASHBOARD" == 1 ]]; then
echo "  Dashboard:  http://127.0.0.1:${DASHBOARD_PORT}/dashboard/"
fi
echo ""
echo "Simulated containers:"
echo "  container-alpha         host1  $DATA_DIR/host1/container-alpha"
echo "  container-alpha.1    host1  $DATA_DIR/host1/container-alpha.1 (worktree)"
echo "  container-beta          host2  $DATA_DIR/host2/container-beta"
echo ""
echo "To stop: tests/agent/teardown.sh"
