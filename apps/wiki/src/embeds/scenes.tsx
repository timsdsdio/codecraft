// The 3D chunk (lazy-loaded). Each embed is one small <Stage> scene built from @codecraft/visuals,
// mostly by running the reference app's snapshot through layoutFactory().
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Avatar,
  Belt,
  Casing,
  DisplayLink,
  Factory,
  Floor,
  Pipe,
  Piston,
  AccessPoint,
  Receiver,
  WirelessLink,
  WirelessRange,
  NEON,
  fnv1a,
  Stage,
  Tank,
  layoutFactory,
  floorY,
  SLAB,
  type Look,
  type StageProps,
  type WalkSpawn,
  type Vec3,
} from '@codecraft/visuals';
import { drawTodoApp, todoSnapshot } from '../data/todoApp';
import type { EmbedSpec, SceneName } from './spec';

const drawDefault = (ctx: CanvasRenderingContext2D, w: number, h: number) => drawTodoApp(ctx, w, h);

function useTodoLayout(items = 10, scrollTop = 40) {
  return useMemo(() => layoutFactory(todoSnapshot({ items, scrollTop })), [items, scrollTop]);
}

/** Ticks a value on an interval (for scenes that loop through states). */
function useCycle<T>(values: T[], ms: number): T {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setI((v) => (v + 1) % values.length), ms);
    return () => window.clearInterval(id);
  }, [values.length, ms]);
  return values[i];
}

/** Smoothly oscillating scroll offset, re-rendered ~20×/s. */
function useScrollWave(min: number, max: number, period = 6) {
  const [s, setS] = useState(min);
  useEffect(() => {
    const t0 = performance.now();
    const id = window.setInterval(() => {
      const t = (performance.now() - t0) / 1000;
      setS(Math.round(min + (max - min) * (0.5 - 0.5 * Math.cos((t / period) * Math.PI * 2))));
    }, 50);
    return () => window.clearInterval(id);
  }, [min, max, period]);
  return s;
}

function Overview() {
  const layout = useTodoLayout();
  return <Factory layout={layout} demo screen={{ draw: drawDefault, opacity: 0.55 }} avatar={{ pos: [0.6, layout.screenY + SLAB, 2.2], yaw: 2.6 }} />;
}

function Surface() {
  const layout = useTodoLayout();
  return <Factory layout={layout} screen={{ draw: drawDefault }} labels={false} avatar={{ pos: [-0.4, layout.screenY + SLAB, 1.1], yaw: 0.4 }} />;
}

function Cutaway() {
  const layout = useTodoLayout();
  return <Factory layout={layout} demo maxFloor={2} avatar={{ pos: [-1.3, floorY(2) + SLAB, 2.4], yaw: 2.9 }} />;
}

function Floors() {
  const layout = useTodoLayout();
  return <Factory layout={layout} labels screen={{ draw: drawDefault, opacity: 0.35 }} />;
}

function FoldDemo() {
  const scrollTop = useScrollWave(0, 200, 7);
  const layout = useTodoLayout(12, scrollTop);
  return <Factory layout={layout} demo screen={{ draw: (c, w, h) => drawTodoApp(c, w, h, { items: 12, scrollTop }), opacity: 0.3 }} labels={false} />;
}

function PistonDemo() {
  const count = useCycle([3, 4, 5, 6, 5, 4], 1400);
  const heads = useMemo(() => Array.from({ length: count }, (_, i) => ({ key: `k${i}`, pos: [0, 0.28, -0.6 + i * 0.56] as Vec3 })), [count]);
  return (
    <>
      <Casing pos={[0, SLAB, -1.15]} size={[0.8, 0.5, 0.5]} name="TodoList" />
      <Belt box={{ x0: -0.25, x1: 0.25, z0: -0.9, z1: 3.2 }} y={SLAB} />
      <Piston base={[0, 0.28, -0.9]} heads={heads} />
      {heads.map((h, i) => (
        <Pipe key={h.key} points={[[0.12, 0.28, h.pos[2]], [0.45, 0.28, h.pos[2]], [0.45, 1.1, h.pos[2]]]} kind="object" sendEvery={2.8} sendOffset={i * 0.15} />
      ))}
    </>
  );
}

function CasingDemo() {
  return (
    <>
      <Casing pos={[0, SLAB, 0]} size={[0.9, 0.5, 0.6]} name="AddTodo" renderEvery={2.4} />
      <Tank pos={[-0.72, SLAB, 0]} info={{ name: 'title', kind: 'string', preview: '"Buy milk"' }} fill={0.6} />
      <Pipe points={[[0, -0.6, 0.8], [0, -0.3, 0.8], [0, -0.3, 0], [0, SLAB, 0]]} kind="function" radius={0.02} sendEvery={2.4} />
      <DisplayLink from={[0, SLAB + 0.5, 0]} rect={{ x0: -1.4, x1: 1.4, z0: -0.35, z1: 0.35 }} screenY={1.6} renderEvery={2.4} renderOffset={0.2} />
    </>
  );
}

function TankDemo() {
  const fill = useCycle([0.3, 0.55, 0.8, 0.55], 1500);
  return (
    <>
      <Tank pos={[-0.4, 0, 0]} radius={0.16} height={0.6} info={{ name: 'todos', kind: 'array', preview: 'Array(10)' }} fill={fill} />
      <Tank pos={[0.1, 0, 0]} radius={0.16} height={0.6} info={{ name: 'filter', kind: 'string', preview: '"all"' }} fill={0.4} />
      <Tank pos={[0.6, 0, 0]} radius={0.16} height={0.6} info={{ name: 'open', kind: 'boolean', preview: 'true' }} fill={1} />
    </>
  );
}

function PipeDemo() {
  const runs: { kind: 'array' | 'object' | 'string' | 'number' | 'boolean'; x: number }[] = [
    { kind: 'array', x: -0.8 },
    { kind: 'object', x: -0.4 },
    { kind: 'string', x: 0 },
    { kind: 'number', x: 0.4 },
    { kind: 'boolean', x: 0.8 },
  ];
  return (
    <>
      {runs.map((r, i) => (
        <Pipe key={r.kind} kind={r.kind} points={[[r.x, 0.05, 1], [r.x, 0.05, 0], [r.x, 1.2, 0], [r.x, 1.2, -0.6]]} sendEvery={2.5} sendOffset={i * 0.3} />
      ))}
      <Pipe kind="function" radius={0.016} points={[[1.2, 1.2, -0.6], [1.2, 1.2, 0], [1.2, 0.05, 0], [1.2, 0.05, 1]]} sendEvery={2.5} sendOffset={1.6} />
    </>
  );
}

function LinkDemo() {
  const y = 1.4;
  return (
    <>
      <Floor size={[3, 2]} y={0} level={3} label={false} />
      <Casing pos={[0, SLAB, 0]} size={[0.9, 0.5, 0.4]} name="TodoItem" renderEvery={2.2} />
      <DisplayLink from={[0, SLAB + 0.5, 0]} rect={{ x0: -1.4, x1: 1.4, z0: -0.26, z1: 0.26 }} screenY={y} renderEvery={2.2} />
    </>
  );
}

function EventDemo() {
  const layout = useTodoLayout(6, 0);
  return <Factory layout={layout} demo event="item2" labels screen={{ draw: (c, w, h) => drawTodoApp(c, w, h, { items: 6, scrollTop: 0 }), opacity: 0.4 }} />;
}

function AvatarDemo() {
  return (
    <>
      <Avatar pos={[0, 0, 0]} yaw={0.5} />
      <Floor size={[2.4, 2.4]} y={-SLAB} level={0} label={false} />
    </>
  );
}

function WirelessDemo() {
  const channel = NEON[fnv1a('ThemeContext') & 7];
  const y = (f: number) => floorY(f) + SLAB;
  const every = 3;
  const ap: Vec3 = [0, y(1) + 0.5, 0.3];
  const consumers: { name: string; at: Vec3 }[] = [
    { name: 'ThemeToggle', at: [-0.75, y(3), -0.75] },
    { name: 'TodoItem', at: [0.75, y(3), 0.8] },
  ];
  const quiet: { name: string; at: Vec3; floor: number }[] = [
    { name: 'Toolbar', at: [-0.75, y(2), -0.75], floor: 2 },
    { name: 'TodoList', at: [0.75, y(2), 0.8], floor: 2 },
    { name: 'Header', at: [0.75, y(3), -0.75], floor: 3 },
  ];
  return (
    <>
      {[1, 2, 3].map((f) => (
        <Floor key={f} size={[3, 3]} y={floorY(f)} level={f} />
      ))}
      <Casing pos={[0, y(1), 0.3]} size={[0.9, 0.5, 0.5]} name="App" renderEvery={every} />
      <AccessPoint pos={ap} channel={channel} pulseEvery={every} pulseOffset={0.15} />
      <WirelessRange box={{ x0: -1.5, x1: 1.5, z0: -1.5, z1: 1.5 }} y0={0} y1={floorY(4)} channel={channel} />
      {quiet.map((q) => (
        <Casing key={q.name} pos={q.at} size={[0.7, 0.45, 0.4]} name={q.name} dim />
      ))}
      {consumers.map((c, i) => (
        <group key={c.name}>
          <Casing pos={c.at} size={[0.7, 0.45, 0.4]} name={c.name} renderEvery={every} renderOffset={0.85} />
          <Receiver pos={[c.at[0] + 0.25, c.at[1] + 0.45, c.at[2]]} channel={channel} />
          <WirelessLink from={[ap[0], ap[1] + 0.39, ap[2]]} to={[c.at[0] + 0.25, c.at[1] + 0.65, c.at[2]]} channel={channel} pulseEvery={every} pulseOffset={0.2 + i * 0.05} />
        </group>
      ))}
      {[quiet[0], quiet[1]].map((q) => (
        <Pipe key={q.name} kind="object" points={[[0, y(1) + 0.5, 0.3], [0, y(2) - 0.25, 0.3], [q.at[0], y(2) - 0.25, 0.3], [q.at[0], y(2) - 0.25, q.at[2]], [q.at[0], y(2), q.at[2]]]} dim />
      ))}
    </>
  );
}

/** Where you can stand in walk mode, and what each level is called. */
interface WalkSpec {
  levels: { y: number; name: string }[];
  spawn: WalkSpawn;
}
const floorsUpTo = (n: number, screen: boolean) => [
  ...Array.from({ length: n }, (_, i) => ({ y: floorY(i + 1) + SLAB, name: `Floor ${i + 1}` })),
  ...(screen ? [{ y: floorY(n + 1) + SLAB, name: 'Screen' }] : []),
];
const TODO_WALK: WalkSpec = { levels: floorsUpTo(3, true), spawn: { pos: [-1.1, floorY(4) + SLAB, 3.3], yaw: -0.2 } };
const ground = (pos: Vec3, yaw = 0): WalkSpec => ({ levels: [{ y: 0, name: 'Ground' }], spawn: { pos, yaw } });

/** Each scene's body, camera, and walk-mode levels. Floors are 1.6 units apart; the screen is on top. */
const SCENES: Record<SceneName, { stage: Partial<StageProps>; body: () => ReactNode; walk: WalkSpec }> = {
  overview: { stage: { eye: [5.6, 5.4, 6.2], target: [0, 2.4, 0.2], fov: 42 }, body: () => <Overview />, walk: TODO_WALK },
  surface: { stage: { eye: [-0.9, 5.75, 3.3], target: [0.1, 4.8, -0.6], fov: 60, autoRotate: false }, body: () => <Surface />, walk: TODO_WALK },
  cutaway: { stage: { eye: [5.5, 4.8, 6], target: [0, 1.8, 0.5], fov: 42 }, body: () => <Cutaway />, walk: { levels: floorsUpTo(2, false), spawn: { pos: [1.4, floorY(2) + SLAB, 2.9], yaw: 0.35 } } },
  floors: { stage: { eye: [8, 3.2, 3], target: [0, 2.2, 0], fov: 40, autoRotate: false }, body: () => <Floors />, walk: TODO_WALK },
  casing: { stage: { eye: [1.2, 1.3, 2.6], target: [-0.2, 0.35, 0], fov: 40 }, body: () => <CasingDemo />, walk: ground([0.5, 0, 2], 0.2) },
  tank: { stage: { eye: [0.3, 1.1, 2.4], target: [0.1, 0.35, 0], fov: 40, floor: true }, body: () => <TankDemo />, walk: ground([0.1, 0, 1.6]) },
  pipe: { stage: { eye: [2.6, 2, 2.6], target: [0.1, 0.5, 0.1], fov: 40 }, body: () => <PipeDemo />, walk: ground([0.3, 0, 2.6]) },
  link: { stage: { eye: [2.4, 1.6, 2.6], target: [0, 0.75, 0], fov: 42 }, body: () => <LinkDemo />, walk: { levels: [{ y: SLAB, name: 'Floor 3' }], spawn: { pos: [0.6, SLAB, 1.8], yaw: 0.25 } } },
  piston: { stage: { eye: [2.3, 1.7, 3.4], target: [0, 0.3, 0.9], fov: 42 }, body: () => <PistonDemo />, walk: ground([1.1, 0, 3.6], 0.3) },
  fold: { stage: { eye: [6, 5.2, 4.5], target: [0, 2.4, 0.6], fov: 40, autoRotate: false }, body: () => <FoldDemo />, walk: TODO_WALK },
  event: { stage: { eye: [3.6, 4.6, 3.2], target: [0, 2.2, -0.5], fov: 45 }, body: () => <EventDemo />, walk: TODO_WALK },
  wireless: { stage: { eye: [3.6, 4.4, 4.2], target: [0, 2.1, 0], fov: 45 }, body: () => <WirelessDemo />, walk: { levels: floorsUpTo(3, false), spawn: { pos: [1.2, SLAB, 1.6], yaw: 0.6 } } },
  avatar: { stage: { eye: [1.1, 0.9, 1.6], target: [0, 0.5, 0], fov: 40 }, body: () => <AvatarDemo />, walk: ground([0.3, 0, 1.8]) },
};

export default function EmbedScene({
  spec,
  look,
  mode = 'orbit',
  onLevel,
}: {
  spec: EmbedSpec;
  look: Look;
  /** fullscreen: walk around in first person, or orbit with touch enabled */
  mode?: 'orbit' | 'walk' | 'explore-orbit';
  onLevel?: (name: string) => void;
}) {
  const s = SCENES[spec.name];
  const walk = {
    levels: s.walk.levels.map((l) => l.y),
    spawn: s.walk.spawn,
    onLevel: (i: number) => onLevel?.(s.walk.levels[i]?.name ?? ''),
  };
  return (
    <Stage {...s.stage} look={look} mode={mode === 'walk' ? 'walk' : 'orbit'} walk={walk} touchOrbit={mode === 'explore-orbit'}>
      {s.body()}
    </Stage>
  );
}
