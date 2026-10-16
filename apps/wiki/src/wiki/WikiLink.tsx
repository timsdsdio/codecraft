import type { ReactNode } from 'react';
import { Link } from 'wouter';
import { resolve } from '../pages';

/** Internal link. Red ("new") when the page doesn't exist yet: a design gap worth writing up. */
export function WikiLink({ to, hash, children }: { to: string; hash?: string; children?: ReactNode }) {
  const page = resolve(to);
  const href = `/wiki/${page?.slug ?? to}${hash ? `#${hash}` : ''}`;
  return (
    <Link href={href} className={page ? 'cc-link' : 'cc-link cc-new'} title={page ? page.fm.title : `${to} (page does not exist)`}>
      {children}
    </Link>
  );
}
