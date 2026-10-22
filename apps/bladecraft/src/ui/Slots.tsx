// Inventory slots that behave like Minecraft's. With a mouse: left click picks up or puts down the
// whole stack, right click takes half or puts down one, shift click moves the stack to the other part
// of the screen, dragging a full cursor across slots spreads it (left evenly, right one each), and a
// number key over a slot swaps it with that hotbar slot. On a touch screen: tap is a left click, a
// long press is a right click, and a double tap is a shift click. The stack being carried follows the
// pointer, and hovering a slot names what's in it.
import { useEffect, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from 'react';
import { Q } from '@codecraft/ga';
import type { Game, SlotRef } from '../game/game';
import { describe, num, stackName, valueOf, type Stack } from '../game/items';
import { HOTBAR } from '../game/slots';
import { Icon } from './Icon';

// --- pointer, hover and drag state shared by every slot ----------------------------------------

const ui = {
  hover: null as SlotRef | null,
  x: 0,
  y: 0,
  drag: null as { button: 'left' | 'right'; refs: SlotRef[]; shift: boolean } | null,
  version: 0,
};
const listeners = new Set<() => void>();
const bump = () => {
  ui.version++;
  listeners.forEach((f) => f());
};
const useUi = () =>
  useSyncExternalStore(
    (f) => (listeners.add(f), () => listeners.delete(f)),
    () => ui.version,
  );
const same = (a: SlotRef | null, b: SlotRef) => !!a && a.c === b.c && a.i === b.i && ('field' in a ? a.field : '') === ('field' in b ? b.field : '');

let touchTimer: ReturnType<typeof setTimeout> | null = null;
let lastTap: { ref: SlotRef; at: number } | null = null;

/** how a stack's number reads: an element's weight (hidden when exactly 1), anything else its count when over 1 */
export function countLabel(s: Stack) {
  if (s.item.kind === 'element') return Q.eq(s.count, Q.ONE) ? '' : Q.show(s.count).replace('-', '−');
  return num(s.count) > 1 ? Q.show(s.count) : '';
}

export function SlotView({
  game,
  at,
  selected,
  label,
  size = 'normal',
}: {
  game: Game;
  at: SlotRef;
  selected?: boolean;
  /** a word shown in an empty slot, e.g. "plate" */
  label?: string;
  size?: 'normal' | 'big';
}) {
  useUi();
  const s = game.stackAt(at);
  const dragged = !!ui.drag && ui.drag.refs.some((r) => same(r, at));

  const onPointerDown = (e: ReactPointerEvent) => {
    e.preventDefault();
    ui.x = e.clientX;
    ui.y = e.clientY;
    if (e.pointerType === 'touch') {
      // a long press is a right click; a quick second tap is a shift click
      touchTimer = setTimeout(() => {
        touchTimer = null;
        game.click(at, 'right');
      }, 450);
      return;
    }
    const button = e.button === 2 ? 'right' : 'left';
    if (e.shiftKey || !game.cursor) {
      game.click(at, button, e.shiftKey);
      return;
    }
    // with a full cursor, a press starts a drag that may spread across several slots
    ui.drag = { button, refs: [at], shift: false };
    bump();
  };
  const onPointerUp = (e: ReactPointerEvent) => {
    if (e.pointerType !== 'touch') return;
    if (!touchTimer) return; // the long press already fired
    clearTimeout(touchTimer);
    touchTimer = null;
    const now = performance.now();
    if (lastTap && same(lastTap.ref, at) && now - lastTap.at < 320) {
      lastTap = null;
      game.click(at, 'left', true);
      return;
    }
    lastTap = { ref: at, at: now };
    game.click(at, 'left');
  };
  const onPointerEnter = () => {
    ui.hover = at;
    if (ui.drag && !ui.drag.refs.some((r) => same(r, at)) && sameArray(ui.drag.refs[0], at)) ui.drag.refs.push(at);
    bump();
  };
  const onPointerLeave = () => {
    if (same(ui.hover, at)) ui.hover = null;
    bump();
  };

  return (
    <button
      className={`slot${selected ? ' on' : ''}${dragged ? ' drag' : ''}${size === 'big' ? ' big' : ''}${s && s.count.n < 0 ? ' negative' : ''}`}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onContextMenu={(e) => e.preventDefault()}
      aria-label={s ? stackName(s) : label ? `Empty ${label} slot` : 'Empty slot'}
    >
      {s && <Icon item={s.item} />}
      {s && countLabel(s) && <span className="count">{countLabel(s)}</span>}
      {!s && label && <span className="slot-label">{label}</span>}
    </button>
  );
}

const sameArray = (a: SlotRef, b: SlotRef) => a.c === b.c && ('field' in a ? a.field : '') === ('field' in b ? b.field : '');

/** listens for the end of drags, number keys over a slot, and the pointer's position for the cursor stack */
export function SlotInput({ game }: { game: Game }) {
  useEffect(() => {
    const up = () => {
      const d = ui.drag;
      if (!d) return;
      ui.drag = null;
      if (d.refs.length > 1) game.spread(d.refs, d.button === 'left' ? 'even' : 'one');
      else game.click(d.refs[0], d.button);
      bump();
    };
    const move = (e: PointerEvent) => {
      ui.x = e.clientX;
      ui.y = e.clientY;
      if (game.cursor || ui.hover) bump();
    };
    const key = (e: KeyboardEvent) => {
      if (!ui.hover || !/^Digit[1-9]$/.test(e.code)) return;
      game.swapWithHotbar(ui.hover, Number(e.code.slice(5)) - 1);
    };
    addEventListener('pointerup', up);
    addEventListener('pointermove', move);
    addEventListener('keydown', key);
    return () => {
      removeEventListener('pointerup', up);
      removeEventListener('pointermove', move);
      removeEventListener('keydown', key);
      ui.hover = null;
      ui.drag = null;
    };
  }, [game]);
  return null;
}

/** the stack on the cursor, following the pointer, and the name of the slot under it */
export function CursorLayer({ game }: { game: Game }) {
  useUi();
  const s = game.cursor;
  const hovered = ui.hover ? game.stackAt(ui.hover) : null;
  return (
    <>
      {s && (
        <div className="cursor-stack" style={{ left: ui.x, top: ui.y }} aria-hidden="true">
          <Icon item={s.item} size={44} />
          {countLabel(s) && <span className="count">{countLabel(s)}</span>}
        </div>
      )}
      {!s && hovered && !game.touch && (
        <div className="tooltip" style={{ left: ui.x + 14, top: ui.y + 14 }}>
          <b>{stackName(hovered)}</b>
          {hovered.item.kind === 'element' && <span className="dim">{describe(valueOf(hovered)!)}</span>}
        </div>
      )}
    </>
  );
}

/** whether the inventory drawer is open, remembered between panels */
let drawerOpen = false;

/** the player's 27 storage slots and 9 hotbar slots, as every container screen shows them. As a
 * drawer, the storage rows are hidden until the handle above the hotbar slides them out over the
 * panel, so a small screen keeps its room for the work */
export function PlayerInventory({ game, drawer = false }: { game: Game; drawer?: boolean }) {
  const [open, setOpenState] = useState(drawerOpen);
  const setOpen = (o: boolean) => setOpenState((drawerOpen = o));
  const shown = !drawer || open;
  const stored = game.inventory.slice(HOTBAR).filter(Boolean).length;
  const storage = (
    <div className="grid storage" aria-hidden={!shown}>
      {Array.from({ length: 27 }, (_, k) => (
        <SlotView key={k} game={game} at={{ c: 'inv', i: HOTBAR + k }} />
      ))}
    </div>
  );
  return (
    <div className={`player-inv${drawer ? ' drawer' : ''}${shown ? ' open' : ''}`}>
      {!drawer && storage}
      <div className="dock">
        {drawer && <div className="drawer-sheet">{storage}</div>}
        <div className="inv-bar">
          {/* always one line tall, so picking something up never moves the layout */}
          <div className="holding" aria-live="polite">
            {game.cursor ? (
              <>
                Holding <b>{stackName(game.cursor)}</b>
              </>
            ) : (
              '\u00a0'
            )}
          </div>
          {drawer && (
            <button className="small drawer-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
              {open ? '▾ Hide' : '▴ Inventory'} <span className="dim">{stored}/27</span>
            </button>
          )}
        </div>
        <div className="grid hotbar-row">
          {Array.from({ length: HOTBAR }, (_, k) => (
            <SlotView key={k} game={game} at={{ c: 'inv', i: k }} selected={k === game.selected} />
          ))}
        </div>
      </div>
    </div>
  );
}
