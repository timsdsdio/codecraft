import { test } from 'node:test';
import assert from 'node:assert/strict';
import { card } from './cards.ts';
import { Factory, LAMP_TIME } from './factory.ts';
import { el, scalar, stack, stackOf, valueOf, type Stack } from './items.ts';
import { World, drop, newMachine, type Dir, type Machine } from './world.ts';

const Y = 3;
const E = 0 as Dir;
const N = 1 as Dir;
const S = 3 as Dir;
const e1 = el('1');
const e2 = el('2');
const e12 = e1.op(e2);
const run = (f: Factory, seconds: number) => {
  for (let t = 0; t < seconds; t += 0.05) f.step(0.05);
};
const val = (s: Stack | null) => (s ? String(valueOf(s)) : 'empty');
const store = (w: World, x: number, z: number) => w.get(x, Y, z) as Extract<Machine, { type: 'store' }>;
const held = (w: World, x: number, z: number) => store(w, x, z).slots.filter((s): s is Stack => !!s).map(val);

test('an extractor on a deposit ducts blades into a Store, where they stack into one growing weight', () => {
  const w = new World();
  w.set(0, Y, 0, { kind: 'deposit', mv: e1 });
  w.set(1, Y, 0, newMachine('extractor', E));
  w.set(2, Y, 0, newMachine('duct', E));
  w.set(3, Y, 0, newMachine('store', E));
  const f = new Factory(w);
  run(f, 10);
  const got = held(w, 3, 0);
  assert.equal(got.length, 1, 'one slot');
  assert.match(got[0], /^\d+e₁$/);
  assert.ok(Number(got[0].replace('e₁', '')) >= 5);
});

test('a Store takes a stack only when all of it fits', () => {
  const w = new World();
  w.set(0, Y, 0, newMachine('store', E));
  const f = new Factory(w);
  const s = store(w, 0, 0);
  s.slots = s.slots.map(() => stack({ kind: 'lattice' }, 64));
  assert.ok(!f.accept(0, Y, 0, stackOf(e1)!, 2));
  s.slots[0] = stackOf(e1.scale(3));
  assert.ok(f.accept(0, Y, 0, stackOf(e1.scale(2))!, 2), 'a multiple stacks onto it');
  assert.equal(val(s.slots[0]), '5e₁');
});

test('a Packer waits for every fed side, then sends their sum as one multivector', () => {
  const w = new World();
  // ducts into its back (from the west) and its left (from the north); it faces east
  w.set(1, Y, 1, newMachine('packer', E));
  w.set(0, Y, 1, newMachine('duct', E));
  w.set(1, Y, 0, newMachine('duct', S));
  w.set(2, Y, 1, newMachine('store', E));
  const f = new Factory(w);
  assert.ok(f.accept(0, Y, 1, stackOf(e1)!, 2));
  run(f, 2);
  assert.deepEqual(held(w, 2, 1), [], 'still waiting for its left side');
  assert.ok(f.accept(1, Y, 0, stackOf(e2.scale(2))!, N));
  run(f, 2);
  assert.deepEqual(held(w, 2, 1), ['e₁ + 2e₂']);
});

test('an Unpacker sends each blade of a multivector out on its own', () => {
  const w = new World();
  w.set(0, Y, 0, newMachine('unpacker', E));
  w.set(1, Y, 0, newMachine('duct', E));
  w.set(2, Y, 0, newMachine('store', E));
  const f = new Factory(w);
  assert.ok(f.accept(0, Y, 0, stackOf(scalar(1).add(e12.scale(-3)))!, 2));
  assert.ok(!f.accept(0, Y, 0, stackOf(e1)!, 2), 'busy until the queue is empty');
  run(f, 4);
  assert.deepEqual(held(w, 2, 0).sort(), ['1', '−3e₁₂'].sort());
});

test('a Mill runs what arrives at its back through its cards, taking a lamp’s time per pair of blades', () => {
  const w = new World();
  const mill = newMachine('mill', E) as Extract<Machine, { type: 'mill' }>;
  mill.cards[0] = stack(card('multiply', e1));
  w.set(0, Y, 0, mill);
  w.set(1, Y, 0, newMachine('store', E));
  const f = new Factory(w);
  assert.ok(f.accept(0, Y, 0, stackOf(e2)!, 2));
  assert.ok(!f.accept(0, Y, 0, stackOf(e2)!, 2), 'one at a time');
  run(f, LAMP_TIME * 0.5);
  assert.deepEqual(held(w, 1, 0), []);
  run(f, LAMP_TIME + 0.2);
  assert.deepEqual(held(w, 1, 0), ['e₁₂']);
});

test('a Mill’s second deck works on what the first deck made', () => {
  const w = new World();
  const mill = newMachine('mill', E) as Extract<Machine, { type: 'mill' }>;
  mill.cards[0] = stack(card('multiply', e1));
  mill.cards[2] = stack(card('reverse', null));
  w.set(0, Y, 0, mill);
  w.set(1, Y, 0, newMachine('store', E));
  const f = new Factory(w);
  f.accept(0, Y, 0, stackOf(e2)!, 2);
  run(f, 2);
  assert.deepEqual(held(w, 1, 0), ['−e₁₂']);
});

test('a Mill with a live card waits for its side port and presses what arrives there into a card', () => {
  const w = new World();
  const mill = newMachine('mill', E) as Extract<Machine, { type: 'mill' }>;
  mill.live = 'join';
  w.set(0, Y, 0, mill);
  w.set(1, Y, 0, newMachine('store', E));
  const f = new Factory(w);
  f.accept(0, Y, 0, stackOf(e2)!, 2);
  run(f, 2);
  assert.deepEqual(held(w, 1, 0), [], 'nothing until the side delivers');
  assert.ok(f.accept(0, Y, 0, stackOf(e1)!, N), 'its left side');
  run(f, 2);
  assert.deepEqual(held(w, 1, 0), ['e₁₂']);
});

test('a Mill with no cards passes things straight through', () => {
  const w = new World();
  w.set(0, Y, 0, newMachine('mill', E));
  w.set(1, Y, 0, newMachine('store', E));
  const f = new Factory(w);
  f.accept(0, Y, 0, stackOf(e1.add(e2))!, 2);
  run(f, 2);
  assert.deepEqual(held(w, 1, 0), ['e₁ + e₂']);
});

test('a deposit breaks into 4 blades by hand, while an extractor draws from it without using it up', () => {
  const deposit = { kind: 'deposit' as const, mv: e1 };
  assert.equal(val(drop(deposit)), '4e₁');
  const w = new World();
  w.set(0, Y, 0, deposit);
  w.set(1, Y, 0, newMachine('extractor', E));
  w.set(2, Y, 0, newMachine('store', E));
  run(new Factory(w), 20);
  assert.equal(w.get(0, Y, 0)?.kind, 'deposit');
});
