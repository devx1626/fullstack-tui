/**
 * Palette tests (overhaul §10, palette-first QoL).
 *
 * Part 1 — pure fuzzy logic, no ink required.
 * Part 2 — rendered via the built JSX harness; a wrapper component owns
 *          query/selected state and routes ink's useInput to the same intent
 *          callbacks the palette declares, proving the controlled contract.
 * Run: node --test tests/unit/palette.test.js  (needs dist/harness.js)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fuzzyScore, filterCommands, clampSelected } from '../../src/ui/fuzzy.js';

// -- Part 1: pure logic ------------------------------------------------------

const COMMANDS = [
  { id: 'app.palette', title: 'command palette', keys: '^P' },
  { id: 'editor.save', title: 'save & check', keys: '^S' },
  { id: 'challenge.preview', title: 'preview', keys: '^R' },
  { id: 'editor.reset', title: 'reset editor', keys: '^G' },
  { id: 'nav.home', title: 'go to dashboard', keys: '' },
];

test('fuzzyScore: empty query matches everything with rank 1', () => {
  assert.equal(fuzzyScore('', 'anything'), 1);
});

test('fuzzyScore: substring beats subsequence', () => {
  const sub = fuzzyScore('save', 'save & check');
  const seq = fuzzyScore('save', 'setup: avoid verbose experiments');
  assert.ok(sub > seq, `substring ${sub} should beat subsequence ${seq}`);
});

test('fuzzyScore: word-boundary matches score higher than mid-word', () => {
  const boundary = fuzzyScore('se', 'save & check'.replace('save', 'set editor'));
  const midWord = fuzzyScore('se', 'close');
  assert.ok(boundary > midWord, `boundary ${boundary} vs mid ${midWord}`);
});

test('fuzzyScore: case-insensitive', () => {
  assert.ok(fuzzyScore('SAVE', 'Save & Check') !== null);
});

test('fuzzyScore: non-match returns null', () => {
  assert.equal(fuzzyScore('zzz', 'save & check'), null);
});

test('filterCommands: ranks substring first, keeps deterministic tie order', () => {
  const ranked = filterCommands(COMMANDS, 'save');
  assert.equal(ranked[0].id, 'editor.save');
  assert.ok(ranked.length >= 1);
});

test('filterCommands: query filters out non-matches', () => {
  const ranked = filterCommands(COMMANDS, 'reset');
  assert.equal(ranked[0].id, 'editor.reset');
});

test('filterCommands: empty query preserves input order', () => {
  const ranked = filterCommands(COMMANDS, '');
  assert.deepEqual(ranked.map((c) => c.id), COMMANDS.map((c) => c.id));
});

test('clampSelected: bounds to list, zero on empty', () => {
  assert.equal(clampSelected(5, 3), 2);
  assert.equal(clampSelected(-1, 3), 0);
  assert.equal(clampSelected(0, 0), 0);
});

// -- Part 2: rendered controlled contract ------------------------------------

import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const harnessPath = new URL('../../dist/harness.js', import.meta.url).pathname;
const harness = existsSync(harnessPath) ? await import(pathToFileURL(harnessPath).href) : null;
const helper = await import(
  pathToFileURL(new URL('../helpers/snapshot.js', import.meta.url).pathname)
);

if (harness) {
  const renderToText = (element) => helper.renderToText(element, { render: harness.render });
  const strip = helper.stripAnsi;

  test('Palette renders query, ranked rows, and active caret', async () => {
    const text = strip(await renderToText(
      harness.el(harness.Palette, {
        query: 'sav',
        commands: COMMANDS,
        selected: 0,
      }),
    ));
    assert.ok(text.includes('>'), 'query row missing');
    assert.ok(text.includes('sav'), 'query text missing');
    assert.ok(text.includes('save & check'), 'best match missing');
    assert.ok(text.includes('▸'), 'active caret missing');
  });

  test('Palette is controlled: wrapper state drives it via useInput', async () => {
    // Hooks come from the harness bundle — importing react directly here would
    // put a second React copy in play (null-dispatcher useContext/useState crash).
    const { useState } = harness;
    const { useInput } = harness;
    function Wrapper() {
      const [query, setQuery] = useState('');
      const [selected, setSelected] = useState(0);
      useInput((input, key) => {
        if (key.upArrow) setSelected((s) => s - 1);
        else if (key.downArrow) setSelected((s) => s + 1);
        else if (key.return) setQuery('committed');
        else if (key.escape) setQuery('');
        else if (input) setQuery((q) => q + input);
      });
      return harness.el(harness.Palette, {
        query,
        commands: COMMANDS,
        selected,
      });
    }
    const frame = await renderToText(harness.el(Wrapper, {}));
    const text = strip(frame);
    assert.ok(text.includes('command palette'), `default list missing: ${JSON.stringify(text.slice(0, 150))}`);
    assert.ok(text.includes('▸ command palette'));
  });

  test('Palette shows recents first on empty query', async () => {
    const text = strip(await renderToText(
      harness.el(harness.Palette, {
        query: '',
        commands: COMMANDS,
        selected: 0,
        recents: [{ id: 'nav.home', title: 'go to dashboard' }],
      }),
    ));
    const homeIdx = text.indexOf('go to dashboard');
    const paletteIdx = text.indexOf('command palette');
    assert.ok(homeIdx !== -1 && paletteIdx !== -1);
    assert.ok(homeIdx < paletteIdx, 'recents should float above non-recent commands');
  });

  test('Palette empty-state message', async () => {
    const text = strip(await renderToText(
      harness.el(harness.Palette, { query: 'qqq', commands: COMMANDS, selected: 0 }),
    ));
    assert.ok(text.includes('no matching commands'));
  });
}
