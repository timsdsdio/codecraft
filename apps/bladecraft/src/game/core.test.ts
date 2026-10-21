import { test } from 'node:test';
import assert from 'node:assert/strict';
import { G3, Multivector, Q } from '@codecraft/ga';
import { el, scalar, split, stackOf, valueOf, stack, machine, half, one, type Stack } from './items.ts';
import { addTo, distribute, leftClick, quickMove, removeUnits, rightClick, countUnits, type Slots } from './slots.ts';
import { RULES, autoSort, newRail, product, railResult, sorted, tap, terms, bladeOf } from './products.ts';
import { applyCard, card, lampCount, millOutput } from './cards.ts';

const e1 = el('1');
const e2 = el('2');
const e3 = el('3');
const e12 = e1.op(e2);
const s = (mv: Multivector) => stackOf(mv)!;
const val = (st: Stack | null) => (st ? String(valueOf(st) ?? st.item.kind) : 'empty');

// --- weights -----------------------------------------------------------------------------------

test('a multivector splits into a weight and a primitive base with whole, coprime coefficients', () => {
  const r = split(scalar(2).add(e12.scale(2)));
  assert.ok(r.base.equals(scalar(1).add(e12)) && Q.eq(r.weight, Q.q(2)));
  const n = split(e1.scale(-3));
  assert.ok(n.base.equals(e1) && Q.eq(n.weight, Q.q(-3)));
  const f = split(e1.scale(Q.q(1, 2)).add(e2.scale(Q.q(3, 4))));
  assert.ok(f.base.equals(e1.scale(2).add(e2.scale(3))) && Q.eq(f.weight, Q.q(1, 4)));
  assert.equal(stackOf(e1.scale(0)), null);
});

// --- Minecraft clicks --------------------------------------------------------------------------

test('left click picks up, puts down, merges multiples and swaps different things', () => {
  const slots: Slots = [s(e1), s(e1.scale(2)), s(e2), null];
  let cur = leftClick(slots, 0, null);
  assert.equal(val(cur), 'e₁');
  cur = leftClick(slots, 1, cur);
  assert.equal(cur, null);
  assert.equal(val(slots[1]), '3e₁', 'stacking adds the weights');
  cur = leftClick(slots, 1, null);
  cur = leftClick(slots, 2, cur);
  assert.equal(val(cur), 'e₂', 'different things swap');
  assert.equal(val(slots[2]), '3e₁');
  cur = leftClick(slots, 3, cur);
  assert.deepEqual(slots.map(val), ['empty', 'empty', '3e₁', 'e₂']);
});

test('putting an element down on its opposite cancels them; a pickup never does', () => {
  const slots: Slots = [s(e1.scale(3))];
  const left = leftClick(slots, 0, s(e1.neg()));
  assert.equal(left, null);
  assert.equal(val(slots[0]), '2e₁');
  const rest = addTo(slots, s(e1.scale(-5)));
  assert.equal(val(slots[0]), '2e₁', 'a pickup leaves the opposite stack alone');
  assert.equal(val(rest), '−5e₁');
  leftClick(slots, 0, s(e1.scale(-2)));
  assert.equal(slots[0], null, 'exact opposites cancel to nothing');
});

test('right click takes the larger half and puts down one unit; multivectors split by their factor', () => {
  const slots: Slots = [s(e1.scale(5)), null, s(scalar(3).add(e12.scale(3)))];
  let cur = rightClick(slots, 0, null);
  assert.equal(val(cur), '3e₁');
  assert.equal(val(slots[0]), '2e₁');
  cur = rightClick(slots, 1, cur);
  assert.equal(val(slots[1]), 'e₁');
  assert.equal(val(cur), '2e₁');
  const h = half(slots[2]!);
  assert.equal(val(h.taken), '2 + 2e₁₂');
  assert.equal(val(h.rest), '1 + e₁₂');
  assert.equal(val(one(s(e1.scale(Q.q(1, 2)))).taken), '1/2e₁', 'less than one unit moves whole');
});

test('ordinary items stack by count up to 64; a full stack takes no more', () => {
  const slots: Slots = [stack(machine('duct'), 60), null];
  const rest = addTo(slots, stack(machine('duct'), 10));
  assert.equal(Q.toNumber(slots[0]!.count), 64);
  assert.equal(Q.toNumber(slots[1]!.count), 6);
  assert.equal(rest, null);
});

test('shift click moves a stack to the other side, merging first', () => {
  const inv: Slots = [s(e1.scale(2)), null];
  const box: Slots = [s(e1), null, null];
  quickMove(inv, 0, box);
  assert.deepEqual(box.map(val), ['3e₁', 'empty', 'empty']);
  assert.equal(inv[0], null);
});

test('dragging spreads the cursor: evenly with the left button, one each with the right', () => {
  const slots: Slots = [null, s(e1), s(e2), null];
  const left = distribute(slots, [0, 1, 2, 3], s(e1.scale(7)), 'even');
  assert.deepEqual(slots.map(val), ['2e₁', '3e₁', 'e₂', '2e₁'], 'e₂ is skipped');
  assert.equal(val(left), 'e₁');
  const ones: Slots = [null, null];
  distribute(ones, [0, 1], stack({ kind: 'lattice' }, 5), 'one');
  assert.deepEqual(ones.map((x) => Q.toNumber(x!.count)), [1, 1]);
});

test('recipes count and take whole positive units', () => {
  const slots: Slots = [s(e12.scale(2)), s(e12.neg()), s(e1)];
  const isBi = (i: { kind: string; mv?: Multivector }) => i.kind === 'element' && i.mv!.grades().join() === '2';
  assert.equal(countUnits(slots, isBi as never), 2);
  assert.ok(removeUnits(slots, isBi as never, 1));
  assert.equal(val(slots[0]), 'e₁₂');
});

// --- the three rules as one sort ---------------------------------------------------------------

const blades = [0, 1, 2, 3, 4, 5, 6, 7].map((b) => Multivector.blade(G3, b));

test('sorting by hand on the rail agrees with the library for every pair of blades and every rule', () => {
  for (const rule of RULES)
    for (const a of blades)
      for (const b of blades) {
        let rail = newRail(bladeOf(a), bladeOf(b));
        for (const i of autoSort(rail)) rail = tap(rail, i);
        assert.ok(sorted(rail));
        const r = railResult(rail, rule);
        const got = r ? Multivector.blade(G3, r.blade, r.sign) : a.scale(0);
        assert.ok(got.equals(product(rule, a, b)), `${a} ${rule} ${b}: rail ${got}, library ${product(rule, a, b)}`);
      }
});

test('e₁₂ × e₂₃: Join and Meter both give 0, Multiply gives e₁₃ (the middle grade)', () => {
  const e23 = e2.op(e3);
  assert.ok(product('join', e12, e23).isZero());
  assert.ok(product('meter', e12, e23).isZero());
  assert.ok(product('multiply', e12, e23).equals(e1.op(e3)));
});

test('for vectors, Join + Meter is the geometric product (and the grid is the distributive law)', () => {
  const a = e1.add(e2);
  const b = e1.sub(e2);
  assert.ok(product('join', a, b).add(product('meter', a, b)).equals(product('multiply', a, b)));
  const grid = terms(a).flatMap((x) => terms(b).map((y) => product('multiply', x, y)));
  assert.ok(grid.reduce((acc, c) => acc.add(c)).equals(e12.scale(-2)));
});

// --- cards and the Mill ------------------------------------------------------------------------

test('cards: join, meter, multiply from either side, turn, reverse and sieve', () => {
  assert.ok(applyCard(card('join', e1), e2)!.equals(e12));
  assert.ok(applyCard(card('meter', e1), e12)!.equals(e2));
  const I = e12.op(e3);
  assert.ok(applyCard(card('multiply', I), e1)!.equals(e2.op(e3)), 'an I card is the dualizer: e₁ becomes e₂₃');
  assert.ok(applyCard(card('multiply', e1, true), e2)!.equals(e2.gp(e1)), 'turned end to end it multiplies from the right');
  const quarter = scalar(1).sub(e12);
  assert.ok(applyCard(card('turn', quarter), e1)!.equals(e2), '1 − e₁₂ turns e₁ to e₂');
  assert.ok(applyCard(card('turn', quarter.scale(2)), e1)!.equals(e2), 'a turn forgets the size of its rotor');
  assert.ok(applyCard(card('turn', e1.add(e2)), e1)!.equals(e2), 'a vector turn mirrors');
  assert.ok(applyCard(card('turn', quarter), scalar(1))!.equals(scalar(1)), 'imprinting a Turn card gives 1, not its rotor');
  assert.ok(applyCard(card('reverse', null), scalar(1).add(e12))!.equals(scalar(1).sub(e12)));
  assert.ok(applyCard(card('sieve', e12), scalar(3).add(e1).add(e12))!.equals(e12), 'keeps the grades of its multivector');
  assert.equal(applyCard(card('turn', scalar(1).add(e1)), e2), null, '1 + e₁ has no inverse as a versor');
});

test('a Mill adds cards side by side and runs the second deck on the first', () => {
  const x = e1.add(e2);
  assert.ok(millOutput([card('join', e1), card('meter', e1)], [], x).equals(scalar(1).add(e12)), 'the halves make the product');
  const twoDecks = millOutput([card('multiply', scalar(1).sub(e12))], [card('multiply', scalar(1).add(e12), true)], e1);
  assert.ok(twoDecks.equals(e2.scale(2)), 'two multiplies make a scaled turn');
  assert.ok(millOutput([], [], x).equals(x), 'an empty Mill passes things through');
  assert.equal(lampCount([card('join', e1), card('meter', e1)], [], x), 4);
});
