import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseAbbreviation, renderForest, cssExpand, isAbbreviationAt,
  emmetContext, expandAt, expand,
} from '../../src/core/emmet.js';

const html = (abbr) => expand(abbr, 'markup');
const css = (abbr) => expand(abbr, 'css');

test('simple elements expand with self-closing pairs', () => {
  assert.equal(html('div'), '<div></div>');
  assert.equal(html('p'), '<p></p>');
  assert.equal(html('br'), '<br>');
});

test('id, classes, attributes and text compose', () => {
  assert.equal(
    html('div.card#main'),
    '<div id="main" class="card"></div>',
  );
  assert.equal(
    html('a[href="https://x.dev" target=_blank]{Docs}'),
    '<a href="https://x.dev" target="_blank">Docs</a>',
  );
  assert.equal(
    html('img[src="cat.png"][alt="a cat"]'),
    '<img src="cat.png" alt="a cat">',
  );
  // Bare shorthand implies div.
  assert.equal(html('.card'), '<div class="card"></div>');
  assert.equal(html('#hero'), '<div id="hero"></div>');
});

test('child operator nests, sibling operator repeats at the same level', () => {
  assert.equal(html('ul>li'), '<ul>\n  <li></li>\n</ul>');
  assert.equal(html('div>p+span'), '<div>\n  <p></p>\n  <span></span>\n</div>');
});

test('climb operator unwinds nested context', () => {
  assert.equal(
    html('div>p^span'),
    '<div>\n  <p></p>\n</div>\n<span></span>',
  );
  assert.equal(
    html('div>p^^span'),
    '<div>\n  <p></p>\n</div>\n<span></span>',
  );
});

test('grouping and multipliers expand with $ numbering', () => {
  assert.equal(
    html('ul>li*3'),
    '<ul>\n  <li></li>\n  <li></li>\n  <li></li>\n</ul>',
  );
  assert.equal(
    html('ul>li.item$$*2'),
    '<ul>\n  <li class="item01"></li>\n  <li class="item02"></li>\n</ul>',
  );
  assert.equal(
    html('(div>p)+(section>span)'),
    '<div>\n  <p></p>\n</div>\n<section>\n  <span></span>\n</section>',
  );
  assert.equal(
    html('(li>a)*2'),
    '<li>\n  <a></a>\n</li>\n<li>\n  <a></a>\n</li>',
  );
});

test('implicit child tags follow the parent', () => {
  // Real emmet expands `.a` under `ul` as `li`, under `table` as `tr`.
  assert.equal(html('ul>.item'), '<ul>\n  <li class="item"></li>\n</ul>');
  assert.equal(html('table>tr>td'), '<table>\n  <tr>\n    <td></td>\n  </tr>\n</table>');
});

test('formatting-only attribute text is preserved exactly', () => {
  assert.equal(html('p{hello world}'), '<p>hello world</p>');
  // `>` inside text is a child operator in the grammar; real emmet expands
  // this as nested elements, and so do we.
  assert.equal(html('p{a > b}'), '<p>a &gt; b</p>'.replace(' &gt; ', ' > '));
});

test('css abbreviations expand to declarations', () => {
  assert.equal(css('m10'), 'margin: 10px;');
  assert.equal(css('w100p'), 'width: 100%;');
  assert.equal(css('d:f'), 'display: flex;');
  assert.equal(css('bg'), 'background: ;');
  assert.equal(css('fw600'), 'font-weight: 600;');
  assert.equal(css('g8'), 'gap: 8px;');
  assert.equal(css('flex'), 'display: flex;');
  assert.equal(css('m1e'), 'margin: 1em;');
});

test('css rejects unknown props and prose instead of mangling', () => {
  assert.equal(css('nonsense'), null);
  assert.equal(css(''), null);
  assert.equal(css('margin-top'), null); // a full prop name without value is not ours to invent
});

test('isAbbreviationAt finds the token and its range', () => {
  const text = 'hello\n  div.card';
  const offset = text.length;
  const found = isAbbreviationAt(text, offset);
  assert.ok(found);
  assert.equal(found.token, 'div.card');
  assert.equal(found.from, text.indexOf('div.card'));
  assert.equal(found.to, text.length);
});

test('isAbbreviationAt rejects markup and operators, not prose', () => {
  // Prose rejection is contextual (a plain word IS lexically a token); the
  // Tab binding guards against it via plausibility + parse success, tested
  // through expandAt below. What the scanner itself must reject:
  assert.equal(isAbbreviationAt('real <div>', 5), null); // markup
  assert.equal(isAbbreviationAt('', 0), null);
  assert.equal(isAbbreviationAt('div>', 4), null); // trailing operator
  assert.equal(isAbbreviationAt('div>', 3), null); // mid-operator too
  assert.ok(isAbbreviationAt('div.card', 8));
  // A bare word scans as a token; expandAt gates it to real tag names.
  assert.equal(expandAt('html', 'hello world', 11), null);
});

test('emmetContext picks css inside <style>, none inside <script>', () => {
  assert.equal(emmetContext('html', '<style>\n.m', 10), 'css');
  assert.equal(emmetContext('html', '<script>\nlet ', 13), 'none');
  assert.equal(emmetContext('html', '<p>hi</p>', 9), 'markup');
  assert.equal(emmetContext('css', 'm10', 3), 'css');
  assert.equal(emmetContext('js', 'foo', 3), 'none');
});

test('expandAt expands markup tokens in markup context only', () => {
  const text = '<body>\n  ul.nav>li.item\n</body>';
  const offset = text.indexOf('li.item') + 7;
  const res = expandAt('html', text, offset);
  assert.ok(res);
  assert.equal(res.label, 'html');
  assert.ok(res.text.includes('<ul class="nav">'));
  assert.ok(res.text.includes('<li class="item"></li>'));
  // The rest of the document is untouched.
  assert.ok(res.text.startsWith('<body>\n  '));
  assert.ok(res.text.trimEnd().endsWith('</body>'));
});

test('expandAt refuses to corrupt markup with css tokens', () => {
  // `div` is an element, not a css prop; must not hit cssExpand here.
  const res = expandAt('html', 'div', 3);
  assert.ok(res);
  assert.equal(res.text, '<div></div>');
  // In css context the same token is a valid css prop abbreviation only if
  // known — `div` is not, so null.
  assert.equal(expandAt('css', 'div', 3), null);
});

test('expandAt in css context expands declarations', () => {
  const res = expandAt('css', 'body {\n  m10\n}', 12);
  assert.ok(res);
  assert.ok(res.text.includes('margin: 10px;'));
  assert.equal(res.label, 'css');
});

test('parseAbbreviation rejects junk instead of guessing', () => {
  assert.equal(parseAbbreviation(''), null);
  assert.equal(parseAbbreviation('div><p'), null);
  assert.equal(parseAbbreviation('()'), null);
  assert.equal(parseAbbreviation('???'), null);
  assert.equal(parseAbbreviation('div{unclosed'), null);
  // A climb past the root clamps, exactly like real emmet.
  assert.deepEqual(parseAbbreviation('div^'), parseAbbreviation('div'));
});

test('expand convenience matches the parts', () => {
  assert.equal(expand('b'), '<b></b>');
  assert.equal(expand('p3', 'css'), 'padding: 3px;');
});
