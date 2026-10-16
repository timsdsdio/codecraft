// Socket shape outlines as plain [x, y] pairs: no three.js, so 2D swatches can use them too.
import type { SocketShape } from './palette';

export type Pt = [number, number];

function poly(n: number, r: number, rot = Math.PI / 2): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return pts;
}

/** Counter-clockwise outline of a unit-ish shape. */
export function shapePoints(shape: SocketShape): Pt[] {
  switch (shape) {
    case 'circle':
      return poly(40, 1);
    case 'square':
      return poly(4, 1.12, Math.PI / 4);
    case 'triangle':
      return poly(3, 1.22);
    case 'diamond':
      return [[0, 1.2], [-0.78, 0], [0, -1.2], [0.78, 0]];
    case 'hexagon':
      return poly(6, 1.06, 0);
    case 'pentagon':
      return poly(5, 1.1);
    case 'star': {
      const pts: Pt[] = [];
      for (let i = 0; i < 10; i++) {
        const a = Math.PI / 2 + (i / 10) * Math.PI * 2;
        const r = i % 2 === 0 ? 1.25 : 0.52;
        pts.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
      return pts;
    }
    case 'cross': {
      const w = 0.34,
        e = 1.05;
      return [[w, w], [w, e], [-w, e], [-w, w], [-e, w], [-e, -w], [-w, -w], [-w, -e], [w, -e], [w, -w], [e, -w], [e, w]];
    }
  }
}

/** SVG path for a shape outline in a 2×2 box centred on 0 (for 2D swatches). */
export function shapePath(shape: SocketShape): string {
  return shapePoints(shape).map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(3)} ${(-y).toFixed(3)}`).join('') + 'Z';
}
