/**
 * Diff tests (overhaul task 2.9): line-level LCS vs the classic positional diff.
 * Run: node --test tests/unit/diff.test.js
 *
 * The acceptance anchor: an INSERTED line must not make every following line
 * report a change (that is the classic diffCode behavior this replaces).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { diffLines, diffRows, lcsMatches, similarity } from '../../src/editor/diff.js';

test('an inserted line does not desync the rest of the diff', () => {
  const current = ['function f() {', '  const x = 1;', '  return x;', '}'].join('\n');
  const reference = ['function f() {', '  return x;', '}'].join('\n');
  const rows = diffLines(current, reference);
  const ops = rows.map((r) => r.op);
  // The learner's extra line is a single '- ' row (only in current); the
  // surrounding lines stay equal — the classic positional diff reported all
  // four lines as changed here.
  assert.deepEqual(ops, ['equal', 'delete', 'equal', 'equal']);
  assert.equal(rows[1].text, '  const x = 1;');
});

test('a deleted line is reported once, not as N mismatches', () => {
  const current = 'a\nb\nc';
  const reference = 'a\nb';
  const rows = diffLines(current, reference);
  assert.deepEqual(rows.map((r) => r.op), ['equal', 'equal', 'delete']);
  assert.equal(rows[2].text, 'c');
});

test('identical texts produce all-equal rows', () => {
  const rows = diffLines('x\ny\nz', 'x\ny\nz');
  assert.deepEqual(rows.map((r) => r.op), ['equal', 'equal', 'equal']);
});

test('a reordered block aligns, not every-line-mismatch', () => {
  const current = ['a', 'b', 'c', 'd'].join('\n');
  const reference = ['b', 'a', 'c', 'd'].join('\n');
  const rows = diffLines(current, reference);
  const changed = rows.filter((r) => r.op !== 'equal');
  assert.equal(changed.length, 2, `expected exactly two changed rows, got ${JSON.stringify(rows)}`);
});

test('similar replaced lines pair into a modify row', () => {
  const current = 'const count = 1;';
  const reference = 'const count = 2;';
  const rows = diffLines(current, reference);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].op, 'modify');
  assert.equal(rows[0].current, current);
  assert.equal(rows[0].reference, reference);
});

test('dissimilar replaced lines stay separate delete + insert', () => {
  const rows = diffLines('alpha', 'const x = 12345;');
  const ops = rows.map((r) => r.op).sort();
  assert.deepEqual(ops, ['delete', 'insert']);
});

test('modifyThreshold above 1 disables pairing entirely', () => {
  // Similarity is capped at 1, so any threshold > 1 means "never pair".
  const rows = diffLines('const count = 1;', 'const count = 2;', { modifyThreshold: Infinity });
  assert.deepEqual(rows.map((r) => r.op).sort(), ['delete', 'insert']);
});

test('empty inputs are handled', () => {
  // Strings split on \n, so '' is ONE empty line — it diffs as such.
  assert.deepEqual(diffLines('', 'a'), [
    { op: 'delete', a: 0, text: '' },
    { op: 'insert', b: 0, text: 'a' },
  ]);
  assert.deepEqual(diffLines('a', ''), [
    { op: 'delete', a: 0, text: 'a' },
    { op: 'insert', b: 0, text: '' },
  ]);
  assert.deepEqual(diffLines('', ''), [{ op: 'equal', a: 0, b: 0, text: '' }]);
});

test('lcsMatches returns ascending aligned pairs', () => {
  const m = lcsMatches(['a', 'x', 'b'], ['a', 'b']);
  assert.deepEqual(m, [{ a: 0, b: 0 }, { a: 2, b: 1 }]);
});

test('lcsMatches bails to positional compare above the cell cap', () => {
  const a = Array.from({ length: 1200 }, (_, i) => `line ${i}`);
  const b = Array.from({ length: 1200 }, (_, i) => `line ${i}!`);
  // 1200*1200 > 1e6 → positional path; no throw, no matches (all differ).
  assert.deepEqual(lcsMatches(a, b), []);
});

test('similarity: identical=1, disjoint=0, partial in between', () => {
  assert.equal(similarity('abc', 'abc'), 1);
  assert.equal(similarity('abc', 'xyz'), 0);
  assert.ok(similarity('const a = 1;', 'const a = 2;') > 0.8);
  assert.equal(similarity('', ''), 1);
  assert.equal(similarity('', 'x'), 0);
});

test('diffRows: markers and highlight segments are attached', () => {
  // extra(); is only in the LEARNER's code → a 'del' row with the '-' marker.
  const rows = diffRows('const a = 1;\nextra();', 'const a = 1;', { lang: 'js', theme: { keyword: 'k' } });
  const del = rows.find((r) => r.kind === 'del');
  assert.ok(del, 'del row missing');
  assert.equal(del.marker, '- ');
  assert.ok(del.segs.length > 0, 'segments missing');
  const equal = rows.find((r) => r.kind === 'equal');
  assert.equal(equal.marker, '  ');
});

test('diffRows: a modify pair renders as two rows with classic markers', () => {
  const rows = diffRows('const a = 1;', 'const a = 2;');
  assert.deepEqual(rows.map((r) => r.kind), ['mod-cur', 'mod-ref']);
  assert.equal(rows[0].marker, '! ');
  assert.equal(rows[1].marker, '? ');
});
