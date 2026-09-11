import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';

const MIME = { '.html': 'text/html', '.htm': 'text/html', '.mjs': 'text/javascript',
  '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.json': 'application/json' };

export async function startServer(root = process.cwd()) {
  const server = http.createServer(async (req, res) => {
    try {
      const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
      const file = join(root, p === '/' ? 'index.html' : p);
      const data = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream' });
      res.end(data);
    } catch { res.writeHead(404); res.end('not found'); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}/`,
           close: () => new Promise(r => server.close(r)) };
}

export async function launchApp(root = process.cwd()) {
  const srv = await startServer(root);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', e => { throw new Error(`page error: ${e.message}`); });
  await page.goto(srv.url + 'index.html');
  return { page, browser, srv,
           close: async () => { await browser.close(); await srv.close(); } };
}

// 400x300 solid SVG "image" — fixtures use SVGs so intrinsic size is controllable as text
export const svg = (w, h, fill = '#c0392b') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="${fill}"/></svg>`;

// Render a snapshot for an in-memory site: files = {path: string | {b64}}
export async function snapshotFor(page, files, path) {
  return page.evaluate(async ({ files, path }) => {
    const sub = await Automarker.submissionFromTexts('unit', files);
    return Automarker.analyzePage(sub, path);
  }, { files, path });
}
