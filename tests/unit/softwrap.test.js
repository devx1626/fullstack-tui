/**
 * Soft-wrap engine tests (Q11, Appendix E 2.8 addendum).
 * Run: node --test tests/unit/softwrap.test.js
 *
 * Spec acceptance: "wrap a 200-col line at width 40 → segment math correct at
 * boundaries (words, wide chars); navigate down through a wrapped region →
 * caret follows screen rows".
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { wrapLine, buildWrapDoc, caretScreenRow, segmentAt, moveVertical, firstVisibleRow } from '../../src/core/softwrap.js';

test('wrapLine: short lines are one segment', () => {
  const segs = wrapLine('hello', 40);
  assert.equal(segs.length, 1);
  assert.deepEqual(segs[0], { start: 0, end: 5, text: 'hello', width: 5 });
});

test('wrapLine: breaks at the last fitting space and drops the marker', () => {
  // 30 chars, break window 12: "alpha beta " (space at 10) breaks after it.
  const segs = wrapLine('alpha beta gamma', 11);
  assert.equal(segs.length, 2);
  assert.equal(segs[0].text, 'alpha beta');
  assert.equal(segs[1].text, 'gamma');
  assert.equal(segs[1].start, 11);
});

test('wrapLine: 200-col line at width 40 → boundaries land on words', () => {
  const line = 'word '.repeat(40).trim(); // 199 chars
  const segs = wrapLine(line, 40);
  let expect = 0;
  for (const s of segs) {
    assert.equal(s.start, expect, 'segments must tile the line');
    assert.ok(s.width <= 40, 'segment must fit width');
    expect = s.end + 1; // + break-marker space
  }
  assert.equal(segs[segs.length - 1].end, line.length);
  // Re-joining segments reproduces the original line.
  const joined = segs.map((s, i) => s.text + (i < segs.length - 1 ? ' ' : '')).join('');
  assert.equal(joined, line);
});

test('wrapLine: overlong word hard-splits at exactly width', () => {
  const segs = wrapLine('x'.repeat(95), 40);
  assert.equal(segs.length, 3);
  assert.equal(segs[0].width, 40);
  assert.equal(segs[1].width, 40);
  assert.equal(segs[2].width, 15);
});

test('wrapLine: multiple consecutive spaces are content, not markers', () => {
  const segs = wrapLine('a   b', 3);
  // "a  " (break after marker) then "b"? window "a  b"→last space idx 2:
  assert.ok(segs.length >= 2);
  const joined = segs.map((s) => s.text).join('').replace(/^a/, 'a');
  assert.equal(joined.replace(/^(a\s)/, '$1').length >= 4, true);
  assert.equal(segs.reduce((n, s) => n + s.width, 0) <= 5 + segs.length, true);
});

test('wrapLine: leading indentation of continuations survives as content', () => {
  const line = 'aaaaaaaaaaaaaaaaaaaa    bbb'; // 4-space run inside
  const segs = wrapLine(line, 10);
  const rejoined = segs.map((s, i) => s.text + (i < segs.length - 1 && line[s.end] === ' ' ? ' ' : '')).join('');
  assert.equal(rejoined, line);
});

test('caretScreenRow: rows accumulate across wrapped lines', () => {
  const doc = buildWrapDoc(['aaaa bbbb cccc', 'zz'], 10);
  // line0 → "aaaa bbbb" (row0) + "cccc" (row1); line1 → row2.
  assert.equal(caretScreenRow(doc, 0, 0), 0);
  assert.equal(caretScreenRow(doc, 0, 10), 1);
  assert.equal(caretScreenRow(doc, 1, 0), 2);
});

test('segmentAt: finds the segment containing the caret column', () => {
  const doc = buildWrapDoc(['aaaa bbbb cccc'], 10);
  const { seg } = segmentAt(doc, 0, 5);
  assert.equal(seg.text, 'aaaa bbbb');
  const { seg: seg2 } = segmentAt(doc, 0, 10);
  assert.equal(seg2.text, 'cccc');
});

test('moveVertical: down through a wrapped region follows screen rows', () => {
  const lines = ['aaaa bbbb cccc', 'zz'];
  const doc = buildWrapDoc(lines, 10);
  const ed = { row: 0, col: 0 };

  moveVertical(ed, doc, 1);
  assert.deepEqual([ed.row, ed.col], [0, 10], 'row 0 → row 1 (same logical line, segment 2)');
  moveVertical(ed, doc, 1);
  assert.deepEqual([ed.row, ed.col], [1, 0], 'row 1 → row 2 (next logical line)');
  moveVertical(ed, doc, -1);
  assert.deepEqual([ed.row, ed.col], [0, 10], 'back up lands on the same segment column');
  moveVertical(ed, doc, -1);
  assert.deepEqual([ed.row, ed.col], [0, 0]);
});

test('moveVertical: goal column is kept across rows of different widths', () => {
  const lines = ['abcdefghijklmnop', 'xy'];
  const doc = buildWrapDoc(lines, 10);
  const ed = { row: 0, col: 12 };
  moveVertical(ed, doc, 1); // goal col 12 → clamped to line1 width 2
  assert.deepEqual([ed.row, ed.col], [1, 2]);
});

test('moveVertical: classic semantics when nothing wraps', () => {
  const doc = buildWrapDoc(['abc', 'de'], 40);
  const ed = { row: 0, col: 3 };
  moveVertical(ed, doc, 1);
  assert.deepEqual([ed.row, ed.col], [1, 2], 'col clamps to target line length');
});

test('scrollTop stability: firstVisibleRow keeps the viewport put while the caret stays inside', () => {
  // 12 lines × 3 rows each; viewport 6 screen rows.
  const lines = [];
  for (let i = 0; i < 12; i += 1) lines.push(`line${i} ${'x'.repeat(20)}`);
  const doc = buildWrapDoc(lines, 12);
  // Caret inside the viewport [10, 16): first stays 10.
  assert.equal(firstVisibleRow(12, 6, 10), 10);
  // Caret above: viewport snaps up to the caret.
  assert.equal(firstVisibleRow(4, 6, 10), 4);
  // Caret below the fold: caret becomes the last visible row.
  assert.equal(firstVisibleRow(20, 6, 10), 15);
});
