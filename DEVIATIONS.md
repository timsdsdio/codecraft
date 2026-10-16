# Decisions & deviations

Short entries, newest first. Each says what was decided and why.

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
  cable ends), so the same components can be driven by synced rows later. Dropped for now: picking,
  dragging, the label budget, first-person viewmodel animation, and the live DOM screen on the
  monitor (it shows a texture instead).
- **One `<Canvas>` per embed.** Each canvas is mounted only near the viewport, to stay within
  browsers' WebGL context limits. This was chosen over drei `<View>` (one shared canvas) so that each
  embed keeps the prototype's bloom post-processing. On touch screens, orbit controls are off so
  the page still scrolls, and embeds auto-rotate instead.
- **`@codecraft/visuals/2d`** is a three.js-free entry point (palette, shape outlines, SVG swatches
  and icons), so the wiki's main bundle stays small. Without it, three.js ended up in the main
  bundle: 1.47 MB, against about 350 KB with it.
- **Seed content is the prototype's design**, marked with the status `prototype` on each page. None
  of it is a decision yet.
