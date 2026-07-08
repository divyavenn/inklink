import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db/client';
import { resolveInviteToken } from '@/lib/invites/resolve-invite';
import { nanoid } from 'nanoid';
import { ensureIngested } from '@/lib/ingest/run-ingest';
import { getWorkSlug } from '@/lib/slug';

const ANON_COOKIE = 'inklink_anon';
const ANON_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export async function POST(req: NextRequest) {
  try {
    const { workSlug, inviteToken, anonymousId: bodyAnonId } = await req.json();

    ensureIngested().catch(err => console.error('[ingest] background ingest failed:', err));

    const works = await sql`SELECT id FROM works WHERE slug = ${workSlug || getWorkSlug()}`;
    if (works.length === 0) return NextResponse.json({ error: 'Work not found' }, { status: 404 });
    const workId = works[0].id as string;

    // Identity precedence: explicit body anonymousId (from localStorage) → the
    // httpOnly cookie we set on a prior visit → a fresh id. The cookie survives a
    // localStorage clear, so the same device keeps one reader_session.
    const cookieAnonId = req.cookies.get(ANON_COOKIE)?.value || undefined;
    const existingAnonId = bodyAnonId || cookieAnonId;
    const anonymousId = existingAnonId || nanoid();

    let readerProfileId: string | null = null;
    let readerGroupId: string | null = null;
    let readerInviteId: string | null = null;

    if (inviteToken) {
      const resolved = await resolveInviteToken(inviteToken, workId);
      if (resolved) {
        readerProfileId = resolved.readerProfileId;
        readerGroupId = resolved.readerGroupId;
        readerInviteId = resolved.inviteId;
      }
    }

    // Reuse existing session for this anonymousId if possible
    const existing = existingAnonId ? await sql`
      SELECT id, anonymous_id, reader_profile_id, reader_group_id, reader_invite_id
      FROM reader_sessions
      WHERE work_id = ${workId} AND anonymous_id = ${anonymousId}
      ORDER BY first_seen_at ASC
      LIMIT 1
    ` : [];

    // Build the response and (re)set the anon cookie so the device is recognized
    // next time even if localStorage was cleared.
    const respond = (result: Record<string, unknown>) => {
      const res = NextResponse.json({
        sessionId: result.id,
        anonymousId: result.anonymous_id,
        workId,
        readerProfileId: result.reader_profile_id,
        readerGroupId: result.reader_group_id,
        readerInviteId: result.reader_invite_id,
      });
      res.cookies.set(ANON_COOKIE, result.anonymous_id as string, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: ANON_COOKIE_MAX_AGE,
      });
      return res;
    };

    if (existing.length > 0) {
      return respond(existing[0]);
    }

    // Create new session
    const [session] = await sql`
      INSERT INTO reader_sessions (work_id, anonymous_id, reader_profile_id, reader_group_id, reader_invite_id, user_agent, last_seen_at)
      VALUES (${workId}, ${anonymousId}, ${readerProfileId}, ${readerGroupId}, ${readerInviteId}, ${req.headers.get('user-agent') ?? null}, now())
      RETURNING id, anonymous_id, reader_profile_id, reader_group_id, reader_invite_id
    `;

    if (!session) return NextResponse.json({ error: 'Session creation failed' }, { status: 500 });

    return respond(session);
  } catch (err) {
    console.error('Session error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
