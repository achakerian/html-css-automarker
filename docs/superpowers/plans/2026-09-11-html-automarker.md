# HTML/CSS Submission Automarker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A single self-contained `index.html` (GitHub Pages-hostable) that unzips HTML/CSS submissions in-browser, renders each page in a sandboxed iframe, auto-scores them against a JSON rubric config (two built-in presets: CSE1IIT points rubric, IWBS001 requirements checklist), with assisted confirmation for semantic items, overrides, CSV/feedback exports, and a rubric builder.

**Architecture:** All application code lives in labelled inline `<script id="module-*">` blocks in `index.html` under one `window.Automarker` namespace — no build step, no external requests. Tests run via Node's `node:test` + Playwright headless Chromium against a tiny local static server; unit tests drive `Automarker.*` APIs in-page via `page.evaluate`, e2e tests push generated fixture zips through the real pipeline.

**Tech Stack:** Vanilla ES2022 JS/HTML/CSS; native `DecompressionStream` (zip inflate + wordlist gunzip); Node ≥ 20; Playwright (devDependency only); no runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-09-11-html-automarker-design.md`

## Global Constraints

- Deliverable is ONE file: `index.html`. No CDN, no fetch to any host, no build step. The only generated content is the wordlist injected once by `tools/embed-wordlist.mjs`.
- Submission JavaScript must NEVER execute: every submission iframe uses exactly `sandbox="allow-same-origin"` (no `allow-scripts`).
- All public APIs hang off `window.Automarker` (alias `A` inside modules). Tests depend on the exact names in each task's Interfaces block — do not rename.
- All PageSnapshot / CheckResult / ScoreSheet objects must be JSON-serialisable (no DOM nodes, no functions) so `page.evaluate` can return them.
- Rubric maths: scored item = `clamp(round(max × Σ(weight·pass)/Σweight), 0, max)`; requirement item passes iff weighted fraction ≥ `params.threshold ?? 1`; `mappedMark = max(0, round1(total/totalPoints × mappedMarks))`.
- CSE1IIT preset totals MUST be exactly: nav 30, home 23, sub-pages 60, total 113 → 30 marks, deductions spelling −1/instance (confirmed only), broken −2/instance, < 6 pages −15.
- Every commit message is plain conventional style (`feat: …`, `test: …`); NO `Co-Authored-By` or other attribution trailers (user rule).
- Run tests with `npm test` (= `node --test tests/`). Every task ends with the full suite green.
- Node/browser floor: Chromium ≥ 120 behaviour is the target; do not add polyfills.

## Repository layout (end state)

```
index.html                   # the tool — all modules inline
README.md                    # usage + rubric authoring guide
LICENSE                      # MIT
package.json                 # devDeps: playwright; scripts.test
tools/embed-wordlist.mjs     # one-time wordlist injection
tests/helpers/harness.mjs    # static server + browser launch + in-page helpers
tests/helpers/zipwrite.mjs   # minimal zip WRITER (test-side) + crc32
tests/fixtures/sites.mjs     # generated fixture sites (alpha…foxtrot)
tests/unit/*.test.mjs        # per-module and per-check tests (one file per check family)
tests/e2e/*.test.mjs         # full-pipeline fixture tests + coverage guard
```

## Shared type reference (used by every task; do not deviate)

```js
// Submission (in-page, NOT serialisable — files hold Uint8Array)
Submission = { name, files: Map<path,Uint8Array>, lowerIndex: Map<lowerPath,path>,
               pages: [{path, html}], homePath, subPagePaths: [path], errors: [string] }

// PageSnapshot (serialisable) — produced by Automarker.analyzePage
PageSnapshot = {
  path, title, viewport: {w,h}, docHeight, weightBytes,
  nav: { hasNavElement, styledSignals, linkTargets: [path] },
  links: [{raw, resolved, internal, external, mailto, targetExists, text, inNav, y}],
  images: [{raw, ok, external, isGif, naturalW, naturalH, displayW, displayH, alt, x, y, linkTarget}],  // linkTarget = resolved href of enclosing <a>, or null
  media: { videos, iframes, gifs, audio },
  palette: { colors: [{r,g,b,h,s,l,area}], distinctHues, highSatHues, nonDefault },
  typography: { families: [string], defaultFontOnly, bodySizePx, contrastRatio },
  spacing: { insetLeft, insetRight, contentWidthRatio, horizontalOverflow, sectionGapAvg },
  structure: { sectionCount, headings: {h1,h2,h3,h4,h5,h6}, semanticTags: [string] },
  text: { visibleText, wordCount },
  anchors: [{href, y, targetY, text}],          // in-page # anchors
  inlineStyles: { count, tags: [tagName] },
  responsive: [{w, horizontalOverflow, contentWidthRatio}],
  css: { external: [path], externalLinkedHere: bool,
         rules: [{origin: 'external'|'embedded', source, selector, props: [name], kinds: [Kind], matches: bool}],
         inline: [{tag, props: [name]}] },
  brokenAssets: [{kind: 'img'|'css'|'media'|'link', url}],
  externalRefs: [{kind, url}]
}
// Kind ∈ pFormat|classGeneric|classScoped|headingStyle|hoverAnchor|group|contextual|
//         idOnHeading|buttonStyle|flexbox|positioning|bodyStyle|headerStyle|footerStyle

// CheckResult (serialisable) — returned by every Automarker.checks.<id>(ctx)
// ctx = { snapshot?, snapshots: {path: PageSnapshot}, submission?, config, params }
CheckResult = { subResults: [{id, label, pass: 0..1, weight}],
                evidence: [{level: 'pass'|'fail'|'info', text}],
                needsReview?: bool,
                instances?: [{text, page?}] }   // per-instance deduction checks only

// ScoreSheet (serialisable) — produced by Automarker.scoring.scoreSubmission
ScoreSheet = {
  configId,
  items: [{ id, sectionId, label, mode, scope, check, max?, required?,
            auto, final, overridden, passed?, needsReview,
            evidence: [{level,text}], perPage?: [{path, score, evidence}] }],
  sections: [{id, title, points?, score, reqTotal, reqMet}],
  deductions: [{id, label, perInstance?, flat?, instances: [{text, page?, confirmed, points}], total}],
  totalPoints, total, mappedMark, requirementsTotal, requirementsMet
}

// StudentRecord (in Automarker.state.records)
StudentRecord = { name, submission?, snapshots?, sheet?, error? }
```

---

### Task 1: Scaffold — repo, test harness, index.html skeleton

**Files:**
- Create: `package.json`, `LICENSE`, `README.md`, `index.html`
- Create: `tests/helpers/harness.mjs`, `tests/helpers/zipwrite.mjs`
- Test: `tests/unit/scaffold.test.mjs`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `startServer(root)`, `launchApp()` → `{page, browser, close}`, `svg(w,h,fill)`, `buildZip(entries, {store})`, `crc32(buf)` from helpers; `window.Automarker` namespace with `util.{b64ToBytes, bytesToB64, decodeText, gunzip, round1, clamp}`; empty `<script id="module-*">` blocks that later tasks fill via Edit (anchors: `<script id="module-zip"></script>` etc.).

- [ ] **Step 1: package.json, LICENSE, README stub**

`package.json`:
```json
{
  "name": "html-css-automarker",
  "private": true,
  "type": "module",
  "scripts": { "test": "node --test tests/" },
  "devDependencies": { "playwright": "^1.47.0" }
}
```

`LICENSE`: the standard MIT licence text, copyright line `Copyright (c) 2026 Aaron Chakerian`.

`README.md` (stub; completed in Task 16):
```markdown
# HTML/CSS Submission Automarker

A single-page, offline-capable tool that marks zipped HTML/CSS website
submissions against a configurable rubric. Open `index.html` (or the GitHub
Pages URL), pick a rubric, drop in submission zips, review, export.

Development: `npm install && npx playwright install chromium && npm test`.
```

- [ ] **Step 2: Write the failing test**

`tests/unit/scaffold.test.mjs`:
```js
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
```

`tests/helpers/harness.mjs`:
```js
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';

const MIME = { '.html': 'text/html', '.htm': 'text/html', '.mjs': 'text/javascript',
  '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.json': 'application/json' };

export async function startServer(root = process.cwd()) {
  const server = http.createServer(async (req, res) => {
    try {
      const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
      const file = join(root, p === '/' ? 'index.html' : p);
      const data = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream' });
      res.end(data);
    } catch { res.writeHead(404); res.end('not found'); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}/`,
           close: () => new Promise(r => server.close(r)) };
}

export async function launchApp(root = process.cwd()) {
  const srv = await startServer(root);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', e => { throw new Error(`page error: ${e.message}`); });
  await page.goto(srv.url + 'index.html');
  return { page, browser, srv,
           close: async () => { await browser.close(); await srv.close(); } };
}

// 400x300 solid SVG "image" — fixtures use SVGs so intrinsic size is controllable as text
export const svg = (w, h, fill = '#c0392b') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="${fill}"/></svg>`;

// Render a snapshot for an in-memory site: files = {path: string | {b64}}
export async function snapshotFor(page, files, path) {
  return page.evaluate(async ({ files, path }) => {
    const sub = await Automarker.submissionFromTexts('unit', files);
    return Automarker.analyzePage(sub, path);
  }, { files, path });
}
```

`tests/helpers/zipwrite.mjs`:
```js
import { deflateRawSync } from 'node:zlib';

const TBL = (() => { const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c; } return t; })();
export function crc32(buf) { let c = ~0;
  for (let i = 0; i < buf.length; i++) c = TBL[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return ~c >>> 0; }

// entries: [{path, data: Buffer|string}]; store=true disables compression
export function buildZip(entries, { store = false } = {}) {
  const chunks = [], central = []; let offset = 0;
  const u16 = n => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
  const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; };
  for (const e of entries) {
    const raw = Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data, 'utf8');
    const comp = store ? raw : deflateRawSync(raw);
    const method = store ? 0 : 8, crc = crc32(raw), name = Buffer.from(e.path, 'utf8');
    const head = Buffer.concat([u32(0x04034b50), u16(20), u16(0), u16(method), u16(0), u16(0),
      u32(crc), u32(comp.length), u32(raw.length), u16(name.length), u16(0), name]);
    chunks.push(head, comp);
    central.push(Buffer.concat([u32(0x02014b50), u16(20), u16(20), u16(0), u16(method), u16(0), u16(0),
      u32(crc), u32(comp.length), u32(raw.length), u16(name.length), u16(0), u16(0), u16(0), u16(0),
      u32(0), u32(offset), name]));
    offset += head.length + comp.length;
  }
  const cd = Buffer.concat(central), cdOff = offset;
  const eocd = Buffer.concat([u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length),
    u32(cd.length), u32(cdOff), u16(0)]);
  return Buffer.concat([...chunks, cd, eocd]);
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm install && npx playwright install chromium && npm test`
Expected: FAIL — `index.html` 404s / `Automarker` undefined.

- [ ] **Step 4: Write index.html skeleton**

`index.html` (complete file):
```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>HTML/CSS Submission Automarker</title>
<style id="app-style">
/* Filled in Task 14 */
#render-host { position: absolute; left: -100000px; top: 0; }
</style>
</head>
<body>
<div id="app"><noscript>This tool requires JavaScript.</noscript></div>
<div id="render-host" aria-hidden="true"></div>
<script id="module-core">
'use strict';
window.Automarker = { checks: {}, checkMeta: {}, presets: {}, util: {},
                      state: { records: [], config: null } };
(() => {
  const U = Automarker.util;
  U.b64ToBytes = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  U.bytesToB64 = bytes => { let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000)
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s); };
  U.decodeText = bytes => {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { return new TextDecoder('iso-8859-1').decode(bytes); } };
  U.gunzip = async bytes => new Uint8Array(await new Response(
    new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  U.round1 = n => Math.round(n * 10) / 10;
  U.clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
})();
</script>
<script id="module-zip"></script>
<script id="module-submission"></script>
<script id="module-render"></script>
<script id="module-analyze"></script>
<script id="module-css"></script>
<script id="module-checks"></script>
<script id="module-spell"></script>
<script id="module-config"></script>
<script id="module-scoring"></script>
<script id="module-export"></script>
<script id="module-ui"></script>
<script id="module-wordlist">
Automarker.spellData = "";/*WORDLIST*/
</script>
</body>
</html>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS (1 test).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json LICENSE README.md index.html tests
git commit -m "feat: scaffold automarker skeleton with Playwright test harness"
```

### Task 2: ZipReader

**Files:**
- Modify: `index.html` (fill `<script id="module-zip"></script>`)
- Test: `tests/unit/zipreader.test.mjs`

**Interfaces:**
- Consumes: `Automarker.util`, harness `launchApp`/`buildZip`.
- Produces: `Automarker.ZipReader.read(bufferOrBytes) → Promise<Map<path, Uint8Array>>` — paths normalised (forward slashes, no leading `./`), junk removed (`__MACOSX/`, `.DS_Store`, dotfiles), single shared root folder stripped, directory entries omitted. Throws `Error('Not a zip file…')` / `Error('Corrupt…')` on bad input.

- [ ] **Step 1: Write the failing test**

`tests/unit/zipreader.test.mjs`:
```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Automarker.ZipReader` undefined.

- [ ] **Step 3: Implement ZipReader**

Replace `<script id="module-zip"></script>` in `index.html` with:
```html
<script id="module-zip">
(() => {
  const A = Automarker;
  async function inflateRaw(bytes) {
    return new Uint8Array(await new Response(new Blob([bytes]).stream()
      .pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
  }
  function normalize(files) {
    let out = new Map();
    for (const [name, data] of files) {
      const p = name.replace(/\\/g, '/').replace(/^\.\//, '');
      const base = p.split('/').pop();
      if (p.startsWith('__MACOSX/') || base === '.DS_Store' || base.startsWith('.')) continue;
      out.set(p, data);
    }
    const roots = new Set([...out.keys()].map(p => p.split('/')[0]));
    if (roots.size === 1 && [...out.keys()].every(p => p.includes('/'))) {
      const strip = [...roots][0].length + 1;
      out = new Map([...out.entries()].map(([p, d]) => [p.slice(strip), d]));
    }
    return out;
  }
  A.ZipReader = {
    async read(input) {
      const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      let eocd = -1;
      for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65536); i--) {
        if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
      }
      if (eocd < 0) throw new Error('Not a zip file (no end-of-central-directory record)');
      const count = view.getUint16(eocd + 10, true);
      let off = view.getUint32(eocd + 16, true);
      const files = new Map();
      for (let n = 0; n < count; n++) {
        if (view.getUint32(off, true) !== 0x02014b50) throw new Error('Corrupt zip central directory');
        const method = view.getUint16(off + 10, true);
        const compSize = view.getUint32(off + 20, true);
        const nameLen = view.getUint16(off + 28, true);
        const extraLen = view.getUint16(off + 30, true);
        const commentLen = view.getUint16(off + 32, true);
        const localOff = view.getUint32(off + 42, true);
        const name = new TextDecoder().decode(bytes.subarray(off + 46, off + 46 + nameLen));
        off += 46 + nameLen + extraLen + commentLen;
        if (name.endsWith('/')) continue;
        const lNameLen = view.getUint16(localOff + 26, true);
        const lExtraLen = view.getUint16(localOff + 28, true);
        const start = localOff + 30 + lNameLen + lExtraLen;
        const raw = bytes.subarray(start, start + compSize);
        if (method === 0) files.set(name, raw.slice());
        else if (method === 8) files.set(name, await inflateRaw(raw));
        else throw new Error(`Unsupported zip compression method ${method} for ${name}`);
      }
      return normalize(files);
    }
  };
})();
</script>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (all zipreader tests + scaffold).

- [ ] **Step 5: Commit**

```bash
git add index.html tests/unit/zipreader.test.mjs
git commit -m "feat: dependency-free ZipReader with junk/nested-root normalisation"
```

---

### Task 3: SubmissionLoader

**Files:**
- Modify: `index.html` (fill `<script id="module-submission"></script>`)
- Test: `tests/unit/submission.test.mjs`

**Interfaces:**
- Consumes: `Automarker.ZipReader.read`, `Automarker.util.decodeText`.
- Produces:
  - `Automarker.loadSubmission(name, bytes) → Promise<Submission>` (shape in Shared type reference; throws only on unreadable zip — page-level issues go to `submission.errors`).
  - `Automarker.submissionFromTexts(name, filesObj) → Promise<Submission>` — test/builder helper; `filesObj` values are strings (UTF-8) or `{b64}` for binary.
  - `Automarker.resolvePath(fromPath, url) → string|null` — resolves a relative URL against a file's directory (`a/b.html` + `../img/x.svg` → `img/x.svg`); returns `null` for absolute/scheme/hash-only URLs; strips query/hash; decodes URI components.
  - `Submission.lowerIndex` maps lowercased path → real path for case-insensitive lookups.

- [ ] **Step 1: Write the failing test**

`tests/unit/submission.test.mjs`:
```js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchApp } from '../helpers/harness.mjs';

let app;
before(async () => { app = await launchApp(); });
after(async () => { await app.close(); });

const load = files => app.page.evaluate(async f => {
  const s = await Automarker.submissionFromTexts('t', f);
  return { pages: s.pages.map(p => p.path).sort(), home: s.homePath,
           subs: s.subPagePaths, errors: s.errors };
}, files);

test('finds pages case-insensitively and picks index.html as home', async () => {
  const s = await load({ 'INDEX.HTML': '<p>h</p>', 'about.htm': '<p>a</p>', 'css/s.css': 'p{}' });
  assert.deepEqual(s.pages, ['INDEX.HTML', 'about.htm']);
  assert.equal(s.home, 'INDEX.HTML');
  assert.deepEqual(s.subs, ['about.htm']);
});

test('falls back to most-linked-to page as home', async () => {
  const s = await load({
    'main.html': '<a href="a.html">a</a><a href="b.html">b</a>',
    'a.html': '<a href="main.html">m</a>',
    'b.html': '<a href="main.html">m</a>'
  });
  assert.equal(s.home, 'main.html');
});

test('resolvePath handles ../, query strings and absolute URLs', async () => {
  const r = await app.page.evaluate(() => [
    Automarker.resolvePath('sub/page.html', '../img/x.svg'),
    Automarker.resolvePath('page.html', 'img/x.svg?v=2#top'),
    Automarker.resolvePath('page.html', 'https://evil.example/x.png'),
    Automarker.resolvePath('page.html', '#top'),
    Automarker.resolvePath('page.html', 'mailto:a@b.c')
  ]);
  assert.deepEqual(r, ['img/x.svg', 'img/x.svg', null, null, null]);
});

test('submission with no HTML pages reports an error', async () => {
  const s = await load({ 'style.css': 'p{}' });
  assert.equal(s.pages.length, 0);
  assert.match(s.errors[0], /no html pages/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Automarker.submissionFromTexts` undefined.

- [ ] **Step 3: Implement SubmissionLoader**

Replace `<script id="module-submission"></script>` with:
```html
<script id="module-submission">
(() => {
  const A = Automarker, U = A.util;

  A.resolvePath = (fromPath, url) => {
    if (!url) return null;
    const u = url.trim();
    if (/^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(u)) return null;   // scheme, protocol-relative, hash
    if (/^[a-z]:[\\/]/i.test(u) || u.startsWith('/')) return null; // drive or root-absolute
    let clean; try { clean = decodeURIComponent(u.split(/[?#]/)[0]); } catch { clean = u.split(/[?#]/)[0]; }
    if (!clean) return null;
    const parts = fromPath.replace(/\\/g, '/').split('/').slice(0, -1);
    for (const seg of clean.replace(/\\/g, '/').split('/')) {
      if (seg === '' || seg === '.') continue;
      else if (seg === '..') { if (parts.length === 0) return null; parts.pop(); }
      else parts.push(seg);
    }
    return parts.join('/');
  };

  function build(name, files) {
    const lowerIndex = new Map();
    for (const p of files.keys()) lowerIndex.set(p.toLowerCase(), p);
    const errors = [];
    const pagePaths = [...files.keys()].filter(p => /\.html?$/i.test(p))
      .sort((a, b) => a.localeCompare(b));
    const pages = pagePaths.map(path => ({ path, html: U.decodeText(files.get(path)) }));
    if (pages.length === 0) errors.push('No HTML pages found in this submission.');

    let homePath = null;
    const indexes = pagePaths.filter(p => /(^|\/)index\.html?$/i.test(p))
      .sort((a, b) => a.split('/').length - b.split('/').length);
    if (indexes.length) homePath = indexes[0];
    else if (pages.length) {
      const inbound = new Map(pagePaths.map(p => [p, 0]));
      for (const pg of pages) {
        for (const m of pg.html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
          const t = A.resolvePath(pg.path, m[1]);
          const real = t && lowerIndex.get(t.toLowerCase());
          if (real && inbound.has(real) && real !== pg.path)
            inbound.set(real, inbound.get(real) + 1);
        }
      }
      homePath = [...inbound.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
    }
    const subPagePaths = pagePaths.filter(p => p !== homePath);
    return { name, files, lowerIndex, pages, homePath, subPagePaths, errors };
  }

  A.loadSubmission = async (name, bytes) => build(name, await A.ZipReader.read(bytes));

  A.submissionFromTexts = async (name, filesObj) => {
    const files = new Map();
    for (const [p, v] of Object.entries(filesObj))
      files.set(p, typeof v === 'string' ? new TextEncoder().encode(v) : U.b64ToBytes(v.b64));
    return build(name, files);
  };
})();
</script>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add index.html tests/unit/submission.test.mjs
git commit -m "feat: submission loader with page discovery and relative path resolver"
```

### Task 4: PageRenderer

**Files:**
- Modify: `index.html` (fill `<script id="module-render"></script>`)
- Test: `tests/unit/renderer.test.mjs`

**Interfaces:**
- Consumes: `Automarker.resolvePath`, `Submission` (Task 3), `#render-host` div (Task 1).
- Produces: `Automarker.renderPage(submission, path, opts?) → Promise<RenderHandle>` where `opts = {width=1280, height=800, timeoutMs=10000}` and
  `RenderHandle = { iframe, doc, win, brokenAssets: [{kind,url}], externalRefs: [{kind,url}], cssSources: [{origin:'external'|'embedded', path, text}], referencedBytes, timedOut, cleanup() }`.
  Guarantees: submission `<script>` tags are removed AND the iframe is `sandbox="allow-same-origin"`; no network request ever leaves for submission assets (external refs are replaced with data-URI placeholders and recorded); relative asset refs (img src, stylesheet href, CSS `url()`, video/audio/source, inline `style` attrs) are resolved case-insensitively against the referencing file and served from blob URLs; `cleanup()` removes the iframe and revokes all blobs.

- [ ] **Step 1: Write the failing test**

`tests/unit/renderer.test.mjs`:
```js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchApp, svg } from '../helpers/harness.mjs';

let app, foreignRequests;
before(async () => {
  app = await launchApp();
  foreignRequests = [];
  app.page.on('request', r => { if (!r.url().startsWith('http://127.0.0.1')) foreignRequests.push(r.url()); });
});
after(async () => { await app.close(); });

const SITE = {
  'index.html': `<html><head><link rel="stylesheet" href="css/site.css">
    <script>document.title="PWNED"<\/script></head>
    <body><p id="p1">hello</p>
    <img id="ok" src="img/pic.svg"><img id="bad" src="img/missing.svg">
    <img id="ext" src="https://cdn.example.com/x.png">
    <div id="bg" style="background-image:url('img/pic.svg');width:50px;height:50px"></div>
    </body></html>`,
  'css/site.css': 'p{color:rgb(200,0,0);} body{background:url("../img/pic.svg");}',
  'img/pic.svg': svg(400, 300)
};

test('renders with rewritten assets, no scripts, no external fetches', async () => {
  const r = await app.page.evaluate(async site => {
    const sub = await Automarker.submissionFromTexts('t', site);
    const h = await Automarker.renderPage(sub, 'index.html');
    const out = {
      sandbox: h.iframe.getAttribute('sandbox'),
      title: h.doc.title,
      scripts: h.doc.querySelectorAll('script').length,
      pColor: h.win.getComputedStyle(h.doc.getElementById('p1')).color,
      okNatural: h.doc.getElementById('ok').naturalWidth,
      badNatural: h.doc.getElementById('bad').naturalWidth,
      broken: h.brokenAssets, external: h.externalRefs,
      cssOrigins: h.cssSources.map(c => c.origin),
      bytes: h.referencedBytes > 0, timedOut: h.timedOut
    };
    h.cleanup();
    return out;
  }, SITE);
  assert.equal(r.sandbox, 'allow-same-origin');
  assert.notEqual(r.title, 'PWNED');
  assert.equal(r.scripts, 0);
  assert.equal(r.pColor, 'rgb(200, 0, 0)');            // external CSS applied
  assert.equal(r.okNatural, 400);                       // svg intrinsic size
  assert.equal(r.badNatural, 0);                        // broken image
  assert.deepEqual(r.broken, [{ kind: 'img', url: 'img/missing.svg' }]);
  assert.equal(r.external[0].url, 'https://cdn.example.com/x.png');
  assert.deepEqual(r.cssOrigins, ['external']);
  assert.ok(r.bytes); assert.equal(r.timedOut, false);
  assert.deepEqual(foreignRequests, []);                // nothing left the machine
});

test('cleanup removes the iframe', async () => {
  const n = await app.page.evaluate(async site => {
    const sub = await Automarker.submissionFromTexts('t', site);
    const h = await Automarker.renderPage(sub, 'index.html');
    h.cleanup();
    return document.querySelectorAll('#render-host iframe').length;
  }, SITE);
  assert.equal(n, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Automarker.renderPage` undefined.

- [ ] **Step 3: Implement PageRenderer**

Replace `<script id="module-render"></script>` with:
```html
<script id="module-render">
(() => {
  const A = Automarker, U = A.util;
  const MIME = { html:'text/html', htm:'text/html', css:'text/css', png:'image/png',
    jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif', svg:'image/svg+xml',
    webp:'image/webp', avif:'image/avif', ico:'image/x-icon', mp4:'video/mp4',
    webm:'video/webm', ogg:'video/ogg', mp3:'audio/mpeg', wav:'audio/wav',
    woff:'font/woff', woff2:'font/woff2', ttf:'font/ttf', otf:'font/otf' };
  const PLACEHOLDER = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="60"><rect width="100%" height="100%" fill="#ddd"/></svg>');
  const isExternal = u => /^(https?:)?\/\//i.test(u) || /^[a-z]:[\\/]/i.test(u) || /^file:/i.test(u);

  A.renderPage = async (submission, path, opts = {}) => {
    const { width = 1280, height = 800, timeoutMs = 10000 } = opts;
    const blobs = [], brokenAssets = [], externalRefs = [], cssSources = [];
    const referenced = new Set();
    const lookup = (from, url) => {
      const r = A.resolvePath(from, url);
      return r ? (submission.lowerIndex.get(r.toLowerCase()) ?? null) : null;
    };
    const blobFor = real => {
      referenced.add(real);
      const ext = real.split('.').pop().toLowerCase();
      const u = URL.createObjectURL(new Blob([submission.files.get(real)],
        { type: MIME[ext] || 'application/octet-stream' }));
      blobs.push(u); return u;
    };
    const rewriteCss = (text, fromPath) => text.replace(
      /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (m, q, u) => {
        if (/^data:/i.test(u)) return m;
        if (isExternal(u)) { externalRefs.push({ kind: 'css-url', url: u }); return `url(${PLACEHOLDER})`; }
        const real = lookup(fromPath, u);
        if (!real) { brokenAssets.push({ kind: 'css-url', url: u }); return m; }
        return `url(${blobFor(real)})`;
      });

    const doc = new DOMParser().parseFromString(
      U.decodeText(submission.files.get(path)), 'text/html');
    doc.querySelectorAll('script, base').forEach(el => el.remove());

    for (const link of [...doc.querySelectorAll('link[href]')]) {
      const rel = (link.getAttribute('rel') || '').toLowerCase();
      const href = link.getAttribute('href') || '';
      if (!rel.includes('stylesheet') && !rel.includes('icon')) continue;
      if (isExternal(href)) { externalRefs.push({ kind: 'css', url: href }); link.remove(); continue; }
      const real = lookup(path, href);
      if (!real) { brokenAssets.push({ kind: 'css', url: href }); link.remove(); continue; }
      if (rel.includes('stylesheet')) {
        const text = U.decodeText(submission.files.get(real));
        cssSources.push({ origin: 'external', path: real, text });
        const rewritten = rewriteCss(text, real);
        referenced.add(real);
        const u = URL.createObjectURL(new Blob([rewritten], { type: 'text/css' }));
        blobs.push(u); link.setAttribute('href', u);
      } else link.setAttribute('href', blobFor(real));
    }
    doc.querySelectorAll('style').forEach(st => {
      cssSources.push({ origin: 'embedded', path, text: st.textContent });
      st.textContent = rewriteCss(st.textContent, path);
    });
    for (const el of [...doc.querySelectorAll('img[src], video[src], audio[src], source[src], video[poster]')]) {
      for (const attr of ['src', 'poster']) {
        const raw = el.getAttribute(attr); if (!raw) continue;
        const kind = el.tagName === 'IMG' ? 'img' : 'media';
        el.setAttribute('data-am-raw', raw); el.removeAttribute('srcset');
        if (/^data:/i.test(raw)) continue;
        if (isExternal(raw)) { externalRefs.push({ kind, url: raw });
          el.setAttribute('data-am-external', '1');
          if (kind === 'img') el.setAttribute(attr, PLACEHOLDER); else el.removeAttribute(attr);
          continue; }
        const real = lookup(path, raw);
        if (!real) { brokenAssets.push({ kind, url: raw }); continue; } // stays broken → naturalWidth 0
        el.setAttribute(attr, blobFor(real));
      }
    }
    for (const el of [...doc.querySelectorAll('iframe[src]')]) {
      const raw = el.getAttribute('src');
      el.setAttribute('data-am-raw', raw);
      if (isExternal(raw)) { externalRefs.push({ kind: 'iframe', url: raw });
        el.setAttribute('data-am-external', '1'); }
      el.removeAttribute('src');
    }
    for (const el of [...doc.querySelectorAll('[style*="url("i]')])
      el.setAttribute('style', rewriteCss(el.getAttribute('style'), path));

    const htmlText = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
    const pageUrl = URL.createObjectURL(new Blob([htmlText], { type: 'text/html' }));
    blobs.push(pageUrl);
    const iframe = document.createElement('iframe');
    iframe.setAttribute('sandbox', 'allow-same-origin');
    iframe.style.cssText = `width:${width}px;height:${height}px;border:0;`;
    document.getElementById('render-host').appendChild(iframe);
    let timedOut = false;
    await new Promise(res => {
      const t = setTimeout(() => { timedOut = true; res(); }, timeoutMs);
      iframe.addEventListener('load', () => { clearTimeout(t); res(); }, { once: true });
      iframe.src = pageUrl;
    });
    if (!timedOut) {
      const imgs = [...iframe.contentDocument.images];
      await Promise.race([
        Promise.all(imgs.map(i => i.complete ? null : new Promise(r => {
          i.addEventListener('load', r, { once: true }); i.addEventListener('error', r, { once: true });
        }))),
        new Promise(r => setTimeout(r, timeoutMs))
      ]);
    }
    let referencedBytes = submission.files.get(path).length;
    for (const r of referenced) referencedBytes += submission.files.get(r).length;
    return { iframe, doc: iframe.contentDocument, win: iframe.contentWindow,
      brokenAssets, externalRefs, cssSources, referencedBytes, timedOut,
      cleanup() { iframe.remove(); blobs.forEach(u => URL.revokeObjectURL(u)); } };
  };
})();
</script>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS. If `pColor` fails, check the `link[href]` loop runs before serialisation and that the blob CSS got `type: 'text/css'` (Chromium ignores stylesheets with wrong MIME).

- [ ] **Step 5: Commit**

```bash
git add index.html tests/unit/renderer.test.mjs
git commit -m "feat: sandboxed page renderer with blob asset rewriting and no-network guarantee"
```

---

### Task 5: PageAnalyzer — core snapshot

**Files:**
- Modify: `index.html` (fill `<script id="module-analyze"></script>`)
- Test: `tests/unit/analyzer-core.test.mjs`

**Interfaces:**
- Consumes: `Automarker.renderPage` (Task 4), `Automarker.resolvePath`, `Submission`.
- Produces:
  - `Automarker.analyzePage(submission, path, opts?) → Promise<PageSnapshot>` — full shape from Shared type reference. THIS task fills: `path,title,viewport,docHeight,weightBytes,nav,links,images,media,structure,text,anchors,inlineStyles,brokenAssets,externalRefs` and sets `palette:null, typography:null, spacing:null, responsive:[], css:null` (filled by Tasks 6–7 via the hooks below). Always calls `handle.cleanup()`.
  - Extension hooks (plain object): `Automarker.analyzerHooks = []` — each entry is `fn(handle, snap, submission, opts)` (may be async); Tasks 6–7 push hooks. Core runs them in order before cleanup.
  - `Automarker.analyzeSubmission(submission, opts?) → Promise<{snapshots: {path: PageSnapshot}}>` — analyses every page sequentially; a page that throws yields `{path, error: message}` in place of a snapshot.

- [ ] **Step 1: Write the failing test**

`tests/unit/analyzer-core.test.mjs`:
```js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchApp, snapshotFor, svg } from '../helpers/harness.mjs';

let app;
before(async () => { app = await launchApp(); });
after(async () => { await app.close(); });

const SITE = {
  'index.html': `<html><head><title>Home</title></head><body id="top">
    <nav><a href="about.html">About</a><a href="gone.html">Gone</a>
         <a href="https://x.example/a">Ext</a><a href="mailto:me@x.com">Mail</a></nav>
    <main><section><h1>Big</h1><h2>Small</h2>
      <p>one two three four five</p>
      <img src="img/a.svg" alt="product"><img src="img/nope.svg" alt="">
      <div style="color:red">inline1</div><span style="color:blue">inline2</span>
    </section></main>
    <video src="clip.mp4"></video>
    <a href="#top">Back to top</a></body></html>`,
  'about.html': '<html><body><a href="index.html">home</a></body></html>',
  'img/a.svg': svg(400, 300),
  'clip.mp4': { b64: 'AAAA' }
};

test('core snapshot: nav, links, images, media, structure, text, anchors, inline styles', async () => {
  const s = await snapshotFor(app.page, SITE, 'index.html');
  assert.equal(s.title, 'Home');
  assert.equal(s.nav.hasNavElement, true);
  assert.deepEqual(s.nav.linkTargets, ['about.html']);          // only pages that exist
  const gone = s.links.find(l => l.raw === 'gone.html');
  assert.equal(gone.internal, true); assert.equal(gone.targetExists, false);
  assert.equal(s.links.find(l => l.raw.startsWith('https')).external, true);
  assert.equal(s.links.find(l => l.raw.startsWith('mailto')).mailto, true);
  const ok = s.images.find(i => i.raw === 'img/a.svg');
  assert.equal(ok.ok, true); assert.equal(ok.naturalW, 400); assert.equal(ok.alt, 'product');
  assert.equal(s.images.find(i => i.raw === 'img/nope.svg').ok, false);
  assert.equal(s.media.videos, 1);
  assert.equal(s.structure.headings.h1, 1); assert.equal(s.structure.headings.h2, 1);
  assert.ok(s.structure.semanticTags.includes('nav'));
  assert.ok(s.structure.sectionCount >= 1);
  assert.ok(s.text.wordCount >= 10);
  const bt = s.anchors.find(a => a.href === '#top');
  assert.ok(bt); assert.equal(bt.targetY, 0);
  assert.equal(s.inlineStyles.count, 2);
  assert.deepEqual([...s.inlineStyles.tags].sort(), ['div', 'span']);
  assert.ok(s.weightBytes > 0); assert.ok(s.docHeight > 0);
  assert.ok('palette' in s && 'css' in s);   // placeholders now; Tasks 6–7 hooks fill them
});

test('analyzeSubmission analyses every page and isolates failures', async () => {
  const r = await app.page.evaluate(async site => {
    const sub = await Automarker.submissionFromTexts('t', site);
    return Automarker.analyzeSubmission(sub);
  }, SITE);
  assert.deepEqual(Object.keys(r.snapshots).sort(), ['about.html', 'index.html']);
  assert.equal(r.snapshots['about.html'].error, undefined);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Automarker.analyzePage` undefined.

- [ ] **Step 3: Implement analyzer core**

Replace `<script id="module-analyze"></script>` with:
```html
<script id="module-analyze">
(() => {
  const A = Automarker;
  A.analyzerHooks = [];
  const isExternal = u => /^(https?:)?\/\//i.test(u) || /^[a-z]:[\\/]/i.test(u) || /^file:/i.test(u);

  A.analyzePage = async (submission, path, opts = {}) => {
    const viewport = opts.viewport || { w: 1280, h: 800 };
    const handle = await A.renderPage(submission, path,
      { width: viewport.w, height: viewport.h, timeoutMs: opts.timeoutMs });
    try {
      const { doc, win } = handle;
      const yOf = el => el.getBoundingClientRect().top + win.scrollY;
      const pageSet = new Set(submission.pages.map(p => p.path));
      const resolveReal = raw => {
        const r = A.resolvePath(path, raw);
        return r ? (submission.lowerIndex.get(r.toLowerCase()) ?? null) : null;
      };

      // --- nav detection: <nav>, else densest top-region container of internal page links
      let navEl = doc.querySelector('nav');
      if (!navEl) {
        let best = null, bestN = 1;
        for (const c of doc.querySelectorAll('header, div, ul, p, table, tr')) {
          if (yOf(c) > doc.documentElement.scrollHeight * 0.4) continue;
          const n = [...c.querySelectorAll(':scope > a[href], :scope > li > a[href], :scope > td > a[href]')]
            .filter(a => { const real = resolveReal(a.getAttribute('href') || ''); return real && pageSet.has(real); }).length;
          if (n > bestN) { best = c; bestN = n; }
        }
        navEl = best;
      }
      let styledSignals = 0;
      if (navEl) {
        const cs = win.getComputedStyle(navEl);
        const linkEls = [...navEl.querySelectorAll('a')];
        const lcs = linkEls.length ? win.getComputedStyle(linkEls[0]) : null;
        if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)') styledSignals++;
        if (cs.display === 'flex' || cs.display === 'grid') styledSignals++;
        if (lcs && lcs.textDecorationLine === 'none') styledSignals++;
        if (lcs && (parseFloat(lcs.paddingLeft) > 4 || parseFloat(lcs.paddingTop) > 4)) styledSignals++;
        if (lcs && lcs.color !== 'rgb(0, 0, 238)') styledSignals++;
      }

      // --- links & anchors
      const links = [], anchors = [], navLinkTargets = new Set();
      for (const a of doc.querySelectorAll('a[href]')) {
        const raw = a.getAttribute('href') || '';
        if (raw.startsWith('#')) {
          let targetY = null;
          if (raw === '#' || raw.toLowerCase() === '#top') targetY = 0;
          else { const t = doc.getElementById(raw.slice(1)) ||
                   doc.querySelector(`[name="${CSS.escape(raw.slice(1))}"]`);
                 if (t) targetY = yOf(t); }
          anchors.push({ href: raw, y: yOf(a), targetY, text: a.textContent.trim().slice(0, 80) });
          continue;
        }
        const mailto = /^mailto:/i.test(raw);
        const external = !mailto && isExternal(raw);
        const real = (!mailto && !external) ? resolveReal(raw) : null;
        const inNav = !!(navEl && navEl.contains(a));
        const link = { raw, resolved: real, internal: !mailto && !external,
          external, mailto, targetExists: !!real, text: a.textContent.trim().slice(0, 80), inNav };
        links.push(link);
        if (inNav && real && pageSet.has(real)) navLinkTargets.add(real);
      }

      // --- images & media
      const images = [...doc.images].map(img => {
        const raw = img.getAttribute('data-am-raw') || img.getAttribute('src') || '';
        const external = img.hasAttribute('data-am-external');
        const r = img.getBoundingClientRect();
        const linkEl = img.closest('a[href]');
        return { raw, external, isGif: /\.gif(\?|$)/i.test(raw),
          linkTarget: linkEl ? resolveReal(linkEl.getAttribute('href') || '') : null,
          ok: !external && img.complete && img.naturalWidth > 0,
          naturalW: img.naturalWidth, naturalH: img.naturalHeight,
          displayW: Math.round(r.width), displayH: Math.round(r.height),
          alt: img.getAttribute('alt') ?? null, x: Math.round(r.left), y: Math.round(yOf(img)) };
      });
      const media = { videos: doc.querySelectorAll('video').length,
        iframes: doc.querySelectorAll('iframe').length,
        gifs: images.filter(i => i.isGif).length,
        audio: doc.querySelectorAll('audio').length };

      // --- structure, text, inline styles
      const headings = {};
      for (let i = 1; i <= 6; i++) headings['h' + i] = doc.querySelectorAll('h' + i).length;
      const semanticTags = ['header','nav','main','section','article','aside','footer']
        .filter(t => doc.querySelector(t));
      const structure = { sectionCount: doc.querySelectorAll('main, section, article').length,
        headings, semanticTags };
      const visibleText = doc.body ? doc.body.innerText : '';
      const inlineEls = [...doc.querySelectorAll('[style]')];
      const snap = {
        path, title: doc.title || '', viewport,
        docHeight: doc.documentElement.scrollHeight,
        weightBytes: handle.referencedBytes,
        nav: { hasNavElement: !!doc.querySelector('nav'), styledSignals,
               linkTargets: [...navLinkTargets].sort() },
        links, images, media, structure,
        text: { visibleText, wordCount: visibleText.split(/\s+/).filter(Boolean).length },
        anchors,
        inlineStyles: { count: inlineEls.length,
          tags: [...new Set(inlineEls.map(e => e.tagName.toLowerCase()))] },
        palette: null, typography: null, spacing: null, responsive: [], css: null,
        brokenAssets: handle.brokenAssets, externalRefs: handle.externalRefs,
        timedOut: handle.timedOut
      };
      for (const hook of A.analyzerHooks) await hook(handle, snap, submission, opts);
      return snap;
    } finally { handle.cleanup(); }
  };

  A.analyzeSubmission = async (submission, opts = {}) => {
    const snapshots = {};
    for (const pg of submission.pages) {
      try { snapshots[pg.path] = await A.analyzePage(submission, pg.path, opts); }
      catch (e) { snapshots[pg.path] = { path: pg.path, error: String(e.message || e) }; }
    }
    return { snapshots };
  };
})();
</script>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add index.html tests/unit/analyzer-core.test.mjs
git commit -m "feat: page analyzer core snapshot (nav, links, images, structure, text)"
```

### Task 6: PageAnalyzer — style metrics (palette, typography, spacing, responsive)

**Files:**
- Modify: `index.html` (append a second IIFE inside `<script id="module-analyze">`, registered via `Automarker.analyzerHooks.push`)
- Test: `tests/unit/analyzer-style.test.mjs`

**Interfaces:**
- Consumes: `Automarker.analyzerHooks` (Task 5), `RenderHandle` (Task 4).
- Produces: fills `snap.palette`, `snap.typography`, `snap.spacing`, `snap.responsive` (shapes in Shared type reference). Responsive widths come from `opts.responsiveWidths ?? [1280, 768, 375]`. Also exposes pure helpers for tests/checks: `Automarker.util.parseRgb(str) → {r,g,b,a}|null`, `Automarker.util.rgbToHsl(r,g,b) → {h,s,l}` (h 0–360, s/l 0–1), `Automarker.util.contrast(rgb1, rgb2) → ratio` (WCAG 2.x relative luminance).

- [ ] **Step 1: Write the failing test**

`tests/unit/analyzer-style.test.mjs`:
```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `s.palette` is null / utils undefined.

- [ ] **Step 3: Implement the style-metrics hook**

Append inside `<script id="module-analyze">`, after the existing IIFE (anchor: insert before the closing `</script>` of module-analyze):
```js
(() => {
  const A = Automarker, U = A.util;
  U.parseRgb = s => { const m = /rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(s || '');
    return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null; };
  U.rgbToHsl = (r, g, b) => { r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    if (mx === mn) return { h: 0, s: 0, l };
    const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return { h: Math.round(h * 60), s, l }; };
  const lum = ({ r, g, b }) => { const f = c => { c /= 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  U.contrast = (c1, c2) => { const [a, b] = [lum(c1), lum(c2)].sort((x, y) => y - x);
    return (a + 0.05) / (b + 0.05); };
  const effectiveBg = (el, win) => { let n = el;
    while (n && n.nodeType === 1) {
      const c = U.parseRgb(win.getComputedStyle(n).backgroundColor);
      if (c && c.a > 0.1) return c;
      n = n.parentElement; }
    return { r: 255, g: 255, b: 255, a: 1 }; };

  A.analyzerHooks.push(async (handle, snap, submission, opts) => {
    const { doc, win, iframe } = handle;
    if (!doc.body) return;
    const all = [...doc.querySelectorAll('*')].slice(0, 3000);

    // palette: area-weighted colours
    const byColor = new Map(); let nonDefault = false;
    const addColor = (c, area) => { if (!c || c.a < 0.1) return;
      const k = `${c.r},${c.g},${c.b}`;
      const e = byColor.get(k) || { ...c, ...U.rgbToHsl(c.r, c.g, c.b), area: 0 };
      e.area += area; byColor.set(k, e); };
    for (const el of all) {
      const r = el.getBoundingClientRect(); const area = r.width * r.height;
      if (area < 100) continue;
      const cs = win.getComputedStyle(el);
      const bg = U.parseRgb(cs.backgroundColor);
      if (bg && bg.a > 0.1) { addColor(bg, area);
        if (!(bg.r === 255 && bg.g === 255 && bg.b === 255)) nonDefault = true; }
      if ([...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) {
        const fg = U.parseRgb(cs.color); addColor(fg, Math.min(area, 5000));
        if (fg && (fg.r || fg.g || fg.b)) nonDefault = true; }
    }
    const colors = [...byColor.values()].sort((a, b) => b.area - a.area).slice(0, 50)
      .map(c => ({ r: c.r, g: c.g, b: c.b, h: c.h, s: +c.s.toFixed(2), l: +c.l.toFixed(2),
                   area: Math.round(c.area) }));
    const minArea = snap.viewport.w * snap.viewport.h * 0.005;
    const hueBuckets = new Set(), hiSat = new Set();
    for (const c of colors) if (c.area >= minArea && c.s > 0.15 && c.l > 0.08 && c.l < 0.95) {
      hueBuckets.add(Math.floor(c.h / 30)); if (c.s > 0.6) hiSat.add(Math.floor(c.h / 30)); }
    snap.palette = { colors, distinctHues: hueBuckets.size, highSatHues: hiSat.size, nonDefault };

    // typography
    const DEFAULTS = new Set(['times', '"times new roman"', 'times new roman', 'serif', '-webkit-standard']);
    const famOf = el => (win.getComputedStyle(el).fontFamily.split(',')[0] || '')
      .trim().toLowerCase().replace(/^["']|["']$/g, '');
    const textEls = [doc.body, ...doc.querySelectorAll('p, h1, h2, h3, li')];
    const families = [...new Set(textEls.map(famOf).filter(Boolean))];
    const mainPara = [...doc.querySelectorAll('p, li, td, div')]
      .filter(e => [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 20))
      .sort((a, b) => b.textContent.length - a.textContent.length)[0] || doc.body;
    const mcs = win.getComputedStyle(mainPara);
    const fg = U.parseRgb(mcs.color) || { r: 0, g: 0, b: 0 };
    snap.typography = { families,
      defaultFontOnly: families.every(f => DEFAULTS.has(f)),
      bodySizePx: Math.round(parseFloat(mcs.fontSize)),
      contrastRatio: +U.contrast(fg, effectiveBg(mainPara, win)).toFixed(2) };

    // spacing
    const kids = [...doc.body.children].filter(e => e.getBoundingClientRect().height > 2);
    let insetLeft = snap.viewport.w, insetRight = snap.viewport.w, gaps = [];
    let prevBottom = null;
    for (const el of kids) { const r = el.getBoundingClientRect();
      insetLeft = Math.min(insetLeft, Math.max(0, r.left));
      insetRight = Math.min(insetRight, Math.max(0, snap.viewport.w - r.right));
      if (prevBottom !== null) gaps.push(Math.max(0, r.top - prevBottom));
      prevBottom = r.bottom; }
    const sections = [...doc.querySelectorAll('main > *, body > section, body > article, body > div')]
      .filter(e => e.getBoundingClientRect().height > 20);
    let sPrev = null; const sGaps = [];
    for (const el of sections) { const r = el.getBoundingClientRect();
      if (sPrev !== null) sGaps.push(Math.max(0, r.top - sPrev)); sPrev = r.bottom; }
    const allGaps = sGaps.length ? sGaps : gaps;
    const mainBlock = kids.sort((a, b) =>
      (b.getBoundingClientRect().width * b.getBoundingClientRect().height) -
      (a.getBoundingClientRect().width * a.getBoundingClientRect().height))[0];
    snap.spacing = {
      insetLeft: Math.round(insetLeft === snap.viewport.w ? 0 : insetLeft),
      insetRight: Math.round(insetRight === snap.viewport.w ? 0 : insetRight),
      contentWidthRatio: mainBlock
        ? +(mainBlock.getBoundingClientRect().width / snap.viewport.w).toFixed(2) : 1,
      horizontalOverflow: doc.documentElement.scrollWidth > snap.viewport.w + 2,
      sectionGapAvg: allGaps.length
        ? Math.round(allGaps.reduce((a, b) => a + b, 0) / allGaps.length) : 0 };

    // responsive re-measure
    const widths = opts.responsiveWidths ?? [1280, 768, 375];
    snap.responsive = [];
    for (const w of widths) {
      iframe.style.width = w + 'px';
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const overflow = doc.documentElement.scrollWidth > w + 2;
      const mb = [...doc.body.children].sort((a, b) =>
        b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0];
      snap.responsive.push({ w, horizontalOverflow: overflow,
        contentWidthRatio: mb ? +(mb.getBoundingClientRect().width / w).toFixed(2) : 1 });
    }
    iframe.style.width = snap.viewport.w + 'px';
  });
})();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS. If `contentWidthRatio` is off, confirm the hook measures `main` (the largest body child), not `body` itself.

- [ ] **Step 5: Commit**

```bash
git add index.html tests/unit/analyzer-style.test.mjs
git commit -m "feat: style metrics — palette, typography, spacing, responsive re-measure"
```

---

### Task 7: CssAnalyzer — rule classification and usage

**Files:**
- Modify: `index.html` (fill `<script id="module-css"></script>`; registers itself as an analyzer hook)
- Test: `tests/unit/css-analyzer.test.mjs`

**Interfaces:**
- Consumes: `Automarker.analyzerHooks`, `RenderHandle.cssSources` (Task 4).
- Produces: fills `snap.css` (shape in Shared type reference). Also exposes `Automarker.CssAnalyzer.classifySelector(selector, decls, doc?) → [Kind]` as a pure-ish helper (doc used only for `idOnHeading`). Kinds are exactly: `pFormat, classGeneric, classScoped, headingStyle, hoverAnchor, group, contextual, idOnHeading, buttonStyle, flexbox, positioning, bodyStyle, headerStyle, footerStyle`. Rule `matches` = does the selector (pseudo-classes/elements stripped) match ≥ 1 element in the page. `snap.css.external` lists every `.css` file in the submission; `snap.css.externalLinkedHere` = this page links ≥ 1 of them.

**Classification rules (each selector in a rule's selector list is examined; a rule gets a kind if ANY selector in its list qualifies):**
- `pFormat`: a lone `p` compound (e.g. `p`, `p.note` does NOT count — that's classScoped; `main p` counts contextual AND pFormat only when the final compound is bare `p`).
- `classGeneric`: compound is exactly `.name`. `classScoped`: compound is `tag.name`.
- `headingStyle`: any compound contains `h1`–`h6`.
- `hoverAnchor`: selector contains `a` compound with `:hover`.
- `group`: rule's selector list has ≥ 2 selectors (comma) whose final compounds are ≥ 2 different tags.
- `contextual`: selector has ≥ 2 compounds joined by descendant/child/sibling combinators.
- `idOnHeading`: compound `#x` or `h2#x` where (a) tag is h1–h6 in the selector, or (b) `doc.getElementById(x)` is a heading.
- `buttonStyle`: selector mentions `button`, `input[type=submit|button]`, or a class whose matched elements (doc) include a `<button>`/submit input, or class name contains `btn`/`button`.
- `flexbox`: declarations include `display:flex|inline-flex` or any `flex-*`/`justify-content`/`align-items` property.
- `positioning`: declarations include `position: relative|absolute|fixed|sticky`.
- `bodyStyle`/`headerStyle`/`footerStyle`: a compound is the bare tag `body`/`header`/`footer`.

- [ ] **Step 1: Write the failing test**

`tests/unit/css-analyzer.test.mjs`:
```js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchApp, snapshotFor } from '../helpers/harness.mjs';

let app;
before(async () => { app = await launchApp(); });
after(async () => { await app.close(); });

const SITE = {
  'index.html': `<html><head>
    <link rel="stylesheet" href="site.css">
    <style>#main-title { color: navy; } nav a { padding: 4px; }</style>
    </head><body>
    <header><h1 id="main-title">T</h1><nav><a href="index.html">x</a></nav></header>
    <p class="note">text</p><button class="cta">Go</button>
    <div class="unusedless"></div>
    <footer>f</footer></body></html>`,
  'site.css': `p { line-height: 1.5; }
    .cta { background: green; }
    p.note { color: #333; }
    h1, p { margin: 0; }
    header p a { color: red; }
    body { margin: 0; } header { display: flex; } footer { position: sticky; }
    a:hover { text-decoration: underline; }
    .never-used { color: pink; }`
};

test('classifies selector kinds and detects usage', async () => {
  const s = await snapshotFor(app.page, SITE, 'index.html');
  assert.deepEqual(s.css.external, ['site.css']);
  assert.equal(s.css.externalLinkedHere, true);
  const kindsOf = sel => s.css.rules.find(r => r.selector === sel).kinds;
  assert.ok(kindsOf('p').includes('pFormat'));
  assert.ok(kindsOf('.cta').includes('classGeneric'));
  assert.ok(kindsOf('p.note').includes('classScoped'));
  assert.ok(kindsOf('h1, p').includes('group'));
  assert.ok(kindsOf('h1, p').includes('headingStyle'));
  assert.ok(kindsOf('header p a').includes('contextual'));
  assert.ok(kindsOf('body').includes('bodyStyle'));
  assert.ok(kindsOf('header').includes('flexbox'));
  assert.ok(kindsOf('footer').includes('footerStyle'));
  assert.ok(kindsOf('footer').includes('positioning'));
  assert.ok(kindsOf('a:hover').includes('hoverAnchor'));
  assert.ok(kindsOf('#main-title').includes('idOnHeading'));
  assert.ok(kindsOf('nav a').includes('contextual'));
  const embedded = s.css.rules.filter(r => r.origin === 'embedded');
  assert.equal(embedded.length, 2);
  assert.equal(s.css.rules.find(r => r.selector === '.never-used').matches, false);
  assert.equal(s.css.rules.find(r => r.selector === '.cta').matches, true);
  assert.deepEqual(s.css.inline, []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `s.css` is null.

- [ ] **Step 3: Implement CssAnalyzer**

Replace `<script id="module-css"></script>` with:
```html
<script id="module-css">
(() => {
  const A = Automarker;
  const TAGS_H = /(^|[\s>+~,(])h[1-6]\b/i;

  function parseRules(text) {
    // Use the browser's CSS parser via a constructable stylesheet
    const sheet = new CSSStyleSheet();
    try { sheet.replaceSync(text); } catch { return []; }
    const out = [];
    const walk = rules => { for (const r of rules) {
      if (r instanceof CSSStyleRule)
        out.push({ selector: r.selectorText, props: [...r.style].map(p => p.toLowerCase()),
                   style: r.style });
      else if (r.cssRules) walk(r.cssRules);   // @media etc.
    } };
    walk(sheet.cssRules);
    return out;
  }

  const finalCompound = sel => sel.trim().split(/\s*[>+~]\s*|\s+/).pop() || '';
  const isBareTag = (comp, tag) => comp.toLowerCase() === tag;

  function classifySelector(selectorText, rule, doc) {
    const kinds = new Set();
    const sels = selectorText.split(',').map(s => s.trim()).filter(Boolean);
    const finalTags = new Set();
    for (const sel of sels) {
      const compounds = sel.split(/\s*[>+~]\s*|\s+/).filter(Boolean);
      const last = compounds[compounds.length - 1] || '';
      const lastNoPseudo = last.replace(/::?[a-z-]+(\([^)]*\))?/gi, '');
      const tagMatch = /^[a-z][a-z0-9]*/i.exec(lastNoPseudo);
      if (tagMatch) finalTags.add(tagMatch[0].toLowerCase());
      if (compounds.length >= 2) kinds.add('contextual');
      if (lastNoPseudo === 'p' || (compounds.length >= 2 && isBareTag(lastNoPseudo, 'p'))) kinds.add('pFormat');
      if (/^\.[A-Za-z_-][\w-]*$/.test(lastNoPseudo)) kinds.add('classGeneric');
      if (/^[a-z][a-z0-9]*\.[\w-]+$/i.test(lastNoPseudo)) kinds.add('classScoped');
      if (TAGS_H.test(' ' + sel)) kinds.add('headingStyle');
      if (/(^|[\s>+~,])a[^,]*:hover/i.test(' ' + sel)) kinds.add('hoverAnchor');
      if (isBareTag(lastNoPseudo, 'body') && compounds.length === 1) kinds.add('bodyStyle');
      if (isBareTag(lastNoPseudo, 'header') && compounds.length === 1) kinds.add('headerStyle');
      if (isBareTag(lastNoPseudo, 'footer') && compounds.length === 1) kinds.add('footerStyle');
      const idM = /#([\w-]+)/.exec(lastNoPseudo);
      if (idM) { const explicit = /^h[1-6]#/i.test(lastNoPseudo);
        const el = doc && doc.getElementById(idM[1]);
        if (explicit || (el && /^H[1-6]$/.test(el.tagName))) kinds.add('idOnHeading'); }
      if (/\bbutton\b/i.test(sel) || /input\[type=["']?(submit|button)/i.test(sel) ||
          /\.(btn|button)[\w-]*/i.test(sel)) kinds.add('buttonStyle');
      else if (doc && /^\.[\w-]+$/.test(lastNoPseudo)) {
        try { if ([...doc.querySelectorAll(lastNoPseudo)]
          .some(e => e.tagName === 'BUTTON' ||
            (e.tagName === 'INPUT' && /submit|button/i.test(e.type)))) kinds.add('buttonStyle'); }
        catch { /* invalid selector */ } }
    }
    if (sels.length >= 2 && finalTags.size >= 2) kinds.add('group');
    const props = rule ? rule.props : [];
    const val = p => rule ? rule.style.getPropertyValue(p) : '';
    if (/^(inline-)?flex$/.test(val('display')) ||
        props.some(p => p.startsWith('flex') || p === 'justify-content' || p === 'align-items'))
      kinds.add('flexbox');
    if (/^(relative|absolute|fixed|sticky)$/.test(val('position'))) kinds.add('positioning');
    return [...kinds];
  }
  A.CssAnalyzer = { classifySelector: (sel, rule, doc) => classifySelector(sel, rule, doc), parseRules };

  A.analyzerHooks.push((handle, snap, submission) => {
    const { doc } = handle;
    const rules = [];
    for (const src of handle.cssSources) {
      for (const r of parseRules(src.text)) {
        let matches = false;
        const stripped = r.selector.replace(/::?[a-z-]+(\([^)]*\))?/gi, '') || '*';
        try { matches = !!doc.querySelector(stripped); } catch { matches = false; }
        rules.push({ origin: src.origin, source: src.path, selector: r.selector,
          props: r.props, kinds: classifySelector(r.selector, r, doc), matches });
      }
    }
    const inline = [...doc.querySelectorAll('[style]')].map(el => ({
      tag: el.tagName.toLowerCase(),
      props: [...el.style].map(p => p.toLowerCase()) }));
    snap.css = {
      external: [...submission.files.keys()].filter(p => /\.css$/i.test(p)).sort(),
      externalLinkedHere: handle.cssSources.some(s => s.origin === 'external'),
      rules, inline };
  });
})();
</script>
```

Note: the inline-styles test expects `[]` because that fixture has no `style` attributes; the Task 5 fixture covers non-empty inline styles via `snap.inlineStyles`. `snap.css.inline` additionally records *which properties* each inline style sets (needed by the `inlineStyles` check's div/span sub-results).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add index.html tests/unit/css-analyzer.test.mjs
git commit -m "feat: CSS rule classification and usage analysis"
```

### Task 8: Check catalogue — registry + navigation & site mechanics

**Files:**
- Modify: `index.html` (fill `<script id="module-checks"></script>` with the registry and the first six checks)
- Test: `tests/unit/checks-mechanics.test.mjs`

**Interfaces:**
- Consumes: PageSnapshot (Tasks 5–7), `Automarker.util`.
- Produces:
  - `Automarker.registerCheck(id, meta, fn)` — stores `fn` in `Automarker.checks[id]` and `meta` in `Automarker.checkMeta[id]`. `meta = {label, scopes: [scope], params: [{key, label, type, default}]}` (drives the builder UI in Task 15). Check functions MAY be async; callers must `await`.
  - Helpers exposed as `Automarker.checkUtil`: `sub(id, label, pass, weight=1)`, `ev(level, text)`, `frac(list, pred)` (fraction of list passing pred; 0 for empty list), `jaccard(setA, setB)`.
  - Checks registered here: `navBar`, `pageCount`, `brokenResources`, `externalLink`, `emailLink`, `backToTop` — behaviour per the spec's catalogue section and the sub-results below.
- Every check receives `ctx = {snapshot?, snapshots, submission?, config, params}` and returns a `CheckResult`.

**Sub-result definitions (exact):**
- `navBar` (per page): `structure` (has `<nav>` OR ≥ 2 nav-classified internal page links, weight 1), `coverage` (`max(0, 1 − 0.4 × missingCount)` over *other existing pages*, weight 2 — the steep slope + double weight makes one missing link cost ≈ 1 point of 5 after rounding, matching marker intent), `working` (fraction of internal nav links whose target exists; 0 if no nav links, weight 1), `styled` (`min(1, styledSignals/2)`, weight 1), `consistency` (Jaccard of `{page} ∪ linkTargets` vs the site's modal such set, weight 1).
- `pageCount`: single sub-result `count` = `min(1, pages/minRequired)`; `instances` = one entry when short (drives the flat −15).
- `brokenResources`: `instances` only — per page: internal links with missing targets; `brokenAssets`; resolved-but-undecodable images (`ok:false`, not external, not already in brokenAssets). Deduped by `page|url`. Sub-result `none` = `instances.length === 0`.
- `externalLink`: `params.policy` — `'forbidden'`: instances = every external link/asset ref (drives −2 deductions); `'required'`: sub-result `present` = `min(1, externalNonMailtoLinkCount/params.min ?? 1)`.
- `emailLink`: sub-result `mailto` = any `mailto:` link on the scoped page(s).
- `backToTop` (per page): sub-result `present` = an anchor with `targetY !== null && targetY < 200` positioned in the lower half (`y > docHeight*0.4`), OR any top-targeting anchor when the page is shorter than the viewport.

- [ ] **Step 1: Write the failing test**

`tests/unit/checks-mechanics.test.mjs`:
```js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchApp, svg } from '../helpers/harness.mjs';

let app;
before(async () => { app = await launchApp(); });
after(async () => { await app.close(); });

// Build a snapshots map + run one check inside the page
const run = (site, checkId, params = {}, pagePath = 'index.html') =>
  app.page.evaluate(async ({ site, checkId, params, pagePath }) => {
    const sub = await Automarker.submissionFromTexts('t', site);
    const { snapshots } = await Automarker.analyzeSubmission(sub);
    const ctx = { snapshot: snapshots[pagePath], snapshots, submission: sub,
      config: Automarker.state.config ?? { meta: { minPages: 3 }, topic: { keywords: [], logoHints: ['logo'], locationHints: ['location','contact'], sectionHints: [] } },
      params };
    const res = await Automarker.checks[checkId](ctx);
    const w = res.subResults.reduce((a, s) => a + s.weight, 0);
    res._fraction = w ? res.subResults.reduce((a, s) => a + s.pass * s.weight, 0) / w : 0;
    return res;
  }, { site, checkId, params, pagePath });

const NAV = (extra = '') => `<nav style="background:#123;padding:8px">
  <a href="index.html" style="color:#fff;text-decoration:none;padding:6px">Home</a>
  <a href="a.html" style="color:#fff;text-decoration:none;padding:6px">A</a>
  <a href="b.html" style="color:#fff;text-decoration:none;padding:6px">B</a>${extra}</nav>`;
const GOOD = {
  'index.html': `<html><body>${NAV()}<p>home</p></body></html>`,
  'a.html': `<html><body>${NAV()}<p>a</p></body></html>`,
  'b.html': `<html><body>${NAV()}<p>b</p></body></html>`
};

test('navBar: full marks on complete consistent styled nav', async () => {
  const r = await run(GOOD, 'navBar');
  assert.equal(r._fraction, 1);
});

test('navBar: missing one page link lowers coverage only', async () => {
  const site = { ...GOOD, 'index.html': `<html><body><nav style="background:#123;padding:8px">
    <a href="a.html" style="color:#fff;text-decoration:none">A</a></nav><p>h</p></body></html>` };
  const r = await run(site, 'navBar');
  const cov = r.subResults.find(s => s.id === 'coverage');
  assert.equal(cov.pass, 0.6);                       // 1 − 0.4 × (1 missing: b.html)
  assert.equal(cov.weight, 2);
  assert.ok(r._fraction < 1);
  assert.ok(r.evidence.some(e => e.level === 'fail' && /b\.html/.test(e.text)));
});

test('navBar: dead nav link lowers working fraction', async () => {
  const site = { ...GOOD, 'index.html': `<html><body>${NAV('<a href="ghost.html">G</a>')}<p>h</p></body></html>` };
  const r = await run(site, 'navBar');
  assert.ok(r.subResults.find(s => s.id === 'working').pass < 1);
});

test('pageCount: flags shortfall with instance', async () => {
  const r = await run({ 'index.html': '<p>only</p>' }, 'pageCount', { min: 6 });
  assert.equal(r.subResults[0].pass < 1, true);
  assert.match(r.instances[0].text, /1 of 6/);
  const ok = await run(GOOD, 'pageCount', { min: 3 });
  assert.deepEqual(ok.instances, []);
});

test('brokenResources: lists dead links and missing images once each', async () => {
  const site = {
    'index.html': `<html><body><a href="nope.html">x</a><a href="nope.html">x2</a>
      <img src="img/gone.png"></body></html>` };
  const r = await run(site, 'brokenResources');
  assert.equal(r.instances.length, 2);               // deduped link + image
  assert.equal(r.subResults.find(s => s.id === 'none').pass, 0);
});

test('externalLink: both policies', async () => {
  const site = { 'index.html': `<html><body>
    <a href="https://en.wikipedia.org/wiki/X">More</a><a href="a.html">in</a></body></html>`,
    'a.html': '<p>a</p>' };
  const forb = await run(site, 'externalLink', { policy: 'forbidden' });
  assert.equal(forb.instances.length, 1);
  const req = await run(site, 'externalLink', { policy: 'required', min: 1 });
  assert.equal(req._fraction, 1);
  const reqFail = await run({ 'index.html': '<p>none</p>' }, 'externalLink', { policy: 'required', min: 1 });
  assert.equal(reqFail._fraction, 0);
});

test('emailLink and backToTop', async () => {
  const tall = `<html><body id="top"><a href="mailto:me@uni.edu">mail me</a>
    <div style="height:3000px"></div><a href="#top">Back to top</a></body></html>`;
  const mail = await run({ 'index.html': tall }, 'emailLink');
  assert.equal(mail._fraction, 1);
  const bt = await run({ 'index.html': tall }, 'backToTop');
  assert.equal(bt._fraction, 1);
  const noBt = await run({ 'index.html': '<html><body><div style="height:3000px"></div></body></html>' }, 'backToTop');
  assert.equal(noBt._fraction, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Automarker.checks.navBar` undefined.

- [ ] **Step 3: Implement registry + mechanics checks**

Replace `<script id="module-checks"></script>` with:
```html
<script id="module-checks">
(() => {
  const A = Automarker;
  const sub = (id, label, pass, weight = 1) =>
    ({ id, label, pass: A.util.clamp(pass, 0, 1), weight });
  const ev = (level, text) => ({ level, text });
  const frac = (list, pred) => list.length ? list.filter(pred).length / list.length : 0;
  const jaccard = (a, b) => { const A1 = new Set(a), B1 = new Set(b);
    const inter = [...A1].filter(x => B1.has(x)).length;
    const uni = new Set([...A1, ...B1]).size;
    return uni ? inter / uni : 1; };
  A.checkUtil = { sub, ev, frac, jaccard };
  A.registerCheck = (id, meta, fn) => { A.checks[id] = fn; A.checkMeta[id] = meta; };
  const livePages = snapshots => Object.values(snapshots).filter(s => !s.error);

  A.registerCheck('navBar',
    { label: 'Navigation bar (structure, coverage, working links, styling, consistency)',
      scopes: ['home', 'eachSubpage', 'eachPage'], params: [] },
    ({ snapshot: s, snapshots }) => {
      const others = livePages(snapshots).map(p => p.path).filter(p => p !== s.path);
      const navLinks = s.links.filter(l => l.inNav && l.internal);
      const fullSet = p => JSON.stringify([...new Set([p.path, ...p.nav.linkTargets])].sort());
      const counts = new Map();
      for (const p of livePages(snapshots)) counts.set(fullSet(p), (counts.get(fullSet(p)) || 0) + 1);
      const modal = JSON.parse([...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '[]');
      const evidence = [];
      const missing = others.filter(p => !s.nav.linkTargets.includes(p));
      if (missing.length) evidence.push(ev('fail', `${s.path}: nav missing link(s) to ${missing.join(', ')}`));
      const dead = navLinks.filter(l => !l.targetExists);
      if (dead.length) evidence.push(ev('fail', `${s.path}: nav link(s) to missing file(s): ${dead.map(l => l.raw).join(', ')}`));
      if (!missing.length && !dead.length) evidence.push(ev('pass', `${s.path}: nav links to all ${others.length} other page(s) and all targets exist`));
      if (s.nav.styledSignals < 2) evidence.push(ev('fail', `${s.path}: nav appears unstyled (only ${s.nav.styledSignals} styling signals)`));
      return { subResults: [
        sub('structure', 'Nav structure present', (s.nav.hasNavElement || navLinks.length >= 2) ? 1 : 0),
        sub('coverage', 'Links to every other page',
          Math.max(0, 1 - 0.4 * missing.length), 2),
        sub('working', 'Nav link targets exist', navLinks.length ? frac(navLinks, l => l.targetExists) : 0),
        sub('styled', 'Nav is CSS-styled', Math.min(1, s.nav.styledSignals / 2)),
        sub('consistency', 'Consistent with site nav', jaccard(JSON.parse(fullSet(s)), modal))
      ], evidence };
    });

  A.registerCheck('pageCount',
    { label: 'Minimum page count', scopes: ['site'],
      params: [{ key: 'min', label: 'Minimum pages', type: 'number', default: 6 }] },
    ({ submission, config, params }) => {
      const min = params.min ?? config.meta.minPages;
      const n = submission.pages.length;
      const short = n < min;
      return { subResults: [sub('count', `At least ${min} pages`, Math.min(1, n / min))],
        evidence: [ev(short ? 'fail' : 'pass', `${n} of ${min} required page(s) found`)],
        instances: short ? [{ text: `Only ${n} of ${min} required pages found` }] : [] };
    });

  A.registerCheck('brokenResources',
    { label: 'Broken links / images / assets', scopes: ['site'], params: [] },
    ({ snapshots }) => {
      const seen = new Set(); const instances = [];
      const add = (page, kind, url) => { const k = `${page}|${url}`;
        if (seen.has(k)) return; seen.add(k);
        instances.push({ page, text: `${page}: ${kind} "${url}"` }); };
      for (const s of livePages(snapshots)) {
        for (const l of s.links) if (l.internal && !l.targetExists) add(s.path, 'link target missing', l.raw);
        for (const b of s.brokenAssets) add(s.path, `broken ${b.kind}`, b.url);
        for (const i of s.images) if (!i.ok && !i.external &&
          !s.brokenAssets.some(b => b.url === i.raw)) add(s.path, 'image failed to display', i.raw);
      }
      return { subResults: [sub('none', 'No broken links or assets', instances.length ? 0 : 1)],
        evidence: instances.length ? instances.map(i => ev('fail', i.text))
                                   : [ev('pass', 'No broken links, images, or assets found')],
        instances };
    });

  A.registerCheck('externalLink',
    { label: 'External links policy', scopes: ['site', 'home', 'eachPage'],
      params: [{ key: 'policy', label: 'forbidden or required', type: 'string', default: 'forbidden' },
               { key: 'min', label: 'Minimum required', type: 'number', default: 1 }] },
    ({ snapshot, snapshots, params }) => {
      const pages = snapshot ? [snapshot] : livePages(snapshots);
      const extLinks = pages.flatMap(s => s.links.filter(l => l.external)
        .map(l => ({ page: s.path, url: l.raw })));
      const extRefs = pages.flatMap(s => (s.externalRefs || [])
        .map(r => ({ page: r.page ?? s.path, url: r.url })));
      if (params.policy === 'required') {
        const min = params.min ?? 1;
        return { subResults: [sub('present', `≥ ${min} external reference link(s)`,
            Math.min(1, extLinks.length / min))],
          evidence: [ev(extLinks.length >= min ? 'pass' : 'fail',
            `${extLinks.length} external link(s) found${extLinks[0] ? ` (e.g. ${extLinks[0].url})` : ''}`)] };
      }
      const all = [...extLinks, ...extRefs];
      const seen = new Set(); const instances = [];
      for (const e of all) { const k = `${e.page}|${e.url}`; if (seen.has(k)) continue;
        seen.add(k); instances.push({ page: e.page, text: `${e.page}: external/absolute reference "${e.url}"` }); }
      return { subResults: [sub('none', 'No external/absolute references', instances.length ? 0 : 1)],
        evidence: instances.length ? instances.map(i => ev('fail', i.text))
                                   : [ev('pass', 'All references are relative')],
        instances };
    });

  A.registerCheck('emailLink',
    { label: 'Email (mailto:) link present', scopes: ['site', 'home', 'eachPage'], params: [] },
    ({ snapshot, snapshots }) => {
      const pages = snapshot ? [snapshot] : livePages(snapshots);
      const hit = pages.flatMap(s => s.links).find(l => l.mailto);
      return { subResults: [sub('mailto', 'mailto: link present', hit ? 1 : 0)],
        evidence: [ev(hit ? 'pass' : 'fail', hit ? `Email link found (${hit.raw})` : 'No mailto: link found')] };
    });

  A.registerCheck('backToTop',
    { label: 'Back-to-top control', scopes: ['home', 'eachSubpage', 'eachPage'], params: [] },
    ({ snapshot: s }) => {
      const shortPage = s.docHeight <= s.viewport.h;
      const hit = s.anchors.find(a => a.targetY !== null && a.targetY < 200 &&
        (shortPage || a.y > s.docHeight * 0.4));
      return { subResults: [sub('present', 'Back-to-top anchor', hit ? 1 : 0)],
        evidence: [ev(hit ? 'pass' : 'fail', hit
          ? `${s.path}: back-to-top control found ("${hit.text || hit.href}")`
          : `${s.path}: no back-to-top control targeting the page top`)] };
    });
})();
</script>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add index.html tests/unit/checks-mechanics.test.mjs
git commit -m "feat: check registry and navigation/site-mechanics checks"
```

---

### Task 9: Checks — design metrics

**Files:**
- Modify: `index.html` (append to `<script id="module-checks">`, before its closing `</script>`)
- Test: `tests/unit/checks-design.test.mjs`

**Interfaces:**
- Consumes: registry + `checkUtil` (Task 8), snapshot style fields (Task 6).
- Produces checks: `colourTheme`, `typography`, `whiteSpace`, `margins`, `sectionStructure`, `images`, `logo`, `pageWeight`. All take `ctx.snapshot` (per-page; the engine handles aggregation for `subpages` scope).

**Sub-result definitions (exact):**
- `colourTheme`: `nonDefault` (palette.nonDefault); `hues` (1 ≤ distinctHues ≤ 6 → 1; 7–8 → 0.5; 0 or > 8 → 0); `noClash` (highSatHues ≤ 2 → 1; each extra high-sat hue −0.5); `richness` (colors.length ≥ 3 → 1; 2 → 0.5). With `params.consistency` true: `consistent` = Jaccard of this page's top-5 colour keys vs the site's most common top-5 set.
- `typography`: `customFont` (!defaultFontOnly); `size` (14–20 px → 1; 12–13 or 21–24 → 0.5; else 0); `contrast` (≥ 4.5 → 1; ≥ 3 → 0.5; else 0).
- `whiteSpace`: `noOverflow` (!horizontalOverflow); `constrained` (contentWidthRatio ≤ 0.98); `gaps` (sectionGapAvg ≥ 12 → 1; ≥ 6 → 0.5).
- `margins`: single `inset` (min(insetLeft, insetRight) ≥ 8 → 1; ≥ 2 → 0.5; else 0).
- `sectionStructure`: `sections` (sectionCount ≥ 2 → 1; 1 → 0.5); `headings` (h1 ≥ 1 AND h2+h3 ≥ 1 → 1; any heading → 0.5); `semantic` (≥ 3 semantic tags → 1; ≥ 1 → 0.5).
- `images` (`params: {min=1, minWidth=150, relevance=true}`): `count` (good images / min, weight 2) where good = ok AND displayW ≥ minWidth; `sized` (fraction of good not stretched > 1.5× natural, weight 1); when relevance: `relevant` (any good image whose alt/filename matches a topic keyword, weight 1) and set `needsReview: true`.
- `logo` (`params: {requireLink=false}`): candidates = images with y < min(300, docHeight·0.25) whose raw/alt matches `topic.logoHints`; `present` (weight 2); `linked` (candidate linkTarget === homePath — weight 1, or full requirement when requireLink); `placedLeft` (candidate x < viewport.w/3, weight 0.5).
- `pageWeight`: `weight` (KB ≤ fullKB → 1; ≤ partialKB → 0.5; else 0) using `config.meta.weightThresholds`.

- [ ] **Step 1: Write the failing test**

`tests/unit/checks-design.test.mjs`:
```js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchApp, svg } from '../helpers/harness.mjs';

let app;
before(async () => { app = await launchApp(); });
after(async () => { await app.close(); });

const run = (site, checkId, params = {}, pagePath = 'index.html', extraCfg = {}) =>
  app.page.evaluate(async ({ site, checkId, params, pagePath, extraCfg }) => {
    const sub = await Automarker.submissionFromTexts('t', site);
    const { snapshots } = await Automarker.analyzeSubmission(sub);
    const ctx = { snapshot: snapshots[pagePath], snapshots, submission: sub,
      config: { meta: { minPages: 6, viewport: { w: 1280, h: 800 },
          weightThresholds: { fullKB: 1536, partialKB: 4096 }, ...extraCfg.meta },
        topic: { keywords: ['sport', 'shoes'], sectionHints: [], spellWhitelist: [],
          logoHints: ['logo', 'brand'], locationHints: [], ...extraCfg.topic } },
      params };
    const res = await Automarker.checks[checkId](ctx);
    const w = res.subResults.reduce((a, s) => a + s.weight, 0);
    res._fraction = w ? res.subResults.reduce((a, s) => a + s.pass * s.weight, 0) / w : 0;
    return res;
  }, { site, checkId, params, pagePath, extraCfg });

const STYLED = {
  'index.html': `<html><head><style>
    body{margin:0;font-family:Arial,sans-serif;background:#eef2f5}
    main{max-width:960px;margin:0 auto;padding:24px}
    section{margin-bottom:28px;background:#fff;padding:16px}
    h1{color:#0b3d66} h2{color:#0b3d66} p{font-size:16px;color:#1c1c1c}
    .hero{background:#e67e22;height:160px}
  </style></head><body><header>
    <a href="index.html"><img src="img/logo.svg" alt="Store logo" width="120"></a></header>
    <main><h1>Shop</h1><section class="hero"></section>
    <section><h2>Shoes</h2><p>Sport shoes paragraph with enough words to measure size and colour.</p>
    <img src="img/shoes.svg" alt="running shoes for sport" width="300"></section></main></body></html>`,
  'img/logo.svg': svg(240, 120, '#0b3d66'),
  'img/shoes.svg': svg(600, 400, '#666')
};
const PLAIN = { 'index.html': '<html><body><p>plain</p></body></html>' };

test('design checks pass on the styled page', async () => {
  for (const id of ['colourTheme', 'typography', 'whiteSpace', 'margins', 'sectionStructure']) {
    const r = await run(STYLED, id);
    assert.ok(r._fraction >= 0.8, `${id} fraction ${r._fraction}`);
  }
});

test('design checks fail/degrade on an unstyled page', async () => {
  for (const id of ['colourTheme', 'typography', 'margins']) {
    const r = await run(PLAIN, id);
    assert.ok(r._fraction <= 0.5, `${id} fraction ${r._fraction}`);
  }
});

test('images: counts well-sized images, flags stretching, marks relevance for review', async () => {
  const good = await run(STYLED, 'images', { min: 1 });
  assert.equal(good.subResults.find(s => s.id === 'count').pass, 1);
  assert.equal(good.needsReview, true);
  assert.equal(good.subResults.find(s => s.id === 'relevant').pass, 1); // alt mentions sport/shoes
  const stretched = { 'index.html': `<img src="img/tiny.svg" width="600" height="400">`,
    'img/tiny.svg': svg(40, 30) };
  const r2 = await run(stretched, 'images', { min: 1 });
  assert.equal(r2.subResults.find(s => s.id === 'sized').pass, 0);
  const short = await run(STYLED, 'images', { min: 2 });
  assert.equal(short.subResults.find(s => s.id === 'count').pass, 0.5); // 1 of 2 required
});

test('logo: detects linked top-left logo; absent on plain page', async () => {
  const r = await run(STYLED, 'logo');
  assert.equal(r.subResults.find(s => s.id === 'present').pass, 1);
  assert.equal(r.subResults.find(s => s.id === 'linked').pass, 1);
  const none = await run(PLAIN, 'logo');
  assert.equal(none._fraction, 0);
});

test('pageWeight: light page passes, heavy page partial/zero', async () => {
  const light = await run(STYLED, 'pageWeight');
  assert.equal(light._fraction, 1);
  const heavy = { 'index.html': '<img src="big.svg">',
    'big.svg': svg(100, 100).replace('</svg>', 'x'.repeat(2_000_000) + '</svg>') };
  const r = await run(heavy, 'pageWeight');
  assert.equal(r._fraction, 0.5);   // ~2 MB → partial band
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Automarker.checks.colourTheme` undefined.

- [ ] **Step 3: Implement design-metric checks**

Append inside `<script id="module-checks">` before its closing `</script>` (the registry IIFE closes with `})();` — add a new IIFE after it):
```js
(() => {
  const A = Automarker, { sub, ev, frac, jaccard } = A.checkUtil;
  const band = (v, full, partial) => v >= full ? 1 : v >= partial ? 0.5 : 0;
  const live = snaps => Object.values(snaps).filter(s => !s.error);
  const topColors = s => (s.palette?.colors ?? []).slice(0, 5).map(c => `${c.r},${c.g},${c.b}`);

  A.registerCheck('colourTheme',
    { label: 'Colour theme blending', scopes: ['home', 'subpages', 'eachPage'],
      params: [{ key: 'consistency', label: 'Require cross-page consistency', type: 'boolean', default: false }] },
    ({ snapshot: s, snapshots, params }) => {
      const p = s.palette ?? { nonDefault: false, distinctHues: 0, highSatHues: 0, colors: [] };
      const subs = [
        sub('nonDefault', 'Non-default colours used', p.nonDefault ? 1 : 0),
        sub('hues', 'Coherent hue count', p.distinctHues >= 1 && p.distinctHues <= 6 ? 1
          : p.distinctHues <= 8 ? 0.5 : 0),
        sub('noClash', 'No clashing saturated hues', Math.max(0, 1 - Math.max(0, p.highSatHues - 2) * 0.5)),
        sub('richness', 'More than two colours', p.colors.length >= 3 ? 1 : p.colors.length === 2 ? 0.5 : 0)
      ];
      const evidence = [ev(p.nonDefault ? 'pass' : 'fail',
        `${s.path}: ${p.colors.length} colour(s), ${p.distinctHues} hue group(s), ${p.highSatHues} high-saturation`)];
      if (params.consistency) {
        const counts = new Map();
        for (const o of live(snapshots)) { const k = JSON.stringify(topColors(o).sort());
          counts.set(k, (counts.get(k) || 0) + 1); }
        const modal = JSON.parse([...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '[]');
        subs.push(sub('consistent', 'Palette consistent across pages',
          jaccard(topColors(s), modal)));
      }
      return { subResults: subs, evidence };
    });

  A.registerCheck('typography',
    { label: 'Fonts, sizes and contrast', scopes: ['home', 'subpages', 'eachPage'], params: [] },
    ({ snapshot: s }) => {
      const t = s.typography ?? { defaultFontOnly: true, bodySizePx: 16, contrastRatio: 21, families: [] };
      const size = t.bodySizePx;
      return { subResults: [
          sub('customFont', 'Non-default font family', t.defaultFontOnly ? 0 : 1),
          sub('size', 'Readable body size (14–20px)',
            size >= 14 && size <= 20 ? 1 : (size >= 12 && size <= 24 ? 0.5 : 0)),
          sub('contrast', 'Text contrast ≥ 4.5:1', band(t.contrastRatio, 4.5, 3))
        ],
        evidence: [ev(t.defaultFontOnly ? 'fail' : 'pass',
          `${s.path}: fonts [${t.families.join(', ')}], body ${size}px, contrast ${t.contrastRatio}:1`)] };
    });

  A.registerCheck('whiteSpace',
    { label: 'Layout balance and white space', scopes: ['home', 'subpages', 'eachPage'], params: [] },
    ({ snapshot: s }) => {
      const sp = s.spacing ?? { horizontalOverflow: true, contentWidthRatio: 1, sectionGapAvg: 0 };
      return { subResults: [
          sub('noOverflow', 'No horizontal overflow', sp.horizontalOverflow ? 0 : 1),
          sub('constrained', 'Content width constrained', sp.contentWidthRatio <= 0.98 ? 1 : 0),
          sub('gaps', 'Breathing room between sections', band(sp.sectionGapAvg, 12, 6))
        ],
        evidence: [ev('info',
          `${s.path}: width ratio ${sp.contentWidthRatio}, avg section gap ${sp.sectionGapAvg}px${sp.horizontalOverflow ? ', HORIZONTAL OVERFLOW' : ''}`)] };
    });

  A.registerCheck('margins',
    { label: 'Page margins', scopes: ['home', 'subpages', 'eachPage'], params: [] },
    ({ snapshot: s }) => {
      const sp = s.spacing ?? { insetLeft: 0, insetRight: 0 };
      const inset = Math.min(sp.insetLeft, sp.insetRight);
      return { subResults: [sub('inset', 'Content inset from edges', band(inset, 8, 2))],
        evidence: [ev(inset >= 8 ? 'pass' : 'fail',
          `${s.path}: content inset ${sp.insetLeft}px left / ${sp.insetRight}px right`)] };
    });

  A.registerCheck('sectionStructure',
    { label: 'Clear sections and headings', scopes: ['home', 'subpages', 'eachPage'], params: [] },
    ({ snapshot: s }) => {
      const st = s.structure; const h = st.headings;
      const anyHeading = h.h1 + h.h2 + h.h3 + h.h4 + h.h5 + h.h6 > 0;
      return { subResults: [
          sub('sections', '≥ 2 content sections', st.sectionCount >= 2 ? 1 : st.sectionCount === 1 ? 0.5 : 0),
          sub('headings', 'Heading hierarchy', h.h1 >= 1 && (h.h2 + h.h3) >= 1 ? 1 : anyHeading ? 0.5 : 0),
          sub('semantic', 'Semantic HTML elements', st.semanticTags.length >= 3 ? 1 : st.semanticTags.length ? 0.5 : 0)
        ],
        evidence: [ev('info', `${s.path}: ${st.sectionCount} section(s), h1×${h.h1} h2×${h.h2} h3×${h.h3}, semantic [${st.semanticTags.join(', ')}]`)] };
    });

  A.registerCheck('images',
    { label: 'Relevant, well-sized images', scopes: ['home', 'subpages', 'eachPage'],
      params: [{ key: 'min', label: 'Minimum images', type: 'number', default: 1 },
               { key: 'minWidth', label: 'Min displayed width (px)', type: 'number', default: 150 },
               { key: 'relevance', label: 'Check topic relevance', type: 'boolean', default: true }] },
    ({ snapshot: s, config, params }) => {
      const min = params.min ?? 1, minW = params.minWidth ?? 150;
      const good = s.images.filter(i => i.ok && i.displayW >= minW);
      const subs = [
        sub('count', `≥ ${min} well-sized image(s)`, Math.min(1, good.length / min), 2),
        sub('sized', 'Not stretched beyond 1.5× natural size',
          good.length ? frac(good, i => i.displayW <= i.naturalW * 1.5 + 2) : 0)
      ];
      const evidence = [ev(good.length >= min ? 'pass' : 'fail',
        `${s.path}: ${good.length} of ${min} required image(s) ≥ ${minW}px wide (${s.images.length} total)`)];
      let needsReview;
      if (params.relevance !== false) {
        const kws = (config.topic.keywords || []).map(k => k.toLowerCase());
        const rel = good.some(i => kws.some(k =>
          (i.alt || '').toLowerCase().includes(k) || i.raw.toLowerCase().includes(k)));
        subs.push(sub('relevant', 'Images relevant to topic (confirm visually)', rel ? 1 : 0));
        needsReview = true;
        evidence.push(ev('info', 'Image relevance is heuristic — confirm against the preview'));
      }
      return { subResults: subs, evidence, needsReview };
    });

  A.registerCheck('logo',
    { label: 'Logo presence (top, linked home)', scopes: ['home', 'subpages', 'eachPage'],
      params: [{ key: 'requireLink', label: 'Link-to-home required for full marks', type: 'boolean', default: false }] },
    ({ snapshot: s, snapshots, submission, config, params }) => {
      const re = new RegExp((config.topic.logoHints || ['logo']).join('|'), 'i');
      const home = submission ? submission.homePath
        : Object.keys(snapshots).find(p => /(^|\/)index\.html?$/i.test(p));
      const cands = s.images.filter(i =>
        i.y < Math.min(300, s.docHeight * 0.25) && (re.test(i.raw) || re.test(i.alt || '')));
      const linked = cands.some(c => c.linkTarget && c.linkTarget === home);
      return { subResults: [
          sub('present', 'Logo image near top of page', cands.length ? 1 : 0, 2),
          sub('linked', 'Logo links to home', linked ? 1 : 0, params.requireLink ? 2 : 1),
          sub('placedLeft', 'Logo on the left', cands.some(c => c.x < s.viewport.w / 3) ? 1 : 0, 0.5)
        ],
        evidence: [ev(cands.length ? 'pass' : 'fail', cands.length
          ? `${s.path}: logo "${cands[0].raw}"${linked ? ', linked to home' : ', NOT linked to home'}`
          : `${s.path}: no image matching [${(config.topic.logoHints || []).join(', ')}] near the top`)] };
    });

  A.registerCheck('pageWeight',
    { label: 'Page loads fast (total bytes)', scopes: ['home', 'subpages', 'eachPage'], params: [] },
    ({ snapshot: s, config }) => {
      const kb = Math.round(s.weightBytes / 1024);
      const t = config.meta.weightThresholds || { fullKB: 1536, partialKB: 4096 };
      return { subResults: [sub('weight', `Page + assets ≤ ${t.fullKB} KB`, band(-kb, -t.fullKB, -t.partialKB))],
        evidence: [ev(kb <= t.fullKB ? 'pass' : 'fail', `${s.path}: ${kb} KB total`)] };
    });
})();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS. Note `band(-kb, -t.fullKB, -t.partialKB)` inverts the comparison so smaller is better — verify the heavy-page case lands on 0.5.

- [ ] **Step 5: Commit**

```bash
git add index.html tests/unit/checks-design.test.mjs
git commit -m "feat: design-metric checks (colour, typography, spacing, images, logo, weight)"
```

### Task 10: Checks — CSS-structural and content

**Files:**
- Modify: `index.html` (append a third IIFE inside `<script id="module-checks">`)
- Test: `tests/unit/checks-css.test.mjs`, `tests/unit/checks-content.test.mjs`

**Interfaces:**
- Consumes: registry (Task 8), `snap.css` (Task 7), `snap.responsive` (Task 6).
- Produces checks: `cssExternal`, `cssSelectorTypes`, `cssUnused`, `inlineStyles`, `wordCount`, `mediaPresence`, `responsive`, `directions`.

**Sub-result definitions (exact):**
- `cssExternal` (site): `exists` (≥ 1 `.css` file in the zip, weight 1); `linkedAll` (fraction of pages with `css.externalLinkedHere`, weight 2).
- `cssSelectorTypes` (site; `params.requirements = [{kind, min, origin}]`): one sub-result per requirement, id `req-<origin>-<kind>`, pass = `min(1, distinctCount/min)`. Distinct = unique `selector|source` pairs across all pages whose `kinds` include the kind and whose origin matches (`any` matches both). Evidence lists each unmet requirement by name.
- `cssUnused` (site): unused = rules (unique `selector|source|origin`) with `matches === false` on EVERY page; `none` = 1 − min(1, unusedCount/10); `instances` = one per unused selector (for per-instance deduction use).
- `inlineStyles` (per page; `params: {min=3, requireTags=['div','span']}`): `count` (inlineStyles.count/min, weight 2) + one sub-result per required tag (tag present in `inlineStyles.tags`, weight 1 each).
- `wordCount` (per page; `params: {min}`): `words` = min(1, wordCount/min).
- `mediaPresence` (per page or site; `params: {require: [{kind: 'video'|'gif'|'iframe'|'img', min}], anyOf: false}`): sub-result per requirement from `snap.media` counts (`img` uses `images.filter(ok).length`); `anyOf: true` → single sub-result `any` that passes if at least one requirement is fully met (the IWBS "video OR gif" case).
- `responsive` (per page): `noOverflow` (fraction of `responsive` entries without horizontalOverflow, weight 2); `adapts` (contentWidthRatio ≥ 0.85 at the narrowest width, weight 1).
- `directions` (site): locate the location page = highest score of (path matches `topic.locationHints` × 3) + (title matches × 2) + (hint keyword count in visibleText); on it: `address` (street-address regex), `hours` (day names/`open` + a time pattern), `map` (image with `map` in raw/alt), `contact` (phone regex or mailto link). Evidence names the chosen page. If no pages exist → all fail.

- [ ] **Step 1: Write the failing tests**

`tests/unit/checks-css.test.mjs`:
```js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchApp } from '../helpers/harness.mjs';

let app;
before(async () => { app = await launchApp(); });
after(async () => { await app.close(); });

const run = (site, checkId, params = {}, pagePath = null) =>
  app.page.evaluate(async ({ site, checkId, params, pagePath }) => {
    const sub = await Automarker.submissionFromTexts('t', site);
    const { snapshots } = await Automarker.analyzeSubmission(sub);
    const ctx = { snapshot: pagePath ? snapshots[pagePath] : undefined, snapshots, submission: sub,
      config: { meta: { minPages: 3 }, topic: { keywords: [], sectionHints: [], logoHints: [], locationHints: [] } },
      params };
    const res = await Automarker.checks[checkId](ctx);
    const w = res.subResults.reduce((a, s) => a + s.weight, 0);
    res._fraction = w ? res.subResults.reduce((a, s) => a + s.pass * s.weight, 0) / w : 0;
    return res;
  }, { site, checkId, params, pagePath });

const CSS = `p { color: #222; } .box { padding: 8px; } .card { margin: 4px; } .tag { border: 0; }
  h1.title { color: navy; } p.lead { font-weight: bold; } a.nav { color: red; }
  h1 { margin: 0; } h2 { margin: 0; } h3 { margin: 0; }
  a:hover { color: green; } h1, h2 { padding: 0; } p, li { margin: 2px; }
  nav a { padding: 6px; } button { background: blue; }
  .flexy { display: flex; } .ghost { color: pink; }`;
const PAGE = cls => `<html><head><link rel="stylesheet" href="s.css">
  <style>#hd { color: red; } main p { margin: 1px; } .para { font-size: 15px; }
    div { position: relative; } header { border: 0; } footer { border: 0; } body { margin: 0; }</style>
  </head><body><header><h1 id="hd" class="title">T</h1><nav><a class="nav" href="index.html">x</a></nav></header>
  <main><p class="lead para">t</p><li class="tag">i</li>
  <div class="box flexy" style="color:#111"><span style="font-weight:bold">s</span>
  <b style="color:#222">b</b></div>
  <h2>a</h2><h3>b</h3><button>Go</button>${cls || ''}</main><footer>f</footer></body></html>`;
const SITE = { 'index.html': PAGE(), 'two.html': PAGE(), 's.css': CSS };

test('cssExternal passes when all pages link the stylesheet', async () => {
  const r = await run(SITE, 'cssExternal');
  assert.equal(r._fraction, 1);
  const half = await run({ ...SITE, 'two.html': '<html><body>nolink</body></html>' }, 'cssExternal');
  assert.ok(half._fraction < 1 && half._fraction > 0.3);
});

test('cssSelectorTypes: IWBS-style requirement set', async () => {
  const reqs = [
    { kind: 'pFormat', min: 1, origin: 'external' },
    { kind: 'classGeneric', min: 3, origin: 'external' },
    { kind: 'classScoped', min: 3, origin: 'external' },
    { kind: 'headingStyle', min: 3, origin: 'external' },
    { kind: 'hoverAnchor', min: 1, origin: 'external' },
    { kind: 'group', min: 2, origin: 'external' },
    { kind: 'contextual', min: 1, origin: 'external' },
    { kind: 'buttonStyle', min: 1, origin: 'external' },
    { kind: 'flexbox', min: 1, origin: 'external' },
    { kind: 'idOnHeading', min: 1, origin: 'embedded' },
    { kind: 'positioning', min: 1, origin: 'embedded' },
    { kind: 'bodyStyle', min: 1, origin: 'embedded' },
    { kind: 'headerStyle', min: 1, origin: 'embedded' },
    { kind: 'footerStyle', min: 1, origin: 'embedded' }
  ];
  const r = await run(SITE, 'cssSelectorTypes', { requirements: reqs });
  assert.equal(r._fraction, 1, JSON.stringify(r.subResults.filter(s => s.pass < 1)));
  const missingHover = { ...SITE, 's.css': CSS.replace('a:hover { color: green; }', '') };
  const r2 = await run(missingHover, 'cssSelectorTypes', { requirements: reqs });
  assert.equal(r2.subResults.find(s => s.id === 'req-external-hoverAnchor').pass, 0);
  assert.ok(r2.evidence.some(e => e.level === 'fail' && /hoverAnchor/.test(e.text)));
});

test('cssUnused finds selectors that match nothing on any page', async () => {
  const r = await run(SITE, 'cssUnused');
  assert.ok(r.instances.some(i => /\.ghost/.test(i.text)));
  assert.ok(r.subResults[0].pass < 1);
});

test('inlineStyles: count and required tags', async () => {
  const r = await run(SITE, 'inlineStyles', { min: 3, requireTags: ['div', 'span'] }, 'index.html');
  assert.equal(r._fraction, 1);
  const missingSpan = { 'index.html': `<div style="color:red">a</div><p style="color:blue">b</p><b style="x:y">c</b>` };
  const r2 = await run(missingSpan, 'inlineStyles', { min: 3, requireTags: ['div', 'span'] }, 'index.html');
  assert.equal(r2.subResults.find(s => s.id === 'tag-span').pass, 0);
  assert.equal(r2.subResults.find(s => s.id === 'tag-div').pass, 1);
});
```

`tests/unit/checks-content.test.mjs`:
```js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchApp, svg } from '../helpers/harness.mjs';

let app;
before(async () => { app = await launchApp(); });
after(async () => { await app.close(); });

const run = (site, checkId, params = {}, pagePath = null, topic = {}) =>
  app.page.evaluate(async ({ site, checkId, params, pagePath, topic }) => {
    const sub = await Automarker.submissionFromTexts('t', site);
    const { snapshots } = await Automarker.analyzeSubmission(sub);
    const ctx = { snapshot: pagePath ? snapshots[pagePath] : undefined, snapshots, submission: sub,
      config: { meta: { minPages: 3, viewport: { w: 1280, h: 800 } },
        topic: { keywords: [], sectionHints: [], logoHints: [],
                 locationHints: ['location', 'contact', 'visit', 'find'], ...topic } },
      params };
    const res = await Automarker.checks[checkId](ctx);
    const w = res.subResults.reduce((a, s) => a + s.weight, 0);
    res._fraction = w ? res.subResults.reduce((a, s) => a + s.pass * s.weight, 0) / w : 0;
    return res;
  }, { site, checkId, params, pagePath, topic });

test('wordCount: proportional to minimum', async () => {
  const words = n => Array.from({ length: n }, (_, i) => 'word' + i).join(' ');
  const site = { 'index.html': `<p>${words(100)}</p>` };
  assert.equal((await run(site, 'wordCount', { min: 100 }, 'index.html'))._fraction, 1);
  assert.equal((await run(site, 'wordCount', { min: 200 }, 'index.html'))._fraction, 0.5);
});

test('mediaPresence: anyOf video/gif satisfied by a gif image', async () => {
  const site = { 'index.html': '<img src="fun.gif">', 'fun.gif': { b64: 'R0lGODlhAQABAAAAACw=' } };
  const r = await run(site, 'mediaPresence',
    { require: [{ kind: 'video', min: 1 }, { kind: 'gif', min: 1 }], anyOf: true }, 'index.html');
  assert.equal(r._fraction, 1);
  const none = await run({ 'index.html': '<p>x</p>' }, 'mediaPresence',
    { require: [{ kind: 'video', min: 1 }, { kind: 'gif', min: 1 }], anyOf: true }, 'index.html');
  assert.equal(none._fraction, 0);
});

test('responsive: fluid page passes, fixed-width page fails', async () => {
  const fluid = { 'index.html': `<html><head><style>main{max-width:100%;padding:8px}</style></head>
    <body><main><p>flexible content</p></main></body></html>` };
  assert.ok((await run(fluid, 'responsive', {}, 'index.html'))._fraction >= 0.6);
  const fixed = { 'index.html': '<body><div style="width:1200px">rigid</div></body>' };
  assert.ok((await run(fixed, 'responsive', {}, 'index.html'))._fraction < 0.6);
});

test('directions: finds the contact page and its address/hours/map/contact details', async () => {
  const site = {
    'index.html': '<a href="contact.html">contact</a>',
    'contact.html': `<html><head><title>Visit us</title></head><body>
      <h1>Find our store</h1><p>123 Plenty Road, Bundoora VIC 3083</p>
      <p>Open Mon-Fri 9:00am - 5:30pm, Sat 10am - 4pm</p>
      <img src="map.svg" alt="map to our store"><p>Call (03) 9479 1234 or
      <a href="mailto:store@example.edu.au">email us</a></p></body></html>`,
    'map.svg': svg(400, 300) };
  const r = await run(site, 'directions');
  assert.equal(r._fraction, 1);
  assert.ok(r.evidence.some(e => /contact\.html/.test(e.text)));
  const bare = await run({ 'index.html': '<p>nothing here</p>' }, 'directions');
  assert.ok(bare._fraction <= 0.25);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — checks undefined.

- [ ] **Step 3: Implement CSS-structural and content checks**

Append a third IIFE inside `<script id="module-checks">`:
```js
(() => {
  const A = Automarker, { sub, ev, frac } = A.checkUtil;
  const live = snaps => Object.values(snaps).filter(s => !s.error);
  const allRules = snaps => {
    const map = new Map();
    for (const s of live(snaps)) for (const r of (s.css?.rules ?? [])) {
      const k = `${r.selector}|${r.source}|${r.origin}`;
      const e = map.get(k) || { ...r, matchesAnywhere: false };
      e.matchesAnywhere = e.matchesAnywhere || r.matches;
      map.set(k, e);
    }
    return [...map.values()];
  };

  A.registerCheck('cssExternal',
    { label: 'External stylesheet linked from every page', scopes: ['site'], params: [] },
    ({ snapshots }) => {
      const pages = live(snapshots);
      const cssFiles = pages[0]?.css?.external ?? [];
      const linked = frac(pages, p => p.css?.externalLinkedHere);
      return { subResults: [
          sub('exists', 'External .css file present', cssFiles.length ? 1 : 0),
          sub('linkedAll', 'Linked from every page', linked, 2) ],
        evidence: [ev(linked === 1 && cssFiles.length ? 'pass' : 'fail',
          `${cssFiles.length} css file(s); linked on ${Math.round(linked * pages.length)}/${pages.length} page(s)`)] };
    });

  A.registerCheck('cssSelectorTypes',
    { label: 'Required CSS selector types', scopes: ['site'],
      params: [{ key: 'requirements', label: 'Requirements [{kind,min,origin}]', type: 'json', default: [] }] },
    ({ snapshots, params }) => {
      const rules = allRules(snapshots);
      const subs = [], evidence = [];
      for (const req of params.requirements ?? []) {
        const hits = rules.filter(r => r.kinds.includes(req.kind) &&
          (req.origin === 'any' || !req.origin || r.origin === req.origin));
        const pass = Math.min(1, hits.length / req.min);
        subs.push(sub(`req-${req.origin ?? 'any'}-${req.kind}`,
          `${req.min}× ${req.kind} (${req.origin ?? 'any'})`, pass));
        evidence.push(ev(pass === 1 ? 'pass' : 'fail',
          `${req.kind} (${req.origin ?? 'any'}): ${hits.length}/${req.min}` +
          (hits.length ? ` — e.g. "${hits[0].selector}"` : '')));
      }
      return { subResults: subs, evidence };
    });

  A.registerCheck('cssUnused',
    { label: 'No unused CSS selectors', scopes: ['site'], params: [] },
    ({ snapshots }) => {
      const unused = allRules(snapshots).filter(r => !r.matchesAnywhere &&
        !/^(html|body|\*|:root)/i.test(r.selector.trim()));
      return { subResults: [sub('none', 'Every selector used somewhere',
          Math.max(0, 1 - unused.length / 10))],
        evidence: unused.length ? unused.map(r => ev('fail',
            `Unused selector "${r.selector}" in ${r.source} (${r.origin})`))
          : [ev('pass', 'All selectors match at least one element on some page')],
        instances: unused.map(r => ({ text: `Unused selector "${r.selector}" in ${r.source}` })) };
    });

  A.registerCheck('inlineStyles',
    { label: 'Inline styles per page', scopes: ['eachPage', 'home'],
      params: [{ key: 'min', label: 'Minimum inline styles', type: 'number', default: 3 },
               { key: 'requireTags', label: 'Tags that must carry one', type: 'json', default: ['div', 'span'] }] },
    ({ snapshot: s, params }) => {
      const min = params.min ?? 3;
      const subs = [sub('count', `≥ ${min} inline style(s)`,
        Math.min(1, s.inlineStyles.count / min), 2)];
      for (const t of params.requireTags ?? [])
        subs.push(sub(`tag-${t}`, `Inline style on <${t}>`, s.inlineStyles.tags.includes(t) ? 1 : 0));
      return { subResults: subs,
        evidence: [ev(s.inlineStyles.count >= min ? 'pass' : 'fail',
          `${s.path}: ${s.inlineStyles.count} inline style(s) on [${s.inlineStyles.tags.join(', ')}]`)] };
    });

  A.registerCheck('wordCount',
    { label: 'Minimum word count', scopes: ['eachPage', 'home', 'site'],
      params: [{ key: 'min', label: 'Minimum words', type: 'number', default: 100 }] },
    ({ snapshot: s, snapshots, params }) => {
      const n = s ? s.text.wordCount
        : live(snapshots).reduce((a, p) => a + p.text.wordCount, 0);
      return { subResults: [sub('words', `≥ ${params.min} words`, Math.min(1, n / params.min))],
        evidence: [ev(n >= params.min ? 'pass' : 'fail',
          `${s ? s.path : 'site'}: ${n} word(s) of ${params.min} required`)] };
    });

  A.registerCheck('mediaPresence',
    { label: 'Required media present', scopes: ['eachPage', 'home', 'site'],
      params: [{ key: 'require', label: '[{kind,min}] kinds: video|gif|iframe|img|audio', type: 'json', default: [] },
               { key: 'anyOf', label: 'Any one requirement suffices', type: 'boolean', default: false }] },
    ({ snapshot: s, snapshots, params }) => {
      const pages = s ? [s] : live(snapshots);
      const count = kind => pages.reduce((a, p) => a + (kind === 'img'
        ? p.images.filter(i => i.ok).length : (p.media[kind + 's'] ?? p.media[kind] ?? 0)), 0);
      const results = (params.require ?? []).map(r =>
        ({ ...r, n: count(r.kind), met: count(r.kind) >= r.min }));
      const evidence = results.map(r => ev(r.met ? 'pass' : 'fail',
        `${r.kind}: ${r.n}/${r.min}`));
      if (params.anyOf) return { subResults: [sub('any',
          results.map(r => `${r.min}× ${r.kind}`).join(' OR '),
          results.some(r => r.met) ? 1 : 0)], evidence };
      return { subResults: results.map(r =>
        sub(`media-${r.kind}`, `${r.min}× ${r.kind}`, Math.min(1, r.n / r.min))), evidence };
    });

  A.registerCheck('responsive',
    { label: 'Responsive layout', scopes: ['eachPage', 'home', 'subpages'], params: [] },
    ({ snapshot: s }) => {
      const rs = s.responsive ?? [];
      const narrow = rs[rs.length - 1];
      return { subResults: [
          sub('noOverflow', 'No overflow at any width', frac(rs, r => !r.horizontalOverflow), 2),
          sub('adapts', 'Content fills narrow screens', narrow && narrow.contentWidthRatio >= 0.85 ? 1 : 0) ],
        evidence: rs.map(r => ev(r.horizontalOverflow ? 'fail' : 'pass',
          `${s.path} @${r.w}px: ${r.horizontalOverflow ? 'overflows' : 'fits'} (content ratio ${r.contentWidthRatio})`)) };
    });

  A.registerCheck('directions',
    { label: 'Directions on the location/contact page', scopes: ['site'], params: [] },
    ({ snapshots, config }) => {
      const hints = config.topic.locationHints ?? ['location', 'contact'];
      const re = new RegExp(hints.join('|'), 'i');
      const scored = live(snapshots).map(p => ({ p,
        score: (re.test(p.path) ? 3 : 0) + (re.test(p.title) ? 2 : 0) +
          hints.filter(h => p.text.visibleText.toLowerCase().includes(h)).length }))
        .sort((a, b) => b.score - a.score);
      const loc = scored[0]?.p;
      if (!loc) return { subResults: [sub('page', 'Location page found', 0)],
        evidence: [ev('fail', 'No pages to search for directions')] };
      const t = loc.text.visibleText;
      const address = /\d+[\w\s,.-]{0,40}\b(st|street|rd|road|ave|avenue|hwy|highway|dr|drive|blvd|boulevard|ct|court|ln|lane|pl|place|way|parade|crescent)\b/i.test(t);
      const hours = /\b(mon|tue|wed|thu|fri|sat|sun|monday|open|hours)\b/i.test(t) &&
        /\d{1,2}([:.]\d{2})?\s*(am|pm)|\d{1,2}\s*[-–]\s*\d{1,2}/i.test(t);
      const map = loc.images.some(i => /map/i.test(i.raw) || /map/i.test(i.alt || ''));
      const contact = /(\+?\d[\d\s()-]{7,}\d)/.test(t) || loc.links.some(l => l.mailto);
      return { subResults: [
          sub('address', 'Street address', address ? 1 : 0),
          sub('hours', 'Opening hours', hours ? 1 : 0),
          sub('map', 'Map image', map ? 1 : 0),
          sub('contact', 'Phone or email', contact ? 1 : 0) ],
        evidence: [ev('info', `Checked ${loc.path} for directions`),
          ...[['address', address], ['hours', hours], ['map image', map], ['contact details', contact]]
            .map(([k, v]) => ev(v ? 'pass' : 'fail', `${loc.path}: ${k} ${v ? 'found' : 'missing'}`))] };
    });
})();
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add index.html tests/unit/checks-css.test.mjs tests/unit/checks-content.test.mjs
git commit -m "feat: CSS-structural and content checks"
```

---

### Task 11: Assisted checks + SpellCheck with embedded wordlist

**Files:**
- Modify: `index.html` (fourth IIFE in `<script id="module-checks">`; fill `<script id="module-spell"></script>`; the wordlist lands in `<script id="module-wordlist">`)
- Create: `tools/embed-wordlist.mjs`
- Test: `tests/unit/checks-assisted.test.mjs`, `tests/unit/spell.test.mjs`

**Interfaces:**
- Consumes: registry, snapshots, earlier checks (aesthetic composes colourTheme/typography/whiteSpace/margins by calling `Automarker.checks.<id>` directly).
- Produces:
  - Checks `aesthetic`, `contentIntro`, `offerings`, `contentRelevance`, `spelling` — ALL return `needsReview: true`.
  - `Automarker.spell = { ready() → Promise<void>, check(text, config) → Promise<[{word, count}]>, wordCount() → number }`. Rules: tokens `[A-Za-z']{3,}`; skip capitalised tokens, tokens with digits, ALL-CAPS; strip possessives; accept if the lowercased token OR any suffix-stripped variant (s, es, ed, d, ing, ly, er, est — with silent-e restore and double-consonant undo for ing/ed/er/est) is in the wordlist or in `config.topic.spellWhitelist` (case-insensitive). If the wordlist is empty (embed not run), `check` returns `[]` and `wordCount()` is 0.
  - `tools/embed-wordlist.mjs` — reads `/usr/share/dict/words`, keeps `/^[a-z]+$/` entries, appends the EXTRA list below, gzips + base64s, and replaces the string in `Automarker.spellData = "...";/*WORDLIST*/` inside `index.html`. Idempotent (re-running replaces the previous payload).

**Sub-result definitions (exact):**
- `aesthetic`: single sub `composite` = mean weighted fraction of `colourTheme`, `typography`, `whiteSpace`, `margins` run on the same snapshot.
- `contentIntro` (`params: {min=50}`): `length` (wordCount ≥ min, partial ≥ min/2); `onTopic` (≥ 2 distinct topic keywords in visible text).
- `offerings`: `highlights` (any `topic.sectionHints` term in visible text); `cta` (an internal link whose text matches `/(shop|view|browse|explore|reserve|order|book|see|read)\b/i`).
- `contentRelevance` (`params: {min=40}`): `length` (wordCount ≥ min); `onTopic` (≥ 1 keyword); `structured` (≥ 1 heading).
- `spelling`: `instances` = one per distinct misspelt word (`{text: 'Possible misspelling "teh" ×2 (index.html, about.html)', word, count}`), sub `none` = 1 − min(1, distinct/10).

- [ ] **Step 1: Write the failing tests**

`tests/unit/spell.test.mjs`:
```js
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
```

`tests/unit/checks-assisted.test.mjs`:
```js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchApp } from '../helpers/harness.mjs';

let app;
before(async () => { app = await launchApp(); });
after(async () => { await app.close(); });

const run = (site, checkId, params = {}, pagePath = 'index.html', topic = {}) =>
  app.page.evaluate(async ({ site, checkId, params, pagePath, topic }) => {
    const sub = await Automarker.submissionFromTexts('t', site);
    const { snapshots } = await Automarker.analyzeSubmission(sub);
    const ctx = { snapshot: pagePath ? snapshots[pagePath] : undefined, snapshots, submission: sub,
      config: { meta: { viewport: { w: 1280, h: 800 }, weightThresholds: { fullKB: 1536, partialKB: 4096 } },
        topic: { keywords: ['sport', 'shoes', 'gear'], sectionHints: ['promotion', 'arrivals', 'products'],
                 spellWhitelist: [], logoHints: ['logo'], locationHints: [], ...topic } },
      params };
    const res = await Automarker.checks[checkId](ctx);
    const w = res.subResults.reduce((a, s) => a + s.weight, 0);
    res._fraction = w ? res.subResults.reduce((a, s) => a + s.pass * s.weight, 0) / w : 0;
    return res;
  }, { site, checkId, params, pagePath, topic });

test('contentIntro, offerings, contentRelevance are assisted and keyword-driven', async () => {
  const site = { 'index.html': `<html><body><h1>Sport gear</h1>
    <p>${'Welcome to our sport shoes store with quality gear for every athlete. '.repeat(8)}</p>
    <h2>New arrivals and promotions</h2><a href="products.html">Shop now</a></body></html>`,
    'products.html': '<p>p</p>' };
  for (const [id, params] of [['contentIntro', { min: 50 }], ['offerings', {}], ['contentRelevance', { min: 40 }]]) {
    const r = await run(site, id, params);
    assert.equal(r.needsReview, true, id);
    assert.equal(r._fraction, 1, `${id}: ${JSON.stringify(r.subResults)}`);
  }
  const off = await run({ 'index.html': '<p>minimal unrelated text</p>' }, 'offerings');
  assert.equal(off._fraction, 0);
});

test('aesthetic composes design metrics', async () => {
  const r = await run({ 'index.html': '<html><body><p>plain</p></body></html>' }, 'aesthetic');
  assert.equal(r.needsReview, true);
  assert.ok(r._fraction < 0.6);
});

test('spelling check emits instances across pages', async () => {
  const site = { 'index.html': '<p>simply teh best offer</p>', 'a.html': '<p>teh same typo again</p>' };
  const r = await run(site, 'spelling', {}, null);
  const teh = r.instances.find(i => i.word === 'teh');
  assert.ok(teh); assert.equal(teh.count, 2);
  assert.equal(r.needsReview, true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Automarker.spell` undefined / checks missing.

- [ ] **Step 3: Implement SpellCheck module and embed script**

Replace `<script id="module-spell"></script>` with:
```html
<script id="module-spell">
(() => {
  const A = Automarker;
  let words = null, loading = null;
  const load = async () => {
    if (!A.spellData) { words = new Set(); return; }
    const bytes = await A.util.gunzip(A.util.b64ToBytes(A.spellData));
    words = new Set(new TextDecoder().decode(bytes).split('\n').filter(Boolean));
  };
  const variants = w => {
    const v = [w];
    if (w.endsWith("'s")) v.push(w.slice(0, -2));
    for (const suf of ['s', 'es', 'ed', 'd', 'ing', 'ly', 'er', 'est']) {
      if (!w.endsWith(suf) || w.length - suf.length < 3) continue;
      const stem = w.slice(0, -suf.length);
      v.push(stem, stem + 'e');                                   // make → making
      if (stem.length > 2 && stem[stem.length - 1] === stem[stem.length - 2])
        v.push(stem.slice(0, -1));                                // run → running
    }
    return v;
  };
  A.spell = {
    ready: () => (loading ??= load()),
    wordCount: () => words ? words.size : 0,
    async check(text, config) {
      await A.spell.ready();
      if (!words.size) return [];
      const white = new Set((config?.topic?.spellWhitelist ?? []).map(w => w.toLowerCase()));
      const seen = new Map();
      for (const m of text.matchAll(/[A-Za-z']{3,}/g)) {
        const tok = m[0].replace(/^'+|'+$/g, '');
        if (tok.length < 3 || /^[A-Z]/.test(tok) || /[A-Z]/.test(tok.slice(1))) continue;
        const w = tok.toLowerCase();
        if (white.has(w)) continue;
        if (variants(w).some(v => words.has(v) || white.has(v))) continue;
        seen.set(w, (seen.get(w) || 0) + 1);
      }
      return [...seen.entries()].map(([word, count]) => ({ word, count }));
    }
  };
})();
</script>
```

`tools/embed-wordlist.mjs`:
```js
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const EXTRA = `website websites webpage webpages email emails online homepage login logout signup
app apps blog blogs wifi ecommerce checkout faq faqs html css url urls internet smartphone
sportswear activewear streetwear footwear gym fitness workout workouts sneaker sneakers
newsletter socials instagram facebook youtube twitter tiktok linkedin
favourite favourites colour colours colourful customise customised organise organised
realise realised recognise specialise specialised personalise personalised
travelled travelling jewellery centre theatre litre metre metres kilometre kilometres
neighbourhood programme programmes grey honour honours behaviour behaviours
backpack backpacks pickup dropdown lifestyle lifestyles`.split(/\s+/);

const dict = readFileSync('/usr/share/dict/words', 'utf8').split('\n')
  .filter(w => /^[a-z]+$/.test(w));
const all = [...new Set([...dict, ...EXTRA])].join('\n');
const b64 = gzipSync(Buffer.from(all)).toString('base64');

const html = readFileSync('index.html', 'utf8');
const re = /Automarker\.spellData = "[^"]*";\/\*WORDLIST\*\//;
if (!re.test(html)) { console.error('WORDLIST marker not found'); process.exit(1); }
writeFileSync('index.html', html.replace(re, `Automarker.spellData = "${b64}";/*WORDLIST*/`));
console.log(`Embedded ${all.split('\n').length} words (${Math.round(b64.length / 1024)} KB base64)`);
```

Run once: `node tools/embed-wordlist.mjs`

- [ ] **Step 4: Implement assisted checks**

Append a fourth IIFE inside `<script id="module-checks">`:
```js
(() => {
  const A = Automarker, { sub, ev } = A.checkUtil;
  const live = snaps => Object.values(snaps).filter(s => !s.error);
  const fractionOf = res => { const w = res.subResults.reduce((a, s) => a + s.weight, 0);
    return w ? res.subResults.reduce((a, s) => a + s.pass * s.weight, 0) / w : 0; };

  A.registerCheck('aesthetic',
    { label: 'Overall aesthetic (assisted composite)', scopes: ['home', 'subpages', 'eachPage'], params: [] },
    async (ctx) => {
      const parts = [];
      for (const id of ['colourTheme', 'typography', 'whiteSpace', 'margins'])
        parts.push(fractionOf(await A.checks[id]({ ...ctx, params: {} })));
      const mean = parts.reduce((a, b) => a + b, 0) / parts.length;
      return { needsReview: true,
        subResults: [sub('composite', 'Composite of design metrics (confirm visually)', mean)],
        evidence: [ev('info', `${ctx.snapshot.path}: suggested from design metrics — confirm against preview`)] };
    });

  A.registerCheck('contentIntro',
    { label: 'Useful introductory content (assisted)', scopes: ['home', 'eachPage'],
      params: [{ key: 'min', label: 'Minimum words', type: 'number', default: 50 }] },
    ({ snapshot: s, config, params }) => {
      const min = params.min ?? 50, n = s.text.wordCount;
      const kws = (config.topic.keywords ?? []).map(k => k.toLowerCase());
      const hits = kws.filter(k => s.text.visibleText.toLowerCase().includes(k));
      return { needsReview: true, subResults: [
          sub('length', `≥ ${min} words of content`, n >= min ? 1 : n >= min / 2 ? 0.5 : 0),
          sub('onTopic', '≥ 2 topic keywords present', hits.length >= 2 ? 1 : hits.length ? 0.5 : 0) ],
        evidence: [ev('info', `${s.path}: ${n} words; topic terms found: [${hits.join(', ')}] — confirm content is genuinely on-topic`)] };
    });

  A.registerCheck('offerings',
    { label: 'Key offerings highlighted (assisted)', scopes: ['home'], params: [] },
    ({ snapshot: s, config }) => {
      const text = s.text.visibleText.toLowerCase();
      const hint = (config.topic.sectionHints ?? []).find(h => text.includes(h.toLowerCase()));
      const cta = s.links.find(l => l.internal && l.targetExists &&
        /\b(shop|view|browse|explore|reserve|order|book|see|read)\b/i.test(l.text));
      return { needsReview: true, subResults: [
          sub('highlights', 'Offerings/promotions mentioned', hint ? 1 : 0),
          sub('cta', 'Call-to-action link deeper into site', cta ? 1 : 0) ],
        evidence: [ev(hint ? 'pass' : 'fail', hint
            ? `${s.path}: highlights "${hint}"` : `${s.path}: no offerings/promotions terms found`),
          ev(cta ? 'pass' : 'fail', cta ? `CTA "${cta.text}" → ${cta.resolved}` : 'No call-to-action link found')] };
    });

  A.registerCheck('contentRelevance',
    { label: 'Audience-relevant content (assisted)', scopes: ['subpages', 'eachPage'],
      params: [{ key: 'min', label: 'Minimum words', type: 'number', default: 40 }] },
    ({ snapshot: s, config, params }) => {
      const min = params.min ?? 40;
      const kws = (config.topic.keywords ?? []).map(k => k.toLowerCase());
      const anyKw = kws.some(k => s.text.visibleText.toLowerCase().includes(k));
      const h = s.structure.headings;
      return { needsReview: true, subResults: [
          sub('length', `≥ ${min} words`, Math.min(1, s.text.wordCount / min)),
          sub('onTopic', 'Topic keyword present', anyKw ? 1 : 0),
          sub('structured', 'Has a heading', h.h1 + h.h2 + h.h3 > 0 ? 1 : 0) ],
        evidence: [ev('info', `${s.path}: ${s.text.wordCount} words — confirm relevance in preview`)] };
    });

  A.registerCheck('spelling',
    { label: 'Spelling (assisted — confirm each)', scopes: ['site'], params: [] },
    async ({ snapshots, config }) => {
      const byWord = new Map();
      for (const s of live(snapshots)) {
        for (const { word, count } of await A.spell.check(s.text.visibleText, config)) {
          const e = byWord.get(word) || { word, count: 0, pages: new Set() };
          e.count += count; e.pages.add(s.path); byWord.set(word, e);
        }
      }
      const instances = [...byWord.values()].map(e => ({ word: e.word, count: e.count,
        text: `Possible misspelling "${e.word}" ×${e.count} (${[...e.pages].join(', ')})` }));
      return { needsReview: true,
        subResults: [sub('none', 'No suspected misspellings', Math.max(0, 1 - instances.length / 10))],
        evidence: instances.length ? instances.map(i => ev('fail', i.text))
          : [ev('pass', 'No suspected misspellings found')],
        instances };
    });
})();
```

- [ ] **Step 5: Run the embed script, then the tests**

Run: `node tools/embed-wordlist.mjs && npm test`
Expected: embed prints a word count > 50 000; all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add index.html tools/embed-wordlist.mjs tests/unit/spell.test.mjs tests/unit/checks-assisted.test.mjs
git commit -m "feat: assisted checks and offline spell-check with embedded wordlist"
```

### Task 12: Config module — schema validation + both presets

**Files:**
- Modify: `index.html` (fill `<script id="module-config"></script>`)
- Test: `tests/unit/config.test.mjs`

**Interfaces:**
- Consumes: `Automarker.checks` registry (Tasks 8–11).
- Produces:
  - `Automarker.Config.validate(config) → [errorStrings]` (empty = valid). Rules: `meta.id/title` present; every item has `id`, `label`, `check` (existing in `Automarker.checks`), a valid `scope`, and exactly one of `max` (positive number) or `required: true`; item ids unique; if a section declares `points`, the expanded scored max must equal it (`eachSubpage` rows count ×(minPages−1), `eachPage` ×minPages); if `meta.totalPoints` set, section points must sum to it; deductions need `check` + (`perInstance` or `flat`).
  - `Automarker.Config.expandedSectionPoints(section, meta) → number`.
  - `Automarker.presets['cse1iit-2026s2']` and `Automarker.presets['iwbs001-a2']` — full configs below. `Automarker.state.config` initialised to the CSE1IIT preset at load.
- Copy the two preset objects EXACTLY as printed here (they are the ground truth the e2e fixtures assert against):

```js
A.presets['cse1iit-2026s2'] = {
  meta: { id: 'cse1iit-2026s2', title: 'CSE1IIT — La Trobe Sports website (2026 S2)',
    totalPoints: 113, mappedMarks: 30, minPages: 6,
    viewport: { w: 1280, h: 800 }, responsiveWidths: [1280, 768, 375],
    weightThresholds: { fullKB: 1536, partialKB: 4096 } },
  topic: {
    keywords: ['sport', 'sports', 'sportswear', 'shoes', 'footwear', 'fitness', 'gym',
      'training', 'athletic', 'gear', 'equipment', 'apparel', 'running', 'basketball',
      'football', 'soccer', 'hiking', 'accessories', 'store'],
    sectionHints: ['products', 'brands', 'reservation', 'contact', 'about', 'promotions',
      'arrivals', 'discounts', 'sale', 'offers'],
    spellWhitelist: ['sportswear', 'activewear', 'ecommerce', 'sneakers'],
    logoHints: ['logo', 'brand'],
    locationHints: ['location', 'contact', 'visit', 'find', 'store', 'directions'] },
  sections: [
    { id: 'nav', title: 'Navigation Bar and Links', points: 30, items: [
      { id: 'nav-home', label: 'Nav bar on home page, styled, linking to each sub-page',
        check: 'navBar', mode: 'auto', scope: 'home', max: 5 },
      { id: 'nav-sub', label: 'Nav bar consistent on sub-page, linking home + other sub-pages',
        check: 'navBar', mode: 'auto', scope: 'eachSubpage', max: 5 } ] },
    { id: 'home', title: 'Home Page Design', points: 23, items: [
      { id: 'home-colour', label: 'Colour theme suits the brand', check: 'colourTheme', mode: 'auto', scope: 'home', max: 2 },
      { id: 'home-text', label: 'Suitable fonts and text colours', check: 'typography', mode: 'auto', scope: 'home', max: 2 },
      { id: 'home-layout', label: 'Balanced layout with white space', check: 'whiteSpace', mode: 'auto', scope: 'home', max: 2 },
      { id: 'home-sections', label: 'Clear sections', check: 'sectionStructure', mode: 'auto', scope: 'home', max: 2 },
      { id: 'home-image', label: 'At least one relevant, well-sized image', check: 'images', mode: 'auto', scope: 'home', max: 2, params: { min: 1 } },
      { id: 'home-margins', label: 'Appropriate margins', check: 'margins', mode: 'auto', scope: 'home', max: 2 },
      { id: 'home-logo', label: 'Logo displayed (ideally top-left, linking home)', check: 'logo', mode: 'auto', scope: 'home', max: 2 },
      { id: 'home-weight', label: 'Page not too heavy; loads quickly', check: 'pageWeight', mode: 'auto', scope: 'home', max: 2 },
      { id: 'home-aesthetic', label: 'Professional, attractive presentation', check: 'aesthetic', mode: 'assisted', scope: 'home', max: 2 },
      { id: 'home-intro', label: 'Useful introductory information', check: 'contentIntro', mode: 'assisted', scope: 'home', max: 2, params: { min: 50 } },
      { id: 'home-offerings', label: 'Key offerings highlighted with encouragement to explore', check: 'offerings', mode: 'assisted', scope: 'home', max: 2 },
      { id: 'home-backtotop', label: 'Back-to-top button', check: 'backToTop', mode: 'auto', scope: 'home', max: 1 } ] },
    { id: 'subs', title: 'Design and Presentation of the 5 Sub-Pages', points: 60, items: [
      { id: 'sub-colour', label: 'Good colour blending, consistent design', check: 'colourTheme', mode: 'auto', scope: 'subpages', max: 5, params: { consistency: true } },
      { id: 'sub-text', label: 'Readable text size and colour', check: 'typography', mode: 'auto', scope: 'subpages', max: 5 },
      { id: 'sub-layout', label: 'Clear balanced layout with white space', check: 'whiteSpace', mode: 'auto', scope: 'subpages', max: 5 },
      { id: 'sub-sections', label: 'Pages divided into clear sections', check: 'sectionStructure', mode: 'auto', scope: 'subpages', max: 5 },
      { id: 'sub-images', label: 'At least two relevant images per sub-page', check: 'images', mode: 'auto', scope: 'subpages', max: 10, params: { min: 2 } },
      { id: 'sub-margins', label: 'Appropriate margins', check: 'margins', mode: 'auto', scope: 'subpages', max: 5 },
      { id: 'sub-logo', label: 'Logo on each page, hyperlinked back to home', check: 'logo', mode: 'auto', scope: 'subpages', max: 5, params: { requireLink: true } },
      { id: 'sub-weight', label: 'Pages optimised for fast loading', check: 'pageWeight', mode: 'auto', scope: 'subpages', max: 5 },
      { id: 'sub-content', label: 'Useful, audience-relevant content', check: 'contentRelevance', mode: 'assisted', scope: 'subpages', max: 5, params: { min: 40 } },
      { id: 'sub-backtotop', label: 'Back-to-top button on each sub-page', check: 'backToTop', mode: 'auto', scope: 'subpages', max: 5 },
      { id: 'sub-directions', label: 'Clear directions on the location page', check: 'directions', mode: 'auto', scope: 'site', max: 5 } ] } ],
  deductions: [
    { id: 'spelling', label: 'Spelling mistakes (−1 each, confirm before applying)',
      perInstance: -1, check: 'spelling', mode: 'assisted' },
    { id: 'broken', label: 'Broken links / images (−2 each)',
      perInstance: -2, check: 'brokenResources', mode: 'auto' },
    { id: 'absolute', label: 'Absolute or external links (must be relative; −2 each)',
      perInstance: -2, check: 'externalLink', mode: 'auto', params: { policy: 'forbidden' } },
    { id: 'pagecount', label: 'Fewer than 6 pages (−15)',
      flat: -15, check: 'pageCount', mode: 'auto' } ]
};

A.presets['iwbs001-a2'] = {
  meta: { id: 'iwbs001-a2', title: 'IWBS001 — Assignment 2 personal portfolio (HTML & CSS)',
    minPages: 3, viewport: { w: 1280, h: 800 }, responsiveWidths: [1280, 768, 375],
    weightThresholds: { fullKB: 3072, partialKB: 8192 } },
  topic: { keywords: ['skills', 'hobbies', 'favourite', 'about', 'portfolio'],
    sectionHints: ['skills', 'hobbies', 'education', 'background', 'fun facts'],
    spellWhitelist: [], logoHints: ['logo', 'photo', 'profile'],
    locationHints: ['place', 'city', 'town'] },
  sections: [
    { id: 'structure', title: 'Pages and Navigation', items: [
      { id: 'pages-3', label: '3 pages: home, favourite things & activities, favourite place',
        check: 'pageCount', mode: 'auto', scope: 'site', required: true, params: { min: 3 } },
      { id: 'nav-each', label: 'Navigation bar on every page linking to the other pages',
        check: 'navBar', mode: 'auto', scope: 'eachPage', required: true, params: { threshold: 0.7 } } ] },
    { id: 'content', title: 'Content Requirements', items: [
      { id: 'home-media', label: 'Celebrity quote with embedded video, GIF or clip',
        check: 'mediaPresence', mode: 'auto', scope: 'home', required: true,
        params: { anyOf: true, require: [{ kind: 'video', min: 1 }, { kind: 'gif', min: 1 }, { kind: 'iframe', min: 1 }] } },
      { id: 'home-email', label: 'Hyperlink to your email address', check: 'emailLink',
        mode: 'auto', scope: 'home', required: true },
      { id: 'home-photo', label: 'Photo, name and student ID shown (confirm visually)',
        check: 'images', mode: 'assisted', scope: 'home', required: true,
        params: { min: 1, relevance: false, threshold: 0.5 } },
      { id: 'home-words', label: 'Introduction, fun facts and skills text (≈600+ words total)',
        check: 'wordCount', mode: 'auto', scope: 'home', required: true, params: { min: 600 } },
      { id: 'sub-words', label: 'Two 250-word descriptions per sub-page (≈500+ words)',
        check: 'wordCount', mode: 'auto', scope: 'eachSubpage', required: true, params: { min: 500 } },
      { id: 'ext-links', label: 'External reference link on every page',
        check: 'externalLink', mode: 'auto', scope: 'eachPage', required: true,
        params: { policy: 'required', min: 1 } } ] },
    { id: 'css', title: 'Minimum CSS Requirements', items: [
      { id: 'css-external', label: 'External CSS file linked to all pages',
        check: 'cssExternal', mode: 'auto', scope: 'site', required: true, params: { threshold: 0.99 } },
      { id: 'css-ext-types', label: 'External CSS: p style, 3 generic classes, 3 tag classes, 3 heading styles, a:hover, 2 group styles, contextual, button, flexbox',
        check: 'cssSelectorTypes', mode: 'auto', scope: 'site', required: true,
        params: { threshold: 0.99, requirements: [
          { kind: 'pFormat', min: 1, origin: 'external' },
          { kind: 'classGeneric', min: 3, origin: 'external' },
          { kind: 'classScoped', min: 3, origin: 'external' },
          { kind: 'headingStyle', min: 3, origin: 'external' },
          { kind: 'hoverAnchor', min: 1, origin: 'external' },
          { kind: 'group', min: 2, origin: 'external' },
          { kind: 'contextual', min: 1, origin: 'external' },
          { kind: 'buttonStyle', min: 1, origin: 'external' },
          { kind: 'flexbox', min: 1, origin: 'external' } ] } },
      { id: 'css-emb-types', label: 'Embedded style: id on heading, contextual, p class, positioning, header+footer+body styles',
        check: 'cssSelectorTypes', mode: 'auto', scope: 'site', required: true,
        params: { threshold: 0.99, requirements: [
          { kind: 'idOnHeading', min: 1, origin: 'embedded' },
          { kind: 'contextual', min: 1, origin: 'embedded' },
          { kind: 'classScoped', min: 1, origin: 'embedded' },
          { kind: 'positioning', min: 1, origin: 'embedded' },
          { kind: 'headerStyle', min: 1, origin: 'embedded' },
          { kind: 'footerStyle', min: 1, origin: 'embedded' },
          { kind: 'bodyStyle', min: 1, origin: 'embedded' } ] } },
      { id: 'css-inline', label: '≥3 inline styles per page, incl. one div and one span',
        check: 'inlineStyles', mode: 'auto', scope: 'eachPage', required: true,
        params: { min: 3, requireTags: ['div', 'span'], threshold: 0.99 } },
      { id: 'css-unused', label: 'No unused CSS selectors',
        check: 'cssUnused', mode: 'auto', scope: 'site', required: true, params: { threshold: 0.99 } } ] },
    { id: 'design', title: 'Layout and Design Quality', items: [
      { id: 'design-consistent', label: 'Consistent colours/design across pages',
        check: 'colourTheme', mode: 'assisted', scope: 'home', required: true,
        params: { consistency: true, threshold: 0.6 } },
      { id: 'design-typography', label: 'High contrast, readable fonts and sizes',
        check: 'typography', mode: 'assisted', scope: 'home', required: true, params: { threshold: 0.6 } },
      { id: 'design-responsive', label: 'Website adapts to window sizes',
        check: 'responsive', mode: 'auto', scope: 'eachPage', required: true, params: { threshold: 0.6 } },
      { id: 'design-structure', label: 'Clear purpose and sections on each page',
        check: 'sectionStructure', mode: 'assisted', scope: 'eachPage', required: true, params: { threshold: 0.5 } } ] } ],
  deductions: [
    { id: 'spelling', label: 'Spelling/grammar issues (confirm each)',
      perInstance: -1, check: 'spelling', mode: 'assisted' } ]
};
```

- [ ] **Step 1: Write the failing test**

`tests/unit/config.test.mjs`:
```js
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

test('CSE1IIT expanded points equal 113 (30/23/60)', async () => {
  const pts = await app.page.evaluate(() => {
    const c = Automarker.presets['cse1iit-2026s2'];
    return c.sections.map(s => Automarker.Config.expandedSectionPoints(s, c.meta));
  });
  assert.deepEqual(pts, [30, 23, 60]);
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Automarker.Config` undefined.

- [ ] **Step 3: Implement the Config module**

Replace `<script id="module-config"></script>` with an IIFE containing: the two preset literals above assigned to `A.presets`, plus:
```js
const SCOPES = ['home', 'eachSubpage', 'subpages', 'eachPage', 'site'];
A.Config = {
  expandedSectionPoints(section, meta) {
    let pts = 0;
    for (const it of section.items) {
      if (!it.max) continue;
      if (it.scope === 'eachSubpage') pts += it.max * ((meta.minPages ?? 1) - 1);
      else if (it.scope === 'eachPage') pts += it.max * (meta.minPages ?? 1);
      else pts += it.max;
    }
    return pts;
  },
  validate(config) {
    const errs = [];
    if (!config?.meta?.id || !config?.meta?.title) errs.push('meta.id and meta.title are required');
    const seen = new Set();
    for (const sec of config.sections ?? []) {
      for (const it of sec.items ?? []) {
        if (!it.id || !it.label) errs.push(`item in ${sec.id}: id and label required`);
        if (seen.has(it.id)) errs.push(`duplicate item id "${it.id}"`);
        seen.add(it.id);
        if (!A.checks[it.check]) errs.push(`item "${it.id}": unknown check "${it.check}"`);
        if (!SCOPES.includes(it.scope)) errs.push(`item "${it.id}": invalid scope "${it.scope}"`);
        const scored = typeof it.max === 'number' && it.max > 0;
        if (scored === !!it.required)
          errs.push(`item "${it.id}": exactly one of max or required:true`);
      }
      if (typeof sec.points === 'number') {
        const got = A.Config.expandedSectionPoints(sec, config.meta ?? {});
        if (got !== sec.points) errs.push(`section "${sec.id}": points ${sec.points} but items expand to ${got}`);
      }
    }
    for (const d of config.deductions ?? []) {
      if (!A.checks[d.check]) errs.push(`deduction "${d.id}": unknown check "${d.check}"`);
      if (typeof d.perInstance !== 'number' && typeof d.flat !== 'number')
        errs.push(`deduction "${d.id}": needs perInstance or flat`);
    }
    if (typeof config.meta?.totalPoints === 'number') {
      const sum = (config.sections ?? []).reduce((a, s) =>
        a + A.Config.expandedSectionPoints(s, config.meta), 0);
      if (sum !== config.meta.totalPoints)
        errs.push(`meta.totalPoints ${config.meta.totalPoints} but sections sum to ${sum} points`);
    }
    return errs;
  }
};
A.state.config = A.presets['cse1iit-2026s2'];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add index.html tests/unit/config.test.mjs
git commit -m "feat: rubric config validation and CSE1IIT/IWBS001 presets"
```

### Task 13: ScoringEngine + full pipeline entry point

**Files:**
- Modify: `index.html` (fill `<script id="module-scoring"></script>`)
- Test: `tests/unit/scoring.test.mjs`

**Interfaces:**
- Consumes: checks (8–11), `Automarker.Config` (12), `loadSubmission`/`analyzeSubmission` (3, 5).
- Produces:
  - `Automarker.scoring.scoreSubmission({submission, snapshots}, config) → Promise<ScoreSheet>` (shape in Shared type reference).
  - `Automarker.scoring.recomputeTotals(sheet, config)` — recalculates section scores, deduction totals, `total`, `mappedMark`, `requirementsMet` from current `final`/`passed`/`confirmed` values (mutates sheet).
  - `Automarker.scoring.applyOverride(sheet, config, rowId, value)` — number for scored rows, boolean for requirement rows; sets `overridden: true`; recomputes.
  - `Automarker.scoring.setDeductionConfirmed(sheet, config, dedId, index, confirmed)` — toggles one instance; recomputes.
  - `Automarker.processSubmissionBytes(name, bytes, config?) → Promise<StudentRecord>` — zip bytes → submission → analysis → sheet; pushes the record onto `Automarker.state.records`; on failure returns/pushes `{name, error}`.

**Scoring semantics (exact — the tests encode these):**
- Row expansion by scope: `home` → 1 row on the home snapshot; `site` → 1 row with `ctx.snapshot` undefined; `eachSubpage` → run the check on EVERY sub-page, keep the best `minPages−1` results by score (ties: path order), pad with zero rows labelled `— missing page N` up to `minPages−1`; `eachPage` → same over all pages padded to `minPages`; `subpages` → run per sub-page, keep best `minPages−1`, aggregate: scored `auto = round(mean of per-page scores)`, requirement `fraction = mean of per-page fractions`; `perPage` records each page's score and evidence.
- Fraction → score: scored `auto = clamp(round(fraction × max), 0, max)`; requirement `passed = fraction ≥ (params.threshold ?? 1) − 1e-9`, `auto = passed ? 1 : 0`. `final` starts equal to `auto`.
- A row whose snapshot has `error`/`timedOut` gets `needsReview: true` and evidence `"could not analyse <page>"` (score from whatever fraction was computable; 0 if none).
- Deductions: run each deduction's check site-scoped. `flat`: applied (total = flat) iff `instances.length > 0`. `perInstance`: each instance `{..., confirmed, points: perInstance}` where `confirmed` defaults to `mode !== 'assisted'`; `total = Σ confirmed × perInstance`.
- Totals: `total = max(0, Σ scored finals + Σ deduction totals)`; `mappedMark = meta.mappedMarks ? max(0, round1(total / meta.totalPoints × meta.mappedMarks)) : null`; `requirementsTotal/Met` count requirement rows (a padded missing-page row counts as unmet).

- [ ] **Step 1: Write the failing test**

`tests/unit/scoring.test.mjs`:
```js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchApp } from '../helpers/harness.mjs';
import { buildZip } from '../helpers/zipwrite.mjs';

let app;
before(async () => { app = await launchApp(); });
after(async () => { await app.close(); });

const NAV = `<nav style="background:#123;padding:8px">
  <a href="index.html" style="color:#fff;text-decoration:none;padding:6px">H</a>
  <a href="a.html" style="color:#fff;text-decoration:none;padding:6px">A</a></nav>`;
const SITE = { 'index.html': `<html><body>${NAV}<p>Teh home page</p></body></html>`,
               'a.html': `<html><body>${NAV}<p>sub</p><a href="dead.html">x</a></body></html>` };
const CFG = {
  meta: { id: 't', title: 't', totalPoints: 12, mappedMarks: 30, minPages: 3,
    viewport: { w: 1280, h: 800 }, weightThresholds: { fullKB: 1536, partialKB: 4096 } },
  topic: { keywords: [], sectionHints: [], spellWhitelist: [], logoHints: [], locationHints: [] },
  sections: [
    { id: 's1', title: 'S1', points: 12, items: [
      { id: 'i-nav', label: 'nav home', check: 'navBar', mode: 'auto', scope: 'home', max: 5 },
      { id: 'i-nav-sub', label: 'nav subs', check: 'navBar', mode: 'auto', scope: 'eachSubpage', max: 3 },
      { id: 'i-weight', label: 'weight', check: 'pageWeight', mode: 'auto', scope: 'home', max: 1 } ] },
    { id: 's2', title: 'S2', items: [
      { id: 'r-email', label: 'email link', check: 'emailLink', mode: 'auto', scope: 'site', required: true } ] } ],
  deductions: [
    { id: 'broken', label: 'broken', perInstance: -2, check: 'brokenResources', mode: 'auto' },
    { id: 'spelling', label: 'spelling', perInstance: -1, check: 'spelling', mode: 'assisted' },
    { id: 'short', label: 'short', flat: -5, check: 'pageCount', mode: 'auto' } ]
};

const score = (site, cfg) => app.page.evaluate(async ({ site, cfg }) => {
  const sub = await Automarker.submissionFromTexts('t', site);
  const analysis = await Automarker.analyzeSubmission(sub);
  return Automarker.scoring.scoreSubmission({ submission: sub, ...analysis }, cfg);
}, { site, cfg });

test('scores, expands, pads, deducts and maps', async () => {
  const sheet = await score(SITE, CFG);
  const rows = Object.fromEntries(sheet.items.map(i => [i.id, i]));
  assert.equal(rows['i-nav'].final, 5);                     // perfect nav
  assert.equal(rows['i-weight'].final, 1);
  assert.equal(sheet.items.filter(i => i.id.startsWith('i-nav-sub')).length, 2); // 1 real + 1 padded
  const padded = sheet.items.find(i => i.id.startsWith('i-nav-sub') && /missing page/.test(i.label));
  assert.equal(padded.final, 0);
  assert.equal(rows['r-email'].passed, false);              // no mailto in fixture
  const broken = sheet.deductions.find(d => d.id === 'broken');
  assert.equal(broken.total, -2);                           // dead.html, auto-confirmed
  const spelling = sheet.deductions.find(d => d.id === 'spelling');
  assert.ok(spelling.instances.some(i => i.word === 'teh'));
  assert.equal(spelling.total, 0);                          // assisted: unconfirmed by default
  const short = sheet.deductions.find(d => d.id === 'short');
  assert.equal(short.total, -5);                            // 2 pages < minPages 3
  assert.equal(sheet.requirementsTotal, 1);
  assert.equal(sheet.requirementsMet, 0);
  assert.equal(sheet.totalPoints, 12);
  const scoredSum = sheet.items.reduce((a, i) => a + (i.max ? i.final : 0), 0);
  assert.equal(sheet.total, Math.max(0, scoredSum - 7));
  assert.equal(sheet.mappedMark, Math.max(0, Math.round(sheet.total / 12 * 30 * 10) / 10));
});

test('overrides and spelling confirmation recompute totals', async () => {
  // clone without the flat 'short' deduction so totals stay above the max(0, …) floor
  const CFG2 = { ...CFG, deductions: CFG.deductions.filter(d => d.id !== 'short') };
  const r = await app.page.evaluate(async ({ site, cfg }) => {
    const sub = await Automarker.submissionFromTexts('t', site);
    const analysis = await Automarker.analyzeSubmission(sub);
    const sheet = await Automarker.scoring.scoreSubmission({ submission: sub, ...analysis }, cfg);
    const before = sheet.total;
    Automarker.scoring.applyOverride(sheet, cfg, 'i-nav', 2);
    const afterOverride = sheet.total;
    Automarker.scoring.applyOverride(sheet, cfg, 'r-email', true);
    const spellIdx = sheet.deductions.findIndex(d => d.id === 'spelling');
    Automarker.scoring.setDeductionConfirmed(sheet, cfg, 'spelling', 0, true);
    return { before, afterOverride, total: sheet.total,
      overridden: sheet.items.find(i => i.id === 'i-nav').overridden,
      reqMet: sheet.requirementsMet,
      spellTotal: sheet.deductions[spellIdx].total };
  }, { site: SITE, cfg: CFG2 });
  assert.equal(r.afterOverride, r.before - 3);
  assert.equal(r.overridden, true);
  assert.equal(r.reqMet, 1);
  assert.equal(r.spellTotal, -1);
  assert.equal(r.total, r.afterOverride - 1);
});

test('processSubmissionBytes runs the whole pipeline from zip bytes', async () => {
  const zip = buildZip(Object.entries(SITE).map(([path, data]) => ({ path, data })));
  const rec = await app.page.evaluate(async ({ b64, cfg }) => {
    const r = await Automarker.processSubmissionBytes('student-42', Automarker.util.b64ToBytes(b64), cfg);
    return { name: r.name, hasSheet: !!r.sheet, records: Automarker.state.records.length,
      err: r.error ?? null };
  }, { b64: zip.toString('base64'), cfg: CFG });
  assert.equal(rec.name, 'student-42');
  assert.equal(rec.hasSheet, true);
  assert.equal(rec.err, null);
  assert.ok(rec.records >= 1);
});

test('corrupt zip yields an error record, not a crash', async () => {
  const rec = await app.page.evaluate(async () =>
    Automarker.processSubmissionBytes('bad', new Uint8Array([9, 9, 9])));
  assert.match(rec.error, /Not a zip/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Automarker.scoring` undefined.

- [ ] **Step 3: Implement the ScoringEngine**

Replace `<script id="module-scoring"></script>` with:
```html
<script id="module-scoring">
(() => {
  const A = Automarker, U = A.util;
  const fractionOf = res => { const w = res.subResults.reduce((a, s) => a + s.weight, 0);
    return w ? res.subResults.reduce((a, s) => a + s.pass * s.weight, 0) / w : 0; };

  async function runOn(item, snapshot, snapshots, submission, config) {
    const ctx = { snapshot, snapshots, submission, config, params: item.params ?? {} };
    const res = await A.checks[item.check](ctx);
    return { fraction: fractionOf(res), evidence: res.evidence,
      needsReview: !!res.needsReview || item.mode === 'assisted' || !!snapshot?.timedOut,
      instances: res.instances ?? [] };
  }
  const toScore = (item, fraction) => item.max
    ? U.clamp(Math.round(fraction * item.max), 0, item.max)
    : (fraction >= (item.params?.threshold ?? 1) - 1e-9 ? 1 : 0);

  A.scoring = {
    async scoreSubmission({ submission, snapshots }, config) {
      const meta = config.meta, items = [];
      const subPages = submission.subPagePaths.filter(p => snapshots[p] && !snapshots[p].error);
      const allPages = submission.pages.map(p => p.path).filter(p => snapshots[p] && !snapshots[p].error);
      const home = snapshots[submission.homePath];

      const mkRow = (item, sectionId, extra) => ({ id: item.id, sectionId, label: item.label,
        mode: item.mode ?? 'auto', scope: item.scope, check: item.check,
        max: item.max, required: item.required, overridden: false,
        auto: 0, final: 0, passed: undefined, needsReview: item.mode === 'assisted',
        evidence: [], ...extra });

      for (const sec of config.sections) {
        for (const item of sec.items) {
          if (item.scope === 'home' || item.scope === 'site') {
            const snap = item.scope === 'home' ? home : undefined;
            const row = mkRow(item, sec.id, {});
            if (item.scope === 'home' && (!snap || snap.error)) {
              row.needsReview = true;
              row.evidence = [{ level: 'fail', text: 'Could not analyse the home page' }];
            } else {
              const r = await runOn(item, snap, snapshots, submission, config);
              row.auto = toScore(item, r.fraction); row.needsReview = row.needsReview || r.needsReview;
              row.evidence = r.evidence;
            }
            row.final = row.auto;
            if (item.required) row.passed = row.auto === 1;
            items.push(row);
          } else if (item.scope === 'eachSubpage' || item.scope === 'eachPage') {
            const pool = item.scope === 'eachPage' ? allPages : subPages;
            const want = item.scope === 'eachPage' ? (meta.minPages ?? pool.length)
                                                   : (meta.minPages ?? pool.length + 1) - 1;
            const runs = [];
            for (const p of pool) runs.push({ path: p,
              ...(await runOn(item, snapshots[p], snapshots, submission, config)) });
            runs.sort((a, b) => b.fraction - a.fraction ||
              pool.indexOf(a.path) - pool.indexOf(b.path));
            const kept = runs.slice(0, want);
            while (kept.length < want) kept.push({ path: null, fraction: 0,
              evidence: [{ level: 'fail', text: `Required page missing` }], needsReview: false });
            kept.forEach((r, k) => {
              const row = mkRow(item, sec.id, {
                id: `${item.id}#${k + 1}`,
                label: `${item.label} — ${r.path ?? `missing page ${k + 1}`}` });
              row.auto = row.final = r.path ? toScore(item, r.fraction) : 0;
              row.needsReview = row.needsReview || !!r.needsReview;
              row.evidence = r.evidence;
              if (item.required) row.passed = r.path ? row.auto === 1 : false;
              items.push(row);
            });
          } else { // subpages aggregate
            const runs = [];
            for (const p of subPages) runs.push({ path: p,
              ...(await runOn(item, snapshots[p], snapshots, submission, config)) });
            runs.sort((a, b) => b.fraction - a.fraction);
            const want = (meta.minPages ?? subPages.length + 1) - 1;
            const kept = runs.slice(0, want);
            const denom = Math.max(want, kept.length) || 1;
            const fraction = kept.reduce((a, r) => a + r.fraction, 0) / denom;
            const row = mkRow(item, sec.id, {
              perPage: kept.map(r => ({ path: r.path,
                score: item.max ? U.clamp(Math.round(r.fraction * item.max), 0, item.max) : +(r.fraction.toFixed(2)),
                evidence: r.evidence })) });
            row.auto = row.final = toScore(item, fraction);
            row.needsReview = row.needsReview || kept.some(r => r.needsReview);
            row.evidence = kept.flatMap(r => r.evidence);
            if (item.required) row.passed = row.auto === 1;
            items.push(row);
          }
        }
      }

      const deductions = [];
      for (const d of config.deductions ?? []) {
        const res = await A.checks[d.check]({ snapshots, submission, config, params: d.params ?? {} });
        const instances = (res.instances ?? []).map(i => ({ ...i,
          confirmed: d.mode !== 'assisted',
          points: d.perInstance ?? 0 }));
        deductions.push({ id: d.id, label: d.label, perInstance: d.perInstance,
          flat: d.flat, mode: d.mode ?? 'auto', instances, total: 0 });
      }

      const sheet = { configId: meta.id, items,
        sections: config.sections.map(s => ({ id: s.id, title: s.title, points: s.points ?? null,
          score: 0, reqTotal: 0, reqMet: 0 })),
        deductions, totalPoints: meta.totalPoints ?? null, total: 0,
        mappedMark: null, requirementsTotal: 0, requirementsMet: 0 };
      A.scoring.recomputeTotals(sheet, config);
      return sheet;
    },

    recomputeTotals(sheet, config) {
      for (const sec of sheet.sections) {
        const rows = sheet.items.filter(i => i.sectionId === sec.id);
        sec.score = rows.reduce((a, i) => a + (i.max ? i.final : 0), 0);
        sec.reqTotal = rows.filter(i => i.required).length;
        sec.reqMet = rows.filter(i => i.required && i.passed).length;
      }
      for (const d of sheet.deductions)
        d.total = typeof d.flat === 'number'
          ? (d.instances.length ? d.flat : 0)
          : d.instances.reduce((a, i) => a + (i.confirmed ? i.points : 0), 0);
      const scored = sheet.items.reduce((a, i) => a + (i.max ? i.final : 0), 0);
      const ded = sheet.deductions.reduce((a, d) => a + d.total, 0);
      sheet.total = Math.max(0, scored + ded);
      sheet.requirementsTotal = sheet.sections.reduce((a, s) => a + s.reqTotal, 0);
      sheet.requirementsMet = sheet.sections.reduce((a, s) => a + s.reqMet, 0);
      const m = config.meta;
      sheet.mappedMark = (m.mappedMarks && m.totalPoints)
        ? Math.max(0, A.util.round1(sheet.total / m.totalPoints * m.mappedMarks)) : null;
    },

    applyOverride(sheet, config, rowId, value) {
      const row = sheet.items.find(i => i.id === rowId);
      if (!row) return;
      if (row.required) { row.passed = !!value; row.final = value ? 1 : 0; }
      else row.final = A.util.clamp(Math.round(value), 0, row.max);
      row.overridden = true;
      A.scoring.recomputeTotals(sheet, config);
    },

    setDeductionConfirmed(sheet, config, dedId, index, confirmed) {
      const d = sheet.deductions.find(x => x.id === dedId);
      if (d && d.instances[index]) d.instances[index].confirmed = confirmed;
      A.scoring.recomputeTotals(sheet, config);
    }
  };

  A.processSubmissionBytes = async (name, bytes, config = A.state.config) => {
    let record;
    try {
      if (bytes.length > 50 * 1024 * 1024)
        throw new Error(`Zip is ${Math.round(bytes.length / 1048576)} MB — over the 50 MB guard`);
      const submission = await A.loadSubmission(name, bytes);
      const { snapshots } = await A.analyzeSubmission(submission,
        { viewport: config.meta.viewport, responsiveWidths: config.meta.responsiveWidths });
      const sheet = await A.scoring.scoreSubmission({ submission, snapshots }, config);
      record = { name, submission, snapshots, sheet };
    } catch (e) { record = { name, error: String(e.message || e) }; }
    A.state.records.push(record);
    return record;
  };
})();
</script>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add index.html tests/unit/scoring.test.mjs
git commit -m "feat: scoring engine with scope expansion, deductions, overrides and pipeline entry"
```

### Task 14: UI — batch flow, score sheet, previews, overrides

**Files:**
- Modify: `index.html` (fill `<style id="app-style">` and `<script id="module-ui"></script>`)
- Test: `tests/e2e/ui-smoke.test.mjs`

**Interfaces:**
- Consumes: `processSubmissionBytes`, `scoring.applyOverride`, `scoring.setDeductionConfirmed`, `renderPage`, `presets`, `state`.
- Produces: `Automarker.UI = { init(), renderAll(), openPreview(recordIndex, path) }` (init auto-runs). DOM contract used by tests and Task 15 (do not rename): `[data-testid="drop-input"]` (hidden `<input type="file" multiple accept=".zip">`), `[data-testid="rubric-select"]`, `[data-testid="record-item"]` (sidebar entries), `[data-testid="total-points"]`, `[data-testid="mapped-mark"]`, `[data-testid="req-met"]`, score rows `[data-row-id="<sheet item id>"]` each containing `.score-btns button[data-val]` (scored) or `.req-toggle` (requirement), deduction instances `[data-ded-id][data-idx] input[type=checkbox]`, `[data-testid="preview-btn"]`, `#preview-modal` with `[data-testid="preview-tab"]` buttons and `#preview-body`.
- Behaviour: dropping/selecting N zips processes them sequentially with a progress line; selecting a record renders its sheet; changing the rubric select clears records (with confirm) and sets `state.config`; assisted rows get class `needs-review`; overridden scores get class `overridden`; totals bar updates after every interaction. The totals bar includes `[data-testid="home-select"]` — a dropdown of the record's pages showing the detected home page; changing it re-derives `subPagePaths` and re-scores the record against the existing snapshots (spec: home detection must be correctable).

- [ ] **Step 1: Write the failing test**

`tests/e2e/ui-smoke.test.mjs`:
```js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchApp } from '../helpers/harness.mjs';
import { buildZip } from '../helpers/zipwrite.mjs';

let app;
before(async () => { app = await launchApp(); });
after(async () => { await app.close(); });

const NAV = p => `<nav style="background:#123;padding:8px">
  ${['index.html','about.html','products.html','gallery.html','contact.html','reserve.html']
    .map(x => `<a href="${x}" style="color:#fff;text-decoration:none;padding:6px">${x.split('.')[0]}</a>`).join('')}</nav>`;
const page = (t, body) => `<html><head><title>${t}</title><style>
  body{margin:0;font-family:Arial} main{max-width:900px;margin:0 auto;padding:20px}</style></head>
  <body id="top">${NAV()}<main><h1>${t}</h1>${body}</main>
  <a href="#top">Back to top</a></body></html>`;
const SITE = Object.fromEntries([
  ['index.html', page('Sport Home', '<p>Welcome to our sport store with shoes and gear, simply teh best.</p>')],
  ...['about', 'products', 'gallery', 'contact', 'reserve']
    .map(n => [`${n}.html`, page(n, `<p>${n} content for the sport store</p>`)])]);

test('drop a zip, see the sheet, override a score, confirm a spelling deduction', async () => {
  const { page: p } = app;
  const zip = buildZip(Object.entries(SITE).map(([path, data]) => ({ path, data })));
  await p.setInputFiles('[data-testid="drop-input"]',
    { name: 'alice_12345.zip', mimeType: 'application/zip', buffer: zip });
  await p.waitForSelector('[data-testid="record-item"]', { timeout: 30000 });
  await p.click('[data-testid="record-item"]');
  await p.waitForSelector('[data-row-id="nav-home"]');
  assert.match(await p.textContent('[data-testid="record-item"]'), /alice_12345/);

  const before = parseFloat(await p.textContent('[data-testid="total-points"]'));
  await p.click('[data-row-id="home-weight"] .score-btns button[data-val="0"]');
  const after = parseFloat(await p.textContent('[data-testid="total-points"]'));
  assert.ok(after < before, `${after} !< ${before}`);
  const cls = await p.getAttribute('[data-row-id="home-weight"]', 'class');
  assert.match(cls, /overridden/);

  const spell = await p.$('[data-ded-id="spelling"][data-idx="0"] input[type=checkbox]');
  assert.ok(spell, 'spelling instance rendered ("Teh" typo)');
  const t1 = parseFloat(await p.textContent('[data-testid="total-points"]'));
  await spell.check();
  const t2 = parseFloat(await p.textContent('[data-testid="total-points"]'));
  assert.equal(t2, t1 - 1);

  assert.ok(await p.$('[data-row-id="home-aesthetic"].needs-review'), 'assisted row flagged');
  await p.click('[data-testid="preview-btn"]');
  await p.waitForSelector('#preview-modal:not([hidden]) iframe');
  assert.ok((await p.$$('[data-testid="preview-tab"]')).length === 6);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — no UI elements.

- [ ] **Step 3: Implement the styles**

Replace the contents of `<style id="app-style">` with:
```css
:root { --bg:#f5f7fa; --panel:#fff; --ink:#1d2733; --muted:#5b6b7c; --line:#dde4ec;
  --accent:#1665c1; --pass:#1d8a4e; --fail:#c03d2e; --warn:#b7791f; --warn-bg:#fdf3e0; }
* { box-sizing: border-box; }
body { margin:0; font:14px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;
  background:var(--bg); color:var(--ink); }
#render-host { position:absolute; left:-100000px; top:0; }
header.app { display:flex; gap:12px; align-items:center; padding:10px 16px;
  background:var(--panel); border-bottom:1px solid var(--line); flex-wrap:wrap; }
header.app h1 { font-size:16px; margin:0 12px 0 0; }
select,button { font:inherit; padding:6px 10px; border:1px solid var(--line);
  border-radius:6px; background:#fff; cursor:pointer; }
button.primary { background:var(--accent); border-color:var(--accent); color:#fff; }
#drop-zone { border:2px dashed var(--line); border-radius:8px; padding:6px 14px;
  color:var(--muted); cursor:pointer; }
#drop-zone.hover { border-color:var(--accent); color:var(--accent); }
.layout { display:flex; min-height:calc(100vh - 54px); }
#sidebar { width:230px; border-right:1px solid var(--line); background:var(--panel);
  padding:8px; overflow-y:auto; }
.rec { padding:8px; border-radius:6px; cursor:pointer; display:flex;
  justify-content:space-between; gap:6px; }
.rec.active { background:#e8f0fb; }
.rec .mark { color:var(--muted); }
.rec.error { color:var(--fail); }
#detail { flex:1; padding:16px; max-width:1100px; }
.totals { position:sticky; top:0; z-index:5; display:flex; gap:24px; padding:10px 14px;
  background:var(--panel); border:1px solid var(--line); border-radius:8px; margin-bottom:14px; }
.totals b { font-size:18px; }
section.sec { background:var(--panel); border:1px solid var(--line); border-radius:8px;
  margin-bottom:14px; }
section.sec > h2 { font-size:14px; margin:0; padding:10px 14px;
  border-bottom:1px solid var(--line); display:flex; justify-content:space-between; }
.row { display:flex; gap:10px; padding:8px 14px; border-bottom:1px solid var(--line);
  align-items:flex-start; }
.row:last-child { border-bottom:0; }
.row.needs-review { background:var(--warn-bg); }
.row .lbl { flex:1; }
.row .lbl .badge { font-size:11px; color:var(--warn); border:1px solid var(--warn);
  border-radius:4px; padding:0 4px; margin-left:6px; }
.row details { color:var(--muted); font-size:13px; margin-top:2px; }
.row .ev-pass { color:var(--pass); } .row .ev-fail { color:var(--fail); }
.score-btns button { padding:2px 8px; margin-left:2px; }
.score-btns button.sel { background:var(--accent); color:#fff; border-color:var(--accent); }
.row.overridden .score-btns button.sel { background:var(--warn); border-color:var(--warn); }
.req-toggle { min-width:44px; text-align:center; font-weight:600; }
.req-toggle.pass { color:var(--pass); } .req-toggle.fail { color:var(--fail); }
.ded-inst { display:flex; gap:8px; padding:4px 14px; align-items:center; }
#preview-modal { position:fixed; inset:3vh 3vw; background:var(--panel);
  border:1px solid var(--line); border-radius:10px; z-index:50; display:flex;
  flex-direction:column; box-shadow:0 12px 40px rgba(0,0,0,.25); }
#preview-modal[hidden] { display:none; }
#preview-tabs { display:flex; gap:6px; padding:8px; border-bottom:1px solid var(--line);
  flex-wrap:wrap; }
#preview-body { flex:1; overflow:auto; padding:8px; }
#preview-body iframe { width:1280px; height:76vh; border:1px solid var(--line); }
#progress { color:var(--muted); }
```

- [ ] **Step 4: Implement the UI module**

Replace `<script id="module-ui"></script>` with:
```html
<script id="module-ui">
(() => {
  const A = Automarker;
  const $ = (s, r = document) => r.querySelector(s);
  const el = (tag, attrs = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') e.className = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (v !== null && v !== undefined) e.setAttribute(k, v);
    }
    e.append(...kids.filter(k => k !== null && k !== undefined));
    return e;
  };
  let activeIdx = -1, previewHandle = null;

  function init() {
    const app = $('#app');
    app.innerHTML = '';
    const input = el('input', { type: 'file', multiple: '', accept: '.zip',
      'data-testid': 'drop-input', style: 'display:none',
      onchange: e => ingest([...e.target.files]) });
    const drop = el('div', { id: 'drop-zone',
      onclick: () => input.click(),
      ondragover: e => { e.preventDefault(); drop.classList.add('hover'); },
      ondragleave: () => drop.classList.remove('hover'),
      ondrop: e => { e.preventDefault(); drop.classList.remove('hover');
        ingest([...e.dataTransfer.files].filter(f => /\.zip$/i.test(f.name))); } },
      'Drop submission zip(s) here or click to choose');
    const sel = el('select', { 'data-testid': 'rubric-select',
      onchange: () => {
        if (A.state.records.length &&
          !confirm('Changing the rubric clears loaded submissions. Continue?')) {
          sel.value = A.state.config.meta.id; return;
        }
        A.state.records = []; activeIdx = -1;
        A.state.config = A.presets[sel.value] ?? A.state.config;
        renderAll();
      } },
      ...Object.values(A.presets).map(p =>
        el('option', { value: p.meta.id }, p.meta.title)));
    app.append(
      el('header', { class: 'app' },
        el('h1', {}, 'HTML/CSS Submission Automarker'),
        sel, drop, input, el('span', { id: 'progress' })),
      el('div', { class: 'layout' },
        el('div', { id: 'sidebar' }), el('div', { id: 'detail' })),
      el('div', { id: 'preview-modal', hidden: '' },
        el('div', { id: 'preview-tabs' }), el('div', { id: 'preview-body' })));
    renderAll();
  }

  async function ingest(files) {
    const prog = $('#progress');
    for (let i = 0; i < files.length; i++) {
      prog.textContent = `Marking ${i + 1}/${files.length}: ${files[i].name}…`;
      const bytes = new Uint8Array(await files[i].arrayBuffer());
      await A.processSubmissionBytes(files[i].name.replace(/\.zip$/i, ''), bytes);
      if (activeIdx < 0) activeIdx = 0;
      renderAll();
    }
    prog.textContent = `${A.state.records.length} submission(s) marked`;
  }

  function renderAll() { renderSidebar(); renderDetail(); }

  function renderSidebar() {
    const side = $('#sidebar'); side.innerHTML = '';
    A.state.records.forEach((r, i) => {
      const mark = r.error ? '⚠' : (r.sheet.mappedMark ?? `${r.sheet.requirementsMet}/${r.sheet.requirementsTotal}`);
      side.append(el('div', { class: `rec ${i === activeIdx ? 'active' : ''} ${r.error ? 'error' : ''}`,
        'data-testid': 'record-item',
        onclick: () => { activeIdx = i; renderAll(); } },
        el('span', {}, r.name), el('span', { class: 'mark' }, String(mark))));
    });
  }

  function scoreControls(rec, row) {
    const cfg = A.state.config, sheet = rec.sheet;
    if (row.required) {
      return el('button', { class: `req-toggle ${row.passed ? 'pass' : 'fail'}`,
        onclick: () => { A.scoring.applyOverride(sheet, cfg, row.id, !row.passed); renderAll(); } },
        row.passed ? '✓ met' : '✗ unmet');
    }
    const wrap = el('span', { class: 'score-btns' });
    for (let v = 0; v <= row.max; v++)
      wrap.append(el('button', { 'data-val': v, class: v === row.final ? 'sel' : '',
        onclick: () => { A.scoring.applyOverride(sheet, cfg, row.id, v); renderAll(); } }, String(v)));
    return wrap;
  }

  function renderDetail() {
    const d = $('#detail'); d.innerHTML = '';
    const rec = A.state.records[activeIdx];
    if (!rec) { d.append(el('p', {}, 'Load one or more submission zips to begin.')); return; }
    if (rec.error) { d.append(el('p', { class: 'ev-fail' }, `Could not mark: ${rec.error}`)); return; }
    const s = rec.sheet;
    d.append(el('div', { class: 'totals' },
      el('span', {}, 'Points: ', el('b', { 'data-testid': 'total-points' }, String(s.total)),
        s.totalPoints ? ` / ${s.totalPoints}` : ''),
      s.mappedMark !== null ? el('span', {}, 'Mark: ',
        el('b', { 'data-testid': 'mapped-mark' }, String(s.mappedMark))) : '',
      el('span', {}, 'Requirements: ',
        el('b', { 'data-testid': 'req-met' }, `${s.requirementsMet}/${s.requirementsTotal}`)),
      el('label', {}, 'Home: ', el('select', { 'data-testid': 'home-select',
        onchange: async e => {
          const sub2 = rec.submission;
          sub2.homePath = e.target.value;
          sub2.subPagePaths = sub2.pages.map(p => p.path).filter(p => p !== sub2.homePath);
          rec.sheet = await A.scoring.scoreSubmission(
            { submission: sub2, snapshots: rec.snapshots }, A.state.config);
          renderAll();
        } },
        ...rec.submission.pages.map(pg => {
          const o = el('option', { value: pg.path }, pg.path);
          if (pg.path === rec.submission.homePath) o.selected = true;
          return o;
        }))),
      el('button', { 'data-testid': 'preview-btn', class: 'primary',
        onclick: () => openPreview(activeIdx, rec.submission.homePath) }, 'Preview pages')));
    for (const sec of s.sections) {
      const box = el('section', { class: 'sec' },
        el('h2', {}, sec.title,
          el('span', {}, sec.points ? `${sec.score} / ${sec.points}`
            : `${sec.reqMet}/${sec.reqTotal} met`)));
      for (const row of s.items.filter(i => i.sectionId === sec.id)) {
        box.append(el('div', { class: `row ${row.needsReview ? 'needs-review' : ''} ${row.overridden ? 'overridden' : ''}`,
          'data-row-id': row.id },
          el('div', { class: 'lbl' }, row.label,
            row.needsReview ? el('span', { class: 'badge' }, 'review') : null,
            el('details', {}, el('summary', {}, 'evidence'),
              ...row.evidence.map(e2 => el('div', { class: `ev-${e2.level}` }, e2.text)),
              ...(row.perPage ?? []).map(pp =>
                el('div', {}, `${pp.path}: ${pp.score}`)))),
          scoreControls(rec, row)));
      }
      box.append(...[]);
      d.append(box);
    }
    const dedBox = el('section', { class: 'sec' }, el('h2', {}, 'Deductions',
      el('span', {}, String(s.deductions.reduce((a, x) => a + x.total, 0)))));
    for (const ded of s.deductions) {
      dedBox.append(el('div', { class: 'row' }, el('div', { class: 'lbl' },
        `${ded.label} (${ded.total})`)));
      ded.instances.forEach((inst, idx) => {
        const cb = el('input', { type: 'checkbox',
          onchange: e => { A.scoring.setDeductionConfirmed(s, A.state.config, ded.id, idx, e.target.checked); renderAll(); } });
        cb.checked = inst.confirmed;
        if (ded.mode !== 'assisted') cb.disabled = true;
        dedBox.append(el('label', { class: 'ded-inst', 'data-ded-id': ded.id, 'data-idx': idx },
          cb, el('span', {}, inst.text)));
      });
    }
    d.append(dedBox);
  }

  async function openPreview(recIdx, path) {
    const rec = A.state.records[recIdx];
    const modal = $('#preview-modal'), tabs = $('#preview-tabs'), body = $('#preview-body');
    modal.hidden = false; tabs.innerHTML = ''; body.innerHTML = '';
    tabs.append(el('button', { onclick: () => { closePreview(); } }, '✕ close'));
    for (const pg of rec.submission.pages)
      tabs.append(el('button', { 'data-testid': 'preview-tab',
        onclick: () => openPreview(recIdx, pg.path) }, pg.path));
    if (previewHandle) { previewHandle.cleanup(); previewHandle = null; }
    previewHandle = await A.renderPage(rec.submission, path,
      { width: 1280, height: 800 });
    body.append(previewHandle.iframe);   // moves the iframe out of #render-host
    previewHandle.iframe.style.height = '76vh';
  }
  function closePreview() {
    if (previewHandle) { previewHandle.cleanup(); previewHandle = null; }
    $('#preview-modal').hidden = true;
  }

  A.UI = { init, renderAll, openPreview };
  init();
})();
</script>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS. If the preview iframe count fails, remember `openPreview` re-renders tabs each call — six pages → six tab buttons plus the close button (the selector filters on `data-testid`, so the close button is excluded).

- [ ] **Step 6: Commit**

```bash
git add index.html tests/e2e/ui-smoke.test.mjs
git commit -m "feat: marking UI — batch ingest, score sheet, overrides, deductions, previews"
```

### Task 15: Exporter (CSV + feedback) and rubric builder / config import-export

**Files:**
- Modify: `index.html` (fill `<script id="module-export"></script>`; extend the UI header in `module-ui`)
- Test: `tests/unit/exporter.test.mjs`, `tests/e2e/builder.test.mjs`

**Interfaces:**
- Consumes: `ScoreSheet`/records (13), `Config.validate` (12), UI DOM contract (14), `checkMeta` (8).
- Produces:
  - `Automarker.exporter.toCSV(records, config) → string`. Because scope expansion always pads to fixed row counts, every sheet under one config has an identical row-id sequence. Columns: `name`, `<rowId>:auto`, `<rowId>:final` for every row, `<sectionId>:score` per section, `<dedId>:total` per deduction, `overridden` (semicolon-joined row ids), `total`, `mappedMark`, `requirementsMet`, `requirementsTotal`, `error`. RFC-4180 quoting (quote fields containing `",\n`; double inner quotes). Error records emit name + error only.
  - `Automarker.exporter.feedbackHTML(record, config) → string` — standalone printable HTML: submission name, rubric title, totals, per-section tables (label, score/max or met/unmet, evidence lines), deductions with confirmed instances marked.
  - `Automarker.exporter.download(filename, text, mime)` — blob + temporary `<a download>`.
  - UI additions (header): `[data-testid="export-csv"]` button (downloads `results.csv`), `[data-testid="export-feedback"]` (downloads `<name>-feedback.html` for the active record), `[data-testid="open-builder"]` button opening `#builder-modal` with: a `[data-testid="builder-json"]` textarea (current config, pretty-printed), `[data-testid="builder-validate"]` (shows `Config.validate` output in `[data-testid="builder-errors"]`), `[data-testid="builder-apply"]` (validate → confirm-clear records → set `state.config`, add/select an entry in the rubric select), `[data-testid="builder-import"]` file input and `[data-testid="builder-export"]` download button, and a form pane listing every item (`section / id / check / scope / max|required`) with per-item **remove** buttons and an **add item** row (`[data-testid="builder-add"]`): select over `Object.keys(Automarker.checkMeta)`, scope select, points input (empty = requirement), target section select — adding updates the JSON textarea live (the JSON pane is the source of truth; the form pane is a convenience editor over it).
- Preset configs are immutable: applying builder changes ALWAYS clones to a config with `meta.id` suffixed `-custom` (unless already so) so presets stay pristine.

- [ ] **Step 1: Write the failing tests**

`tests/unit/exporter.test.mjs`:
```js
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
```

`tests/e2e/builder.test.mjs`:
```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — exporter and builder missing.

- [ ] **Step 3: Implement the exporter**

Replace `<script id="module-export"></script>` with:
```html
<script id="module-export">
(() => {
  const A = Automarker;
  const q = v => { const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');

  A.exporter = {
    toCSV(records, config) {
      const model = records.find(r => r.sheet)?.sheet;
      if (!model) return 'name,error\n' +
        records.map(r => `${q(r.name)},${q(r.error ?? '')}`).join('\n');
      const rowIds = model.items.map(i => i.id);
      const head = ['name',
        ...rowIds.flatMap(id => [`${id}:auto`, `${id}:final`]),
        ...model.sections.map(s => `${s.id}:score`),
        ...model.deductions.map(d => `${d.id}:total`),
        'overridden', 'total', 'mappedMark', 'requirementsMet', 'requirementsTotal', 'error'];
      const lines = [head.map(q).join(',')];
      for (const r of records) {
        if (!r.sheet) { lines.push([q(r.name), ...head.slice(1, -1).map(() => ''), q(r.error)].join(',')); continue; }
        const by = Object.fromEntries(r.sheet.items.map(i => [i.id, i]));
        lines.push([q(r.name),
          ...rowIds.flatMap(id => [by[id]?.auto ?? '', by[id]?.final ?? '']),
          ...r.sheet.sections.map(s => s.score),
          ...r.sheet.deductions.map(d => d.total),
          q(r.sheet.items.filter(i => i.overridden).map(i => i.id).join(';')),
          r.sheet.total, r.sheet.mappedMark ?? '',
          r.sheet.requirementsMet, r.sheet.requirementsTotal, ''].join(','));
      }
      return lines.join('\n') + '\n';
    },

    feedbackHTML(record, config) {
      const s = record.sheet;
      const secHtml = s.sections.map(sec => `<h2>${esc(sec.title)} — ${
        sec.points ? `${sec.score}/${sec.points}` : `${sec.reqMet}/${sec.reqTotal} met`}</h2>
        <table border="1" cellspacing="0" cellpadding="6" width="100%">
        ${s.items.filter(i => i.sectionId === sec.id).map(i => `<tr>
          <td>${esc(i.label)}${i.overridden ? ' <em>(adjusted)</em>' : ''}</td>
          <td align="center">${i.required ? (i.passed ? '✓' : '✗') : `${i.final}/${i.max}`}</td>
          <td>${i.evidence.map(e => `<div>${esc(e.text)}</div>`).join('')}</td></tr>`).join('')}
        </table>`).join('');
      const dedHtml = s.deductions.map(d => `<p><b>${esc(d.label)}: ${d.total}</b>${
        d.instances.filter(i => i.confirmed).map(i => `<br>− ${esc(i.text)}`).join('')}</p>`).join('');
      return `<!DOCTYPE html><html><head><meta charset="utf-8">
        <title>Feedback — ${esc(record.name)}</title>
        <style>body{font:14px/1.5 system-ui;margin:24px;max-width:900px}
        table{border-collapse:collapse;margin-bottom:16px}td{vertical-align:top}</style></head>
        <body><h1>${esc(record.name)}</h1><p>${esc(config.meta.title)}</p>
        <p><b>Total: ${s.total}${s.totalPoints ? '/' + s.totalPoints : ''}${
          s.mappedMark !== null ? ` — mark ${s.mappedMark}` : ''}</b>
          — requirements ${s.requirementsMet}/${s.requirementsTotal}</p>
        ${secHtml}<h2>Deductions</h2>${dedHtml}</body></html>`;
    },

    download(filename, text, mime = 'text/plain') {
      const u = URL.createObjectURL(new Blob([text], { type: mime }));
      const a = document.createElement('a');
      a.href = u; a.download = filename; document.body.appendChild(a);
      a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 5000);
    }
  };
})();
</script>
```

- [ ] **Step 4: Extend the UI with export buttons and the builder modal**

In `module-ui`, extend `init()`'s header row (after the progress span) with:
```js
el('button', { 'data-testid': 'export-csv', onclick: () =>
  A.exporter.download('results.csv',
    A.exporter.toCSV(A.state.records, A.state.config), 'text/csv') }, 'Export CSV'),
el('button', { 'data-testid': 'export-feedback', onclick: () => {
  const r = A.state.records[activeIdx];
  if (r && r.sheet) A.exporter.download(`${r.name}-feedback.html`,
    A.exporter.feedbackHTML(r, A.state.config), 'text/html'); } }, 'Feedback report'),
el('button', { 'data-testid': 'open-builder', onclick: openBuilder }, 'Rubric builder')
```
and append to `app` a `#builder-modal` (same fixed-position styling class as `#preview-modal`; add `#builder-modal` to the existing CSS selectors) implemented as:
```js
function openBuilder() {
  const modal = $('#builder-modal'); modal.hidden = false;
  const ta = $('[data-testid="builder-json"]', modal);
  ta.value = JSON.stringify(A.state.config, null, 2);
  renderBuilderForm();
}
function builderConfig() {
  try { return { cfg: JSON.parse($('[data-testid="builder-json"]').value) }; }
  catch (e) { return { err: `JSON parse error: ${e.message}` }; }
}
function renderBuilderForm() {
  const pane = $('#builder-form'); pane.innerHTML = '';
  const { cfg } = builderConfig(); if (!cfg) return;
  for (const sec of cfg.sections ?? []) for (const it of sec.items ?? [])
    pane.append(el('div', { class: 'ded-inst' },
      el('span', {}, `${sec.id} / ${it.id} — ${it.check} @${it.scope} ${it.max ? it.max + 'pt' : 'required'}`),
      el('button', { onclick: () => {
        sec.items = sec.items.filter(x => x !== it);
        $('[data-testid="builder-json"]').value = JSON.stringify(cfg, null, 2);
        renderBuilderForm(); } }, 'remove')));
  const checkSel = el('select', { name: 'check' },
    ...Object.keys(A.checkMeta).sort().map(c => el('option', { value: c }, c)));
  const scopeSel = el('select', { name: 'scope' },
    ...['home', 'eachSubpage', 'subpages', 'eachPage', 'site'].map(sc => el('option', { value: sc }, sc)));
  const pts = el('input', { name: 'points', type: 'number', placeholder: 'points (empty = required)' });
  const secSel = el('select', { name: 'section' },
    ...(cfg.sections ?? []).map(s2 => el('option', { value: s2.id }, s2.id)));
  pane.append(el('div', { class: 'ded-inst', 'data-testid': 'builder-add' },
    checkSel, scopeSel, pts, secSel,
    el('button', { onclick: () => {
      const sec = cfg.sections.find(s2 => s2.id === secSel.value);
      const item = { id: `custom-${Date.now() % 100000}`,
        label: A.checkMeta[checkSel.value].label, check: checkSel.value,
        mode: 'auto', scope: scopeSel.value };
      if (pts.value) item.max = +pts.value; else item.required = true;
      sec.items.push(item);
      delete sec.points;                       // custom edits invalidate declared totals
      delete cfg.meta.totalPoints; delete cfg.meta.mappedMarks;
      $('[data-testid="builder-json"]').value = JSON.stringify(cfg, null, 2);
      renderBuilderForm(); } }, 'add item')));
}
function builderValidate() {
  const out = $('[data-testid="builder-errors"]');
  const { cfg, err } = builderConfig();
  if (err) { out.textContent = err; return null; }
  const errs = A.Config.validate(cfg);
  out.textContent = errs.length ? errs.join('\n') : 'Config is valid ✓';
  return errs.length ? null : cfg;
}
function builderApply() {
  const cfg = builderValidate(); if (!cfg) return;
  if (A.state.records.length && !confirm('Applying a rubric clears loaded submissions. Continue?')) return;
  if (!cfg.meta.id.endsWith('-custom')) cfg.meta.id += '-custom';
  cfg.meta.title = cfg.meta.title.endsWith(' (custom)') ? cfg.meta.title : cfg.meta.title + ' (custom)';
  A.presets[cfg.meta.id] = cfg;
  A.state.config = cfg; A.state.records = []; activeIdx = -1;
  init();                                       // rebuild header so the select includes the new entry
  $('[data-testid="rubric-select"]').value = cfg.meta.id;
  $('#builder-modal').hidden = true;
}
```
Builder modal markup (in `init()`):
```js
el('div', { id: 'builder-modal', hidden: '' },
  el('div', { id: 'preview-tabs' },
    el('button', { onclick: () => { $('#builder-modal').hidden = true; } }, '✕ close'),
    el('button', { 'data-testid': 'builder-validate', onclick: builderValidate }, 'Validate'),
    el('button', { 'data-testid': 'builder-apply', class: 'primary', onclick: builderApply }, 'Apply'),
    el('button', { 'data-testid': 'builder-export', onclick: () => {
      const { cfg } = builderConfig();
      if (cfg) A.exporter.download(`${cfg.meta.id ?? 'rubric'}.json`,
        JSON.stringify(cfg, null, 2), 'application/json'); } }, 'Export JSON'),
    el('label', {}, 'Import ', el('input', { type: 'file', accept: '.json',
      'data-testid': 'builder-import', onchange: async e => {
        $('[data-testid="builder-json"]').value = await e.target.files[0].text();
        renderBuilderForm(); builderValidate(); } }))),
  el('div', { id: 'preview-body', style: 'display:flex;gap:10px' },
    el('textarea', { 'data-testid': 'builder-json',
      style: 'flex:1;min-height:60vh;font-family:monospace',
      oninput: renderBuilderForm }),
    el('div', { id: 'builder-form', style: 'flex:1;overflow:auto' })),
  el('pre', { 'data-testid': 'builder-errors', style: 'padding:8px 14px;color:var(--fail)' }));
```
Add CSS: `#builder-modal { position:fixed; inset:3vh 3vw; background:var(--panel); border:1px solid var(--line); border-radius:10px; z-index:60; display:flex; flex-direction:column; box-shadow:0 12px 40px rgba(0,0,0,.25);} #builder-modal[hidden]{display:none;}`

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add index.html tests/unit/exporter.test.mjs tests/e2e/builder.test.mjs
git commit -m "feat: CSV/feedback exports and rubric builder with JSON import/export"
```

---

### Task 16: End-to-end fixtures, coverage guard, README + GitHub Pages polish

**Files:**
- Create: `tests/fixtures/sites.mjs`, `tests/e2e/fixtures.test.mjs`, `tests/e2e/coverage-guard.test.mjs`, `.nojekyll`
- Modify: `README.md`

**Interfaces:**
- Consumes: everything.
- Produces: `sites.mjs` exports `alphaPerfect()`, `bravoFlawed()`, `charlieMinimal()`, `deltaMessy()`, `echoPortfolio()`, `foxtrotGaps()` — each returns `{ [path]: string | Buffer }` ready for `buildZip`. Also `writeDemoZips(dir)` (used manually: `node -e "import('./tests/fixtures/sites.mjs').then(m => m.writeDemoZips('demo'))"`).

**Fixture content requirements (the generator must satisfy ALL of these):**

`alphaPerfect()` — CSE1IIT full marks. Six pages: `index.html`, `about.html`, `products.html`, `gallery.html`, `contact.html`, `reserve.html`, one shared `css/site.css`, SVG images under `img/`. Every page: the same styled `<nav>` (background, padding, undecorated white links) linking all six; `<header>` with `<a href="index.html"><img src="img/logo.svg" alt="La Trobe Sports logo" width="140"></a>` top-left; `<main>` max-width 960 centred, ≥ 2 `<section>`s; h1 + h2 headings; footer; `<a href="#top">Back to top</a>` after a tall content block (body id="top"; give each page a ≥ 1800px-high main via section min-heights so the anchor sits in the lower half); body/paragraph fonts Arial 16px dark-on-light (contrast > 7); palette: navy `#14406b` + orange accent `#e67e22` + neutrals. Home: intro ≥ 60 words containing "sport", "shoes", "gear"; a "New arrivals and promotions" section; `<a href="products.html">Shop now</a>` CTA; hero image ≥ 300px. Every sub-page: exactly 2+ good SVG images displayed 300px (natural 600×400, so no stretching), ≥ 50 words containing a topic keyword, h1+h2. `contact.html`: address `123 Plenty Road, Bundoora VIC 3083`, hours `Open Mon–Fri 9:00am – 5:30pm`, `<img src="img/map.svg" alt="map to our store">`, phone `(03) 9479 1234`, `mailto:` link. No external URLs anywhere, no misspellings (run the embedded spell-checker mentally: plain English + whitelisted terms only).

`bravoFlawed()` — `alphaPerfect()` with EXACTLY these eight seeded defects (helper mutates the alpha object):
1. `products.html`: nav omits the `contact.html` link.
2. `about.html`: extra `<a href="missing.html">old page</a>` in main.
3. `gallery.html`: extra `<img src="img/ghost.svg">` (no such file) — a third image, so the 2 good ones still satisfy `sub-images`.
4. `index.html`: extra `<a href="https://facebook.com/latrobesports">Follow us</a>`.
5. `contact.html`: logo image removed (header keeps the text brand).
6. `reserve.html`: back-to-top anchor removed.
7. `index.html`: paragraph "We definately recieve teh best reviews." appended (3 misspellings; `reviews` is fine).
8. `products.html`: hero SVG bloated with a ~5 MB comment payload → pageWeight 0 for that page.

`charlieMinimal()` — five unstyled pages (`index.html` + 4), plain `<p>` text, no CSS, no images, minimal cross-links only from index.

`deltaMessy()` — `alphaPerfect()` re-pathed: every file under `My Site Final/`; `gallery.html` renamed `GALLERY.HTML` (same extension, different case — other pages keep `href="gallery.html"` → exercises case-insensitive resolution; its own nav uses `index.html` etc. as normal); `about.html` renamed `about page.html` with all links to it as `about%20page.html`; junk entries `__MACOSX/My Site Final/._index.html` and `My Site Final/.DS_Store`.

`echoPortfolio()` — IWBS001 fully compliant. Three pages `index.html`, `favourites.html`, `place.html` + `css/style.css` + `img/photo.svg`, `img/thing.svg`, `img/place.svg` + `clip.mp4` (tiny stub bytes). Home: `<video src="clip.mp4" controls>` beside a celebrity quote; `<a href="mailto:student@uni.edu.au">email me</a>`; photo image 200px; name + "Student ID: 21234567"; ≥ 620 words across intro/background/hobbies/fun-facts/skills sections; external landmark link. Sub-pages: ≥ 520 words each; an external `https://en.wikipedia.org/...` link each. `css/style.css` linked from all three pages contains (all USED): `p{...}`, three generic classes (`.card .accent .wide`), three tag-scoped (`h2.title p.lead li.item`), three heading styles (`h1 h2 h3`), `a:hover`, two group styles (`h1,h2` and `p,li`), contextual `main p`, `button{...}` + a real `<button>`, `.gallery{display:flex}` used. Every page's embedded `<style>`: `#page-title{...}` (id on its h1), contextual `header nav a{...}`, `p.intro{...}` on a `<p class="intro">` (the brief's "class to format paragraph tags" — kind `classScoped`), `position:relative` rule, `header{...} footer{...} body{...}`. Every page: ≥ 3 inline styles including one `<div style>` and one `<span style>`. Fluid layout (max-width:100%; padding), no fixed widths > 375px.

`foxtrotGaps()` — `echoPortfolio()` with: `a:hover` rule deleted; `.ghost{color:pink}` added (unused); `.wide` class deleted from the CSS **and** its HTML usage (leaves 2 generic classes); `.gallery` display changed from `flex` to `block` (kills flexbox); `place.html`'s `<span style>` removed (2 inline styles + no span there).

- [ ] **Step 1: Write the fixture generator**

`tests/fixtures/sites.mjs` implements the fixture-content requirements above as template-literal page builders. Core skeleton for the CSE1IIT sites (extend the bodies until the content bullets are all satisfied; `svg` comes from `../helpers/harness.mjs`):
```js
import { svg } from '../helpers/harness.mjs';

const PAGES = ['index.html', 'about.html', 'products.html', 'gallery.html', 'contact.html', 'reserve.html'];
const nav = (skip = null) => `<nav class="mainnav">${PAGES.filter(p => p !== skip)
  .map(p => `<a href="${p}">${p.split('.')[0]}</a>`).join('')}</nav>`;
const CSS = `body{margin:0;font-family:Arial,Helvetica,sans-serif;background:#f2f5f8;color:#1c1c1c}
.mainnav{background:#14406b;padding:10px 16px}
.mainnav a{color:#fff;text-decoration:none;padding:8px 10px;font-size:15px}
header{background:#fff;padding:10px 24px}
main{max-width:960px;margin:0 auto;padding:24px}
section{background:#fff;margin-bottom:28px;padding:20px;min-height:560px}
h1{color:#14406b}h2{color:#e67e22}p{font-size:16px;line-height:1.6}
footer{padding:16px 24px;color:#555}`;
const page = ({ title, navSkip = null, logo = true, backToTop = true, body }) =>
  `<!DOCTYPE html><html><head><title>${title}</title>
  <link rel="stylesheet" href="css/site.css"></head><body id="top">
  <header>${logo ? '<a href="index.html"><img src="img/logo.svg" alt="La Trobe Sports logo" width="140"></a>'
                 : '<strong>La Trobe Sports</strong>'}</header>
  ${nav(navSkip)}<main><h1>${title}</h1>${body}</main>
  <footer>La Trobe Sports${backToTop ? ' — <a href="#top">Back to top</a>' : ''}</footer></body></html>`;
const pic = (name, alt) => `<img src="img/${name}" alt="${alt}" width="300">`;

export function alphaPerfect() {
  const files = {
    'css/site.css': CSS,
    'img/logo.svg': svg(280, 140, '#14406b'),
    'img/map.svg': svg(600, 400, '#7a9'),
  };
  for (const n of ['hero', 'shoes', 'kit', 'shot1', 'shot2', 'bag', 'form'])
    files[`img/${n}.svg`] = svg(600, 400, '#888');
  files['index.html'] = page({ title: 'La Trobe Sports', body: `
    <section><h2>Welcome</h2><p>Welcome to La Trobe Sports, the sport store for
    quality shoes, apparel and training gear. Our team helps every athlete find
    the right footwear and equipment for fitness, recreation and everyday active
    lifestyles, with friendly service and honest advice for all ages.</p>
    ${pic('hero.svg', 'athletes wearing sport gear')}</section>
    <section><h2>New arrivals and promotions</h2><p>Fresh running shoes and gym
    apparel land weekly, with seasonal promotions across all brands.</p>
    <a href="products.html">Shop now</a></section>` });
  files['about.html'] = page({ title: 'About Us', body: `
    <section><h2>Our story</h2><p>La Trobe Sports began as a small sport shop in
    Bundoora and grew into a full sportswear and equipment store. We stock shoes,
    training apparel and fitness accessories for local clubs, students and
    families who love an active lifestyle in every season.</p>
    ${pic('shoes.svg', 'sport shoes on display')}</section>
    <section><h2>Our mission</h2><p>Quality gear, fair prices and honest advice
    for every athlete.</p>${pic('kit.svg', 'training gear and equipment')}</section>` });
  files['products.html'] = page({ title: 'Products', body: `
    <section><h2>Running shoes and apparel</h2><p>Browse sport shoes, training
    and gym apparel, football and basketball gear, outdoor equipment and fitness
    accessories from leading brands, with sizes for adults and juniors and new
    stock arriving through the season.</p>
    ${pic('hero.svg', 'running shoes for sport')}</section>
    <section><h2>Bags and accessories</h2>${pic('bag.svg', 'sports bags and backpacks')}
    <p>Backpacks, bottles, socks and recovery accessories.</p></section>` });
  files['gallery.html'] = page({ title: 'Brands and Gallery', body: `
    <section><h2>Featured brands</h2><p>Our gallery shows sportswear collections,
    store displays and seasonal promotions from the sport brands our customers
    love, refreshed with every new arrival of shoes and gear.</p>
    ${pic('shot1.svg', 'sportswear collection display')}</section>
    <section><h2>In store</h2>${pic('shot2.svg', 'store interior with sport gear')}
    <p>Drop in to see the full range.</p></section>` });
  files['contact.html'] = page({ title: 'Store Location and Contact', body: `
    <section><h2>Find our store</h2><p>Visit us at 123 Plenty Road, Bundoora VIC 3083.
    Open Mon–Fri 9:00am – 5:30pm and Sat 10:00am – 4:00pm.</p>
    <img src="img/map.svg" alt="map to our store" width="300"></section>
    <section><h2>Contact details</h2><p>Call (03) 9479 1234 or
    <a href="mailto:hello@latrobesports.example">email the team</a> about stock,
    sizes and sport equipment for your club or fitness plans.</p>
    ${pic('form.svg', 'customer service desk at the sport store')}</section>` });
  files['reserve.html'] = page({ title: 'Product Reservation', body: `
    <section><h2>Reserve your gear</h2><p>Use this form to reserve sport shoes,
    apparel or equipment before you visit. Reservations hold stock for two days
    while you plan your trip to the store.</p>
    ${pic('form.svg', 'reservation form for sport gear')}</section>
    <section><h2>Reservation form</h2>${pic('kit.svg', 'training equipment ready for pickup')}
    <form><label>Name <input></label><label>Email <input></label>
    <label>Product <input></label><button type="submit">Reserve product</button></form></section>` });
  return files;
}
```
(The `...` above is where the remaining five page definitions go — same `page()` helper, contents per the fixture bullets. `bravoFlawed()` etc. clone `alphaPerfect()`'s object and apply their listed mutations with string replaces.) Also:
```js
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildZip } from '../helpers/zipwrite.mjs';
export function writeDemoZips(dir) {
  mkdirSync(dir, { recursive: true });
  for (const [name, fn] of Object.entries(
    { alphaPerfect, bravoFlawed, charlieMinimal, deltaMessy, echoPortfolio, foxtrotGaps })) {
    writeFileSync(join(dir, `${name}.zip`),
      buildZip(Object.entries(fn()).map(([path, data]) => ({ path, data }))));
  }
}
```

- [ ] **Step 2: Write the failing e2e tests**

`tests/e2e/fixtures.test.mjs`:
```js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchApp } from '../helpers/harness.mjs';
import { buildZip } from '../helpers/zipwrite.mjs';
import * as sites from '../fixtures/sites.mjs';

let app;
before(async () => { app = await launchApp(); });
after(async () => { await app.close(); });

const mark = (files, presetId) => app.page.evaluate(async ({ b64, presetId }) => {
  const rec = await Automarker.processSubmissionBytes('fx',
    Automarker.util.b64ToBytes(b64), Automarker.presets[presetId]);
  if (rec.error) return { error: rec.error };
  const { sheet, submission } = rec;
  return { pages: submission.pages.length, home: submission.homePath,
    total: sheet.total, mapped: sheet.mappedMark,
    reqMet: sheet.requirementsMet, reqTotal: sheet.requirementsTotal,
    rows: Object.fromEntries(sheet.items.map(i => [i.id,
      { auto: i.auto, passed: i.passed, label: i.label }])),
    deds: Object.fromEntries(sheet.deductions.map(d => [d.id,
      { total: d.total, n: d.instances.length, words: d.instances.map(i2 => i2.word) }])) };
}, { b64: buildZip(Object.entries(files).map(([path, data]) => ({ path, data }))).toString('base64'),
     presetId });

test('alpha-perfect scores 113/113 → 30 with zero deductions', async () => {
  const r = await mark(sites.alphaPerfect(), 'cse1iit-2026s2');
  assert.equal(r.pages, 6);
  const shortfall = Object.entries(r.rows)
    .filter(([, v]) => v.passed === false || v.auto === 0)
    .map(([id, v]) => `${id}=${v.auto}`);
  assert.equal(r.total, 113, 'imperfect rows: ' + shortfall.join(', '));
  assert.equal(r.mapped, 30);
  assert.equal(r.deds.spelling.n, 0);
  assert.equal(r.deds.broken.n, 0);
  assert.equal(r.deds.absolute.n, 0);
});

test('bravo-flawed loses exactly the seeded points', async () => {
  const r = await mark(sites.bravoFlawed(), 'cse1iit-2026s2');
  const navProducts = Object.entries(r.rows)
    .find(([id, v]) => id.startsWith('nav-sub') && /products\.html/.test(v.label));
  assert.equal(navProducts[1].auto, 4);                  // missing contact link
  assert.equal(r.rows['sub-logo'].auto, 4);              // no logo on contact.html
  assert.equal(r.rows['sub-backtotop'].auto, 4);         // none on reserve.html
  assert.equal(r.rows['sub-weight'].auto, 4);            // heavy products.html
  assert.equal(r.deds.broken.total, -4);                 // missing.html + ghost.svg
  assert.equal(r.deds.absolute.total, -2);               // facebook link
  assert.deepEqual([...r.deds.spelling.words].sort(), ['definately', 'recieve', 'teh']);
  assert.equal(r.total, 109 - 6);                        // 29+23+57 = 109; auto deds −6
  const confirmed = await app.page.evaluate(() => {
    const rec = Automarker.state.records.at(-1);
    [0, 1, 2].forEach(i => Automarker.scoring.setDeductionConfirmed(
      rec.sheet, Automarker.presets['cse1iit-2026s2'], 'spelling', i, true));
    return rec.sheet.total;
  });
  assert.equal(confirmed, 100);
});

test('charlie-minimal takes the −15 page deduction and low design scores', async () => {
  const r = await mark(sites.charlieMinimal(), 'cse1iit-2026s2');
  assert.equal(r.pages, 5);
  assert.equal(r.deds.pagecount.total, -15);
  assert.ok(r.total <= 35, `total ${r.total}`);
  const padded = Object.entries(r.rows).find(([id, v]) =>
    id.startsWith('nav-sub') && /missing page/.test(v.label));
  assert.ok(padded); assert.equal(padded[1].auto, 0);
});

test('delta-messy normalises to the same result as alpha', async () => {
  const [a, d] = [await mark(sites.alphaPerfect(), 'cse1iit-2026s2'),
                  await mark(sites.deltaMessy(), 'cse1iit-2026s2')];
  assert.equal(d.pages, 6);
  assert.equal(d.home, 'index.html');
  assert.equal(d.total, a.total);
});

test('echo-portfolio meets every IWBS001 requirement', async () => {
  const r = await mark(sites.echoPortfolio(), 'iwbs001-a2');
  const unmet = Object.entries(r.rows).filter(([, v]) => v.passed === false);
  assert.deepEqual(unmet, [], JSON.stringify(unmet));
  assert.equal(r.reqMet, r.reqTotal);
  assert.equal(r.deds.spelling.n, 0);
});

test('foxtrot-gaps fails exactly the seeded requirements', async () => {
  const r = await mark(sites.foxtrotGaps(), 'iwbs001-a2');
  const unmet = Object.entries(r.rows).filter(([, v]) => v.passed === false).map(([id]) => id);
  assert.ok(unmet.includes('css-ext-types'), unmet.join());   // hover, generic-class, flexbox gaps
  assert.ok(unmet.includes('css-unused'));                     // .ghost
  assert.ok(unmet.some(id => id.startsWith('css-inline#')));   // span removed on place.html
  assert.equal(unmet.length, 3, unmet.join());
});

test('batch CSV covers multiple fixtures', async () => {
  const csv = await app.page.evaluate(() =>
    Automarker.exporter.toCSV(
      Automarker.state.records.filter(r => r.sheet?.configId === 'cse1iit-2026s2'),
      Automarker.presets['cse1iit-2026s2']));
  assert.match(csv.split('\n')[0], /nav-home:final/);
  assert.ok(csv.trim().split('\n').length >= 4);
});
```

`tests/e2e/coverage-guard.test.mjs`:
```js
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
```

- [ ] **Step 3: Run tests, then iterate the fixtures until green**

Run: `npm test`
Expected: fixture tests will likely fail on first run — fix by adjusting FIXTURES (content/word counts/heights), not the engine, unless the engine contradicts a definition in this plan. The alpha test's failure message prints the imperfect rows to guide fixes.

- [ ] **Step 4: Complete README and Pages polish**

Create empty `.nojekyll`. Rewrite `README.md`: what it is; live-URL placeholder (`https://<user>.github.io/<repo>/`); quick start for markers (open page → choose rubric → drop zips → review flagged rows → confirm spelling → export CSV/feedback) and for students (drop your own zip, fix everything red); rubric authoring guide (config schema, item forms `max` vs `required`, scopes table, check catalogue table generated from the `checkMeta` labels with param docs, threshold semantics); development section (install, test, `tools/embed-wordlist.mjs`, `writeDemoZips`); honest limitations (scripts never run; heuristic design metrics are suggestions; spelling needs confirmation; semantic relevance needs the marker's eye). MIT badge/line.

- [ ] **Step 5: Full suite green, then commit**

Run: `npm test`
Expected: PASS — every test file.

```bash
git add tests/fixtures/sites.mjs tests/e2e/fixtures.test.mjs tests/e2e/coverage-guard.test.mjs README.md .nojekyll
git commit -m "test: end-to-end rubric fixtures, coverage guard; docs: README for GitHub Pages"
```

---

## Final verification (after all tasks)

1. `npm test` — full suite green.
2. `node tools/embed-wordlist.mjs` idempotency: run twice, `git diff --stat` shows no change the second time.
3. Manual smoke: `python3 -m http.server` → open `index.html`, drop a demo zip from `writeDemoZips('demo')`, review, export CSV + feedback, build a custom rubric and re-mark.
4. Confirm `index.html` works when opened via `file://` in Chrome (blob URLs + DecompressionStream need no server).

