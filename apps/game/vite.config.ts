import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Production builds are served under /codecraft/; the root belongs to Bladecraft.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/codecraft/' : '/',
  // quick Cloudflare tunnels (`cloudflared tunnel --url …`) for sharing a running build
  server: { allowedHosts: ['.trycloudflare.com'] },
  plugins: [react()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
    rollupOptions: { input: { main: 'index.html', window: 'window.html' } },
  },
}));
