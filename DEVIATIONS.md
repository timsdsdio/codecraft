# Decisions

The decisions currently in force that differ from `docs/STACK.md`, or that the wiki's design
depends on, each with its reason. When one changes, edit its entry.

## Design

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
- **Inside a component, a splitter evaluates the JSX's expressions.** It sits on the casing and
  sends each changed expression value to an emitter hung under the element that uses it. The
  emitter's beam paints just that element.
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

## Engineering

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

## Wiki

- **The wiki uses only the front-end half of the stack** (Vite, React 19, R3F 9, drei 10). Pages
  are MDX files in git rather than database rows: the wiki is a design document edited in many
  rounds, and plain files can be diffed, reviewed and edited by an agent.
- **One `<Canvas>` per embed, mounted only near the viewport.** This keeps the page within
  browsers' WebGL context limits while letting each embed keep its bloom post-processing, which
  drei `<View>` (one shared canvas) wouldn't. Inline embeds don't orbit on touch screens, so the
  page still scrolls; the fullscreen explorer does.
- **Dev servers listen on the local network** (`vite --host`) so the wiki and the game can be
  opened on a phone.
