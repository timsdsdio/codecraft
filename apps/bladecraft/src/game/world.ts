// The voxel world: a bounded grid of blocks.
//   lattice    the inert building material the ground is made of
//   deposit    a never-ending source of one raw element (e₁, e₂, e₃ or the scalar 1); breaking it
//              by hand gives one element and leaves it in place, and an extractor draws on it forever
//   bench      the hand bench: combine elements by hand and build machines
//   hub        the factory's goal, at spawn: it takes delivered elements toward its current order
//   machine    extractors, ducts, collectors, operation machines and field blocks; each faces one
//              of four directions and holds what is passing through it (see factory.ts and field.ts)
//
// World axes follow three.js (x east, y up, z south); algebra axes are e₁ east, e₂ north, e₃ up, a
// right-handed set, so the arrow drawn for e₁ points the way you walk to go east.
import type { Multivector } from '@codecraft/ga';
import { el, loadMv, saveMv, scalar, MACHINE_NAMES, type Item, type MachineType, type SavedMv } from './items.ts';
import type { GateId } from './qubit.ts';

/** 0 east (+x), 1 north (−z), 2 west (−x), 3 south (+z): counter-clockwise from above */
export type Dir = 0 | 1 | 2 | 3;
export const STEP: Record<Dir, [number, number]> = { 0: [1, 0], 1: [0, -1], 2: [-1, 0], 3: [0, 1] };
export const opposite = (d: Dir) => ((d + 2) % 4) as Dir;
export const DIR_NAMES = ['east', 'north', 'west', 'south'] as const;

/** an element riding a duct: t runs from 0 (just entered) to 1 (at the far end) */
export interface Carried {
  id: number;
  mv: Multivector;
  t: number;
  /** the side it came in from, for drawing the turn */
  from: Dir | null;
}

export type MachineState =
  | { type: 'duct'; item: Carried | null }
  | { type: 'extractor'; timer: number; out: Carried | null }
  | { type: 'collector'; stored: { mv: Multivector; count: number }[] }
  | ({ type: 'adder' | 'wedger' | 'multiplier' | 'sandwich' | 'gate' | 'bloch' | 'detector' } & Inputs)
  | ({ type: 'orrery'; seen: Multivector[] } & Inputs)
  // logistics: these only move elements around
  | { type: 'splitter'; item: Multivector | null; next: number }
  | { type: 'merger'; slots: (Multivector | null)[]; next: number }
  | { type: 'sorter'; item: Multivector | null; filter: Multivector | null; mode: SortMode; side: 1 | 3 }
  | { type: 'crossing'; slots: (Multivector | null)[] }
  // the field (field.ts): plates hold it; a charge's scalar and a wire's or antenna's e₃ part are its sources
  | { type: 'plate' }
  | { type: 'charge'; charge: Multivector | null }
  | { type: 'wire'; current: Multivector | null }
  | { type: 'antenna'; current: Multivector | null; frequency: number }
  | { type: 'probe'; timer: number; out: Multivector | null; reading: Multivector | null };

/** what a sorter sends to its side: elements equal to its sample, or every element of one kind */
export type SortMode = 'same' | 'scalar' | 'vector' | 'bivector' | 'trivector' | 'state';

/** what an operation machine holds: A, B (or a fixed B, possibly one of the preset gates), the result, and how far along it is */
interface Inputs {
  a: Multivector | null;
  b: Multivector | null;
  fixed: Multivector | null;
  /** a gate set from the presets in its panel, which costs nothing and isn't given back */
  preset: GateId | null;
  out: Multivector | null;
  work: number;
}

/** machines that take only A (from any side but the front) */
export const SINGLE_INPUT: readonly MachineType[] = ['bloch', 'detector', 'orrery'];

export type Machine = { kind: 'machine'; facing: Dir } & MachineState;
export type OperationMachine = Extract<Machine, { a: unknown }>;

export type Block = { kind: 'lattice' } | { kind: 'bench' } | { kind: 'hub' } | { kind: 'deposit'; mv: Multivector } | Machine;

export function newMachine(type: MachineType, facing: Dir): Machine {
  if (type === 'duct') return { kind: 'machine', facing, type, item: null };
  if (type === 'extractor') return { kind: 'machine', facing, type, timer: 0, out: null };
  if (type === 'collector') return { kind: 'machine', facing, type, stored: [] };
  if (type === 'splitter') return { kind: 'machine', facing, type, item: null, next: 0 };
  // merger slots are indexed by side relative to its facing (1 left, 2 back, 3 right); crossing slots by the absolute side an element came in from
  if (type === 'merger') return { kind: 'machine', facing, type, slots: [null, null, null, null], next: 0 };
  if (type === 'sorter') return { kind: 'machine', facing, type, item: null, filter: null, mode: 'same', side: 1 };
  if (type === 'crossing') return { kind: 'machine', facing, type, slots: [null, null, null, null] };
  if (type === 'plate') return { kind: 'machine', facing, type };
  if (type === 'charge') return { kind: 'machine', facing, type, charge: null };
  if (type === 'wire') return { kind: 'machine', facing, type, current: null };
  if (type === 'antenna') return { kind: 'machine', facing, type, current: null, frequency: 1 };
  if (type === 'probe') return { kind: 'machine', facing, type, timer: 0, out: null, reading: null };
  const inputs = { a: null, b: null, fixed: null, preset: null, out: null, work: 0 };
  if (type === 'orrery') return { kind: 'machine', facing, type, seen: [], ...inputs };
  return { kind: 'machine', facing, type, ...inputs };
}

export const SIZE = 64;
export const HEIGHT = 32;
export const GROUND = 3; // the first empty layer
export const HUB: [number, number, number] = [SIZE / 2, GROUND, SIZE / 2 - 3];
export const SPAWN: [number, number, number] = [SIZE / 2 + 0.5, GROUND, SIZE / 2 + 2.5];

const index = (x: number, y: number, z: number) => x + SIZE * (z + SIZE * y);
export const inBounds = (x: number, y: number, z: number) => x >= 0 && x < SIZE && z >= 0 && z < SIZE && y >= 0 && y < HEIGHT;

export function blockName(b: Block) {
  if (b.kind === 'lattice') return 'Lattice';
  if (b.kind === 'bench') return 'Algebra bench';
  if (b.kind === 'hub') return 'Hub';
  if (b.kind === 'deposit') return `${b.mv} deposit`;
  return MACHINE_NAMES[b.type];
}

/** what breaking a block gives (deposits give their element and stay; the hub can't be broken) */
export function drop(b: Block): Item | null {
  if (b.kind === 'hub') return null;
  if (b.kind === 'deposit') return { kind: 'element', mv: b.mv };
  if (b.kind === 'machine') return { kind: 'machine', type: b.type };
  return { kind: b.kind };
}

/** everything a machine holds, returned to the player when it is broken */
export function contents(m: Machine): Multivector[] {
  if (m.type === 'duct') return m.item ? [m.item.mv] : [];
  if (m.type === 'extractor') return m.out ? [m.out.mv] : [];
  if (m.type === 'collector') return m.stored.flatMap((s) => Array(s.count).fill(s.mv));
  if (m.type === 'splitter' || m.type === 'sorter') return m.item ? [m.item] : [];
  if (m.type === 'merger' || m.type === 'crossing') return m.slots.filter((x): x is Multivector => !!x);
  if (m.type === 'plate') return [];
  if (m.type === 'charge') return m.charge ? [m.charge] : [];
  if (m.type === 'wire' || m.type === 'antenna') return m.current ? [m.current] : [];
  if (m.type === 'probe') return m.out ? [m.out] : [];
  // a preset gate was never the player's to get back
  return [m.a, m.b, m.preset ? null : m.fixed, m.out].filter((x): x is Multivector => !!x);
}

/** blocks you can use (open a panel for) rather than place against */
export const usable = (b: Block | undefined) => !!b && (b.kind === 'bench' || b.kind === 'hub' || (b.kind === 'machine' && b.type !== 'duct' && b.type !== 'plate'));

/** how tall a block is for walking on: ducts are low enough to step over, and field plates lie flat */
export const heightOf = (b: Block | undefined) =>
  !b ? 0 : b.kind === 'machine' && b.type === 'plate' ? 0.125 : b.kind === 'machine' && (b.type === 'duct' || b.type === 'crossing') ? 0.375 : 1;

export class World {
  private blocks = new Map<number, Block>();
  /** positions of every machine and the hub, for the factory to step without scanning the grid */
  readonly active = new Map<number, [number, number, number]>();
  /** bumps when blocks are added, removed or replaced, so the renderer knows to rebuild */
  version = 0;

  get(x: number, y: number, z: number) {
    return inBounds(x, y, z) ? this.blocks.get(index(x, y, z)) : undefined;
  }

  set(x: number, y: number, z: number, b: Block | null) {
    if (!inBounds(x, y, z)) return false;
    const i = index(x, y, z);
    if (b) this.blocks.set(i, b);
    else this.blocks.delete(i);
    if (b && (b.kind === 'machine' || b.kind === 'hub')) this.active.set(i, [x, y, z]);
    else this.active.delete(i);
    this.version++;
    return true;
  }

  solid(x: number, y: number, z: number) {
    return !!this.get(x, y, z);
  }

  *entries(): Generator<[number, number, number, Block]> {
    for (const [i, b] of this.blocks) {
      const x = i % SIZE;
      const z = Math.floor(i / SIZE) % SIZE;
      const y = Math.floor(i / (SIZE * SIZE));
      yield [x, y, z, b];
    }
  }

  static generate(seed = Date.now()) {
    const w = new World();
    let s = seed % 2147483647 || 1;
    const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let x = 0; x < SIZE; x++) for (let z = 0; z < SIZE; z++) for (let y = 0; y < GROUND; y++) w.set(x, y, z, { kind: 'lattice' });

    const [hx, hy, hz] = HUB;
    w.set(hx, hy, hz, { kind: 'hub' });
    // one of each deposit a short walk from spawn, with room around them for an extractor and ducts
    const starters: [number, number, Multivector][] = [
      [hx - 5, hz, el('1')],
      [hx + 5, hz, el('2')],
      [hx - 5, hz + 6, scalar(1)],
      [hx + 5, hz + 6, el('3')],
    ];
    for (const [x, z, mv] of starters) w.set(x, GROUND, z, { kind: 'deposit', mv });

    // outcrops further out
    const kinds = [el('1'), el('2'), el('3'), scalar(1)];
    for (let i = 0; i < 60; i++) {
      const x = 2 + Math.floor(rand() * (SIZE - 4));
      const z = 2 + Math.floor(rand() * (SIZE - 4));
      if (Math.hypot(x - hx, z - hz - 3) < 10) continue;
      const mv = kinds[i % kinds.length];
      const h = 1 + Math.floor(rand() * 2);
      for (let y = 0; y < h; y++) w.set(x, GROUND + y, z, { kind: 'deposit', mv });
    }
    w.version = 0;
    return w;
  }

  save() {
    return [...this.entries()].map(([x, y, z, b]) => [x, y, z, saveBlock(b)] as const);
  }

  static load(saved: ReturnType<World['save']>) {
    const w = new World();
    for (const [x, y, z, b] of saved) w.set(x, y, z, loadBlock(b));
    w.version = 0;
    return w;
  }
}

// --- saving blocks -----------------------------------------------------------------------------

type SavedBlock = Record<string, unknown> & { kind: string };
const mvOrNull = (m: Multivector | null) => (m ? saveMv(m) : null);
const loadOrNull = (s: unknown) => (s ? loadMv(s as SavedMv) : null);

function saveBlock(b: Block): SavedBlock {
  if (b.kind === 'deposit') return { kind: 'deposit', mv: saveMv(b.mv) };
  if (b.kind !== 'machine') return { kind: b.kind };
  const base = { kind: 'machine', type: b.type, facing: b.facing };
  switch (b.type) {
    case 'duct':
      return { ...base, item: b.item ? { mv: saveMv(b.item.mv), t: b.item.t, from: b.item.from } : null };
    case 'extractor':
      return { ...base, timer: b.timer, out: b.out ? saveMv(b.out.mv) : null };
    case 'collector':
      return { ...base, stored: b.stored.map((s) => [saveMv(s.mv), s.count]) };
    case 'splitter':
      return { ...base, item: mvOrNull(b.item), next: b.next };
    case 'merger':
      return { ...base, slots: b.slots.map(mvOrNull), next: b.next };
    case 'sorter':
      return { ...base, item: mvOrNull(b.item), filter: mvOrNull(b.filter), mode: b.mode, side: b.side };
    case 'crossing':
      return { ...base, slots: b.slots.map(mvOrNull) };
    case 'plate':
      return base;
    case 'charge':
      return { ...base, charge: mvOrNull(b.charge) };
    case 'wire':
      return { ...base, current: mvOrNull(b.current) };
    case 'antenna':
      return { ...base, current: mvOrNull(b.current), frequency: b.frequency };
    case 'probe':
      return { ...base, timer: b.timer, out: mvOrNull(b.out) };
    default:
      return {
        ...base,
        a: mvOrNull(b.a),
        b: mvOrNull(b.b),
        fixed: mvOrNull(b.fixed),
        preset: b.preset,
        out: mvOrNull(b.out),
        work: b.work,
        ...(b.type === 'orrery' ? { seen: b.seen.map(saveMv) } : {}),
      };
  }
}

let loadedIds = 1_000_000;
function loadBlock(s: SavedBlock): Block {
  if (s.kind === 'deposit') return { kind: 'deposit', mv: loadMv(s.mv as SavedMv) };
  if (s.kind !== 'machine') return { kind: s.kind } as Block;
  const m = newMachine(s.type as MachineType, s.facing as Dir);
  if (m.type === 'duct' && s.item) {
    const it = s.item as { mv: SavedMv; t: number; from: Dir | null };
    m.item = { id: loadedIds++, mv: loadMv(it.mv), t: it.t, from: it.from };
  } else if (m.type === 'extractor') {
    m.timer = (s.timer as number) ?? 0;
    m.out = s.out ? { id: loadedIds++, mv: loadMv(s.out as SavedMv), t: 1, from: null } : null;
  } else if (m.type === 'collector') {
    m.stored = ((s.stored as [SavedMv, number][]) ?? []).map(([mv, count]) => ({ mv: loadMv(mv), count }));
  } else if (m.type === 'splitter') {
    Object.assign(m, { item: loadOrNull(s.item), next: (s.next as number) ?? 0 });
  } else if (m.type === 'merger') {
    Object.assign(m, { slots: ((s.slots as unknown[]) ?? [null, null, null, null]).map(loadOrNull), next: (s.next as number) ?? 0 });
  } else if (m.type === 'sorter') {
    Object.assign(m, { item: loadOrNull(s.item), filter: loadOrNull(s.filter), mode: (s.mode as SortMode) ?? 'same', side: (s.side as 1 | 3) ?? 1 });
  } else if (m.type === 'crossing') {
    m.slots = ((s.slots as unknown[]) ?? [null, null, null, null]).map(loadOrNull);
  } else if (m.type === 'charge') {
    m.charge = loadOrNull(s.charge);
  } else if (m.type === 'wire') {
    m.current = loadOrNull(s.current);
  } else if (m.type === 'antenna') {
    Object.assign(m, { current: loadOrNull(s.current), frequency: (s.frequency as number) ?? 1 });
  } else if (m.type === 'probe') {
    Object.assign(m, { timer: (s.timer as number) ?? 0, out: loadOrNull(s.out) });
  } else if (m.type !== 'duct' && m.type !== 'plate') {
    Object.assign(m, {
      a: loadOrNull(s.a),
      b: loadOrNull(s.b),
      fixed: loadOrNull(s.fixed),
      preset: (s.preset as GateId | null) ?? null,
      out: loadOrNull(s.out),
      work: (s.work as number) ?? 0,
    });
    if (m.type === 'orrery') m.seen = ((s.seen as SavedMv[]) ?? []).map(loadMv);
  }
  return m;
}
