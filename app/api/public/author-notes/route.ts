import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db/client';

/**
 * GET /api/public/author-notes?chapterVersionId=...&sessionId=...
 *
 * Returns all author notes for a chapter version. For polls, includes total
 * tallies (publicly visible) plus the caller's own current vote (if any) so the
 * client can show "you voted for X". Text response visibility (the linked
 * comments/reactions/suggestions) is intentionally NOT included here — those
 * are scoped to the author + the original responder.
 */
export async function GET(req: NextRequest) {
  const chapterVersionId = req.nextUrl.searchParams.get('chapterVersionId');
  const sessionId = req.nextUrl.searchParams.get('sessionId');
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

  const [pollVotes, myVotes, commentCounts, reactionCounts, suggestionCounts] = await Promise.all([
    sql`
      SELECT author_note_id, choice_idx, COUNT(*)::int AS n
      FROM author_note_poll_responses
      WHERE author_note_id = ANY(${noteIds}::uuid[])
      GROUP BY author_note_id, choice_idx
    `,
    sessionId
      ? sql`
          SELECT author_note_id, choice_idx
          FROM author_note_poll_responses
          WHERE author_note_id = ANY(${noteIds}::uuid[]) AND reader_session_id = ${sessionId}
        `
      : Promise.resolve([] as Array<{ author_note_id: string; choice_idx: number }>),
    sql`SELECT author_note_id, COUNT(*)::int AS n FROM feedback_comments WHERE author_note_id = ANY(${noteIds}::uuid[]) GROUP BY author_note_id`,
    sql`SELECT author_note_id, COUNT(*)::int AS n FROM feedback_reactions WHERE author_note_id = ANY(${noteIds}::uuid[]) GROUP BY author_note_id`,
    sql`SELECT author_note_id, COUNT(*)::int AS n FROM suggested_edits WHERE author_note_id = ANY(${noteIds}::uuid[]) GROUP BY author_note_id`,
  ]);

  const cMap = new Map<string, number>();
  for (const r of commentCounts) cMap.set(r.author_note_id as string, r.n as number);
  const rMap = new Map<string, number>();
  for (const r of reactionCounts) rMap.set(r.author_note_id as string, r.n as number);
  const sMap = new Map<string, number>();
  for (const r of suggestionCounts) sMap.set(r.author_note_id as string, r.n as number);

  const tallyMap = new Map<string, number[]>();
  for (const r of pollVotes) {
    const key = r.author_note_id as string;
    const note = notes.find(n => n.id === key);
    const opts = (note?.poll_options as string[] | null) ?? [];
    const tallies = tallyMap.get(key) ?? new Array(opts.length).fill(0);
    const idx = r.choice_idx as number;
    if (idx >= 0 && idx < tallies.length) tallies[idx] = r.n as number;
    tallyMap.set(key, tallies);
  }

  const myVoteMap = new Map<string, number>();
  for (const v of myVotes) myVoteMap.set(v.author_note_id as string, v.choice_idx as number);

  const out = notes.map(n => {
    const id = n.id as string;
    const opts = n.poll_options as string[] | null;
    const tallies = opts ? (tallyMap.get(id) ?? new Array(opts.length).fill(0)) : null;
    const pollTotal = tallies ? tallies.reduce((a, b) => a + b, 0) : 0;
    const textTotal = (cMap.get(id) ?? 0) + (rMap.get(id) ?? 0) + (sMap.get(id) ?? 0);
    return {
      id,
      lineageId: n.lineage_id,
      wordStart: n.word_start,
      wordEnd: n.word_end,
      charStart: n.char_start,
      charLength: n.char_length,
      selectedText: n.selected_text,
      body: n.body,
      pollOptions: opts,
      pollTallies: tallies,
      myVote: myVoteMap.has(id) ? myVoteMap.get(id) : null,
      // Response counts only (content is scoped to author + responder).
      responseCount: textTotal + pollTotal,
      textResponseCount: textTotal,
    };
  });

  return NextResponse.json({ notes: out });
}
