// Turns a React commit into a replay on the Activity clock:
//   1. the call: a laser from the element's handler to where the called function lives
//   2. the state tanks it changed slosh
//   3. renders climb floor by floor; changed props ride up the ducts as items
//   4. inside each component, the values its JSX reads ride from the splitter to each element
import type { CommitRecord } from '@codecraft/probe';
import {
  DUCT_SPEED,
  ZAP_TIME,
  pathLength,
  type Activity,
  type CallInfo,
  type ElementInfo,
  type FactoryLayout,
  type Snapshot,
  type ValueInfo,
  type Vec3,
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

function targetPoint(target: CallInfo['target'], layout: FactoryLayout): Vec3 | undefined {
  if (!target) return undefined;
  if (target.tank) {
    const t = layout.tanks.find((x) => x.id === target.tank);
    if (t) return [t.pos[0], t.pos[1] + t.height, t.pos[2]];
  }
  const c = layout.casings.find((x) => x.id === target.component);
  return c ? [c.pos[0], c.pos[1] + c.size[1], c.pos[2]] : undefined;
}

const cargoOf = (v: ValueInfo, label = v.name) => ({ label, kind: v.kind, value: v.value ?? v.preview });

export function scheduleCommit(activity: Activity, commit: CommitRecord, prev: Frame | null, next: Frame) {
  const now = activity.now();
  let t0 = now;

  // 1. the call(s) the event's handler made, from where the element was when it was clicked
  if (commit.cause?.element && prev) {
    const el = causeElement(prev, commit.cause.element, commit.cause.type);
    const handler = el && handlerFor(el, commit.cause.type);
    const emitter = el && prev.layout.emitters.find((e) => e.id === el.id);
    if (handler && emitter) {
      const from: Vec3 = [emitter.pos[0], emitter.pos[1], emitter.pos[2]];
      activity.schedule(`emit:${emitter.id}`, now);
      handler.calls.forEach((call, i) => {
        const to = targetPoint(call.target, next.layout) ?? targetPoint(call.target, prev.layout);
        if (!to) return;
        const args = call.args.map((a) => a.value ?? a.preview);
        activity.zap({
          from,
          to,
          t: now + i * 0.15,
          label: `${call.fn}(${call.args.map((a) => a.path).join(', ')})`,
          kind: call.args[0]?.kind ?? 'function',
          value: { call: call.fn, args },
        });
      });
      t0 = now + ZAP_TIME + (handler.calls.length - 1) * 0.15 + 0.1;
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
      // a handler's functions are new closures when their fnId changed
      const prevProps = new Map((prevNodes.get(id)?.props ?? []).map((p) => [p.name, p]));
      const cards = el.handlers
        .flatMap((h) => h.calls)
        .map((c) => node.props.find((p) => p.name === c.fn))
        .filter((p): p is ValueInfo => !!p && p.kind === 'function' && (!old || prevProps.get(p.name)?.fnId !== p.fnId));
      const cargo = [...changed.map((r) => cargoOf(r, r.path)), ...cards.map((c) => cargoOf(c))];
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
