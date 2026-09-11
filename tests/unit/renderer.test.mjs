import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchApp, svg } from '../helpers/harness.mjs';

let app, foreignRequests;
before(async () => {
  app = await launchApp();
  foreignRequests = [];
  app.page.on('request', r => { if (!r.url().startsWith('http://127.0.0.1')) foreignRequests.push(r.url()); });
});
after(async () => { await app.close(); });

const SITE = {
  'index.html': `<html><head><link rel="stylesheet" href="css/site.css">
    <script>document.title="PWNED"<\/script></head>
    <body><p id="p1">hello</p>
    <img id="ok" src="img/pic.svg"><img id="bad" src="img/missing.svg">
    <img id="ext" src="https://cdn.example.com/x.png">
    <div id="bg" style="background-image:url('img/pic.svg');width:50px;height:50px"></div>
    </body></html>`,
  'css/site.css': 'p{color:rgb(200,0,0);} body{background:url("../img/pic.svg");}',
  'img/pic.svg': svg(400, 300)
};

test('renders with rewritten assets, no scripts, no external fetches', async () => {
  const r = await app.page.evaluate(async site => {
    const sub = await Automarker.submissionFromTexts('t', site);
    const h = await Automarker.renderPage(sub, 'index.html');
    const out = {
      sandbox: h.iframe.getAttribute('sandbox'),
      title: h.doc.title,
      scripts: h.doc.querySelectorAll('script').length,
      pColor: h.win.getComputedStyle(h.doc.getElementById('p1')).color,
      okNatural: h.doc.getElementById('ok').naturalWidth,
      badNatural: h.doc.getElementById('bad').naturalWidth,
      broken: h.brokenAssets, external: h.externalRefs,
      cssOrigins: h.cssSources.map(c => c.origin),
      bytes: h.referencedBytes > 0, timedOut: h.timedOut
    };
    h.cleanup();
    return out;
  }, SITE);
  assert.equal(r.sandbox, 'allow-same-origin');
  assert.notEqual(r.title, 'PWNED');
  assert.equal(r.scripts, 0);
  assert.equal(r.pColor, 'rgb(200, 0, 0)');            // external CSS applied
  assert.equal(r.okNatural, 400);                       // svg intrinsic size
  assert.equal(r.badNatural, 0);                        // broken image
  assert.deepEqual(r.broken, [{ kind: 'img', url: 'img/missing.svg' }]);
  assert.equal(r.external[0].url, 'https://cdn.example.com/x.png');
  assert.deepEqual(r.cssOrigins, ['external']);
  assert.ok(r.bytes); assert.equal(r.timedOut, false);
  assert.deepEqual(foreignRequests, []);                // nothing left the machine
});

test('cleanup removes the iframe', async () => {
  const n = await app.page.evaluate(async site => {
    const sub = await Automarker.submissionFromTexts('t', site);
    const h = await Automarker.renderPage(sub, 'index.html');
    h.cleanup();
    return document.querySelectorAll('#render-host iframe').length;
  }, SITE);
  assert.equal(n, 0);
});
