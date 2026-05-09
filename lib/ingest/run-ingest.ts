import sql, { rawQuery } from '../db/client';
import { CREATE_SCHEMA_SQL } from '../db/schema';
import { loadAllMarkdownChapters } from '../content/load-markdown';
import { parseChapter } from './parse-chapter';
import { computeChapterStats } from './compute-stats';
import { htmlToWords, buildWordMap, mapWordRange, wordRangeToCharPos } from '../db/wordPos';
import { getWorkSlug } from '@/lib/slug';
import simpleGit from 'simple-git';

export interface IngestResult {
  workId: string;
  documentVersionId: string;
  chaptersIngested: number;
  alreadyExists: boolean;
}

async function getCurrentCommitInfo(): Promise<{
  sha: string;
  message: string;
  author: string;
  createdAt: string;
}> {
  // Explicit env vars take priority (set manually or via CI/CD)
  const sha =
    process.env.GIT_COMMIT_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA ||   // set automatically by Vercel at runtime
    null;

  if (sha) {
    return {
      sha,
      message: process.env.GIT_COMMIT_MESSAGE || process.env.VERCEL_GIT_COMMIT_MESSAGE || '',
      author:
        process.env.GIT_COMMIT_AUTHOR ||
        process.env.VERCEL_GIT_COMMIT_AUTHOR_LOGIN ||
        '',
      createdAt: process.env.GIT_COMMIT_CREATED_AT || new Date().toISOString(),
    };
  }

  // Fall back to local git CLI (works in dev, not available on Vercel serverless)
  const git = simpleGit(process.cwd());
  const log = await git.log({ maxCount: 1 });
  const latest = log.latest;
  if (!latest) throw new Error('No git commits found and no GIT_COMMIT_SHA env var set');
  return {
    sha: latest.hash,
    message: latest.message,
    author: latest.author_name,
    createdAt: latest.date,
  };
}

export async function runIngest(): Promise<IngestResult> {
  const workSlug = getWorkSlug();
  const workTitle = process.env.TITLE || 'My Book';

  const commitInfo = await getCurrentCommitInfo();
  console.log(`[ingest] starting for commit ${commitInfo.sha.slice(0, 8)}`);

  // Fast path — check the marker table before doing anything expensive. The
  // marker is written for every commit we've seen (even code-only commits where
  // no chapter text changed), so we don't keep redoing work on every restart.
  try {
    const [work] = await sql`SELECT id FROM works WHERE slug = ${workSlug}`;
    if (work) {
      const workId = work.id as string;
      // Per-feature DDL needed before reading/writing the new columns/tables.
      // Cheaper than running the full schema DDL up front.
      await rawQuery('ALTER TABLE chapter_versions ADD COLUMN IF NOT EXISTS stats jsonb');
      await rawQuery(`CREATE TABLE IF NOT EXISTS ingested_commits (
        work_id uuid NOT NULL REFERENCES works(id),
        commit_sha text NOT NULL,
        ingested_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (work_id, commit_sha)
      )`);
      await backfillMissingStats(workId);

      const seen = await sql`
        SELECT 1 FROM ingested_commits
        WHERE work_id = ${workId} AND commit_sha = ${commitInfo.sha}
        LIMIT 1
      `;
      if (seen.length > 0) {
        const [latest] = await sql`
          SELECT id FROM document_versions
          WHERE work_id = ${workId}
          ORDER BY deployed_at DESC LIMIT 1
        `;
        return {
          workId,
          documentVersionId: latest?.id as string ?? '',
          chaptersIngested: 0,
          alreadyExists: true,
        };
      }
    }
  } catch (err) {
    // Most likely the schema doesn't exist yet — fall through to full DDL.
    // Log so other failures (transient connection errors etc.) aren't invisible.
    console.warn('[ingest] fast-path skipped, will run full DDL:', err);
  }

  // Ensure schema exists (only runs if fast path didn't return)
  const statements = CREATE_SCHEMA_SQL
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);
  for (const stmt of statements) {
    await rawQuery(stmt);
  }

  // Upsert work
  const [work] = await sql`
    INSERT INTO works (slug, title)
    VALUES (${workSlug}, ${workTitle})
    ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title
    RETURNING id
  `;
  const workId = work.id as string;

  await backfillMissingStats(workId);

  // Load raw markdown only — defer expensive parseChapter (NLP + render) until
  // we know which chapters actually changed.
  const markdownChapters = loadAllMarkdownChapters();

  // Snapshot of latest version: file_path → { rawMarkdown, chapterVersionId, renderedHtml }
  const latestVersions = await sql`
    SELECT cv.id, cv.raw_markdown, cv.rendered_html, c.file_path
    FROM chapter_versions cv
    JOIN chapters c ON c.id = cv.chapter_id
    JOIN document_versions dv ON dv.id = cv.document_version_id
    WHERE c.work_id = ${workId}
      AND dv.id = (SELECT id FROM document_versions WHERE work_id = ${workId} ORDER BY deployed_at DESC LIMIT 1)
  `;
  const prevByFile = new Map(latestVersions.map(r => [r.file_path as string, {
    rawMarkdown: r.raw_markdown as string,
    chapterVersionId: r.id as string,
    renderedHtml: r.rendered_html as string,
  }]));

  const currFiles = new Set(markdownChapters.map(ch => ch.filePath));
  const filesAdded = markdownChapters.some(ch => !prevByFile.has(ch.filePath));
  const filesDeleted = [...prevByFile.keys()].some(fp => !currFiles.has(fp));
  const filesModified = markdownChapters.some(ch => {
    const prev = prevByFile.get(ch.filePath);
    return prev !== undefined && prev.rawMarkdown !== ch.rawMarkdown;
  });

  // No content change — record the commit so we don't redo this next restart.
  if (!filesAdded && !filesDeleted && !filesModified) {
    console.log(`[ingest] skip ${commitInfo.sha.slice(0, 8)} — chapters unchanged`);
    const [latest] = await sql`
      SELECT id FROM document_versions WHERE work_id = ${workId} ORDER BY deployed_at DESC LIMIT 1
    `;
    await sql`
      INSERT INTO ingested_commits (work_id, commit_sha)
      VALUES (${workId}, ${commitInfo.sha})
      ON CONFLICT DO NOTHING
    `;
    return {
      workId,
      documentVersionId: latest?.id as string ?? '',
      chaptersIngested: 0,
      alreadyExists: true,
    };
  }

  // Something changed — create a new document version
  const [docVersion] = await sql`
    INSERT INTO document_versions (work_id, commit_sha, commit_message, commit_author, commit_created_at)
    VALUES (${workId}, ${commitInfo.sha}, ${commitInfo.message}, ${commitInfo.author}, ${commitInfo.createdAt})
    ON CONFLICT (work_id, commit_sha) DO UPDATE SET deployed_at = now()
    RETURNING id
  `;
  const documentVersionId = docVersion.id as string;

  let chaptersIngested = 0;

  for (const raw of markdownChapters) {
    const prev = prevByFile.get(raw.filePath);
    const unchanged = prev !== undefined && prev.rawMarkdown === raw.rawMarkdown;

    // Upsert chapter row (frontmatter title/sortOrder may shift even when body is identical)
    const [chapter] = await sql`
      INSERT INTO chapters (work_id, slug, title, file_path, sort_order)
      VALUES (${workId}, ${raw.slug}, ${raw.title}, ${raw.filePath}, ${raw.sortOrder})
      ON CONFLICT (work_id, file_path) DO UPDATE SET
        slug = EXCLUDED.slug,
        title = EXCLUDED.title,
        sort_order = EXCLUDED.sort_order
      RETURNING id
    `;
    const chapterId = chapter.id as string;

    if (unchanged && prev) {
      // Clone the previous chapter_version (and its lines + author notes) without
      // re-running NLP or markdown rendering. Title comes from the fresh
      // frontmatter — it can change even when the body is byte-identical.
      await cloneUnchangedChapterVersion({
        chapterId,
        documentVersionId,
        prevChapterVersionId: prev.chapterVersionId,
        prevRenderedHtml: prev.renderedHtml,
        title: raw.title,
      });
      chaptersIngested++;
      continue;
    }

    // New or modified — must parse (NLP + render).
    const parsed = parseChapter(raw);

    const [versionCount] = await sql`
      SELECT COUNT(*) as cnt FROM chapter_versions WHERE chapter_id = ${chapterId}
    `;
    const versionNumber = parseInt(versionCount.cnt as string, 10) + 1;

    const statsJson = JSON.stringify(parsed.stats);
    const [chapterVersion] = await sql`
      INSERT INTO chapter_versions (
        chapter_id, document_version_id, version_number, title,
        raw_markdown, rendered_html, line_count, word_count, char_count, stats
      ) VALUES (
        ${chapterId}, ${documentVersionId}, ${versionNumber}, ${parsed.title},
        ${parsed.rawMarkdown}, ${parsed.renderedHtml},
        ${parsed.lineCount}, ${parsed.wordCount}, ${parsed.charCount}, ${statsJson}::jsonb
      )
      ON CONFLICT (chapter_id, document_version_id) DO UPDATE SET
        title = EXCLUDED.title,
        raw_markdown = EXCLUDED.raw_markdown,
        rendered_html = EXCLUDED.rendered_html,
        line_count = EXCLUDED.line_count,
        word_count = EXCLUDED.word_count,
        char_count = EXCLUDED.char_count,
        stats = EXCLUDED.stats
      RETURNING id
    `;
    const chapterVersionId = chapterVersion.id as string;

    await sql`DELETE FROM chapter_version_lines WHERE chapter_version_id = ${chapterVersionId}`;
    if (parsed.lines.length > 0) {
      const versionIds = parsed.lines.map(() => chapterVersionId);
      const lineNumbers = parsed.lines.map(l => l.lineNumber);
      const lineTexts = parsed.lines.map(l => l.lineText);
      const lineHashes = parsed.lines.map(l => l.lineHash);
      const blockTypes = parsed.lines.map(l => l.blockType);
      await sql`
        INSERT INTO chapter_version_lines (chapter_version_id, line_number, line_text, line_hash, block_type)
        SELECT * FROM unnest(
          ${versionIds}::uuid[],
          ${lineNumbers}::int[],
          ${lineTexts}::text[],
          ${lineHashes}::text[],
          ${blockTypes}::text[]
        )
      `;
    }

    if (prev) {
      const newWords = htmlToWords(parsed.renderedHtml);
      const wordMap = buildWordMap(htmlToWords(prev.renderedHtml), newWords);

      await sql`
        INSERT INTO chapter_diffs (
          chapter_version_id, previous_chapter_version_id, word_map
        ) VALUES (
          ${chapterVersionId}, ${prev.chapterVersionId}, ${wordMap}
        )
        ON CONFLICT DO NOTHING
      `;

      await carryOverAuthorNotes({
        prevChapterVersionId: prev.chapterVersionId,
        newChapterVersionId: chapterVersionId,
        newRenderedHtml: parsed.renderedHtml,
        wordMap,
      });
    }

    chaptersIngested++;
  }

  await sql`
    INSERT INTO ingested_commits (work_id, commit_sha)
    VALUES (${workId}, ${commitInfo.sha})
    ON CONFLICT DO NOTHING
  `;

  return { workId, documentVersionId, chaptersIngested, alreadyExists: false };
}

/**
 * Clone a chapter_version into the new document_version when the chapter's
 * raw markdown is byte-identical to the previous version. Skips parseChapter
 * (NLP + markdown render) and copies all derived data via INSERT...SELECT.
 *
 * Author notes get a fresh chapter_version_id but keep their lineage_id, so
 * cross-version tracking stays intact. Linked feedback (comments/reactions/
 * suggested edits/poll responses) also carries over because their anchors are
 * unchanged in identical text.
 */
async function cloneUnchangedChapterVersion(args: {
  chapterId: string;
  documentVersionId: string;
  prevChapterVersionId: string;
  prevRenderedHtml: string;
  title: string;
}) {
  const { chapterId, documentVersionId, prevChapterVersionId, prevRenderedHtml, title } = args;

  const [versionCount] = await sql`
    SELECT COUNT(*) as cnt FROM chapter_versions WHERE chapter_id = ${chapterId}
  `;
  const versionNumber = parseInt(versionCount.cnt as string, 10) + 1;

  const [cv] = await sql`
    INSERT INTO chapter_versions (
      chapter_id, document_version_id, version_number, title,
      raw_markdown, rendered_html, line_count, word_count, char_count, stats
    )
    SELECT chapter_id, ${documentVersionId}, ${versionNumber}, ${title},
           raw_markdown, rendered_html, line_count, word_count, char_count, stats
    FROM chapter_versions WHERE id = ${prevChapterVersionId}
    ON CONFLICT (chapter_id, document_version_id) DO UPDATE SET
      title = EXCLUDED.title,
      raw_markdown = EXCLUDED.raw_markdown,
      rendered_html = EXCLUDED.rendered_html,
      line_count = EXCLUDED.line_count,
      word_count = EXCLUDED.word_count,
      char_count = EXCLUDED.char_count,
      stats = EXCLUDED.stats
    RETURNING id
  `;
  const newChapterVersionId = cv.id as string;

  await sql`DELETE FROM chapter_version_lines WHERE chapter_version_id = ${newChapterVersionId}`;
  await sql`
    INSERT INTO chapter_version_lines (chapter_version_id, line_number, line_text, line_hash, block_type)
    SELECT ${newChapterVersionId}, line_number, line_text, line_hash, block_type
    FROM chapter_version_lines WHERE chapter_version_id = ${prevChapterVersionId}
  `;

  // Identity word map — text didn't change, so word i maps to word i.
  const wordCount = htmlToWords(prevRenderedHtml).length;
  const wordMap = Array.from({ length: wordCount }, (_, i) => i);

  await sql`
    INSERT INTO chapter_diffs (chapter_version_id, previous_chapter_version_id, word_map)
    VALUES (${newChapterVersionId}, ${prevChapterVersionId}, ${wordMap})
    ON CONFLICT DO NOTHING
  `;

  await carryOverAuthorNotes({
    prevChapterVersionId,
    newChapterVersionId,
    newRenderedHtml: prevRenderedHtml,
    wordMap,
  });
}

/**
 * Duplicate author_notes (and any reader feedback/poll responses linked to them)
 * from the previous chapter version to the new one. Word ranges are remapped via
 * the freshly-computed word_map; the lineage_id is preserved so the same
 * conceptual note can be tracked across versions.
 *
 * Linked feedback is *only* copied when it carries an author_note_id — regular
 * version-specific feedback continues to be resolved at read time via the
 * word_map chain in resolveWordRange.ts.
 */
async function carryOverAuthorNotes(args: {
  prevChapterVersionId: string;
  newChapterVersionId: string;
  newRenderedHtml: string;
  wordMap: number[];
}) {
  const { prevChapterVersionId, newChapterVersionId, newRenderedHtml, wordMap } = args;

  const prevNotes = await sql`
    SELECT id, lineage_id, word_start, word_end, body, poll_options, selected_text
    FROM author_notes WHERE chapter_version_id = ${prevChapterVersionId}
  `;
  if (prevNotes.length === 0) return;

  const oldToNewNoteId = new Map<string, string>();

  for (const n of prevNotes) {
    const oldId = n.id as string;
    const lineage = n.lineage_id as string;
    const oldStart = n.word_start as number;
    const oldEnd = n.word_end as number;
    const remapped = mapWordRange(wordMap, oldStart, oldEnd);
    if (!remapped) continue; // anchored words deleted in new version — drop
    const charPos = wordRangeToCharPos(newRenderedHtml, remapped.wordStart, remapped.wordEnd);
    if (!charPos) continue;

    const [inserted] = await sql`
      INSERT INTO author_notes (
        chapter_version_id, lineage_id,
        word_start, word_end, char_start, char_length,
        selected_text, body, poll_options
      ) VALUES (
        ${newChapterVersionId}, ${lineage},
        ${remapped.wordStart}, ${remapped.wordEnd}, ${charPos.charStart}, ${charPos.charLength},
        ${n.selected_text ?? null}, ${n.body}, ${n.poll_options ?? null}
      )
      ON CONFLICT (chapter_version_id, lineage_id) DO UPDATE SET
        word_start = EXCLUDED.word_start,
        word_end = EXCLUDED.word_end,
        char_start = EXCLUDED.char_start,
        char_length = EXCLUDED.char_length,
        body = EXCLUDED.body,
        poll_options = EXCLUDED.poll_options
      RETURNING id
    `;
    oldToNewNoteId.set(oldId, inserted.id as string);
  }

  if (oldToNewNoteId.size === 0) return;

  // Carry forward linked feedback and poll responses for each surviving note.
  for (const [oldNoteId, newNoteId] of oldToNewNoteId) {
    const oldComments = await sql`
      SELECT reader_session_id, reader_profile_id, reader_group_id, reader_invite_id,
             body, selected_text, word_start, word_end
      FROM feedback_comments
      WHERE chapter_version_id = ${prevChapterVersionId} AND author_note_id = ${oldNoteId}
    `;
    for (const c of oldComments) {
      const remap = mapWordRange(wordMap, c.word_start as number, c.word_end as number);
      if (!remap) continue;
      const cp = wordRangeToCharPos(newRenderedHtml, remap.wordStart, remap.wordEnd);
      if (!cp) continue;
      await sql`
        INSERT INTO feedback_comments (
          reader_session_id, chapter_version_id,
          reader_profile_id, reader_group_id, reader_invite_id,
          selected_text, body, char_start, char_length, word_start, word_end,
          author_note_id
        ) VALUES (
          ${c.reader_session_id}, ${newChapterVersionId},
          ${c.reader_profile_id ?? null}, ${c.reader_group_id ?? null}, ${c.reader_invite_id ?? null},
          ${c.selected_text ?? null}, ${c.body}, ${cp.charStart}, ${cp.charLength}, ${remap.wordStart}, ${remap.wordEnd},
          ${newNoteId}
        )
      `;
    }

    const oldReactions = await sql`
      SELECT reader_session_id, reader_profile_id, reader_group_id, reader_invite_id,
             reaction, selected_text, word_start, word_end
      FROM feedback_reactions
      WHERE chapter_version_id = ${prevChapterVersionId} AND author_note_id = ${oldNoteId}
    `;
    for (const r of oldReactions) {
      const remap = mapWordRange(wordMap, r.word_start as number, r.word_end as number);
      if (!remap) continue;
      const cp = wordRangeToCharPos(newRenderedHtml, remap.wordStart, remap.wordEnd);
      if (!cp) continue;
      await sql`
        INSERT INTO feedback_reactions (
          reader_session_id, chapter_version_id,
          reader_profile_id, reader_group_id, reader_invite_id,
          reaction, selected_text, char_start, char_length, word_start, word_end,
          author_note_id
        ) VALUES (
          ${r.reader_session_id}, ${newChapterVersionId},
          ${r.reader_profile_id ?? null}, ${r.reader_group_id ?? null}, ${r.reader_invite_id ?? null},
          ${r.reaction}, ${r.selected_text ?? null}, ${cp.charStart}, ${cp.charLength}, ${remap.wordStart}, ${remap.wordEnd},
          ${newNoteId}
        )
      `;
    }

    const oldEdits = await sql`
      SELECT reader_session_id, reader_profile_id, reader_group_id, reader_invite_id,
             original_text, suggested_text, rationale, word_start, word_end
      FROM suggested_edits
      WHERE chapter_version_id = ${prevChapterVersionId} AND author_note_id = ${oldNoteId}
    `;
    for (const e of oldEdits) {
      const remap = mapWordRange(wordMap, e.word_start as number, e.word_end as number);
      if (!remap) continue;
      const cp = wordRangeToCharPos(newRenderedHtml, remap.wordStart, remap.wordEnd);
      if (!cp) continue;
      await sql`
        INSERT INTO suggested_edits (
          reader_session_id, chapter_version_id,
          reader_profile_id, reader_group_id, reader_invite_id,
          original_text, suggested_text, rationale,
          char_start, char_length, word_start, word_end,
          author_note_id
        ) VALUES (
          ${e.reader_session_id}, ${newChapterVersionId},
          ${e.reader_profile_id ?? null}, ${e.reader_group_id ?? null}, ${e.reader_invite_id ?? null},
          ${e.original_text}, ${e.suggested_text}, ${e.rationale ?? null},
          ${cp.charStart}, ${cp.charLength}, ${remap.wordStart}, ${remap.wordEnd},
          ${newNoteId}
        )
      `;
    }

    await sql`
      INSERT INTO author_note_poll_responses (
        author_note_id, reader_session_id,
        reader_profile_id, reader_group_id, reader_invite_id,
        choice_idx, created_at
      )
      SELECT ${newNoteId}, reader_session_id,
             reader_profile_id, reader_group_id, reader_invite_id,
             choice_idx, created_at
      FROM author_note_poll_responses
      WHERE author_note_id = ${oldNoteId}
      ON CONFLICT (author_note_id, reader_session_id) DO NOTHING
    `;
  }
}

async function backfillMissingStats(workId: string) {
  const rows = await sql`
    SELECT cv.id, cv.raw_markdown
    FROM chapter_versions cv
    JOIN chapters c ON c.id = cv.chapter_id
    WHERE c.work_id = ${workId} AND cv.stats IS NULL
  `;
  if (rows.length === 0) return;
  console.log(`[stats] computing stats for ${rows.length} chapter_versions...`);
  const t0 = Date.now();
  const ids: string[] = [];
  const statsJson: string[] = [];
  for (const r of rows) {
    const stats = computeChapterStats(r.raw_markdown as string);
    ids.push(r.id as string);
    statsJson.push(JSON.stringify(stats));
  }
  // One round-trip: UPDATE all rows by joining against the unnest'd input arrays.
  await sql`
    UPDATE chapter_versions cv
    SET stats = u.stats
    FROM (
      SELECT * FROM unnest(${ids}::uuid[], ${statsJson}::jsonb[]) AS t(id, stats)
    ) u
    WHERE cv.id = u.id
  `;
  console.log(`[stats] backfilled ${rows.length} chapter_versions in ${Date.now() - t0}ms`);
}

// Singleton: one ingest per server process (each Vercel deploy = new process)
let ingestPromise: Promise<IngestResult> | null = null;

export async function ensureIngested(): Promise<IngestResult> {
  if (!ingestPromise) {
    ingestPromise = runIngest().catch(err => {
      ingestPromise = null; // allow retry on error
      throw err;
    });
  }
  return ingestPromise;
}

/** Force a fresh ingest regardless of singleton state (used by /api/ingest endpoint). */
export async function forceIngest(): Promise<IngestResult> {
  ingestPromise = null;
  return ensureIngested();
}
