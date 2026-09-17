/**
 * Visual width (overhaul §8.1: "Correct visual width").
 *
 * Zero-dep wcwidth-style box width, used by everything that lays a buffer out
 * on a character grid: the editor viewport, the gutter, horizontal scrolling,
 * the completion popup and the diff view.
 *
 * Scope, stated honestly: this is a *box-width approximation*, not a Unicode
 * grapheme segmenter. It gets the cases a code buffer actually contains right —
 * ASCII, tabs, CJK (width 2), combining marks (width 0), zero-width joiners,
 * variation selectors and emoji presentation — and it deliberately sums
 * codepoints, so a ZWJ emoji *sequence* (`👩‍🚀`) over-counts (2+0+2 = 4 where a
 * terminal paints 2). Clustering those needs a grapheme table; a code editor
 * does not need it, and `stringWidth` documents the behaviour instead of
 * pretending otherwise.
 *
 * Widths are counted in *cells*; indexes are counted in UTF-16 code units
 * (what `String.prototype.slice` uses). Every function that takes a line also
 * takes an index in code units, so a caller never has to convert.
 */

/** Control characters paint nothing on their own. */
const isControl = (cp) => cp < 0x20 || (cp >= 0x7f && cp < 0xa0);

// Combining marks and other zero-advance codepoints. Deliberately a subset of
// the full Mn/Me/Cf tables: the ranges a source file can plausibly contain.
const ZERO_WIDTH = [
  [0x0300, 0x036f], // combining diacritical marks
  [0x0591, 0x05bd], [0x05bf, 0x05bf], [0x05c1, 0x05c2], [0x05c4, 0x05c5], [0x05c7, 0x05c7],
  [0x0610, 0x061a], [0x064b, 0x065f], [0x0670, 0x0670], [0x06d6, 0x06dc], [0x06df, 0x06e4],
  [0x06e7, 0x06e8], [0x06ea, 0x06ed], [0x0711, 0x0711], [0x0730, 0x074a], [0x07a6, 0x07b0],
  [0x07eb, 0x07f3], [0x0900, 0x0902], [0x093a, 0x093a], [0x093c, 0x093c], [0x0941, 0x0948],
  [0x094d, 0x094d], [0x0951, 0x0957], [0x0962, 0x0963],
  [0x1ab0, 0x1aff], [0x1dc0, 0x1dff], // combining extensions
  [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x2064], // zero-widths + bidi controls
  [0x20d0, 0x20f0], // combining marks for symbols
  [0xfe00, 0xfe0f], [0xfe20, 0xfe2f], [0xfeff, 0xfeff], // variation selectors, combining half marks, BOM
  [0x1f3fb, 0x1f3ff], // emoji skin-tone modifiers
  [0xe0100, 0xe01ef], // variation selectors supplement
];

// East-Asian Wide/Fullwidth — the ranges that occupy two cells.
const WIDE = [
  [0x1100, 0x115f], [0x2329, 0x232a],
  [0x2e80, 0x303e], [0x3041, 0x33ff], [0x3400, 0x4dbf], [0x4e00, 0x9fff],
  [0xa000, 0xa4cf], [0xa960, 0xa97f], [0xac00, 0xd7a3],
  [0xf900, 0xfaff], [0xfe10, 0xfe19], [0xfe30, 0xfe6f],
  [0xff00, 0xff60], [0xffe0, 0xffe6],
  // Emoji blocks. These really are wide in every terminal that has them, so
  // they are listed as such rather than left to the VS16 heuristic below.
  [0x1f300, 0x1f64f], [0x1f680, 0x1f6ff], [0x1f700, 0x1f77f],
  [0x1f780, 0x1f7ff], [0x1f800, 0x1f8ff], [0x1f900, 0x1f9ff], [0x1fa70, 0x1faff],
  [0x20000, 0x3fffd], // CJK extension B and beyond
];

const inRanges = (cp, ranges) => {
  for (const [lo, hi] of ranges) {
    if (cp >= lo && cp <= hi) return true;
    if (lo > cp) break; // ranges are sorted
  }
  return false;
};

/** Codepoint of the first code unit of `ch` (handles surrogate pairs). */
export function codepointOf(ch) {
  if (!ch) return 0;
  const cp = ch.codePointAt(0);
  return Number.isFinite(cp) ? cp : 0;
}

/** Columns one codepoint occupies: 0, 1 or 2. */
export function codepointWidth(cp) {
  if (!Number.isFinite(cp) || cp <= 0) return 0;
  if (isControl(cp)) return 0;
  if (inRanges(cp, ZERO_WIDTH)) return 0;
  if (inRanges(cp, WIDE)) return 2;
  return 1;
}

/**
 * Columns one character (one code point, as produced by `for…of`) occupies.
 * A variation selector requests emoji presentation for the character BEFORE it,
 * which is what makes `❤️` two cells wide while `❤` alone is one.
 */
export function charWidth(ch, { next } = {}) {
  const cp = codepointOf(ch);
  if (cp === 0xfe0f || cp === 0xfe0e) return 0;
  const base = codepointWidth(cp);
  if (next === '\ufe0f') return Math.max(base, 2); // emoji presentation
  return base;
}

/**
 * Columns a whole string occupies. Tabs are NOT expanded here (their width
 * depends on the column they start at — see `visualColumn`); a tab counts as
 * one cell so this stays a pure per-character sum.
 */
export function stringWidth(s) {
  const str = String(s ?? '');
  let width = 0;
  let i = 0;
  while (i < str.length) {
    const size = str.codePointAt(i) > 0xffff ? 2 : 1;
    const ch = str.slice(i, i + size);
    // The character after `ch` decides its presentation (`❤` + `\uFE0F` is 2).
    width += charWidth(ch, { next: str[i + size] });
    i += size;
  }
  return width;
}

/**
 * Visual column of `index` (a code-unit index into `line`): the cells the text
 * before it occupies, with tabs advanced to the next multiple of `tabSize`.
 */
export function visualColumn(line, index, tabSize = 2) {
  const str = String(line ?? '');
  const end = Math.max(0, Math.min(index == null ? str.length : index, str.length));
  const tab = Math.max(1, Number(tabSize) || 1);
  let col = 0;
  let i = 0;
  while (i < end) {
    const ch = str.codePointAt(i) > 0xffff ? str.slice(i, i + 2) : str[i];
    if (ch === '\t') {
      col += tab - (col % tab);
    } else {
      col += charWidth(ch, { next: str[i + ch.length] });
    }
    i += ch.length;
  }
  return col;
}

/** Index in `line` whose visual column is closest to `target` without passing it. */
export function indexAtVisualColumn(line, target, tabSize = 2) {
  const str = String(line ?? '');
  const want = Math.max(0, Number(target) || 0);
  const tab = Math.max(1, Number(tabSize) || 1);
  let col = 0;
  let i = 0;
  while (i < str.length) {
    const ch = str.codePointAt(i) > 0xffff ? str.slice(i, i + 2) : str[i];
    const step = ch === '\t' ? tab - (col % tab) : charWidth(ch, { next: str[i + ch.length] });
    if (col + step > want) return i; // the click landed inside a double-width cell
    col += step;
    i += ch.length;
  }
  return str.length;
}

/** `line` with tabs replaced by spaces (display-only; the buffer keeps tabs). */
export function expandTabs(line, tabSize = 2) {
  const str = String(line ?? '');
  const tab = Math.max(1, Number(tabSize) || 1);
  let out = '';
  let col = 0;
  for (const ch of str) {
    if (ch === '\t') {
      const spaces = tab - (col % tab);
      out += ' '.repeat(spaces);
      col += spaces;
    } else {
      out += ch;
      col += charWidth(ch);
    }
  }
  return out;
}

/**
 * The slice of `line` covering visual columns [startCol, startCol + width).
 * This is how the viewport renders a long line: one call per visible row, so a
 * horizontally scrolled buffer never builds the whole expanded string.
 */
export function sliceByVisualColumn(line, startCol, width, tabSize = 2) {
  const str = String(line ?? '');
  const from = Math.max(0, Number(startCol) || 0);
  const cells = Math.max(0, Number(width) || 0);
  const expanded = expandTabs(str, tabSize);
  return expanded.slice(from, from + cells);
}
