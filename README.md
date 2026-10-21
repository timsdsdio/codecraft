# Bladecraft and CodeCraft

This repository holds two games that share a look and a toolchain.

**Bladecraft** is a block-building factory game where the items are elements of geometric algebra.
Extractors draw vectors from deposits, ducts carry them into machines that add, wedge, multiply and
rotate them, and a hub at spawn orders specific elements, ending with qubit states built from gates
and phases, whose Hopf fibers you can watch. Machines are built from elements you
first made by hand, and an optional tree of achievements teaches the algebra as you play. Its
design is in `docs/BLADECRAFT.md`.

**CodeCraft** shrinks you to 100 px tall and stands you on a running React app. Crouch, and you
drop into the factory underneath it, Create-mod style: logic casings for components, tanks for
state, pipes carrying props up to the screen, telescoping pistons for lists, and conveyor belts for
scrolling. Its design is the wiki in `apps/wiki`.

```
apps/bladecraft/    Bladecraft: the voxel world (three.js) and its UI (React)
packages/ga/        exact multivectors for any Clifford algebra, with tests; Bladecraft's items
apps/game/          CodeCraft: walk on a running app and through the factory beneath it
apps/todo/          the reference app CodeCraft visualises, in two versions: plain (/) and memoized (/memo.html)
apps/wiki/          CodeCraft's design wiki (Vite + React + MDX, 3D embeds)
  src/content/      one .mdx file per page
packages/probe/     reads a running React app (DevTools hook) and talks to CodeCraft
packages/visuals/   factory machines (R3F/drei) + layoutFactory(); shared by CodeCraft and the wiki
server/serve.mjs    the production server: static files for every app on one port
docs/BLADECRAFT.md  Bladecraft's design
docs/STACK.md       the stack and lessons the projects follow
DEVIATIONS.md       decisions in force, with reasons
```

```bash
pnpm install
pnpm dev           # Bladecraft on http://localhost:5340
pnpm codecraft     # the todo app on :5320 and CodeCraft on http://localhost:5330
pnpm wiki          # the wiki on http://localhost:5310
pnpm test          # the algebra's and the factory's tests
```

For production, `pnpm build` then `pnpm start` serves everything from one port (`$PORT`, default
3000): Bladecraft at `/`, CodeCraft at `/codecraft/`, the visualised todo app at `/app/` (built
with the probe and React's development build) and the wiki at `/wiki/`. `railway.json` runs the
same two commands.

The dev servers listen on the local network, so they also open on a phone at
`http://<this computer's IP>:<port>`.

CodeCraft's game app also builds `window.html` (`/codecraft/window.html` in production): a test of
whether a phone can look like a window into a box behind its screen. It moves the viewpoint with
face tracking from the front camera, with the gyroscope, or with a finger. Phones only give the
camera to `https://` pages, so open it through a deploy or a quick tunnel
(`cloudflared tunnel --url http://localhost:5330`), not the local-network address.

See `AGENTS.md` before writing or editing docs.
