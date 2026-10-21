// The hub's orders, in sequence. Each asks for a number of one element (or of qubit states, or of
// probe readings), delivered by duct, and its hint names the machine and inputs that make it. Delivering an order moves the hub to the next.
import type { Multivector } from '@codecraft/ga';
import { el, scalar, type SavedMv } from './items.ts';
import { GATES } from './qubit.ts';

export interface Order {
  /** the element wanted; for state and phase orders, any state with the same Bloch vector will do */
  want: Multivector;
  count: number;
  hint: string;
  /** exact (the default): exactly this element; state: any qubit state pointing the same way;
   *  phases: such states, each a different phase from the ones already delivered; reading: any
   *  probe reading with the same grades as `want` */
  kind?: 'exact' | 'state' | 'phases' | 'reading';
  /** what the order asks for, in words, where `want` is only an example */
  label?: string;
}

const e1 = el('1');
const e2 = el('2');
const e3 = el('3');
const e12 = e1.op(e2);

export const ORDERS: Order[] = [
  {
    want: e1,
    count: 8,
    hint: 'Build an extractor at the bench, place it against the red e₁ deposit, and lay ducts from its output to the hub.',
  },
  {
    want: e1.add(e2),
    count: 8,
    hint: 'An adder outputs A + B. Duct e₁ into its back (A) and e₂ into a side (B).',
  },
  {
    want: e12,
    count: 8,
    hint: 'A wedger outputs A ∧ B. Duct e₁ into its back and e₂ into a side.',
  },
  {
    want: e12.neg(),
    count: 8,
    hint: 'Swap a wedger’s inputs: e₂ ∧ e₁ = −e₁₂.',
  },
  {
    want: scalar(1).add(e12),
    count: 8,
    hint: 'A multiplier outputs the geometric product A B. Try e₁ times e₁ + e₂.',
  },
  {
    want: e12.op(e3),
    count: 8,
    hint: 'Chain two wedgers: e₁ ∧ e₂, then wedge the result with e₃.',
  },
  {
    want: e2.sub(e1),
    count: 8,
    hint: 'A sandwich press outputs B A B⁻¹, turning A by the rotor B. Set its B to 1 − e₁₂ (made as e₂(e₁ + e₂)) and feed it e₁ + e₂.',
  },
  // qubits: a state is a rotor, and where it points is its Bloch vector R e₃ R⁻¹
  {
    want: scalar(1),
    kind: 'state',
    count: 8,
    hint: 'The scalar 1 is the qubit |0⟩, pointing up along e₃. Deliver any state pointing up: 1 itself, or 1 + e₁₂, which is |0⟩ in a different phase. A Bloch projector shows where a state points.',
  },
  {
    want: GATES.X.rotor,
    kind: 'state',
    count: 8,
    hint: 'Build a gate, set it to X in its panel, and feed it |0⟩ (the scalar 1). X turns the state over to |1⟩, pointing down.',
  },
  {
    want: GATES.H.rotor,
    kind: 'state',
    count: 8,
    hint: 'A gate set to H turns |0⟩ into |+⟩, pointing along e₁: an even superposition of up and down.',
  },
  {
    want: GATES.H.rotor,
    kind: 'phases',
    count: 4,
    hint: 'Deliver |+⟩ in 4 different phases. Multipliers with B fixed to 1 + e₁₂ shift the phase: the Bloch vector stays e₁ while the state travels round its Hopf fiber. A fibration orrery in the line draws the fiber.',
  },
  {
    want: GATES.S.rotor.gp(GATES.H.rotor),
    kind: 'state',
    count: 8,
    hint: 'Two gates in a row: H, then S, turns |0⟩ into |+i⟩, pointing along e₂.',
  },
  // the field: probes read F = E + IB where they stand; readings count, elements made otherwise don't
  {
    want: e1,
    kind: 'reading',
    label: 'readings of an electric field (a vector)',
    count: 4,
    hint: 'Lay field plates side by side, stand a charge among them and give it a scalar such as 1 (in its panel or by duct). Put a field probe a block or two away and duct its readings to the hub. The charge’s E points away from it.',
  },
  {
    want: e2.op(e3),
    kind: 'reading',
    label: 'readings of a magnetic field (a bivector, IB)',
    count: 4,
    hint: 'Stand a wire in a field and give it e₃: current runs up it and B circles it. A probe beside it reads IB, a bivector, with no vector part.',
  },
  {
    want: e3.add(e2.op(e3)),
    kind: 'reading',
    label: 'readings of a wave (E and IB together)',
    count: 4,
    hint: 'Give an antenna e₃: its current swings up and down and sends waves across the field. A probe in their path reads E and IB at once: both parts of F, carried along together.',
  },
];

/** what an order wants, in words */
export const orderLabel = (o: Order) => o.label ?? String(o.want);

export interface HubProgress {
  order: number;
  delivered: number;
  /** states already counted toward a phase order */
  seen?: SavedMv[];
}
