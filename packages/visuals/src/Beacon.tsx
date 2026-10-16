// Red light pillar above a block with an unplugged required input, visible from across the room.
import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

const HEIGHT = 7.5;
const pillarGeo = new THREE.CylinderGeometry(0.2, 0.2, HEIGHT, 16, 1, true).translate(0, HEIGHT / 2, 0);
const ringGeo = new THREE.TorusGeometry(0.42, 0.035, 6, 32).rotateX(Math.PI / 2);

const pillarMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
  toneMapped: false,
  uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color('#ff2050') } },
  vertexShader: /* glsl */ `
    varying float vH;
    varying vec3 vN;
    varying vec3 vV;
    void main() {
      vH = position.y / ${HEIGHT.toFixed(1)};
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vN = normalize(normalMatrix * normal);
      vV = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uTime;
    uniform vec3 uColor;
    varying float vH;
    varying vec3 vN;
    varying vec3 vV;
    void main() {
      float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.5);
      float fade = (1.0 - vH) * (1.0 - vH);
      float beat = 0.55 + 0.45 * sin(uTime * 4.0);
      float rise = 0.5 + 0.5 * sin(vH * 18.0 - uTime * 6.0);
      float a = edge * fade * (0.5 + 0.5 * beat) * (0.6 + 0.4 * rise);
      gl_FragColor = vec4(uColor * a * 3.0, a);
    }
  `,
});
const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff2050').multiplyScalar(4), toneMapped: false, transparent: true });

export function Beacon({ y }: { y: number }) {
  const ring = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    pillarMat.uniforms.uTime.value = t;
    if (ring.current) {
      const p = (t * 0.6) % 1;
      ring.current.position.y = y + p * 2.5;
      ring.current.scale.setScalar(1 - p * 0.4);
      ringMat.opacity = 1 - p;
    }
  });
  return (
    <group>
      <mesh geometry={pillarGeo} material={pillarMat} position={[0, y, 0]} />
      <mesh ref={ring} geometry={ringGeo} material={ringMat} position={[0, y, 0]} />
    </group>
  );
}
