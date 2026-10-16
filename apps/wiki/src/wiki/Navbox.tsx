// Bottom-of-page navbox: every page grouped by category, like a wiki's navigation template.
import { Link } from 'wouter';
import { CATEGORY_ORDER, categories } from '../pages';

export function Navbox({ current }: { current?: string }) {
  const cats = categories();
  const names = [...CATEGORY_ORDER.filter((c) => cats[c]), ...Object.keys(cats).filter((c) => !CATEGORY_ORDER.includes(c)).sort()];
  return (
    <section className="cc-navbox" aria-label="All pages">
      <div className="cc-navbox-title">CodeCraft</div>
      <table>
        <tbody>
          {names.map((c) => (
            <tr key={c}>
              <th><Link href={`/category/${encodeURIComponent(c)}`}>{c}</Link></th>
              <td>
                {cats[c].map((p, i) => (
                  <span key={p.slug}>
                    {i > 0 && <span className="cc-dot"> · </span>}
                    {p.slug === current ? <b>{p.fm.title}</b> : <Link href={`/wiki/${p.slug}`}>{p.fm.title}</Link>}
                  </span>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
