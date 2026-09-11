import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchApp } from '../helpers/harness.mjs';

let app;
before(async () => { app = await launchApp(); });
after(async () => { await app.close(); });

test('Automarker namespace and utils exist', async () => {
  const r = await app.page.evaluate(() => ({
    ns: typeof window.Automarker,
    roundtrip: Automarker.util.decodeText(Automarker.util.b64ToBytes(Automarker.util.bytesToB64(new TextEncoder().encode('héllo')))),
    round1: Automarker.util.round1(2.649),
    clamp: Automarker.util.clamp(7, 0, 5)
  }));
  assert.equal(r.ns, 'object');
  assert.equal(r.roundtrip, 'héllo');
  assert.equal(r.round1, 2.6);
  assert.equal(r.clamp, 5);
});
