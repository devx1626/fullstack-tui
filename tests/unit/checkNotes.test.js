import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDuration, mentionedTokens, checkNotes } from '../../src/core/checkNotes.js';

test('formatDuration: ms, seconds, minutes', () => {
  assert.equal(formatDuration(0), '0 ms');
  assert.equal(formatDuration(820), '820 ms');
  assert.equal(formatDuration(12400), '12.4s');
  assert.equal(formatDuration(74000), '1m 14s');
  assert.equal(formatDuration(NaN), '');
  assert.equal(formatDuration(-5), '');
});

test('mentionedTokens finds classes, ids and tags', () => {
  const tokens = mentionedTokens('expected .card to have a border, and #hero or <h1> missing');
  assert.deepEqual(tokens, [
    { kind: 'class', name: 'card' },
    { kind: 'id', name: 'hero' },
    { kind: 'tag', name: 'h1' },
  ]);
});

test('mentionedTokens ignores dots inside words (index.html is not a class)', () => {
  const tokens = mentionedTokens('link to index.html from the nav');
  assert.deepEqual(tokens, []);
});

test('checkNotes: a thrown error comes first', () => {
  const notes = checkNotes({
    results: [{ ok: false, message: 'expected .card to exist' }],
    logs: ['ReferenceError: x is not defined'],
    code: 'console.log(x)',
  });
  assert.equal(notes[0].kind, 'warn');
  assert.match(notes[0].text, /ReferenceError/);
});

test('checkNotes: names things the failing checks mention that are absent from the code', () => {
  const notes = checkNotes({
    results: [
      { ok: false, message: 'expected .card to have a border' },
      { ok: false, message: 'no <h2> found' },
      { ok: true, message: 'fine' },
    ],
    code: '<div class="card">hi</div>',
  });
  const texts = notes.map((n) => n.text).join('\n');
  // `class="card"` counts as present, so the only note is the missing <h2>.
  assert.equal(notes.length, 1);
  assert.doesNotMatch(texts, /card/);
  assert.match(texts, /`<h2>` never appears/);
});

test('checkNotes: markup satisfies a selector mentioned in a check', () => {
  const notes = checkNotes({
    results: [{ ok: false, message: 'expected #hero to be the first section' }],
    code: '<section id="hero"></section>',
  });
  assert.deepEqual(notes, []);
});

test('checkNotes: an untouched starter says so', () => {
  const notes = checkNotes({
    results: [{ ok: false, message: 'nope' }],
    code: '  <h1>Hi</h1>  ',
    starter: '<h1>Hi</h1>',
  });
  assert.equal(notes.length, 1);
  assert.match(notes[0].text, /still the starter code/);
});

test('checkNotes: honesty notes only on a pass, and the solution beats hints', () => {
  const passed = [{ ok: true }];
  assert.deepEqual(checkNotes({ results: passed }), []);
  assert.match(checkNotes({ results: passed, hintsShown: 2 })[0].text, /2 hints used/);
  const withSolution = checkNotes({ results: passed, hintsShown: 2, solutionShown: true });
  assert.equal(withSolution.length, 1);
  assert.match(withSolution[0].text, /solution on screen/);
  assert.doesNotMatch(withSolution[0].text, /hints/);
});

test('checkNotes: caps the missing-token notes at three', () => {
  const notes = checkNotes({
    results: [{
      ok: false,
      message: '.a .b .c .d .e are all missing',
    }],
    code: '',
  });
  assert.equal(notes.filter((n) => n.kind === 'info').length, 3);
});

test('checkNotes: no notes for a plain failing run with nothing to add', () => {
  const notes = checkNotes({
    results: [{ ok: false, message: 'the heading should be an h1' }],
    code: '<h1>ok</h1>',
  });
  assert.deepEqual(notes, []);
});
