// The guide: the next thing to do, shown on screen. It walks through the first steps (a blade from a
// deposit, the Workbench, an extractor running into a Store), then suggests the next goal from the
// achievements tree. Each step is worked out from the state of the world, so it never gets out of
// step with what the player has actually done.
import type { Achievements } from './achievements.ts';
import type { Stack } from './items.ts';
import { STEP, opposite, type World } from './world.ts';

export interface GuideStep {
  /** e.g. "Step 2 of 5" or "Next goal" */
  label: string;
  title: string;
  hint: string;
}

export interface GuideState {
  world: World;
  inventory: (Stack | null)[];
  achievements: Achievements;
}

export function guide({ world, inventory, achievements }: GuideState): GuideStep {
  const held = (test: (s: Stack) => boolean) => inventory.some((s) => !!s && test(s));
  const hasMachine = (type: string) => held((s) => s.item.kind === 'machine' && s.item.type === type);
  const placed = (type: string) => [...world.active.values()].some((p) => {
    const b = world.get(...p);
    return b?.kind === 'machine' && b.type === type;
  });
  const benchPlaced = [...world.entries()].some(([, , , b]) => b.kind === 'workbench');
  const extractorInto = (target: string) =>
    [...world.active.values()].some(([x, y, z]) => {
      const b = world.get(x, y, z);
      if (b?.kind !== 'machine' || b.type !== 'extractor') return false;
      const [dx, dz] = STEP[opposite(b.facing)];
      return world.get(x + dx, y, z + dz)?.kind === 'deposit' && (target === 'deposit' || placed(target));
    });

  const steps: [boolean, string, string][] = [
    [
      held((s) => s.item.kind === 'element' && s.item.mv.isScalar()) || hasMachine('extractor') || placed('extractor'),
      'Take the scalar 1',
      'Break the pale deposit labelled 1, to your left. Deposits give you one blade and stay put.',
    ],
    [benchPlaced, 'Place the Workbench', 'Pick the Workbench in your hotbar, aim at the ground and place it.'],
    [
      hasMachine('extractor') || placed('extractor'),
      'Build an extractor',
      'Open the Workbench and its Build tab. An extractor costs 4 lattice and the scalar 1.',
    ],
    [
      extractorInto('deposit'),
      'Place the extractor on the e₁ deposit',
      'Aim at a side of the red e₁ deposit (ahead and to the left) and place. Its DEPOSIT side goes against the deposit and its OUT side faces away.',
    ],
    [
      extractorInto('store'),
      'Duct it into a Store',
      'Build a Store (4 lattice) and ducts (4 for 2 lattice), and lay the ducts from the extractor’s OUT side to the Store. Blades arriving in a Store stack up: that stack is e₁ growing in weight.',
    ],
  ];
  const next = steps.findIndex(([done]) => !done);
  if (next >= 0) return { label: `Step ${next + 1} of ${steps.length}`, title: steps[next][1], hint: steps[next][2] };

  const goal = achievements.next()[0];
  if (!goal) return { label: 'Every goal met', title: 'Free build', hint: 'The whole tree is done. Build whatever you like.' };
  return { label: 'Next goal', title: goal.title, hint: goal.goal };
}
