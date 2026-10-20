import { useState, type ReactNode } from 'react';
import { ACHIEVEMENTS, type Achievement, type Op } from '../game/achievements';
import { apply, type Game } from '../game/game';
import { describe, itemName, SLOTS } from '../game/items';
import { Icon } from './Icon';

function Sheet({ title, game, children }: { title: string; game: Game; children: ReactNode }) {
  return (
    <div className="sheet" role="dialog" aria-label={title}>
      <header>
        <h2>{title}</h2>
        <button onClick={() => game.play()}>Back to game</button>
      </header>
      {children}
    </div>
  );
}

export function StartScreen({ game }: { game: Game }) {
  const [confirm, setConfirm] = useState(false);
  const earned = game.achievements.earned.size;
  return (
    <div className="start">
      <h1>Bladecraft</h1>
      <p>
        A world of blocks where the items are elements of geometric algebra. Mine vectors, combine them at the algebra bench, and place
        what you make: placed elements become machines that push, turn and launch you.
      </p>
      <p className="dim">
        {game.touch
          ? 'Left thumb moves. Right thumb looks; tap to place or open a bench, hold to break.'
          : 'WASD to move, mouse to look, space to jump. Left click breaks, right click places or opens a bench. 1–9 or the wheel pick an item.'}
      </p>
      <div className="row">
        <button className="primary" onClick={() => game.play()}>
          Play
        </button>
        <button onClick={() => game.open('achievements')}>Achievements ({earned}/{ACHIEVEMENTS.length})</button>
        {confirm ? (
          <button className="danger" onClick={() => (setConfirm(false), game.newWorld())}>
            Replace this world
          </button>
        ) : (
          <button onClick={() => setConfirm(true)}>New world</button>
        )}
      </div>
    </div>
  );
}

function Slots({ game, onPick, picked, filter }: { game: Game; onPick: (i: number) => void; picked?: number | null; filter?: (i: number) => boolean }) {
  return (
    <div className="grid">
      {Array.from({ length: SLOTS }, (_, i) => {
        const st = game.inventory.slots[i];
        const usable = !filter || filter(i);
        return (
          <button
            key={i}
            className={`slot${picked === i ? ' on' : ''}${i < 9 ? ' bar' : ''}`}
            disabled={!usable}
            onClick={() => onPick(i)}
            aria-label={st ? `${itemName(st.item)} ×${st.count}` : 'Empty slot'}
          >
            {st && <Icon item={st.item} />}
            {st && st.count > 1 && <span className="count">{st.count}</span>}
            {st && st.item.kind === 'element' && <span className="label">{itemName(st.item)}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function InventoryScreen({ game }: { game: Game }) {
  const [picked, setPicked] = useState<number | null>(null);
  const st = picked === null ? null : game.inventory.slots[picked];
  return (
    <Sheet title="Inventory" game={game}>
      <p className="dim">Tap an item to see what it is, then tap another slot to swap them. The top row is your hotbar.</p>
      <Slots
        game={game}
        picked={picked}
        onPick={(i) => {
          if (picked === null || picked === i) return setPicked(picked === i ? null : i);
          game.swap(picked, i);
          setPicked(null);
        }}
      />
      {st && (
        <div className="detail">
          <Icon item={st.item} size={64} />
          <div>
            <b>{itemName(st.item)}</b>
            <div className="dim">{st.item.kind === 'element' ? describe(st.item.mv) : st.item.kind === 'bench' ? 'Place it, then use it to combine elements.' : 'Building material.'}</div>
          </div>
        </div>
      )}
    </Sheet>
  );
}

const OPS: { op: Op; label: string; text: string }[] = [
  { op: 'add', label: 'A + B', text: 'sum' },
  { op: 'sub', label: 'A − B', text: 'difference' },
  { op: 'wedge', label: 'A ∧ B', text: 'outer product' },
  { op: 'product', label: 'A B', text: 'geometric product' },
  { op: 'contract', label: 'A ⌋ B', text: 'inner product (left contraction)' },
  { op: 'sandwich', label: 'A B A⁻¹', text: 'apply A to B' },
  { op: 'reverse', label: 'Ã', text: 'reverse of A' },
];

export function BenchScreen({ game }: { game: Game }) {
  const [a, b] = game.benchInputs();
  return (
    <Sheet title="Algebra bench" game={game}>
      <div className="inputs">
        {(['A', 'B'] as const).map((name, k) => {
          const mv = [a, b][k];
          return (
            <button key={name} className="input" onClick={() => game.benchClear(k as 0 | 1)} aria-label={mv ? `${name}: ${mv}, tap to clear` : `${name}: empty`}>
              <small>{name}</small>
              {mv ? <Icon item={{ kind: 'element', mv }} size={56} /> : <span className="dim">tap an item below</span>}
              {mv && <span className="label">{String(mv)}</span>}
            </button>
          );
        })}
      </div>
      <div className="ops">
        {OPS.map(({ op, label, text }) => {
          const result = a ? apply(op, a, b) : null;
          const ready = !!a && (op === 'reverse' || !!b);
          return (
            <button key={op} className="op" disabled={!ready || !result} onClick={() => game.craft(op)} title={text}>
              <span className="sym">{label}</span>
              <span className="dim">{text}</span>
              <span className="res">
                {!ready ? '' : !result ? 'A has no inverse' : result.isZero() ? '= 0, nothing' : `= ${result}`}
              </span>
            </button>
          );
        })}
      </div>
      <p className="dim">Making something uses one A and one B. A result of 0 uses nothing.</p>
      <Slots game={game} onPick={(i) => game.benchPut(i)} filter={(i) => game.inventory.slots[i]?.item.kind === 'element'} />
    </Sheet>
  );
}

export function AchievementsScreen({ game }: { game: Game }) {
  const [open, setOpen] = useState<Achievement | null>(null);
  // lay the tree out in columns by depth: a node sits one column right of its deepest parent
  const depth = new Map<string, number>();
  const d = (a: Achievement): number => {
    if (depth.has(a.id)) return depth.get(a.id)!;
    const v = a.parents.length ? 1 + Math.max(...a.parents.map((p) => d(ACHIEVEMENTS.find((x) => x.id === p)!))) : 0;
    depth.set(a.id, v);
    return v;
  };
  const columns: Achievement[][] = [];
  for (const a of ACHIEVEMENTS) (columns[d(a)] ??= []).push(a);
  const title = (id: string) => ACHIEVEMENTS.find((a) => a.id === id)!.title;

  return (
    <Sheet title="Achievements" game={game}>
      <p className="dim">
        These are optional, like Minecraft's advancements: nothing is locked behind them. Each one is a small idea from geometric algebra; new
        ones appear as you earn the ones before them.
      </p>
      <div className="tree">
        {columns.map((col, i) => (
          <div key={i} className="col">
            {col.map((a) => {
              const earned = game.achievements.earned.has(a.id);
              const seen = game.achievements.visible(a);
              return (
                <button key={a.id} className={`node${earned ? ' earned' : ''}`} disabled={!seen} onClick={() => setOpen(a)}>
                  <b>{seen ? a.title : '?'}</b>
                  {seen && <span className="dim">{earned ? 'Earned' : a.goal}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {open && (
        <div className="detail lesson">
          <div>
            <b>{open.title}</b>
            <div className="dim">{game.achievements.earned.has(open.id) ? 'Earned' : `Goal: ${open.goal}`}</div>
            {open.parents.length > 0 && <div className="dim">Follows: {open.parents.map(title).join(', ')}</div>}
            <p>{open.lesson}</p>
          </div>
          <button onClick={() => setOpen(null)}>Close</button>
        </div>
      )}
    </Sheet>
  );
}
