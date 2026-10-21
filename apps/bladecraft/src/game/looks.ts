// Colours and symbols shared by machine blocks in the world and their icons in the UI.
import type { MachineType } from './items.ts';

export const MACHINE_LOOK: Record<MachineType, { colour: number; symbol: string }> = {
  extractor: { colour: 0xff9a3c, symbol: 'EXTRACT' },
  duct: { colour: 0x00fff0, symbol: '' },
  collector: { colour: 0x9ab8d0, symbol: 'STORE' },
  adder: { colour: 0x7dff6a, symbol: 'A+B' },
  wedger: { colour: 0x00fff0, symbol: 'A∧B' },
  multiplier: { colour: 0xc78bff, symbol: 'AB' },
  sandwich: { colour: 0xffd25a, symbol: 'BAB⁻¹' },
  gate: { colour: 0x5ad1ff, symbol: 'GATE' },
  bloch: { colour: 0x9ad0ff, symbol: 'AeA⁻¹' },
  detector: { colour: 0xff6a9a, symbol: 'MEASURE' },
  orrery: { colour: 0xd7a6ff, symbol: 'HOPF' },
};

export const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
