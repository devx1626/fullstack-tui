/**
 * Diff tests (overhaul task 2.9): line-level LCS vs the classic positional diff.
 * Run: node --test tests/unit/diff.test.js
 *
 * The acceptance anchor: an INSERTED line must not make every following line
 * report a change (that is the classic diffCode behavior this replaces).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { changedCols, diffLines, diffRows, lcsMatches, similarity } from '../../src/editor/diff.js';

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

// ---- word-level marks on modify rows (jsdiff `diffWordsWithSpace`) --------

test('changedCols: masks cover exactly the changed words, whitespace boundaries included', () => {
  const marks = changedCols('the quick brown fox', 'the slow brown fox');
  assert.ok(marks, 'masks missing');
  // Words start at column 4 on both sides; lengths differ (5 vs 4), so the
  // marked RANGES differ too — each side marks exactly its own word.
  assert.deepEqual(marks.del.slice(4, 9), [true, true, true, true, true], 'quick marked on the current side');
  assert.deepEqual(marks.add.slice(4, 8), [true, true, true, true], 'slow marked on the reference side');
  assert.equal(marks.del.filter(Boolean).length, 5, 'no stray current-side marks');
  assert.equal(marks.add.filter(Boolean).length, 4, 'no stray reference-side marks');
  assert.equal(marks.del[0] || marks.del[10], false, 'shared words stay unmarked');
});

test('changedCols: spacing-level changes mark too, and degenerate shapes return null', () => {
  // An inserted word marks the inserted word plus its separator — that is the
  // whitespace-glued tokenizer's honest answer, not a bug.
  const ins = changedCols('a b', 'a new b');
  assert.ok(ins, 'insertion masks missing');
  assert.equal(ins.del.some(Boolean), false, 'unchanged side has no marks');
  assert.ok(ins.add.some(Boolean), 'changed side has marks');

  assert.equal(changedCols('same', 'same'), null, 'identical pair');
  assert.equal(changedCols(null, undefined), null, 'nullish pair');
  assert.equal(changedCols('', 'x'), null, 'empty-vs-x: no useful spotlight');
  assert.equal(changedCols('x'.repeat(80), 'y'.repeat(80)), null, 'over the word-diff cap');
});

test('diffRows: modify segments carry changed flags exactly on the diff words', () => {
  const rows = diffRows('const a = 1;', 'const a = 2;');
  const cur = rows[0];
  const ref = rows[1];
  const markedCur = cur.segs.filter((s) => s.changed);
  const markedRef = ref.segs.filter((s) => s.changed);
  assert.equal(markedCur.map((s) => s.text).join(''), '1', 'current side marks 1');
  assert.equal(markedRef.map((s) => s.text).join(''), '2', 'reference side marks 2');
  // Unmarked text must be intact — the overlay only splits, never drops.
  assert.equal(cur.segs.map((s) => s.text).join(''), 'const a = 1;');
  assert.equal(ref.segs.map((s) => s.text).join(''), 'const a = 2;');
});

test('diffRows: equal/add/del rows never carry marks', () => {
  const rows = diffRows('const a = 1;\nextra();', 'const a = 1;');
  for (const r of rows.filter((x) => x.kind !== 'mod-cur' && x.kind !== 'mod-ref')) {
    assert.equal(r.segs.some((s) => s.changed), false, `unexpected mark on a ${r.kind} row`);
  }
});

test('diffRows: whole-line rewrite degrades to no marks instead of highlighting everything', () => {
  // Char-similar (~0.96, so diffLines pairs them as a modify row) but every
  // word differs — word-level marks here would spotlight the entire line.
  const a = Array.from({ length: 40 }, (_, i) => `w${i}a`).join(' ');
  const b = Array.from({ length: 40 }, (_, i) => `w${i}b`).join(' ');
  assert.ok(similarity(a, b) >= 0.5, 'sample must pair as a modify row');
  const rows = diffRows(a, b);
  const mod = rows.filter((r) => r.kind === 'mod-cur' || r.kind === 'mod-ref');
  assert.ok(mod.length > 0, 'expected a modify pair');
  for (const r of mod) assert.equal(r.segs.some((s) => s.changed), false, 'churn must not spotlight the whole line');
});
