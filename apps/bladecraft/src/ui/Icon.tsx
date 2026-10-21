// Item icons. A single blade is drawn like its 3D glyph (glyph.ts), in a fixed isometric view so e₁
// (east) runs to the lower right, e₂ (north) to the upper right and e₃ straight up. A multivector of
// several blades is drawn as a small grade card: the 2×4 layout with scalar and vectors on top and
// their duals below, a dot lit for each blade it holds. Cards show their holes in the same layout.
import type { ReactNode } from 'react';
import type { Multivector } from '@codecraft/ga';
import { parts, vectorColour } from '../game/glyph';
import type { Item, MachineType, Verb } from '../game/items';
import { MACHINE_LOOK, hex } from '../game/looks';

type V3 = [number, number, number];
const P = ([a, b, c]: V3): [number, number] => [0.82 * a + 0.5 * b, 0.36 * a - 0.42 * b - 0.92 * c];
const pt = (v: V3, s: number) => P(v).map((x) => (x * s).toFixed(2)).join(',');
const norm = (v: V3): V3 => {
  const l = Math.hypot(...v);
  return l ? [v[0] / l, v[1] / l, v[2] / l] : [0, 0, 0];
};
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const fit = (x: number, max: number) => (max * x) / (1 + x);

/** the grade-card layout: blade numbers by position, scalar and vectors on top, their duals below */
export const GRADE_CARD = [
  [0, 1, 2, 4],
  [7, 6, 5, 3],
];
const DOT_COLOUR: Record<number, string> = { 0: '#fff6d0', 1: '#ff5a5a', 2: '#5aff8a', 4: '#5aa8ff', 3: '#00fff0', 5: '#00fff0', 6: '#00fff0', 7: '#ffd25a' };
const VERB_MARK: Record<Verb, string> = { wedge: '∧', dot: '⌋', geometric: '×', sandwich: '↻', reverse: '~', grade: '⟨⟩' };

export function Icon({ item, size = 44 }: { item: Item; size?: number }) {
  return (
    <svg viewBox="-24 -24 48 48" width={size} height={size} aria-hidden="true">
      {item.kind === 'lattice' && <Cube colour="#00fff0" fill="#06131c" />}
      {item.kind === 'workbench' && (
        <>
          <Cube colour="#ffd25a" fill="#2a1a0c" />
          <text x="0" y="5" textAnchor="middle" fontSize="12" fill="#ffd25a" fontWeight="700">
            ∧⌋
          </text>
        </>
      )}
      {item.kind === 'element' && (item.mv.terms.size > 1 ? <GradeCard mv={item.mv} /> : <ElementIcon mv={item.mv} />)}
      {item.kind === 'machine' && <MachineIcon type={item.type} />}
      {item.kind === 'card' && <CardIcon mv={item.mv} verb={item.verb} right={item.right} />}
      {item.kind === 'plate' && <PlateIcon verb={item.verb} />}
      {item.kind === 'blank' && <CardIcon mv={null} verb={null} right={false} />}
      {item.kind === 'reading' && <ReadingIcon mv={item.mv} />}
    </svg>
  );
}

/** a multivector of several blades: the grade card with a dot lit per blade */
export function GradeCard({ mv, holes = false }: { mv: Multivector; holes?: boolean }) {
  return (
    <g>
      <rect x="-21" y="-14" width="42" height="28" rx="4" fill={holes ? '#6b5426' : '#13202c'} stroke="#ffd25a" strokeWidth="1.4" />
      {GRADE_CARD.map((row, r) =>
        row.map((blade, c) => {
          const c0 = mv.terms.get(blade);
          const x = -15 + c * 10;
          const y = -6 + r * 12;
          if (!c0) return <circle key={blade} cx={x} cy={y} r="3" fill="none" stroke={holes ? '#3a2a10' : '#2c4256'} strokeWidth="1" />;
          return holes ? (
            <circle key={blade} cx={x} cy={y} r="3.4" fill="#05080d" />
          ) : (
            <circle key={blade} cx={x} cy={y} r="3.6" fill={c0.n < 0 ? 'none' : DOT_COLOUR[blade]} stroke={DOT_COLOUR[blade]} strokeWidth="1.4" />
          );
        }),
      )}
    </g>
  );
}

function CardIcon({ mv, verb, right }: { mv: Multivector | null; verb: Verb | null; right: boolean }) {
  return (
    <g transform="rotate(-8)">
      <rect x="-20" y="-15" width="40" height="30" rx="3" fill="#b8913f" stroke="#ffe08a" strokeWidth="1.2" />
      <path d="M-20,-9 L-14,-15" stroke="#5a4418" strokeWidth="1.2" />
      {mv &&
        GRADE_CARD.map((row, r) =>
          row.map((blade, c) => (mv.terms.has(blade) ? <circle key={blade} cx={-12 + c * 8} cy={-6 + r * 8} r="2.6" fill="#05080d" /> : null)),
        )}
      {verb && (
        <text x="0" y="14" textAnchor="middle" fontSize="8" fontWeight="700" fill="#2a1a08">
          {VERB_MARK[verb]}
          {right ? ' ⟵' : ''}
        </text>
      )}
    </g>
  );
}

function PlateIcon({ verb }: { verb: Verb }) {
  return (
    <g>
      <rect x="-19" y="-11" width="38" height="22" rx="2" fill="#2f3a44" stroke="#c9d3dc" strokeWidth="1.4" />
      <rect x="-15" y="-7" width="30" height="14" rx="1" fill="#e2bf68" />
      <text x="0" y="5" textAnchor="middle" fontSize="11" fontWeight="700" fill="#2a1a08">
        {VERB_MARK[verb]}
      </text>
    </g>
  );
}

function ReadingIcon({ mv }: { mv: Multivector }) {
  return (
    <g>
      <path d="M-17,-18 L13,-18 L17,-14 L17,18 L-17,18 z" fill="#efe6cc" stroke="#7a6a40" strokeWidth="1.2" />
      <g transform="translate(0,2) scale(0.72)">
        <GradeCard mv={mv} />
      </g>
      <text x="0" y="-9" textAnchor="middle" fontSize="6" fontWeight="700" fill="#3a2a10">
        F = E + IB
      </text>
    </g>
  );
}

function MachineIcon({ type }: { type: MachineType }) {
  const { colour, symbol } = MACHINE_LOOK[type];
  const c = hex(colour);
  if (type === 'duct') {
    return (
      <g stroke={c} strokeWidth="1.6" strokeLinejoin="round" fill="rgba(0,255,240,0.15)">
        <rect x="-19" y="-6" width="38" height="12" rx="2" />
        <polyline points="-8,-3 -2,0 -8,3" fill="none" />
        <polyline points="4,-3 10,0 4,3" fill="none" />
      </g>
    );
  }
  return (
    <>
      <Cube colour={c} fill="#0a1722" />
      <text x="0" y="4" textAnchor="middle" fontSize={symbol.length > 4 ? 7 : 11} fill={c} fontWeight="700">
        {symbol}
      </text>
    </>
  );
}

function Cube({ colour, fill }: { colour: string; fill: string }) {
  const s = 15;
  const c: V3[] = [
    [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
    [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
  ];
  const face = (i: number[]) => i.map((k) => pt(c[k], s * 0.62)).join(' ');
  return (
    <g stroke={colour} strokeWidth="1.4" strokeLinejoin="round">
      <polygon points={face([4, 5, 6, 7])} fill={fill} />
      <polygon points={face([0, 1, 5, 4])} fill={fill} />
      <polygon points={face([1, 2, 6, 5])} fill={fill} />
    </g>
  );
}

export function ElementIcon({ mv }: { mv: Multivector }) {
  const p = parts(mv);
  const s = 20;
  const out: ReactNode[] = [];

  if (p.trivector) {
    const k = fit(Math.abs(p.trivector), 1.2) * 0.5;
    const c: V3[] = [
      [-k, -k, -k], [k, -k, -k], [k, k, -k], [-k, k, -k],
      [-k, -k, k], [k, -k, k], [k, k, k], [-k, k, k],
    ];
    const edges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    out.push(
      <g key="t" stroke={p.trivector > 0 ? '#ffd25a' : '#ff4dc4'} strokeWidth="1.2">
        {edges.map(([i, j]) => {
          const [x1, y1] = P(c[i]).map((v) => v * s);
          const [x2, y2] = P(c[j]).map((v) => v * s);
          return <line key={`${i}${j}`} x1={x1} y1={y1} x2={x2} y2={y2} />;
        })}
      </g>,
    );
  }

  const bl = Math.hypot(...p.normal);
  if (bl) {
    const n = norm(p.normal);
    const ref: V3 = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    const u = norm(cross(ref, n));
    const w = cross(n, u); // u → w runs the way the bivector turns
    const h = Math.sqrt(fit(bl, 0.9)) * 0.62;
    const at = (a: number, b: number): V3 => [u[0] * a + w[0] * b, u[1] * a + w[1] * b, u[2] * a + w[2] * b];
    const square = [at(h, h), at(-h, h), at(-h, -h), at(h, -h)].map((v) => pt(v, s)).join(' ');
    const r = h * 0.6;
    const arc = Array.from({ length: 25 }, (_, i) => {
      const t = 0.3 + (i / 24) * (Math.PI * 2 - 0.9);
      return pt(at(r * Math.cos(t), r * Math.sin(t)), s);
    });
    const tEnd = 0.3 + Math.PI * 2 - 0.9;
    const tip = P(at(r * Math.cos(tEnd + 0.35), r * Math.sin(tEnd + 0.35))).map((v) => v * s);
    const base1 = P(at(r * 0.75 * Math.cos(tEnd), r * 0.75 * Math.sin(tEnd))).map((v) => v * s);
    const base2 = P(at(r * 1.25 * Math.cos(tEnd), r * 1.25 * Math.sin(tEnd))).map((v) => v * s);
    out.push(
      <g key="b" stroke="#00fff0" strokeWidth="1.3" strokeLinejoin="round">
        <polygon points={square} fill="rgba(0,255,240,0.22)" />
        <polyline points={arc.join(' ')} fill="none" />
        <polygon points={[tip, base1, base2].map((q) => q.join(',')).join(' ')} fill="#00fff0" stroke="none" />
      </g>,
    );
  }

  const vl = Math.hypot(...p.vector);
  if (vl) {
    const d = norm(p.vector);
    const L = fit(vl, 3) * 0.95;
    const from = P([(-d[0] * L) / 2, (-d[1] * L) / 2, (-d[2] * L) / 2]).map((v) => v * s);
    const to = P([(d[0] * L) / 2, (d[1] * L) / 2, (d[2] * L) / 2]).map((v) => v * s);
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const l2 = Math.hypot(dx, dy) || 1;
    const [ux, uy] = [dx / l2, dy / l2];
    const head = 6;
    const colour = hex(vectorColour(p.vector));
    const back = [to[0] - ux * head, to[1] - uy * head];
    out.push(
      <g key="v" stroke={colour} fill={colour} strokeWidth="2.6" strokeLinecap="round">
        <line x1={from[0]} y1={from[1]} x2={back[0]} y2={back[1]} />
        <polygon
          stroke="none"
          points={`${to[0]},${to[1]} ${back[0] - uy * head * 0.6},${back[1] + ux * head * 0.6} ${back[0] + uy * head * 0.6},${back[1] - ux * head * 0.6}`}
        />
      </g>,
    );
  }

  if (p.scalar) {
    const r = fit(Math.abs(p.scalar), 9) + 3;
    const only = !vl && !bl && !p.trivector;
    out.push(
      <g key="s">
        <circle r={r} fill={p.scalar > 0 ? '#fff6d0' : '#ff4dc4'} opacity={only ? 1 : 0.85} />
        {only && (
          <text y="3.5" textAnchor="middle" fontSize="10" fontWeight="700" fill="#03070f">
            {Number.isInteger(p.scalar) ? p.scalar : p.scalar.toFixed(1)}
          </text>
        )}
      </g>,
    );
  }

  if (mv.isZero()) out.push(<text key="z" y="5" textAnchor="middle" fontSize="16" fill="#8aa">0</text>);
  return <>{out}</>;
}

