// Colours and symbols shared by machine blocks in the world and their icons in the UI.
import type { MachineType } from './items.ts';

export const MACHINE_LOOK: Record<MachineType, { colour: number; symbol: string }> = {
  extractor: { colour: 0xff9a3c, symbol: 'EXTRACT' },
  duct: { colour: 0x00fff0, symbol: '' },
  store: { colour: 0x9ab8d0, symbol: 'STORE' },
  splitter: { colour: 0xffb347, symbol: 'SPLIT' },
  merger: { colour: 0xffb347, symbol: 'MERGE' },
  sorter: { colour: 0xffb347, symbol: 'SORT' },
  crossing: { colour: 0xffb347, symbol: '' },
  packer: { colour: 0x7dff6a, symbol: 'PACK' },
  unpacker: { colour: 0x7dff6a, symbol: 'UNPACK' },
  mill: { colour: 0xffd25a, symbol: 'MILL' },
  press: { colour: 0xffd25a, symbol: 'PRESS' },
  detector: { colour: 0xff6a9a, symbol: 'MEASURE' },
  orrery: { colour: 0xd7a6ff, symbol: 'HOPF' },
  plate: { colour: 0x4a8ab0, symbol: '' },
  charge: { colour: 0xff6a5a, symbol: 'q' },
  wire: { colour: 0xffa04a, symbol: 'I' },
  antenna: { colour: 0xd7a6ff, symbol: '∿' },
  probe: { colour: 0x7dff6a, symbol: 'E+IB' },
};

export const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
