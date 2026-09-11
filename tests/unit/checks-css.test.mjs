import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchApp } from '../helpers/harness.mjs';

let app;
before(async () => { app = await launchApp(); });
after(async () => { await app.close(); });

const run = (site, checkId, params = {}, pagePath = null) =>
  app.page.evaluate(async ({ site, checkId, params, pagePath }) => {
    const sub = await Automarker.submissionFromTexts('t', site);
    const { snapshots } = await Automarker.analyzeSubmission(sub);
    const ctx = { snapshot: pagePath ? snapshots[pagePath] : undefined, snapshots, submission: sub,
      config: { meta: { minPages: 3 }, topic: { keywords: [], sectionHints: [], logoHints: [], locationHints: [] } },
      params };
    const res = await Automarker.checks[checkId](ctx);
    const w = res.subResults.reduce((a, s) => a + s.weight, 0);
    res._fraction = w ? res.subResults.reduce((a, s) => a + s.pass * s.weight, 0) / w : 0;
    return res;
  }, { site, checkId, params, pagePath });

const CSS = `p { color: #222; } .box { padding: 8px; } .card { margin: 4px; } .tag { border: 0; }
  h1.title { color: navy; } p.lead { font-weight: bold; } a.nav { color: red; }
  h1 { margin: 0; } h2 { margin: 0; } h3 { margin: 0; }
  a:hover { color: green; } h1, h2 { padding: 0; } p, li { margin: 2px; }
  nav a { padding: 6px; } button { background: blue; }
  .flexy { display: flex; } .ghost { color: pink; }`;
const PAGE = cls => `<html><head><link rel="stylesheet" href="s.css">
  <style>#hd { color: red; } main p { margin: 1px; } .para { font-size: 15px; }
    div { position: relative; } header { border: 0; } footer { border: 0; } body { margin: 0; }</style>
  </head><body><header><h1 id="hd" class="title">T</h1><nav><a class="nav" href="index.html">x</a></nav></header>
  <main><p class="lead para">t</p><li class="tag">i</li>
  <div class="box flexy" style="color:#111"><span style="font-weight:bold">s</span>
  <b style="color:#222">b</b></div>
  <h2>a</h2><h3>b</h3><button>Go</button>${cls || ''}</main><footer>f</footer></body></html>`;
const SITE = { 'index.html': PAGE(), 'two.html': PAGE(), 's.css': CSS };

test('cssExternal passes when all pages link the stylesheet', async () => {
  const r = await run(SITE, 'cssExternal');
  assert.equal(r._fraction, 1);
  const half = await run({ ...SITE, 'two.html': '<html><body>nolink</body></html>' }, 'cssExternal');
  assert.ok(half._fraction < 1 && half._fraction > 0.3);
});

test('cssSelectorTypes: IWBS-style requirement set', async () => {
  const reqs = [
    { kind: 'pFormat', min: 1, origin: 'external' },
    { kind: 'classGeneric', min: 3, origin: 'external' },
    { kind: 'classScoped', min: 3, origin: 'external' },
    { kind: 'headingStyle', min: 3, origin: 'external' },
    { kind: 'hoverAnchor', min: 1, origin: 'external' },
    { kind: 'group', min: 2, origin: 'external' },
    { kind: 'contextual', min: 1, origin: 'external' },
    { kind: 'buttonStyle', min: 1, origin: 'external' },
    { kind: 'flexbox', min: 1, origin: 'external' },
    { kind: 'idOnHeading', min: 1, origin: 'embedded' },
    { kind: 'positioning', min: 1, origin: 'embedded' },
    { kind: 'bodyStyle', min: 1, origin: 'embedded' },
    { kind: 'headerStyle', min: 1, origin: 'embedded' },
    { kind: 'footerStyle', min: 1, origin: 'embedded' }
  ];
  const r = await run(SITE, 'cssSelectorTypes', { requirements: reqs });
  assert.equal(r._fraction, 1, JSON.stringify(r.subResults.filter(s => s.pass < 1)));
  const missingHover = { ...SITE, 's.css': CSS.replace('a:hover { color: green; }', '') };
  const r2 = await run(missingHover, 'cssSelectorTypes', { requirements: reqs });
  assert.equal(r2.subResults.find(s => s.id === 'req-external-hoverAnchor').pass, 0);
  assert.ok(r2.evidence.some(e => e.level === 'fail' && /hoverAnchor/.test(e.text)));
});

test('cssUnused finds selectors that match nothing on any page', async () => {
  const r = await run(SITE, 'cssUnused');
  assert.ok(r.instances.some(i => /\.ghost/.test(i.text)));
  assert.ok(r.subResults[0].pass < 1);
});

test('inlineStyles: count and required tags', async () => {
  const r = await run(SITE, 'inlineStyles', { min: 3, requireTags: ['div', 'span'] }, 'index.html');
  assert.equal(r._fraction, 1);
  const missingSpan = { 'index.html': `<div style="color:red">a</div><p style="color:blue">b</p><b style="x:y">c</b>` };
  const r2 = await run(missingSpan, 'inlineStyles', { min: 3, requireTags: ['div', 'span'] }, 'index.html');
  assert.equal(r2.subResults.find(s => s.id === 'tag-span').pass, 0);
  assert.equal(r2.subResults.find(s => s.id === 'tag-div').pass, 1);
});
