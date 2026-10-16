# CodeCraft

Shrink to 100 px tall and stand on a running React app. Crouch, and you drop into the factory
underneath it, Create-mod style: logic casings for components, tanks for state, pipes carrying props
up to the screen, telescoping pistons for lists, and conveyor belts for scrolling.

**Current phase: design.** The game is being designed in a wiki first, then built alongside it.

```
apps/wiki/          the design wiki (Vite + React + MDX, 3D embeds)
  src/content/      one .mdx file per page  ← most iteration happens here
  src/data/         the reference todo app: source, mock probe snapshot, screen drawing
  src/embeds/       lazy-loaded 3D scenes
packages/visuals/   factory machines (R3F/drei) + layoutFactory(); shared by the wiki and the future game
docs/STACK.md       the stack and lessons the real app will follow
DEVIATIONS.md       decisions and departures from the plan, with reasons
socketworld-src.tar.gz   the original prototype (unpacked copy in reference/, git-ignored)
```

```bash
pnpm install
pnpm wiki          # http://localhost:5310
```

See the wiki's *About this wiki* page for how to write pages and drop 3D views into them.
