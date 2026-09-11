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

test('rejects corrupt central directory', async () => {
  const buf = buildZip([{ path: 'test.txt', data: 'hello' }]);
  const corrupted = Buffer.from(buf);
  // Flip the central directory signature in the EOCD (offset 16-19 from EOCD start)
  // EOCD is at end: look for 0x06054b50 and corrupt the cd_offset after it
  const eocdPos = corrupted.length - 22;
  // Corrupt cd_offset field at offset 16 within EOCD
  corrupted.writeUInt32LE(0xffffffff, eocdPos + 16);
  await assert.rejects(
    app.page.evaluate(async b64 =>
      Automarker.ZipReader.read(Automarker.util.b64ToBytes(b64)),
      corrupted.toString('base64')),
    /Corrupt/);
});

test('rejects unsupported compression method', async () => {
  const buf = buildZip([{ path: 'test.txt', data: 'hello' }]);
  const corrupted = Buffer.from(buf);
  // Find and patch compression method field
  // Local header signature is at position 0: 0x04034b50
  // Compression method is at offset 8 (2 bytes, little-endian)
  corrupted.writeUInt16LE(99, 8);
  // Central directory signature is typically right after the data
  // It has the method at offset 10 within the CD record
  // Find CD record by searching for 0x02014b50
  for (let i = 0; i < corrupted.length - 4; i++) {
    if (corrupted.readUInt32LE(i) === 0x02014b50) {
      corrupted.writeUInt16LE(99, i + 10);
      break;
    }
  }
  await assert.rejects(
    app.page.evaluate(async b64 =>
      Automarker.ZipReader.read(Automarker.util.b64ToBytes(b64)),
      corrupted.toString('base64')),
    /Unsupported/);
});
