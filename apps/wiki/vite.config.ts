import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import mdx from '@mdx-js/rollup';
import remarkFrontmatter from 'remark-frontmatter';
import remarkMdxFrontmatter from 'remark-mdx-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkWikiLinks from './remark-wikilinks.ts';

const mdxPlugin = mdx({ remarkPlugins: [remarkFrontmatter, remarkMdxFrontmatter, remarkGfm, remarkWikiLinks] });
type TransformFn = Extract<Plugin['transform'], (...args: never[]) => unknown>;
const mdxTransform = mdxPlugin.transform as TransformFn;

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/wiki/' : '/',
  // quick Cloudflare tunnels (`cloudflared tunnel --url …`) for sharing a running build
  server: { allowedHosts: ['.trycloudflare.com'] },
  plugins: [
    {
      ...mdxPlugin,
      enforce: 'pre',
      // leave `page.mdx?raw` (used for the link graph in pages.ts) to Vite's raw loader
      transform(code, id, opts) {
        return id.includes('?') ? null : mdxTransform.call(this, code, id, opts);
      },
    },
    react({ include: /\.(mdx|tsx?)$/ }),
  ],
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
}));
