import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchApp } from '../helpers/harness.mjs';
import { buildZip } from '../helpers/zipwrite.mjs';

let app;
before(async () => { app = await launchApp(); });
after(async () => { await app.close(); });

const NAV = `<nav><a href="index.html">home</a> <a href="about.html">about</a>
  <a href="products.html">products</a> <a href="gallery.html">gallery</a>
  <a href="contact.html">contact</a> <a href="reserve.html">reserve</a></nav>`;
const page = (t, body) => `<html><head><title>${t}</title><style>
  body{margin:0;font-family:Arial}</style></head>
  <body id="top">${NAV}<h1>${t}</h1>${body}<a href="#top">top</a></body></html>`;
const SITE = Object.fromEntries([
  ['index.html', page('Sport Home', '<p>Welcome to our sport store, simply teh best gear.</p>')],
  ...['about', 'products', 'gallery', 'contact', 'reserve']
    .map(n => [`${n}.html`, page(n, `<p>${n} content for the sport store</p>`)])]);

test('evidence page paths and deduction instances click through to the preview', async () => {
  const { page: p } = app;
  const zip = buildZip(Object.entries(SITE).map(([path, data]) => ({ path, data })));
  await p.setInputFiles('[data-testid="drop-input"]',
    { name: 'bob_54321.zip', mimeType: 'application/zip', buffer: zip });
  await p.waitForSelector('[data-testid="record-item"]', { timeout: 30000 });
  await p.click('[data-testid="record-item"]');
  await p.waitForSelector('[data-row-id="nav-home"]');

  // An evidence line beginning with a page path renders that path as a link…
  await p.click('[data-row-id="nav-home"] details summary');
  const evLink = await p.$('[data-row-id="nav-home"] [data-testid="evidence-link"]');
  assert.ok(evLink, 'evidence page path rendered as a link');
  // …which opens the preview modal on that page.
  await evLink.click();
  await p.waitForSelector('#preview-modal:not([hidden]) iframe');
  await p.click('#preview-tabs button');   // ✕ close

  // Spelling deduction instances link to each page containing the word…
  const dedLink = await p.$('[data-ded-id="spelling"] [data-testid="ded-page-link"]');
  assert.ok(dedLink, 'spelling instance carries a page link');
  assert.equal(await dedLink.textContent(), 'index.html');
  await dedLink.click();
  await p.waitForSelector('#preview-modal:not([hidden]) iframe');
  // …and highlight the occurrences of the word in the previewed page.
  const marks = p.frameLocator('#preview-body iframe').locator('mark[data-automarker-highlight]');
  await marks.first().waitFor({ timeout: 10000 });
  assert.match((await marks.first().textContent()).toLowerCase(), /teh/);
});

test('clicking a deduction page link does not toggle its confirm checkbox', async () => {
  const { page: p } = app;
  await p.click('#preview-tabs button');   // close any open preview
  const cb = await p.$('[data-ded-id="spelling"][data-idx="0"] input[type=checkbox]');
  const before = await cb.isChecked();
  await p.click('[data-ded-id="spelling"][data-idx="0"] [data-testid="ded-page-link"]');
  await p.waitForSelector('#preview-modal:not([hidden]) iframe');
  assert.equal(await cb.isChecked(), before, 'checkbox state unchanged by link click');
});
