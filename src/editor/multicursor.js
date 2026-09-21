/**
 * Multi-cursor (overhaul §8.7, task 2.6).
 *
 * A cursor set is `{ cursors: [{row,col}], primary: index }` — plain data, so it
 * lives in the same state object as the document and an undo step can capture
 * it. Every operation returns ONE change list for every cursor, which is what
 * makes the batch a single undo step: the caller hands the list to
 * `applyEdit`, and `applyEdit`'s overlap check is the backstop that catches a
 * bug here instead of silently corrupting text.
 *
 * Two invariants the tests pin down:
 *   - cursors never collide (`collapse`) and never exceed the cap (50, with a
 *     notice — §8.7), and
 *   - the PRIMARY cursor is the one the caret renders at, so an operation that
 *     only makes sense for one cursor still has one.
 *
 * The primary cursor is stored as an INDEX, not a copy: keeping a second copy of
 * a position is how multi-cursor implementations end up typing at a stale spot
 * after the first cursor's edit shifts the others.
 */
import { cmpPos, pos } from './document.js';
import { blockPositions, collapsePositions } from './selection.js';

export const MAX_CURSORS = 50;

export function createCursorSet(doc, { primary = 0 } = {}) {
  const at = doc && doc.caret ? doc.caret : pos(0, 0);
  return { cursors: [at], primary };
}

/** A notice when the cap is hit, so the UI can say why nothing happened. */
export const CAP_NOTICE = `cursors capped at ${MAX_CURSORS}`;

export function cursorCount(set) {
  return set ? set.cursors.length : 0;
}

export function primaryCursor(set) {
  if (!set || !set.cursors.length) return pos(0, 0);
  return set.cursors[Math.max(0, Math.min(set.primary, set.cursors.length - 1))];
}

export function isMulti(set) {
  return cursorCount(set) > 1;
}

/**
 * Normalise a cursor set: drop duplicates, sort, clamp into the document, and
 * keep the caret as the primary.
 */
export function normaliseCursors(set, doc, caret = null) {
  // The set's own primary is the default "wanted" position; `doc.caret` is only
  // a seed for an EMPTY set. Pulling `doc.caret` into a populated set every time
  // silently added a stray cursor at the document's caret.
  const wanted = caret
    || (set && set.cursors && set.cursors.length ? primaryCursor(set) : null)
    || (doc && doc.caret)
    || pos(0, 0);
  const list = collapsePositions([...(set ? set.cursors : []), wanted]);
  const rows = doc ? doc.lines.length : 1;
  const clamped = list.map((p) => {
    const row = Math.max(0, Math.min(p.row, rows - 1));
    const len = doc ? doc.lines[row].length : 0;
    return pos(row, Math.max(0, Math.min(p.col, len)));
  });
  const unique = collapsePositions(clamped);
  return { cursors: unique, primary: unique.findIndex((p) => cmpPos(p, wanted) === 0) };
}

const notice = (message) => (message ? { notice: message } : {});

/** Add a cursor one line below the LAST cursor's line, at its column. */
export function addCursorBelow(set, doc) {
  return addCursor(set, doc, 1);
}

export function addCursorAbove(set, doc) {
  return addCursor(set, doc, -1);
}

function addCursor(set, doc, dir) {
  const list = set.cursors;
  const last = list[list.length - 1];
  const first = list[0];
  const anchor = dir > 0 ? last : first;
  const row = anchor.row + dir;
  if (row < 0 || row >= doc.lines.length) {
    return { set, added: false, ...notice(dir > 0 ? 'no line below' : 'no line above') };
  }
  if (list.length >= MAX_CURSORS) return { set, added: false, ...notice(CAP_NOTICE) };
  const next = pos(row, Math.min(anchor.col, doc.lines[row].length));
  const existing = list.some((p) => cmpPos(p, next) === 0);
  const cursors = existing ? list : collapsePositions([...list, next]);
  const wrapped = { cursors, primary: set.primary };
  return { set: normaliseCursors(wrapped, doc, primaryCursor(set)), added: !existing, ...notice(existing ? 'cursor already there' : null) };
}

/**
 * `<C-d>`: select the word under the caret, then add a cursor at the next
 * occurrence so every subsequent keystroke edits all of them. The selection is
 * returned (not applied) — the caller decides whether to show it.
 *
 * @returns {{ set, selection, added, notice? }}
 */
export function addCursorAtNextMatch(set, doc, { findNext, tabSize = 2 } = {}) {
  const from = primaryCursor(set);
  const next = typeof findNext === 'function' ? findNext(doc, from) : null;
  if (!next) return { set, added: false, ...notice('no further match') };
  if (set.cursors.length >= MAX_CURSORS) return { set, added: false, ...notice(CAP_NOTICE) };
  const existing = set.cursors.some((p) => cmpPos(p, next) === 0);
  const cursors = existing ? set.cursors : collapsePositions([...set.cursors, next]);
  const wrapped = { cursors, primary: set.primary };
  return {
    set: normaliseCursors(wrapped, doc, primaryCursor(set)),
    added: !existing,
    selection: null,
    ...notice(existing ? 'already selected' : null),
  };
}

/** Visual-block column insert: one cursor per row of the block. */
export function cursorsForBlock(doc, selection, { at = 'left' } = {}) {
  const list = blockPositions(doc, selection, at);
  if (list.length > MAX_CURSORS) {
    return { set: { cursors: list.slice(0, MAX_CURSORS), primary: 0 }, ...notice(CAP_NOTICE) };
  }
  return { set: { cursors: list, primary: 0 } };
}

export function clearCursors(set, doc) {
  const caret = primaryCursor(set);
  return normaliseCursors({ cursors: [caret], primary: 0 }, doc, caret);
}

/**
 * Typing at every cursor: one change per cursor, in document order.
 *
 * `text` is inserted at each cursor; at a cursor that sits on a selection the
 * caller passes `replacements` instead, so a multi-cursor paste over a
 * selection works the same way.
 */
export function insertAtCursors(doc, set, text, { replacements = null } = {}) {
  const list = cursorSetForEdit(set, doc);
  const changes = list.map((p, i) => {
    if (replacements && replacements[i]) {
      return { start: replacements[i].start, end: replacements[i].end, text };
    }
    return { start: p, end: p, text };
  });
  return { changes, carets: list.map((p) => pos(p.row, p.col + String(text).length)) };
}

/** Backspace at every cursor: delete one character (or join lines) per cursor. */
export function deleteAtCursors(doc, set, { count = 1, backward = true, pair = null } = {}) {
  const list = cursorSetForEdit(set, doc);
  const changes = [];
  const carets = [];
  for (const p of list) {
    const line = doc.lines[p.row];
    if (backward) {
      if (p.col === 0) {
        if (p.row === 0) { carets.push(p); continue; }
        const start = pos(p.row - 1, doc.lines[p.row - 1].length);
        changes.push({ start, end: p, text: '' });
        carets.push(start);
        continue;
      }
      const start = pos(p.row, Math.max(0, p.col - count));
      changes.push({ start, end: p, text: '' });
      carets.push(start);
      continue;
    }
    const end = pos(p.row, Math.min(p.col + count, line.length));
    if (end.col === p.col) {
      if (p.row >= doc.lines.length - 1) { carets.push(p); continue; }
      changes.push({ start: p, end: pos(p.row + 1, 0), text: '' });
      carets.push(p);
      continue;
    }
    changes.push({ start: p, end, text: '' });
    carets.push(p);
  }
  return { changes, carets };
}

/**
 * Auto-pairing per cursor: an opening bracket inserts its closer at EVERY
 * cursor, and backspacing between an empty pair removes both halves. `pair` is
 * `{ open, close }` or the caller's own opener (see `vim.js`'s PAIRS).
 */
export function pairAtCursors(doc, set, ch, closer) {
  const list = cursorSetForEdit(set, doc);
  const changes = list.map((p) => ({ start: p, end: p, text: `${ch}${closer}` }));
  return { changes, carets: list.map((p) => pos(p.row, p.col + 1)) };
}

/** Indent/outdent at every cursor's line (deduped, so a shared line is indented once). */
export function indentAtCursors(doc, set, { tabSize = 2, outdent = false } = {}) {
  const rows = collapsePositions(set.cursors).map((p) => p.row);
  const unique = [...new Set(rows)].sort((a, b) => a - b);
  const width = Math.max(1, tabSize);
  const changes = [];
  const carets = [];
  for (const row of unique) {
    const line = doc.lines[row] || '';
    if (outdent) {
      const spaces = /^ +/.exec(line);
      if (!spaces && !line.startsWith('\t')) { carets.push(doc.caret); continue; }
      const cut = line.startsWith('\t') ? 1 : Math.min(spaces[0].length, width);
      changes.push({ start: pos(row, 0), end: pos(row, cut), text: '' });
      continue;
    }
    if (line.trim() === '') continue;
    changes.push({ start: pos(row, 0), end: pos(row, 0), text: ' '.repeat(width) });
  }
  return { changes, rows: unique, carets };
}

/**
 * The cursor list an edit should use, already collapsed and clamped. Edits MUST
 * go through this: two cursors on the same position would produce two identical
 * insertions, and `applyEdit` rejects the overlap.
 */
export function cursorSetForEdit(set, doc) {
  const normalised = normaliseCursors(set, doc, primaryCursor(set));
  return collapsePositions(normalised.cursors);
}

/** Move every cursor by the same relative motion. */
export function moveCursors(set, doc, move) {
  const cursors = set.cursors.map((p) => {
    const next = move(p, doc);
    const row = Math.max(0, Math.min(next.row, doc.lines.length - 1));
    return pos(row, Math.max(0, Math.min(next.col, doc.lines[row].length)));
  });
  return normaliseCursors({ cursors, primary: set.primary }, doc);
}

/** Where the caret lands after a batch edit (the primary cursor's new spot). */
export function caretAfter(changes, carets, primary) {
  const at = carets[Math.max(0, Math.min(primary, carets.length - 1))];
  return at || (changes[0] ? changes[0].start : pos(0, 0));
}
