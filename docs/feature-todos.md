# Feature to-do list

Working list of upcoming work. Notes are a way to **elicit specific feedback**;
several items below pull "notes" and "reader feedback" closer together.

## Status
- ✅ **Polls** — create up to 4 options; results render as a horizontal bar chart
  on the note in the admin tab. (Backend was already fine; this was display.)
- ✅ **TOC (#5)** — per-page table of contents from the chapter's heading
  structure (client-side; shows when chapters contain markdown headings).
- ✅ **Unify margin placement (#6)** — notes/comments/reactions flow through one
  `resolveMarginPositions` pass per side (`lib/marginLayout.ts`).
- ✅ **Bug: first-placement jump** — drafts/pending now go through
  `resolveMarginPositions`, so a newly created note/comment appears at its final
  spot with no jump.
- ✅ **Bug: × button half off the note** — delete button now anchors to the
  paper's top-right corner per postit variant.
- ✅ **Consolidate notes + feedback (#1)** — Notes tab: clicking a note opens a
  feedback sidebar (`FeedbackSidebar.tsx`) on the opposite margin listing its
  comments/reactions/edits. Comments & Edits already shows note-linked feedback
  as highlights.
- ✅ **Markdown image/video assets + click-to-feedback (#3)** — `![alt](url)` in
  markdown renders as a clickable `.chapter-asset` (`<img>`, or `<video>` for
  video-extension URLs) with a stable `data-asset-id`. Readers click an asset to
  open the feedback toolbar; like/comment is stored with `asset_id` (new column
  on the three feedback tables) plus the asset's char position for margin
  placement. To embed: put a markdown image / video-URL image in the chapter
  source; it re-renders on the next ingest.
- ☐ **Author links (#4)** — see decision below. *(Only remaining item.)*

## Decisions captured
- **#3 assets:** markdown-embedded (image syntax / HTML video) referencing hosted
  URLs — render + make clickable for feedback. No upload infra.
- **#4 links:** show on both the reader page and the landing; author enters them
  in a settings area. NOTE: `SettingsView.tsx` exists but is **not currently
  mounted** in the dashboard, and links live naturally in `info.json` (where
  title/blurb/coverImage already live), edited via the cover-image-style API.
- **#1 consolidate:** keep both tabs. Comments & Edits shows note-feedback as a
  highlight. Notes tab shows notes as readers see them (add/remove); clicking a
  note opens a sidebar on the **opposite** margin (reuse the Comments & Edits
  sidebar) listing all feedback for that note.

---

## 1. Consolidate notes + feedback into a single view
Author notes and general reader feedback are currently separate surfaces. Bring
them together so the author sees **all feedback associated with a single note**
in one place.

- Today: `NOTES` tab (`AuthorNotesView`) shows notes with a per-note responses
  panel (`/api/dashboard/author-notes/[id]/responses`); `COMMENTS & EDITS`
  (`CommentsView`) shows free feedback separately.
- Want: one consolidated view where each note groups its linked comments /
  reactions / suggested edits / poll results, alongside un-noted feedback.
- Files: `components/AuthorNotesView.tsx`, `components/CommentsView.tsx`,
  `app/api/dashboard/author-notes/[id]/responses/route.ts`.

## 2. Fix: adding polls to notes doesn't work  *(bug)*
Creating a poll on a note is broken. Investigate end-to-end.

- Path: draft poll editor in `AuthorNotesView` → `POST/PATCH
  /api/dashboard/author-notes` (`pollOptions`) → reader vote via
  `POST /api/public/author-notes/poll-vote` → tallies in
  `/api/public/author-notes`.
- Reproduce, find where it breaks (creation vs. render vs. vote), fix, verify.

## 3. Image / video assets with click-to-feedback
Let authors embed images and videos, and let readers give feedback on an asset
by **clicking the asset** (instead of highlighting text).

- Author: embed assets (markdown images / uploads?) into chapter content.
- Reader: a click-on-asset feedback affordance distinct from text selection.
- Data: feedback anchored to an asset id rather than a char range — extend the
  feedback model (`feedback_comments` / `feedback_reactions` / `suggested_edits`
  currently anchor via `char_start`/`word_start`).
- Touches ingest/render, `ChapterReader` selection logic, feedback APIs, schema.

## 4. Optional author links (email + socials)
Give authors a way to add optional links to their email and social profiles,
surfaced to readers.

- Author settings to store links; reader-facing display (footer / landing).
- Data: author/work-level links (new columns or table).

## 5. Per-page table of contents from markdown headings
Generate a per-page TOC from the chapter's markdown heading/subheading
structure.

- Parse headings during ingest (`lib/ingest`), persist heading tree (with anchor
  positions), render a TOC component on the reader page that scrolls to headings.

## 6. Single margin-placement utility for reader view
Notes, edits, and comments in the reader margins should all flow through **one**
placement utility.

- Today: `lib/marginLayout.ts` (`resolveMarginPositions`) handles comment /
  reaction items; author-note postits are placed separately via
  `authorNoteAnchorYs` + per-side "footprints" in `ChapterReader`.
- Want: a single per-side pass that lays out notes, comments, reactions, and
  suggested edits together so nothing overlaps and the logic lives in one place.
- Files: `lib/marginLayout.ts`, `components/ChapterReader.tsx`.
