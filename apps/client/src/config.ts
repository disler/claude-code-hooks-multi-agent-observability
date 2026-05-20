// Centralized configuration for API and WebSocket URLs
// Auto-detects host so it works from localhost AND remote devices (Tailscale, LAN)
const SERVER_PORT = import.meta.env.VITE_API_PORT || '4000';

// Use the same hostname the page was loaded from. localhost when on Mac,
// Tailscale IP when on phone — no env vars or per-device config needed.
const HOST = typeof window !== 'undefined' ? window.location.hostname : 'localhost';

export const API_BASE_URL = import.meta.env.VITE_API_URL || `http://${HOST}:${SERVER_PORT}`;
export const WS_URL = import.meta.env.VITE_WS_URL || `ws://${HOST}:${SERVER_PORT}/stream`;
