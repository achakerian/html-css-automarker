import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchApp } from '../helpers/harness.mjs';
import { buildZip } from '../helpers/zipwrite.mjs';

let app;
before(async () => { app = await launchApp(); });
after(async () => { await app.close(); });

const NAV = p => `<nav style="background:#123;padding:8px">
  ${['index.html','about.html','products.html','gallery.html','contact.html','reserve.html']
    .map(x => `<a href="${x}" style="color:#fff;text-decoration:none;padding:6px">${x.split('.')[0]}</a>`).join('')}</nav>`;
const page = (t, body) => `<html><head><title>${t}</title><style>
  body{margin:0;font-family:Arial} main{max-width:900px;margin:0 auto;padding:20px}</style></head>
  <body id="top">${NAV()}<main><h1>${t}</h1>${body}</main>
  <a href="#top">Back to top</a></body></html>`;
const SITE = Object.fromEntries([
  ['index.html', page('Sport Home', '<p>Welcome to our sport store with shoes and gear, simply teh best.</p>')],
  ...['about', 'products', 'gallery', 'contact', 'reserve']
    .map(n => [`${n}.html`, page(n, `<p>${n} content for the sport store</p>`)])]);

test('drop a zip, see the sheet, override a score, confirm a spelling deduction', async () => {
  const { page: p } = app;
  const zip = buildZip(Object.entries(SITE).map(([path, data]) => ({ path, data })));
  await p.setInputFiles('[data-testid="drop-input"]',
    { name: 'alice_12345.zip', mimeType: 'application/zip', buffer: zip });
  await p.waitForSelector('[data-testid="record-item"]', { timeout: 30000 });
  await p.click('[data-testid="record-item"]');
  await p.waitForSelector('[data-row-id="nav-home"]');
  assert.match(await p.textContent('[data-testid="record-item"]'), /alice_12345/);

  const before = parseFloat(await p.textContent('[data-testid="total-points"]'));
  await p.click('[data-row-id="home-weight"] .score-btns button[data-val="0"]');
  const after = parseFloat(await p.textContent('[data-testid="total-points"]'));
  assert.ok(after < before, `${after} !< ${before}`);
  const cls = await p.getAttribute('[data-row-id="home-weight"]', 'class');
  assert.match(cls, /overridden/);

  const spell = await p.$('[data-ded-id="spelling"][data-idx="0"] input[type=checkbox]');
  assert.ok(spell, 'spelling instance rendered ("Teh" typo)');
  const t1 = parseFloat(await p.textContent('[data-testid="total-points"]'));
  await spell.check();
  const t2 = parseFloat(await p.textContent('[data-testid="total-points"]'));
  assert.equal(t2, t1 - 1);

  assert.ok(await p.$('[data-row-id="home-aesthetic"].needs-review'), 'assisted row flagged');
  await p.click('[data-testid="preview-btn"]');
  await p.waitForSelector('#preview-modal:not([hidden]) iframe');
  assert.ok((await p.$$('[data-testid="preview-tab"]')).length === 6);
});
