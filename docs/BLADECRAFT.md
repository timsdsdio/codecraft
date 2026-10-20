# Bladecraft

A single-player block-building game in the spirit of Minecraft with a tech mod, minus the nature:
no trees, animals or weather. The things you collect, carry and build with are elements of a
geometric algebra, and machines are what you get by combining them. The name comes from *blades*,
the basis elements of the algebra (e₁, e₁₂, e₁₂₃, …).

The game is also a way to learn geometric algebra. Every idea it uses is something you can pick
up, combine and stand on, and an optional achievement tree walks through the ideas in order.

## The algebra

Items are elements of G(3), the geometric algebra of 3D space. An element is a sum of a scalar,
a vector (e₁, e₂, e₃), a bivector (e₁₂, e₁₃, e₂₃) and a trivector (e₁₂₃), each with a coefficient.
Coefficients are exact rationals (`packages/ga`), because items only stack with exactly equal
items and floating point would split one stack into many.

The algebra axes are tied to the world: e₁ points east, e₂ north and e₃ up. An e₁ item is drawn as
an arrow pointing east in your hand, in the inventory and in the world. These three form a
right-handed set, so the orientation of e₁₂ (east turning toward north) is counter-clockwise seen
from above.

Every element is drawn by grade, layered when it mixes grades (`glyph.ts`, `Icon.tsx`):

| Grade | Picture |
|---|---|
| scalar | an orb, white for positive, magenta for negative, larger for larger values |
| vector | an arrow, in the axis colour when on an axis (e₁ red, e₂ green, e₃ blue) |
| bivector | a square of plane with a ring of arrows for its orientation; in the world it turns slowly in its own plane |
| trivector | a wire cube, gold for +e₁₂₃, magenta for −e₁₂₃ |

`packages/ga` handles any signature, so the projective algebra G(3,0,1) (points, lines, planes and
every rigid motion) is already available to the game.

## The world

A 64 × 64 grid of lattice, three blocks deep, with outcrops of deposits standing on it and some
buried just under the surface. Deposits hold e₁, e₂, e₃ and the scalar 1, coloured red, green,
blue and pale yellow. Breaking a deposit gives its element; breaking lattice gives lattice to build
with. You start with an algebra bench and a stack of lattice. The world, inventory and achievements
are saved in the browser.

## The algebra bench

The bench has two inputs, A and B, and shows the result of every operation at once, so you can
compare them before making one:

| Operation | Result |
|---|---|
| A + B, A − B | sum and difference |
| A ∧ B | outer product: the oriented area (or volume) A and B span |
| A B | geometric product |
| A ⌋ B | left contraction, the inner product |
| A B A⁻¹ | A applied to B: a rotor turns B, a vector reflects it; no result when A has no inverse |
| Ã | reverse of A |

Making something uses one A and one B. A result of 0 uses nothing, so trying e₁ ∧ e₁ costs
nothing and still counts toward its achievement.

## Machines

Any element placed in the world is a machine: a glass block with the element's glyph inside. It
acts on the player standing on it:

- **Vector part, horizontal:** pushes along the arrow, 2.5 blocks a second per unit of length.
- **Scalar part, and the e₃ part:** launches you upward, harder for larger values.
- **e₁₂ part:** turns you around the block's centre, counter-clockwise from above for +e₁₂.

So 2e₁ is a fast conveyor east, 1 + e₁₂ a spinning spring, and e₁ + e₂ a conveyor north-east.

## Achievements

Achievements are optional. Like Minecraft's advancements they don't lock anything; they are
milestones arranged as a tree, where an achievement's parents are the ideas it builds on. Any
achievement can be earned at any time. An achievement appears in the tree once one of its parents
is earned, which brings the next ideas into view without showing the whole tree at the start.
Each one has a goal (what to do) and a lesson (the idea it shows), and the lesson can be read at
any time. The tree is defined in `apps/bladecraft/src/game/achievements.ts`.

The tree starts with breaking ground and collecting the three axes, branches into adding vectors,
the geometric product of a vector with itself, and the outer product, and leads through bivectors
squaring to −1, volume and mixed grades to rotors, applying rotors and reflections, and machines.

## Controls

- **Desktop:** WASD moves, the mouse looks (pointer lock), space jumps, left click breaks, right
  click places the held item or opens a bench, 1–9 or the wheel picks a hotbar slot, E opens the
  inventory, L the achievements.
- **Touch:** the left thumb is a joystick wherever it lands, the right thumb drags to look; a tap
  places or opens a bench, holding breaks. Jump, items and achievements are buttons.

## Open questions

- Which machines act on items rather than the player? Conveyors carrying items need item entities
  in the world, and a rotor machine that turns whatever passes through it is the natural next step.
- Should projective GA arrive as a second tier, unlocked by the achievement tree, with points,
  lines and planes as building blocks and translations as machines?
- How should larger coefficients be earned: by repeated addition only, or with a scaling machine?
- Should the bench itself be made from algebra (for example, crafted from a trivector) instead of
  given at the start?
