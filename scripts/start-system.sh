#!/bin/bash

echo "🚀 Starting Multi-Agent Observability System"
echo "==========================================="

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get the directory of this script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
# Get the project root directory (parent of scripts)
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

# Load environment variables if .env exists
if [ -f "$PROJECT_ROOT/apps/server/.env" ]; then
    export $(grep -v '^#' "$PROJECT_ROOT/apps/server/.env" | xargs)
fi

# Server configuration with defaults
SERVER_HOST=${SERVER_HOST:-localhost}
SERVER_PORT=${SERVER_PORT:-4000}
CLIENT_PORT=5173

# Function to check if port is in use
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        return 0  # Port is in use
    else
        return 1  # Port is free
    fi
}

# Check if ports are already in use
if check_port $SERVER_PORT; then
    echo -e "${YELLOW}⚠️  Port $SERVER_PORT is already in use. Run ./scripts/reset-system.sh first.${NC}"
    exit 1
fi

if check_port $CLIENT_PORT; then
    echo -e "${YELLOW}⚠️  Port $CLIENT_PORT is already in use. Run ./scripts/reset-system.sh first.${NC}"
    exit 1
fi

# Start server
echo -e "\n${GREEN}Starting server on ${SERVER_HOST}:${SERVER_PORT}...${NC}"
cd "$PROJECT_ROOT/apps/server"
SERVER_HOST=$SERVER_HOST SERVER_PORT=$SERVER_PORT bun run dev &
SERVER_PID=$!

# Wait for server to be ready
echo -e "${YELLOW}Waiting for server to start...${NC}"
for i in {1..10}; do
    if curl -s http://${SERVER_HOST}:${SERVER_PORT}/health >/dev/null 2>&1 || curl -s http://${SERVER_HOST}:${SERVER_PORT}/events/filter-options >/dev/null 2>&1; then
        echo -e "${GREEN}✅ Server is ready!${NC}"
        break
    fi
    sleep 1
done

# Start client
echo -e "\n${GREEN}Starting client on port ${CLIENT_PORT}...${NC}"
cd "$PROJECT_ROOT/apps/client"

# If server is binding to all interfaces, client needs actual IP
CLIENT_SERVER_HOST=$SERVER_HOST
if [ "$SERVER_HOST" = "0.0.0.0" ]; then
    CLIENT_SERVER_HOST=$(hostname -I | awk '{print $1}')
    echo -e "${YELLOW}Client will connect to server at: ${CLIENT_SERVER_HOST}:${SERVER_PORT}${NC}"
fi

# Load client env if exists
if [ -f "$PROJECT_ROOT/apps/client/.env" ]; then
    # Use env file values if they exist, otherwise use computed values
    export $(grep -v '^#' "$PROJECT_ROOT/apps/client/.env" | xargs)
    bun run dev &
else
    # No env file, pass computed values
    VITE_SERVER_HOST=$CLIENT_SERVER_HOST VITE_SERVER_PORT=$SERVER_PORT bun run dev &
fi
CLIENT_PID=$!

# Wait for client to be ready
echo -e "${YELLOW}Waiting for client to start...${NC}"
for i in {1..10}; do
    if curl -s http://localhost:${CLIENT_PORT} >/dev/null 2>&1; then
        echo -e "${GREEN}✅ Client is ready!${NC}"
        break
    fi
    sleep 1
done

# Display status
echo -e "\n${BLUE}============================================${NC}"
echo -e "${GREEN}✅ Multi-Agent Observability System Started${NC}"
echo -e "${BLUE}============================================${NC}"
echo
# Display appropriate host for access
DISPLAY_HOST=$SERVER_HOST
if [ "$SERVER_HOST" = "0.0.0.0" ]; then
    # Get local IP for display when binding to all interfaces
    LOCAL_IP=$(hostname -I | awk '{print $1}')
    echo -e "\n${YELLOW}Server is listening on all interfaces (0.0.0.0)${NC}"
    echo -e "Access from this machine: ${GREEN}http://localhost:${SERVER_PORT}${NC}"
    echo -e "Access from network: ${GREEN}http://${LOCAL_IP}:${SERVER_PORT}${NC}"
    DISPLAY_HOST="localhost"
fi

echo -e "🖥️  Client URL: ${GREEN}http://${DISPLAY_HOST}:${CLIENT_PORT}${NC}"
echo -e "🔌 Server API: ${GREEN}http://${DISPLAY_HOST}:${SERVER_PORT}${NC}"
echo -e "📡 WebSocket: ${GREEN}ws://${DISPLAY_HOST}:${SERVER_PORT}/stream${NC}"
echo
echo -e "📝 Process IDs:"
echo -e "   Server PID: ${YELLOW}$SERVER_PID${NC}"
echo -e "   Client PID: ${YELLOW}$CLIENT_PID${NC}"
echo
echo -e "To stop the system, run: ${YELLOW}./scripts/reset-system.sh${NC}"
echo -e "To test the system, run: ${YELLOW}./scripts/test-system.sh${NC}"
echo
echo -e "${BLUE}Press Ctrl+C to stop both processes${NC}"

# Function to cleanup on exit
cleanup() {
    echo -e "\n${YELLOW}Shutting down...${NC}"
    kill $SERVER_PID 2>/dev/null
    kill $CLIENT_PID 2>/dev/null
    echo -e "${GREEN}✅ Stopped all processes${NC}"
    exit 0
}

# Set up trap to cleanup on Ctrl+C
trap cleanup INT

# Wait for both processes
wait $SERVER_PID $CLIENT_PID