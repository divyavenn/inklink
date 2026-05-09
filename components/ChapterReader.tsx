'use client';

import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import {
  pickPostit,
  PostitDefs,
  PostitVisual,
  PostitTexture,
  PostitContent as NoteContent,
  PostitWrapper as AuthorNoteSticky,
  postitHeightPx,
  postitPaperBottomPx,
} from './Postit';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'motion/react';
import dynamic from 'next/dynamic';

const DotLottiePlayer = dynamic(
  () => import('@dotlottie/react-player').then(m => m.DotLottiePlayer),
  { ssr: false },
);

const BLUE_INK = '#2b5797';
const BLUE_INK_LIGHT = 'rgba(43,87,151,0.55)';
const RED_INK = '#b92828';

function seedHash(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  return hash;
}

function pickFace(type: 'like' | 'dislike'): string {
  return type === 'like' ? '/good1.svg' : '/meh1.svg';
}

function faceTransform(seed: string): { rotation: number; offsetY: number; offsetX: number } {
  const h = seedHash(seed);
  return {
    rotation: (h % 25) - 12,
    offsetY: ((h >> 8) % 9) - 4,
    offsetX: ((h >> 16) % 7) - 3,
  };
}

const Paper = styled(motion.div)`
  padding: 4rem 2.5rem 2rem;
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  position: relative;

  @media (max-width: 768px) {
    max-width: 100%;
    padding: 2rem 0 1.5rem;
  }
`;

const ContentRow = styled.div`
  display: flex;
  gap: 3rem;
  align-items: flex-start;

  @media (max-width: 768px) {
    gap: 0;
  }
`;

const TextColumn = styled.div`
  flex: 1;
  min-width: 0;

  @media (max-width: 768px) {
    padding: 0 2.5rem;
  }
`;

const MarginColumn = styled.div`
  width: 260px;
  flex-shrink: 0;
  position: relative;
  align-self: stretch;

  @media (max-width: 768px) {
    display: none;
  }
`;

const ChapterTitle = styled.h2`
  font-family: var(--font-playfair), Georgia, serif;
  font-size: 2.25rem;
  font-weight: 400;
  color: #1a1a18;
  margin-bottom: 2.5rem;
  line-height: 1.2;
`;

const ChapterContent = styled.div`
  font-family: var(--font-inter), system-ui, sans-serif;
  font-size: 1rem;
  line-height: 1.8;
  color: #2a2a26;
  position: relative;

  p { margin-bottom: 1.5rem; }

  hr {
    border: none;
    border-top: 1px solid rgba(26, 26, 24, 0.18);
    margin: 3rem -1rem;
  }

  h1, h2, h3, h4, h5, h6 {
    font-family: var(--font-playfair), Georgia, serif;
    font-weight: 400;
    margin-top: 2rem;
    margin-bottom: 0.75rem;
    color: #1a1a18;
  }

  blockquote {
    border-left: 2px solid rgba(26, 26, 24, 0.2);
    padding-left: 1.5rem;
    margin: 1.5rem 0;
    color: #6a6a60;
    font-style: italic;
  }

  @keyframes pendingPulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  mark[data-pending] {
    animation: pendingPulse 2s ease-in-out infinite;
  }

  mark.highlight-like, mark.highlight-dislike, mark.highlight-comment {
    background: linear-gradient(to right, rgba(253,224,71,0.14), rgba(253,224,71,0.45) 4%, rgba(253,224,71,0.25));
    padding: 0; margin: 0; border-radius: 0.3em;
    box-shadow: 0.4em 0 0 rgba(253,224,71,0.25), -0.4em 0 0 rgba(253,224,71,0.14);
    -webkit-box-decoration-break: clone; box-decoration-break: clone; cursor: pointer;
  }
  mark.highlight-suggestion {
    background: none;
    color: inherit;
    padding: 0; margin: 0;
    cursor: pointer;
  }
  mark.highlight-suggestion .suggestion-diff {
    color: ${RED_INK};
  }
  mark.highlight-suggestion .suggestion-deleted {
    color: ${RED_INK};
    position: relative;
    text-decoration: none;
  }
  mark.highlight-suggestion .suggestion-deleted::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    top: 50%;
    height: 1.5px;
    background: ${RED_INK};
  }
  mark.suggestion-editing {
    background: none;
    color: ${RED_INK};
    padding: 0; margin: 0;
    -webkit-box-decoration-break: clone; box-decoration-break: clone;
    outline: none; cursor: text; caret-color: ${RED_INK};
  }
  mark.highlight-focused {
    filter: saturate(1.2);
  }
  mark:hover { filter: brightness(0.88); }

  sup.fn-ref {
    cursor: pointer;
    color: ${BLUE_INK};
    font-feature-settings: "sups";
    margin: 0 0.05em;
    padding: 0 0.1em;
    border-radius: 2px;
    transition: background 0.12s ease;
  }
  sup.fn-ref::before {
    content: attr(data-fn-num);
  }
  sup.fn-ref:hover {
    background: rgba(43,87,151,0.10);
  }

  aside.footnotes {
    margin-top: 4rem;
    padding-top: 1.5rem;
    border-top: 1px solid rgba(26,26,24,0.12);
    font-size: 0.85rem;
    color: rgba(26,26,24,0.7);
    line-height: 1.6;
  }
  aside.footnotes ol {
    padding-left: 1.5rem;
    margin: 0;
  }
  aside.footnotes li {
    margin-bottom: 0.5rem;
  }
  aside.footnotes li[data-active="true"] {
    color: #1a1a18;
  }

  /* Active mark stays in DOM (so the toolbar can read its position) but is invisible
     until the linked postit is hovered. */
  mark.author-note-active {
    background: transparent;
    padding: 0;
    margin: 0;
    border-radius: 2px;
    transition: background 0.12s ease, box-shadow 0.12s ease;
    -webkit-box-decoration-break: clone;
    box-decoration-break: clone;
  }
  mark.author-note-active.author-note-hovered {
    background: rgba(183, 138, 38, 0.28);
    box-shadow: 0.4em 0 0 rgba(183, 138, 38, 0.18), -0.4em 0 0 rgba(183, 138, 38, 0.18);
  }

  @media (max-width: 768px) {
    -webkit-touch-callout: none;
    -webkit-tap-highlight-color: transparent;
  }
`;

const FootnotePopover = styled(motion.div)`
  position: fixed;
  background: rgba(252, 250, 245, 0.98);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(26,26,24,0.12);
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(26,26,24,0.10);
  padding: 0.75rem 1rem;
  font-family: var(--font-inter), system-ui, sans-serif;
  font-size: 0.85rem;
  line-height: 1.5;
  color: #2a2a26;
  max-width: 320px;
  z-index: 250;
  pointer-events: none;
`;

const PIE_PALETTE = ['#b78a26', '#7d6cab', '#3e8e7e', '#c5605d'];

const PostitPoll = styled.div`
  margin-top: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
`;

const PostitPollRow = styled.button<{ $selected: boolean; $color: string; $pct: number }>`
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  border: none;
  cursor: pointer;
  padding: 0.18rem 0.4rem;
  background: ${p => p.$selected ? `rgba(0,0,0,0.07)` : 'transparent'};
  border-radius: 3px;
  font-family: 'Figma Hand', var(--font-caveat), 'Caveat', cursive;
  font-size: 0.95rem;
  color: #3a2e0e;
  text-align: left;
  overflow: hidden;
  z-index: 1;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    width: ${p => p.$pct}%;
    background: ${p => p.$color};
    opacity: 0.18;
    z-index: -1;
    transition: width 0.2s ease;
  }

  &:hover::before { opacity: 0.28; }
`;

const PostitCommentStack = styled.div`
  position: absolute;
  left: 15%;
  width: 82%;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  pointer-events: none;
`;

const PostitCommentRow = styled.div`
  font-family: 'Figma Hand', var(--font-caveat), 'Caveat', cursive;
  font-size: 1.15rem;
  line-height: 1.2;
  color: #2c4f8f;
  padding: 0.1rem 0.4rem;
  pointer-events: auto;
`;

const PostitReplyTextarea = styled.textarea`
  width: 100%;
  border: none;
  background: transparent;
  outline: none;
  resize: none;
  font-family: 'Figma Hand', var(--font-caveat), 'Caveat', cursive;
  font-size: 1.15rem;
  line-height: 1.2;
  color: #2c4f8f;
  padding: 0;
  pointer-events: auto;

  &::placeholder { color: rgba(44, 79, 143, 0.5); }
`;

interface ReaderAuthorNote {
  id: string;
  charStart: number;
  charLength: number;
  selectedText: string;
  body: string;
  pollOptions: string[] | null;
  pollTallies: number[] | null;
  myVote: number | null;
  responseCount: number;
  textResponseCount: number;
}


const EditHint = styled.div`
  font-family: var(--font-inter), system-ui, sans-serif;
  font-size: 0.72rem;
  color: rgba(185,40,40,0.6);
  margin-top: 0.5rem;
  letter-spacing: 0.02em;
`;

const MarginNoteEl = styled.div<{ $isPending?: boolean; $side?: 'left' | 'right' }>`
  position: absolute;
  width: 100%;
  font-family: var(--font-caveat), cursive;
  font-size: 1.4rem;
  color: ${BLUE_INK};
  line-height: 1.4;
  pointer-events: ${p => p.$isPending ? 'none' : 'auto'};
  cursor: ${p => p.$isPending ? 'default' : 'text'};
  ${p => p.$side === 'left'
    ? 'left: auto; right: -1.8rem; text-align: right;'
    : 'left: -1.8rem;'}
`;

const MarginFaceImg = styled.img`
  position: absolute;
  width: 48px;
  height: 48px;
  cursor: pointer;
  filter: brightness(0) saturate(100%) invert(25%) sepia(80%) saturate(600%) hue-rotate(197deg) brightness(95%) contrast(95%);
`;

const MarginNoteTextarea = styled.textarea`
  font-family: var(--font-caveat), cursive;
  font-size: 1.4rem;
  color: ${BLUE_INK};
  line-height: 1.4;
  width: 100%;
  border: none;
  background: transparent;
  resize: none;
  outline: none;
  padding: 0;
  padding-left: 0.5rem;
`;

const SuccessToast = styled(motion.div)`
  position: fixed;
  top: 2rem;
  right: 2rem;
  background: #1a1a18;
  color: #f2ede4;
  padding: 0.75rem 1.25rem;
  border-radius: 8px;
  box-shadow:
    0 0 0 1px rgba(26, 26, 24, 0.08),
    0 2px 4px rgba(26, 26, 24, 0.08),
    0 8px 24px rgba(26, 26, 24, 0.16);
  z-index: 10000;
  font-family: var(--font-inter), system-ui, sans-serif;
  font-size: 0.875rem;
`;

const HelpButton = styled.button`
  position: fixed;
  top: 1rem;
  right: 1rem;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid rgba(26,26,24,0.12);
  background: rgba(252,252,252,0.85);
  color: rgba(26,26,24,0.35);
  font-family: var(--font-inter), system-ui, sans-serif;
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(4px);
  transition-property: color, border-color, scale;
  transition-duration: 0.15s;
  transition-timing-function: ease;
  &:hover { color: #1a1a18; border-color: rgba(26,26,24,0.3); }
  &:active { scale: 0.96; }
`;

const HelpOverlay = styled(motion.div)`
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.25);
  z-index: 10001;
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  padding: 1rem;
`;

const HelpContent = styled(motion.div)`
  background: #fcfcfc;
  border-radius: 12px;
  padding: 1.75rem 2rem;
  max-width: 320px;
  width: 90%;
  box-shadow:
    0 0 0 1px rgba(0,0,0,0.03),
    0 2px 4px rgba(0,0,0,0.04),
    0 8px 32px rgba(0,0,0,0.12);
  font-family: var(--font-inter), system-ui, sans-serif;
  font-size: 0.82rem;
  color: #2a2a26;
  line-height: 1.6;
  transform-origin: top right;
`;

const ShortcutRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 0.2rem 0;
`;

const ShortcutKey = styled.span`
  font-size: 0.72rem;
  color: rgba(26,26,24,0.4);
  background: rgba(26,26,24,0.05);
  padding: 0.1rem 0.35rem;
  border-radius: 3px;
  font-family: var(--font-inter), system-ui, sans-serif;
`;

const TOOLBAR_BG = '#000';
const KEYCAP_BG = '#414141';
const KEYCAP_INNER_BG = 'rgba(99,93,93,0.5)';
const KEYCAP_INNER_BG_ACTIVE = '#635d5d';

const KeyCap = styled.span<{ $plain?: boolean; $small?: boolean }>`
  position: relative;
  isolation: isolate;
  display: flex;
  align-items: center;
  justify-content: center;
  ${p => p.$small
    ? 'width: 1.4rem; height: 1.4rem;'
    : p.$plain
      ? 'min-width: 1.85rem; height: 1.85rem; padding: 0 0.5rem;'
      : 'width: 1.85rem; height: 1.85rem;'}
  background: ${KEYCAP_BG};
  border-radius: 3px;
  color: #fff;
  font-family: ${p => p.$plain ? 'var(--font-inter), system-ui, sans-serif' : 'var(--font-playfair), Georgia, serif'};
  font-size: ${p => p.$small ? '0.62rem' : '0.78rem'};
  font-style: ${p => p.$plain ? 'normal' : 'italic'};
  transform: scale(1);
  transform-origin: center;
  transition: filter 0.12s ease, transform 0.12s ease;
  user-select: none;
  pointer-events: none;

  /* Inner darker panel — always visible (matches Figma 898:22 unselected state) */
  &::after {
    content: '';
    position: absolute;
    inset: 15%;
    background: ${KEYCAP_INNER_BG};
    border-radius: 28.5%;
    pointer-events: none;
    z-index: -1;
    transition: inset 0.12s ease, background 0.12s ease;
  }
`;

const MobilePill = styled(motion.div)`
  display: flex;
  position: fixed;
  bottom: 1.5rem;
  left: 50%;
  background: ${TOOLBAR_BG};
  border-radius: 6px;
  padding: 0;
  gap: 0;
  box-shadow: 0 4px 20px rgba(0,0,0,0.35);
  z-index: 10000;
  align-items: stretch;
  overflow: hidden;
`;

const PillBtn = styled.button<{ $active?: boolean; $small?: boolean }>`
  position: relative;
  width: ${p => p.$small ? '1.95rem' : '2.5rem'};
  height: ${p => p.$small ? '1.95rem' : '2.5rem'};
  padding: 0;
  background: transparent;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;

  & > ${KeyCap} {
    filter: ${p => p.$active ? 'brightness(0.7)' : 'none'};
    transform: scale(${p => p.$active ? 0.96 : 1});
    &::after {
      background: ${p => p.$active ? KEYCAP_INNER_BG_ACTIVE : KEYCAP_INNER_BG};
      inset: ${p => p.$active ? '17.7%' : '15%'};
    }
  }

  &:hover > ${KeyCap},
  &:focus-visible > ${KeyCap},
  &:active > ${KeyCap} {
    filter: brightness(0.7);
    transform: scale(0.96);
    &::after {
      background: ${KEYCAP_INNER_BG_ACTIVE};
      inset: 17.7%;
    }
  }
`;

const PillInput = styled.input`
  background: rgba(255,255,255,0.1);
  border: none;
  color: #e8e4dc;
  font-family: var(--font-inter), system-ui, sans-serif;
  font-size: 1rem;
  padding: 0.35rem 0.6rem;
  border-radius: 16px;
  outline: none;
  width: 140px;
  &::placeholder { color: rgba(232,228,220,0.35); }
`;

const DesktopHint = styled(motion.div)`
  position: fixed;
  bottom: 1.5rem;
  left: 50%;
  transform: translateX(-50%);
  font-family: var(--font-inter), system-ui, sans-serif;
  font-size: 0.7rem;
  color: rgba(26,26,24,0.35);
  z-index: 100;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const HintDeleteBtn = styled.button`
  background: none;
  border: 1px solid rgba(26,26,24,0.15);
  border-radius: 4px;
  color: rgba(26,26,24,0.45);
  font-family: var(--font-inter), system-ui, sans-serif;
  font-size: 0.7rem;
  padding: 0.15rem 0.4rem;
  cursor: pointer;
  transition-property: color, border-color;
  transition-duration: 0.12s;
  &:hover { color: #b92828; border-color: rgba(185,40,40,0.3); }
`;

const SelectionToolbar = styled(motion.div)`
  position: fixed;
  display: flex;
  background: transparent;
  border: none;
  padding: 0;
  gap: 1px;
  z-index: 10000;
  align-items: stretch;
  isolation: isolate;

  /* Toolbar bg is slightly shorter than buttons — buttons stick out top/bottom + sides
     (matches Figma 898:11; horizontal inset keeps bg from peeking past hovered end keycaps) */
  &::before {
    content: '';
    position: absolute;
    top: 1.5px;
    left: 1.5px;
    right: 1.5px;
    bottom: 1.5px;
    background: ${TOOLBAR_BG};
    border-radius: 3px;
    box-shadow: 0 6px 18px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.35);
    z-index: -1;
  }
`;

const ReactionIcon = styled.span<{ $src: string }>`
  display: inline-block;
  width: 1rem;
  height: 1rem;
  background-color: currentColor;
  mask-image: url(${p => p.$src});
  -webkit-mask-image: url(${p => p.$src});
  mask-size: contain;
  -webkit-mask-size: contain;
  mask-repeat: no-repeat;
  -webkit-mask-repeat: no-repeat;
  mask-position: center;
  -webkit-mask-position: center;
`;

const ToolbarBtn = styled.button<{ $active?: boolean; $small?: boolean }>`
  position: relative;
  width: ${p => p.$small ? '2.5rem' : '3.125rem'};
  height: 3.125rem;
  padding: 0;
  background: transparent;
  border: none;
  display: flex;
  align-items: stretch;
  justify-content: stretch;
  cursor: pointer;

  & > ${KeyCap} {
    width: 100%;
    height: 100%;
    filter: ${p => p.$active ? 'brightness(0.7)' : 'none'};
    transform: scale(${p => p.$active ? 0.96 : 1});
    &::after {
      background: ${p => p.$active ? KEYCAP_INNER_BG_ACTIVE : KEYCAP_INNER_BG};
      inset: ${p => p.$active ? '17.7%' : '15%'};
    }
  }

  &:hover > ${KeyCap},
  &:focus-visible > ${KeyCap},
  &:active > ${KeyCap} {
    filter: brightness(0.7);
    transform: scale(0.96);
    &::after {
      background: ${KEYCAP_INNER_BG_ACTIVE};
      inset: 17.7%;
    }
  }
`;

const SearchBar = styled(motion.div)`
  position: fixed;
  top: 1rem;
  right: 3rem;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  background: #fcfcfc;
  border: 1px solid rgba(26,26,24,0.15);
  border-radius: 8px;
  padding: 0.35rem 0.5rem;
  box-shadow: 0 2px 12px rgba(0,0,0,0.08);
  z-index: 10001;
  font-family: var(--font-inter), system-ui, sans-serif;
`;

const SearchInput = styled.input`
  border: none;
  background: transparent;
  font-family: var(--font-inter), system-ui, sans-serif;
  font-size: 0.85rem;
  color: #1a1a18;
  outline: none;
  width: 180px;
  &::placeholder { color: rgba(26,26,24,0.3); }
`;

const SearchBtn = styled.button`
  background: none;
  border: none;
  color: rgba(26,26,24,0.4);
  font-size: 0.75rem;
  cursor: pointer;
  padding: 0.2rem 0.3rem;
  border-radius: 4px;
  font-family: var(--font-inter), system-ui, sans-serif;
  &:hover { color: #1a1a18; background: rgba(26,26,24,0.05); }
`;

const SearchCount = styled.span`
  font-size: 0.7rem;
  color: rgba(26,26,24,0.35);
  white-space: nowrap;
`;

const ChapterNav = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem 2.5rem 4rem;
  display: flex;
  justify-content: space-between;
  align-items: center;

  @media (max-width: 768px) {
    padding: 1.5rem 2.5rem 3rem;
  }
`;

const NavButton = styled.button`
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  font-family: var(--font-inter), system-ui, sans-serif;
  font-size: 0.82rem;
  color: rgba(26,26,24,0.4);
  display: flex;
  align-items: center;
  gap: 0.5rem;
  transition-property: color, scale;
  transition-duration: 0.15s;
  transition-timing-function: ease;
  &:hover { color: #1a1a18; }
  &:active { scale: 0.96; }
`;

const EmailSection = styled.div`
  max-width: 360px;
  margin: 0 auto;
  padding-bottom: 3rem;
  text-align: center;
  font-family: var(--font-inter), system-ui, sans-serif;
`;

const EmailTitle = styled.div`
  font-family: var(--font-playfair), Georgia, serif;
  font-size: 1rem;
  color: #1a1a18;
  margin-bottom: 1rem;
`;

const EmailSubtitle = styled.div`
  font-size: 0.82rem;
  color: rgba(26,26,24,0.45);
  margin-bottom: 1.25rem;
  line-height: 1.5;
`;

const EmailRow = styled.form`
  display: flex;
  gap: 0.5rem;
`;

const EmailInput = styled.input`
  flex: 1;
  padding: 0.6rem 0.75rem;
  border: 1px solid rgba(26,26,24,0.18);
  border-radius: 6px;
  background: rgba(255,255,255,0.5);
  font-family: var(--font-inter), system-ui, sans-serif;
  font-size: 0.9rem;
  color: #1a1a18;
  outline: none;
  transition-property: border-color;
  transition-duration: 0.15s;
  &:focus { border-color: rgba(26,26,24,0.45); }
  &::placeholder { color: rgba(26,26,24,0.3); }
`;

const EmailSubmitBtn = styled.button`
  padding: 0.6rem 1.25rem;
  background: #1a1a18;
  color: #f2ede4;
  border: none;
  border-radius: 6px;
  font-family: var(--font-inter), system-ui, sans-serif;
  font-size: 0.9rem;
  cursor: pointer;
  white-space: nowrap;
  transition-property: background, scale;
  transition-duration: 0.15s;
  transition-timing-function: ease;
  &:hover { background: #333330; }
  &:active { scale: 0.96; }
  &:disabled { opacity: 0.5; cursor: default; }
`;

interface ChapterReaderProps {
  chapterId: string;
  sessionId: string | null;
  workId: string | null;
  prefetchedData?: Record<string, unknown>;
  prevChapterId: string | null;
  nextChapterId: string | null;
  onNavigate: (id: string) => void;
  contentElRef?: React.RefObject<HTMLDivElement | null>;
}

interface ChapterData {
  chapter: { id: string; title: string };
  versionId: string;
  content: string;
  html: string;
}

type PendingMode = 'like' | 'dislike' | 'comment';

interface PendingState {
  selectedText: string;
  charStart: number;
  charLength: number;
  mode: PendingMode;
  commentText: string;
  anchorY: number; // px from top of margin column
  side?: 'left' | 'right';
}

interface FeedbackItem {
  id: string;
  type: 'like' | 'dislike' | 'comment' | 'suggestion';
  charStart: number;
  charLength: number;
  comment?: string;      // for comment type: the note text
  anchorY?: number;      // for comment type: margin note position
  suggestedText?: string; // for suggestion type: what the user typed
  side?: 'left' | 'right';
  authorNoteId?: string | null; // when this feedback is a response to an author note
}

interface EditingNote {
  itemId: string;
  text: string;
}

// Walk DOM text nodes to compute char offset from container root
function getCharOffset(container: Node, targetNode: Node, targetOffset: number): number {
  let pos = 0;
  const walk = (cur: Node): boolean => {
    if (cur === targetNode) {
      pos += targetOffset;
      return true;
    }
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

// Apply highlight marks to HTML using char ranges
function buildHighlightedHtml(
  html: string,
  items: FeedbackItem[],
  pending: PendingState | null,
  focusedId: string | null,
  suggestionEdit?: { charStart: number; charLength: number },
  activeAuthorNote?: { charStart: number; charLength: number } | null,
  activeAuthorNoteHovered?: boolean,
): string {
  if (typeof window === 'undefined') return html;
  const div = document.createElement('div');
  div.innerHTML = html;

  const toRender = [
    ...items.filter(item => item.id !== focusedId || !pending).map(item => ({
      charStart: item.charStart,
      charLength: item.charLength,
      cssClass: `highlight-${item.type}`,
      id: item.id,
      suggestedText: item.type === 'suggestion' ? item.suggestedText : undefined,
    })),
    ...(pending ? [{ charStart: pending.charStart, charLength: pending.charLength, cssClass: `highlight-${pending.mode}`, id: focusedId ?? '__pending__', suggestedText: undefined }] : []),
    ...(activeAuthorNote ? [{ charStart: activeAuthorNote.charStart, charLength: activeAuthorNote.charLength, cssClass: `author-note-active${activeAuthorNoteHovered ? ' author-note-hovered' : ''}`, id: '__authorNoteActive__', suggestedText: undefined }] : []),
  ].sort((a, b) => a.charStart - b.charStart);

  for (const item of toRender) {
    // For suggestions, extract original text before charWrap modifies the DOM
    let diffInfo: ReturnType<typeof findMinimalDiff> = null;
    if (item.suggestedText != null) {
      const originalText = extractTextRange(div, item.charStart, item.charLength);
      diffInfo = findMinimalDiff(originalText, item.suggestedText);
    }

    charWrap(div, item.charStart, item.charLength, () => {
      const mark = document.createElement('mark');
      mark.className = item.cssClass + (item.id === focusedId ? ' highlight-focused' : '');
      if (item.id === '__pending__') mark.dataset.pending = '';
      else mark.dataset.feedbackId = item.id;
      return mark;
    }, item.suggestedText);

    // Post-process suggestion marks: only the diff portion is red
    if (item.suggestedText != null && item.id !== '__pending__') {
      const mark = div.querySelector(`mark[data-feedback-id="${item.id}"]`) as HTMLElement | null;
      if (mark) {
        const text = item.suggestedText;
        if (diffInfo) {
          mark.textContent = '';
          mark.appendChild(document.createTextNode(text.slice(0, diffInfo.diffStart)));
          // Show deleted words in red with strikethrough
          if (diffInfo.originalSpan.length > 0 && diffInfo.currentSpan.length === 0) {
            const del = document.createElement('span');
            del.className = 'suggestion-deleted';
            del.textContent = diffInfo.originalSpan;
            mark.appendChild(del);
          } else {
            const span = document.createElement('span');
            span.className = 'suggestion-diff';
            span.textContent = diffInfo.currentSpan;
            mark.appendChild(span);
          }
          mark.appendChild(document.createTextNode(text.slice(diffInfo.diffStart + diffInfo.currentSpan.length)));
        }
        // If no diff (identical), leave as plain text — no red
      }
    }
  }

  // Inject an inline contentEditable mark for active suggestion editing
  if (suggestionEdit) {
    charWrap(div, suggestionEdit.charStart, suggestionEdit.charLength, () => {
      const mark = document.createElement('mark');
      mark.className = 'highlight-suggestion suggestion-editing';
      mark.contentEditable = 'true';
      mark.style.outline = 'none';
      mark.style.cursor = 'text';
      return mark;
    });
  }

  return div.innerHTML;
}

// Wrap text nodes overlapping [charIdx, charIdx+length) with a new element.
// If replacementText is provided, the first overlapping span shows replacementText
// instead of the original content; subsequent overlapping spans are removed.
function charWrap(
  div: HTMLElement,
  charIdx: number,
  length: number,
  makeEl: () => HTMLElement,
  replacementText?: string,
): void {
  const selEnd = charIdx + length;
  let charPos = 0;
  let replacementUsed = false;

  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || '';
      const nodeEnd = charPos + text.length;
      const overlapStart = Math.max(charPos, charIdx);
      const overlapEnd = Math.min(nodeEnd, selEnd);

      if (overlapStart < overlapEnd && text.slice(overlapStart - charPos, overlapEnd - charPos).trim() !== '') {
        const localStart = overlapStart - charPos;
        const localEnd = overlapEnd - charPos;
        const before = document.createTextNode(text.slice(0, localStart));
        const after = document.createTextNode(text.slice(localEnd));

        if (replacementText !== undefined) {
          if (!replacementUsed) {
            const el = makeEl();
            el.textContent = replacementText;
            node.parentNode?.insertBefore(before, node);
            node.parentNode?.insertBefore(el, node);
            node.parentNode?.insertBefore(after, node);
            replacementUsed = true;
          } else {
            // Subsequent nodes in range: remove the overlapping content
            node.parentNode?.insertBefore(before, node);
            node.parentNode?.insertBefore(after, node);
          }
          node.parentNode?.removeChild(node);
        } else {
          const el = makeEl();
          el.textContent = text.slice(localStart, localEnd);
          node.parentNode?.insertBefore(before, node);
          node.parentNode?.insertBefore(el, node);
          node.parentNode?.insertBefore(after, node);
          node.parentNode?.removeChild(node);
        }
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

// Extract plain text at a char range from a DOM tree
function extractTextRange(container: Node, charStart: number, length: number): string {
  let result = '';
  let charPos = 0;
  const end = charStart + length;
  const walk = (node: Node): boolean => {
    if (charPos >= end) return true;
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || '';
      const nodeEnd = charPos + text.length;
      const overlapStart = Math.max(charPos, charStart);
      const overlapEnd = Math.min(nodeEnd, end);
      if (overlapStart < overlapEnd) {
        result += text.slice(overlapStart - charPos, overlapEnd - charPos);
      }
      charPos += text.length;
    } else {
      for (const child of Array.from(node.childNodes)) {
        if (walk(child)) return true;
      }
    }
    return false;
  };
  walk(container);
  return result;
}

// Find the minimal contiguous diff between two strings
function findMinimalDiff(original: string, current: string): {
  originalSpan: string; currentSpan: string; diffStart: number;
} | null {
  if (original === current) return null;

  let start = 0;
  while (start < original.length && start < current.length && original[start] === current[start]) {
    start++;
  }

  let endOrig = original.length;
  let endCurr = current.length;
  while (endOrig > start && endCurr > start && original[endOrig - 1] === current[endCurr - 1]) {
    endOrig--;
    endCurr--;
  }

  return {
    originalSpan: original.slice(start, endOrig),
    currentSpan: current.slice(start, endCurr),
    diffStart: start,
  };
}

// Margin layout collision avoidance (unified for faces + comments)
const MARGIN_LINE_PX = 32;   // approx px per line at 1.4rem Caveat, line-height 1.4
const MARGIN_CHARS_PER_LINE = 18; // approx chars fitting in margin column
const MARGIN_NOTE_GAP = 4;   // min gap between adjacent items
const FACE_HEIGHT_PX = 48;

function computeItemHeight(item: { type: string; comment?: string }): number {
  if (item.type === 'like' || item.type === 'dislike') return FACE_HEIGHT_PX;
  const lines = Math.max(1, Math.ceil((item.comment?.length ?? 3) / MARGIN_CHARS_PER_LINE));
  return lines * MARGIN_LINE_PX;
}

function resolveMarginPositions(
  items: Array<{ id: string; anchorY: number; heightPx: number }>,
  forbidden: Array<{ top: number; bottom: number }> = []
): Map<string, number> {
  if (items.length === 0) return new Map();
  const sorted = [...items].sort((a, b) => a.anchorY - b.anchorY);
  const sortedForbidden = [...forbidden]
    .filter(f => f.bottom > f.top)
    .sort((a, b) => a.top - b.top);

  // Push y past any forbidden range that overlaps an item of height h placed at y.
  // Re-runs because pushing past one range may land in another.
  function avoidForbidden(y: number, h: number): number {
    let cur = y;
    let changed = true;
    while (changed) {
      changed = false;
      for (const f of sortedForbidden) {
        if (cur < f.bottom && cur + h > f.top) {
          cur = f.bottom + MARGIN_NOTE_GAP;
          changed = true;
        }
      }
    }
    return cur;
  }

  // First pass: place each item at its anchor (or beyond, dodging forbidden bands)
  const positions: number[] = [];
  let bottomY = 0;
  for (let i = 0; i < sorted.length; i++) {
    let y = Math.max(Math.max(0, sorted[i].anchorY), bottomY);
    y = avoidForbidden(y, sorted[i].heightPx);
    positions.push(y);
    bottomY = y + sorted[i].heightPx + MARGIN_NOTE_GAP;
  }

  // Second pass: pull items back up toward their anchors (bottom-up)
  for (let i = sorted.length - 1; i >= 0; i--) {
    const minY = i === 0 ? 0 : positions[i - 1] + sorted[i - 1].heightPx + MARGIN_NOTE_GAP;
    const ideal = Math.max(0, sorted[i].anchorY);
    let y = Math.max(minY, Math.min(positions[i], ideal));
    y = avoidForbidden(y, sorted[i].heightPx);
    positions[i] = y;
  }

  const result = new Map<string, number>();
  for (let i = 0; i < sorted.length; i++) {
    result.set(sorted[i].id, positions[i]);
  }
  return result;
}

function countNearby(items: Array<{ anchorY: number }>, anchorY: number): number {
  return items.filter(i => Math.abs(i.anchorY - anchorY) < 60).length;
}

function hasOverlap(items: Array<{ anchorY: number; heightPx: number }>, anchorY: number): boolean {
  return items.some(i => anchorY >= i.anchorY && anchorY < i.anchorY + i.heightPx);
}

function assignSide(
  selectionRect: { left: number; right: number },
  textColumnRect: { left: number; right: number },
  leftItems: Array<{ anchorY: number; heightPx: number }>,
  rightItems: Array<{ anchorY: number; heightPx: number }>,
  anchorY: number,
): 'left' | 'right' {
  const selCenter = (selectionRect.left + selectionRect.right) / 2;
  const colCenter = (textColumnRect.left + textColumnRect.right) / 2;
  const selWidth = selectionRect.right - selectionRect.left;
  const colWidth = textColumnRect.right - textColumnRect.left;

  // Wide selection (>70% of column) → pick less crowded side
  if (selWidth / colWidth > 0.7) {
    const leftCrowding = countNearby(leftItems, anchorY);
    const rightCrowding = countNearby(rightItems, anchorY);
    return leftCrowding <= rightCrowding ? 'left' : 'right';
  }

  const preferred: 'left' | 'right' = selCenter < colCenter ? 'left' : 'right';

  // Check if preferred side has overlap; if so, try other side
  const prefItems = preferred === 'left' ? leftItems : rightItems;
  const altItems = preferred === 'left' ? rightItems : leftItems;
  if (hasOverlap(prefItems, anchorY) && !hasOverlap(altItems, anchorY)) {
    return preferred === 'left' ? 'right' : 'left';
  }
  return preferred;
}

export default function ChapterReader({ chapterId, sessionId, workId, prefetchedData, prevChapterId, nextChapterId, onNavigate, contentElRef }: ChapterReaderProps) {
  const [chapterData, setChapterData] = useState<ChapterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<PendingState | null>(null);
  const [feedbackItems, setFeedbackItems] = useState<FeedbackItem[]>([]);
  const [focusedFeedbackId, setFocusedFeedbackId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [suggEditMeta, setSuggEditMeta] = useState<{ originalText: string; charStart: number; charLength: number } | null>(null);
  const [editingNote, setEditingNote] = useState<EditingNote | null>(null);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [hasKeyboard, setHasKeyboard] = useState(true);
  const [showHelp, setShowHelp] = useState(() => {
    if (typeof window === 'undefined') return false;
    return !localStorage.getItem('inklink-help-seen');
  });
  const helpBtnRef = useRef<HTMLButtonElement>(null);
  const [selectionRect, setSelectionRect] = useState<{ top: number; left: number; width: number; bottom: number } | null>(null);
  const [mobileCommentMode, setMobileCommentMode] = useState(false);
  const [mobileCommentText, setMobileCommentText] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMatches, setSearchMatches] = useState<number[]>([]);
  const [currentMatchIdx, setCurrentMatchIdx] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [emailInput, setEmailInput] = useState('');
  const [emailSubmitting, setEmailSubmitting] = useState(false);
  const [emailSubmitted, setEmailSubmitted] = useState(false);
  const [footnoteHover, setFootnoteHover] = useState<{ text: string; x: number; y: number } | null>(null);
  const [authorNotes, setAuthorNotes] = useState<ReaderAuthorNote[]>([]);
  const [activeAuthorNoteId, setActiveAuthorNoteId] = useState<string | null>(null);
  const [hoveredAuthorNoteId, setHoveredAuthorNoteId] = useState<string | null>(null);
  const [authorNoteAnchorYs, setAuthorNoteAnchorYs] = useState<Record<string, number>>({});
  const activeAuthorNote = authorNotes.find(n => n.id === activeAuthorNoteId) ?? null;
  const activeAuthorNoteRangeRef = useRef<{ charStart: number; charLength: number } | null>(null);
  activeAuthorNoteRangeRef.current = activeAuthorNote ? { charStart: activeAuthorNote.charStart, charLength: activeAuthorNote.charLength } : null;
  useEffect(() => {
    if (localStorage.getItem('inklink_email_submitted')) setEmailSubmitted(true);
  }, []);

  // Footnote popover: hover over <sup class="fn-ref"> shows the matching definition.
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const showFor = (target: HTMLElement) => {
      const fnId = target.dataset.fnId;
      if (!fnId) return;
      const def = el.querySelector(`li[data-fn-id="${CSS.escape(fnId)}"]`) as HTMLElement | null;
      if (!def) return;
      const rect = target.getBoundingClientRect();
      setFootnoteHover({
        text: def.innerHTML,
        x: rect.left + rect.width / 2,
        y: rect.top,
      });
    };

    const onOver = (e: MouseEvent) => {
      const t = (e.target as HTMLElement)?.closest('sup.fn-ref') as HTMLElement | null;
      if (t) showFor(t);
    };
    const onOut = (e: MouseEvent) => {
      const t = (e.target as HTMLElement)?.closest('sup.fn-ref');
      const related = (e.relatedTarget as HTMLElement)?.closest?.('sup.fn-ref');
      if (t && t !== related) setFootnoteHover(null);
    };
    const onClick = (e: MouseEvent) => {
      const t = (e.target as HTMLElement)?.closest('sup.fn-ref') as HTMLElement | null;
      if (!t) return;
      e.preventDefault();
      e.stopPropagation();
      const fnId = t.dataset.fnId;
      if (!fnId) return;
      const def = el.querySelector(`li[data-fn-id="${CSS.escape(fnId)}"]`) as HTMLElement | null;
      if (def) def.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    el.addEventListener('mouseover', onOver);
    el.addEventListener('mouseout', onOut);
    el.addEventListener('click', onClick, true);
    return () => {
      el.removeEventListener('mouseover', onOver);
      el.removeEventListener('mouseout', onOut);
      el.removeEventListener('click', onClick, true);
    };
  }, [chapterData?.html]);

  const contentRef = useRef<HTMLDivElement>(null);
  const contentRowRef = useRef<HTMLDivElement>(null);
  const textColRef = useRef<HTMLDivElement>(null);
  const scrollSentinelRef = useRef<HTMLDivElement>(null);

  // Refs so keydown handler (added once) can always read latest state
  const pendingRef = useRef(pending);
  const editModeRef = useRef(editMode);
  const focusedIdRef = useRef(focusedFeedbackId);
  const chapterDataRef = useRef(chapterData);
  const feedbackItemsRef = useRef(feedbackItems);
  useEffect(() => {
    pendingRef.current = pending;
    if (!pending) {
      setMobileCommentMode(false);
      setMobileCommentText('');
      setSelectionRect(null);
    }
  }, [pending]);
  useEffect(() => { editModeRef.current = editMode; }, [editMode]);
  useEffect(() => { focusedIdRef.current = focusedFeedbackId; }, [focusedFeedbackId]);
  useEffect(() => {
    chapterDataRef.current = chapterData;
  }, [chapterData]);
  useEffect(() => { feedbackItemsRef.current = feedbackItems; }, [feedbackItems]);

  // ─── Reading progress tracker ──────────────────────────────────────────
  useEffect(() => {
    if (!sessionId || !workId || !chapterData) return;
    const versionId = chapterData.versionId;

    let maxScrollPercent = 0;
    let maxLineSeen = 0;
    let activeSeconds = 0;
    let lastTick = Date.now();
    let isActive = true;
    let sent = false; // chapter_completed sent once

    const countLines = () => {
      const el = contentRef.current;
      if (!el) return 0;
      const paragraphs = el.querySelectorAll('p, blockquote, h1, h2, h3, h4, h5, h6');
      return paragraphs.length;
    };

    const computeProgress = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight > 0) {
        const pct = Math.min(100, Math.round((scrollTop / docHeight) * 100));
        if (pct > maxScrollPercent) maxScrollPercent = pct;
      }

      // Estimate lines seen: count paragraph-level elements above viewport bottom
      const el = contentRef.current;
      if (el) {
        const viewBottom = window.scrollY + window.innerHeight;
        const paragraphs = el.querySelectorAll('p, blockquote, h1, h2, h3, h4, h5, h6');
        let linesAbove = 0;
        paragraphs.forEach(p => {
          const rect = p.getBoundingClientRect();
          if (rect.top + window.scrollY < viewBottom) linesAbove++;
        });
        if (linesAbove > maxLineSeen) maxLineSeen = linesAbove;
      }
    };

    const flush = (eventType = 'heartbeat') => {
      const totalLines = countLines();
      const completionPercent = totalLines > 0 ? Math.min(100, Math.round((maxLineSeen / totalLines) * 100)) : 0;

      fetch('/api/public/events/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId, workId,
          events: [{
            eventType,
            chapterVersionId: versionId,
            payload: { maxScrollPercent, maxLineSeen, activeSeconds, completionPercent },
          }],
        }),
      }).catch(() => {});

      // Send chapter_completed once when reader reaches 90%+
      if (!sent && completionPercent >= 90) {
        sent = true;
        fetch('/api/public/events/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId, workId,
            events: [{
              eventType: 'chapter_completed',
              chapterVersionId: versionId,
              payload: { maxScrollPercent, maxLineSeen, activeSeconds, completionPercent },
            }],
          }),
        }).catch(() => {});
      }
    };

    // Send initial chapter_viewed
    flush('chapter_viewed');

    // Track active time
    const tickInterval = setInterval(() => {
      const now = Date.now();
      if (isActive) activeSeconds += Math.round((now - lastTick) / 1000);
      lastTick = now;
    }, 1000);

    // Heartbeat every 15s
    const heartbeatInterval = setInterval(() => {
      computeProgress();
      flush();
    }, 15000);

    const onScroll = () => computeProgress();
    const onBlur = () => { isActive = false; };
    const onFocus = () => { isActive = true; lastTick = Date.now(); };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);

    // Flush on page hide (tab close / navigate away)
    const onVisChange = () => {
      if (document.visibilityState === 'hidden') {
        computeProgress();
        flush();
      }
    };
    document.addEventListener('visibilitychange', onVisChange);

    return () => {
      clearInterval(tickInterval);
      clearInterval(heartbeatInterval);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisChange);
      computeProgress();
      flush();
    };
  }, [sessionId, workId, chapterData]);

  const submitEmail = async () => {
    if (!emailInput.trim() || !emailInput.includes('@')) return;
    setEmailSubmitting(true);
    try {
      await fetch('/api/public/interest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: emailInput.trim(),
          sessionId,
          chapterVersionId: chapterData?.versionId,
        }),
      });
      localStorage.setItem('inklink_email_submitted', emailInput.trim());
      setEmailSubmitted(true);
      showToast('Signed up!');
    } catch {
      // silent
    } finally {
      setEmailSubmitting(false);
    }
  };

  // Detect whether the device has a physical keyboard.
  // Start with media-query heuristic, then upgrade to keyboard on first
  // keydown that isn't inside an input/textarea (rules out virtual keyboards).
  useEffect(() => {
    const touch = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
    if (touch) setHasKeyboard(false);

    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !(e.target as HTMLElement).isContentEditable) {
        setHasKeyboard(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Search: find matches in text content
  useEffect(() => {
    if (!searchOpen || !searchQuery || !contentRef.current) {
      setSearchMatches([]);
      setCurrentMatchIdx(0);
      // Remove existing search highlights
      contentRef.current?.querySelectorAll('mark.search-match').forEach(m => {
        const parent = m.parentNode;
        if (parent) {
          parent.replaceChild(document.createTextNode(m.textContent || ''), m);
          parent.normalize();
        }
      });
      return;
    }

    const text = contentRef.current.textContent || '';
    const query = searchQuery.toLowerCase();
    const matches: number[] = [];
    let idx = 0;
    while ((idx = text.toLowerCase().indexOf(query, idx)) !== -1) {
      matches.push(idx);
      idx += query.length;
    }
    setSearchMatches(matches);
    setCurrentMatchIdx(prev => Math.min(prev, Math.max(0, matches.length - 1)));
  }, [searchQuery, searchOpen]);

  // Search: scroll to current match
  useEffect(() => {
    if (!contentRef.current || searchMatches.length === 0 || !searchQuery) return;

    // Remove old search highlights
    contentRef.current.querySelectorAll('mark.search-match, mark.search-match-active').forEach(m => {
      const parent = m.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(m.textContent || ''), m);
        parent.normalize();
      }
    });

    // Re-apply highlights for all matches
    // We need to re-render the HTML first to reset the DOM
    if (chapterData) {
      contentRef.current.innerHTML = buildHighlightedHtml(chapterData.html, feedbackItems, pending, focusedFeedbackId, undefined, activeAuthorNoteRangeRef.current, hoveredAuthorNoteId !== null && hoveredAuthorNoteId === activeAuthorNoteId);
    }

    // Now apply search highlights using charWrap
    for (let i = searchMatches.length - 1; i >= 0; i--) {
      const isActive = i === currentMatchIdx;
      charWrap(contentRef.current, searchMatches[i], searchQuery.length, () => {
        const mark = document.createElement('mark');
        mark.className = isActive ? 'search-match-active' : 'search-match';
        mark.style.background = isActive ? 'rgba(253,180,71,0.6)' : 'rgba(253,224,71,0.3)';
        mark.style.padding = '0';
        mark.style.margin = '0';
        mark.style.borderRadius = '2px';
        return mark;
      });
    }

    // Scroll to active match
    const active = contentRef.current.querySelector('mark.search-match-active');
    if (active) {
      active.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentMatchIdx, searchMatches]);

  // Close help modal on Escape
  useEffect(() => {
    if (!showHelp) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setShowHelp(false); localStorage.setItem('inklink-help-seen', '1'); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showHelp]);

  // Double-click on existing highlight → edit that feedback item
  useEffect(() => {
    const handleDblClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const mark = target.closest('mark[data-feedback-id]') as HTMLElement | null;
      if (!mark || !mark.dataset.feedbackId) return;

      e.preventDefault();
      window.getSelection()?.removeAllRanges();

      const item = feedbackItemsRef.current.find(f => f.id === mark.dataset.feedbackId);
      if (!item) return;

      if (item.type === 'comment') {
        setEditingNote({ itemId: item.id, text: item.comment ?? '' });
      } else if (item.type === 'suggestion') {
        const originalText = item.suggestedText ?? '';
        enterSuggestionModeRef.current(item.charStart, item.charLength, originalText);
      } else {
        // like/dislike → focus it (opens the toolbar to toggle or delete)
        focusOnItem(item.id);
      }
    };

    document.addEventListener('dblclick', handleDblClick);
    return () => document.removeEventListener('dblclick', handleDblClick);
  }, []);

  // Suppress native context menu on touch devices (prevents copy/paste toolbar over selections)
  useEffect(() => {
    if (!contentRef.current) return;
    const el = contentRef.current;
    const prevent = (e: Event) => {
      if ('ontouchstart' in window) e.preventDefault();
    };
    el.addEventListener('contextmenu', prevent);
    return () => el.removeEventListener('contextmenu', prevent);
  }, []);

  // Update innerHTML whenever feedbackItems, pending, or focusedId change (not in edit mode)
  // Must be useLayoutEffect so marks exist in DOM before the anchor-position useLayoutEffect reads them
  // Skip when search is active — search has its own innerHTML management
  useLayoutEffect(() => {
    if (!contentRef.current || !chapterData) return;
    if (editMode) return;
    if (searchOpen && searchQuery) return;
    contentRef.current.innerHTML = buildHighlightedHtml(chapterData.html, feedbackItems, pending, focusedFeedbackId, undefined, activeAuthorNoteRangeRef.current, hoveredAuthorNoteId !== null && hoveredAuthorNoteId === activeAuthorNoteId);
    // Sync external ref for minimap after DOM is populated
    if (contentElRef) {
      (contentElRef as React.MutableRefObject<HTMLDivElement | null>).current = contentRef.current;
    }
  }, [chapterData, feedbackItems, pending, focusedFeedbackId, editMode, searchOpen, searchQuery, activeAuthorNoteId, hoveredAuthorNoteId]);

  // When a postit becomes active, programmatically "select" its linked text by
  // setting `pending` (so feedback submissions thread the linkedNoteId) and
  // `selectionRect` (so the same SelectionToolbar appears anchored to the highlight).
  useLayoutEffect(() => {
    if (!activeAuthorNote) {
      setPending(null);
      setSelectionRect(null);
      setFocusedFeedbackId(null);
      return;
    }
    if (!contentRef.current || !contentRowRef.current) return;
    const mark = contentRef.current.querySelector('mark.author-note-active') as HTMLElement | null;
    if (!mark) return;
    const rect = mark.getBoundingClientRect();
    const marginTop = contentRowRef.current.getBoundingClientRect().top;
    const anchorY = rect.top - marginTop;

    // If this user has existing feedback (reply/reaction) on this postit, focus that
    // feedback so the toolbar opens in its mode with text editable — same as clicking
    // an existing comment/reaction in the chapter. Prefer a comment over a reaction
    // since the user wants the comment text, not the like icon, by default. If no
    // existing feedback, default to 'comment' mode so typing immediately starts a reply.
    const linked = feedbackItemsRef.current.filter(f => f.authorNoteId === activeAuthorNote.id);
    const existing = linked.find(f => f.type === 'comment') ?? linked[0];
    if (existing) {
      setPending({
        selectedText: '',
        charStart: existing.charStart,
        charLength: existing.charLength,
        mode: existing.type === 'dislike' ? 'dislike' : existing.type === 'like' ? 'like' : 'comment',
        commentText: existing.type === 'comment' ? (existing.comment ?? '') : '',
        anchorY,
        side: 'right',
      });
      setFocusedFeedbackId(existing.id);
    } else {
      setPending({
        selectedText: activeAuthorNote.selectedText,
        charStart: activeAuthorNote.charStart,
        charLength: activeAuthorNote.charLength,
        mode: 'comment',
        commentText: '',
        anchorY,
        side: 'right',
      });
    }
    setSelectionRect({ top: rect.top, left: rect.left, width: rect.width, bottom: rect.bottom });
    // Depend on the id only — refetching author notes mints a new object reference but
    // shouldn't reopen the toolbar after the user has just submitted a reply.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAuthorNoteId]);

  useEffect(() => { fetchChapter(); }, [chapterId]);

  // When sessionId arrives after the chapter is already loaded, fetch feedback
  // (skip if fetchChapter already loaded feedback for this version)
  const feedbackLoadedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (sessionId && chapterData?.versionId && feedbackLoadedForRef.current !== chapterData.versionId) {
      loadSessionFeedback(chapterData.versionId);
    }
  }, [sessionId]);

  // Fetch author notes for the current chapter version
  const refetchAuthorNotes = useCallback(async () => {
    if (!chapterData?.versionId) return;
    const url = `/api/public/author-notes?chapterVersionId=${chapterData.versionId}${sessionId ? `&sessionId=${sessionId}` : ''}`;
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const j = await res.json();
      setAuthorNotes(j.notes ?? []);
    } catch { /* silent */ }
  }, [chapterData?.versionId, sessionId]);

  useEffect(() => {
    refetchAuthorNotes();
  }, [refetchAuthorNotes]);

  // Compute Y-anchor position for each author note based on its char range in the DOM.
  useLayoutEffect(() => {
    if (!contentRef.current || authorNotes.length === 0) return;
    const containerEl = contentRef.current;
    const containerRect = containerEl.getBoundingClientRect();
    const positions: Record<string, number> = {};

    for (const note of authorNotes) {
      // Walk text nodes to find DOM position of charStart
      let pos = 0;
      const walker = document.createTreeWalker(containerEl, NodeFilter.SHOW_TEXT);
      let foundY: number | null = null;
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const t = node as Text;
        const len = t.data.length;
        if (pos + len > note.charStart) {
          const offset = note.charStart - pos;
          const range = document.createRange();
          range.setStart(t, Math.min(offset, len));
          range.setEnd(t, Math.min(offset, len));
          const rect = range.getBoundingClientRect();
          foundY = rect.top - containerRect.top;
          break;
        }
        pos += len;
      }
      if (foundY !== null) positions[note.id] = foundY;
    }
    setAuthorNoteAnchorYs(positions);
  }, [authorNotes, chapterData]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setShowSuccessToast(true);
    setTimeout(() => setShowSuccessToast(false), 2000);
  };

  const fetchChapter = async () => {
    try {
      setLoading(true);
      setPending(null);
      setFeedbackItems([]);
      feedbackLoadedForRef.current = null;
      setFocusedFeedbackId(null);
      setEditMode(false);
      setSuggEditMeta(null);

      // Use prefetched data if available (first chapter already loaded with chapter list)
      const data = prefetchedData ?? await fetch(`/api/chapters/${chapterId}`).then(r => r.json());
      setChapterData(data);

      // Load existing session feedback after chapter loads
      if (data.versionId) {
        loadSessionFeedback(data.versionId);
      }
    } catch (e) {
      console.error('Error fetching chapter:', e);
    } finally {
      setLoading(false);
    }
  };

  const loadSessionFeedback = async (versionId: string) => {
    if (!sessionId) return;
    try {
      const res = await fetch(`/api/public/session-feedback?sessionId=${sessionId}&chapterVersionId=${versionId}`);
      if (!res.ok) return;
      const data = await res.json();

      const items: FeedbackItem[] = [
        ...data.reactions.map((r: any) => ({
          id: r.id,
          type: r.reaction as 'like' | 'dislike',
          charStart: r.char_start,
          charLength: r.char_length,
          authorNoteId: r.author_note_id ?? null,
        })),
        ...data.comments.map((c: any) => ({
          id: c.id,
          type: 'comment' as const,
          charStart: c.char_start,
          charLength: c.char_length,
          comment: c.body,
          authorNoteId: c.author_note_id ?? null,
        })),
        ...data.suggestions.map((s: any) => ({
          id: s.id,
          type: 'suggestion' as const,
          charStart: s.char_start,
          charLength: s.char_length,
          suggestedText: s.suggested_text,
        })),
      ];
      feedbackLoadedForRef.current = versionId;
      setFeedbackItems(items);
    } catch (e) {
      console.error('Error loading session feedback:', e);
    }
  };

  const submitPending = useCallback(async () => {
    const p = pendingRef.current;
    const cd = chapterDataRef.current;
    if (!p || !cd) return;

    // If focused on an existing item, delete the old one first (replace flow)
    const replacingId = focusedIdRef.current;
    if (replacingId) {
      const oldItem = feedbackItemsRef.current.find(f => f.id === replacingId);
      if (oldItem) {
        setFeedbackItems(prev => prev.filter(f => f.id !== replacingId));
        // Fire-and-forget delete of old item on server
        try {
          let delUrl: string;
          if (oldItem.type === 'comment') delUrl = `/api/public/comments/${replacingId}?sessionId=${sessionId}`;
          else if (oldItem.type === 'suggestion') delUrl = `/api/public/suggestions/${replacingId}?sessionId=${sessionId}`;
          else delUrl = `/api/public/reactions/${replacingId}?sessionId=${sessionId}`;
          fetch(delUrl, { method: 'DELETE' });
        } catch { /* silent */ }
      }
    }

    // If the pending range falls inside an active author note's range, link the
    // resulting feedback to that note so it surfaces in the per-note response view.
    const linkedNoteId = (() => {
      const active = activeAuthorNoteRangeRef.current;
      const activeId = activeAuthorNoteId;
      if (!active || !activeId) return null;
      const pStart = p.charStart;
      const pEnd = p.charStart + p.charLength;
      const aStart = active.charStart;
      const aEnd = active.charStart + active.charLength;
      return pStart < aEnd && pEnd > aStart ? activeId : null;
    })();

    const localId = Math.random().toString(36).slice(2);
    const type: FeedbackItem['type'] = p.mode === 'comment' ? 'comment' : p.mode;

    // Optimistically add to local state
    const newItem: FeedbackItem = {
      id: localId,
      type,
      charStart: p.charStart,
      charLength: p.charLength,
      comment: p.mode === 'comment' ? p.commentText : undefined,
      anchorY: p.anchorY,
      side: p.side,
      authorNoteId: linkedNoteId,
    };
    setFeedbackItems(prev => [...prev, newItem]);
    setPending(null);
    setFocusedFeedbackId(null);
    window.getSelection()?.removeAllRanges();
    showToast(p.mode === 'comment' ? 'Comment saved' : p.mode === 'like' ? 'Marked good' : 'Marked confusing');

    try {
      let url: string;
      let body: string;

      if (p.mode === 'comment') {
        url = '/api/public/comments';
        body = JSON.stringify({ sessionId, chapterVersionId: cd.versionId, body: p.commentText, selectedText: p.selectedText, authorNoteId: linkedNoteId });
      } else {
        url = '/api/public/reactions';
        body = JSON.stringify({ sessionId, chapterVersionId: cd.versionId, reaction: p.mode, selectedText: p.selectedText, authorNoteId: linkedNoteId });
      }

      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      if (res.ok) {
        const data = await res.json();
        // Replace local ID with server ID
        setFeedbackItems(prev => prev.map(item => item.id === localId ? { ...item, id: data.id } : item));
        if (linkedNoteId) refetchAuthorNotes();
      } else {
        console.error('Feedback save failed:', res.status);
      }
    } catch (err) {
      console.error('Feedback save error:', err);
    }
  }, [sessionId, activeAuthorNoteId]);

  const deleteFeedback = useCallback(async (id: string) => {
    const item = feedbackItemsRef.current.find(f => f.id === id);
    if (!item) return;

    setFeedbackItems(prev => prev.filter(f => f.id !== id));
    setFocusedFeedbackId(null);
    setPending(null);

    try {
      let url: string;
      if (item.type === 'comment') {
        url = `/api/public/comments/${id}?sessionId=${sessionId}`;
      } else if (item.type === 'suggestion') {
        url = `/api/public/suggestions/${id}?sessionId=${sessionId}`;
      } else {
        url = `/api/public/reactions/${id}?sessionId=${sessionId}`;
      }
      await fetch(url, { method: 'DELETE' });
    } catch (err) {
      console.error('Delete feedback error:', err);
    }
  }, [sessionId]);

  const enterSuggestionMode = useCallback((charStart: number, charLength: number, originalText: string) => {
    if (!contentRef.current || !chapterDataRef.current) return;
    setSuggEditMeta({ originalText, charStart, charLength });
    // Build HTML with inline contentEditable mark at the selection
    contentRef.current.innerHTML = buildHighlightedHtml(
      chapterDataRef.current.html,
      feedbackItemsRef.current,
      null,
      null,
      { charStart, charLength },
    );
    const mark = contentRef.current.querySelector('mark.suggestion-editing') as HTMLElement | null;
    if (mark) {
      mark.focus();
      // Select all so user can type to replace
      const range = document.createRange();
      range.selectNodeContents(mark);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
    setEditMode(true);
    setPending(null);
    setFocusedFeedbackId(null);
  }, []);

  const exitEditMode = useCallback((submit: boolean) => {
    if (!contentRef.current) return;
    const mark = contentRef.current.querySelector('mark.suggestion-editing') as HTMLElement | null;
    const suggestedText = mark?.textContent ?? '';
    const meta = suggEditMetaRef.current;

    if (submit && meta && suggestedText !== meta.originalText) {
      submitSuggestion(meta.originalText, suggestedText, meta.charStart);
    }

    setEditMode(false);
    setSuggEditMeta(null);
  }, []);

  const submitSuggestion = useCallback(async (originalText: string, suggestedText: string, charStartHint: number) => {
    const cd = chapterDataRef.current;
    if (!cd || !originalText || suggestedText == null || originalText === suggestedText) return;

    const localId = Math.random().toString(36).slice(2);

    const tmpItem: FeedbackItem = {
      id: localId,
      type: 'suggestion',
      charStart: charStartHint,
      charLength: originalText.length,
      suggestedText,
    };
    setFeedbackItems(prev => [...prev, tmpItem]);
    showToast('Edit proposed');

    // Link to active author note if this suggestion's range overlaps it.
    const linkedNoteId = (() => {
      const active = activeAuthorNoteRangeRef.current;
      const activeId = activeAuthorNoteId;
      if (!active || !activeId) return null;
      const pStart = charStartHint;
      const pEnd = charStartHint + originalText.length;
      const aStart = active.charStart;
      const aEnd = active.charStart + active.charLength;
      return pStart < aEnd && pEnd > aStart ? activeId : null;
    })();

    try {
      const res = await fetch('/api/public/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, chapterVersionId: cd.versionId, originalText, suggestedText, authorNoteId: linkedNoteId }),
      });
      if (res.ok) {
        const data = await res.json();
        // Replace placeholder with server data (accurate charStart from server)
        setFeedbackItems(prev => prev.map(f => f.id === localId ? {
          ...f,
          id: data.id,
          charStart: data.char_start ?? f.charStart,
          charLength: data.char_length ?? f.charLength,
        } : f));
        if (linkedNoteId) refetchAuthorNotes();
      } else {
        setFeedbackItems(prev => prev.filter(f => f.id !== localId));
        console.error('Suggestion save failed:', res.status);
      }
    } catch (err) {
      setFeedbackItems(prev => prev.filter(f => f.id !== localId));
      console.error('Suggestion save error:', err);
    }
  }, [sessionId, activeAuthorNoteId]);

  const suggEditMetaRef = useRef(suggEditMeta);
  useEffect(() => { suggEditMetaRef.current = suggEditMeta; }, [suggEditMeta]);

  // Open toolbar on an existing feedback item (used by highlight clicks + margin clicks)
  const focusOnItem = useCallback((itemId: string) => {
    const item = feedbackItemsRef.current.find(f => f.id === itemId);
    if (!item) return;
    const mark = contentRef.current?.querySelector(`mark[data-feedback-id="${itemId}"]`) as HTMLElement | null;
    const marginTop = contentRowRef.current?.getBoundingClientRect().top ?? 0;
    const rect = mark?.getBoundingClientRect();
    const textRect = textColRef.current?.getBoundingClientRect();

    const anchorY = rect ? rect.top - marginTop : (item.anchorY ?? 0);
    const markCenter = rect ? (rect.left + rect.right) / 2 : 0;
    const colCenter = textRect ? (textRect.left + textRect.right) / 2 : 0;
    const side = item.side ?? (markCenter < colCenter ? 'left' : 'right');

    setPending({
      selectedText: '',
      charStart: item.charStart,
      charLength: item.charLength,
      mode: item.type === 'dislike' ? 'dislike' : item.type === 'like' ? 'like' : 'comment',
      commentText: item.type === 'comment' ? (item.comment ?? '') : '',
      anchorY,
      side,
    });
    if (rect) setSelectionRect({ top: rect.top, left: rect.left, width: rect.width, bottom: rect.bottom });
    setFocusedFeedbackId(itemId);
  }, []);

  // Stable refs for keydown handler
  const submitPendingRef = useRef(submitPending);
  const deleteFeedbackRef = useRef(deleteFeedback);
  const enterSuggestionModeRef = useRef(enterSuggestionMode);
  const exitEditModeRef = useRef(exitEditMode);
  useEffect(() => { submitPendingRef.current = submitPending; }, [submitPending]);
  useEffect(() => { deleteFeedbackRef.current = deleteFeedback; }, [deleteFeedback]);
  useEffect(() => { enterSuggestionModeRef.current = enterSuggestionMode; }, [enterSuggestionMode]);
  useEffect(() => { exitEditModeRef.current = exitEditMode; }, [exitEditMode]);

  // Keydown handler — runs once, reads state via refs
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ctrl/Cmd+F → open search
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
        return;
      }

      // Don't intercept when typing in an input/textarea (e.g. mobile comment pill)
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      const p = pendingRef.current;
      const em = editModeRef.current;
      const fid = focusedIdRef.current;

      // In edit mode: only intercept Enter (submit) and Escape (cancel)
      if (em) {
        if (e.key === 'Enter') {
          e.preventDefault();
          exitEditModeRef.current(true);
        } else if (e.key === 'Escape') {
          exitEditModeRef.current(false);
        }
        return;
      }

      // Focused highlight without pending (legacy path): backspace = delete, escape = unfocus
      if (fid && !p) {
        if (e.key === 'Backspace' || e.key === 'Delete') {
          e.preventDefault();
          deleteFeedbackRef.current(fid);
        } else if (e.key === 'Escape') {
          setFocusedFeedbackId(null);
        }
        return;
      }
      // Focused highlight WITH pending (clicked existing item): delete = remove item, escape/enter = dismiss
      if (fid && p) {
        if (e.key === 'Backspace' || e.key === 'Delete') {
          e.preventDefault();
          setPending(null);
          setFocusedFeedbackId(null);
          deleteFeedbackRef.current(fid);
          return;
        }
        if (e.key === 'Escape' || e.key === 'Enter') {
          e.preventDefault();
          setPending(null);
          setFocusedFeedbackId(null);
          return;
        }
        // Ignore other keys — don't fall through to new-pending handlers
        return;
      }

      if (!p) return;

      if (e.key === 'Escape') {
        if (fid) {
          // Focused on existing item: just dismiss without saving a duplicate
          setPending(null);
          setFocusedFeedbackId(null);
        } else if (p.mode === 'like' || p.mode === 'dislike') {
          // For likes/dislikes: save on escape (highlight is already visible)
          submitPendingRef.current();
        } else {
          setPending(null);
        }
        window.getSelection()?.removeAllRanges();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (fid) {
          // Focused on existing item: dismiss without creating duplicate
          setPending(null);
          setFocusedFeedbackId(null);
        } else {
          submitPendingRef.current();
        }
        return;
      }
      // Arrow key → toggle good/confusing (only when no comment yet)
      if (p.commentText.length === 0 && e.key.startsWith('Arrow')) {
        e.preventDefault();
        setPending(prev => prev ? { ...prev, mode: prev.mode === 'like' ? 'dislike' : 'like' } : prev);
        return;
      }
      // Tab → enter inline suggestion editing mode
      if (e.key === 'Tab' && p.commentText.length === 0) {
        e.preventDefault();
        enterSuggestionModeRef.current(p.charStart, p.charLength, p.selectedText);
        return;
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        if (p.commentText.length === 0) {
          setPending(null);
          window.getSelection()?.removeAllRanges();
        } else {
          setPending(prev => prev ? { ...prev, commentText: prev.commentText.slice(0, -1) } : prev);
        }
        return;
      }
      // Printable char → comment mode
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setPending(prev => prev ? { ...prev, mode: 'comment', commentText: prev.commentText + e.key } : prev);
      }
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []); // once — uses refs

  // Mouse up handler
  useEffect(() => {
    const handleMouseUp = (e: MouseEvent) => {
      const target = e.target as Node;
      const targetEl = target.nodeType === Node.ELEMENT_NODE ? target as HTMLElement : target.parentElement;

      // Ignore clicks inside margin column or toolbar/pill UI
      if (targetEl?.closest('[data-margin-col]')) return;
      if (targetEl?.closest('[data-toolbar]')) return;

      const selection = window.getSelection();

      // Has a text selection → create pending
      if (selection && !selection.isCollapsed && selection.toString().trim() && contentRef.current) {
        // Make sure selection is within contentRef
        const range = selection.getRangeAt(0);
        if (!contentRef.current.contains(range.commonAncestorContainer)) return;

        const text = selection.toString().trim();
        const rect = range.getBoundingClientRect();

        const charStart = getCharOffset(contentRef.current, range.startContainer, range.startOffset);
        const charEnd = getCharOffset(contentRef.current, range.endContainer, range.endOffset);
        const charLength = Math.max(0, charEnd - charStart);

        // Prevent overlapping feedback — focus existing item instead
        const overlapping = feedbackItemsRef.current.find(item =>
          item.charStart < charStart + charLength && charStart < item.charStart + item.charLength
        );
        if (overlapping) {
          window.getSelection()?.removeAllRanges();
          focusOnItem(overlapping.id);
          return;
        }

        const marginTop = contentRowRef.current?.getBoundingClientRect().top ?? 0;
        const anchorY = rect.top - marginTop;

        // Compute side based on selection position
        const textRect = textColRef.current?.getBoundingClientRect();
        const items = feedbackItemsRef.current;
        const lItems = items.filter(f => f.side === 'left' && f.anchorY !== undefined).map(f => ({ anchorY: f.anchorY!, heightPx: computeItemHeight(f) }));
        const rItems = items.filter(f => f.side === 'right' && f.anchorY !== undefined).map(f => ({ anchorY: f.anchorY!, heightPx: computeItemHeight(f) }));
        const side = textRect ? assignSide(rect, textRect, lItems, rItems, anchorY) : 'right';

        setPending({
          selectedText: text,
          charStart,
          charLength,
          mode: 'like',
          commentText: '',
          anchorY,
          side,
        });
        setSelectionRect({ top: rect.top, left: rect.left, width: rect.width, bottom: rect.bottom });

        setFocusedFeedbackId(null);

        // On mobile, clear native selection to dismiss native toolbar
        if ('ontouchstart' in window) {
          setTimeout(() => window.getSelection()?.removeAllRanges(), 50);
        }
        return;
      }

      // Click with no selection
      if (!selection?.isCollapsed) return;

      // Click on existing mark → suggestions delete directly, others focus
      const mark = targetEl?.closest('mark[data-feedback-id]') as HTMLElement | null;
      if (mark && mark.dataset.feedbackId) {
        focusOnItem(mark.dataset.feedbackId);
        return;
      }

      // Click away from pending → auto-save likes/dislikes, submit comments
      // But if we're focused on an existing item, just dismiss (don't duplicate)
      if (pendingRef.current) {
        if (focusedIdRef.current) {
          setPending(null);
          setFocusedFeedbackId(null);
        } else {
          const p = pendingRef.current;
          if (p.mode === 'like' || p.mode === 'dislike' || (p.mode === 'comment' && p.commentText.length > 0)) {
            submitPendingRef.current();
          } else {
            setPending(null);
          }
        }
        return;
      }

      setFocusedFeedbackId(null);
    };

    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, []);

  // Auto-advance to next chapter
  useEffect(() => {
    if (!nextChapterId || !scrollSentinelRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) onNavigate(nextChapterId); },
      { threshold: 1.0 }
    );
    observer.observe(scrollSentinelRef.current);
    return () => observer.disconnect();
  }, [nextChapterId, onNavigate]);

  // Compute margin note positions with collision avoidance (side-based).
  // Postit-linked comments are excluded — they render in the per-postit reply stack instead.
  const marginItems = feedbackItems.filter(f =>
    (f.type === 'comment' || f.type === 'like' || f.type === 'dislike')
    && f.anchorY !== undefined
    && !(f.type === 'comment' && f.authorNoteId)
  );
  const leftItems = marginItems.filter(f => f.side === 'left').map(f => ({ id: f.id, anchorY: f.anchorY!, heightPx: computeItemHeight(f) }));
  const rightItems = marginItems.filter(f => f.side !== 'left').map(f => ({ id: f.id, anchorY: f.anchorY!, heightPx: computeItemHeight(f) }));
  // Postit footprints (right side only) become forbidden zones the placement algorithm dodges.
  const POSTIT_RENDER_WIDTH_PX = 260; // matches MarginColumn width
  const postitFootprints = authorNotes
    .map(n => {
      const top = authorNoteAnchorYs[n.id];
      if (top === undefined) return null;
      return { top, bottom: top + postitHeightPx(pickPostit(n.id), POSTIT_RENDER_WIDTH_PX) };
    })
    .filter((f): f is { top: number; bottom: number } => f !== null);
  const leftPositions = resolveMarginPositions(leftItems);
  const rightPositions = resolveMarginPositions(rightItems, postitFootprints);


  // Update anchor positions for all feedback items (comments + likes/dislikes for margin faces)
  useLayoutEffect(() => {
    if (!contentRef.current || !contentRowRef.current) return;
    const marginTop = contentRowRef.current.getBoundingClientRect().top;
    const textRect = textColRef.current?.getBoundingClientRect();
    setFeedbackItems(prev => prev.map(item => {
      if (item.type !== 'comment' && item.type !== 'like' && item.type !== 'dislike') return item;
      const mark = contentRef.current!.querySelector(`mark[data-feedback-id="${item.id}"]`) as HTMLElement | null;
      if (!mark) return item;
      const markRect = mark.getBoundingClientRect();
      const anchorY = markRect.top - marginTop;
      // Compute side for items that don't have one yet (loaded from server)
      if (!item.side && textRect) {
        const markCenter = (markRect.left + markRect.right) / 2;
        const colCenter = (textRect.left + textRect.right) / 2;
        return { ...item, anchorY, side: markCenter < colCenter ? 'left' as const : 'right' as const };
      }
      return { ...item, anchorY };
    }));
  }, [feedbackItems.map(f => `${f.id}:${f.anchorY !== undefined ? 1 : 0}`).join(','), editMode]);

  const updateNoteText = async (itemId: string, newText: string) => {
    setFeedbackItems(prev => prev.map(f => f.id === itemId ? { ...f, comment: newText } : f));
    setEditingNote(null);
    try {
      await fetch(`/api/public/comments/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, body: newText }),
      });
    } catch (err) {
      console.error('Update note error:', err);
    }
  };

  if (loading) {
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <DotLottiePlayer src="/loading.lottie" autoplay loop style={{ width: 120, height: 120 }} />
      </div>
    );
  }

  if (!chapterData) {
    return (
      <Paper initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <p style={{ fontFamily: 'var(--font-inter), system-ui, sans-serif', color: '#9a9892', fontSize: '0.9rem' }}>
          Chapter not found
        </p>
      </Paper>
    );
  }

  return (
    <>
      <PostitDefs />
      <HelpButton ref={helpBtnRef} onClick={() => setShowHelp(true)}>?</HelpButton>

      {/* Search bar */}
      <AnimatePresence>
        {searchOpen && (
          <SearchBar
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8, transition: { duration: 0.12 } }}
          >
            <SearchInput
              ref={searchInputRef}
              placeholder="Search..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (e.shiftKey) {
                    setCurrentMatchIdx(prev => prev > 0 ? prev - 1 : Math.max(0, searchMatches.length - 1));
                  } else {
                    setCurrentMatchIdx(prev => prev < searchMatches.length - 1 ? prev + 1 : 0);
                  }
                } else if (e.key === 'Escape') {
                  setSearchOpen(false);
                  setSearchQuery('');
                }
              }}
            />
            {searchQuery && (
              <SearchCount>{searchMatches.length > 0 ? `${currentMatchIdx + 1}/${searchMatches.length}` : '0'}</SearchCount>
            )}
            <SearchBtn onClick={() => setCurrentMatchIdx(prev => prev > 0 ? prev - 1 : Math.max(0, searchMatches.length - 1))}>
              ↑
            </SearchBtn>
            <SearchBtn onClick={() => setCurrentMatchIdx(prev => prev < searchMatches.length - 1 ? prev + 1 : 0)}>
              ↓
            </SearchBtn>
            <SearchBtn onClick={() => { setSearchOpen(false); setSearchQuery(''); }}>
              ✕
            </SearchBtn>
          </SearchBar>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showHelp && (
          <HelpOverlay
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.2, delay: 0.05 } }}
            onClick={() => { setShowHelp(false); localStorage.setItem('inklink-help-seen', '1'); }}
          >
            <HelpContent
              initial={{ opacity: 0, scale: 0.2, borderRadius: '50%' }}
              animate={{ opacity: 1, scale: 1, borderRadius: '12px', transition: { type: 'spring', stiffness: 500, damping: 32 } }}
              exit={{ opacity: 0, scale: 0.2, borderRadius: '50%', transition: { duration: 0.2, ease: [0.4, 0, 1, 1] } }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ fontSize: '0.9rem', fontWeight: 500, marginBottom: '0.75rem', color: '#1a1a18' }}>
                How to annotate
              </div>
              <div style={{ fontSize: '0.78rem', color: 'rgba(26,26,24,0.45)', marginBottom: '1rem' }}>
                Select any text to begin
              </div>
              {hasKeyboard ? (
                <>
                  <ShortcutRow><span>toggle like / dislike</span><ShortcutKey>← → ↑ ↓</ShortcutKey></ShortcutRow>
                  <ShortcutRow><span>suggest an edit</span><ShortcutKey>Tab</ShortcutKey></ShortcutRow>
                  <ShortcutRow><span>write a comment</span><ShortcutKey>start typing</ShortcutKey></ShortcutRow>
                  <ShortcutRow><span>submit</span><ShortcutKey>Enter</ShortcutKey></ShortcutRow>
                  <ShortcutRow><span>delete</span><ShortcutKey>Backspace</ShortcutKey></ShortcutRow>
                  <ShortcutRow><span>cancel</span><ShortcutKey>Esc</ShortcutKey></ShortcutRow>
                </>
              ) : (
                <>
                  <ShortcutRow><span>like / dislike</span><ShortcutKey>tap button</ShortcutKey></ShortcutRow>
                  <ShortcutRow><span>suggest an edit</span><ShortcutKey>suggest</ShortcutKey></ShortcutRow>
                  <ShortcutRow><span>write a comment</span><ShortcutKey>note</ShortcutKey></ShortcutRow>
                  <ShortcutRow><span>re-open toolbar</span><ShortcutKey>tap highlight</ShortcutKey></ShortcutRow>
                </>
              )}
            </HelpContent>
          </HelpOverlay>
        )}
      </AnimatePresence>

      <Paper
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -16 }}
        transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
      >
        <ContentRow ref={contentRowRef}>
          <MarginColumn data-margin-col="true">
            {/* Left-side reaction faces */}
            {marginItems.filter(f => f.side === 'left' && (f.type === 'like' || f.type === 'dislike')).map(item => {
              const faceSeed = `${item.charStart}_${item.charLength}`;
              const t = faceTransform(faceSeed);
              return (
                <MarginFaceImg
                  key={item.id}
                  src={pickFace(item.type as 'like' | 'dislike')}
                  alt={item.type === 'like' ? '😊' : '😕'}
                  onClick={() => focusOnItem(item.id)}
                  style={{
                    top: (leftPositions.get(item.id) ?? Math.max(0, item.anchorY ?? 0)) + t.offsetY,
                    right: `calc(-2.75rem + ${t.offsetX}px)`,
                    transform: `rotate(${t.rotation}deg)`,
                  }}
                />
              );
            })}
            {/* Left-side comment notes */}
            {marginItems.filter(f => f.side === 'left' && f.type === 'comment').map(item => (
              <MarginNoteEl
                key={item.id}
                $isPending={false}
                $side="left"
                style={{ top: leftPositions.get(item.id) ?? Math.max(0, item.anchorY ?? 0) }}
                onClick={() => {
                  if (editingNote?.itemId !== item.id) {
                    setEditingNote({ itemId: item.id, text: item.comment ?? '' });
                  }
                }}
              >
                {editingNote?.itemId === item.id ? (
                  <MarginNoteTextarea
                    autoFocus
                    value={editingNote.text}
                    onChange={e => setEditingNote({ ...editingNote, text: e.target.value })}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        updateNoteText(item.id, editingNote.text);
                      } else if (e.key === 'Escape') {
                        setEditingNote(null);
                      }
                    }}
                    onBlur={() => {
                      if (editingNote) updateNoteText(item.id, editingNote.text);
                    }}
                    rows={3}
                  />
                ) : (
                  item.comment
                )}
              </MarginNoteEl>
            ))}
            {/* Left-side pending annotation */}
            {pending && pending.side === 'left' && (
              pending.mode === 'comment' ? (
                <MarginNoteEl
                  $side="left"
                  style={{ top: Math.max(0, pending.anchorY) }}
                >
                  <MarginNoteTextarea
                    autoFocus
                    placeholder="write a note..."
                    value={pending.commentText}
                    onChange={e => {
                      const val = e.target.value;
                      setPending(prev => prev ? { ...prev, commentText: val } : prev);
                      if (pendingRef.current) pendingRef.current = { ...pendingRef.current, commentText: val };
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        submitPendingRef.current();
                      } else if (e.key === 'Escape') {
                        if (focusedFeedbackId) {
                          setPending(null);
                          setFocusedFeedbackId(null);
                        } else {
                          setPending(null);
                        }
                      }
                    }}
                    rows={3}
                  />
                </MarginNoteEl>
              ) : !focusedFeedbackId ? (
                (() => {
                  const faceSeed = `${pending.charStart}_${pending.charLength}`;
                  const t = faceTransform(faceSeed);
                  return (
                    <MarginFaceImg
                      src={pickFace(pending.mode as 'like' | 'dislike')}
                      alt={pending.mode === 'like' ? '😊' : '😕'}
                      style={{
                        top: Math.max(0, pending.anchorY) + t.offsetY,
                        right: `calc(-2.75rem + ${t.offsetX}px)`,
                        transform: `rotate(${t.rotation}deg)`,
                      }}
                    />
                  );
                })()
              ) : null
            )}
          </MarginColumn>
          <TextColumn ref={textColRef}>
            <ChapterTitle>{chapterData.chapter.title}</ChapterTitle>
            <ChapterContent
              ref={contentRef}
              data-chapter-content="true"
              // innerHTML is managed by useEffect, not dangerouslySetInnerHTML
            />
            {editMode && hasKeyboard && (
              <EditHint>type your edit · ↵ propose · esc cancel</EditHint>
            )}
          </TextColumn>
          <MarginColumn data-margin-col="true">
            {/* Author sticky notes (always visible, gold) */}
            {authorNotes.map(note => {
              const y = authorNoteAnchorYs[note.id];
              if (y === undefined) return null;
              const variant = pickPostit(note.id);
              const isActive = note.id === activeAuthorNoteId;
              const pollTotal = note.pollTallies ? note.pollTallies.reduce((a, b) => a + b, 0) : 0;
              return (
                <AuthorNoteSticky
                  key={`an-${note.id}`}
                  $active={isActive}
                  $variant={variant}
                  style={{ top: y }}
                  onMouseEnter={() => setHoveredAuthorNoteId(note.id)}
                  onMouseLeave={() => setHoveredAuthorNoteId(prev => prev === note.id ? null : prev)}
                  onClick={() => {
                    setActiveAuthorNoteId(prev => prev === note.id ? null : note.id);
                  }}
                >
                  <PostitVisual variant={variant} />
                  <PostitTexture $variant={variant} />
                  <NoteContent $variant={variant}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{note.body}</div>
                    {note.pollOptions && note.pollTallies && (
                      <PostitPoll onClick={e => e.stopPropagation()}>
                        {note.pollOptions.map((opt, i) => {
                          const n = note.pollTallies![i] ?? 0;
                          const pct = pollTotal > 0 ? Math.round((n / pollTotal) * 100) : 0;
                          const selected = note.myVote === i;
                          return (
                            <PostitPollRow
                              key={i}
                              $selected={selected}
                              $color={PIE_PALETTE[i % PIE_PALETTE.length]}
                              $pct={pct}
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (!sessionId) return;
                                try {
                                  await fetch('/api/public/author-notes/poll-vote', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ sessionId, authorNoteId: note.id, choiceIdx: i }),
                                  });
                                  refetchAuthorNotes();
                                } catch { /* silent */ }
                              }}
                            >
                              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opt}</span>
                              <span style={{ marginLeft: '0.4rem', fontSize: '0.8rem' }}>{pct}%</span>
                            </PostitPollRow>
                          );
                        })}
                      </PostitPoll>
                    )}
                  </NoteContent>
                </AuthorNoteSticky>
              );
            })}
            {/* Postit-linked comments stack directly under each postit, plus a reply
                textarea when this postit is the active reply target. */}
            {authorNotes.map(note => {
              const top = authorNoteAnchorYs[note.id];
              if (top === undefined) return null;
              const variant = pickPostit(note.id);
              const linkedComments = feedbackItems.filter(f => f.type === 'comment' && f.authorNoteId === note.id);
              const isReplying = activeAuthorNoteId === note.id && pending?.mode === 'comment';
              // While editing one of this postit's comments, hide it from the row list
              // so it shows only inside the textarea (avoids duplicate "hi"/"hi").
              const visibleComments = isReplying && focusedFeedbackId
                ? linkedComments.filter(c => c.id !== focusedFeedbackId)
                : linkedComments;
              if (visibleComments.length === 0 && !isReplying) return null;
              return (
                <PostitCommentStack key={`an-comments-${note.id}`} style={{ top: top + postitPaperBottomPx(variant, 260) + 15 }}>
                  {visibleComments.map(c => (
                    <PostitCommentRow key={c.id}>{c.comment}</PostitCommentRow>
                  ))}
                  {isReplying && (
                    <PostitReplyTextarea
                      autoFocus
                      placeholder="reply..."
                      value={pending!.commentText}
                      onChange={e => {
                        const val = e.target.value;
                        setPending(prev => prev ? { ...prev, commentText: val } : prev);
                        if (pendingRef.current) pendingRef.current = { ...pendingRef.current, commentText: val };
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          submitPendingRef.current();
                        } else if (e.key === 'Escape') {
                          setPending(null);
                        }
                      }}
                      rows={2}
                    />
                  )}
                </PostitCommentStack>
              );
            })}
            {/* Right-side reaction faces (default for items without side) */}
            {marginItems.filter(f => f.side !== 'left' && (f.type === 'like' || f.type === 'dislike')).map(item => {
              const faceSeed = `${item.charStart}_${item.charLength}`;
              const t = faceTransform(faceSeed);
              return (
                <MarginFaceImg
                  key={item.id}
                  src={pickFace(item.type as 'like' | 'dislike')}
                  alt={item.type === 'like' ? '😊' : '😕'}
                  onClick={() => focusOnItem(item.id)}
                  style={{
                    top: (rightPositions.get(item.id) ?? Math.max(0, item.anchorY ?? 0)) + t.offsetY,
                    left: `calc(-2.75rem + ${t.offsetX}px)`,
                    transform: `rotate(${t.rotation}deg)`,
                  }}
                />
              );
            })}
            {/* Right-side comment notes */}
            {marginItems.filter(f => f.side !== 'left' && f.type === 'comment').map(item => (
              <MarginNoteEl
                key={item.id}
                $isPending={false}
                $side="right"
                style={{ top: rightPositions.get(item.id) ?? Math.max(0, item.anchorY ?? 0) }}
                onClick={() => {
                  if (editingNote?.itemId !== item.id) {
                    setEditingNote({ itemId: item.id, text: item.comment ?? '' });
                  }
                }}
              >
                {editingNote?.itemId === item.id ? (
                  <MarginNoteTextarea
                    autoFocus
                    value={editingNote.text}
                    onChange={e => setEditingNote({ ...editingNote, text: e.target.value })}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        updateNoteText(item.id, editingNote.text);
                      } else if (e.key === 'Escape') {
                        setEditingNote(null);
                      }
                    }}
                    onBlur={() => {
                      if (editingNote) updateNoteText(item.id, editingNote.text);
                    }}
                    rows={3}
                  />
                ) : (
                  item.comment
                )}
              </MarginNoteEl>
            ))}
            {/* Right-side pending annotation (skipped when replying to a postit — the
                reply textarea renders inside the postit's PostitCommentStack instead). */}
            {pending && pending.side !== 'left' && !activeAuthorNoteId && (
              pending.mode === 'comment' ? (
                <MarginNoteEl
                  $side="right"
                  style={{ top: Math.max(0, pending.anchorY) }}
                >
                  <MarginNoteTextarea
                    autoFocus
                    placeholder="write a note..."
                    value={pending.commentText}
                    onChange={e => {
                      const val = e.target.value;
                      setPending(prev => prev ? { ...prev, commentText: val } : prev);
                      if (pendingRef.current) pendingRef.current = { ...pendingRef.current, commentText: val };
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        submitPendingRef.current();
                      } else if (e.key === 'Escape') {
                        if (focusedFeedbackId) {
                          setPending(null);
                          setFocusedFeedbackId(null);
                        } else {
                          setPending(null);
                        }
                      }
                    }}
                    rows={3}
                  />
                </MarginNoteEl>
              ) : !focusedFeedbackId ? (
                (() => {
                  const faceSeed = `${pending.charStart}_${pending.charLength}`;
                  const t = faceTransform(faceSeed);
                  return (
                    <MarginFaceImg
                      src={pickFace(pending.mode as 'like' | 'dislike')}
                      alt={pending.mode === 'like' ? '😊' : '😕'}
                      style={{
                        top: Math.max(0, pending.anchorY) + t.offsetY,
                        left: `calc(-2.75rem + ${t.offsetX}px)`,
                        transform: `rotate(${t.rotation}deg)`,
                      }}
                    />
                  );
                })()
              ) : null
            )}
          </MarginColumn>
        </ContentRow>
      </Paper>

      {!emailSubmitted ? (
        <EmailSection>
          <EmailTitle>Enjoying this? Sign up to read more</EmailTitle>
          <EmailRow onSubmit={e => { e.preventDefault(); submitEmail(); }}>
            <EmailInput
              type="email"
              placeholder="your@email.com"
              value={emailInput}
              onChange={e => setEmailInput(e.target.value)}
            />
            <EmailSubmitBtn type="submit" disabled={emailSubmitting}>
              {emailSubmitting ? '...' : 'Subscribe'}
            </EmailSubmitBtn>
          </EmailRow>
        </EmailSection>
      ) : (
        <EmailSection>
          <EmailSubtitle>You're on the list.</EmailSubtitle>
        </EmailSection>
      )}

      <ChapterNav>
        {prevChapterId
          ? <NavButton onClick={() => onNavigate(prevChapterId)}>← Previous chapter</NavButton>
          : <span />}
        {nextChapterId
          ? <NavButton onClick={() => onNavigate(nextChapterId)}>Next chapter →</NavButton>
          : <span />}
      </ChapterNav>

      <div ref={scrollSentinelRef} style={{ height: 1 }} />


      {/* Selection toolbar: desktop only, shows near highlighted text */}
      <AnimatePresence>
        {hasKeyboard && pending && !editMode && selectionRect && (
          <SelectionToolbar
            key="selection-toolbar"
            data-toolbar
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4, transition: { duration: 0.12 } }}
            style={{
              top: selectionRect.top - 60 > 0 ? selectionRect.top - 60 : selectionRect.bottom + 12,
              left: Math.min(window.innerWidth - 260, Math.max(8, selectionRect.left + selectionRect.width / 2 - 120)),
            }}
          >
            <ToolbarBtn
              $active={pending.mode === 'like' && pending.commentText.length === 0}
              onClick={() => {
                pendingRef.current = pendingRef.current ? { ...pendingRef.current, mode: 'like', commentText: '' } : null;
                setPending(p => p ? { ...p, mode: 'like', commentText: '' } : p);
                submitPendingRef.current();
              }}
              aria-label="good"
            ><KeyCap><ReactionIcon $src="/good_react.svg" /></KeyCap></ToolbarBtn>
            <ToolbarBtn
              $active={pending.mode === 'dislike' && pending.commentText.length === 0}
              onClick={() => {
                pendingRef.current = pendingRef.current ? { ...pendingRef.current, mode: 'dislike', commentText: '' } : null;
                setPending(p => p ? { ...p, mode: 'dislike', commentText: '' } : p);
                submitPendingRef.current();
              }}
              aria-label="confusing"
            ><KeyCap><ReactionIcon $src="/not_good_react.svg" /></KeyCap></ToolbarBtn>
            <ToolbarBtn onClick={() => {
              // For focused items, extract original text from DOM since selectedText may be empty
              const originalText = pending.selectedText || (contentRef.current ? extractTextRange(contentRef.current, pending.charStart, pending.charLength) : '');
              if (focusedFeedbackId) deleteFeedback(focusedFeedbackId);
              enterSuggestionModeRef.current(pending.charStart, pending.charLength, originalText);
            }}>
              <KeyCap $plain>suggest</KeyCap>
            </ToolbarBtn>
            <ToolbarBtn onClick={() => {
              setPending(p => p ? { ...p, mode: 'comment' } : p);
            }}><KeyCap $plain>{activeAuthorNoteId ? 'reply' : 'note'}</KeyCap></ToolbarBtn>
            {focusedFeedbackId ? (
              <ToolbarBtn onClick={() => deleteFeedback(focusedFeedbackId)} aria-label="delete"><KeyCap $small><ReactionIcon $src="/delete.left.svg" /></KeyCap></ToolbarBtn>
            ) : (
              <ToolbarBtn onClick={() => setPending(null)} aria-label="dismiss"><KeyCap $small><ReactionIcon $src="/delete.left.svg" /></KeyCap></ToolbarBtn>
            )}
          </SelectionToolbar>
        )}
      </AnimatePresence>

      {/* Floating pill: touch/no-keyboard devices only */}
      <AnimatePresence>
        {!hasKeyboard && pending && !editMode && (
          <MobilePill
            data-toolbar
            initial={{ opacity: 0, y: 20, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 8, x: '-50%', transition: { duration: 0.15 } }}
          >
            {mobileCommentMode ? (
              <>
                <PillInput
                  autoFocus
                  placeholder="comment..."
                  value={mobileCommentText}
                  onChange={e => setMobileCommentText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && mobileCommentText.trim()) {
                      e.preventDefault();
                      pendingRef.current = pendingRef.current
                        ? { ...pendingRef.current, mode: 'comment', commentText: mobileCommentText.trim() }
                        : null;
                      submitPendingRef.current();
                    }
                  }}
                />
                <PillBtn onClick={() => {
                  if (!mobileCommentText.trim()) return;
                  pendingRef.current = pendingRef.current
                    ? { ...pendingRef.current, mode: 'comment', commentText: mobileCommentText.trim() }
                    : null;
                  submitPendingRef.current();
                }}><KeyCap $plain>send</KeyCap></PillBtn>
                <PillBtn $small onClick={() => { setMobileCommentMode(false); setMobileCommentText(''); }}><KeyCap $small>✕</KeyCap></PillBtn>
              </>
            ) : (
              <>
                <PillBtn
                  $active={pending.mode === 'like'}
                  onClick={() => {
                    pendingRef.current = pendingRef.current ? { ...pendingRef.current, mode: 'like' } : null;
                    setPending(p => p ? { ...p, mode: 'like' } : p);
                    submitPendingRef.current();
                  }}
                  aria-label="good"
                ><KeyCap><ReactionIcon $src="/good_react.svg" /></KeyCap></PillBtn>
                <PillBtn
                  $active={pending.mode === 'dislike'}
                  onClick={() => {
                    pendingRef.current = pendingRef.current ? { ...pendingRef.current, mode: 'dislike' } : null;
                    setPending(p => p ? { ...p, mode: 'dislike' } : p);
                    submitPendingRef.current();
                  }}
                  aria-label="confusing"
                ><KeyCap><ReactionIcon $src="/not_good_react.svg" /></KeyCap></PillBtn>
                <PillBtn onClick={() => {
                  const originalText = pending.selectedText || (contentRef.current ? extractTextRange(contentRef.current, pending.charStart, pending.charLength) : '');
                  if (focusedFeedbackId) deleteFeedback(focusedFeedbackId);
                  enterSuggestionModeRef.current(pending.charStart, pending.charLength, originalText);
                }}><KeyCap $plain>suggest</KeyCap></PillBtn>
                <PillBtn onClick={() => { setMobileCommentMode(true); setMobileCommentText(''); }}><KeyCap $plain>{activeAuthorNoteId ? 'reply' : 'note'}</KeyCap></PillBtn>
                {focusedFeedbackId ? (
                  <PillBtn $small onClick={() => deleteFeedback(focusedFeedbackId)} aria-label="delete"><KeyCap $small><ReactionIcon $src="/delete.left.svg" /></KeyCap></PillBtn>
                ) : (
                  <PillBtn $small onClick={() => setPending(null)} aria-label="dismiss"><KeyCap $small><ReactionIcon $src="/delete.left.svg" /></KeyCap></PillBtn>
                )}
              </>
            )}
          </MobilePill>
        )}
      </AnimatePresence>

      {/* Desktop hint bar */}
      <AnimatePresence>
        {hasKeyboard && !editMode && (pending || focusedFeedbackId) && (
          <DesktopHint
            key="desktop-hint"
            data-toolbar
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {focusedFeedbackId && !pending ? (
              // Focused on existing highlight (no pending toolbar)
              <>
                <span>esc unfocus</span>
                <HintDeleteBtn onClick={() => deleteFeedback(focusedFeedbackId)}>✕ delete</HintDeleteBtn>
              </>
            ) : pending?.mode === 'comment' ? (
              <>
                <span>↵ submit · esc cancel · ⌫ delete char</span>
                {focusedFeedbackId && <HintDeleteBtn onClick={() => deleteFeedback(focusedFeedbackId)}>✕ delete</HintDeleteBtn>}
              </>
            ) : (
              <>
                <span>↑↓ toggle · type to note · tab to edit · ↵ submit · esc cancel</span>
                {focusedFeedbackId && <HintDeleteBtn onClick={() => deleteFeedback(focusedFeedbackId)}>✕ delete</HintDeleteBtn>}
              </>
            )}
          </DesktopHint>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {showSuccessToast && (
          <SuccessToast
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4, transition: { duration: 0.15 } }}
          >
            {toastMessage}
          </SuccessToast>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {footnoteHover && (
          <FootnotePopover
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4, transition: { duration: 0.1 } }}
            transition={{ duration: 0.15 }}
            style={{
              left: Math.max(12, Math.min(window.innerWidth - 332, footnoteHover.x - 160)),
              top: Math.max(12, footnoteHover.y - 12),
              transform: 'translateY(-100%)',
            }}
            dangerouslySetInnerHTML={{ __html: footnoteHover.text }}
          />
        )}
      </AnimatePresence>

    </>
  );
}
