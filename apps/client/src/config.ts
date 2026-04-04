// Centralized configuration for API and WebSocket URLs
// Uses environment variables to support dynamic port configuration for worktrees

const SERVER_PORT = import.meta.env.VITE_API_PORT || '4001';

export const API_BASE_URL = import.meta.env.VITE_API_URL || `http://localhost:${SERVER_PORT}`;
export const WS_URL = import.meta.env.VITE_WS_URL || `ws://localhost:${SERVER_PORT}/stream`;
