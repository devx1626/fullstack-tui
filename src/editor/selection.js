/**
 * Selection (overhaul §8.3, task 2.3).
 *
 * A selection is `{ anchor, head }` in document coordinates — the same
 * anchor/head pair every editor uses, because it is the only shape that can
 * represent "which end is moving" (a plain sorted range cannot extend
 * backwards). A selection is never *stored* sorted; `selRange` sorts it on
 * demand. `null` means "no selection", and the caret alone is the head.
 *
 * Three flavours exist, matching the vim modes:
 *
 *   char    the anchor..head range itself
 *   line    whole lines, including the trailing newline (so `V d` deletes the
 *           lines rather than leaving a blank one)
 *   block   a rectangle — rows from the anchor to the head, columns from the
 *           left edge to the right edge, clamped per line. `blockPositions`
 *           turns it into one cursor per row, which is what makes block-column
 *           insert work in 2.6.
 *
 * Everything here is pure: the ops return `applyEdit` CHANGE LISTS rather than
 * applying them, so the caller can batch them into one transaction (and thus
 * one undo step), which is what §8.7 requires of a multi-cursor batch.
 */
import { cmpPos, eqPos, maxPos, minPos, pos, range } from './document.js';

// ---------------------------------------------------------------------------
// Construction and range maths
// ---------------------------------------------------------------------------

export function createSelection(anchor, head = anchor) {
  if (!anchor || !head) return null;
  return eqPos(anchor, head) ? null : { anchor, head };
}

/** The sorted range of a selection, or null when there is no selection. */
export function selRange(sel) {
  if (!sel) return null;
  return range(sel.anchor, sel.head);
}

export function selIsEmpty(sel) {
  return !sel || eqPos(sel.anchor, sel.head);
}

/** Move the head, keeping the anchor — extending a selection. */
export function selExtend(sel, head) {
  if (!sel) return null;
  return createSelection(sel.anchor, head);
}

/** Move the anchor, keeping the head — the vim `o` flip. */
export function selFlip(sel) {
  if (!sel) return null;
  return { anchor: sel.head, head: sel.anchor };
}

/** Collapse a selection to the caret (which end is decided by `to`). */
export function selCollapse(sel, to = 'head') {
  if (!sel) return null;
  return eqPos(sel.anchor, sel.head) ? null : (to === 'anchor' ? pos(sel.anchor.row, sel.anchor.col) : pos(sel.head.row, sel.head.col));
}

export function selEqual(a, b) {
  if (!a || !b) return !a && !b;
  return eqPos(a.anchor, b.anchor) && eqPos(a.head, b.head);
}

/** Does a position fall inside the selection (inclusive of the ends)? */
export function selContains(sel, p) {
  const r = selRange(sel);
  return !!r && cmpPos(p, r.start) >= 0 && cmpPos(p, r.end) <= 0;
}

export function selMin(sel) {
  return sel ? minPos(sel.anchor, sel.head) : null;
}

export function selMax(sel) {
  return sel ? maxPos(sel.anchor, sel.head) : null;
}

/** Merge two selections (multi-cursor overlap collapse, §8.7). */
export function selMerge(a, b) {
  if (!a) return b;
  if (!b) return a;
  return createSelection(minPos(selMin(a), selMin(b)), maxPos(selMax(a), selMax(b)));
}

// ---------------------------------------------------------------------------
// Positions and lines
// ---------------------------------------------------------------------------

export function lineStart(doc, row) {
  return pos(Math.max(0, Math.min(row | 0, doc.lines.length - 1)), 0);
}

export function lineEnd(doc, row) {
  const r = Math.max(0, Math.min(row | 0, doc.lines.length - 1));
  return pos(r, doc.lines[r].length);
}

/** First non-blank column of a row (vim's `^`). */
export function firstNonBlank(doc, row) {
  const r = Math.max(0, Math.min(row | 0, doc.lines.length - 1));
  const m = /^[ \t]*/.exec(doc.lines[r] || '');
  return pos(r, m ? m[0].length : 0);
}

/** Row indexes a selection covers. */
export function selRows(doc, sel) {
  const r = selRange(sel);
  if (!r) {
    const row = sel ? sel.head.row : 0;
    return [Math.max(0, Math.min(row, doc.lines.length - 1))];
  }
  const rows = [];
  for (let row = r.start.row; row <= Math.min(r.end.row, doc.lines.length - 1); row += 1) rows.push(row);
  return rows;
}

// ---------------------------------------------------------------------------
// Word, line and whole-document selections
// ---------------------------------------------------------------------------

const WORD_CHAR = /[\w$]/;

/** The word around a position (double-click, `*`, `<C-d>` next-match). */
export function selectWord(doc, p) {
  const row = Math.max(0, Math.min(p.row, doc.lines.length - 1));
  const line = doc.lines[row];
  if (!line || line.length === 0) return null;
  const col = Math.max(0, Math.min(p.col, line.length - 1));
  // Three outcomes, and no clever snapping: whitespace selects nothing, a word
  // character selects the word around it, and anything else selects the run of
  // that same character (so `<C-d>` on `//` works on the whole comment marker).
  if (/\s/.test(line[col])) return null;
  const isWord = WORD_CHAR.test(line[col]);
  const test = (ch) => (WORD_CHAR.test(ch) === isWord && !/\s/.test(ch));
  let s = col;
  let e = col;
  while (s > 0 && test(line[s - 1])) s -= 1;
  while (e + 1 < line.length && test(line[e + 1])) e += 1;
  return createSelection(pos(row, s), pos(row, e + 1));
}

/** The whole line(s) a row range covers, INCLUDING the trailing newline. */
export function selectLineRange(doc, fromRow, toRow = fromRow) {
  const a = Math.max(0, Math.min(Math.min(fromRow, toRow), doc.lines.length - 1));
  const b = Math.max(0, Math.min(Math.max(fromRow, toRow), doc.lines.length - 1));
  const last = b < doc.lines.length - 1;
  return createSelection(
    pos(a, 0),
    last ? pos(b + 1, 0) : pos(b, doc.lines[b].length),
  );
}

/** A whole row as a selection, newline included where there is one. */
export function selectRow(doc, row) {
  return selectLineRange(doc, row, row);
}

/** A linewise selection: expand any selection to the lines it touches. */
export function linewise(doc, sel) {
  if (!sel) return selectLineRange(doc, 0);
  return selectLineRange(doc, selMin(sel).row, selMax(sel).row);
}

export function selectAll(doc) {
  const last = doc.lines.length - 1;
  return createSelection(pos(0, 0), pos(last, doc.lines[last].length));
}

// ---------------------------------------------------------------------------
// Visual block
// ---------------------------------------------------------------------------

/** The rectangle a blockwise selection covers. */
export function blockRect(sel) {
  if (!sel) return null;
  return {
    top: Math.min(sel.anchor.row, sel.head.row),
    bottom: Math.max(sel.anchor.row, sel.head.row),
    left: Math.min(sel.anchor.col, sel.head.col),
    right: Math.max(sel.anchor.col, sel.head.col),
  };
}

/**
 * Per-row slices of a block, clamped to each line's length. A row shorter than
 * `left` contributes nothing (that is what vim's block mode does, rather than
 * padding the line out).
 */
export function blockLines(doc, sel) {
  const rect = blockRect(sel);
  if (!rect) return [];
  const out = [];
  for (let row = rect.top; row <= Math.min(rect.bottom, doc.lines.length - 1); row += 1) {
    const line = doc.lines[row];
    const start = Math.min(rect.left, line.length);
    const end = Math.min(rect.right, line.length);
    out.push({ row, start, end, empty: end <= start });
  }
  return out;
}

/**
 * One position per row at the block's left edge — the cursors a block-column
 * insert needs (task 2.6). Rows shorter than the block are still included, at
 * their own end, so typing into a block does not silently skip lines.
 */
export function blockPositions(doc, sel, at = 'left') {
  const rect = blockRect(sel);
  if (!rect) return [];
  const out = [];
  for (let row = rect.top; row <= Math.min(rect.bottom, doc.lines.length - 1); row += 1) {
    const line = doc.lines[row];
    const wanted = at === 'left' ? rect.left : rect.right;
    out.push(pos(row, Math.min(wanted, line.length)));
  }
  return out;
}

/** The block's text, one row per line (no trailing newline). */
export function blockText(doc, sel) {
  return blockLines(doc, sel).map((l) => doc.lines[l.row].slice(l.start, l.end)).join('\n');
}

/** The text a selection covers (linewise selections include their newline). */
export function selText(doc, sel) {
  const r = selRange(sel);
  if (!r) return '';
  if (r.start.row === r.end.row) return doc.lines[r.start.row].slice(r.start.col, r.end.col);
  const head = doc.lines[r.start.row].slice(r.start.col);
  const middle = doc.lines.slice(r.start.row + 1, r.end.row);
  const tail = doc.lines[r.end.row].slice(0, r.end.col);
  return [head, ...middle, tail].join('\n');
}

// ---------------------------------------------------------------------------
// Operations as change lists (so callers batch them)
// ---------------------------------------------------------------------------

/** Delete a selection; the caret lands at its start. */
export function deleteChanges(sel) {
  const r = selRange(sel);
  return r ? [{ start: r.start, end: r.end, text: '' }] : [];
}

/** Replace a selection with text (paste, type-over, block insert per row). */
export function replaceChanges(sel, text) {
  const r = selRange(sel);
  if (!r) return [];
  return [{ start: r.start, end: r.end, text: text ?? '' }];
}

const INDENT_UNIT = (tabSize) => ' '.repeat(Math.max(1, Number(tabSize) || 2));

/** Add one indent level to every line a range touches (multi-change, one step). */
export function indentChanges(doc, rangeLike, tabSize = 2) {
  const rows = rowsOfRange(doc, rangeLike);
  const unit = INDENT_UNIT(tabSize);
  return rows.filter((row) => (doc.lines[row] || '').trim() !== '')
    .map((row) => ({ start: pos(row, 0), end: pos(row, 0), text: unit }));
}

/** Remove one indent level (or up to `tabSize` leading spaces) per line. */
export function outdentChanges(doc, rangeLike, tabSize = 2) {
  const rows = rowsOfRange(doc, rangeLike);
  const width = Math.max(1, Number(tabSize) || 2);
  const out = [];
  for (const row of rows) {
    const line = doc.lines[row] || '';
    if (line.startsWith('\t')) {
      out.push({ start: pos(row, 0), end: pos(row, 1), text: '' });
      continue;
    }
    const spaces = /^ +/.exec(line);
    if (!spaces) continue;
    const cut = Math.min(spaces[0].length, width);
    out.push({ start: pos(row, 0), end: pos(row, cut), text: '' });
  }
  return out;
}

/** Case transforms over a selection (§8.3). */
export function caseChanges(doc, sel, how = 'upper') {
  const r = selRange(sel);
  if (!r) return [];
  const text = selText(doc, sel);
  const next = how === 'lower' ? text.toLowerCase() : how === 'toggle' ? toggleCase(text) : text.toUpperCase();
  if (next === text) return [];
  return [{ start: r.start, end: r.end, text: next }];
}

function toggleCase(text) {
  let out = '';
  for (const ch of text) {
    out += ch === ch.toLowerCase() ? ch.toUpperCase() : ch.toLowerCase();
  }
  return out;
}

/** Comment / uncomment a line across a range, for languages with line comments. */
export function commentChanges(doc, rangeLike, lineComment = '//') {
  const rows = rowsOfRange(doc, rangeLike).filter((row) => (doc.lines[row] || '').trim() !== '');
  if (!rows.length) return [];
  const allCommented = rows.every((row) => (doc.lines[row] || '').trimStart().startsWith(lineComment));
  return rows.map((row) => {
    const line = doc.lines[row];
    const indent = /^[ \t]*/.exec(line)[0];
    if (allCommented) {
      const rest = line.slice(indent.length + lineComment.length);
      return {
        start: pos(row, 0),
        end: pos(row, indent.length + lineComment.length + (/^ /.test(rest) ? 1 : 0)),
        text: indent,
      };
    }
    return { start: pos(row, indent.length), end: pos(row, indent.length), text: `${lineComment} ` };
  });
}

/**
 * Row indexes a range or selection touches.
 *
 * A range that ends at column 0 of a later row includes that row: a selection
 * running from mid-line to the start of the next line covers that line's
 * newline, which is vim's line-span convention (and what `V`/`dj` produce).
 * Line-oriented operations that must NOT include the boundary row (a linewise
 * operator applied to whole lines) trim their range first — see
 * `linewiseRows` in `vim/operators.js`.
 */
export function rowsOfRange(doc, rangeLike) {
  const r = rangeLike && rangeLike.start && rangeLike.end ? rangeLike : selRange(rangeLike);
  if (!r) return [];
  const rows = [];
  for (let row = r.start.row; row <= Math.min(r.end.row, doc.lines.length - 1); row += 1) rows.push(row);
  return rows;
}

/**
 * Merge overlapping positions into one cursor each (task 2.6: "cursor-collision
 * collapse"). Later duplicates win, and the result stays in document order.
 */
export function collapsePositions(positions = []) {
  const seen = new Map();
  for (const p of positions) {
    if (!p) continue;
    seen.set(`${p.row}:${p.col}`, p);
  }
  return [...seen.values()].sort((a, b) => cmpPos(a, b));
}
