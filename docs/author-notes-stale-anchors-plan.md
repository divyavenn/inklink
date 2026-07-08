# Plan: fixing stale author-note anchors on in-place re-render

## Problem (#6)

`author_notes` store `word_start/word_end` and `char_start/char_length` computed
**once at write time** against a specific `chapter_versions.rendered_html`. The
frontend draws each note's highlight by walking the rendered DOM's `textContent`
to those offsets, so the offsets are only valid for the exact HTML they were
computed against.

Chapter versions are normally immutable: an edit creates a *new* version and
`carryOverAuthorNotes()` remaps anchors via the word map. So drift cannot happen
on the normal edit path.

The drift trigger is **in-place rewrite of `rendered_html` for an existing
version**. Today the only such path is:

```
INSERT INTO chapter_versions (...)
... ON CONFLICT (chapter_id, document_version_id)
    DO UPDATE SET rendered_html = EXCLUDED.rendered_html, ...
```

(`lib/ingest/run-ingest.ts:232` and `:328`). If the **markdown renderer's output
changes** between deploys and an already-ingested `document_version` is
re-ingested, `rendered_html` is overwritten in place. `carryOverAuthorNotes()`
only runs against a *previous* version, so notes anchored to the rewritten
version are **not** recomputed — their `char_start`/`word_start` now point at the
old text layout. Highlights land on the wrong words; badly-drifted anchors can
fail to render at all.

This is latent today (no current code changes a renderer mid-life), but any
renderer tweak (spacing, entity handling, block structure) re-ingested onto live
data will surface it.

## Goal

Keep stored anchors consistent with `rendered_html` whenever that HTML is
rewritten in place — without losing notes whose anchor words survived the
re-render.

## Approach

Treat an in-place `rendered_html` rewrite the same way we treat a new version:
re-derive every anchored row's offsets against the new HTML using a word map
between the old and new HTML.

### Step 1 — detect the rewrite
In the ingest path, before issuing the `ON CONFLICT DO UPDATE`, fetch the
existing row's `rendered_html` for that `(chapter_id, document_version_id)`. If a
row exists and its `rendered_html` differs from the freshly-parsed HTML, this is
an in-place rewrite — capture `oldHtml` and `newHtml`.

### Step 2 — build a word map old→new
Reuse the existing machinery:

```ts
const wordMap = buildWordMap(htmlToWords(oldHtml), htmlToWords(newHtml));
```

This is exactly what the new-version path already computes; no new algorithm.

### Step 3 — remap anchors for all anchored rows on that version
For `author_notes` (and the version-scoped `feedback_comments`,
`feedback_reactions`, `suggested_edits` anchored to that `chapter_version_id`):

```ts
const remapped = mapWordRange(wordMap, row.word_start, row.word_end);
// remapped === null  → anchored words were removed by the re-render
const charPos = remapped && wordRangeToCharPos(newHtml, remapped.wordStart, remapped.wordEnd);
```

Then `UPDATE` the row's `word_start/word_end/char_start/char_length` to the
remapped values. Do all updates for the version in **one transaction** with the
`rendered_html` UPDATE so HTML and anchors never diverge, even on partial
failure.

### Step 4 — handle anchors that no longer resolve
When `mapWordRange` returns `null` (the anchored span disappeared), prefer
**re-anchoring from `selected_text`** as a fallback (`feedbackWordPos(newHtml,
selected_text)`) before giving up. Only if both fail, flag the note rather than
silently mis-rendering — e.g. add a nullable `anchor_status` column
(`'ok' | 'orphaned'`) and have the dashboard surface orphaned notes for the
author to re-place. (For reader feedback, dropping the anchor and showing it as
chapter-level is acceptable.)

### Step 5 — make this a reusable function
Factor the remap into `reanchorVersion(chapterVersionId, oldHtml, newHtml)` in
`lib/ingest/` so it can be called both from the in-place-rewrite branch and from
a one-off backfill (below).

## One-off backfill / safety net

Add a maintenance routine (callable from the ingest entrypoint, like
`backfillMissingStats`) that, for each chapter version, recomputes what
`char_start/char_length` *should* be from the stored `word_start/word_end` via
`wordRangeToCharPos(rendered_html, …)` and corrects any mismatch. This repairs
rows already drifted by a past in-place rewrite, independent of whether we
catch the next one at write time.

## Defensive option (cheap, complementary)

Make the highlight renderers fail safe: if a note's `selected_text` does not
match the text actually found at `[char_start, char_start+char_length)` in the
rendered DOM, fall back to a one-time client-side `feedbackWordPos`-style search
by `selected_text` and log a mismatch. This keeps highlights correct for the
reader even if a server-side remap was missed, and gives us telemetry on how
often drift actually occurs.

## Testing

- Unit: given `oldHtml`/`newHtml` differing by inserted/removed words, assert
  `reanchorVersion` moves a note's offsets to still cover the same `selected_text`.
- Unit: anchored words deleted → note flagged orphaned (or re-anchored via
  `selected_text`), never silently mis-placed.
- Integration: re-ingest the same `document_version` with a renderer that adds a
  word before the anchor; assert the highlight still covers the original phrase.
- Round-trip: a note late in a long multi-paragraph chapter (drift accumulates
  with preceding text) still anchors correctly after re-render.

## Scope / non-goals

- Does **not** touch the normal edit→new-version path (already correct via
  `carryOverAuthorNotes`).
- Does **not** require a schema change unless we adopt the `anchor_status` flag
  in Step 4 (recommended but separable).
