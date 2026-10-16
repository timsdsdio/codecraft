# Project setup brief: a real-time R3F app on Postgres + Electric + TanStack DB

CodeCraft is a multi-user "tech mod" played in a Tron-lit 3D room. Blocks are pieces of a program,
sockets are TypeScript interfaces, and cables wire them together. The composed app runs live on a
monitor in the room. The design lives in `apps/wiki`. This brief covers the game app that will be
built from that design.

You're building a real-time, multi-user web app: React + React Three Fiber (drei) in the
browser, with a reactive data layer (Postgres → Electric SQL → TanStack DB). Follow the
architecture and avoid the pitfalls below. They come from a previous project on the
same stack, and each one cost real debugging time.

## Architecture (the non-negotiables)

- **The server is the only authority.** The browser displays and animates; it never
  computes the outcome of anything. Every user action, down to "select this item", is a
  small API call (tRPC on Express). Previews and forecasts are computed on the server and
  written as rows the client reads.
- **One data path everywhere.** Postgres holds the state. Electric streams it as "shapes".
  TanStack DB collections hold it on the client. Use the same client code in the browser,
  in Node tests, and in server-side workers/bots (TanStack DB runs fine in Node).
- **Reads go through a scoping proxy.** Clients never send SQL or `where` clauses. The
  server maps a shape name plus params (`?room=…`) to a `where` clause, with values bound
  as Electric `params[n]` (never string-spliced), and checks who is asking.
  - Private data gets an owner-scoped shape.
  - On private shapes, override Electric's cache headers: Electric sends
    `public, max-age=…`. Set `Cache-Control: private` (or `no-store`) and
    `Vary: x-user-id`.
- **Writes are guarded transactions.** Use conditional `UPDATE … WHERE` (state checks in
  SQL), validate with zod, and return the transaction id from `pg_current_xact_id()`,
  taken inside the same transaction. The client awaits that txid on the collection whose
  shape the write touched. `awaitTxId` only resolves if that shape sees the txid.
- **Optimistic updates** use `createOptimisticAction` / mutation handlers plus
  `awaitTxId`. Newer TanStack DB versions deprecate returning `{ txid }` from handlers.
  Put optimistic writes in a small private collection: a pending transaction holds back
  sync on its collection, so never write optimistically into the collections that drive
  animation.
- **Facts, not flags.** Prefer append-only rows and timestamps (`left_at`, `ready_at`,
  an event log) over mutable booleans. A "redo" or "new round" is a new row, not a
  reset.
- **Server state is discrete; frames are client tweens.** Anything that animates arrives
  as discrete server rows, ideally one append-only row per step, keyed by a counter. The
  browser interpolates between them with `requestAnimationFrame`, keyed on that counter.
- **Identity:** a random uuid plus a secret key, stored in localStorage on first visit.
  The server stores only `sha256(key)` (in a table that is never synced) and claims the
  identity on first use.
- **Long-lived clients must survive anything:** sleeping tabs (hours or days), network
  drops, server restarts, deploys. Design the session to resume from synced rows alone,
  and test that headlessly.

## Electric + TanStack DB gotchas

- **Shapes are not consistent with each other.** Two shapes can arrive in different polls.
  Never read a row from shape B once, because shape A said it exists, and assume it's
  there. Wait for it (`subscribeChanges` until present). This exact race only showed up
  on production latency, never locally.
- **`REPLICA IDENTITY FULL`** on every synced table, in the migration itself.
- **Electric caches table schemas.** After a migration that adds columns used in shape
  `where` clauses, restart Electric, then restart the app. Electric otherwise answers
  `unknown reference <col>`. A server-side collection whose initial sync fails gives up
  permanently ("initial sync marked as failed"), so give server collections an
  `onError` / retry strategy.
- **int8 columns arrive as BigInt.** Pass `parser: { int8: (v) => Number(v) }` in shape
  options, or sorting and arithmetic break in subtle places.
- **Live queries are garbage-collected about 5 s after their last subscriber.** For
  collections the app owns, set `gcTime: 0` and call `cleanup()` explicitly on scope
  exit. Preload before reading. Treat "preload abandoned during cleanup" rejections as
  expected when a scope is replaced.
- **More than 6 long-polls per page needs HTTP/2.** Browsers allow 6 HTTP/1.1
  connections per origin. Use HTTPS + HTTP/2 locally (Caddy works well) and confirm the
  host's edge serves HTTP/2.
- **Idle long-polls are held about 20 s.** A `409` / must-refetch arrives as a truncate:
  handle it.
- **Never drop and recreate a synced table under a running Electric.** It can serve
  stale rows for a while.
- **Privacy side channel:** txids and shape offsets are cluster-wide counters. A client
  watching gaps in its own txids can infer how busy other users are. If that matters,
  don't return txids for private writes; settle on row arrival instead.
- **The official Electric Docker image disappeared from Docker Hub in Sept 2026.** Don't
  depend on `electricsql/electric:<tag>`. Build from source with a Dockerfile that
  clones the tagged repo (`@core/sync-service@<version>`) and supplies the
  `electric-telemetry` build context from the same checkout. Or pin an image you host
  yourself.

## R3F / drei tips

- **Lazy-load the 3D chunk**, so the HTML UI renders instantly. Keep a cheap 2D fallback
  view over the same data.
- **Phone-first performance:** a low-quality mode (cap `dpr` at 1–1.5, no shadows, no
  post-processing), instanced meshes for repeated objects, and a camera framed for
  portrait.
- **drei `<Html>` labels with React 19** can throw `removeChild` errors when their mount
  target changes. Render all labels into one stable layer/portal.
- **HTML overlays on a canvas:** give them an explicit z-index, and verify in tests that
  they are actually painted on top: `document.elementFromPoint` at their centre should
  return the overlay.
- **Telegraph everything.** Anything that will happen should be visible before it
  happens (paths, ghost previews, highlighted tiles). Readable state is what makes
  real-time multi-user UIs feel fair.

## UI/UX lessons (mobile-first)

- **Design for a 390 px portrait phone first:** safe areas
  (`env(safe-area-inset-*)`), touch targets ≥ 44 px, no horizontal scroll, `dvh` units.
- **Layout must never jump under the user's finger.** Reserve space for conditional rows
  (`visibility: hidden` instead of unmounting), and put primary buttons above variable
  message areas.
- **Don't put background calls on the global "busy" flag.** A rename fired on every
  keystroke disabled every button, so the first tap after typing was silently swallowed.
- **Don't show an error for a state the user is in the middle of building.** Prompt
  instead: "Pick a direction", not "Not playable".
- **Stale server previews can outlive the selection that produced them** (for example
  after a reload). Show them only while that selection is current.

## Testing

- **Test all functionality headlessly**, with the same client session code the browser
  uses, against a real local Postgres + Electric (docker compose). Use Node's test runner
  via tsx, with `--test-force-exit`. Close the DB pool and `server.closeAllConnections()`
  on teardown, or tests hang.
- **Run DB tests sequentially** (`--test-concurrency=1`) when server-side workers share
  the database. Never run a dev server against the test database at the same time:
  two servers' background workers race and fail tests mysteriously.
- **Write an `until(predicate, label, ms)` helper** for waiting on synced state. It must
  unsubscribe even if the predicate throws.
- **Cover the scary paths with tests:** secrecy (a client can't read someone else's
  private rows through any shape or param), concurrent sessions not bleeding into each
  other, reconnect after a long pause, server restart mid-operation, two server
  processes (rolling deploy).
- **Use the browser (Playwright) only for the display layer.** Save screenshots and
  actually look at them, at several phone sizes plus desktop. Playwright's
  rAF-based waits starve when a busy WebGL canvas is open: use
  `waitForFunction(…, { polling: 250 })`, and close pages you're done with. For headless
  WebGL use `--use-angle=swiftshader --enable-unsafe-swiftshader`.
- **Run the browser pass against production after every deploy.** Real latency finds
  races that local runs never hit.

## Deployment (Railway notes, if used)

- **Deploy from a clean git worktree of a commit, not your working directory.**
  `railway up` uploads the working tree, including uncommitted work and new migrations.
- **Set start and pre-deploy (migration) commands explicitly, and check they took
  effect.** The config file may be ignored; they can be set via the GraphQL API
  (`serviceInstanceUpdate`).
- **Redeploys:** `serviceInstanceRedeploy` reuses the old image. Use
  `serviceInstanceDeployV2` to pick up a new one.
- **`railway environment new X --duplicate production`** re-links the current folder to X.
  Switch back afterwards.
- **Custom domain via Cloudflare:** CNAME to the Railway target, plus the TXT verification
  record, with the proxy set to **DNS only** (grey cloud) so the certificate can be
  issued.
- **Back up the database before migrations that touch production.**

## How to work

- Keep design docs short: a few pages, never 50k-token specs. Record decisions and
  deviations, with reasons, in one DEVIATIONS file.
- Get a human-usable build in front of the owner early. One real session beats many
  rounds of speculation or simulation.
- For larger work, use multi-agent workflows with an adversarial verification stage that
  reads traces and screenshots. It reliably finds real bugs.
- Run parallel streams of work in separate git worktrees.
- Commit as you go, and verify each deploy end to end before reporting it done.
