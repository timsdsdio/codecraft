// Small inline pieces used in page bodies and infoboxes.
import type { ReactNode } from 'react';
import { KIND_COLOR, KindSwatch, layoutFactory, type ValueKind } from '@codecraft/visuals/2d';
import type { Status } from '../pages';
import { todoSnapshot } from '../data/todoApp';

/** A value kind with its pipe colour: <Kind k="array" />. */
export function Kind({ k }: { k: ValueKind }) {
  return (
    <span className="cc-kind" style={{ color: KIND_COLOR[k] }}>
      <KindSwatch kind={k} size={12} /> {k}
    </span>
  );
}

const KIND_ROWS: { k: ValueKind; what: string }[] = [
  { k: 'array', what: 'lists; `todos`' },
  { k: 'object', what: 'records; `todo`' },
  { k: 'string', what: 'text; `title`, `filter`' },
  { k: 'number', what: '`remaining`' },
  { k: 'boolean', what: '`done`' },
  { k: 'node', what: 'JSX passed as a prop (`children`)' },
  { k: 'nullish', what: '`null`, `undefined`' },
  { k: 'function', what: 'callbacks; drawn as event wires, not pipes' },
];

export function KindTable() {
  return (
    <div className="cc-table-wrap">
      <table className="cc-table">
        <thead>
          <tr>
            <th>Kind</th>
            <th>Examples</th>
          </tr>
        </thead>
        <tbody>
          {KIND_ROWS.map((r) => (
            <tr key={r.k}>
              <td className="cc-nowrap">
                <Kind k={r.k} />
              </td>
              <td>{r.what.split('`').map((s, i) => (i % 2 ? <code key={i}>{s}</code> : s))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The reference app's components, as the factory lays them out. */
export function ComponentTable() {
  const snap = todoSnapshot({ items: 3 });
  const layout = layoutFactory(snap);
  const floor = new Map(layout.casings.map((c) => [c.id, c.depth]));
  const seen = new Set<string>();
  const rows = snap.nodes.filter((n) => (seen.has(n.name) ? false : (seen.add(n.name), true)));
  return (
    <div className="cc-table-wrap">
      <table className="cc-table">
        <thead>
          <tr>
            <th>Component</th>
            <th>Floor</th>
            <th>Props in</th>
            <th>State tanks</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((n) => (
            <tr key={n.id}>
              <td>
                <code>{n.name}</code>
                {n.key !== undefined && <div className="cc-sig">one per todo (keyed list)</div>}
              </td>
              <td>{floor.get(n.id)}</td>
              <td>
                {n.props.length ? n.props.map((p) => (
                  <div key={p.name}>
                    <KindSwatch kind={p.kind} size={11} /> {p.name}
                  </div>
                )) : '—'}
              </td>
              <td>
                {n.state.length ? n.state.map((p) => (
                  <div key={p.name}>
                    <KindSwatch kind={p.kind} size={11} /> {p.name}
                  </div>
                )) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const STATUS_TEXT: Record<Status, { label: string; body: string }> = {
  prototype: { label: 'Prototype', body: 'This describes how the Socketworld prototype works. It is a starting point, not a decision.' },
  draft: { label: 'Draft', body: 'This is a proposed design that has not been agreed yet.' },
  open: { label: 'Open question', body: 'This page collects options for something that has not been decided.' },
  settled: { label: 'Settled', body: 'This design has been agreed. Changes should be recorded in DEVIATIONS.md.' },
};

export function StatusBanner({ status }: { status: Status }) {
  const s = STATUS_TEXT[status];
  return (
    <div className={`cc-banner cc-status-${status}`} role="note">
      <strong>{s.label}.</strong> {s.body}
    </div>
  );
}

export function StatusChip({ status }: { status: Status }) {
  return <span className={`cc-chip cc-status-${status}`}>{STATUS_TEXT[status].label}</span>;
}

/** Wiki "hatnote" at the top of a section: "See also: …" / "Main article: …". */
export function Hatnote({ children }: { children: ReactNode }) {
  return <div className="cc-hatnote">{children}</div>;
}

/** Callout for an unresolved design question inside a page. */
export function Question({ children, title = 'Design question' }: { children: ReactNode; title?: string }) {
  return (
    <div className="cc-question">
      <div className="cc-question-title">{title}</div>
      {children}
    </div>
  );
}
