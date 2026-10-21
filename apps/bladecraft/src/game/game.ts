// The game: owns the world, the player, the inventory and the cursor, the factory and achievements,
// runs the frame loop, and tells the React UI when something it shows has changed.
//
// Inventory handling follows Minecraft (slots.ts): the cursor carries a stack between slots, and
// every container screen (a Store, the Card Press, a Mill, a field source) shows its own slots above
// the player's. The Workbench is a workspace: what is put on it unfolds into its blades, and anything
// left on it goes back to the inventory when it closes, like Minecraft's crafting table.
import { G3, Multivector, Q } from '@codecraft/ga';
import { ACHIEVEMENTS, Achievements, type Holdings } from './achievements';
import { pressCard } from './cards';
import { Factory } from './factory';
import { fieldText, upPart, type Field } from './field';
import { guide } from './guide';
import {
  canMerge,
  itemName,
  merge,
  one,
  placeable,
  stack,
  stackOf,
  valueOf,
  loadSlots,
  savedName,
  saveSlots,
  type Item,
  type Stack,
  type Verb,
} from './items';
import { Player, raycast, type Hit } from './player';
import { RULES, newRail, product, railResult, sorted, tap, terms, bladeOf, type Rail, type Rule } from './products';
import { build, sortLabel, type Recipe } from './recipes';
import { Renderer } from './render';
import {
  HOTBAR,
  HOTBAR_RANGE,
  PICKUP_ORDER,
  SLOTS,
  STORAGE_RANGE,
  addTo,
  distribute,
  leftClick,
  quickMove,
  rightClick,
  type SlotRule,
  type Slots,
} from './slots';
import { DEPOSIT_BLADES, DIR_NAMES, STEP, World, blockName, contents, drop, newMachine, opposite, usable, type Block, type Dir, type Machine, type SortMode } from './world';

/** pointer lock returns a promise in newer browsers and nothing in older ones; either may refuse */
function lock(el: HTMLElement) {
  try {
    (el.requestPointerLock() as unknown as Promise<void> | undefined)?.catch?.(() => {});
  } catch {
    // not allowed here (e.g. in an iframe without permission): the game still runs, unlocked
  }
}

export type Screen = 'start' | 'play' | 'inventory' | 'workbench' | 'machine' | 'achievements';

const SAVE_KEY = 'bladecraft.save.v3';
/** hand sorts on the rail that learn a rule */
export const SORTS_TO_LEARN = 3;

export interface Toast {
  id: number;
  title: string;
  kind: 'achievement' | 'note';
}

export interface Prompt {
  /** what the crosshair is on */
  name: string;
  /** what the buttons would do, e.g. "Break: take one e₁" */
  actions: string[];
}

/** where a slot lives: the player's inventory, a field of the open machine, or a Workbench edge */
export type SlotRef = { c: 'inv'; i: number } | { c: 'machine'; field: string; i: number } | { c: 'bench'; field: 'left' | 'bottom'; i: 0 };

/** the open machine's slots, as the panel lays them out */
export interface ContainerPart {
  field: string;
  label: string;
  /** an array field (a Store's slots, a Mill's cards) or a single slot */
  size: number;
  rule?: SlotRule;
}

const isElement = (i: Item) => i.kind === 'element';
const ofGrade = (g: string) => (i: Item) => i.kind === 'element' && i.mv.grades().join() === g;

export class Game {
  world: World;
  player = new Player();
  inventory: Slots = Array(SLOTS).fill(null);
  /** the stack on the mouse (or finger), carried between slots */
  cursor: Stack | null = null;
  achievements = new Achievements();
  factory: Factory;
  /** hand sorts done on the rail under each rule */
  sorts: Record<Rule, number> = { wedge: 0, dot: 0, geometric: 0 };
  selected = 0;
  screen: Screen = 'start';
  target: Hit | null = null;
  toasts: Toast[] = [];
  /** quarter turns added to the player's facing when placing */
  turn = 0;
  /** the machine whose panel is open */
  panel: [number, number, number] | null = null;
  /** what's on the Workbench while it's open */
  bench: { tray: Multivector; left: Stack | null; bottom: Stack | null; rule: Rule; rail: { cell: [number, number]; rail: Rail } | null } = {
    tray: Multivector.zero(G3),
    left: null,
    bottom: null,
    rule: 'wedge',
    rail: null,
  };
  readonly touch = matchMedia('(pointer: coarse)').matches;

  private renderer: Renderer;
  private listeners = new Set<() => void>();
  version = 0;
  private keys = new Set<string>();
  /** touch joystick, −1..1 */
  stick = { forward: 0, right: 0 };
  wantJump = false;
  private dirty = false;
  private lastSave = 0;
  private lastCheck = 0;
  private toastId = 0;
  private promptKey = '';
  prompt: Prompt | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas);
    this.world = World.generate();
    this.factory = new Factory(this.world);
    if (!this.load()) this.fresh();
    this.bindInput(canvas);
    addEventListener('resize', this.resize);
    addEventListener('pagehide', () => this.save());
    this.resize();
    let last = performance.now();
    this.renderer.renderer.setAnimationLoop((now) => {
      // the factory keeps real time on a slow device; movement steps are kept short so collisions hold
      const elapsed = Math.min((now - last) / 1000, 0.25);
      last = now;
      this.frame(elapsed, now);
    });
  }

  // --- React glue ------------------------------------------------------------------------------

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getVersion = () => this.version;
  changed() {
    this.version++;
    this.dirty = true;
    this.listeners.forEach((f) => f());
  }

  get guide() {
    return guide({ world: this.world, inventory: this.inventory, achievements: this.achievements });
  }

  learned = (rule: Rule) => this.sorts[rule] >= SORTS_TO_LEARN;

  /** a rule can be learned once the one before it is: the wedge, then the dot, then the geometric product */
  learnable = (rule: Rule) => rule === 'wedge' || this.learned(RULES[RULES.indexOf(rule) - 1]);

  // --- world lifecycle -------------------------------------------------------------------------

  private makeFactory() {
    return new Factory(this.world, {});
  }

  private fresh() {
    this.world = World.generate();
    this.inventory = Array(SLOTS).fill(null);
    this.inventory[0] = stack({ kind: 'workbench' });
    this.inventory[1] = stack({ kind: 'lattice' }, 32);
    this.cursor = null;
    this.achievements = new Achievements();
    this.sorts = { wedge: 0, dot: 0, geometric: 0 };
    this.player = new Player();
    this.selected = 0;
    this.turn = 0;
    this.factory = this.makeFactory();
  }

  newWorld() {
    this.fresh();
    this.save();
    this.changed();
  }

  private load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const s = JSON.parse(raw);
      this.world = World.load(s.world);
      this.inventory = loadSlots(s.inventory, SLOTS);
      this.achievements.load(s.achievements ?? []);
      this.sorts = { wedge: 0, dot: 0, geometric: 0 };
      for (const [rule, n] of Object.entries(s.sorts ?? {})) this.sorts[savedName(rule) as Rule] = n as number;
      this.player.pos.set(...(s.player.pos as [number, number, number]));
      this.player.yaw = s.player.yaw;
      this.player.pitch = s.player.pitch;
      this.selected = s.selected ?? 0;
      this.factory = this.makeFactory();
      return true;
    } catch {
      return false;
    }
  }

  save() {
    try {
      // a stack on the cursor or the Workbench is the player's: it's saved in the inventory
      const inventory = [...this.inventory];
      for (const s of [this.cursor, this.bench.left, this.bench.bottom, stackOf(this.bench.tray)]) addTo(inventory, s, PICKUP_ORDER);
      localStorage.setItem(
        SAVE_KEY,
        JSON.stringify({
          world: this.world.save(),
          inventory: saveSlots(inventory),
          achievements: this.achievements.save(),
          sorts: this.sorts,
          player: { pos: this.player.pos.toArray(), yaw: this.player.yaw, pitch: this.player.pitch },
          selected: this.selected,
        }),
      );
      this.dirty = false;
    } catch {
      // storage full or blocked: the game keeps going, unsaved
    }
  }

  // --- goals and toasts ------------------------------------------------------------------------

  /** everything the goals look at: what you carry, what Stores and machines hold, what's placed */
  holdings(): Holdings {
    const stacks: Stack[] = [];
    const machines: Machine[] = [];
    let workbenchPlaced = false;
    for (const s of this.inventory) if (s) stacks.push(s);
    for (const s of [this.cursor, this.bench.left, this.bench.bottom, stackOf(this.bench.tray)]) if (s) stacks.push(s);
    for (const [, , , b] of this.world.entries()) {
      if (b.kind === 'workbench') workbenchPlaced = true;
      if (b.kind !== 'machine') continue;
      machines.push(b);
      stacks.push(...contents(b));
    }
    return { stacks, machines, workbenchPlaced, learned: { wedge: this.learned('wedge'), dot: this.learned('dot'), geometric: this.learned('geometric') } };
  }

  private checkGoals() {
    const fresh = this.achievements.check(this.holdings());
    for (const a of fresh) this.toast(a.title, 'achievement');
    if (fresh.length) this.changed();
  }

  toast(title: string, kind: Toast['kind'] = 'note') {
    const id = ++this.toastId;
    this.toasts = [...this.toasts, { id, title, kind }];
    setTimeout(() => {
      this.toasts = this.toasts.filter((t) => t.id !== id);
      this.changed();
    }, kind === 'note' ? 3500 : 5000);
    this.changed();
  }

  // --- screens ---------------------------------------------------------------------------------

  open(screen: Screen) {
    const leaving = this.screen;
    this.screen = screen;
    if (screen !== 'play' && document.pointerLockElement) document.exitPointerLock();
    if (leaving === 'workbench' && screen !== 'workbench') this.clearBench();
    if (screen !== 'machine') this.panel = null;
    // closing a screen puts whatever is on the cursor back in the inventory
    if (screen === 'play' || screen === 'start') this.cursor = addTo(this.inventory, this.cursor, PICKUP_ORDER);
    this.keys.clear();
    this.stick = { forward: 0, right: 0 };
    this.wantJump = false;
    this.changed();
  }

  /** on a desktop, whether the mouse is turning the view (pointer locked) rather than free for the buttons */
  get looking() {
    return !this.touch && document.pointerLockElement === this.renderer.renderer.domElement;
  }

  play(canvas?: HTMLCanvasElement) {
    this.open('play');
    if (!this.touch) lock(canvas ?? this.renderer.renderer.domElement);
  }

  select(slot: number) {
    this.selected = ((slot % HOTBAR) + HOTBAR) % HOTBAR;
    this.changed();
  }

  get held(): Item | null {
    return this.inventory[this.selected]?.item ?? null;
  }

  // --- acting on the world ---------------------------------------------------------------------

  get targetBlock(): Block | undefined {
    return this.target ? this.world.get(...this.target.block) : undefined;
  }

  /** gives the player a stack; what doesn't fit is lost, with a note */
  private give(s: Stack | null) {
    const rest = addTo(this.inventory, s, PICKUP_ORDER);
    if (rest) this.toast(`No room for ${itemName(rest.item)}`);
  }

  breakBlock() {
    const t = this.target;
    const b = this.targetBlock;
    if (!t || !b) return;
    this.world.set(...t.block, null);
    this.give(drop(b));
    if (b.kind === 'machine') for (const s of contents(b)) this.give(s);
    this.changed();
  }

  /** right click or the Use button: open a usable block, otherwise place the held item */
  use() {
    const b = this.targetBlock;
    if (b && usable(b)) {
      if (b.kind === 'workbench') return this.open('workbench');
      this.panel = this.target!.block;
      return this.open('machine');
    }
    this.place();
  }

  /** where and which way the held item would go, and whether it can */
  placement(): { cell: [number, number, number]; facing: Dir | null; ok: boolean } | null {
    const t = this.target;
    const item = this.held;
    if (!t || !item || !placeable(item)) return null;
    const cell = t.before;
    const ok = !this.world.solid(...cell) && !this.player.occupies(...cell) && cell[1] < 31;
    if (item.kind !== 'machine') return { cell, facing: null, ok };
    return { cell, facing: this.facingFor(), ok };
  }

  private facingFor(): Dir {
    return ((this.player.facing() + this.turn) % 4) as Dir;
  }

  place() {
    const p = this.placement();
    const item = this.held;
    if (!p || !item) {
      if (item && !placeable(item)) this.toast(`${itemName(item)} can't be placed. Open a Store or a machine to put it in.`);
      return;
    }
    if (!p.ok) return;
    const s = this.inventory[this.selected]!;
    const left = Q.add(s.count, Q.q(-1));
    this.inventory[this.selected] = Q.isZero(left) ? null : { item: s.item, count: left };
    const block: Block = item.kind === 'machine' ? newMachine(item.type, p.facing!) : (item as Block);
    this.world.set(...p.cell, block);
    this.changed();
  }

  rotate() {
    this.turn = (this.turn + 1) % 4;
    this.changed();
  }

  // --- slots: the Minecraft way ----------------------------------------------------------------

  get panelBlock(): Block | undefined {
    return this.panel ? this.world.get(...this.panel) : undefined;
  }

  /** the open machine's slots */
  containerParts(): ContainerPart[] {
    const m = this.panelBlock;
    if (m?.kind !== 'machine') return [];
    const out: SlotRule = { output: true };
    switch (m.type) {
      case 'store':
        return [{ field: 'slots', label: 'Store', size: m.slots.length }];
      case 'mill':
        return [
          { field: 'cards', label: 'Cards', size: m.cards.length, rule: { accepts: (i) => i.kind === 'card' } },
          { field: 'x', label: 'At the back', size: 1, rule: out },
          { field: 'side', label: 'At the side', size: 1, rule: out },
          { field: 'out', label: 'Out', size: 1, rule: out },
        ];
      case 'press':
        return [
          { field: 'bed', label: 'Bed', size: 1, rule: { accepts: isElement } },
          { field: 'plate', label: 'Verb plate', size: 1, rule: { accepts: (i) => i.kind === 'plate' } },
          { field: 'blank', label: 'Blank cards', size: 1, rule: { accepts: (i) => i.kind === 'blank' } },
        ];
      case 'charge':
        return [{ field: 'slot', label: 'Charge', size: 1, rule: { accepts: ofGrade('0') } }];
      case 'wire':
      case 'antenna':
        return [{ field: 'slot', label: 'Current', size: 1, rule: { accepts: ofGrade('1') } }];
      case 'generator':
        return [
          { field: 'sample', label: 'Sample', size: 1, rule: { accepts: (i) => i.kind === 'element' && i.mv.terms.size === 1 } },
          { field: 'out', label: 'Out', size: 1, rule: out },
        ];
      case 'probe':
        return [{ field: 'out', label: 'Out', size: 1, rule: out }];
      case 'detector':
      case 'orrery':
        return [
          { field: 'a', label: 'In', size: 1, rule: out },
          { field: 'out', label: 'Out', size: 1, rule: out },
        ];
      case 'packer':
        return [
          { field: 'slots', label: 'In', size: 4, rule: out },
          { field: 'out', label: 'Out', size: 1, rule: out },
        ];
      default:
        return [];
    }
  }

  /** the array a slot lives in, and how to write a single-slot field back */
  private resolve(ref: SlotRef): { arr: Slots; commit: () => void; rule?: SlotRule } | null {
    if (ref.c === 'inv') return { arr: this.inventory, commit: () => {} };
    if (ref.c === 'bench') {
      const arr = [this.bench[ref.field]];
      return { arr, commit: () => (this.bench[ref.field] = arr[0]), rule: { accepts: isElement } };
    }
    const m = this.panelBlock as unknown as Record<string, unknown> | undefined;
    const part = this.containerParts().find((p) => p.field === ref.field);
    if (!m || !part) return null;
    const v = m[ref.field];
    if (Array.isArray(v)) return { arr: v as Slots, commit: () => {}, rule: part.rule };
    const arr = [v as Stack | null];
    return { arr, commit: () => (m[ref.field] = arr[0]), rule: part.rule };
  }

  /** a left or right click on a slot; with shift, a quick move to the other side */
  click(ref: SlotRef, button: 'left' | 'right', shift = false) {
    const r = this.resolve(ref);
    if (!r) return;
    if (shift) this.quickMove(ref, r.arr, ref.i);
    else this.cursor = (button === 'left' ? leftClick : rightClick)(r.arr, ref.i, this.cursor, r.rule);
    r.commit();
    this.changed();
  }

  private quickMove(ref: SlotRef, arr: Slots, i: number) {
    if (ref.c !== 'inv') return quickMove(arr, i, this.inventory, PICKUP_ORDER);
    // from the inventory: into the open machine or Workbench edge that takes it, else hotbar ↔ storage
    if (this.screen === 'machine') {
      for (const part of this.containerParts()) {
        if (part.rule?.output) continue;
        const target = this.resolve({ c: 'machine', field: part.field, i: 0 })!;
        quickMove(arr, i, target.arr, undefined, part.rule);
        target.commit();
        if (!arr[i]) return;
      }
      return;
    }
    if (this.screen === 'workbench') {
      for (const field of ['left', 'bottom'] as const) {
        if (this.bench[field] || !arr[i] || !isElement(arr[i]!.item)) continue;
        this.bench[field] = arr[i];
        arr[i] = null;
        return;
      }
      return;
    }
    quickMove(arr, i, this.inventory, i < HOTBAR ? STORAGE_RANGE : HOTBAR_RANGE);
  }

  /** the end of a drag across slots with a full cursor */
  spread(refs: SlotRef[], mode: 'even' | 'one') {
    if (!this.cursor || !refs.length) return;
    // a drag stays within one array
    const r = this.resolve(refs[0]);
    if (!r) return;
    this.cursor = distribute(r.arr, refs.map((x) => x.i), this.cursor, mode, r.rule);
    r.commit();
    this.changed();
  }

  /** a number key over a slot: swap it with that hotbar slot */
  swapWithHotbar(ref: SlotRef, n: number) {
    const r = this.resolve(ref);
    if (!r || n < 0 || n >= HOTBAR) return;
    const here = r.arr[ref.i];
    const there = this.inventory[n];
    if (there && r.rule && (r.rule.output || (r.rule.accepts && !r.rule.accepts(there.item)))) return;
    r.arr[ref.i] = there;
    this.inventory[n] = here;
    r.commit();
    this.changed();
  }

  stackAt(ref: SlotRef): Stack | null {
    return this.resolve(ref)?.arr[ref.i] ?? null;
  }

  // --- the Workbench ---------------------------------------------------------------------------

  private clearBench() {
    for (const s of [this.bench.left, this.bench.bottom, stackOf(this.bench.tray), this.cursor]) this.give(s);
    this.cursor = null;
    this.bench = { tray: Multivector.zero(G3), left: null, bottom: null, rule: this.bench.rule, rail: null };
  }

  /** drop the cursor on the tray: all of it (left) or one unit (right); it adds to whatever is there */
  trayDrop(button: 'left' | 'right') {
    if (!this.cursor || !isElement(this.cursor.item)) return;
    const part = button === 'left' ? { taken: this.cursor, rest: null } : one(this.cursor);
    this.bench.tray = this.bench.tray.add(valueOf(part.taken)!);
    this.cursor = part.rest;
    this.changed();
  }

  /** take one term off the tray onto the cursor: all of it (left) or one unit (right); it stacks onto a matching cursor */
  trayTake(blade: number, button: 'left' | 'right') {
    const c = this.bench.tray.terms.get(blade);
    if (!c) return;
    const term = stackOf(Multivector.blade(G3, blade, c))!;
    const taken = button === 'left' ? term : one(term).taken;
    if (this.cursor) {
      if (!canMerge(this.cursor, taken)) return;
      const m = merge(this.cursor, taken);
      if (m.rest) return;
      this.cursor = m.target;
    } else this.cursor = taken;
    this.bench.tray = this.bench.tray.sub(valueOf(taken)!);
    this.changed();
  }

  /** take the whole tray, packed into one item */
  trayTakeAll() {
    const s = stackOf(this.bench.tray);
    if (!s) return;
    if (this.cursor) return this.trayDrop('left');
    this.cursor = s;
    this.bench.tray = Multivector.zero(G3);
    this.changed();
  }

  setRule(rule: Rule) {
    this.bench.rule = rule;
    this.bench.rail = null;
    this.changed();
  }

  /** the two factors as multivectors */
  factors(): [Multivector | null, Multivector | null] {
    return [this.bench.left ? valueOf(this.bench.left) : null, this.bench.bottom ? valueOf(this.bench.bottom) : null];
  }

  /** what MAKE gives under the current rule, or null when it can't make anything yet */
  benchResult(): Multivector | null {
    const [a, b] = this.factors();
    if (!a || !b || !this.learned(this.bench.rule)) return null;
    return product(this.bench.rule, a, b);
  }

  /** stack the grid into one result and put it on the cursor, using up both factors */
  make(shift = false) {
    const r = this.benchResult();
    if (r === null) return;
    const s = stackOf(r);
    this.bench.left = null;
    this.bench.bottom = null;
    this.bench.rail = null;
    if (s) {
      if (shift || this.cursor) this.give(s);
      else this.cursor = s;
    } else this.toast('Every cell was 0, so nothing is made.');
    this.changed();
  }

  /** open one cell of the grid on the rail */
  openCell(i: number, j: number) {
    const [a, b] = this.factors();
    if (!a || !b) return;
    const ta = terms(a)[i];
    const tb = terms(b)[j];
    if (!ta || !tb) return;
    this.bench.rail = { cell: [i, j], rail: newRail(bladeOf(ta), bladeOf(tb)) };
    this.changed();
  }

  /** tap the pair at k on the rail; a cell sorted by hand under a rule still being learned counts toward it */
  railTap(k: number) {
    const open = this.bench.rail;
    if (!open || sorted(open.rail)) return;
    open.rail = tap(open.rail, k);
    if (sorted(open.rail)) {
      const rule = this.bench.rule;
      // learning a rule is a goal of its own, so the goals announce it
      if (!this.learned(rule) && this.learnable(rule)) this.sorts[rule]++;
    }
    this.changed();
  }

  /** the open rail's answer, once it is sorted */
  railAnswer() {
    const open = this.bench.rail;
    if (!open || !sorted(open.rail)) return null;
    return railResult(open.rail, this.bench.rule);
  }

  buildRecipe(r: Recipe) {
    const rest = build(this.inventory, r, this.learned);
    if (rest === false) return;
    this.give(rest);
    this.toast(`Built ${r.count > 1 ? `${r.count} × ` : ''}${itemName(r.makes)}`);
    this.changed();
  }

  // --- machine panels --------------------------------------------------------------------------

  /** the card the open Card Press would make now, or null */
  pressPreview() {
    const m = this.panelBlock;
    if (m?.kind !== 'machine' || m.type !== 'press' || !m.blank) return null;
    const verb = m.plate?.item.kind === 'plate' ? m.plate.item.verb : null;
    return pressCard(verb, m.bed ? valueOf(m.bed) : null);
  }

  /** press: uses up what's on the bed and one blank card; the plate stays */
  press(shift = false) {
    const m = this.panelBlock;
    const c = this.pressPreview();
    if (!c || m?.kind !== 'machine' || m.type !== 'press') return;
    const made: Stack = { item: c, count: Q.ONE };
    if (!shift && this.cursor && !(this.cursor.item.kind === 'card' && JSON.stringify(this.cursor.item) === JSON.stringify(c))) return;
    if (c.mv) m.bed = null;
    const blanks = Q.add(m.blank!.count, Q.q(-1));
    m.blank = Q.isZero(blanks) ? null : { item: m.blank!.item, count: blanks };
    if (shift) this.give(made);
    else this.cursor = this.cursor ? { item: c, count: Q.add(this.cursor.count, Q.ONE) } : made;
    this.changed();
  }

  setLive(verb: Verb | null) {
    const m = this.panelBlock;
    if (m?.kind !== 'machine' || m.type !== 'mill') return;
    m.live = verb;
    if (!verb && m.side) {
      this.give(m.side);
      m.side = null;
    }
    this.changed();
  }

  /** turn a card in a Mill slot end to end, so a Geometric card multiplies from the right */
  flipCard(i: number) {
    const m = this.panelBlock;
    if (m?.kind !== 'machine' || m.type !== 'mill') return;
    const s = m.cards[i];
    if (s?.item.kind !== 'card') return;
    m.cards[i] = { item: { ...s.item, right: !s.item.right }, count: s.count };
    this.changed();
  }

  /** configure the open sorter: what it matches, its sample (copied from the cursor, not used up), and its side */
  setSorter(change: { mode?: SortMode; sample?: boolean; side?: 1 | 3 }) {
    const m = this.panelBlock;
    if (m?.kind !== 'machine' || m.type !== 'sorter') return;
    if (change.mode) m.mode = change.mode;
    if (change.side) m.side = change.side;
    if (change.sample && this.cursor?.item.kind === 'element') {
      m.filter = this.cursor.item.mv;
      m.mode = 'same';
    }
    this.changed();
  }

  setFrequency(i: number) {
    const m = this.panelBlock;
    if (m?.kind !== 'machine' || m.type !== 'antenna') return;
    m.frequency = i;
    this.changed();
  }

  clearOrrery() {
    const m = this.panelBlock;
    if (m?.kind !== 'machine' || m.type !== 'orrery') return;
    m.seen = [];
    this.changed();
  }

  rotatePanel() {
    const m = this.panelBlock;
    if (m?.kind !== 'machine' || !this.panel) return;
    m.facing = ((m.facing + 1) % 4) as Dir;
    this.world.set(...this.panel, m); // re-set so the renderer redraws it
    this.changed();
  }

  // --- frame -----------------------------------------------------------------------------------

  private frame(elapsed: number, now: number) {
    const dt = Math.min(elapsed, 0.05);
    if (this.screen === 'play') {
      const move = {
        forward: (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0) + this.stick.forward,
        right: (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0) + this.stick.right,
      };
      this.player.step(this.world, dt, move, this.keys.has('Space') || this.wantJump);
    }
    this.factory.step(elapsed);
    const eye = this.player.eye();
    this.renderer.camera.position.copy(eye);
    this.renderer.camera.lookAt(eye.clone().add(this.player.look()));
    this.target = raycast(this.world, eye, this.player.look());
    this.renderer.select(this.target?.block ?? null);
    const p = this.screen === 'play' ? this.placement() : null;
    this.renderer.preview(p?.cell ?? null, p?.facing ?? null, p?.ok ?? false);
    this.updatePrompt(p);
    this.renderer.sync(this.world, this.factory.field);
    this.renderer.render(dt);
    if (now - this.lastCheck > 1000) {
      this.lastCheck = now;
      this.checkGoals();
    }
    // open panels show live contents
    if (this.screen === 'machine' && Math.floor(now / 250) !== Math.floor((now - dt * 1000) / 250)) this.changed();
    if (this.dirty && now - this.lastSave > 5000) {
      this.lastSave = now;
      this.save();
    }
  }

  private updatePrompt(p: ReturnType<Game['placement']>) {
    const b = this.targetBlock;
    let prompt: Prompt | null = null;
    if (b) {
      const actions: string[] = [b.kind === 'deposit' ? `Break: breaks into ${DEPOSIT_BLADES} × ${b.mv}` : 'Break: pick up'];
      if (usable(b)) actions.push('Use: open');
      const item = this.held;
      if (p && item) actions.push(`Place: ${itemName(item)}${p.facing !== null ? ` facing ${DIR_NAMES[p.facing]}` : ''}`);
      prompt = { name: describeBlock(b, this.world, this.target!.block, this.factory.field), actions };
    }
    // the touch buttons read the target and placement too, so a new block that reads the same (the
    // bottom of a deposit after breaking its top) still has to redraw them
    const key = JSON.stringify([prompt, this.target?.block, p?.cell, p?.ok]);
    if (key !== this.promptKey) {
      this.promptKey = key;
      this.prompt = prompt;
      this.changed();
    }
  }

  // --- input -----------------------------------------------------------------------------------

  private resize = () => this.renderer.resize(innerWidth, innerHeight);

  private bindInput(canvas: HTMLCanvasElement) {
    addEventListener('keydown', (e) => {
      if (e.code === 'KeyE') return this.open(this.screen === 'inventory' ? 'play' : this.screen === 'play' ? 'inventory' : 'play');
      if (e.code === 'KeyL') return this.open(this.screen === 'achievements' ? 'play' : 'achievements');
      if (e.code === 'Escape' && this.screen !== 'play' && this.screen !== 'start') return this.play();
      if (this.screen !== 'play') return;
      if (/^Digit[1-9]$/.test(e.code)) this.select(Number(e.code.slice(5)) - 1);
      if (e.code === 'KeyR') this.rotate();
      this.keys.add(e.code);
      if (e.code === 'Space') e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('click', () => {
      if (!this.touch && this.screen === 'play' && !document.pointerLockElement) lock(canvas);
    });
    // Esc frees the mouse for the buttons without leaving the game; clicking the world takes it back
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement) this.keys.clear();
      this.changed();
    });
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== canvas) return;
      this.turnView(e.movementX * 0.0025, e.movementY * 0.0025);
    });
    canvas.addEventListener('mousedown', (e) => {
      if (document.pointerLockElement !== canvas) return;
      if (e.button === 0) this.breakBlock();
      if (e.button === 2) {
        if (e.shiftKey) this.place();
        else this.use();
      }
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener(
      'wheel',
      (e) => {
        if (this.screen === 'play') this.select(this.selected + Math.sign(e.deltaY));
      },
      { passive: true },
    );
  }

  /** look by an amount of radians (mouse or touch drag) */
  turnView(dx: number, dy: number) {
    this.player.yaw -= dx;
    this.player.pitch = Math.max(-1.55, Math.min(1.55, this.player.pitch - dy));
  }

  /** for tests and the console */
  get state() {
    return {
      pos: this.player.pos.toArray().map((v) => +v.toFixed(2)),
      target: this.target?.block ?? null,
      held: this.held ? itemName(this.held) : null,
      goals: this.achievements.earned.size + ' of ' + ACHIEVEMENTS.length,
    };
  }
}


/** what the crosshair shows for a block: its name and, for machines, what it holds or lacks */
function describeBlock(b: Block, world: World, at: [number, number, number], field: Field) {
  const name = blockName(b);
  if (b.kind !== 'machine') return name;
  // a plate's facing means nothing; what it shows is the field there
  if (b.type === 'plate') return `${name} · ${field.regionAt(...at) ? `E ${fieldText(field.at(...at)).e} · IB ${fieldText(field.at(...at)).ib}` : 'no field'}`;
  return `${name} facing ${DIR_NAMES[b.facing]}${machineNote(b, world, at, field)}`;
}

function machineNote(m: Machine, world: World, [x, y, z]: [number, number, number], field: Field) {
  const inField = !!field.regionAt(x, y, z);
  const holds = (s: Stack | null) => (s ? (s.item.kind === 'element' ? String(valueOf(s)) : itemName(s.item)) : 'nothing');
  switch (m.type) {
    case 'generator':
      return m.sample ? ` · makes ${holds({ item: m.sample.item, count: Q.q(Math.sign(m.sample.count.n)) })}` : ' · no sample';
    case 'store':
      return ` · ${m.slots.filter(Boolean).length} of ${m.slots.length} slots used`;
    case 'sorter':
      return ` · sends ${sortLabel(m.mode, m.filter)} ${m.side === 1 ? 'left' : 'right'}`;
    case 'mill': {
      const n = m.cards.filter((s) => s?.item.kind === 'card').length;
      return ` · ${n} card${n === 1 ? '' : 's'}${m.live ? ` · live ${m.live} at the side` : ''}`;
    }
    case 'press':
      return ` · bed ${holds(m.bed)}`;
    case 'charge':
      return inField ? ` · charge ${holds(m.slot)}` : ' · not in a field';
    case 'wire':
    case 'antenna':
      return inField ? ` · current ${upPart(m.slot)}e₃` : ' · not in a field';
    case 'probe':
      return inField ? ` · reads ${m.reading ?? 'nothing yet'}` : ' · not in a field';
    case 'orrery':
      return ` · ${m.seen.length} fiber${m.seen.length === 1 ? '' : 's'} shown`;
    case 'detector':
      return ` · ${m.a ? `measuring ${holds(m.a)}` : 'waiting for a state'}`;
    default:
      return '';
  }
}

