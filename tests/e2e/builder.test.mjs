import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchApp } from '../helpers/harness.mjs';

let app;
before(async () => { app = await launchApp(); });
after(async () => { await app.close(); });

test('builder edits config via JSON pane and applies as a custom rubric', async () => {
  const { page: p } = app;
  await p.click('[data-testid="open-builder"]');
  await p.waitForSelector('#builder-modal:not([hidden])');
  const cfg = JSON.parse(await p.inputValue('[data-testid="builder-json"]'));
  assert.equal(cfg.meta.id, 'cse1iit-2026s2');
  cfg.meta.minPages = 4;
  cfg.sections = cfg.sections.slice(0, 1);           // nav section only
  cfg.sections[0].points = 20;                        // 5 + 5×(4−1)
  cfg.meta.totalPoints = 20;
  await p.fill('[data-testid="builder-json"]', JSON.stringify(cfg, null, 2));
  await p.click('[data-testid="builder-validate"]');
  assert.match(await p.textContent('[data-testid="builder-errors"]'), /valid/i);
  p.once('dialog', d => d.accept());
  await p.click('[data-testid="builder-apply"]');
  const applied = await p.evaluate(() => Automarker.state.config.meta.id);
  assert.equal(applied, 'cse1iit-2026s2-custom');
  const sel = await p.inputValue('[data-testid="rubric-select"]');
  assert.equal(sel, 'cse1iit-2026s2-custom');
});

test('builder add-item form appends to the JSON', async () => {
  const { page: p } = app;
  await p.click('[data-testid="open-builder"]');
  await p.selectOption('[data-testid="builder-add"] select[name="check"]', 'emailLink');
  await p.selectOption('[data-testid="builder-add"] select[name="scope"]', 'site');
  await p.fill('[data-testid="builder-add"] input[name="points"]', '');   // requirement
  await p.click('[data-testid="builder-add"] button');
  const cfg = JSON.parse(await p.inputValue('[data-testid="builder-json"]'));
  const added = cfg.sections.flatMap(s => s.items).find(i => i.check === 'emailLink');
  assert.ok(added); assert.equal(added.required, true);
});

test('invalid JSON reports errors and does not apply', async () => {
  const { page: p } = app;
  await p.click('[data-testid="open-builder"]');
  await p.fill('[data-testid="builder-json"]', '{"meta":{}}');
  await p.click('[data-testid="builder-apply"]');
  assert.match(await p.textContent('[data-testid="builder-errors"]'), /required/);
  const id = await p.evaluate(() => Automarker.state.config.meta.id);
  assert.notEqual(id, undefined);
});
