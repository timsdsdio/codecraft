// Finds what you're looking at (the crosshair, or the mouse when it isn't captured) and reports the
// data it carries: items in ducts, calls in flight, casings, tanks, emitters.
import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import type { Cargo } from '@codecraft/visuals';

const ray = new THREE.Raycaster();
const center = new THREE.Vector2(0, 0);

function visible(o: THREE.Object3D | null): boolean {
  for (; o; o = o.parent) if (!o.visible) return false;
  return true;
}

function cargoOf(o: THREE.Object3D | null): Cargo | undefined {
  for (; o; o = o.parent) if (o.userData?.inspect) return o.userData.inspect as Cargo;
  return undefined;
}

export function Inspector({ onChange, maxDistance = 8 }: { onChange: (c: Cargo | null) => void; maxDistance?: number }) {
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const pointer = useThree((s) => s.pointer);
  const frame = useRef(0);
  const last = useRef('');
  useFrame(() => {
    if (frame.current++ % 3) return;
    const locked = document.pointerLockElement === gl.domElement;
    ray.setFromCamera(locked ? center : pointer, camera);
    ray.far = maxDistance;
    let found: Cargo | undefined;
    for (const hit of ray.intersectObjects(scene.children, true)) {
      if (!visible(hit.object)) continue;
      found = cargoOf(hit.object);
      if (found) break;
    }
    const key = found ? `${found.label}|${JSON.stringify(found.value)}` : '';
    if (key !== last.current) {
      last.current = key;
      onChange(found ?? null);
    }
  });
  return null;
}
