import test from 'node:test';
import assert from 'node:assert/strict';

import {
  emptyEditor, editorText, offsetOf, rowColOf, insertNewline, backspace, insertChar,
} from '../../src/views/editor.js';

test('rowColOf is the inverse of offsetOf for every offset', () => {
  const src = 'one\ntwo\n\nfour';
  const ed = emptyEditor(src);
  for (let i = 0; i <= src.length; i += 1) {
    const { row, col } = rowColOf(ed, i);
    ed.row = row;
    ed.col = col;
    assert.equal(offsetOf(ed), i, `offset ${i} round-tripped to ${offsetOf(ed)}`);
  }
});

test('rowColOf clamps out-of-range and non-numeric offsets', () => {
  const ed = emptyEditor('ab\ncd');
  assert.deepEqual(rowColOf(ed, 999), { row: 1, col: 2 });
  assert.deepEqual(rowColOf(ed, -5), { row: 0, col: 0 });
  assert.deepEqual(rowColOf(ed, NaN), { row: 0, col: 0 });
});

test('insertNewline uses the default two-space indent after an opener', () => {
  const ed = emptyEditor('div {');
  ed.row = 0;
  ed.col = 5;
  insertNewline(ed);
  assert.deepEqual(ed.lines, ['div {', '  ']);
  assert.equal(ed.col, 2);
});

test('insertNewline honours the configured indent width (Q12)', () => {
  const ed = emptyEditor('function f() {');
  ed.row = 0;
  ed.col = 14;
  insertNewline(ed, 4);
  assert.deepEqual(ed.lines, ['function f() {', '    ']);
  assert.equal(ed.col, 4);
});

test('insertNewline keeps existing indentation and adds a level after an opener', () => {
  const ed = emptyEditor('  if (x) {');
  ed.row = 0;
  ed.col = 10;
  insertNewline(ed, 4);
  assert.deepEqual(ed.lines, ['  if (x) {', '      ']);
});

test('backspace deletes one configured indent level of clean indentation', () => {
  const ed = emptyEditor('    ');
  ed.row = 0;
  ed.col = 4;
  backspace(ed, 4);
  assert.equal(editorText(ed), '');
  const two = emptyEditor('  ');
  two.row = 0;
  two.col = 2;
  backspace(two, 4); // 2 is not a multiple of 4 → one space at a time
  assert.equal(two.col, 1);
});

test('backspace still deletes a single character mid-line', () => {
  const ed = emptyEditor('const x = 1;');
  ed.row = 0;
  ed.col = 5;
  insertChar(ed, '!');
  backspace(ed, 4);
  assert.equal(editorText(ed), 'const x = 1;');
});
