/**
 * Vim motions (overhaul §8.8 / Appendix B.5, task 2.4).
 *
 * Pure position maths: every motion takes a document and a caret and returns a
 * new caret plus two flags that decide what an OPERATOR does with it:
 *
 *   inclusive  the character under the destination is part of the motion
 *              (`e`, `l`, `f`, `t`, `%`), so `de` eats the last letter
 *   linewise   the motion works on whole lines (`j`, `k`, `gg`, `G`), so `dj`
 *              deletes two entire lines rather than a ragged range
 *
 * Vim's usual caveat, made explicit because it changes the flags: in this
 * engine the caret may sit ONE PAST the last character (like every non-modal
 * editor), while vim's normal-mode caret sits *on* a character. That is why
 * `$` is EXCLUSIVE here (caret lands at end-of-line, so `d$` is exactly
 * `[caret, eol)`) even though it is inclusive in vim's own table — the pair
 * {position, flag} is what stays true, not the flag alone.
 *
 * `w`/`b`/`e` follow vim's word classes: a run of keyword characters, a run of
 * punctuation, or whitespace. `W`/`B`/`E` treat anything non-blank as one word.
 */
import { cmpPos, pos } from '../document.js';
import { matchBracket } from '../../core/brackets.js';
import { firstNonBlank, lineEnd, lineStart } from '../selection.js';

const isKeyword = (ch) => /[A-Za-z0-9_$]/.test(ch);
const isBlank = (ch) => ch === undefined || /\s/.test(ch);

/**
 * The class of a character for word motions: 0 blank, 1 keyword, 2 punctuation.
 * `big` collapses the two word classes, which is what makes `W`/`B`/`E` treat
 * `foo.bar(1)` as a single word.
 */
export function charClass(ch, big = false) {
  if (isBlank(ch)) return 0;
  if (big) return 1;
  return isKeyword(ch) ? 1 : 2;
}

/** The character at a position; a line break reads as blank. */
function charAt(doc, p) {
  const line = doc.lines[p.row];
  if (p.col < line.length) return line[p.col];
  return p.row < doc.lines.length - 1 ? '\n' : undefined;
}

const atDocEnd = (doc, p) => p.row >= doc.lines.length - 1 && p.col >= doc.lines[p.row].length;

/** One character to the right, wrapping to the next line; stops at EOF. */
function stepRight(doc, p) {
  const line = doc.lines[p.row];
  if (p.col < line.length) return pos(p.row, p.col + 1);
  if (p.row < doc.lines.length - 1) return pos(p.row + 1, 0);
  return pos(p.row, line.length);
}

/** One character to the left, wrapping to the previous line; stops at BOF. */
function stepLeft(doc, p) {
  if (p.col > 0) return pos(p.row, p.col - 1);
  if (p.row > 0) return pos(p.row - 1, doc.lines[p.row - 1].length);
  return pos(0, 0);
}

export function normaliseCount(count, fallback = 1) {
  const n = Number(count);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

// ---------------------------------------------------------------------------
// Character and line motions
// ---------------------------------------------------------------------------

/** `h`/`l` walk the text; at a line edge vim wraps, so we do too. */
function moveLeft(doc, caret, count) {
  let { row, col } = caret;
  for (let i = 0; i < count; i += 1) {
    if (col > 0) col -= 1;
    else if (row > 0) { row -= 1; col = doc.lines[row].length; }
    else break;
  }
  return pos(row, col);
}

function moveRight(doc, caret, count) {
  let { row, col } = caret;
  for (let i = 0; i < count; i += 1) {
    if (col < doc.lines[row].length) col += 1;
    else if (row < doc.lines.length - 1) { row += 1; col = 0; }
    else break;
  }
  return pos(row, col);
}

function moveVertical(doc, caret, count, dir, goal) {
  const want = goal == null ? caret.col : goal;
  const row = Math.max(0, Math.min(caret.row + dir * count, doc.lines.length - 1));
  return { caret: pos(row, Math.min(want, doc.lines[row].length)), goalCol: want };
}

// ---------------------------------------------------------------------------
// Word motions
// ---------------------------------------------------------------------------

/**
 * `w`/`W`: the start of the next word.
 * Walk to the end of the word we are in, then over the blanks — where a line
 * break counts as blank, which is how `w` crosses lines at all.
 */
export function wordForward(doc, caret, count = 1, big = false) {
  let p = { ...caret };
  for (let i = 0; i < count; i += 1) {
    const cls = charClass(charAt(doc, p), big);
    if (cls !== 0) {
      while (charClass(charAt(doc, p), big) === cls && !atDocEnd(doc, p)) p = stepRight(doc, p);
    }
    while (charClass(charAt(doc, p), big) === 0 && !atDocEnd(doc, p)) p = stepRight(doc, p);
  }
  return p;
}

/** `b`/`B`: the start of the previous word. */
export function wordBack(doc, caret, count = 1, big = false) {
  let p = { ...caret };
  for (let i = 0; i < count; i += 1) {
    p = stepLeft(doc, p);
    // Back over the blanks…
    while (charClass(charAt(doc, p), big) === 0 && (p.row > 0 || p.col > 0)) p = stepLeft(doc, p);
    // …then to the start of the word we landed in.
    const cls = charClass(charAt(doc, p), big);
    if (cls === 0) break; // nothing but blanks before us
    let prev = stepLeft(doc, p);
    while (cmpPos(prev, p) < 0 && charClass(charAt(doc, prev), big) === cls) {
      p = prev;
      prev = stepLeft(doc, p);
    }
  }
  return p;
}

/** `e`/`E`: the END of the current/next word (inclusive for operators). */
export function wordEnd(doc, caret, count = 1, big = false) {
  let p = { ...caret };
  for (let i = 0; i < count; i += 1) {
    if (!atDocEnd(doc, p)) p = stepRight(doc, p);
    while (charClass(charAt(doc, p), big) === 0 && !atDocEnd(doc, p)) p = stepRight(doc, p);
    const cls = charClass(charAt(doc, p), big);
    if (cls === 0) break; // ran into the end of the document
    let next = stepRight(doc, p);
    while (charClass(charAt(doc, next), big) === cls) {
      p = next;
      next = stepRight(doc, p);
      if (atDocEnd(doc, p)) break;
    }
  }
  return p;
}

// ---------------------------------------------------------------------------
// Paragraph motions
// ---------------------------------------------------------------------------

const isBlankLine = (line) => (line || '').trim() === '';

/** `}`: the next blank line (vim's paragraph motion). */
export function paragraphForward(doc, caret, count = 1) {
  let row = caret.row;
  for (let i = 0; i < count; i += 1) {
    row += 1;
    while (row < doc.lines.length - 1 && !isBlankLine(doc.lines[row])) row += 1;
  }
  return pos(Math.min(row, doc.lines.length - 1), 0);
}

/** `{`: the previous blank line. */
export function paragraphBack(doc, caret, count = 1) {
  let row = caret.row;
  for (let i = 0; i < count; i += 1) {
    row -= 1;
    while (row > 0 && !isBlankLine(doc.lines[row])) row -= 1;
  }
  return pos(Math.max(row, 0), 0);
}

// ---------------------------------------------------------------------------
// Find-char and bracket motions
// ---------------------------------------------------------------------------

/**
 * `f`/`F`/`t`/`T`. `till` stops one character short (t/T). Returns the target
 * position and whether the character was found at all (vim refuses to move).
 */
export function findChar(doc, caret, ch, { dir = 1, till = false, count = 1 } = {}) {
  if (!ch) return { caret, found: false };
  let { row, col } = caret;
  for (let n = 0; n < normaliseCount(count, 1); n += 1) {
    const line = doc.lines[row];
    let i = col + dir;
    let hit = -1;
    while (i >= 0 && i < line.length) {
      if (line[i] === ch) { hit = i; break; }
      i += dir;
    }
    if (hit < 0) return { caret, found: false };
    col = till ? hit - dir : hit;
  }
  return { caret: pos(row, Math.max(0, Math.min(col, doc.lines[row].length))), found: true };
}

/** `%`: the matching bracket, via the shared Q12 scanner (strings masked). */
export function bracketMatch(doc, caret) {
  const text = doc.lines.join('\n');
  let offset = 0;
  for (let i = 0; i < caret.row; i += 1) offset += doc.lines[i].length + 1;
  offset += caret.col;
  const hit = matchBracket(text, offset);
  if (!hit || hit.unmatched) return { caret, found: false, unmatched: !!(hit && hit.unmatched) };
  // Translate the flat offset back to a row/col.
  let row = 0;
  let lineStart = 0;
  for (let i = 0; i < hit.index; i += 1) {
    if (text.charCodeAt(i) === 10) { row += 1; lineStart = i + 1; }
  }
  return { caret: pos(row, hit.index - lineStart), found: true, char: hit.char, partner: hit.partner };
}

// ---------------------------------------------------------------------------
// Search matches (used by `n`/`N`; the incremental UI is task 2.5)
// ---------------------------------------------------------------------------

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Build the matcher for a pattern, honouring smart-case and the regex toggle. */
export function searchPattern(pattern, { regex = false, smartCase = true } = {}) {
  const source = String(pattern || '');
  if (!source) return null;
  // Smart-case: an all-lowercase pattern is case-insensitive, anything with a
  // capital is exact (the behaviour vim users expect from `ignorecase` + `smartcase`).
  const flags = smartCase && source === source.toLowerCase() ? 'gi' : 'g';
  try {
    return new RegExp(regex ? source : escapeRegex(source), flags);
  } catch {
    return null; // an invalid regex must never crash the editor
  }
}

/** Every match in the document, as `[{row, col, length}]` in reading order. */
export function searchMatches(doc, pattern, { regex = false, smartCase = true, limit = 5000 } = {}) {
  const re = searchPattern(pattern, { regex, smartCase });
  if (!re) return [];
  const out = [];
  for (let row = 0; row < doc.lines.length && out.length < limit; row += 1) {
    const line = doc.lines[row];
    re.lastIndex = 0;
    let m = re.exec(line);
    while (m) {
      out.push({ row, col: m.index, length: m[0].length || 1 });
      if (m[0] === '') re.lastIndex += 1; // a zero-width pattern must advance
      m = re.exec(line);
    }
  }
  return out;
}

/** The next (`dir = 1`) or previous (`dir = -1`) match after `caret`. */
export function nextMatch(doc, caret, pattern, { dir = 1, count = 1, regex = false, smartCase = true, wrap = true } = {}) {
  const matches = searchMatches(doc, pattern, { regex, smartCase });
  if (!matches.length) return { caret, found: false, count: 0 };
  const hits = matches.map((m) => pos(m.row, m.col));
  const forward = hits.filter((p) => cmpPos(p, caret) > 0);
  const backward = hits.filter((p) => cmpPos(p, caret) < 0);
  const ordered = dir > 0 ? forward : backward.reverse();
  const n = normaliseCount(count, 1);

  const pick = () => {
    if (ordered.length === 0) return null;
    const idx = Math.min(n - 1, ordered.length - 1);
    return ordered[idx];
  };

  let target = pick();
  if (!target) {
    if (!wrap) return { caret, found: false, count: matches.length };
    const list = dir > 0 ? hits : [...hits].reverse();
    target = list[Math.min(n - 1, list.length - 1)];
  }
  return { caret: target, found: true, count: matches.length };
}

// ---------------------------------------------------------------------------
// The motion table
// ---------------------------------------------------------------------------

/**
 * Every motion the spec's §8.8 coverage list names, with the flags an operator
 * needs. `apply` returns `{ caret, ... }`; `linewise`/`inclusive` are read by
 * the operator layer in `operators.js`.
 */
export const MOTIONS = {
  h: { apply: (doc, caret, n) => moveLeft(doc, caret, n), inclusive: false },
  l: { apply: (doc, caret, n) => moveRight(doc, caret, n), inclusive: true },
  j: { apply: (doc, caret, n, o) => moveVertical(doc, caret, n, 1, o.goalCol).caret, linewise: true },
  k: { apply: (doc, caret, n, o) => moveVertical(doc, caret, n, -1, o.goalCol).caret, linewise: true },
  w: { apply: (doc, caret, n) => wordForward(doc, caret, n), inclusive: false },
  W: { apply: (doc, caret, n) => wordForward(doc, caret, n, true), inclusive: false },
  b: { apply: (doc, caret, n) => wordBack(doc, caret, n), inclusive: false },
  B: { apply: (doc, caret, n) => wordBack(doc, caret, n, true), inclusive: false },
  e: { apply: (doc, caret, n) => wordEnd(doc, caret, n), inclusive: true },
  E: { apply: (doc, caret, n) => wordEnd(doc, caret, n, true), inclusive: true },
  0: { apply: (doc, caret) => lineStart(doc, caret.row), inclusive: false },
  '^': { apply: (doc, caret) => firstNonBlank(doc, caret.row), inclusive: false },
  $: {
    // Exclusive on purpose: the caret lands AT end-of-line, so `[caret, eol)`
    // is already the right operator range (see the file header). A count moves
    // down first, like vim's `2$`.
    apply: (doc, caret, n) => {
      const row = Math.min(caret.row + n - 1, doc.lines.length - 1);
      return lineEnd(doc, row);
    },
    inclusive: false,
    line: true,
  },
  gg: { apply: (doc, caret, n) => pos(n > 1 ? n - 1 : 0, 0), linewise: true },
  G: {
    apply: (doc, caret, n, o) => (o.explicitCount ? pos(Math.min(n - 1, doc.lines.length - 1), 0) : pos(doc.lines.length - 1, 0)),
    linewise: true,
  },
  '{': { apply: (doc, caret, n) => paragraphBack(doc, caret, n), linewise: false },
  '}': { apply: (doc, caret, n) => paragraphForward(doc, caret, n), linewise: false },
  '%': {
    apply: (doc, caret, n) => {
      let at = caret;
      for (let i = 0; i < n; i += 1) {
        const hit = bracketMatch(doc, at);
        if (!hit.found) return at;
        at = hit.caret;
      }
      return at;
    },
    inclusive: true,
  },
};

/**
 * Resolve one motion token, including the two-key families (`gg`) and the
 * char-argument ones (`f`/`F`/`t`/`T`, which need `arg`).
 *
 * @returns {{ caret, inclusive, linewise, line: boolean, failed?: boolean }}
 */
export function applyMotion(doc, caret, token, { count = 1, goalCol = null, arg = null, explicitCount = false } = {}) {
  const n = normaliseCount(count, 1);
  if (token === 'f' || token === 'F' || token === 't' || token === 'T') {
    const dir = token === 'f' || token === 't' ? 1 : -1;
    const till = token === 't' || token === 'T';
    const hit = findChar(doc, caret, arg, { dir, till, count: n });
    return { caret: hit.caret, inclusive: !till, linewise: false, line: true, failed: !hit.found };
  }
  const motion = MOTIONS[token];
  if (!motion) return { caret, inclusive: false, linewise: false, failed: true };
  return {
    caret: motion.apply(doc, caret, n, { goalCol, explicitCount }),
    inclusive: !!motion.inclusive,
    linewise: !!motion.linewise,
    line: token === 'j' || token === 'k' || token === 'gg' || token === 'G',
  };
}

export const MOTION_TOKENS = new Set([
  ...Object.keys(MOTIONS), 'f', 'F', 't', 'T',
]);
