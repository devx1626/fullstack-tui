/**
 * Editor history tests (overhaul §8.2, task 2.2).
 * Run: node --test tests/unit/editorHistory.test.js
 *
 * Named `editorHistory.test.js`, not `history.test.js`: that name is already
 * taken by the CLASSIC checkpoint sidecar suite (Q9, `src/core/history.js`).
 * Two unrelated "history" modules is exactly the kind of thing that leads to
 * one suite being silently overwritten — so the filename says which one.
 *
 * Acceptance: "Table tests incl. coalescing windows; undo never crosses files;
 * matches §8.2 keybinds (redo ≠ Ctrl+R, per B.8)".
 *
 * Time is injected via `at`, so coalescing is deterministic — no sleeps.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createHistory, historyRecord, historyUndo, historyRedo, historyClear,
  canUndo, canRedo, historyDepth, peekUndo, peekRedo, COALESCE_WINDOW_MS,
} from '../../src/editor/history.js';
import { docFromText, docText } from '../../src/editor/document.js';

const doc = (text) => docFromText(text);

test('a fresh history can neither undo nor redo', () => {
  const h = createHistory();
  assert.equal(canUndo(h), false);
  assert.equal(canRedo(h), false);
  assert.equal(historyUndo(h), null);
  assert.equal(historyRedo(h), null);
  assert.equal(historyDepth(h), 0);
});

test('one recorded edit undoes and redoes exactly', () => {
  const before = doc('a');
  const after = doc('ab');
  let h = historyRecord(createHistory(), before, after);
  assert.equal(historyDepth(h), 1);
  assert.equal(canUndo(h), true);
  assert.equal(canRedo(h), false);

  const undo = historyUndo(h);
  assert.equal(docText(undo.doc), 'a');
  h = undo.history;
  assert.equal(canUndo(h), false);
  assert.equal(canRedo(h), true);

  const redo = historyRedo(h);
  assert.equal(docText(redo.doc), 'ab');
  h = redo.history;
  assert.equal(canUndo(h), true);
  assert.equal(canRedo(h), false);
});

test('recording a no-op (same text) never creates an undo step', () => {
  const a = doc('same');
  const h = historyRecord(createHistory(), a, doc('same'));
  assert.equal(historyDepth(h), 0);
  assert.equal(h.past.length, 0);
});

test('a new edit clears the redo branch (spec §8.2)', () => {
  let h = historyRecord(createHistory(), doc('a'), doc('ab'));
  h = historyUndo(h).history;
  assert.equal(canRedo(h), true);
  h = historyRecord(h, doc('a'), doc('ax'), { coalesce: false });
  assert.equal(canRedo(h), false, 'the redone future is gone');
  assert.equal(canUndo(h), true);
});

test('coalescing table: same kind inside the window merges, everything else does not', () => {
  const window = COALESCE_WINDOW_MS;
  const cases = [
    // [previous kind, next kind, gap ms, expected undo depth]
    ['typing', 'typing', 0, 1], // keystroke burst = one step
    ['typing', 'typing', window, 1], // exactly at the window edge
    ['typing', 'typing', window + 1, 2], // a pause starts a new step
    ['typing', 'pair', 10, 2], // a different kind never merges
    ['pair', 'pair', 10, 1], // auto-pair run merges with itself
    ['indent', 'indent', 10, 1],
    [false, false, 0, 2], // ungrouped edits are always their own step
    ['typing', false, 0, 2], // paste / completion-accept / replace-all
    [false, 'typing', 0, 2], // typing after a paste starts fresh
  ];

  for (const [first, second, gap, expected] of cases) {
    let h = createHistory();
    h = historyRecord(h, doc('0'), doc('1'), { coalesce: first, at: 1000 });
    h = historyRecord(h, doc('1'), doc('2'), { coalesce: second, at: 1000 + gap });
    assert.equal(
      historyDepth(h),
      expected,
      `${String(first)} then ${String(second)} after ${gap}ms → expected ${expected} step(s)`,
    );
  }
});

test('a merged typing run restores the ORIGINAL text in one undo', () => {
  let h = createHistory();
  h = historyRecord(h, doc(''), doc('a'), { coalesce: 'typing', at: 0 });
  h = historyRecord(h, doc('a'), doc('ab'), { coalesce: 'typing', at: 10 });
  h = historyRecord(h, doc('ab'), doc('abc'), { coalesce: 'typing', at: 20 });
  assert.equal(historyDepth(h), 1, 'the burst is one step');
  const undo = historyUndo(h);
  assert.equal(docText(undo.doc), '', 'undo returns the text from before the burst');
  const redo = historyRedo(undo.history);
  assert.equal(docText(redo.doc), 'abc', 'redo returns the whole burst');
});

test('coalesce: true is shorthand for the typing kind', () => {
  let h = createHistory();
  h = historyRecord(h, doc(''), doc('a'), { coalesce: true, at: 0 });
  h = historyRecord(h, doc('a'), doc('ab'), { coalesce: 'typing', at: 5 });
  assert.equal(historyDepth(h), 1, 'true and "typing" are the same run');
});

test('the window is per record call (a slower paste-style burst can be forced apart)', () => {
  let h = createHistory();
  h = historyRecord(h, doc(''), doc('a'), { coalesce: 'typing', at: 0, window: 10 });
  h = historyRecord(h, doc('a'), doc('ab'), { coalesce: 'typing', at: 50, window: 10 });
  assert.equal(historyDepth(h), 2);
});

test('the step cap drops the oldest entries', () => {
  let h = createHistory({ limit: 3 });
  for (let i = 1; i <= 5; i += 1) {
    h = historyRecord(h, doc(String(i - 1)), doc(String(i)), { coalesce: false, at: i });
  }
  assert.equal(historyDepth(h), 3, 'capped at the limit');
  // The three surviving steps walk back 5 → 4 → 3 → 2, and then stop: the two
  // dropped steps are gone rather than resurrected behind the cap.
  const first = historyUndo(h);
  assert.equal(docText(first.doc), '4');
  h = historyUndo(first.history).history;
  h = historyUndo(h).history;
  assert.equal(canUndo(h), false, 'the dropped steps are gone, not resurrected');
});

test('undo/redo do not mutate the history they are given (React-render safe)', () => {
  const h = historyRecord(createHistory(), doc('a'), doc('ab'), { coalesce: false });
  const snapshot = JSON.stringify({ past: h.past.length, future: h.future.length });
  const undo = historyUndo(h);
  assert.equal(JSON.stringify({ past: h.past.length, future: h.future.length }), snapshot, 'input untouched');
  assert.notEqual(undo.history, h, 'a new history object comes back');
  const redo = historyRedo(undo.history);
  assert.equal(docText(redo.doc), 'ab');
});

test('labels and peek helpers expose what the next step would do', () => {
  let h = historyRecord(createHistory(), doc('a'), doc('ab'), { coalesce: false, label: 'type' });
  assert.equal(peekUndo(h).label, 'type');
  assert.equal(peekRedo(h), null);
  h = historyUndo(h).history;
  assert.equal(peekRedo(h).label, 'type');
  assert.equal(peekUndo(h), null);
});

test('historyClear drops both directions', () => {
  let h = historyRecord(createHistory(), doc('a'), doc('ab'), { coalesce: false });
  h = historyUndo(h).history;
  h = historyClear(h);
  assert.equal(canUndo(h), false);
  assert.equal(canRedo(h), false);
});
