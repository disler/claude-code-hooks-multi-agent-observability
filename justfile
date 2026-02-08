# Multi-Agent Observability System
# Usage: just <recipe>

set dotenv-load
set quiet

server_port := env("SERVER_PORT", "4000")
client_port := env("CLIENT_PORT", "5173")
project_root := justfile_directory()

# List available recipes
default:
    @just --list

# ─── System ──────────────────────────────────────────────

# Start server + client (foreground, Ctrl+C to stop)
start:
    ./scripts/start-system.sh

# Stop all processes and clean up
stop:
    ./scripts/reset-system.sh

# Stop then start
restart: stop start

# ─── Server (Bun, port 4000) ────────────────────────────

# Install server dependencies
server-install:
    cd {{project_root}}/apps/server && bun install

# Start server in dev mode (watch)
server:
    cd {{project_root}}/apps/server && SERVER_PORT={{server_port}} bun run dev

# Start server in production mode
server-prod:
    cd {{project_root}}/apps/server && SERVER_PORT={{server_port}} bun run start

# Typecheck server
server-typecheck:
    cd {{project_root}}/apps/server && bun run typecheck

# ─── Client (Vue + Vite, port 5173) ─────────────────────

# Install client dependencies
client-install:
    cd {{project_root}}/apps/client && bun install

# Start client dev server
client:
    cd {{project_root}}/apps/client && VITE_PORT={{client_port}} bun run dev

# Build client for production
client-build:
    cd {{project_root}}/apps/client && bun run build

# Preview production build
client-preview:
    cd {{project_root}}/apps/client && bun run preview

# ─── Install ─────────────────────────────────────────────

# Install all dependencies (server + client)
install: server-install client-install

# ─── Database ────────────────────────────────────────────

# Clear SQLite WAL files
db-clean-wal:
    rm -f {{project_root}}/apps/server/events.db-wal {{project_root}}/apps/server/events.db-shm
    @echo "WAL files removed"

# Delete the entire events database
db-reset:
    rm -f {{project_root}}/apps/server/events.db {{project_root}}/apps/server/events.db-wal {{project_root}}/apps/server/events.db-shm
    @echo "Database reset"

# ─── Testing ─────────────────────────────────────────────

# Send a test event to the server
test-event:
    curl -s -X POST http://localhost:{{server_port}}/events \
      -H "Content-Type: application/json" \
      -d '{"source_app":"test","session_id":"test-1234","hook_event_type":"PreToolUse","payload":{"tool_name":"Bash","tool_input":{"command":"echo hello"}}}' \
      | head -c 200
    @echo ""

# Check server health
health:
    @curl -sf http://localhost:{{server_port}}/health > /dev/null 2>&1 \
      && echo "Server: UP (port {{server_port}})" \
      || echo "Server: DOWN (port {{server_port}})"
    @curl -sf http://localhost:{{client_port}} > /dev/null 2>&1 \
      && echo "Client: UP (port {{client_port}})" \
      || echo "Client: DOWN (port {{client_port}})"

# ─── Hooks ───────────────────────────────────────────────

# Test a hook script directly (e.g. just hook-test pre_tool_use)
hook-test name:
    echo '{"session_id":"test-hook","tool_name":"Bash"}' | uv run {{project_root}}/.claude/hooks/{{name}}.py

# List all hook scripts
hooks:
    @ls -1 {{project_root}}/.claude/hooks/*.py | xargs -I{} basename {} .py

# ─── Open ────────────────────────────────────────────────

# Open the client dashboard in browser
open:
    open http://localhost:{{client_port}}
