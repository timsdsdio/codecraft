// Vite plugin for the app being visualised. In dev it adds the hook stub and the probe runtime to
// index.html, ahead of the app's own scripts, and analyses each component's JSX (see analyze.ts).
// Production builds are untouched.
import type { Plugin } from 'vite';
import { HOOK_STUB } from './hook.ts';
import { analyse } from './analyze.ts';

const VIRTUAL = '/@codecraft-probe';

export function codecraftProbe(): Plugin {
  return {
    name: 'codecraft-probe',
    apply: 'serve',
    // before the React plugin compiles JSX away
    enforce: 'pre',
    transform(code, id) {
      if (!/\.[jt]sx$/.test(id.split('?')[0]) || id.includes('/node_modules/')) return null;
      const out = analyse(code);
      return out ? { code: out, map: null } : null;
    },
    resolveId(id) {
      return id === VIRTUAL ? '\0codecraft-probe' : null;
    },
    load(id) {
      return id === '\0codecraft-probe' ? `import '@codecraft/probe/runtime';` : null;
    },
    transformIndexHtml() {
      return [
        { tag: 'script', children: HOOK_STUB, injectTo: 'head-prepend' },
        { tag: 'script', attrs: { type: 'module', src: VIRTUAL }, injectTo: 'head' },
      ];
    },
  };
}
