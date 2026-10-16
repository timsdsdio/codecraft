// The DevTools hook stub. It must exist before react-dom loads, so the Vite plugin inlines it as a
// classic script at the top of <head>. It records the renderer and forwards commits to whatever the
// runtime registers as `window.__CODECRAFT_PROBE__`. If React DevTools is installed, its hook is
// kept and wrapped instead of replaced.
export const HOOK_STUB = `(() => {
  const forward = (root) => { try { window.__CODECRAFT_PROBE__?.onCommit(root); } catch (e) { console.warn('[codecraft probe]', e); } };
  const existing = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
  if (existing) {
    const prev = existing.onCommitFiberRoot;
    existing.onCommitFiberRoot = function (id, root, ...rest) { forward(root); return prev?.call(this, id, root, ...rest); };
    return;
  }
  let nextId = 1;
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    renderers: new Map(),
    supportsFiber: true,
    inject(renderer) { const id = nextId++; this.renderers.set(id, renderer); return id; },
    checkDCE() {},
    onScheduleFiberRoot() {},
    onCommitFiberRoot(_id, root) { forward(root); },
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    setStrictMode() {},
  };
})();`;
