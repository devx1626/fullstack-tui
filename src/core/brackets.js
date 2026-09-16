/**
 * Q12 bracket matching (the classic editor half of B.5 `%`).
 *
 * `matchBracket(text, offset)` answers "where is the partner of the bracket at
 * (or just before) the caret?" for `()`, `[]` and `{}`. It is a scanner, not a
 * parser, but it does mask strings and comments first — a `}` inside a CSS
 * content string or a `//` comment must not count, which is exactly the bug
 * that makes naive bracket matching worse than none.
 *
 * Pure: no editor model, no terminal.
 */

export const OPEN_TO_CLOSE = { '(': ')', '[': ']', '{': '}' };
export const CLOSE_TO_OPEN = { ')': '(', ']': '[', '}': '{' };

/**
 * A copy of `text` where every character inside a string or comment is
 * replaced by a space — same length, so indices are comparable. Handles
 * `'…'`, `"…"`, `` `…` `` (with backslash escapes), `//`, block comments and
 * `<!-- … -->`. Regex literals are not detected: `/` stays literal, which at
 * worst matches a bracket a human also could not resolve.
 */
export function maskCode(text) {
  const src = String(text ?? '');
  const chars = src.split('');
  let i = 0;
  const blank = (from, to) => {
    for (let j = from; j < to && j < chars.length; j += 1) {
      if (chars[j] !== '\n') chars[j] = ' ';
    }
  };
  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];
    if (ch === '/' && next === '/') {
      const end = src.indexOf('\n', i);
      const stop = end === -1 ? src.length : end;
      blank(i, stop);
      i = stop;
      continue;
    }
    if (ch === '/' && next === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end === -1 ? src.length : end + 2;
      blank(i, stop);
      i = stop;
      continue;
    }
    if (ch === '<' && src.startsWith('<!--', i)) {
      const end = src.indexOf('-->', i + 4);
      const stop = end === -1 ? src.length : end + 3;
      blank(i, stop);
      i = stop;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === ch) break;
        j += 1;
      }
      const stop = Math.min(j + 1, src.length);
      blank(i, stop);
      i = stop;
      continue;
    }
    i += 1;
  }
  return chars.join('');
}

function findMatch(masked, start, dir, open, close) {
  // The bracket we start from is already counted; the walk begins past it.
  let depth = 1;
  for (let i = start; i >= 0 && i < masked.length; i += dir) {
    const ch = masked[i];
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return null;
}

/**
 * Match the bracket at `offset`, or the one immediately before it (the caret
 * in the classic editor sits *after* the character you would point at).
 *
 * @param {string} text
 * @param {number} offset
 * @returns {{ index: number, char: string, partner: string, unmatched: boolean } | null}
 *   `null` when the caret is not on a bracket at all.
 */
export function matchBracket(text, offset) {
  const src = String(text ?? '');
  const masked = maskCode(src);
  const pos = Math.max(0, Math.min(Number(offset) || 0, src.length));
  for (const idx of [pos, pos - 1]) {
    if (idx < 0 || idx >= src.length) continue;
    const ch = masked[idx];
    const open = OPEN_TO_CLOSE[ch];
    const close = CLOSE_TO_OPEN[ch];
    if (!open && !close) continue;
    // Forward from an opener: depth rises on the opener itself. Backward from
    // a closer the roles swap — the closer we started on is the "open" of the
    // reverse walk, and its partner is the "close".
    const index = open
      ? findMatch(masked, idx + 1, 1, ch, open)
      : findMatch(masked, idx - 1, -1, ch, close);
    if (index === null) return { index: -1, char: ch, partner: open || close, unmatched: true };
    return { index, char: ch, partner: open || close, unmatched: false };
  }
  return null;
}
