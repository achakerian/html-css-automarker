import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchApp, svg } from '../helpers/harness.mjs';

let app;
before(async () => { app = await launchApp(); });
after(async () => { await app.close(); });

// Build a snapshots map + run one check inside the page
const run = (site, checkId, params = {}, pagePath = 'index.html') =>
  app.page.evaluate(async ({ site, checkId, params, pagePath }) => {
    const sub = await Automarker.submissionFromTexts('t', site);
    const { snapshots } = await Automarker.analyzeSubmission(sub);
    const ctx = { snapshot: snapshots[pagePath], snapshots, submission: sub,
      config: Automarker.state.config ?? { meta: { minPages: 3 }, topic: { keywords: [], logoHints: ['logo'], locationHints: ['location','contact'], sectionHints: [] } },
      params };
    const res = await Automarker.checks[checkId](ctx);
    const w = res.subResults.reduce((a, s) => a + s.weight, 0);
    res._fraction = w ? res.subResults.reduce((a, s) => a + s.pass * s.weight, 0) / w : 0;
    return res;
  }, { site, checkId, params, pagePath });

const NAV = (extra = '') => `<nav style="background:#123;padding:8px">
  <a href="index.html" style="color:#fff;text-decoration:none;padding:6px">Home</a>
  <a href="a.html" style="color:#fff;text-decoration:none;padding:6px">A</a>
  <a href="b.html" style="color:#fff;text-decoration:none;padding:6px">B</a>${extra}</nav>`;
const GOOD = {
  'index.html': `<html><body>${NAV()}<p>home</p></body></html>`,
  'a.html': `<html><body>${NAV()}<p>a</p></body></html>`,
  'b.html': `<html><body>${NAV()}<p>b</p></body></html>`
};

test('navBar: full marks on complete consistent styled nav', async () => {
  const r = await run(GOOD, 'navBar');
  assert.equal(r._fraction, 1);
});

test('navBar: missing one page link lowers coverage only', async () => {
  const site = { ...GOOD, 'index.html': `<html><body><nav style="background:#123;padding:8px">
    <a href="a.html" style="color:#fff;text-decoration:none">A</a></nav><p>h</p></body></html>` };
  const r = await run(site, 'navBar');
  const cov = r.subResults.find(s => s.id === 'coverage');
  assert.equal(cov.pass, 0.6);                       // 1 − 0.4 × (1 missing: b.html)
  assert.equal(cov.weight, 2);
  assert.ok(r._fraction < 1);
  assert.ok(r.evidence.some(e => e.level === 'fail' && /b\.html/.test(e.text)));
});

test('navBar: dead nav link lowers working fraction', async () => {
  const site = { ...GOOD, 'index.html': `<html><body>${NAV('<a href="ghost.html">G</a>')}<p>h</p></body></html>` };
  const r = await run(site, 'navBar');
  assert.ok(r.subResults.find(s => s.id === 'working').pass < 1);
});

test('pageCount: flags shortfall with instance', async () => {
  const r = await run({ 'index.html': '<p>only</p>' }, 'pageCount', { min: 6 });
  assert.equal(r.subResults[0].pass < 1, true);
  assert.match(r.instances[0].text, /1 of 6/);
  const ok = await run(GOOD, 'pageCount', { min: 3 });
  assert.deepEqual(ok.instances, []);
});

test('brokenResources: lists dead links and missing images once each', async () => {
  const site = {
    'index.html': `<html><body><a href="nope.html">x</a><a href="nope.html">x2</a>
      <img src="img/gone.png"></body></html>` };
  const r = await run(site, 'brokenResources');
  assert.equal(r.instances.length, 2);               // deduped link + image
  assert.equal(r.subResults.find(s => s.id === 'none').pass, 0);
});

test('externalLink: both policies', async () => {
  const site = { 'index.html': `<html><body>
    <a href="https://en.wikipedia.org/wiki/X">More</a><a href="a.html">in</a></body></html>`,
    'a.html': '<p>a</p>' };
  const forb = await run(site, 'externalLink', { policy: 'forbidden' });
  assert.equal(forb.instances.length, 1);
  const req = await run(site, 'externalLink', { policy: 'required', min: 1 });
  assert.equal(req._fraction, 1);
  const reqFail = await run({ 'index.html': '<p>none</p>' }, 'externalLink', { policy: 'required', min: 1 });
  assert.equal(reqFail._fraction, 0);
});

test('emailLink and backToTop', async () => {
  const tall = `<html><body id="top"><a href="mailto:me@uni.edu">mail me</a>
    <div style="height:3000px"></div><a href="#top">Back to top</a></body></html>`;
  const mail = await run({ 'index.html': tall }, 'emailLink');
  assert.equal(mail._fraction, 1);
  const bt = await run({ 'index.html': tall }, 'backToTop');
  assert.equal(bt._fraction, 1);
  const noBt = await run({ 'index.html': '<html><body><div style="height:3000px"></div></body></html>' }, 'backToTop');
  assert.equal(noBt._fraction, 0);
});
