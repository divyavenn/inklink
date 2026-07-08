import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db/client';
import { isDashboardAuthed } from '@/lib/auth/dashboard';
import { feedbackWordPos, wordRangeToCharPos, charRangeToWordRange } from '@/lib/db/wordPos';
import { deleteAuthorNoteCascade } from '@/lib/db/authorNotes';

/** Max length for a note's anchored selection — roughly a couple of paragraphs. */
const MAX_SELECTED_TEXT = 2000;

async function requireAuth(req: NextRequest) {
  if (!(await isDashboardAuthed(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

/**
 * GET /api/dashboard/author-notes?chapterVersionId=...
 * Returns all author notes for a chapter version with linked-feedback counts and
 * poll tallies. Used by the author Notes tab.
 */
export async function GET(req: NextRequest) {
  const unauth = await requireAuth(req);
  if (unauth) return unauth;

  const chapterVersionId = req.nextUrl.searchParams.get('chapterVersionId');
  if (!chapterVersionId) {
    return NextResponse.json({ error: 'Missing chapterVersionId' }, { status: 400 });
  }

  const notes = await sql`
    SELECT id, lineage_id, word_start, word_end, char_start, char_length,
           selected_text, body, poll_options, created_at
    FROM author_notes
    WHERE chapter_version_id = ${chapterVersionId}
    ORDER BY char_start ASC
  `;

  if (notes.length === 0) return NextResponse.json({ notes: [] });

  const noteIds = notes.map(n => n.id as string);

  const [commentCounts, reactionCounts, suggestionCounts, pollVotes] = await Promise.all([
    sql`SELECT author_note_id, COUNT(*)::int AS n FROM feedback_comments WHERE author_note_id = ANY(${noteIds}::uuid[]) GROUP BY author_note_id`,
    sql`SELECT author_note_id, reaction, COUNT(*)::int AS n FROM feedback_reactions WHERE author_note_id = ANY(${noteIds}::uuid[]) GROUP BY author_note_id, reaction`,
    sql`SELECT author_note_id, COUNT(*)::int AS n FROM suggested_edits WHERE author_note_id = ANY(${noteIds}::uuid[]) GROUP BY author_note_id`,
    sql`SELECT author_note_id, choice_idx, COUNT(*)::int AS n FROM author_note_poll_responses WHERE author_note_id = ANY(${noteIds}::uuid[]) GROUP BY author_note_id, choice_idx`,
  ]);

  const cMap = new Map<string, number>();
  for (const r of commentCounts) cMap.set(r.author_note_id as string, r.n as number);

  const rMap = new Map<string, { like: number; dislike: number }>();
  for (const r of reactionCounts) {
    const key = r.author_note_id as string;
    const cur = rMap.get(key) ?? { like: 0, dislike: 0 };
    if (r.reaction === 'like') cur.like = r.n as number;
    else cur.dislike = r.n as number;
    rMap.set(key, cur);
  }

  const sMap = new Map<string, number>();
  for (const r of suggestionCounts) sMap.set(r.author_note_id as string, r.n as number);

  const pollMap = new Map<string, number[]>();
  for (const r of pollVotes) {
    const key = r.author_note_id as string;
    const opts = (notes.find(n => n.id === key)?.poll_options as string[] | null) ?? [];
    const tallies = pollMap.get(key) ?? new Array(opts.length).fill(0);
    const idx = r.choice_idx as number;
    if (idx >= 0 && idx < tallies.length) tallies[idx] = r.n as number;
    pollMap.set(key, tallies);
  }

  const out = notes.map(n => {
    const id = n.id as string;
    return {
      id,
      lineageId: n.lineage_id,
      wordStart: n.word_start,
      wordEnd: n.word_end,
      charStart: n.char_start,
      charLength: n.char_length,
      selectedText: n.selected_text,
      body: n.body,
      pollOptions: n.poll_options as string[] | null,
      createdAt: n.created_at,
      commentCount: cMap.get(id) ?? 0,
      reactions: rMap.get(id) ?? { like: 0, dislike: 0 },
      suggestionCount: sMap.get(id) ?? 0,
      pollTallies: pollMap.get(id) ?? (n.poll_options ? new Array((n.poll_options as string[]).length).fill(0) : null),
    };
  });

  return NextResponse.json({ notes: out });
}

/**
 * POST /api/dashboard/author-notes
 * { chapterVersionId, body, selectedText, pollOptions?: string[] }
 *
 * Creates a new author note anchored to a word range derived from selectedText.
 */
export async function POST(req: NextRequest) {
  const unauth = await requireAuth(req);
  if (unauth) return unauth;

  const { chapterVersionId, body, selectedText, pollOptions, charStart, charLength } = await req.json();
  if (!chapterVersionId || !body?.trim() || !selectedText) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  if (typeof body === 'string' && body.length > 400) {
    return NextResponse.json({ error: 'Note body must be 400 characters or fewer' }, { status: 400 });
  }
  if (typeof selectedText === 'string' && selectedText.length > MAX_SELECTED_TEXT) {
    return NextResponse.json({ error: `Selection must be ${MAX_SELECTED_TEXT} characters or fewer` }, { status: 400 });
  }
  if (pollOptions && (!Array.isArray(pollOptions) || pollOptions.length < 2 || pollOptions.length > 4)) {
    return NextResponse.json({ error: 'pollOptions must be 2–4 items' }, { status: 400 });
  }

  const [ver] = await sql`SELECT rendered_html FROM chapter_versions WHERE id = ${chapterVersionId}`;
  if (!ver) return NextResponse.json({ error: 'Chapter version not found' }, { status: 404 });

  // Prefer the exact selection offsets sent by the client (so a note anchors to
  // the instance the author actually highlighted). Fall back to text search only
  // when offsets are absent — feedbackWordPos resolves to the FIRST match, which
  // is wrong when the selected phrase appears more than once.
  const hasOffsets = typeof charStart === 'number' && typeof charLength === 'number' && charLength > 0;
  const wp = hasOffsets
    ? charRangeToWordRange(ver.rendered_html as string, charStart, charLength)
    : feedbackWordPos(ver.rendered_html as string, selectedText);
  if (!wp) return NextResponse.json({ error: 'Could not anchor to selection' }, { status: 422 });
  const cp = wordRangeToCharPos(ver.rendered_html as string, wp.wordStart, wp.wordEnd);
  if (!cp) return NextResponse.json({ error: 'Could not anchor to selection' }, { status: 422 });

  // Dedup: a double-submit (or re-selecting the same words) anchors to the same
  // word-snapped char range. Return the existing note instead of creating a twin.
  const [dup] = await sql`
    SELECT id, lineage_id FROM author_notes
    WHERE chapter_version_id = ${chapterVersionId}
      AND char_start = ${cp.charStart} AND char_length = ${cp.charLength}
    LIMIT 1
  `;
  if (dup) {
    return NextResponse.json({ id: dup.id, lineageId: dup.lineage_id, deduped: true });
  }

  const [n] = await sql`
    INSERT INTO author_notes (
      chapter_version_id, word_start, word_end, char_start, char_length,
      selected_text, body, poll_options
    ) VALUES (
      ${chapterVersionId}, ${wp.wordStart}, ${wp.wordEnd}, ${cp.charStart}, ${cp.charLength},
      ${selectedText}, ${body}, ${pollOptions ? JSON.stringify(pollOptions) : null}
    )
    RETURNING id, lineage_id
  `;

  return NextResponse.json({ id: n.id, lineageId: n.lineage_id });
}

/**
 * PATCH /api/dashboard/author-notes
 * { id, body?, pollOptions? }
 *
 * Changing pollOptions clears existing votes (the choice indices may no longer
 * line up). Votes are only cleared when the options actually change — editing the
 * body or re-saving identical options leaves responses intact.
 */
export async function PATCH(req: NextRequest) {
  const unauth = await requireAuth(req);
  if (unauth) return unauth;

  const { id, body, pollOptions } = await req.json();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const [existing] = await sql`SELECT poll_options FROM author_notes WHERE id = ${id}`;
  if (!existing) return NextResponse.json({ error: 'Note not found' }, { status: 404 });

  if (pollOptions !== undefined) {
    if (pollOptions !== null && (!Array.isArray(pollOptions) || pollOptions.length < 2 || pollOptions.length > 4)) {
      return NextResponse.json({ error: 'pollOptions must be 2–4 items or null' }, { status: 400 });
    }
    // Only wipe votes when the options actually change — editing the body (or
    // re-saving identical options) must not destroy existing poll responses.
    const nextOpts = pollOptions ? JSON.stringify(pollOptions) : null;
    const curOpts = existing.poll_options ? JSON.stringify(existing.poll_options) : null;
    if (nextOpts !== curOpts) {
      await sql`DELETE FROM author_note_poll_responses WHERE author_note_id = ${id}`;
      await sql`UPDATE author_notes SET poll_options = ${nextOpts} WHERE id = ${id}`;
    }
  }
  if (body !== undefined) {
    if (typeof body === 'string' && body.length > 400) {
      return NextResponse.json({ error: 'Note body must be 400 characters or fewer' }, { status: 400 });
    }
    await sql`UPDATE author_notes SET body = ${body} WHERE id = ${id}`;
  }

  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/dashboard/author-notes?id=...
 * Deletes only the specified version of the note, plus all reader feedback
 * linked to it (cascade cleanup — no orphaned rows). Other versions of the same
 * lineage are unaffected — matches the intent that note edits/deletes scope to
 * the current version only.
 */
export async function DELETE(req: NextRequest) {
  const unauth = await requireAuth(req);
  if (unauth) return unauth;

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const deleted = await deleteAuthorNoteCascade(id);
  if (!deleted) return NextResponse.json({ error: 'Note not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
