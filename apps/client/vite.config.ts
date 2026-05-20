import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    host: '0.0.0.0',
    port: parseInt(process.env.VITE_PORT || '5173'),
    strictPort: false, // Allow fallback to next available port if occupied
  }
})
