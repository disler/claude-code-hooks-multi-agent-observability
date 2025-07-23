# Deployment Guide

## Project: claude-code-hooks-multi-agent-observability
**Real-time observability system for Claude Code CLI hooks**

### Architecture Overview
**Components**:
- **Frontend**: Vue 3 + Vite client application
- **Backend**: Bun TypeScript server with WebSocket support
- **Database**: SQLite with WAL mode
- **Communication**: Real-time WebSocket streaming

**Deployment Pattern**: Monorepo with separate client/server deployments

### Development Environment

#### Prerequisites
- **Bun Runtime**: Latest version installed
- **Operating System**: Linux (Debian/Ubuntu preferred) or macOS
- **Network**: Ports 4000 (server) and 5173 (client) available
- **Database**: SQLite (bundled with Bun)

#### Development Setup
```bash
# 1. Install dependencies
cd apps/server && bun install
cd ../client && bun install

# 2. Start development environment
./scripts/start-system.sh
```

#### Environment Configuration
**Server Configuration** (`apps/server/.env`):
```bash
SERVER_HOST=localhost  # or 0.0.0.0 for network access
SERVER_PORT=4000
NODE_ENV=development
```

**Client Configuration** (`apps/client/.env`):
```bash
VITE_SERVER_HOST=localhost
VITE_SERVER_PORT=4000
```

#### Development Features
- Hot module replacement (HMR) for both client and server
- Real-time TypeScript compilation
- Automatic browser refresh
- WebSocket connection with auto-reconnect
- SQLite database with WAL mode for concurrent development

#### Development Scripts
- `bun run dev` (server) - Start server with hot reload
- `bun run dev` (client) - Start Vite dev server
- `./scripts/start-system.sh` - Start both server and client
- `./scripts/reset-system.sh` - Clean restart with port cleanup
- `./scripts/test-system.sh` - System integration testing

### Staging Environment

#### Staging Setup
**Purpose**: Testing production configuration in controlled environment

```bash
# 1. Build production assets
cd apps/client && bun run build

# 2. Configure environment variables
export SERVER_HOST=0.0.0.0
export SERVER_PORT=4000
export NODE_ENV=staging

# 3. Start staging environment
./scripts/start-system-service-simple.sh
```

#### Staging Configuration
- Network binding to all interfaces (0.0.0.0)
- Production build of client assets
- Database persistence testing
- WebSocket connection stability testing
- Multi-client concurrent access testing

#### Staging Validation
- Event ingestion rate testing
- WebSocket connection limits
- Database performance under load
- Theme management functionality
- Cross-browser compatibility
- Network latency handling

### Production Environment

#### SystemD Service Deployment
**Service File**: `scripts/multi-agent-observability.service`

```bash
# 1. Install service file
sudo cp scripts/multi-agent-observability.service /etc/systemd/system/
sudo systemctl daemon-reload

# 2. Enable and start service
sudo systemctl enable multi-agent-observability
sudo systemctl start multi-agent-observability

# 3. Check service status
sudo systemctl status multi-agent-observability
sudo journalctl -u multi-agent-observability -f
```

#### Production Configuration
**Environment Variables**:
```bash
NODE_ENV=production
SERVER_HOST=0.0.0.0  # Listen on all interfaces
SERVER_PORT=4000
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/home/user/.bun/bin
```

**Security Configuration**:
- Service runs under dedicated user account
- `NoNewPrivileges=yes` security constraint
- Controlled file system access
- Read/write permissions only to required directories

#### Database Configuration
- SQLite with WAL mode for production
- Automatic database migrations on startup
- Database file: `apps/server/events.db`
- Backup strategy: File-based SQLite backups

#### Network Configuration
- Server listens on all interfaces (0.0.0.0:4000)
- WebSocket endpoint: `ws://server-ip:4000/stream`
- Client build served statically or via reverse proxy
- CORS configured for production domains

#### Process Management
- Automatic restart on failure (`Restart=always`)
- 10-second restart delay (`RestartSec=10`)
- Proper signal handling for graceful shutdown
- PID file management (optional)

#### Production Scripts
- `start-system-service-simple.sh` - Service startup script
- `stop-system-service.sh` - Graceful shutdown
- System service logs via `journalctl`

### Cache Management

#### Database Caching
**SQLite WAL Mode**:
- Write-Ahead Logging for concurrent access
- Automatic checkpoint management
- No external cache layer required

#### Browser Caching
- Vite handles static asset caching with hash-based filenames
- API responses are real-time, no caching required
- WebSocket connections bypass HTTP caching

#### Application-Level Caching
- Event data cached in client memory during session
- Theme data cached for performance
- Filter options cached and refreshed on demand

#### Cache Invalidation
```bash
# Clear SQLite WAL files (if needed)
sudo systemctl stop multi-agent-observability
rm -f apps/server/events.db-wal apps/server/events.db-shm
sudo systemctl start multi-agent-observability

# Force client cache refresh
# Client automatically reconnects and refreshes data
```

### Monitoring & Logging

#### System Monitoring
**SystemD Integration**:
```bash
# Service status monitoring
sudo systemctl status multi-agent-observability

# Real-time logs
sudo journalctl -u multi-agent-observability -f

# Service restart monitoring
sudo systemctl is-failed multi-agent-observability
```

#### Application Monitoring
**Built-in Observability**:
- Real-time event ingestion monitoring via the application UI
- WebSocket connection count tracking
- Event processing rate visualization
- Database operation monitoring through event metrics

#### Log Management
**Application Logs**:
- Bun runtime logs to systemd journal
- Client-side logs in browser console
- WebSocket connection logs
- Database operation logs

**Log Access**:
```bash
# System service logs
sudo journalctl -u multi-agent-observability

# Recent logs with timestamps
sudo journalctl -u multi-agent-observability --since "1 hour ago"

# Follow logs in real-time
sudo journalctl -u multi-agent-observability -f
```

#### Health Check Endpoints
- `GET /health` - Basic health check
- `GET /events/filter-options` - Database connectivity check
- WebSocket connection test via client application

#### Performance Monitoring
- Event ingestion rate tracking
- WebSocket connection stability
- Database query performance
- Memory usage via systemd
- CPU usage monitoring

#### Alerting Strategy
- SystemD service failure alerts
- Database connectivity monitoring
- WebSocket connection drop monitoring
- High event ingestion rate alerts