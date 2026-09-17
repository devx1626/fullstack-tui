/**
 * Document model tests (overhaul §8.1, task 2.1).
 * Run: node --test tests/unit/document.test.js
 *
 * Acceptance: "Every mutation flows through applyEdit; randomized op-sequence
 * property tests never corrupt text; multi-file model matches classic behavior
 * (emptyEditors port)".
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pos, cmpPos, eqPos, minPos, maxPos, range, isEmptyRange, rangesOverlap,
  docFromText, docText, clampPos, lineAt, lineCount, offsetOf, posOf,
  caretOf, viewOf, moveCaret, setView, moveCaretBy,
  edit, applyEdit, normaliseChanges, mapOffsetThrough,
  insertAt, deleteRange, replaceRange, setText,
  createSession, sessionTexts, sessionText, sessionDoc, sessionCaret, sessionFocus,
  sessionStep, sessionEdit, sessionUndo, sessionRedo, sessionCanUndo, sessionCanRedo,
  sessionSetText, sessionSetView, sessionResetFile, activeFile, sessionNames,
  sessionHistory, isPos,
} from '../../src/editor/document.js';

test('positions compare, order and build ranges', () => {
  assert.equal(cmpPos(pos(0, 1), pos(0, 2)), -1);
  assert.equal(cmpPos(pos(1, 0), pos(0, 9)), 1, 'row dominates column');
  assert.equal(cmpPos(pos(2, 3), pos(2, 3)), 0);
  assert.ok(eqPos(pos(1, 2), { row: 1, col: 2 }));
  assert.deepEqual(minPos(pos(1, 0), pos(0, 5)), pos(0, 5));
  assert.deepEqual(maxPos(pos(1, 0), pos(0, 5)), pos(1, 0));
  assert.deepEqual(range(pos(2, 1), pos(0, 0)), { start: pos(0, 0), end: pos(2, 1) }, 'range orders its ends');
  assert.ok(isEmptyRange(range(pos(1, 1), pos(1, 1))));
  assert.ok(rangesOverlap({ start: pos(0, 0), end: pos(0, 5) }, { start: pos(0, 4), end: pos(0, 9) }));
  assert.ok(!rangesOverlap({ start: pos(0, 0), end: pos(0, 5) }, { start: pos(0, 5), end: pos(0, 9) }), 'touching is not overlapping');
});

test('docFromText keeps the line-array shape and clamps the caret', () => {
  const doc = docFromText('one\ntwo\n\nfour');
  assert.deepEqual(doc.lines, ['one', 'two', '', 'four']);
  assert.equal(docText(doc), 'one\ntwo\n\nfour');
  assert.equal(lineCount(doc), 4);
  assert.equal(lineAt(doc, 2), '');
  assert.deepEqual(caretOf(doc), pos(0, 0));
  assert.deepEqual(docFromText('').lines, [''], 'an empty buffer is one empty line');
  assert.deepEqual(docFromText('ab', { caret: pos(99, 99) }).caret, pos(0, 2), 'a caret past the end clamps');
  assert.deepEqual(docFromText('a\nbb', { caret: pos(5, 5) }).caret, pos(1, 2), 'the row clamps to the last line');
  assert.deepEqual(viewOf(doc), { scrollTop: 0, scrollX: 0, goalCol: null });
});

test('offsetOf and posOf are inverses for every offset', () => {
  const src = 'one\ntwo\n\nfour';
  const doc = docFromText(src);
  for (let i = 0; i <= src.length; i += 1) {
    assert.equal(offsetOf(doc, posOf(doc, i)), i, `offset ${i} round-tripped`);
  }
  assert.deepEqual(posOf(doc, 999), pos(3, 4), 'past the end clamps');
  assert.deepEqual(posOf(doc, -5), pos(0, 0));
  assert.deepEqual(posOf(doc, NaN), pos(0, 0));
  assert.equal(offsetOf(doc, pos(1, 0)), 4, 'row 1 starts after "one\\n"');
});

test('applyEdit replaces a range inside one line', () => {
  const doc = docFromText('hello world');
  const { doc: next } = applyEdit(doc, edit(pos(0, 0), pos(0, 5), 'goodbye'));
  assert.equal(docText(next), 'goodbye world');
  assert.equal(docText(doc), 'hello world', 'the input document is untouched');
});

test('applyEdit spans and creates lines', () => {
  const doc = docFromText('aaa\nbbb\nccc');
  // Replace from the middle of row 0 to the middle of row 2 with multi-line text.
  const { doc: next } = applyEdit(doc, edit(pos(0, 1), pos(2, 1), 'X\nY\nZ'));
  assert.equal(docText(next), 'aX\nY\nZcc');
  // A pure newline insert splits the line.
  const { doc: split } = applyEdit(docFromText('ab'), edit(pos(0, 1), pos(0, 1), '\n'));
  assert.deepEqual(split.lines, ['a', 'b']);
  // Deleting the newline joins them.
  const { doc: joined } = applyEdit(split, edit(pos(0, 1), pos(1, 0), ''));
  assert.deepEqual(joined.lines, ['ab']);
});

test('applyEdit applies several changes in ONE pass, last to first', () => {
  const doc = docFromText('one two three');
  const { doc: next } = applyEdit(doc, [
    { start: pos(0, 0), end: pos(0, 3), text: '1' },
    { start: pos(0, 4), end: pos(0, 7), text: '2' },
    { start: pos(0, 8), end: pos(0, 13), text: '3' },
  ]);
  assert.equal(docText(next), '1 2 3');
});

test('applyEdit rejects overlapping changes instead of guessing', () => {
  const doc = docFromText('abcdef');
  assert.throws(
    () => applyEdit(doc, [
      { start: pos(0, 0), end: pos(0, 4), text: 'x' },
      { start: pos(0, 2), end: pos(0, 6), text: 'y' },
    ]),
    /changes overlap/,
  );
  // Touching ranges (the multi-cursor insertion case) are fine.
  const { doc: ok } = applyEdit(doc, [
    { start: pos(0, 0), end: pos(0, 0), text: 'A' },
    { start: pos(0, 2), end: pos(0, 2), text: 'B' },
  ]);
  assert.equal(docText(ok), 'AabBcdef');
});

test('applyEdit clamps out-of-range changes and drops empty ones', () => {
  const doc = docFromText('ab');
  assert.equal(docText(applyEdit(doc, { start: pos(0, 1), end: pos(9, 9), text: 'X' }).doc), 'aX');
  assert.equal(applyEdit(doc, { start: pos(0, 1), end: pos(0, 1), text: '' }).doc, doc, 'a no-op returns the same document');
  assert.deepEqual(normaliseChanges(doc, []), []);
});

test('the caret rides through an edit it is not part of', () => {
  const doc = { ...docFromText('abcdef'), caret: pos(0, 6) };
  // Insert three characters before the caret: the caret shifts by 3.
  const { doc: afterInsert } = applyEdit(doc, edit(pos(0, 0), pos(0, 0), 'XYZ'));
  assert.equal(docText(afterInsert), 'XYZabcdef');
  assert.deepEqual(afterInsert.caret, pos(0, 9), 'insert before the caret shifts it');

  // Delete a range before the caret: the caret moves back by the deleted length.
  const { doc: afterDelete } = applyEdit(doc, edit(pos(0, 1), pos(0, 3), ''));
  assert.equal(docText(afterDelete), 'adef');
  assert.deepEqual(afterDelete.caret, pos(0, 4), 'delete before the caret pulls it back');

  // Replacing the range the caret sits INSIDE collapses it to the end of the
  // replacement — "type over a selection" leaves the cursor after the text.
  const inside = { ...docFromText('abcdef'), caret: pos(0, 3) };
  const { doc: replaced } = applyEdit(inside, edit(pos(0, 1), pos(0, 5), 'Q'));
  assert.equal(docText(replaced), 'aQf');
  assert.deepEqual(replaced.caret, pos(0, 2));
});

test('an explicit caret wins over mapping (the view can place the cursor)', () => {
  const doc = docFromText('abcdef');
  const { doc: next, caret } = applyEdit(doc, edit(pos(0, 0), pos(0, 3), 'X'), pos(0, 1));
  assert.equal(docText(next), 'Xdef');
  assert.deepEqual(caret, pos(0, 1));
  assert.deepEqual(next.caret, pos(0, 1));
});

test('mapOffsetThrough collapses offsets inside a replaced range', () => {
  const doc = docFromText('0123456789');
  const changes = [{ start: pos(0, 2), end: pos(0, 5), text: 'AB' }];
  assert.equal(mapOffsetThrough(doc, changes, 0), 0, 'before the change');
  assert.equal(mapOffsetThrough(doc, changes, 2), 4, 'at the start maps past the replacement');
  assert.equal(mapOffsetThrough(doc, changes, 4), 4, 'inside collapses to the replacement end');
  assert.equal(mapOffsetThrough(doc, changes, 7), 6, 'after shifts by the delta');
});

test('insert/delete/replace helpers all funnel through applyEdit', () => {
  const doc = { ...docFromText('abc'), caret: pos(0, 3) };
  const { doc: typed } = insertAt(doc, 'd');
  assert.equal(docText(typed), 'abcd');
  assert.deepEqual(typed.caret, pos(0, 4), 'typing leaves the caret after the text');
  const { doc: cut } = deleteRange(typed, { start: pos(0, 0), end: pos(0, 2) });
  assert.equal(docText(cut), 'cd');
  const { doc: swapped } = replaceRange(cut, { start: pos(0, 0), end: pos(0, 2) }, 'ZZ');
  assert.equal(docText(swapped), 'ZZ');
  const { doc: whole } = setText(doc, 'x\ny', 3);
  assert.equal(docText(whole), 'x\ny');
  assert.deepEqual(whole.caret, pos(1, 1), 'setText can place the caret by offset');
});

test('moveCaret / moveCaretBy clamp, and setView keeps per-file scroll', () => {
  const doc = docFromText('a\nbb');
  assert.deepEqual(moveCaret(doc, pos(9, 9)).caret, pos(1, 2), 'clamped');
  const moved = moveCaretBy(doc, (caret) => pos(caret.row + 1, caret.col + 5));
  assert.deepEqual(moved.caret, pos(1, 2));
  assert.deepEqual(setView(doc, { scrollTop: 4 }).view, { scrollTop: 4, scrollX: 0, goalCol: null });
});

// ---------------------------------------------------------------------------
// Property test: a random op sequence must never corrupt the document
// ---------------------------------------------------------------------------

/** Deterministic LCG so a failure is reproducible from the seed in the message. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/** A tiny reference implementation: the document as one string. */
const applyToText = (text, change) => {
  const offsets = [];
  let n = 0;
  for (const line of text.split('\n')) {
    offsets.push(n);
    n += line.length + 1;
  }
  const toOffset = (p) => {
    const row = Math.max(0, Math.min(p.row, offsets.length - 1));
    const line = text.split('\n')[row];
    return offsets[row] + Math.max(0, Math.min(p.col, line.length));
  };
  const a = toOffset(change.start);
  const b = toOffset(change.end || change.start);
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  return text.slice(0, lo) + String(change.text ?? '') + text.slice(hi);
};

test('property: random edits through applyEdit match a one-string reference model', () => {
  for (const seed of [1, 7, 42, 1337]) {
    const rand = rng(seed);
    let doc = docFromText('alpha beta\ngamma delta\nepsilon');
    let ref = docText(doc);

    for (let step = 0; step < 300; step += 1) {
      const row = Math.floor(rand() * (doc.lines.length + 1));
      const rowA = Math.min(row, doc.lines.length - 1);
      const rowB = Math.min(rowA + Math.floor(rand() * 2), doc.lines.length - 1);
      const colA = Math.floor(rand() * (doc.lines[rowA].length + 2));
      const colB = Math.floor(rand() * (doc.lines[rowB].length + 2));
      const insert = ['', 'x', '\n', 'ab\ncd', '日本語', '\t'][Math.floor(rand() * 6)];
      const change = { start: pos(rowA, colA), end: pos(rowB, colB), text: insert };

      const { doc: next } = applyEdit(doc, change);
      ref = applyToText(ref, change);
      doc = next;

      assert.equal(docText(doc), ref, `seed ${seed} step ${step} diverged from the reference`);
      assert.ok(doc.lines.length >= 1, 'a document always has at least one line');
      assert.ok(!doc.lines.some((l) => typeof l !== 'string'), 'lines stay strings');
      // The caret must always be a legal position afterwards.
      const c = caretOf(doc);
      assert.ok(c.row >= 0 && c.row < doc.lines.length, `caret row ${c.row} out of range`);
      assert.ok(c.col >= 0 && c.col <= doc.lines[c.row].length, `caret col ${c.col} out of range`);
    }
    assert.ok(ref.length > 0 || ref === docText(doc));
  }
});

test('property: text can always be recovered exactly from lines', () => {
  const cases = ['', 'a', '\n', 'a\n', '\na', 'a\n\nb', '\n\n\n', 'a\r\nb', '日本語\ntext\t'];
  for (const text of cases) {
    assert.equal(docText(docFromText(text)), text, `round trip failed for ${JSON.stringify(text)}`);
  }
});

// ---------------------------------------------------------------------------
// Multi-file session
// ---------------------------------------------------------------------------

test('session holds one document per file and addresses them by name', () => {
  const files = { 'index.html': '<h1>hi</h1>', 'style.css': 'h1 { color: red; }' };
  const session = createSession(files);
  assert.deepEqual(session.order, ['index.html', 'style.css']);
  assert.equal(session.active, 'index.html', 'the first file is active by default');
  assert.deepEqual(sessionTexts(session), files, 'matches the classic emptyEditors/texts shape');
  assert.equal(sessionText(session, 'style.css'), 'h1 { color: red; }');
  assert.equal(session.files['style.css'].language, undefined);
});

test('session: edits, undo and redo stay inside one file', () => {
  let session = createSession({ a: 'aaa', b: 'bbb' });
  // Type into file a, then into file b.
  session = sessionEdit(session, edit(pos(0, 0), pos(0, 0), 'X'), { coalesce: 'typing', at: 0 });
  session = sessionFocus(session, 'b');
  session = sessionEdit(session, edit(pos(0, 0), pos(0, 0), 'Y'), { coalesce: 'typing', at: 0 });
  assert.deepEqual(sessionTexts(session), { a: 'Xaaa', b: 'Ybbb' });

  session = sessionUndo(session);
  assert.deepEqual(sessionTexts(session), { a: 'Xaaa', b: 'bbb' }, 'undo only touched the active file');
  assert.ok(sessionCanRedo(session, 'b'));
  assert.ok(sessionCanUndo(session, 'a'), 'file a still has its own step');

  session = sessionRedo(session);
  assert.deepEqual(sessionTexts(session), { a: 'Xaaa', b: 'Ybbb' });

  // Undoing in `a` leaves `b`'s own history (and its redo branch) alone: the
  // stacks are per file, so an undo can never reach across a tab.
  session = sessionFocus(session, 'a');
  session = sessionUndo(session);
  assert.deepEqual(sessionTexts(session), { a: 'aaa', b: 'Ybbb' }, 'file b kept its text');
  assert.ok(sessionCanRedo(session, 'a'), 'file a has a redo branch of its own');
  assert.ok(sessionCanUndo(session, 'b'), 'file b keeps its own history');
});

test('session: per-file caret, view and tab order survive a switch', () => {
  let session = createSession({ a: 'one\ntwo', b: 'other' });
  session = sessionEdit(session, { start: pos(1, 1), end: pos(1, 1), text: '!' }, { caret: pos(1, 2), coalesce: false });
  session = sessionSetView(session, 'a', { scrollTop: 7, goalCol: 3 });
  assert.deepEqual(sessionCaret(session, 'a'), pos(1, 2));
  assert.equal(sessionDoc(session, 'a').view.scrollTop, 7);

  session = sessionFocus(session, 'b');
  assert.deepEqual(sessionCaret(session), pos(0, 0), 'the other file starts at its own caret');
  assert.equal(activeFile(session).doc.view.scrollTop, 0);
  assert.deepEqual(sessionTexts(session), { a: 'one\nt!wo', b: 'other' });

  session = sessionFocus(session, 'a');
  assert.deepEqual(sessionCaret(session), pos(1, 2), 'caret restored on switch');
  assert.equal(sessionDoc(session).view.scrollTop, 7, 'scroll restored on switch');
  assert.ok(sessionCanUndo(session), 'history restored on switch');
});

test('session: Ctrl+W / Ctrl+Q style stepping wraps and never returns null on one file', () => {
  const two = createSession({ a: '1', b: '2' });
  assert.equal(sessionStep(two, 1), 'b');
  assert.equal(sessionStep(sessionFocus(two, 'b'), 1), 'a', 'wraps forward');
  assert.equal(sessionStep(two, -1), 'b', 'wraps backward');
  assert.equal(sessionStep(createSession({ only: 'x' }), 1), null, 'a single file has nowhere to step');
});

test('session: reset-to-starter clears text and is undoable only if asked', () => {
  let session = createSession({ a: 'starter' });
  session = sessionEdit(session, edit(pos(0, 0), pos(0, 7), 'edited'), { coalesce: false });
  assert.equal(sessionText(session, 'a'), 'edited');
  session = sessionResetFile(session, 'a', 'starter');
  assert.equal(sessionText(session, 'a'), 'starter');
  assert.ok(sessionCanUndo(session), 'the reset itself is a step');
  session = sessionUndo(session);
  assert.equal(sessionText(session, 'a'), 'edited', 'undo brings the edit back');
});

test('edit() builds a change object from either call shape', () => {
  // edit(range, text) — the shape a selection-based edit uses.
  assert.deepEqual(edit({ start: pos(0, 1), end: pos(0, 4) }, 'xy'), { start: pos(0, 1), end: pos(0, 4), text: 'xy' });
  // edit(start, end, text) — the shape a motion-based edit uses.
  assert.deepEqual(edit(pos(1, 0), pos(1, 2), 'z'), { start: pos(1, 0), end: pos(1, 2), text: 'z' });
  // A bare position means an insertion.
  assert.deepEqual(edit(pos(2, 2), 'q'), { start: pos(2, 2), end: pos(2, 2), text: 'q' });
  assert.ok(isPos(pos(0, 0)));
  assert.equal(isPos({ row: 0 }), false, 'a half-formed position is not a position');
});

test('session: helpers used by the tab strip and the view are exposed', () => {
  const session = createSession({ a: '1', b: '2' }, { languages: { b: 'css' } });
  assert.deepEqual(sessionNames(session), ['a', 'b']);
  assert.equal(sessionDoc(session, 'b').language, 'css', 'per-file language is kept');
  assert.equal(activeFile(session).doc.caret.row, 0);
  assert.equal(sessionHistory(session, 'a').past.length, 0);
  assert.deepEqual(clampPos(sessionDoc(session, 'a'), { row: 9, col: 9 }), pos(0, 1));
});

test('session: an unknown file name is a no-op, not a crash', () => {
  const session = createSession({ a: 'x' });
  assert.equal(sessionEdit(session, edit(pos(0, 0), pos(0, 0), 'y'), { name: 'nope' }), session);
  assert.equal(sessionUndo(session, 'nope'), session);
  assert.equal(sessionRedo(session, 'nope'), session);
  assert.equal(sessionSetText(session, 'nope', 'z'), session);
  assert.equal(sessionFocus(session, 'nope'), session);
  assert.equal(sessionDoc(session, 'nope'), null);
  assert.equal(sessionCanUndo(session, 'nope'), false);
  assert.equal(sessionSetView(session, 'nope', { scrollTop: 1 }), session);
});
