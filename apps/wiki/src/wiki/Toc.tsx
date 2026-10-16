// Table of contents built from the rendered article's h2/h3s (also gives them anchor ids).
import { useEffect, useState, type RefObject } from 'react';
import { slugify } from '../../remark-wikilinks.ts';

interface Item {
  id: string;
  text: string;
  level: 2 | 3;
}

export function useHeadings(root: RefObject<HTMLElement | null>, key: string): Item[] {
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const found: Item[] = [];
    el.querySelectorAll<HTMLHeadingElement>('h2, h3').forEach((h) => {
      if (h.closest('.cc-infobox, .cc-navbox')) return;
      const text = h.textContent ?? '';
      if (!h.id) h.id = slugify(text);
      found.push({ id: h.id, text, level: h.tagName === 'H2' ? 2 : 3 });
    });
    setItems(found);
    // jump to a #section once the headings have ids
    const hash = decodeURIComponent(location.hash.slice(1));
    if (hash) document.getElementById(hash)?.scrollIntoView();
  }, [root, key]);
  return items;
}

export function Toc({ items }: { items: Item[] }) {
  const [open, setOpen] = useState(true);
  if (items.length < 3) return null;
  let n2 = 0;
  let n3 = 0;
  return (
    <nav className="cc-toc" aria-label="Contents">
      <div className="cc-toc-head">
        <span>Contents</span>
        <button type="button" onClick={() => setOpen((o) => !o)}>{open ? 'hide' : 'show'}</button>
      </div>
      {open && (
        <ol>
          {items.map((it) => {
            if (it.level === 2) {
              n2++;
              n3 = 0;
            } else n3++;
            return (
              <li key={it.id} className={it.level === 3 && n2 ? 'cc-toc-sub' : undefined}>
                <a href={`#${it.id}`}>
                  <span className="cc-toc-num">{it.level === 2 ? n2 : n2 ? `${n2}.${n3}` : n3}</span> {it.text}
                </a>
              </li>
            );
          })}
        </ol>
      )}
    </nav>
  );
}
