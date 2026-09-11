import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchApp, snapshotFor } from '../helpers/harness.mjs';

let app;
before(async () => { app = await launchApp(); });
after(async () => { await app.close(); });

const STYLED = {
  'index.html': `<html><head><style>
    body { margin:0; font-family: Verdana, sans-serif; background:#f4f6f8; }
    main { max-width: 900px; margin: 0 auto; padding: 24px; }
    section { margin-bottom: 32px; background:#ffffff; }
    h1 { color: #14406b; } p { font-size:16px; color:#222222; }
    .accent { background:#e67e22; height:120px; }
    @media (max-width: 500px) { main { max-width: 100%; } }
  </style></head><body><main>
    <h1>Title</h1>
    <section><p>Readable paragraph text for measurement purposes, long enough to be the main block.</p></section>
    <section class="accent"></section>
  </main></body></html>`
};
const UNSTYLED = { 'index.html': '<html><body><p>plain default page</p></body></html>' };
const OVERFLOW = { 'index.html': '<html><body><div style="width:2000px;height:50px;background:#333">wide</div></body></html>' };

test('palette, typography, spacing on a styled page', async () => {
  const s = await snapshotFor(app.page, STYLED, 'index.html');
  assert.equal(s.palette.nonDefault, true);
  assert.ok(s.palette.colors.length >= 3);
  assert.ok(s.palette.distinctHues >= 1 && s.palette.distinctHues <= 6);
  assert.ok(s.typography.families.includes('verdana'));
  assert.equal(s.typography.defaultFontOnly, false);
  assert.ok(s.typography.bodySizePx >= 15 && s.typography.bodySizePx <= 17);
  assert.ok(s.typography.contrastRatio > 7);
  assert.ok(s.spacing.contentWidthRatio > 0.5 && s.spacing.contentWidthRatio <= 0.75);
  assert.equal(s.spacing.horizontalOverflow, false);
  assert.ok(s.spacing.insetLeft > 100);            // centred 900px in 1280 viewport
  assert.ok(s.spacing.sectionGapAvg >= 8);
});

test('unstyled page reads as default', async () => {
  const s = await snapshotFor(app.page, UNSTYLED, 'index.html');
  assert.equal(s.palette.nonDefault, false);
  assert.equal(s.typography.defaultFontOnly, true);
});

test('responsive measurements detect fixed-width overflow at narrow widths', async () => {
  const s = await snapshotFor(app.page, OVERFLOW, 'index.html');
  assert.deepEqual(s.responsive.map(r => r.w), [1280, 768, 375]);
  assert.equal(s.responsive[0].horizontalOverflow, true);
  assert.equal(s.responsive[2].horizontalOverflow, true);
});

test('colour utils', async () => {
  const r = await app.page.evaluate(() => [
    Automarker.util.parseRgb('rgb(255, 0, 0)'),
    Automarker.util.rgbToHsl(255, 0, 0).h,
    Math.round(Automarker.util.contrast({r:0,g:0,b:0}, {r:255,g:255,b:255}))
  ]);
  assert.deepEqual(r[0], { r: 255, g: 0, b: 0, a: 1 });
  assert.equal(r[1], 0);
  assert.equal(r[2], 21);
});
