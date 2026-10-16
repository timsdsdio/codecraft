// Stylised low-poly neon hand tools (ported from the prototype's first-person viewmodel).
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { Tool } from './palette';

const ACCENT: Record<Tool, string> = { probe: '#00fff0', wire: '#ffffff', cutter: '#ff2050', wrench: '#ffe600' };

const neon = (hex: string, k: number) => new THREE.Color(hex).multiplyScalar(k);

interface Mats {
  body: THREE.Material;
  trim: THREE.Material;
  white: THREE.Material;
  accent: (hex: string, k?: number) => THREE.Material;
  all: THREE.Material[];
}

function part(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, p: [number, number, number], r: [number, number, number] = [0, 0, 0]) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...p);
  m.rotation.set(...r);
  parent.add(m);
  return m;
}

const X90: [number, number, number] = [-Math.PI / 2, 0, 0];
const Z90: [number, number, number] = [0, 0, Math.PI / 2];

function buildProbe(m: Mats) {
  const root = new THREE.Group();
  const accent = m.accent(ACCENT.probe);
  part(root, new THREE.CylinderGeometry(0.026, 0.032, 0.22, 8), m.body, [0, 0, 0.01], X90);
  part(root, new THREE.CylinderGeometry(0.035, 0.035, 0.05, 8), m.trim, [0, 0, 0.1], X90);
  part(root, new THREE.CylinderGeometry(0.036, 0.036, 0.008, 8), accent, [0, 0, 0.065], X90);
  part(root, new THREE.CylinderGeometry(0.01, 0.026, 0.06, 8), m.trim, [0, 0, -0.13], X90);
  part(root, new THREE.IcosahedronGeometry(0.014, 0), accent, [0, 0, -0.168]);
  part(root, new THREE.BoxGeometry(0.026, 0.006, 0.07), accent, [0, 0.03, -0.01]);
  const ring = part(root, new THREE.TorusGeometry(0.03, 0.0035, 4, 12), accent, [0, 0, -0.15]);
  return { root, spin: ring };
}

function buildWire(m: Mats) {
  const root = new THREE.Group();
  const accent = m.accent(ACCENT.wire, 2.4);
  const wound = m.accent('#ff00e5', 1.4);
  part(root, new THREE.CylinderGeometry(0.008, 0.008, 0.13, 6), m.trim, [0, 0, 0], Z90);
  part(root, new THREE.BoxGeometry(0.008, 0.07, 0.014), m.trim, [0.062, -0.035, 0]);
  part(root, new THREE.BoxGeometry(0.008, 0.07, 0.014), m.trim, [-0.062, -0.035, 0]);
  part(root, new THREE.BoxGeometry(0.13, 0.016, 0.02), m.body, [0, -0.072, 0]);
  const spin = new THREE.Group();
  root.add(spin);
  part(spin, new THREE.CylinderGeometry(0.048, 0.048, 0.084, 14, 1, true), wound, [0, 0, 0], Z90);
  for (const x of [-0.014, 0.014]) part(spin, new THREE.CylinderGeometry(0.0495, 0.0495, 0.0035, 14, 1, true), m.body, [x, 0, 0], Z90);
  for (const x of [-0.046, 0.046]) {
    part(spin, new THREE.CylinderGeometry(0.074, 0.074, 0.007, 12), m.body, [x, 0, 0], Z90);
    part(spin, new THREE.CylinderGeometry(0.076, 0.076, 0.009, 12, 1, true), accent, [x, 0, 0], Z90);
  }
  part(root, new THREE.CylinderGeometry(0.007, 0.007, 0.1, 5, 1, true), accent, [0, 0.062, -0.045], [-Math.PI / 2 + 0.45, 0, 0]);
  part(root, new THREE.BoxGeometry(0.02, 0.02, 0.03), m.trim, [0, 0.083, -0.1]);
  part(root, new THREE.BoxGeometry(0.011, 0.011, 0.01), accent, [0, 0.083, -0.119]);
  return { root, spin };
}

function buildCutter(m: Mats) {
  const root = new THREE.Group();
  const accent = m.accent(ACCENT.cutter);
  part(root, new THREE.CylinderGeometry(0.012, 0.012, 0.02, 8), m.white, [0, 0, 0]);
  for (const s of [1, -1] as const) {
    const g = new THREE.Group();
    root.add(g);
    part(g, new THREE.CylinderGeometry(0.003, 0.016, 0.075, 4), m.trim, [s * 0.009, 0, -0.045], X90);
    part(g, new THREE.BoxGeometry(0.005, 0.016, 0.065), accent, [s * 0.002, 0.004, -0.045]);
    part(g, new THREE.BoxGeometry(0.018, 0.014, 0.1), m.body, [s * 0.022, 0, 0.055], [0, s * -0.22, 0]);
    part(g, new THREE.BoxGeometry(0.022, 0.018, 0.08), accent, [s * 0.04, 0, 0.13], [0, s * -0.22, 0]);
  }
  return { root, spin: undefined };
}

function buildWrench(m: Mats) {
  const root = new THREE.Group();
  const accent = m.accent(ACCENT.wrench);
  part(root, new THREE.BoxGeometry(0.028, 0.012, 0.22), m.body, [0, 0, 0.04]);
  part(root, new THREE.BoxGeometry(0.008, 0.014, 0.16), accent, [0, 0.002, 0.05]);
  part(root, new THREE.BoxGeometry(0.084, 0.014, 0.026), m.trim, [0, 0, -0.08]);
  part(root, new THREE.BoxGeometry(0.018, 0.014, 0.05), m.trim, [0.033, 0, -0.115]);
  part(root, new THREE.BoxGeometry(0.018, 0.014, 0.05), m.trim, [-0.033, 0, -0.115]);
  part(root, new THREE.BoxGeometry(0.006, 0.016, 0.03), accent, [0.024, 0, -0.12]);
  part(root, new THREE.BoxGeometry(0.006, 0.016, 0.03), accent, [-0.024, 0, -0.12]);
  part(root, new THREE.CylinderGeometry(0.014, 0.014, 0.016, 6), accent, [0, 0, 0.15]);
  return { root, spin: undefined };
}

const BUILD = { probe: buildProbe, wire: buildWire, cutter: buildCutter, wrench: buildWrench };
/** Display pose per tool (shows the flat face, not the edge). */
const POSE: Record<Tool, [number, number, number]> = {
  probe: [0.5, 0, 0.9],
  wire: [0.3, -0.55, 0.12],
  cutter: [1.2, 0.15, 0.6],
  wrench: [1.2, 0.1, 0.85],
};

/** A tool model fitted to `size` world units (largest side), centred on its origin, turning slowly. */
export function ToolModel({ tool, size = 1.5 }: { tool: Tool; size?: number }) {
  const built = useMemo(() => {
    const all: THREE.Material[] = [];
    const track = <M extends THREE.Material>(x: M) => (all.push(x), x);
    const m: Mats = {
      body: track(new THREE.MeshStandardMaterial({ color: '#0b1220', metalness: 0.7, roughness: 0.35 })),
      trim: track(new THREE.MeshStandardMaterial({ color: '#1a2436', metalness: 0.8, roughness: 0.3 })),
      white: track(new THREE.MeshBasicMaterial({ color: neon('#ffffff', 2), toneMapped: false })),
      accent: (hex, k = 3) => track(new THREE.MeshBasicMaterial({ color: neon(hex, k), toneMapped: false })),
      all,
    };
    const r = BUILD[tool](m);
    r.root.rotation.set(...POSE[tool]);
    // fit: centre the posed model on the origin and scale its largest side to 1
    r.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(r.root);
    const dims = box.getSize(new THREE.Vector3());
    const k = 1 / Math.max(dims.x, dims.y, dims.z, 1e-6);
    r.root.position.copy(box.getCenter(new THREE.Vector3())).multiplyScalar(-1);
    return { ...r, all, k };
  }, [tool]);
  useEffect(
    () => () => {
      built.root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      built.all.forEach((x) => x.dispose());
    },
    [built],
  );
  const turn = useRef<THREE.Group>(null);
  useFrame(({ clock }, dt) => {
    if (turn.current) {
      turn.current.rotation.y += dt * 0.5;
      turn.current.position.y = Math.sin(clock.elapsedTime * 1.4) * 0.06;
    }
    if (built.spin) built.spin.rotation.x += dt * 1.2;
  });
  return (
    <group ref={turn}>
      <group scale={size * built.k}>
        <primitive object={built.root} />
      </group>
    </group>
  );
}
