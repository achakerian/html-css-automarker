import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launchApp } from '../helpers/harness.mjs';

let app;
before(async () => { app = await launchApp(); });
after(async () => { await app.close(); });

const analyze = site => app.page.evaluate(async site => {
  const sub = await Automarker.submissionFromTexts('t', site);
  return Automarker.authorship.analyze(sub);
}, site);

// A submission with the stylometric fingerprints of LLM output: machine-uniform
// 4-space indentation, zero trailing whitespace, banner comments, BEM-ish and
// deeply hyphenated class names, :root variables, a universal reset, uniform
// `prop: value;` declarations with a blank line between every rule, aria-labels
// and thorough alt text.
const AI_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Peak Performance Sports</title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <!-- Header Section -->
    <header class="site-header-navigation">
        <nav class="primary-navigation-list" aria-label="Main navigation">
            <ul class="nav-link-item-list">
                <li class="nav-link-item">
                    <a href="index.html" aria-label="Go to home page">Home</a>
                </li>
                <li class="nav-link-item">
                    <a href="products.html">Products</a>
                </li>
                <li class="nav-link-item">
                    <a href="contact.html">Contact</a>
                </li>
            </ul>
        </nav>
    </header>
    <!-- Hero Section -->
    <main class="main-content-area">
        <section class="hero-section-content-wrapper">
            <h1 class="hero__title">Welcome to Peak Performance</h1>
            <p class="hero__subtitle">Quality gear for every athlete</p>
            <img src="img/hero.jpg" alt="Athlete sprinting on an outdoor track at sunrise" class="hero-banner-image">
            <a href="products.html" class="call-to-action-button">Shop Now</a>
        </section>
        <section class="testimonial-card-container">
            <article class="testimonial-card card--featured">
                <img src="img/runner.jpg" alt="Smiling runner wearing our flagship trail shoes">
                <p class="testimonial-card-quote">Best shoes I have ever owned.</p>
            </article>
            <article class="testimonial-card">
                <img src="img/coach.jpg" alt="Local coach holding a branded water bottle">
                <p class="testimonial-card-quote">My whole squad trains in this gear.</p>
            </article>
        </section>
    </main>
    <!-- Footer Section -->
    <footer class="site-footer-container">
        <ul class="footer-social-links" aria-label="Social media links">
            <li><a href="contact.html">Contact us</a></li>
        </ul>
    </footer>
</body>
</html>
`;

const AI_CSS = `/* ==================== Global Reset ==================== */

*,
*::before,
*::after {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

/* ==================== Design Tokens ==================== */

:root {
    --primary-color: #1a7f6b;
    --secondary-color: #f4a261;
    --text-color: #2b2d42;
    --spacing-unit: 1rem;
}

html {
    scroll-behavior: smooth;
}

/* ==================== Header Styles ==================== */

.site-header-navigation {
    background-color: var(--primary-color);
    padding: var(--spacing-unit);
    transition: background-color 0.3s ease;
}

.primary-navigation-list {
    display: flex;
    justify-content: space-between;
    align-items: center;
    transition: opacity 0.3s ease;
}

.nav-link-item a {
    color: #ffffff;
    text-decoration: none;
    transition: color 0.2s ease-in-out;
}

/* ==================== Hero Section ==================== */

.hero-section-content-wrapper {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: clamp(1rem, 4vw, 3rem);
    padding: clamp(2rem, 6vw, 5rem);
}

.hero__title {
    font-size: clamp(2rem, 5vw, 3.5rem);
    color: var(--text-color);
    transition: transform 0.3s ease;
}

.hero__subtitle {
    font-size: 1.25rem;
    color: var(--secondary-color);
}

.call-to-action-button {
    display: inline-block;
    background-color: var(--secondary-color);
    padding: 0.75rem 1.5rem;
    border-radius: 0.5rem;
    transition: transform 0.2s ease;
}

/* ==================== Footer Styles ==================== */

.site-footer-container {
    background-color: var(--text-color);
    color: #ffffff;
    padding: 2rem;
}

.footer-social-links {
    display: flex;
    gap: 1rem;
    list-style: none;
}
`;

const AI_SITE = {
  'index.html': AI_HTML,
  'products.html': AI_HTML.replace('Welcome to Peak Performance', 'Our Products'),
  'styles.css': AI_CSS,
};

// A submission that looks hand-written by a novice: erratic indentation (0/1/3/5
// spaces and a stray tab), trailing whitespace, terse class names, cramped and
// inconsistent CSS spacing, no comments, no variables, no reset.
const MESSY_SITE = {
  'index.html': `<html>
<head><title>my shop</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
 <div class="top">
   <a href="index.html">home</a>
	<a href="page2.html">stuff</a>
 </div>
<h1 class="big">my sport shop</h1>
  <p class="txt">welcome to my shop we sell shoes and stuff</p>
     <img src="pic.jpg" alt="shoes">
<div class="box">
 <p>cheap prices </p>
   </div>
</body>
</html>
`,
  'page2.html': `<html><body>
<p class="txt">more stuff here </p>
  <a href="index.html">back</a>
</body></html>
`,
  'style.css': `body{background:white;color:black}
.top{background:blue;}
.big{ color : red; font-size:30px}
.txt{color:green;
margin:5px}
.box{border:1px solid black;padding:2px;margin:2px }
`,
};

// Short but perfectly formatted — small files must not trip the formatting
// signals (a ten-line page proves nothing about authorship).
const TINY_PERFECT_SITE = {
  'index.html': `<html>
<body>
    <h1 class="title">Hi</h1>
    <p class="note">Small page.</p>
</body>
</html>
`,
  'style.css': `.title {
    color: red;
}
`,
};

test('AI-styled submission reaches strong with the expected signals', async () => {
  const res = await analyze(AI_SITE);
  assert.equal(res.level, 'strong');
  assert.equal(res.checked, 13);
  assert.ok(res.signals.length >= 6, `expected >= 6 signals, got ${res.signals.length}`);
  const ids = res.signals.map(s => s.id);
  for (const id of ['indent-uniform', 'clean-whitespace', 'css-decl-uniform',
                    'intricate-classnames', 'bem-naming', 'banner-comments',
                    'css-variables', 'universal-reset', 'advanced-css', 'hero-pattern'])
    assert.ok(ids.includes(id), `expected signal ${id}, got: ${ids.join(', ')}`);
  for (const s of res.signals) {
    assert.ok(s.label && typeof s.label === 'string', `signal ${s.id} needs a label`);
    assert.ok(s.detail && typeof s.detail === 'string', `signal ${s.id} needs evidence detail`);
  }
});

test('messy hand-written submission yields none', async () => {
  const res = await analyze(MESSY_SITE);
  assert.equal(res.level, 'none');
  const ids = res.signals.map(s => s.id);
  for (const id of ['indent-uniform', 'clean-whitespace', 'css-decl-uniform',
                    'intricate-classnames', 'bem-naming', 'hero-pattern'])
    assert.ok(!ids.includes(id), `signal ${id} must not fire on messy input`);
});

test('small perfect submission does not trigger formatting signals', async () => {
  const res = await analyze(TINY_PERFECT_SITE);
  assert.equal(res.level, 'none');
  const ids = res.signals.map(s => s.id);
  for (const id of ['indent-uniform', 'clean-whitespace', 'css-decl-uniform'])
    assert.ok(!ids.includes(id), `signal ${id} must not fire on a tiny file`);
});

test('processSubmissionBytes attaches an advisory authorship result', async () => {
  const { buildZip } = await import('../helpers/zipwrite.mjs');
  const zip = buildZip(Object.entries(AI_SITE).map(([path, data]) => ({ path, data })));
  const res = await app.page.evaluate(async b64 => {
    const rec = await Automarker.processSubmissionBytes('suspect', Automarker.util.b64ToBytes(b64));
    return { level: rec.authorship?.level, count: rec.authorship?.signals.length,
      total: rec.sheet.total, error: rec.error ?? null };
  }, zip.toString('base64'));
  assert.equal(res.error, null);
  assert.equal(res.level, 'strong');
  assert.ok(res.count >= 6);
});

const MINI_CFG = {
  meta: { id: 'mini', title: 'Mini', totalPoints: 5, mappedMarks: 10, minPages: 1,
    viewport: { w: 1280, h: 800 }, weightThresholds: { fullKB: 1536, partialKB: 4096 } },
  topic: { keywords: [], sectionHints: [], spellWhitelist: [], logoHints: [], locationHints: [] },
  sections: [{ id: 's', title: 'S', points: 5, items: [
    { id: 'w', label: 'weight', check: 'pageWeight', mode: 'auto', scope: 'home', max: 5 } ] }],
  deductions: []
};

test('CSV export carries an aiIndicators count column', async () => {
  const csv = await app.page.evaluate(async ({ site, cfg }) => {
    const sub = await Automarker.submissionFromTexts('suspect', site);
    const analysis = await Automarker.analyzeSubmission(sub);
    const sheet = await Automarker.scoring.scoreSubmission({ submission: sub, ...analysis }, cfg);
    const authorship = Automarker.authorship.analyze(sub);
    return Automarker.exporter.toCSV(
      [{ name: 'suspect', sheet, authorship }, { name: 'bad-zip', error: 'Not a zip file' }], cfg);
  }, { site: AI_SITE, cfg: MINI_CFG });
  const [head, r1, r2] = csv.trim().split('\n');
  const cols = head.split(','), idx = cols.indexOf('aiIndicators');
  assert.ok(idx >= 0, `aiIndicators column missing from header: ${head}`);
  assert.equal(cols[cols.length - 1], 'error', 'error stays the last column');
  const n = Number(r1.split(',')[idx]);
  assert.ok(n >= 6, `expected a signal count >= 6, got "${r1.split(',')[idx]}"`);
  assert.equal(r2.split(',')[idx], '', 'error rows leave the column empty');
});

test('student-facing feedback report never mentions authorship', async () => {
  const html = await app.page.evaluate(async ({ site, cfg }) => {
    const sub = await Automarker.submissionFromTexts('suspect', site);
    const analysis = await Automarker.analyzeSubmission(sub);
    const sheet = await Automarker.scoring.scoreSubmission({ submission: sub, ...analysis }, cfg);
    const authorship = Automarker.authorship.analyze(sub);
    return Automarker.exporter.feedbackHTML({ name: 'suspect', sheet, authorship }, cfg);
  }, { site: AI_SITE, cfg: MINI_CFG });
  assert.ok(!/authorship/i.test(html), 'feedback must not mention authorship');
  assert.ok(!/AI indicator/i.test(html), 'feedback must not mention AI indicators');
});

test('UI shows a sidebar AI badge and an advisory detail panel', async () => {
  const { buildZip } = await import('../helpers/zipwrite.mjs');
  const { page: p } = app;
  const zip = buildZip(Object.entries(AI_SITE).map(([path, data]) => ({ path, data })));
  await p.setInputFiles('[data-testid="drop-input"]',
    { name: 'suspect_99.zip', mimeType: 'application/zip', buffer: zip });
  await p.waitForSelector('[data-testid="ai-flag"]', { timeout: 30000 });
  assert.match(await p.textContent('[data-testid="ai-flag"]'), /AI/);
  await p.click('[data-testid="record-item"]');
  await p.waitForSelector('[data-testid="authorship-panel"]');
  const panel = await p.textContent('[data-testid="authorship-panel"]');
  assert.match(panel, /advisory/i, 'panel must carry the advisory disclaimer');
  assert.match(panel, /strong/);
  assert.match(panel, /Machine-uniform indentation/);
  assert.match(panel, /never treat them as proof/i);
});

test('coordinatorReport summarises AI/template usage across the batch', async () => {
  const html = await app.page.evaluate(async ({ ai, messy }) => {
    const mk = async (name, site) => {
      const sub = await Automarker.submissionFromTexts(name, site);
      return { name, submission: sub, authorship: Automarker.authorship.analyze(sub) };
    };
    const records = [await mk('clean_student', messy), await mk('suspect_<img src=x>', ai),
      { name: 'broken_zip', error: 'Not a zip file' }];
    return Automarker.exporter.coordinatorReport(records, Automarker.state.config);
  }, { ai: AI_SITE, messy: MESSY_SITE });
  assert.match(html, /AI \/ template usage/i, 'report is titled for the coordinator');
  assert.match(html, /suspect_/); assert.match(html, /strong/);
  assert.match(html, /clean_student/); assert.match(html, /none/);
  assert.match(html, /Machine-uniform indentation/, 'flagged submissions list their fired signals');
  assert.match(html, /hero/i, 'hero/template signal surfaces when fired');
  assert.match(html, /advisory/i, 'disclaimer included');
  assert.match(html, /broken_zip/, 'unanalysable submissions still listed');
  assert.ok(html.indexOf('suspect_') < html.indexOf('clean_student'),
    'most-flagged submissions listed first');
  assert.ok(!html.includes('<img src=x>'), 'submission names are HTML-escaped');
});

test('style blocks inside HTML count as CSS sources', async () => {
  const res = await analyze({
    'index.html': `<html>
<head>
<style>
:root {
    --primary-color: #333333;
    --accent-color: #ff6600;
    --surface-color: #ffffff;
}
</style>
</head>
<body>
<p class="a">hi</p>
</body>
</html>
`,
  });
  assert.ok(res.signals.some(s => s.id === 'css-variables'),
    'css-variables should be detected inside <style> blocks');
});
