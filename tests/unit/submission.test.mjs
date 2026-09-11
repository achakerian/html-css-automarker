import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchApp } from '../helpers/harness.mjs';

let app;
before(async () => { app = await launchApp(); });
after(async () => { await app.close(); });

const load = files => app.page.evaluate(async f => {
  const s = await Automarker.submissionFromTexts('t', f);
  return { pages: s.pages.map(p => p.path).sort(), home: s.homePath,
           subs: s.subPagePaths, errors: s.errors };
}, files);

test('finds pages case-insensitively and picks index.html as home', async () => {
  const s = await load({ 'INDEX.HTML': '<p>h</p>', 'about.htm': '<p>a</p>', 'css/s.css': 'p{}' });
  assert.deepEqual(s.pages, ['INDEX.HTML', 'about.htm']);
  assert.equal(s.home, 'INDEX.HTML');
  assert.deepEqual(s.subs, ['about.htm']);
});

test('falls back to most-linked-to page as home', async () => {
  const s = await load({
    'main.html': '<a href="a.html">a</a><a href="b.html">b</a>',
    'a.html': '<a href="main.html">m</a>',
    'b.html': '<a href="main.html">m</a>'
  });
  assert.equal(s.home, 'main.html');
});

test('resolvePath handles ../, query strings and absolute URLs', async () => {
  const r = await app.page.evaluate(() => [
    Automarker.resolvePath('sub/page.html', '../img/x.svg'),
    Automarker.resolvePath('page.html', 'img/x.svg?v=2#top'),
    Automarker.resolvePath('page.html', 'https://evil.example/x.png'),
    Automarker.resolvePath('page.html', '#top'),
    Automarker.resolvePath('page.html', 'mailto:a@b.c')
  ]);
  assert.deepEqual(r, ['img/x.svg', 'img/x.svg', null, null, null]);
});

test('submission with no HTML pages reports an error', async () => {
  const s = await load({ 'style.css': 'p{}' });
  assert.equal(s.pages.length, 0);
  assert.match(s.errors[0], /no html pages/i);
});
