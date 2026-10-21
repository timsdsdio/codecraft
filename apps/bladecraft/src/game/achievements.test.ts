import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACHIEVEMENTS, Achievements, BRANCHES, layoutBranch } from './achievements.ts';
import { el, scalar } from './items.ts';
import { ORDERS } from './orders.ts';

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
    for (const a of ACHIEVEMENTS) if (!got.earned.has(a.id) && got.visible(a)) (got.earned.set(a.id, 0), (grew = true));
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

const earns = (e: Parameters<Achievements['notice']>[0]) => new Achievements().notice(e).map((a) => a.id);

test('the new algebra goals: contraction, reverse and duality', () => {
  const e1 = el('1');
  const e12 = el('1').op(el('2'));
  assert.ok(earns({ type: 'craft', by: 'hand', op: 'contract', a: e1, b: e12, result: e1.lc(e12) }).includes('whats-left'));
  assert.ok(earns({ type: 'craft', by: 'hand', op: 'reverse', a: e12, b: null, result: e12.reverse() }).includes('backwards'));
  const I = e12.op(el('3'));
  assert.ok(earns({ type: 'craft', by: 'hand', op: 'product', a: I, b: el('3'), result: I.gp(el('3')) }).includes('right-angles'));
  assert.ok(!earns({ type: 'craft', by: 'hand', op: 'reverse', a: scalar(2), b: null, result: scalar(2) }).includes('backwards'));
});

test('logistics goals and finishing each tier of orders', () => {
  assert.deepEqual(earns({ type: 'route', kind: 'split' }), ['fork']);
  assert.deepEqual(earns({ type: 'route', kind: 'cross' }), ['crossroads']);
  const last = (kinds: string[]) => ORDERS.reduce((n, o, i) => (kinds.includes(o.kind ?? 'exact') ? i : n), -1);
  assert.ok(earns({ type: 'order', index: last(['exact']) }).includes('algebra-delivered'));
  assert.ok(earns({ type: 'order', index: last(['state', 'phases']) }).includes('qubits-delivered'));
  assert.ok(earns({ type: 'order', index: ORDERS.length - 1 }).includes('every-order'));
  assert.ok(!earns({ type: 'order', index: 0 }).includes('algebra-delivered'));
});
