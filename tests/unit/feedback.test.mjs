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

test('feedbackText matches the efeedback format exactly', async () => {
  const text = await app.page.evaluate(async ({ site, cfg }) => {
    const sub = await Automarker.submissionFromTexts('alice', site);
    const analysis = await Automarker.analyzeSubmission(sub);
    const sheet = await Automarker.scoring.scoreSubmission({ submission: sub, ...analysis }, cfg);
    return Automarker.exporter.feedbackText(
      { name: 'alice', sheet, notes: { s: 'Tighten your CSS.', r: 'See the contact page brief.' } }, cfg);
  }, { site: SITE, cfg: CFG });
  assert.equal(text, [
    'Styling (5/5)',
    'Tighten your CSS.',
    'Requirements (0/1 met)',
    ' - Email link present: not met',
    'See the contact page brief.',
    '',
    'Total: 10/10 (5/5 points · 100/100)',
    'Requirements: 0/1 met',
  ].join('\n'));
});

test('feedbackText omits fully-met sections; clean sheet says so', async () => {
  const text = await app.page.evaluate(async ({ site, cfg }) => {
    const sub = await Automarker.submissionFromTexts('alice', site);
    const analysis = await Automarker.analyzeSubmission(sub);
    const sheet = await Automarker.scoring.scoreSubmission({ submission: sub, ...analysis }, cfg);
    Automarker.scoring.applyOverride(sheet, cfg, 'req-email', true);
    return Automarker.exporter.feedbackText({ name: 'alice', sheet }, cfg);
  }, { site: SITE, cfg: CFG });
  assert.equal(text, [
    'All rubric criteria met.',
    '',
    'Total: 10/10 (5/5 points · 100/100)',
    'Requirements: 1/1 met',
  ].join('\n'));
});

test('feedbackText leads with the AI-usage banner when indicators fired', async () => {
  const { flagged, clean } = await app.page.evaluate(async ({ site, cfg }) => {
    const sub = await Automarker.submissionFromTexts('alice', site);
    const analysis = await Automarker.analyzeSubmission(sub);
    const sheet = await Automarker.scoring.scoreSubmission({ submission: sub, ...analysis }, cfg);
    const authorship = { level: 'strong', checked: 13,
      signals: Array.from({ length: 7 }, (_, i) => ({ id: `s${i}`, label: 'x', detail: 'y' })) };
    return {
      flagged: Automarker.exporter.feedbackText({ name: 'a', sheet, authorship }, cfg),
      clean: Automarker.exporter.feedbackText(
        { name: 'a', sheet, authorship: { level: 'none', checked: 13, signals: [] } }, cfg),
    };
  }, { site: SITE, cfg: CFG });
  assert.match(flagged, /^AI Usage observed - mark tentative\n\n/, 'banner heads the output');
  assert.ok(!/AI Usage/.test(clean), 'no banner when no indicators');
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
  assert.match(withLate, /\nLate: 2 day\(s\), −3 marks\n/);
});

test('feedbackText shows the /100 view: overall percent and section shares', async () => {
  const text = await app.page.evaluate(async ({ site, cfg }) => {
    const sub = await Automarker.submissionFromTexts('alice', site);
    const analysis = await Automarker.analyzeSubmission(sub);
    const sheet = await Automarker.scoring.scoreSubmission({ submission: sub, ...analysis }, cfg);
    Automarker.scoring.applyOverride(sheet, cfg, 'w', 3);
    return Automarker.exporter.feedbackText({ name: 'alice', sheet }, cfg);
  }, { site: SITE, cfg: CFG });
  assert.match(text, /\nTotal: 6\/10 \(3\/5 points · 60\/100\)\n/, '3/5 points → 60/100 in the total line');
  assert.match(text, /Styling \(3\/5\)\n - Page weight: 3\/5/, 'imperfect criterion listed under its section');
});

test('resetSection restores a section to its automated state, leaving others alone', async () => {
  const r = await app.page.evaluate(async ({ site, cfg }) => {
    const sub = await Automarker.submissionFromTexts('alice', site);
    const analysis = await Automarker.analyzeSubmission(sub);
    const sheet = await Automarker.scoring.scoreSubmission({ submission: sub, ...analysis }, cfg);
    Automarker.scoring.applyOverride(sheet, cfg, 'w', 1);
    Automarker.scoring.applyOverride(sheet, cfg, 'req-email', true);
    const overridden = { w: sheet.items.find(i => i.id === 'w').final,
      email: sheet.items.find(i => i.id === 'req-email').passed };
    Automarker.scoring.resetSection(sheet, cfg, 's');
    const w = sheet.items.find(i => i.id === 'w');
    const email = sheet.items.find(i => i.id === 'req-email');
    return { overridden, wFinal: w.final, wAuto: w.auto, wFlag: w.overridden,
      emailPassed: email.passed, emailFlag: email.overridden, total: sheet.total };
  }, { site: SITE, cfg: CFG });
  assert.equal(r.overridden.w, 1);
  assert.equal(r.overridden.email, true);
  assert.equal(r.wFinal, r.wAuto, 'score restored to the automated value');
  assert.equal(r.wFlag, false, 'overridden flag cleared');
  assert.equal(r.emailPassed, true, 'other sections keep their overrides');
  assert.equal(r.emailFlag, true);
  assert.equal(r.total, r.wAuto, 'totals recomputed');
});

test('resetDeductions restores confirmation state per deduction mode', async () => {
  const r = await app.page.evaluate(async site => {
    const cfg = { meta: { id: 'm', title: 'M', totalPoints: 5, minPages: 1,
        viewport: { w: 1280, h: 800 }, weightThresholds: { fullKB: 1536, partialKB: 4096 } },
      topic: { keywords: [], sectionHints: [], spellWhitelist: [], logoHints: [], locationHints: [] },
      sections: [{ id: 's', title: 'S', points: 5, items: [
        { id: 'w', label: 'weight', check: 'pageWeight', mode: 'auto', scope: 'home', max: 5 } ] }],
      deductions: [{ id: 'spelling', label: 'sp', perInstance: -1, check: 'spelling', mode: 'assisted' }] };
    const sub = await Automarker.submissionFromTexts('t', site);
    const analysis = await Automarker.analyzeSubmission(sub);
    const sheet = await Automarker.scoring.scoreSubmission({ submission: sub, ...analysis }, cfg);
    Automarker.scoring.setDeductionConfirmed(sheet, cfg, 'spelling', 0, true);
    const before = sheet.total;
    Automarker.scoring.resetDeductions(sheet, cfg);
    return { before, after: sheet.total,
      confirmed: sheet.deductions[0].instances.map(i => i.confirmed) };
  }, { 'index.html': '<p>simply teh best</p>' });
  assert.ok(r.before < r.after, 'confirming a spelling deduction lowered the total');
  assert.ok(r.confirmed.every(c => c === false), 'assisted instances back to unconfirmed');
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
