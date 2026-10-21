// The electromagnetic field. Field plates, and the field machines standing among them, that touch at
// one height make a region; each cell of a region holds F = E + IB, where I = e₁₂₃, and the field
// obeys Maxwell's equations written as one, (∂ₜ + ∇)F = ρ − j (light's speed is 1 and ε₀ is 1, with
// time scaled so light crosses WAVE_SPEED blocks a second). A region is one layer, so the field
// depends only on e₁ and e₂, and it splits into two halves that never mix:
//   E₁, E₂ from charges        the scalar part, Gauss's law ∇·E = ρ, solved for a potential φ with
//                              E = −∇φ; charges never move, so this field is static
//   E₃, B₁, B₂ from currents   the vector and bivector parts, Ampère–Maxwell ∂ₜE = ∇×B − j and
//                              Faraday ∂ₜB = −∇×E, stepped on a staggered (Yee) grid; currents run up
//                              wires along e₃, so B circles them in the plane and ∇·B = 0 holds
// Outside a region the field is 0: its edge is earthed for φ and a conductor for E₃, with a little
// resistance in the outermost cells so waves are mostly absorbed there rather than echoing back.
// Sources are scaled by 2π so a charge q gives E ≈ q/r and a current I gives B ≈ I/r.
import { G3, Multivector, Q } from '@codecraft/ga';
import { valueOf, type Stack } from './items.ts';
import type { Block, Machine, World } from './world.ts';

export const WAVE_SPEED = 4; // blocks per second
export const PROBE_EVERY = 1; // seconds per reading
/** the antenna's frequencies, in swings a second */
export const FREQUENCIES = [0.25, 0.5, 1] as const;

export const FIELD_TYPES = ['plate', 'charge', 'wire', 'antenna', 'probe'] as const;
export type FieldType = (typeof FIELD_TYPES)[number];
export const isField = (b: Block | undefined): b is Extract<Machine, { type: FieldType }> =>
  b?.kind === 'machine' && (FIELD_TYPES as readonly string[]).includes(b.type);

const SOR = 1.8;
const SOR_SWEEPS = 30;
/** loss per unit time in the outermost cells, most at the edge, so waves fade into it instead of reflecting */
const EDGE_LOSS = [0.9, 0.5, 0.2];
/** how fast a source's current follows its setting, per second: a sudden change would ring through the field */
const RAMP = 3;

/** the value of the field at a point: E = (e1, e2, e3), B = (b1, b2, b3) */
export interface FieldValue {
  e: [number, number, number];
  b: [number, number, number];
}

const ZERO_VALUE: FieldValue = { e: [0, 0, 0], b: [0, 0, 0] };

/** F = E + IB as an exact multivector, each coefficient rounded to the nearest half */
export function reading(v: FieldValue): Multivector {
  const half = (n: number) => Q.q(Math.round(n * 2), 2);
  // I e₁ = e₂₃, I e₂ = e₃₁ = −e₁₃, I e₃ = e₁₂ (blades: e₁ 1, e₂ 2, e₃ 4)
  return Multivector.fromTerms(G3, [
    [1, half(v.e[0])],
    [2, half(v.e[1])],
    [4, half(v.e[2])],
    [6, half(v.b[0])],
    [5, half(-v.b[1])],
    [3, half(v.b[2])],
  ]);
}

/** E and IB in words, to `digits` decimal places: "0.5e₁ + 1.2e₃" */
export function fieldText(v: FieldValue, digits = 1) {
  const k = 10 ** digits;
  const terms = (c: number[], names: string[]) =>
    c
      .map((n, i) => [Math.round(n * k) / k, names[i]] as const)
      .filter(([n]) => n !== 0)
      .map(([n, l]) => `${n}${l}`)
      .join(' + ')
      .replace(/\+ -/g, '− ') || '0';
  return { e: terms(v.e, ['e₁', 'e₂', 'e₃']), ib: terms(v.b, ['e₂₃', 'e₃₁', 'e₁₂']) };
}

/** the e₃ coefficient of what a source holds: the current a wire or antenna carries */
export const upPart = (s: Stack | null) => coefficient(s, 4);
/** the scalar part of what a source holds: a charge */
export const scalarPart = (s: Stack | null) => coefficient(s, 0);
function coefficient(s: Stack | null, blade: number) {
  const mv = s ? valueOf(s) : null;
  return mv ? Q.toNumber(mv.terms.get(blade) ?? Q.ZERO) : 0;
}

class Region {
  readonly keys: string[] = [];
  readonly cells: [number, number, number][] = [];
  /** neighbours of each cell, 4 per cell: +e₁ (east), +e₂ (north), −e₁, −e₂; −1 outside */
  nb: Int32Array;
  edge: Float32Array;
  phi: Float32Array;
  rho: Float32Array;
  j3: Float32Array;
  /** each source's current, following its setting */
  amp: Float32Array;
  e3: Float32Array;
  /** B₁ on the edge to the +e₂ neighbour, and B₂ on the edge to the +e₁ neighbour */
  b1: Float32Array;
  b2: Float32Array;
  /** B on the −e₂ and −e₁ edges of cells whose neighbour there is outside */
  b1m: Float32Array;
  b2m: Float32Array;
  settled = false;

  constructor(cells: [number, number, number][]) {
    const n = cells.length;
    const index = new Map<string, number>();
    cells.forEach((c, i) => {
      this.cells.push(c);
      this.keys.push(c.join());
      index.set(c.join(), i);
    });
    this.nb = new Int32Array(4 * n);
    // e₁ is +x and e₂ is −z (world.ts)
    const steps = [[1, 0], [0, -1], [-1, 0], [0, 1]];
    cells.forEach(([x, y, z], i) => steps.forEach(([dx, dz], k) => (this.nb[4 * i + k] = index.get(`${x + dx},${y},${z + dz}`) ?? -1)));
    // distance to the edge, for the resistance that absorbs waves
    const depth = new Int32Array(n).fill(-1);
    let frontier: number[] = [];
    for (let i = 0; i < n; i++) if ([0, 1, 2, 3].some((k) => this.nb[4 * i + k] < 0)) (depth[i] = 0), frontier.push(i);
    for (let d = 1; frontier.length && d < EDGE_LOSS.length; d++) {
      const next: number[] = [];
      for (const i of frontier) for (let k = 0; k < 4; k++) {
        const j = this.nb[4 * i + k];
        if (j >= 0 && depth[j] < 0) (depth[j] = d), next.push(j);
      }
      frontier = next;
    }
    this.edge = Float32Array.from(depth, (d) => (d >= 0 ? EDGE_LOSS[d] : 0));
    this.phi = new Float32Array(n);
    this.rho = new Float32Array(n);
    this.j3 = new Float32Array(n);
    this.amp = new Float32Array(n);
    this.e3 = new Float32Array(n);
    this.b1 = new Float32Array(n);
    this.b2 = new Float32Array(n);
    this.b1m = new Float32Array(n);
    this.b2m = new Float32Array(n);
  }

  get size() {
    return this.cells.length;
  }

  /** relax φ toward ∇²φ = −ρ; stops working once it has settled */
  private relax() {
    if (this.settled) return;
    const { nb, phi, rho } = this;
    let change = 0;
    for (let s = 0; s < SOR_SWEEPS; s++) {
      change = 0;
      for (let i = 0; i < phi.length; i++) {
        let sum = rho[i];
        for (let k = 0; k < 4; k++) {
          const j = nb[4 * i + k];
          if (j >= 0) sum += phi[j];
        }
        const next = (1 - SOR) * phi[i] + (SOR * sum) / 4;
        change = Math.max(change, Math.abs(next - phi[i]));
        phi[i] = next;
      }
    }
    if (change < 1e-5) this.settled = true;
  }

  /** one step of the staggered scheme; h is in light-blocks */
  private wave(h: number) {
    const { nb, e3, b1, b2, b1m, b2m, j3, edge } = this;
    const n = e3.length;
    const at = (j: number) => (j >= 0 ? e3[j] : 0);
    for (let i = 0; i < n; i++) {
      // Faraday: ∂ₜB₁ = −∂₂E₃, ∂ₜB₂ = ∂₁E₃
      b1[i] -= h * (at(nb[4 * i + 1]) - e3[i]);
      b2[i] += h * (at(nb[4 * i]) - e3[i]);
      if (nb[4 * i + 3] < 0) b1m[i] -= h * e3[i];
      if (nb[4 * i + 2] < 0) b2m[i] += h * e3[i];
    }
    for (let i = 0; i < n; i++) {
      // Ampère–Maxwell: ∂ₜE₃ = ∂₁B₂ − ∂₂B₁ − j₃
      const w = nb[4 * i + 2];
      const s = nb[4 * i + 3];
      const curl = b2[i] - (w >= 0 ? b2[w] : b2m[i]) - (b1[i] - (s >= 0 ? b1[s] : b1m[i]));
      e3[i] = (e3[i] + h * (curl - j3[i])) * (1 - h * edge[i]);
    }
  }

  step(h: number) {
    this.relax();
    this.wave(h);
  }

  value(i: number): FieldValue {
    const { nb, phi, e3, b1, b2, b1m, b2m } = this;
    const p = (k: number) => {
      const j = nb[4 * i + k];
      return j >= 0 ? phi[j] : 0;
    };
    const w = nb[4 * i + 2];
    const s = nb[4 * i + 3];
    return {
      e: [-(p(0) - p(2)) / 2, -(p(1) - p(3)) / 2, e3[i]],
      b: [(b1[i] + (s >= 0 ? b1[s] : b1m[i])) / 2, (b2[i] + (w >= 0 ? b2[w] : b2m[i])) / 2, 0],
    };
  }
}

type Snapshot = Map<string, { phi: number; amp: number; e3: number; b1: number; b2: number; b1m: number; b2m: number }>;

export class Field {
  regions: Region[] = [];
  private where = new Map<string, [Region, number]>();
  private builtVersion = -1;
  /** seconds since the field started, for antennas */
  time = 0;

  /** find the regions again if blocks have changed, keeping the field in cells that are still there */
  sync(world: World) {
    if (world.version === this.builtVersion) return;
    this.builtVersion = world.version;
    const old: Snapshot = new Map();
    for (const r of this.regions)
      r.keys.forEach((k, i) => old.set(k, { phi: r.phi[i], amp: r.amp[i], e3: r.e3[i], b1: r.b1[i], b2: r.b2[i], b1m: r.b1m[i], b2m: r.b2m[i] }));
    const cells = new Map<string, [number, number, number]>();
    for (const [x, y, z] of world.active.values()) if (isField(world.get(x, y, z))) cells.set(`${x},${y},${z}`, [x, y, z]);
    this.regions = [];
    this.where.clear();
    const seen = new Set<string>();
    for (const [key, start] of cells) {
      if (seen.has(key)) continue;
      const group: [number, number, number][] = [];
      const todo = [start];
      seen.add(key);
      while (todo.length) {
        const c = todo.pop()!;
        group.push(c);
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const k = `${c[0] + dx},${c[1]},${c[2] + dz}`;
          if (cells.has(k) && !seen.has(k)) {
            seen.add(k);
            todo.push(cells.get(k)!);
          }
        }
      }
      const r = new Region(group);
      r.keys.forEach((k, i) => {
        this.where.set(k, [r, i]);
        const o = old.get(k);
        if (o) [r.phi[i], r.amp[i], r.e3[i], r.b1[i], r.b2[i], r.b1m[i], r.b2m[i]] = [o.phi, o.amp, o.e3, o.b1, o.b2, o.b1m, o.b2m];
      });
      this.regions.push(r);
    }
  }

  /** set every cell's sources from the blocks there, then step the field by dt seconds */
  step(world: World, dt: number) {
    this.sync(world);
    this.time += dt;
    for (const r of this.regions) {
      r.cells.forEach(([x, y, z], i) => {
        const b = world.get(x, y, z);
        const rho = b?.kind === 'machine' && b.type === 'charge' ? 2 * Math.PI * scalarPart(b.slot) : 0;
        if (rho !== r.rho[i]) r.settled = false;
        r.rho[i] = rho;
        const target = b?.kind === 'machine' && (b.type === 'wire' || b.type === 'antenna') ? 2 * Math.PI * upPart(b.slot) : 0;
        r.amp[i] += (target - r.amp[i]) * Math.min(1, RAMP * dt);
        r.j3[i] = b?.kind === 'machine' && b.type === 'antenna' ? r.amp[i] * Math.sin(2 * Math.PI * FREQUENCIES[b.frequency] * this.time) : r.amp[i];
      });
      r.step(WAVE_SPEED * dt);
    }
  }

  regionAt(x: number, y: number, z: number) {
    return this.where.get(`${x},${y},${z}`)?.[0];
  }

  at(x: number, y: number, z: number): FieldValue {
    const w = this.where.get(`${x},${y},${z}`);
    return w ? w[0].value(w[1]) : ZERO_VALUE;
  }

  /** what a probe at (x, y, z) reads now */
  read(x: number, y: number, z: number) {
    return reading(this.at(x, y, z));
  }
}
