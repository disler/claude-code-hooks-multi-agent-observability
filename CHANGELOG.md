# Changelog

## [Unreleased]

### Added
- **Configurable Network Interface Binding**: The observability server now supports configuration of the network interface it binds to
  - Added `SERVER_HOST` environment variable (default: localhost)
  - Added `SERVER_PORT` environment variable (default: 4000)
  - Added `CORS_ORIGIN` environment variable (default: *)
  - Server can now listen on all interfaces with `SERVER_HOST=0.0.0.0`
  - Enhanced start script to display appropriate access URLs based on binding configuration

- **Client Server Configuration**: The Vue client now supports dynamic server configuration
  - Added `VITE_SERVER_HOST` environment variable (default: localhost)
  - Added `VITE_SERVER_PORT` environment variable (default: 4000)
  - Created centralized configuration module at `src/config.ts`
  - All API and WebSocket connections now use configured values

### Changed
- Updated `apps/server/src/index.ts` to use environment variables for host and port configuration
- Modified `scripts/start-system.sh` to:
  - Load server configuration from environment
  - Pass configuration to both server and client
  - Display network access information when binding to all interfaces
- Updated all client components to use centralized configuration instead of hardcoded URLs

### Documentation
- Added comprehensive network configuration section to README.md
- Created `.env.sample` file for server with configuration examples
- Updated client `.env.sample` with server connection settings

### Technical Details
- Server uses Bun's `hostname` option to control interface binding
- Configuration is loaded at startup, no runtime reloading required
- CORS configuration is now dynamic based on environment variable
- All existing functionality remains unchanged - this is a backward-compatible enhancement

## Why These Changes?

These changes allow the observability system to be deployed in various network configurations:
- **Development**: Keep default localhost for security
- **Team Collaboration**: Bind to 0.0.0.0 to allow team members to access from network
- **Docker/Container**: Configure specific interfaces for container networking
- **Production**: Set specific IPs and ports based on infrastructure requirements