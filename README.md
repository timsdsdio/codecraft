# CodeCraft

Shrink to 100 px tall and stand on a running React app. Crouch, and you drop into the factory
underneath it, Create-mod style: logic casings for components, tanks for state, pipes carrying props
up to the screen, telescoping pistons for lists, and conveyor belts for scrolling.

```
apps/game/          the game: walk on a running app and through the factory beneath it
apps/todo/          the reference app the game visualises, in two versions: plain (/) and memoized (/memo.html)
apps/wiki/          the design wiki (Vite + React + MDX, 3D embeds)
  src/content/      one .mdx file per page
packages/probe/     reads a running React app (DevTools hook) and talks to the game
packages/visuals/   factory machines (R3F/drei) + layoutFactory(); shared by the game and the wiki
server/serve.mjs    the production server: static files for all three apps on one port
docs/STACK.md       the stack and lessons the project follows
DEVIATIONS.md       decisions in force, with reasons
socketworld-src.tar.gz   Socketworld, an earlier experiment that packages/visuals started from (reference only)
```

```bash
pnpm install
pnpm dev           # the todo app on :5320 and the game on http://localhost:5330
pnpm wiki          # the wiki on http://localhost:5310
```

For production, `pnpm build` then `pnpm start` serves everything from one port (`$PORT`, default
3000): the game at `/`, the visualised todo app at `/app/` (built with the probe and React's
development build) and the wiki at `/wiki/`. `railway.json` runs the same two commands.

All three dev servers listen on the local network, so they also open on a phone at
`http://<this computer's IP>:<port>`.

See `AGENTS.md` before writing or editing docs.
