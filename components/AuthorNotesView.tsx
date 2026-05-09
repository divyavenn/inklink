'use client';

import { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from 'react';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { useApi, invalidateCache } from '@/lib/useApi';
import {
  PostitDefs,
  PostitVisual,
  PostitTexture,
  PostitContent,
  PostitWrapper,
  pickPostit,
  postitHeightPx,
  POSTIT_CONFIGS,
} from './Postit';

const GOLD = '#b78a26';
const GOLD_BG = 'rgba(183, 138, 38, 0.15)';
const GOLD_BG_STRONG = 'rgba(183, 138, 38, 0.32)';

const PIE_COLORS = ['#b78a26', '#7d6cab', '#3e8e7e', '#c5605d'];

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
  margin-right: 0.3rem;

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

const PostitFooter = styled.div`
  position: absolute;
  bottom: 0.45rem;
  left: 8%;
  right: 8%;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  pointer-events: auto;
`;

const PostitDeleteBtn = styled.button`
  position: absolute;
  top: 0.4rem;
  right: 0.5rem;
  background: transparent;
  border: none;
  color: rgba(58, 46, 14, 0.45);
  cursor: pointer;
  font-size: 0.85rem;
  padding: 0.1rem 0.35rem;
  z-index: 5;

  &:hover { color: rgba(58, 46, 14, 0.85); }
`;

const ResponseBlock = styled.div`
  position: absolute;
  left: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  font-family: var(--font-inter), system-ui, sans-serif;
`;

const ResponseSection = styled.div`
  font-size: 0.78rem;
  color: rgba(26,26,24,0.7);
`;

const ResponseSectionLabel = styled.div`
  font-size: 0.65rem;
  font-weight: 500;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(26,26,24,0.45);
  margin-bottom: 0.3rem;
`;

const ResponseRow = styled.div`
  font-size: 0.78rem;
  padding: 0.35rem 0.5rem;
  background: rgba(26,26,24,0.04);
  border-radius: 3px;
  line-height: 1.4;
  margin-bottom: 0.25rem;
`;

const PieWrap = styled.div`
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0.4rem 0;
`;

const PieLegend = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  font-size: 0.75rem;
`;

const Swatch = styled.span<{ $color: string }>`
  width: 8px;
  height: 8px;
  border-radius: 2px;
  background: ${p => p.$color};
  display: inline-block;
  margin-right: 0.4rem;
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
}

interface DraftNote {
  charStart: number;
  charLength: number;
  selectedText: string;
  body: string;
  pollOptions: string[] | null;
}

export default function AuthorNotesView({ chapterHtml, chapterVersionId }: AuthorNotesViewProps) {
  const textRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<HTMLDivElement>(null);
  const marginRef = useRef<HTMLDivElement>(null);
  const notesUrl = chapterVersionId ? `/api/dashboard/author-notes?chapterVersionId=${chapterVersionId}` : null;
  const { data: notesData, mutate: mutateNotes } = useApi<{ notes: AuthorNote[] }>(notesUrl);
  const notes = notesData?.notes ?? [];

  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftNote | null>(null);
  const [noteAnchorYs, setNoteAnchorYs] = useState<Record<string, number>>({});
  const [draftAnchorY, setDraftAnchorY] = useState<number | null>(null);

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
    const positions: Record<string, number> = {};
    for (const note of notes) {
      const m = text.querySelector(`mark.note-anchor[data-note-id="${note.id}"]`) as HTMLElement | null;
      if (m) positions[note.id] = m.getBoundingClientRect().top - marginRect.top;
    }
    setNoteAnchorYs(prev => {
      const prevKeys = Object.keys(prev);
      const newKeys = Object.keys(positions);
      if (prevKeys.length === newKeys.length && newKeys.every(k => prev[k] === positions[k])) return prev;
      return positions;
    });
    if (draft) {
      const m = text.querySelector('mark.pending-selection[data-draft="true"]') as HTMLElement | null;
      const y = m ? m.getBoundingClientRect().top - marginRect.top : null;
      setDraftAnchorY(prev => prev === y ? prev : y);
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
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    const onMouseUp = () => {
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
    const optsClean = draft.pollOptions
      ? draft.pollOptions.map(o => o.trim()).filter(o => o.length > 0)
      : null;
    if (optsClean && (optsClean.length < 2 || optsClean.length > 4)) {
      alert('Polls need 2 to 4 options.');
      return;
    }
    const res = await fetch('/api/dashboard/author-notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chapterVersionId,
        body: draft.body,
        selectedText: draft.selectedText,
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

  return (
    <Layout ref={layoutRef}>
      <PostitDefs />
      <TextColumn ref={textRef} />
      <MarginColumn ref={marginRef}>
        {/* Existing author notes */}
        {notes.map(note => {
          const top = noteAnchorYs[note.id];
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
              </PostitContent>
              <PostitDeleteBtn
                onClick={e => { e.stopPropagation(); deleteNote(note.id); }}
                title="Delete note"
              >
                ×
              </PostitDeleteBtn>
            </PostitWrapper>
          );
        })}

        {/* Inline poll/response visualization for the active note, rendered under its postit */}
        {activeNoteId && responsesData && (() => {
          const note = notes.find(n => n.id === activeNoteId);
          if (!note) return null;
          const top = noteAnchorYs[note.id];
          if (top === undefined) return null;
          const variant = pickPostit(note.id);
          return (
            <ResponseBlock
              key={`resp-${note.id}`}
              style={{ top: top + postitHeightPx(variant, 280) + 8 }}
              onClick={e => e.stopPropagation()}
            >
              {note.pollOptions && note.pollTallies && (
                <ResponseSection>
                  <ResponseSectionLabel>Poll</ResponseSectionLabel>
                  <PiePollWidget options={note.pollOptions} tallies={note.pollTallies} />
                </ResponseSection>
              )}
              {responsesData.comments.length > 0 && (
                <ResponseSection>
                  <ResponseSectionLabel>Comments ({responsesData.comments.length})</ResponseSectionLabel>
                  {responsesData.comments.map(c => (
                    <ResponseRow key={c.id}>{c.body}</ResponseRow>
                  ))}
                </ResponseSection>
              )}
              {responsesData.reactions.length > 0 && (
                <ResponseSection>
                  <ResponseSectionLabel>Reactions ({responsesData.reactions.length})</ResponseSectionLabel>
                  {responsesData.reactions.map(r => (
                    <ResponseRow key={r.id}>{r.reaction === 'like' ? '👍' : '👎'} {r.reaction}</ResponseRow>
                  ))}
                </ResponseSection>
              )}
            </ResponseBlock>
          );
        })()}

        {/* Draft postit: appears at the freshly-selected text and lets the author write inline */}
        {draft && draftAnchorY !== null && (() => {
          const variant = pickPostit(draft.charStart + ':' + draft.charLength);
          const c = POSTIT_CONFIGS[variant];
          // Reserve room for footer at the bottom of the postit so it doesn't overlap the textarea.
          const innerStyle = { paddingBottom: '1.6rem' as const };
          return (
            <AnimatePresence>
              <motion.div
                key="draft"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18 }}
                style={{
                  position: 'absolute',
                  left: 0,
                  width: '100%',
                  top: draftAnchorY,
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
                          onChange={e => setDraft(d => {
                            if (!d?.pollOptions) return d;
                            const next = [...d.pollOptions];
                            next[i] = e.target.value;
                            return { ...d, pollOptions: next };
                          })}
                        />
                      ))}
                      {draft.pollOptions.length < 4 && (
                        <PostitFooterBtn
                          onClick={() => setDraft(d => d?.pollOptions ? { ...d, pollOptions: [...d.pollOptions, ''] } : d)}
                          style={{ alignSelf: 'flex-start', marginTop: '0.2rem' }}
                        >
                          + option
                        </PostitFooterBtn>
                      )}
                    </PostitPollEditor>
                  )}
                </PostitContent>
                <PostitFooter>
                  {!draft.pollOptions && (
                    <PostitFooterBtn onClick={() => setDraft(d => d ? { ...d, pollOptions: ['', ''] } : d)}>
                      + add poll
                    </PostitFooterBtn>
                  )}
                  <span style={{ flex: 1 }} />
                  <PostitFooterBtn onClick={() => setDraft(null)}>cancel</PostitFooterBtn>
                  <PostitFooterBtn
                    onClick={submitDraft}
                    disabled={!draft.body.trim()}
                    style={{ borderStyle: 'solid', background: GOLD, borderColor: GOLD, color: 'white' }}
                  >
                    save
                  </PostitFooterBtn>
                </PostitFooter>
              </motion.div>
            </AnimatePresence>
          );
        })()}
      </MarginColumn>
    </Layout>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function PiePollWidget({ options, tallies }: { options: string[]; tallies: number[] }) {
  const total = tallies.reduce((a, b) => a + b, 0);
  if (total === 0) {
    return <div style={{ fontSize: '0.75rem', color: 'rgba(26,26,24,0.5)' }}>No votes yet.</div>;
  }
  let cum = 0;
  const segments = tallies.map((n, i) => {
    const start = (cum / total) * 360;
    cum += n;
    const end = (cum / total) * 360;
    return { start, end, color: PIE_COLORS[i % PIE_COLORS.length] };
  });
  const gradient = segments.map(s => `${s.color} ${s.start}deg ${s.end}deg`).join(', ');
  return (
    <PieWrap>
      <div style={{ width: 56, height: 56, borderRadius: '50%', background: `conic-gradient(${gradient})`, flexShrink: 0 }} />
      <PieLegend>
        {options.map((opt, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center' }}>
            <Swatch $color={PIE_COLORS[i % PIE_COLORS.length]} />
            <span style={{ flex: 1 }}>{opt}</span>
            <strong>{tallies[i] ?? 0}</strong>
          </div>
        ))}
      </PieLegend>
    </PieWrap>
  );
}

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
