'use client';

import { useState, useMemo, useEffect, useRef, type ReactNode } from 'react';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import AnimateNumber from './AnimateNumber';
import ChapterText from './ChapterText';
import { useApi } from '@/lib/useApi';


const Container = styled.div`
  display: grid;
  grid-template-columns: 1fr 350px;
  gap: 2rem;
  max-width: 1200px;
  margin: 0 auto;
  height: calc(100vh - 400px);
  min-height: 600px;
`;

const TextPanel = styled.div`
  overflow-y: auto;
  padding: 0 2rem;
`;

const AnnotatedChapterText = styled(ChapterText)`
  user-select: text;
  max-width: 42rem;

  .feedback-block {
    cursor: pointer;
  }

  .line-highlight {
    padding: 0 0.4em; margin: 0 -0.4em; border-radius: 0.3em;
    background-color: transparent;
    -webkit-box-decoration-break: clone;
    box-decoration-break: clone;
    transition: background-image 0.15s ease, box-shadow 0.15s ease;
  }

  .suggestion-preview {
    color: rgba(185, 40, 40, 0.9);
  }
`;

export const CommentsPanel = styled.div`
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-left: 1px solid rgba(26,26,24,0.07);
  background: rgba(26,26,24,0.015);
`;

export const CommentsPanelHeader = styled.div`
  padding: 1.25rem 1.25rem 0.75rem;
  border-bottom: 1px solid rgba(26,26,24,0.06);
`;

export const CommentsTitle = styled.h3`
  font-family: var(--font-inter), system-ui, sans-serif;
  font-size: 0.65rem;
  font-weight: 500;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(26,26,24,0.35);
  margin: 0;
`;

export const CommentsCount = styled.span`
  color: rgba(26,26,24,0.35);
  font-size: 0.65rem;
  font-weight: 400;
  margin-left: 0.4rem;
`;

export const CommentsList = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 0;
`;

export const CommentCard = styled(motion.div)<{ $isHovered: boolean; $isEdit?: boolean }>`
  position: relative;
  padding: 1.1rem 1.25rem;
  border-bottom: 1px solid rgba(26,26,24,0.055);
  cursor: pointer;
  transition: background 0.15s ease;
  background: ${p => p.$isHovered ? 'rgba(26,26,24,0.035)' : 'transparent'};
  border-left: 2px solid ${p => p.$isHovered
    ? (p.$isEdit ? 'rgba(185,120,40,0.6)' : 'rgba(80,100,200,0.45)')
    : 'transparent'};
  &:hover { background: rgba(26,26,24,0.025); }
`;

export const DeleteBtn = styled.button`
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: rgba(26,26,24,0.25);
  font-size: 0.75rem;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.15s ease, color 0.15s ease, background 0.15s ease;

  ${CommentCard}:hover & { opacity: 1; }
  &:hover {
    color: rgba(185,40,40,0.7);
    background: rgba(185,40,40,0.08);
  }
`;

export const SnippetText = styled.div`
  font-family: var(--font-playfair), Georgia, serif;
  font-style: italic;
  font-size: 0.82rem;
  color: rgba(26,26,24,0.55);
  margin-bottom: 0.5rem;
  line-height: 1.5;
`;

export const CommentBody = styled.div`
  font-family: var(--font-inter), system-ui, sans-serif;
  font-size: 0.85rem;
  color: #1a1a18;
  line-height: 1.55;
  margin-bottom: 0.5rem;
`;

export const EditSuggestion = styled.div`
  font-family: var(--font-inter), system-ui, sans-serif;
  font-size: 0.82rem;
  color: rgba(26,26,24,0.7);
  margin-bottom: 0.5rem;
  line-height: 1.5;
  border-left: 2px solid rgba(185,120,40,0.5);
  padding-left: 0.75rem;
`;

export const CommentMeta = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-family: var(--font-inter), system-ui, sans-serif;
  font-size: 0.68rem;
  color: rgba(26,26,24,0.32);
  gap: 0.5rem;
  margin-top: 0.25rem;
`;

export const ReaderBadge = styled.span`
  font-size: 0.68rem;
  color: rgba(26,26,24,0.45);
  font-weight: 500;
  letter-spacing: 0.02em;
`;


export const EmptyState = styled.div`
  text-align: center;
  padding: 3rem 1.5rem;
  color: rgba(26,26,24,0.3);
  font-family: var(--font-inter), system-ui, sans-serif;
  font-size: 0.82rem;
`;

const VersionSeparator = styled.div`
  padding: 0.5rem 1.25rem 0.25rem;
  border-top: 1px solid rgba(26,26,24,0.1);
  font-family: var(--font-inter), system-ui, sans-serif;
  font-size: 0.6rem;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(26,26,24,0.35);
  display: flex;
  gap: 0.5rem;
  align-items: center;
`;

const NoFeedbackNote = styled.div`
  padding: 0.5rem 1.25rem 0.75rem;
  font-family: var(--font-inter), system-ui, sans-serif;
  font-size: 0.75rem;
  color: rgba(26,26,24,0.25);
  font-style: italic;
`;

export interface DashComment {
  id: string;
  body: string;
  selected_text: string | null;
  char_start: number | null;
  char_length: number | null;
  word_start: number | null;
  word_end: number | null;
  created_at: string;
  reader_name: string | null;
  reader_slug: string | null;
}

export interface DashSuggestion {
  id: string;
  original_text: string;
  suggested_text: string;
  rationale: string | null;
  char_start: number | null;
  char_length: number | null;
  word_start: number | null;
  word_end: number | null;
  created_at: string;
  reader_name: string | null;
}

export interface DashReaction {
  id: string;
  reaction: string;
  selected_text: string | null;
  created_at: string;
  reader_name: string | null;
}

export type Item =
  | { kind: 'comment'; data: DashComment }
  | { kind: 'suggestion'; data: DashSuggestion }
  | { kind: 'reaction'; data: DashReaction };

interface CommentsViewProps {
  chapterHtml: string;
  comments: DashComment[];
  suggestions: DashSuggestion[];
  chapterId: string;
  chapterVersionId: string;
  onDelete?: (id: string, type: 'comment' | 'suggestion') => void;
}

interface CrossVersionEntry {
  versionId: string;
  versionNumber: number;
  commitSha: string;
  commitMessage: string;
  date: string;
  comments: DashComment[];
  suggestions: DashSuggestion[];
}

// Wrap every DOM text node that overlaps with [charIdx, charIdx+length).
// Unlike the old single-node version, this handles selections that span
// across paragraph boundaries (multiple text nodes).
function charWrap(
  div: HTMLElement,
  charIdx: number,
  length: number,
  makeEl: () => HTMLElement,
): void {
  const selEnd = charIdx + length;
  let charPos = 0;

  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || '';
      const nodeEnd = charPos + text.length;
      const overlapStart = Math.max(charPos, charIdx);
      const overlapEnd = Math.min(nodeEnd, selEnd);

      // Skip wrapping whitespace-only nodes (e.g. the \n between </p> and <p>)
      // — wrapping them creates visible blank lines without adding any highlight.
      if (overlapStart < overlapEnd && text.slice(overlapStart - charPos, overlapEnd - charPos).trim() !== '') {
        const localStart = overlapStart - charPos;
        const localEnd = overlapEnd - charPos;
        const el = makeEl();
        // Preserve textContent if already set by callback (e.g. suggestion preview)
        if (!el.textContent) el.textContent = text.slice(localStart, localEnd);
        const before = document.createTextNode(text.slice(0, localStart));
        const after = document.createTextNode(text.slice(localEnd));
        node.parentNode?.insertBefore(before, node);
        node.parentNode?.insertBefore(el, node);
        node.parentNode?.insertBefore(after, node);
        node.parentNode?.removeChild(node);
      }

      charPos += text.length;
    } else {
      for (const child of Array.from(node.childNodes)) {
        walk(child);
      }
    }
  };

  walk(div);
}


function processHtml(
  html: string,
  comments: DashComment[],
  suggestions: DashSuggestion[],
  hoveredPanelId: string | null,
  hoveredMarkIds: string[],
  pinnedItemIds: string[] | null,
  previewSuggId: string | null,
): string {
  if (typeof window === 'undefined') return html;
  const div = document.createElement('div');
  div.innerHTML = html;

  const [r, g, b] = [255, 225, 0];
  const gradient = (op: number) =>
    `linear-gradient(to right, rgba(${r},${g},${b},${(op * 0.14).toFixed(2)}), rgba(${r},${g},${b},${op.toFixed(2)}) 4%, rgba(${r},${g},${b},${(op * 0.43).toFixed(2)}))`;

  // Group comments by their exact char position so each unique text range gets its own highlight
  const grouped = new Map<string, string[]>(); // "charStart-charLength" → comment ids
  for (const c of comments) {
    if (c.char_start == null || c.char_length == null) continue;
    const key = `${c.char_start}-${c.char_length}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(c.id);
  }

  for (const [key, ids] of grouped) {
    const [charIdx, searchLength] = key.split('-').map(Number);

    // Opacity: panel hover dims all except the hovered item's mark;
    // text hover/pin dims all except the active mark
    let op: number;
    if (hoveredPanelId !== null) {
      op = ids.includes(hoveredPanelId) ? 0.85 : 0;
    } else if (pinnedItemIds !== null) {
      op = ids.some(id => pinnedItemIds.includes(id)) ? 0.85 : 0.3;
    } else if (hoveredMarkIds.length > 0) {
      op = ids.some(id => hoveredMarkIds.includes(id)) ? 0.85 : 0.3;
    } else {
      op = 0.55;
    }

    if (op === 0) continue;

    charWrap(div, charIdx, searchLength, () => {
      const mark = document.createElement('mark');
      mark.className = 'line-highlight feedback-block';
      mark.style.backgroundImage = gradient(op);
      mark.dataset.itemIds = ids.join(',');
      return mark;
    });
  }

  // Highlight marks for suggestions (so hover-scroll can find them)
  for (const s of suggestions) {
    if (s.char_start == null || s.char_length == null) continue;
    // Skip if this is the preview suggestion — it gets its own special rendering below
    if (s.id === previewSuggId) continue;

    let op: number;
    if (hoveredPanelId !== null) {
      op = s.id === hoveredPanelId ? 0.85 : 0;
    } else if (pinnedItemIds !== null) {
      op = pinnedItemIds.includes(s.id) ? 0.85 : 0.3;
    } else if (hoveredMarkIds.length > 0) {
      op = hoveredMarkIds.includes(s.id) ? 0.85 : 0.3;
    } else {
      op = 0.55;
    }

    if (op === 0) continue;

    charWrap(div, s.char_start, s.char_length, () => {
      const mark = document.createElement('mark');
      mark.className = 'line-highlight feedback-block';
      mark.style.backgroundImage = gradient(op);
      mark.dataset.itemIds = s.id;
      return mark;
    });
  }

  // Inline edit preview: same charWrap mechanism
  if (previewSuggId !== null) {
    const s = suggestions.find(s => s.id === previewSuggId);
    if (s?.original_text) {
      let idx = -1;
      let len = 0;
      if (s.char_start != null && s.char_length != null) {
        idx = s.char_start; len = s.char_length;
      } else {
        idx = (div.textContent || '').indexOf(s.original_text);
        len = s.original_text.length;
      }
      if (idx !== -1) {
        let first = true;
        charWrap(div, idx, len, () => {
          const span = document.createElement('span');
          span.dataset.itemIds = previewSuggId;
          if (first) {
            span.className = 'suggestion-preview feedback-block';
            span.textContent = s.suggested_text;
            first = false;
          } else {
            // Hide subsequent text nodes in the range — the first span shows the full replacement
            span.style.display = 'none';
          }
          return span;
        });
      }
    }
  }

  return div.innerHTML;
}

// Walk DOM text nodes to compute char offset from container root
function getCharOffset(container: Node, targetNode: Node, targetOffset: number): number {
  let pos = 0;
  const walk = (cur: Node): boolean => {
    if (cur === targetNode) { pos += targetOffset; return true; }
    if (cur.nodeType === Node.TEXT_NODE) {
      pos += (cur.textContent || '').length;
    } else {
      for (const child of Array.from(cur.childNodes)) {
        if (walk(child)) return true;
      }
    }
    return false;
  };
  walk(container);
  return pos;
}

function charOverlaps(itemStart: number | null, itemLen: number | null, selStart: number, selEnd: number): boolean {
  if (itemStart == null || itemLen == null) return false;
  return itemStart < selEnd && (itemStart + itemLen) > selStart;
}

function itemCharStart(item: Item): number | null {
  return 'char_start' in item.data ? item.data.char_start : null;
}
function itemCharLength(item: Item): number | null {
  return 'char_length' in item.data ? item.data.char_length : null;
}

/**
 * The Comments & Edits panel — header + scrollable list of feedback cards.
 * Shared between the Comments & Edits tab and the per-note feedback sidebar so
 * both render the exact same panel and cards.
 */
export function FeedbackPanel({
  title = 'Comments & Edits',
  items,
  visibleItems = items,
  hoveredId = null,
  onHover,
  onDelete,
  emptyText = 'No comments or edits yet',
  emptyFilteredText = 'No feedback on this selection',
  crossVersionData = null,
  loadingCrossVersion = false,
  headerRight,
}: {
  title?: string;
  items: Item[];
  visibleItems?: Item[];
  hoveredId?: string | null;
  onHover?: (id: string | null, isEdit: boolean) => void;
  onDelete?: (id: string, type: 'comment' | 'suggestion') => void;
  emptyText?: string;
  emptyFilteredText?: string;
  crossVersionData?: CrossVersionEntry[] | null;
  loadingCrossVersion?: boolean;
  headerRight?: ReactNode;
}) {
  const renderCard = (item: Item, index: number) => {
    const isEdit = item.kind === 'suggestion';
    const id = item.data.id;
    const isHovered = hoveredId === id;
    const readerName = item.data.reader_name;

    return (
      <CommentCard
        key={id}
        $isHovered={isHovered}
        $isEdit={isEdit}
        onMouseEnter={onHover ? () => onHover(id, isEdit) : undefined}
        onMouseLeave={onHover ? () => onHover(null, isEdit) : undefined}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: index * 0.04 }}
      >
        {item.kind === 'suggestion' ? (
          <>
            <SnippetText>&ldquo;{item.data.original_text}&rdquo;</SnippetText>
            <EditSuggestion>&rarr; &ldquo;{item.data.suggested_text}&rdquo;</EditSuggestion>
            {item.data.rationale && <CommentBody>{item.data.rationale}</CommentBody>}
          </>
        ) : item.kind === 'reaction' ? (
          <CommentBody>{item.data.reaction === 'like' ? '👍 liked' : '👎 confusing'}</CommentBody>
        ) : (
          <>
            {item.data.selected_text && <SnippetText>&ldquo;{item.data.selected_text}&rdquo;</SnippetText>}
            <CommentBody>{item.data.body}</CommentBody>
          </>
        )}
        <CommentMeta>
          <ReaderBadge>{readerName || 'Anonymous'}</ReaderBadge>
          <span>{new Date(item.data.created_at).toLocaleDateString()}</span>
        </CommentMeta>
        {onDelete && item.kind !== 'reaction' && (
          <DeleteBtn
            onClick={e => { e.stopPropagation(); onDelete(id, isEdit ? 'suggestion' : 'comment'); }}
            title="Delete"
          >
            ✕
          </DeleteBtn>
        )}
      </CommentCard>
    );
  };

  return (
    <CommentsPanel>
      <CommentsPanelHeader style={headerRight ? { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } : undefined}>
        <CommentsTitle>
          {title}
          {!crossVersionData && (
            <CommentsCount>
              <AnimateNumber transition={{ type: 'spring', bounce: 0, duration: 0.4 }}>{visibleItems.length}</AnimateNumber>
              {visibleItems.length !== items.length ? <>{' / '}<AnimateNumber transition={{ type: 'spring', bounce: 0, duration: 0.4 }}>{items.length}</AnimateNumber></> : ''}
            </CommentsCount>
          )}
        </CommentsTitle>
        {headerRight}
      </CommentsPanelHeader>

      <CommentsList>
        {crossVersionData !== null ? (
          loadingCrossVersion ? (
            <EmptyState>Loading…</EmptyState>
          ) : crossVersionData.length === 0 ? (
            <EmptyState>No feedback on this text across any version</EmptyState>
          ) : (
            crossVersionData.map(ver => {
              const verItems: Item[] = [
                ...ver.comments.map(c => ({ kind: 'comment' as const, data: c })),
                ...ver.suggestions.map(s => ({ kind: 'suggestion' as const, data: s })),
              ].sort((a, b) => (itemCharStart(a) ?? Infinity) - (itemCharStart(b) ?? Infinity));

              return (
                <div key={ver.versionId}>
                  <VersionSeparator>
                    <span>v{ver.versionNumber}</span>
                    <span style={{ opacity: 0.6 }}>{ver.commitSha.slice(0, 7)}</span>
                    <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, fontSize: '0.65rem' }}>
                      &ldquo;{ver.commitMessage}&rdquo;
                    </span>
                  </VersionSeparator>
                  {verItems.length === 0 ? (
                    <NoFeedbackNote>no feedback on this text</NoFeedbackNote>
                  ) : (
                    verItems.map((item, index) => renderCard(item, index))
                  )}
                </div>
              );
            })
          )
        ) : items.length === 0 ? (
          <EmptyState>{emptyText}</EmptyState>
        ) : visibleItems.length === 0 ? (
          <EmptyState>{emptyFilteredText}</EmptyState>
        ) : (
          visibleItems.map((item, index) => renderCard(item, index))
        )}
      </CommentsList>
    </CommentsPanel>
  );
}

export default function CommentsView({ chapterHtml, comments, suggestions, chapterId, chapterVersionId, onDelete }: CommentsViewProps) {
  const [hoveredPanelId, setHoveredPanelId] = useState<string | null>(null);
  const textPanelRef = useRef<HTMLDivElement>(null);
  const [hoveredMarkIds, setHoveredMarkIds] = useState<string[]>([]);
  const [pinnedItemIds, setPinnedItemIds] = useState<string[] | null>(null);
  const [previewSuggId, setPreviewSuggId] = useState<string | null>(null);
  const [crossVersionUrl, setCrossVersionUrl] = useState<string | null>(null);
  const { data: crossVersionResponse, loading: loadingCrossVersion } =
    useApi<{ versions: CrossVersionEntry[] }>(crossVersionUrl);
  const crossVersionData = crossVersionUrl ? (crossVersionResponse?.versions ?? null) : null;
  // Track whether the current pin came from a text-selection drag
  const selectionPinRef = useRef(false);

  const items: Item[] = useMemo(() => {
    const all: Item[] = [
      ...comments.map(c => ({ kind: 'comment' as const, data: c })),
      ...suggestions.map(s => ({ kind: 'suggestion' as const, data: s })),
    ];
    return all.sort((a, b) => (itemCharStart(a) ?? Infinity) - (itemCharStart(b) ?? Infinity));
  }, [comments, suggestions]);

  // Filter panel to the mark under cursor / pinned mark (pinned takes priority)
  const activeIds = pinnedItemIds ?? (hoveredMarkIds.length > 0 ? hoveredMarkIds : null);
  const visibleItems = useMemo(() => {
    if (!activeIds) return items;
    return items.filter(item => activeIds.includes(item.data.id));
  }, [items, activeIds]);

  // Scroll text panel to the mark containing the hovered panel item
  useEffect(() => {
    const container = textPanelRef.current;
    if (!hoveredPanelId || !container) return;
    const marks = Array.from(container.querySelectorAll('[data-item-ids]'));
    const mark = marks.find(m =>
      (m as HTMLElement).dataset.itemIds!.split(',').includes(hoveredPanelId),
    ) as HTMLElement | undefined;
    if (!mark) return;
    // Scroll within the TextPanel only, centering the mark
    const markTop = mark.offsetTop - container.offsetTop;
    const target = markTop - container.clientHeight / 2 + mark.offsetHeight / 2;
    container.scrollTo({ top: target, behavior: 'smooth' });
  }, [hoveredPanelId]);

  const processedHtml = useMemo(
    () => processHtml(chapterHtml, comments, suggestions, hoveredPanelId, hoveredMarkIds, pinnedItemIds, previewSuggId),
    [chapterHtml, comments, suggestions, hoveredPanelId, hoveredMarkIds, pinnedItemIds, previewSuggId],
  );

  const handleTextMouseOver = (e: React.MouseEvent) => {
    const mark = (e.target as HTMLElement).closest('[data-item-ids]') as HTMLElement | null;
    setHoveredMarkIds(mark ? mark.dataset.itemIds!.split(',') : []);
  };

  const handleTextMouseOut = (e: React.MouseEvent) => {
    if (!(e.relatedTarget as HTMLElement)?.closest?.('[data-item-ids]')) {
      setHoveredMarkIds([]);
    }
  };

  const handleTextMouseUp = (_e: React.MouseEvent) => {
    const container = textPanelRef.current;
    if (!container) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) return;

    const range = selection.getRangeAt(0);
    // Only handle selections within the text panel
    if (!container.contains(range.commonAncestorContainer)) return;

    const selStart = getCharOffset(container, range.startContainer, range.startOffset);
    const selEnd = getCharOffset(container, range.endContainer, range.endOffset);
    const selLength = selEnd - selStart;

    const overlappingIds = items
      .filter(item => charOverlaps(itemCharStart(item), itemCharLength(item), selStart, selEnd))
      .map(item => item.data.id);

    selectionPinRef.current = true;
    setPinnedItemIds(overlappingIds.length > 0 ? overlappingIds : null);

    // Fetch cross-version feedback for this char range (cached via useApi)
    setCrossVersionUrl(
      `/api/dashboard/chapters/${chapterId}/feedback-for-range?chapterVersionId=${chapterVersionId}&charStart=${selStart}&charLength=${selLength}`
    );
  };

  const handleTextClick = (e: React.MouseEvent) => {
    // If this click followed a drag-select, don't clear the pin
    if (selectionPinRef.current) {
      selectionPinRef.current = false;
      return;
    }
    const mark = (e.target as HTMLElement).closest('[data-item-ids]') as HTMLElement | null;
    if (mark) {
      const ids = mark.dataset.itemIds!.split(',');
      const isPinned = pinnedItemIds !== null && pinnedItemIds.length === ids.length && ids.every(id => pinnedItemIds.includes(id));
      setPinnedItemIds(isPinned ? null : ids);
      // Clicking a mark shows only current-version items (no cross-version)
      setCrossVersionUrl(null);
    } else {
      setPinnedItemIds(null);
      setCrossVersionUrl(null);
    }
  };

  return (
    <Container>
      <TextPanel ref={textPanelRef}>
        <AnnotatedChapterText
          html={processedHtml}
          onMouseOver={handleTextMouseOver}
          onMouseOut={handleTextMouseOut}
          onMouseUp={handleTextMouseUp}
          onClick={handleTextClick}
        />
      </TextPanel>

      <FeedbackPanel
        items={items}
        visibleItems={visibleItems}
        hoveredId={hoveredPanelId}
        onHover={(id, isEdit) => {
          setHoveredPanelId(id);
          setPreviewSuggId(id && isEdit ? id : null);
        }}
        onDelete={onDelete}
        crossVersionData={crossVersionData}
        loadingCrossVersion={loadingCrossVersion}
      />
    </Container>
  );
}
