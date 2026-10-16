// On-screen touch controls for first-person walking. Left side: a floating joystick (push to the
// edge to sprint). Right side: drag to look; a quick tap calls `onTap` (e.g. to press the thing
// you tapped). ▲ ▼ move between levels. Writes to `walkInput`; no three.js.
import { useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from 'react';
import { TOUCH_LOOK_SCALE, walkInput } from './input';

const R = 48;
const TAP_MS = 250;
const TAP_SLOP = 10;

const zone: CSSProperties = { position: 'absolute', top: 0, bottom: 0, touchAction: 'none' };
const floorBtn: CSSProperties = {
  width: 56,
  height: 56,
  borderRadius: '50%',
  border: '1px solid rgba(0,255,240,0.38)',
  background: 'rgba(2,8,16,0.75)',
  color: '#00fff0',
  fontSize: 18,
  touchAction: 'none',
};

export function TouchControls({ onTap }: { onTap?: (clientX: number, clientY: number) => void }) {
  const stick = useRef<{ id: number; x: number; y: number } | null>(null);
  const look = useRef<{ id: number; x: number; y: number; x0: number; y0: number; t0: number } | null>(null);
  const [knob, setKnob] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null);

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
    look.current = { id: e.pointerId, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now() };
  };
  const lookMove = (e: RPointerEvent) => {
    const l = look.current;
    if (!l || l.id !== e.pointerId) return;
    walkInput.look.x += (e.clientX - l.x) * TOUCH_LOOK_SCALE;
    walkInput.look.y += (e.clientY - l.y) * TOUCH_LOOK_SCALE;
    l.x = e.clientX;
    l.y = e.clientY;
  };
  const lookUp = (e: RPointerEvent) => {
    const l = look.current;
    if (l?.id !== e.pointerId) return;
    look.current = null;
    if (onTap && performance.now() - l.t0 < TAP_MS && Math.hypot(e.clientX - l.x0, e.clientY - l.y0) < TAP_SLOP) onTap(e.clientX, e.clientY);
  };

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 1 }}>
      <div style={{ ...zone, left: 0, width: '45%' }} onPointerDown={stickDown} onPointerMove={stickMove} onPointerUp={stickUp} onPointerCancel={stickUp} />
      <div style={{ ...zone, right: 0, width: '55%' }} onPointerDown={lookDown} onPointerMove={lookMove} onPointerUp={lookUp} onPointerCancel={lookUp} />
      {knob && (
        <div
          style={{
            position: 'absolute',
            left: knob.x,
            top: knob.y,
            width: 96,
            height: 96,
            margin: '-48px 0 0 -48px',
            borderRadius: '50%',
            border: '2px solid rgba(0,255,240,0.45)',
            background: 'rgba(0,255,240,0.06)',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 28,
              top: 28,
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: 'rgba(0,255,240,0.35)',
              boxShadow: '0 0 14px rgba(0,255,240,0.5)',
              transform: `translate(${knob.dx}px, ${knob.dy}px)`,
            }}
          />
        </div>
      )}
      <div
        style={{
          position: 'absolute',
          right: 'calc(14px + env(safe-area-inset-right, 0px))',
          bottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <button type="button" style={floorBtn} aria-label="Up a level" onPointerDown={() => (walkInput.level += 1)}>
          ▲
        </button>
        <button type="button" style={floorBtn} aria-label="Down a level" onPointerDown={() => (walkInput.level -= 1)}>
          ▼
        </button>
      </div>
    </div>
  );
}
