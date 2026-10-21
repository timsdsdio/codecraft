# Bladecraft

A single-player factory game in the spirit of Minecraft with a tech mod, or shapez, minus the
nature: no trees, animals or weather. The things you extract, carry and deliver are elements of a
geometric algebra, and machines combine them. The name comes from *blades*, the basis elements of
the algebra (e₁, e₁₂, e₁₂₃, …).

The game is also a way to learn geometric algebra, and through it quantum states and
electromagnetism: a rotor is a qubit, the Hopf fibration is something you build and watch, and
Maxwell's four equations are one equation for one multivector field that you lay out on the floor. Every idea it uses is something you build
with, and the hub's orders and an optional achievement tree walk through the ideas in order.

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
| Gate | A from its back, B from either side, or a preset gate | outputs B A: the gate B applied to the qubit state A |
| Bloch projector | A from any side but its front | outputs A e₃ A⁻¹, the state's Bloch vector |
| Detector | A from any side but its front | measures the state: outputs e₃ or −e₃ by the Born rule |
| Fibration orrery | A from any side but its front | passes it through, drawing the Hopf fiber of each distinct state |
| Splitter | anything, from its back | deals elements out of its front, left and right in turn, skipping a side that can't take one |
| Merger | one element at a time from each of its back, left and right | sends them out of its front, taking each input in turn so none starves the others |
| Sorter | anything, from its back | sends matches out of one side (left or right, set in its panel) and everything else out of its front |
| Crossing | one element at a time from each side | sends each out of the side opposite where it came in, so two lines can cross |
| Charge | a scalar, from any side | in a field, holds that scalar as its charge |
| Wire | a vector, from any side | in a field, carries a current up along e₃ as big as the vector's e₃ part |
| Antenna | a vector, from any side | in a field, carries a current that swings up and down, as big as the vector's e₃ part at its peak |
| Field probe | nothing | in a field, outputs a reading of the field where it stands once a second |
| Collector | anything, up to 256 | stores it; its panel gives everything to you |
| Hub | anything, from any side | counts elements that match its current order |

A sorter matches either elements equal to a sample, picked in its panel from your elements and not
used up, or every element of one kind: scalars, vectors, bivectors, trivectors or qubit states.

A blocked output waits, and everything behind it backs up, so elements are never lost. Results of 0
(e₁ ∧ e₁), sandwiches whose B has no inverse, anything that isn't a state sent to the projector or
detector, and anything but a scalar sent to a charge or a vector sent to a wire or antenna vanish.

An operation machine's panel can fix B to one of your elements. The machine then uses it for every
A, so one duct of A is enough: a wedger with B fixed to e₃ wedges everything with e₃, and a sandwich
press with B fixed to a rotor turns everything that passes through. Setting a fixed B takes one of
that element from you; clearing it gives it back.

Placing a duct or machine points it the way you face, and Rotate (R on a keyboard) turns it a
quarter turn before you place it; a placed machine's panel can rotate it too. An extractor turns
itself so its DEPOSIT side is against the deposit you aimed at. A ghost outline shows where the block
will go and which way it will face, red when it can't go there.

## Qubits and the Hopf fibration

Any nonzero even element of G(3), R = a + b e₂₃ + c e₃₁ + d e₁₂, is a qubit state (`qubit.ts`). Its
length doesn't matter, so states stay exact, and two states are the same when one is a positive
multiple of the other.

- **Bloch vector.** R e₃ R⁻¹ is where the state points: the scalar 1 is |0⟩ (up, +e₃), e₂₃ is |1⟩
  (down), e₂₃ + e₁₂ is |+⟩ (along e₁). The map R ↦ R e₃ R⁻¹ from the 3-sphere of unit rotors to the
  2-sphere of directions is the Hopf fibration, and the Bloch projector is that map as a machine.
- **Phase.** e₁₂ commutes with e₃, so R(1 + e₁₂) points the same way as R. Multiplying on the right by
  a phase moves the state round a circle, its Hopf fiber, while its Bloch vector stays put. A
  multiplier with B fixed to 1 + e₁₂ is a phase shifter.
- **Gates.** A rotor on the left, G R, turns the Bloch vector by the rotation G stands for. A gate
  machine's panel sets one of five presets, which cost nothing: X ∝ e₂₃ (half turn about e₁),
  Y ∝ e₃₁, Z ∝ e₁₂, H ∝ e₂₃ + e₁₂ (half turn about the e₁ + e₃ diagonal) and S ∝ 1 − e₁₂ (quarter
  turn about e₃). None needs a square root, because the length of a state doesn't matter.
- **Measurement.** The detector finds a state up with probability (1 + z)/2, z being its Bloch
  vector's e₃ part, and outputs e₃ or −e₃.
- **The orrery.** It draws the fiber of each distinct state that passes through: all of that state's
  phases R(cos t + e₁₂ sin t), as points of the 3-sphere, projected stereographically into 3D. Each
  fiber is a ring coloured by its Bloch point, with a bead for each phase seen on it. Rings of different
  points never touch, yet every pair is linked. The 3-sphere is turned by a fixed rotor before
  projecting, so that no common state's fiber passes through the projection point and becomes a line.

## The electromagnetic field

Field plates are floor slabs you lay out like tiles (`field.ts`). Plates that touch at one height,
together with the charges, wires, antennas and probes standing among them, make one field region,
and every block of a region holds the electromagnetic field there as one multivector,
F = E + IB, where I = e₁₂₃. The electric field E is its vector part. The magnetic field B is a
vector too, but multiplied by I it becomes the bivector IB, a plane at right angles to B, so F mixes
grades 1 and 2. Maxwell's four equations are the four grades of one equation,

  (∂ₜ + ∇)F = ρ − j,  with ∇ = e₁∂₁ + e₂∂₂ + e₃∂₃

in units where light's speed and ε₀ are 1:

| Grade | Part of the equation | Law | In the game |
|---|---|---|---|
| scalar | ∇·E = ρ | Gauss's law | E spreads out from a charge, away from positive and toward negative, as q/r |
| vector | ∂ₜE − ∇×B = −j | Ampère–Maxwell law | current up a wire makes B circle it, as I/r |
| bivector | I(∂ₜB + ∇×E) = 0 | Faraday's law | a changing B makes E curl round it; with the vector part, an antenna's swinging current sends out waves |
| trivector | I ∇·B = 0 | no magnetic charge | B runs in closed loops round a wire, with no start or end |

A region is one layer, so the field depends only on e₁ and e₂ and acts as if every charge and wire
ran straight up forever. It then splits into two halves that never mix. Charges make E in the plane
of the plates, which is static because charges never move, and it is found by relaxing a potential
until ∇·E = ρ. Wires and antennas carry current along e₃, which makes E along e₃ and B in the
plane, stepped by the vector and bivector parts on a staggered grid at 20 steps a second. Waves
travel at 4 blocks a second, so an antenna's waves are 16, 8 or 4 blocks apart at its three
frequencies. Outside a region the field is 0: its edge is earthed, which bends the field near it,
and it absorbs most of a wave rather than echoing it. A gap in the plates, where a duct runs through
for example, is an edge too.

The field is computed in floating point, not exactly, because it changes smoothly in time. A probe
turns it back into an element: its reading is F with each coefficient rounded to the nearest half,
such as e₁ + ½e₂₃. A field too weak to round to a half reads 0, which a probe doesn't send. The hub
can tell a probe's readings from equal elements made any other way.

Each plate draws E as an orange arrow and IB as a translucent blue disc lying in the plane of the
bivector, and glows brighter where the field holds more energy (E² + B²). Around a charge the arrows
point out like spines; around a wire the discs stand upright and fan out from it like the pages of an
open book; an antenna sends rings of glow outward. The line under the crosshair gives a plate's E
and IB to one decimal place. A source's panel sets it from one of your elements, as well as by duct.

## How machines look

Machines are small steampunk contraptions built in code from primitives (`models.ts`): riveted iron
cabinets with brass corner posts, copper pipe ports, and brass plates engraved with what each part
is (A and B on the input ports, OUT over the output chute, the operation's symbol on top). A
reflection map makes the brass, copper and iron read as metal. Each model animates from the state
the factory leaves in its block, so you can see what a machine is doing without opening it:

| Machine | Model | Moves when |
|---|---|---|
| Extractor | a brass pump with a flywheel, pressure gauge and chimney | its rod strokes and flywheel turns once per element drawn; it stops when there's no deposit or its output is blocked |
| Duct | a conveyor belt on an iron frame, bent into a quarter circle when it is fed from one side and nothing feeds it from behind | the belt runs the way it carries, at the speed elements ride it; elements coming in from a side ride round the bend |
| Splitter | a low iron box with belts out of three sides and a brass pointer on a gear | the pointer turns to the side the next element will go out of |
| Merger | the same box with a copper hopper and a pointer | the pointer turns to the input whose turn it is |
| Sorter | the same box with a glass jar holding its sample, a flap, and a lamp on each side | the flap swings toward the side the element in hand is going; the lit lamp marks the side matches leave by |
| Crossing | two belts crossing under a brass turntable plate | the belts run |
| Adder | two meshing gears | they spin up while it works |
| Wedger | a stamping press over an anvil | the ram rises while it works and stamps down as the operation completes |
| Multiplier | a spoked flywheel with a ball governor | it spins up while it works, and the governor's balls fly out |
| Sandwich press | two jaws over a turntable | the jaws close while it works and the turntable turns a quarter per operation |
| Gate | a cabinet with a valve handwheel and a plate showing the gate's letter | the wheel turns through the gate's angle (a half turn, or a quarter for S) each operation |
| Bloch projector | a glass globe with brass meridians on a column | its pointer swings to the Bloch vector of the last state |
| Detector | a Stern–Gerlach magnet (a wedge pole over a trough pole) with two lamps | the up or down lamp flashes with each measurement |
| Fibration orrery | a brass tripod and crown | the Hopf fibers of the states it has seen turn slowly above it |
| Charge | a brass ball on a ceramic insulator | it glows red when positive and blue when negative, brighter for more charge |
| Wire | a copper rod running up out of the field between insulators | beads of light run along it with the current, up or down |
| Antenna | a coil and a mast with a crossbar and a spark ball | its beads rock up and down with the current, and the ball sparks at each peak |
| Field probe | a glass bulb at the field's height, a gauge and a spout | the bulb flashes with each reading, the needle shows how strong it is, and the reading floats above it |
| Field plate | a steel slab with a brass border | it glows with the field's energy, under the field's arrows and discs |
| Collector | a banded tank with a gauge window | the level in the window rises as it fills |
| Hub | an iron pedestal with armillary rings | the rings turn around the element it wants, and its lamp flashes as one arrives |
| Bench | a wooden workbench with a vice and a gear train | its gears turn slowly |

Every operation machine has a pilot lamp in its own colour that glows while it works, a small stand
holding its fixed B above it, and lets off a puff of steam each time it finishes an operation.

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
| Gate | 4 lattice, a rotor |
| Bloch projector | 4 lattice, e₃, a rotor |
| Detector | 4 lattice, 2 × e₃ |
| Fibration orrery | 4 lattice, a rotor, a trivector |
| Splitter, Merger | 6 lattice |
| Sorter | 6 lattice, the scalar 1 |
| Crossing | 4 lattice |
| 8 field plates | 4 lattice, a trivector |
| Charge | 4 lattice, the scalar 1 |
| Wire | 4 lattice, e₃ |
| Antenna | 4 lattice, e₃, a rotor |
| Field probe | 4 lattice, a vector, a bivector |

The bench's other tab combines elements by hand. It has two inputs, A and B, and shows the result
of every operation at once, so you can compare them before making one: A + B, A − B, A ∧ B, A B,
A ⌋ B (left contraction), A B A⁻¹ (A applied to B) and Ã (reverse). Making something uses one A
and one B; a result of 0 uses nothing.

## Hub orders

The hub's orders run in sequence (`orders.ts`), and each hint names the machine and inputs that make
the element. The first seven want exactly one element. The qubit orders want *states*: any state
pointing the right way counts, whatever its phase, and the fiber order wants states in different
phases. The field orders want probe readings of a given kind. Above the hub floats the element it
wants, or for a state order the Bloch vector it should point along, or for a field order an example
reading.

1. e₁: an extractor and ducts
2. e₁ + e₂: an adder
3. e₁₂: a wedger
4. −e₁₂: a wedger with its inputs swapped
5. 1 + e₁₂: a multiplier, e₁ times e₁ + e₂
6. e₁₂₃: two wedgers in a row
7. −e₁ + e₂: a sandwich press with B fixed to 1 − e₁₂, fed e₁ + e₂
8. 8 states pointing up (|0⟩): the scalar 1, in any phase
9. 8 states pointing down (|1⟩): a gate set to X, fed |0⟩
10. 8 states along e₁ (|+⟩): a gate set to H
11. |+⟩ in 4 different phases: multipliers with B fixed to 1 + e₁₂, ideally watched by an orrery
12. 8 states along e₂ (|+i⟩): H, then S
13. 4 readings of an electric field (a vector): a charge and a probe in a field
14. 4 readings of a magnetic field (a bivector): a wire and a probe
15. 4 readings of a wave (a vector and a bivector together): an antenna and a probe

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

The tree has four branches, each drawn as its own band read left to right, with lines from each
idea to the ones that build on it and a count of how many are earned. An idea that follows one in
another branch says so on its card ("after Volume").

- **The algebra** starts from a vector and the three axes, and branches into adding vectors,
  squaring a vector and the outer product. It leads through orientation, a vector wedged with itself,
  the reverse, bivectors squaring to −1, contraction, mixed grades, rotors, applying rotors,
  reflections, volume and duality (multiplying by e₁₂₃).
- **The factory** starts with breaking ground: building a machine, having a machine do an
  operation, delivering to the hub and filling an order, then each logistics block (a splitter
  sending to a side, a merger passing a side input, a sorter sending a match aside, a crossing) and
  finishing the algebra orders.
- **Qubits** grows from rotors: projecting a state, a gate, the Born rule, a new phase, a Hopf fiber,
  linked rings, and finishing the qubit orders.
- **The field** grows from duality, one achievement per grade of Maxwell's equation: a field,
  Gauss's law, Ampère's law, Faraday's law, no monopoles, and one equation, for a reading with E and
  IB together. Filling the hub's last order ends it.

## Controls

- **Desktop:** WASD moves, the mouse looks (pointer lock), space jumps. Left click breaks (or takes
  from a deposit). Right click uses the bench, a machine or the hub, and otherwise places; shift +
  right click always places. R rotates what you're about to place, 1–9 or the wheel pick a hotbar
  slot, E opens your items, L the achievements. Esc frees the mouse to click the buttons on screen
  while the game carries on, and clicking the world takes it back. The line under the crosshair
  names the block and what each click would do to it.
- **Touch:** the left side is a joystick wherever the thumb lands; the right side drags to look.
  Buttons on the right appear when they apply: Break (Take on a deposit), Use, Place, Rotate when
  holding a machine, and Jump.
- **Items:** tap a hotbar slot to hold it; tap the held slot again to open your items. There, tap
  an item to see what it is and move it between the hotbar and storage, or swap it with another slot.

## Open questions

- Should fields act back on the factory, with a force F on charged elements or a coil that turns a
  changing B into a current?
- Should charges be able to move, so that in-plane currents and the other half of the field (E in the
  plane with B along e₃) come into play?
- Should several qubits come next, through the tensor product, with entangling gates?
- Should projective GA arrive as a second tier of orders, with points, lines and planes as
  elements and translations as machines?
- How should larger coefficients be made: an adder looping back on itself, or a scaling machine?
- Should the hub's orders keep going after the last one, generated from the elements the player has
  already made?
