/**
 * Completions v2 tests (overhaul §8.9, task 2.7).
 * Run: node --test tests/unit/completions.test.js
 *
 * Acceptance: "Trigger-table tests (Ctrl+Space, ≥2-char auto, `<`/`:`/`@`
 * starters — classic parity); snippet caret placement tests; popup snapshot".
 *
 * Classic parity is asserted against the classic engine directly: for each
 * language the merged list must still contain everything `completionsFor`
 * returns, because the next-UI list ADDS data rather than replacing it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { completionsFor } from '../../src/core/complete.js';
import { applyEdit, docFromText, docText, offsetOf, pos } from '../../src/editor/document.js';
import {
  BOOLEAN_ATTRS, SIGNATURES, acceptItem, activeParamIndex, completionsAt, createPopup,
  cycleSignature, extraItems, familyOf, findOpenParen, lineWord, minimalChange, nextStop,
  pairBackspaceChanges, popupClick, popupItem, popupKey, popupRefilter, shouldTrigger,
  signatureAt, smartInsertChanges, snippetStops, tabStopsFor, wordsIn,
} from '../../src/editor/completions.js';
import { HTML_ENTITIES } from '../../src/editor/data/html.js';
import { CSS_AT_RULES, CSS_PSEUDO_CLASSES } from '../../src/editor/data/css.js';
import { JSX_HOOKS, JSX_PROPS } from '../../src/editor/data/jsx.js';

const doc = (text, caret) => docFromText(text, { caret });

// ---------------------------------------------------------------------------
// Trigger policy
// ---------------------------------------------------------------------------

test('completions: the trigger table matches §8.9', async (t) => {
  await t.test('Ctrl+Space always opens it', () => {
    assert.equal(shouldTrigger({ manual: true, lang: 'js' }), true);
    assert.equal(shouldTrigger({ manual: true, prefix: '', ch: '' }), true);
  });
  await t.test('two characters auto-open it', () => {
    assert.equal(shouldTrigger({ ch: 'n', prefix: 'co', lang: 'js' }), true);
    assert.equal(shouldTrigger({ ch: 'n', prefix: 'c', lang: 'js' }), false, 'one letter is not a trigger');
    assert.equal(shouldTrigger({ ch: '', prefix: '', lang: 'js' }), false);
  });
  await t.test('the structural starters open it', () => {
    assert.equal(shouldTrigger({ ch: '<', prefix: '<', lang: 'html' }), true);
    assert.equal(shouldTrigger({ ch: ':', prefix: 'display:', lang: 'css' }), true);
    assert.equal(shouldTrigger({ ch: '@', prefix: '@', lang: 'css' }), true);
    assert.equal(shouldTrigger({ ch: '<', prefix: '<', lang: 'js' }), true, 'JSX opening tag / decorator');
  });
  await t.test('a string is not a trigger context', () => {
    assert.equal(shouldTrigger({ ch: 'b', prefix: 'ab', lang: 'js', insideString: true }), false);
  });
});

test('completions: jsx/tsx belong to the js family but keep their own data', () => {
  assert.equal(familyOf('html'), 'markup');
  assert.equal(familyOf('jsx'), 'js');
  assert.equal(familyOf('TSX'), 'js');
  assert.equal(familyOf(undefined), 'text');
  assert.ok(extraItems('jsx', 'useS').some((i) => i.label === 'useState'));
  assert.equal(extraItems('js', 'useS').length, 0, 'plain js does not get React data');
});

// ---------------------------------------------------------------------------
// The data superset
// ---------------------------------------------------------------------------

test('completions: the extras the classic engine lacks are present', () => {
  assert.ok(extraItems('html', '&am').some((i) => i.label === '&amp;'));
  assert.ok(extraItems('html', '').length >= HTML_ENTITIES.length);
  assert.ok(extraItems('css', ':ho').some((i) => i.label === ':hover'));
  assert.ok(extraItems('css', ':ho').some((i) => i.label.startsWith(':')));
  assert.ok(extraItems('css', '@m').some((i) => i.label === '@media'));
  assert.ok(extraItems('css', 'var(').some((i) => i.label === 'var(--brand)'));
  assert.ok(extraItems('jsx', 'className').some((i) => i.label === 'className'));
  assert.ok(extraItems('jsx', 'onC').some((i) => i.label === 'onClick'));
  assert.ok(extraItems('jsx', 'Fragment').some((i) => i.insert.endsWith('/>')));
  assert.ok(extraItems('css', '').length >= CSS_PSEUDO_CLASSES.length + CSS_AT_RULES.length);
  assert.ok(extraItems('jsx', '').length >= JSX_HOOKS.length + JSX_PROPS.length);
  assert.ok(BOOLEAN_ATTRS.has('required'));
});

test('completions: the merged list still contains everything classic returned', () => {
  const text = '<di';
  const classic = completionsFor('html', text, text.length);
  const out = completionsAt(doc(text, pos(0, 3)), { lang: 'html' });
  const labels = new Set(out.items.map((i) => i.label));
  for (const item of classic.items) {
    assert.ok(labels.has(item.label), `classic item ${item.label} survived the merge`);
  }
  assert.ok(out.items.some((i) => i.label === '&amp;') === false, 'entities stay behind their own prefix');
});

test('completions: an entity prefix offers entities', () => {
  const out = completionsAt(doc('&am', pos(0, 3)), { lang: 'html' });
  assert.ok(out.items.some((i) => i.label === '&amp;'));
  assert.equal(out.prefix, '&am');
});

test('completions: completionsAt reports document positions, not offsets', () => {
  const d = doc('line one\ncon', pos(1, 3));
  const out = completionsAt(d, { lang: 'js' });
  assert.deepEqual(out.from, pos(1, 0));
  assert.deepEqual(out.to, pos(1, 3));
  assert.equal(out.prefix, 'con');
});

test('completions: an empty prefix with no engine answer still yields document words', () => {
  const d = doc('const alpha = alphaValue;', pos(0, 24));
  const words = wordsIn(d, 'alph');
  assert.deepEqual(words, ['alpha', 'alphaValue']);
  assert.equal(lineWord('x = foo', 8), 'foo');
  assert.equal(lineWord('x = ', 4), '');
});

test('completions: lineWord keeps entity and selector prefixes together', () => {
  assert.equal(lineWord('a &am', 5), '&am');
  assert.equal(lineWord('a:hover', 7), 'a:hover');
  assert.equal(lineWord('<div class="', 12), '');
});

// ---------------------------------------------------------------------------
// Snippets and tab stops
// ---------------------------------------------------------------------------

test('completions: a snippet carries ordered, deduped tab stops', () => {
  // `name` at 9, `args` at 14, and the block interior just after `{\n` at 22.
  assert.deepEqual(snippetStops('function name(args) {\n  \n}'), [9, 14, 22]);
  assert.deepEqual(snippetStops(''), []);
  assert.deepEqual(snippetStops('console.log()'), [12], 'the stop is inside the parens');
  assert.ok(snippetStops('for (let i = 0; i < n; i += 1) {\n  \n}').length >= 2);
});

test('completions: accepting a snippet places the caret at the first stop', () => {
  const d = doc('qsel', pos(0, 4));
  const list = completionsAt(d, { lang: 'js', prefixOverride: 'qsel' });
  const popup = createPopup(list);
  const item = { label: 'fn', kind: 'snip', insert: 'function name(args) {\n  \n}' };
  const accepted = acceptItem(d, popup, item);
  assert.equal(accepted.changes.length, 1, 'one change, one undo step');
  const { doc: after, caret } = applyEdit(d, accepted.changes, accepted.caret);
  assert.equal(docText(after), 'function name(args) {\n  \n}');
  assert.deepEqual(caret, pos(0, 9), 'the caret lands on `name`, the first stop');
  assert.ok(accepted.stops.length >= 2);
});

test('completions: Tab walks the stops and stops at the last one', () => {
  const stops = [pos(0, 1), pos(0, 5), pos(0, 9)];
  assert.deepEqual(nextStop(stops, pos(0, 1)), pos(0, 5));
  assert.deepEqual(nextStop(stops, pos(0, 9)), pos(0, 9), 'no wrap past the end');
  assert.deepEqual(nextStop(stops, pos(1, 3)), pos(0, 1), 'an unknown caret starts at the first');
  assert.equal(nextStop([], pos(0, 0)), null);
});

test('completions: accepting an identifier replaces the typed prefix only', () => {
  const d = doc('const x = document.que', pos(0, 22));
  const list = completionsAt(d, { lang: 'js' });
  const popup = createPopup(list);
  const item = { label: 'querySelector', kind: 'fn', insert: 'querySelector' };
  const accepted = acceptItem(d, popup, item);
  const { doc: after, caret } = applyEdit(d, accepted.changes, accepted.caret);
  assert.equal(docText(after), 'const x = document.querySelector');
  assert.deepEqual(caret, pos(0, 'const x = document.querySelector'.length));
});

test('completions: classic auto-pairing arrives as a minimal change', () => {
  const d = doc('a', pos(0, 1));
  const changes = smartInsertChanges(d, '(', 'js');
  assert.ok(changes, 'an opening bracket pairs');
  assert.deepEqual(changes.changes, [{ start: pos(0, 1), end: pos(0, 1), text: '()' }]);
  assert.deepEqual(changes.caret, pos(0, 2));
  assert.equal(smartInsertChanges(d, 'x', 'js'), null, 'a plain character needs no reflex');

  const tag = doc('<div', pos(0, 4));
  const closed = smartInsertChanges(tag, '>', 'html');
  assert.equal(docText(applyEdit(tag, closed.changes, closed.caret).doc), '<div></div>');
});

test('completions: pairBackspace removes an empty pair as one change', () => {
  const d = doc('f()', pos(0, 2));
  const out = pairBackspaceChanges(d);
  assert.deepEqual(out.changes, [{ start: pos(0, 1), end: pos(0, 3), text: '' }]);
  assert.equal(docText(applyEdit(d, out.changes, out.caret).doc), 'f');
  assert.equal(pairBackspaceChanges(doc('f(x)', pos(0, 2))), null);
});

test('completions: minimalChange finds the smallest edit', () => {
  const d = doc('hello world\nsecond');
  assert.deepEqual(minimalChange(d, 'hello brave world\nsecond'), {
    start: pos(0, 6), end: pos(0, 6), text: 'brave ',
  });
  assert.deepEqual(minimalChange(d, 'hello world\nsecond!'), {
    start: pos(1, 6), end: pos(1, 6), text: '!',
  });
  assert.deepEqual(minimalChange(d, 'hello world'), {
    start: pos(0, 11), end: pos(1, 6), text: '',
  });
  assert.equal(offsetOf(d, pos(1, 0)), 12);
});

// ---------------------------------------------------------------------------
// The popup state machine
// ---------------------------------------------------------------------------

test('completions: the popup selects, wraps, accepts and dismisses', () => {
  const list = completionsAt(doc('<di', pos(0, 3)), { lang: 'html' });
  const popup = createPopup(list);
  assert.equal(popup.selected, 0);
  assert.match(popupItem(popup).label, /^di/, 'the engine ranks the prefix matches first');
  assert.ok(list.items.some((i) => i.label === 'div'));

  const down = popupKey(popup, 'down');
  assert.equal(down.action, 'move');
  assert.equal(down.popup.selected, 1);
  assert.equal(popupKey(down.popup, 'up').popup.selected, 0);
  assert.equal(popupKey(popup, 'up').popup.selected, list.items.length - 1, 'wraps upward');

  assert.equal(popupKey(popup, 'enter').action, 'accept');
  assert.equal(popupKey(popup, 'tab').action, 'accept');
  assert.deepEqual(popupKey(popup, 'escape'), { popup: null, action: 'dismiss' });
  assert.equal(popupKey(popup, 'x').action, 'ignored');
  assert.equal(popupKey(popup, 'ctrl-n').popup.selected, 1);
  assert.equal(popupKey(popup, 'ctrl-p').popup.selected, list.items.length - 1);
  assert.equal(popupKey(null, 'down').action, 'ignored');
});

test('completions: a mouse click takes the same path as the keyboard', () => {
  const list = completionsAt(doc('<in', pos(0, 3)), { lang: 'html' });
  const popup = createPopup(list);
  const click = popupClick(popup, 1);
  assert.equal(click.action, 'accept');
  assert.equal(popupItem(click.popup).label, list.items[1].label);
  assert.equal(popupClick(popup, 99).action, 'ignored');
});

test('completions: typing another character refilters the popup', () => {
  const list = completionsAt(doc('<d', pos(0, 2)), { lang: 'html' });
  const popup = createPopup(list);
  const refiltered = popupRefilter(popup, doc('<di', pos(0, 3)), 'html');
  assert.equal(refiltered.selected, 0);
  assert.ok(refiltered.items.some((i) => i.label === 'div'));
  assert.equal(popupRefilter(null, doc('x', pos(0, 1)), 'js'), null);
});

test('completions: an empty item list produces no popup at all', () => {
  assert.equal(createPopup(null), null);
  assert.equal(createPopup({ items: [] }), null);
  assert.equal(createPopup({ items: [], from: pos(0, 0), to: pos(0, 0) }), null);
});

// ---------------------------------------------------------------------------
// Signature help
// ---------------------------------------------------------------------------

test('completions: signature help recognises DOM and builtin calls', () => {
  const d = doc('document.querySelector(', pos(0, 23));
  const sig = signatureAt(d);
  assert.equal(sig.name, 'document.querySelector');
  assert.deepEqual(sig.params, ['selectors']);
  assert.equal(sig.activeParam, 0);
  assert.match(sig.sig, /querySelector\(selectors\)/);
});

test('completions: the active parameter counts commas at the call depth only', () => {
  const text = 'fetch(url, [a, b], ';
  assert.equal(activeParamIndex(text, text.indexOf('('), text.length), 2);
  assert.equal(activeParamIndex('f(a)', 1, 4), 0);
  assert.equal(activeParamIndex('f(a, b, c)', 1, 11), 2);
  const nested = 'outer(inner(a, b), ';
  assert.equal(activeParamIndex(nested, nested.indexOf('('), nested.length), 1);
});

test('completions: the opening paren must belong to the same statement', () => {
  assert.equal(findOpenParen('let x = f(', 11), 9);
  assert.equal(findOpenParen('let x = 1;\nfoo(', 15), 14, 'a newline before the call is fine');
  assert.equal(findOpenParen('done(); now ', 13), null);
  assert.equal(findOpenParen('a(b) ', 5), null, 'that call is already closed');
});

test('completions: an unknown call has no signature, and overloads cycle', () => {
  assert.equal(signatureAt(doc('mysteryFn(', pos(0, 10))), null);
  assert.equal(signatureAt(doc('no call here', pos(0, 12))), null);
  assert.equal(typeof SIGNATURES.useState.sig, 'string');
  assert.ok(cycleSignature('useState', 0));
  assert.equal(cycleSignature('nope'), null);
});

test('completions: a css selector prefix gets the pseudo data', () => {
  const out = completionsAt(doc('a:ho', pos(0, 4)), { lang: 'css' });
  assert.ok(out.items.some((i) => i.label === ':hover'));
  assert.equal(out.family, 'css');
});

test('completions: a css property prefix still gets the classic property list', () => {
  const out = completionsAt(doc('  dis', pos(0, 5)), { lang: 'css' });
  assert.ok(out.items.some((i) => i.label === 'display'));
});

test('completions: a finished selector offers nothing, and says so', () => {
  assert.equal(completionsAt(doc('a:hover', pos(0, 7)), { lang: 'css' }), null);
});
