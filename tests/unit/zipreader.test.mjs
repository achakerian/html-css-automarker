import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchApp } from '../helpers/harness.mjs';
import { buildZip } from '../helpers/zipwrite.mjs';

let app;
before(async () => { app = await launchApp(); });
after(async () => { await app.close(); });

const readZip = (buf) => app.page.evaluate(async b64 => {
  const files = await Automarker.ZipReader.read(Automarker.util.b64ToBytes(b64));
  return [...files.entries()].map(([p, d]) => [p, Automarker.util.decodeText(d)]);
}, buf.toString('base64'));

test('reads stored and deflated entries', async () => {
  const stored = await readZip(buildZip([{ path: 'a.html', data: '<p>hi</p>' }], { store: true }));
  const deflated = await readZip(buildZip([{ path: 'css/site.css', data: 'p{color:red}' }]));
  assert.deepEqual(stored, [['a.html', '<p>hi</p>']]);
  assert.deepEqual(deflated, [['css/site.css', 'p{color:red}']]);
});

test('strips junk and a single nested root folder', async () => {
  const out = await readZip(buildZip([
    { path: 'mysite/index.html', data: 'x' },
    { path: 'mysite/img/logo.svg', data: 'y' },
    { path: '__MACOSX/mysite/._index.html', data: 'junk' },
    { path: 'mysite/.DS_Store', data: 'junk' }
  ]));
  assert.deepEqual(out.map(e => e[0]).sort(), ['img/logo.svg', 'index.html']);
});

test('keeps multi-root zips as-is and normalises backslashes', async () => {
  const out = await readZip(buildZip([
    { path: 'index.html', data: 'x' }, { path: 'sub\\about.html', data: 'y' }
  ]));
  assert.deepEqual(out.map(e => e[0]).sort(), ['index.html', 'sub/about.html']);
});

test('rejects non-zip data', async () => {
  await assert.rejects(
    app.page.evaluate(() => Automarker.ZipReader.read(new Uint8Array([1, 2, 3, 4])) ),
    /Not a zip/);
});
