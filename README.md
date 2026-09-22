# HTML/CSS Submission Automarker

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A single-page, offline-capable tool that marks zipped HTML/CSS website
submissions against a configurable rubric, entirely inside the browser. There
is no server and no build step — everything (zip reading, DOM rendering,
CSS analysis, scoring, CSV/feedback export) runs client-side in
`index.html`.

**Live URL:** https://achakerian.github.io/html-css-automarker/

Two rubrics ship out of the box:

- **`cse1iit-2026s2`** — a 113-point "build a sport-store website" brief
  mirroring the official marking sheet: Part A requirements checklist,
  Part B rubric scores (nav, per-page design), and Part C deductions
  (spelling −1, broken links/images −2, fewer than 6 pages −15, late days
  −1.5 marks each), mapped to a mark out of 30.
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
   pass/fail toggle. In the `cse1iit-2026s2` rubric the sheet opens with the
   paper marking sheet's **Part A requirements checklist** — ✓ met / ✗ unmet
   rows that never score points ("not scored, informs marks"). Almost every
   row verifies itself with evidence: link reachability, page-targeted
   content signals (About story/mission, product categories and prices,
   opening hours, phone, map image), reservation form fields and input
   validation, and "written by hand" (wired to the AI authorship analyzer).
   The few rows only a human can judge (copyright, all-ages content,
   submission date) are exception-based — pre-ticked ✓ met, untick only
   when you spot a problem — so a clean submission demands zero Part A
   clicks.
5. Rows flagged **needs review** (yellow) come from *assisted* checks —
   heuristics such as "images relevant to the topic" or "professional
   presentation" that the tool can only suggest, not verify. Open the page
   preview (tabs across every page in the submission) and confirm or
   override each one with the score buttons. Page paths in evidence lines
   are links — click one to open the preview on that exact page.
6. Under **Spelling**, tick the instances that are genuine misspellings —
   deductions apply only once confirmed, so a false positive costs nothing
   until you say so. Each instance links to the page(s) containing the word,
   and following a spelling link highlights every occurrence in the preview
   so you can judge it in context.
7. The **Feedback (copy & paste)** panel at the bottom of the score sheet
   assembles concise plain text ready for the LMS: the mark line (with an
   **Overall: X/100** view — each scored section's header also shows its
   scaled share of 100, e.g. Navigation `26/30 · 23/26.5`, without touching
   the document's 113-point scheme), each
   section with only its imperfect rows, and the deductions summary. Every
   section box has a small notes field — anything you type there is
   appended to that section's generated feedback, live. Set **Days late**
   in the totals bar to apply the sheet's −1.5-marks-per-day penalty to
   the mapped mark. Click **Copy** to put the whole thing on the clipboard.
8. Export a CSV across every marked submission, or a per-student HTML
   feedback report, from the toolbar. For large batches, export the CSV
   periodically as you go rather than only at the end — it costs nothing and
   protects your marking if the tab crashes or the browser is closed early.
9. Submissions carrying stylometric fingerprints of AI-generated code —
   machine-uniform indentation, zero trailing whitespace, intricate or
   BEM-style class naming, banner comments, `:root` variables, universal
   resets, hero-section idioms (not taught in the course),
   beyond-course-level CSS — get an amber **AI?** badge in the
   sidebar and an **AI authorship indicators** panel at the bottom of the
   score sheet listing exactly which of the 13 signals fired and why. This
   is *advisory only*: it never affects the mark, never appears in the
   student feedback report, and can be triggered by auto-formatters or
   meticulous students, so treat it as a prompt for a closer look (the CSV's
   `aiIndicators` column gives the signal count for sorting), never as
   proof.

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

Rubrics are plain JSON objects, editable live from the **Rubric builder**
button (validates before it lets you apply/save one), or as `Automarker.presets`
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
| `externalLink` | External links policy | site, home, eachPage | `policy` (`forbidden`\|`required`), `min` (number), `kind` (`absolute`\|`external`) |
| `emailLink` | Email (`mailto:`) link present | site, home, eachPage | — |
| `backToTop` | Back-to-top control | home, eachSubpage, eachPage | — |
| `manual` | Manual verification (marker ticks after checking) | site, home, subpages, eachPage, eachSubpage | `defaultPass` (boolean — pre-tick ✓ met, untick on exception) |
| `reachability` | Every page reachable by links from home | site | — |
| `pageContent` | Page content signals (keywords / patterns / images) | site | `pageHints`, `keywords`, `patterns`, `imgHints`, `min`, `minImgs` |
| `formFields` | Form fields present (matched by name/label/type) | site | `pageHints`, `require` (synonym-list groups), `validation` (boolean) |
| `handAuthored` | Hand-authored code (no AI fingerprints) | site | — |
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

## Generating a rubric with an LLM

The engine is rubric-agnostic on purpose: a rubric is just JSON, so the
fuzzy work of turning an assessment brief into criteria can happen **outside
the tool**, once, in an LLM — and the marker itself stays deterministic,
auditable and fully offline. The workflow:

1. Copy the authoring prompt below into an LLM (Claude or similar), paste
   your assessment brief/spec underneath it, and ask for the rubric JSON.
2. In the tool, open **Rubric builder** → paste the JSON into the editor →
   **Validate**. The validator catches structural mistakes (unknown checks,
   invalid scopes, point sums that don't add up) — fix and re-validate until
   it passes.
3. **Skim the result yourself before marking with it.** The validator cannot
   catch *semantic* mis-mapping — an LLM wiring "creativity" to
   `colourTheme`, say. Check that each generated item honestly measures the
   criterion it claims to.
4. **Apply**, then mark as normal. Export the JSON to share it with other
   markers or students.

### Authoring prompt (copy from here)

> Convert the assessment brief below into a rubric config JSON for an
> HTML/CSS submission automarker. Output ONLY the JSON object, no prose.
>
> Rules:
> - Follow the schema exactly as in the "Config schema" section of the
>   tool's README: `meta` (id, title, minPages, optionally
>   totalPoints/mappedMarks), `topic` (keywords, sectionHints,
>   spellWhitelist, logoHints, locationHints — derive these from the
>   brief's subject matter), `sections[].items[]`, `deductions[]`.
> - Every item's `check` MUST be one of the ids in the tool's check
>   catalogue (navBar, pageCount, brokenResources, externalLink, emailLink,
>   backToTop, colourTheme, typography, whiteSpace, margins,
>   sectionStructure, images, logo, pageWeight, cssExternal,
>   cssSelectorTypes, cssUnused, inlineStyles, wordCount, mediaPresence,
>   responsive, directions, aesthetic, contentIntro, offerings,
>   contentRelevance, spelling), used only with its valid scopes and params.
>   Never invent a check id.
> - Points-based briefs: give items `max` and make section `points` equal
>   the expanded sum (`eachSubpage` items count ×(minPages−1), `eachPage`
>   ×minPages). Checklist briefs: give items `required: true`, with
>   `params.threshold` below 1.0 only where the brief tolerates near-misses.
> - Use `mode: "assisted"` for anything a human should confirm (aesthetics,
>   relevance, anything subjective the catalogue only approximates).
> - Do NOT shoehorn: if a criterion has no honest mapping (presentation
>   skills, peer review, creativity, code originality), put a short
>   description of it in a top-level `"_unmapped"` string array instead of
>   forcing it onto a check. The marker handles those by hand.
>
> [PASTE THE ASSESSMENT BRIEF HERE]

Anything the LLM lists under `"_unmapped"` is preserved by the builder
(unknown top-level keys pass validation untouched) and is your list of
criteria to mark manually alongside the tool.

## Roadmap

- **`manual` check** — a catalogue entry that auto-scores nothing and just
  renders a needs-review row, so generated rubrics can carry human-only
  criteria (presentation, creativity) *inside* the sheet instead of in
  `"_unmapped"`.
- **LMS bulk-export ingestion** — drop the single master zip Moodle/Canvas
  produces (per-student zips or folders inside) and have it split into one
  submission per student, with the student's name parsed from the LMS
  filename convention.
- **Zip-bomb pre-check** — reject over-expanding entries from the zip's
  declared sizes *before* decompressing, rather than the current cumulative
  cap that applies after each entry inflates.

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
- **`@import` is only partly followed.** A stylesheet's `@import` of a local
  file in the same submission is inlined one level deep (its own `url(...)`
  references are rewritten and its rules are analysed); anything beyond that
  first level, and any `@import` of an external URL, is stripped out and
  flagged rather than fetched or resolved.

## License

MIT — see [LICENSE](LICENSE).
