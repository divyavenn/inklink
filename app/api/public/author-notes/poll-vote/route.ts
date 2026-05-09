import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db/client';

/**
 * POST /api/public/author-notes/poll-vote
 * { sessionId, authorNoteId, choiceIdx }
 *
 * Records or updates the caller's vote on an author note's poll. Vote-changing
 * is supported via UPSERT on (author_note_id, reader_session_id).
 */
export async function POST(req: NextRequest) {
  try {
    const { sessionId, authorNoteId, choiceIdx } = await req.json();
    if (!sessionId || !authorNoteId || typeof choiceIdx !== 'number') {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const [note] = await sql`
      SELECT poll_options FROM author_notes WHERE id = ${authorNoteId}
    `;
    if (!note) return NextResponse.json({ error: 'Note not found' }, { status: 404 });
    const opts = note.poll_options as string[] | null;
    if (!opts) return NextResponse.json({ error: 'Note has no poll' }, { status: 400 });
    if (choiceIdx < 0 || choiceIdx >= opts.length) {
      return NextResponse.json({ error: 'Invalid choice index' }, { status: 400 });
    }

    const sessions = await sql`
      SELECT reader_profile_id, reader_group_id, reader_invite_id
      FROM reader_sessions WHERE id = ${sessionId}
    `;
    if (sessions.length === 0) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    const session = sessions[0];

    await sql`
      INSERT INTO author_note_poll_responses (
        author_note_id, reader_session_id,
        reader_profile_id, reader_group_id, reader_invite_id,
        choice_idx
      ) VALUES (
        ${authorNoteId}, ${sessionId},
        ${session.reader_profile_id ?? null}, ${session.reader_group_id ?? null}, ${session.reader_invite_id ?? null},
        ${choiceIdx}
      )
      ON CONFLICT (author_note_id, reader_session_id) DO UPDATE SET
        choice_idx = EXCLUDED.choice_idx,
        updated_at = now()
    `;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Poll vote error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

/**
 * DELETE /api/public/author-notes/poll-vote?sessionId=...&authorNoteId=...
 */
export async function DELETE(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('sessionId');
  const authorNoteId = req.nextUrl.searchParams.get('authorNoteId');
  if (!sessionId || !authorNoteId) {
    return NextResponse.json({ error: 'Missing required params' }, { status: 400 });
  }
  await sql`
    DELETE FROM author_note_poll_responses
    WHERE author_note_id = ${authorNoteId} AND reader_session_id = ${sessionId}
  `;
  return NextResponse.json({ ok: true });
}
