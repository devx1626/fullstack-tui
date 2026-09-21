/**
 * Theme tokens (spec §7.2) — semantic superset of the classic palette in
 * src/tui/ansi.js so the tokenizer ports cleanly in Phase 2. Values here are
 * hex strings; tier mapping to 256/16 happens in index.js.
 *
 * The curated set is built from these five: two dark roads and one light one
 * beyond the originals. Every palette carries the SAME 22 token roles, so a
 * screen never has to know which theme is active; `tests/unit/themes.test.js`
 * pins that parity.
 *
 *   midnight — the default: near-black chrome, teal accent.
 *   paper    — the light original: cool grey-white, blue accent.
 *   ember    — warm dark: charcoal-brown chrome, amber accent.
 *   dusk     — twilight dark: indigo chrome, violet accent.
 *   sand     — warm light: parchment chrome, burnt-orange accent.
 */

export const midnight = {
  name: 'midnight',
  bg: '#0e0e11',
  panel: '#1a1a20',
  panelAlt: '#222229',
  border: '#3a3a44',
  borderFocus: '#39c5cf',
  text: '#d8d8de',
  muted: '#8f8f9b',
  faint: '#55555f',
  accent: '#39c5cf',
  accentSoft: '#6fd7e0',
  secondary: '#e08ae0',
  good: '#7fe07f',
  bad: '#f07178',
  warn: '#e0c060',
  star: '#e5c07b',
  codeBg: '#121216',
  codeText: '#e5c07b',
  string: '#98c379',
  keyword: '#c678dd',
  comment: '#7a7a85',
  number: '#d19a66',
};

export const paper = {
  name: 'paper',
  bg: '#fafafa',
  panel: '#efefef',
  panelAlt: '#e4e4e4',
  border: '#c9c9c9',
  borderFocus: '#2874a2',
  text: '#1c1c22',
  muted: '#5a5a64',
  faint: '#a8a8b0',
  accent: '#2874a2',
  accentSoft: '#3a8cbd',
  secondary: '#a348a3',
  good: '#2e7d32',
  bad: '#c62828',
  warn: '#a67c00',
  star: '#9c6f1d',
  codeBg: '#f0f0f0',
  codeText: '#7a4a00',
  string: '#2e7d32',
  keyword: '#8e44ad',
  comment: '#8a8a92',
  number: '#b35c00',
};

/** Warm dark — charcoal-brown chrome, amber accent. */
export const ember = {
  name: 'ember',
  bg: '#1b1512',
  panel: '#2a211c',
  panelAlt: '#352a23',
  border: '#4a3a30',
  borderFocus: '#e0913c',
  text: '#ece0d4',
  muted: '#b09a86',
  faint: '#6f5d4e',
  accent: '#e0913c',
  accentSoft: '#f0b566',
  secondary: '#d9765f',
  good: '#9bbf6a',
  bad: '#e0655c',
  warn: '#e0b552',
  star: '#e0b552',
  codeBg: '#221a15',
  codeText: '#f0d8b8',
  string: '#a9bf6a',
  keyword: '#d9765f',
  comment: '#83705f',
  number: '#e0913c',
};

/** Twilight dark — indigo chrome, violet accent. */
export const dusk = {
  name: 'dusk',
  bg: '#16131f',
  panel: '#211c2e',
  panelAlt: '#2b243b',
  border: '#3d3450',
  borderFocus: '#b48ead',
  text: '#ded8ea',
  muted: '#9a90b0',
  faint: '#635a75',
  accent: '#b48ead',
  accentSoft: '#cfadd0',
  secondary: '#7fb3d5',
  good: '#8fbf9f',
  bad: '#d9737a',
  warn: '#d9c07a',
  star: '#d9b86a',
  codeBg: '#1c1728',
  codeText: '#cdbfe3',
  string: '#9fc08a',
  keyword: '#b48ead',
  comment: '#7a7189',
  number: '#d9a06a',
};

/** Warm light — parchment chrome, burnt-orange accent. */
export const sand = {
  name: 'sand',
  bg: '#f7f1e3',
  panel: '#efe6d2',
  panelAlt: '#e6dabe',
  border: '#cbbd9d',
  borderFocus: '#a8651f',
  text: '#2b2418',
  muted: '#6b5f49',
  faint: '#a99a7d',
  accent: '#a8651f',
  accentSoft: '#c07d33',
  secondary: '#8a5a8a',
  good: '#4f7a2e',
  bad: '#b23b2e',
  warn: '#8a6a12',
  star: '#96681a',
  codeBg: '#efe7d5',
  codeText: '#7a4f13',
  string: '#4f7a2e',
  keyword: '#8a5a8a',
  comment: '#8a7d63',
  number: '#b0561f',
};

/** Named lookup, resolved generically by `themeForCapabilities`. */
export const themes = { midnight, paper, ember, dusk, sand };
