// Server configuration from environment variables
export const SERVER_HOST = import.meta.env.VITE_SERVER_HOST || 'localhost';
export const SERVER_PORT = import.meta.env.VITE_SERVER_PORT || '4000';

// Construct URLs
export const API_BASE_URL = `http://${SERVER_HOST}:${SERVER_PORT}`;
export const WS_URL = `ws://${SERVER_HOST}:${SERVER_PORT}/stream`;

// Other configuration
export const MAX_EVENTS_TO_DISPLAY = parseInt(import.meta.env.VITE_MAX_EVENTS_TO_DISPLAY || '100');