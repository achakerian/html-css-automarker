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

test('feedbackText is concise: mark line, imperfect rows only, notes appended per section', async () => {
  const text = await app.page.evaluate(async ({ site, cfg }) => {
    const sub = await Automarker.submissionFromTexts('alice', site);
    const analysis = await Automarker.analyzeSubmission(sub);
    const sheet = await Automarker.scoring.scoreSubmission({ submission: sub, ...analysis }, cfg);
    return Automarker.exporter.feedbackText(
      { name: 'alice', sheet, notes: { s: 'Tighten your CSS.', r: 'See the contact page brief.' } }, cfg);
  }, { site: SITE, cfg: CFG });
  assert.match(text, /alice — Mini/);
  assert.match(text, /Mark: \d+(\.\d+)?\/10/);
  assert.match(text, /Styling \(5\/5 · 100\/100\)/, 'scored section header carries the score and /100 share');
  assert.ok(!/Page weight/.test(text), 'full-mark rows are not listed — concise output');
  assert.match(text, /Requirements \(0\/1 met\)/);
  assert.match(text, /✗ Email link present/, 'unmet required rows are listed');
  const sIdx = text.indexOf('Styling'), note1 = text.indexOf('Tighten your CSS.');
  const rIdx = text.indexOf('Requirements ('), note2 = text.indexOf('See the contact page brief.');
  assert.ok(sIdx < note1 && note1 < rIdx, 'section note sits inside its own section');
  assert.ok(rIdx < note2, 'second note follows its section');
  assert.match(text, /Deductions: none/);
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
  assert.match(text, /Overall: 60\/100/, '3/5 points → 60/100');
  assert.match(text, /Styling \(3\/5 · 60\/100\)/, 'scored section header carries its /100 share');
  assert.ok(!/Requirements \(0\/1 met\).*100/.test(text), 'point-less sections get no /100 share');
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
