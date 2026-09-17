/**
 * Search & replace tests (overhaul §8.6, task 2.5).
 * Run: node --test tests/unit/search.test.js
 *
 * Acceptance: "Incremental state tests; replace-all single-undo verified;
 * failed-check jump lands on grader range when present."
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { applyEdit, docFromText, docText, pos } from '../../src/editor/document.js';
import {
  MAX_MATCHES, compile, createSearchState, describeReplace, diagnosticRange, failedCheckTarget,
  findMatches, jumpToDiagnostic, jumpToFailedCheck, jumpToLine, matchAt, matchCount, matchOffsets,
  optionsOf, pushHistory, searchFiles, stepMatch, substitutePlan, toggleCase, toggleHighlight, toggleRegex,
  viewportMatches,
} from '../../src/editor/search.js';
import { createSession } from '../../src/editor/document.js';

const doc = (text, caret) => docFromText(text, { caret });
const search = (overrides) => createSearchState(overrides);

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

test('search: an invalid regex is reported, never thrown', () => {
  assert.deepEqual(compile(search({ pattern: '(', regex: true })), { matcher: null, error: 'invalid pattern: (' });
  assert.ok(compile(search({ pattern: '(' })).matcher, 'as a literal it is perfectly fine');
  assert.deepEqual(compile(search({ pattern: '' })), { matcher: null, error: null });
});

test('search: smart-case is on by default and can be turned off', () => {
  const d = doc('Foo foo FOO');
  assert.deepEqual(findMatches(d, search({ pattern: 'foo' })).map((m) => m.col), [0, 4, 8]);
  assert.deepEqual(findMatches(d, search({ pattern: 'foo', smartCase: false })).map((m) => m.col), [4]);
  assert.deepEqual(findMatches(d, search({ pattern: 'FOO' })).map((m) => m.col), [8]);
  assert.deepEqual(findMatches(d, toggleCase(search({ pattern: 'foo' }))).map((m) => m.col), [4]);
});

test('search: the regex toggle changes interpretation but not the pattern', () => {
  const d = doc('f.o foo');
  assert.deepEqual(findMatches(d, search({ pattern: 'f.o' })).map((m) => m.col), [0], 'literal dot');
  assert.deepEqual(findMatches(d, search({ pattern: 'f.o', regex: true })).map((m) => m.col), [0, 4]);
  const state = toggleRegex(search({ pattern: 'f.o' }));
  assert.equal(state.regex, true);
  assert.equal(state.pattern, 'f.o', 'the text the user typed is untouched');
  assert.equal(toggleRegex(state).regex, false);
});

test('search: findMatches is capped and reads in document order', () => {
  const d = doc(Array.from({ length: 40 }, () => 'x').join('\n'));
  assert.equal(findMatches(d, search({ pattern: 'x' })).length, 40);
  assert.equal(matchCount(d, search({ pattern: 'x' })), 40);
  assert.equal(findMatches(d, search({ pattern: '' })).length, 0);
  assert.ok(MAX_MATCHES >= 5000);
});

test('search: viewportMatches paints only the visible rows', () => {
  const d = doc(['a', 'a', 'a', 'a', 'a'].join('\n'));
  const state = search({ pattern: 'a' });
  assert.deepEqual(viewportMatches(d, state, { top: 1, height: 2 }).map((m) => m.row), [1, 2]);
  assert.equal(viewportMatches(d, state, { top: 0, height: Infinity }).length, 5);
  assert.deepEqual(viewportMatches(d, toggleHighlight(state), { top: 0, height: 5 }), []);
  assert.deepEqual(viewportMatches(d, state, { top: 0, height: 5, limit: 2 }).length, 2);
});

test('search: matchAt finds the occurrence under the caret', () => {
  const d = doc('foo bar');
  const state = search({ pattern: 'foo' });
  assert.equal(matchAt(d, pos(0, 1), state).col, 0);
  assert.equal(matchAt(d, pos(0, 3), state), null, 'the space is not part of the match');
});

test('search: stepMatch goes forward, wraps, and skips the caret by default', () => {
  const d = doc('ab ab ab');
  const state = search({ pattern: 'ab' });
  assert.deepEqual(stepMatch(d, pos(0, 0), state).caret, pos(0, 3));
  assert.deepEqual(stepMatch(d, pos(0, 6), state).caret, pos(0, 0), 'wraps forward');
  assert.deepEqual(stepMatch(d, pos(0, 3), state, { dir: -1 }).caret, pos(0, 0));
  assert.deepEqual(stepMatch(d, pos(0, 0), state, { dir: -1 }).caret, pos(0, 6), 'wraps backward');
  assert.deepEqual(stepMatch(d, pos(0, 0), state, { count: 2 }).caret, pos(0, 6));
  assert.equal(stepMatch(d, pos(0, 0), state).count, 3);
  assert.equal(stepMatch(d, pos(0, 0), search({ pattern: 'zz' })).found, false);
  assert.deepEqual(stepMatch(d, pos(0, 3), state, { strict: false }).caret, pos(0, 3), 'non-strict stays put');
});

test('search: the options a caller passes to a matcher are derived from state', () => {
  assert.deepEqual(optionsOf(search({ pattern: 'x', regex: false, smartCase: true })), {
    regex: false, smartCase: true, limit: MAX_MATCHES,
  });
  assert.deepEqual(optionsOf({ pattern: 'x', regex: true, smartCase: false }), {
    regex: true, smartCase: false, limit: MAX_MATCHES,
  });
});

// ---------------------------------------------------------------------------
// Jumps
// ---------------------------------------------------------------------------

test('search: jumpToLine is 1-based and clamped', () => {
  const d = doc('a\nb\nc');
  assert.deepEqual(jumpToLine(d, 2), pos(1, 0));
  assert.deepEqual(jumpToLine(d, 99), pos(2, 0));
  assert.deepEqual(jumpToLine(d, 0), pos(0, 0));
  assert.deepEqual(jumpToLine(d, 'nope'), pos(0, 0));
});

test('search: a failed check with a range jumps there; one without reports nothing', () => {
  const d = doc('one\ntwo\nthree');
  const results = [
    { label: 'a', ok: true },
    { label: 'no range', ok: false, message: 'nope' },
    { label: 'has range', ok: false, line: 3, message: 'closer' },
  ];
  assert.deepEqual(jumpToFailedCheck(d, results), pos(2, 0));
  assert.deepEqual(failedCheckTarget(results), { line: 3, label: 'has range', message: 'closer' });
  assert.equal(jumpToFailedCheck(d, [{ ok: false }]), null, 'no range means no jump, not 1:1');
  assert.equal(jumpToFailedCheck(d, []), null);
  assert.equal(failedCheckTarget([{ ok: true, line: 4 }]), null, 'passing checks are not targets');
});

test('search: diagnostics accept both a line/col and a flat offset', () => {
  const d = doc('abc\ndef');
  assert.deepEqual(diagnosticRange(d, { line: 2, col: 1, length: 2 }), { start: pos(1, 1), end: pos(1, 3) });
  assert.deepEqual(diagnosticRange(d, { offset: 5, length: 1 }), { start: pos(1, 1), end: pos(1, 2) });
  assert.deepEqual(jumpToDiagnostic(d, { line: 2 }), pos(1, 0));
  assert.equal(diagnosticRange(d, null), null);
  assert.deepEqual(diagnosticRange(d, { line: 99 }), { start: pos(1, 0), end: pos(1, 0) }, 'clamped');
});

test('search: matchOffsets are absolute text offsets', () => {
  const d = doc('ab\ncd');
  const matches = findMatches(d, search({ pattern: 'b' })).concat(findMatches(d, search({ pattern: 'd' })));
  assert.deepEqual(matchOffsets(d, matches).map((m) => m.offset), [1, 4]);
});

// ---------------------------------------------------------------------------
// Replace
// ---------------------------------------------------------------------------

test('search: substitutePlan replaces once per row, or every time with all', () => {
  const d = doc('foo foo\nfoo');
  const once = substitutePlan(d, { pattern: 'foo', replacement: 'x' }, [0, 1]);
  assert.equal(once.length, 2);
  assert.deepEqual(once.map((p) => [p.row, p.col]), [[0, 0], [1, 0]]);
  const all = substitutePlan(d, { pattern: 'foo', replacement: 'x', all: true }, [0, 1]);
  assert.equal(all.length, 3);
  assert.equal(docText(applyEdit(d, all.map((p) => p.change)).doc), 'x x\nx', 'one transaction');
});

test('search: substitutePlan respects the row list (the :%s / :s difference)', () => {
  const d = doc('foo\nfoo\nfoo');
  const plan = substitutePlan(d, { pattern: 'foo', replacement: 'bar' }, [1]);
  assert.deepEqual(plan.map((p) => p.row), [1]);
  assert.equal(docText(applyEdit(d, plan.map((p) => p.change)).doc), 'foo\nbar\nfoo');
});

test('search: a literal pattern does not interpret regex metacharacters', () => {
  const d = doc('a.b axb');
  const literal = substitutePlan(d, { pattern: 'a.b', replacement: 'X', all: true, regex: false }, [0, 1]);
  assert.equal(literal.length, 1);
  const asRegex = substitutePlan(d, { pattern: 'a.b', replacement: 'X', all: true, regex: true }, [0, 1]);
  assert.equal(asRegex.length, 2);
});

test('search: an invalid pattern yields an empty plan instead of throwing', () => {
  const d = doc('abc');
  assert.deepEqual(substitutePlan(d, { pattern: '(', replacement: 'x', regex: true }, [0]), []);
});

test('search: what is highlighted and what replace acts on come from one matcher', () => {
  const d = doc('x x x');
  const state = search({ pattern: 'x' });
  const highlighted = viewportMatches(d, state, { top: 0, height: 1 });
  const plan = substitutePlan(d, { pattern: state.pattern, replacement: 'y', all: true }, [0]);
  assert.deepEqual(plan.map((p) => p.col), highlighted.map((m) => m.col));
});

test('search: describeReplace speaks in occurrences', () => {
  assert.equal(describeReplace(0), 'no matches');
  assert.equal(describeReplace(1), 'replaced 1 occurrence');
  assert.equal(describeReplace(4), 'replaced 4 occurrences');
});

// ---------------------------------------------------------------------------
// History and cross-tab search
// ---------------------------------------------------------------------------

test('search: history is most-recent-first, deduped and capped', () => {
  let state = search();
  for (const p of ['a', 'b', 'a', 'c']) state = pushHistory(state, p, { limit: 3 });
  assert.deepEqual(state.history, ['c', 'a', 'b']);
  assert.deepEqual(pushHistory(state, '').history, ['c', 'a', 'b'], 'empty patterns are not recorded');
});

test('search: searchFiles walks every tab, active file first, skipping empty ones', () => {
  const session = createSession({
    'a.js': 'foo',
    'b.js': 'bar',
    'c.js': 'foo foo',
  }, { order: ['a.js', 'b.js', 'c.js'], active: 'a.js' });
  const hits = searchFiles(session, search({ pattern: 'foo' }), { active: 'c.js' });
  assert.deepEqual(hits.map((h) => h.file), ['c.js', 'a.js']);
  assert.equal(hits[0].matches.length, 2);
  assert.deepEqual(searchFiles(session, search({ pattern: 'zzz' })), []);
});
