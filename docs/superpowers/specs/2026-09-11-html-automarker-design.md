# HTML Automarker — Design Spec

**Date:** 2026-09-11
**Status:** Approved approach (B: rendered analysis in the browser); spec pending user review

## 1. Overview

A single self-contained `automarker.html` that a marker opens locally in Chrome/Edge/Firefox. The marker drags in any number of student submission zips; the tool unzips each in-browser, renders every student page in a hidden sandboxed iframe, runs a catalogue of automated checks against the live DOM and computed styles, and produces a per-student score sheet mapped to the assignment rubric (113 points → 30 marks). Nearly every rubric item is auto-scored; the small set of genuinely semantic judgments (content on-topic, image relevance, overall aesthetic) receive a heuristic suggested score that the marker confirms or adjusts with one click beside a rendered preview. Results export as a batch CSV and per-student feedback reports.

The scoring engine is **topic-agnostic**: the rubric lives in an editable JSON config (import/export). The default config encodes the CSE1IIT 2026 S2 "La Trobe Sports" rubric exactly. Reusing the tool for a different assignment means editing the config, not the code.

## 2. Goals and non-goals

**Goals**

- Batch marking: N zips in, N score sheets out, with a review UI per student.
- Auto-score every rubric item that is mechanically checkable; suggested scores + fast confirmation for semantic items.
- Evidence for every score: plain-English findings the marker can paste into feedback.
- Topic-agnostic rubric/config; the default config is this assignment.
- Fully offline, zero-install: one HTML file, no CDN, no network requests.
- A thorough automated test suite covering every check in the rubric catalogue.

**Non-goals**

- No LMS integration, no server, no database.
- No AI/API scoring (could be added later; explicitly out of scope now).
- Student JavaScript is never executed (this is an HTML/CSS assignment; rendering is script-disabled for safety and determinism).
- No plagiarism/similarity detection.

## 3. Architecture

One HTML file, internally organised as labelled `<script>` modules (single file is the deliverable; there is no build step):

| Module | Responsibility |
|---|---|
| `ZipReader` | Dependency-free zip parsing (central directory walk; stored + deflate entries via native `DecompressionStream('deflate-raw')`). |
| `SubmissionLoader` | Zip → submission model: file map, HTML page discovery, home-page identification, student name from zip filename. |
| `PageRenderer` | Renders one HTML page into a hidden `<iframe sandbox="allow-same-origin">` via a blob URL, with all relative asset references (img `src`/`srcset`, `<link>` CSS, CSS `url()`, favicons) rewritten to blob URLs resolved against the page's path inside the zip. Scripts do not run (no `allow-scripts`); the parent can read `contentDocument` and computed styles. |
| `PageAnalyzer` | Extracts a **PageSnapshot** from the rendered iframe: link graph, images (resolved/broken, natural + displayed size), computed colour palette, font families/sizes, margin/padding/white-space metrics, section/heading structure, visible text, element positions, total asset bytes. |
| `Checks` | The check catalogue (Section 6). Pure functions: `(snapshotOrSnapshots, params) → {subResults[], evidence[]}`. Exposed on `window.Automarker.checks` for testing. |
| `ScoringEngine` | Applies the rubric config to check results: per-item score = `round(maxPoints × weighted pass fraction)` of sub-results, per-page aggregation for sub-page criteria (mean of per-page scores scaled to max), deductions, total, mapping to final marks. Marker overrides always win and are flagged in exports. |
| `SpellCheck` | Embedded wordlist (gzipped, base64-inlined, inflated at runtime via `DecompressionStream('gzip')`); suffix stripping (s, es, ed, ing, 's, ly); skips capitalised words mid-sentence proper-noun style, numbers, and config whitelist. Emits candidates only — deductions require marker confirmation. |
| `UI` | Batch sidebar, per-student score sheet with evidence + override controls, per-page preview panes, semantic-item confirmation strip, spelling checklist, config editor, exports. |
| `Exporter` | Batch CSV (one row per student, one column per rubric item + sections + total + mapped mark + override flags) and per-student printable feedback report built from evidence lines. |

`window.Automarker` exposes `{config, checks, scoring, loadSubmission(file), analyzePage(...)}` so the test suite can drive both unit-level and end-to-end paths.

## 4. Rubric config schema (topic-agnostic)

```json
{
  "meta": { "title": "...", "totalPoints": 113, "mappedMarks": 30, "minPages": 6 },
  "topic": {
    "keywords": ["sport", "sportswear", "shoes", "..."],
    "sectionHints": ["products", "brands", "reservation", "contact", "about"],
    "spellWhitelist": ["Nike", "Adidas", "ASICS", "Bundoora", "..."]
  },
  "sections": [
    {
      "id": "nav", "title": "Navigation Bar and Links", "points": 30,
      "items": [
        { "id": "nav-home", "label": "...", "max": 5, "scope": "home",
          "check": "navBar", "params": { }, "mode": "auto" }
      ]
    }
  ],
  "deductions": [
    { "id": "spelling", "perInstance": -1, "check": "spelling", "mode": "assisted" },
    { "id": "broken", "perInstance": -2, "check": "brokenResources", "mode": "auto" },
    { "id": "pageCount", "flat": -15, "check": "pageCount", "mode": "auto" }
  ]
}
```

- `mode: "auto"` — score stands unless the marker overrides.
- `mode: "assisted"` — heuristic suggested score, visually flagged; the marker confirms/adjusts (semantic items, spelling).
- `scope` — `"home"`, `"subpages"` (aggregated across all sub-pages with per-page breakdown), or `"site"`.
- Config editor in the UI with JSON import/export; the default config ships embedded.

## 5. Submission model

- Each zip = one student; student label = zip filename (minus extension).
- HTML pages: all `*.html`/`*.htm` entries (case-insensitive). Home page = `index.html` at the shallowest depth, else the page most linked-to by others, else alphabetical first — with the choice shown and correctable in the UI.
- Sub-pages: all other pages. If more than `minPages − 1` sub-pages exist, all are analysed; the best-scoring 5 satisfy per-sub-page criteria (students aren't penalised for extra pages).
- Malformed zips, zips-inside-folders, `__MACOSX` junk, and nested single-root folders are handled; unreadable submissions surface as an error card, never a crash.

## 6. Check catalogue — full rubric coverage

Every rubric line maps to a check. Sub-results are individually weighted; evidence is generated for both passes and failures.

### Section 1 — Navigation (6 items × 0–5)

`navBar(pageSnapshot, allPages)` per page, sub-results:
1. A nav structure exists (`<nav>`, or a repeated link cluster ≥ (minPages − 1) internal links in header region).
2. Links cover all other pages (fraction).
3. All nav links resolve to files in the zip (fraction).
4. Nav is CSS-styled (non-default computed styles: background/colour/layout on the nav or its links).
5. Consistency: nav link set ≈ same across pages (Jaccard similarity vs site-wide modal nav set).

### Section 2 — Home page (11 × 0–2, plus back-to-top ×1)

| Rubric item | Check | Heuristic sub-results |
|---|---|---|
| Colour theme blending (0–2) | `colourTheme` | Palette extracted from computed backgrounds/text/borders: 2–6 dominant hues (not default-white-and-black only), consistent accent reuse, no clashing high-saturation pairs. |
| Text fonts/colours (0–2) | `typography` | Non-default `font-family` declared and applied; body text 14–20px; text/background contrast ≥ WCAG 4.5:1 on main content. |
| Balanced layout / white space (0–2) | `whiteSpace` | Content width constrained (< 100% at desktop viewport or max-width set); non-zero padding between sections; text-density ratio in sane band; no horizontal overflow. |
| Clear sections (0–2) | `sectionStructure` | ≥ 2 distinct content sections via semantic elements or headings; headings hierarchy present. |
| ≥ 1 relevant, well-sized image (0–2) | `images` (semantic flag on "relevant") | ≥ 1 `<img>` that resolves, displayed ≥ 150px wide, not stretched > 1.5× natural size. Relevance = filename/alt keyword match → suggested, marker confirms. |
| Margins (0–2) | `margins` | Body/main computed margins or padding > 0; content not flush against viewport edges. |
| Logo, ideally top-left, links home (0–2) | `logo` | Image (or styled brand text) whose src/alt/class matches `logo|brand` or config keywords, in the top 20% of the page; bonus sub-result: wrapped in `<a>` to home. Left placement preferred, not required. |
| Page not heavy (0–2) | `pageWeight` | Page + referenced assets ≤ configurable thresholds (default: ≤ 1.5 MB full marks, ≤ 4 MB partial). |
| Professional aesthetic (0–2) | `aesthetic` (assisted) | Suggested score = composite of colourTheme, typography, whiteSpace, margins results; marker confirms against preview. |
| Useful introductory info (0–2) | `contentIntro` (assisted) | ≥ 50 words of visible intro text on home; topic-keyword density > 0 → suggested; marker confirms it's genuinely on-topic. |
| Key offerings highlight (0–2) | `offerings` (assisted) | Headings/text matching config `sectionHints` (promotions, arrivals, products) + a call-to-action link/button deeper into the site. |
| Back-to-top button (1) | `backToTop` | Anchor/`<button>` in the lower half of the document targeting `#top`/`#`/element id at page top. (Scripts don't run; detection is structural.) |

### Section 3 — Sub-pages (aggregated across 5 sub-pages; per-page breakdown shown)

Same checks as home, re-parameterised: `colourTheme` + cross-page consistency (0–5), `typography` (0–5), `whiteSpace` (0–5), `sectionStructure` (0–5), `images` with `min: 2` (0–10), `margins` (0–5), `logo` with link-to-home required for full sub-result (0–5), `pageWeight` (0–5), `contentRelevance` (assisted, 0–5), `backToTop` (0–5), and `directions` (0–5): on the location/contact-identified page (URL/heading/keyword match), presence of address-shaped text, opening hours pattern, and a map image. Aggregation: per-page score for each criterion, mean scaled to the item max.

### Deductions

- **Spelling (−1 each, assisted):** candidates from visible text across all pages; only marker-confirmed instances deduct.
- **Broken functionality (−2 each, auto):** internal links to missing files; `<img>`/CSS assets that fail to resolve; each instance listed. Absolute/external links (`http(s):`, drive paths) are flagged here too, since the spec forbids them.
- **Fewer than 6 pages (−15, auto).**

## 7. Scoring, overrides, exports

- Item score = `round(max × Σ(weight × pass) / Σweight)`, clamped to the item's range. Every item shows its sub-results and evidence inline.
- Marker override: click any score to set it directly; overrides are visually distinct and flagged in the CSV.
- Totals: per section, deductions, total /113, mapped mark = `round(total / totalPoints × mappedMarks, 1)`, floored at 0.
- CSV export: one row per student; columns for every item (auto score, final score, overridden?), section subtotals, deductions, total, mapped mark.
- Feedback report: per student, printable HTML built from evidence lines grouped by rubric section.

## 8. Error handling

- Every per-student pipeline step is isolated: one corrupt submission shows an error card; the batch continues.
- Missing assets, circular links, huge files (> 50 MB zip guard), non-UTF-8 encodings (fallback latin-1), and pages that fail to render all degrade to partial analysis with explicit "could not analyse X" evidence rather than silent zeros.
- Renderer timeouts (default 10 s/page) mark affected checks "needs manual review", never hang the batch.

## 9. Testing strategy

Runner: `npm test` → Node's `node:test` + Playwright (headless Chromium) serving the repo over a local static server (blob/iframe behaviour is identical to `file://` usage but automatable). The suite has three layers:

**Layer 1 — Check unit tests (every check, every rubric line).** For each check in the catalogue: a passing case, a failing case, and at least one partial/edge case, driven by rendering small purpose-built HTML fixtures through the real `PageRenderer`/`PageAnalyzer` pipeline and calling `window.Automarker.checks.<id>` via `page.evaluate`. Examples: nav missing one link scores 4/5; contrast 3.9:1 fails the contrast sub-result; logo present but unlinked loses only the link sub-result; back-to-top anchor at page top (not bottom) fails.

**Layer 2 — Engine tests.** ZipReader (stored + deflated entries, nested root folder, `__MACOSX`, corrupt zip), SubmissionLoader home-page identification rules, ScoringEngine maths (weighting, clamping, aggregation across sub-pages, deduction arithmetic, 113→30 mapping, override precedence), SpellCheck (suffix stripping, whitelist, proper-noun skip), config import/export round-trip.

**Layer 3 — End-to-end fixture submissions.** Complete fixture sites in `tests/fixtures/sites/`, zipped by the test setup, loaded through the real drag-drop path, asserting the full score sheet against hand-computed expected values:
- `alpha-perfect` — hits every auto criterion; expected: max on all auto items, zero deductions.
- `bravo-flawed` — seeded defect per rubric area: one page missing nav link, one broken link, one missing image, an absolute link, no logo on one sub-page, no back-to-top anywhere, heavy image, 3 misspellings; expected exact point losses per item.
- `charlie-minimal` — only 5 pages (−15), unstyled HTML; expected low design scores + deduction.
- `delta-messy` — nested folder root, uppercase `.HTM` extensions, spaces in filenames, `__MACOSX` junk; expected: parses fine, correct page discovery.
- CSV export content is asserted for the whole batch.

Fixtures double as manual demo data. A test fails if any rubric config item lacks a mapped check (coverage guard: the suite iterates the default config and asserts every `check` id exists and is unit-tested).

## 10. Milestones (for the implementation plan)

1. ZipReader + SubmissionLoader (+ tests)
2. PageRenderer + PageAnalyzer snapshot (+ tests)
3. Check catalogue, config schema, ScoringEngine (+ per-check tests)
4. SpellCheck with embedded wordlist (+ tests)
5. UI: batch flow, score sheet, previews, overrides, config editor
6. Exports + E2E fixture suite + coverage guard
