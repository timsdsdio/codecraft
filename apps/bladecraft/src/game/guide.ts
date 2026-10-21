// The guide: the next thing to do, shown on screen. It walks through the first steps (blades from
// deposits, the Workbench, adding on the tray, a Store), then suggests the next goal from the
// achievements tree. Each step is worked out from the state of the world, so it never gets out of
// step with what the player has actually done.
import type { Achievements } from './achievements.ts';
import type { Stack } from './items.ts';
import type { World } from './world.ts';

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
  const placed = (type: string) => [...world.active.values()].some((p) => {
    const b = world.get(...p);
    return b?.kind === 'machine' && b.type === type;
  });
  const benchPlaced = [...world.entries()].some(([, , , b]) => b.kind === 'workbench');
  const holds = (label: string) => held((s) => s.item.kind === 'element' && String(s.item.mv) === label);
  const added = achievements.earned.has('head-to-tail') || held((s) => s.item.kind === 'element' && s.item.mv.grades().join() === '1' && s.item.mv.terms.size > 1);

  const steps: [boolean, string, string][] = [
    [
      holds('e₁') && holds('e₂'),
      'Break two deposits',
      'Break the top of the red e₁ deposit (ahead and to the left) and the green e₂ one (ahead and to the right). A deposit breaks into 4 blades.',
    ],
    [benchPlaced, 'Place the Workbench', 'Pick the Workbench in your hotbar, aim at the ground and place it.'],
    [
      added,
      'Add e₁ and e₂',
      'Open the Workbench, drop an e₁ and an e₂ on the tray, and press Take all: you get e₁ + e₂, one item, a vector off the axes.',
    ],
    [
      placed('store'),
      'Build a Store',
      'In the Workbench’s Build tab a Store costs 4 lattice. Place it and open it: it holds 27 stacks, and stacks put in it still add up.',
    ],
  ];
  // a step counts as done once any step after it is, so the guide never steps back
  for (let i = steps.length - 2; i >= 0; i--) steps[i][0] ||= steps[i + 1][0];
  const next = steps.findIndex(([done]) => !done);
  if (next >= 0) return { label: `Step ${next + 1} of ${steps.length}`, title: steps[next][1], hint: steps[next][2] };

  const goal = achievements.next()[0];
  if (!goal) return { label: 'Every goal met', title: 'Free build', hint: 'The whole tree is done. Build whatever you like.' };
  return { label: 'Next goal', title: goal.title, hint: goal.goal };
}
