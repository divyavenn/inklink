import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db/client';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('sessionId');
    const chapterVersionId = searchParams.get('chapterVersionId');

    if (!sessionId || !chapterVersionId) {
      return NextResponse.json({ error: 'Missing required params' }, { status: 400 });
    }

    const [reactions, comments, suggestions] = await Promise.all([
      sql`
        SELECT id, reaction, char_start, char_length, selected_text, author_note_id
        FROM feedback_reactions
        WHERE reader_session_id = ${sessionId} AND chapter_version_id = ${chapterVersionId}
          AND char_start IS NOT NULL AND char_length IS NOT NULL
      `,
      sql`
        SELECT id, body, char_start, char_length, selected_text, author_note_id
        FROM feedback_comments
        WHERE reader_session_id = ${sessionId} AND chapter_version_id = ${chapterVersionId}
          AND char_start IS NOT NULL AND char_length IS NOT NULL
      `,
      sql`
        SELECT id, original_text, suggested_text, char_start, char_length
        FROM suggested_edits
        WHERE reader_session_id = ${sessionId} AND chapter_version_id = ${chapterVersionId}
          AND char_start IS NOT NULL AND char_length IS NOT NULL
      `,
    ]);

    return NextResponse.json({ reactions, comments, suggestions });
  } catch (err) {
    console.error('Session feedback error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
