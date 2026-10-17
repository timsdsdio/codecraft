// Turns a React commit into a replay on the Activity clock:
//   1. the calls the event's handler made (recorded by the probe as they happened) travel back down
//      the ducts from the element that handled the event to where each function was created, renamed
//      on each floor to what that component calls it, ending in the state tank they set
//   2. the state tanks it changed slosh
//   3. renders climb floor by floor; changed props ride up the ducts as items
//   4. inside each component, every value its JSX evaluated rides along the floor to its element's
//      emitter; only the values that changed (an actual DOM update) rise from there to the screen
import type { CallRecord, CommitRecord } from '@codecraft/probe';
import {
  CALL_SPEED,
  DUCT_SPEED,
  pathLength,
  type Activity,
  type CompNode,
  type ElementInfo,
  type FactoryLayout,
  type Snapshot,
  type ValueInfo,
} from '@codecraft/visuals';

const BEAT = 0.4; // per floor of the render wave
const STAGGER = 0.12; // between items entering the same duct

export interface Frame {
  snapshot: Snapshot;
  layout: FactoryLayout;
}

const cargoOf = (v: ValueInfo, label = v.name) => ({ label, kind: v.kind, value: v.value ?? v.preview });

export function scheduleCommit(activity: Activity, commit: CommitRecord, prev: Frame | null, next: Frame) {
  const now = activity.now();
  let t0 = now;

  // 1. the calls the event's handler made, travelling back down the ducts as they were when clicked
  const cause = commit.cause;
  if (cause && prev) {
    const routes = routesOf(cause.calls);
    if (routes.length) {
      if (cause.element) activity.schedule(`emit:${cause.element}`, now);
      let end = now;
      routes.forEach((route, i) => {
        end = Math.max(end, routeCall(activity, route, cause.component, cause.element, prev, now + i * STAGGER));
      });
      t0 = end + 0.1;
    }
  }

  // 2. state
  for (const tank of commit.changedState) activity.schedule(tank, t0);

  // 3. renders, lowest floor first; changed props travel up the ducts
  if (!commit.rendered.length) return;
  const { layout, snapshot } = next;
  const depth = new Map(layout.casings.map((c) => [c.id, c.depth]));
  const lowest = Math.min(...commit.rendered.map((id) => depth.get(id) ?? 1));
  const renderAt = (id: string) => t0 + 0.1 + ((depth.get(id) ?? 1) - lowest) * BEAT;
  const nodes = new Map(snapshot.nodes.map((n) => [n.id, n]));
  const prevNodes = new Map((prev?.snapshot.nodes ?? []).map((n) => [n.id, n]));

  for (const id of commit.rendered) {
    activity.schedule(id, renderAt(id));
    activity.schedule(`link:${id}`, renderAt(id) + 0.25);
  }
  for (const [pipeId, names] of Object.entries(commit.changedProps)) {
    const [parent, child] = pipeId.split('>');
    const node = nodes.get(child);
    if (!node) continue;
    names.forEach((name, i) => {
      const v = node.props.find((p) => p.name === name);
      if (v) activity.ship(pipeId, { t: renderAt(parent) + 0.05 + i * STAGGER, ...cargoOf(v) });
    });
  }

  // 4. inside each rendered component: every expression its JSX evaluated goes from the splitter
  //    along the floor to its element's emitter; only values that changed (an actual DOM update)
  //    continue up the riser to the screen
  for (const id of commit.rendered) {
    const node = nodes.get(id);
    if (!node?.elements?.length) continue;
    const before = new Map((prevNodes.get(id)?.elements ?? []).map((e) => [e.id, e]));
    const start = renderAt(id) + 0.2;
    activity.schedule(`split:${id}`, start);
    for (const el of node.elements) {
      const old = before.get(el.id);
      const oldReads = new Map((old?.slots ?? []).flatMap((s) => s.reads).map((r) => [r.path, r]));
      const reads = el.slots.flatMap((s) => s.reads).filter((r, i, all) => all.findIndex((x) => x.path === r.path) === i);
      if (!reads.length) continue;
      const changed = reads.filter((r) => !old || JSON.stringify(oldReads.get(r.path)?.value) !== JSON.stringify(r.value));

      const duct = layout.ducts.find((d) => d.id === `duct:${el.id}`);
      reads.forEach((r, i) => activity.ship(`duct:${el.id}`, { t: start + i * STAGGER, ...cargoOf(r, r.path) }));
      const atEmitter = start + (reads.length - 1) * STAGGER + (duct ? pathLength(duct.points) : 0.5) / DUCT_SPEED;
      activity.schedule(`emit:${el.id}`, atEmitter);
      if (!changed.length) continue;

      const riser = layout.risers.find((d) => d.id === `riser:${el.id}`);
      changed.forEach((r, i) => activity.ship(`riser:${el.id}`, { t: atEmitter + 0.05 + i * STAGGER, ...cargoOf(r, r.path) }));
      const atScreen = atEmitter + 0.05 + (changed.length - 1) * STAGGER + (riser ? pathLength(riser.points) : 1) / DUCT_SPEED;
      activity.schedule(`link:${el.id}`, atScreen);
    }
  }
}

interface Route {
  /** what the handling component calls the function (`onToggle`, `setTitle`) */
  name: string;
  args: unknown[];
  /** the component that created the function (or holds the state, for setters) */
  origin?: string;
  /** the state tank the call ends up setting, if any */
  tank?: string;
  /** the function's own name, when it has one */
  defined?: string;
}

/**
 * Which recorded calls to draw. A route starts at every prop function or state setter the handler
 * called that isn't nested inside another prop call: what a prop function does happens in the
 * component that defined it, so its first state setter becomes the route's destination instead.
 */
function routesOf(calls: CallRecord[]): Route[] {
  const routes: Route[] = [];
  calls.forEach((call, i) => {
    if (call.kind === 'other') return;
    // inside an earlier prop call? (walk back through this call's ancestors)
    let depth = call.depth;
    for (let j = i - 1; j >= 0 && depth > 0; j--) {
      if (calls[j].depth >= depth) continue;
      depth = calls[j].depth;
      if (calls[j].kind === 'prop') return;
    }
    let tank = call.tank;
    if (call.kind === 'prop')
      for (let j = i + 1; j < calls.length && calls[j].depth > call.depth; j++)
        if (calls[j].kind === 'setter') {
          tank = calls[j].tank;
          break;
        }
    const name = call.prop ?? call.label.replace(/^props\./, '');
    routes.push({ name, args: call.args, origin: call.origin, tank, defined: call.kind === 'setter' ? undefined : call.defined });
  });
  return routes;
}

/** `onToggle("t3")` */
const callLabel = (name: string, args: unknown[]) => `${name}(${args.map((a) => JSON.stringify(a)).join(', ')})`;

/**
 * Sends one call from the handling element back to where its function was created: down the
 * element's duct to its component, then down each parent's duct while the function was passed in
 * as a prop, renaming it on each floor. Returns the time it arrives.
 */
function routeCall(activity: Activity, route: Route, component: string, elementId: string | undefined, frame: Frame, start: number): number {
  const { layout, snapshot } = frame;
  const nodes = new Map(snapshot.nodes.map((n) => [n.id, n]));
  const owner = nodes.get(component);
  if (!owner) return start;
  const tankName = route.tank ? layout.tanks.find((t) => t.id === route.tank)?.info.name : undefined;
  const finalName = route.defined ?? (tankName ? `set${tankName[0].toUpperCase()}${tankName.slice(1)}` : route.name);
  const value = (label: string, at: CompNode) => ({
    call: label,
    args: route.args,
    from: `<${owner.name}>`,
    here: `<${at.name}>`,
    definedIn: route.origin ? `<${nodes.get(route.origin)?.name ?? '?'}>${tankName ? ` (${tankName} state)` : ''}` : undefined,
  });

  let t = start;
  const send = (ductId: string, points: number[][] | undefined, label: string, at: CompNode) => {
    activity.ship(ductId, { t, label, kind: 'function', call: true, reverse: true, speed: CALL_SPEED, value: value(label, at) });
    t += (points ? pathLength(points as [number, number, number][]) : 0.6) / (DUCT_SPEED * CALL_SPEED);
  };
  const named = (name: string, arriving: boolean) => (arriving && finalName !== name ? `${name} → ${callLabel(finalName, route.args)}` : callLabel(name, route.args));

  // down the element's own duct: emitter → splitter → its component
  if (elementId) {
    const duct = layout.ducts.find((d) => d.id === `duct:${elementId}`);
    send(`duct:${elementId}`, duct?.points, named(route.name, route.origin === owner.id), owner);
  }

  // then down through each parent that passed the function on as a prop
  let cur: CompNode = owner;
  let name = route.name;
  for (let guard = 0; route.origin && cur.id !== route.origin && cur.parent && guard < 32; guard++) {
    const parent = nodes.get(cur.parent);
    if (!parent) break;
    const pipe = layout.pipes.find((p) => p.id === `${parent.id}>${cur.id}`);
    const fnId = cur.props.find((p) => p.name === name)?.fnId;
    const parentName = parent.props.find((p) => p.kind === 'function' && p.fnId === fnId)?.name;
    send(`${parent.id}>${cur.id}`, pipe?.points, named(name, parent.id === route.origin), parent);
    if (parentName) name = parentName;
    cur = parent;
  }
  if (route.tank) activity.schedule(route.tank, t);
  activity.schedule(`split:${cur.id}`, t);
  return t;
}
