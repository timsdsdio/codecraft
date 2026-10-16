// Two looks for the same machines. "tron": dark bodies with glowing neon edges, as in the Socketworld
// prototype. "brass": Create-style brass, copper and andesite. Pieces ask for material props by role.
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { FACTORY } from '../palette';

export type Look = 'tron' | 'brass';
export const LOOKS: readonly Look[] = ['tron', 'brass'];

const LookContext = createContext<Look>('tron');
export const useLook = () => useContext(LookContext);
export function LookProvider({ look, children }: { look: Look; children: ReactNode }) {
  return <LookContext.Provider value={look}>{children}</LookContext.Provider>;
}

export type MetalRole = 'frame' | 'accent' | 'rail';

/** meshStandardMaterial props for a structural part. `tint` is its neon colour in the tron look. */
export function useMetal(role: MetalRole, tint: string = FACTORY.casing) {
  const look = useLook();
  return useMemo(() => {
    if (look === 'tron')
      return {
        color: '#03060a',
        emissive: tint,
        emissiveIntensity: role === 'rail' ? 0.55 : 1.7,
        metalness: 0.5,
        roughness: 0.4,
      };
    const color = role === 'accent' ? FACTORY.copper : role === 'rail' ? FACTORY.andesite : FACTORY.brass;
    return { color, emissive: '#000000', emissiveIntensity: 0, metalness: 0.85, roughness: 0.35 };
  }, [look, role, tint]);
}
