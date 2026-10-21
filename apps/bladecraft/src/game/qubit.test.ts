import { test } from 'node:test';
import assert from 'node:assert/strict';
import { el, scalar } from './items.ts';
import { GATES, bloch, fiber, gateOf, probUp, project, sameState, samePoint, toQuat } from './qubit.ts';
import { Q } from '@codecraft/ga';

const e1 = el('1');
const e2 = el('2');
const e3 = el('3');
const zero = scalar(1); // |0⟩
const same = (a: unknown, b: { equals(x: unknown): boolean; toString(): string }) => assert.ok(b.equals(a), `${a} ≠ ${b}`);

test('the scalar 1 is |0⟩, pointing up', () => same(bloch(zero), e3));

test('gates turn the Bloch vector: X flips, H makes |+⟩, S then makes |+i⟩', () => {
  same(bloch(GATES.X.rotor.gp(zero)), e3.neg());
  same(bloch(GATES.Y.rotor.gp(zero)), e3.neg());
  same(bloch(GATES.Z.rotor.gp(zero)), e3);
  const plus = GATES.H.rotor.gp(zero);
  same(bloch(plus), e1);
  same(bloch(GATES.S.rotor.gp(plus)), e2);
  same(bloch(GATES.H.rotor.gp(plus)), e3); // H twice is the identity on the sphere
});

test('a phase on the right keeps the Bloch vector: the fiber', () => {
  const plus = GATES.H.rotor;
  const phased = plus.gp(scalar(1).add(el('1', '2')));
  assert.ok(samePoint(plus, phased));
  assert.ok(!sameState(plus, phased));
  // but on the left it is a gate, and moves the point
  assert.ok(!samePoint(plus, scalar(1).add(el('1', '2')).gp(plus)));
});

test('states are equal up to a positive scale; −R is a different state on the same fiber', () => {
  const r = GATES.H.rotor;
  assert.ok(sameState(r, r.scale(3)));
  assert.ok(!sameState(r, r.neg()));
  assert.ok(samePoint(r, r.neg()));
  assert.equal(gateOf(GATES.S.rotor.scale(2)), 'S');
  assert.equal(gateOf(e1), null);
});

test('Born rule: |0⟩ is up for sure, |1⟩ never, |+⟩ half the time', () => {
  assert.deepEqual(probUp(zero), Q.q(1));
  assert.deepEqual(probUp(GATES.X.rotor), Q.q(0));
  assert.deepEqual(probUp(GATES.H.rotor), Q.q(1, 2));
  assert.equal(probUp(e1), null);
});

test('drawn fibers: a phased state lies on its fiber, and fibers of different points are different circles', () => {
  const plus = GATES.H.rotor;
  const loop = fiber(plus, 360);
  const p = project(toQuat(plus.gp(scalar(1).add(el('1', '2')))));
  const nearest = Math.min(...loop.map((q) => Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2])));
  assert.ok(nearest < 0.05, `off the fiber by ${nearest}`);
  const other = fiber(zero, 360);
  const far = Math.min(...other.map((q) => Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2])));
  assert.ok(far > 0.05);
  assert.ok(loop.every((q) => q.every(Number.isFinite)));
});
