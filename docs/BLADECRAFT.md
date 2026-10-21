# Bladecraft

A single-player factory game in the spirit of Minecraft with a tech mod, minus the nature: no
trees, animals or weather. The things you extract, carry and store are elements of a geometric
algebra, and machines combine them. The name comes from *blades*, the basis elements of the
algebra (e₁, e₁₂, e₁₂₃, …).

The game is also a way to learn geometric algebra, and through it quantum states and
electromagnetism: a rotor is a qubit, the Hopf fibration is something you build and watch, and
Maxwell's four equations are one equation for one multivector field that you lay out on the floor.
Nothing does algebra for you until you have done it by hand: you learn each product by sorting
blades on the Workbench, and only then can you press it into a card for a machine.

## The algebra

Elements are from G(3), the geometric algebra of 3D space. The eight blades are 1, e₁, e₂, e₃, e₂₃,
e₁₃, e₁₂ and e₁₂₃, and every element is a sum of blades, each with a weight. Weights are exact
rationals (`packages/ga`), because things stack only when one is an exact multiple of the other;
floating point would split them.

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

An element of more than one blade is shown in inventory slots as its *grade card*: a brass card
with one hole for each of the eight blades, laid out by grade, punched where the element has a
weight.

`packages/ga` handles any signature, so the projective algebra G(3,0,1) (points, lines, planes and
every rigid motion) is already available to the game.

## Items and stacks

Inventory works the way it does in Minecraft (`slots.ts`): 27 storage slots and a hotbar of 9, a
stack carried on the cursor, left click to pick up or put down a whole stack, right click to take
half or put down one, shift click to move a stack across the screen, a drag to spread a stack over
several slots, and a number key over a slot to swap it with that hotbar slot. On a touch screen a
tap is a left click, a long press a right click and a double tap a shift click.

One rule decides what stacks (`items.ts`): two things stack when one is a multiple of the other,
and stacking adds them. An element's slot holds a base with whole, coprime weights (its first
weight positive) and a count that is the element's overall weight, so 3e₁ is a stack of 3 on e₁,
2e₁ + 4e₂ is a stack of 2 on e₁ + 2e₂, and ½e₁ is a stack of ½. Putting −e₁ on e₁ cancels them. The
count is a rational, so the number on a slot can read −2 or ½. A stack holds up to 64.

Other items stack the usual way: lattice, machines, blank cards, verb plates, cards and probe
readings. A probe reading is its own kind of item, not an element, so it records what the field
was without becoming an ingredient.

## The world

A 64 × 64 grid of lattice, three blocks deep. Spawn is in the middle, with one deposit of each raw
element a few steps away: e₁ (red) to the left, e₂ (green) to the right, and the scalar 1 (pale)
and e₃ (blue) a little further back on each side. More deposits stand further out. Every block says
what it is on its faces: deposits carry their element in large letters, and machines show their
symbol on top and their ports on their sides.

Deposits never run out. Breaking one by hand gives one of its element and leaves it standing, so
no world can be stuck without a source. Breaking anything else picks it up, along with whatever it
holds; breaking the ground gives lattice. You start with a Workbench and 32 lattice. The world,
inventory, factory and goals are saved in the browser.

## The Workbench

The Workbench is where you do algebra by hand and build everything else. Its Hand work tab has
three parts.

- **The tray** adds. Drop elements on it and they add into one multivector, laid out on the grade
  card: the scalar, the three vectors, the three bivectors and the trivector each in their own cell.
  Clicking a cell takes that blade back out (right click takes one), and Take all packs the whole sum
  into one item. This is how e₁ and e₂ become e₁ + e₂.
- **The grid** multiplies. One factor goes in the slot at the top of the left edge and its blades
  run down the column; the other goes in the slot at the end of the bottom edge and its blades run
  along the row. Each cell is one blade of the left factor times one blade of the right, as in
  matrix multiplication, and the result is every cell added up. Make takes both factors, whole
  stacks and all, so 2e₁ by 3e₂ under Join makes 6e₁₂; put down one with a right click to multiply
  just one.
- **The rail** shows one cell worked out. The two blades are laid out as tiles, e₁, e₂ and e₃ each
  in its axis colour, left-factor tiles first and outlined. Tap ⇄ to swap two neighbours, which
  flips the sign, or × to cancel two matching tiles, until the row is in order. What is left is the
  cell's blade and sign.

The grid has three rules, and they differ only in which cancellations they allow (`products.ts`):

| Rule | Symbol | A pair may cancel | e₁ by e₁ | e₁ by e₁₂ | e₁₂ by e₁ |
|---|---|---|---|---|---|
| Join | ∧ | never: a cell that needs to cancel is 0 | 0 | 0 | 0 |
| Meter | ⌋ | always, and every left-factor tile must cancel | 1 | e₂ | 0 |
| Multiply | (none) | always | 1 | e₂ | −e₂ |

Join is the outer product, Meter the left contraction and Multiply the geometric product, and the
rail shows why Multiply is Meter and Join together. A rule starts out unknown: its cells show ? and
Make does nothing. Sorting three cells by hand under a rule learns it (a cell that opens already in
order doesn't count), after which the grid fills in by itself and the rail can sort for you. Join is
learnable from the start, Meter once Join is learned, and Multiply once Meter is.

The Build tab lists recipes (`recipes.ts`). Each costs lattice and elements you could only have
made by hand, and each verb plate also needs its rule learned, so a machine can never do anything
you haven't done yourself:

| Builds | Costs |
|---|---|
| Workbench | 4 lattice |
| 4 ducts | 2 lattice |
| Extractor | 4 lattice, the scalar 1 |
| Store | 4 lattice |
| Packer, Unpacker | 4 lattice, a vector off the axes (e₁ + e₂) |
| Splitter, Merger | 6 lattice |
| Sorter | 6 lattice, the scalar 1 |
| Crossing | 4 lattice |
| Card Press | 6 lattice, a bivector |
| 4 blank cards | 2 lattice |
| Mill | 6 lattice, a trivector |
| Join plate | 2 lattice, a bivector; Join learned |
| Meter plate | 2 lattice, the scalar 1; Meter learned |
| Sieve plate | 2 lattice, a vector off the axes; Meter learned |
| Multiply plate | 2 lattice, a rotor; Multiply learned |
| Reverse plate | 2 lattice, a bivector; Multiply learned |
| Turn plate | 2 lattice, 2 rotors; Multiply learned |
| Detector | 4 lattice, 2 × e₃ |
| Fibration orrery | 4 lattice, a rotor, a trivector |
| 8 field plates | 4 lattice, a trivector |
| Charge | 4 lattice, the scalar 1 |
| Wire | 4 lattice, e₃ |
| Antenna | 4 lattice, e₃, a rotor |
| Field probe | 4 lattice, a vector, a bivector |

## Cards

Every multivector is also an operation. The Card Press turns one into a card (`cards.ts`): put the
multivector M on its bed, a verb plate in its plate slot and blank cards in its blank slot, and
press. The bed is used up, one blank is used, and the plate stays. The card is durable: a Mill runs
it forever.

| Verb | The card does to X | Notes |
|---|---|---|
| Join | M ∧ X | |
| Meter | M ⌋ X | |
| Multiply | M X | a Mill can turn it end to end to do X M |
| Turn | M X M̃ / (M M̃) | turns X for a rotor M, mirrors it for a vector M; the size of M doesn't matter |
| Reverse | X̃ | needs nothing on the bed |
| Sieve | the grades of X that M has | M = e₁ + e₂ keeps the vector part |

## The factory

Every machine faces one of four directions and pushes what it makes out of its front into the
block there. Ducts and machines carry whole stacks, so a stack of 5e₁ rides a duct as one item.
What a block takes depends on the side something arrives from (`factory.ts`):

| Block | Takes | Does |
|---|---|---|
| Extractor | nothing | with a deposit behind it, draws that blade out every 1.5 s |
| Duct | anything, from any side but its front, one stack at a time | carries it the way it points, 1.5 blocks a second |
| Store | anything, from any side, when all of the stack fits | holds 27 stacks; open it to take them by hand |
| Packer | an element at its back, left and right | waits until every side that something feeds has delivered, then sends their sum as one multivector |
| Unpacker | a multivector at its back | sends each of its blades out on its own |
| Mill | an element at its back, and at either side when a live card is set | runs it through its cards (below) |
| Detector | a qubit state, from any side but its front | measures it: sends e₃ or −e₃ by the Born rule |
| Fibration orrery | anything, from any side but its front | passes it through, drawing the Hopf fiber of each distinct state |
| Splitter | anything, from its back | deals stacks out of its front, left and right in turn, skipping a side that can't take one |
| Merger | one stack at a time from each of its back, left and right | sends them out of its front, taking each input in turn so none starves the others |
| Sorter | anything, from its back | sends matches out of one side (left or right, set in its panel) and everything else out of its front |
| Crossing | one stack at a time from each side | sends each out of the side opposite where it came in, so two lines can cross |
| Charge | a scalar, from any side | in a field, holds that scalar as its charge, up to 8 either way |
| Wire | a vector, from any side | in a field, carries a current up along e₃ as big as the vector's e₃ part |
| Antenna | a vector, from any side | in a field, carries a current that swings up and down, as big as the vector's e₃ part at its peak |
| Field probe | nothing | in a field, sends a reading of the field where it stands once a second |

**The Mill** holds four cards in two decks of two. Cards side by side in deck 1 each work on what
arrives and their outputs add; deck 2 works on what deck 1 made, and its two cards add too. So
Join with e₃ beside Multiply with e₁ makes e₃ ∧ X + e₁ X, and a Multiply card from 1 − e₁₂ in deck
1 followed by a Multiply card from 1 + e₁₂, turned to multiply from the right, in deck 2 is a quarter
turn about e₃ at twice the size. A Mill with no cards passes things straight through. A *live card* makes a Mill take
two inputs: set it to a verb in the panel, and the Mill waits for an element at its side, presses it
into a card of that verb on the spot, and adds it to deck 1. A Mill with a live Join card is a
wedger of whatever two lines feed it. The Mill takes a quarter of a second per pair of blades it
multiplies out, shown by a grid of lamps on its side that light one by one.

A sorter matches either multiples of a sample, picked up in its panel from the element on your
cursor and not used up, or every element of one kind: scalars, vectors, bivectors, trivectors or
qubit states.

A blocked output waits, and everything behind it backs up, so nothing is ever lost. A result of 0
sends nothing.

Placing a duct or machine points it the way you face, and Rotate (R on a keyboard) turns it a
quarter turn before you place it; a placed machine's panel can rotate it too. An extractor turns
itself so its back is against the deposit you aimed at. A ghost outline shows where the block will
go and which way it will face, red when it can't go there.

## Qubits and the Hopf fibration

Any nonzero even element of G(3), R = a + b e₂₃ + c e₃₁ + d e₁₂, is a qubit state (`qubit.ts`). Its
length doesn't matter, so states stay exact, and two states are the same when one is a positive
multiple of the other.

- **Bloch vector.** R e₃ R⁻¹ is where the state points: the scalar 1 is |0⟩ (up, +e₃), e₂₃ is |1⟩
  (down), e₂₃ + e₁₂ is |+⟩ (along e₁). The map R ↦ R e₃ R⁻¹ from the 3-sphere of unit rotors to the
  2-sphere of directions is the Hopf fibration. A Turn card pressed from R does exactly this to e₃,
  so a Mill with a live Turn card, fed the state at its side and e₃ at its back, finds it.
- **Phase.** e₁₂ commutes with e₃, so R(1 + e₁₂) points the same way as R. Multiplying on the right by
  a phase moves the state round a circle, its Hopf fiber, while its Bloch vector stays put. A Mill
  with a Multiply card from 1 + e₁₂, turned to multiply from the right, is a phase shifter.
- **Gates.** A rotor on the left, G R, turns the Bloch vector by the rotation G stands for, so a
  gate is a Multiply card: X ∝ e₂₃ (half turn about e₁), Y ∝ e₃₁, Z ∝ e₁₂, H ∝ e₂₃ + e₁₂ (half turn
  about the e₁ + e₃ diagonal) and S ∝ 1 − e₁₂ (quarter turn about e₃). None needs a square root,
  because the length of a state doesn't matter.
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
such as e₁ + ½e₂₃. A field too weak to round to a half reads 0, which a probe doesn't send. A
reading is its own kind of item, so it can't be passed off as an element made any other way.

Each plate draws E as an orange arrow and IB as a translucent blue disc lying in the plane of the
bivector, and glows brighter where the field holds more energy (E² + B²). Around a charge the arrows
point out like spines; around a wire the discs stand upright and fan out from it like the pages of an
open book; an antenna sends rings of glow outward. The line under the crosshair gives a plate's E
and IB to one decimal place. A source takes its element by duct or by hand, in its panel's slot.

## How machines look

Machines are small steampunk contraptions built in code from primitives (`models.ts`): riveted iron
cabinets with brass corner posts, copper pipe ports, and brass plates engraved with what each part
is. A reflection map makes the brass, copper and iron read as metal. Each model animates from the
state the factory leaves in its block, so you can see what a machine is doing without opening it:

| Machine | Model | Moves when |
|---|---|---|
| Extractor | a brass pump with a flywheel, pressure gauge and chimney | its rod strokes and flywheel turns once per blade drawn; it stops when there's no deposit or its output is blocked |
| Duct | a conveyor belt on an iron frame, bent into a quarter circle when it is fed from one side and nothing feeds it from behind | the belt runs the way it carries, at the speed stacks ride it; stacks coming in from a side ride round the bend |
| Store | a banded tank with a gauge window | the level in the window rises as it fills |
| Packer | a low iron box with a copper hopper and a + plate | the lid drops as a sum leaves |
| Unpacker | the same box with a brass comb wheel | the wheel turns while blades are still to send |
| Splitter | the same box with belts out of three sides and a brass pointer on a gear | the pointer turns to the side the next stack will go out of |
| Merger | the same box with a copper hopper and a pointer | the pointer turns to the input whose turn it is |
| Sorter | the same box with a glass jar holding its sample, a flap, and a lamp on each side | the flap swings toward the side the stack in hand is going; the lit lamp marks the side matches leave by |
| Crossing | two belts crossing under a brass turntable plate | the belts run |
| Card Press | a ram over a brass bed punched in the grade-card layout, with a plate naming its verb | the ram hovers low and trembles when a plate and blanks are loaded |
| Mill | an iron cabinet with four brass cards standing in slots, a lamp grid on its side and a lever | the cards in its slots show; the lever is up when a live card is set; the lamps light one by one as it works |
| Detector | a Stern–Gerlach magnet (a wedge pole over a trough pole) with two lamps | the up or down lamp flashes with each measurement |
| Fibration orrery | a brass tripod and crown | the Hopf fibers of the states it has seen turn slowly above it |
| Charge | a brass ball on a ceramic insulator | it glows red when positive and blue when negative, brighter for more charge |
| Wire | a copper rod running up out of the field between insulators | beads of light run along it with the current, up or down |
| Antenna | a coil and a mast with a crossbar and a spark ball | its beads rock up and down with the current, and the ball sparks at each peak |
| Field probe | a glass bulb at the field's height, a gauge and a spout | the bulb flashes with each reading, the needle shows how strong it is, and the reading floats above it |
| Field plate | a steel slab with a brass border | it glows with the field's energy, under the field's arrows and discs |
| Workbench | a wooden workbench with a vice and a gear train | its gears turn slowly |

The Mill and the detector have a pilot lamp in their own colour that glows while they work. They,
the orrery and the extractor let off a puff of steam each time they finish.

## The guide

A card in the corner says what to do next. It walks through five first steps: take the scalar 1,
place the Workbench, build an extractor, place it on the e₁ deposit, and duct it into a Store.
After that it suggests the next goal from the tree. Each step is worked out from the state of the
world (`guide.ts`), so it always matches what the player has done. Tapping the card hides or shows
the hint.

## Goals

Goals are milestones in the style of Minecraft tech mods: a goal is met when the thing it names
exists, in your inventory, on your cursor, in a Store, inside a machine, or placed in the world
(`achievements.ts`). The game looks every second. Nothing is used up, nothing is delivered, and
nothing is locked behind a goal, so a factory can be laid out however suits it. A met goal stays
met.

Goals are arranged as a tree, where a goal's parents are the ideas it builds on. A goal appears
once one of its parents is met. Each has a goal and a lesson, and the lesson can be read at any
time. The tree has four branches, each drawn as its own band read left to right, with lines from
each idea to the ones that build on it and a count of how many are met. An idea that follows one in
another branch says so on its card ("after Volume").

- **The algebra** starts from a vector and the three axes, then a heavy stack, a vector off the
  axes, learning Join, a bivector and a negative one, a trivector, learning Meter, −1, a rotor,
  learning Multiply, a Multiply card from a trivector (duality) and a Reverse card.
- **The factory** starts with placing the Workbench: an extractor and a Store, stacks of 64 blades
  and of 16(e₁ + e₂), all four logistics blocks, a pressed card, a Mill, 16 rotors in one stack, and
  cards that turn and mirror.
- **Qubits** grows from rotors: |1⟩, |+⟩, |+i⟩, a new phase, the Born rule (8e₃ and −8e₃ from a
  detector) and linked rings in an orrery.
- **The field** grows from duality (a Multiply card from the trivector): a field plate, then one
  reading per grade of Maxwell's equation that a probe can see: E alone, IB alone, and E and IB
  together.

## Controls

- **Desktop:** WASD moves, the mouse looks (pointer lock), space jumps. Left click breaks (or takes
  from a deposit). Right click opens the Workbench or a machine, and otherwise places; shift +
  right click always places. R rotates what you're about to place, 1–9 or the wheel pick a hotbar
  slot, E opens your inventory, L the goals. Esc frees the mouse to click the buttons on screen
  while the game carries on, and clicking the world takes it back. The line under the crosshair
  names the block and what each click would do to it.
- **Touch:** the left side is a joystick wherever the thumb lands; the right side drags to look.
  Buttons on the right appear when they apply: Break (Take on a deposit), Use, Place, Rotate when
  holding a machine, and Jump. Tap a hotbar slot to hold it; tap the held slot again to open your
  inventory.
- **Inventory and panels:** as in Minecraft, described under Items and stacks. Every panel shows
  your inventory below its own slots, so shift click moves a stack between the two.

## Open questions

- Should fields act back on the factory, with a force F on charged elements or a coil that turns a
  changing B into a current?
- Should charges be able to move, so that in-plane currents and the other half of the field (E in the
  plane with B along e₃) come into play?
- Should several qubits come next, through the tensor product, with entangling gates?
- Should projective GA arrive as a second tier of orders, with points, lines and planes as
  elements and translations as machines?
- What should power machines: steam from a boiler that burns scalars, or nothing at all?
- Should a Store be able to send its stacks out by duct, so it can buffer a line?
