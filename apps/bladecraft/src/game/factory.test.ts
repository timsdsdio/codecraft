import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Factory, inputSide, EXTRACT_EVERY } from './factory.ts';
import { el, scalar } from './items.ts';
import { ORDERS } from './orders.ts';
import { World, newMachine, type Dir, type Machine, type OperationMachine } from './world.ts';

const E = 0 as Dir;
const N = 1 as Dir;
const W = 2 as Dir;
const S = 3 as Dir;
const Y = 3;

/** an empty world with a hub at (10, Y, 5) */
function setup() {
  const w = new World();
  w.set(10, Y, 5, { kind: 'hub' });
  const hub = { order: 0, delivered: 0 };
  const log: string[] = [];
  const f = new Factory(w, hub, {
    craft: (op, a, b, r) => log.push(`${op} ${a} ${b} = ${r}`),
    deliver: (mv, counted) => log.push(`deliver ${mv}${counted ? ' (counted)' : ''}`),
    orderDone: (o) => log.push(`done ${o.want}`),
  });
  return { w, hub, f, log };
}
const run = (f: Factory, seconds: number) => {
  for (let t = 0; t < seconds; t += 0.05) f.step(0.05);
};

test('operation inputs: back is A, sides are B, front is nothing', () => {
  assert.equal(inputSide(E, W), 'a');
  assert.equal(inputSide(E, N), 'b');
  assert.equal(inputSide(E, S), 'b');
  assert.equal(inputSide(E, E), null);
  assert.equal(inputSide(N, S), 'a');
});

test('an extractor feeds a duct line into the hub, which counts its order', () => {
  const { w, hub, f, log } = setup();
  // deposit at x=4, extractor at 5 facing east, ducts 6..9 east, hub at 10
  w.set(4, Y, 5, { kind: 'deposit', mv: el('1') });
  w.set(5, Y, 5, newMachine('extractor', E));
  for (let x = 6; x <= 9; x++) w.set(x, Y, 5, newMachine('duct', E));
  run(f, EXTRACT_EVERY * 10 + 4);
  assert.equal(hub.order, 1, `delivered ${hub.delivered}; ${log.slice(-3)}`);
  const deliveries = log.filter((l) => l.startsWith('deliver'));
  // the first eight complete the e₁ order; after that e₁ no longer counts toward e₁ + e₂
  assert.ok(deliveries.slice(0, 8).every((l) => l.endsWith('(counted)')));
  assert.ok(deliveries.slice(8).every((l) => !l.endsWith('(counted)')));
  assert.ok(log.includes('done e₁'));
});

test('an extractor with no deposit behind it makes nothing', () => {
  const { w, hub, f } = setup();
  w.set(5, Y, 5, newMachine('extractor', E));
  for (let x = 6; x <= 9; x++) w.set(x, Y, 5, newMachine('duct', E));
  run(f, 10);
  assert.equal(hub.delivered, 0);
});

test('a wedger fed e₁ from behind and e₂ from the side makes e₁₂; swapped, −e₁₂', () => {
  for (const [backMv, sideMv, want] of [
    [el('1'), el('2'), el('1', '2')],
    [el('2'), el('1'), el('1', '2').neg()],
  ]) {
    const { w, f } = setup();
    // wedger at (7,Y,5) facing east; back is x=6 (A), north side is z=4 (B); output into a collector at x=8
    w.set(7, Y, 5, newMachine('wedger', E));
    w.set(8, Y, 5, newMachine('collector', E));
    w.set(5, Y, 5, { kind: 'deposit', mv: backMv });
    w.set(6, Y, 5, newMachine('extractor', E));
    w.set(7, Y, 3, { kind: 'deposit', mv: sideMv });
    w.set(7, Y, 4, newMachine('extractor', S));
    run(f, 8);
    const c = w.get(8, Y, 5) as Extract<Machine, { type: 'collector' }>;
    assert.equal(c.stored.length, 1, JSON.stringify(c.stored.map((s) => String(s.mv))));
    assert.ok(c.stored[0].mv.equals(want), `${c.stored[0].mv} ≠ ${want}`);
    assert.ok(c.stored[0].count >= 2);
  }
});

test('a fixed B is used for every A and never consumed; zero results vanish', () => {
  const { w, f, log } = setup();
  const wedger = newMachine('wedger', E) as OperationMachine;
  wedger.fixed = el('1');
  w.set(7, Y, 5, wedger);
  w.set(8, Y, 5, newMachine('collector', E));
  w.set(5, Y, 5, { kind: 'deposit', mv: el('1') });
  w.set(6, Y, 5, newMachine('extractor', E));
  run(f, 6);
  const c = w.get(8, Y, 5) as Extract<Machine, { type: 'collector' }>;
  assert.equal(c.stored.length, 0);
  assert.ok(log.some((l) => l === 'wedge e₁ e₁ = 0'));
  assert.ok(wedger.fixed?.equals(el('1')));
});

test('a blocked output backs the line up instead of losing elements', () => {
  const { w, f } = setup();
  w.set(4, Y, 5, { kind: 'deposit', mv: el('3') });
  w.set(5, Y, 5, newMachine('extractor', E));
  w.set(6, Y, 5, newMachine('duct', E));
  w.set(7, Y, 5, newMachine('duct', E));
  w.set(8, Y, 5, { kind: 'lattice' }); // a dead end
  run(f, 20);
  const d6 = w.get(6, Y, 5) as Extract<Machine, { type: 'duct' }>;
  const d7 = w.get(7, Y, 5) as Extract<Machine, { type: 'duct' }>;
  const ex = w.get(5, Y, 5) as Extract<Machine, { type: 'extractor' }>;
  assert.ok(d6.item && d7.item && ex.out, 'every stage holds one element');
});

test('a duct never hands back into a duct that points at it', () => {
  const { w, f } = setup();
  const a = newMachine('duct', E) as Extract<Machine, { type: 'duct' }>;
  const b = newMachine('duct', W) as Extract<Machine, { type: 'duct' }>;
  w.set(6, Y, 5, a);
  w.set(7, Y, 5, b);
  a.item = { id: 1, mv: el('1'), t: 0, from: null };
  run(f, 3);
  assert.ok(a.item && !b.item);
});

test('a sandwich press with B = 1 − e₁₂ turns e₁ + e₂ into −e₁ + e₂, the last order', () => {
  const { w, f, hub } = setup();
  const rotor = el('2').gp(el('1').add(el('2')));
  assert.ok(rotor.equals(scalar(1).sub(el('1', '2'))));
  const press = newMachine('sandwich', E) as OperationMachine;
  press.fixed = rotor;
  w.set(9, Y, 5, press);
  press.a = el('1').add(el('2'));
  hub.order = ORDERS.length - 1;
  run(f, 2);
  assert.equal(hub.delivered, 1);
  assert.ok(ORDERS[ORDERS.length - 1].want.equals(el('2').sub(el('1'))));
});

test('the world saves and loads machines with what they hold', () => {
  const { w } = setup();
  const m = newMachine('multiplier', N) as OperationMachine;
  m.a = el('1');
  m.fixed = el('1').add(el('2'));
  w.set(3, Y, 3, m);
  const d = newMachine('duct', S) as Extract<Machine, { type: 'duct' }>;
  d.item = { id: 9, mv: el('3'), t: 0.5, from: N };
  w.set(3, Y, 4, d);
  const back = World.load(JSON.parse(JSON.stringify(w.save())));
  const m2 = back.get(3, Y, 3) as OperationMachine;
  const d2 = back.get(3, Y, 4) as Extract<Machine, { type: 'duct' }>;
  assert.equal(m2.facing, N);
  assert.ok(m2.a?.equals(el('1')) && m2.fixed?.equals(el('1').add(el('2'))) && !m2.b);
  assert.ok(d2.item?.mv.equals(el('3')) && d2.item.t === 0.5);
  assert.equal(back.active.size, 3); // hub, multiplier, duct
});
