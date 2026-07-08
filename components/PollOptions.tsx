'use client';

import styled from 'styled-components';

/**
 * Poll options on a postit. Hand-drawn checkbox + label per option. Layout
 * depends on count: a single column for ≤3 options, a 2×2 column-major grid for
 * 4. A random one of the four hand-drawn checkbox SVGs is picked per option
 * (stable, seeded by the note id). Readers vote by clicking; in the admin view
 * results show as a subtle fill + count.
 */

export const MAX_POLL_OPTION_CHARS = 14;

const PALETTE = ['#b78a26', '#7d6cab', '#3e8e7e', '#c5605d'];

function checkboxSrc(seed: string, i: number): string {
  let h = 0;
  const s = `${seed}:${i}`;
  for (let k = 0; k < s.length; k++) h = (h * 31 + s.charCodeAt(k)) >>> 0;
  return `/checkbox${(h % 4) + 1}.svg`;
}

const Grid = styled.div<{ $grid: boolean }>`
  margin-top: 0.55rem;
  display: ${p => (p.$grid ? 'grid' : 'flex')};
  ${p => (p.$grid
    ? 'grid-template-columns: 1fr 1fr; grid-template-rows: auto auto; grid-auto-flow: column; column-gap: 0.55rem; row-gap: 0.3rem;'
    : 'flex-direction: column; gap: 0.32rem;')}
`;

const Option = styled.button<{ $clickable: boolean }>`
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  width: 100%;
  min-width: 0;
  border: none;
  background: transparent;
  text-align: left;
  padding: 0.06rem 0.15rem;
  border-radius: 3px;
  cursor: ${p => (p.$clickable ? 'pointer' : 'default')};
  font-family: 'Figma Hand', var(--font-caveat), 'Caveat', cursive;
  font-size: 1.05rem;
  line-height: 1.1;
  color: #3a2e0e;
  z-index: 1;
  &:hover {
    ${p => p.$clickable && 'background: rgba(0,0,0,0.05);'}
  }
`;

const Box = styled.span`
  position: relative;
  flex-shrink: 0;
  width: 1.1rem;
  height: 1.1rem;
  img { width: 100%; height: 100%; display: block; }
`;

const Check = styled.span`
  position: absolute;
  inset: -0.1rem 0 0 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.05rem;
  line-height: 1;
  color: #3a2e0e;
  pointer-events: none;
`;

const Label = styled.span`
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Count = styled.span`
  flex-shrink: 0;
  font-size: 0.82rem;
  opacity: 0.6;
`;

const Fill = styled.span<{ $pct: number; $color: string }>`
  position: absolute;
  inset: 0;
  width: ${p => p.$pct}%;
  background: ${p => p.$color};
  opacity: 0.16;
  border-radius: 3px;
  z-index: -1;
  transition: width 0.2s ease;
`;

export default function PollOptions({ options, seed, selectedIdx, tallies, onVote }: {
  options: string[];
  seed: string;
  selectedIdx?: number | null;
  /** When provided (admin view), show results as a fill + count. */
  tallies?: number[] | null;
  /** When provided (reader view), options are clickable to vote. */
  onVote?: (i: number) => void;
}) {
  const total = tallies ? tallies.reduce((a, b) => a + b, 0) : 0;
  const grid = options.length === 4;
  return (
    <Grid $grid={grid} onClick={e => e.stopPropagation()}>
      {options.map((opt, i) => {
        const n = tallies ? (tallies[i] ?? 0) : 0;
        const pct = total > 0 ? Math.round((n / total) * 100) : 0;
        return (
          <Option
            key={i}
            as={onVote ? 'button' : 'div'}
            $clickable={!!onVote}
            onClick={onVote ? (e: React.MouseEvent) => { e.stopPropagation(); onVote(i); } : undefined}
            title={opt}
          >
            {tallies && <Fill $pct={pct} $color={PALETTE[i % PALETTE.length]} />}
            <Box>
              <img src={checkboxSrc(seed, i)} alt="" />
              {selectedIdx === i && <Check>✓</Check>}
            </Box>
            <Label>{opt}</Label>
            {tallies && <Count>{n}</Count>}
          </Option>
        );
      })}
    </Grid>
  );
}
