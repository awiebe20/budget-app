import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: './',
  define: {
    'import.meta.env.VITE_API_BASE': JSON.stringify(
      command === 'build' ? 'http://localhost:3001/api' : '/api'
    ),
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    watch: {
      usePolling: true,
    },
    proxy: {
      '/api': {
        target: 'http://backend:3001',
        changeOrigin: true,
      },
    },
  },
}));
