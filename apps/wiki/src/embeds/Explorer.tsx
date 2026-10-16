// Fullscreen explorer for any scene: walk around it in first person (keyboard + mouse, or touch
// joystick + drag-to-look), or orbit it. Space / Shift (or the ▲ ▼ buttons) move between floors.
import { Suspense, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { TOUCH_LOOK_SCALE, isCoarsePointer, walkInput } from '@codecraft/visuals/2d';
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

/** Left half: floating joystick. Right half: drag to look. Plus up/down floor buttons. */
function TouchControls() {
  const stick = useRef<{ id: number; x: number; y: number } | null>(null);
  const lookP = useRef<{ id: number; x: number; y: number } | null>(null);
  const [knob, setKnob] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null);
  const R = 48;

  const stickDown = (e: RPointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    stick.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    setKnob({ x: e.clientX, y: e.clientY, dx: 0, dy: 0 });
  };
  const stickMove = (e: RPointerEvent) => {
    const s = stick.current;
    if (!s || s.id !== e.pointerId) return;
    let dx = e.clientX - s.x;
    let dy = e.clientY - s.y;
    const len = Math.hypot(dx, dy);
    if (len > R) {
      dx = (dx / len) * R;
      dy = (dy / len) * R;
    }
    walkInput.stick.x = dx / R;
    walkInput.stick.y = -dy / R;
    walkInput.sprint = len > R * 1.4;
    setKnob({ x: s.x, y: s.y, dx, dy });
  };
  const stickUp = (e: RPointerEvent) => {
    if (stick.current?.id !== e.pointerId) return;
    stick.current = null;
    walkInput.stick.x = walkInput.stick.y = 0;
    walkInput.sprint = false;
    setKnob(null);
  };
  const lookDown = (e: RPointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    lookP.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  const lookMove = (e: RPointerEvent) => {
    const l = lookP.current;
    if (!l || l.id !== e.pointerId) return;
    walkInput.look.x += (e.clientX - l.x) * TOUCH_LOOK_SCALE;
    walkInput.look.y += (e.clientY - l.y) * TOUCH_LOOK_SCALE;
    l.x = e.clientX;
    l.y = e.clientY;
  };
  const lookUp = (e: RPointerEvent) => {
    if (lookP.current?.id === e.pointerId) lookP.current = null;
  };

  return (
    <div className="cc-touch">
      <div className="cc-touch-stick" onPointerDown={stickDown} onPointerMove={stickMove} onPointerUp={stickUp} onPointerCancel={stickUp} />
      <div className="cc-touch-look" onPointerDown={lookDown} onPointerMove={lookMove} onPointerUp={lookUp} onPointerCancel={lookUp} />
      {knob && (
        <div className="cc-touch-knob-base" style={{ left: knob.x, top: knob.y }}>
          <div className="cc-touch-knob" style={{ transform: `translate(${knob.dx}px, ${knob.dy}px)` }} />
        </div>
      )}
      <div className="cc-touch-floors">
        <button type="button" aria-label="Up a floor" onPointerDown={() => (walkInput.level += 1)}>
          ▲
        </button>
        <button type="button" aria-label="Down a floor" onPointerDown={() => (walkInput.level -= 1)}>
          ▼
        </button>
      </div>
    </div>
  );
}
