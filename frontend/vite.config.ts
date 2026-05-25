import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: '../backend/static_frontend',
    emptyOutDir: true,
  },
  server: {
    host: true,
    port: 5173,
    allowedHosts: true,
    hmr: {
      protocol: 'wss',
      clientPort: 443,
    },
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
