import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchApp, snapshotFor } from '../helpers/harness.mjs';

let app;
before(async () => { app = await launchApp(); });
after(async () => { await app.close(); });

const SITE = {
  'index.html': `<html><head>
    <link rel="stylesheet" href="site.css">
    <style>#main-title { color: navy; } nav a { padding: 4px; }</style>
    </head><body>
    <header><h1 id="main-title">T</h1><nav><a href="index.html">x</a></nav></header>
    <p class="note">text</p><button class="cta">Go</button>
    <div class="unusedless"></div>
    <footer>f</footer></body></html>`,
  'site.css': `p { line-height: 1.5; }
    .cta { background: green; }
    p.note { color: #333; }
    h1, p { margin: 0; }
    header p a { color: red; }
    body { margin: 0; } header { display: flex; } footer { position: sticky; }
    a:hover { text-decoration: underline; }
    .never-used { color: pink; }`
};

test('classifies selector kinds and detects usage', async () => {
  const s = await snapshotFor(app.page, SITE, 'index.html');
  assert.deepEqual(s.css.external, ['site.css']);
  assert.equal(s.css.externalLinkedHere, true);
  const kindsOf = sel => s.css.rules.find(r => r.selector === sel).kinds;
  assert.ok(kindsOf('p').includes('pFormat'));
  assert.ok(kindsOf('.cta').includes('classGeneric'));
  assert.ok(kindsOf('p.note').includes('classScoped'));
  assert.ok(kindsOf('h1, p').includes('group'));
  assert.ok(kindsOf('h1, p').includes('headingStyle'));
  assert.ok(kindsOf('header p a').includes('contextual'));
  assert.ok(kindsOf('body').includes('bodyStyle'));
  assert.ok(kindsOf('header').includes('flexbox'));
  assert.ok(kindsOf('footer').includes('footerStyle'));
  assert.ok(kindsOf('footer').includes('positioning'));
  assert.ok(kindsOf('a:hover').includes('hoverAnchor'));
  assert.ok(kindsOf('#main-title').includes('idOnHeading'));
  assert.ok(kindsOf('nav a').includes('contextual'));
  const embedded = s.css.rules.filter(r => r.origin === 'embedded');
  assert.equal(embedded.length, 2);
  assert.equal(s.css.rules.find(r => r.selector === '.never-used').matches, false);
  assert.equal(s.css.rules.find(r => r.selector === '.cta').matches, true);
  assert.deepEqual(s.css.inline, []);
});

test('pseudo-function arguments with +/~/> do not fracture compound splitting', async () => {
  const r = await app.page.evaluate(() => ({
    trNth: Automarker.CssAnalyzer.classifySelector('tr:nth-child(2n+1)', null, null),
    pNth: Automarker.CssAnalyzer.classifySelector('p:nth-child(2n+1)', null, null)
  }));
  assert.ok(!r.trNth.includes('contextual'));
  assert.ok(r.pNth.includes('pFormat'));
});

test('hoverAnchor requires :hover on the same compound whose tag is a', async () => {
  const r = await app.page.evaluate(() => ({
    a: Automarker.CssAnalyzer.classifySelector('a:hover', null, null),
    navA: Automarker.CssAnalyzer.classifySelector('nav a:hover', null, null),
    aB: Automarker.CssAnalyzer.classifySelector('a b:hover', null, null)
  }));
  assert.ok(r.a.includes('hoverAnchor'));
  assert.ok(r.navA.includes('hoverAnchor'));
  assert.ok(!r.aB.includes('hoverAnchor'));
});

const IMPORT_SITE = {
  'index.html': `<html><head><link rel="stylesheet" href="import.css"></head>
    <body><p>text</p></body></html>`,
  'import.css': `@import url("http://example.com/y.css");
    p { color: red; }`
};

test('a leading @import does not drop the rest of the stylesheet', async () => {
  const s = await snapshotFor(app.page, IMPORT_SITE, 'index.html');
  const rule = s.css.rules.find(r => r.selector === 'p');
  assert.ok(rule, 'p rule after @import should still be parsed');
  assert.ok(rule.props.includes('color'));
});

const MEDIA_SITE = {
  'index.html': `<html><head><style>
      .box { color: black; }
      @media (max-width: 500px) { .box { color: blue; } }
    </style></head><body><div class="box"></div></body></html>`
};

test('rules record the enclosing @media condition text', async () => {
  const s = await snapshotFor(app.page, MEDIA_SITE, 'index.html');
  const boxRules = s.css.rules.filter(r => r.selector === '.box');
  assert.equal(boxRules.length, 2);
  assert.ok(boxRules.some(r => r.media === ''));
  assert.ok(boxRules.some(r => r.media === '(max-width: 500px)'));
});
