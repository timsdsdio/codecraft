# CodeCraft

A "Minecraft tech mod" where the machines are programs: blocks are pieces of an app, sockets are
TypeScript interfaces, cables wire them together, and the app runs live on a monitor.

**Current phase: design.** The game is being designed in a wiki first, then built alongside it.

```
apps/wiki/          the design wiki (Vite + React + MDX, 3D embeds)
  src/content/      one .mdx file per page  ← most iteration happens here
  src/data/         catalog of blocks and interfaces shared by infoboxes and 3D views
  src/embeds/       lazy-loaded 3D scenes
packages/visuals/   R3F/drei components ported from the Socketworld prototype; the game will reuse them
docs/STACK.md       the stack and lessons the real app will follow
DEVIATIONS.md       decisions and departures from the plan, with reasons
socketworld-src.tar.gz   the original prototype (unpacked copy in reference/, git-ignored)
```

```bash
pnpm install
pnpm wiki          # http://localhost:5310
```

See the wiki's *About this wiki* page for how to write pages and drop 3D views into them.
