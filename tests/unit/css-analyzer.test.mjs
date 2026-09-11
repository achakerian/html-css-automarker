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
