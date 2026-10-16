// Page registry: every src/content/*.mdx file is a page; its file name is its slug.
import type { ComponentType } from 'react';
import type { MDXComponents } from 'mdx/types';
import { slugify, WIKILINK_RE } from '../remark-wikilinks.ts';

export type Status = 'prototype' | 'draft' | 'open' | 'settled';

export interface Frontmatter {
  title: string;
  category: string;
  summary?: string;
  status?: Status;
  aliases?: string[];
  infobox?: {
    scene?: string;
    caption?: string;
    rows?: Record<string, string>;
  };
}

export interface Page {
  slug: string;
  fm: Frontmatter;
  Content: ComponentType<{ components?: MDXComponents }>;
  /** slugs this page links to */
  links: string[];
}

type Mod = { default: Page['Content']; frontmatter?: Frontmatter };
const mods = import.meta.glob<Mod>('./content/*.mdx', { eager: true });
const raws = import.meta.glob<string>('./content/*.mdx', { eager: true, query: '?raw', import: 'default' });

const slugOf = (path: string) => path.replace(/^.*\/|\.mdx$/g, '');
/** code samples may show link syntax without meaning a link */
const stripCode = (src: string) => src.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');

/** slug → the name it was first linked as (for titling pages that don't exist yet) */
const LINK_NAMES: Record<string, string> = {};

export const PAGES: Record<string, Page> = {};
for (const [path, mod] of Object.entries(mods)) {
  const slug = slugOf(path);
  const fm = mod.frontmatter ?? { title: slug, category: 'Uncategorised' };
  const raw = raws[path] ?? '';
  const matches = [...stripCode(raw).matchAll(WIKILINK_RE)];
  for (const m of matches) LINK_NAMES[slugify(m[1])] ??= m[1].trim();
  const links = [...new Set(matches.map((m) => slugify(m[1])))];
  PAGES[slug] = { slug, fm, Content: mod.default, links };
}

/** alias slug → canonical slug */
const ALIASES: Record<string, string> = {};
for (const p of Object.values(PAGES)) for (const a of p.fm.aliases ?? []) ALIASES[slugify(a)] = p.slug;

export function resolve(slug: string): Page | undefined {
  return PAGES[slug] ?? PAGES[ALIASES[slug] ?? ''];
}

export function backlinks(slug: string): Page[] {
  return Object.values(PAGES)
    .filter((p) => p.slug !== slug && p.links.some((l) => (resolve(l)?.slug ?? l) === slug))
    .sort(byTitle);
}

export const byTitle = (a: Page, b: Page) => a.fm.title.localeCompare(b.fm.title);

export function categories(): Record<string, Page[]> {
  const out: Record<string, Page[]> = {};
  for (const p of Object.values(PAGES)) (out[p.fm.category] ??= []).push(p);
  for (const list of Object.values(out)) list.sort(byTitle);
  return out;
}

/** Red links: linked-to slugs with no page, and who links to them. */
export function wanted(): { slug: string; from: Page[] }[] {
  const m = new Map<string, Page[]>();
  for (const p of Object.values(PAGES)) for (const l of p.links) if (!resolve(l)) m.set(l, [...(m.get(l) ?? []), p]);
  return [...m].map(([slug, from]) => ({ slug, from: from.sort(byTitle) })).sort((a, b) => b.from.length - a.from.length || a.slug.localeCompare(b.slug));
}

export const CATEGORY_ORDER = ['Concepts', 'Machines', 'Gameplay', 'Reference', 'Engineering', 'Meta'];

export const titleFromSlug = (slug: string) => LINK_NAMES[slug] ?? slug.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
