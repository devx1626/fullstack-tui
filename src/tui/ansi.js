/**
 * ANSI escape sequences + the colour palette used everywhere.
 *
 * The app targets 256-colour terminals, which is the safe common denominator
 * for the modern macOS/Linux/Windows-Terminal setups this curriculum runs on.
 */

const ESC = '\x1b[';

export const seq = {
  altOn: ESC + '?1049h',
  altOff: ESC + '?1049l',
  cursorHide: ESC + '?25l',
  cursorShow: ESC + '?25h',
  clearAll: ESC + '2J',
  clearLine: ESC + 'K',
  home: ESC + 'H',
  moveTo: (row, col = 1) => `${ESC}${row};${col}H`,
  reset: ESC + '0m',
  bold: ESC + '1m',
  dim: ESC + '2m',
  italic: ESC + '3m',
  underline: ESC + '4m',
  blink: ESC + '5m',
  reverse: ESC + '7m',
  fg: (n) => `${ESC}38;5;${n}m`,
  bg: (n) => `${ESC}48;5;${n}m`,
  strip: /\x1b\[[0-9;?]*[a-zA-Z]/g,
};

/** Dark palette (default). */
export const darkTheme = {
  name: 'dark',
  bg: 233,
  panel: 235,
  panelAlt: 236,
  border: 240,
  borderFocus: 39,
  text: 252,
  muted: 245,
  faint: 240,
  accent: 39, // cyan / blue
  accentSoft: 74,
  secondary: 213, // pink
  good: 84,
  bad: 203,
  warn: 221,
  star: 220,
  codeBg: 234,
  codeText: 222,
  string: 150,
  keyword: 176,
  comment: 243,
  number: 216,
};

/** Light palette, selected with FULLSTACK_THEME=light. */
export const lightTheme = {
  name: 'light',
  bg: 255,
  panel: 253,
  panelAlt: 252,
  border: 246,
  borderFocus: 25,
  text: 234,
  muted: 242,
  faint: 246,
  accent: 25,
  accentSoft: 31,
  secondary: 127,
  good: 28,
  bad: 160,
  warn: 130,
  star: 136,
  codeBg: 253,
  codeText: 234,
  string: 28,
  keyword: 90,
  comment: 245,
  number: 130,
};

export function pickTheme() {
  const want = String(process.env.FULLSTACK_THEME || '').toLowerCase();
  if (want === 'light') return lightTheme;
  if (want === 'dark') return darkTheme;
  // COLORFGBG is set by many terminals as "fg;bg"
  const cfg = process.env.COLORFGBG;
  if (cfg) {
    const bg = Number(cfg.split(';').pop());
    if (Number.isFinite(bg) && bg >= 7) return lightTheme;
  }
  return darkTheme;
}

/** Colour helpers used by widgets that need light/dark aware tinting. */
export function mix(theme, key, amount = 0.4) {
  const base = theme[key];
  if (theme.name === 'light') return Math.max(0, Math.round(base - 30 * amount));
  return Math.min(255, Math.round(base + 30 * amount));
}
