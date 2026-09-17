/**
 * Multi-cursor tests (overhaul §8.7, task 2.6).
 * Run: node --test tests/unit/multicursor.test.js
 *
 * Acceptance: "Cursor-collision collapse tests; one undo step per batch; all
 * Appendix B.5 <C-A-*>/<C-d> binds live".
 *
 * "One undo step" is asserted the way the editor will do it: build the change
 * batch, pass it to `applyEdit` ONCE, and check that the records the history
 * module would see are one before/after pair.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { applyEdit, createSession, docFromText, docText, pos } from '../../src/editor/document.js';
import { createHistory, historyDepth, historyRecord, historyUndo } from '../../src/editor/history.js';
import { createSelection } from '../../src/editor/selection.js';
import {
  CAP_NOTICE, MAX_CURSORS, addCursorAbove, addCursorAtNextMatch, addCursorBelow, caretAfter,
  clearCursors, createCursorSet, cursorCount, cursorSetForEdit, cursorsForBlock, deleteAtCursors,
  indentAtCursors, insertAtCursors, isMulti, moveCursors, normaliseCursors, pairAtCursors, primaryCursor,
} from '../../src/editor/multicursor.js';

const doc = (text, caret) => docFromText(text, { caret });
const setAt = (doc_, ...points) => normaliseCursors({ cursors: points, primary: 0 }, doc_);

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

test('multi-cursor: a fresh set holds the caret as its single (primary) cursor', () => {
  const d = doc('abc\ndef', pos(1, 1));
  const set = createCursorSet(d);
  assert.equal(cursorCount(set), 1);
  assert.equal(isMulti(set), false);
  assert.deepEqual(primaryCursor(set), pos(1, 1));
});

test('multi-cursor: cursors collide, collapse, and stay clamped', () => {
  const d = doc('ab\ncd');
  const set = normaliseCursors({ cursors: [pos(0, 1), pos(0, 1), pos(9, 9)], primary: 0 }, d, pos(0, 1));
  assert.deepEqual(set.cursors, [pos(0, 1), pos(1, 2)], 'deduped, sorted and clamped into the document');
  assert.equal(set.primary, 0);
  assert.deepEqual(cursorSetForEdit({ cursors: [pos(0, 0), pos(0, 0)], primary: 0 }, d), [pos(0, 0)],
    'an edit must never see the same cursor twice');
});

test('multi-cursor: the cap is enforced with a notice', () => {
  const lines = Array.from({ length: 60 }, (_, i) => `line ${i}`).join('\n');
  const d = doc(lines);
  let set = createCursorSet(d, {});
  set = { cursors: Array.from({ length: MAX_CURSORS }, (_, i) => pos(i, 0)), primary: 0 };
  const out = addCursorBelow(set, d);
  assert.equal(out.added, false);
  assert.equal(out.notice, CAP_NOTICE);
  assert.equal(cursorCount(out.set), MAX_CURSORS, 'the cap is never exceeded');
});

test('multi-cursor: addCursorBelow/Above walk outward from the set and report edges', () => {
  const d = doc('aa\nbb\ncc');
  let set = setAt(d, pos(0, 1));
  const below = addCursorBelow(set, d);
  assert.equal(below.added, true);
  assert.deepEqual(below.set.cursors, [pos(0, 1), pos(1, 1)]);
  const below2 = addCursorBelow(below.set, d);
  assert.deepEqual(below2.set.cursors, [pos(0, 1), pos(1, 1), pos(2, 1)], 'the next one goes below the LAST cursor');
  const edge = addCursorBelow(below2.set, d);
  assert.equal(edge.added, false);
  assert.equal(edge.notice, 'no line below');

  const up = addCursorAbove(below2.set, d);
  assert.deepEqual(up.set.cursors, [pos(0, 1), pos(1, 1), pos(2, 1)], 'nothing above row 0');
  assert.equal(up.added, false);
  assert.equal(up.notice, 'no line above');

  const above = addCursorAbove(setAt(d, pos(1, 0)), d);
  assert.deepEqual(above.set.cursors, [pos(0, 0), pos(1, 0)]);
});

test('multi-cursor: adding below shares the column and clamps to the line length', () => {
  const d = doc('long line\nab');
  const out = addCursorBelow(setAt(d, pos(0, 8)), d);
  assert.deepEqual(out.set.cursors, [pos(0, 8), pos(1, 2)]);
});

test('multi-cursor: <C-d> adds the next match, and says so when there is none', () => {
  const d = doc('foo foo');
  const findNext = (document) => ({ row: 0, col: 4 });
  const out = addCursorAtNextMatch(setAt(d, pos(0, 0)), d, { findNext });
  assert.equal(out.added, true);
  assert.deepEqual(out.set.cursors, [pos(0, 0), pos(0, 4)]);
  const again = addCursorAtNextMatch(out.set, d, { findNext: () => ({ row: 0, col: 4 }) });
  assert.equal(again.added, false);
  assert.equal(again.notice, 'already selected');
  const none = addCursorAtNextMatch(setAt(d, pos(0, 0)), d, { findNext: () => null });
  assert.equal(none.notice, 'no further match');
  assert.equal(cursorCount(none.set), 1);
});

test('multi-cursor: a visual block produces one cursor per row and caps out', () => {
  const d = doc(['abc', 'abc', 'abc'].join('\n'));
  const sel = createSelection(pos(0, 1), pos(2, 1));
  const { set } = cursorsForBlock(d, sel);
  assert.deepEqual(set.cursors, [pos(0, 1), pos(1, 1), pos(2, 1)]);
  const right = cursorsForBlock(d, sel, { at: 'right' });
  assert.deepEqual(right.set.cursors, [pos(0, 1), pos(1, 1), pos(2, 1)], 'right edge clamps per row');

  const tall = doc(Array.from({ length: 80 }, (_, i) => `row ${i}`).join('\n'));
  const capped = cursorsForBlock(tall, createSelection(pos(0, 0), pos(79, 6)));
  assert.equal(capped.set.cursors.length, MAX_CURSORS);
  assert.equal(capped.notice, CAP_NOTICE);
});

test('multi-cursor: clearCursors keeps the primary and drops the rest', () => {
  const d = doc('ab\ncd');
  const set = { cursors: [pos(0, 0), pos(1, 1)], primary: 1 };
  const cleared = clearCursors(set, d);
  assert.equal(cursorCount(cleared), 1);
  assert.deepEqual(cleared.cursors, [pos(1, 1)]);
});

// ---------------------------------------------------------------------------
// Edits
// ---------------------------------------------------------------------------

test('multi-cursor: typing lands at every cursor as ONE transaction', () => {
  const d = doc(['aa', 'bb', 'cc'].join('\n'));
  const set = setAt(d, pos(0, 0), pos(1, 1), pos(2, 2));
  const { changes, carets } = insertAtCursors(d, set, 'X');
  assert.equal(changes.length, 3);

  // The history module is pure: recording hands back a new history.
  let history = createHistory();
  const { doc: after } = applyEdit(d, changes, caretAfter(changes, carets, set.primary));
  history = historyRecord(history, d, after, { label: 'type' });
  assert.equal(docText(after), 'Xaa\nbXb\nccX');
  assert.equal(historyDepth(history), 1, 'one batch is one undo step');
  const undone = historyUndo(history);
  assert.equal(docText(undone.doc), 'aa\nbb\ncc', 'undo restores the whole batch in one step');
});

test('multi-cursor: a shared line is not double-edited', () => {
  const d = doc('abcdef');
  const set = setAt(d, pos(0, 1), pos(0, 1));
  const { changes } = insertAtCursors(d, set, 'X');
  assert.equal(changes.length, 1, 'collapsed first: two identical inserts would overlap');
  assert.equal(docText(applyEdit(d, changes).doc), 'aXbcdef');
});

test('multi-cursor: backspace deletes one character per cursor and joins at column 0', () => {
  const d = doc(['abc', 'def'].join('\n'));
  const set = setAt(d, pos(0, 1), pos(1, 1));
  // Backspace removes what is BEFORE each caret (there is no character under a
  // between-characters caret to remove).
  assert.equal(docText(applyEdit(d, deleteAtCursors(d, set, { count: 1 }).changes).doc), 'bc\nef');
  const atStart = setAt(d, pos(1, 0));
  assert.equal(docText(applyEdit(d, deleteAtCursors(d, atStart, { count: 1 }).changes).doc), 'abcdef',
    'a cursor at column 0 joins upward');
});

test('multi-cursor: forward delete at end of line joins downward', () => {
  const d = doc('ab\ncd');
  const set = setAt(d, pos(0, 2));
  assert.equal(docText(applyEdit(d, deleteAtCursors(d, set, { count: 1, backward: false }).changes).doc), 'abcd');
});

test('multi-cursor: auto-pair inserts at every cursor with the caret between halves', () => {
  const d = doc(['a', 'b'].join('\n'));
  const set = setAt(d, pos(0, 1), pos(1, 1));
  const { changes, carets } = pairAtCursors(d, set, '(', ')');
  const { doc: after, caret } = applyEdit(d, changes, caretAfter(changes, carets, 0));
  assert.equal(docText(after), 'a()\nb()');
  assert.deepEqual(caret, pos(0, 2));
});

test('multi-cursor: indent touches each distinct line once', () => {
  const d = doc(['a', 'b', 'c'].join('\n'));
  const set = setAt(d, pos(0, 0), pos(0, 0), pos(2, 0));
  const { changes, rows } = indentAtCursors(d, set, { tabSize: 2 });
  assert.deepEqual(rows, [0, 2]);
  assert.equal(docText(applyEdit(d, changes).doc), '  a\nb\n  c');
});

test('multi-cursor: outdent stops at the line start', () => {
  const d = doc(['    a', '\tb'].join('\n'));
  const set = setAt(d, pos(0, 4), pos(1, 1));
  const { changes } = indentAtCursors(d, set, { tabSize: 2, outdent: true });
  assert.equal(docText(applyEdit(d, changes).doc), '  a\nb', 'spaces come off two at a time, a tab all at once');
});

test('multi-cursor: every cursor moves by the same step', () => {
  const d = doc(['abc', 'de'].join('\n'));
  const set = setAt(d, pos(0, 0), pos(1, 0));
  const moved = moveCursors(set, d, (p) => pos(p.row, p.col + 2));
  assert.deepEqual(moved.cursors, [pos(0, 2), pos(1, 2)]);
  const clamped = moveCursors(set, d, (p) => pos(p.row, p.col + 99));
  assert.deepEqual(clamped.cursors, [pos(0, 3), pos(1, 2)], 'clamped per line, not to one shared column');
});

test('multi-cursor: caretAfter follows the primary cursor', () => {
  const carets = [pos(0, 1), pos(1, 1), pos(2, 1)];
  assert.deepEqual(caretAfter([], carets, 1), pos(1, 1));
  assert.deepEqual(caretAfter([], carets, 99), pos(2, 1), 'out of range falls back to the last');
  assert.deepEqual(caretAfter([], [], 0), pos(0, 0));
});

test('multi-cursor: a multi-file session keeps each file\'s cursors independent', () => {
  const session = createSession({ 'a.js': 'aa', 'b.js': 'bb' }, { order: ['a.js', 'b.js'], active: 'a.js' });
  const d = session.files['a.js'].doc;
  const set = setAt(d, pos(0, 0), pos(0, 1));
  assert.equal(cursorCount(set), 2);
  assert.equal(docText(session.files['b.js'].doc), 'bb', 'the other tab is untouched');
});
