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

test('feedbackText is clean: name/title header, dashed criteria, notes in place, total at end', async () => {
  const text = await app.page.evaluate(async ({ site, cfg }) => {
    const sub = await Automarker.submissionFromTexts('alice', site);
    const analysis = await Automarker.analyzeSubmission(sub);
    const sheet = await Automarker.scoring.scoreSubmission({ submission: sub, ...analysis }, cfg);
    return Automarker.exporter.feedbackText(
      { name: 'alice', sheet, notes: { s: 'Tighten your CSS.', r: 'See the contact page brief.' } }, cfg);
  }, { site: SITE, cfg: CFG });
  assert.match(text, /^alice\nMini\n/, 'name and rubric title head the output');
  assert.match(text, /Styling \(5\/5\)\nTighten your CSS\./, 'noted section appears even at full marks');
  assert.ok(!/Page weight/.test(text), 'full-mark rows are not listed');
  assert.match(text, /Requirements \(0\/1 met\)\n - Email link present: not met/,
    'unmet required rows are dashed criteria lines');
  const rIdx = text.indexOf('Requirements ('), note2 = text.indexOf('See the contact page brief.');
  assert.ok(rIdx >= 0 && rIdx < note2, 'second note follows its section');
  assert.ok(!/Deductions/.test(text), 'no deductions → no deductions block');
  assert.match(text, /\nTotal: \d+(\.\d+)?\/10 \(5\/5 points · 100\/100\)\nRequirements: 0\/1 met$/,
    'total block closes the output');
});

test('feedbackText omits fully-met sections without notes; clean sheet says so', async () => {
  const text = await app.page.evaluate(async ({ site, cfg }) => {
    const sub = await Automarker.submissionFromTexts('alice', site);
    const analysis = await Automarker.analyzeSubmission(sub);
    const sheet = await Automarker.scoring.scoreSubmission({ submission: sub, ...analysis }, cfg);
    Automarker.scoring.applyOverride(sheet, cfg, 'req-email', true);
    return Automarker.exporter.feedbackText({ name: 'alice', sheet }, cfg);
  }, { site: SITE, cfg: CFG });
  assert.ok(!/Styling/.test(text), 'full-mark section without a note is omitted');
  assert.ok(!/Requirements \(/.test(text), 'fully-met required section is omitted');
  assert.match(text, /All rubric criteria met\./);
  assert.match(text, /Total: 10\/10/);
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
  assert.match(withLate, /Late: 2 day/);
  assert.match(withLate, /−3 marks/);
});

test('feedbackText shows the /100 view: overall percent and section shares', async () => {
  const text = await app.page.evaluate(async ({ site, cfg }) => {
    const sub = await Automarker.submissionFromTexts('alice', site);
    const analysis = await Automarker.analyzeSubmission(sub);
    const sheet = await Automarker.scoring.scoreSubmission({ submission: sub, ...analysis }, cfg);
    Automarker.scoring.applyOverride(sheet, cfg, 'w', 3);
    return Automarker.exporter.feedbackText({ name: 'alice', sheet }, cfg);
  }, { site: SITE, cfg: CFG });
  assert.match(text, /Total: 6\/10 \(3\/5 points · 60\/100\)/, '3/5 points → 60/100 in the total line');
  assert.match(text, /Styling \(3\/5\)\n/, 'section headers stay clean — no /100 share');
  assert.match(text, / - Page weight: 3\/5/, 'imperfect scored rows are dashed criteria');
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
