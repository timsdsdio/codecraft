import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACHIEVEMENTS, Achievements, BRANCHES, layoutBranch, type Holdings } from './achievements.ts';
import { card } from './cards.ts';
import { el, machine, scalar, stack, stackOf, type Stack } from './items.ts';
import { newMachine } from './world.ts';

test('every achievement has a unique id, a known branch and parents that exist, with no cycles', () => {
  const ids = new Set(ACHIEVEMENTS.map((a) => a.id));
  assert.equal(ids.size, ACHIEVEMENTS.length);
  for (const a of ACHIEVEMENTS) {
    assert.ok(BRANCHES.some((b) => b.id === a.branch), a.id);
    for (const p of a.parents) assert.ok(ids.has(p), `${a.id} follows missing ${p}`);
  }
  const byId = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));
  const reaches = (from: string, to: string, seen = new Set<string>()): boolean =>
    byId.get(from)!.parents.some((p) => p === to || (!seen.has(p) && (seen.add(p), reaches(p, to, seen))));
  for (const a of ACHIEVEMENTS) assert.ok(!reaches(a.id, a.id), `${a.id} is its own ancestor`);
});

test('every achievement can be reached from the root by earning parents', () => {
  const got = new Achievements();
  let grew = true;
  while (grew) {
    grew = false;
    for (const a of ACHIEVEMENTS) if (!got.earned.has(a.id) && got.reachable(a)) (got.earned.set(a.id, 0), (grew = true));
  }
  assert.equal(got.earned.size, ACHIEVEMENTS.length);
});

test('each branch lays out with no two nodes in one place, and parents to the left of children', () => {
  for (const b of BRANCHES) {
    const { nodes, edges } = layoutBranch(b.id);
    const places = new Set(nodes.map((n) => `${n.col},${n.row}`));
    assert.equal(places.size, nodes.length, b.id);
    const col = new Map(nodes.map((n) => [n.a.id, n.col]));
    for (const [from, to] of edges) assert.ok(col.get(from)! < col.get(to)!, `${from} → ${to}`);
  }
});

const holdings = (stacks: Stack[], extra: Partial<Holdings> = {}): Holdings => ({
  stacks,
  machines: [],
  workbenchPlaced: false,
  learned: { join: false, meter: false, multiply: false },
  ...extra,
});
const earns = (h: Holdings) => new Achievements().check(h).map((a) => a.id);
const e1 = el('1');
const e2 = el('2');
const e3 = el('3');

test('a goal is met by holding the thing it names, wherever it is', () => {
  assert.ok(earns(holdings([stackOf(e1)!])).includes('direction'));
  assert.ok(!earns(holdings([stackOf(e1)!])).includes('three-axes'));
  assert.ok(earns(holdings([stackOf(e1)!, stackOf(e2)!, stackOf(e3)!])).includes('three-axes'));
  assert.ok(earns(holdings([stackOf(e1.scale(8))!])).includes('count-up'), 'a stack of weight 8 counts');
  assert.ok(!earns(holdings([stackOf(e1.scale(7))!])).includes('count-up'));
  assert.ok(earns(holdings([stackOf(e1.op(e2))!])).includes('oriented-area'));
  assert.ok(earns(holdings([stackOf(e1.add(e2))!])).includes('head-to-tail'));
  assert.ok(earns(holdings([stackOf(scalar(-1))!])).includes('minus-one'));
  assert.ok(!earns(holdings([stackOf(scalar(1))!])).includes('minus-one'));
});

test('learning a rule, placing machines and pressing cards meet their goals', () => {
  assert.ok(earns(holdings([], { learned: { join: true, meter: false, multiply: false } })).includes('learn-join'));
  assert.ok(earns(holdings([], { workbenchPlaced: true })).includes('workbench'));
  assert.ok(earns(holdings([stack(machine('store'))])).includes('built'), 'a Store carried');
  assert.ok(earns(holdings([], { machines: [newMachine('store', 0)] })).includes('built'), 'or placed');
  assert.ok(!earns(holdings([stack(machine('generator'))])).includes('generator'), 'a Generator must be placed');
  assert.ok(earns(holdings([], { machines: [newMachine('generator', 0)] })).includes('generator'));
  assert.ok(earns(holdings([stack(card('reverse', null))])).includes('backwards'));
  const quarter = scalar(1).add(e2.op(e1));
  assert.ok(earns(holdings([stack(card('turn', quarter))])).includes('turn'), 'a Turn card taking e₁ to e₂ and e₂ to −e₁');
});

test('readings count only as readings, not as elements', () => {
  const r = stack({ kind: 'reading', mv: e1 });
  const met = earns(holdings([r]));
  assert.ok(met.includes('gauss'));
  assert.ok(!met.includes('direction'));
});

test('a met goal stays met once the thing is gone, and is reported once', () => {
  const a = new Achievements();
  assert.ok(a.check(holdings([stackOf(e1)!])).some((g) => g.id === 'direction'));
  assert.ok(!a.check(holdings([])).some((g) => g.id === 'direction'));
  assert.ok(a.earned.has('direction'));
});

test('the Hopf goals: a fiber, four phases round it, and two linked fibers', () => {
  const orrery = (seen: ReturnType<typeof el>[]) => {
    const m = newMachine('orrery', 0) as Extract<ReturnType<typeof newMachine>, { type: 'orrery' }>;
    m.seen = seen;
    return holdings([], { machines: [m] });
  };
  const up = scalar(1);
  const phase = scalar(1).add(el('1', '2'));
  const phases = [up, up.gp(phase), up.gp(phase).gp(phase), up.gp(phase).gp(phase).gp(phase)];
  assert.ok(earns(orrery([up])).includes('fiber'));
  assert.ok(!earns(orrery([up])).includes('linked'));
  assert.ok(!earns(orrery(phases.slice(0, 3))).includes('round-the-fiber'));
  assert.ok(earns(orrery(phases)).includes('round-the-fiber'), 'four phases of |0⟩');
  assert.ok(earns(orrery([up, el('2', '3')])).includes('linked'), 'up and down');
});
