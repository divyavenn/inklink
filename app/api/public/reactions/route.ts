import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db/client';
import { feedbackWordPos, wordRangeToCharPos } from '@/lib/db/wordPos';

export async function POST(req: NextRequest) {
  try {
    const { sessionId, chapterVersionId, reaction, selectedText, authorNoteId, assetId, charStart: clientCharStart, charLength: clientCharLength } = await req.json();

    if (!sessionId || !chapterVersionId || !reaction) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (!['like', 'dislike'].includes(reaction)) {
      return NextResponse.json({ error: 'Invalid reaction' }, { status: 400 });
    }

    const sessions = await sql`SELECT reader_profile_id, reader_group_id, reader_invite_id FROM reader_sessions WHERE id = ${sessionId}`;
    if (sessions.length === 0) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    const session = sessions[0];

    let wordStart: number | null = null;
    let wordEnd: number | null = null;
    let charStart: number | null = null;
    let charLength: number | null = null;

    if (assetId) {
      charStart = typeof clientCharStart === 'number' ? clientCharStart : null;
      charLength = typeof clientCharLength === 'number' ? clientCharLength : 0;
    } else if (selectedText) {
      const [ver] = await sql`SELECT rendered_html FROM chapter_versions WHERE id = ${chapterVersionId}`;
      if (ver) {
        const wp = feedbackWordPos(ver.rendered_html, selectedText);
        if (wp) {
          wordStart = wp.wordStart; wordEnd = wp.wordEnd;
          const cp = wordRangeToCharPos(ver.rendered_html, wp.wordStart, wp.wordEnd);
          if (cp) { charStart = cp.charStart; charLength = cp.charLength; }
        }
      }
    }

    const [r] = await sql`
      INSERT INTO feedback_reactions (reader_session_id, chapter_version_id, reader_profile_id, reader_group_id, reader_invite_id, reaction, selected_text, word_start, word_end, char_start, char_length, author_note_id, asset_id)
      VALUES (${sessionId}, ${chapterVersionId}, ${session.reader_profile_id}, ${session.reader_group_id}, ${session.reader_invite_id}, ${reaction}, ${selectedText ?? null}, ${wordStart}, ${wordEnd}, ${charStart}, ${charLength}, ${authorNoteId ?? null}, ${assetId ?? null})
      RETURNING id
    `;

    return NextResponse.json({ id: r.id });
  } catch (err) {
    console.error('Reaction error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
