// 2D (DOM/SVG) counterparts of the 3D visuals: socket swatches and neon tool icons.
// Cheap to render anywhere, so pages can use them inline and as fallbacks for the 3D embeds.
import type { ReactNode } from 'react';
import { TOOL_COLOR, visualFor, type Tool } from './palette';
import { shapePath } from './shapes';

/** Socket shape in its interface colour; `female` draws the ring with the shape cut out. */
export function ShapeSwatch({ iface, size = 18, female = false }: { iface: string; size?: number; female?: boolean }) {
  const v = visualFor(iface);
  const d = shapePath(v.shape);
  return (
    <svg width={size} height={size} viewBox="-1.9 -1.9 3.8 3.8" aria-hidden style={{ verticalAlign: 'middle', filter: `drop-shadow(0 0 3px ${v.color}aa)` }}>
      {female ? (
        <>
          <path d={d} transform="scale(1.45)" fill="none" stroke={v.color} strokeWidth={0.28} />
          <path d={d} fill="#05070c" stroke={v.color} strokeWidth={0.12} />
        </>
      ) : (
        <path d={d} fill={v.color} />
      )}
    </svg>
  );
}

function Frame({ size, color, children }: { size: number; color: string; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke={color}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ filter: `drop-shadow(0 0 2px ${color}) drop-shadow(0 0 5px ${color}66)` }}
    >
      {children}
    </svg>
  );
}

export function ToolIcon({ tool, size = 32 }: { tool: Tool; size?: number }) {
  const color = TOOL_COLOR[tool];
  switch (tool) {
    case 'probe':
      return (
        <Frame size={size} color={color}>
          <g transform="rotate(45 16 16)">
            <path d="M13 10h6v14a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1z" fill={`${color}22`} strokeWidth={2} />
            <path d="M13 10l3-6 3 6" strokeWidth={2} fill={`${color}33`} />
            <path d="M14 18h4M14 21h4" strokeWidth={1.5} opacity={0.8} />
            <path d="M14 25v3h4v-3" strokeWidth={2} />
          </g>
          <circle cx="25.2" cy="6.8" r="2.2" fill="#ffffff" stroke={color} strokeWidth={1.5} />
          <path d="M28 3l1.5-1.5M29.5 7.5h1.8M24 1.5V0" strokeWidth={1.4} opacity={0.75} />
        </Frame>
      );
    case 'wire':
      return (
        <Frame size={size} color={color}>
          <circle cx="14" cy="14" r="10" strokeWidth={2} fill={`${color}14`} />
          <circle cx="14" cy="14" r="6.5" strokeWidth={1.5} strokeDasharray="2.5 1.6" opacity={0.85} />
          <circle cx="14" cy="14" r="2.6" strokeWidth={2} fill={`${color}55`} />
          <path d="M22.5 19.5c3 1.5 4 3.5 3.5 6" strokeWidth={2} />
          <rect x="23" y="25.5" width="6" height="4.5" rx="1" fill={`${color}66`} strokeWidth={1.6} />
        </Frame>
      );
    case 'cutter':
      return (
        <Frame size={size} color={color}>
          <path d="M10 4l6 11" strokeWidth={2} />
          <path d="M22 4l-6 11" strokeWidth={2} />
          <path d="M16 15l-7 13" strokeWidth={3.4} />
          <path d="M16 15l7 13" strokeWidth={3.4} />
          <path d="M16 15l-7 13M16 15l7 13" stroke="#02040a" strokeWidth={1} opacity={0.6} />
          <circle cx="16" cy="15" r="2.4" fill="#02040a" strokeWidth={1.8} />
          <path d="M12.6 7.6l6.8 0" strokeWidth={1.2} opacity={0.6} strokeDasharray="1 1.6" />
        </Frame>
      );
    case 'wrench':
      return (
        <Frame size={size} color={color}>
          <path
            d="M19.6 8.4a1.3 1.3 0 0 0 0 1.9l2.1 2.1a1.3 1.3 0 0 0 1.9 0l5-5a8 8 0 0 1-10.6 10.6l-9.2 9.2a2.8 2.8 0 0 1-4-4l9.2-9.2a8 8 0 0 1 10.6-10.6z"
            strokeWidth={2}
            fill={`${color}22`}
          />
          <circle cx="7.6" cy="24.4" r="1.2" fill={color} stroke="none" />
        </Frame>
      );
  }
}
