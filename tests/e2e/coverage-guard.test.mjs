import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { launchApp } from '../helpers/harness.mjs';

let app;
before(async () => { app = await launchApp(); });
after(async () => { await app.close(); });

test('every preset item maps to an existing check; every check is unit-tested', async () => {
  const { checkIds, missing } = await app.page.evaluate(() => {
    const used = Object.values(Automarker.presets).flatMap(p =>
      [...p.sections.flatMap(s => s.items), ...(p.deductions ?? [])].map(i => i.check));
    return { checkIds: Object.keys(Automarker.checks),
             missing: used.filter(c => !Automarker.checks[c]) };
  });
  assert.deepEqual(missing, []);
  const unitSrc = readdirSync('tests/unit').filter(f => f.endsWith('.test.mjs'))
    .map(f => readFileSync(`tests/unit/${f}`, 'utf8')).join('\n');
  const untested = checkIds.filter(id => !unitSrc.includes(`'${id}'`));
  assert.deepEqual(untested, [], `checks without unit coverage: ${untested}`);
});
