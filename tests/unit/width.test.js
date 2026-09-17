/**
 * Visual width tests (overhaul §8.1, task 2.1).
 * Run: node --test tests/unit/width.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  charWidth, codepointWidth, stringWidth, visualColumn, indexAtVisualColumn,
  expandTabs, sliceByVisualColumn,
} from '../../src/editor/width.js';

test('ascii and latin text is one cell per character', () => {
  assert.equal(stringWidth('abc'), 3);
  assert.equal(stringWidth(''), 0);
  assert.equal(charWidth('a'), 1);
  assert.equal(charWidth(' '), 1);
});

test('CJK and fullwidth forms are two cells', () => {
  assert.equal(stringWidth('日本語'), 6, 'three CJK ideographs');
  assert.equal(stringWidth('한글'), 4, 'Hangul syllables');
  assert.equal(stringWidth('ｆｕｌｌ'), 8, 'fullwidth latin');
  assert.equal(charWidth('日'), 2);
  assert.equal(codepointWidth(0x30a2), 2, 'katakana');
});

test('emoji are two cells, including beyond the BMP', () => {
  assert.equal(stringWidth('🚀'), 2, 'a surrogate pair counts once');
  assert.equal(stringWidth('🚀🚀'), 4);
  assert.equal(charWidth('🚀'), 2);
  // A variation selector upgrades a narrow codepoint to emoji presentation.
  assert.equal(stringWidth('\u2764'), 1, 'bare heart is narrow');
  assert.equal(stringWidth('\u2764\ufe0f'), 2, 'heart + VS16 presents as emoji');
  assert.equal(charWidth('\ufe0f'), 0, 'the selector itself paints nothing');
});

test('combining marks and zero-width joiners add nothing', () => {
  assert.equal(stringWidth('e\u0301'), 1, 'e + combining acute');
  assert.equal(stringWidth('a\u200bb'), 2, 'zero-width space');
  assert.equal(stringWidth('ab\u200d'), 2, 'trailing ZWJ');
  // 🏳(2) + VS16(0) + ZWJ(0) + 🌈(2) = 4 — one codepoint sum, over-counted on
  // purpose (see the limitation test below).
  assert.equal(stringWidth('🏳\ufe0f\u200d🌈'), 4);
});

test('documented limitation: a ZWJ sequence over-counts (box-width approximation)', () => {
  // 2 (woman) + 0 (ZWJ) + 2 (rocket) = 4, where a terminal paints the combined
  // glyph in 2 cells. Clustering needs a grapheme table; the helper is honest
  // about summing codepoints, and the editor stays consistent with itself.
  assert.equal(stringWidth('👩\u200d🚀'), 4);
});

test('control characters occupy no cell', () => {
  assert.equal(charWidth('\u0000'), 0);
  assert.equal(charWidth('\u0007'), 0, 'BEL');
  assert.equal(charWidth('\u001b'), 0, 'ESC');
});

test('visualColumn expands tabs to the next tab stop', () => {
  assert.equal(visualColumn('\tx', 1, 2), 2, 'a leading tab is a full stop');
  assert.equal(visualColumn('\tx', 0, 2), 0, 'the tab itself starts at column 0');
  assert.equal(visualColumn('ab\tx', 3, 2), 4, 'tab to the next multiple of 2');
  assert.equal(visualColumn('abc\tx', 4, 4), 4, 'the tab lands x exactly on the stop');
  assert.equal(visualColumn('abc\tx', 5, 4), 5, 'x is one cell past the stop, then the line ends');
  assert.equal(visualColumn('日本語', 3, 2), 6, 'wide characters count double');
  assert.equal(visualColumn('abc', 9, 2), 3, 'an out-of-range index clamps to the end');
});

test('indexAtVisualColumn is the click-to-caret inverse', () => {
  const line = 'ab\tcd';
  assert.equal(indexAtVisualColumn(line, 0, 2), 0);
  // Visual columns: a=0 b=1, the tab covers 2..3, c=4, d=5.
  assert.equal(indexAtVisualColumn(line, 2, 2), 2, 'start of the tab');
  assert.equal(indexAtVisualColumn(line, 3, 2), 2, 'a click inside the tab snaps to its start');
  assert.equal(indexAtVisualColumn(line, 4, 2), 3, 'the first cell after a tab is the next character');
  assert.equal(indexAtVisualColumn(line, 99, 2), line.length, 'past the end clamps');
  // A click inside a double-width cell snaps to the cell's start.
  assert.equal(indexAtVisualColumn('日本語', 3, 2), 1);
});

test('expandTabs is display-only and loses nothing but tabs', () => {
  assert.equal(expandTabs('a\tb', 2), 'a b');
  assert.equal(expandTabs('ab\tc', 2), 'ab  c');
  assert.equal(expandTabs('日本\tx', 4), '日本    x', 'the tab fills to the next multiple of 4');
  assert.equal(expandTabs('no tabs', 2), 'no tabs');
});

test('sliceByVisualColumn renders a horizontal window of a long line', () => {
  const line = 'abcdefghij';
  assert.equal(sliceByVisualColumn(line, 3, 4, 2), 'defg');
  assert.equal(sliceByVisualColumn(line, 0, 4, 2), 'abcd');
  assert.equal(sliceByVisualColumn(line, 8, 10, 2), 'ij', 'a window past the end stops at the text');
  const tabbed = 'a\tbcdef';
  // Tab expands to cells 1..2, so columns 2..4 are "bcd".
  assert.equal(sliceByVisualColumn(tabbed, 2, 3, 2), 'bcd');
});
