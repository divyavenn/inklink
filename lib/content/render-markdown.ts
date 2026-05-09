import { marked } from 'marked';

interface FootnoteEntry {
  id: string;
  index: number;
  text: string;
}

const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

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
