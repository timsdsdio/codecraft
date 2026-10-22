import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Factory } from './factory.ts';
import { galleryInventory, galleryWorld } from './gallery.ts';
import { MACHINE_NAMES, stackName, type MachineType, type Stack } from './items.ts';
import { GROUND, type Machine } from './world.ts';

const storeAt = (w: ReturnType<typeof galleryWorld>, x: number, z: number) =>
  (w.get(x, GROUND, z) as Extract<Machine, { type: 'store' }>).slots.filter((s): s is Stack => !!s).map(stackName);

test('the gallery shows every machine and its working lines work', () => {
  const w = galleryWorld();
  const placed = new Set<string>();
  for (const [, , , b] of w.entries()) if (b.kind === 'machine') placed.add(b.type);
  for (const t of Object.keys(MACHINE_NAMES) as MachineType[]) assert.ok(placed.has(t), `no ${t} on show`);
  const f = new Factory(w, {}, () => 0.3);
  for (let t = 0; t < 20; t += 0.05) f.step(0.05);
  assert.match(storeAt(w, 9, 25)[0] ?? '', /^\d+e₁$/, 'generator into a Store');
  assert.match(storeAt(w, 16, 25)[0] ?? '', /e₁₂$/, 'a Mill multiplying e₂ by e₁');
  assert.match(storeAt(w, 21, 25)[0] ?? '', /e₁ \+ \d*e₂$/, 'a Packer adding e₁ and e₂');
  const measured = [...storeAt(w, 34, 25), ...storeAt(w, 33, 24), ...storeAt(w, 33, 26)];
  assert.ok(measured.some((s) => /e₃$/.test(s)), `the detector measured: ${measured}`);
  assert.match(storeAt(w, 38, 24)[0] ?? '', /e₁$/, 'the sorter sent vectors aside');
  assert.match(storeAt(w, 39, 25)[0] ?? '', /^\d+$/, 'and scalars straight on');
});

test('the gallery inventory holds one of every machine', () => {
  const inv = galleryInventory();
  for (const t of Object.keys(MACHINE_NAMES) as MachineType[])
    assert.ok(inv.some((s) => s?.item.kind === 'machine' && s.item.type === t), `no ${t} to place`);
});
