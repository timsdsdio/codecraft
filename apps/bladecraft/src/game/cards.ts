// Cards: a multivector used as an operation. A Mill holds up to four cards in two decks of two.
// Cards side by side in a deck add their outputs; the second deck works on what the first one made.
// A Mill can also press whatever arrives at its side port into a live card, which joins the first
// deck, so a two-input machine is just a Mill whose card changes with every element.
import { Q, type Multivector } from '@codecraft/ga';
import type { Item, Verb } from './items.ts';
import { terms } from './products.ts';

export type Card = Extract<Item, { kind: 'card' }>;

export const card = (verb: Verb, mv: Multivector | null, right = false): Card => ({ kind: 'card', verb, mv, right });

/** verbs that need a multivector to press (Reverse is the only one that doesn't) */
export const needsMultivector = (verb: Verb) => verb !== 'reverse';

/** what the card does to X, or null when it can't (a Turn pressed from something with no inverse) */
export function applyCard(c: Card, x: Multivector): Multivector | null {
  const m = c.mv;
  switch (c.verb) {
    case 'join':
      return m ? m.op(x) : null;
    case 'meter':
      return m ? m.lc(x) : null;
    case 'multiply':
      return m ? (c.right ? x.gp(m) : m.gp(x)) : null;
    case 'turn': {
      if (!m) return null;
      const rev = m.reverse();
      const norm = m.gp(rev);
      // M M̃ is a nonzero scalar exactly when M is a versor; divide by it so the turn keeps sizes
      if (norm.isZero() || !norm.isScalar()) return null;
      return m.gp(x).gp(rev).scale(Q.div(Q.ONE, norm.scalarPart()));
    }
    case 'reverse':
      return x.reverse();
    case 'sieve': {
      if (!m) return null;
      const keep = m.grades();
      return terms(x)
        .filter((t) => keep.includes(t.grades()[0]))
        .reduce((acc, t) => acc.add(t), x.scale(0));
    }
  }
}

/** a deck's output: the sum of its cards' outputs (cards that can't act add nothing); X itself when empty */
function runDeck(deck: Card[], x: Multivector) {
  if (!deck.length) return x;
  return deck.reduce((acc, c) => acc.add(applyCard(c, x) ?? x.scale(0)), x.scale(0));
}

/** a Mill's output for input X: deck one, then deck two */
export function millOutput(deck1: Card[], deck2: Card[], x: Multivector) {
  return runDeck(deck2, runDeck(deck1, x));
}

/** pairs of blades a deck multiplies out: one lamp each on the Mill's face, and the time it takes */
export function lampCount(deck1: Card[], deck2: Card[], x: Multivector) {
  const size = (c: Card) => (c.mv && c.verb !== 'sieve' ? c.mv.terms.size : 1) * (c.verb === 'turn' ? 2 : 1);
  const n = Math.max(1, x.terms.size);
  const mid = Math.max(1, millOutput(deck1, [], x).terms.size);
  return deck1.reduce((s, c) => s + size(c) * n, 0) + deck2.reduce((s, c) => s + size(c) * mid, 0);
}

/** what the Card Press makes from a plate and whatever is on its bed, or null when it can't press */
export function pressCard(verb: Verb | null, bed: Multivector | null): Card | null {
  if (!verb) return null;
  if (needsMultivector(verb) && (!bed || bed.isZero())) return null;
  return card(verb, needsMultivector(verb) ? bed : null);
}
