/**
 * Modeless typing (overhaul task 2.9) — the non-vim half of the editor input.
 *
 * The classic editor's key path (src/views/editor.js: insertChar, insertNewline,
 * backspace, del, move) is PORTED here as pure functions that return
 * `applyEdit` CHANGE LISTS in ONE transform per keystroke, so a route commits
 * one history step per key — the classic mutated the buffer in place, which is
 * exactly why its undo had to be bolted on from outside.
 *
 * THE one rule every operation follows: compute a single replacement of a
 * span of the ORIGINAL document (never a chain of edits against evolving
 * coordinates — `applyEdit` throws on overlapping changes, by design, and a
 * selection deletion followed by an insert at the same site IS an overlap).
 *
 * Behaviors mirrored from the classic (parity is the acceptance):
 *   - newline keeps the leading indent, and +1 level after an opener `[{(`
 *   - backspace deletes a whole indent STEP when sitting on clean indentation
 *   - arrows never carry the caret past the line seams
 *   - a selection is replaced by typed text (the classic has no selection; its
 *     absence is recorded in docs — typing replaces it like every real editor)
 *
 * Pair matching (auto-paired brackets, auto-closed tags) deliberately does NOT
 * live here: it stays in `src/core/brackets.js`, which the classic editor and
 * the completions engine already share — two pair engines would drift.
 */

import {
  applyEdit,
  lineAt,
  lineCount,
  pos,
} from './document.js';

/** Characters that bump the indent of the following line by one level. */
const OPENER_TAIL = /[{[(]\s*$/;
const INDENT_STEP = '  ';

/** Leading whitespace of a line. */
const indentOf = (line) => (/[ \t]*/.exec(line) || [''])[0];

const cmp = (p, q) => (p.row - q.row) || (p.col - q.col);

/** Sorted span of a selection (null when there is none). */
function selSpan(selection) {
  if (!selection || !selection.anchor || !selection.head) return null;
  const a = selection.anchor;
  const b = selection.head;
  const forward = cmp(a, b) <= 0;
  return forward ? { start: a, end: b } : { start: b, end: a };
}

/**
 * Typed printable text (a paste is many of these in one event). A multi-line
 * text folds every `\n` through the newline rules; the whole thing stays ONE
 * change, so a paste is one undo step. Replaces any selection first.
 */
export function typeText(doc, text, selection = null) {
  const t = String(text ?? '');
  if (!t) return { changes: [], caret: doc.caret, coalesce: 'typing' };
  const span = selSpan(selection);
  const at = span ? span.start : doc.caret;

  const line = lineAt(doc, at.row);
  const before = line.slice(0, at.col);
  const after = line.slice(at.col);
  const parts = t.split('\n');
  const newlines = parts.length - 1;

  // Build the composed text; each newline keeps its line's indent and bumps
  // after an opener, judged on exactly what the classic's insertNewline saw.
  let composed = parts[0];
  let lineSoFar = before + parts[0];
  let lastIndent = '';
  for (let j = 1; j <= newlines; j += 1) {
    let indent = indentOf(lineSoFar);
    if (OPENER_TAIL.test(lineSoFar)) indent += INDENT_STEP;
    composed += `\n${indent}${parts[j]}`;
    lastIndent = indent;
    lineSoFar = indent + parts[j];
  }

  const changes = [{
    start: pos(at.row, 0),
    end: pos(at.row, line.length),
    text: `${before}${composed}${after}`,
  }];
  // When a selection reached past this line, it dies with the same change:
  // everything after `at` on the line was already rewritten, and selection
  // rows below (multi-line selection + type) collapse through the newline
  // rules the same way — so extend the span honestly.
  if (span && (span.end.row !== at.row || span.end.col !== at.col)) {
    const endLine = lineAt(doc, span.end.row);
    changes[0] = {
      start: pos(at.row, 0),
      end: pos(span.end.row, endLine.length),
      text: `${before}${composed}${endLine.slice(span.end.col)}`,
    };
  }

  const caret = newlines > 0
    ? pos(at.row + newlines, lastIndent.length + parts[newlines].length)
    : pos(at.row, at.col + t.length);
  return { changes, caret, coalesce: 'typing' };
}

/**
 * Enter: keep the line's indent, bump one level when an opener closes the
 * line. With a selection, the selection is replaced by the break.
 */
export function typeNewline(doc, selection = null, { indentSize = 2 } = {}) {
  void indentSize; // indent level is fixed at 2 spaces (classic parity)
  const span = selSpan(selection);
  const at = span ? span.start : doc.caret;
  const line = lineAt(doc, at.row);
  const before = line.slice(0, at.col);

  let indent = indentOf(before);
  if (OPENER_TAIL.test(before)) indent += INDENT_STEP;

  // The replaced span: from the line start to the selection end (which, with
  // no selection, is the caret on the same line).
  const endRow = span ? span.end.row : at.row;
  const endLine = lineAt(doc, endRow);
  const tail = span ? endLine.slice(span.end.col) : line.slice(at.col);

  const changes = [{
    start: pos(at.row, 0),
    end: pos(endRow, endLine.length),
    text: `${before}\n${indent}${tail}`,
  }];
  return { changes, caret: pos(at.row + 1, indent.length), coalesce: 'typing' };
}

/**
 * Backspace: the character before the caret, or a whole indent step when
 * sitting on clean indentation (classic parity), or the previous line's seam.
 * With a selection, exactly the selection.
 */
export function typeBackspace(doc, selection = null, { indentSize = 2 } = {}) {
  const span = selSpan(selection);
  if (span) {
    return { changes: [{ start: span.start, end: span.end, text: '' }], caret: span.start, coalesce: 'typing' };
  }
  const caret = doc.caret;
  const line = lineAt(doc, caret.row);

  if (caret.col > 0) {
    const head = line.slice(0, caret.col);
    const spaces = head.match(/ +$/);
    const size = Math.max(1, indentSize);
    // Whole indent step only when the run is clean indentation AND a multiple.
    const step = spaces && size > 1 && spaces[0].length % size === 0 && spaces[0].length > 1
      ? size
      : 1;
    return {
      changes: [{ start: pos(caret.row, caret.col - step), end: caret, text: '' }],
      caret: pos(caret.row, caret.col - step),
      coalesce: 'typing',
    };
  }
  if (caret.row > 0) {
    const prev = lineAt(doc, caret.row - 1);
    return {
      changes: [{ start: pos(caret.row - 1, prev.length), end: caret, text: '' }],
      caret: pos(caret.row - 1, prev.length),
      coalesce: 'typing',
    };
  }
  return { changes: [], caret, coalesce: 'typing' }; // start of buffer
}

/** Delete (forward): the character at the caret, or the next line's seam. */
export function typeDelete(doc, selection = null) {
  const span = selSpan(selection);
  if (span) {
    return { changes: [{ start: span.start, end: span.end, text: '' }], caret: span.start, coalesce: 'typing' };
  }
  const caret = doc.caret;
  const line = lineAt(doc, caret.row);
  if (caret.col < line.length) {
    return {
      changes: [{ start: caret, end: pos(caret.row, caret.col + 1), text: '' }],
      caret,
      coalesce: 'typing',
    };
  }
  if (caret.row < lineCount(doc) - 1) {
    return {
      changes: [{ start: caret, end: pos(caret.row + 1, 0), text: '' }],
      caret,
      coalesce: 'typing',
    };
  }
  return { changes: [], caret, coalesce: 'typing' }; // end of buffer
}

/**
 * Arrow movement (pure; no changes). Mirrors the classic `move`:
 * left/right wrap across line seams, up/down clamp to the document.
 */
export function moveArrow(doc, dir, { count = 1 } = {}) {
  let p = doc.caret;
  for (let i = 0; i < Math.max(1, count); i += 1) {
    if (dir === 'left') {
      if (p.col > 0) p = pos(p.row, p.col - 1);
      else if (p.row > 0) p = pos(p.row - 1, lineAt(doc, p.row - 1).length);
    } else if (dir === 'right') {
      if (p.col < lineAt(doc, p.row).length) p = pos(p.row, p.col + 1);
      else if (p.row < lineCount(doc) - 1) p = pos(p.row + 1, 0);
    } else if (dir === 'up') {
      p = pos(Math.max(0, p.row - 1), p.col);
    } else if (dir === 'down') {
      p = pos(Math.min(lineCount(doc) - 1, p.row + 1), p.col);
    } else if (dir === 'home') {
      p = pos(p.row, 0);
    } else if (dir === 'end') {
      p = pos(p.row, lineAt(doc, p.row).length);
    }
  }
  return p;
}

/** Apply a typing result to a document in one pass (convenience for routes). */
export function applyTyped(doc, result) {
  if (!result.changes.length) return { doc, caret: result.caret, changed: false };
  const out = applyEdit(doc, result.changes, result.caret);
  return { doc: out.doc, caret: out.doc.caret, changed: true };
}
