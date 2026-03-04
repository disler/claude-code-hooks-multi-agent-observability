import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  base: '/dashboard/',
  server: {
    port: parseInt(process.env.VITE_PORT || '5174'),
    host: process.env.VITE_HOST || 'localhost',
    strictPort: false,
  },
})
