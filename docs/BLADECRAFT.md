# Bladecraft

A single-player factory game in the spirit of Minecraft with a tech mod, or shapez, minus the
nature: no trees, animals or weather. The things you extract, carry and deliver are elements of a
geometric algebra, and machines combine them. The name comes from *blades*, the basis elements of
the algebra (e₁, e₁₂, e₁₂₃, …).

The game is also a way to learn geometric algebra. Every idea it uses is something you build with,
and the hub's orders and an optional achievement tree walk through the ideas in order.

## The algebra

Elements are from G(3), the geometric algebra of 3D space. An element is a sum of a scalar, a
vector (e₁, e₂, e₃), a bivector (e₁₂, e₁₃, e₂₃) and a trivector (e₁₂₃), each with a coefficient.
Coefficients are exact rationals (`packages/ga`), because elements only stack with exactly equal
elements and the hub only counts exact matches; floating point would split them.

The algebra axes are tied to the world: e₁ points east, e₂ north and e₃ up. An e₁ is drawn as an
arrow pointing east wherever it appears. These three form a right-handed set, so the orientation of
e₁₂ (east turning toward north) is counter-clockwise seen from above.

Every element is drawn by grade, layered when it mixes grades (`glyph.ts`, `Icon.tsx`):

| Grade | Picture |
|---|---|
| scalar | an orb, white for positive, magenta for negative, larger for larger values |
| vector | an arrow, in the axis colour when on an axis (e₁ red, e₂ green, e₃ blue) |
| bivector | a square of plane with a ring of arrows for its orientation, turning slowly in its own plane |
| trivector | a wire cube, gold for +e₁₂₃, magenta for −e₁₂₃ |

`packages/ga` handles any signature, so the projective algebra G(3,0,1) (points, lines, planes and
every rigid motion) is already available to the game.

## The world

A 64 × 64 grid of lattice, three blocks deep. The hub stands just north of spawn, with one deposit
of each raw element a few steps away: e₁ (red) and e₂ (green) beside the hub, the scalar 1 (pale)
and e₃ (blue) beside spawn. More deposits stand further out. Every block says what it is on its
faces: deposits carry their element in large letters, and machines show their symbol on top and
OUT, A, B or DEPOSIT on their sides.

Deposits never run out. Breaking one by hand gives one of its element and leaves it standing, so
no world can be stuck without a source. Breaking anything else picks it up, along with whatever it
holds. You start with an algebra bench and 32 lattice; each delivered order adds 16 more. The world,
inventory, factory and achievements are saved in the browser.

## The factory

Every machine faces one of four directions and pushes what it makes out of its front (OUT) into the
block there. What a block takes depends on the side something arrives from (`factory.ts`):

| Block | Takes | Does |
|---|---|---|
| Extractor | nothing | with a deposit behind its DEPOSIT side, draws that element out every 1.5 s |
| Duct | anything, from any side but its front, one at a time | carries it the way it points, 1.5 blocks a second |
| Adder, Wedger, Multiplier | A from its back, B from either side | when A and B are both there, works for a second and outputs A + B, A ∧ B or A B |
| Sandwich press | A from its back, B from either side | outputs B A B⁻¹: B turns (a rotor) or reflects (a vector) A |
| Collector | anything, up to 256 | stores it; its panel gives everything to you |
| Hub | anything, from any side | counts elements that match its current order |

A blocked output waits, and everything behind it backs up, so elements are never lost. Results of 0
(e₁ ∧ e₁) and sandwiches whose B has no inverse vanish.

An operation machine's panel can fix B to one of your elements. The machine then uses it for every
A, so one duct of A is enough: a wedger with B fixed to e₃ wedges everything with e₃, and a sandwich
press with B fixed to a rotor turns everything that passes through. Setting a fixed B takes one of
that element from you; clearing it gives it back.

Placing a duct or machine points it the way you face, and Rotate (R on a keyboard) turns it a
quarter turn before you place it; a placed machine's panel can rotate it too. An extractor turns
itself so its DEPOSIT side is against the deposit you aimed at. A ghost outline shows where the block
will go and which way it will face, red when it can't go there.

## Building machines

Machines are built at the algebra bench from lattice and elements you made yourself, so doing an
operation by hand once is what lets you automate it (`recipes.ts`):

| Machine | Costs |
|---|---|
| 4 ducts | 2 lattice |
| Extractor | 4 lattice, the scalar 1 |
| Collector | 4 lattice |
| Adder | 4 lattice, a vector off the axes (e₁ + e₂) |
| Wedger | 4 lattice, a bivector (e₁ ∧ e₂) |
| Multiplier | 4 lattice, a rotor (scalar + bivector, such as e₁(e₁ + e₂)) |
| Sandwich press | 4 lattice, a rotor, a trivector (e₁ ∧ e₂ ∧ e₃) |

The bench's other tab combines elements by hand. It has two inputs, A and B, and shows the result
of every operation at once, so you can compare them before making one: A + B, A − B, A ∧ B, A B,
A ⌋ B (left contraction), A B A⁻¹ (A applied to B) and Ã (reverse). Making something uses one A
and one B; a result of 0 uses nothing.

## Hub orders

The hub's orders run in sequence (`orders.ts`). Each asks for 8 of one element, and its hint names
the machine and inputs that make it. The element the hub wants floats above it.

1. e₁: an extractor and ducts
2. e₁ + e₂: an adder
3. e₁₂: a wedger
4. −e₁₂: a wedger with its inputs swapped
5. 1 + e₁₂: a multiplier, e₁ times e₁ + e₂
6. e₁₂₃: two wedgers in a row
7. −e₁ + e₂: a sandwich press with B fixed to 1 − e₁₂, fed e₁ + e₂

## The guide

A card in the corner says what to do next. Until the first element reaches the hub it walks through
the first steps: take the scalar 1, place the bench, build an extractor, place it on the e₁ deposit,
build ducts, duct e₁ to the hub. After that it shows the hub's current order with its progress and
hint. Each step is worked out from the state of the world (`guide.ts`), so it always matches what
the player has done. Tapping the card hides or shows the hint.

## Achievements

Achievements are optional. Like Minecraft's advancements they don't lock anything; they are
milestones arranged as a tree, where an achievement's parents are the ideas it builds on. Any
achievement can be earned at any time, and the algebra ones count whether the operation happens at
the bench or in a machine. An achievement appears in the tree once one of its parents is earned.
Each has a goal and a lesson, and the lesson can be read at any time (`achievements.ts`).

The tree starts with breaking ground and collecting the three axes, branches into adding vectors,
squaring a vector and the outer product, and leads through bivectors squaring to −1, volume and
mixed grades to rotors, applying rotors, reflections, and the factory: building a machine,
delivering to the hub, filling an order and having a machine do an operation.

## Controls

- **Desktop:** WASD moves, the mouse looks (pointer lock), space jumps. Left click breaks (or takes
  from a deposit). Right click uses the bench, a machine or the hub, and otherwise places; shift +
  right click always places. R rotates what you're about to place, 1–9 or the wheel pick a hotbar
  slot, E opens your items, L the achievements. The line under the crosshair names the block and
  what each click would do to it.
- **Touch:** the left side is a joystick wherever the thumb lands; the right side drags to look.
  Buttons on the right appear when they apply: Break (Take on a deposit), Use, Place, Rotate when
  holding a machine, and Jump.
- **Items:** tap a hotbar slot to hold it; tap the held slot again to open your items. There, tap
  an item to see what it is and move it between the hotbar and storage, or swap it with another slot.

## Open questions

- Should ducts split and merge (a splitter block, or ducts that alternate outputs), so one extractor
  can feed both inputs of a machine?
- Should projective GA arrive as a second tier of orders, with points, lines and planes as
  elements and translations as machines?
- How should larger coefficients be made: an adder looping back on itself, or a scaling machine?
- Should the hub's orders keep going after the last one, generated from the elements the player has
  already made?
