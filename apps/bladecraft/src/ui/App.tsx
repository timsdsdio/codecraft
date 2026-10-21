import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from 'react';
import { Game } from '../game/game';
import { itemName, stackName } from '../game/items';
import { HOTBAR } from '../game/slots';
import { usable } from '../game/world';
import { Icon } from './Icon';
import { AchievementsScreen, InventoryScreen, MachineScreen, StartScreen, WorkbenchScreen } from './Screens';
import { countLabel } from './Slots';

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
      {s === 'workbench' && <WorkbenchScreen game={game} />}
      {s === 'machine' && <MachineScreen game={game} />}
      {s === 'achievements' && <AchievementsScreen game={game} />}
      <div className="toasts" role="status">
        {game.toasts.slice(-3).map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.kind === 'achievement' && <small>Achievement</small>}
            <b>{t.title}</b>
          </div>
        ))}
      </div>
    </>
  );
}

export function Hotbar({ game, onReselect }: { game: Game; onReselect?: () => void }) {
  return (
    <div className="hotbar">
      {game.inventory.slice(0, HOTBAR).map((st, i) => (
        <button
          key={i}
          className={`slot${i === game.selected ? ' on' : ''}`}
          onClick={() => (i === game.selected && onReselect ? onReselect() : game.select(i))}
          aria-label={st ? stackName(st) : `Empty slot ${i + 1}`}
        >
          {st && <Icon item={st.item} />}
          {st && countLabel(st) && <span className="count">{countLabel(st)}</span>}
          {st && <span className="name">{itemName(st.item)}</span>}
        </button>
      ))}
    </div>
  );
}

function GuideCard({ game }: { game: Game }) {
  const [open, setOpen] = useState(true);
  const g = game.guide;
  return (
    <button className={`guide${open ? ' open' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open}>
      <small>{g.label}</small>
      <b>{g.title}</b>
      {open && <span className="hint">{g.hint}</span>}
    </button>
  );
}

function Hud({ game }: { game: Game }) {
  const held = game.held;
  const p = game.prompt;
  return (
    <>
      <div className="crosshair" />
      {!game.touch && !game.looking && <div className="free-mouse">Click the world to look around</div>}
      {p && (
        <div className="prompt">
          <b>{p.name}</b>
          {!game.touch && desktopActions(p.actions).map((a) => <span key={a}>{a}</span>)}
        </div>
      )}
      <div className="hud-top">
        <GuideCard game={game} />
        <div className="hud-buttons">
          <button onClick={() => game.open('inventory')}>Items</button>
          <button onClick={() => game.open('achievements')}>Goals</button>
        </div>
      </div>
      <div className="hud-bottom">
        <div className="held">
          {held ? itemName(held) : 'Empty hand'}
          {held?.kind === 'machine' && !game.touch && <span className="dim"> · R rotates</span>}
        </div>
        <Hotbar game={game} onReselect={() => game.open('inventory')} />
        {!game.touch && <div className="hint">1–9 or wheel picks · E items · L achievements · Esc frees the mouse</div>}
      </div>
    </>
  );
}

/** desktop wording for the actions: right click uses a machine if there is one, so placing against it needs shift */
function desktopActions(actions: string[]) {
  const canUse = actions.some((a) => a.startsWith('Use:'));
  return actions.map((a) =>
    a
      .replace(/^Break:/, 'Left click:')
      .replace(/^Use:/, 'Right click:')
      .replace(/^Place:/, canUse ? 'Shift + right click: place' : 'Right click: place'),
  );
}

/** left half: a joystick wherever the thumb lands; right half: drag to look; buttons do the actions */
function TouchControls({ game }: { game: Game }) {
  const [knob, setKnob] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null);
  const look = useRef<{ id: number; x: number; y: number } | null>(null);
  const stick = useRef<number | null>(null);

  const onDown = (e: ReactPointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    if (e.clientX < innerWidth * 0.45 && stick.current === null) {
      stick.current = e.pointerId;
      setKnob({ x: e.clientX, y: e.clientY, dx: 0, dy: 0 });
    } else if (!look.current) look.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  const onMove = (e: ReactPointerEvent) => {
    if (e.pointerId === stick.current && knob) {
      const dx = Math.max(-50, Math.min(50, e.clientX - knob.x));
      const dy = Math.max(-50, Math.min(50, e.clientY - knob.y));
      setKnob({ ...knob, dx, dy });
      game.stick = { forward: -dy / 50, right: dx / 50 };
    } else if (look.current && e.pointerId === look.current.id) {
      game.turnView((e.clientX - look.current.x) * 0.006, (e.clientY - look.current.y) * 0.006);
      look.current.x = e.clientX;
      look.current.y = e.clientY;
    }
  };
  const onUp = (e: ReactPointerEvent) => {
    if (e.pointerId === stick.current) {
      stick.current = null;
      setKnob(null);
      game.stick = { forward: 0, right: 0 };
    } else if (look.current?.id === e.pointerId) look.current = null;
  };

  const b = game.targetBlock;
  const canUse = usable(b);
  const p = game.placement();
  const canBreak = !!b;
  return (
    <>
      <div className="touch" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
      {knob && (
        <div className="stick" style={{ left: knob.x, top: knob.y }}>
          <div className="knob" style={{ transform: `translate(${knob.dx}px, ${knob.dy}px)` }} />
        </div>
      )}
      {!knob && <div className="stick-hint">move</div>}
      <div className="actions">
        <button className="act" disabled={!canBreak} onClick={() => game.breakBlock()}>
          {b?.kind === 'deposit' ? 'Take' : 'Break'}
        </button>
        {canUse && (
          <button className="act use" onClick={() => game.use()}>
            Use
          </button>
        )}
        <button className="act place" disabled={!p?.ok} onClick={() => game.place()}>
          Place
        </button>
        {game.held?.kind === 'machine' && (
          <button className="act" onClick={() => game.rotate()}>
            Rotate
          </button>
        )}
        <button
          className="act jump"
          onPointerDown={() => (game.wantJump = true)}
          onPointerUp={() => (game.wantJump = false)}
          onPointerCancel={() => (game.wantJump = false)}
        >
          Jump
        </button>
      </div>
    </>
  );
}
