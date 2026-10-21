# Decisions

The decisions currently in force that differ from `docs/STACK.md`, or that the designs depend on,
each with its reason. When one changes, edit its entry.

## Bladecraft

- **Single-player, saved in the browser.** The world, factory, inventory and goals live in
  `localStorage`. A save in an older format is not converted: that world starts fresh.
  `docs/STACK.md`'s server-authoritative architecture applies once worlds are shared or players
  meet.
- **The engine is plain three.js, the UI is React.** A voxel game runs one imperative loop
  (physics, raycasts, a merged terrain mesh rebuilt on change), which R3F's component tree would
  only wrap. React draws the HUD and the panels, and re-renders when the game bumps a version
  number (`useSyncExternalStore`).
- **The factory is a pure simulation with its own tests.** `factory.ts` steps the world's machines
  at a fixed 20 ticks a second and knows nothing about drawing, so it runs under `node --test`
  (`pnpm test`) and the renderer only reads what it left in each block.
- **Weights are exact rationals.** Things stack only when one is an exact multiple of the other;
  floating point would make e₁ from one machine differ from e₁ from another. A Sandwich card divides by
  M M̃ rather than normalising M, which keeps it exact and makes 2 − 2e₁₂ turn the same as 1 − e₁₂.
- **A stack's count is the element's weight.** An element item holds a base with whole, coprime
  weights, first weight positive, so 3e₁ and e₁ stack and −e₁ cancels e₁. One rule (stack when one
  is a multiple of the other, and stacking adds) then covers what a Minecraft stack is and what
  vector addition is, so the inventory itself teaches that weights add.
- **A multivector is one item, opened up only on a workspace.** In a slot it is one grade card; the
  Workbench tray, the Card Press bed and the Mill panel lay its blades out. Spreading it across
  several slots everywhere would make every inventory screen a puzzle.
- **Inventory follows Minecraft.** Left click, right click, shift click, drag to spread and number
  keys mean what they mean there, so a Minecraft player already knows how to move things. Touch
  maps tap, long press and double tap onto left, right and shift click.
- **Elements are from G(3), not projective GA.** Vectors are arrows and bivectors are planes, the
  usual way geometric algebra is taught. In projective GA a vector is a plane, which is a confusing
  first step.
- **Machine models are built from primitives in code, with no model files.** Boxes, cylinders,
  tori, extruded gears and canvas-textured plates keep the bundle small, need no loaders, and give
  every moving part a name the animation can drive directly from the factory's state. Geometry and
  materials are shared between all copies of a machine.
- **A duct's corner shape comes from its neighbours, not from the player.** A duct fed from one side
  only is drawn bent; the factory treats it like any other duct. There is no corner block to build
  or orient, and a belt can never be drawn bending the wrong way.
- **Logistics blocks have plain names** (splitter, merger, sorter, crossing) rather than
  electronics terms such as multiplexer, so a player knows what each does from its name.
- **Qubits are unnormalised rotors of G(3), equal up to a positive scale.** A state needs no new
  algebra: the even subalgebra is the quaternions, its Bloch vector is a sandwich with e₃, and gates
  such as H ∝ e₂₃ + e₁₂ need no √2, so states stay exact and stack. A negative scale is kept apart
  because it is the phase −1, a different point on the same Hopf fiber.
- **The electromagnetic field is floating point; probe readings are exact.** The field changes
  smoothly in time, so it can't be exact rationals. A probe rounds each coefficient to the nearest
  half, which makes a reading exact, so equal readings stack.
- **A field region is one layer of plates.** The field then depends only on e₁ and e₂, which keeps
  the simulation small enough for a phone and every arrow visible from above. Charges give E in the
  plane and currents run along e₃, so the two halves of the field stay apart and the static half can
  be solved directly.
- **A probe reading is its own kind of item.** A reading of e₁ would otherwise be the same as the e₁
  from a Generator, and the field goals could be met without a field. As an item it records what
  the field was, and survives saving.
- **One programmable machine, the Mill, instead of a block per operation.** Every multivector is
  also an operation, so the operation is a card pressed from an element and a verb plate, and one
  Mill runs any of them. Two decks (outputs add side by side, the second runs on the first) and a
  live card from the side port cover sums, compositions and two-input operations without more
  blocks. The cards in its slots show on the model.
- **Operations go by their usual names.** The wedge (outer product), the dot (inner product, as the
  left contraction ⌋), the geometric product, the sandwich product, the reverse and grade
  projection are named as books and papers name them, so what a player learns carries over.
- **Products are learned by hand before any machine does them.** The wedge, the dot and the
  geometric product are one blade sort on the rail with different rules for cancelling, and each verb plate needs its rule
  learned by sorting three cells by hand. Machines and plates cost elements that only hand work
  makes. Lattice alone builds only ducts, Stores, splitters, mergers, crossings and blank cards.
- **Goals are possession, not delivery.** A goal is met when the thing it names exists anywhere: in
  the inventory, a Store, a machine, or placed. Nothing has to be delivered, so a factory can grow
  in any direction, as in Minecraft tech mods, rather than around one central block.
- **Deposits are finite ore; endless blades come later, from Generators.** A deposit breaks into 4
  blades by hand and is gone, which keeps the start hands-on. A Generator makes the blade in its
  sample slot forever and needs no deposit, but costs a rotor and a trivector, so it arrives once
  hand work has taught the products, and from then on hand mining isn't the way to get blades in
  bulk.
- **The Workbench grid is matrix multiplication.** One factor runs down the left edge and the other
  along the bottom, so each cell is one pair of blades and the result is their sum. The grid shows
  at a glance that a product is bilinear and which pairs vanish under each rule.
- **Touch controls are explicit buttons that appear when they apply** (Break, Use, Place,
  Rotate, Jump) rather than taps and long presses on the view, which were easy to confuse.

## CodeCraft design

- **Floors are tree depth, with the root at the bottom and the screen as the roof.** Every
  component's casing sits directly under its DOM box. Children's boxes nest inside their parents',
  so nothing overlaps. Data rises toward the screen; events sink toward the state.
- **Jump moves one floor at a time.** This keeps you oriented in deep trees. A separate key
  (Home, or long-press on touch) goes straight to the screen.
- **Scrolling is clipping.** A scroll area is a conveyor belt on its owner's floor. Its content is
  clipped by four planes forming a prism up to the screen (a "fold"), so no special scroll physics
  is needed.
- **Props travel as items in itemducts**, one duct per child. Each item is one changed prop and
  carries a copy of its value, so it can be inspected in flight. Function props are items too
  (red cards), and they travel whenever the parent creates a new closure.
- **Inside a component, re-rendering and updating the DOM are drawn separately.** A splitter on
  the casing sends every expression value the JSX evaluated along the floor to an emitter in front
  of the casing, one per element: that's the re-render. Only values that changed continue up a
  riser from the emitter to the element on the screen, where its outline flashes: that's the
  actual DOM update. A row that re-ran without changing anything fills its emitters and stops.
- **What elements show, and what handlers call, is recorded, not inferred.** The probe's Vite
  plugin instruments the app's code in dev. It tags every host element (`data-cc`) and records
  each expression attribute's and expression child's *source text*; the probe reads the *values*
  React actually rendered from the host fiber's props. It also rewrites every call into a recorded
  call (`f(a)` → `__cc.c("f", f, a)`), which only records while an event is being handled. Each
  recorded function is identified at call time, by identity: a state setter (which tank), a prop
  of the handling component (and where it was created), or neither. Nothing depends on recognising
  particular code shapes. The debugger protocol was rejected: it can't run inside the page or on
  phones, and pausing per call is far too slow.
- **Calls travel back down the ducts.** When a handler calls a function, an orange item carrying
  the call and its arguments travels from the element's emitter back down each duct to where the
  function was defined, renamed on every floor to what that component calls it (`onToggle` in
  `TodoItem` and `TodoList`, `toggle` in `App`). Calls to a state setter end in that state tank.
  Calls move at twice the speed of data, since they're a short signal.
- **Activity runs on its own clock**, which can be paused, slowed to 0.1×, or replayed for the
  last update. The app itself updates instantly; only the factory's animation is affected.
- **Context is AE2-style wireless.** A provider is an access point. Its range is the provider's
  footprint column, which contains exactly its possible consumers.
- **Activity is replayed; structure is live.** Commits are animated after the fact, and merged
  when they arrive faster than the replay can show them.
- **"Create" means the interaction style, not the art.** The default look is dark, with neon
  edges. A Create-style brass look exists as a switch (`look` on `Stage`, a TRON / BRASS toggle in
  the wiki) until one is chosen.

## CodeCraft engineering

- **No server in the first version.** A single-player visualizer needs none. `docs/STACK.md`
  applies once todos sync through Electric or players can visit each other's apps.
- **The app runs unmodified, in an iframe on its own origin.** Its dev server adds the probe
  (`@codecraft/probe/vite`): a DevTools hook stub inlined ahead of React, then the probe runtime.
  All interaction goes through `postMessage` in both directions. Clicks and wheel scrolls are
  carried out by the probe inside the page, so the game never needs same-origin access. Fiber
  internals aren't a public API, so the React major version is pinned.
- **The screen is placed with three.js's `CSS3DRenderer`, not drei's `<Html>`.** `<Html>` hit
  React 19's "synchronously unmount a root" race and lost its contents. The iframe is created
  once, outside React, so no re-render can reload the app.
- **The page sits behind the WebGL canvas**, which writes transparent pixels where the screen is.
  Machines in front of the screen draw over it. From below you see the page's back face (the app,
  mirrored), dimmed by a downward-facing tint. The screen is always opaque: translucency made the
  browser flatten the 3D-transformed page, which flickered.
- **The game asks for a snapshot until it gets one** (`sync`). The probe's first message can
  arrive before the game is listening.
- **`layoutFactory()` is a pure function in `packages/visuals`.** The wiki's diagrams run the
  reference app's mock snapshot through it, so the docs and the game share one layout.
- **Visual components are props-driven**, with no stores, so the same components can be driven by
  probe snapshots, synced rows or hand-written wiki scenes.
- **`@codecraft/visuals/2d`** is an entry point with no three.js, for code that must stay out of
  the 3D chunk. Importing the main entry from the wiki shell put three.js in the main bundle
  (1.47 MB against about 400 KB).

## CodeCraft wiki

- **The wiki uses only the front-end half of the stack** (Vite, React 19, R3F 9, drei 10). Pages
  are MDX files in git rather than database rows: the wiki is a design document edited in many
  rounds, and plain files can be diffed, reviewed and edited by an agent.
- **One `<Canvas>` per embed, mounted only near the viewport.** This keeps the page within
  browsers' WebGL context limits while letting each embed keep its bloom post-processing, which
  drei `<View>` (one shared canvas) wouldn't. Inline embeds don't orbit on touch screens, so the
  page still scrolls; the fullscreen explorer does.
- **Dev servers listen on the local network** (`vite --host`) so the wiki and the game can be
  opened on a phone.
