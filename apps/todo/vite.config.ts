import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { codecraftProbe } from '@codecraft/probe/vite';

// The probe plugin is the only CodeCraft-specific thing in this app: it adds the script that lets the
// game watch React. The app's own code knows nothing about it.
//
// Production builds are made for the game to visualise, so they keep the probe and React's
// development build (unminified, so component names survive) and are served under /app/.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/app/' : '/',
  // quick Cloudflare tunnels (`cloudflared tunnel --url …`) for sharing a running build
  server: { allowedHosts: ['.trycloudflare.com'] },
  plugins: [react(), codecraftProbe({ build: true })],
  build: {
    minify: false,
    rollupOptions: { input: { main: 'index.html', memo: 'memo.html' } },
  },
}));
