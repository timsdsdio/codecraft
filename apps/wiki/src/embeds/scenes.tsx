// The 3D chunk (lazy-loaded). Each embed is one small <Stage> scene built from @codecraft/visuals.
import type { ReactNode } from 'react';
import {
  Block,
  Cable,
  CUBE_Y,
  Monitor,
  NEON,
  monitorRootAt,
  SHAPES,
  Socket,
  Stage,
  ToolModel,
  Wall,
  socketAt,
  type BlockSpec,
  type SocketState,
  type StageProps,
  type Vec3,
} from '@codecraft/visuals';
import { blockOrThrow, IFACES } from '../data/catalog';
import type { EmbedSpec, SceneName } from './spec';

type Placed = { spec: BlockSpec; at: [number, number] };

/** Cable from `a.out` to `b.in`, styled by the provider's interface. */
function Wire({ a, out, b, inp, pulse = 2.4, active = true }: { a: Placed; out: string; b: Placed; inp: string; pulse?: number; active?: boolean }) {
  const from = socketAt(a.spec, a.at, out);
  const to = socketAt(b.spec, b.at, inp);
  const iface = a.spec.ports.find((p) => p.name === out)?.iface ?? out;
  if (!from || !to) return null;
  return <Cable from={from} to={to} iface={iface} kind={IFACES[iface]?.kind} pulseEvery={pulse} active={active} roundTrip={IFACES[iface]?.kind === 'cable'} />;
}

const put = (id: string, at: [number, number]): Placed => ({ spec: blockOrThrow(id), at });

function scene(name: SceneName): { stage: Partial<StageProps>; body: ReactNode } {
  switch (name) {
    case 'wiring': {
      const clock = put('system-clock', [-1.4, -2.6]);
      const ids = put('id-gen', [1.4, -2.6]);
      const repo = put('memory-todo-repo', [0, 0.8]);
      return {
        stage: { eye: [7.5, 4.6, 3], target: [0, 0.8, -0.9] },
        body: (
          <>
            <Block spec={clock.spec} at={clock.at} connected={['clock']} />
            <Block spec={ids.spec} at={ids.at} connected={['ids']} />
            <Block spec={repo.spec} at={repo.at} connected={['clock', 'ids']} portLabels />
            <Wire a={clock} out="clock" b={repo} inp="clock" pulse={1.7} />
            <Wire a={ids} out="ids" b={repo} inp="ids" pulse={2.3} />
          </>
        ),
      };
    }
    case 'link': {
      const svc = put('todo-service', [0, -3.4]);
      const link = put('mock-link', [0, 0]);
      const model = put('todos-model', [0, 3.4]);
      return {
        stage: { eye: [8.5, 4.8, 2.5], target: [0, 1, 0] },
        body: (
          <>
            <Wall />
            <Block spec={svc.spec} at={svc.at} connected={['api']} />
            <Block spec={link.spec} at={link.at} connected={['handler', 'remote']} title={false} />
            <Block spec={model.spec} at={model.at} connected={['api']} />
            <Wire a={svc} out="api" b={link} inp="handler" pulse={2.6} />
            <Wire a={link} out="remote" b={model} inp="api" pulse={2.6} />
          </>
        ),
      };
    }
    case 'missing':
    case 'replace': {
      const missing = name === 'missing';
      const list = put('todo-list', [0, 0]);
      const todos = put('todos-model', [-1.3, -3.2]);
      const filter = put('filter-model', [1.3, -3.2]);
      const item = put('todo-item', [-2.6, 0]);
      const neon = put('neon-todo-item', [2.6, 0]);
      const portState: Record<string, SocketState> = missing ? { item: 'missing' } : {};
      return {
        stage: { eye: [4.6, 5.4, 6.2], target: [0, 1, -1.2] },
        body: (
          <>
            <Block spec={list.spec} at={list.at} connected={missing ? ['todos', 'filter'] : ['todos', 'filter', 'item']} portState={portState} portLabels />
            <Block spec={todos.spec} at={todos.at} connected={['model']} />
            <Block spec={filter.spec} at={filter.at} connected={['model']} />
            <Wire a={todos} out="model" b={list} inp="todos" />
            <Wire a={filter} out="model" b={list} inp="filter" pulse={3.1} />
            {!missing && (
              <>
                <Block spec={item.spec} at={item.at} connected={['view']} />
                <Wire a={item} out="view" b={list} inp="item" pulse={1.9} />
                <Block spec={neon.spec} at={neon.at} active={false} portState={{ view: 'highlight' }} />
              </>
            )}
          </>
        ),
      };
    }
    case 'monitor':
    case 'monitor-missing': {
      const ok = name === 'monitor';
      const shell = put('app-shell', [0, -4.2]);
      const root = monitorRootAt([0, 0]);
      const from = socketAt(shell.spec, shell.at, 'root');
      return {
        stage: { eye: ok ? [7.5, 4.5, 8] : [-7, 4.2, -8], target: [0, 2, -1.2], fov: 42 },
        body: (
          <>
            <Monitor ok={ok} connected={ok} />
            <Block spec={shell.spec} at={shell.at} active={ok} connected={ok ? ['root'] : []} />
            {ok && from && <Cable from={from} to={root} iface="ui.Root@1" kind="view" pulseEvery={1.6} />}
          </>
        ),
      };
    }
    case 'shapes': {
      // every socket shape, male (top row) and female (bottom row), on a dark panel
      const row = (female: boolean, y: number) =>
        SHAPES.map((shape, k) => {
          return (
            <Socket
              key={`${shape}${female}`}
              iface={shape}
              visual={{ shape, color: NEON[k] }}
              state="active"
              placement={{ pos: [(k - 3.5) * 0.62, y, 0.05], normal: [0, 0, 1], euler: [0, 0, 0], face: 'front', female, radius: 0.17 }}
            />
          );
        });
      return {
        stage: { eye: [0, 1.25, 7], target: [0, 1.2, 0], floor: false, fov: 38, autoRotate: false },
        body: (
          <>
            <mesh position={[0, 1.2, 0]}>
              <boxGeometry args={[5.4, 1.7, 0.1]} />
              <meshStandardMaterial color="#060b14" metalness={0.6} roughness={0.3} />
            </mesh>
            {row(false, 1.6)}
            {row(true, 0.8)}
          </>
        ),
      };
    }
    case 'faces': {
      const list = put('todo-list', [0, 0]);
      return {
        stage: { eye: [4.2, 3.8, 3.6], target: [0, CUBE_Y, 0] },
        body: <Block spec={list.spec} at={list.at} portLabels />,
      };
    }
    case 'demand': {
      const stats = put('stats', [-1.6, -3.4]);
      const shell = put('app-shell', [0, -0.2]);
      const spare = put('neon-todo-item', [3.4, -2.6]);
      const root = monitorRootAt([0, 3.6]);
      const from = socketAt(shell.spec, shell.at, 'root');
      return {
        stage: { eye: [9, 6, 4], target: [0, 1.4, 0] },
        body: (
          <>
            <Monitor at={[0, 3.6]} connected />
            <Block spec={shell.spec} at={shell.at} connected={['root', 'footer']} />
            <Block spec={stats.spec} at={stats.at} connected={['view']} portState={{ todos: 'missing' }} />
            <Block spec={spare.spec} at={spare.at} active={false} />
            <Wire a={stats} out="view" b={shell} inp="footer" />
            {from && <Cable from={from} to={root} iface="ui.Root@1" kind="view" pulseEvery={1.6} />}
          </>
        ),
      };
    }
  }
}

export default function EmbedScene({ spec }: { spec: EmbedSpec }) {
  if (spec.type === 'block') {
    const blk = blockOrThrow(spec.id);
    const eye: Vec3 = [2.6, 2.1, 3.2];
    return (
      <Stage eye={eye} target={[0, CUBE_Y + 0.15, 0]}>
        <Block spec={blk} portLabels={spec.portLabels ?? true} title={spec.title ?? false} />
      </Stage>
    );
  }
  if (spec.type === 'tool') {
    return (
      <Stage eye={[0, 1.4, 3.2]} target={[0, 1.1, 0]} autoRotate={false}>
        <group position={[0, 1.1, 0]}>
          <ToolModel tool={spec.tool} />
        </group>
      </Stage>
    );
  }
  const s = scene(spec.name);
  return <Stage {...s.stage}>{s.body}</Stage>;
}
