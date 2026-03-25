import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    port: parseInt(process.env.VITE_PORT || '5173'),
    strictPort: false, // Allow fallback to next available port if occupied
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor': ['vue'],
        }
      }
    },
    chunkSizeWarningLimit: 500,
  },
})
