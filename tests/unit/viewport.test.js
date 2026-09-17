/**
 * Viewport geometry tests (overhaul task 2.8) — the pure half of CodeEditor.
 * Run: node --test tests/unit/viewport.test.js
 *
 * Acceptance anchors: scroll math never shows a negative or past-the-end
 * offset; the caret-follow never leaves the caret off-screen; click→caret
 * lands on a typeable position even past EOL/below the last row; wide chars
 * are never cut mid-cell; the selection renders per-row in visual columns.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  clampScrollTop,
  clickToPos,
  cursorPoint,
  followCaret,
  gutterWidth,
  rowPieces,
  selectionRows,
  visibleRows,
} from '../../src/editor/viewport.js';
import { docFromText, pos } from '../../src/editor/document.js';
import { createSelection } from '../../src/editor/selection.js';
import { highlightLine } from '../../src/editor/highlight.js';

const THEME = {
  id: 'test', comment: 'c', keyword: 'k', string: 's', number: 'n',
  accent: 'a', accentSoft: 'a2', star: 'st',
};

// ---------------------------------------------------------------------------
// Scroll
// ---------------------------------------------------------------------------

test('clampScrollTop: negative and past-the-end scroll clamp into range', () => {
  const doc = docFromText('a\nb\nc');
  assert.deepEqual(clampScrollTop(doc, { scrollTop: -5, scrollX: -1 }), { scrollTop: 0, scrollX: 0 });
  assert.deepEqual(clampScrollTop(doc, { scrollTop: 99, scrollX: 3 }), { scrollTop: 2, scrollX: 3 });
  assert.deepEqual(clampScrollTop(doc, null), { scrollTop: 0, scrollX: 0 });
});

test('followCaret: no movement while the caret is inside the window', () => {
  const doc = docFromText('one\ntwo\nthree\lfour\nfive');
  doc.caret = pos(2, 1);
  const view = { scrollTop: 1, scrollX: 0 };
  assert.deepEqual(followCaret(doc, view, { height: 3, width: 20 }), { scrollTop: 1, scrollX: 0 });
});

test('followCaret: scrolls up when the caret is above, down when below', () => {
  const doc = docFromText('1\n2\n3\n4\n5\n6\n7\n8\n9\n10');
  doc.caret = pos(0, 0);
  assert.equal(followCaret(doc, { scrollTop: 5, scrollX: 0 }, { height: 3, width: 10 }).scrollTop, 0);
  doc.caret = pos(9, 0);
  assert.equal(followCaret(doc, { scrollTop: 0, scrollX: 0 }, { height: 3, width: 10 }).scrollTop, 7);
});

test('followCaret: horizontal scroll keeps the caret cell visible', () => {
  const doc = docFromText('x'.repeat(60));
  doc.caret = pos(0, 55);
  const v = followCaret(doc, { scrollTop: 0, scrollX: 0 }, { height: 1, width: 20 });
  assert.ok(v.scrollX <= 55 && 55 < v.scrollX + 20, 'caret col inside window');
  // A caret scrolled out to the left is scrolled BACK into view (the cell must
  // be visible; vim-like editors leave the column, but the caret would be
  // undrawable — followCaret's contract is "the caret can always be drawn").
  doc.caret = pos(0, 2);
  const v2 = followCaret(doc, { scrollTop: 0, scrollX: 40 }, { height: 1, width: 20 });
  assert.equal(v2.scrollX, 2);
});

// ---------------------------------------------------------------------------
// Visible rows
// ---------------------------------------------------------------------------

test('visibleRows: exactly height rows, padded with null past EOF', () => {
  const doc = docFromText('a\nb');
  const rows = visibleRows(doc, { top: 1, height: 4 });
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map((r) => r.line), ['b', null, null, null]);
  assert.deepEqual(rows.map((r) => r.top), [0, 1, 2, 3]);
});

// ---------------------------------------------------------------------------
// Click mapping
// ---------------------------------------------------------------------------

test('clickToPos: past EOL clamps to end of line, below EOF to last row', () => {
  const doc = docFromText('hello\nhi');
  assert.deepEqual(clickToPos(doc, 0, 3), { row: 0, col: 3 });
  assert.deepEqual(clickToPos(doc, 0, 99), { row: 0, col: 5 });
  assert.deepEqual(clickToPos(doc, 42, 1), { row: 1, col: 1 });
  assert.deepEqual(clickToPos(doc, -1, 0), { row: 0, col: 0 });
});

test('clickToPos: lands before, not on, a wide character cell', () => {
  const doc = docFromText('你好');
  // col 0 is 你 (width 2): a click at visual col 1 is INSIDE that cell.
  assert.deepEqual(clickToPos(doc, 0, 1), { row: 0, col: 0 });
  assert.deepEqual(clickToPos(doc, 0, 2), { row: 0, col: 1 });
});

test('clickToPos: tabs snap forward to the tab stop they belong to', () => {
  const doc = docFromText('\tfoo', '');
  doc.lines = ['\tfoo'];
  // tabSize 2: \t covers visual col 0–1; col 1 clicks into the tab.
  assert.deepEqual(clickToPos(doc, 0, 0, { tabSize: 2 }), { row: 0, col: 0 });
  assert.deepEqual(clickToPos(doc, 0, 2, { tabSize: 2 }), { row: 0, col: 1 });
});

// ---------------------------------------------------------------------------
// Selection rows
// ---------------------------------------------------------------------------

test('selectionRows: inverted selection normalises, per-row visual columns', () => {
  const doc = docFromText('abcdef\nghijkl\nmnopqr');
  const sel = createSelection(pos(2, 2), pos(0, 3)); // head before anchor
  const rows = selectionRows(doc, sel, { top: 0, height: 10 });
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], { row: 0, fromCol: 3, toCol: Number.MAX_SAFE_INTEGER });
  assert.deepEqual(rows[1], { row: 1, fromCol: 0, toCol: Number.MAX_SAFE_INTEGER });
  assert.deepEqual(rows[2], { row: 2, fromCol: 0, toCol: 2 });
});

test('selectionRows: restricted to the viewport', () => {
  const doc = docFromText('a\nb\nc\nd\ne');
  const sel = createSelection(pos(0, 0), pos(4, 1));
  const rows = selectionRows(doc, sel, { top: 2, height: 2 });
  assert.deepEqual(rows.map((r) => r.row), [2, 3]);
});

test('selectionRows: no selection → no rows', () => {
  const doc = docFromText('abc');
  assert.deepEqual(selectionRows(doc, null, { top: 0, height: 5 }), []);
  assert.deepEqual(selectionRows(doc, createSelection(pos(0, 1), pos(0, 1)), { top: 0, height: 5 }), []);
});

// ---------------------------------------------------------------------------
// rowPieces (highlight × selection × horizontal window)
// ---------------------------------------------------------------------------

const hl = (line) => highlightLine(line, 'js', THEME);

test('rowPieces: plain language → one piece with the raw text', () => {
  const pieces = rowPieces([], 'hello world', { startCol: 0, width: 80 });
  assert.deepEqual(pieces.map((p) => p.text), ['hello world']);
  assert.equal(pieces[0].inverse, false);
});

test('rowPieces: coloured segments keep their roles after cutting', () => {
  const segs = hl('const x = 1;');
  const pieces = rowPieces(segs, 'const x = 1;', { startCol: 0, width: 80 });
  assert.deepEqual(pieces.map((p) => p.text), ['const', ' x = ', '1', ';']);
  assert.equal(pieces[0].color, 'k');
});

test('rowPieces: horizontal window cuts at visual columns', () => {
  const segs = hl('const x = 1;');
  const pieces = rowPieces(segs, 'const x = 1;', { startCol: 2, width: 4 });
  assert.equal(pieces.map((p) => p.text).join(''), 'nst ');
});

test('rowPieces: a wide character is never cut mid-cell', () => {
  const pieces = rowPieces([], '你好', { startCol: 1, width: 10 });
  // startCol 1 is inside 你 (width 2): the cut snaps forward, so the row
  // starts with 你 and keeps its full width.
  assert.equal(pieces.map((p) => p.text).join('').startsWith('你'), true);
});

test('rowPieces: selection sets inverse only inside its range', () => {
  const segs = hl('const x = 1;');
  const pieces = rowPieces(segs, 'const x = 1;', { startCol: 0, width: 80, selFrom: 2, selTo: 7 });
  const inv = pieces.map((p) => (p.inverse ? p.text : null)).filter(Boolean);
  // Selection [2,7) cuts "const" into "co"+"nst" and " x = " into " x"+" = ".
  assert.deepEqual(inv, ['nst', ' x'], 'inverse pieces are exactly the selection');
  assert.equal(pieces[0].inverse, false, 'the unselected "co" stays normal');
  assert.equal(pieces.map((p) => p.text).join(''), 'const x = 1;', 'pieces reassemble the line');
});

// ---------------------------------------------------------------------------
// Caret point + gutter
// ---------------------------------------------------------------------------

test('cursorPoint: box-relative coordinates, null when scrolled away', () => {
  const doc = docFromText('abc\ndef');
  doc.caret = pos(1, 2);
  const p = cursorPoint({ top: 0, left: 5, height: 3, width: 20 }, doc, { scrollTop: 0, scrollX: 0 });
  assert.deepEqual(p, { x: 7, y: 1 });
  doc.caret = pos(5, 0);
  assert.equal(cursorPoint({ top: 0, left: 5, height: 3, width: 20 }, doc, { scrollTop: 0, scrollX: 0 }), null);
});

test('gutterWidth: digits of the line count plus padding', () => {
  const doc = docFromText('a\nb\nc');
  assert.equal(gutterWidth(doc, { height: 3 }), 3);
  const big = docFromText(Array.from({ length: 120 }, (_, i) => String(i)).join('\n'));
  assert.equal(gutterWidth(big, { height: 10 }), 5);
});
