// The guide: the next thing to do, shown on screen until the first element reaches the hub, then
// the hub's current order. Each step is worked out from the state of the world, so it never gets
// out of step with what the player has actually done.
import type { Inventory } from './items.ts';
import { ORDERS, type HubProgress } from './orders.ts';
import { STEP, opposite, type World } from './world.ts';

export interface GuideStep {
  /** e.g. "Step 2 of 6" or "Order 3 of 7" */
  label: string;
  title: string;
  hint: string;
  /** progress through an order, when the step is one */
  progress?: { done: number; of: number };
}

export interface GuideState {
  world: World;
  inventory: Inventory;
  hub: HubProgress;
  /** anything has ever reached the hub */
  delivered: boolean;
}

function inWorld(world: World, test: (b: NonNullable<ReturnType<World['get']>>, x: number, y: number, z: number) => boolean) {
  for (const [x, y, z] of world.active.values()) {
    const b = world.get(x, y, z);
    if (b && test(b, x, y, z)) return true;
  }
  return false;
}

export function guide({ world, inventory, hub, delivered }: GuideState): GuideStep {
  const has = (type: string) => inventory.count((i) => i.kind === 'machine' && i.type === type) > 0;
  const placed = (type: string) => inWorld(world, (b) => b.kind === 'machine' && b.type === type);
  const benchPlaced = [...world.entries()].some(([, , , b]) => b.kind === 'bench');
  const extractorWorking = inWorld(world, (b, x, y, z) => {
    if (b.kind !== 'machine' || b.type !== 'extractor') return false;
    const [dx, dz] = STEP[opposite(b.facing)];
    return world.get(x + dx, y, z + dz)?.kind === 'deposit';
  });

  const steps: [boolean, string, string][] = [
    [
      inventory.count((i) => i.kind === 'element' && i.mv.isScalar()) > 0 || has('extractor') || placed('extractor'),
      'Take the scalar 1',
      'Break the pale deposit labelled 1, to your left. Deposits give you one of their element and stay put.',
    ],
    [benchPlaced, 'Place your algebra bench', 'Pick the bench in your hotbar, aim at the ground and Place it.'],
    [
      has('extractor') || placed('extractor'),
      'Build an extractor',
      'Use the bench and open Build. An extractor costs 4 lattice and the scalar 1.',
    ],
    [
      extractorWorking,
      'Place the extractor on the e₁ deposit',
      'Aim at a side of the red e₁ deposit (ahead and to the left) and Place. Its DEPOSIT side goes against the deposit and its OUT side faces away.',
    ],
    [has('duct') || placed('duct'), 'Build ducts', 'At the bench, Build gives 4 ducts for 2 lattice.'],
    [
      delivered,
      'Duct e₁ to the hub',
      'Place ducts in a line from the extractor’s OUT side to the hub. A duct points the way you face; Rotate turns it before you place.',
    ],
  ];
  const next = steps.findIndex(([done]) => !done);
  if (next >= 0) return { label: `Step ${next + 1} of ${steps.length}`, title: steps[next][1], hint: steps[next][2] };

  const order = ORDERS[hub.order];
  if (!order) return { label: 'All orders delivered', title: 'Free build', hint: 'Every order is done. Build whatever you like, or chase the remaining achievements.' };
  return {
    label: `Order ${hub.order + 1} of ${ORDERS.length}`,
    title: `Deliver ${order.count} × ${order.want}`,
    hint: order.hint,
    progress: { done: hub.delivered, of: order.count },
  };
}
