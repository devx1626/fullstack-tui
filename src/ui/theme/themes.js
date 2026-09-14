/**
 * Theme tokens (spec §7.2) — semantic superset of the classic palette in
 * src/tui/ansi.js so the tokenizer ports cleanly in Phase 2. Values here are
 * hex strings; tier mapping to 256/16 happens in tiers.js.
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

export const themes = { midnight, paper };
