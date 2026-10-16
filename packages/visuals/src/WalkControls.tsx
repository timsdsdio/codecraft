// First-person walking for any scene: WASD / joystick to move, mouse (pointer lock) or drag to look,
// and up/down jumps between the scene's standing levels (factory floors and the screen).
// Touch UIs drive it through the shared `walkInput` object.
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import type { Vec3 } from './factory/layout';
import { walkInput } from './input';

export const EYE = 0.9;
const SPEED = 1.5;
const LOOK_SENS = 0.0025;

export interface WalkSpawn {
  pos: Vec3;
  /** radians; 0 faces −z */
  yaw?: number;
}

export function WalkControls({
  levels = [0],
  spawn = { pos: [0, 0, 3] },
  bounds = 12,
  onLevel,
}: {
  /** heights you can stand at (sorted ascending) */
  levels?: number[];
  spawn?: WalkSpawn;
  /** half-size of the walkable square */
  bounds?: number;
  onLevel?: (index: number) => void;
}) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  const st = useRef({
    yaw: spawn.yaw ?? 0,
    pitch: -0.15,
    pos: new THREE.Vector3(...spawn.pos),
    level: nearest(levels, spawn.pos[1]),
    y: spawn.pos[1],
    keys: new Set<string>(),
  });

  useEffect(() => {
    const s = st.current;
    camera.rotation.order = 'YXZ';
    camera.fov = 70;
    camera.near = 0.02;
    camera.updateProjectionMatrix();
    onLevel?.(s.level);

    const el = gl.domElement;
    const typing = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      return !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    };
    const down = (e: KeyboardEvent) => {
      if (typing(e) || e.metaKey || e.altKey) return;
      const k = e.code;
      if (k === 'Space') {
        walkInput.level += 1;
        e.preventDefault();
      } else if (k === 'ShiftLeft' || k === 'ShiftRight' || k === 'KeyC') {
        if (!e.repeat) walkInput.level -= 1;
      } else s.keys.add(k);
    };
    const up = (e: KeyboardEvent) => s.keys.delete(e.code);
    const blur = () => s.keys.clear();

    // mouse look: pointer lock when the browser allows it, otherwise drag to look
    let dragging = false;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      dragging = true;
      if (document.pointerLockElement !== el) {
        try {
          const p = el.requestPointerLock?.() as unknown as Promise<void> | undefined;
          p?.catch?.(() => undefined);
        } catch {
          /* drag-to-look fallback */
        }
      }
    };
    const onUp = () => (dragging = false);
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      if (document.pointerLockElement === el || dragging) {
        walkInput.look.x += e.movementX;
        walkInput.look.y += e.movementY;
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointermove', onMove);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointermove', onMove);
      if (document.pointerLockElement === el) document.exitPointerLock();
      walkInput.stick.x = walkInput.stick.y = 0;
      walkInput.look.x = walkInput.look.y = 0;
      walkInput.level = 0;
    };
  }, [camera, gl]); // eslint-disable-line react-hooks/exhaustive-deps

  const fwd = useRef(new THREE.Vector3());
  const right = useRef(new THREE.Vector3());
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const s = st.current;
    // look
    s.yaw -= walkInput.look.x * LOOK_SENS;
    s.pitch = THREE.MathUtils.clamp(s.pitch - walkInput.look.y * LOOK_SENS, -1.45, 1.45);
    walkInput.look.x = walkInput.look.y = 0;

    // move (keys + stick), relative to yaw
    let mx = walkInput.stick.x;
    let my = walkInput.stick.y;
    const k = s.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) my += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) my -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    const sprint = walkInput.sprint || k.has('ControlLeft') || k.has('ControlRight');
    const v = SPEED * (sprint ? 2.2 : 1) * dt;
    fwd.current.set(-Math.sin(s.yaw), 0, -Math.cos(s.yaw));
    right.current.set(Math.cos(s.yaw), 0, -Math.sin(s.yaw));
    s.pos.addScaledVector(fwd.current, my * v).addScaledVector(right.current, mx * v);
    s.pos.x = THREE.MathUtils.clamp(s.pos.x, -bounds, bounds);
    s.pos.z = THREE.MathUtils.clamp(s.pos.z, -bounds, bounds);

    // levels: jump up / drop down, eased
    if (walkInput.level !== 0) {
      const next = THREE.MathUtils.clamp(s.level + Math.sign(walkInput.level), 0, levels.length - 1);
      walkInput.level = 0;
      if (next !== s.level) {
        s.level = next;
        onLevel?.(next);
      }
    }
    const target = levels[s.level] ?? 0;
    s.y += (target - s.y) * Math.min(1, dt * 7);

    camera.position.set(s.pos.x, s.y + EYE, s.pos.z);
    camera.rotation.set(s.pitch, s.yaw, 0);
  });
  return null;
}

function nearest(levels: number[], y: number) {
  let best = 0;
  levels.forEach((l, i) => {
    if (Math.abs(l - y) < Math.abs((levels[best] ?? 0) - y)) best = i;
  });
  return best;
}
