// Production server: serves Bladecraft at /, CodeCraft at /codecraft/, the todo app CodeCraft
// visualises at /app/ and CodeCraft's wiki at /wiki/, from one port. Static files only; unknown paths
// fall back to each app's index.html.
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const port = Number(process.env.PORT) || 3000;

/** URL prefix → build output, longest prefix first */
const mounts = [
  { prefix: '/app/', dir: join(root, 'apps/todo/dist') },
  { prefix: '/wiki/', dir: join(root, 'apps/wiki/dist') },
  { prefix: '/codecraft/', dir: join(root, 'apps/game/dist') },
  { prefix: '/', dir: join(root, 'apps/bladecraft/dist') },
];

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

const isFile = (p) => {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
};

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  if (path === '/app' || path === '/wiki' || path === '/codecraft') {
    res.writeHead(301, { location: `${path}/` }).end();
    return;
  }
  const mount = mounts.find((m) => path.startsWith(m.prefix));
  const rel = normalize(path.slice(mount.prefix.length)).replace(/^(\.\.[/\\])+/, '');
  let file = join(mount.dir, rel);
  if (!file.startsWith(mount.dir)) return void res.writeHead(403).end();
  if (!isFile(file)) file = isFile(join(file, 'index.html')) ? join(file, 'index.html') : join(mount.dir, 'index.html');
  const hashed = /\/assets\//.test(file);
  res.writeHead(200, {
    'content-type': types[extname(file)] ?? 'application/octet-stream',
    'cache-control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  createReadStream(file).pipe(res);
}).listen(port, '0.0.0.0', () => console.log(`CodeCraft on http://0.0.0.0:${port}`));
