/**
 * Footer & mode UX (overhaul task 2.10) — the pure half.
 *
 * The classic footer hand-types its key hints ("Ctrl+S check · Ctrl+H hint"),
 * which is exactly how the footer drifts out of sync with the keymap. Here the
 * hints are DERIVED from the command registry (src/ui/commands.js): pick the
 * command ids a screen should surface, read each one's default binding, and
 * render. tools/check.js lints the same derivation through the real
 * `resolveKey`, so a binding change that strands a hint fails the gate.
 *
 * Also here: the vim mode badge and the one-time normal-mode nudge text
 * (§9 guardrail — "Press i to start typing — ? for help").
 */

import { COMMANDS, parseBinding } from './commands.js';

/**
 * The commands a challenge footer surfaces, in order, with the short word the
 * footer shows for each. Ids must exist in the registry — a typo here is a
 * missing hint in check.js's lint, not a silent drop.
 */
export const CHALLENGE_HINT_IDS = [
  ['challenge.check', 'check'],
  ['challenge.hint', 'hint'],
  ['challenge.solution', 'solution'],
  ['challenge.reset', 'reset'],
  ['app.back', 'back'],
];

/**
 * "<C-s>" → "Ctrl+S", "<Esc>" → "Esc", "<CR>" → "Enter", "y" → "y",
 * "G" → "G", "<C-A-left>" → "Ctrl+Alt+Left".
 *
 * Named keys render Title-cased ("PageUp", "Left"). A single character with a
 * modifier is uppercased ("<C-s>" → "Ctrl+S"); a BARE character keeps its
 * case, because in the vim-first keymap `y`/`Y` and `g`/`G` are different
 * commands — uppercasing them here would make the footer lie.
 */
export function keyLabel(binding) {
  const p = parseBinding(binding);
  if (!p) return binding;
  const pre = (p.ctrl ? 'Ctrl+' : '') + (p.alt ? 'Alt+' : '') + (p.shift ? 'Shift+' : '');
  const named = {
    cr: 'Enter', esc: 'Esc', space: 'Space', tab: 'Tab', bs: 'BS', del: 'Del',
    up: 'Up', down: 'Down', left: 'Left', right: 'Right',
    home: 'Home', end: 'End', pageup: 'PageUp', pagedown: 'PageDown',
  };
  const label = p.key.length === 1
    ? (pre && /[a-z]/.test(p.key) ? p.key.toUpperCase() : p.key)
    : (named[p.key] || p.key);
  return pre + label;
}

/**
 * Footer segments for a screen: `[{ key: 'Ctrl+S', word: 'check' }]`.
 * A command with no default binding is skipped (it stays palette-only).
 */
export function footerHints(ids = CHALLENGE_HINT_IDS) {
  const out = [];
  for (const [id, word] of ids) {
    const cmd = COMMANDS.find((c) => c.id === id);
    const binding = cmd && cmd.keys && cmd.keys.default && cmd.keys.default[0];
    if (binding) out.push({ key: keyLabel(binding), word });
  }
  return out;
}

/** The joined footer line: "Ctrl+S check · Ctrl+H hint · …" */
export function footerLine(ids) {
  return footerHints(ids).map((h) => `${h.key} ${h.word}`).join(' · ');
}

/** Mode badge: null in normal mode (no noise), " -- INSERT --" etc. otherwise. */
export function modeBadge(mode) {
  if (mode === 'insert') return ' -- INSERT --';
  if (mode === 'visual') return ' -- VISUAL --';
  return null;
}

/** §9: the one-time nudge shown when a beginner types text in normal mode. */
export const NUDGE_TEXT = 'Press i to start typing — ? for help';

/** Typing for longer than this in normal mode raises the nudge (§9: 2 s). */
export const NUDGE_AFTER_MS = 2000;
