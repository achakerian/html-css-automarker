import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchApp } from '../helpers/harness.mjs';
import { buildZip } from '../helpers/zipwrite.mjs';

let app;
before(async () => { app = await launchApp(); });
after(async () => { await app.close(); });

const NAV = `<nav style="background:#123;padding:8px">
  <a href="index.html" style="color:#fff;text-decoration:none;padding:6px">H</a>
  <a href="a.html" style="color:#fff;text-decoration:none;padding:6px">A</a></nav>`;
const SITE = { 'index.html': `<html><body>${NAV}<p>the home page has a teh typo</p></body></html>`,
               'a.html': `<html><body>${NAV}<p>sub</p><a href="dead.html">x</a></body></html>` };
const CFG = {
  meta: { id: 't', title: 't', totalPoints: 12, mappedMarks: 30, minPages: 3,
    viewport: { w: 1280, h: 800 }, weightThresholds: { fullKB: 1536, partialKB: 4096 } },
  topic: { keywords: [], sectionHints: [], spellWhitelist: [], logoHints: [], locationHints: [] },
  sections: [
    { id: 's1', title: 'S1', points: 12, items: [
      { id: 'i-nav', label: 'nav home', check: 'navBar', mode: 'auto', scope: 'home', max: 5 },
      { id: 'i-nav-sub', label: 'nav subs', check: 'navBar', mode: 'auto', scope: 'eachSubpage', max: 3 },
      { id: 'i-weight', label: 'weight', check: 'pageWeight', mode: 'auto', scope: 'home', max: 1 } ] },
    { id: 's2', title: 'S2', items: [
      { id: 'r-email', label: 'email link', check: 'emailLink', mode: 'auto', scope: 'site', required: true } ] } ],
  deductions: [
    { id: 'broken', label: 'broken', perInstance: -2, check: 'brokenResources', mode: 'auto' },
    { id: 'spelling', label: 'spelling', perInstance: -1, check: 'spelling', mode: 'assisted' },
    { id: 'short', label: 'short', flat: -5, check: 'pageCount', mode: 'auto' } ]
};

const score = (site, cfg) => app.page.evaluate(async ({ site, cfg }) => {
  const sub = await Automarker.submissionFromTexts('t', site);
  const analysis = await Automarker.analyzeSubmission(sub);
  return Automarker.scoring.scoreSubmission({ submission: sub, ...analysis }, cfg);
}, { site, cfg });

test('scores, expands, pads, deducts and maps', async () => {
  const sheet = await score(SITE, CFG);
  const rows = Object.fromEntries(sheet.items.map(i => [i.id, i]));
  assert.equal(rows['i-nav'].final, 5);                     // perfect nav
  assert.equal(rows['i-weight'].final, 1);
  assert.equal(sheet.items.filter(i => i.id.startsWith('i-nav-sub')).length, 2); // 1 real + 1 padded
  const padded = sheet.items.find(i => i.id.startsWith('i-nav-sub') && /missing page/.test(i.label));
  assert.equal(padded.final, 0);
  assert.equal(rows['r-email'].passed, false);              // no mailto in fixture
  const broken = sheet.deductions.find(d => d.id === 'broken');
  assert.equal(broken.total, -2);                           // dead.html, auto-confirmed
  const spelling = sheet.deductions.find(d => d.id === 'spelling');
  assert.ok(spelling.instances.some(i => i.word === 'teh'));
  assert.equal(spelling.total, 0);                          // assisted: unconfirmed by default
  const short = sheet.deductions.find(d => d.id === 'short');
  assert.equal(short.total, -5);                            // 2 pages < minPages 3
  assert.equal(sheet.requirementsTotal, 1);
  assert.equal(sheet.requirementsMet, 0);
  assert.equal(sheet.totalPoints, 12);
  const scoredSum = sheet.items.reduce((a, i) => a + (i.max ? i.final : 0), 0);
  assert.equal(sheet.total, Math.max(0, scoredSum - 7));
  assert.equal(sheet.mappedMark, Math.max(0, Math.round(sheet.total / 12 * 30 * 10) / 10));
});

test('overrides and spelling confirmation recompute totals', async () => {
  // clone without the flat 'short' deduction so totals stay above the max(0, …) floor
  const CFG2 = { ...CFG, deductions: CFG.deductions.filter(d => d.id !== 'short') };
  const r = await app.page.evaluate(async ({ site, cfg }) => {
    const sub = await Automarker.submissionFromTexts('t', site);
    const analysis = await Automarker.analyzeSubmission(sub);
    const sheet = await Automarker.scoring.scoreSubmission({ submission: sub, ...analysis }, cfg);
    const before = sheet.total;
    Automarker.scoring.applyOverride(sheet, cfg, 'i-nav', 2);
    const afterOverride = sheet.total;
    Automarker.scoring.applyOverride(sheet, cfg, 'r-email', true);
    const spellIdx = sheet.deductions.findIndex(d => d.id === 'spelling');
    Automarker.scoring.setDeductionConfirmed(sheet, cfg, 'spelling', 0, true);
    return { before, afterOverride, total: sheet.total,
      overridden: sheet.items.find(i => i.id === 'i-nav').overridden,
      reqMet: sheet.requirementsMet,
      spellTotal: sheet.deductions[spellIdx].total };
  }, { site: SITE, cfg: CFG2 });
  assert.equal(r.afterOverride, r.before - 3);
  assert.equal(r.overridden, true);
  assert.equal(r.reqMet, 1);
  assert.equal(r.spellTotal, -1);
  assert.equal(r.total, r.afterOverride - 1);
});

test('processSubmissionBytes runs the whole pipeline from zip bytes', async () => {
  const zip = buildZip(Object.entries(SITE).map(([path, data]) => ({ path, data })));
  const rec = await app.page.evaluate(async ({ b64, cfg }) => {
    const r = await Automarker.processSubmissionBytes('student-42', Automarker.util.b64ToBytes(b64), cfg);
    return { name: r.name, hasSheet: !!r.sheet, records: Automarker.state.records.length,
      err: r.error ?? null };
  }, { b64: zip.toString('base64'), cfg: CFG });
  assert.equal(rec.name, 'student-42');
  assert.equal(rec.hasSheet, true);
  assert.equal(rec.err, null);
  assert.ok(rec.records >= 1);
});

test('corrupt zip yields an error record, not a crash', async () => {
  const rec = await app.page.evaluate(async () => {
    const before = Automarker.state.records.length;
    const r = await Automarker.processSubmissionBytes('bad', new Uint8Array([9, 9, 9]));
    return { error: r.error, before, after: Automarker.state.records.length };
  });
  assert.match(rec.error, /Not a zip/);
  assert.equal(rec.after, rec.before + 1);              // pushed onto state.records even on failure
});
