// A wiki "image": a framed 3D embed with a caption. The 3D chunk is lazy-loaded, mounted only while
// the frame is near the viewport (WebGL contexts are a scarce resource), and falls back to a flat
// placeholder if WebGL fails.
import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Explorer } from './Explorer';
import type { EmbedSpec } from './spec';
import { useWikiLook } from '../look';

const EmbedScene = lazy(() => import('./scenes'));

class Boundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(e: unknown) {
    console.warn('[embed] 3D view failed', e);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function useNearViewport<T extends Element>(margin = '300px') {
  const ref = useRef<T>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver(([e]) => setNear(e.isIntersecting), { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [margin]);
  return [ref, near] as const;
}

export { EmbedScene, Boundary };

export function Viewport({ spec, height = 240, label }: { spec: EmbedSpec; height?: number; label?: string }) {
  const [ref, near] = useNearViewport<HTMLDivElement>();
  const look = useWikiLook();
  const [exploring, setExploring] = useState(false);
  const flat = <div className="cc-embed-flat">{label ?? '3D view'}</div>;
  return (
    <div ref={ref} className="cc-embed-view" style={{ height }} data-embed={spec.name}>
      <button type="button" className="cc-embed-expand" aria-label="Explore fullscreen" title="Explore fullscreen" onClick={() => setExploring(true)}>
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M2 7V2h5M11 2h5v5M16 11v5h-5M7 16H2v-5" />
        </svg>
      </button>
      {exploring && createPortal(<Explorer spec={spec} title={label ?? spec.name} onClose={() => setExploring(false)} />, document.body)}
      {/* the inline view pauses while exploring: one WebGL context at a time */}
      {near && !exploring ? (
        <Boundary fallback={flat}>
          <Suspense fallback={<div className="cc-embed-flat cc-loading">loading…</div>}>
            <EmbedScene spec={spec} look={look} />
          </Suspense>
        </Boundary>
      ) : (
        flat
      )}
    </div>
  );
}

/** Thumbnail frame floated into the article, like an image on a wiki page. `wide` / `none` take the
 *  full column (beside any infobox). */
export function Figure({
  spec,
  caption,
  float = 'right',
  width = 300,
  height = 220,
}: {
  spec: EmbedSpec;
  caption?: ReactNode;
  float?: 'right' | 'left' | 'none' | 'wide';
  width?: number;
  height?: number;
}) {
  return (
    <figure className={`cc-figure cc-figure-${float}`} style={float === 'left' || float === 'right' ? { width } : undefined}>
      <Viewport spec={spec} height={height} />
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}
