// Scroll folds: everything inside a scroll area is clipped to that area's footprint, a vertical
// prism from its floor up to the screen. Components read the active planes from context and put
// them on their materials.
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import * as THREE from 'three';
import type { Box } from './layout';

const ClipContext = createContext<THREE.Plane[] | null>(null);

export const useClip = (): THREE.Plane[] | null => useContext(ClipContext);

/** Clip descendants to x ∈ [x0, x1], z ∈ [z0, z1] (intersected with any enclosing region). */
export function ClipRegion({ box, children }: { box?: Box | null; children: ReactNode }) {
  const outer = useClip();
  const planes = useMemo(() => {
    if (!box) return outer;
    const own = [
      new THREE.Plane(new THREE.Vector3(1, 0, 0), -box.x0),
      new THREE.Plane(new THREE.Vector3(-1, 0, 0), box.x1),
      new THREE.Plane(new THREE.Vector3(0, 0, 1), -box.z0),
      new THREE.Plane(new THREE.Vector3(0, 0, -1), box.z1),
    ];
    return outer ? [...outer, ...own] : own;
  }, [box?.x0, box?.x1, box?.z0, box?.z1, outer]); // eslint-disable-line react-hooks/exhaustive-deps
  return <ClipContext.Provider value={planes}>{children}</ClipContext.Provider>;
}
