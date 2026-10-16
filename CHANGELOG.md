# Changelog

Changes to how CodeCraft works, for bringing the wiki up to date (see `AGENTS.md`). Newest first.

## Unreleased

- The game exists (`apps/game`, port 5330). It loads the todo app (`apps/todo`, port 5320) and
  builds the factory live from it. (How It Works, Todo App)
- The app's iframe is on a different origin from the game. Clicks and scrolling are sent to the
  probe as messages, and the probe performs them inside the app. (Screen Rendering, Probe)
- The screen is positioned with `CSS3DRenderer`, not drei `<Html>` / `occlude="blending"`, so 3D
  objects can't yet draw over the screen. (Screen Rendering)
- The game and probe use a `sync` handshake; the probe answers with a layout-only snapshot.
  (Probe)
- Hook names come from a regex over the component's source (`const [todos, setTodos] =
  useState`). Source maps aren't used. (State Tank, Probe)
- Function props never count as changed data, so pipes only pulse for data. Wires pulse along
  the event's path. (Pipe, Event Wire)
- Desktop: with the mouse captured, left click presses the app at the crosshair (reach 4 units)
  and the mouse wheel scrolls whatever is under it. Typing into an input releases the mouse;
  Esc stops typing. (Controls)
- Touch: a quick tap on the look side presses the app where you tapped. The list can't be
  scrolled on touch yet, and focusing an input may not raise the phone's keyboard. (Controls)
- Replay timing: 0.3 s per event-wire hop, then renders 0.35 s per floor from the lowest
  component that rendered; display links flare 0.25 s after their casing. (Update Replay)
- Every 3D view shows a small frame-rate readout in its bottom-left corner. (About this wiki)
