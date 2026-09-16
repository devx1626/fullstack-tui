/**
 * Soft-wrap engine (errors-and-qol-spec Q11, Appendix E task 2.8 addendum).
 *
 * Pure screen-line model: each logical line becomes a list of (start, end)
 * column segments that fit `width` cells. Cursor math operates on wrapped
 * rows (up/down by screen row, goal column kept); the editor model keeps its
 * logical (row, col) — this module translates between the two.
 *
 * Wrapping rules (VS Code-like, deterministic):
 *   - break at the last space that fits; leading indentation of a
 *     continuation segment is dropped (one space is the break marker);
 *   - a word longer than the whole width is hard-split at exactly `width`;
 *   - an empty line is one empty segment; a line ending in a break marker
 *     does not produce a phantom trailing segment.
 */

/** Split one logical line into segments [{ start, end, text, width }]. */
export function wrapLine(line, width) {
  const text = String(line ?? '');
  const w = Math.max(4, width | 0);
  if (text.length <= w) {
    return [{ start: 0, end: text.length, text, width: text.length }];
  }

  const segs = [];
  let pos = 0;
  while (pos < text.length) {
    const rest = text.slice(pos);
    if (rest.length <= w) {
      segs.push({ start: pos, end: text.length, text: rest, width: rest.length });
      break;
    }
    // Look for a break opportunity: last space within the window.
    const window = rest.slice(0, w + 1);
    let cut = window.lastIndexOf(' ');
    if (cut <= 0) {
      // No break opportunity (or it would strand nothing): hard-split.
      cut = w;
      segs.push({ start: pos, end: pos + cut, text: rest.slice(0, cut), width: cut });
      pos += cut;
    } else {
      segs.push({ start: pos, end: pos + cut, text: rest.slice(0, cut), width: cut });
      pos += cut;
      // Drop ONE break-marker space; further leading spaces are content.
      if (text[pos] === ' ') pos += 1;
    }
  }
  if (!segs.length) segs.push({ start: 0, end: 0, text: '', width: 0 });
  return segs;
}

/**
 * Build the full document model.
 *
 * @returns {{ width: number, totalRows: number, lines: Array<{
 *   segs: Array<object>, startRow: number, rows: number
 * }}>}
 */
export function buildWrapDoc(lines, width) {
  const w = Math.max(4, width | 0);
  const out = [];
  let row = 0;
  for (const line of lines) {
    const segs = wrapLine(line, w);
    out.push({ segs, startRow: row, rows: segs.length });
    row += segs.length;
  }
  if (!out.length) out.push({ segs: [{ start: 0, end: 0, text: '', width: 0 }], startRow: 0, rows: 1 });
  return { width: w, totalRows: row, lines: out };
}

/** Global screen row of a logical caret position. */
export function caretScreenRow(doc, row, col) {
  const line = doc.lines[Math.max(0, Math.min(row, doc.lines.length - 1))];
  for (let i = 0; i < line.segs.length; i += 1) {
    const seg = line.segs[i];
    if (col < seg.end || i === line.segs.length - 1) return line.startRow + i;
  }
  return line.startRow;
}

/** The segment (within its line) containing `col` on logical `row`. */
export function segmentAt(doc, row, col) {
  const line = doc.lines[Math.max(0, Math.min(row, doc.lines.length - 1))];
  for (const seg of line.segs) {
    if (col >= seg.start && col < seg.end) return { line, seg };
  }
  return { line, seg: line.segs[line.segs.length - 1] };
}

/**
 * Move the caret vertically by `delta` screen rows (negative = up),
 * keeping the goal column (visual cells into the row). Mutates `ed`
 * ({ row, col, goalCol }) and returns it. Falls back to classic line-wise
 * movement when nothing wraps.
 */
export function moveVertical(ed, doc, delta) {
  const anyWrapped = doc.totalRows !== doc.lines.length;
  if (!anyWrapped) {
    // Classic semantics: col clamped to the target line length.
    ed.row = Math.max(0, Math.min(ed.row + delta, doc.lines.length - 1));
    ed.col = Math.max(0, Math.min(ed.col ?? 0, doc.lines[ed.row].segs[0].width));
    ed.goalCol = null;
    return ed;
  }

  const curRow = caretScreenRow(doc, ed.row, ed.col);
  const goal = ed.goalCol ?? (() => {
    const { seg } = segmentAt(doc, ed.row, ed.col);
    return ed.col - seg.start;
  })();

  let target = Math.max(0, Math.min(curRow + delta, doc.totalRows - 1));
  // Locate the logical line + segment for the target screen row.
  let line = doc.lines[0];
  for (const l of doc.lines) {
    if (target >= l.startRow && target < l.startRow + l.rows) { line = l; break; }
  }
  const seg = line.segs[target - line.startRow];

  ed.row = doc.lines.indexOf(line);
  ed.col = seg.start + Math.min(goal, seg.width);
  ed.goalCol = goal;
  return ed;
}

/**
 * Wrap-aware vertical scroll helper: the first visible SCREEN row that keeps
 * the caret's screen row inside a `viewRows` viewport, given the previous
 * first-visible row (stability when the caret hasn't left the viewport).
 */
export function firstVisibleRow(caretScreen, viewRows, previousFirst) {
  const max = 0; // caller clamps against doc.totalRows
  const prev = Math.max(max, previousFirst || 0);
  if (caretScreen >= prev && caretScreen < prev + viewRows) return prev;
  if (caretScreen < prev) return caretScreen;
  return caretScreen - viewRows + 1;
}
