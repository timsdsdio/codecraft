// The voxel world: a bounded grid of blocks.
//   lattice     the inert building material the ground is made of
//   deposit     a never-ending source of one unit blade (e₁, e₂, e₃ or the scalar 1); breaking it by
//               hand gives one and leaves it in place, and an extractor draws on it forever
//   workbench   hand work (the tray, the grid and the rail) and building things
//   machine     everything with a facing: extractors, ducts, Stores, logistics, Mills, the Card Press,
//               qubit machines and field blocks; each holds what is passing through it (factory.ts)
//
// World axes follow three.js (x east, y up, z south); algebra axes are e₁ east, e₂ north, e₃ up, a
// right-handed set, so the arrow drawn for e₁ points the way you walk to go east.
import type { Multivector } from '@codecraft/ga';
import {
  MACHINE_NAMES,
  el,
  loadMv,
  loadStack,
  saveMv,
  saveStack,
  scalar,
  stack,
  type Item,
  type MachineType,
  type SavedMv,
  type SavedStack,
  type Stack,
  type Verb,
} from './items.ts';
import type { Slots } from './slots.ts';

/** 0 east (+x), 1 north (−z), 2 west (−x), 3 south (+z): counter-clockwise from above */
export type Dir = 0 | 1 | 2 | 3;
export const STEP: Record<Dir, [number, number]> = { 0: [1, 0], 1: [0, -1], 2: [-1, 0], 3: [0, 1] };
export const opposite = (d: Dir) => ((d + 2) % 4) as Dir;
export const DIR_NAMES = ['east', 'north', 'west', 'south'] as const;

/** a stack riding a duct: t runs from 0 (just entered) to 1 (at the far end) */
export interface Carried {
  id: number;
  stack: Stack;
  t: number;
  /** the side it came in from, for drawing the turn */
  from: Dir | null;
}

/** what a sorter sends to its side: elements that are multiples of its sample, or every element of one kind */
export type SortMode = 'same' | 'scalar' | 'vector' | 'bivector' | 'trivector' | 'state';

export const STORE_SLOTS = 27;
/** a Mill's card slots: deck one is slots 0 and 1, deck two is slots 2 and 3 */
export const MILL_SLOTS = 4;

export type MachineState =
  | { type: 'duct'; item: Carried | null }
  | { type: 'extractor'; timer: number; out: Stack | null }
  | { type: 'store'; slots: Slots }
  // logistics: these only move things around
  | { type: 'splitter'; item: Stack | null; next: number }
  | { type: 'merger'; slots: Slots; next: number }
  | { type: 'sorter'; item: Stack | null; filter: Multivector | null; mode: SortMode; side: 1 | 3 }
  | { type: 'crossing'; slots: Slots }
  // packer slots are indexed by side relative to its facing (1 left, 2 back, 3 right)
  | { type: 'packer'; slots: Slots; out: Stack | null }
  | { type: 'unpacker'; item: Stack | null; queue: Stack[] }
  | { type: 'mill'; cards: Slots; live: Verb | null; x: Stack | null; side: Stack | null; out: Stack | null; work: number; lamps: number }
  | { type: 'press'; bed: Stack | null; plate: Stack | null; blank: Stack | null }
  | { type: 'detector'; a: Stack | null; out: Stack | null; work: number }
  | { type: 'orrery'; a: Stack | null; out: Stack | null; work: number; seen: Multivector[] }
  // the field (field.ts): plates hold it; a charge's scalar and a wire's or antenna's e₃ part are its sources
  | { type: 'plate' }
  | { type: 'charge'; slot: Stack | null }
  | { type: 'wire'; slot: Stack | null }
  | { type: 'antenna'; slot: Stack | null; frequency: number }
  | { type: 'probe'; timer: number; out: Stack | null; reading: Multivector | null };

export type Machine = { kind: 'machine'; facing: Dir } & MachineState;
export type MachineOf<T extends MachineType> = Extract<Machine, { type: T }>;

export type Block = { kind: 'lattice' } | { kind: 'workbench' } | { kind: 'deposit'; mv: Multivector } | Machine;

const empty = (n: number): Slots => Array(n).fill(null);

export function newMachine(type: MachineType, facing: Dir): Machine {
  const m = (state: MachineState) => ({ kind: 'machine', facing, ...state }) as Machine;
  switch (type) {
    case 'duct':
      return m({ type, item: null });
    case 'extractor':
      return m({ type, timer: 0, out: null });
    case 'store':
      return m({ type, slots: empty(STORE_SLOTS) });
    case 'splitter':
      return m({ type, item: null, next: 0 });
    case 'merger':
      return m({ type, slots: empty(4), next: 0 });
    case 'sorter':
      return m({ type, item: null, filter: null, mode: 'same', side: 1 });
    case 'crossing':
      return m({ type, slots: empty(4) });
    case 'packer':
      return m({ type, slots: empty(4), out: null });
    case 'unpacker':
      return m({ type, item: null, queue: [] });
    case 'mill':
      return m({ type, cards: empty(MILL_SLOTS), live: null, x: null, side: null, out: null, work: 0, lamps: 0 });
    case 'press':
      return m({ type, bed: null, plate: null, blank: null });
    case 'detector':
      return m({ type, a: null, out: null, work: 0 });
    case 'orrery':
      return m({ type, a: null, out: null, work: 0, seen: [] });
    case 'plate':
      return m({ type });
    case 'charge':
      return m({ type, slot: null });
    case 'wire':
      return m({ type, slot: null });
    case 'antenna':
      return m({ type, slot: null, frequency: 1 });
    case 'probe':
      return m({ type, timer: 0, out: null, reading: null });
  }
}

export const SIZE = 64;
export const HEIGHT = 32;
export const GROUND = 3; // the first empty layer
export const SPAWN: [number, number, number] = [SIZE / 2 + 0.5, GROUND, SIZE / 2 + 2.5];
/** the patch of ground the starting deposits sit around */
const HOME: [number, number] = [SIZE / 2, SIZE / 2 - 3];

const index = (x: number, y: number, z: number) => x + SIZE * (z + SIZE * y);
export const inBounds = (x: number, y: number, z: number) => x >= 0 && x < SIZE && z >= 0 && z < SIZE && y >= 0 && y < HEIGHT;

export function blockName(b: Block) {
  if (b.kind === 'lattice') return 'Lattice';
  if (b.kind === 'workbench') return 'Workbench';
  if (b.kind === 'deposit') return `${b.mv} deposit`;
  return MACHINE_NAMES[b.type];
}

/** blades a deposit breaks into by hand; an extractor draws from one forever instead */
export const DEPOSIT_BLADES = 4;

/** what breaking a block gives */
export function drop(b: Block): Stack {
  if (b.kind === 'deposit') return stack({ kind: 'element', mv: b.mv }, DEPOSIT_BLADES);
  if (b.kind === 'machine') return stack({ kind: 'machine', type: b.type });
  return stack({ kind: b.kind });
}

/** everything a machine holds, returned to the player when it is broken */
export function contents(m: Machine): Stack[] {
  const all: (Stack | null | undefined)[] = [];
  switch (m.type) {
    case 'duct':
      all.push(m.item?.stack);
      break;
    case 'store':
    case 'merger':
    case 'crossing':
      all.push(...m.slots);
      break;
    case 'packer':
      all.push(...m.slots, m.out);
      break;
    case 'unpacker':
      all.push(m.item, ...m.queue);
      break;
    case 'mill':
      all.push(...m.cards, m.x, m.side, m.out);
      break;
    case 'press':
      all.push(m.bed, m.plate, m.blank);
      break;
    case 'detector':
    case 'orrery':
      all.push(m.a, m.out);
      break;
    case 'charge':
    case 'wire':
    case 'antenna':
      all.push(m.slot);
      break;
    case 'extractor':
    case 'probe':
      all.push(m.out);
      break;
    case 'splitter':
    case 'sorter':
      all.push(m.item);
      break;
  }
  return all.filter((s): s is Stack => !!s);
}

/** blocks you can use (open a panel for) rather than place against */
export const usable = (b: Block | undefined) =>
  !!b && (b.kind === 'workbench' || (b.kind === 'machine' && b.type !== 'duct' && b.type !== 'plate'));

/** how tall a block is for walking on: ducts are low enough to step over, and field plates lie flat */
export const heightOf = (b: Block | undefined) =>
  !b ? 0 : b.kind === 'machine' && b.type === 'plate' ? 0.125 : b.kind === 'machine' && (b.type === 'duct' || b.type === 'crossing') ? 0.375 : 1;

export class World {
  private blocks = new Map<number, Block>();
  /** positions of every machine, for the factory to step without scanning the grid */
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
    if (b?.kind === 'machine') this.active.set(i, [x, y, z]);
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

  /** every machine of one type, with where it is */
  *machines<T extends MachineType>(type: T): Generator<[MachineOf<T>, [number, number, number]]> {
    for (const p of this.active.values()) {
      const b = this.get(...p);
      if (b?.kind === 'machine' && b.type === type) yield [b as MachineOf<T>, p];
    }
  }

  static generate(seed = Date.now()) {
    const w = new World();
    let s = seed % 2147483647 || 1;
    const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let x = 0; x < SIZE; x++) for (let z = 0; z < SIZE; z++) for (let y = 0; y < GROUND; y++) w.set(x, y, z, { kind: 'lattice' });

    const [hx, hz] = HOME;
    // one of each deposit a short walk from spawn, with room around them for an extractor and ducts;
    // two high, so breaking the top for blades leaves the bottom for an extractor
    const starters: [number, number, Multivector][] = [
      [hx - 5, hz, el('1')],
      [hx + 5, hz, el('2')],
      [hx - 5, hz + 6, scalar(1)],
      [hx + 5, hz + 6, el('3')],
    ];
    for (const [x, z, mv] of starters) for (const y of [GROUND, GROUND + 1]) w.set(x, y, z, { kind: 'deposit', mv });

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
// Machine state is plain data except for stacks, multivectors and carried items, which are encoded
// by shape: a field holding a stack is saved as { $stack }, a multivector as { $mv }.

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

function encode(v: unknown): Json {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return v.map(encode);
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if ('item' in o && 'count' in o) return { $stack: saveStack(o as unknown as Stack) as unknown as Json };
    if ('terms' in o && 'alg' in o) return { $mv: saveMv(o as unknown as Multivector) };
    return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, encode(x)]));
  }
  return v as Json;
}

function decode(v: Json): unknown {
  if (v === null) return null;
  if (Array.isArray(v)) return v.map(decode);
  if (typeof v === 'object') {
    if ('$stack' in v) return loadStack(v.$stack as unknown as SavedStack);
    if ('$mv' in v) return loadMv(v.$mv as unknown as SavedMv);
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, decode(x)]));
  }
  return v;
}

function saveBlock(b: Block): Json {
  if (b.kind === 'deposit') return { kind: 'deposit', mv: saveMv(b.mv) };
  return encode(b);
}

let loadedIds = 1_000_000;
function loadBlock(s: Json): Block {
  const o = s as { kind: string; mv?: SavedMv; type?: MachineType; facing?: Dir };
  if (o.kind === 'deposit') return { kind: 'deposit', mv: loadMv(o.mv!) };
  if (o.kind !== 'machine') return { kind: o.kind } as Block;
  // start from a fresh machine so fields added later get their defaults
  const m = Object.assign(newMachine(o.type!, o.facing!), decode(s)) as Machine;
  if (m.type === 'duct' && m.item) m.item.id = loadedIds++;
  return m;
}

