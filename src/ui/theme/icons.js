/**
 * Icon sets (overhaul §7.1/§7.3, task 0.5's remaining piece).
 *
 * The same semantic names resolve to three complete glyph sets:
 *
 *   nerd    — Nerd Font private-use glyphs (Tier A with a detected font).
 *   unicode — the shipped default: box-drawing, blocks and symbols.
 *   ascii   — Tier D / TERM=dumb: everything is plain 7-bit text.
 *
 * A component asks for an icon by ROLE (`icons.select`, `icons.check`) through
 * `useIcons()` and never hardcodes a glyph, so one setting — or one terminal
 * capability — swaps the whole visual language. Selection order follows the
 * spec: `FULLSTACK_ICONS` env → saved settings → heuristic → unicode/ascii.
 *
 * `borderStyle` is not a glyph: it is ink's Box border name for the set, so
 * panels degrade from rounded to `+--` alongside the icons.
 */

export const ICON_SETS = {
  nerd: {
    brand: '\uF1B2', // cube
    select: '\uF054', // chevron-right
    bullet: '\uF111', // small circle
    resume: '\uF04B', // play
    check: '\uF00C',
    cross: '\uF00D',
    warn: '\uF071', // exclamation-triangle
    star: '\uF005',
    flag: '\uF024',
    pencil: '\uF040',
    save: '\uF019', // download
    reset: '\uF021', // refresh
    diff: '\uF0C5', // copy
    command: '\uF120', // terminal
    arrowRight: '\uF105', // angle-right
    arrowLeft: '\uF060', // arrow-left
    arrowUp: '\uF062',
    arrowDown: '\uF063',
    to: '\uF061', // long arrow-right (network direction)
    rail: '│',
    caret: '▏',
    dash: '\uF068', // minus
    quote: '\uF10D', // quote-left
    meterFull: '\uF0C8', // square
    meterEmpty: '\uF10C', // circle-o (dim)
    spark: '▁▂▃▄▅▆▇█', // sparklines stay block-based in every set
    borderStyle: 'round',
  },
  unicode: {
    brand: '◈',
    select: '▸',
    bullet: '·',
    resume: '►',
    check: '✓',
    cross: '✗',
    warn: '⚠',
    star: '★',
    flag: '⚑',
    pencil: '✎',
    save: '⤓',
    reset: '↺',
    diff: '⧉',
    command: '⌘',
    arrowRight: '›',
    arrowLeft: '⟵',
    arrowUp: '↑',
    arrowDown: '↓',
    to: '→',
    rail: '│',
    caret: '█',
    dash: '—',
    quote: '“',
    meterFull: '█',
    meterEmpty: '░',
    spark: '▁▂▃▄▅▆▇█',
    borderStyle: 'round',
  },
  ascii: {
    brand: '*',
    select: '>',
    bullet: '.',
    resume: '>',
    check: '+',
    cross: 'x',
    warn: '!',
    star: '*',
    flag: '!',
    pencil: 'e',
    save: 'S',
    reset: 'R',
    diff: 'D',
    command: '>',
    arrowRight: '>',
    arrowLeft: '<-',
    arrowUp: '^',
    arrowDown: 'v',
    to: '->',
    rail: '|',
    caret: '_',
    dash: '-',
    quote: '"',
    meterFull: '#',
    meterEmpty: '.',
    spark: ' .:-=+*#',
    borderStyle: 'classic',
  },
};

/** Picker stops, Auto first: `null` settings value means Auto. */
export const ICON_CHOICES = ['auto', 'nerd', 'unicode', 'ascii'];

/** Glyphs for a set name; unknown names fall back to unicode (never throw). */
export function iconsFor(set) {
  return ICON_SETS[set] || ICON_SETS.unicode;
}

/** Canonical picker value ('auto' | 'nerd' | 'unicode' | 'ascii'). */
export function normalizeIconSet(name) {
  const n = String(name || '').toLowerCase();
  return ICON_CHOICES.includes(n) ? n : 'auto';
}

/** The next picker stop, wrapping ascii → auto. */
export function nextIconSet(name) {
  const at = ICON_CHOICES.indexOf(normalizeIconSet(name));
  return ICON_CHOICES[(at + 1) % ICON_CHOICES.length];
}

/** Display label for the settings row. */
export function iconSetLabel(name) {
  const n = normalizeIconSet(name);
  return n === 'auto' ? 'Auto' : n.charAt(0).toUpperCase() + n.slice(1);
}

/**
 * Auto-detection heuristic (spec §7.1). Nerd Font is never guessed from color
 * depth alone — only from terminals known to ship a patched font — and a
 * non-unicode terminal always lands on ASCII.
 */
export function autoIconSet(env = process.env, unicode = true) {
  const explicit = String(env.FULLSTACK_ICONS || '').toLowerCase();
  if (explicit === 'nerd' || explicit === 'unicode' || explicit === 'ascii') return explicit;
  if (!unicode || String(env.TERM || '') === 'dumb') return 'ascii';
  const program = String(env.TERM_PROGRAM || '');
  const nerdish = !!env.WEZTERM_VERSION || !!env.KITTY_WINDOW_ID || /kitty|wezterm|ghostty/i.test(program);
  return nerdish ? 'nerd' : 'unicode';
}

/**
 * Final set for a session. `requested` is the env override or the saved
 * setting (both ahead of the heuristic in the spec's order); 'auto'/absent
 * defers to what the capability probe already decided (`caps.icons`).
 */
export function resolveIconSet(requested, caps = {}) {
  const n = normalizeIconSet(requested);
  if (n !== 'auto') return n;
  return ICON_SETS[caps && caps.icons] ? caps.icons : (caps && caps.unicode === false ? 'ascii' : 'unicode');
}
