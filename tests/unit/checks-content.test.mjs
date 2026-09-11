import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchApp, svg } from '../helpers/harness.mjs';

let app;
before(async () => { app = await launchApp(); });
after(async () => { await app.close(); });

const run = (site, checkId, params = {}, pagePath = null, topic = {}) =>
  app.page.evaluate(async ({ site, checkId, params, pagePath, topic }) => {
    const sub = await Automarker.submissionFromTexts('t', site);
    const { snapshots } = await Automarker.analyzeSubmission(sub);
    const ctx = { snapshot: pagePath ? snapshots[pagePath] : undefined, snapshots, submission: sub,
      config: { meta: { minPages: 3, viewport: { w: 1280, h: 800 } },
        topic: { keywords: [], sectionHints: [], logoHints: [],
                 locationHints: ['location', 'contact', 'visit', 'find'], ...topic } },
      params };
    const res = await Automarker.checks[checkId](ctx);
    const w = res.subResults.reduce((a, s) => a + s.weight, 0);
    res._fraction = w ? res.subResults.reduce((a, s) => a + s.pass * s.weight, 0) / w : 0;
    return res;
  }, { site, checkId, params, pagePath, topic });

test('wordCount: proportional to minimum', async () => {
  const words = n => Array.from({ length: n }, (_, i) => 'word' + i).join(' ');
  const site = { 'index.html': `<p>${words(100)}</p>` };
  assert.equal((await run(site, 'wordCount', { min: 100 }, 'index.html'))._fraction, 1);
  assert.equal((await run(site, 'wordCount', { min: 200 }, 'index.html'))._fraction, 0.5);
});

test('mediaPresence: anyOf video/gif satisfied by a gif image', async () => {
  const site = { 'index.html': '<img src="fun.gif">', 'fun.gif': { b64: 'R0lGODlhAQABAAAAACw=' } };
  const r = await run(site, 'mediaPresence',
    { require: [{ kind: 'video', min: 1 }, { kind: 'gif', min: 1 }], anyOf: true }, 'index.html');
  assert.equal(r._fraction, 1);
  const none = await run({ 'index.html': '<p>x</p>' }, 'mediaPresence',
    { require: [{ kind: 'video', min: 1 }, { kind: 'gif', min: 1 }], anyOf: true }, 'index.html');
  assert.equal(none._fraction, 0);
});

test('responsive: fluid page passes, fixed-width page fails', async () => {
  const fluid = { 'index.html': `<html><head><style>main{max-width:100%;padding:8px}</style></head>
    <body><main><p>flexible content</p></main></body></html>` };
  assert.ok((await run(fluid, 'responsive', {}, 'index.html'))._fraction >= 0.6);
  const fixed = { 'index.html': '<body><div style="width:1200px">rigid</div></body>' };
  assert.ok((await run(fixed, 'responsive', {}, 'index.html'))._fraction < 0.6);
});

test('directions: finds the contact page and its address/hours/map/contact details', async () => {
  const site = {
    'index.html': '<a href="contact.html">contact</a>',
    'contact.html': `<html><head><title>Visit us</title></head><body>
      <h1>Find our store</h1><p>123 Plenty Road, Bundoora VIC 3083</p>
      <p>Open Mon-Fri 9:00am - 5:30pm, Sat 10am - 4pm</p>
      <img src="map.svg" alt="map to our store"><p>Call (03) 9479 1234 or
      <a href="mailto:store@example.edu.au">email us</a></p></body></html>`,
    'map.svg': svg(400, 300) };
  const r = await run(site, 'directions');
  assert.equal(r._fraction, 1);
  assert.ok(r.evidence.some(e => /contact\.html/.test(e.text)));
  const bare = await run({ 'index.html': '<p>nothing here</p>' }, 'directions');
  assert.ok(bare._fraction <= 0.25);
});
