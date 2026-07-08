import sql from './client';

/**
 * Delete an author note and all reader feedback linked to it, atomically.
 *
 * The feedback FKs on author_note_id are ON DELETE SET NULL, so a bare
 * `DELETE FROM author_notes` would leave behind orphaned comments/reactions/
 * suggested edits whose note link is null — un-attributable and never cleaned
 * up. This removes the linked feedback first, then the note, in a single
 * transaction so a mid-failure can't leave a partial cleanup.
 *
 * NOTE: this only prevents *future* orphans. Pre-existing rows where
 * author_note_id was already nulled cannot be recovered — once the link is
 * null they're indistinguishable from legitimate chapter-level feedback.
 *
 * @returns true if a note with this id existed and was deleted, false otherwise.
 */
export async function deleteAuthorNoteCascade(id: string): Promise<boolean> {
  const existing = await sql`SELECT id FROM author_notes WHERE id = ${id}`;
  if (existing.length === 0) return false;

  await sql.transaction([
    sql`DELETE FROM feedback_comments WHERE author_note_id = ${id}`,
    sql`DELETE FROM feedback_reactions WHERE author_note_id = ${id}`,
    sql`DELETE FROM suggested_edits WHERE author_note_id = ${id}`,
    sql`DELETE FROM author_note_poll_responses WHERE author_note_id = ${id}`,
    sql`DELETE FROM author_notes WHERE id = ${id}`,
  ]);

  return true;
}
