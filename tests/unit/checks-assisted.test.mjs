import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchApp } from '../helpers/harness.mjs';

let app;
before(async () => { app = await launchApp(); });
after(async () => { await app.close(); });

const run = (site, checkId, params = {}, pagePath = 'index.html', topic = {}) =>
  app.page.evaluate(async ({ site, checkId, params, pagePath, topic }) => {
    const sub = await Automarker.submissionFromTexts('t', site);
    const { snapshots } = await Automarker.analyzeSubmission(sub);
    const ctx = { snapshot: pagePath ? snapshots[pagePath] : undefined, snapshots, submission: sub,
      config: { meta: { viewport: { w: 1280, h: 800 }, weightThresholds: { fullKB: 1536, partialKB: 4096 } },
        topic: { keywords: ['sport', 'shoes', 'gear'], sectionHints: ['promotion', 'arrivals', 'products'],
                 spellWhitelist: [], logoHints: ['logo'], locationHints: [], ...topic } },
      params };
    const res = await Automarker.checks[checkId](ctx);
    const w = res.subResults.reduce((a, s) => a + s.weight, 0);
    res._fraction = w ? res.subResults.reduce((a, s) => a + s.pass * s.weight, 0) / w : 0;
    return res;
  }, { site, checkId, params, pagePath, topic });

test('contentIntro, offerings, contentRelevance are assisted and keyword-driven', async () => {
  const site = { 'index.html': `<html><body><h1>Sport gear</h1>
    <p>${'Welcome to our sport shoes store with quality gear for every athlete. '.repeat(8)}</p>
    <h2>New arrivals and promotions</h2><a href="products.html">Shop now</a></body></html>`,
    'products.html': '<p>p</p>' };
  for (const [id, params] of [['contentIntro', { min: 50 }], ['offerings', {}], ['contentRelevance', { min: 40 }]]) {
    const r = await run(site, id, params);
    assert.equal(r.needsReview, true, id);
    assert.equal(r._fraction, 1, `${id}: ${JSON.stringify(r.subResults)}`);
  }
  const off = await run({ 'index.html': '<p>minimal unrelated text</p>' }, 'offerings');
  assert.equal(off._fraction, 0);
});

test('aesthetic composes design metrics', async () => {
  const r = await run({ 'index.html': '<html><body><p>plain</p></body></html>' }, 'aesthetic');
  assert.equal(r.needsReview, true);
  assert.ok(r._fraction < 0.6);
});

test('spelling check emits instances across pages', async () => {
  const site = { 'index.html': '<p>simply teh best offer</p>', 'a.html': '<p>teh same typo again</p>' };
  const r = await run(site, 'spelling', {}, null);
  const teh = r.instances.find(i => i.word === 'teh');
  assert.ok(teh); assert.equal(teh.count, 2);
  assert.equal(r.needsReview, true);
});
