import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  envDir: '..',
  base: '/hzpp/',
  build: { outDir: '../dist/hzpp', emptyOutDir: true },
  server: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: true,
    proxy: {
      '/hzpp-api/journey-stops': {
        target: 'http://localhost:3001',
        changeOrigin: true
      },
      '/hzpp-api': {
        target: 'https://prodaja.hzpp.hr',
        changeOrigin: true,
        secure: true,
        rewrite: path => path.replace(/^\/hzpp-api/, '/hzpp-sales-middleware-web'),
        headers: { 'X-device-type': 'PORTAL' }
      },
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  }
});
