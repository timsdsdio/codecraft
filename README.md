# CodeCraft

Shrink to 100 px tall and stand on a running React app. Crouch, and you drop into the factory
underneath it, Create-mod style: logic casings for components, tanks for state, pipes carrying props
up to the screen, telescoping pistons for lists, and conveyor belts for scrolling.

```
apps/game/          the game: walk on a running app and through the factory beneath it
apps/todo/          the reference app the game visualises (plain React + the probe's Vite plugin)
apps/wiki/          the design wiki (Vite + React + MDX, 3D embeds)
  src/content/      one .mdx file per page
packages/probe/     reads a running React app (DevTools hook) and talks to the game
packages/visuals/   factory machines (R3F/drei) + layoutFactory(); shared by the game and the wiki
docs/STACK.md       the stack and lessons the project follows
DEVIATIONS.md       decisions in force, with reasons
CHANGELOG.md        changes to how things work that the wiki doesn't reflect yet
socketworld-src.tar.gz   Socketworld, an earlier experiment that packages/visuals started from (reference only)
```

```bash
pnpm install
pnpm dev           # the todo app on :5320 and the game on http://localhost:5330
pnpm wiki          # the wiki on http://localhost:5310
```

All three dev servers listen on the local network, so they also open on a phone at
`http://<this computer's IP>:<port>`.

See `AGENTS.md` before writing or editing docs.
