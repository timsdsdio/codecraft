// Small inline pieces used in page bodies and infoboxes.
import type { ReactNode } from 'react';
import { ShapeSwatch, ZONE_TINT, type Zone } from '@codecraft/visuals/2d';
import { BLOCKS, IFACES } from '../data/catalog';
import { WikiLink } from './WikiLink';
import type { Status } from '../pages';

/** Interface id with its socket swatch. */
export function Iface({ id, female }: { id: string; female?: boolean }) {
  return (
    <span className="cc-iface" title={IFACES[id]?.sig}>
      <ShapeSwatch iface={id} size={15} female={female} />
      <code>{id}</code>
    </span>
  );
}

export function ZoneTag({ zone }: { zone: Zone }) {
  return (
    <span className="cc-zone" style={{ color: ZONE_TINT[zone], borderColor: ZONE_TINT[zone] }}>
      {zone}
    </span>
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

/** Table of every interface in the catalog, with male/female swatches. */
export function InterfaceTable() {
  const users = (id: string, side: 'in' | 'out') =>
    Object.values(BLOCKS).filter((b) => b.ports.some((p) => p.iface === id && p.side === side));
  return (
    <div className="cc-table-wrap">
      <table className="cc-table">
        <thead>
          <tr>
            <th>Socket</th>
            <th>Interface</th>
            <th>Kind</th>
            <th>Provided by</th>
            <th>Required by</th>
          </tr>
        </thead>
        <tbody>
          {Object.values(IFACES).map((f) => (
            <tr key={f.id}>
              <td className="cc-nowrap">
                <ShapeSwatch iface={f.id} size={20} /> <ShapeSwatch iface={f.id} size={20} female />
              </td>
              <td>
                <code>{f.id}</code>
                <div className="cc-sig">{f.sig}</div>
              </td>
              <td>{f.kind}</td>
              <td>{users(f.id, 'out').map((b, i) => <span key={b.id}>{i ? ', ' : ''}<WikiLink to={b.id}>{b.title}</WikiLink></span>)}</td>
              <td>{users(f.id, 'in').map((b, i) => <span key={b.id}>{i ? ', ' : ''}<WikiLink to={b.id}>{b.title}</WikiLink></span>)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Table of every block in the catalog. */
export function BlockTable() {
  return (
    <div className="cc-table-wrap">
      <table className="cc-table">
        <thead>
          <tr>
            <th>Block</th>
            <th>Zone</th>
            <th>Inputs</th>
            <th>Outputs</th>
          </tr>
        </thead>
        <tbody>
          {Object.values(BLOCKS).map((b) => (
            <tr key={b.id}>
              <td>
                <WikiLink to={b.id}>{b.title}</WikiLink>
                <div className="cc-sig">{b.summary}</div>
              </td>
              <td><ZoneTag zone={b.zone} /></td>
              <td>{b.ports.filter((p) => p.side === 'in').map((p) => <div key={p.name}><ShapeSwatch iface={p.iface} size={14} female /> {p.name}{p.many ? ' (many)' : ''}</div>)}</td>
              <td>{b.ports.filter((p) => p.side === 'out').map((p) => <div key={p.name}><ShapeSwatch iface={p.iface} size={14} /> {p.name}</div>)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
