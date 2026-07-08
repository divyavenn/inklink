'use client';

import { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from 'react';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { useApi, invalidateCache } from '@/lib/useApi';
import { resolveMarginPositions } from '@/lib/marginLayout';
import FeedbackSidebar from './FeedbackSidebar';
import PollOptions, { MAX_POLL_OPTION_CHARS } from './PollOptions';
import {
  PostitDefs,
  PostitVisual,
  PostitTexture,
  PostitContent,
  PostitWrapper,
  pickPostit,
  postitHeightPx,
  POSTIT_CONFIGS,
  type PostitVariant,
} from './Postit';

const DRAFT_ID = '__draft__';
const GOLD = '#b78a26';
const GOLD_BG = 'rgba(183, 138, 38, 0.15)';
const GOLD_BG_STRONG = 'rgba(183, 138, 38, 0.32)';

// Render width of a postit in the margin column; used to estimate its height for
// collision avoidance so stacked notes don't overlap.
const POSTIT_RENDER_WIDTH = 280;

const Layout = styled.div`
  display: flex;
  gap: 1rem;
  width: 100%;
  height: 100%;
  min-height: 0;
`;

const TextColumn = styled.div`
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 0 1rem 4rem 1rem;
  font-family: var(--font-inter), system-ui, sans-serif;
  font-size: 0.95rem;
  line-height: 1.7;
  color: #2a2a26;
  position: relative;

  p { margin-bottom: 1.25rem; }
  hr { border: none; border-top: 1px solid rgba(26,26,24,0.18); margin: 2rem 0; }
  blockquote {
    border-left: 2px solid rgba(26,26,24,0.2);
    padding-left: 1rem;
    margin: 1rem 0;
    color: #6a6a60;
    font-style: italic;
  }

  mark.note-anchor {
    background: ${GOLD_BG};
    padding: 0.1em 0;
    border-radius: 2px;
    cursor: pointer;
    -webkit-box-decoration-break: clone;
    box-decoration-break: clone;
  }
  mark.note-anchor[data-active="true"] {
    background: ${GOLD_BG_STRONG};
  }
  mark.pending-selection {
    background: ${GOLD_BG_STRONG};
    -webkit-box-decoration-break: clone;
    box-decoration-break: clone;
  }
`;

const MarginColumn = styled.div`
  width: 280px;
  flex-shrink: 0;
  position: relative;
`;

const MAX_NOTE_CHARS = 400;

const PostitTextarea = styled.textarea`
  width: 100%;
  height: 100%;
  border: none;
  outline: none;
  background: transparent;
  resize: none;
  font-family: 'Figma Hand', var(--font-caveat), 'Caveat', cursive;
  font-size: 1rem;
  line-height: 1.15;
  color: #3a2e0e;
  padding: 0;

  &::placeholder { color: rgba(58, 46, 14, 0.45); }
`;

const PostitPollEditor = styled.div`
  margin-top: 0.4rem;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
`;

const PollEditorInput = styled.input`
  border: none;
  border-bottom: 1px dashed rgba(58, 46, 14, 0.35);
  background: transparent;
  outline: none;
  font-family: 'Figma Hand', var(--font-caveat), 'Caveat', cursive;
  font-size: 0.95rem;
  color: #3a2e0e;
  padding: 0.05rem 0.2rem;

  &:focus { border-bottom-color: ${GOLD}; }
  &::placeholder { color: rgba(58, 46, 14, 0.4); }
`;

const PostitFooterBtn = styled.button`
  background: transparent;
  border: 1px dashed rgba(58, 46, 14, 0.4);
  color: rgba(58, 46, 14, 0.7);
  border-radius: 3px;
  padding: 0.15rem 0.5rem;
  font-family: 'Figma Hand', var(--font-caveat), 'Caveat', cursive;
  font-size: 0.88rem;
  cursor: pointer;

  &:hover { border-color: ${GOLD}; color: ${GOLD}; }
`;

const CharCountBadge = styled.div<{ $over: boolean }>`
  position: absolute;
  bottom: 1.85rem;
  right: 0.6rem;
  font-family: 'Figma Hand', var(--font-caveat), 'Caveat', cursive;
  font-size: 0.78rem;
  color: ${p => p.$over ? '#b34a4a' : 'rgba(58, 46, 14, 0.45)'};
  pointer-events: none;
`;

const PostitFooter = styled.div<{ $variant: PostitVariant }>`
  position: absolute;
  left: 0;
  right: 0;
  /* Centered, lifted above the paper's bottom edge — the SVG shadow margin below
     the paper varies per variant, so the inset is computed from paperBox. */
  bottom: ${p => {
    const c = POSTIT_CONFIGS[p.$variant];
    const shadowBelowPct = ((c.vb[1] - (c.paperBox.y + c.paperBox.h)) / c.vb[1]) * 100;
    return `calc(${shadowBelowPct}% + 0.5rem)`;
  }};
  display: flex;
  justify-content: center;
  align-items: center;
  pointer-events: auto;
`;

const PostitDeleteBtn = styled.button<{ $variant: PostitVariant }>`
  position: absolute;
  top: 0.4rem;
  /* Anchor to the paper's top-right corner, not the wrapper box — the paper
     doesn't fill the wrapper (the shadow margin varies per variant), so a fixed
     inset would land the × in the shadow / half off the note. */
  right: ${p => {
    const c = POSTIT_CONFIGS[p.$variant];
    const shadowInsetPct = ((c.vb[0] - (c.paperBox.x + c.paperBox.w)) / c.vb[0]) * 100;
    return `calc(${shadowInsetPct}% + 0.3rem)`;
  }};
  background: transparent;
  border: none;
  color: rgba(58, 46, 14, 0.45);
  cursor: pointer;
  font-size: 0.85rem;
  padding: 0.1rem 0.35rem;
  z-index: 5;

  &:hover { color: rgba(58, 46, 14, 0.85); }
`;


interface AuthorNote {
  id: string;
  lineageId: string;
  wordStart: number;
  wordEnd: number;
  charStart: number;
  charLength: number;
  selectedText: string;
  body: string;
  pollOptions: string[] | null;
  pollTallies: number[] | null;
  commentCount: number;
  reactions: { like: number; dislike: number };
  suggestionCount: number;
  createdAt: string;
}

interface NoteResponses {
  comments: { id: string; body: string; selected_text: string | null; created_at: string; profile_name: string | null; anonymous_id: string }[];
  reactions: { id: string; reaction: string; selected_text: string | null; created_at: string; profile_name: string | null; anonymous_id: string }[];
  suggestions: { id: string; original_text: string; suggested_text: string; rationale: string | null; created_at: string; profile_name: string | null; anonymous_id: string }[];
  pollVotes: { choice_idx: number; updated_at: string; profile_name: string | null; anonymous_id: string }[];
}

interface AuthorNotesViewProps {
  chapterHtml: string;
  chapterVersionId: string;
  /** New notes can only be created on the latest version. */
  isLatestVersion?: boolean;
}

interface DraftNote {
  charStart: number;
  charLength: number;
  selectedText: string;
  body: string;
  pollOptions: string[] | null;
}

export default function AuthorNotesView({ chapterHtml, chapterVersionId, isLatestVersion = true }: AuthorNotesViewProps) {
  const textRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<HTMLDivElement>(null);
  const marginRef = useRef<HTMLDivElement>(null);
  const draftElRef = useRef<HTMLDivElement>(null);
  const notesUrl = chapterVersionId ? `/api/dashboard/author-notes?chapterVersionId=${chapterVersionId}` : null;
  const { data: notesData, mutate: mutateNotes } = useApi<{ notes: AuthorNote[] }>(notesUrl);
  const notes = notesData?.notes ?? [];

  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftNote | null>(null);
  const [noteAnchorYs, setNoteAnchorYs] = useState<Record<string, number>>({});
  const [noteSides, setNoteSides] = useState<Record<string, 'left' | 'right'>>({});
  const [draftAnchorY, setDraftAnchorY] = useState<number | null>(null);
  const [draftSide, setDraftSide] = useState<'left' | 'right'>('right');

  const sideOf = (id: string): 'left' | 'right' => noteSides[id] ?? 'right';

  // Resolve final postit tops from their anchor Ys, nudging overlapping notes
  // apart so stacked notes in the margin don't collide. Collisions resolve per
  // side — a left-margin note never pushes a right-margin note.
  const resolvedNoteTops = useMemo(() => {
    const itemsFor = (side: 'left' | 'right') => {
      const items = notes
        .filter(n => noteAnchorYs[n.id] !== undefined && sideOf(n.id) === side)
        .map(n => ({
          id: n.id,
          anchorY: noteAnchorYs[n.id],
          // Account for poll bars rendered on the note so stacked notes don't overlap.
          heightPx: postitHeightPx(pickPostit(n.id), POSTIT_RENDER_WIDTH)
            + (n.pollOptions ? (n.pollOptions.length === 4 ? 2 : n.pollOptions.length) * 30 + 10 : 0),
        }));
      // Place the in-progress draft through the same pass, so it sits at its final
      // (collision-resolved) spot immediately — no jump when it becomes a saved note.
      if (draft && draftAnchorY !== null && draftSide === side) {
        const v = pickPostit(draft.charStart + ':' + draft.charLength);
        items.push({ id: DRAFT_ID, anchorY: draftAnchorY, heightPx: postitHeightPx(v, POSTIT_RENDER_WIDTH) });
      }
      return items;
    };
    return new Map([
      ...resolveMarginPositions(itemsFor('left')),
      ...resolveMarginPositions(itemsFor('right')),
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, noteAnchorYs, noteSides, draft, draftAnchorY, draftSide]);

  const responsesUrl = activeNoteId ? `/api/dashboard/author-notes/${activeNoteId}/responses` : null;
  const { data: responsesData } = useApi<NoteResponses>(responsesUrl);

  // Compose the highlighted HTML: existing notes get note-anchor marks; the draft range
  // gets a pending-selection mark so the author still sees what they selected.
  const html = useMemo(() => {
    if (typeof window === 'undefined' || !chapterHtml) return chapterHtml;
    const div = document.createElement('div');
    div.innerHTML = chapterHtml;

    type Range = { start: number; len: number; factory: () => HTMLElement };
    const ranges: Range[] = [];
    for (const note of notes) {
      ranges.push({
        start: note.charStart,
        len: note.charLength,
        factory: () => {
          const m = document.createElement('mark');
          m.className = 'note-anchor';
          m.dataset.noteId = note.id;
          if (note.id === activeNoteId) m.dataset.active = 'true';
          return m;
        },
      });
    }
    if (draft) {
      ranges.push({
        start: draft.charStart,
        len: draft.charLength,
        factory: () => {
          const m = document.createElement('mark');
          m.className = 'pending-selection';
          m.dataset.draft = 'true';
          return m;
        },
      });
    }
    ranges.sort((a, b) => a.start - b.start);
    for (const r of ranges) wrapRange(div, r.start, r.len, r.factory);
    return div.innerHTML;
  }, [chapterHtml, notes, activeNoteId, draft]);

  // Set innerHTML AND compute postit anchor positions in the same layout effect so
  // the marks exist in the DOM before we measure them.
  useLayoutEffect(() => {
    const text = textRef.current;
    if (!text) return;
    text.innerHTML = html;
    const margin = marginRef.current;
    if (!margin) return;
    const marginRect = margin.getBoundingClientRect();
    const textRect = text.getBoundingClientRect();
    const colCenter = (textRect.left + textRect.right) / 2;
    const positions: Record<string, number> = {};
    const sides: Record<string, 'left' | 'right'> = {};
    for (const note of notes) {
      const m = text.querySelector(`mark.note-anchor[data-note-id="${note.id}"]`) as HTMLElement | null;
      if (m) {
        const r = m.getBoundingClientRect();
        positions[note.id] = r.top - marginRect.top;
        // Anchor each note to the closer margin so notes spread across both sides.
        sides[note.id] = (r.left + r.right) / 2 < colCenter ? 'left' : 'right';
      }
    }
    setNoteAnchorYs(prev => {
      const prevKeys = Object.keys(prev);
      const newKeys = Object.keys(positions);
      if (prevKeys.length === newKeys.length && newKeys.every(k => prev[k] === positions[k])) return prev;
      return positions;
    });
    setNoteSides(prev => {
      const prevKeys = Object.keys(prev);
      const newKeys = Object.keys(sides);
      if (prevKeys.length === newKeys.length && newKeys.every(k => prev[k] === sides[k])) return prev;
      return sides;
    });
    if (draft) {
      const m = text.querySelector('mark.pending-selection[data-draft="true"]') as HTMLElement | null;
      const r = m?.getBoundingClientRect() ?? null;
      const y = r ? r.top - marginRect.top : null;
      setDraftAnchorY(prev => prev === y ? prev : y);
      if (r) setDraftSide((r.left + r.right) / 2 < colCenter ? 'left' : 'right');
    } else {
      setDraftAnchorY(prev => prev === null ? prev : null);
    }
  }, [html, notes, draft]);

  // Click on a note anchor → activate it.
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    const onClick = (e: MouseEvent) => {
      const m = (e.target as HTMLElement)?.closest('mark.note-anchor') as HTMLElement | null;
      if (m?.dataset.noteId) setActiveNoteId(m.dataset.noteId);
    };
    el.addEventListener('click', onClick);
    return () => el.removeEventListener('click', onClick);
  }, [html]);

  // Selecting text in the chapter spawns a draft postit anchored to that range.
  // Only on the latest version — older versions are read-only for note creation.
  const isLatestRef = useRef(isLatestVersion);
  isLatestRef.current = isLatestVersion;
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    const onMouseUp = () => {
      if (!isLatestRef.current) return;
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) return;
      const range = sel.getRangeAt(0);
      if (!el.contains(range.commonAncestorContainer)) return;
      const text = sel.toString().trim();
      if (text.length < 1) return;
      const charStart = getCharOffset(el, range.startContainer, range.startOffset);
      const charEnd = getCharOffset(el, range.endContainer, range.endOffset);
      const start = Math.min(charStart, charEnd);
      const length = Math.abs(charEnd - charStart);
      if (length === 0) return;
      sel.removeAllRanges();
      setActiveNoteId(null);
      setDraft({ charStart: start, charLength: length, selectedText: text, body: '', pollOptions: null });
    };
    document.addEventListener('mouseup', onMouseUp);
    return () => document.removeEventListener('mouseup', onMouseUp);
  }, []);

  const submitDraft = useCallback(async () => {
    if (!draft || !draft.body.trim()) return;
    // Drop an incomplete poll silently (auto-save shouldn't nag): a poll needs
    // ≥2 filled options to count, capped at 4.
    const filled = draft.pollOptions
      ? draft.pollOptions.map(o => o.trim()).filter(o => o.length > 0)
      : [];
    const optsClean = filled.length >= 2 ? filled.slice(0, 4) : null;
    const res = await fetch('/api/dashboard/author-notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chapterVersionId,
        body: draft.body,
        selectedText: draft.selectedText,
        // Send the exact selection offsets so the note anchors to the instance
        // the author highlighted, not the first text match in the chapter.
        charStart: draft.charStart,
        charLength: draft.charLength,
        pollOptions: optsClean,
      }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? 'Failed to create note');
      return;
    }
    setDraft(null);
    if (notesUrl) {
      invalidateCache(notesUrl);
      const j = await fetch(notesUrl).then(r => r.json());
      mutateNotes(j);
    }
  }, [draft, chapterVersionId, notesUrl, mutateNotes]);

  // Auto-save the draft when the author clicks anywhere outside it (or selects new
  // text). Empty drafts are discarded; the × button / Escape cancel explicitly.
  useEffect(() => {
    if (!draft) return;
    const onDown = (e: MouseEvent) => {
      if (draftElRef.current && draftElRef.current.contains(e.target as Node)) return;
      if (draft.body.trim()) submitDraft();
      else setDraft(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [draft, submitDraft]);

  const deleteNote = useCallback(async (id: string) => {
    if (!confirm('Delete this note? Reader responses on this version will also be removed.')) return;
    await fetch(`/api/dashboard/author-notes?id=${id}`, { method: 'DELETE' });
    if (activeNoteId === id) setActiveNoteId(null);
    if (notesUrl) {
      invalidateCache(notesUrl);
      const j = await fetch(notesUrl).then(r => r.json());
      mutateNotes(j);
    }
  }, [activeNoteId, notesUrl, mutateNotes]);

  const renderPostit = (note: AuthorNote) => {
    const top = resolvedNoteTops.get(note.id);
    if (top === undefined) return null;
    const variant = pickPostit(note.id);
    return (
      <PostitWrapper
        key={note.id}
        $variant={variant}
        $active={note.id === activeNoteId}
        style={{ top }}
        onClick={() => setActiveNoteId(prev => prev === note.id ? null : note.id)}
      >
        <PostitVisual variant={variant} />
        <PostitTexture $variant={variant} />
        <PostitContent $variant={variant}>
          <div style={{ fontSize: '0.95rem' }}>{note.body}</div>
          {note.pollOptions && note.pollOptions.length > 0 && (
            <PollOptions
              options={note.pollOptions}
              seed={note.id}
              tallies={note.pollTallies ?? note.pollOptions.map(() => 0)}
            />
          )}
        </PostitContent>
        <PostitDeleteBtn
          $variant={variant}
          onClick={e => { e.stopPropagation(); deleteNote(note.id); }}
          title="Delete note"
        >
          ×
        </PostitDeleteBtn>
      </PostitWrapper>
    );
  };

  // Single poll control: first click adds 2 options, each further click adds one,
  // and it hides once there are 4. Filling the options is up to the author.
  const addPollOption = () => setDraft(d => {
    if (!d) return d;
    if (!d.pollOptions) return { ...d, pollOptions: ['', ''] };
    if (d.pollOptions.length < 4) return { ...d, pollOptions: [...d.pollOptions, ''] };
    return d;
  });

  // Draft postit: appears at the freshly-selected text and lets the author write
  // inline. Saves on click-away; the × cancels.
  const renderDraft = () => {
    if (!draft || draftAnchorY === null) return null;
    const variant = pickPostit(draft.charStart + ':' + draft.charLength);
    const c = POSTIT_CONFIGS[variant];
    const innerStyle = { paddingBottom: '1.6rem' as const };
    const pollCount = draft.pollOptions?.length ?? 0;
    return (
      <AnimatePresence>
        <motion.div
          key="draft"
          ref={draftElRef}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18 }}
          style={{
            position: 'absolute',
            left: 0,
            width: '100%',
            top: resolvedNoteTops.get(DRAFT_ID) ?? draftAnchorY,
            aspectRatio: `${c.vb[0]} / ${c.vb[1]}`,
            isolation: 'isolate' as const,
          }}
        >
          <PostitVisual variant={variant} />
          <PostitTexture $variant={variant} />
          <PostitContent $variant={variant} style={innerStyle}>
            <PostitTextarea
              autoFocus
              placeholder="Write your note…"
              maxLength={MAX_NOTE_CHARS}
              value={draft.body}
              onChange={e => setDraft(d => d ? { ...d, body: e.target.value.slice(0, MAX_NOTE_CHARS) } : d)}
              onKeyDown={e => {
                if (e.key === 'Escape') setDraft(null);
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitDraft();
              }}
            />
            <CharCountBadge $over={draft.body.length >= MAX_NOTE_CHARS}>
              {draft.body.length}/{MAX_NOTE_CHARS}
            </CharCountBadge>
            {draft.pollOptions && (
              <PostitPollEditor onClick={e => e.stopPropagation()}>
                {draft.pollOptions.map((opt, i) => (
                  <PollEditorInput
                    key={i}
                    placeholder={`Option ${i + 1}`}
                    value={opt}
                    maxLength={MAX_POLL_OPTION_CHARS}
                    onChange={e => setDraft(d => {
                      if (!d?.pollOptions) return d;
                      const next = [...d.pollOptions];
                      next[i] = e.target.value.slice(0, MAX_POLL_OPTION_CHARS);
                      return { ...d, pollOptions: next };
                    })}
                  />
                ))}
              </PostitPollEditor>
            )}
          </PostitContent>
          {pollCount < 4 && (
            <PostitFooter $variant={variant}>
              <PostitFooterBtn onClick={addPollOption}>
                {pollCount === 0 ? 'poll' : '+ option'}
              </PostitFooterBtn>
            </PostitFooter>
          )}
          <PostitDeleteBtn $variant={variant} onClick={() => setDraft(null)} title="Cancel">
            ×
          </PostitDeleteBtn>
        </motion.div>
      </AnimatePresence>
    );
  };

  const leftNotes = notes.filter(n => sideOf(n.id) === 'left');
  const rightNotes = notes.filter(n => sideOf(n.id) === 'right');
  const activeSide = activeNoteId ? sideOf(activeNoteId) : null;

  // When a note is selected, the Comments & Edits panel for that note fills the
  // OPPOSITE margin (full height), sliding in.
  const renderNoteSidebar = (margin: 'left' | 'right') => {
    if (!activeNoteId || activeSide === margin) return null;
    return (
      <div style={{ position: 'sticky', top: '1rem', height: 'calc(100vh - 2rem)', zIndex: 20 }}>
        <FeedbackSidebar side={margin} responses={responsesData ?? null} onClose={() => setActiveNoteId(null)} />
      </div>
    );
  };

  return (
    <Layout ref={layoutRef}>
      <PostitDefs />
      {/* Left margin — left-anchored notes, plus the feedback sidebar for a
          selected right-anchored note */}
      <MarginColumn>
        {leftNotes.map(renderPostit)}
        {renderNoteSidebar('left')}
        {draftSide === 'left' && renderDraft()}
      </MarginColumn>
      <TextColumn ref={textRef} />
      {/* Right margin — right-anchored notes, plus the feedback sidebar for a
          selected left-anchored note */}
      <MarginColumn ref={marginRef}>
        {rightNotes.map(renderPostit)}
        {renderNoteSidebar('right')}
        {draftSide === 'right' && renderDraft()}
      </MarginColumn>
    </Layout>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Walk text nodes inside `container` and return the char offset of (target, offset). */
function getCharOffset(container: Node, targetNode: Node, targetOffset: number): number {
  let pos = 0;
  const walk = (cur: Node): boolean => {
    if (cur === targetNode) {
      pos += targetOffset;
      return true;
    }
    if (cur.nodeType === Node.TEXT_NODE) {
      pos += (cur as Text).data.length;
      return false;
    }
    for (let c = cur.firstChild; c; c = c.nextSibling) {
      if (walk(c)) return true;
    }
    return false;
  };
  walk(container);
  return pos;
}

/** Wrap a [charStart, charStart+charLength) range with `factory()`. */
function wrapRange(
  container: HTMLElement,
  charStart: number,
  charLength: number,
  factory: () => HTMLElement,
) {
  const charEnd = charStart + charLength;
  let pos = 0;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const splits: { node: Text; start: number; end: number }[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const t = node as Text;
    const len = t.data.length;
    if (pos + len <= charStart) {
      pos += len;
      continue;
    }
    if (pos >= charEnd) break;
    const start = Math.max(0, charStart - pos);
    const end = Math.min(len, charEnd - pos);
    splits.push({ node: t, start, end });
    pos += len;
  }

  for (const { node, start, end } of splits) {
    const before = node.data.slice(0, start);
    const middle = node.data.slice(start, end);
    const after = node.data.slice(end);
    const wrapper = factory();
    wrapper.textContent = middle;
    const parent = node.parentNode;
    if (!parent) continue;
    if (before) parent.insertBefore(document.createTextNode(before), node);
    parent.insertBefore(wrapper, node);
    if (after) parent.insertBefore(document.createTextNode(after), node);
    parent.removeChild(node);
  }
}
