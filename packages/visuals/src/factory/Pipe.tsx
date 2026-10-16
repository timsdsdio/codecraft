// A pipe: straight runs with brass couplings at each bend. The core glows in the value kind's
// colour; fluid drifts along it, and a bright slug travels the length whenever a value is sent.
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { KIND_COLOR, type ValueKind } from '../palette';
import { useClip } from './clip';
import { useActivity } from './activity';
import { useMetal } from './look';
import type { Vec3 } from './layout';

const vert = /* glsl */ `
  #include <common>
  #include <clipping_planes_pars_vertex>
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vView;
  void main() {
    vUv = uv;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vView = normalize(-mvPosition.xyz);
    gl_Position = projectionMatrix * mvPosition;
    #include <clipping_planes_vertex>
  }
`;
const frag = /* glsl */ `
  #include <common>
  #include <clipping_planes_pars_fragment>
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uLen;
  uniform float uFlow;
  uniform vec4 uSlug;
  uniform float uDim;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vView;
  float slug(float f) {
    if (f < -0.5) return 0.0;
    float d = (vUv.x - f) * uLen / 0.28;
    return exp(-d * d);
  }
  void main() {
    #include <clipping_planes_fragment>
    float s = fract(vUv.x * uLen / 0.4 - uTime * uFlow);
    float wave = 0.5 + 0.5 * sin(s * 6.2831);
    float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vView))), 1.5);
    float sl = slug(uSlug.x) + slug(uSlug.y) + slug(uSlug.z) + slug(uSlug.w);
    vec3 c = uColor * (0.22 + 0.35 * wave + 0.6 * rim) * uDim;
    c += (uColor * 2.6 + vec3(1.6)) * min(sl, 1.5);
    gl_FragColor = vec4(c, 1.0);
  }
`;

export function Pipe({
  points,
  kind,
  radius = 0.035,
  sendEvery,
  sendOffset = 0,
  reverse = false,
  dim = false,
  pulseKey,
}: {
  points: Vec3[];
  kind: ValueKind;
  radius?: number;
  /** demo: send a value down the pipe every N seconds */
  sendEvery?: number;
  sendOffset?: number;
  /** slugs travel from the last point to the first (event wires) */
  reverse?: boolean;
  dim?: boolean;
  /** live: send a slug whenever the Activity store pulses this key */
  pulseKey?: string;
}) {
  const clip = useClip();
  const activity = useActivity();
  const lastLive = useRef<number | undefined>(undefined);
  const coupling = useMetal('frame', KIND_COLOR[kind]);
  const key = JSON.stringify(points);
  const geo = useMemo(() => {
    const path = new THREE.CurvePath<THREE.Vector3>();
    const v = points.map((p) => new THREE.Vector3(...p));
    for (let i = 0; i < v.length - 1; i++) if (v[i].distanceToSquared(v[i + 1]) > 1e-8) path.add(new THREE.LineCurve3(v[i], v[i + 1]));
    const len = path.getLength();
    const segs = Math.max(8, Math.round(len * 24));
    return { len, tube: new THREE.TubeGeometry(path, segs, radius, 8, false), joints: v };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, radius]);
  useEffect(() => () => geo.tube.dispose(), [geo]);

  const color = KIND_COLOR[kind];
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        toneMapped: false,
        clipping: true,
        uniforms: {
          uColor: { value: new THREE.Color(color) },
          uTime: { value: 0 },
          uLen: { value: 1 },
          uFlow: { value: 0.6 },
          uSlug: { value: new THREE.Vector4(-1, -1, -1, -1) },
          uDim: { value: 1 },
        },
      }),
    [color],
  );
  useEffect(() => () => mat.dispose(), [mat]);
  useEffect(() => {
    mat.clippingPlanes = clip;
  }, [mat, clip]);

  const sent = useRef<number[]>([]);
  const lastSend = useRef(-Infinity);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const u = mat.uniforms;
    u.uTime.value = t;
    u.uLen.value = geo.len;
    u.uDim.value = dim ? 0.35 : 1;
    if (sendEvery && t - sendOffset - lastSend.current > sendEvery && t > sendOffset) {
      lastSend.current = t - sendOffset;
      sent.current.push(t);
    }
    const live = pulseKey ? activity?.latest(pulseKey) : undefined;
    if (live !== undefined && live !== lastLive.current) {
      lastLive.current = live;
      sent.current.push(t - (activity!.now() - live));
    }
    const dur = Math.min(1.6, 0.35 + geo.len * 0.18);
    sent.current = sent.current.filter((s) => t - s < dur).slice(-4);
    const arr = [-1, -1, -1, -1];
    sent.current.forEach((s, i) => {
      const p = (t - s) / dur;
      arr[i] = reverse ? 1 - p : p;
    });
    (u.uSlug.value as THREE.Vector4).set(arr[0], arr[1], arr[2], arr[3]);
  });

  return (
    <group>
      <mesh geometry={geo.tube} material={mat} />
      {geo.joints.map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[radius * 1.45, 10, 8]} />
          <meshStandardMaterial {...coupling} clippingPlanes={clip} />
        </mesh>
      ))}
    </group>
  );
}
