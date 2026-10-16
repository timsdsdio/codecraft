# Decisions & deviations

Short entries, newest first. Each says what was decided and why.

## 2026-10-16: New concept. The app is the floor, and a factory beneath it shows how it works

The Socketworld mechanics (blocks wired by hand) are gone. CodeCraft now visualises a running React
app: the screen lies face-up, you're 100 px tall standing on it, and crouching drops you into a
Create-mod-style factory underneath. The full design is in the wiki; the decisions that differ from
the original brief:

- **Floors are tree depth, with the root at the bottom and the screen as the roof.** Every
  component's casing sits directly under its DOM box. Children's boxes nest inside their parents',
  so nothing overlaps. Data rises toward the screen; events sink toward the state.
- **Jump goes up one floor, not straight to the screen.** This keeps you oriented in deep trees.
  A separate key (Home / long-press) goes straight up.
- **Scrolling is clipping.** A scroll area is a conveyor belt on its owner's floor. Its content is
  clipped by four planes in a prism up to the screen (the "fold"). There's no special scroll physics.
- **The app runs unmodified** in a same-origin iframe laid flat with CSS3D. It's read through the
  React DevTools global hook, which a Vite plugin injects as a script tag in dev. Fiber internals
  aren't a public API, so the React major version gets pinned and tested.
- **One pipe per child carrying all its data props, and function props as downward event wires.**
  This keeps the factory readable.
- **Activity is replayed, structure is live.** Commits are animated after the fact and merged when
  they arrive faster than the replay.
- **The server stack has no role yet.** A single-player visualizer needs no server. This is
  recorded as an open question (local-only first; Electric-backed todos or multiplayer later).
- **Look: "neon brass".** The Tron palette is kept, with brass, andesite and green glass added.
  Value kinds have fixed colours.
- `layoutFactory()` (snapshot → world) is pure and lives in `packages/visuals`. The wiki's diagrams
  run the reference app's mock snapshot through it, so the docs and the game share one layout
  implementation.

## 2026-10-16: The wiki comes first, built from part of the stack

- **The wiki uses only the front-end half of the stack**: Vite, React 19, R3F 9 and drei 10, with
  the same versions as the prototype. It does not use Postgres, Electric, TanStack DB or tRPC.
  Pages are MDX files in git rather than database rows, because the wiki is a design document that
  gets edited in repeated rounds. Plain files can be diffed, reviewed and edited by an agent.
  Revisit this once the game server exists, if pages need live data such as "blocks in your world".
- **pnpm monorepo** (`apps/*`, `packages/*`), so the game app and its server can sit beside the
  wiki later and share `packages/visuals`.
- **Visuals are props-driven.** The prototype's scene components read from zustand stores and its
  runtime. The ports in `packages/visuals` take everything as props (block spec, socket states,
  cable ends), so the same components can be driven by synced rows later. (The cube, socket, cable,
  monitor and tool components were removed when the concept changed.) Dropped for now: picking,
  dragging, the label budget, first-person viewmodel animation, and the live DOM screen on the
  monitor (it shows a texture instead).
- **One `<Canvas>` per embed.** Each canvas is mounted only near the viewport, to stay within
  browsers' WebGL context limits. This was chosen over drei `<View>` (one shared canvas) so that each
  embed keeps the prototype's bloom post-processing. On touch screens, orbit controls are off so
  the page still scrolls, and embeds auto-rotate instead.
- **`@codecraft/visuals/2d`** is a three.js-free entry point (palette, shape outlines, SVG swatches
  and icons), so the wiki's main bundle stays small. Without it, three.js ended up in the main
  bundle: 1.47 MB, against about 350 KB with it.
- **Seed content was the prototype's design.** It was superseded the same day (see above).
