'use client';

import styled from 'styled-components';
import { motion } from 'framer-motion';
import {
  CommentsPanel,
  CommentsPanelHeader,
  CommentsTitle,
  CommentsCount,
  CommentsList,
  CommentCard,
  SnippetText,
  CommentBody,
  EditSuggestion,
  CommentMeta,
  ReaderBadge,
  EmptyState,
} from './CommentsView';

/**
 * All feedback associated with a single author note, rendered with the same
 * Comments & Edits panel (`CommentsPanel`) and card components. Slides in over
 * the opposite margin when a note is selected on the Notes tab.
 */

export interface NoteFeedback {
  comments: { id: string; body: string; selected_text: string | null; created_at: string; profile_name: string | null; anonymous_id: string }[];
  reactions: { id: string; reaction: string; selected_text: string | null; created_at: string; profile_name: string | null; anonymous_id: string }[];
  suggestions: { id: string; original_text: string; suggested_text: string; rationale: string | null; created_at: string; profile_name: string | null; anonymous_id: string }[];
}

const Anim = styled(motion.div)`
  height: 100%;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12);
  background: #fcfcfa;

  /* The shared Comments & Edits panel fills the full height; its list scrolls. */
  & > div {
    height: 100%;
    border-left: none;
  }
`;

const CloseBtn = styled.button`
  border: none;
  background: transparent;
  color: rgba(26, 26, 24, 0.3);
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
  padding: 0 0.2rem;
  &:hover { color: #1a1a18; }
`;

const fmtDate = (s: string) => { try { return new Date(s).toLocaleDateString(); } catch { return ''; } };
const who = (profile: string | null, anon: string) => profile || `Reader ${anon.slice(0, 4)}`;

export default function FeedbackSidebar({ responses, onClose, side = 'left' }: { responses: NoteFeedback | null; onClose?: () => void; side?: 'left' | 'right' }) {
  const total = responses
    ? responses.comments.length + responses.reactions.length + responses.suggestions.length
    : 0;
  const fromX = side === 'left' ? -24 : 24;

  return (
    <Anim
      initial={{ opacity: 0, x: fromX }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: fromX }}
      transition={{ type: 'spring', stiffness: 380, damping: 32 }}
      onClick={e => e.stopPropagation()}
    >
      <CommentsPanel>
        <CommentsPanelHeader style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <CommentsTitle>Feedback<CommentsCount>{total}</CommentsCount></CommentsTitle>
          {onClose && <CloseBtn onClick={onClose} title="Close">×</CloseBtn>}
        </CommentsPanelHeader>
        <CommentsList>
          {!responses || total === 0 ? (
            <EmptyState>No feedback on this note yet.</EmptyState>
          ) : (
            <>
              {responses.reactions.map(r => (
                <CommentCard key={r.id} $isHovered={false}>
                  <CommentBody>{r.reaction === 'like' ? '👍 liked' : '👎 confused'}</CommentBody>
                  <CommentMeta>
                    <ReaderBadge>{who(r.profile_name, r.anonymous_id)}</ReaderBadge>
                    <span>{fmtDate(r.created_at)}</span>
                  </CommentMeta>
                </CommentCard>
              ))}
              {responses.comments.map(c => (
                <CommentCard key={c.id} $isHovered={false}>
                  {c.selected_text && <SnippetText>&ldquo;{c.selected_text}&rdquo;</SnippetText>}
                  <CommentBody>{c.body}</CommentBody>
                  <CommentMeta>
                    <ReaderBadge>{who(c.profile_name, c.anonymous_id)}</ReaderBadge>
                    <span>{fmtDate(c.created_at)}</span>
                  </CommentMeta>
                </CommentCard>
              ))}
              {responses.suggestions.map(s => (
                <CommentCard key={s.id} $isHovered={false} $isEdit>
                  <SnippetText>&ldquo;{s.original_text}&rdquo;</SnippetText>
                  <EditSuggestion>&rarr; &ldquo;{s.suggested_text}&rdquo;</EditSuggestion>
                  {s.rationale && <CommentBody>{s.rationale}</CommentBody>}
                  <CommentMeta>
                    <ReaderBadge>{who(s.profile_name, s.anonymous_id)}</ReaderBadge>
                    <span>{fmtDate(s.created_at)}</span>
                  </CommentMeta>
                </CommentCard>
              ))}
            </>
          )}
        </CommentsList>
      </CommentsPanel>
    </Anim>
  );
}
