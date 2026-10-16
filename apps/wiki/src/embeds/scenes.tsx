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
  Stage,
  Tank,
  layoutFactory,
  floorY,
  SLAB,
  type StageProps,
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

/** Each scene's body and camera. Floors are 1.6 units apart; the screen is on top. */
const SCENES: Record<SceneName, { stage: Partial<StageProps>; body: () => ReactNode }> = {
  overview: { stage: { eye: [5.6, 5.4, 6.2], target: [0, 2.4, 0.2], fov: 42 }, body: () => <Overview /> },
  surface: { stage: { eye: [-0.9, 5.75, 3.3], target: [0.1, 4.8, -0.6], fov: 60, autoRotate: false }, body: () => <Surface /> },
  cutaway: { stage: { eye: [5.5, 4.8, 6], target: [0, 1.8, 0.5], fov: 42 }, body: () => <Cutaway /> },
  floors: { stage: { eye: [8, 3.2, 3], target: [0, 2.2, 0], fov: 40, autoRotate: false }, body: () => <Floors /> },
  casing: { stage: { eye: [1.2, 1.3, 2.6], target: [-0.2, 0.35, 0], fov: 40 }, body: () => <CasingDemo /> },
  tank: { stage: { eye: [0.3, 1.1, 2.4], target: [0.1, 0.35, 0], fov: 40, floor: true }, body: () => <TankDemo /> },
  pipe: { stage: { eye: [2.6, 2, 2.6], target: [0.1, 0.5, 0.1], fov: 40 }, body: () => <PipeDemo /> },
  link: { stage: { eye: [2.4, 1.6, 2.6], target: [0, 0.75, 0], fov: 42 }, body: () => <LinkDemo /> },
  piston: { stage: { eye: [2.3, 1.7, 3.4], target: [0, 0.3, 0.9], fov: 42 }, body: () => <PistonDemo /> },
  fold: { stage: { eye: [6, 5.2, 4.5], target: [0, 2.4, 0.6], fov: 40, autoRotate: false }, body: () => <FoldDemo /> },
  event: { stage: { eye: [3.6, 4.6, 3.2], target: [0, 2.2, -0.5], fov: 45 }, body: () => <EventDemo /> },
  avatar: { stage: { eye: [1.1, 0.9, 1.6], target: [0, 0.5, 0], fov: 40 }, body: () => <AvatarDemo /> },
};

export default function EmbedScene({ spec }: { spec: EmbedSpec }) {
  const s = SCENES[spec.name];
  return <Stage {...s.stage}>{s.body()}</Stage>;
}
