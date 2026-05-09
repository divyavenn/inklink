import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db/client';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: chapterVersionId } = await params;
  const rows = await sql`
    SELECT stats FROM chapter_versions WHERE id = ${chapterVersionId}
  `;
  const stats = rows[0]?.stats ?? null;
  return NextResponse.json({ stats });
}
