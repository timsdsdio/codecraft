// The gallery: a world with every machine on show, for looking at the whole game without playing
// through the goals tree. It is never saved. In front of spawn, from near to far:
//   a showroom row with one of every machine, each on its own, in the order of MACHINE_NAMES
//   working lines: generators into Stores, a Mill, a Packer, a Card Press, and a qubit line
//       (|0⟩ through an H gate, an orrery, a phase shifter, a second orrery and a detector),
//       and a merger feeding a sorter
//   three fields of plates: one around a charge, one around a wire, one around an antenna,
//       each with a probe beside the source
// The inventory holds one of everything, and every product rule is already learned.
import { Multivector } from '@codecraft/ga';
import { card } from './cards.ts';
import { MACHINE_NAMES, el, machine, scalar, stack, stackOf, type Item, type MachineType, type Stack, type Verb } from './items.ts';
import { SLOTS } from './slots.ts';
import { GROUND, SIZE, World, newMachine, type Dir, type Machine } from './world.ts';

const E: Dir = 0;
const S: Dir = 3;
const Y = GROUND;

type Of<T extends MachineType> = Extract<Machine, { type: T }>;
const make = <T extends MachineType>(type: T, facing: Dir = E) => newMachine(type, facing) as Of<T>;

const rotor = scalar(1).sub(el('1', '2'));
const hGate = el('2', '3').add(el('1', '2'));
const phase = scalar(1).add(el('1', '2'));

export function galleryWorld() {
  const w = new World();
  for (let x = 0; x < SIZE; x++) for (let z = 0; z < SIZE; z++) for (let y = 0; y < GROUND; y++) w.set(x, y, z, { kind: 'lattice' });
  const put = (x: number, z: number, m: Machine) => w.set(x, Y, z, m);
  const generator = (x: number, z: number, sample: Multivector, facing: Dir = E) => {
    const g = make('generator', facing);
    g.sample = stackOf(sample);
    put(x, z, g);
  };
  const ducts = (x0: number, x1: number, z: number) => {
    for (let x = x0; x <= x1; x++) put(x, z, make('duct'));
  };

  // the showroom: one of every machine, facing the player's right, two blocks apart
  const types = Object.keys(MACHINE_NAMES) as MachineType[];
  const x0 = Math.floor(SIZE / 2 - types.length);
  types.forEach((type, i) => put(x0 + i * 2, 30, make(type)));
  w.set(x0 + types.length * 2, Y, 30, { kind: 'workbench' });
  // a couple of deposits to break
  w.set(x0 - 3, Y, 30, { kind: 'deposit', mv: el('1') });
  w.set(x0 - 3, Y, 32, { kind: 'deposit', mv: scalar(1) });

  // working lines, running left to right
  const z = 25;
  // a generator filling a Store
  generator(6, z, el('1'));
  ducts(7, 8, z);
  put(9, z, make('store'));
  // a Mill multiplying e₂ by e₁ from the left: e₁₂
  generator(12, z, el('2'));
  put(13, z, make('duct'));
  const mill = make('mill');
  mill.cards[0] = stack(card('geometric', el('1')));
  put(14, z, mill);
  put(15, z, make('duct'));
  put(16, z, make('store'));
  // a Packer adding e₁ from behind and e₂ from its left: e₁ + e₂
  generator(19, z, el('1'));
  put(20, z, make('packer'));
  generator(20, z - 1, el('2'), S);
  put(21, z, make('store'));
  // a Card Press loaded with a rotor, a Sandwich plate and blank cards
  const press = make('press');
  press.bed = stackOf(rotor);
  press.plate = stack({ kind: 'plate', verb: 'sandwich' });
  press.blank = stack({ kind: 'blank' }, 8);
  put(24, z, press);
  // qubits: |0⟩ through an H gate to |+⟩, an orrery, a phase shifter, another orrery and a detector
  generator(27, z, scalar(1));
  const h = make('mill');
  h.cards[0] = stack(card('geometric', hGate));
  put(28, z, h);
  put(29, z, make('orrery'));
  const shift = make('mill');
  shift.cards[0] = stack(card('geometric', phase, true));
  put(30, z, shift);
  put(31, z, make('orrery'));
  put(32, z, make('detector'));
  put(33, z, make('splitter'));
  put(34, z, make('store'));
  put(33, z - 1, make('store'));
  put(33, z + 1, make('store'));
  // a merger taking e₁ and the scalar 1 in turn, and a sorter sending the vectors aside
  generator(36, z, el('1'));
  put(37, z, make('merger'));
  generator(37, z + 1, scalar(1), 1);
  const sorter = make('sorter');
  sorter.mode = 'vector';
  put(38, z, sorter);
  put(39, z, make('store'));
  put(38, z - 1, make('store'));

  // fields: a charge, a wire and an antenna, each in a square of plates with a probe beside it
  const field = (cx: number, cz: number, source: 'charge' | 'wire' | 'antenna', mv: Multivector) => {
    for (let x = cx - 4; x <= cx + 4; x++) for (let zz = cz - 4; zz <= cz + 4; zz++) put(x, zz, make('plate'));
    const s = make(source);
    s.slot = stackOf(mv);
    put(cx, cz, s);
    put(cx + 2, cz, make('probe'));
  };
  field(12, 15, 'charge', scalar(2));
  field(24, 15, 'wire', el('3').scale(2));
  field(36, 15, 'antenna', el('3').scale(2));
  return w;
}

/** one of everything, with enough to build and press with */
export function galleryInventory(): (Stack | null)[] {
  const verbs: Verb[] = ['wedge', 'dot', 'geometric', 'sandwich', 'reverse', 'grade'];
  const items: Stack[] = [
    stack({ kind: 'workbench' }),
    stack(machine('generator'), 4),
    stack(machine('duct'), 64),
    stack(machine('store'), 4),
    stack(machine('mill'), 2),
    stack(machine('press')),
    stack({ kind: 'lattice' }, 64),
    stackOf(el('1').scale(64))!,
    stackOf(el('2').scale(64))!,
    ...(Object.keys(MACHINE_NAMES) as MachineType[])
      .filter((t) => !['generator', 'duct', 'store', 'mill', 'press'].includes(t))
      .map((t) => stack(machine(t), t === 'plate' ? 32 : 2)),
    ...verbs.map((verb) => stack({ kind: 'plate', verb } as Item)),
    stack({ kind: 'blank' }, 16),
    stackOf(el('3').scale(64))!,
    stackOf(scalar(64))!,
    stackOf(rotor.scale(8))!,
    stackOf(el('1', '2', '3').scale(8))!,
  ];
  const inv: (Stack | null)[] = Array(SLOTS).fill(null);
  items.slice(0, SLOTS).forEach((s, i) => (inv[i] = s));
  return inv;
}
