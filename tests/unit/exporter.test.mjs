import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchApp } from '../helpers/harness.mjs';

let app;
before(async () => { app = await launchApp(); });
after(async () => { await app.close(); });

const SITE = { 'index.html': '<html><body><a href="a.html">a</a><p>Home, with "quotes"</p></body></html>',
               'a.html': '<p>a</p>' };
const CFG = {
  meta: { id: 'mini', title: 'Mini', totalPoints: 5, mappedMarks: 10, minPages: 2,
    viewport: { w: 1280, h: 800 }, weightThresholds: { fullKB: 1536, partialKB: 4096 } },
  topic: { keywords: [], sectionHints: [], spellWhitelist: [], logoHints: [], locationHints: [] },
  sections: [{ id: 's', title: 'S', points: 5, items: [
    { id: 'w', label: 'weight', check: 'pageWeight', mode: 'auto', scope: 'home', max: 5 } ] }],
  deductions: [{ id: 'broken', label: 'b', perInstance: -2, check: 'brokenResources', mode: 'auto' }]
};

test('CSV has stable columns, quoting, totals and error rows', async () => {
  const csv = await app.page.evaluate(async ({ site, cfg }) => {
    const sub = await Automarker.submissionFromTexts('good, "student"', site);
    const analysis = await Automarker.analyzeSubmission(sub);
    const sheet = await Automarker.scoring.scoreSubmission({ submission: sub, ...analysis }, cfg);
    Automarker.scoring.applyOverride(sheet, cfg, 'w', 3);
    return Automarker.exporter.toCSV(
      [{ name: 'good, "student"', sheet }, { name: 'broken-zip', error: 'Not a zip file' }], cfg);
  }, { site: SITE, cfg: CFG });
  const [head, r1, r2] = csv.trim().split('\n');
  assert.match(head, /^name,"?w:auto"?,"?w:final"?/);
  assert.match(head, /s:score/); assert.match(head, /broken:total/);
  assert.match(head, /overridden,total,mappedMark/);
  assert.match(r1, /^"good, ""student""",/);
  assert.match(r1, /,w,/ , 'overridden column lists row id w');
  assert.match(r2, /broken-zip.*Not a zip file/);
});

test('CSV neutralises formula-injection-prone names', async () => {
  const csv = await app.page.evaluate(async ({ site, cfg }) => {
    const sub = await Automarker.submissionFromTexts('=SUM(A1:A9)', site);
    const analysis = await Automarker.analyzeSubmission(sub);
    const sheet = await Automarker.scoring.scoreSubmission({ submission: sub, ...analysis }, cfg);
    return Automarker.exporter.toCSV([{ name: '=SUM(A1:A9)', sheet }], cfg);
  }, { site: SITE, cfg: CFG });
  const [, r1] = csv.trim().split('\n');
  const firstCell = r1.split(',')[0];
  assert.ok(!firstCell.startsWith('='), `first cell must not start with '=': ${firstCell}`);
  assert.equal(firstCell, "'=SUM(A1:A9)");
});

test('feedback report contains labels, scores and evidence', async () => {
  const html = await app.page.evaluate(async ({ site, cfg }) => {
    const sub = await Automarker.submissionFromTexts('alice', site);
    const analysis = await Automarker.analyzeSubmission(sub);
    const sheet = await Automarker.scoring.scoreSubmission({ submission: sub, ...analysis }, cfg);
    return Automarker.exporter.feedbackHTML({ name: 'alice', sheet }, cfg);
  }, { site: SITE, cfg: CFG });
  assert.match(html, /alice/); assert.match(html, /Mini/);
  assert.match(html, /weight/); assert.match(html, /KB total/);
});
