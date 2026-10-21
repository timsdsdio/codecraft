import { test } from 'node:test';
import { Q } from '@codecraft/ga';
import assert from 'node:assert/strict';
import { Field, isReading, reading } from './field.ts';
import { Factory } from './factory.ts';
import { el, scalar } from './items.ts';
import { ORDERS } from './orders.ts';
import { World, newMachine, type Dir, type Machine } from './world.ts';

const Y = 3;
const C = 20;
const E = 0 as Dir;

/** a square of plates 2R + 1 across centred on (C, Y, C), with a block of the given type in the middle */
function region(type: 'charge' | 'wire' | 'antenna', mv: ReturnType<typeof el>, R = 10) {
  const w = new World();
  for (let x = C - R; x <= C + R; x++) for (let z = C - R; z <= C + R; z++) w.set(x, Y, z, newMachine('plate', E));
  const m = newMachine(type, E) as Machine & { charge?: unknown; current?: unknown };
  if (m.type === 'charge') m.charge = mv;
  if (m.type === 'wire' || m.type === 'antenna') m.current = mv;
  w.set(C, Y, C, m);
  return { w, f: new Field() };
}
const run = (f: Field, w: World, seconds: number) => {
  for (let t = 0; t < seconds; t += 0.05) f.step(w, 0.05);
};
const near = (a: number, b: number, tol: number) => assert.ok(Math.abs(a - b) <= tol, `${a} is not within ${tol} of ${b}`);

test('readings are F = E + IB rounded to halves: I e₁ = e₂₃, I e₂ = e₃₁', () => {
  assert.ok(reading({ e: [1.1, 0, 0], b: [0, 0, 0] }).equals(el('1')));
  assert.ok(reading({ e: [0, 0, 0.3], b: [0.9, 0, 0] }).equals(el('3').scale(Q.q(1, 2)).add(el('2', '3'))));
  assert.ok(reading({ e: [0, 0, 0], b: [0, 1, 0] }).equals(el('3', '1')));
  assert.ok(reading({ e: [0.2, -0.1, 0], b: [0, 0, 0.1] }).isZero());
});

test('Gauss: a charge’s E points away from it and falls off as 1/r', () => {
  const { w, f } = region('charge', scalar(1));
  run(f, w, 1);
  const r1 = f.at(C + 1, Y, C);
  const r2 = f.at(C + 2, Y, C);
  near(r1.e[0], 1, 0.2);
  near(r2.e[0], 0.5, 0.1);
  near(r1.e[1], 0, 1e-6);
  // north is −z, so the field one block north points along +e₂
  assert.ok(f.at(C, Y, C - 2).e[1] > 0.4);
  assert.deepEqual(r1.b, [0, 0, 0]);
  assert.ok(reading(r1).equals(el('1')));
});

test('a negative charge’s field points toward it', () => {
  const { w, f } = region('charge', scalar(-2));
  run(f, w, 1);
  assert.ok(f.at(C + 2, Y, C).e[0] < -0.8);
});

test('Ampère: current up a wire makes B circle it anticlockwise from above, falling off as 1/r', () => {
  const { w, f } = region('wire', el('3'));
  run(f, w, 4);
  const east = f.at(C + 1, Y, C);
  const north = f.at(C, Y, C - 1);
  // anticlockwise seen from above (the right-hand rule): north on the east side, west on the north side
  near(east.b[1], 1, 0.25);
  near(north.b[0], -1, 0.25);
  near(f.at(C + 2, Y, C).b[1], 0.5, 0.15);
  // once the current has settled there is no E left to read
  assert.equal(reading(east).grades().join(), '2');
  assert.equal(reading(f.at(C + 2, Y, C)).grades().join(), '2');
});

test('Faraday and Ampère together: an antenna’s waves travel out at the wave speed', () => {
  const { w, f } = region('antenna', el('3'), 12);
  run(f, w, 0.5);
  const far = () => Math.abs(f.at(C + 9, Y, C).e[2]);
  // after half a second the wave has gone about 2 blocks, so 9 blocks out is still quiet
  assert.ok(far() < 0.02, `already ${far()} at 9 blocks`);
  let biggest = 0;
  let both = 0;
  for (let t = 0; t < 8; t += 0.05) {
    f.step(w, 0.05);
    biggest = Math.max(biggest, far());
    if (reading(f.at(C + 2, Y, C)).grades().join() === '1,2') both++;
  }
  assert.ok(biggest > 0.15, `the wave never arrived: ${biggest}`);
  assert.ok(both > 20, 'a probe beside it reads E and IB together');
});

test('the field stays bounded with an antenna running for a minute', () => {
  const { w, f } = region('antenna', el('3').scale(2), 6);
  run(f, w, 60);
  for (let x = C - 6; x <= C + 6; x++) for (let z = C - 6; z <= C + 6; z++) {
    const v = f.at(x, Y, z);
    assert.ok([...v.e, ...v.b].every((n) => Number.isFinite(n) && Math.abs(n) < 5), `${x},${z}: ${JSON.stringify(v)}`);
  }
});

test('separate groups of plates are separate fields, and a gap of one block cuts the field off', () => {
  const w = new World();
  for (let x = 0; x <= 4; x++) w.set(x, Y, 0, newMachine('plate', E));
  for (let x = 6; x <= 9; x++) w.set(x, Y, 0, newMachine('plate', E));
  const q = newMachine('charge', E) as Extract<Machine, { type: 'charge' }>;
  q.charge = scalar(1);
  w.set(2, Y, 0, q);
  const f = new Field();
  run(f, w, 1);
  assert.equal(f.regions.length, 2);
  assert.ok(f.at(3, Y, 0).e[0] > 0.3);
  assert.ok([...f.at(6, Y, 0).e, ...f.at(5, Y, 0).e].every((n) => n === 0));
});

test('a probe ducts readings to the hub, which counts them toward a field order; elements made otherwise don’t count', () => {
  const w = new World();
  for (let x = 0; x <= 8; x++) for (let z = 0; z <= 8; z++) w.set(x, Y, z, newMachine('plate', E));
  const hub = { order: ORDERS.findIndex((o) => o.kind === 'reading'), delivered: 0 };
  const f = new Factory(w, hub);
  // a charge in the middle, set by duct; a probe one block east facing east, through a duct to the hub
  w.set(4, Y, 4, newMachine('charge', E));
  assert.ok(f.accept(4, Y, 4, scalar(1), 2));
  assert.ok(f.accept(4, Y, 4, el('1'), 2), 'takes it, and it vanishes');
  assert.ok((w.get(4, Y, 4) as Extract<Machine, { type: 'charge' }>).charge?.equals(scalar(1)));
  w.set(5, Y, 4, newMachine('probe', E));
  w.set(6, Y, 4, newMachine('duct', E));
  w.set(7, Y, 4, { kind: 'hub' });
  for (let t = 0; t < 2.6; t += 0.05) f.step(0.05);
  assert.equal(hub.delivered, 2);
  const probe = w.get(5, Y, 4) as Extract<Machine, { type: 'probe' }>;
  // E one block east of the charge points east (a little stronger than 1/r, as the earthed edge is close)
  assert.ok(probe.reading && isReading(probe.reading), String(probe.reading));
  assert.deepEqual([...probe.reading.terms.keys()], [1]);
  assert.ok(probe.reading.terms.get(1)!.n > 0);
  // an e₁ from anywhere else is the same element, but not a reading
  f.accept(7, Y, 4, el('1'), 2);
  assert.equal(hub.delivered, 2);
});

test('a probe outside any field reads nothing', () => {
  const w = new World();
  const f = new Factory(w, { order: 0, delivered: 0 });
  w.set(1, Y, 1, newMachine('probe', E));
  w.set(2, Y, 1, newMachine('collector', E));
  for (let t = 0; t < 3; t += 0.05) f.step(0.05);
  assert.equal((w.get(2, Y, 1) as Extract<Machine, { type: 'collector' }>).stored.length, 0);
});
