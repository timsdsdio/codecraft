// Page chrome: top bar with search, collapsible sidebar, content column.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { CogIcon } from '@codecraft/visuals/2d';
import { CATEGORY_ORDER, categories, PAGES } from '../pages';

function Search({ onGo }: { onGo: () => void }) {
  const [q, setQ] = useState('');
  const [, nav] = useLocation();
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return Object.values(PAGES)
      .filter((p) => p.fm.title.toLowerCase().includes(s) || p.fm.aliases?.some((a) => a.toLowerCase().includes(s)) || p.fm.summary?.toLowerCase().includes(s))
      .slice(0, 8);
  }, [q]);
  const go = (slug: string) => {
    setQ('');
    onGo();
    nav(`/wiki/${slug}`);
  };
  return (
    <form
      className="cc-search"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        if (hits[0]) go(hits[0].slug);
      }}
    >
      <input type="search" placeholder="Search the wiki" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the wiki" />
      {hits.length > 0 && (
        <ul className="cc-search-hits">
          {hits.map((p) => (
            <li key={p.slug}>
              <button type="button" onClick={() => go(p.slug)}>
                <b>{p.fm.title}</b>
                {p.fm.summary && <span>{p.fm.summary}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}

function Sidebar() {
  const cats = categories();
  return (
    <>
      <div className="cc-side-group">
        <div className="cc-side-head">Navigation</div>
        <Link href="/">Main page</Link>
        <Link href="/special/all-pages">All pages</Link>
        <Link href="/special/wanted-pages">Wanted pages</Link>
      </div>
      <div className="cc-side-group">
        <div className="cc-side-head">Categories</div>
        {CATEGORY_ORDER.filter((c) => cats[c]).map((c) => (
          <Link key={c} href={`/category/${encodeURIComponent(c)}`}>
            {c} <span className="cc-count">{cats[c].length}</span>
          </Link>
        ))}
      </div>
    </>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState(false);
  const [loc] = useLocation();
  useEffect(() => setMenu(false), [loc]);
  return (
    <div className="cc-app">
      <header className="cc-top">
        <button type="button" className="cc-menu-btn" aria-label="Menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
          <span />
          <span />
          <span />
        </button>
        <Link href="/" className="cc-logo">
          <CogIcon size={22} />
          <span className="cc-logo-main">CODECRAFT</span>
          <span className="cc-logo-sub">WIKI</span>
        </Link>
        <Search onGo={() => setMenu(false)} />
      </header>
      <div className="cc-body">
        <nav className={`cc-side${menu ? ' cc-open' : ''}`} aria-label="Site">
          <Sidebar />
        </nav>
        {menu && <div className="cc-scrim" onClick={() => setMenu(false)} />}
        <main className="cc-main">{children}</main>
      </div>
    </div>
  );
}
