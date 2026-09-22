import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchApp } from '../helpers/harness.mjs';

let app;
before(async () => { app = await launchApp(); });
after(async () => { await app.close(); });

test('both presets validate cleanly and every check exists', async () => {
  const r = await app.page.evaluate(() => ({
    ids: Object.keys(Automarker.presets),
    errs: Object.values(Automarker.presets).map(p => Automarker.Config.validate(p)),
    active: Automarker.state.config?.meta.id,
    missing: Object.values(Automarker.presets).flatMap(p =>
      [...p.sections.flatMap(s => s.items), ...p.deductions]
        .filter(i => !Automarker.checks[i.check]).map(i => i.check))
  }));
  assert.deepEqual(r.ids.sort(), ['cse1iit-2026s2', 'iwbs001-a2']);
  assert.deepEqual(r.errs, [[], []]);
  assert.equal(r.active, 'cse1iit-2026s2');
  assert.deepEqual(r.missing, []);
});

test('CSE1IIT expanded points equal 113 (30/23/60); Part A sections score 0', async () => {
  const pts = await app.page.evaluate(() => {
    const c = Automarker.presets['cse1iit-2026s2'];
    const exp = s => Automarker.Config.expandedSectionPoints(s, c.meta);
    return { a: c.sections.filter(s => s.id.startsWith('a')).map(exp),
             b: c.sections.filter(s => !s.id.startsWith('a')).map(exp) };
  });
  assert.deepEqual(pts.b, [30, 23, 60]);
  assert.equal(pts.a.length, 8);
  assert.ok(pts.a.every(x => !x), `Part A must expand to 0 points, got ${pts.a}`);
});

test('validator catches unknown checks, bad scopes, duplicate ids, wrong totals', async () => {
  const errs = await app.page.evaluate(() => {
    const bad = {
      meta: { id: 'x', title: 'x', totalPoints: 10, minPages: 3 },
      topic: {},
      sections: [{ id: 's', title: 's', points: 9, items: [
        { id: 'a', label: 'a', check: 'noSuchCheck', scope: 'home', max: 5 },
        { id: 'a', label: 'dup', check: 'navBar', scope: 'sideways', max: 4 },
        { id: 'b', label: 'both forms', check: 'navBar', scope: 'home', max: 2, required: true } ] }],
      deductions: [{ id: 'd', label: 'd', check: 'spelling' }]
    };
    return Automarker.Config.validate(bad);
  });
  assert.ok(errs.some(e => /noSuchCheck/.test(e)));
  assert.ok(errs.some(e => /scope/.test(e)));
  assert.ok(errs.some(e => /duplicate/i.test(e)));
  assert.ok(errs.some(e => /max.*required|exactly one/i.test(e)));
  assert.ok(errs.some(e => /perInstance|flat/.test(e)));
  assert.ok(errs.some(e => /points/.test(e)));
});

test('config JSON round-trips', async () => {
  const same = await app.page.evaluate(() => {
    const c = Automarker.presets['iwbs001-a2'];
    return JSON.stringify(c) === JSON.stringify(JSON.parse(JSON.stringify(c)));
  });
  assert.equal(same, true);
});
