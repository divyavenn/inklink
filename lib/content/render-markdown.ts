import { marked } from 'marked';

interface FootnoteEntry {
  id: string;
  index: number;
  text: string;
}

const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** Stable id for an embedded asset, derived from its URL so it survives re-renders. */
function assetIdFor(href: string): string {
  let h = 0;
  for (let i = 0; i < href.length; i++) h = (h * 31 + href.charCodeAt(i)) >>> 0;
  return 'asset-' + h.toString(36);
}

const VIDEO_RE = /\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i;

// Render markdown images as feedback-able assets. A markdown image whose URL is a
// video extension becomes a <video>; everything else an <img>. Both carry
// `class="chapter-asset"` + a stable `data-asset-id` so readers can click them to
// leave feedback (instead of highlighting text).
marked.use({
  renderer: {
    image(token: { href: string; title?: string | null; text?: string }) {
      const href = token.href || '';
      const id = assetIdFor(href);
      const alt = escapeAttr(token.text || '');
      const titleAttr = token.title ? ` title="${escapeAttr(token.title)}"` : '';
      if (VIDEO_RE.test(href)) {
        return `<video class="chapter-asset" data-asset-id="${id}" src="${escapeAttr(href)}" controls playsinline${titleAttr}></video>`;
      }
      return `<img class="chapter-asset" data-asset-id="${id}" src="${escapeAttr(href)}" alt="${alt}" loading="lazy"${titleAttr} />`;
    },
  },
});

export function renderMarkdown(content: string): string {
  const defs = new Map<string, FootnoteEntry>();

  // Pull `[^id]: footnote text` definitions out of the source. Definitions are
  // single-line; multi-paragraph footnotes are out of scope.
  const stripped = content.replace(/^\[\^([^\]\s]+)\]:[ \t]*(.+?)[ \t]*$/gm, (_m, id: string, text: string) => {
    defs.set(id, { id, index: 0, text: text.trim() });
    return '';
  });

  let nextIndex = 1;
  // Replace `[^id]` references with empty <sup> tags. Number is rendered via
  // CSS ::before reading data-fn-num, so footnote numbers don't appear in
  // textContent and char offsets used by other annotations stay stable.
  const withRefs = stripped.replace(/\[\^([^\]\s]+)\]/g, (m, id: string) => {
    const entry = defs.get(id);
    if (!entry) return m;
    if (entry.index === 0) entry.index = nextIndex++;
    return `<sup class="fn-ref" data-fn-id="${escapeAttr(id)}" data-fn-num="${entry.index}"></sup>`;
  });

  let html = marked.parse(withRefs) as string;

  const used = [...defs.values()].filter(e => e.index > 0).sort((a, b) => a.index - b.index);
  if (used.length > 0) {
    const items = used.map(e => {
      const inner = marked.parseInline(e.text) as string;
      return `<li id="fn-${escapeAttr(e.id)}" data-fn-id="${escapeAttr(e.id)}">${inner}</li>`;
    }).join('');
    html += `<aside class="footnotes" role="doc-endnotes"><ol>${items}</ol></aside>`;
  }

  return html;
}
