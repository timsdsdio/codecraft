// Turns a React commit into a short replay on the Activity store: the event runs down its wires,
// changed state tanks slosh, then renders climb floor by floor, carrying changed props up pipes and
// flaring display links at the top.
import type { CommitRecord } from '@codecraft/probe';
import { type Activity, type FactoryLayout, perfNow } from '@codecraft/visuals';

const HOP = 0.3; // per wire hop
const BEAT = 0.35; // per floor of the render wave

export function scheduleCommit(activity: Activity, commit: CommitRecord, layout: FactoryLayout, now = perfNow()) {
  const depth = new Map(layout.casings.map((c) => [c.id, c.depth]));
  let t0 = now;

  if (commit.cause) {
    let cur: string | undefined = commit.cause.component;
    let hops = 0;
    for (let guard = 0; cur && guard < 32; guard++) {
      const wire = layout.pipes.find((p) => p.wire && p.from === cur);
      if (!wire) break;
      activity.schedule(wire.id, now + hops * HOP);
      cur = wire.to;
      hops++;
    }
    t0 = now + hops * HOP;
  }

  for (const tank of commit.changedState) activity.schedule(tank, t0);

  if (!commit.rendered.length) return;
  const lowest = Math.min(...commit.rendered.map((id) => depth.get(id) ?? 1));
  const at = (id: string) => t0 + 0.15 + ((depth.get(id) ?? 1) - lowest) * BEAT;
  for (const id of commit.rendered) {
    activity.schedule(id, at(id));
    activity.schedule(`link:${id}`, at(id) + 0.25);
  }
  for (const pipe of Object.keys(commit.changedProps)) {
    const parent = pipe.split('>')[0];
    activity.schedule(pipe, at(parent) + 0.05);
  }
}
