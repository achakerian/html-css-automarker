# HTML/CSS Submission Automarker — Design Spec (v2, generalised)

**Date:** 2026-09-11
**Status:** Approved (approach B + generalisation to a generic, GitHub-hosted rubric engine)

## 1. Overview

A single self-contained `index.html` hosted on GitHub Pages (also works opened locally). Anyone — a marker with a batch of student zips, or a student self-checking one submission — picks a **rubric preset** (or builds/imports their own), drags in zip file(s), and gets a marked score sheet per submission with plain-English evidence.

The tool unzips each submission in-browser, renders every page in a hidden script-disabled sandboxed iframe, and runs a catalogue of automated checks against the live DOM, computed styles, and parsed CSS. Nearly every criterion is auto-scored; genuinely semantic judgments (content on-topic, image relevance, overall aesthetic) get heuristic suggested scores confirmed beside a rendered preview. Results export as batch CSV and per-submission feedback reports.

**The engine is rubric-agnostic.** A rubric is a JSON config: sections of items, each item bound to a check from the catalogue with parameters, either *scored* (`max: N` points) or a *requirement* (`required: true`, pass/fail). Two presets ship built in:

- **CSE1IIT 2026 S2** (La Trobe "La Trobe Sports", 113 pts → 30 marks) — points-based design rubric.
- **IWBS001 A2** (3-page portfolio) — requirements checklist, heavy on CSS-structural rules.

A **rubric builder UI** lets non-technical users compose a rubric from the check catalogue (pick checks, set points/thresholds/params) and export/import/share the JSON.

## 2. Goals and non-goals

**Goals**

- Batch or single-submission marking; identical flow for marker and student self-check.
- Auto-score every mechanically checkable criterion; assisted confirm for semantic items.
- Evidence for every score, usable directly as feedback.
- Rubric-agnostic engine + preset library + builder UI + JSON import/export.
- Fully offline-capable, zero-install, single static file; publishable via GitHub Pages from the main branch, MIT licensed, with a README covering usage and rubric authoring.
- A thorough automated test suite covering every check in the catalogue and both presets end-to-end.

**Non-goals**

- No LMS integration, server, database, or AI/API scoring.
- Submission JavaScript never executes (HTML/CSS assignments; deterministic + safe). CSS animations still run.
- No plagiarism/similarity detection. No NLP parsing of rubric documents (builder UI instead).

## 3. Architecture

One HTML file (`index.html`), organised as labelled inline `<script>` modules under a single `window.Automarker` namespace (no build step; a one-time `tools/embed-wordlist.mjs` injects the spell-check wordlist between markers):

| Module | Responsibility |
|---|---|
| `ZipReader` | Dependency-free zip parsing (central directory; stored + deflate via native `DecompressionStream('deflate-raw')`). |
| `SubmissionLoader` | Zip → submission model: file map, HTML page discovery, home-page identification, name from zip filename; junk/nested-root normalisation. |
| `PageRenderer` | Renders one page into `<iframe sandbox="allow-same-origin">` via blob URLs; rewrites relative refs (img/srcset, CSS links, CSS `url()`, video/source) to blobs; records broken and external refs; scripts never run. |
| `PageAnalyzer` | Rendered iframe → JSON-serialisable **PageSnapshot**: link graph, nav, images/media, palette, typography (incl. contrast), spacing/white-space, structure, visible text, anchors, inline styles, page weight, responsive re-measures at configurable widths (default 1280/768/375). |
| `CssAnalyzer` | Collects external/embedded rules per page; classifies each rule (generic class, tag-scoped class, heading style, `a:hover`, group, contextual, id-on-heading, button, flexbox, positioning, body/header/footer, paragraph format) and records whether it matches anything on the page (for unused-CSS detection). |
| `Checks` | The catalogue (Section 6). Pure functions `(ctx) → CheckResult`; `ctx = {snapshot?, snapshots, submission, config, params}`. Exposed as `Automarker.checks` with `Automarker.checkMeta` (labels/params/scopes) driving the builder UI. |
| `ScoringEngine` | Config → sheet: item expansion by scope, weighted sub-results → scores, requirement pass/fail, per-page aggregation, deductions, totals, points→marks mapping, overrides, spelling confirmation. |
| `SpellCheck` | Embedded gzipped wordlist (base64, inflated via `DecompressionStream('gzip')`); suffix stripping; skips capitalised words, numbers, config whitelist; emits candidates only — deduction requires confirmation. |
| `Config` | Schema validation, presets (`Automarker.presets`), import/export. |
| `UI` | Preset picker, drag-drop batch, submission sidebar, score sheet with evidence + overrides, per-page preview panes, assisted-item confirmation, spelling checklist, rubric builder, exports. |
| `Exporter` | Batch CSV (per-item columns, override flags, totals) + per-submission printable feedback report. |

`window.Automarker` also exposes `loadSubmission`, `analyzePage`, `analyzeSubmission`, `processSubmissionBytes` so tests drive both unit and end-to-end paths.

## 4. Rubric config schema

```json
{
  "meta": { "id": "cse1iit-2026s2", "title": "...", "totalPoints": 113, "mappedMarks": 30,
            "minPages": 6, "viewport": {"w":1280,"h":800},
            "responsiveWidths": [1280,768,375],
            "weightThresholds": {"fullKB":1536,"partialKB":4096} },
  "topic": { "keywords": [], "sectionHints": [], "spellWhitelist": [],
             "logoHints": ["logo","brand"], "locationHints": ["location","contact","find","visit"] },
  "sections": [
    { "id": "nav", "title": "...", "points": 30, "items": [
      { "id": "nav-home", "label": "...", "check": "navBar", "mode": "auto",
        "scope": "home", "max": 5, "params": {} } ] }
  ],
  "deductions": [
    { "id": "spelling", "label": "...", "perInstance": -1, "check": "spelling", "mode": "assisted" },
    { "id": "broken",   "label": "...", "perInstance": -2, "check": "brokenResources", "mode": "auto" },
    { "id": "pageCount","label": "...", "flat": -15, "check": "pageCount", "mode": "auto" } ]
}
```

- **Item forms:** scored (`max: N`) or requirement (`required: true` — pass/fail; excluded from point totals; report shows met/unmet counts). A rubric may mix both.
- **Scopes:** `home` (home page only), `eachSubpage` (expands to one row per sub-page, padded with zero-rows up to `minPages − 1` if pages are missing; if extra pages exist, the best-scoring `minPages − 1` count), `subpages` (aggregate: per-page score, mean scaled to max), `eachPage` (row per page, home included), `site` (whole submission).
- **Modes:** `auto` (stands unless overridden) or `assisted` (suggested score, flagged for confirmation).
- Config validation: every `check` id exists, scored sections sum to `meta.totalPoints`; violations reported in the UI and rejected at import.

## 5. Submission model

- Each zip = one submission; label = zip filename minus extension.
- Pages: `*.html`/`*.htm` (case-insensitive). Home = `index.html` at shallowest depth, else most-linked-to page, else alphabetical first — shown and correctable in the UI.
- Normalisation: `__MACOSX`, `.DS_Store`, dotfiles dropped; backslashes normalised; single nested root folder stripped; non-UTF-8 falls back to latin-1; corrupt zips become an error card without stopping the batch.
- Renderer timeouts (10 s/page) mark affected checks "needs manual review", never hang the batch. 50 MB zip guard.

## 6. Check catalogue

Each check returns weighted sub-results plus evidence for passes and failures. Catalogue (27 checks):

**Navigation & site mechanics:** `navBar` (structure, coverage of other pages, working targets, styled, consistency vs site-wide modal nav set), `pageCount` (min pages, flat deduction or requirement), `brokenResources` (missing link targets, broken images/CSS, per-instance), `externalLink` (`{"policy":"forbidden"}` → instances flag absolute/drive links; `{"policy":"required","min":N}` → requirement that external informational links exist), `emailLink` (`mailto:` present), `backToTop` (lower-half anchor targeting page top; structural, since scripts don't run).

**Design metrics:** `colourTheme` (non-default palette, 3–12 distinct colours, ≤2 high-saturation hues, cross-page consistency when scoped to sub-pages), `typography` (non-default fonts, body 14–20 px, contrast ≥ 4.5:1 with partial credit ≥ 3:1), `whiteSpace` (no horizontal overflow, constrained content width, inter-section gaps), `margins` (content inset from viewport edges), `sectionStructure` (≥ 2 sections, heading hierarchy, semantic tags), `images` (`min` resolved images ≥ 150 px displayed, not stretched > 1.5× natural; relevance sub-result assisted via filename/alt keywords), `logo` (keyword-matched image/brand in top region; link-to-home and left-placement sub-results), `pageWeight` (page + assets vs config thresholds).

**CSS-structural (IWBS-class rubrics):** `cssExternal` (external stylesheet exists and is linked from every page), `cssSelectorTypes` (params: list of `{kind, min, origin}` where kind ∈ pFormat | classGeneric | classScoped | headingStyle | hoverAnchor | group | contextual | idOnHeading | buttonStyle | flexbox | positioning | bodyStyle | headerStyle | footerStyle and origin ∈ external | embedded | any; scores fraction of requirements met, evidence lists what's missing), `cssUnused` (selectors matching nothing on any page; requirement or per-instance), `inlineStyles` (≥ N inline styles per page; sub-results for required tags e.g. div + span).

**Content:** `wordCount` (min words on a page/section keyword region), `mediaPresence` (required media kinds: video/iframe-embed/gif/img, per params), `contentIntro`, `offerings`, `contentRelevance` (assisted: word-count + topic-keyword heuristics, marker confirms), `directions` (location-page address/hours/map/contact patterns), `aesthetic` (assisted composite of design metrics), `responsive` (re-measure at `responsiveWidths`: no horizontal overflow and layout adapts).

**Deduction-only:** `spelling` (candidates across visible text; only confirmed instances deduct).

### Preset mappings

- **CSE1IIT**: exactly the marking rubric — Nav 6 × 0–5 (`navBar`, home + `eachSubpage`); Home 23 (colourTheme, typography, whiteSpace, sectionStructure, images min 1, margins, logo, pageWeight, aesthetic*, contentIntro*, offerings* at 0–2 + backToTop 0–1); Sub-pages 60 (`subpages`-scoped: colourTheme 5, typography 5, whiteSpace 5, sectionStructure 5, images min 2 → 10, margins 5, logo 5, pageWeight 5, contentRelevance* 5, backToTop 5, directions 5); deductions spelling −1*, broken −2, < 6 pages −15. (* = assisted.)
- **IWBS001**: requirements checklist — 3 pages, nav on each page covering the others; home content requirements (photo+name+ID*, quote+video/GIF via `mediaPresence`, `emailLink`, intro/skills word counts ≥ 200); favourites/place pages (word counts ≥ 250, `externalLink` policy required); full `cssSelectorTypes` set split by origin (external: pFormat, 3× classGeneric, 3× classScoped, 3× headingStyle, hoverAnchor, 2× group, contextual, buttonStyle, flexbox; embedded: idOnHeading, contextual, class-for-p, positioning, headerStyle+footerStyle, bodyStyle), `inlineStyles` ≥ 3/page incl. div + span, `cssUnused` (none allowed), `cssExternal`, `responsive`, design-quality items (consistency, contrast, typography) as scored 0–2 items, spelling deduction.

## 7. Scoring, overrides, exports

- Scored item: `round(max × Σ(weight × pass) / Σweight)` clamped to range; requirement item: pass iff weighted fraction ≥ params.threshold (default 1.0 for hard requirements).
- Overrides: click any score/requirement to set it; visually distinct; flagged in CSV. Assisted items and spelling confirmations recompute totals live.
- Totals: section subtotals, deductions, total, `mappedMark = max(0, round1(total / totalPoints × mappedMarks))`; requirement rubrics report `met/total` plus any scored subtotal.
- Exports: batch CSV (row per submission, column per item + auto/final/overridden + totals) and printable per-submission feedback report from evidence lines.

## 8. Testing strategy

Runner: `npm test` → `node:test` + Playwright headless Chromium against a local static server. Layers:

1. **Check unit tests — every check, every rubric line:** pass, fail, and partial/edge cases per check, rendering purpose-built fixtures through the real renderer/analyzer pipeline and invoking `Automarker.checks.<id>` in-page.
2. **Engine tests:** ZipReader (stored/deflated/nested-root/`__MACOSX`/corrupt), SubmissionLoader discovery rules, CssAnalyzer classification table, ScoringEngine maths (weights, clamping, scope expansion/aggregation, requirement thresholds, deductions, mapping, overrides), SpellCheck, config validation + import/export round-trip for both presets.
3. **End-to-end fixture submissions** (generated by `tests/fixtures/sites.mjs`, zipped in-memory, loaded through the real pipeline; also writable to disk as demo zips):
   - `alpha-perfect` — maxes every CSE1IIT auto item; zero deductions.
   - `bravo-flawed` — seeded defects with hand-computed expected losses (missing nav link, broken link, missing image, absolute link, no logo on one sub-page, no back-to-top, heavy image, 3 misspellings).
   - `charlie-minimal` — 5 pages (−15), unstyled.
   - `delta-messy` — nested root, `.HTM`, spaces, `__MACOSX`: parses clean.
   - `echo-portfolio` — meets every IWBS001 requirement.
   - `foxtrot-gaps` — violates specific IWBS001 CSS requirements (no hover style, unused selectors, 2 generic classes, no flexbox, missing span inline style): exact unmet list asserted.
   - Batch CSV content asserted across fixtures.
4. **Coverage guard:** iterates both presets and fails if any item's `check` is missing from the catalogue or untested (unit-test filename convention per check id).

## 9. Repository layout

```
index.html                  # the tool (deliverable, GitHub Pages entry)
README.md                   # usage + rubric-authoring guide
LICENSE                     # MIT
tools/embed-wordlist.mjs    # one-time wordlist injection
package.json                # devDeps: playwright; npm test
tests/helpers/              # static server, browser harness, zip writer
tests/unit/  tests/e2e/  tests/fixtures/sites.mjs
docs/superpowers/specs|plans/
```

## 10. Milestones

1. Scaffold (repo, harness, skeleton) → 2. ZipReader → 3. SubmissionLoader → 4. PageRenderer → 5–6. PageAnalyzer (core, then style/responsive metrics) → 7. CssAnalyzer → 8–11. Check catalogue (+ SpellCheck) → 12. Config + presets → 13. ScoringEngine → 14. UI → 15. Builder + exports → 16. E2E fixtures + coverage guard + README.

## 11. As-built notes (2026-09-18)

All 16 milestones shipped; 89 tests green (unit per check/module, e2e fixture
submissions with exact-score assertions, coverage guard). Deviations from the
text above, each ruled during execution and reflected in the code and README:

- **IWBS001 design-quality items** ship as `required` + threshold checklist
  rows, not scored 0–2 items (§6 said "scored 0–2"). The builder can convert
  them; the README documents shipped behaviour.
- **Margins scoring** was tightened twice against the original heuristics:
  full marks require ≥ 16 px inset (Chromium's default 8 px body margin
  scores partial, not full), and insets are measured from the largest
  content block so full-bleed headers/navs are not penalised.
- **navBar coverage** uses a steep slope (`max(0, 1 − 0.4 × missing)`,
  double weight) so one missing nav link costs ≈ 1 point of 5 after
  rounding, matching marker intent.
- **CSS rules carry a `media` context**; selector-type requirements count
  distinct `selector|source` pairs (an `@media` re-declaration counts once)
  while unused-CSS detection stays media-aware.
- **Renderer egress hardening** beyond §3: string- and url-form `@import`
  handled (local imports inlined one level and analysed; external imports
  stripped and flagged), non-stylesheet/icon `<link>` rels removed, `srcset`
  stripped — zero network egress for submission content, regression-tested.
- **Spell-check hardening**: contraction and curly-apostrophe handling, and
  dictionary supplements for gaps in the system word list (has/women/held/
  paid, British spellings, web vocabulary). CSV export neutralises
  spreadsheet formula injection from submission filenames; zip reading has a
  cumulative decompression cap.

## 12. Direction (agreed 2026-09-14)

- Rubric JSON is the interchange format; generating it **from assessment
  briefs via an LLM happens outside the tool** (authoring prompt + schema in
  the README), keeping the marker deterministic and offline. Unmappable
  criteria travel in a top-level `_unmapped` list until a `manual` check
  lands.
- Planned next (see README roadmap): `manual` check, LMS master-zip
  ingestion (one zip of all students' submissions, split per student), and
  a declared-size zip-bomb pre-check.
