#!/bin/bash

# Multi-Agent Observability System - SystemD Service Stopper
# This script stops the system when running as a systemd service

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# PID files
SERVER_PID_FILE="/tmp/multi-agent-observability-server.pid"
CLIENT_PID_FILE="/tmp/multi-agent-observability-client.pid"
MAIN_PID_FILE="/run/multi-agent-observability.pid"

# Log file location
LOG_FILE="/tmp/multi-agent-observability.log"

# Function to log messages
log_message() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" >> "$LOG_FILE"
    echo -e "$1"
}

log_message "${YELLOW}🛑 Stopping Multi-Agent Observability System${NC}"
log_message "${YELLOW}==============================================${NC}"

# Function to stop process by PID file
stop_process() {
    local pid_file=$1
    local process_name=$2
    
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if kill -0 "$pid" 2>/dev/null; then
            log_message "${YELLOW}Stopping $process_name (PID: $pid)...${NC}"
            kill "$pid"
            
            # Wait for graceful shutdown
            for i in {1..10}; do
                if ! kill -0 "$pid" 2>/dev/null; then
                    log_message "${GREEN}✅ $process_name stopped gracefully${NC}"
                    break
                fi
                sleep 1
            done
            
            # Force kill if still running
            if kill -0 "$pid" 2>/dev/null; then
                log_message "${YELLOW}Force killing $process_name...${NC}"
                kill -9 "$pid" 2>/dev/null
            fi
        else
            log_message "${YELLOW}$process_name process not running${NC}"
        fi
        rm -f "$pid_file"
    else
        log_message "${YELLOW}No PID file found for $process_name${NC}"
    fi
}

# Stop client process
stop_process "$CLIENT_PID_FILE" "Client"

# Stop server process
stop_process "$SERVER_PID_FILE" "Server"

# Clean up main PID file
if [ -f "$MAIN_PID_FILE" ]; then
    rm -f "$MAIN_PID_FILE"
fi

# Additional cleanup - kill any remaining bun processes related to this project
PROJECT_ROOT="/opt/claude-code-hooks-multi-agent-observability"
pkill -f "$PROJECT_ROOT" 2>/dev/null || true

log_message "${GREEN}✅ Multi-Agent Observability System stopped${NC}"

exit 0