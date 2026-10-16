// `[[Page]]`, `[[Page|label]]` and `[[Page#Section|label]]` → <WikiLink to="page" hash="section">label</WikiLink>.
// Resolution (and red links for pages that don't exist yet) happens at runtime in <WikiLink>.
// Inside GFM tables a bare `|` ends the cell, so write piped links there as `[[Page\|label]]`.

export const WIKILINK_RE = /\[\[([^\]|#]+)(?:#([^\]|]*))?(?:\\?\|([^\]]+))?\]\]/g;

export function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function split(value: string): any[] {
  const out: any[] = [];
  let last = 0;
  for (const m of value.matchAll(WIKILINK_RE)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ type: 'text', value: value.slice(last, at) });
    const [, target, hash, label] = m;
    const attributes: any[] = [{ type: 'mdxJsxAttribute', name: 'to', value: slugify(target) }];
    if (hash) attributes.push({ type: 'mdxJsxAttribute', name: 'hash', value: slugify(hash) });
    out.push({
      type: 'mdxJsxTextElement',
      name: 'WikiLink',
      attributes,
      children: [{ type: 'text', value: (label ?? target).trim() }],
    });
    last = at + m[0].length;
  }
  if (last < value.length) out.push({ type: 'text', value: value.slice(last) });
  return out;
}

function walk(node: any) {
  if (!Array.isArray(node.children)) return;
  for (let i = 0; i < node.children.length; i++) {
    const c = node.children[i];
    if (c.type === 'text' && c.value.includes('[[')) {
      const parts = split(c.value);
      node.children.splice(i, 1, ...parts);
      i += parts.length - 1;
    } else if (c.type !== 'code' && c.type !== 'inlineCode') {
      walk(c);
    }
  }
}

export default function remarkWikiLinks() {
  return (tree: any) => walk(tree);
}
