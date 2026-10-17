import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // quick Cloudflare tunnels (`cloudflared tunnel --url …`) for sharing a running build
  server: { allowedHosts: ['.trycloudflare.com'] },
  plugins: [react()],
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
});
