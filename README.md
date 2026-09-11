# HTML/CSS Submission Automarker

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A single-page, offline-capable tool that marks zipped HTML/CSS website
submissions against a configurable rubric, entirely inside the browser. There
is no server and no build step — everything (zip reading, DOM rendering,
CSS analysis, scoring, CSV/feedback export) runs client-side in
`index.html`.

**Live URL:** `https://<user>.github.io/<repo>/`

Two rubrics ship out of the box:

- **`cse1iit-2026s2`** — a 113-point "build a sport-store website" brief
  (nav, per-page design, images, CSS, spelling/broken-link/absolute-link
  deductions), mapped to a mark out of 30.
- **`iwbs001-a2`** — a pass/fail "personal portfolio" brief built entirely
  from `required` checks (every row must be met).

You are not limited to these — see [Rubric authoring](#rubric-authoring)
below for building your own from the in-app JSON rubric builder.

## Quick start — for markers

1. Open the page (the live URL above, or `index.html` locally — no server
   required, see [Development](#development)).
2. Pick a rubric from the dropdown in the header.
3. Drag one or more student zip files onto the drop zone (or click it to
   browse). Each zip is unpacked, rendered off-screen page by page, analysed
   and scored automatically; a row appears in the sidebar per submission.
4. Click a submission to see its score sheet: one row per rubric item, with
   the automatic score, supporting evidence, and (for `required` items) a
   pass/fail toggle.
5. Rows flagged **needs review** (yellow) come from *assisted* checks —
   heuristics such as "images relevant to the topic" or "professional
   presentation" that the tool can only suggest, not verify. Open the page
   preview (tabs across every page in the submission) and confirm or
   override each one with the score buttons.
6. Under **Spelling**, tick the instances that are genuine misspellings —
   deductions apply only once confirmed, so a false positive costs nothing
   until you say so.
7. Export a CSV across every marked submission, or a per-student HTML
   feedback report, from the toolbar.

## Quick start — for students

1. Zip your website folder (the `index.html`/`about.html`/… files, plus any
   `css/`, `img/` etc. subfolders) and drop it on the same page your marker
   uses, using the rubric for your unit.
2. Click your entry to see the score sheet. Every row that shows red or
   `0`/`max` is something to fix; the evidence line under each row explains
   why (a missing nav link, an oversized image, an unresolved href, …).
3. Fix the red rows and re-drop your zip — each drop creates a new,
   independent entry, so you can compare attempts side by side in the
   sidebar.
4. A few rows are marked **needs review** — these are the tool's best guess
   at things only a human can really judge (whether your design looks
   professional, whether your content is genuinely relevant). Treat them as
   advice, not a verdict; your marker has the final say.

## Rubric authoring

Rubrics are plain JSON objects, editable live from **Rubric → Open builder**
(validates before it lets you apply/save one), or as `Automarker.presets`
entries in `index.html` for anyone extending the tool itself.

### Config schema

```jsonc
{
  "meta": {
    "id": "my-rubric",              // unique, becomes part of the dropdown
    "title": "My Rubric",
    "totalPoints": 113,              // optional; validated against the sum
                                      // of expanded section points if present
    "mappedMarks": 30,               // optional; total is rescaled to this
    "minPages": 6,                   // drives eachPage/eachSubpage counts
    "viewport": { "w": 1280, "h": 800 },
    "responsiveWidths": [1280, 768, 375],
    "weightThresholds": { "fullKB": 1536, "partialKB": 4096 }
  },
  "topic": {                         // feeds keyword/relevance heuristics
    "keywords": ["sport", "shoes"],  // used by images/contentIntro/offerings/contentRelevance
    "sectionHints": ["products"],    // used by offerings
    "spellWhitelist": ["ecommerce"], // words never flagged, in addition to the dictionary
    "logoHints": ["logo", "brand"],  // matched against image src/alt for the logo check
    "locationHints": ["contact"]     // used to find the location/contact page for directions
  },
  "sections": [ { "id": "nav", "title": "Navigation", "points": 30, "items": [ /* … */ ] } ],
  "deductions": [ { "id": "spelling", "label": "…", "perInstance": -1, "check": "spelling", "mode": "assisted" } ]
}
```

Each **item** inside a section:

```jsonc
{ "id": "nav-home", "label": "Nav bar on home page", "check": "navBar",
  "mode": "auto" /* or "assisted" */, "scope": "home",
  "max": 5,                 // XOR "required": true — see below
  "params": { /* check-specific, see catalogue */ } }
```

`mode` only controls whether the row is flagged for manual review by
default — assisted checks (heuristics needing a human eye) still compute an
automatic score/pass, they just start `needsReview: true`.

### Item forms: `max` vs `required`

Every item is **exactly one** of two forms — the validator rejects both or
neither being set:

| Form | Scoring | Use for |
|---|---|---|
| `max: N` | The check's internal fraction (0–1) is scaled to `round(fraction × N)` points, clamped to `[0, N]`. | Point-based rubrics (CSE1IIT-style). |
| `required: true` | Pass/fail: the item **passes** when the check's fraction is ≥ `params.threshold` (default **1.0**, i.e. perfect). `passed` feeds `requirementsMet`/`requirementsTotal`. | Compliance/checklist rubrics (IWBS001-style). Set `params.threshold` below 1 to allow near-misses (e.g. `0.7`) to still count as met. |

### Scopes

| Scope | Runs on | Produces |
|---|---|---|
| `home` | The detected home page only. | One row. |
| `site` | The whole submission (all pages together). | One row. |
| `subpages` | Every non-home page, **aggregated** into one averaged score (padded/truncated to `minPages − 1` pages). | One row. |
| `eachSubpage` | Every non-home page, individually. | `minPages − 1` rows — `id#1`, `id#2`, …, padded with a "Required page missing" row if there are fewer pages than expected. |
| `eachPage` | Every page (home + subpages), individually. | `minPages` rows, same padding rule. |

The home page is whichever page is literally named `index.html` (shortest
path wins if there are several), or — if none exists — the page with the
most inbound internal links.

### Check catalogue

All checks are auto-registered via `Automarker.registerCheck(id, meta, fn)`
and listed at `Automarker.checkMeta`; this table is generated from those
labels/params (`node -e "console.log(...)"` against `Automarker.checkMeta`
in a loaded page will reproduce it).

| id | label | valid scopes | params |
|---|---|---|---|
| `navBar` | Navigation bar (structure, coverage, working links, styling, consistency) | home, eachSubpage, eachPage | — |
| `pageCount` | Minimum page count | site | `min` (number, default 6) |
| `brokenResources` | Broken links / images / assets | site | — |
| `externalLink` | External links policy | site, home, eachPage | `policy` (`forbidden`\|`required`), `min` (number) |
| `emailLink` | Email (`mailto:`) link present | site, home, eachPage | — |
| `backToTop` | Back-to-top control | home, eachSubpage, eachPage | — |
| `colourTheme` | Colour theme blending | home, subpages, eachPage | `consistency` (boolean — cross-page palette match) |
| `typography` | Fonts, sizes and contrast | home, subpages, eachPage | — |
| `whiteSpace` | Layout balance and white space | home, subpages, eachPage | — |
| `margins` | Page margins | home, subpages, eachPage | — |
| `sectionStructure` | Clear sections and headings | home, subpages, eachPage | — |
| `images` | Relevant, well-sized images | home, subpages, eachPage | `min`, `minWidth` (px), `relevance` (boolean) |
| `logo` | Logo presence (top, linked home) | home, subpages, eachPage | `requireLink` (boolean) |
| `pageWeight` | Page loads fast (total bytes) | home, subpages, eachPage | uses `meta.weightThresholds` |
| `cssExternal` | External stylesheet linked from every page | site | — |
| `cssSelectorTypes` | Required CSS selector types | site | `requirements`: `[{ kind, min, origin }]` — see kinds below |
| `cssUnused` | No unused CSS selectors | site | — |
| `inlineStyles` | Inline styles per page | eachPage, home | `min`, `requireTags` (e.g. `["div","span"]`) |
| `wordCount` | Minimum word count | eachPage, home, site | `min` |
| `mediaPresence` | Required media present | eachPage, home, site | `require`: `[{ kind, min }]` (`video`\|`gif`\|`iframe`\|`img`\|`audio`), `anyOf` (boolean) |
| `responsive` | Responsive layout | eachPage, home, subpages | uses `meta.responsiveWidths` |
| `directions` | Directions on the location/contact page | site | uses `topic.locationHints` |
| `aesthetic` | Overall aesthetic *(assisted composite)* | home, subpages, eachPage | composes colourTheme/typography/whiteSpace/margins |
| `contentIntro` | Useful introductory content *(assisted)* | home, eachPage | `min` |
| `offerings` | Key offerings highlighted *(assisted)* | home | uses `topic.sectionHints` |
| `contentRelevance` | Audience-relevant content *(assisted)* | subpages, eachPage | `min` |
| `spelling` | Spelling *(assisted — confirm each)* | site | uses `topic.spellWhitelist` |

`cssSelectorTypes` requirement `kind`s: `pFormat`, `classGeneric`,
`classScoped`, `headingStyle`, `hoverAnchor`, `group`, `contextual`,
`buttonStyle`, `flexbox`, `idOnHeading`, `positioning`, `bodyStyle`,
`headerStyle`, `footerStyle`. `origin` is `external`, `embedded`, or
`any`/omitted. Selectors are counted as **distinct `selector|source` pairs**
— the same selector re-declared inside an `@media` block still counts once.

### Threshold semantics, one more time

- `max` items always contribute their rounded fractional score, whether
  `mode` is `auto` or `assisted` — assisted just means the marker should
  double check it.
- `required` items are binary in the totals (`passed` is `true`/`false`);
  `params.threshold` (default `1`) is how forgiving that binary cut-off is
  of an almost-there page.
- Deductions (`perInstance` or `flat`) are **not** auto-applied when
  `mode: "assisted"` (currently only `spelling`) — each instance starts
  unconfirmed and contributes 0 until a marker ticks it.

## Development

```bash
npm install
npx playwright install chromium
npm test
```

Everything lives in `index.html` as a set of small `<script>` modules
(zip reading, submission loading, rendering, analysis, CSS parsing, checks,
scoring, config/presets, spell-check, export, UI) plus one embedded
gzip+base64 dictionary. Tests are Playwright-driven `node:test` files under
`tests/unit` (one check/module at a time) and `tests/e2e` (whole-pipeline
fixtures, UI smoke tests, the rubric builder, and the coverage guard that
fails the suite if a preset ever references an unregistered check, or a
check ships with no unit test).

- **`tools/embed-wordlist.mjs`** regenerates the embedded spelling
  dictionary from a system/plain-text word list, gzips + base64-encodes it,
  and splices it into `index.html` as a single line (`A.spellData = "…"`).
  It is idempotent — run it twice and `git diff --stat` shows nothing the
  second time — so it's safe to re-run whenever the source list changes.
  **Do not hand-edit that generated line.**
- **`tests/fixtures/sites.mjs`** builds the in-memory fixture websites used
  by `tests/e2e/fixtures.test.mjs` (a perfect submission, a flawed one with
  eight seeded defects, a minimal one, a messily-zipped one, and a compliant
  vs. gapped IWBS001 portfolio pair). Call `writeDemoZips(dir)` to dump them
  to real `.zip` files for manual poking around in the UI:
  ```bash
  node -e "import('./tests/fixtures/sites.mjs').then(m => m.writeDemoZips('demo'))"
  ```

## Limitations (read before trusting a row blindly)

- **Scripts never run.** Pages are rendered in a sandboxed iframe with
  `<script>` tags stripped before load — the tool marks the HTML/CSS you
  wrote, not any client-side behaviour.
- **Design/heuristic checks are suggestions, not verdicts.** Colour theme,
  typography, white space, aesthetic composite, content relevance/intro/
  offerings — all reduce a page to a handful of measurable proxies (hue
  counts, contrast ratios, keyword hits). They correlate with quality; they
  are not quality. Always spot-check via the page preview before trusting a
  "needs review" score.
- **Spelling needs a human.** The offline dictionary is large but finite,
  and the checker has no grammar or context — it will flag real but rare
  words, brand/product names, and anything outside its inflection rules
  (irregular plurals like "cacti" or comparative forms it can't derive),
  and it will just as happily miss a real word used wrong. Deductions apply
  only after a marker ticks the instance for exactly this reason.
- **Topic/keyword relevance is shallow.** Image "relevance" and content
  "on-topic" checks look for literal keyword substrings in alt text/URLs/
  visible text — a page can trivially satisfy them while being off-topic,
  or fail them while being perfectly on-topic but phrased differently.
- **Nothing here replaces reading the site.** Treat the score sheet as a
  fast first pass that catches the mechanical stuff (broken links, missing
  pages, no back-to-top, absolute URLs) reliably, and leans on you for
  everything that requires judgment.

## License

MIT — see [LICENSE](LICENSE).
