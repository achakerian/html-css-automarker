import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchApp } from '../helpers/harness.mjs';

let app;
before(async () => { app = await launchApp(); });
after(async () => { await app.close(); });

const SITE = { 'index.html': '<html><body><a href="a.html">a</a><p>Home page</p></body></html>',
               'a.html': '<p>a</p>' };
const CFG = {
  meta: { id: 'mini', title: 'Mini', totalPoints: 5, mappedMarks: 10, minPages: 2,
    viewport: { w: 1280, h: 800 }, weightThresholds: { fullKB: 1536, partialKB: 4096 } },
  topic: { keywords: [], sectionHints: [], spellWhitelist: [], logoHints: [], locationHints: [] },
  sections: [
    { id: 's', title: 'Styling', points: 5, items: [
      { id: 'w', label: 'Page weight', check: 'pageWeight', mode: 'auto', scope: 'home', max: 5 } ] },
    { id: 'r', title: 'Requirements', items: [
      { id: 'req-email', label: 'Email link present', check: 'emailLink', scope: 'site', required: true } ] } ],
  deductions: []
};

const makeSheet = () => app.page.evaluate(async ({ site, cfg }) => {
  const sub = await Automarker.submissionFromTexts('alice', site);
  const analysis = await Automarker.analyzeSubmission(sub);
  return Automarker.scoring.scoreSubmission({ submission: sub, ...analysis }, cfg);
}, { site: SITE, cfg: CFG });

test('setLateDays subtracts 1.5 marks per day from the mapped mark, clamped at 0', async () => {
  const r = await app.page.evaluate(async ({ site, cfg }) => {
    const sub = await Automarker.submissionFromTexts('alice', site);
    const analysis = await Automarker.analyzeSubmission(sub);
    const sheet = await Automarker.scoring.scoreSubmission({ submission: sub, ...analysis }, cfg);
    const base = sheet.mappedMark;
    Automarker.scoring.setLateDays(sheet, cfg, 2);
    const late2 = sheet.mappedMark;
    Automarker.scoring.setLateDays(sheet, cfg, 40);
    const clamped = sheet.mappedMark;
    Automarker.scoring.setLateDays(sheet, cfg, 0);
    return { base, late2, clamped, back: sheet.mappedMark, days: sheet.lateDays };
  }, { site: SITE, cfg: CFG });
  assert.equal(r.late2, Math.max(0, r.base - 3), '2 days → −3 marks');
  assert.equal(r.clamped, 0, 'penalty never takes the mark below 0');
  assert.equal(r.back, r.base, 'clearing lateDays restores the mark');
  assert.equal(r.days, 0);
});

test('feedbackText is a tab-separated criteria/mark/comments table', async () => {
  const text = await app.page.evaluate(async ({ site, cfg }) => {
    const sub = await Automarker.submissionFromTexts('alice', site);
    const analysis = await Automarker.analyzeSubmission(sub);
    const sheet = await Automarker.scoring.scoreSubmission({ submission: sub, ...analysis }, cfg);
    return Automarker.exporter.feedbackText(
      { name: 'alice', sheet, notes: { s: 'Tighten your CSS.', r: 'See the contact page brief.' } }, cfg);
  }, { site: SITE, cfg: CFG });
  const rows = text.split('\n');
  assert.equal(rows[0], 'alice');
  assert.equal(rows[1], 'Mini');
  assert.equal(rows[2], 'Criteria\tMark\tComments', 'header row for Excel columns');
  assert.ok(rows.includes('Styling\t5/5\tTighten your CSS.'),
    'section row: subtotal in Mark, note in Comments');
  assert.match(text, /\nPage weight\t5\/5\t/, 'every criterion gets a row, even full marks');
  assert.ok(rows.includes('Requirements\t0/1 met\tSee the contact page brief.'));
  assert.match(text, /\nEmail link present\t✗\t/, 'unmet required rows marked ✗');
  assert.ok(!rows.some(r => r.startsWith('Deductions')), 'no deductions → no deductions rows');
  assert.match(text, /\nTotal\t\d+(\.\d+)?\/10 \(5\/5 points · 100\/100\)\t$/,
    'the Total row closes the table');
  assert.ok(!rows.some(r => r.startsWith('Requirements met')),
    'no requirements-met summary row');
});

test('feedbackText sanitises cells: no tabs/newlines/leading formula chars from notes', async () => {
  const text = await app.page.evaluate(async ({ site, cfg }) => {
    const sub = await Automarker.submissionFromTexts('alice', site);
    const analysis = await Automarker.analyzeSubmission(sub);
    const sheet = await Automarker.scoring.scoreSubmission({ submission: sub, ...analysis }, cfg);
    return Automarker.exporter.feedbackText(
      { name: 'alice', sheet, notes: { s: '=SUM(A1)\tevil\nnote' } }, cfg);
  }, { site: SITE, cfg: CFG });
  const cell = text.split('\n').find(r => r.startsWith('Styling\t')).split('\t')[2];
  assert.ok(!cell.startsWith('='), 'leading = neutralised against formula injection');
  assert.ok(!/[\t\n]/.test(cell), 'tabs/newlines inside a cell are flattened');
  assert.ok(cell.includes('evil') && cell.includes('note'), 'content preserved');
});

test('feedbackText includes the late penalty line only when set', async () => {
  const { withLate, without } = await app.page.evaluate(async ({ site, cfg }) => {
    const sub = await Automarker.submissionFromTexts('alice', site);
    const analysis = await Automarker.analyzeSubmission(sub);
    const sheet = await Automarker.scoring.scoreSubmission({ submission: sub, ...analysis }, cfg);
    const without = Automarker.exporter.feedbackText({ name: 'alice', sheet }, cfg);
    Automarker.scoring.setLateDays(sheet, cfg, 2);
    const withLate = Automarker.exporter.feedbackText({ name: 'alice', sheet }, cfg);
    return { withLate, without };
  }, { site: SITE, cfg: CFG });
  assert.ok(!/[Ll]ate/.test(without));
  assert.match(withLate, /\nLate\t2 day\(s\)\t−3 marks/);
});

test('feedbackText shows the /100 view: overall percent and section shares', async () => {
  const text = await app.page.evaluate(async ({ site, cfg }) => {
    const sub = await Automarker.submissionFromTexts('alice', site);
    const analysis = await Automarker.analyzeSubmission(sub);
    const sheet = await Automarker.scoring.scoreSubmission({ submission: sub, ...analysis }, cfg);
    Automarker.scoring.applyOverride(sheet, cfg, 'w', 3);
    return Automarker.exporter.feedbackText({ name: 'alice', sheet }, cfg);
  }, { site: SITE, cfg: CFG });
  assert.match(text, /\nTotal\t6\/10 \(3\/5 points · 60\/100\)\t/, '3/5 points → 60/100 in the total row');
  assert.match(text, /\nStyling\t3\/5\t/, 'section row keeps the raw score');
  assert.match(text, /\nPage weight\t3\/5\t/, 'imperfect criterion row carries its mark');
});

test('CSV carries a lateDays column', async () => {
  const csv = await app.page.evaluate(async ({ site, cfg }) => {
    const sub = await Automarker.submissionFromTexts('alice', site);
    const analysis = await Automarker.analyzeSubmission(sub);
    const sheet = await Automarker.scoring.scoreSubmission({ submission: sub, ...analysis }, cfg);
    Automarker.scoring.setLateDays(sheet, cfg, 1);
    return Automarker.exporter.toCSV([{ name: 'alice', sheet }], cfg);
  }, { site: SITE, cfg: CFG });
  const [head, row] = csv.trim().split('\n');
  const cols = head.split(','), idx = cols.indexOf('lateDays');
  assert.ok(idx >= 0, `lateDays column missing: ${head}`);
  assert.equal(row.split(',')[idx], '1');
});
