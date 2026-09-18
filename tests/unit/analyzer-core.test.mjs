import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchApp, snapshotFor, svg } from '../helpers/harness.mjs';

let app;
before(async () => { app = await launchApp(); });
after(async () => { await app.close(); });

const SITE = {
  'index.html': `<html><head><title>Home</title></head><body id="top">
    <nav><a href="about.html">About</a><a href="gone.html">Gone</a>
         <a href="https://x.example/a">Ext</a><a href="mailto:me@x.com">Mail</a></nav>
    <main><section><h1>Big</h1><h2>Small</h2>
      <p>one two three four five</p>
      <img src="img/a.svg" alt="product"><img src="img/nope.svg" alt="">
      <div style="color:red">inline1</div><span style="color:blue">inline2</span>
    </section></main>
    <video src="clip.mp4"></video>
    <a href="#top">Back to top</a></body></html>`,
  'about.html': '<html><body><a href="index.html">home</a></body></html>',
  'img/a.svg': svg(400, 300),
  'clip.mp4': { b64: 'AAAA' }
};

test('core snapshot: nav, links, images, media, structure, text, anchors, inline styles', async () => {
  const s = await snapshotFor(app.page, SITE, 'index.html');
  assert.equal(s.title, 'Home');
  assert.equal(s.nav.hasNavElement, true);
  assert.deepEqual(s.nav.linkTargets, ['about.html']);          // only pages that exist
  const gone = s.links.find(l => l.raw === 'gone.html');
  assert.equal(gone.internal, true); assert.equal(gone.targetExists, false);
  assert.equal(typeof gone.y, 'number');
  assert.equal(s.links.find(l => l.raw.startsWith('https')).external, true);
  assert.equal(s.links.find(l => l.raw.startsWith('mailto')).mailto, true);
  const ok = s.images.find(i => i.raw === 'img/a.svg');
  assert.equal(ok.ok, true); assert.equal(ok.naturalW, 400); assert.equal(ok.alt, 'product');
  assert.equal(s.images.find(i => i.raw === 'img/nope.svg').ok, false);
  assert.equal(s.media.videos, 1);
  assert.equal(s.structure.headings.h1, 1); assert.equal(s.structure.headings.h2, 1);
  assert.ok(s.structure.semanticTags.includes('nav'));
  assert.ok(s.structure.sectionCount >= 1);
  assert.ok(s.text.wordCount >= 10);
  const bt = s.anchors.find(a => a.href === '#top');
  assert.ok(bt); assert.equal(bt.targetY, 0);
  assert.equal(s.inlineStyles.count, 2);
  assert.deepEqual([...s.inlineStyles.tags].sort(), ['div', 'span']);
  assert.ok(s.weightBytes > 0); assert.ok(s.docHeight > 0);
  assert.ok('palette' in s && 'css' in s);   // placeholders now; Tasks 6–7 hooks fill them
});

test('analyzeSubmission analyses every page and isolates failures', async () => {
  const r = await app.page.evaluate(async site => {
    const sub = await Automarker.submissionFromTexts('t', site);
    return Automarker.analyzeSubmission(sub);
  }, SITE);
  assert.deepEqual(Object.keys(r.snapshots).sort(), ['about.html', 'index.html']);
  assert.equal(r.snapshots['about.html'].error, undefined);
});

const TABLE_NAV_SITE = {
  'index.html': `<html><body>
    <table>
      <tr><td><a href="a.html">A</a></td></tr>
      <tr><td><a href="b.html">B</a></td></tr>
      <tr><td><a href="c.html">C</a></td></tr>
    </table>
  </body></html>`,
  'a.html': '<html><body><a href="index.html">back</a></body></html>',
  'b.html': '<html><body><a href="index.html">back</a></body></html>',
  'c.html': '<html><body><a href="index.html">back</a></body></html>'
};

test('nav fallback detects a multi-row table nav despite the implicit <tbody>', async () => {
  const s = await snapshotFor(app.page, TABLE_NAV_SITE, 'index.html');
  assert.deepEqual(s.nav.linkTargets, ['a.html', 'b.html', 'c.html']);
});

test('analyzeSubmission isolates a page whose analyzer hook throws', async () => {
  const r = await app.page.evaluate(async site => {
    const sub = await Automarker.submissionFromTexts('t', site);
    const hook = (handle, snap) => { if (snap.path === 'about.html') throw new Error('hook boom'); };
    Automarker.analyzerHooks.push(hook);
    try {
      return await Automarker.analyzeSubmission(sub);
    } finally {
      Automarker.analyzerHooks.pop();
    }
  }, SITE);
  assert.deepEqual(r.snapshots['about.html'], { path: 'about.html', error: 'hook boom' });
  assert.equal(r.snapshots['index.html'].error, undefined);
  assert.equal(r.snapshots['index.html'].title, 'Home');
});
