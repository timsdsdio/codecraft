// Fullscreen explorer for any scene: walk around it in first person (keyboard + mouse, or touch
// joystick + drag-to-look), or orbit it. Space / Shift (or the ▲ ▼ buttons) move between floors.
import { Suspense, useEffect, useRef, useState } from 'react';
import { TouchControls, isCoarsePointer } from '@codecraft/visuals/2d';
import { EmbedScene, Boundary } from './Embed';
import type { EmbedSpec } from './spec';
import { useWikiLook } from '../look';

type Mode = 'walk' | 'orbit';

export function Explorer({ spec, title, onClose }: { spec: EmbedSpec; title: string; onClose: () => void }) {
  const look = useWikiLook();
  const root = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>('walk');
  const [level, setLevel] = useState('');
  const [coarse] = useState(isCoarsePointer);
  const [hint, setHint] = useState(true);

  useEffect(() => {
    const el = root.current;
    // real fullscreen where the browser allows it (not iPhone Safari); the overlay covers the page either way
    el?.requestFullscreen?.().catch(() => undefined);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      // with pointer lock, the first Esc only releases the mouse (the browser eats it); the next one closes
      if (e.key === 'Escape' && !document.pointerLockElement) onClose();
    };
    window.addEventListener('keydown', onKey);
    const t = window.setTimeout(() => setHint(false), 7000);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
      document.body.style.overflow = prev;
      if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    };
  }, [onClose]);

  const flat = <div className="cc-embed-flat">3D view unavailable</div>;
  return (
    <div ref={root} className="cc-explore" role="dialog" aria-label={`Explore: ${title}`}>
      <div className="cc-explore-view">
        <Boundary fallback={flat}>
          <Suspense fallback={<div className="cc-embed-flat cc-loading">loading…</div>}>
            <EmbedScene spec={spec} look={look} mode={mode === 'walk' ? 'walk' : 'explore-orbit'} onLevel={setLevel} />
          </Suspense>
        </Boundary>
      </div>
      <div className="cc-explore-bar">
        <span className="cc-explore-title">{title}</span>
        {mode === 'walk' && level && <span className="cc-explore-level">{level}</span>}
        <span className="cc-explore-spacer" />
        <div className="cc-explore-modes" role="group" aria-label="Camera">
          {(['walk', 'orbit'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={(e) => {
                setMode(m);
                e.currentTarget.blur(); // keep Space for jumping
              }}
            >
              {m}
            </button>
          ))}
        </div>
        <button type="button" className="cc-explore-close" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </div>
      {mode === 'walk' && <div className="cc-crosshair" aria-hidden />}
      {mode === 'walk' && !coarse && (
        <div className={`cc-explore-hint${hint ? '' : ' cc-hide'}`}>
          Click to look · <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move · <kbd>Space</kbd> up a floor · <kbd>Shift</kbd> down · <kbd>Ctrl</kbd> sprint · <kbd>Esc</kbd> exit
        </div>
      )}
      {mode === 'walk' && coarse && <TouchControls />}
    </div>
  );
}
