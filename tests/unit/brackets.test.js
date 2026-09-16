import test from 'node:test';
import assert from 'node:assert/strict';
import { maskCode, matchBracket } from '../../src/core/brackets.js';

test('maskCode blanks strings and comments but keeps length and newlines', () => {
  const src = 'const a = "}"; // }\n/* } */\n{ ok: 1 }';
  const masked = maskCode(src);
  assert.equal(masked.length, src.length);
  assert.equal((masked.match(/\n/g) || []).length, (src.match(/\n/g) || []).length);
  assert.equal(masked.includes('"'), false);
  // Only the two structural braces survive.
  assert.equal((masked.match(/\{/g) || []).length, 1);
  assert.equal((masked.match(/\}/g) || []).length, 1);
});

test('maskCode handles html comments and escaped quotes', () => {
  const masked = maskCode("<!-- } -->\n<p title='a\\'}'></p>");
  assert.equal((masked.match(/\}/g) || []).length, 0);
});

test('matchBracket: forward from an opener, caret after the char', () => {
  const src = 'f(a[0])';
  const res = matchBracket(src, 2); // caret right after '('
  assert.equal(res.index, 6);
  assert.equal(res.char, '(');
  assert.equal(res.partner, ')');
  assert.equal(res.unmatched, false);
});

test('matchBracket: backward from a closer', () => {
  const src = 'f(a[0])';
  assert.equal(matchBracket(src, 7).index, 1); // after the final ')'
  assert.equal(matchBracket(src, 5).index, 3); // after ']'
});

test('matchBracket: nested same-kind pairs resolve to the right partner', () => {
  const src = '{ a: { b: 1 } }';
  const res = matchBracket(src, 1); // caret after the outer '{'
  assert.equal(res.index, src.lastIndexOf('}'));
  assert.equal(matchBracket(src, 6).index, 12); // after the inner '{'
});

test('matchBracket: mixed nesting does not confuse pairs', () => {
  const src = 'f([{}([])])';
  assert.equal(matchBracket(src, 1).index, 10); // '(' → last ')'
  assert.equal(matchBracket(src, 2).index, 9);  // '[' → last ']'
  assert.equal(matchBracket(src, 4).index, 3);  // '}' → the '{' before it
});

test('matchBracket: braces inside strings and comments are not partners', () => {
  const css = '.a { content: "}"; }';
  const res = matchBracket(css, 3); // after '{'
  assert.equal(res.index, css.length - 1);
  const js = '{ /* } */ }';
  assert.equal(matchBracket(js, 1).index, 10);
});

test('matchBracket: an unmatched bracket is reported, not guessed', () => {
  const res = matchBracket('function f() {', 14);
  assert.deepEqual(res, { index: -1, char: '{', partner: '}', unmatched: true });
});

test('matchBracket: caret not on a bracket returns null', () => {
  assert.equal(matchBracket('plain text', 4), null);
  assert.equal(matchBracket('', 0), null);
  assert.equal(matchBracket('a(b)', 99) !== null, true); // clamps, still finds ')'
});
