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
const page = (t, body) => `<html><head><title>${t}</title></head>
  <body id="top">${NAV}<h1>${t}</h1>${body}<a href="#top">top</a></body></html>`;
const SITE = Object.fromEntries([
  ['index.html', page('Sport Home', '<p>Welcome to our sport store.</p>')],
  ...['about', 'products', 'gallery', 'contact', 'reserve']
    .map(n => [`${n}.html`, page(n, `<p>${n} content</p>`)])]);

test('feedback panel: generated text, per-section notes, late days, copy button', async () => {
  const { page: p } = app;
  const zip = buildZip(Object.entries(SITE).map(([path, data]) => ({ path, data })));
  await p.setInputFiles('[data-testid="drop-input"]',
    { name: 'carol_777.zip', mimeType: 'application/zip', buffer: zip });
  await p.waitForSelector('[data-testid="record-item"]', { timeout: 30000 });
  await p.click('[data-testid="record-item"]');
  await p.waitForSelector('[data-testid="feedback-text"]');

  // Generated feedback: efeedback format — sections needing attention,
  // dashed criteria, total block at the end.
  let out = await p.inputValue('[data-testid="feedback-text"]');
  assert.match(out, /\nTotal: [\d.]+\/30 \([\d.]+\/113 points · [\d.]+\/100\)\n/);
  assert.match(out, /\nRequirements: \d+\/45 met$/);
  assert.ok(!/\t/.test(out), 'plain text, not a TSV table');
  assert.ok(!/AI Usage/.test(out), 'clean hand-written site → no AI banner');
  assert.ok(!/^A — /m.test(out), 'feedback strips the "A — " section prefixes');

  // The totals bar and section headers show the /100 display layer.
  const total = parseFloat(await p.textContent('[data-testid="total-points"]'));
  const pct = parseFloat(await p.textContent('[data-testid="percent-100"]'));
  assert.equal(pct, Math.round(total / 113 * 100 * 10) / 10, 'percent = total/113 × 100');
  const navHeader = await p.evaluate(() =>
    [...document.querySelectorAll('.sec h2')]
      .find(h => h.textContent.includes('Navigation'))?.textContent);
  assert.match(navHeader, /·\s*[\d.]+\/26\.5/, 'nav section shows its share of 100 (30/113 → 26.5)');

  // Typing a per-section note folds it into the generated text live.
  await p.fill('[data-row-id="nav-home"] >> xpath=ancestor::section >> [data-testid="sec-note"]',
    'Nav needs consistent styling across pages.');
  out = await p.inputValue('[data-testid="feedback-text"]');
  assert.ok(out.includes('Nav needs consistent styling across pages.'),
    'note text appears in the feedback output');

  // Late days reduce the mapped mark by 1.5 each.
  const before = parseFloat(await p.textContent('[data-testid="mapped-mark"]'));
  await p.fill('[data-testid="late-days"]', '2');
  await p.dispatchEvent('[data-testid="late-days"]', 'change');
  const after = parseFloat(await p.textContent('[data-testid="mapped-mark"]'));
  assert.equal(after, Math.max(0, before - 3), '2 late days → −3 marks');
  out = await p.inputValue('[data-testid="feedback-text"]');
  assert.match(out, /Late: 2 day/);

  // Copy button exists and clicking it does not blow up.
  await p.click('[data-testid="copy-feedback"]');

  // Coordinator AI/template report is downloadable from the toolbar.
  assert.ok(await p.$('[data-testid="ai-report"]'), 'AI report button in the toolbar');
});
