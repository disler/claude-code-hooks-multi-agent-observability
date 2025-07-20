import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    host: '0.0.0.0', // Bind to all interfaces for WSL2 compatibility
    port: 5173,
    strictPort: true // Fail if port is already in use
  }
})
