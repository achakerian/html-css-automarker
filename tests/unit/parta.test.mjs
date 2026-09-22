import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchApp } from '../helpers/harness.mjs';

let app;
before(async () => { app = await launchApp(); });
after(async () => { await app.close(); });

// A six-page site with relative links, a mailto and directions-ish contact page,
// enough for the auto-verifiable Part A rows to pass.
const NAV = `<nav>${['index', 'about', 'products', 'brands', 'contact', 'reserve']
  .map(n => `<a href="${n}.html">${n}</a>`).join(' ')}</nav>`;
const pg = body => `<html><head><title>t</title><style>
  .btn{background:blue;color:white;padding:8px}</style></head>
  <body>${NAV}${body}</body></html>`;
const SITE = {
  'index.html': pg('<h1>La Trobe Sports</h1><p>Welcome to our sport store.</p><a class="btn" href="products.html">Shop</a>'),
  'about.html': pg('<p>about</p>'),
  'products.html': pg('<p>products</p>'),
  'brands.html': pg('<p>brands</p>'),
  'contact.html': pg('<p>Visit our store: 1 Sports St. Directions: take tram 86.</p><a href="mailto:hi@x.com">email us</a>'),
  'reserve.html': pg('<p>reserve</p>'),
};

test('manual check always needs review and defaults unmet', async () => {
  const res = await app.page.evaluate(() =>
    Automarker.checks['manual']({ params: {} }));
  assert.equal(res.needsReview, true);
  const w = res.subResults.reduce((a, s) => a + s.weight, 0);
  const frac = res.subResults.reduce((a, s) => a + s.pass * s.weight, 0) / w;
  assert.equal(frac, 0, 'manual rows default to unmet until the marker ticks them');
  assert.ok(res.evidence.some(e => /manual/i.test(e.text)));
});

test('cse1iit preset gains a Part A requirements checklist', async () => {
  const r = await app.page.evaluate(() => {
    const c = Automarker.presets['cse1iit-2026s2'];
    const aSecs = c.sections.filter(s => s.id.startsWith('a'));
    const bSecs = c.sections.filter(s => !s.id.startsWith('a'));
    const aItems = aSecs.flatMap(s => s.items);
    return { errs: Automarker.Config.validate(c),
      aCount: aSecs.length, rows: aItems.length,
      allRequired: aItems.every(i => i.required === true && i.max === undefined),
      noPoints: aSecs.every(s => !s.points),
      bPts: bSecs.map(s => Automarker.Config.expandedSectionPoints(s, c.meta)) };
  });
  assert.deepEqual(r.errs, [], `preset must still validate: ${r.errs}`);
  assert.equal(r.aCount, 8, 'eight Part A groups, mirroring the paper sheet');
  assert.ok(r.rows >= 35, `expected the full checklist, got ${r.rows} rows`);
  assert.ok(r.allRequired, 'Part A rows are pass/fail only — never scored');
  assert.ok(r.noPoints, 'Part A sections carry no points');
  assert.deepEqual(r.bPts, [30, 23, 60], 'Part B sections unchanged');
});

test('Part A rows auto-tick where checkable and stay manual elsewhere', async () => {
  const rows = await app.page.evaluate(async site => {
    const sub = await Automarker.submissionFromTexts('t', site);
    const analysis = await Automarker.analyzeSubmission(sub);
    const cfg = Automarker.presets['cse1iit-2026s2'];
    const sheet = await Automarker.scoring.scoreSubmission({ submission: sub, ...analysis }, cfg);
    const by = Object.fromEntries(sheet.items.map(i => [i.id, i]));
    return { pages: by['a-pages'], relative: by['a-relative'], email: by['a-contact-email'],
      copyright: by['a-copyright'], reqTotal: sheet.requirementsTotal,
      totalPoints: sheet.totalPoints };
  }, SITE);
  assert.equal(rows.pages.passed, true, '6 HTML files → auto-ticked');
  assert.equal(rows.relative.passed, true, 'relative-only links → auto-ticked');
  assert.equal(rows.email.passed, true, 'mailto present → auto-ticked');
  assert.equal(rows.copyright.passed, true, 'human-only row is exception-based: pre-ticked met');
  assert.ok(!rows.copyright.needsReview, 'human-only row must not demand review');
  assert.ok(rows.reqTotal >= 35, 'requirements counter now spans the checklist');
  assert.equal(rows.totalPoints, 113, 'points total untouched by Part A');
});

test('Part A manufactures no review flags: rows verify or stay silent', async () => {
  const r = await app.page.evaluate(async site => {
    const cfg = Automarker.presets['cse1iit-2026s2'];
    const aItems = cfg.sections.filter(s => s.id.startsWith('a')).flatMap(s => s.items);
    const sub = await Automarker.submissionFromTexts('t', site);
    const analysis = await Automarker.analyzeSubmission(sub);
    const sheet = await Automarker.scoring.scoreSubmission({ submission: sub, ...analysis }, cfg);
    const aRows = sheet.items.filter(i => i.id.startsWith('a-'));
    return {
      zipRow: aItems.find(i => i.id === 'a-zip'),
      relativeKind: aItems.find(i => i.id === 'a-relative')?.params?.kind,
      externalRow: aItems.find(i => i.id === 'a-external')?.params?.kind,
      dedIds: cfg.deductions.map(d => d.id),
      manualRows: aItems.filter(i => i.check === 'manual').map(i => ({ id: i.id, dp: !!(i.params && i.params.defaultPass) })),
      assistedRows: aItems.filter(i => i.mode === 'assisted').map(i => i.id),
      reachCheck: aItems.find(i => i.id === 'a-reachable')?.check,
      handCheck: aItems.find(i => i.id === 'a-handwritten')?.check,
      reviewFlagged: aRows.filter(i => i.needsReview).map(i => i.id),
      reachable: aRows.find(i => i.id === 'a-reachable')?.passed,
      handwritten: aRows.find(i => i.id === 'a-handwritten')?.passed,
    };
  }, SITE);
  assert.ok(r.zipRow && r.zipRow.params?.defaultPass,
    'single-zip row on the document → present, exception-based');
  assert.equal(r.relativeKind, 'absolute', 'document row: all links relative (drive paths)');
  assert.equal(r.externalRow, 'external', 'document row: no external links');
  assert.deepEqual(r.dedIds, ['spelling', 'broken', 'pagecount'],
    'deductions match the document Part C — no extra absolute-links deduction');
  assert.ok(r.manualRows.length >= 3 && r.manualRows.every(m => m.dp),
    `every remaining manual row must be defaultPass: ${JSON.stringify(r.manualRows)}`);
  assert.deepEqual(r.assistedRows, [], 'no Part A row uses assisted mode');
  assert.equal(r.reachCheck, 'reachability');
  assert.equal(r.handCheck, 'handAuthored');
  assert.deepEqual(r.reviewFlagged, [], 'a clean hand-written site must produce zero Part A review flags');
  assert.equal(r.reachable, true, 'fully nav-linked site → reachable auto-ticked');
  assert.equal(r.handwritten, true, 'no AI fingerprints → hand-written auto-ticked');
});
