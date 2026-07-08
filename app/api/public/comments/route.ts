import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db/client';
import { feedbackWordPos, wordRangeToCharPos } from '@/lib/db/wordPos';

export async function POST(req: NextRequest) {
  try {
    const { sessionId, chapterVersionId, body, selectedText, authorNoteId, assetId, charStart: clientCharStart, charLength: clientCharLength } = await req.json();

    if (!sessionId || !chapterVersionId || !body?.trim()) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const sessions = await sql`SELECT reader_profile_id, reader_group_id, reader_invite_id FROM reader_sessions WHERE id = ${sessionId}`;
    if (sessions.length === 0) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    const session = sessions[0];

    let charStart: number | null = null;
    let charLength: number | null = null;
    let wordStart: number | null = null;
    let wordEnd: number | null = null;

    if (assetId) {
      // Asset-anchored feedback: the reader clicked an image/video. Position comes
      // from the asset's char offset (sent by the client), no word range.
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

    const [c] = await sql`
      INSERT INTO feedback_comments (reader_session_id, chapter_version_id, reader_profile_id, reader_group_id, reader_invite_id, selected_text, body, char_start, char_length, word_start, word_end, author_note_id, asset_id)
      VALUES (${sessionId}, ${chapterVersionId}, ${session.reader_profile_id}, ${session.reader_group_id}, ${session.reader_invite_id}, ${selectedText ?? null}, ${body}, ${charStart}, ${charLength}, ${wordStart}, ${wordEnd}, ${authorNoteId ?? null}, ${assetId ?? null})
      RETURNING id
    `;

    return NextResponse.json({ id: c.id });
  } catch (err) {
    console.error('Comment error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
