/**
 * Selection, registers and clipboard tests (overhaul §8.3, task 2.3).
 * Run: node --test tests/unit/selection.test.js
 *
 * Acceptance: "visual/visual-line/visual-block state tests; OSC52 bytes
 * verified against spec examples; paste replaces selection".
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSelection, selRange, selIsEmpty, selExtend, selFlip, selCollapse, selEqual,
  selContains, selMin, selMax, selMerge, lineStart, lineEnd, firstNonBlank, selRows,
  selectWord, selectLineRange, selectRow, linewise, selectAll, blockRect, blockLines,
  blockPositions, blockText, selText, deleteChanges, replaceChanges, indentChanges,
  outdentChanges, caseChanges, commentChanges, collapsePositions,
} from '../../src/editor/selection.js';
import { docFromText, docText, applyEdit, pos } from '../../src/editor/document.js';
import {
  createRegisters, yank, put, readRegister, registerNames, registerList, cloneRegisters,
  normaliseRegisterName, registerLineCount, LINEWISE, CHARWISE,
} from '../../src/editor/registers.js';
import {
  toBase64, rawSequence, wrapSequence, copySequence, clipboardPolicy, clipboardStatus, MAX_PAYLOAD,
} from '../../src/editor/osc52.js';

const doc = (text) => docFromText(text);

// ---------------------------------------------------------------------------
// Ranges and construction
// ---------------------------------------------------------------------------

test('a selection remembers which end is moving', () => {
  const sel = createSelection(pos(2, 3), pos(0, 1));
  assert.deepEqual(selRange(sel), { start: pos(0, 1), end: pos(2, 3) }, 'the range sorts');
  assert.deepEqual(sel.anchor, pos(2, 3), 'the anchor is untouched');
  assert.deepEqual(selMin(sel), pos(0, 1));
  assert.deepEqual(selMax(sel), pos(2, 3));
  assert.equal(createSelection(pos(1, 1), pos(1, 1)), null, 'an empty selection is null');
  assert.equal(selIsEmpty(null), true);
  assert.ok(selContains(sel, pos(1, 0)));
  assert.ok(!selContains(sel, pos(3, 0)));
});

test('extend, flip, collapse and merge', () => {
  const sel = createSelection(pos(1, 0), pos(1, 4));
  assert.deepEqual(selExtend(sel, pos(3, 2)).anchor, pos(1, 0), 'extending keeps the anchor');
  assert.deepEqual(selFlip(sel), { anchor: pos(1, 4), head: pos(1, 0) });
  assert.deepEqual(selCollapse(sel), pos(1, 4), 'collapse to the head');
  assert.deepEqual(selCollapse(sel, 'anchor'), pos(1, 0));
  assert.equal(selCollapse(null), null);
  assert.ok(selEqual(sel, { anchor: pos(1, 0), head: pos(1, 4) }));
  assert.ok(!selEqual(sel, null));
  assert.ok(selEqual(null, null));
  const merged = selMerge(createSelection(pos(0, 0), pos(0, 4)), createSelection(pos(0, 3), pos(0, 9)));
  assert.deepEqual(selRange(merged), { start: pos(0, 0), end: pos(0, 9) }, 'overlapping cursors collapse');
});

test('line helpers: starts, ends and the first non-blank', () => {
  const d = doc('  indented\nplain');
  assert.deepEqual(lineStart(d, 1), pos(1, 0));
  assert.deepEqual(lineEnd(d, 1), pos(1, 5));
  assert.deepEqual(firstNonBlank(d, 0), pos(0, 2), '^ lands after the indent');
  assert.deepEqual(firstNonBlank(d, 1), pos(1, 0));
});

// ---------------------------------------------------------------------------
// Word / line / block selections
// ---------------------------------------------------------------------------

test('selectWord picks the word, the punctuation run, or nothing on blank space', () => {
  const d = doc('const value = foo.bar(1);');
  assert.deepEqual(selectRangeText(d, selectWord(d, pos(0, 8))), 'value', 'inside a word');
  assert.deepEqual(selectRangeText(d, selectWord(d, pos(0, 0))), 'const');
  assert.deepEqual(selectRangeText(d, selectWord(d, pos(0, 15))), 'foo', 'a dot splits words');
  assert.deepEqual(selectRangeText(d, selectWord(d, pos(0, 19))), 'bar');
  assert.equal(selectWord(d, pos(0, 5)), null, 'whitespace selects nothing');
  assert.deepEqual(selectRangeText(d, selectWord(d, pos(0, 10))), 'value', 'the last letter still selects the word');
  assert.deepEqual(selectRangeText(d, selectWord(d, pos(0, 17))), '.', 'punctuation selects its own run');
  assert.deepEqual(selectRangeText(d, selectWord(d, pos(0, 21))), '(', 'a lone bracket is a run of one');
});

function selectRangeText(d, sel) {
  const r = selRange(sel);
  return r ? d.lines[r.start.row].slice(r.start.col, r.end.col) : null;
}

test('linewise selections include the trailing newline (so V d removes the line)', () => {
  const d = doc('one\ntwo\nthree');
  assert.deepEqual(selRange(selectRow(d, 1)), { start: pos(1, 0), end: pos(2, 0) }, 'row 1 keeps its \\n');
  assert.deepEqual(selRange(selectRow(d, 2)), { start: pos(2, 0), end: pos(2, 5) }, 'the last line has none');
  assert.deepEqual(selRange(selectLineRange(d, 0, 2)), { start: pos(0, 0), end: pos(2, 5) });
  assert.deepEqual(selRange(linewise(d, createSelection(pos(1, 2), pos(2, 1)))),
    { start: pos(1, 0), end: pos(2, 5) }, 'linewise expands to full lines');

  const { doc: cut } = applyEdit(d, deleteChanges(selectRow(d, 1)));
  assert.equal(docText(cut), 'one\nthree', 'the whole line went, not just its text');
});

test('selectAll covers the document', () => {
  const d = doc('a\nbc');
  assert.deepEqual(selRange(selectAll(d)), { start: pos(0, 0), end: pos(1, 2) });
  assert.equal(selText(d, selectAll(d)), 'a\nbc');
});

test('visual block: rectangle maths, clamping and per-row cursors', () => {
  const d = doc('abcd\nab\nabcdef');
  const sel = createSelection(pos(0, 1), pos(2, 3));
  assert.deepEqual(blockRect(sel), { top: 0, bottom: 2, left: 1, right: 3 });
  assert.deepEqual(blockLines(d, sel), [
    { row: 0, start: 1, end: 3, empty: false },
    { row: 1, start: 1, end: 2, empty: false }, // short line: clamped to its length
    { row: 2, start: 1, end: 3, empty: false },
  ]);
  assert.equal(blockText(d, sel), 'bc\nb\nbc');
  assert.deepEqual(blockPositions(d, sel), [pos(0, 1), pos(1, 1), pos(2, 1)], 'one cursor per row');
  assert.deepEqual(blockPositions(d, sel, 'right'), [pos(0, 3), pos(1, 2), pos(2, 3)], 'block edge cursors clamp too');

  // A row shorter than the block start contributes an empty slice, and its
  // cursor still exists (typing into a block must not skip lines).
  const short = doc('abcdef\nab');
  const sel2 = createSelection(pos(0, 4), pos(1, 5));
  assert.deepEqual(blockLines(short, sel2)[1], { row: 1, start: 2, end: 2, empty: true });
  assert.deepEqual(blockPositions(short, sel2), [pos(0, 4), pos(1, 2)]);
});

test('selRows lists the rows a selection spans', () => {
  const d = doc('a\nb\nc');
  assert.deepEqual(selRows(d, createSelection(pos(0, 0), pos(2, 1))), [0, 1, 2]);
  assert.deepEqual(selRows(d, null), [0]);
});

// ---------------------------------------------------------------------------
// Operations as change lists
// ---------------------------------------------------------------------------

test('indent/outdent produce one change per non-blank line (one batch, one undo)', () => {
  const d = doc('if (x) {\n  a();\n\n}');
  const indented = applyEdit(d, indentChanges(d, { start: pos(0, 0), end: pos(3, 0) }, 2)).doc;
  assert.equal(docText(indented), '  if (x) {\n    a();\n\n  }', 'blank lines keep their emptiness');

  const outdented = applyEdit(d, outdentChanges(d, { start: pos(0, 0), end: pos(3, 0) }, 2)).doc;
  assert.equal(docText(outdented), 'if (x) {\na();\n\n}', 'two spaces of indent come off');

  const tabs = doc('\tcode\n    deep');
  assert.equal(docText(applyEdit(tabs, outdentChanges(tabs, { start: pos(0, 0), end: pos(1, 0) }, 4)).doc),
    'code\ndeep', 'a tab is one level; four spaces are one level at tabSize 4');
});

test('case transforms and comment toggle act on the selection only', () => {
  const d = doc('let Name = 1;\nlet other = 2;');
  const sel = createSelection(pos(0, 4), pos(0, 8));
  assert.equal(docText(applyEdit(d, caseChanges(d, sel, 'lower')).doc), 'let name = 1;\nlet other = 2;');
  assert.equal(selText(d, sel), 'Name');
  const toggled = applyEdit(d, caseChanges(d, sel, 'toggle')).doc;
  assert.equal(docText(toggled), 'let nAME = 1;\nlet other = 2;');

  const both = { start: pos(0, 0), end: pos(1, 0) };
  assert.equal(docText(applyEdit(d, commentChanges(d, both, '//')).doc), '// let Name = 1;\n// let other = 2;');
  const commented = doc('// a\n// b');
  const uncommented = applyEdit(commented, commentChanges(commented, { start: pos(0, 0), end: pos(1, 0) }, '//')).doc;
  assert.equal(docText(uncommented), 'a\nb', 'the toggle uncomments when every line is commented');
});

test('paste replaces the selection (delete + insert in one transaction)', () => {
  const d = doc('let x = 1;');
  const sel = createSelection(pos(0, 8), pos(0, 9)); // the "1"
  const { doc: pasted } = applyEdit(d, replaceChanges(sel, '42'));
  assert.equal(docText(pasted), 'let x = 42;');
});

test('collapsePositions dedupes cursors that landed on the same spot', () => {
  assert.deepEqual(
    collapsePositions([pos(0, 2), pos(0, 0), pos(0, 2), pos(1, 1)]),
    [pos(0, 0), pos(0, 2), pos(1, 1)],
  );
  assert.deepEqual(collapsePositions(), []);
});

// ---------------------------------------------------------------------------
// Registers
// ---------------------------------------------------------------------------

test('the unnamed register takes yanks and deletes; 0 keeps the last yank', () => {
  let regs = createRegisters();
  regs = yank(regs, 'copied', { write: 'yank' });
  assert.equal(put(regs).text, 'copied');
  assert.equal(readRegister(regs, '0').text, 'copied');
  regs = yank(regs, 'deleted', { write: 'delete' });
  assert.equal(put(regs).text, 'deleted', 'a delete updates the unnamed register');
  assert.equal(readRegister(regs, '0').text, 'copied', 'but never register 0');
});

test('named registers store, append and never touch unnamed on append', () => {
  let regs = createRegisters();
  regs = yank(regs, 'first', { name: 'a' });
  regs = yank(regs, 'second', { name: 'b' });
  assert.equal(readRegister(regs, 'a').text, 'first');
  assert.deepEqual(registerNames(regs), ['a', 'b']);
  assert.equal(put(regs).text, 'second', 'the unnamed register follows the last yank');

  regs = yank(regs, ' MORE', { name: 'A', append: true });
  assert.equal(readRegister(regs, 'a').text, 'first MORE', '"A appends');
  assert.equal(put(regs).text, 'second', '"A does not clobber the unnamed register');

  regs = yank(regs, 'x', { name: 'Z' });
  assert.equal(readRegister(regs, 'z').text, 'x', 'letters are case-folded to the named set');
});

test('the black hole and the system register behave honestly', () => {
  let regs = createRegisters();
  regs = yank(regs, 'gone', { name: '_', write: 'delete' });
  assert.equal(put(regs).text, '', '"_, the black hole, discards');
  assert.equal(readRegister(regs, '_').text, '', 'and always reads empty');

  regs = yank(regs, 'sys', { name: '+', write: 'yank' });
  assert.equal(readRegister(regs, '+').text, 'sys', 'the system register keeps a session-local copy');
  assert.equal(put(regs).text, 'sys', 'a system yank also sets unnamed, so p works');
});

test('yanking nothing never clears a register, and unknown names are a no-op', () => {
  let regs = yank(createRegisters(), 'kept');
  regs = yank(regs, '');
  assert.equal(put(regs).text, 'kept');
  const before = JSON.stringify(regs);
  regs = yank(regs, 'x', { name: '!' });
  assert.equal(JSON.stringify(regs), before, 'an unknown register name changes nothing');
});

test('registers are values: yank does not mutate the input, so undo cannot corrupt them', () => {
  const regs = yank(createRegisters(), 'a');
  const copy = cloneRegisters(regs);
  const next = yank(regs, 'b', { name: 'q' });
  assert.equal(put(regs).text, 'a', 'the original is untouched');
  assert.equal(JSON.stringify(copy), JSON.stringify(regs));
  assert.equal(readRegister(next, 'q').text, 'b');
});

test('linewise registers remember their kind, and the list previews them', () => {
  let regs = createRegisters();
  regs = yank(regs, 'one\ntwo\n', { kind: LINEWISE, write: 'yank' });
  assert.equal(put(regs).kind, LINEWISE);
  assert.equal(registerLineCount(put(regs)), 2);
  assert.equal(registerList(regs)[0].preview, 'one⏎two⏎', 'newlines are shown as ⏎');

  regs = yank(regs, 'inline', { name: 'a', kind: CHARWISE });
  const list = registerList(regs);
  assert.deepEqual(list.map((r) => r.name), ['"', '0', 'a']);
  assert.equal(list[2].kind, CHARWISE, 'the named register carries its own kind');
  // A named yank is still a yank, so vim's register 0 follows it too.
  assert.equal(list[1].preview, 'inline');
});

test('register names normalise the way a vim prefix needs', () => {
  assert.equal(normaliseRegisterName('"'), '"');
  assert.equal(normaliseRegisterName('A'), 'A', 'case matters for append');
  assert.equal(normaliseRegisterName('*'), '+', '* is the primary selection → the system register');
  assert.equal(normaliseRegisterName('1'), null, 'numbered registers are out of scope');
  assert.equal(normaliseRegisterName(''), null);
});

// ---------------------------------------------------------------------------
// OSC52
// ---------------------------------------------------------------------------

test('base64 matches the spec examples and handles multi-byte text', () => {
  assert.equal(toBase64('hello'), 'aGVsbG8=');
  assert.equal(toBase64(''), '');
  assert.equal(toBase64('a'), 'YQ==');
  assert.equal(toBase64('ab'), 'YWI=');
  assert.equal(toBase64('abc'), 'YWJj');
  assert.equal(toBase64('héllo'), 'aMOpbGxv', 'UTF-8, not UTF-16 code units');
  assert.equal(toBase64('🚀'), '8J+agA==', 'astral characters encode as 4 bytes');
});

test('the raw sequence is exactly ESC ] 52 ; c ; <b64> BEL', () => {
  assert.equal(rawSequence('hi'), '\u001b]52;c;aGk=\u0007');
  assert.equal(rawSequence('hi', { selection: 'p' }), '\u001b]52;p;aGk=\u0007');
});

test('tmux and screen wrapping double the inner escapes', () => {
  const seq = rawSequence('hi');
  const tmux = wrapSequence(seq, { tmux: true });
  assert.ok(tmux.startsWith('\u001bPtmux;'), 'tmux passthrough intro');
  assert.ok(tmux.endsWith('\u001b\\'), 'and the string terminator');
  assert.ok(tmux.includes('\u001b\u001b]52;c;'), 'every inner ESC is doubled');
  const screen = wrapSequence(seq, { screen: true });
  assert.equal(screen, `\u001bP${seq}\u001b\\`);
  assert.equal(wrapSequence(seq), seq, 'no multiplexer means no wrapping');
});

test('the clipboard policy follows the environment and always lets the user override', () => {
  assert.equal(clipboardPolicy({ env: {}, isTTY: true }).allowed, true);
  assert.equal(clipboardPolicy({ env: {}, isTTY: false }).why, 'not-a-tty');
  assert.equal(clipboardPolicy({ env: { TERM: 'dumb' }, isTTY: true }).allowed, false);
  assert.equal(clipboardPolicy({ env: { CI: '1' }, isTTY: true }).allowed, false);
  assert.equal(clipboardPolicy({ env: { NO_OSC52: '1' }, isTTY: true }).allowed, false);
  assert.equal(clipboardPolicy({ env: { FULLSTACK_CLIPBOARD: 'off' }, isTTY: true }).allowed, false);
  assert.equal(clipboardPolicy({ env: { TMUX: '/tmp/tmux' }, isTTY: true }).tmux, true);
  assert.equal(clipboardPolicy({ env: { TERM: 'screen-256color' }, isTTY: true }).screen, true);

  // The setting wins over the heuristic in both directions.
  assert.equal(clipboardPolicy({ env: { CI: '1' }, isTTY: false, setting: 'osc52' }).allowed, true);
  assert.equal(clipboardPolicy({ env: {}, isTTY: true, setting: 'off' }).allowed, false);

  assert.match(clipboardStatus(clipboardPolicy({ env: {}, isTTY: true })), /OSC52/);
  assert.match(clipboardStatus(clipboardPolicy({ env: { CI: '1' }, isTTY: true })), /unavailable \(ci\)/);
});

test('copySequence emits bytes only when the policy allows it', () => {
  const allowed = { allowed: true, tmux: false, screen: false };
  assert.equal(copySequence('hi', { policy: allowed }), '\u001b]52;c;aGk=\u0007');
  assert.equal(copySequence(''), null, 'nothing to copy');
  assert.equal(copySequence('hi', { policy: { allowed: false, why: 'ci' } }), null);
  assert.equal(
    copySequence('x'.repeat(MAX_PAYLOAD + 1), { policy: allowed }),
    null,
    'an over-large yank is refused rather than truncated',
  );
});
