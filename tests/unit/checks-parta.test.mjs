import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchApp } from '../helpers/harness.mjs';

let app;
before(async () => { app = await launchApp(); });
after(async () => { await app.close(); });

const run = (site, checkId, params = {}) =>
  app.page.evaluate(async ({ site, checkId, params }) => {
    const sub = await Automarker.submissionFromTexts('t', site);
    const { snapshots } = await Automarker.analyzeSubmission(sub);
    const ctx = { snapshots, submission: sub, params,
      config: { meta: { viewport: { w: 1280, h: 800 }, weightThresholds: { fullKB: 1536, partialKB: 4096 } },
        topic: { keywords: [], sectionHints: [], spellWhitelist: [], logoHints: [], locationHints: [] } } };
    const res = await Automarker.checks[checkId](ctx);
    const w = res.subResults.reduce((a, s) => a + s.weight, 0);
    res._fraction = w ? res.subResults.reduce((a, s) => a + s.pass * s.weight, 0) / w : 0;
    return res;
  }, { site, checkId, params });

const IMG = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='100'/>";

test('reachability follows links from home and flags orphans', async () => {
  const orphaned = await run({
    'index.html': '<a href="about.html">about</a>',
    'about.html': '<a href="index.html">home</a>',
    'orphan.html': '<p>nothing links here</p>',
  }, 'reachability');
  assert.ok(orphaned._fraction < 1);
  assert.ok(orphaned.evidence.some(e => e.level === 'fail' && /orphan\.html/.test(e.text)));

  const linked = await run({
    'index.html': '<a href="about.html">a</a><a href="deep/gallery.html">g</a>',
    'about.html': '<a href="index.html">home</a>',
    'deep/gallery.html': '<a href="../index.html">home</a>',
  }, 'reachability');
  assert.equal(linked._fraction, 1);
});

test('pageContent targets a page by hint and counts keyword/pattern signals', async () => {
  const site = {
    'index.html': '<a href="about.html">about</a><a href="contact.html">contact</a>',
    'about.html': '<p>Our story: founded in 2020, our mission is quality sportswear.</p>',
    'contact.html': `<p>Call (03) 9479 1111. Open Mon-Fri 9am to 5pm.</p>
      <img src="${IMG}" alt="map to our store">`,
  };
  const story = await run(site, 'pageContent',
    { pageHints: ['about'], keywords: ['story', 'founded', 'inspiration'], min: 1 });
  assert.equal(story._fraction, 1);
  assert.ok(story.evidence.some(e => /about\.html/.test(e.text)));

  const phone = await run(site, 'pageContent',
    { pageHints: ['contact', 'location'], patterns: ['(\\+?\\d[\\d\\s()-]{7,}\\d)'], min: 1 });
  assert.equal(phone._fraction, 1);

  const map = await run(site, 'pageContent',
    { pageHints: ['contact'], imgHints: ['map'], min: 1 });
  assert.equal(map._fraction, 1);

  const missingKw = await run(site, 'pageContent',
    { pageHints: ['about'], keywords: ['newsletter', 'loyalty'], min: 1 });
  assert.ok(missingKw._fraction < 1);

  const noPage = await run(site, 'pageContent',
    { pageHints: ['reservation'], keywords: ['reserve'], min: 1 });
  assert.equal(noPage._fraction, 0);
  assert.ok(noPage.evidence.some(e => e.level === 'fail' && /no page/i.test(e.text)));
});

test('pageContent minImgs counts rendered images on the target page', async () => {
  const site = {
    'index.html': '<a href="products.html">p</a>',
    'products.html': `<img src="${IMG}"><img src="${IMG}"><img src="${IMG}"><p>Shoes $99.95</p>`,
  };
  const enough = await run(site, 'pageContent', { pageHints: ['product'], minImgs: 3 });
  assert.equal(enough._fraction, 1);
  const few = await run(site, 'pageContent', { pageHints: ['product'], minImgs: 5 });
  assert.ok(few._fraction < 1);
});

test('formFields matches field groups by type/name/label and checks validation', async () => {
  const site = {
    'index.html': '<a href="reserve.html">r</a>',
    'reserve.html': `<form>
      <label for="fn">Your name</label><input id="fn" name="fullname" required>
      <input type="email" name="email" required>
      <input type="tel" name="phone">
      <select name="size"><option>M</option></select>
      <input type="number" name="quantity">
      <input type="text" name="product">
      <input type="date" name="pickup">
      <textarea name="comments"></textarea>
    </form>`,
  };
  const contact = await run(site, 'formFields',
    { pageHints: ['reserv'], require: [['name'], ['email'], ['phone', 'tel', 'mobile']] });
  assert.equal(contact._fraction, 1);

  const product = await run(site, 'formFields',
    { pageHints: ['reserv'], require: [['product', 'item'], ['size'], ['quantity', 'qty']] });
  assert.equal(product._fraction, 1);

  const missing = await run(site, 'formFields',
    { pageHints: ['reserv'], require: [['newsletter'], ['size']] });
  assert.ok(missing._fraction < 1);
  assert.ok(missing.evidence.some(e => e.level === 'fail' && /newsletter/.test(e.text)));

  const validation = await run(site, 'formFields', { pageHints: ['reserv'], validation: true });
  assert.equal(validation._fraction, 1, 'required attrs + typed inputs count as validation');

  const bare = await run({
    'index.html': '<a href="reserve.html">r</a>',
    'reserve.html': '<form><input name="a"><input name="b"></form>',
  }, 'formFields', { pageHints: ['reserv'], validation: true });
  assert.ok(bare._fraction < 1, 'no constraints anywhere → validation unmet');
});

test('handAuthored passes quietly on clean code, flags AI fingerprints for review', async () => {
  const clean = await run({
    'index.html': '<html><body>\n<h1 class="big">shop</h1>\n <p>welcome </p>\n</body></html>',
    'style.css': '.big{color:red}\n',
  }, 'handAuthored');
  assert.equal(clean._fraction, 1);
  assert.ok(!clean.needsReview);

  const aiStyled = await run({
    'index.html': '<html><body><p class="a">hi</p></body></html>',
    'styles.css': `/* ==================== Reset ==================== */
*,
*::before,
*::after {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

/* ==================== Tokens ==================== */

:root {
    --primary-color: #1a7f6b;
    --accent-color: #f4a261;
    --surface-color: #ffffff;
}

/* ==================== Layout ==================== */

.wrapper {
    gap: clamp(1rem, 4vw, 3rem);
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    scroll-behavior: smooth;
}
`,
  }, 'handAuthored');
  assert.equal(aiStyled._fraction, 0);
  assert.equal(aiStyled.needsReview, true);
  assert.ok(aiStyled.evidence.some(e => /authorship|signal/i.test(e.text)));
});

test('externalLink kind param separates drive/absolute paths from external links', async () => {
  const site = {
    'index.html': `<a href="about.html">ok</a>
      <a href="https://example.com">external site</a>
      <a href="C:\\pics\\page.html">drive path</a>`,
    'about.html': '<p>a</p>',
  };
  const absolute = await run(site, 'externalLink', { policy: 'forbidden', kind: 'absolute' });
  assert.equal(absolute.instances.length, 1);
  assert.match(absolute.instances[0].text, /C:\\/);

  const external = await run(site, 'externalLink', { policy: 'forbidden', kind: 'external' });
  assert.equal(external.instances.length, 1);
  assert.match(external.instances[0].text, /example\.com/);

  const both = await run(site, 'externalLink', { policy: 'forbidden' });
  assert.equal(both.instances.length, 2, 'no kind → all instances, unchanged behaviour');
});

test('manual check with defaultPass is met and silent; without it stays unmet', async () => {
  const silent = await app.page.evaluate(() =>
    Automarker.checks['manual']({ params: { defaultPass: true } }));
  assert.equal(silent.subResults[0].pass, 1);
  assert.ok(!silent.needsReview);
  assert.ok(silent.evidence.some(e => /untick/i.test(e.text)));

  const nagging = await app.page.evaluate(() => Automarker.checks['manual']({ params: {} }));
  assert.equal(nagging.subResults[0].pass, 0);
  assert.equal(nagging.needsReview, true);
});
