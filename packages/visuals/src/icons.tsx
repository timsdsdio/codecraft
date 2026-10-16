// 2D (SVG) counterparts of the 3D visuals, cheap enough to use inline in text and tables.
import { KIND_COLOR, type ValueKind } from './palette';

/** A short length of pipe in a value kind's colour. */
export function KindSwatch({ kind, size = 16 }: { kind: ValueKind; size?: number }) {
  const c = KIND_COLOR[kind];
  return (
    <svg width={size * 1.6} height={size} viewBox="0 0 32 20" aria-hidden style={{ verticalAlign: 'middle', filter: `drop-shadow(0 0 3px ${c}99)` }}>
      <rect x="1" y="5" width="30" height="10" rx="5" fill={`${c}33`} stroke={c} strokeWidth="1.5" />
      <rect x="6" y="8.5" width="8" height="3" rx="1.5" fill={c} />
      <rect x="18" y="8.5" width="8" height="3" rx="1.5" fill={c} />
      <rect x="0" y="3" width="3" height="14" rx="1" fill="#c8963e" />
      <rect x="29" y="3" width="3" height="14" rx="1" fill="#c8963e" />
    </svg>
  );
}

/** Brass cogwheel (logo / bullets). */
export function CogIcon({ size = 20, color = '#c8963e' }: { size?: number; color?: string }) {
  const teeth = 8;
  const pts: string[] = [];
  for (let i = 0; i < teeth * 4; i++) {
    const a = (i / (teeth * 4)) * Math.PI * 2;
    const r = i % 4 === 1 || i % 4 === 2 ? 15 : 11.5;
    pts.push(`${(16 + Math.cos(a) * r).toFixed(2)},${(16 + Math.sin(a) * r).toFixed(2)}`);
  }
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden style={{ filter: `drop-shadow(0 0 4px ${color}88)` }}>
      <polygon points={pts.join(' ')} fill={color} />
      <circle cx="16" cy="16" r="6.5" fill="#19ff8a" stroke="#0b2a1a" strokeWidth="2" />
      <circle cx="16" cy="16" r="2.5" fill="#06331c" />
    </svg>
  );
}
