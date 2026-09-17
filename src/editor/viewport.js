/**
 * Editor viewport geometry (overhaul task 2.8) — the pure half of CodeEditor.
 *
 * Everything here is a pure function of a document + options, so the mouse
 * mapping, the caret placement, the scroll-follow logic and the segment slicing
 * are all unit-testable without rendering. The component (`CodeEditor.jsx`)
 * only draws what these functions project.
 *
 * Coordinate conventions (they bite):
 *   - Document positions are `{row, col}` with col a CODE-UNIT index; tabs and
 *     CJK make visual columns differ. Conversion goes through `width.js`.
 *   - Scroll is `{scrollTop, scrollX}` — the FIRST visible row, and the first
 *     visual COLUMN of a horizontally scrolled row.
 *   - Mouse rows are the terminal's 0-based row; `contentCol` is the visual
 *     column INSIDE the text area (gutter and scrollX already subtracted).
 */

import { lineAt, lineCount } from './document.js';
import {
  indexAtVisualColumn,
  sliceByVisualColumn,
  stringWidth,
  visualColumn,
} from './width.js';
import { selRange } from './selection.js';

/** Clamp a scroll so `scrollTop`/`scrollX` are never negative or past-the-end. */
export function clampScrollTop(doc, view) {
  const top = Math.max(0, Math.min(Number(view && view.scrollTop) || 0, Math.max(0, lineCount(doc) - 1)));
  return { scrollTop: top, scrollX: Math.max(0, Number(view && view.scrollX) || 0) };
}

/**
 * Keep the caret visible. The rule is deliberately boring: scroll only when the
 * caret is OUTSIDE the window, and never scroll horizontally unless the caret
 * genuinely cannot be drawn.
 */
export function followCaret(doc, view, { height, width, tabSize = 2 } = {}) {
  const v = clampScrollTop(doc, view);
  const caret = doc.caret;
  let { scrollTop, scrollX } = v;

  if (height > 0) {
    if (caret.row < scrollTop) scrollTop = caret.row;
    else if (caret.row >= scrollTop + height) scrollTop = caret.row - height + 1;
  }

  if (width > 0) {
    const col = visualColumn(lineAt(doc, caret.row), caret.col, tabSize);
    // The caret CELL must fit: [scrollX, scrollX + width).
    if (col < scrollX) scrollX = col;
    else if (col >= scrollX + width) scrollX = col - width + 1;
  }

  return { scrollTop, scrollX };
}

/**
 * The rows the viewport draws: exactly `height` entries `{row, top, line}`,
 * with `null` line entries padding past the end of the buffer (so the frame
 * size never flickers while scrolling).
 */
export function visibleRows(doc, { top, height }) {
  const rows = [];
  const total = lineCount(doc);
  for (let i = 0; i < Math.max(0, height); i += 1) {
    const row = top + i;
    rows.push({ row, top: i, line: row < total ? lineAt(doc, row) : null });
  }
  return rows;
}

/**
 * Map a click to a document position. Clicking past end-of-line, below the
 * last row or inside a wide character clamps to the nearest legal position —
 * every click lands somewhere typeable.
 */
export function clickToPos(doc, row, contentCol, { tabSize = 2 } = {}) {
  const total = lineCount(doc);
  const r = Math.max(0, Math.min(Number(row) || 0, total - 1));
  const col = indexAtVisualColumn(lineAt(doc, r), Math.max(0, Number(contentCol) || 0), tabSize);
  return { row: r, col };
}

/**
 * Selection rows for rendering: `[{row, fromCol, toCol}]` in VISUAL columns
 * (caret-exclusive), one entry per row the (possibly inverted) selection
 * touches, restricted to the viewport. Selection of a full row runs to
 * `Number.MAX_SAFE_INTEGER` — renderers turn that into "to end of line".
 */
export function selectionRows(doc, sel, { top, height, tabSize = 2 } = {}) {
  const r = selRange(sel);
  if (!r) return [];
  const from = Math.max(r.start.row, top);
  const to = Math.min(r.end.row, top + Math.max(0, height) - 1);
  const rows = [];
  for (let row = from; row <= to; row += 1) {
    const line = lineAt(doc, row);
    const startCol = row === r.start.row ? visualColumn(line, r.start.col, tabSize) : 0;
    const endCol = row === r.end.row ? visualColumn(line, r.end.col, tabSize) : Number.MAX_SAFE_INTEGER;
    rows.push({ row, fromCol: startCol, toCol: endCol });
  }
  return rows;
}

/**
 * Cut highlighted segments into renderable pieces for one visible row.
 *
 * - Clipped to the visual window `[startCol, startCol + width)` — pieces never
 *   split a wide character (`sliceByVisualColumn` refuses mid-cell cuts).
 * - When `selFrom`/`selTo` are given, pieces inside the selection get
 *   `inverse: true`, cut at the selection edges so partial segments render
 *   exactly.
 * - `segs` may be empty (no tokens): the raw line becomes one plain piece.
 *
 * Returns `[]` only when the window is empty; callers draw a blank row then.
 */
export function rowPieces(segs, line, { startCol = 0, width = Infinity, selFrom = null, selTo = null } = {}) {
  const from = Math.max(0, Number(startCol) || 0);
  const to = from + Math.max(0, Number(width) || 0);
  const source = Array.isArray(segs) && segs.length > 0 ? segs : (line ? [{ text: String(line) }] : []);
  const hasSel = Number.isFinite(selFrom) && Number.isFinite(selTo) && selTo > selFrom;

  const out = [];
  let col = 0;
  for (const seg of source) {
    const segStart = col;
    const segW = stringWidth(seg.text);
    col = segStart + segW;
    if (col <= from) continue; // entirely left of the window
    if (segStart >= to) break; // entirely right of the window

    // Cut the segment at the window edges (visual columns, relative to seg).
    const relFrom = Math.max(0, from - segStart);
    const relTo = Math.min(segW, to - segStart);
    // Walk the segment's own visual columns, splitting at sel edges too.
    let pieceStart = relFrom;
    const edges = [relFrom, relTo];
    if (hasSel) {
      const selRelFrom = selFrom - segStart;
      const selRelTo = selTo - segStart;
      if (selRelFrom > pieceStart && selRelFrom < relTo) edges.push(selRelFrom);
      if (selRelTo > pieceStart && selRelTo < relTo) edges.push(selRelTo);
    }
    edges.sort((a, b) => a - b);
    for (let e = 0; e < edges.length - 1; e += 1) {
      const a = edges[e];
      const b = edges[e + 1];
      if (b <= a) continue;
      const text = sliceByVisualColumn(seg.text, a, b - a);
      if (!text) continue;
      out.push({
        text,
        color: seg.color ?? null,
        bold: !!seg.bold,
        italic: !!seg.italic,
        inverse: hasSel && a >= selFrom - segStart && b <= selTo - segStart,
      });
    }
  }
  return out;
}

/**
 * Caret → terminal cursor coordinates for `useCursor`: `{x, y}` relative to
 * the editor box, or null when the caret is scrolled out of view.
 */
export function cursorPoint({ top, left, height, width }, doc, view, { tabSize = 2 } = {}) {
  const v = clampScrollTop(doc, view);
  if (doc.caret.row < v.scrollTop || doc.caret.row >= v.scrollTop + height) return null;
  const col = visualColumn(lineAt(doc, doc.caret.row), doc.caret.col, tabSize);
  if (col < v.scrollX || col >= v.scrollX + width) return null;
  return { x: left + (col - v.scrollX), y: top + (doc.caret.row - v.scrollTop) };
}

/** Gutter width: digits for the widest line number, +2 (pad + gap). */
export function gutterWidth(doc, { height = 0, relative = false } = {}) {
  const total = lineCount(doc);
  const widest = Math.max(
    String(Math.max(1, total)).length,
    relative ? String(Math.max(1, height)).length : 0,
  );
  return widest + 2;
}
