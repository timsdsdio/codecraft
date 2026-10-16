import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { codecraftProbe } from '@codecraft/probe/vite';

// The probe plugin is the only CodeCraft-specific thing in this app: in dev it adds the script that
// lets the game watch React. The app's own code knows nothing about it.
export default defineConfig({
  plugins: [react(), codecraftProbe()],
});
