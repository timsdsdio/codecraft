// React context, AE2-style. A provider is a Wireless Access Point on its casing; consumers carry a
// receiver; a value change pulses from the access point straight to every receiver in range,
// skipping the floors in between.
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useClip } from './clip';
import { useMetal } from './look';
import type { Box, Vec3 } from './layout';

/** Mast + fins + glowing core, standing on a casing's top. `pos` = base of the mast. */
export function AccessPoint({ pos, channel, pulseEvery, pulseOffset = 0 }: { pos: Vec3; channel: string; pulseEvery?: number; pulseOffset?: number }) {
  const clip = useClip();
  const metal = useMetal('frame', channel);
  const coreColor = useMemo(() => new THREE.Color(channel), [channel]);
  const core = useRef<THREE.MeshBasicMaterial>(null);
  const ring = useRef<THREE.Mesh>(null);
  const last = useRef(-Infinity);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime - pulseOffset;
    if (pulseEvery && t > 0 && t - last.current > pulseEvery) last.current = t;
    const k = Math.max(0, 1 - (t - last.current) / 0.8);
    core.current?.color.copy(coreColor).multiplyScalar(1.6 + 3 * k + 0.4 * Math.sin(clock.elapsedTime * 3));
    if (ring.current) {
      const p = Math.min(1, (t - last.current) / 0.8);
      ring.current.visible = p < 1;
      ring.current.scale.setScalar(0.1 + p * 1.4);
      (ring.current.material as THREE.MeshBasicMaterial).opacity = 1 - p;
    }
  });
  return (
    <group position={pos}>
      <mesh position={[0, 0.03, 0]}>
        <boxGeometry args={[0.22, 0.06, 0.22]} />
        <meshStandardMaterial {...metal} clippingPlanes={clip} />
      </mesh>
      <mesh position={[0, 0.2, 0]}>
        <cylinderGeometry args={[0.018, 0.022, 0.3, 8]} />
        <meshStandardMaterial {...metal} clippingPlanes={clip} />
      </mesh>
      {[0.12, 0.2, 0.28].map((y, i) => (
        <mesh key={y} position={[0, y, 0]} rotation={[0, (i * Math.PI) / 4, 0]}>
          <boxGeometry args={[0.16 - i * 0.03, 0.012, 0.03]} />
          <meshStandardMaterial {...metal} clippingPlanes={clip} />
        </mesh>
      ))}
      <mesh position={[0, 0.39, 0]}>
        <icosahedronGeometry args={[0.05, 0]} />
        <meshBasicMaterial ref={core} color={coreColor} toneMapped={false} clippingPlanes={clip} />
      </mesh>
      <mesh ref={ring} position={[0, 0.39, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.9, 1, 32]} />
        <meshBasicMaterial color={coreColor.clone().multiplyScalar(2)} toneMapped={false} transparent depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/** A small antenna and status lamp on a consuming casing. `pos` = base. */
export function Receiver({ pos, channel, linked = true }: { pos: Vec3; channel: string; linked?: boolean }) {
  const clip = useClip();
  const metal = useMetal('rail', channel);
  const lamp = useMemo(() => new THREE.Color(linked ? channel : '#ff2050').multiplyScalar(2.2), [channel, linked]);
  return (
    <group position={pos}>
      <mesh position={[0, 0.09, 0]}>
        <cylinderGeometry args={[0.01, 0.014, 0.18, 6]} />
        <meshStandardMaterial {...metal} clippingPlanes={clip} />
      </mesh>
      <mesh position={[0, 0.2, 0]}>
        <sphereGeometry args={[0.03, 10, 8]} />
        <meshBasicMaterial color={lamp} toneMapped={false} clippingPlanes={clip} />
      </mesh>
    </group>
  );
}

const dashVert = /* glsl */ `
  attribute float aT;
  varying float vT;
  void main() { vT = aT; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const dashFrag = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uPulse;
  varying float vT;
  void main() {
    float dash = step(0.5, fract(vT * 14.0 - uTime * 0.6));
    float p = uPulse < 0.0 ? 0.0 : exp(-pow((vT - uPulse) * 9.0, 2.0)) * 3.0;
    float a = 0.4 * dash + p;
    gl_FragColor = vec4(uColor * (0.6 + p), a);
  }
`;

/** A faint dashed arc from an access point to a receiver; a bright dot runs along it on each pulse. */
export function WirelessLink({ from, to, channel, pulseEvery, pulseOffset = 0 }: { from: Vec3; to: Vec3; channel: string; pulseEvery?: number; pulseOffset?: number }) {
  const geo = useMemo(() => {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const mid = a.clone().lerp(b, 0.5);
    mid.y += 0.4 + a.distanceTo(b) * 0.12;
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    const pts = curve.getPoints(48);
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    g.setAttribute('aT', new THREE.Float32BufferAttribute(pts.map((_, i) => i / (pts.length - 1)), 1));
    return g;
  }, [from[0], from[1], from[2], to[0], to[1], to[2]]); // eslint-disable-line react-hooks/exhaustive-deps
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: dashVert,
        fragmentShader: dashFrag,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        uniforms: { uColor: { value: new THREE.Color(channel).multiplyScalar(1.6) }, uTime: { value: 0 }, uPulse: { value: -1 } },
      }),
    [channel],
  );
  const last = useRef(-Infinity);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime - pulseOffset;
    mat.uniforms.uTime.value = clock.elapsedTime;
    if (pulseEvery && t > 0 && t - last.current > pulseEvery) last.current = t;
    const p = (t - last.current) / 0.7;
    mat.uniforms.uPulse.value = p >= 0 && p <= 1.1 ? p : -1;
  });
  const line = useMemo(() => new THREE.Line(geo, mat), [geo, mat]);
  return <primitive object={line} />;
}

/** The access point's range: a dotted column over the provider's footprint (shown when inspected). */
export function WirelessRange({ box, y0, y1, channel }: { box: Box; y0: number; y1: number; channel: string }) {
  const color = useMemo(() => new THREE.Color(channel).multiplyScalar(1.4), [channel]);
  const corners: [number, number][] = [
    [box.x0, box.z0],
    [box.x1, box.z0],
    [box.x0, box.z1],
    [box.x1, box.z1],
  ];
  const h = y1 - y0;
  return (
    <group>
      {corners.map(([x, z], i) =>
        Array.from({ length: Math.floor(h / 0.12) }, (_, j) => (
          <mesh key={`${i}-${j}`} position={[x, y0 + 0.06 + j * 0.12, z]}>
            <boxGeometry args={[0.015, 0.05, 0.015]} />
            <meshBasicMaterial color={color} toneMapped={false} transparent opacity={0.7} />
          </mesh>
        )),
      )}
    </group>
  );
}
