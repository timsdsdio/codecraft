// The voxel world: a bounded grid of blocks. Lattice is the inert building material the ground is
// made of. Deposits hold raw elements (the basis vectors e₁, e₂, e₃ and the scalar 1) and give them
// up when broken. Any element placed back into the world becomes a machine block that acts on what
// touches it (see machines.ts).
//
// World axes follow three.js (x east, y up, z south); algebra axes are e₁ east, e₂ north, e₃ up, a
// right-handed set, so the arrow drawn for e₁ points the way you walk to go east.
import type { Multivector } from '@codecraft/ga';
import { element, el, loadItem, saveItem, scalar, type Item, type SavedItem } from './items';

export type Block =
  | { kind: 'lattice' }
  | { kind: 'bench' }
  | { kind: 'deposit'; mv: Multivector }
  | { kind: 'element'; mv: Multivector };

export const SIZE = 64;
export const HEIGHT = 32;
export const GROUND = 3; // the first empty layer

const index = (x: number, y: number, z: number) => x + SIZE * (z + SIZE * y);
export const inBounds = (x: number, y: number, z: number) =>
  x >= 0 && x < SIZE && z >= 0 && z < SIZE && y >= 0 && y < HEIGHT;

export function blockName(b: Block) {
  if (b.kind === 'lattice') return 'Lattice';
  if (b.kind === 'bench') return 'Algebra bench';
  if (b.kind === 'deposit') return `${b.mv} deposit`;
  return `${b.mv} machine`;
}

/** what breaking a block gives */
export function drop(b: Block): Item {
  return b.kind === 'deposit' || b.kind === 'element' ? element(b.mv) : { kind: b.kind };
}

/** what placing an item makes */
export function blockFor(item: Item): Block {
  return item.kind === 'element' ? { kind: 'element', mv: item.mv } : { kind: item.kind };
}

/** blocks you can't see through: their hidden faces aren't drawn */
export const opaque = (b: Block | undefined) => !!b && b.kind !== 'element';

export class World {
  private blocks = new Map<number, Block>();
  /** bumps on every change, so the renderer knows to rebuild */
  version = 0;

  get(x: number, y: number, z: number) {
    return inBounds(x, y, z) ? this.blocks.get(index(x, y, z)) : undefined;
  }

  set(x: number, y: number, z: number, b: Block | null) {
    if (!inBounds(x, y, z)) return false;
    if (b) this.blocks.set(index(x, y, z), b);
    else this.blocks.delete(index(x, y, z));
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

    // outcrops of deposits, kept clear of the spawn point
    const kinds = [el('1'), el('2'), el('3'), scalar(1)];
    for (let i = 0; i < 70; i++) {
      const x = 2 + Math.floor(rand() * (SIZE - 4));
      const z = 2 + Math.floor(rand() * (SIZE - 4));
      if (Math.hypot(x - SIZE / 2, z - SIZE / 2) < 4) continue;
      const mv = kinds[i % kinds.length];
      const h = 1 + Math.floor(rand() * 3);
      for (let y = 0; y < h; y++) w.set(x, GROUND + y, z, { kind: 'deposit', mv });
      // some deposits sit in the ground too, under a lattice cap
      if (rand() < 0.4) w.set(x, GROUND - 1, z, { kind: 'deposit', mv });
    }
    w.version = 0;
    return w;
  }

  save() {
    return [...this.entries()].map(([x, y, z, b]) => {
      const item: SavedItem = b.kind === 'deposit' || b.kind === 'element' ? saveItem(element(b.mv)) : { kind: b.kind };
      return [x, y, z, b.kind === 'deposit' ? 'deposit' : 'block', item] as const;
    });
  }

  static load(saved: ReturnType<World['save']>) {
    const w = new World();
    for (const [x, y, z, tag, item] of saved) {
      const it = loadItem(item);
      w.set(x, y, z, tag === 'deposit' && it.kind === 'element' ? { kind: 'deposit', mv: it.mv } : blockFor(it));
    }
    w.version = 0;
    return w;
  }
}
