'use client';

import { useState, useMemo } from 'react';
import styled from 'styled-components';
import { AnimatePresence, motion } from 'framer-motion';
import AnimateNumber from './AnimateNumber';
import { useApi } from '@/lib/useApi';
import type { ChapterStats } from '@/lib/ingest/compute-stats';

/* ── Styled Components ── */

const Wrap = styled.div`
  padding: 2rem 2.5rem;
  font-family: var(--font-inter), system-ui, sans-serif;
`;

const TilesRow = styled.div`
  display: flex;
  gap: 1.75rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
`;

const Tile = styled.button<{ $clickable?: boolean; $active?: boolean }>`
  appearance: none;
  border: none;
  background: transparent;
  text-align: left;
  padding: 0.4rem 0;
  cursor: ${p => (p.$clickable ? 'pointer' : 'default')};
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  border-bottom: 1px solid ${p => (p.$active ? 'rgba(26,26,24,0.55)' : 'transparent')};
  transition: border-color 0.15s ease, color 0.15s ease;

  &:hover {
    ${p => p.$clickable && !p.$active && 'border-bottom-color: rgba(26,26,24,0.18);'}
  }

  > span.label {
    font-size: 0.62rem;
    font-weight: 500;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(26,26,24,0.4);
  }

  strong {
    font-size: 1.4rem;
    font-weight: 500;
    color: #1a1a18;
    font-variant-numeric: tabular-nums;
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
  }

  span.variance {
    font-size: 0.72rem;
    color: rgba(26,26,24,0.35);
    font-weight: 400;
  }
`;

const ChipTile = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.4rem;

  > span.label {
    font-size: 0.62rem;
    font-weight: 500;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(26,26,24,0.4);
  }
`;

const Chips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
`;

const Chip = styled.span`
  font-size: 0.78rem;
  color: #1a1a18;
  background: rgba(26,26,24,0.05);
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  font-variant-numeric: tabular-nums;

  em {
    font-style: normal;
    color: rgba(26,26,24,0.4);
    margin-left: 0.35rem;
    font-size: 0.72rem;
  }
`;

const SectionLabel = styled.div`
  font-size: 0.62rem;
  font-weight: 500;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(26,26,24,0.4);
  margin: 1.25rem 0 0.75rem;
`;

const ChartList = styled(motion.div)`
  display: flex;
  flex-direction: column;
  border-top: 1px solid rgba(26,26,24,0.08);
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: minmax(160px, 28%) 1fr;
  align-items: baseline;
  gap: 1.25rem;
  padding: 0.4rem 0;
  border-bottom: 1px solid rgba(26,26,24,0.04);

  &:hover {
    .spike-line { background: rgba(26,26,24,0.55); }
    .spike-dot { background: rgba(26,26,24,0.7); }
    .count { color: rgba(26,26,24,0.7); }
  }
`;

const SpikeCell = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-variant-numeric: tabular-nums;
`;

const Count = styled.span.attrs({ className: 'count' })`
  font-size: 0.72rem;
  color: rgba(26,26,24,0.35);
  width: 2.4rem;
  text-align: right;
  font-weight: 500;
  letter-spacing: 0.04em;
  transition: color 0.12s ease;
`;

const SpikeBar = styled.div`
  position: relative;
  flex: 1;
  height: 1px;
  display: flex;
  align-items: center;
`;

const SpikeLine = styled.div.attrs({ className: 'spike-line' })<{ $pct: number }>`
  height: 1px;
  width: ${p => p.$pct}%;
  background: rgba(26,26,24,0.25);
  transition: background 0.12s ease;
`;

const SpikeDot = styled.div.attrs({ className: 'spike-dot' })`
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgba(26,26,24,0.4);
  margin-left: -1px;
  transition: background 0.12s ease;
`;

const RowText = styled.div`
  font-family: var(--font-playfair), Georgia, serif;
  font-size: 0.95rem;
  color: rgba(26,26,24,0.7);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const Empty = styled.div`
  color: rgba(26,26,24,0.4);
  font-size: 0.9rem;
`;

const LoadingText = styled.p`
  color: rgba(26,26,24,0.35);
  font-size: 0.85rem;
`;

/* ── Component ── */

type ChartKey = 'sentences' | 'paragraphs' | null;

export default function StatsView({ versionId }: { versionId: string | null }) {
  const url = versionId ? `/api/dashboard/chapter-versions/${versionId}/stats` : null;
  const { data, loading } = useApi<{ stats: ChapterStats | null }>(url);
  const [chart, setChart] = useState<ChartKey>(null);

  const stats = data?.stats ?? null;

  const rows = useMemo(() => {
    if (!stats || !chart) return [];
    const items = chart === 'sentences' ? stats.sentences : stats.paragraphs;
    const max = items.reduce((m, x) => Math.max(m, x.words), 0) || 1;
    return items.map((it, i) => ({ ...it, key: i, pct: (it.words / max) * 100 }));
  }, [stats, chart]);

  if (!versionId || loading) {
    return <Wrap><LoadingText>Loading stats...</LoadingText></Wrap>;
  }
  if (!stats) {
    return <Wrap><Empty>No stats yet for this version. They&rsquo;ll appear after the next ingest.</Empty></Wrap>;
  }

  return (
    <Wrap>
      <TilesRow>
        <Tile as="div">
          <span className="label">Word count</span>
          <strong>
            <AnimateNumber transition={{ type: 'spring', bounce: 0, duration: 0.4 }}>{stats.wordCount}</AnimateNumber>
          </strong>
        </Tile>
        <Tile as="div">
          <span className="label">Reading level</span>
          <strong>
            <AnimateNumber transition={{ type: 'spring', bounce: 0, duration: 0.4 }}>{stats.readingLevel}</AnimateNumber>
          </strong>
        </Tile>
        <Tile
          $clickable
          $active={chart === 'sentences'}
          onClick={() => setChart(chart === 'sentences' ? null : 'sentences')}
        >
          <span className="label">Avg sentence length</span>
          <strong>
            <AnimateNumber transition={{ type: 'spring', bounce: 0, duration: 0.4 }}>{stats.avgSentenceLength}</AnimateNumber>
            <span className="variance">± {stats.sentenceLengthVariance}</span>
          </strong>
        </Tile>
        <Tile
          $clickable
          $active={chart === 'paragraphs'}
          onClick={() => setChart(chart === 'paragraphs' ? null : 'paragraphs')}
        >
          <span className="label">Avg paragraph length</span>
          <strong>
            <AnimateNumber transition={{ type: 'spring', bounce: 0, duration: 0.4 }}>{stats.avgParagraphLength}</AnimateNumber>
            <span className="variance">± {stats.paragraphLengthVariance}</span>
          </strong>
        </Tile>
        <ChipTile>
          <span className="label">Top verbs</span>
          <Chips>
            {stats.topVerbs.length === 0
              ? <Chip>—</Chip>
              : stats.topVerbs.map(v => <Chip key={v.word}>{v.word}<em>{v.count}</em></Chip>)
            }
          </Chips>
        </ChipTile>
        <ChipTile>
          <span className="label">Top adjectives</span>
          <Chips>
            {stats.topAdjectives.length === 0
              ? <Chip>—</Chip>
              : stats.topAdjectives.map(v => <Chip key={v.word}>{v.word}<em>{v.count}</em></Chip>)
            }
          </Chips>
        </ChipTile>
      </TilesRow>

      <AnimatePresence mode="wait" initial={false}>
        {chart && (
          <motion.div
            key={chart}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            <SectionLabel>
              {chart === 'sentences' ? 'Words per sentence' : 'Words per paragraph'}
            </SectionLabel>
            <ChartList>
              {rows.map(r => (
                <Row key={r.key}>
                  <SpikeCell>
                    <Count>{r.words}</Count>
                    <SpikeBar>
                      <SpikeLine $pct={r.pct} />
                      <SpikeDot />
                    </SpikeBar>
                  </SpikeCell>
                  <RowText>{r.text}</RowText>
                </Row>
              ))}
            </ChartList>
          </motion.div>
        )}
      </AnimatePresence>
    </Wrap>
  );
}
