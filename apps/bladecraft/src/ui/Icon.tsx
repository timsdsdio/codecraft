// Item icons: the same pictures as the 3D glyphs (glyph.ts), drawn in a fixed isometric view so
// e₁ (east) runs to the lower right, e₂ (north) to the upper right and e₃ straight up.
import type { ReactNode } from 'react';
import type { Multivector } from '@codecraft/ga';
import { parts, vectorColour } from '../game/glyph';
import type { Item } from '../game/items';

type V3 = [number, number, number];
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
const P = ([a, b, c]: V3): [number, number] => [0.82 * a + 0.5 * b, 0.36 * a - 0.42 * b - 0.92 * c];
const pt = (v: V3, s: number) => P(v).map((x) => (x * s).toFixed(2)).join(',');
const norm = (v: V3): V3 => {
  const l = Math.hypot(...v);
  return l ? [v[0] / l, v[1] / l, v[2] / l] : [0, 0, 0];
};
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const fit = (x: number, max: number) => (max * x) / (1 + x);

export function Icon({ item, size = 44 }: { item: Item; size?: number }) {
  return (
    <svg viewBox="-24 -24 48 48" width={size} height={size} aria-hidden="true">
      {item.kind === 'lattice' && <Cube colour="#00fff0" fill="#06131c" />}
      {item.kind === 'bench' && (
        <>
          <Cube colour="#ffd25a" fill="#0b1420" />
          <text x="0" y="5" textAnchor="middle" fontSize="13" fill="#ffd25a" fontWeight="700">
            ∧
          </text>
        </>
      )}
      {item.kind === 'element' && <ElementIcon mv={item.mv} />}
    </svg>
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

function ElementIcon({ mv }: { mv: Multivector }) {
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

