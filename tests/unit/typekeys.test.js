/**
 * Modeless typing tests (overhaul task 2.9).
 * Run: node --test tests/unit/typekeys.test.js
 *
 * Parity anchors with the classic editor (src/views/editor.js): auto-indent
 * after an opener, indent-step backspace, seam-crossing arrows, and every
 * operation expressed as an applyEdit change list (so one undo step per key).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { applyEdit, docFromText, docText, pos } from '../../src/editor/document.js';
import { createHistory, historyRecord, historyUndo } from '../../src/editor/history.js';
import {
  applyTyped,
  moveArrow,
  typeBackspace,
  typeDelete,
  typeNewline,
  typeText,
} from '../../src/editor/typekeys.js';

const type = (text, at, docTextString = 'x') => {
  const doc = docFromText(docTextString);
  doc.caret = at;
  return typeText(doc, text);
};

test('typing inserts at the caret and moves it after the text', () => {
  const doc = docFromText('hello');
  doc.caret = pos(0, 5);
  const r = typeText(doc, ' world');
  const out = applyEdit(doc, r.changes, r.caret);
  assert.equal(docText(out.doc), 'hello world');
  assert.deepEqual(out.doc.caret, pos(0, 11));
});

test('backspace removes the previous character', () => {
  const doc = docFromText('abc');
  doc.caret = pos(0, 3);
  const r = typeBackspace(doc);
  const out = applyEdit(doc, r.changes, r.caret);
  assert.equal(docText(out.doc), 'ab');
  assert.deepEqual(out.doc.caret, pos(0, 2));
});

test('backspace on clean indentation deletes a whole indent step', () => {
  const doc = docFromText('    return');
  doc.caret = pos(0, 4);
  const r = typeBackspace(doc, null, { indentSize: 2 });
  const out = applyEdit(doc, r.changes, r.caret);
  assert.equal(docText(out.doc), '  return');
  assert.deepEqual(out.doc.caret, pos(0, 2));
});

test('backspace at column 0 joins the previous line', () => {
  const doc = docFromText('ab\ncd');
  doc.caret = pos(1, 0);
  const r = typeBackspace(doc);
  const out = applyEdit(doc, r.changes, r.caret);
  assert.equal(docText(out.doc), 'abcd');
  assert.deepEqual(out.doc.caret, pos(0, 2));
});

test('backspace at the very start is a no-op', () => {
  const doc = docFromText('abc');
  const r = typeBackspace(doc);
  assert.deepEqual(r.changes, []);
});

test('delete removes the character at the caret', () => {
  const doc = docFromText('abc');
  doc.caret = pos(0, 1);
  const r = typeDelete(doc);
  const out = applyEdit(doc, r.changes, r.caret);
  assert.equal(docText(out.doc), 'ac');
  assert.deepEqual(out.doc.caret, pos(0, 1));
});

test('delete at end of line joins the next line', () => {
  const doc = docFromText('ab\ncd');
  doc.caret = pos(0, 2);
  const r = typeDelete(doc);
  const out = applyEdit(doc, r.changes, r.caret);
  assert.equal(docText(out.doc), 'abcd');
});

test('newline keeps the indent of the split line', () => {
  const doc = docFromText('  return x;');
  doc.caret = pos(0, 9); // after "return x"
  const r = typeNewline(doc);
  const out = applyEdit(doc, r.changes, r.caret);
  assert.equal(docText(out.doc), '  return \n  x;');
  assert.deepEqual(out.doc.caret, pos(1, 2));
});

test('newline after an opener bumps the indent one level', () => {
  const doc = docFromText('function f() {');
  doc.caret = pos(0, 14);
  const r = typeNewline(doc);
  const out = applyEdit(doc, r.changes, r.caret);
  assert.equal(docText(out.doc), 'function f() {\n  ');
  assert.deepEqual(out.doc.caret, pos(1, 2));
});

test('a selection is replaced by typed text', () => {
  const doc = docFromText('const x = 1;');
  const sel = { anchor: pos(0, 6), head: pos(0, 11) }; // "x = 1"
  const r = typeText(doc, 'y', sel);
  const out = applyEdit(doc, r.changes, r.caret);
  assert.equal(docText(out.doc), 'const y;');
  assert.deepEqual(out.doc.caret, pos(0, 7));
});

test('backspace with a selection removes exactly the selection', () => {
  const doc = docFromText('const x = 1;');
  const sel = { anchor: pos(0, 6), head: pos(0, 11) };
  const r = typeBackspace(doc, sel);
  const out = applyEdit(doc, r.changes, r.caret);
  assert.equal(docText(out.doc), 'const ;');
});

test('multi-line paste folds every newline through the indent rules', () => {
  const doc = docFromText('function f() {');
  doc.caret = pos(0, 14);
  const r = typeText(doc, '\n  return 1;\n}');
  const out = applyEdit(doc, r.changes, r.caret);
  // Classic parity: each newline re-indents from the LINE's current text, and
  // the pasted segment's own leading spaces count toward it — so the pasted
  // '  ' accumulates ('  ' bump + pasted '  '). Naive, but exactly what the
  // classic's insertText produces; the formatter cleans the rest up.
  assert.equal(docText(out.doc), 'function f() {\n    return 1;\n    }');
  // One transform → the caret is after the last pasted segment.
  assert.deepEqual(out.doc.caret, pos(2, 5));
});

test('arrows cross line seams and clamp at the document edges', () => {
  const doc = docFromText('ab\ncd');
  doc.caret = pos(0, 2);
  assert.deepEqual(moveArrow(doc, 'right'), pos(1, 0), 'right wraps to the next line');
  doc.caret = pos(1, 0);
  assert.deepEqual(moveArrow(doc, 'left'), pos(0, 2), 'left wraps to the previous line');
  doc.caret = pos(0, 0);
  assert.deepEqual(moveArrow(doc, 'left'), pos(0, 0), 'left at doc start clamps');
  doc.caret = pos(1, 1);
  assert.deepEqual(moveArrow(doc, 'down'), pos(1, 1), 'down at last line clamps');
});

test('every keystroke is ONE applyEdit pass — one history step per key', () => {
  const doc = docFromText('function f() {');
  doc.caret = pos(0, 14);
  let history = createHistory();
  const r = typeNewline(doc);
  const out = applyEdit(doc, r.changes, r.caret);
  history = historyRecord(history, doc, out.doc, { coalesce: true }); // pure: returns a new history
  // historyUndo returns { doc } — the document BEFORE the whole keystroke.
  assert.equal(historyUndo(history).doc.lines.join(''), 'function f() {');
});

test('applyTyped returns the composed document and caret', () => {
  const doc = docFromText('a');
  doc.caret = pos(0, 1);
  const r = typeText(doc, 'b\nc');
  const out = applyTyped(doc, r);
  assert.equal(docText(out.doc), 'ab\nc');
  assert.deepEqual(out.doc.caret, pos(1, 1));
  assert.equal(out.changed, true);
});
