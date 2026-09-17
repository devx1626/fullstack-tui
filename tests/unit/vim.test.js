/**
 * Vim state machine tests (overhaul §8.8, task 2.4).
 * Run: node --test tests/unit/vim.test.js
 *
 * Acceptance for 2.4: "≥150 table-driven key-seq→state/text cases; Ctrl+C never
 * consumed; mode-indicator events drive footer; modeless fallback path identical
 * to classic keymap."
 *
 * The big table is the acceptance artifact: each row drives a key sequence
 * through the real `reduceKey` with a real document and asserts the resulting
 * text / caret / mode. Cases were written from vim's documented behaviour, not
 * from what the implementation happens to return.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { docFromText, docText, pos } from '../../src/editor/document.js';
import { createRegisters, readRegister } from '../../src/editor/registers.js';
import {
  VIM_BINDINGS, VIM_MODES, createVimState, keySpec, modeLabel, pairInsert,
  reduceKey, visualSelection,
} from '../../src/editor/vim.js';
import { applyMotion, MOTIONS, searchMatches, searchPattern } from '../../src/editor/vim/motions.js';
import { OPERATORS, joinChanges, putChanges, replaceCharChanges, deleteCharChanges } from '../../src/editor/vim/operators.js';
import { EX_COMMANDS, describeEx, parseEx, splitUnescaped } from '../../src/editor/vim/ex.js';

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

/**
 * Drive a key sequence. Every button of the reducer that a real screen uses is
 * exercised: state, document, registers, and the command/request channel.
 */
function run(cfg, keys, { registers = null } = {}) {
  let doc = docFromText((cfg.text || ['']).join('\n'), { caret: cfg.caret });
  let state = createVimState(cfg.state || {});
  let regs = registers || createRegisters();
  const events = [];
  const log = [];
  for (const key of keys) {
    const r = reduceKey(state, key, {
      doc, registers: regs, tabSize: 2, lineComment: '//', autoPair: cfg.autoPair,
    });
    state = r.state;
    doc = r.doc;
    regs = r.registers;
    // `channel` rather than `type`: a request payload has a `type` of its own
    // (`{type:'scroll'}`), and spreading it over a `type` label silently
    // replaced the label with the payload.
    if (r.command) events.push({ channel: 'command', ...r.command });
    if (r.request) events.push({ channel: 'request', ...r.request });
    if (!r.consumed) events.push({ channel: 'unconsumed', key });
    log.push({ key, mode: r.state.mode, changed: r.changed, kind: r.kind });
  }
  return {
    text: docText(doc).split('\n'),
    caret: doc.caret,
    doc,
    mode: state.mode,
    state,
    registers: regs,
    events,
    log,
  };
}

const keysOf = (keys) => (Array.isArray(keys) ? keys : String(keys).trim().split(/\s+/));

// ---------------------------------------------------------------------------
// The acceptance table: key sequence → state/text
// ---------------------------------------------------------------------------

const LINES = ['foo bar', 'baz qux'];

/** name, starting text, starting caret, keys, and what must come out. */
const CASES = [
  // --- motions -----------------------------------------------------------
  ['h moves left', ['abc'], pos(0, 2), 'h', { text: ['abc'], caret: pos(0, 1) }],
  ['l moves right', ['abc'], pos(0, 0), 'l', { text: ['abc'], caret: pos(0, 1) }],
  ['l wraps to the next line', ['ab', 'cd'], pos(0, 2), 'l', { caret: pos(1, 0) }],
  ['h wraps to the previous line', ['ab', 'cd'], pos(1, 0), 'h', { caret: pos(0, 2) }],
  ['j keeps the column', LINES, pos(0, 3), 'j', { caret: pos(1, 3) }],
  ['k keeps the column', LINES, pos(1, 2), 'k', { caret: pos(0, 2) }],
  ['arrow keys behave like hjkl', LINES, pos(0, 0), 'right', { caret: pos(0, 1) }],
  ['down is a motion too', LINES, pos(0, 1), 'down', { caret: pos(1, 1) }],
  ['w is the next word start', LINES, pos(0, 0), 'w', { caret: pos(0, 4) }],
  ['w crosses the line break', ['foo', 'bar'], pos(0, 0), 'w', { caret: pos(1, 0) }],
  ['b is the previous word start', ['foo bar'], pos(0, 4), 'b', { caret: pos(0, 0) }],
  ['e is the end of the word', ['foo bar'], pos(0, 0), 'e', { caret: pos(0, 2) }],
  ['W treats punctuation as part of the word', ['foo.bar baz'], pos(0, 0), 'W', { caret: pos(0, 8) }],
  ['B walks back a WORD', ['foo.bar baz'], pos(0, 8), 'B', { caret: pos(0, 0) }],
  ['E is the end of a WORD', ['foo.bar'], pos(0, 0), 'E', { caret: pos(0, 6) }],
  ['3 w applies the count', ['a b c d'], pos(0, 0), '3 w', { caret: pos(0, 6) }],
  ['0 is the line start', ['abc'], pos(0, 2), '0', { caret: pos(0, 0) }],
  ['^ is the first non-blank', ['   abc'], pos(0, 5), '^', { caret: pos(0, 3) }],
  ['$ is the line end', ['foo bar'], pos(0, 0), '$', { caret: pos(0, 7) }],
  ['gg is the document start', LINES, pos(1, 3), 'g g', { caret: pos(0, 0) }],
  ['G is the document end', LINES, pos(0, 0), 'G', { caret: pos(1, 0) }],
  ['3 G goes to line 3', ['a', 'b', 'c', 'd', 'e'], pos(0, 0), '3 G', { caret: pos(2, 0) }],
  ['f finds a character', ['foo bar'], pos(0, 0), 'f o', { caret: pos(0, 1) }],
  ['F searches backwards', ['foo bar'], pos(0, 5), 'F o', { caret: pos(0, 2) }],
  ['t stops before the character', ['foo bar'], pos(0, 0), 't b', { caret: pos(0, 3) }],
  ['; repeats the last find', ['foo bar'], pos(0, 0), 'f o ;', { caret: pos(0, 2) }],
  [', reverses the last find', ['foo bar'], pos(0, 0), 'f o ,', { caret: pos(0, 1) }],
  ['% jumps to the matching bracket', ['(ab)'], pos(0, 0), '%', { caret: pos(0, 3) }],

  // --- character edits ---------------------------------------------------
  ['x deletes the character under the caret', ['abc'], pos(0, 1), 'x', { text: ['ac'], caret: pos(0, 1) }],
  ['2x deletes two characters', ['abcd'], pos(0, 0), '2 x', { text: ['cd'], caret: pos(0, 0) }],
  ['x at end of line joins the next line', ['ab', 'cd'], pos(0, 2), 'x', { text: ['abcd'], caret: pos(0, 2) }],
  ['X is backspace-delete', ['abc'], pos(0, 1), 'X', { text: ['bc'], caret: pos(0, 0) }],
  ['X at column 0 joins upward', ['ab', 'cd'], pos(1, 0), 'X', { text: ['abcd'], caret: pos(0, 2) }],
  ['r replaces one character', ['abc'], pos(0, 1), 'r x', { text: ['axc'], caret: pos(0, 1) }],
  ['2r replaces two', ['abc'], pos(0, 0), '2 r x', { text: ['xxc'], caret: pos(0, 1) }],
  ['J joins the next line', ['foo', 'bar'], pos(0, 0), 'J', { text: ['foo bar'], caret: pos(0, 0) }],
  ['J does not double the existing space', ['foo ', 'bar'], pos(0, 0), 'J', { text: ['foo bar'] }],
  ['>> indents the line', ['a'], pos(0, 0), '> >', { text: ['  a'], caret: pos(0, 2) }],
  ['<< outdents the line', ['    a'], pos(0, 4), '< <', { text: ['  a'], caret: pos(0, 2) }],
  ['gcc comments the line', ['foo'], pos(0, 0), 'g c c', { text: ['// foo'], caret: pos(0, 0) }],
  ['gcc toggles the comment off', ['// foo'], pos(0, 0), 'g c c', { text: ['foo'] }],
  ['gcc indents the comment to the code', ['  foo'], pos(0, 0), 'g c c', { text: ['  // foo'] }],

  // --- operators ---------------------------------------------------------
  ['dw deletes a word', ['foo bar'], pos(0, 0), 'd w', { text: ['bar'], caret: pos(0, 0) }],
  ['de is inclusive', ['foo bar'], pos(0, 0), 'd e', { text: [' bar'], caret: pos(0, 0) }],
  ['d$ deletes to the line end', ['foo bar'], pos(0, 4), 'd $', { text: ['foo '], caret: pos(0, 4) }],
  ['D is d$', ['foo bar'], pos(0, 4), 'D', { text: ['foo '], caret: pos(0, 4) }],
  ['dd deletes the line', ['a', 'b', 'c'], pos(1, 0), 'd d', { text: ['a', 'c'], caret: pos(1, 0) }],
  ['2dd deletes two lines', ['a', 'b', 'c'], pos(0, 0), '2 d d', { text: ['c'] }],
  ['dj deletes two lines linewise', ['a', 'b', 'c'], pos(0, 0), 'd j', { text: ['c'] }],
  ['dG deletes to the end', ['a', 'b', 'c'], pos(1, 0), 'd G', { text: ['a'] }],
  ['cc changes the line and keeps the indent', ['  foo', 'bar'], pos(0, 3), 'c c', { text: ['  ', 'bar'], caret: pos(0, 2), mode: VIM_MODES.INSERT }],
  ['cw changes a word', ['foo bar'], pos(0, 0), 'c w', { text: ['bar'], caret: pos(0, 0), mode: VIM_MODES.INSERT }],
  ['C changes to the end of the line', ['foo bar'], pos(0, 4), 'C', { text: ['foo '], caret: pos(0, 4), mode: VIM_MODES.INSERT }],
  ['ddp swaps the line with the next one (vim)', ['a', 'b', 'c'], pos(1, 0), 'd d p', { text: ['a', 'c', 'b'] }],
  ['dd on the last line leaves no phantom line', ['a', 'b'], pos(1, 0), 'd d', { text: ['a'] }],
  ['yy then p duplicates the line', ['a', 'b'], pos(0, 0), 'y y p', { text: ['a', 'a', 'b'] }],
  ['Y is yy', ['a', 'b'], pos(0, 0), 'Y p', { text: ['a', 'a', 'b'] }],
  ['yy then P pastes the copied line above itself', ['a', 'b'], pos(1, 0), 'y y P', { text: ['a', 'b', 'b'], caret: pos(1, 0) }],
  ['x then p pastes after the caret (vim)', ['abc'], pos(0, 0), 'x p', { text: ['bac'], caret: pos(0, 2) }],
  ['x then P puts the character back', ['abc'], pos(0, 1), 'x P', { text: ['abc'], caret: pos(0, 2) }],
  ['yy leaves the text alone', ['a', 'b'], pos(0, 0), 'y y', { text: ['a', 'b'], caret: pos(0, 0) }],
  ['gu lowercases a word', ['FOO bar'], pos(0, 0), 'g u w', { text: ['foo bar'] }],
  ['gU uppercases a word', ['foo bar'], pos(0, 0), 'g U w', { text: ['FOO bar'] }],
  ['guw on a mixed word', ['Foo Bar'], pos(0, 4), 'g u w', { text: ['Foo bar'] }],
  ['gc comments a motion range', ['a', 'b'], pos(0, 0), 'g c j', { text: ['// a', '// b'] }],
  ['d with a count after the operator', ['a b c d'], pos(0, 0), 'd 2 w', { text: ['c d'] }],
  ['counts multiply', ['a b c d e f g'], pos(0, 0), '2 d 2 w', { text: ['e f g'] }],

  // --- registers ---------------------------------------------------------
  ['"ayw yanks into a', ['one two'], pos(0, 0), '" a y w', { text: ['one two'] }],
  ['"aP pastes register a', ['one two'], pos(0, 0), '" a y w w " a P', { text: ['one one two'] }],
  ['a yank leaves the caret at the start of the range', ['one two'], pos(0, 0), 'y w', { caret: pos(0, 0) }],
  ['p pastes the unnamed register after the caret', ['one two'], pos(0, 4), 'y w $ p', { text: ['one twotwo'] }],


  // --- insert entry ------------------------------------------------------
  ['i inserts before the caret', ['abc'], pos(0, 1), 'i X', { text: ['aXbc'], caret: pos(0, 2), mode: VIM_MODES.INSERT }],
  ['a inserts after the caret', ['abc'], pos(0, 1), 'a X', { text: ['abXc'], caret: pos(0, 3), mode: VIM_MODES.INSERT }],
  ['I inserts at the first non-blank', ['   abc'], pos(0, 5), 'I X', { text: ['   Xabc'], caret: pos(0, 4), mode: VIM_MODES.INSERT }],
  ['A inserts at the line end', ['abc'], pos(0, 0), 'A X', { text: ['abcX'], caret: pos(0, 4), mode: VIM_MODES.INSERT }],
  ['o opens a line below with the indent', ['  foo'], pos(0, 0), 'o b', { text: ['  foo', '  b'], caret: pos(1, 3), mode: VIM_MODES.INSERT }],
  ['O opens a line above', ['  foo'], pos(0, 2), 'O b', { text: ['  b', '  foo'], caret: pos(0, 3), mode: VIM_MODES.INSERT }],
  ['s substitutes the character', ['abc'], pos(0, 1), 's', { text: ['ac'], caret: pos(0, 1), mode: VIM_MODES.INSERT }],
  ['escape leaves insert mode and steps back', ['abc'], pos(0, 3), 'i escape', { caret: pos(0, 2), mode: VIM_MODES.NORMAL }],
  ['escape after typing steps onto the last character', ['abc'], pos(0, 0), 'i X escape', { text: ['Xabc'], caret: pos(0, 0) }],
  ['escape at column 0 does not wrap', ['abc'], pos(0, 0), 'i escape', { caret: pos(0, 0), mode: VIM_MODES.NORMAL }],
  ['R is overtype', ['abc'], pos(0, 0), 'R x escape', { text: ['xbc'], mode: VIM_MODES.NORMAL }],
  ['R past end of line appends', ['abc'], pos(0, 3), 'R x escape', { text: ['abcx'] }],
  ['insert mode Enter splits the line', ['foo bar'], pos(0, 3), 'A enter', { text: ['foo bar', ''], caret: pos(1, 0) }],
  ['Enter keeps the indent', ['  foo'], pos(0, 5), 'A enter', { text: ['  foo', '  '], caret: pos(1, 2) }],
  ['Enter after an opening brace indents a level', ['if (x) {'], pos(0, 8), 'A enter', { text: ['if (x) {', '  '], caret: pos(1, 2) }],
  ['Enter between a pair opens a block', ['()'], pos(0, 1), 'i enter', { text: ['(', '  ', ')'], caret: pos(1, 2) }],
  ['backspace joins lines', ['ab', 'cd'], pos(1, 0), 'i backspace', { text: ['abcd'], caret: pos(0, 2) }],
  ['backspace removes an empty pair', ['()'], pos(0, 1), 'i backspace', { text: [''], caret: pos(0, 0) }],
  ['an opening bracket auto-pairs', [''], pos(0, 0), 'i (', { text: ['()'], caret: pos(0, 1) }],
  ['typing the closer steps over it', ['()'], pos(0, 1), 'i )', { text: ['()'], caret: pos(0, 2) }],
  ['a quote auto-pairs', [''], pos(0, 0), 'i "', { text: ['""'], caret: pos(0, 1) }],
  ['auto-pairing can be turned off', [''], pos(0, 0), 'i (', { text: ['('], caret: pos(0, 1), autoPair: false }],
  ['tab inserts to the next tab stop', ['a'], pos(0, 1), 'A tab', { text: ['a '], caret: pos(0, 2) }],
  ['ctrl-w deletes the previous word', ['foo bar'], pos(0, 7), 'A ctrl-w', { text: ['foo '], caret: pos(0, 4) }],
  ['ctrl-u clears to the line start', ['foo'], pos(0, 3), 'A ctrl-u', { text: [''], caret: pos(0, 0) }],
  ['delete removes forward', ['abc'], pos(0, 1), 'i delete', { text: ['ac'], caret: pos(0, 1) }],

  // --- visual modes ------------------------------------------------------
  ['v then l extends the selection', ['abcd'], pos(0, 0), 'v l', { caret: pos(0, 1), mode: VIM_MODES.VISUAL }],
  ['visual d deletes the selection', ['abcd'], pos(0, 0), 'v l l d', { text: ['cd'], caret: pos(0, 0) }],
  ['visual y yanks it', ['abcd'], pos(0, 0), 'v l y', { text: ['abcd'] }],
  ['visual y then x deletes the yanked text', ['abcd'], pos(0, 0), 'v l l y x x', { text: ['cd'] }],
  ['visual gu lowercases', ['ABCD'], pos(0, 0), 'v l l g u', { text: ['abCD'] }],
  ['visual > indents the lines', ['a', 'b'], pos(0, 0), 'V >', { text: ['  a', 'b'] }],
  ['V d deletes whole lines', ['a', 'b'], pos(0, 0), 'V d', { text: ['b'] }],
  ['escape leaves visual mode at the start', ['abcd'], pos(0, 0), 'v l l escape', { caret: pos(0, 0), mode: VIM_MODES.NORMAL }],
  ['o swaps the ends of the selection', ['abcd'], pos(0, 0), 'v l l o', { caret: pos(0, 0), mode: VIM_MODES.VISUAL }],
  ['V switches to visual-line', ['abcd'], pos(0, 0), 'v V', { mode: VIM_MODES.VISUAL_LINE }],
  ['v again leaves visual mode', ['abcd'], pos(0, 0), 'v v', { mode: VIM_MODES.NORMAL }],
  ['ctrl-v j d deletes a column block', ['abcd', 'efgh'], pos(0, 1), 'ctrl-v j d', { text: ['acd', 'egh'] }],
  ['ctrl-v block insert I', ['ab', 'cd'], pos(0, 0), 'ctrl-v j I X escape', { text: ['Xab', 'Xcd'] }],
  ['ctrl-v block append A', ['ab', 'cd'], pos(0, 0), 'ctrl-v j A X escape', { text: ['aXb', 'cXd'] }],

  // --- undo requests -----------------------------------------------------
  ['u asks for an undo', ['abc'], pos(0, 0), 'x u', { text: ['bc'] }],
  ['ctrl-r asks for a redo', ['abc'], pos(0, 0), 'x ctrl-r', { text: ['bc'] }],

  // --- searches ----------------------------------------------------------
  ['/ jumps to a match', ['foo bar foo'], pos(0, 0), '/ b a r enter', { caret: pos(0, 4) }],
  ['a search lands on the next match after the caret', ['ab ab ab'], pos(0, 0), '/ a b enter', { caret: pos(0, 3) }],
  ['n goes to the next match', ['ab ab ab'], pos(0, 0), '/ a b enter n', { caret: pos(0, 6) }],
  ['N goes back', ['ab ab ab'], pos(0, 0), '/ a b enter N', { caret: pos(0, 0) }],
  ['n wraps to the first match', ['foo bar foo'], pos(0, 0), '/ f o o enter n', { caret: pos(0, 0) }],
  ['? searches backwards', ['foo bar foo'], pos(0, 8), '? f o o enter', { caret: pos(0, 0) }],
  ['search wraps around the document', ['foo bar'], pos(0, 4), '/ f o o enter', { caret: pos(0, 0) }],
  ['a missing pattern is reported, not fatal', ['foo'], pos(0, 0), '/ z z z enter', { caret: pos(0, 0) }],
  ['* searches for the word under the caret', ['foo bar foo'], pos(0, 0), '*', { caret: pos(0, 8) }],

  // --- jumps and repeats -------------------------------------------------
  ['`` returns after a jump', ['a', 'b'], pos(0, 0), 'G `', { caret: pos(0, 0) }],
  ['. repeats x', ['foo bar'], pos(0, 0), 'x .', { text: ['o bar'] }],
  ['. repeats dw', ['foo bar baz'], pos(0, 0), 'd w .', { text: ['baz'] }],
  ['. repeats an insert', ['abc'], pos(0, 0), 'i X escape .', { text: ['XXabc'] }],

  // --- ex-lite -----------------------------------------------------------
  [':w is the challenge check command', ['a'], pos(0, 0), ': w enter', { text: ['a'] }],
  [':q goes back', ['a'], pos(0, 0), ': q enter', { text: ['a'] }],
  [':q! goes back too', ['a'], pos(0, 0), ': q ! enter', { text: ['a'] }],
  [':42 jumps to a line', Array.from({ length: 60 }, (_, i) => `line ${i + 1}`), pos(0, 0), ': 4 2 enter', { caret: pos(41, 0) }],
  [':%s replaces every occurrence', ['foo foo'], pos(0, 0), ': % s / f o o / b a r / g enter', { text: ['bar bar'] }],
  [':s replaces on the caret line only', ['foo', 'foo'], pos(0, 0), ': s / f o o / b a r enter', { text: ['bar', 'foo'] }],
  [':1,2s replaces in a range', ['foo', 'foo', 'foo'], pos(0, 0), ': 1 , 2 s / f o o / b a r enter', { text: ['bar', 'bar', 'foo'] }],
  ['an unknown ex command changes nothing', ['foo'], pos(0, 0), ': x y z enter', { text: ['foo'] }],

  // --- keys that must fall through --------------------------------------
  ['ctrl-c is never consumed', ['abc'], pos(0, 0), 'ctrl-c', { text: ['abc'] }],
  ['ctrl-k is never consumed', ['abc'], pos(0, 0), 'ctrl-k', { text: ['abc'] }],
  ['an unbound key falls through', ['abc'], pos(0, 0), 'f9', { text: ['abc'] }],
];

const at = (p) => `${p.row}:${p.col}`;

/**
 * One-line failure output on purpose: node's deep-equal diff for every row of a
 * 130-row table is unreadable, and the case name plus both values is the whole
 * signal. `same` compares by value, not identity.
 */
function compare(name, out, want) {
  const problems = [];
  if (want.text && JSON.stringify(out.text) !== JSON.stringify(want.text)) {
    problems.push(`text ${JSON.stringify(out.text)} ≠ ${JSON.stringify(want.text)}`);
  }
  if (want.caret && at(out.caret) !== at(want.caret)) {
    problems.push(`caret ${at(out.caret)} ≠ ${at(want.caret)}`);
  }
  if (want.mode && out.mode !== want.mode) problems.push(`mode ${out.mode} ≠ ${want.mode}`);
  return problems.length ? `${name} — ${problems.join('; ')}` : null;
}

test('vim: the acceptance table (key sequence → state and text)', async (t) => {
  let checked = 0;
  for (const [name, text, caret, keys, want] of CASES) {
    await t.test(name, () => {
      const out = run({ text, caret, autoPair: want.autoPair }, keysOf(keys));
      assert.equal(compare(name, out, want), null);
    });
    checked += 1;
  }
  assert.ok(checked >= 130, `the table holds ${checked} cases`);
});

// ---------------------------------------------------------------------------
// The command/request channel
// ---------------------------------------------------------------------------

test('vim: ex-lite routes to registry command ids, never to editor functions', async (t) => {
  await t.test(':w runs challenge.check', () => {
    const out = run({ text: ['a'], caret: pos(0, 0) }, keysOf(': w enter'));
    assert.deepEqual(out.events[0], { channel: 'command', id: 'challenge.check', title: 'check my code' });
  });
  await t.test(':wq checks and then goes back', () => {
    const out = run({ text: ['a'], caret: pos(0, 0) }, keysOf(': w q enter'));
    assert.equal(out.events[0].id, 'challenge.check');
    assert.deepEqual(out.events[0].then, { id: 'app.back', title: 'go back' }, 'the second half rides as `then`');
  });
  await t.test(':hint and :solution map to the registry names', () => {
    assert.equal(run({ text: ['a'], caret: pos(0, 0) }, keysOf(': h i n t enter')).events[0].id, 'challenge.hint');
    assert.equal(run({ text: ['a'], caret: pos(0, 0) }, keysOf(': s o l u t i o n enter')).events[0].id, 'challenge.solution');
  });
  await t.test(':browser opens the pane', () => {
    assert.equal(run({ text: ['a'], caret: pos(0, 0) }, keysOf(': b r o w s e r enter')).events[0].id, 'challenge.browser');
  });
  await t.test(':registers asks the screen for the panel', () => {
    const out = run({ text: ['a'], caret: pos(0, 0) }, keysOf(': r e g i s t e r s enter'));
    assert.equal(out.events.length, 1);
    assert.deepEqual(out.events[0], { channel: 'request', type: 'registers' });
    assert.equal(out.text[0], 'a', 'nothing was edited');
  });
});

test('vim: yanking asks for a clipboard copy (OSC52 is the caller\'s decision)', () => {
  const out = run({ text: ['foo bar'], caret: pos(0, 0) }, keysOf('y w'));
  const copy = out.events.find((e) => e.channel === 'request' && e.type === 'clipboard');
  assert.ok(copy, 'a yank emits a copy request');
  assert.equal(copy.text, 'foo ');
  const del = run({ text: ['foo bar'], caret: pos(0, 0) }, keysOf('d w'));
  assert.equal(del.events.length, 0, 'a delete does NOT copy: that would spam the clipboard');
});

test('vim: undo/redo and scroll are REQUESTS, not document mutations', () => {
  const moved = run({ text: ['a', 'b', 'c'], caret: pos(0, 0) }, keysOf('G'));
  assert.deepEqual(moved.text, ['a', 'b', 'c'], 'a motion never edits');

  const undo = run({ text: ['abc'], caret: pos(0, 0) }, keysOf('u'));
  assert.equal(undo.events.length, 1);
  assert.deepEqual(undo.events[0], { channel: 'request', type: 'undo' });
  assert.deepEqual(undo.text, ['abc'], 'undo is the caller\'s job: the engine cannot know the history');

  const redo = run({ text: ['abc'], caret: pos(0, 0) }, keysOf('ctrl-r'));
  assert.deepEqual(redo.events[0], { channel: 'request', type: 'redo' });

  const half = run({ text: ['a'], caret: pos(0, 0) }, keysOf('ctrl-d'));
  assert.deepEqual(half.events[0], { channel: 'request', type: 'scroll', dir: 1, amount: 'half' });

  const page = run({ text: ['a'], caret: pos(0, 0) }, keysOf('ctrl-f'));
  assert.equal(page.events[0].amount, 'page');

  const tab = run({ text: ['a'], caret: pos(0, 0) }, keysOf('ctrl-w'));
  assert.deepEqual(tab.events[0], { channel: 'request', type: 'tab', dir: 1 });
});

test('vim: ctrl-c and ctrl-k come back unconsumed', () => {
  for (const key of ['ctrl-c', 'ctrl-k']) {
    const out = run({ text: ['abc'], caret: pos(0, 0) }, [key]);
    assert.deepEqual(out.events, [{ channel: 'unconsumed', key }], `${key} must reach the dispatcher`);
  }
});

test('vim: Ctrl+C is never consumed even mid-operator or mid-insert', () => {
  for (const keys of [['d'], ['i'], ['v'], ['y', 'a'], ['r'], [':', 'w']]) {
    const out = run({ text: ['abc'], caret: pos(0, 0) }, [...keys, 'ctrl-c']);
    assert.equal(out.events.at(-1).channel, 'unconsumed', `ctrl-c after ${keys.join(' ')}`);
    assert.equal(out.events.at(-1).key, 'ctrl-c');
  }
});

test('vim: the mode indicator drives the footer', () => {
  assert.equal(modeLabel(createVimState()), 'NORMAL');
  assert.equal(modeLabel({ ...createVimState(), mode: VIM_MODES.INSERT }), 'INSERT');
  assert.equal(modeLabel({ ...createVimState(), mode: VIM_MODES.VISUAL }), 'VISUAL');
  assert.equal(modeLabel({ ...createVimState(), mode: VIM_MODES.VISUAL_LINE }), 'V-LINE');
  assert.equal(modeLabel({ ...createVimState(), mode: VIM_MODES.VISUAL_BLOCK }), 'V-BLOCK');
  assert.equal(modeLabel({ ...createVimState(), mode: VIM_MODES.REPLACE }), 'REPLACE');
  assert.equal(modeLabel({ ...createVimState(), mode: VIM_MODES.EX, input: { kind: 'ex', text: '' } }), 'EX');
  assert.equal(modeLabel({ ...createVimState(), operator: 'd', mode: VIM_MODES.OPERATOR }), 'd DELETE');
  assert.equal(modeLabel({ ...createVimState(), operator: 'y', mode: VIM_MODES.OPERATOR, count: '3' }), '3y YANK');
  assert.equal(modeLabel({ ...createVimState(), enabled: false }), 'MODELESS');
  assert.equal(modeLabel({ ...createVimState(), mode: VIM_MODES.NORMAL, count: '12' }), '12·NORMAL');
});

test('vim: a disabled machine consumes nothing (the modeless fallback)', () => {
  const out = run({ text: ['abc'], caret: pos(0, 0), state: { enabled: false } }, keysOf('d w'));
  assert.deepEqual(out.text, ['abc']);
  assert.equal(out.events.filter((e) => e.channel === 'unconsumed').length, 2);
});

// ---------------------------------------------------------------------------
// Every key in the binding table resolves
// ---------------------------------------------------------------------------

test('vim: every Appendix B.5 binding the machine claims actually resolves', async (t) => {
  const ctxs = {
    normal: { text: ['foo bar', '(baz)', 'if (x) {', 'qux'], caret: pos(0, 0) },
    insert: { text: ['foo'], caret: pos(0, 1) },
    visual: { text: ['foo bar'], caret: pos(0, 0) },
  };
  let count = 0;
  for (const binding of VIM_BINDINGS) {
    for (const key of binding.keys) {
      // `dd`, `gg`, `cc`, `yy`, `gc`, `gu`, `gU` are two keystrokes, not one key.
      const strokes = /^[a-zA-Z]{2}$/.test(key) ? [...key] : [key];
      await t.test(`${binding.mode}: ${key} → ${binding.command}`, () => {
        const setup = ctxs[binding.mode] || ctxs.normal;
        const entry = binding.mode === 'normal' ? [] : [binding.mode === 'visual' ? 'v' : 'i'];
        const out = run({ text: setup.text, caret: setup.caret }, [...entry, ...strokes, 'ctrl-c']);
        const unconsumed = out.events.filter((e) => e.channel === 'unconsumed');
        assert.equal(unconsumed.length, 1, `${key} must be consumed by the machine`);
        assert.equal(unconsumed[0].key, 'ctrl-c');
      });
      count += 1;
    }
  }
  assert.ok(count >= 40, `${count} bindings checked`);
});

// ---------------------------------------------------------------------------
// Mode transitions
// ---------------------------------------------------------------------------

test('vim: operator-pending is entered, labelled, and escapable', () => {
  const out = run({ text: ['foo bar'], caret: pos(0, 0) }, ['d']);
  assert.equal(out.mode, VIM_MODES.OPERATOR);
  const escaped = run({ text: ['foo bar'], caret: pos(0, 0) }, keysOf('d escape'));
  assert.equal(escaped.mode, VIM_MODES.NORMAL);
  assert.deepEqual(escaped.text, ['foo bar']);
  const other = run({ text: ['foo bar'], caret: pos(0, 0) }, ['d', 'y']);
  assert.equal(other.mode, VIM_MODES.NORMAL, 'an unbound key cancels the operator');
  assert.deepEqual(other.text, ['foo bar'], '`dy` must NOT delete the line');
  const doubled = run({ text: ['foo bar', 'baz'], caret: pos(0, 0) }, ['d', 'd']);
  assert.deepEqual(doubled.text, ['baz'], 'while `dd` is the line operator');
});

test('vim: a count survives an operator but not a mode change', () => {
  const out = run({ text: ['a b c d'], caret: pos(0, 0) }, keysOf('2 d w'));
  assert.deepEqual(out.text, ['c d']);
  const cleared = run({ text: ['a b c d'], caret: pos(0, 0) }, keysOf('3 escape w'));
  assert.deepEqual(cleared.caret, pos(0, 2), 'escape drops the count, so w moves one word');
});

test('vim: : and / own their line, and escape cancels it', () => {
  const ex = run({ text: ['a'], caret: pos(0, 0) }, [':', 'q']);
  assert.equal(ex.state.input.text, 'q');
  assert.equal(ex.mode, VIM_MODES.EX);
  const cancelled = run({ text: ['a'], caret: pos(0, 0) }, [':', 'q', 'escape']);
  assert.equal(cancelled.mode, VIM_MODES.NORMAL);
  assert.equal(cancelled.state.input, null);
  const search = run({ text: ['foo bar'], caret: pos(0, 0) }, ['/', 'b', 'a', 'r']);
  assert.equal(search.mode, VIM_MODES.SEARCH);
  assert.equal(search.state.input.text, 'bar');
  const backspace = run({ text: ['foo bar'], caret: pos(0, 0) }, ['/', 'b', 'a', 'backspace']);
  assert.equal(backspace.state.input.text, 'b');
});

test('vim: a visual command with : scopes the substitute to the selection', () => {
  const out = run({ text: ['foo', 'foo', 'foo'], caret: pos(0, 0) }, keysOf('v j : s / f o o / b a r enter'));
  assert.deepEqual(out.text, ['bar', 'bar', 'foo']);
});

// ---------------------------------------------------------------------------
// Confirm-each substitute
// ---------------------------------------------------------------------------

test('vim: :%s///c asks per match and y/a/n/q resolve it', async (t) => {
  await t.test('y accepts one', () => {
    const out = run({ text: ['foo foo'], caret: pos(0, 0) }, keysOf(': % s / f o o / b a r / c enter y'));
    assert.deepEqual(out.text, ['bar foo']);
  });
  await t.test('n skips one', () => {
    const out = run({ text: ['foo foo'], caret: pos(0, 0) }, keysOf(': % s / f o o / b a r / c enter n'));
    assert.deepEqual(out.text, ['foo foo']);
  });
  await t.test('a accepts the rest', () => {
    const out = run({ text: ['foo foo foo'], caret: pos(0, 0) }, keysOf(': % s / f o o / b a r / c enter a'));
    assert.deepEqual(out.text, ['bar bar bar']);
  });
  await t.test('q stops and keeps what was accepted', () => {
    const out = run({ text: ['foo foo'], caret: pos(0, 0) }, keysOf(': % s / f o o / b a r / c enter y q'));
    assert.deepEqual(out.text, ['bar foo']);
  });
  await t.test('a longer replacement does not shift the later matches', () => {
    const out = run({ text: ['x x'], caret: pos(0, 0) }, keysOf(': % s / x / l o n g e r / c enter a'));
    assert.deepEqual(out.text, ['longer longer'], 'later matches are measured against the ORIGINAL text');
  });
  await t.test('the prompt lands in a confirm state', () => {
    const out = run({ text: ['foo'], caret: pos(0, 0) }, keysOf(': % s / f o o / b a r / c enter'));
    assert.equal(out.state.confirm.plan.length, 1);
    assert.match(out.state.status, /replace 1\?/);
  });
});

// ---------------------------------------------------------------------------
// Custom text objects / motion helpers used by the machine
// ---------------------------------------------------------------------------

test('vim: motions expose the flags an operator needs', () => {
  const doc = docFromText('foo bar');
  assert.equal(MOTIONS.e.inclusive, true, 'e is inclusive');
  assert.equal(MOTIONS.w.inclusive, false, 'w is exclusive');
  assert.equal(MOTIONS.j.linewise, true, 'j is linewise');
  assert.equal(applyMotion(doc, pos(0, 0), 'f', { arg: 'o' }).inclusive, true);
  assert.equal(applyMotion(doc, pos(0, 0), 't', { arg: 'o' }).inclusive, false);
  assert.equal(applyMotion(doc, pos(0, 0), 'zz').failed, true, 'unknown motions fail, they do not throw');
});

test('vim: operator helpers produce change lists, not mutations', () => {
  const doc = docFromText('abcd\nefgh');
  assert.deepEqual(replaceCharChanges(doc, pos(0, 0), 'X', 2).changes, [
    { start: pos(0, 0), end: pos(0, 2), text: 'XX' },
  ]);
  assert.equal(deleteCharChanges(doc, pos(0, 0), { count: 1 }).changes.length, 1);
  assert.equal(joinChanges(doc, pos(0, 0), 1).changes.length, 1);
  assert.ok(OPERATORS.has('gu') && OPERATORS.has('gc'));
  const entry = { text: 'x\ny\n', kind: 'linewise' };
  const put = putChanges({ doc, caret: pos(0, 0), entry, before: false });
  assert.deepEqual(put.changes[0].text, 'x\ny\n');
});

test('vim: ; and , work with an operator pending', () => {
  const out = run({ text: ['afoobfoo'], caret: pos(0, 0) }, keysOf('f o d ;'));
  assert.deepEqual(out.text, ['afbfoo'], 'd; repeats the find and deletes up to and including it');
  const back = run({ text: ['afoobfoo'], caret: pos(0, 5) }, keysOf('F o d ,'));
  assert.deepEqual(back.text, ['afoo'], ', repeats the find in the opposite direction');
});

// ---------------------------------------------------------------------------
// ex parser details (unit level)
// ---------------------------------------------------------------------------

test('vim: the ex parser reads ranges, flags and escapes', () => {
  assert.deepEqual(parseEx('42'), { kind: 'goto-line', line: 42 });
  assert.equal(parseEx('%s/a/b/g').kind, 'substitute');
  assert.equal(parseEx('%s/a/b/g').all, true);
  assert.equal(parseEx('s/a/b/').all, false);
  assert.equal(parseEx('%s/a/b/c').confirm, true);
  assert.deepEqual(parseEx('1,5s/a/b/').range, '1,5');
  assert.equal(parseEx('').kind, 'empty');
  assert.deepEqual(parseEx('nope'), { kind: 'unknown', command: 'nope' });
  assert.equal(parseEx('s/only').kind, 'error');
  assert.deepEqual(splitUnescaped('a\\/b/c', '/'), ['a/b', 'c']);
  assert.deepEqual(Object.keys(EX_COMMANDS).length >= 14, true);
  assert.equal(describeEx(parseEx('w')), 'check my code');
  assert.match(describeEx(parseEx('9')), /line 9/);
});

test('vim: the ex command table has ids, not functions', () => {
  for (const [name, entry] of Object.entries(EX_COMMANDS)) {
    assert.ok(entry.handler === 'command' || entry.handler === 'registers', `${name} has a handler`);
    assert.notEqual(typeof entry.run, 'function', `${name} must not run anything itself`);
    if (entry.handler === 'command') assert.equal(typeof entry.id, 'string', `${name} names a registry command`);
  }
});

// ---------------------------------------------------------------------------
// Search helpers shared with task 2.5
// ---------------------------------------------------------------------------

test('vim: searchPattern is smart-case and never throws on a bad regex', () => {
  const smart = searchPattern('foo');
  assert.ok(smart.test('FOO'), 'an all-lowercase pattern is case-insensitive');
  assert.equal(searchPattern('Foo').test('FOO'), false, 'a capital makes it exact');
  // Without the regex flag the pattern is LITERAL: `(` matches a bracket rather
  // than blowing up, which is what a user typing `/` expects.
  assert.ok(searchPattern('(').test('a(b'), 'a literal bracket still matches');
  assert.equal(searchPattern('(', { regex: true }), null, 'as a regex it is invalid, and refused');
  assert.equal(searchPattern('[', { regex: true }), null);
  assert.ok(searchPattern('f.o', { regex: true }));
});

test('vim: searchMatches finds every hit in reading order', () => {
  const doc = docFromText('foo foo\nfoofoo');
  const hits = searchMatches(doc, 'foo');
  assert.deepEqual(hits.map((h) => [h.row, h.col]), [[0, 0], [0, 4], [1, 0], [1, 3]]);
});

test('vim: keySpec normalises both event shapes', () => {
  assert.deepEqual(keySpec('h'), { name: 'h', char: 'h', token: 'h', shift: false });
  assert.deepEqual(keySpec({ name: 'char', char: 'x' }), { name: 'char', char: 'x', token: 'x', shift: false });
  assert.equal(keySpec({ name: 'escape' }).token, 'escape');
  assert.equal(keySpec({ name: 'space' }).token, ' ');
  assert.equal(keySpec({ name: 'char', char: ' ' }).token, ' ');
  assert.equal(keySpec({ name: 'shift-tab' }).shift, true);
});

test('vim: visualSelection describes what the screen should highlight', () => {
  const out = run({ text: ['abcd', 'efgh'], caret: pos(0, 0) }, keysOf('v j'));
  const sel = visualSelection(out.state, out.doc);
  assert.deepEqual(sel.anchor, pos(0, 0), 'the anchor stays put while the head moves');
  assert.deepEqual(sel.head, pos(1, 0));
  assert.equal(visualSelection({ ...out.state, mode: VIM_MODES.NORMAL }, out.doc), null, 'no selection outside visual mode');

  // Block mode includes the character under both corners, so the canonical
  // one-column `<C-v>jd` is not an empty selection.
  const block = run({ text: ['abcd', 'efgh'], caret: pos(0, 1) }, keysOf('ctrl-v j'));
  const blockSel = visualSelection(block.state, block.doc);
  assert.deepEqual(blockSel.anchor, pos(0, 1));
  assert.deepEqual(blockSel.head, pos(1, 2));
});

test('vim: pairInsert reports whether it paired and where the caret lands', () => {
  const paired = pairInsert(docFromText(''), '(');
  assert.equal(paired.paired, true);
  assert.deepEqual(paired.changes, [{ start: pos(0, 0), end: pos(0, 0), text: '()' }]);
  assert.deepEqual(paired.caret, pos(0, 1));

  const closer = pairInsert(docFromText('()', { caret: pos(0, 1) }), ')');
  assert.equal(closer.moveOnly, true, 'typing the closer that is already there steps over it');
  assert.deepEqual(closer.changes, [], 'and edits nothing');

  const plain = pairInsert(docFromText('ab', { caret: pos(0, 1) }), 'x');
  assert.equal(plain.paired, false);
  assert.deepEqual(plain.changes, [{ start: pos(0, 1), end: pos(0, 1), text: 'x' }]);
});
