const host = window.location.hostname
const port = (import.meta.env.VITE_SERVER_PORT as string | undefined) ?? '4000'

export const API_BASE = `http://${host}:${port}`
export const WS_BASE = `ws://${host}:${port}`
export const CLIENT_BASE = `http://${host}:${window.location.port || '4001'}`
