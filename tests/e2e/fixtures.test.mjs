import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchApp } from '../helpers/harness.mjs';
import { buildZip } from '../helpers/zipwrite.mjs';
import * as sites from '../fixtures/sites.mjs';

let app;
before(async () => { app = await launchApp(); });
after(async () => { await app.close(); });

const mark = (files, presetId) => app.page.evaluate(async ({ b64, presetId }) => {
  const rec = await Automarker.processSubmissionBytes('fx',
    Automarker.util.b64ToBytes(b64), Automarker.presets[presetId]);
  if (rec.error) return { error: rec.error };
  const { sheet, submission } = rec;
  return { pages: submission.pages.length, home: submission.homePath,
    total: sheet.total, mapped: sheet.mappedMark,
    reqMet: sheet.requirementsMet, reqTotal: sheet.requirementsTotal,
    rows: Object.fromEntries(sheet.items.map(i => [i.id,
      { auto: i.auto, passed: i.passed, label: i.label }])),
    deds: Object.fromEntries(sheet.deductions.map(d => [d.id,
      { total: d.total, n: d.instances.length, words: d.instances.map(i2 => i2.word) }])) };
}, { b64: buildZip(Object.entries(files).map(([path, data]) => ({ path, data }))).toString('base64'),
     presetId });

test('alpha-perfect scores 113/113 → 30 with zero deductions', async () => {
  const r = await mark(sites.alphaPerfect(), 'cse1iit-2026s2');
  assert.equal(r.pages, 6);
  const shortfall = Object.entries(r.rows)
    .filter(([, v]) => v.passed === false || v.auto === 0)
    .map(([id, v]) => `${id}=${v.auto}`);
  assert.equal(r.total, 113, 'imperfect rows: ' + shortfall.join(', '));
  assert.equal(r.mapped, 30);
  assert.equal(r.deds.spelling.n, 0);
  assert.equal(r.deds.broken.n, 0);
  assert.ok(!('absolute' in r.deds), 'absolute-links deduction is not on the marking sheet');
});

test('bravo-flawed loses exactly the seeded points', async () => {
  const r = await mark(sites.bravoFlawed(), 'cse1iit-2026s2');
  const navProducts = Object.entries(r.rows)
    .find(([id, v]) => id.startsWith('nav-sub') && /products\.html/.test(v.label));
  assert.equal(navProducts[1].auto, 4);                  // missing contact link
  assert.equal(r.rows['sub-logo'].auto, 4);              // no logo on contact.html
  assert.equal(r.rows['sub-backtotop'].auto, 4);         // none on reserve.html
  assert.equal(r.rows['sub-weight'].auto, 4);            // heavy products.html
  assert.equal(r.deds.broken.total, -4);                 // missing.html + ghost.svg
  assert.equal(r.rows['a-external'].passed, false);      // facebook link → checklist row, not a deduction
  assert.deepEqual([...r.deds.spelling.words].sort(), ['definately', 'recieve', 'teh']);
  assert.equal(r.total, 109 - 4);                        // 29+23+57 = 109; auto deds −4 (broken only)
  const confirmed = await app.page.evaluate(() => {
    const rec = Automarker.state.records.at(-1);
    [0, 1, 2].forEach(i => Automarker.scoring.setDeductionConfirmed(
      rec.sheet, Automarker.presets['cse1iit-2026s2'], 'spelling', i, true));
    return rec.sheet.total;
  });
  assert.equal(confirmed, 102);
});

test('charlie-minimal takes the −15 page deduction and low design scores', async () => {
  const r = await mark(sites.charlieMinimal(), 'cse1iit-2026s2');
  assert.equal(r.pages, 5);
  assert.equal(r.deds.pagecount.total, -15);
  assert.ok(r.total <= 35, `total ${r.total}`);
  const padded = Object.entries(r.rows).find(([id, v]) =>
    id.startsWith('nav-sub') && /missing page/.test(v.label));
  assert.ok(padded); assert.equal(padded[1].auto, 0);
});

test('delta-messy normalises to the same result as alpha', async () => {
  const [a, d] = [await mark(sites.alphaPerfect(), 'cse1iit-2026s2'),
                  await mark(sites.deltaMessy(), 'cse1iit-2026s2')];
  assert.equal(d.pages, 6);
  assert.equal(d.home, 'index.html');
  assert.equal(d.total, a.total);
});

test('echo-portfolio meets every IWBS001 requirement', async () => {
  const r = await mark(sites.echoPortfolio(), 'iwbs001-a2');
  const unmet = Object.entries(r.rows).filter(([, v]) => v.passed === false);
  assert.deepEqual(unmet, [], JSON.stringify(unmet));
  assert.equal(r.reqMet, r.reqTotal);
  assert.equal(r.deds.spelling.n, 0);
});

test('foxtrot-gaps fails exactly the seeded requirements', async () => {
  const r = await mark(sites.foxtrotGaps(), 'iwbs001-a2');
  const unmet = Object.entries(r.rows).filter(([, v]) => v.passed === false).map(([id]) => id);
  assert.ok(unmet.includes('css-ext-types'), unmet.join());   // hover, generic-class, flexbox gaps
  assert.ok(unmet.includes('css-unused'));                     // .ghost
  assert.ok(unmet.some(id => id.startsWith('css-inline#')));   // span removed on place.html
  assert.equal(unmet.length, 3, unmet.join());
});

test('batch CSV covers multiple fixtures', async () => {
  const csv = await app.page.evaluate(() =>
    Automarker.exporter.toCSV(
      Automarker.state.records.filter(r => r.sheet?.configId === 'cse1iit-2026s2'),
      Automarker.presets['cse1iit-2026s2']));
  assert.match(csv.split('\n')[0], /nav-home:final/);
  assert.ok(csv.trim().split('\n').length >= 4);
});
