// Centralized configuration for API and WebSocket URLs
// Uses environment variables to support dynamic port configuration for worktrees

const SERVER_PORT = import.meta.env.VITE_API_PORT || '4000';

// Derive host from window.location so remote browsers connect to the right host,
// not their own localhost. Falls back to localhost for SSR/test environments.
const _host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';

export const API_BASE_URL = import.meta.env.VITE_API_URL || `http://${_host}:${SERVER_PORT}`;
export const WS_URL = import.meta.env.VITE_WS_URL || `ws://${_host}:${SERVER_PORT}/stream`;
