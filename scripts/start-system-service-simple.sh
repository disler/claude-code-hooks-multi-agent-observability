#!/bin/bash

# Multi-Agent Observability System - SystemD Service Starter (Simple Type)
# This script starts the system as a systemd service and keeps running

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Get the directory of this script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
# Get the project root directory (parent of scripts)
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

# Log file location
LOG_FILE="/tmp/multi-agent-observability.log"

# Function to log messages
log_message() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

# Function to check if port is in use
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        return 0  # Port is in use
    else
        return 1  # Port is free
    fi
}

# Cleanup function
cleanup() {
    log_message "${YELLOW}🛑 Shutting down processes...${NC}"
    
    if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
        kill "$SERVER_PID" 2>/dev/null
        wait "$SERVER_PID" 2>/dev/null
    fi
    
    if [ -n "$CLIENT_PID" ] && kill -0 "$CLIENT_PID" 2>/dev/null; then
        kill "$CLIENT_PID" 2>/dev/null
        wait "$CLIENT_PID" 2>/dev/null
    fi
    
    # Clean up PID files
    rm -f "/tmp/multi-agent-observability-server.pid"
    rm -f "/tmp/multi-agent-observability-client.pid"
    
    log_message "${GREEN}✅ Cleanup completed${NC}"
    exit 0
}

# Set up signal handlers
trap cleanup SIGTERM SIGINT

# Load environment variables if .env exists
if [ -f "$PROJECT_ROOT/apps/server/.env" ]; then
    while IFS='=' read -r key value; do
        if [[ $key =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] && [ -n "$value" ]; then
            # Remove inline comments from value
            value=$(echo "$value" | sed 's/[[:space:]]*#.*//')
            export "$key=$value"
        fi
    done < <(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$PROJECT_ROOT/apps/server/.env")
fi

# Server configuration with defaults
SERVER_HOST=${SERVER_HOST:-localhost}
SERVER_PORT=${SERVER_PORT:-4000}
CLIENT_PORT=5173

log_message "${BLUE}🚀 Starting Multi-Agent Observability System${NC}"
log_message "${BLUE}============================================${NC}"

# Check if ports are already in use
if check_port $SERVER_PORT; then
    log_message "${RED}❌ Port $SERVER_PORT is already in use. Cannot start service.${NC}"
    exit 1
fi

if check_port $CLIENT_PORT; then
    log_message "${RED}❌ Port $CLIENT_PORT is already in use. Cannot start service.${NC}"
    exit 1
fi

# Start server in background
log_message "${GREEN}Starting server on ${SERVER_HOST}:${SERVER_PORT}...${NC}"
cd "$PROJECT_ROOT/apps/server"
SERVER_HOST=$SERVER_HOST SERVER_PORT=$SERVER_PORT /usr/local/bin/bun src/index.ts > "$LOG_FILE.server" 2>&1 &
SERVER_PID=$!
echo $SERVER_PID > "/tmp/multi-agent-observability-server.pid"

# Wait for server to be ready
log_message "${YELLOW}Waiting for server to start...${NC}"
for i in {1..30}; do
    if curl -s http://${SERVER_HOST}:${SERVER_PORT}/health >/dev/null 2>&1 || curl -s http://${SERVER_HOST}:${SERVER_PORT}/events/filter-options >/dev/null 2>&1; then
        log_message "${GREEN}✅ Server is ready!${NC}"
        break
    fi
    sleep 2
done

# Start client in background
log_message "${GREEN}Starting client on port ${CLIENT_PORT}...${NC}"
cd "$PROJECT_ROOT/apps/client"

# If server is binding to all interfaces, client needs actual IP
CLIENT_SERVER_HOST=$SERVER_HOST
if [ "$SERVER_HOST" = "0.0.0.0" ]; then
    CLIENT_SERVER_HOST=$(hostname -I | awk '{print $1}')
    log_message "${YELLOW}Client will connect to server at: ${CLIENT_SERVER_HOST}:${SERVER_PORT}${NC}"
fi

# Load client env if exists, otherwise use computed values
if [ -f "$PROJECT_ROOT/apps/client/.env" ]; then
    # Only export valid environment variables (skip comments and empty lines)
    while IFS='=' read -r key value; do
        if [[ $key =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] && [ -n "$value" ]; then
            # Remove inline comments from value
            value=$(echo "$value" | sed 's/[[:space:]]*#.*//')
            export "$key=$value"
        fi
    done < <(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$PROJECT_ROOT/apps/client/.env")
    /usr/local/bin/bun run dev > "$LOG_FILE.client" 2>&1 &
else
    env VITE_SERVER_HOST=$CLIENT_SERVER_HOST VITE_SERVER_PORT=$SERVER_PORT /usr/local/bin/bun run dev > "$LOG_FILE.client" 2>&1 &
fi
CLIENT_PID=$!
echo $CLIENT_PID > "/tmp/multi-agent-observability-client.pid"

# Wait for client to be ready
log_message "${YELLOW}Waiting for client to start...${NC}"
for i in {1..30}; do
    if curl -s http://localhost:${CLIENT_PORT} >/dev/null 2>&1; then
        log_message "${GREEN}✅ Client is ready!${NC}"
        break
    fi
    sleep 2
done

# Display status
log_message "${BLUE}============================================${NC}"
log_message "${GREEN}✅ Multi-Agent Observability System Started${NC}"
log_message "${BLUE}============================================${NC}"

# Display appropriate host for access
DISPLAY_HOST=$SERVER_HOST
if [ "$SERVER_HOST" = "0.0.0.0" ]; then
    LOCAL_IP=$(hostname -I | awk '{print $1}')
    log_message "${YELLOW}Server is listening on all interfaces (0.0.0.0)${NC}"
    log_message "Access from this machine: ${GREEN}http://localhost:${SERVER_PORT}${NC}"
    log_message "Access from network: ${GREEN}http://${LOCAL_IP}:${SERVER_PORT}${NC}"
    DISPLAY_HOST="localhost"
fi

log_message "🖥️  Client URL: ${GREEN}http://${DISPLAY_HOST}:${CLIENT_PORT}${NC}"
log_message "🔌 Server API: ${GREEN}http://${DISPLAY_HOST}:${SERVER_PORT}${NC}"
log_message "📡 WebSocket: ${GREEN}ws://${DISPLAY_HOST}:${SERVER_PORT}/stream${NC}"
log_message "📝 Process IDs: Server PID: ${YELLOW}$SERVER_PID${NC}, Client PID: ${YELLOW}$CLIENT_PID${NC}"
log_message "📋 Log files: ${LOG_FILE}, ${LOG_FILE}.server, ${LOG_FILE}.client"

log_message "${GREEN}✅ SystemD service startup completed - running in foreground${NC}"

# Wait for both processes (this keeps the script running)
wait $SERVER_PID $CLIENT_PID