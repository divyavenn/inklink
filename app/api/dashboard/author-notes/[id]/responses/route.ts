import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db/client';
import { isDashboardAuthed } from '@/lib/auth/dashboard';

/**
 * GET /api/dashboard/author-notes/{id}/responses
 *
 * Returns all reader responses linked to this author note: comments, reactions,
 * suggestions, and poll votes. Used by the per-note response panel on the
 * author Notes tab.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isDashboardAuthed(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await ctx.params;

  // Anchor range of the note. Feedback "for the note" = feedback explicitly
  // linked to it (author_note_id) OR feedback whose own char range overlaps the
  // note's text. Most reader feedback isn't explicitly linked (linking only
  // happens when the note is active as the reader responds), so overlap is what
  // makes the note's text-level responses show up.
  const [note] = await sql`
    SELECT chapter_version_id, char_start, char_length
    FROM author_notes WHERE id = ${id}
  `;
  if (!note) return NextResponse.json({ error: 'Note not found' }, { status: 404 });
  const cv = note.chapter_version_id as string;
  const nStart = note.char_start as number;
  const nEnd = (note.char_start as number) + (note.char_length as number);

  const [comments, reactions, suggestions, pollVotes] = await Promise.all([
    sql`
      SELECT fc.id, fc.body, fc.selected_text, fc.created_at,
             rs.anonymous_id, rp.display_name AS profile_name
      FROM feedback_comments fc
      JOIN reader_sessions rs ON rs.id = fc.reader_session_id
      LEFT JOIN reader_profiles rp ON rp.id = fc.reader_profile_id
      WHERE fc.author_note_id = ${id}
         OR (fc.chapter_version_id = ${cv} AND fc.char_start IS NOT NULL
             AND fc.char_start < ${nEnd} AND fc.char_start + COALESCE(fc.char_length, 0) > ${nStart})
      ORDER BY fc.created_at DESC
    `,
    sql`
      SELECT fr.id, fr.reaction, fr.selected_text, fr.created_at,
             rs.anonymous_id, rp.display_name AS profile_name
      FROM feedback_reactions fr
      JOIN reader_sessions rs ON rs.id = fr.reader_session_id
      LEFT JOIN reader_profiles rp ON rp.id = fr.reader_profile_id
      WHERE fr.author_note_id = ${id}
         OR (fr.chapter_version_id = ${cv} AND fr.char_start IS NOT NULL
             AND fr.char_start < ${nEnd} AND fr.char_start + COALESCE(fr.char_length, 0) > ${nStart})
      ORDER BY fr.created_at DESC
    `,
    sql`
      SELECT se.id, se.original_text, se.suggested_text, se.rationale, se.created_at,
             rs.anonymous_id, rp.display_name AS profile_name
      FROM suggested_edits se
      JOIN reader_sessions rs ON rs.id = se.reader_session_id
      LEFT JOIN reader_profiles rp ON rp.id = se.reader_profile_id
      WHERE se.author_note_id = ${id}
         OR (se.chapter_version_id = ${cv} AND se.char_start IS NOT NULL
             AND se.char_start < ${nEnd} AND se.char_start + COALESCE(se.char_length, 0) > ${nStart})
      ORDER BY se.created_at DESC
    `,
    sql`
      SELECT pr.choice_idx, pr.created_at, pr.updated_at,
             rs.anonymous_id, rp.display_name AS profile_name
      FROM author_note_poll_responses pr
      JOIN reader_sessions rs ON rs.id = pr.reader_session_id
      LEFT JOIN reader_profiles rp ON rp.id = pr.reader_profile_id
      WHERE pr.author_note_id = ${id}
      ORDER BY pr.updated_at DESC
    `,
  ]);

  return NextResponse.json({ comments, reactions, suggestions, pollVotes });
}
