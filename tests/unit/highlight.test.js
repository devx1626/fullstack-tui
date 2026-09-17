/**
 * Highlighter tests (overhaul task 2.8a).
 * Run: node --test tests/unit/highlight.test.js
 *
 * The tokenizer rules are PORTED from src/tui/widgets.js, so the behavioral
 * acceptance is: same input line → same role sequence the classic one gives
 * (spot-checked against its rule tables), plus the editor-specific parts:
 * stateful multi-line comments, LRU cache, window highlighting.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveLang,
  createHighlightState,
  tokenizeLine,
  highlightLine,
  createHighlightCache,
  cacheKey,
  cachedLine,
  highlightWindow,
} from '../../src/editor/highlight.js';

const THEME = {
  id: 'test',
  comment: 'c', keyword: 'k', string: 's', number: 'n',
  accent: 'a', accentSoft: 'a2', star: 'st',
};

test('resolveLang maps aliases and falls back to text', () => {
  assert.equal(resolveLang('javascript'), 'js');
  assert.equal(resolveLang('TS'), 'js');
  assert.equal(resolveLang('bash'), 'sh');
  assert.equal(resolveLang('yml'), 'yaml');
  assert.equal(resolveLang('dockerfile'), 'docker');
  assert.equal(resolveLang('python'), 'py');
  assert.equal(resolveLang('made-up'), 'text');
  assert.equal(resolveLang(undefined), 'text');
});

test('tokenizeLine: js keywords, strings, comments, numbers', () => {
  const toks = tokenizeLine("const x = 'hi'; // note", 'js', createHighlightState());
  const role = (t) => (t.token === null ? '-' : t.token);
  // Consecutive plain characters merge into ONE token (that is the tokenizer's
  // output shape; the classic widget does the same).
  assert.deepEqual(toks.map(role), ['keyword', '-', 'string', '-', 'comment']);
  assert.deepEqual(toks.map((t) => t.text), ['const', ' x = ', "'hi'", '; ', '// note']);
});

test('tokenizeLine: comments carry italic, keywords bold', () => {
  const toks = tokenizeLine('// hi', 'js', createHighlightState());
  assert.equal(toks[0].italic, true);
  const kw = tokenizeLine('return 1', 'js', createHighlightState());
  assert.equal(kw[0].bold, true);
});

test('tokenizeLine: block comment threads state across lines', () => {
  const state = createHighlightState();
  const a = tokenizeLine('/* start', 'js', state);
  assert.equal(state.blockComment, true, 'opener with no closer leaves state open');
  assert.deepEqual(a.map((t) => t.token), ['comment']);

  const b = tokenizeLine('still inside */ code();', 'js', state);
  assert.equal(state.blockComment, false, 'closer ends the comment');
  // After the closer: plain space, then `code(` hits the function-call rule.
  assert.deepEqual(b.map((t) => t.token), ['comment', null, 'accent', null]);
  assert.equal(b[2].text, 'code');
});

test('tokenizeLine: a line wholly inside a comment is one comment token', () => {
  const state = createHighlightState();
  tokenizeLine('/* a', 'js', state);
  const mid = tokenizeLine('const fake = keyword;', 'js', state);
  assert.deepEqual(mid, [{ text: 'const fake = keyword;', token: 'comment', bold: false, italic: true }]);
});

test('tokenizeLine: unclosed string does not swallow the rest of the file', () => {
  const toks = tokenizeLine("const s = 'oops", 'js', createHighlightState());
  // The classic rule requires a closing quote; an unterminated one falls through
  // to plain text rather than colouring to end-of-line.
  assert.ok(toks.every((t) => t.token !== 'string'));
});

test('tokenizeLine: html tags, attrs and values', () => {
  const toks = tokenizeLine('<div class="box">x</div>', 'html', createHighlightState());
  const texts = toks.map((t) => t.text);
  assert.deepEqual(texts, ['<div', ' ', 'class', '=', '"box"', '>', 'x', '</div', '>']);
  assert.equal(toks[0].token, 'keyword');
  assert.equal(toks[2].token, 'accent');
  assert.equal(toks[4].token, 'string');
});

test('tokenizeLine: css units and custom properties', () => {
  const toks = tokenizeLine('--pad: 12rem; /* tweak */', 'css', createHighlightState());
  assert.deepEqual(
    toks.map((t) => t.text),
    ['--pad', ': ', '12rem', '; ', '/* tweak */'],
  );
});

test('tokenizeLine: python keywords and f-string prefixes', () => {
  const toks = tokenizeLine('def main(): return f"hi"', 'py', createHighlightState());
  assert.equal(toks[0].text, 'def');
  assert.equal(toks[0].token, 'keyword');
  assert.ok(toks.some((t) => t.text === 'f"hi"' && t.token === 'string'));
});

test('tokenizeLine: markdown headers and inline code', () => {
  // A header rule intentionally swallows the whole line (classic behaviour).
  const head = tokenizeLine('## Title `code`', 'md', createHighlightState());
  assert.deepEqual(head.map((t) => ({ text: t.text, token: t.token })), [
    { text: '## Title `code`', token: 'keyword' },
  ]);
  assert.equal(head[0].bold, true);

  // Without a header prefix, inline code and bold get their roles.
  const body = tokenizeLine('`code` and **bold**', 'md', createHighlightState());
  assert.deepEqual(body.map((t) => t.token), ['string', null, 'accentSoft']);
});

test('highlightLine resolves roles through a theme', () => {
  const segs = highlightLine('return', 'js', THEME, createHighlightState());
  assert.deepEqual(segs, [{ text: 'return', color: 'k', bold: true, italic: false }]);
});

test('highlightLine: unknown role name resolves to null, not a crash', () => {
  const segs = highlightLine('x', 'text', THEME, createHighlightState());
  assert.deepEqual(segs, [{ text: 'x', color: null, bold: false, italic: false }]);
});

// ---------------------------------------------------------------------------
// LRU cache
// ---------------------------------------------------------------------------

test('cache: hits move to the back, misses evict the oldest', () => {
  const cache = createHighlightCache({ capacity: 3 });
  cache.set('a', 'A');
  cache.set('b', 'B');
  cache.set('c', 'C');

  assert.equal(cache.get('a'), 'A', 'hit');
  cache.set('d', 'D'); // capacity exceeded → evicts 'b' (least recently used)
  assert.equal(cache.get('b'), null);
  assert.equal(cache.get('a'), 'A', 'survived because it was touched');
  assert.equal(cache.get('c'), 'C');
  assert.equal(cache.get('d'), 'D');
  assert.equal(cache.size, 3);
});

test('cache: set on an existing key refreshes without evicting', () => {
  const cache = createHighlightCache({ capacity: 2 });
  cache.set('a', 1);
  cache.set('b', 2);
  cache.set('a', 10); // refresh
  cache.set('c', 3); // evicts b
  assert.equal(cache.get('a'), 10);
  assert.equal(cache.get('b'), null);
});

test('cacheKey: differs per theme, lang, row, state and line', () => {
  assert.notEqual(cacheKey('t1', 'js', 0, false, 'x'), cacheKey('t2', 'js', 0, false, 'x'));
  assert.notEqual(cacheKey('t1', 'js', 0, false, 'x'), cacheKey('t1', 'css', 0, false, 'x'));
  assert.notEqual(cacheKey('t1', 'js', 0, false, 'x'), cacheKey('t1', 'js', 1, false, 'x'));
  assert.notEqual(cacheKey('t1', 'js', 0, false, 'x'), cacheKey('t1', 'js', 0, true, 'x'));
  assert.notEqual(cacheKey('t1', 'js', 0, false, 'x'), cacheKey('t1', 'js', 0, false, 'y'));
});

test('cachedLine: memoises by line content, theme id and comment state', () => {
  const cache = createHighlightCache({ capacity: 8 });
  const a = cachedLine(cache, THEME, 'js', 0, 'return 1;', false);
  assert.equal(cache.size, 1);
  const b = cachedLine(cache, THEME, 'js', 0, 'return 1;', false);
  assert.equal(b, a, 'same key → same (referentially equal) entry');
  const c = cachedLine(cache, { ...THEME, id: 'other' }, 'js', 0, 'return 1;', false);
  assert.notEqual(c, a, 'theme switch re-tokenises');
  assert.equal(cache.size, 2);

  // Inside a comment, the same text is one comment token → different cache
  // entry from the same text outside one. (Row 0 can never be "inside", so the
  // state-carrying entry is keyed at a row where that state is reachable.)
  const outside = cachedLine(cache, THEME, 'js', 3, 'return 1;', false);
  const inside = cachedLine(cache, THEME, 'js', 3, 'return 1;', true);
  assert.notEqual(inside, outside);
  assert.deepEqual(inside.tokens.map((t) => t.color), ['c']);
  assert.equal(inside.blockComment, true, 'no closer on the line → the comment stays open');
  assert.equal(cache.size, 4);
});

test('cachedLine: editing one line leaves the others cached', () => {
  const cache = createHighlightCache({ capacity: 8 });
  cachedLine(cache, THEME, 'js', 0, 'line0;', false);
  cachedLine(cache, THEME, 'js', 1, 'line1;', false);
  const before = cache.get(cacheKey(THEME.id, 'js', 0, false, 'line0;'));
  cachedLine(cache, THEME, 'js', 1, 'line1 edited;', false); // only row 1 changes
  assert.equal(cache.get(cacheKey(THEME.id, 'js', 0, false, 'line0;')), before);
  assert.equal(cache.size, 3);
});

// ---------------------------------------------------------------------------
// Window highlighting
// ---------------------------------------------------------------------------

function docOf(lines) {
  return { lines, EOL: '\n' };
}

test('highlightWindow: returns exactly the requested rows', () => {
  const doc = docOf(['const a = 1;', 'const b = 2;', 'const c = 3;', 'const d = 4;']);
  const rows = highlightWindow(doc, { top: 1, height: 2, lang: 'js', theme: THEME });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].map((t) => t.text), ['const', ' b = ', '2', ';']);
  assert.deepEqual(rows[1].map((t) => t.text), ['const', ' c = ', '3', ';']);
});

test('highlightWindow: clamps top and height past the end', () => {
  const doc = docOf(['a', 'b']);
  const rows = highlightWindow(doc, { top: 10, height: 5, lang: 'js', theme: THEME });
  assert.ok(rows.length <= 2);
});

test('highlightWindow: block comment open above the window still colours it', () => {
  const lines = [
    'const x = 1;',
    '/* multi',
    '   line',
    '   comment */',
    'const y = 2;',
    '/* again',
    '   open */ const z = 3;',
  ];
  const doc = docOf(lines);
  // View only rows 2–4 (inside/after the comment).
  const rows = highlightWindow(doc, { top: 2, height: 3, lang: 'js', theme: THEME });
  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows[0].map((t) => ({ text: t.text, color: t.color })),
    [{ text: '   line', color: 'c' }],
  );
  assert.deepEqual(
    rows[1].map((t) => ({ text: t.text, color: t.color })),
    [{ text: '   comment */', color: 'c' }],
  );
  // After the comment closes, code colours normally.
  assert.deepEqual(
    rows[2].map((t) => ({ text: t.text, color: t.color })),
    [{ text: 'const', color: 'k' }, { text: ' y = ', color: null }, { text: '2', color: 'n' }, { text: ';', color: null }],
  );
});

test('highlightWindow: comment that stays open past the window bottom', () => {
  const doc = docOf(['/* never', '   closed', 'const after = 1;']);
  const rows = highlightWindow(doc, { top: 0, height: 2, lang: 'js', theme: THEME });
  assert.ok(rows.every((row) => row.every((t) => t.color === 'c')));
});

test('highlightWindow: works with the cache and stays correct', () => {
  const lines = ['const a = 1;', '/* open', '   still open */ const b = 2;', 'const c = 3;'];
  const doc = docOf(lines);
  const cache = createHighlightCache({ capacity: 64 });
  const rows = highlightWindow(doc, { top: 0, height: 4, lang: 'js', theme: THEME, cache });
  assert.deepEqual(
    rows[2].map((t) => t.color),
    ['c', null, 'k', null, 'n', null],
  );
  // Second call serves from cache; must not differ.
  const again = highlightWindow(doc, { top: 0, height: 4, lang: 'js', theme: THEME, cache });
  assert.deepEqual(again, rows);
});

test('highlightWindow: cache matches the no-cache path exactly', () => {
  const lines = ['const a = 1;', '/* open', '   still open */ const b = 2;', 'const c = 3;'];
  const doc = docOf(lines);
  const plain = highlightWindow(doc, { top: 0, height: 4, lang: 'js', theme: THEME });
  const cached = highlightWindow(doc, { top: 0, height: 4, lang: 'js', theme: THEME, cache: createHighlightCache({ capacity: 16 }) });
  assert.deepEqual(cached, plain);
});
