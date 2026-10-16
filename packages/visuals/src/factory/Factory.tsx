// Renders a whole factory from a layout: floors, casings, tanks, pipes, pistons, belts, folds,
// display links and (optionally) the screen on top.
import { useMemo } from 'react';
import { Activity, ActivityProvider } from './activity';
import { Avatar } from './Avatar';
import { Belt } from './Belt';
import { Casing } from './Casing';
import { ClipRegion } from './clip';
import { DisplayLink } from './DisplayLink';
import { Floor } from './Floor';
import { Fold } from './Fold';
import { floorY, type FactoryLayout, type TankL, type Vec3 } from './layout';
import { Pipe } from './Pipe';
import { Piston } from './Piston';
import { Screen } from './Screen';
import { Tank } from './Tank';

export interface FactoryProps {
  layout: FactoryLayout;
  /** draw the app on the roof; omit for no screen */
  screen?: { draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; opacity?: number };
  /** cutaway: hide everything above this floor (and the screen) */
  maxFloor?: number;
  /** show event wires (function props) */
  wires?: boolean;
  /** demo animation: values flow and components render on a loop */
  demo?: boolean;
  labels?: boolean;
  avatar?: { pos: Vec3; yaw?: number };
  /** tank fill 0..1 (default: a little per tank) */
  tankFill?: (t: TankL) => number;
  /** belt scroll override in world units, per scroll owner */
  scroll?: Record<string, number>;
  /** demo: an event fires in this component; its signal runs down the wires before the render wave */
  event?: string;
  /** live: machines pulse when this store says so (keys: component id, tank id, pipe id, `link:<id>`) */
  activity?: Activity;
}

export function Factory({ layout, screen, maxFloor, wires = false, demo = false, labels = true, avatar, tankFill, scroll, event, activity }: FactoryProps) {
  const top = maxFloor ?? layout.floors;
  const depthOf = useMemo(() => new Map(layout.casings.map((c) => [c.id, c.depth])), [layout]);
  const showsFloor = (id: string) => (depthOf.get(id) ?? 1) <= top;
  // demo timing: a render wave climbs the tree, one floor per beat
  const beat = 0.45;
  const hop = 0.55;
  const chain = useMemo(() => {
    const out: string[] = [];
    let cur = event;
    for (let guard = 0; cur && guard < 32; guard++) {
      const w = layout.pipes.find((p) => p.wire && p.from === cur);
      if (!w) break;
      out.push(w.id);
      cur = w.to;
    }
    return out;
  }, [layout, event]);
  const every = demo ? (event ? 4.2 : 3.2) : undefined;
  const lead = event ? chain.length * hop + 0.2 : 0;
  const at = (id: string) => lead + ((depthOf.get(id) ?? 1) - 1) * beat;

  return (
    <ActivityProvider value={activity ?? null}>
      <group>
        {Array.from({ length: Math.min(top, layout.floors) }, (_, i) => (
          <Floor key={i} level={i + 1} y={floorY(i + 1)} size={layout.size} label={labels} />
        ))}
        {screen && top >= layout.floors && <Screen size={layout.size} y={layout.screenY} draw={screen.draw} opacity={screen.opacity} />}

        {layout.folds.filter((f) => showsFloor(f.owner)).map((f) => (
          <Fold key={f.owner} box={f.box} y0={f.y0} y1={top >= layout.floors ? f.y1 : floorY(top + 1)} />
        ))}
        {layout.belts.filter((b) => showsFloor(b.owner)).map((b) => (
          <Belt key={b.owner} box={b.box} y={b.y} offset={scroll?.[b.owner] ?? b.offset} />
        ))}
        {layout.pistons.filter((p) => showsFloor(p.owner)).map((p) => (
          <ClipRegion key={p.owner} box={p.clip}>
            <Piston base={p.base} heads={p.heads} />
          </ClipRegion>
        ))}

        {layout.casings.filter((c) => c.depth <= top).map((c) => (
          <ClipRegion key={c.id} box={c.clip}>
            <Casing pos={c.pos} size={c.size} name={c.name} label={labels} renderEvery={every} renderOffset={at(c.id)} pulseKey={c.id} />
          </ClipRegion>
        ))}
        {layout.tanks.filter((t) => showsFloor(t.owner)).map((t, i) => (
          <Tank key={t.id} pos={t.pos} radius={t.radius} height={t.height} info={t.info} fill={tankFill?.(t) ?? (t.info.size !== undefined ? Math.min(1, 0.12 + t.info.size / 14) : 0.45 + ((i * 0.23) % 0.5))} label={labels} pulseKey={t.id} />
        ))}

        {layout.pipes
          .filter((p) => (wires || !p.wire || chain.includes(p.id)) && showsFloor(p.wire ? p.to : p.from))
          .map((p) => {
            const hot = chain.indexOf(p.id);
            return (
              <ClipRegion key={p.id} box={p.clip}>
                <Pipe
                  points={p.points}
                  kind={p.kind}
                  radius={p.wire ? (hot >= 0 ? 0.024 : 0.016) : 0.035}
                  sendEvery={p.wire ? (hot >= 0 ? every : undefined) : every}
                  sendOffset={p.wire ? hot * hop : at(p.from) + 0.1}
                  dim={p.wire && hot < 0}
                  pulseKey={p.id}
                />
              </ClipRegion>
            );
          })}

        {layout.links.filter((l) => (depthOf.get(l.id) ?? 1) <= top && top >= layout.floors).map((l) => (
          <ClipRegion key={l.id} box={l.clip}>
            <DisplayLink from={l.from} rect={l.rect} screenY={layout.screenY} renderEvery={every} renderOffset={at(l.id) + 0.3} pulseKey={`link:${l.id}`} />
          </ClipRegion>
        ))}

        {avatar && <Avatar pos={avatar.pos} yaw={avatar.yaw} />}
      </group>
    </ActivityProvider>
  );
}

