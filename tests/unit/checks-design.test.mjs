import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchApp, svg } from '../helpers/harness.mjs';

let app;
before(async () => { app = await launchApp(); });
after(async () => { await app.close(); });

const run = (site, checkId, params = {}, pagePath = 'index.html', extraCfg = {}) =>
  app.page.evaluate(async ({ site, checkId, params, pagePath, extraCfg }) => {
    const sub = await Automarker.submissionFromTexts('t', site);
    const { snapshots } = await Automarker.analyzeSubmission(sub);
    const ctx = { snapshot: snapshots[pagePath], snapshots, submission: sub,
      config: { meta: { minPages: 6, viewport: { w: 1280, h: 800 },
          weightThresholds: { fullKB: 1536, partialKB: 4096 }, ...extraCfg.meta },
        topic: { keywords: ['sport', 'shoes'], sectionHints: [], spellWhitelist: [],
          logoHints: ['logo', 'brand'], locationHints: [], ...extraCfg.topic } },
      params };
    const res = await Automarker.checks[checkId](ctx);
    const w = res.subResults.reduce((a, s) => a + s.weight, 0);
    res._fraction = w ? res.subResults.reduce((a, s) => a + s.pass * s.weight, 0) / w : 0;
    return res;
  }, { site, checkId, params, pagePath, extraCfg });

const STYLED = {
  'index.html': `<html><head><style>
    body{margin:0;padding:0 24px;font-family:Arial,sans-serif;background:#eef2f5}
    main{max-width:960px;margin:0 auto;padding:24px}
    section{margin-bottom:28px;background:#fff;padding:16px}
    h1{color:#0b3d66} h2{color:#0b3d66} p{font-size:16px;color:#1c1c1c}
    .hero{background:#e67e22;height:160px}
  </style></head><body><header>
    <a href="index.html"><img src="img/logo.svg" alt="Store logo" width="120"></a></header>
    <main><h1>Shop</h1><section class="hero"></section>
    <section><h2>Shoes</h2><p>Sport shoes paragraph with enough words to measure size and colour.</p>
    <img src="img/shoes.svg" alt="running shoes for sport" width="300"></section></main></body></html>`,
  'img/logo.svg': svg(240, 120, '#0b3d66'),
  'img/shoes.svg': svg(600, 400, '#666')
};
// Deliberately zero inset and shrink the body text — Chromium's UA defaults (8px body
// margin, 16px font, max contrast) would otherwise score margins/typography near-full
// on an "unstyled" page by coincidence, which the checks-design assertions below rely
// on failing/degrading.
const PLAIN = { 'index.html':
  '<html><body style="margin:0"><p style="font-size:9px">a plain page with no real typographic or spatial design effort at all</p></body></html>' };

test('design checks pass on the styled page', async () => {
  for (const id of ['colourTheme', 'typography', 'whiteSpace', 'margins', 'sectionStructure']) {
    const r = await run(STYLED, id);
    assert.ok(r._fraction >= 0.8, `${id} fraction ${r._fraction}`);
  }
});

test('design checks fail/degrade on an unstyled page', async () => {
  for (const id of ['colourTheme', 'typography', 'margins']) {
    const r = await run(PLAIN, id);
    assert.ok(r._fraction <= 0.5, `${id} fraction ${r._fraction}`);
  }
});

test('images: counts well-sized images, flags stretching, marks relevance for review', async () => {
  const good = await run(STYLED, 'images', { min: 1 });
  assert.equal(good.subResults.find(s => s.id === 'count').pass, 1);
  assert.equal(good.needsReview, true);
  assert.equal(good.subResults.find(s => s.id === 'relevant').pass, 1); // alt mentions sport/shoes
  const stretched = { 'index.html': `<img src="img/tiny.svg" width="600" height="400">`,
    'img/tiny.svg': svg(40, 30) };
  const r2 = await run(stretched, 'images', { min: 1 });
  assert.equal(r2.subResults.find(s => s.id === 'sized').pass, 0);
  const short = await run(STYLED, 'images', { min: 2 });
  assert.equal(short.subResults.find(s => s.id === 'count').pass, 0.5); // 1 of 2 required
});

test('logo: detects linked top-left logo; absent on plain page', async () => {
  const r = await run(STYLED, 'logo');
  assert.equal(r.subResults.find(s => s.id === 'present').pass, 1);
  assert.equal(r.subResults.find(s => s.id === 'linked').pass, 1);
  const none = await run(PLAIN, 'logo');
  assert.equal(none._fraction, 0);
});

test('pageWeight: light page passes, heavy page partial/zero', async () => {
  const light = await run(STYLED, 'pageWeight');
  assert.equal(light._fraction, 1);
  const heavy = { 'index.html': '<img src="big.svg">',
    'big.svg': svg(100, 100).replace('</svg>', 'x'.repeat(2_000_000) + '</svg>') };
  const r = await run(heavy, 'pageWeight');
  assert.equal(r._fraction, 0.5);   // ~2 MB → partial band
});
