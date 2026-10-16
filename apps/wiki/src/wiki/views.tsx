import { useEffect, useRef } from 'react';
import { Link } from 'wouter';
import { backlinks, byTitle, categories, PAGES, resolve, titleFromSlug, wanted } from '../pages';
import { Infobox } from './Infobox';
import { Navbox } from './Navbox';
import { StatusBanner, StatusChip } from './bits';
import { Toc, useHeadings } from './Toc';
import { mdxComponents } from './mdx';
import { WikiLink } from './WikiLink';
import { Viewport } from '../embeds/Embed';
import { SCENE_NAMES, type SceneName } from '../embeds/spec';

function useTitle(t: string) {
  useEffect(() => {
    document.title = `${t} – CodeCraft Wiki`;
  }, [t]);
}

function Head({ title, sub = 'From the CodeCraft Wiki' }: { title: string; sub?: string }) {
  return (
    <div className="cc-page-head">
      <h1>{title}</h1>
      <div className="cc-tagline">{sub}</div>
    </div>
  );
}

export function PageView({ slug }: { slug: string }) {
  const page = resolve(slug);
  const body = useRef<HTMLDivElement>(null);
  const heads = useHeadings(body, page?.slug ?? slug);
  useTitle(page?.fm.title ?? titleFromSlug(slug));
  useEffect(() => {
    if (!location.hash) window.scrollTo(0, 0);
  }, [slug]);
  if (!page) return <MissingPage slug={slug} />;
  const { Content, fm } = page;
  const isMain = page.slug === 'main-page';
  const refs = backlinks(page.slug);
  return (
    <article className={`cc-article${isMain ? ' cc-mainpage' : ''}`}>
      {isMain ? <Head title={fm.title} sub="The design wiki for CodeCraft" /> : <Head title={fm.title} />}
      {slug !== page.slug && <div className="cc-redirect">(Redirected from {titleFromSlug(slug)})</div>}
      {fm.status && !isMain && <StatusBanner status={fm.status} />}
      <div className="cc-content" ref={body}>
        <Infobox fm={fm} />
        {!isMain && <Toc items={heads} />}
        <Content components={mdxComponents} />
      </div>
      <div className="cc-clear" />
      {!isMain && refs.length > 0 && (
        <div className="cc-whatlinks">
          <b>What links here:</b>{' '}
          {refs.map((p, i) => (
            <span key={p.slug}>
              {i > 0 && ', '}
              <Link href={`/wiki/${p.slug}`}>{p.fm.title}</Link>
            </span>
          ))}
        </div>
      )}
      <Navbox current={page.slug} />
      <div className="cc-catlinks">
        Category: <Link href={`/category/${encodeURIComponent(fm.category)}`}>{fm.category}</Link>
      </div>
    </article>
  );
}

function MissingPage({ slug }: { slug: string }) {
  const from = wanted().find((w) => w.slug === slug)?.from ?? [];
  return (
    <article className="cc-article">
      <Head title={titleFromSlug(slug)} />
      <div className="cc-banner cc-status-open">
        <strong>This page does not exist yet.</strong> Red links mark ideas that are mentioned but not designed.
        To create it, add <code>apps/wiki/src/content/{slug}.mdx</code>.
      </div>
      {from.length > 0 && (
        <>
          <h2>Pages that mention it</h2>
          <ul>
            {from.map((p) => (
              <li key={p.slug}>
                <Link href={`/wiki/${p.slug}`}>{p.fm.title}</Link>
              </li>
            ))}
          </ul>
        </>
      )}
      <Navbox />
    </article>
  );
}

export function CategoryView({ name }: { name: string }) {
  useTitle(`Category: ${name}`);
  const list = categories()[name] ?? [];
  return (
    <article className="cc-article">
      <Head title={`Category: ${name}`} />
      <p>{list.length} page{list.length === 1 ? '' : 's'} in this category.</p>
      <ul className="cc-catlist">
        {list.map((p) => (
          <li key={p.slug}>
            <Link href={`/wiki/${p.slug}`}>{p.fm.title}</Link>
            {p.fm.status && <StatusChip status={p.fm.status} />}
            {p.fm.summary && <span className="cc-sig"> {p.fm.summary}</span>}
          </li>
        ))}
      </ul>
      <Navbox />
    </article>
  );
}

export function AllPages() {
  useTitle('All pages');
  const list = Object.values(PAGES).sort(byTitle);
  return (
    <article className="cc-article">
      <Head title="All pages" />
      <div className="cc-table-wrap">
        <table className="cc-table">
          <thead>
            <tr>
              <th>Page</th>
              <th>Category</th>
              <th>Design</th>
            </tr>
          </thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.slug}>
                <td>
                  <Link href={`/wiki/${p.slug}`}>{p.fm.title}</Link>
                </td>
                <td>{p.fm.category}</td>
                <td>{p.fm.status && <StatusChip status={p.fm.status} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

export function WantedPages() {
  useTitle('Wanted pages');
  const list = wanted();
  return (
    <article className="cc-article">
      <Head title="Wanted pages" />
      <p>Pages that other pages link to but that don't exist yet. This is the design backlog.</p>
      <ul className="cc-catlist">
        {list.map((w) => (
          <li key={w.slug}>
            <WikiLink to={w.slug}>{titleFromSlug(w.slug)}</WikiLink>{' '}
            <span className="cc-sig">
              ← {w.from.map((p) => p.fm.title).join(', ')}
            </span>
          </li>
        ))}
      </ul>
    </article>
  );
}

/** One scene, full width: for inspecting a scene while working on it. */
export function SceneView({ name }: { name: string }) {
  useTitle(`Scene: ${name}`);
  const ok = (SCENE_NAMES as readonly string[]).includes(name);
  return (
    <article className="cc-article">
      <Head title={`Scene: ${name}`} />
      {ok ? <Viewport key={name} spec={{ type: 'scene', name: name as SceneName }} height={560} /> : <p>No scene called “{name}”.</p>}
      <p className="cc-sig">
        {SCENE_NAMES.map((n, i) => (
          <span key={n}>
            {i > 0 && ' · '}
            <Link href={`/special/scene/${n}`}>{n}</Link>
          </span>
        ))}
      </p>
    </article>
  );
}
