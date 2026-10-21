import { useEffect, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { G3, Multivector, Q } from '@codecraft/ga';
import { ACHIEVEMENTS, BRANCHES, layoutBranch, type Achievement } from '../game/achievements';
import { millOutput, type Card } from '../game/cards';
import { MERGE_ORDER, SPLIT_ORDER, decks, outputs } from '../game/factory';
import { FREQUENCIES, WAVE_SPEED, fieldText, scalarPart, upPart } from '../game/field';
import { SORTS_TO_LEARN, type Game } from '../game/game';
import { MACHINE_NAMES, VERB_NAMES, itemName, stackOf, valueOf, type Verb } from '../game/items';
import { RULES, RULE_NAMES, RULE_SYMBOLS, autoSort, pairAction, product, railWhyZero, sorted, terms, type Rule } from '../game/products';
import { bloch, probUp } from '../game/qubit';
import { RECIPES, canBuild, sortLabel } from '../game/recipes';
import { DIR_NAMES, type SortMode } from '../game/world';
import { ElementIcon, GradeCard, GRADE_CARD, Icon } from './Icon';
import { CursorLayer, PlayerInventory, SlotInput, SlotView, countLabel } from './Slots';

function Sheet({ title, game, children, icon, slots = true }: { title: string; game: Game; children: ReactNode; icon?: ReactNode; slots?: boolean }) {
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
      {slots && (
        <>
          <SlotInput game={game} />
          <CursorLayer game={game} />
        </>
      )}
    </div>
  );
}

const HOW_TO_MOVE_THINGS =
  'Left click picks up or puts down a whole stack; right click takes half or puts down one; shift click moves a stack across; drag a held stack over slots to spread it; a number key over a slot swaps it with the hotbar.';
const HOW_TO_MOVE_THINGS_TOUCH = 'Tap picks up or puts down a whole stack; long-press takes half or puts down one; double-tap moves a stack across.';

export function StartScreen({ game }: { game: Game }) {
  const [confirm, setConfirm] = useState(false);
  const earned = game.achievements.earned.size;
  return (
    <div className="start">
      <h1>Bladecraft</h1>
      <p>
        A factory game where the items are blades of geometric algebra. Take blades from deposits, add them on the Workbench, learn to
        multiply them by sorting their factors by hand, press multivectors into cards, and build Mills that do the algebra for you. The
        goals tree suggests what to make next; the guide in the corner gets you started.
      </p>
      <p className="dim">
        {game.touch
          ? `Left thumb moves, right thumb looks. Buttons on the right break, use, place and rotate. ${HOW_TO_MOVE_THINGS_TOUCH}`
          : `WASD moves, the mouse looks, space jumps. Left click breaks; right click uses a machine or places; shift + right click always places; R rotates; E opens your inventory. Esc frees the mouse to click the buttons; click the world to look again. In the inventory: ${HOW_TO_MOVE_THINGS}`}
      </p>
      <div className="row">
        <button className="primary" onClick={() => game.play()}>
          Play
        </button>
        <button onClick={() => game.open('achievements')}>
          Goals ({earned}/{ACHIEVEMENTS.length})
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

export function InventoryScreen({ game }: { game: Game }) {
  return (
    <Sheet title="Inventory" game={game}>
      <p className="dim">{game.touch ? HOW_TO_MOVE_THINGS_TOUCH : HOW_TO_MOVE_THINGS}</p>
      <p className="dim">
        Things stack when one is a multiple of the other, and stacking adds them: the number on an element is its weight. Put −e₁ on e₁
        and they cancel. A multivector of several blades is one item, shown as its grade card.
      </p>
      <PlayerInventory game={game} />
    </Sheet>
  );
}

// --- the Workbench -----------------------------------------------------------------------------

export function WorkbenchScreen({ game }: { game: Game }) {
  const [tab, setTab] = useState<'algebra' | 'build'>('algebra');
  return (
    <Sheet title="Workbench" game={game}>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'algebra'} onClick={() => setTab('algebra')}>
          Hand work
        </button>
        <button role="tab" aria-selected={tab === 'build'} onClick={() => setTab('build')}>
          Build
        </button>
      </div>
      {tab === 'algebra' ? <HandWork game={game} /> : <BuildTab game={game} />}
      <PlayerInventory game={game} />
    </Sheet>
  );
}

function bladeName(blade: number) {
  return String(Multivector.blade(G3, blade)) || '1';
}

/** a blade cell: its icon and weight */
function BladeCell({ mv, onPointerDown, active, title, className = '' }: { mv: Multivector | null; onPointerDown?: (button: 'left' | 'right') => void; active?: boolean; title?: string; className?: string }) {
  const c = mv ? [...mv.terms.values()][0] : null;
  const unit = mv ? Multivector.blade(G3, [...mv.terms.keys()][0]) : null;
  return (
    <button
      className={`cell ${className}${!mv ? ' empty' : ''}${c && c.n < 0 ? ' negative' : ''}${active ? ' on' : ''}`}
      onPointerDown={(e) => {
        e.preventDefault();
        onPointerDown?.(e.button === 2 ? 'right' : 'left');
      }}
      onContextMenu={(e) => e.preventDefault()}
      title={title ?? (mv ? String(mv) : undefined)}
      aria-label={title ?? (mv ? String(mv) : 'empty')}
    >
      {unit && (
        <svg viewBox="-24 -24 48 48" aria-hidden="true">
          <ElementIcon mv={unit} />
        </svg>
      )}
      {c && !Q.eq(c, Q.ONE) && <span className="count">{Q.show(c).replace('-', '−')}</span>}
    </button>
  );
}

/** a crafting output: click takes the result onto the cursor (or stacks it there), shift-click sends it to the inventory */
function OutputSlot({ value, onTake, label }: { value: Multivector | null; onTake: (shift: boolean) => void; label: string }) {
  const s = value && !value.isZero() ? stackOf(value) : null;
  return (
    <button
      className={`slot big output${s ? ' ready' : ''}`}
      disabled={!s}
      onPointerDown={(e) => (e.preventDefault(), onTake(e.shiftKey))}
      onContextMenu={(e) => e.preventDefault()}
      aria-label={s ? `Take ${String(value)}` : label}
    >
      {s && <Icon item={s.item} />}
      {s && countLabel(s) && <span className="count">{countLabel(s)}</span>}
      {!s && <span className="slot-label">{label}</span>}
    </button>
  );
}

function HandWork({ game }: { game: Game }) {
  return (
    <div className="bench">
      <AddPanel game={game} />
      <MultiplyPanel game={game} />
    </div>
  );
}

function AddPanel({ game }: { game: Game }) {
  const tray = game.bench.tray;
  const drop = (e: ReactPointerEvent) => {
    if (!game.cursor) return;
    e.preventDefault();
    game.trayDrop(e.button === 2 ? 'right' : 'left');
  };
  return (
    <section className="panel add">
      <header>
        <h3>Add</h3>
        <span className="dim">Drop elements on the tray; their sum comes out on the right.</span>
      </header>
      <div className="craft-row">
        <div className={`tray${game.cursor?.item.kind === 'element' ? ' accepting' : ''}`} onPointerDown={drop} onContextMenu={(e) => e.preventDefault()} aria-label="Tray">
          {GRADE_CARD.map((row, r) => (
            <div key={r} className="tray-row">
              {row.map((blade) => {
                const c = tray.terms.get(blade);
                return c ? (
                  <BladeCell key={blade} mv={Multivector.blade(G3, blade, c)} title={`${Multivector.blade(G3, blade, c)}: click to take it back`} onPointerDown={(button) => !game.cursor && game.trayTake(blade, button)} />
                ) : (
                  <div key={blade} className="cell placeholder">
                    {bladeName(blade)}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <span className="arrow" aria-hidden="true">
          →
        </span>
        <div className="labelled">
          <OutputSlot value={tray} onTake={(shift) => game.trayOutput(shift)} label="sum" />
          <small>{tray.isZero() ? 'Sum' : String(tray)}</small>
        </div>
      </div>
    </section>
  );
}

const RULE_TELLS: Record<Rule, string> = {
  wedge: 'the wedge lets nothing cancel',
  dot: 'the dot needs every A tile (outlined) to cancel',
  geometric: 'the geometric product lets anything cancel',
};

function MultiplyPanel({ game }: { game: Game }) {
  const b = game.bench;
  const [a, bottom] = game.factors();
  const rule = b.rule;
  const learned = game.learned(rule);
  const left = a ? terms(a) : [];
  const right = bottom ? terms(bottom) : [];
  const nA = Math.max(1, left.length);
  const nB = Math.max(1, right.length);
  const result = game.benchResult();
  const known = (ta: Multivector, tb: Multivector) => learned || game.solvedByHand(rule, ta, tb);
  const unknown = left.flatMap((ta, i) => right.map((tb, j) => [i, j, known(ta, tb)] as const)).filter(([, , k]) => !k);
  const toLearn = SORTS_TO_LEARN - game.sorts[rule];

  let hint: ReactNode;
  if (!a || !bottom) hint = <>Put a multivector in <b>A</b> and another in <b>B</b>. Each square is one blade of A times one blade of B.</>;
  else if (learned) hint = <>You know the {RULE_NAMES[rule].toLowerCase()}, so every square fills in. Take the product from the output.</>;
  else if (unknown.length) hint = <>Tap a <b>?</b> square to work it out by hand. {toLearn} more sorted by hand and you know the {RULE_NAMES[rule].toLowerCase()}.</>;
  else hint = <>Every square is worked out, so the product is ready to take.</>;

  return (
    <section className="panel multiply">
      <header>
        <h3>Multiply</h3>
        <div className="rules" role="tablist" aria-label="Product">
          {RULES.map((r) => (
            <button key={r} role="tab" aria-selected={rule === r} disabled={!game.learnable(r)} onClick={() => game.setRule(r)}>
              <b>
                {RULE_SYMBOLS[r] || '·'} {RULE_NAMES[r]}
              </b>
              <small>{game.learned(r) ? 'known' : game.learnable(r) ? `${game.sorts[r]}/${SORTS_TO_LEARN} sorted` : `after the ${RULE_NAMES[RULES[RULES.indexOf(r) - 1]].toLowerCase()}`}</small>
            </button>
          ))}
        </div>
      </header>
      <p className="hint-line">{hint}</p>
      <div className="table-scroll">
        <div
          className="mtable"
          style={{ gridTemplateColumns: `auto repeat(${nB}, var(--cell)) auto auto auto`, gridTemplateRows: `auto repeat(${nA}, var(--cell)) auto` }}
        >
          <div className="labelled a-slot" style={{ gridColumn: 1, gridRow: 1 }}>
            <SlotView game={game} at={{ c: 'bench', field: 'left', i: 0 }} label="A" />
          </div>
          {Array.from({ length: nA }, (_, i) => (
            <div key={`a${i}`} style={{ gridColumn: 1, gridRow: i + 2 }} className="head">
              {left[i] ? <BladeCell mv={left[i]} className="factor" /> : <div className="cell placeholder">A</div>}
            </div>
          ))}
          {Array.from({ length: nA }, (_, i) =>
            Array.from({ length: nB }, (_, j) => {
              const ta = left[i];
              const tb = right[j];
              const style = { gridColumn: j + 2, gridRow: i + 2 };
              if (!ta || !tb) return <div key={`${i}-${j}`} className="cell placeholder" style={style} />;
              const active = b.rail?.cell[0] === i && b.rail?.cell[1] === j;
              if (!known(ta, tb))
                return (
                  <button key={`${i}-${j}`} style={style} className={`cell unknown${active ? ' on' : ''}`} onClick={() => game.openCell(i, j)} title={`${ta} times ${tb}: tap to work it out`}>
                    ?
                  </button>
                );
              const v = product(rule, ta, tb);
              return v.isZero() ? (
                <button key={`${i}-${j}`} style={style} className={`cell zero${active ? ' on' : ''}`} onClick={() => game.openCell(i, j)} title={`${ta} times ${tb} is 0`}>
                  0
                </button>
              ) : (
                <div key={`${i}-${j}`} style={style}>
                  <BladeCell mv={v} active={active} onPointerDown={() => game.openCell(i, j)} title={`${ta} times ${tb} is ${v}`} />
                </div>
              );
            }),
          )}
          <div className="corner" style={{ gridColumn: 1, gridRow: nA + 2 }} aria-hidden="true">
            {RULE_SYMBOLS[rule] || '·'}
          </div>
          {Array.from({ length: nB }, (_, j) => (
            <div key={`b${j}`} style={{ gridColumn: j + 2, gridRow: nA + 2 }} className="head">
              {right[j] ? <BladeCell mv={right[j]} className="factor" /> : <div className="cell placeholder">B</div>}
            </div>
          ))}
          <div className="labelled b-slot" style={{ gridColumn: nB + 2, gridRow: nA + 2 }}>
            <SlotView game={game} at={{ c: 'bench', field: 'bottom', i: 0 }} label="B" />
          </div>
          <span className="arrow" style={{ gridColumn: nB + 3, gridRow: `2 / span ${nA}` }} aria-hidden="true">
            →
          </span>
          <div className="labelled" style={{ gridColumn: nB + 4, gridRow: `2 / span ${nA}` }}>
            <OutputSlot value={result} onTake={(shift) => game.make(shift)} label={a && bottom ? '?' : 'A·B'} />
            <small>{result ? (result.isZero() ? '0' : String(result)) : 'Product'}</small>
          </div>
        </div>
      </div>
      <Sorter game={game} next={unknown[0] ? [unknown[0][0], unknown[0][1]] : null} />
    </section>
  );
}

/** the rail: one square worked out by hand, its tiles sorted into order with swaps and cancels */
function Sorter({ game, next }: { game: Game; next: [number, number] | null }) {
  const open = game.bench.rail;
  const rule = game.bench.rule;
  const learned = game.learned(rule);
  const [auto, setAuto] = useState(false);
  useEffect(() => {
    if (!auto || !open) return;
    if (sorted(open.rail)) return setAuto(false);
    const t = setTimeout(() => game.railTap(autoSort(open.rail)[0]), 450);
    return () => clearTimeout(t);
  }, [auto, open, game, game.version]);
  if (!open) return null;
  const r = open.rail;
  const done = sorted(r);
  const answer = game.railAnswer();
  const why = done ? railWhyZero(r, rule) : null;
  const [ba, bb] = open.pair;
  const toLearn = SORTS_TO_LEARN - game.sorts[rule];
  const ruleName = RULE_NAMES[rule].toLowerCase();
  return (
    <div className="sorter" role="group" aria-label="Sort this square">
      <div className="sorter-head">
        <b>
          {bladeName(ba)} × {bladeName(bb)}
        </b>
        <span className="dim">worked out by hand</span>
        <button className="small close" onClick={() => game.closeRail()} aria-label="Close">
          ✕
        </button>
      </div>
      {!done && (
        <p className="goal">
          Put the tiles in order, <b>e₁ then e₂ then e₃</b>. Tap between two tiles to <b>swap</b> them, which flips the sign, or to{' '}
          <b>cancel</b> two equal tiles, since e₁e₁ = 1. Here {RULE_TELLS[rule]}.
        </p>
      )}
      <div className="rail-row">
        <span className={`token${r.sign < 0 ? ' minus' : ''}`} aria-label={r.sign < 0 ? 'minus' : 'plus'}>
          {r.sign > 0 ? '+' : '−'}
        </span>
        {r.tiles.length === 0 && <span className="tile scalar">1</span>}
        {r.tiles.map((t, k) => {
          const action = k + 1 < r.tiles.length ? pairAction(r, k) : null;
          const useful = action === 'cancel' || (action === 'swap' && t.axis > r.tiles[k + 1].axis);
          return (
            <span key={k} className="rail-step">
              <span className={`tile axis${t.axis} from-${t.from}`}>e{['₁', '₂', '₃'][t.axis]}</span>
              {action && (
                <button className={`gap ${action}${useful && !done ? ' useful' : ''}`} disabled={done || auto} onClick={() => game.railTap(k)}>
                  <span aria-hidden="true">{action === 'cancel' ? '⨯' : '⇄'}</span>
                  <small>{action}</small>
                </button>
              )}
            </span>
          );
        })}
      </div>
      {!done && learned && (
        <button onClick={() => setAuto(true)} disabled={auto}>
          Sort it for me
        </button>
      )}
      {done && (
        <div className={`verdict${why ? ' zero' : ''}`}>
          <b>{why ? '= 0' : `= ${answer && answer.sign < 0 ? '−' : ''}${answer ? bladeName(answer.blade) : '1'}`}</b>
          <span>{why ?? 'times the weights of the two blades. The square is filled in.'}</span>
          {!learned && (
            <span className="dim">
              {r.moves === 0
                ? 'It was in order already, so it doesn’t count toward learning: try a square whose tiles are out of order.'
                : toLearn > 0
                  ? `${toLearn} more sorted by hand and you know the ${ruleName}.`
                  : `You know the ${ruleName} now.`}
            </span>
          )}
          {next && (
            <button className="primary" onClick={() => game.openCell(...next)}>
              Next square
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function BuildTab({ game }: { game: Game }) {
  return (
    <div className="recipes">
      {RECIPES.map((r) => {
        const ok = canBuild(game.inventory, r, game.learned);
        const missingRule = (r.learned ?? []).find((rule) => !game.learned(rule));
        return (
          <div key={itemName(r.makes)} className={`recipe${ok ? ' ok' : ''}`}>
            <Icon item={r.makes} size={56} />
            <div className="grow">
              <b>
                {itemName(r.makes)}
                {r.count > 1 ? ` × ${r.count}` : ''}
              </b>
              <div className="dim">{r.does}</div>
              <ul>
                {missingRule && <li className="missing">✗ learn {RULE_NAMES[missingRule]} on the rail first</li>}
                {r.needs.map((n) => {
                  const have = game.inventory.reduce((k, s) => k + (s && n.test(s.item) && s.count.n > 0 ? Math.floor(Q.toNumber(s.count)) : 0), 0);
                  return (
                    <li key={n.label} className={have >= n.count ? 'have' : 'missing'}>
                      {have >= n.count ? '✓' : '✗'} {n.count} × {n.label} <span className="dim">(have {have})</span>
                    </li>
                  );
                })}
              </ul>
            </div>
            <button className={ok ? 'primary' : ''} disabled={!ok} onClick={() => game.buildRecipe(r)}>
              Build
            </button>
          </div>
        );
      })}
    </div>
  );
}

// --- machines ----------------------------------------------------------------------------------

const VERB_DOES: Record<Verb, string> = {
  wedge: 'M ∧ X',
  dot: 'M ⌋ X',
  geometric: 'M X',
  sandwich: 'M X M̃ / (M M̃)',
  reverse: 'X̃',
  grade: 'the grades M has',
};

function cardDoes(c: Card) {
  if (c.verb === 'geometric' && c.right) return 'X M';
  return VERB_DOES[c.verb];
}

export function MachineScreen({ game }: { game: Game }) {
  const m = game.panelBlock;
  if (m?.kind !== 'machine' || !game.panel) return null;
  const [x, y, z] = game.panel;
  const title = MACHINE_NAMES[m.type];
  const icon = <Icon item={{ kind: 'machine', type: m.type }} size={28} />;
  const rotate = <button onClick={() => game.rotatePanel()}>Rotate (output faces {DIR_NAMES[m.facing]})</button>;
  const slot = (field: string, i = 0, label?: string) => <SlotView game={game} at={{ c: 'machine', field, i }} label={label} />;
  const recipe = RECIPES.find((r) => r.makes.kind === 'machine' && r.makes.type === m.type);
  const field = game.factory.field;
  const inField = !!field.regionAt(x, y, z);
  const notInField = <p className="callout">Not in a field: it does nothing until it stands among field plates, beside at least one of them.</p>;

  let body: ReactNode = null;
  switch (m.type) {
    case 'store':
      body = (
        <div className="grid">
          {m.slots.map((_, i) => (
            <SlotView key={i} game={game} at={{ c: 'machine', field: 'slots', i }} />
          ))}
        </div>
      );
      break;
    case 'press': {
      const preview = game.pressPreview();
      const bed = m.bed ? valueOf(m.bed) : null;
      body = (
        <>
          <div className="press">
            <div className="labelled">
              {slot('bed', 0, 'bed')}
              <small>Bed</small>
            </div>
            <div className="bed-card">{bed ? <svg viewBox="-24 -16 48 32"><GradeCard mv={bed} holes /></svg> : <span className="dim">put a multivector on the bed</span>}</div>
            <div className="labelled">
              {slot('plate', 0, 'plate')}
              <small>Verb plate</small>
            </div>
            <div className="labelled">
              {slot('blank', 0, 'blank')}
              <small>Blank cards</small>
            </div>
            <span className="op-sym">→</span>
            <div className="labelled">
              <button className="slot big" disabled={!preview} onPointerDown={(e) => (e.preventDefault(), game.press(e.shiftKey))} aria-label="Press a card">
                {preview && <Icon item={preview} />}
              </button>
              <small>Press</small>
            </div>
          </div>
          <p className="dim">
            {preview
              ? `Pressing makes a ${itemName(preview)}: it does ${cardDoes(preview)} to whatever a Mill feeds it. The bed is used up${preview.mv ? '' : ' (Reverse needs nothing on it)'}; the plate stays.`
              : 'A card needs a verb plate and a blank card, and a multivector on the bed for every verb but Reverse.'}
          </p>
        </>
      );
      break;
    }
    case 'mill': {
      const [d1, d2] = decks(m);
      const xv = m.x ? valueOf(m.x) : null;
      const lamps = Math.min(9, m.lamps);
      body = (
        <>
          <div className="mill">
            {[0, 1].map((deck) => (
              <div key={deck} className="deck">
                <small>Deck {deck + 1}</small>
                <div className="row">
                  {[0, 1].map((k) => {
                    const i = deck * 2 + k;
                    const c = m.cards[i]?.item;
                    return (
                      <div key={i} className="labelled">
                        {slot('cards', i, 'card')}
                        {c?.kind === 'card' && c.verb === 'geometric' && (
                          <button className="small" onClick={() => game.flipCard(i)}>
                            {c.right ? 'From the right ⟵' : 'From the left'}
                          </button>
                        )}
                        {c?.kind === 'card' && <small>{cardDoes(c)}</small>}
                      </div>
                    );
                  })}
                </div>
                <small className="dim">{deck === 0 ? 'side by side: outputs add' : 'runs on what deck 1 made'}</small>
              </div>
            ))}
            <div className="deck">
              <small>Live card from the side</small>
              <div className="row wrap">
                <button className={!m.live ? 'primary' : ''} onClick={() => game.setLive(null)}>
                  Off
                </button>
                {(['wedge', 'dot', 'geometric', 'sandwich'] as Verb[]).map((v) => (
                  <button key={v} className={m.live === v ? 'primary' : ''} onClick={() => game.setLive(v)}>
                    {VERB_NAMES[v]}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="machine-view">
            <div className="labelled">
              {slot('x', 0)}
              <small>Back</small>
            </div>
            {m.live && (
              <div className="labelled">
                {slot('side', 0)}
                <small>Side</small>
              </div>
            )}
            <div className="lamps" aria-label={`${lamps} lamps`}>
              {Array.from({ length: 9 }, (_, i) => (
                <span key={i} className={i < lamps ? (m.work > 0 && i < Math.floor((m.work / (m.lamps * 0.25)) * lamps) + 1 ? 'lamp on' : 'lamp') : 'lamp off'} />
              ))}
            </div>
            <span className="op-sym">→</span>
            <div className="labelled">
              {slot('out', 0)}
              <small>Out</small>
            </div>
          </div>
          <p className="dim">
            {xv
              ? `${xv} becomes ${millOutput(d1, d2, xv)}${m.live ? ' (plus the live card, once the side delivers)' : ''}.`
              : d1.length + d2.length
                ? `With these cards, e₁ would become ${millOutput(d1, d2, Multivector.e(G3, '1'))}.`
                : 'Put cards in the slots: an empty Mill passes things straight through.'}
          </p>
        </>
      );
      break;
    }
    case 'sorter':
      body = (
        <>
          <p>
            Sends <b>{sortLabel(m.mode, m.filter)}</b> out of its {m.side === 1 ? 'left' : 'right'}; everything else goes out of its front.
          </p>
          <h3>Matches</h3>
          <div className="row">
            {(['same', 'scalar', 'vector', 'bivector', 'trivector', 'state'] as SortMode[]).map((mode) => (
              <button key={mode} className={m.mode === mode ? 'primary' : ''} onClick={() => game.setSorter({ mode })}>
                {mode === 'same' ? 'Multiples of the sample' : sortLabel(mode, null)}
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
          <div className="row">
            <button disabled={game.cursor?.item.kind !== 'element'} onClick={() => game.setSorter({ sample: true })}>
              Use the held element as the sample
            </button>
            {m.filter && <span>sample: {String(m.filter)}</span>}
          </div>
          <p className="dim">Pick up an element from your inventory, then press the button. The sorter only looks at it, so you keep it.</p>
        </>
      );
      break;
    case 'charge':
    case 'wire':
    case 'antenna': {
      const isCharge = m.type === 'charge';
      body = (
        <>
          {!inField && notInField}
          <div className="machine-view">
            <div className="labelled">
              {slot('slot', 0, isCharge ? 'scalar' : 'vector')}
              <small>{isCharge ? 'Charge' : 'Current'}</small>
            </div>
          </div>
          <p className="dim">
            {isCharge
              ? scalarPart(m.slot) > 0
                ? 'Positive: E points away from it.'
                : scalarPart(m.slot) < 0
                  ? 'Negative: E points toward it.'
                  : 'No charge. Put a scalar in the slot or duct some in (up to 8 either way; −1 is e₁₂ e₁₂).'
              : upPart(m.slot)
                ? `A current of ${upPart(m.slot)} up the wire${m.type === 'antenna' ? ' at the peak of each swing' : ''}. While it runs up, B circles the wire anticlockwise, seen from above.`
                : 'No current. Put a vector with an e₃ part in the slot, such as e₃ or −e₃, or duct some in.'}
          </p>
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
        </>
      );
      break;
    }
    case 'probe': {
      const now = fieldText(field.at(x, y, z), 2);
      body = (
        <>
          {!inField && notInField}
          <div className="detail">
            Here now: E = <b>{now.e}</b>, IB = <b>{now.ib}</b>
          </div>
          <div className="machine-view">
            <div className="labelled">
              {slot('out', 0)}
              <small>Last reading, waiting to leave</small>
            </div>
          </div>
          <p className="dim">A reading is F = E + IB with each coefficient rounded to a half, recorded as its own item. A field too weak to round reads 0 and records nothing.</p>
        </>
      );
      break;
    }
    case 'detector':
    case 'orrery': {
      const a = m.a ? valueOf(m.a) : null;
      body = (
        <>
          <div className="machine-view">
            <div className="labelled">
              {slot('a', 0)}
              <small>In</small>
            </div>
            <span className="op-sym">→</span>
            <div className="labelled">
              {slot('out', 0)}
              <small>Out</small>
            </div>
          </div>
          {m.type === 'detector' && a && probUp(a) && <p className="dim">Up (e₃) with probability {Q.show(probUp(a)!)}, down (−e₃) otherwise.</p>}
          {m.type === 'orrery' && (
            <>
              <h3>Fibers shown</h3>
              {m.seen.length ? (
                <div className="stored">
                  {m.seen.map((r) => (
                    <div key={r.key()} className="held-slot">
                      <Icon item={{ kind: 'element', mv: r }} size={44} />
                      <span>{String(r)}</span>
                      <span className="dim">points {String(bloch(r))}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="dim">None yet. Each distinct state that passes through adds its Hopf fiber above the orrery.</p>
              )}
              <div className="row">
                <button disabled={!m.seen.length} onClick={() => game.clearOrrery()}>
                  Clear the fibers
                </button>
              </div>
            </>
          )}
        </>
      );
      break;
    }
    case 'generator':
      body = (
        <>
          <div className="machine-view">
            <div className="labelled">
              {slot('sample', 0, 'blade')}
              <small>Sample</small>
            </div>
            <span className="op-sym">→</span>
            <div className="labelled">
              {slot('out', 0)}
              <small>Waiting to leave</small>
            </div>
          </div>
          <p className="dim">
            Put one blade in the sample slot, such as e₁ or −e₁₂: the Generator makes another of it every 1.5 s and keeps the sample. A
            multivector of more than one blade won’t go in; pack generated blades with a Packer instead.
          </p>
        </>
      );
      break;
    case 'packer':
      body = (
        <>
          <div className="machine-view">
            {[1, 2, 3].map((r) => (
              <div key={r} className="labelled">
                {slot('slots', r)}
                <small>{['', 'Left', 'Back', 'Right'][r]}</small>
              </div>
            ))}
            <span className="op-sym">→</span>
            <div className="labelled">
              {slot('out', 0)}
              <small>Out</small>
            </div>
          </div>
          <p className="dim">It waits until every side that something feeds into has delivered, then adds them all.</p>
        </>
      );
      break;
    case 'unpacker':
      body = <p className="dim">{m.queue.length ? `${m.queue.length} blade${m.queue.length === 1 ? '' : 's'} still to send.` : 'Waiting for a multivector at its back.'}</p>;
      break;
    case 'splitter':
      body = <p className="dim">The next stack goes out of its {['front', 'left', 'back', 'right'][SPLIT_ORDER[m.next]]}. A side with nowhere to go is skipped.</p>;
      break;
    case 'merger':
      body = <p className="dim">Next it takes from the {['front', 'left', 'back', 'right'][MERGE_ORDER[m.next]]}. An empty input is skipped.</p>;
      break;
    case 'crossing':
      body = <p className="dim">Its rotation doesn’t matter: every side goes straight across.</p>;
      break;
  }

  return (
    <Sheet title={title} game={game} icon={icon}>
      {recipe && <p>{recipe.does}</p>}
      {body}
      {outputs(m).length > 0 && m.type !== 'crossing' && <div className="row">{rotate}</div>}
      <PlayerInventory game={game} />
    </Sheet>
  );
}

// --- goals -------------------------------------------------------------------------------------

const NODE_W = 188;
const NODE_H = 78;
const GAP_X = 40;
const GAP_Y = 12;

export function AchievementsScreen({ game }: { game: Game }) {
  const [open, setOpen] = useState<Achievement | null>(null);
  const earned = game.achievements.earned;
  const title = (id: string) => ACHIEVEMENTS.find((a) => a.id === id)!.title;

  return (
    <Sheet title="Goals" game={game} slots={false}>
      <p className="dim">
        A goal is met when the thing it names exists: in your inventory, in a Store, in a machine or placed in the world. Nothing is used up,
        and nothing is locked behind a goal. Each branch reads left to right; the goals within reach are lit, and the ones further on are dimmer.{' '}
        {earned.size} of {ACHIEVEMENTS.length} met.
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
                    const ahead = !game.achievements.reachable(b.a);
                    return (
                      <path
                        key={`${from}-${to}`}
                        d={`M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`}
                        className={`edge${lit ? ' lit' : ''}${ahead ? ' ahead' : ''}`}
                      />
                    );
                  })}
                </svg>
                {nodes.map((n) => {
                  const done = earned.has(n.a.id);
                  const ahead = !game.achievements.reachable(n.a);
                  return (
                    <button
                      key={n.a.id}
                      className={`node${done ? ' earned' : ''}${ahead ? ' ahead' : ''}${open?.id === n.a.id ? ' open' : ''}`}
                      style={{ left: x(n), top: y(n), width: NODE_W, height: NODE_H }}
                      onClick={() => setOpen(n.a)}
                    >
                      <b>{n.a.title}</b>
                      <span className="dim goal">{done ? 'Met' : n.a.goal}</span>
                      {n.outside.length > 0 && <span className="after">after {n.outside.map((o) => o.title).join(', ')}</span>}
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
            <div className="dim">{earned.has(open.id) ? 'Met' : `Goal: ${open.goal}`}</div>
            {open.parents.length > 0 && <div className="dim">Follows: {open.parents.map(title).join(', ')}</div>}
            <p>{open.lesson}</p>
          </div>
          <button onClick={() => setOpen(null)}>Close</button>
        </div>
      )}
    </Sheet>
  );
}

