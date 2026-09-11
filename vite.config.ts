import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: process.env['GITHUB_ACTIONS'] ? '/rackmap/' : '/',
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': 'http://127.0.0.1:3001',
      '/events': 'http://127.0.0.1:3001',
    },
  },
})
