import { useState, type ReactNode } from 'react';
import type { Multivector } from '@codecraft/ga';
import { ACHIEVEMENTS, type Achievement } from '../game/achievements';
import { COLLECTOR_CAPACITY, WORK_TIME } from '../game/factory';
import type { Game } from '../game/game';
import { HOTBAR, MACHINE_NAMES, describe, itemName, SLOTS } from '../game/items';
import { apply, type Op } from '../game/ops';
import { ORDERS } from '../game/orders';
import { RECIPES, canBuild } from '../game/recipes';
import { DIR_NAMES, STEP, opposite } from '../game/world';
import { GATES, bloch, probUp, type GateId } from '../game/qubit';
import { Q } from '@codecraft/ga';
import { Icon } from './Icon';

function Sheet({ title, game, children, icon }: { title: string; game: Game; children: ReactNode; icon?: ReactNode }) {
  return (
    <div className="sheet" role="dialog" aria-label={title}>
      <header>
        <h2>
          {icon}
          {title}
        </h2>
        <button className="primary" onClick={() => game.play()}>
          Back to game
        </button>
      </header>
      {children}
    </div>
  );
}

const el = (mv: Multivector) => ({ kind: 'element', mv }) as const;

export function StartScreen({ game }: { game: Game }) {
  const [confirm, setConfirm] = useState(false);
  const earned = game.achievements.earned.size;
  return (
    <div className="start">
      <h1>Bladecraft</h1>
      <p>
        Build a factory that does geometric algebra. Extract vectors from deposits, carry them through ducts into machines that add,
        wedge, multiply and rotate them, and deliver what the hub orders. The guide in the corner walks you through the first steps.
      </p>
      <p className="dim">
        {game.touch
          ? 'Left thumb moves, right thumb looks. Buttons on the right break, use, place and rotate.'
          : 'WASD moves, the mouse looks, space jumps. Left click breaks; right click uses a machine or places; shift + right click always places; R rotates.'}
      </p>
      <div className="row">
        <button className="primary" onClick={() => game.play()}>
          Play
        </button>
        <button onClick={() => game.open('achievements')}>
          Achievements ({earned}/{ACHIEVEMENTS.length})
        </button>
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

function Slots({ game, onPick, picked, filter, from = 0, to = SLOTS }: { game: Game; onPick: (i: number) => void; picked?: number | null; filter?: (i: number) => boolean; from?: number; to?: number }) {
  return (
    <div className="grid">
      {Array.from({ length: to - from }, (_, k) => {
        const i = from + k;
        const st = game.inventory.slots[i];
        const usable = !filter || filter(i);
        return (
          <button
            key={i}
            className={`slot${picked === i ? ' on' : ''}${i === game.selected ? ' held' : ''}`}
            disabled={!usable}
            onClick={() => onPick(i)}
            aria-label={st ? `${itemName(st.item)} ×${st.count}` : 'Empty slot'}
          >
            {st && <Icon item={st.item} />}
            {st && st.count > 1 && <span className="count">{st.count}</span>}
            {st && <span className="name">{itemName(st.item)}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function InventoryScreen({ game }: { game: Game }) {
  const [picked, setPicked] = useState<number | null>(null);
  const [swapping, setSwapping] = useState(false);
  const st = picked === null ? null : game.inventory.slots[picked];
  const pick = (i: number) => {
    if (swapping && picked !== null) {
      game.swap(picked, i);
      setSwapping(false);
      setPicked(i);
      return;
    }
    setPicked(picked === i ? null : i);
  };
  return (
    <Sheet title="Items" game={game}>
      <h3>Hotbar</h3>
      <Slots game={game} picked={picked} onPick={pick} to={HOTBAR} />
      <h3>Storage</h3>
      <Slots game={game} picked={picked} onPick={pick} from={HOTBAR} />
      {swapping && <p className="callout pinned">Tap the slot to swap with.</p>}
      {st && picked !== null && !swapping && (
        <div className="detail pinned">
          <Icon item={st.item} size={64} />
          <div className="grow">
            <b>
              {itemName(st.item)} × {st.count}
            </b>
            <div className="dim">
              {st.item.kind === 'element'
                ? `${describe(st.item.mv)}. Feed it into a machine, or use it at the bench.`
                : st.item.kind === 'machine'
                  ? RECIPES.find((r) => r.makes === (st.item as { type: string }).type)?.does
                  : st.item.kind === 'bench'
                    ? 'Place it, then use it to build machines and combine elements by hand.'
                    : 'Building material.'}
            </div>
            <div className="row">
              {picked < HOTBAR ? (
                <>
                  <button
                    className="primary"
                    onClick={() => {
                      game.select(picked);
                      game.play();
                    }}
                  >
                    Hold it
                  </button>
                  <button onClick={() => (game.shuttle(picked), setPicked(null))}>Move to storage</button>
                </>
              ) : (
                <button className="primary" onClick={() => (game.shuttle(picked), setPicked(null))}>
                  Move to hotbar
                </button>
              )}
              <button onClick={() => setSwapping(true)}>Swap with…</button>
            </div>
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
  { op: 'contract', label: 'A ⌋ B', text: 'inner product' },
  { op: 'sandwich', label: 'A B A⁻¹', text: 'A applied to B' },
  { op: 'reverse', label: 'Ã', text: 'reverse of A' },
];

export function BenchScreen({ game }: { game: Game }) {
  const [tab, setTab] = useState<'build' | 'combine'>('build');
  return (
    <Sheet title="Algebra bench" game={game}>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'build'} onClick={() => setTab('build')}>
          Build machines
        </button>
        <button role="tab" aria-selected={tab === 'combine'} onClick={() => setTab('combine')}>
          Combine by hand
        </button>
      </div>
      {tab === 'build' ? <BuildTab game={game} /> : <CombineTab game={game} />}
    </Sheet>
  );
}

function BuildTab({ game }: { game: Game }) {
  return (
    <div className="recipes">
      {RECIPES.map((r) => {
        const ok = canBuild(game.inventory, r);
        return (
          <div key={r.makes} className={`recipe${ok ? ' ok' : ''}`}>
            <Icon item={{ kind: 'machine', type: r.makes }} size={56} />
            <div className="grow">
              <b>
                {MACHINE_NAMES[r.makes]}
                {r.count > 1 ? ` × ${r.count}` : ''}
              </b>
              <div className="dim">{r.does}</div>
              <ul>
                {r.needs.map((n) => {
                  const have = game.inventory.count(n.test);
                  return (
                    <li key={n.label} className={have >= n.count ? 'have' : 'missing'}>
                      {have >= n.count ? '✓' : '✗'} {n.count} × {n.label} <span className="dim">(have {have})</span>
                    </li>
                  );
                })}
              </ul>
            </div>
            <button className={ok ? 'primary' : ''} disabled={!ok} onClick={() => game.buildMachine(r)}>
              Build
            </button>
          </div>
        );
      })}
    </div>
  );
}

function CombineTab({ game }: { game: Game }) {
  const [a, b] = game.benchInputs();
  return (
    <>
      <p className="dim">Tap elements below to fill A, then B. Every result shows before you make it; making one uses one A and one B.</p>
      <div className="inputs">
        {(['A', 'B'] as const).map((name, k) => {
          const mv = [a, b][k];
          return (
            <button key={name} className="input" onClick={() => game.benchClear(k as 0 | 1)} aria-label={mv ? `${name}: ${mv}, tap to clear` : `${name}: empty`}>
              <small>{name}</small>
              {mv ? <Icon item={el(mv)} size={56} /> : <span className="dim">empty</span>}
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
              <span className="res">{!ready ? '' : !result ? 'A has no inverse' : result.isZero() ? '= 0, nothing' : `= ${result}`}</span>
            </button>
          );
        })}
      </div>
      <Slots game={game} onPick={(i) => game.benchPut(i)} filter={(i) => game.inventory.slots[i]?.item.kind === 'element'} />
    </>
  );
}

function Held({ name, mv, note }: { name: string; mv: Multivector | null; note: string }) {
  return (
    <div className="held-slot">
      <small>{name}</small>
      {mv ? <Icon item={el(mv)} size={48} /> : <span className="dim empty">—</span>}
      <span>{mv ? String(mv) : note}</span>
    </div>
  );
}

const OP_SYMBOL = { adder: '+', wedger: '∧', multiplier: '×', sandwich: 'applied by', gate: 'on' } as const;

export function MachineScreen({ game }: { game: Game }) {
  const m = game.panelBlock;
  if (m?.kind !== 'machine' || !game.panel) return null;
  const [x, y, z] = game.panel;
  const title = MACHINE_NAMES[m.type];
  const recipe = RECIPES.find((r) => r.makes === m.type)!;
  const icon = <Icon item={{ kind: 'machine', type: m.type }} size={28} />;
  const rotate = (
    <button onClick={() => game.rotatePanel()}>
      Rotate (output faces {DIR_NAMES[m.facing]})
    </button>
  );

  if (m.type === 'extractor') {
    const [dx, dz] = STEP[opposite(m.facing)];
    const src = game.world.get(x + dx, y, z + dz);
    return (
      <Sheet title={title} game={game} icon={icon}>
        <p>{recipe.does}</p>
        {src?.kind === 'deposit' ? (
          <div className="detail">
            <Icon item={el(src.mv)} size={56} />
            <div>
              Drawing <b>{String(src.mv)}</b> from the deposit behind it, one every 1.5 s, out of its OUT side ({DIR_NAMES[m.facing]}).
            </div>
          </div>
        ) : (
          <p className="callout">No deposit behind it. Rotate it until its DEPOSIT side touches one.</p>
        )}
        {m.out && <p className="dim">Waiting to push {String(m.out.mv)} out: put a duct or machine in front of its OUT side.</p>}
        <div className="row">{rotate}</div>
      </Sheet>
    );
  }

  if (m.type === 'collector') {
    const total = m.stored.reduce((n, s) => n + s.count, 0);
    return (
      <Sheet title={title} game={game} icon={icon}>
        <p>
          {recipe.does} Holds {total} of {COLLECTOR_CAPACITY}.
        </p>
        <div className="stored">
          {m.stored.length ? (
            m.stored.map((s) => (
              <div key={s.mv.key()} className="held-slot">
                <Icon item={el(s.mv)} size={44} />
                <span>
                  {String(s.mv)} × {s.count}
                </span>
              </div>
            ))
          ) : (
            <span className="dim">Empty. Duct elements into any side.</span>
          )}
        </div>
        <div className="row">
          <button className="primary" disabled={!total} onClick={() => game.takeCollected()}>
            Take everything
          </button>
        </div>
      </Sheet>
    );
  }

  if (m.type === 'duct') return null;

  if (m.type === 'bloch' || m.type === 'detector' || m.type === 'orrery') {
    const v = m.a ? bloch(m.a) : null;
    return (
      <Sheet title={title} game={game} icon={icon}>
        <p>{recipe.does} It takes A from any side but its front.</p>
        <div className="machine-view">
          <Held name="A (state)" mv={m.a} note="waiting" />
          <span className="op-sym">→</span>
          <Held name="OUT (front)" mv={m.out} note={m.a ? `working ${Math.round((100 * m.work) / WORK_TIME)}%` : 'nothing yet'} />
        </div>
        {m.a && !v && <p className="callout">{String(m.a)} isn’t a qubit state: a state is a scalar plus a bivector (a rotor). It will vanish.</p>}
        {m.type === 'detector' && m.a && v && (
          <p className="dim">
            Up (e₃) with probability {String(Q.show(probUp(m.a)!))}, down (−e₃) otherwise.
          </p>
        )}
        {m.type === 'orrery' && (
          <>
            <h3>Fibers shown</h3>
            {m.seen.length ? (
              <div className="stored">
                {m.seen.map((r) => (
                  <div key={r.key()} className="held-slot">
                    <Icon item={el(r)} size={44} />
                    <span>{String(r)}</span>
                    <span className="dim">points {String(bloch(r))}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="dim">None yet. Each distinct state that passes through adds its Hopf fiber above the orrery; states with the same Bloch vector share a fiber and show as beads on it.</p>
            )}
            <div className="row">
              <button disabled={!m.seen.length} onClick={() => game.clearOrrery()}>
                Clear the fibers
              </button>
            </div>
          </>
        )}
        <div className="row">{rotate}</div>
      </Sheet>
    );
  }

  const sandwich = m.type === 'sandwich';
  const gateMachine = m.type === 'gate';
  return (
    <Sheet title={title} game={game} icon={icon}>
      <p>
        {recipe.does}{' '}
        {sandwich ? 'A arrives at its back; B is the rotor or vector applied to it.' : gateMachine ? 'The state A arrives at its back; the gate B is set below or arrives at a side.' : 'A arrives at its back, B at either side.'}
      </p>
      <div className="machine-view">
        {gateMachine ? (
          <>
            <Held name={m.preset ? `gate ${m.preset}` : m.fixed ? 'B (fixed)' : 'B (sides)'} mv={m.fixed ?? m.b} note="waiting" />
            <span className="op-sym">{OP_SYMBOL.gate}</span>
            <Held name="A (back)" mv={m.a} note="waiting" />
          </>
        ) : (
          <>
            <Held name="A (back)" mv={m.a} note="waiting" />
            <span className="op-sym">{OP_SYMBOL[m.type]}</span>
            <Held name={m.fixed ? 'B (fixed)' : 'B (sides)'} mv={m.fixed ?? m.b} note="waiting" />
          </>
        )}
        <span className="op-sym">→</span>
        <Held name="OUT (front)" mv={m.out} note={m.a && (m.fixed ?? m.b) ? `working ${Math.round((100 * m.work) / WORK_TIME)}%` : 'nothing yet'} />
      </div>
      {gateMachine && (
        <>
          <h3>Gate</h3>
          <div className="gates">
            {(Object.keys(GATES) as GateId[]).map((id) => (
              <button key={id} className={m.preset === id ? 'primary' : ''} onClick={() => game.setGate(id)} title={GATES[id].does}>
                <b>{id}</b>
                <span className="dim">{GATES[id].does}</span>
              </button>
            ))}
          </div>
        </>
      )}
      <h3>{gateMachine ? 'Or any rotor as the gate' : 'Fixed B'}</h3>
      <p className="dim">
        Set B to one of your elements and the machine uses it for every A, so a single duct of A is enough.
        {sandwich ? ' For a sandwich press this is the rotor that turns everything passing through.' : ''}
      </p>
      {m.fixed && (
        <div className="row">
          <button onClick={() => game.setFixed(null)}>
            {m.preset ? `Clear gate ${m.preset}` : `Clear fixed B (${String(m.fixed)} goes back to you)`}
          </button>
        </div>
      )}
      <Slots game={game} onPick={(i) => game.setFixed(i)} filter={(i) => game.inventory.slots[i]?.item.kind === 'element'} />
      <div className="row">{rotate}</div>
    </Sheet>
  );
}

export function HubScreen({ game }: { game: Game }) {
  const hub = game.factory.hub;
  return (
    <Sheet title="Hub orders" game={game}>
      <p className="dim">Duct elements into any side of the hub. Only the current order’s element counts; each completed order adds 16 lattice to your items.</p>
      <ol className="orders">
        {ORDERS.map((o, i) => {
          const state = i < hub.order ? 'done' : i === hub.order ? 'current' : 'later';
          return (
            <li key={i} className={state}>
              <Icon item={el(o.want)} size={44} />
              <div className="grow">
                <b>
                  {o.count} × {String(o.want)}
                </b>
                {state === 'done' && <span className="dim"> · delivered</span>}
                {state === 'current' && (
                  <>
                    <span className="bar">
                      <span style={{ width: `${(100 * hub.delivered) / o.count}%` }} />
                      <em>
                        {hub.delivered}/{o.count}
                      </em>
                    </span>
                    <div className="dim">{o.hint}</div>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </Sheet>
  );
}

export function AchievementsScreen({ game }: { game: Game }) {
  const [open, setOpen] = useState<Achievement | null>(null);
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
        These are optional, like Minecraft’s advancements: nothing is locked behind them. Each one is a small idea from geometric algebra or
        the factory; new ones appear as you earn the ones before them.
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
