/**
 * Footer & mode UX tests (overhaul task 2.10).
 * Run: node --test tests/unit/hints.test.js
 *
 * Acceptance anchors: hints are DERIVED from the registry (a hand-typed string
 * can never drift), the mode badge matches §9's styling, and the nudge has a
 * fixed text + 2 s budget. tools/check.js additionally lints every derived
 * binding through the real resolveKey.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CHALLENGE_HINT_IDS,
  footerHints,
  footerLine,
  keyLabel,
  modeBadge,
  NUDGE_TEXT,
  NUDGE_AFTER_MS,
} from '../../src/ui/hints.js';
import { COMMANDS } from '../../src/ui/commands.js';

test('keyLabel renders canonical human labels', () => {
  assert.equal(keyLabel('<C-s>'), 'Ctrl+S');
  assert.equal(keyLabel('<Esc>'), 'Esc');
  assert.equal(keyLabel('<C-A-left>'), 'Ctrl+Alt+Left');
  // A bare character keeps its case: `y`/`Y` and `g`/`G` are different vim
  // commands, so uppercasing them would make the footer wrong.
  assert.equal(keyLabel('y'), 'y');
  assert.equal(keyLabel('G'), 'G');
  assert.equal(keyLabel('<CR>'), 'Enter');
});

test('footerHints derives every challenge hint from the registry', () => {
  const hints = footerHints();
  // Every id resolved to a binding — no silent drops for typos.
  assert.equal(hints.length, CHALLENGE_HINT_IDS.length);
  const words = hints.map((h) => h.word);
  assert.deepEqual(words, ['check', 'hint', 'solution', 'reset', 'back']);
  // And each binding really is the registry's default for that id.
  for (const [id] of CHALLENGE_HINT_IDS) {
    const cmd = COMMANDS.find((c) => c.id === id);
    assert.ok(cmd, `registry contains ${id}`);
    assert.ok(
      hints.some((h) => h.key === keyLabel(cmd.keys.default[0])),
      `${id}'s default binding is surfaced`,
    );
  }
});

test('footerLine joins with the classic separator', () => {
  assert.equal(footerLine([['challenge.check', 'check'], ['challenge.hint', 'hint']]), 'Ctrl+S check · Ctrl+H hint');
});

test('footerHints skips palette-only commands instead of lying', () => {
  // settings.vimToggle has keys.default: [] — it must not render as a hint.
  const hints = footerHints([['settings.vimToggle', 'vim']]);
  assert.deepEqual(hints, []);
});

test('modeBadge: insert/visual badges, none in normal', () => {
  assert.equal(modeBadge('normal'), null);
  assert.equal(modeBadge('insert'), ' -- INSERT --');
  assert.equal(modeBadge('visual'), ' -- VISUAL --');
});

test('nudge constants match the spec', () => {
  assert.equal(NUDGE_TEXT, 'Press i to start typing — ? for help');
  assert.equal(NUDGE_AFTER_MS, 2000);
});
