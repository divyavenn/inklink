export const CREATE_SCHEMA_SQL = `
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS works (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  description text,
  repo_owner text,
  repo_name text,
  default_branch text NOT NULL DEFAULT 'main',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chapters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id uuid NOT NULL REFERENCES works(id),
  slug text NOT NULL,
  title text NOT NULL,
  file_path text NOT NULL,
  sort_order int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (work_id, file_path)
);

CREATE TABLE IF NOT EXISTS document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id uuid NOT NULL REFERENCES works(id),
  commit_sha text NOT NULL,
  commit_message text,
  commit_author text,
  commit_created_at timestamptz,
  deployed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (work_id, commit_sha)
);

CREATE INDEX IF NOT EXISTS idx_document_versions_deployed ON document_versions(deployed_at DESC);

CREATE TABLE IF NOT EXISTS chapter_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id uuid NOT NULL REFERENCES chapters(id),
  document_version_id uuid NOT NULL REFERENCES document_versions(id),
  version_number int NOT NULL,
  title text NOT NULL,
  raw_markdown text NOT NULL,
  rendered_html text NOT NULL,
  line_count int NOT NULL,
  word_count int NOT NULL,
  char_count int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chapter_id, document_version_id)
);

CREATE TABLE IF NOT EXISTS chapter_version_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_version_id uuid NOT NULL REFERENCES chapter_versions(id),
  line_number int NOT NULL,
  line_text text NOT NULL,
  line_hash text NOT NULL,
  block_type text
);

CREATE INDEX IF NOT EXISTS idx_cvl_version_line ON chapter_version_lines(chapter_version_id, line_number);
CREATE INDEX IF NOT EXISTS idx_cvl_version_hash ON chapter_version_lines(chapter_version_id, line_hash);

CREATE TABLE IF NOT EXISTS chapter_diffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_version_id uuid NOT NULL REFERENCES chapter_versions(id),
  previous_chapter_version_id uuid REFERENCES chapter_versions(id),
  word_map int[]
);

ALTER TABLE chapter_diffs DROP COLUMN IF EXISTS added_lines;
ALTER TABLE chapter_diffs DROP COLUMN IF EXISTS removed_lines;
ALTER TABLE chapter_diffs DROP COLUMN IF EXISTS changed_lines;
ALTER TABLE chapter_diffs DROP COLUMN IF EXISTS diff_json;

CREATE TABLE IF NOT EXISTS reader_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id uuid NOT NULL REFERENCES works(id),
  slug text NOT NULL,
  display_name text NOT NULL,
  email text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (work_id, slug)
);

CREATE TABLE IF NOT EXISTS reader_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id uuid NOT NULL REFERENCES works(id),
  slug text NOT NULL,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (work_id, slug)
);

CREATE TABLE IF NOT EXISTS reader_group_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reader_profile_id uuid NOT NULL REFERENCES reader_profiles(id),
  reader_group_id uuid NOT NULL REFERENCES reader_groups(id),
  UNIQUE (reader_profile_id, reader_group_id)
);

CREATE TABLE IF NOT EXISTS reader_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id uuid NOT NULL REFERENCES works(id),
  token text NOT NULL UNIQUE,
  reader_profile_id uuid REFERENCES reader_profiles(id),
  reader_group_id uuid REFERENCES reader_groups(id),
  label text,
  is_active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reader_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id uuid NOT NULL REFERENCES works(id),
  anonymous_id text NOT NULL,
  reader_profile_id uuid REFERENCES reader_profiles(id),
  reader_group_id uuid REFERENCES reader_groups(id),
  reader_invite_id uuid REFERENCES reader_invites(id),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  user_agent text,
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text
);

CREATE INDEX IF NOT EXISTS idx_reader_sessions_anon ON reader_sessions(work_id, anonymous_id);

CREATE TABLE IF NOT EXISTS chapter_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reader_session_id uuid NOT NULL REFERENCES reader_sessions(id),
  chapter_version_id uuid NOT NULL REFERENCES chapter_versions(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  last_active_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  max_line_seen int NOT NULL DEFAULT 0,
  max_scroll_percent numeric(5,2) NOT NULL DEFAULT 0,
  active_seconds int NOT NULL DEFAULT 0,
  completion_percent numeric(5,2) NOT NULL DEFAULT 0,
  UNIQUE (reader_session_id, chapter_version_id)
);

CREATE TABLE IF NOT EXISTS event_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reader_session_id uuid REFERENCES reader_sessions(id),
  work_id uuid NOT NULL REFERENCES works(id),
  chapter_version_id uuid REFERENCES chapter_versions(id),
  reader_profile_id uuid REFERENCES reader_profiles(id),
  reader_group_id uuid REFERENCES reader_groups(id),
  reader_invite_id uuid REFERENCES reader_invites(id),
  event_type text NOT NULL,
  event_time timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_event_log_session ON event_log(reader_session_id);
CREATE INDEX IF NOT EXISTS idx_event_log_chapter_version ON event_log(chapter_version_id);

CREATE TABLE IF NOT EXISTS feedback_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reader_session_id uuid NOT NULL REFERENCES reader_sessions(id),
  chapter_version_id uuid NOT NULL REFERENCES chapter_versions(id),
  reader_profile_id uuid REFERENCES reader_profiles(id),
  reader_group_id uuid REFERENCES reader_groups(id),
  reader_invite_id uuid REFERENCES reader_invites(id),
  start_line int,
  end_line int,
  word_start int,
  word_end int,
  char_start int,
  char_length int,
  selected_text text,
  reaction text NOT NULL CHECK (reaction IN ('like', 'dislike')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reactions_chapter_version ON feedback_reactions(chapter_version_id);
CREATE INDEX IF NOT EXISTS idx_reactions_session_version ON feedback_reactions(reader_session_id, chapter_version_id);

CREATE TABLE IF NOT EXISTS feedback_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reader_session_id uuid NOT NULL REFERENCES reader_sessions(id),
  chapter_version_id uuid NOT NULL REFERENCES chapter_versions(id),
  reader_profile_id uuid REFERENCES reader_profiles(id),
  reader_group_id uuid REFERENCES reader_groups(id),
  reader_invite_id uuid REFERENCES reader_invites(id),
  selected_text text,
  body text NOT NULL,
  char_start int,
  char_length int,
  word_start int,
  word_end int,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comments_chapter_version ON feedback_comments(chapter_version_id);
CREATE INDEX IF NOT EXISTS idx_comments_session_version ON feedback_comments(reader_session_id, chapter_version_id);

CREATE TABLE IF NOT EXISTS suggested_edits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reader_session_id uuid NOT NULL REFERENCES reader_sessions(id),
  chapter_version_id uuid NOT NULL REFERENCES chapter_versions(id),
  reader_profile_id uuid REFERENCES reader_profiles(id),
  reader_group_id uuid REFERENCES reader_groups(id),
  reader_invite_id uuid REFERENCES reader_invites(id),
  original_text text NOT NULL,
  suggested_text text NOT NULL,
  rationale text,
  char_start int,
  char_length int,
  word_start int,
  word_end int,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_suggested_edits_chapter_version ON suggested_edits(chapter_version_id);
CREATE INDEX IF NOT EXISTS idx_suggested_edits_session_version ON suggested_edits(reader_session_id, chapter_version_id);

-- Drop deprecated line-number columns from feedback tables (word/char anchoring replaces them)
ALTER TABLE feedback_comments DROP COLUMN IF EXISTS start_line;
ALTER TABLE feedback_comments DROP COLUMN IF EXISTS end_line;
ALTER TABLE suggested_edits DROP COLUMN IF EXISTS start_line;
ALTER TABLE suggested_edits DROP COLUMN IF EXISTS end_line;

-- Add word/char anchor columns to feedback_reactions (reactions now word-anchored)
ALTER TABLE feedback_reactions ADD COLUMN IF NOT EXISTS word_start int;
ALTER TABLE feedback_reactions ADD COLUMN IF NOT EXISTS word_end int;
ALTER TABLE feedback_reactions ADD COLUMN IF NOT EXISTS char_start int;
ALTER TABLE feedback_reactions ADD COLUMN IF NOT EXISTS char_length int;
ALTER TABLE feedback_reactions ADD COLUMN IF NOT EXISTS selected_text text;
ALTER TABLE feedback_reactions ALTER COLUMN start_line DROP NOT NULL;
ALTER TABLE feedback_reactions ALTER COLUMN end_line DROP NOT NULL;

CREATE TABLE IF NOT EXISTS interest_signups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id uuid NOT NULL REFERENCES works(id),
  reader_session_id uuid REFERENCES reader_sessions(id),
  reader_profile_id uuid REFERENCES reader_profiles(id),
  reader_group_id uuid REFERENCES reader_groups(id),
  reader_invite_id uuid REFERENCES reader_invites(id),
  chapter_version_id uuid REFERENCES chapter_versions(id),
  email text NOT NULL,
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (work_id, email)
);

CREATE TABLE IF NOT EXISTS author_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_version_id uuid NOT NULL REFERENCES chapter_versions(id),
  lineage_id uuid NOT NULL DEFAULT gen_random_uuid(),
  word_start int NOT NULL,
  word_end int NOT NULL,
  char_start int NOT NULL,
  char_length int NOT NULL,
  selected_text text,
  body text NOT NULL,
  poll_options jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chapter_version_id, lineage_id)
);

CREATE INDEX IF NOT EXISTS idx_author_notes_chapter_version ON author_notes(chapter_version_id);
CREATE INDEX IF NOT EXISTS idx_author_notes_lineage ON author_notes(lineage_id);

CREATE TABLE IF NOT EXISTS author_note_poll_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_note_id uuid NOT NULL REFERENCES author_notes(id) ON DELETE CASCADE,
  reader_session_id uuid NOT NULL REFERENCES reader_sessions(id),
  reader_profile_id uuid REFERENCES reader_profiles(id),
  reader_group_id uuid REFERENCES reader_groups(id),
  reader_invite_id uuid REFERENCES reader_invites(id),
  choice_idx int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (author_note_id, reader_session_id)
);

CREATE INDEX IF NOT EXISTS idx_anpr_note ON author_note_poll_responses(author_note_id);
CREATE INDEX IF NOT EXISTS idx_anpr_session_note ON author_note_poll_responses(reader_session_id, author_note_id);

ALTER TABLE feedback_comments ADD COLUMN IF NOT EXISTS author_note_id uuid REFERENCES author_notes(id) ON DELETE SET NULL;
ALTER TABLE feedback_reactions ADD COLUMN IF NOT EXISTS author_note_id uuid REFERENCES author_notes(id) ON DELETE SET NULL;
ALTER TABLE suggested_edits ADD COLUMN IF NOT EXISTS author_note_id uuid REFERENCES author_notes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_comments_author_note ON feedback_comments(author_note_id);
CREATE INDEX IF NOT EXISTS idx_reactions_author_note ON feedback_reactions(author_note_id);
CREATE INDEX IF NOT EXISTS idx_suggested_edits_author_note ON suggested_edits(author_note_id);

-- Feedback anchored to an embedded image/video asset (reader clicked the asset
-- instead of highlighting text). NULL for ordinary text-anchored feedback.
ALTER TABLE feedback_comments ADD COLUMN IF NOT EXISTS asset_id text;
ALTER TABLE feedback_reactions ADD COLUMN IF NOT EXISTS asset_id text;
ALTER TABLE suggested_edits ADD COLUMN IF NOT EXISTS asset_id text;

ALTER TABLE chapter_versions ADD COLUMN IF NOT EXISTS stats jsonb;

-- Marker table so code-only commits (no chapter change) don't keep retriggering
-- the full ingest on every server restart. Inserted whenever runIngest sees a
-- commit, regardless of whether chapter text changed.
CREATE TABLE IF NOT EXISTS ingested_commits (
  work_id uuid NOT NULL REFERENCES works(id),
  commit_sha text NOT NULL,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (work_id, commit_sha)
)
`;
