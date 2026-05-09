'use client';

import { Fragment } from 'react';
import styled from 'styled-components';

export const POSTIT_VARIANTS = ['A', 'B', 'C', 'D'] as const;
export type PostitVariant = typeof POSTIT_VARIANTS[number];

export function pickPostit(id: string): PostitVariant {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return POSTIT_VARIANTS[h % POSTIT_VARIANTS.length];
}

type PostitConfig = {
  vb: [number, number];
  shadow: { x: number; y: number; w: number; h: number; std: number };
  paperD: string;
  paperBox: { x: number; y: number; w: number; h: number };
  gradD: string;
  innerShadow: { x: number; y: number; w: number; h: number; color: string; std: number };
};

export const POSTIT_CONFIGS: Record<PostitVariant, PostitConfig> = {
  A: {
    vb: [74, 54],
    shadow: { x: 9, y: 24, w: 61, h: 23, std: 2 },
    paperD: 'M10.3787 46C34.4945 44.5888 47.7232 44.9014 71.3787 45.2277C70.7173 37.7332 70.3787 30.1572 70.3787 22.5106C70.3751 15.2735 72 0 72 0H71.5H10.3787C8.63861 18.6208 8.44481 28.7656 10.3787 46Z',
    paperBox: { x: 10, y: 0, w: 62, h: 46 },
    gradD: 'M71.7275 0L71.7676 0.139648C71.4977 3.24604 71.2848 6.36647 71.127 9.5H10C10.2117 6.55502 10.4792 3.42051 10.7988 0H71.7275Z',
    innerShadow: { x: 10, y: 21, w: 43, h: 23, color: '#A1A1A1', std: 5 },
  },
  B: {
    vb: [69, 50],
    shadow: { x: 4, y: 23, w: 61, h: 23, std: 2 },
    paperD: 'M2 46C14.9855 44.2129 21.5131 44.2985 63 45.2277C64.6333 37.8705 64.6011 0.236609 62.9693 0.139485C61.3375 0.0423608 62.9286 0 62.9286 0H2C2.79841 22.4252 2.39045 32.3423 2 46Z',
    paperBox: { x: 2, y: 0, w: 61, h: 46 },
    gradD: 'M63.7275 0L63.7676 0.139648C63.4977 3.24604 63.2848 6.36647 63.127 9.5H2C2.21169 6.55502 2.47918 3.42051 2.79883 0H63.7275Z',
    innerShadow: { x: 14, y: 16, w: 43, h: 23, color: '#A0A0A0', std: 5 },
  },
  C: {
    vb: [81, 60],
    shadow: { x: 10, y: 26.4443, w: 61, h: 23, std: 5 },
    paperD: 'M10.0005 47.4444C33.6465 45.9457 46.7406 46.0058 70.0005 46.6554C69.3499 38.9979 69.0169 31.2572 69.0169 23.4444C69.0169 15.7519 69.3394 8.12914 69.9703 0.586961L69.9302 0.444444C69.9302 0.444444 10.0005 -0.555556 10.0005 0.444444C10.0005 1.44444 12.278 42.1088 10.0005 47.4444Z',
    paperBox: { x: 10, y: 0, w: 60, h: 47.5 },
    gradD: 'M71.7275 0.444336L71.7676 0.583984C71.4977 3.69037 71.2848 6.81081 71.127 9.94434H10C10.2117 6.99936 10.4792 3.86484 10.7988 0.444336H71.7275Z',
    innerShadow: { x: 24, y: 19.4443, w: 43, h: 23, color: '#939393', std: 5 },
  },
  D: {
    vb: [69, 50],
    shadow: { x: 4, y: 23, w: 61, h: 23, std: 2 },
    paperD: 'M2 46C14.9855 44.2129 21.5131 44.2985 63 45.2277C64.6333 37.8705 64.6011 0.236609 62.9693 0.139485C61.3375 0.0423608 62.9286 0 62.9286 0H2C2.79841 22.4252 2.39045 32.3423 2 46Z',
    paperBox: { x: 2, y: 0, w: 61, h: 46 },
    gradD: 'M63.7275 0L63.7676 0.139648C63.4977 3.24604 63.2848 6.36647 63.127 9.5H2C2.21169 6.55502 2.47918 3.42051 2.79883 0H63.7275Z',
    innerShadow: { x: 14, y: 16, w: 43, h: 23, color: '#A0A0A0', std: 5 },
  },
};

export function PostitDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute', pointerEvents: 'none' }} aria-hidden="true">
      <defs>
        {POSTIT_VARIANTS.map(v => {
          const c = POSTIT_CONFIGS[v];
          return (
            <Fragment key={v}>
              <filter id={`postit-shadow-${v}`} x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation={c.shadow.std} />
              </filter>
              <filter id={`postit-inner-${v}`} x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation={c.innerShadow.std} />
              </filter>
              <linearGradient id={`postit-grad-${v}`} x1="0" y1="0" x2={c.vb[0]} y2="0" gradientUnits="userSpaceOnUse">
                <stop offset="0.10" stopOpacity="0" />
                <stop offset="0.50" stopOpacity="0.55" />
                <stop offset="0.90" stopOpacity="0" />
              </linearGradient>
              <clipPath id={`postit-paper-clip-${v}`} clipPathUnits="objectBoundingBox">
                <path d={c.paperD} transform={`scale(${1 / c.vb[0]}, ${1 / c.vb[1]})`} />
              </clipPath>
            </Fragment>
          );
        })}
      </defs>
    </svg>
  );
}

export function PostitVisual({ variant }: { variant: PostitVariant }) {
  const c = POSTIT_CONFIGS[variant];
  return (
    <svg
      viewBox={`0 0 ${c.vb[0]} ${c.vb[1]}`}
      preserveAspectRatio="none"
      width="100%"
      height="100%"
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}
      aria-hidden="true"
    >
      <g filter={`url(#postit-shadow-${variant})`}>
        <rect x={c.shadow.x} y={c.shadow.y} width={c.shadow.w} height={c.shadow.h} fill="black" fillOpacity="0.13" />
      </g>
      <path d={c.paperD} fill="#FAEA9D" />
      <path d={c.gradD} fill={`url(#postit-grad-${variant})`} fillOpacity="0.08" />
      <g filter={`url(#postit-inner-${variant})`} fillOpacity="0.3">
        <rect x={c.innerShadow.x} y={c.innerShadow.y} width={c.innerShadow.w} height={c.innerShadow.h} fill="black" fillOpacity="0.03" />
      </g>
    </svg>
  );
}

export const PostitWrapper = styled.div<{ $active?: boolean; $variant: PostitVariant }>`
  position: absolute;
  left: 0;
  width: 100%;
  aspect-ratio: ${p => `${POSTIT_CONFIGS[p.$variant].vb[0]} / ${POSTIT_CONFIGS[p.$variant].vb[1]}`};
  cursor: pointer;
  isolation: isolate;
  transition: filter 0.12s ease;
  filter: ${p => p.$active ? 'brightness(0.94) saturate(1.1)' : 'none'};

  &:hover {
    filter: brightness(0.97);
  }
`;

export const PostitTexture = styled.div<{ $variant: PostitVariant }>`
  position: absolute;
  inset: 0;
  background-image: url('/postit_texture.png');
  background-size: 60% auto;
  background-repeat: repeat;
  mix-blend-mode: multiply;
  opacity: 0.55;
  pointer-events: none;
  clip-path: ${p => `url(#postit-paper-clip-${p.$variant})`};
  -webkit-clip-path: ${p => `url(#postit-paper-clip-${p.$variant})`};
`;

/**
 * Inner content area of a postit, positioned below the top "fold" band so writing
 * doesn't sit on top of the visible fold gradient.
 */
export const PostitContent = styled.div<{ $variant: PostitVariant }>`
  position: absolute;
  ${p => {
    const c = POSTIT_CONFIGS[p.$variant];
    const foldRatio = 0.28;
    const left = (c.paperBox.x / c.vb[0]) * 100;
    const top = ((c.paperBox.y + c.paperBox.h * foldRatio) / c.vb[1]) * 100;
    const width = (c.paperBox.w / c.vb[0]) * 100;
    const height = ((c.paperBox.h * (1 - foldRatio)) / c.vb[1]) * 100;
    return `left: ${left}%; top: ${top}%; width: ${width}%; height: ${height}%;`;
  }}
  padding: 0.3rem 1.5rem 0.9rem;
  font-family: 'Figma Hand', var(--font-caveat), 'Caveat', cursive;
  font-size: 1.15rem;
  line-height: 1;
  color: #3a2e0e;
  overflow: hidden;
`;

export function postitHeightPx(variant: PostitVariant, widthPx: number): number {
  const c = POSTIT_CONFIGS[variant];
  return widthPx * (c.vb[1] / c.vb[0]);
}

/** Y of the bottom edge of the *paper* (excludes the shadow margin below it). */
export function postitPaperBottomPx(variant: PostitVariant, widthPx: number): number {
  const c = POSTIT_CONFIGS[variant];
  return widthPx * ((c.paperBox.y + c.paperBox.h) / c.vb[0]);
}
