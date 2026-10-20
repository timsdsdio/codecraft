import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from 'react';
import { Game } from '../game/game';
import { HOTBAR, itemName } from '../game/items';
import { Icon } from './Icon';
import { AchievementsScreen, BenchScreen, InventoryScreen, StartScreen } from './Screens';

export function App() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [game, setGame] = useState<Game | null>(null);
  useEffect(() => {
    const g = new Game(canvas.current!);
    (window as unknown as { game: Game }).game = g; // handy from the console
    setGame(g);
  }, []);
  return (
    <>
      <canvas ref={canvas} className="view" />
      {game && <Overlay game={game} />}
    </>
  );
}

function Overlay({ game }: { game: Game }) {
  useSyncExternalStore(game.subscribe, game.getVersion);
  const s = game.screen;
  return (
    <>
      {s === 'play' && <Hud game={game} />}
      {s === 'play' && game.touch && <TouchControls game={game} />}
      {s === 'start' && <StartScreen game={game} />}
      {s === 'inventory' && <InventoryScreen game={game} />}
      {s === 'bench' && <BenchScreen game={game} />}
      {s === 'achievements' && <AchievementsScreen game={game} />}
      <div className="toasts" role="status">
        {game.toasts.slice(-3).map((t) => (
          <div key={t.id} className="toast">
            <small>Achievement</small>
            <b>{t.achievement.title}</b>
          </div>
        ))}
      </div>
    </>
  );
}

export function Hotbar({ game }: { game: Game }) {
  return (
    <div className="hotbar">
      {game.inventory.slots.slice(0, HOTBAR).map((st, i) => (
        <button key={i} className={`slot${i === game.selected ? ' on' : ''}`} onClick={() => game.select(i)} aria-label={st ? itemName(st.item) : `Empty slot ${i + 1}`}>
          {st && <Icon item={st.item} />}
          {st && st.count > 1 && <span className="count">{st.count}</span>}
        </button>
      ))}
    </div>
  );
}

function Hud({ game }: { game: Game }) {
  const held = game.inventory.slots[game.selected];
  return (
    <>
      <div className="crosshair" />
      <div className="hud-top">
        <div className="target">{game.targetLabel}</div>
      </div>
      <div className="hud-bottom">
        <div className="held">{held ? itemName(held.item) : ''}</div>
        <Hotbar game={game} />
        {!game.touch && <div className="hint">Left click breaks · right click places or opens a bench · E inventory · L achievements</div>}
      </div>
      {game.touch && (
        <div className="hud-buttons">
          <button onClick={() => game.open('inventory')}>Items</button>
          <button onClick={() => game.open('achievements')}>Goals</button>
        </div>
      )}
    </>
  );
}

/** left half: a joystick wherever the thumb lands; right half: drag to look, tap to use, hold to break */
function TouchControls({ game }: { game: Game }) {
  const [knob, setKnob] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null);
  const look = useRef<{ id: number; x: number; y: number; moved: number; t: number; timer: number } | null>(null);
  const stick = useRef<number | null>(null);

  const onDown = (e: ReactPointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    if (e.clientX < innerWidth / 2 && stick.current === null) {
      stick.current = e.pointerId;
      setKnob({ x: e.clientX, y: e.clientY, dx: 0, dy: 0 });
    } else if (!look.current) {
      const timer = window.setTimeout(() => {
        if (look.current && look.current.moved < 12) {
          game.breakBlock();
          look.current.moved = Infinity; // held: no tap on release
        }
      }, 380);
      look.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0, t: performance.now(), timer };
    }
  };
  const onMove = (e: ReactPointerEvent) => {
    if (e.pointerId === stick.current && knob) {
      const dx = Math.max(-50, Math.min(50, e.clientX - knob.x));
      const dy = Math.max(-50, Math.min(50, e.clientY - knob.y));
      setKnob({ ...knob, dx, dy });
      game.stick = { forward: -dy / 50, right: dx / 50 };
    } else if (look.current && e.pointerId === look.current.id) {
      const dx = e.clientX - look.current.x;
      const dy = e.clientY - look.current.y;
      look.current.moved += Math.hypot(dx, dy);
      look.current.x = e.clientX;
      look.current.y = e.clientY;
      game.turn(dx * 0.006, dy * 0.006);
    }
  };
  const onUp = (e: ReactPointerEvent) => {
    if (e.pointerId === stick.current) {
      stick.current = null;
      setKnob(null);
      game.stick = { forward: 0, right: 0 };
    } else if (look.current && e.pointerId === look.current.id) {
      clearTimeout(look.current.timer);
      if (look.current.moved < 12) game.use();
      look.current = null;
    }
  };

  return (
    <>
      <div className="touch" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
      {knob && (
        <div className="stick" style={{ left: knob.x, top: knob.y }}>
          <div className="knob" style={{ transform: `translate(${knob.dx}px, ${knob.dy}px)` }} />
        </div>
      )}
      <button
        className="jump"
        onPointerDown={() => (game.wantJump = true)}
        onPointerUp={() => (game.wantJump = false)}
        onPointerCancel={() => (game.wantJump = false)}
      >
        Jump
      </button>
    </>
  );
}
