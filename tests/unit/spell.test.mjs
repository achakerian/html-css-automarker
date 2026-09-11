import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchApp } from '../helpers/harness.mjs';

let app;
before(async () => { app = await launchApp(); });
after(async () => { await app.close(); });

test('wordlist is embedded and usable', async () => {
  const n = await app.page.evaluate(async () => {
    await Automarker.spell.ready(); return Automarker.spell.wordCount(); });
  assert.ok(n > 50000, `only ${n} words — run tools/embed-wordlist.mjs`);
});

test('flags misspellings, accepts inflections, capitals and whitelist', async () => {
  const out = await app.page.evaluate(async () => Automarker.spell.check(
    'The running shoes arrived quickly, but teh delivery was definately fast. ' +
    'Adidas and Nike make sneakers. Our WIFI is free. Prices dropped.',
    { topic: { spellWhitelist: ['sneakers'] } }));
  const words = out.map(o => o.word).sort();
  assert.deepEqual(words, ['definately', 'teh']);
});

test('skips contractions (straight and curly apostrophes), still catches real misspellings', async () => {
  const out = await app.page.evaluate(async () => Automarker.spell.check(
    'It is not very good; we\'re sad the item wasn’t right and the shoes don\'t fit well. ' +
    'Sizing was definately bad.',
    {}));
  const words = out.map(o => o.word).sort();
  assert.deepEqual(words, ['definately']);
});
