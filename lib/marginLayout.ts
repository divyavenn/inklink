/**
 * Margin layout collision avoidance for anchored items (postits, faces, comments).
 *
 * Places each item near its anchor Y while preventing overlaps, optionally
 * dodging "forbidden" vertical bands (e.g. space already reserved by postits).
 * Shared by ChapterReader (reader margin) and AuthorNotesView (author postits)
 * so both columns lay out identically.
 */

/** Min vertical gap between adjacent margin items, in px. */
export const MARGIN_NOTE_GAP = 4;

export function resolveMarginPositions(
  items: Array<{ id: string; anchorY: number; heightPx: number }>,
  forbidden: Array<{ top: number; bottom: number }> = [],
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
