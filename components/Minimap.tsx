'use client';

import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { Chapter } from '@/types';

const MinimapContainer = styled.div`
  position: fixed;
  left: 14px;
  top: 0;
  height: 100vh;
  width: 28px;
  z-index: 198;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 2rem 0;
  cursor: pointer;

  @media (max-width: 768px) {
    display: none;
  }
`;

const MinimapInner = styled.div`
  display: flex;
  flex-direction: column;
  padding: 0 6px;
  width: 100%;
`;

const ChapterBlock = styled.div<{ $isCurrent: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 2px 0;
  border-top: 1px solid ${p => p.$isCurrent ? 'rgba(26,26,24,0.18)' : 'rgba(26,26,24,0.06)'};
  &:first-child { border-top: none; }
`;

const MinimapLine = styled.div<{
  $active: boolean;
  $width: number;
  $dim: boolean;
  $thick: boolean;
}>`
  height: ${p => p.$thick ? 2 : 1}px;
  border-radius: 1px;
  background: ${p =>
    p.$active
      ? 'rgba(26,26,24,0.7)'
      : p.$dim
        ? 'rgba(26,26,24,0.10)'
        : 'rgba(26,26,24,0.22)'};
  width: ${p => Math.max(4, p.$width)}px;
  transition: background 0.2s ease;
`;

const DEFAULT_OTHER_LINES = 6;

interface MinimapProps {
  contentRef: React.RefObject<HTMLDivElement | null>;
  onHoverStart: () => void;
  chapters: Chapter[];
  currentChapterId: string | null;
  onChapterChange: (id: string) => void;
}

export default function Minimap({
  contentRef,
  onHoverStart,
  chapters,
  currentChapterId,
  onChapterChange,
}: MinimapProps) {
  const [paragraphs, setParagraphs] = useState<{ length: number }[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    const parseContent = () => {
      if (!contentRef.current) return;
      const els = contentRef.current.querySelectorAll('p, blockquote, h1, h2, h3, h4, h5, h6');
      const pData = Array.from(els).map(el => ({
        length: (el.textContent || '').length,
      }));
      if (pData.length > 0) setParagraphs(pData);
      else setParagraphs([]);
    };

    parseContent();
    const timer = setTimeout(parseContent, 200);

    const observer = new MutationObserver(parseContent);
    const checkRef = setInterval(() => {
      if (contentRef.current) {
        clearInterval(checkRef);
        observer.observe(contentRef.current, { childList: true, subtree: true });
        parseContent();
      }
    }, 100);

    return () => {
      clearTimeout(timer);
      clearInterval(checkRef);
      observer.disconnect();
    };
  }, [currentChapterId]);

  useEffect(() => {
    const onScroll = () => {
      if (!contentRef.current) return;
      const els = contentRef.current.querySelectorAll('p, blockquote, h1, h2, h3, h4, h5, h6');
      const viewCenter = window.innerHeight / 2;
      let closestIdx = 0;
      let closestDist = Infinity;
      els.forEach((el, i) => {
        const rect = el.getBoundingClientRect();
        const dist = Math.abs(rect.top + rect.height / 2 - viewCenter);
        if (dist < closestDist) {
          closestDist = dist;
          closestIdx = i;
        }
      });
      setActiveIdx(closestIdx);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [paragraphs.length]);

  const handleParagraphClick = (idx: number) => {
    if (!contentRef.current) return;
    const els = contentRef.current.querySelectorAll('p, blockquote, h1, h2, h3, h4, h5, h6');
    if (els[idx]) {
      els[idx].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  if (chapters.length === 0) return null;

  const maxLen = paragraphs.length > 0 ? Math.max(...paragraphs.map(p => p.length)) : 1;

  return (
    <MinimapContainer onMouseEnter={onHoverStart}>
      <MinimapInner>
        {chapters.map(ch => {
          const isCurrent = ch.id === currentChapterId;
          const lines: React.ReactNode[] = [];

          if (isCurrent && paragraphs.length > 0) {
            paragraphs.forEach((p, i) => {
              lines.push(
                <MinimapLine
                  key={`${ch.id}-p-${i}`}
                  $active={i === activeIdx}
                  $width={Math.round((p.length / maxLen) * 16)}
                  $dim={false}
                  $thick
                  onClick={e => {
                    e.stopPropagation();
                    handleParagraphClick(i);
                  }}
                />,
              );
            });
          } else {
            const n = Math.max(2, Math.min(12, Math.round((ch.lineCount ?? DEFAULT_OTHER_LINES) / 4)));
            for (let i = 0; i < n; i++) {
              lines.push(
                <MinimapLine
                  key={`${ch.id}-ph-${i}`}
                  $active={false}
                  $width={8}
                  $dim
                  $thick={false}
                />,
              );
            }
          }

          return (
            <ChapterBlock
              key={ch.id}
              $isCurrent={isCurrent}
              onClick={() => {
                if (!isCurrent) onChapterChange(ch.id);
              }}
              title={ch.title}
            >
              {lines}
            </ChapterBlock>
          );
        })}
      </MinimapInner>
    </MinimapContainer>
  );
}
