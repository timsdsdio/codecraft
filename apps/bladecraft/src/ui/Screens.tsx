import { useState, type ReactNode } from 'react';
import type { Multivector } from '@codecraft/ga';
import { ACHIEVEMENTS, BRANCHES, layoutBranch, type Achievement } from '../game/achievements';
import { COLLECTOR_CAPACITY, MERGE_ORDER, SPLIT_ORDER, WORK_TIME } from '../game/factory';
import type { Game } from '../game/game';
import { HOTBAR, MACHINE_NAMES, describe, itemName, SLOTS } from '../game/items';
import { apply, type Op } from '../game/ops';
import { ORDERS, orderLabel } from '../game/orders';
import { RECIPES, canBuild, sortLabel } from '../game/recipes';
import { DIR_NAMES, STEP, opposite, type Dir, type SortMode } from '../game/world';
import { GATES, bloch, probUp, type GateId } from '../game/qubit';
import { FREQUENCIES, WAVE_SPEED, fieldText, scalarPart, upPart } from '../game/field';
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

  if (m.type === 'duct' || m.type === 'plate') return null;

  if (m.type === 'charge' || m.type === 'wire' || m.type === 'antenna' || m.type === 'probe') {
    const field = game.factory.field;
    const region = field.regionAt(x, y, z);
    const where = region ? (
      <p className="dim">Part of a field of {region.size} blocks.</p>
    ) : (
      <p className="callout">Not in a field: it does nothing until it stands among field plates, beside at least one of them.</p>
    );
    if (m.type === 'probe') {
      const now = fieldText(field.at(x, y, z), 2);
      return (
        <Sheet title={title} game={game} icon={icon}>
          <p>{recipe.does}</p>
          {where}
          <div className="detail">
            <div>
              Here now: E = <b>{now.e}</b>, IB = <b>{now.ib}</b>
            </div>
          </div>
          <div className="machine-view">
            <Held name="last reading" mv={m.reading && !m.reading.isZero() ? m.reading : null} note={region ? 'the field here is 0' : 'none'} />
            <span className="op-sym">→</span>
            <Held name="OUT (front)" mv={m.out} note="sent" />
          </div>
          <p className="dim">A reading’s vector part is E and its bivector part is IB. A field too weak to round to a half reads 0, which sends nothing.</p>
          <div className="row">{rotate}</div>
        </Sheet>
      );
    }
    const isCharge = m.type === 'charge';
    const value = isCharge ? m.charge : m.current;
    const wants = isCharge ? 'a scalar' : 'a vector';
    return (
      <Sheet title={title} game={game} icon={icon}>
        <p>{recipe.does}</p>
        {where}
        <div className="machine-view">
          <Held name={isCharge ? 'charge' : 'current'} mv={value} note="none" />
        </div>
        {isCharge ? (
          <p className="dim">{scalarPart(value) > 0 ? 'Positive: E points away from it.' : scalarPart(value) < 0 ? 'Negative: E points toward it.' : 'No charge, so no field. Give it a scalar (−1 is e₁₂ e₁₂).'}</p>
        ) : (
          <p className="dim">
            {upPart(value) !== 0
              ? `A current of ${upPart(value)} up the wire${m.type === 'antenna' ? ' at the peak of each swing' : ''}. While it runs up, B circles the wire anticlockwise, seen from above.`
              : value
                ? `${value} has no e₃ part, and only current along the wire flows.`
                : 'No current. Give it a vector with an e₃ part, such as e₃ or −e₃.'}
          </p>
        )}
        {m.type === 'antenna' && (
          <>
            <h3>Frequency</h3>
            <div className="row">
              {FREQUENCIES.map((f, i) => (
                <button key={f} className={m.frequency === i ? 'primary' : ''} onClick={() => game.setFrequency(i)}>
                  A swing every {1 / f} s (waves {WAVE_SPEED / f} blocks apart)
                </button>
              ))}
            </div>
          </>
        )}
        <h3>Set it</h3>
        <p className="dim">Pick {wants} from your elements, or duct them in from any side. Each new one replaces the last; one set here comes back to you when replaced.</p>
        <Slots
          game={game}
          onPick={(i) => game.setSource(i)}
          filter={(i) => {
            const it = game.inventory.slots[i]?.item;
            return it?.kind === 'element' && it.mv.grades().join() === (isCharge ? '0' : '1');
          }}
        />
        <div className="row">{rotate}</div>
      </Sheet>
    );
  }

  if (m.type === 'splitter' || m.type === 'merger' || m.type === 'crossing') {
    const sideName = (r: number) => ['front', 'left', 'back', 'right'][r];
    const held =
      m.type === 'splitter'
        ? [{ name: 'holding', mv: m.item }]
        : m.type === 'merger'
          ? [1, 2, 3].map((r) => ({ name: `from the ${sideName(r)}`, mv: m.slots[r] }))
          : ([0, 1, 2, 3] as Dir[]).map((d) => ({ name: `in from ${DIR_NAMES[d]}`, mv: m.slots[d] }));
    return (
      <Sheet title={title} game={game} icon={icon}>
        <p>{recipe.does}</p>
        <div className="machine-view">
          {held.map((h) => (
            <Held key={h.name} name={h.name} mv={h.mv} note="empty" />
          ))}
        </div>
        {m.type === 'splitter' && <p className="dim">The next element goes out of its {sideName(SPLIT_ORDER[m.next])}. A side with nowhere to go is skipped.</p>}
        {m.type === 'merger' && <p className="dim">Next it takes from the {sideName(MERGE_ORDER[m.next])}. An empty input is skipped.</p>}
        {m.type === 'crossing' && <p className="dim">Its rotation doesn’t matter: every side goes straight across.</p>}
        <div className="row">{rotate}</div>
      </Sheet>
    );
  }

  if (m.type === 'sorter') {
    const modes: { id: SortMode; label: string }[] = [
      { id: 'same', label: 'Same as the sample' },
      { id: 'scalar', label: 'Scalars' },
      { id: 'vector', label: 'Vectors' },
      { id: 'bivector', label: 'Bivectors' },
      { id: 'trivector', label: 'Trivectors' },
      { id: 'state', label: 'Qubit states' },
    ];
    const sideWord = m.side === 1 ? 'left' : 'right';
    return (
      <Sheet title={title} game={game} icon={icon}>
        <p>{recipe.does}</p>
        <p>
          Sends <b>{sortLabel(m.mode, m.filter)}</b> out of its {sideWord}; everything else goes out of its front.
        </p>
        <div className="machine-view">
          <Held name="sample" mv={m.filter} note="none" />
          <Held name="holding" mv={m.item} note="empty" />
        </div>
        <h3>Matches</h3>
        <div className="row">
          {modes.map((mode) => (
            <button key={mode.id} className={m.mode === mode.id ? 'primary' : ''} onClick={() => game.setSorter({ mode: mode.id })}>
              {mode.label}
            </button>
          ))}
        </div>
        <h3>Leave by</h3>
        <div className="row">
          <button className={m.side === 1 ? 'primary' : ''} onClick={() => game.setSorter({ side: 1 })}>
            Left side
          </button>
          <button className={m.side === 3 ? 'primary' : ''} onClick={() => game.setSorter({ side: 3 })}>
            Right side
          </button>
        </div>
        <h3>Sample</h3>
        <p className="dim">Pick one of your elements to sort by. The sorter only looks at it, so you keep it.</p>
        <Slots game={game} onPick={(i) => game.setSorter({ sampleSlot: i })} filter={(i) => game.inventory.slots[i]?.item.kind === 'element'} />
        <div className="row">{rotate}</div>
      </Sheet>
    );
  }

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
                  {o.count} × {orderLabel(o)}
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

const NODE_W = 188;
const NODE_H = 78;
const GAP_X = 40;
const GAP_Y = 12;

export function AchievementsScreen({ game }: { game: Game }) {
  const [open, setOpen] = useState<Achievement | null>(null);
  const earned = game.achievements.earned;
  const title = (id: string) => ACHIEVEMENTS.find((a) => a.id === id)!.title;

  return (
    <Sheet title="Achievements" game={game}>
      <p className="dim">
        These are optional, like Minecraft’s advancements: nothing is locked behind them. Each one is a small idea from geometric algebra or
        the factory, and each branch reads left to right. New ones are named as you earn the ones before them. {earned.size} of {ACHIEVEMENTS.length}{' '}
        earned.
      </p>
      {BRANCHES.map((br) => {
        const { nodes, edges, columns, rows } = layoutBranch(br.id);
        const at = new Map(nodes.map((n) => [n.a.id, n]));
        const x = (n: { col: number }) => n.col * (NODE_W + GAP_X);
        const y = (n: { row: number }) => n.row * (NODE_H + GAP_Y);
        const width = columns * (NODE_W + GAP_X) - GAP_X;
        const height = rows * (NODE_H + GAP_Y) - GAP_Y;
        return (
          <section key={br.id} className="branch">
            <h3>
              {br.title} <span className="dim">{nodes.filter((n) => earned.has(n.a.id)).length} of {nodes.length}</span>
            </h3>
            <div className="tree-scroll">
              <div className="tree" style={{ width, height }}>
                <svg width={width} height={height} aria-hidden>
                  {edges.map(([from, to]) => {
                    const a = at.get(from)!;
                    const b = at.get(to)!;
                    const [x1, y1, x2, y2] = [x(a) + NODE_W, y(a) + NODE_H / 2, x(b), y(b) + NODE_H / 2];
                    const mid = (x1 + x2) / 2;
                    const lit = earned.has(from) && earned.has(to);
                    const known = game.achievements.visible(b.a);
                    return (
                      <path
                        key={`${from}-${to}`}
                        d={`M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`}
                        className={`edge${lit ? ' lit' : ''}${known ? '' : ' unknown'}`}
                      />
                    );
                  })}
                </svg>
                {nodes.map((n) => {
                  const done = earned.has(n.a.id);
                  const seen = game.achievements.visible(n.a);
                  return (
                    <button
                      key={n.a.id}
                      className={`node${done ? ' earned' : ''}${open?.id === n.a.id ? ' open' : ''}`}
                      style={{ left: x(n), top: y(n), width: NODE_W, height: NODE_H }}
                      disabled={!seen}
                      onClick={() => setOpen(n.a)}
                    >
                      <b>{seen ? n.a.title : '?'}</b>
                      {seen && <span className="dim goal">{done ? 'Earned' : n.a.goal}</span>}
                      {seen && n.outside.length > 0 && <span className="after">after {n.outside.map((o) => o.title).join(', ')}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        );
      })}
      {open && (
        <div className="detail lesson">
          <div>
            <b>{open.title}</b>
            <div className="dim">{earned.has(open.id) ? 'Earned' : `Goal: ${open.goal}`}</div>
            {open.parents.length > 0 && <div className="dim">Follows: {open.parents.map(title).join(', ')}</div>}
            <p>{open.lesson}</p>
          </div>
          <button onClick={() => setOpen(null)}>Close</button>
        </div>
      )}
    </Sheet>
  );
}
