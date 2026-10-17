// Turns a React commit into a replay on the Activity clock:
//   1. the call: an item travels back down the ducts from the element that handled the event to the
//      component that defined the function (or into the state tank, for setters), renamed on each
//      floor to what that component calls it
//   2. the state tanks it changed slosh
//   3. renders climb floor by floor; changed props ride up the ducts as items
//   4. inside each component, the values its JSX reads ride from the splitter to each element,
//      but only the ones that changed, since only those change what's on screen
import type { CommitRecord } from '@codecraft/probe';
import {
  CALL_SPEED,
  DUCT_SPEED,
  pathLength,
  type Activity,
  type CallInfo,
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

/** Which handler an event of `type` ran (checkboxes fire onChange from a click, and so on). */
function handlerFor(el: ElementInfo, type: string) {
  const prefer: Record<string, string[]> = {
    click: ['onClick', 'onChange'],
    change: ['onChange'],
    input: ['onChange', 'onInput'],
    submit: ['onSubmit'],
    keydown: ['onKeyDown'],
  };
  for (const name of prefer[type] ?? []) {
    const h = el.handlers.find((x) => x.event === name);
    if (h) return h;
  }
  return el.handlers.length === 1 ? el.handlers[0] : undefined;
}

/** A submit starts on the button but runs the form's handler: look up the tree of elements too. */
function causeElement(frame: Frame, id: string, type: string) {
  const owner = frame.snapshot.nodes.find((n) => n.elements?.some((e) => e.id === id));
  const el = owner?.elements?.find((e) => e.id === id);
  if (el && handlerFor(el, type)) return el;
  if (type === 'click') return owner?.elements?.find((e) => e.handlers.some((h) => h.event === 'onSubmit'));
  return el;
}

const cargoOf = (v: ValueInfo, label = v.name) => ({ label, kind: v.kind, value: v.value ?? v.preview });

export function scheduleCommit(activity: Activity, commit: CommitRecord, prev: Frame | null, next: Frame) {
  const now = activity.now();
  let t0 = now;

  // 1. the call(s) the event's handler made, travelling back down the ducts as they were when clicked
  if (commit.cause?.element && prev) {
    const el = causeElement(prev, commit.cause.element, commit.cause.type);
    const handler = el && handlerFor(el, commit.cause.type);
    if (el && handler) {
      activity.schedule(`emit:${el.id}`, now);
      let end = now;
      handler.calls.forEach((call, i) => {
        end = Math.max(end, routeCall(activity, call, el, prev, now + i * STAGGER));
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

  // 4. inside each rendered component: reads whose values changed go from the splitter to their element
  for (const id of commit.rendered) {
    const node = nodes.get(id);
    if (!node?.elements?.length) continue;
    const before = new Map((prevNodes.get(id)?.elements ?? []).map((e) => [e.id, e]));
    const start = renderAt(id) + 0.2;
    activity.schedule(`split:${id}`, start);
    for (const el of node.elements) {
      const old = before.get(el.id);
      const oldReads = new Map((old?.slots ?? []).flatMap((s) => s.reads).map((r) => [r.path, r]));
      const changed = el.slots
        .flatMap((s) => s.reads)
        .filter((r, i, all) => all.findIndex((x) => x.path === r.path) === i)
        .filter((r) => !old || JSON.stringify(oldReads.get(r.path)?.value) !== JSON.stringify(r.value));
      // only values that paint go to the screen: a new handler is React's internal business and
      // changes nothing visible, so function cards stop at the component (see the prop ducts)
      const cargo = changed.map((r) => cargoOf(r, r.path));
      if (!cargo.length) continue;
      const duct = layout.ducts.find((d) => d.id === `duct:${el.id}`);
      const travel = duct ? pathLength(duct.points) / DUCT_SPEED : 0.5;
      cargo.forEach((c, i) => activity.ship(`duct:${el.id}`, { t: start + i * STAGGER, ...c }));
      const arrive = start + (cargo.length - 1) * STAGGER + travel;
      activity.schedule(`emit:${el.id}`, arrive);
      activity.schedule(`link:${el.id}`, arrive + 0.05);
    }
  }
}

/** `onToggle("t3")` */
const callLabel = (name: string, call: CallInfo) => `${name}(${call.args.map((a) => JSON.stringify(a.value ?? a.preview)).join(', ')})`;

/** The name a function was defined with (`toggle`), from its preview `ƒ toggle`. */
const definedAs = (v: ValueInfo | undefined) => v?.preview.replace(/^ƒ\s*/, '').replace(/^bound /, '') || undefined;

/**
 * Sends one call from element `el` back to where its function was defined: down the element's duct
 * to its component, then down each parent's duct while the function was passed in as a prop.
 * Returns the time it arrives.
 */
function routeCall(activity: Activity, call: CallInfo, el: ElementInfo, frame: Frame, start: number): number {
  const { layout, snapshot } = frame;
  const nodes = new Map(snapshot.nodes.map((n) => [n.id, n]));
  const owner = snapshot.nodes.find((n) => n.elements?.some((e) => e.id === el.id));
  if (!owner) return start;
  const target = call.target;
  const args = call.args.map((a) => a.value ?? a.preview);
  const fnValue = owner.props.find((p) => p.name === call.fn);
  const tankName = target?.tank ? layout.tanks.find((t) => t.id === target.tank)?.info.name : undefined;
  const finalName = tankName ? `set${tankName[0].toUpperCase()}${tankName.slice(1)}` : (definedAs(fnValue) ?? call.fn);
  const value = (name: string, at: CompNode) => ({
    call: name,
    args,
    from: `<${owner.name}> ${el.tag} handler`,
    here: `<${at.name}>`,
    definedIn: target ? `<${nodes.get(target.component)?.name ?? '?'}>${tankName ? ` (${tankName} state)` : ''}` : undefined,
  });

  let t = start;
  const send = (ductId: string, points: number[][] | undefined, label: string, at: CompNode) => {
    activity.ship(ductId, { t, label, kind: 'function', call: true, reverse: true, speed: CALL_SPEED, value: value(label, at) });
    t += (points ? pathLength(points as [number, number, number][]) : 0.6) / (DUCT_SPEED * CALL_SPEED);
  };

  // down the element's own duct: emitter → splitter → its component
  const duct = layout.ducts.find((d) => d.id === `duct:${el.id}`);
  const ownLabel = target?.component === owner.id ? callLabel(finalName, call) : callLabel(call.fn, call);
  send(`duct:${el.id}`, duct?.points, ownLabel, owner);

  // then down through each parent that passed the function on as a prop
  let cur: CompNode = owner;
  let name = call.fn;
  for (let guard = 0; target && cur.id !== target.component && cur.parent && guard < 32; guard++) {
    const parent = nodes.get(cur.parent);
    if (!parent) break;
    const pipe = layout.pipes.find((p) => p.id === `${parent.id}>${cur.id}`);
    const arriving = parent.id === target.component;
    const fnId = cur.props.find((p) => p.name === name)?.fnId;
    const parentName = parent.props.find((p) => p.kind === 'function' && p.fnId === fnId)?.name;
    const label = arriving && finalName !== name ? `${name} → ${callLabel(finalName, call)}` : callLabel(name, call);
    send(`${parent.id}>${cur.id}`, pipe?.points, label, parent);
    if (parentName) name = parentName;
    cur = parent;
  }
  if (target?.tank) activity.schedule(target.tank, t);
  activity.schedule(`split:${cur.id}`, t);
  return t;
}
