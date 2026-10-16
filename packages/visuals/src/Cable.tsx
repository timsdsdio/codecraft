// A cable: CatmullRom tube leaving each socket along its normal, with flowing dashes
// (provider → consumer) and bright travelling flashes for calls.
import { memo, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { visualFor } from './palette';
import { cableCurve } from './geometry';
import type { PortKind, Vec3 } from './layout';

const vert = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vView;
  void main() {
    vUv = uv;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vView = normalize(-mvPosition.xyz);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const frag = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uDim;
  uniform float uLen;
  uniform vec4 uFlash;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vView;

  float flash(float f) {
    if (f < -0.5) return 0.0;
    float d = (vUv.x - f) * uLen / 0.45;
    return exp(-d * d);
  }

  void main() {
    float d = fract(vUv.x * uLen / 0.55 - uTime * 1.3);
    float dash = smoothstep(0.0, 0.12, d) * (1.0 - smoothstep(0.42, 0.55, d));
    float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vView))), 1.6);
    float fl = flash(uFlash.x) + flash(uFlash.y) + flash(uFlash.z) + flash(uFlash.w);
    vec3 c = uColor * (0.28 + 0.95 * dash + 0.55 * rim) * uDim;
    c += (uColor * 3.0 + vec3(2.2)) * min(fl, 1.6);
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

export interface CableEnd {
  pos: Vec3;
  normal: Vec3;
}

export const Cable = memo(function Cable({
  from,
  to,
  iface,
  kind = 'value',
  active = true,
  pulseEvery,
  roundTrip = false,
}: {
  from: CableEnd;
  to: CableEnd;
  iface: string;
  kind?: PortKind;
  active?: boolean;
  /** demo: emit a call flash every N seconds */
  pulseEvery?: number;
  /** demo: each call flash is answered by a response flash travelling back */
  roundTrip?: boolean;
}) {
  const color = visualFor(iface).color;
  const key = `${from.pos}|${from.normal}|${to.pos}|${to.normal}|${kind}`;
  const geo = useMemo(() => {
    const curve = cableCurve(
      new THREE.Vector3(...from.pos),
      new THREE.Vector3(...from.normal),
      new THREE.Vector3(...to.pos),
      new THREE.Vector3(...to.normal),
    );
    const radius = kind === 'cable' ? 0.085 : kind === 'view' ? 0.045 : 0.036;
    const len = curve.getLength();
    const segs = Math.max(24, Math.min(96, Math.round(len * 6)));
    return { len, tube: new THREE.TubeGeometry(curve, segs, radius, kind === 'cable' ? 10 : 7, false) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => () => geo.tube.dispose(), [geo]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        fog: true,
        toneMapped: false,
        uniforms: THREE.UniformsUtils.merge([
          THREE.UniformsLib.fog,
          {
            uColor: { value: new THREE.Color(color) },
            uTime: { value: 0 },
            uDim: { value: 1 },
            uLen: { value: 1 },
            uFlash: { value: new THREE.Vector4(-1, -1, -1, -1) },
          },
        ]),
      }),
    [color],
  );
  useEffect(() => () => material.dispose(), [material]);

  const flashes = useRef<{ t0: number; back: boolean }[]>([]);
  const lastPulse = useRef(-Infinity);
  useFrame(({ clock }) => {
    const u = material.uniforms;
    const t = clock.elapsedTime;
    u.uTime.value = t;
    u.uDim.value += ((active ? 1.6 : 0.45) - u.uDim.value) * 0.12;
    u.uLen.value = geo.len;
    const dur = Math.min(0.9, 0.26 + geo.len * 0.045);
    const list = flashes.current;
    if (pulseEvery && active && t - lastPulse.current > pulseEvery) {
      lastPulse.current = t;
      list.push({ t0: t, back: false });
      if (roundTrip) list.push({ t0: t + dur + 0.12, back: true });
    }
    for (let i = list.length - 1; i >= 0; i--) if (t - list[i].t0 > dur) list.splice(i, 1);
    const arr = [-1, -1, -1, -1];
    for (let i = 0; i < list.length && i < 4; i++) {
      const p = (t - list[i].t0) / dur;
      if (p >= 0) arr[i] = list[i].back ? 1 - p : p;
    }
    (u.uFlash.value as THREE.Vector4).set(arr[0], arr[1], arr[2], arr[3]);
  });

  return <mesh geometry={geo.tube} material={material} />;
});
