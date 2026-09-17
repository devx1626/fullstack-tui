/**
 * Search & replace engine (overhaul §8.6, task 2.5).
 *
 * Everything here is a pure function of a document plus search state, because
 * the two things that must never diverge are "what the user sees highlighted"
 * and "what `n` / replace-all act on" — computing them from the same match list
 * is the only way to guarantee that.
 *
 * The substitution PLAN lives here too (`substitutePlan`), and `vim.js` imports
 * it: `:s`/`:%s`, the confirm-each loop and the palette's replace-all must all
 * produce the same change list, and a second implementation would be the easiest
 * place in the codebase for them to drift apart.
 *
 * Match semantics, stated because they are visible to the user:
 *   - smart-case: an all-lowercase pattern matches case-insensitively, one with
 *     a capital is exact (vim's `ignorecase`+`smartcase`);
 *   - an invalid regex is reported (`error`), never thrown;
 *   - a search starts strictly AFTER the caret, so `/x` with the caret on an `x`
 *     moves to the next one — that is what makes `n` advance.
 */
import { cmpPos, lineAt, pos, posOf, offsetOf } from './document.js';
import { searchMatches, searchPattern } from './vim/motions.js';

export const MAX_MATCHES = 5000;

export function createSearchState({
  pattern = '', dir = 1, regex = false, smartCase = true, highlight = true, history = [],
} = {}) {
  return { pattern, dir, regex, smartCase, highlight, history: [...history] };
}

/** Search options in the shape the matcher helpers take. */
export const optionsOf = (state) => ({
  regex: !!(state && state.regex),
  smartCase: !(state && state.smartCase === false),
  limit: MAX_MATCHES,
});

/** Flip the case sensitivity. Turning it off means "exact, always". */
export function toggleCase(state) {
  return { ...state, smartCase: !state.smartCase };
}

/** Flip the regex interpretation. The pattern itself is never rewritten. */
export function toggleRegex(state) {
  return { ...state, regex: !state.regex };
}

export function toggleHighlight(state) {
  return { ...state, highlight: !state.highlight };
}

/** Record a pattern for recall (most recent first, deduped, capped). */
export function pushHistory(state, pattern, { limit = 20 } = {}) {
  const text = String(pattern ?? '');
  if (!text) return state;
  const history = [text, ...state.history.filter((p) => p !== text)].slice(0, limit);
  return { ...state, history };
}

/**
 * Compile the pattern.
 * @returns {{ matcher: RegExp|null, error: string|null }} — `error` carries the
 *   message for a bad regex so the UI can show it without a try/catch.
 */
export function compile(state) {
  const { pattern, regex, smartCase } = state;
  if (!pattern) return { matcher: null, error: null };
  const matcher = searchPattern(pattern, { regex, smartCase });
  if (matcher) return { matcher, error: null };
  return { matcher: null, error: `invalid pattern: ${pattern}` };
}

/** Every match in the document, in reading order. */
export function findMatches(doc, state) {
  const { pattern, regex, smartCase } = state;
  if (!pattern) return [];
  return searchMatches(doc, pattern, { regex, smartCase, limit: MAX_MATCHES });
}

/** Match count for the footer (`/ foo — 3 matches`). */
export function matchCount(doc, state) {
  return findMatches(doc, state).length;
}

/**
 * The matches worth highlighting: those inside the visible rows, so a
 * 10 000-line file does not paint everything the user cannot see. `top`/`height`
 * come from the editor's viewport.
 */
export function viewportMatches(doc, state, { top = 0, height = Infinity, limit = 500 } = {}) {
  if (!state.highlight) return [];
  const bottom = height === Infinity ? doc.lines.length - 1 : top + height - 1;
  return findMatches(doc, state)
    .filter((m) => m.row >= top && m.row <= bottom)
    .slice(0, limit);
}

/** The match covering a position — used by `*` and C-d. The end is exclusive:
 * a caret just past a match is not "on" it, or `n` would never advance. */
export function matchAt(doc, caret, state) {
  return findMatches(doc, state).find((m) => m.row === caret.row
    && caret.col >= m.col && caret.col < m.col + m.length) || null;
}

/**
 * The next/previous match from a caret, with wrap-around.
 * `strict` (the default) skips a match sitting exactly on the caret, which is
 * what makes repeated `n` advance instead of sticking.
 */
export function stepMatch(doc, caret, state, { dir = state.dir, count = 1, strict = true } = {}) {
  const matches = findMatches(doc, state);
  if (!matches.length) return { caret, found: false, count: 0, match: null };
  const positions = matches.map((m) => pos(m.row, m.col));
  const forward = positions.filter((p) => (strict ? cmpPos(p, caret) > 0 : cmpPos(p, caret) >= 0));
  const backward = positions.filter((p) => (strict ? cmpPos(p, caret) < 0 : cmpPos(p, caret) <= 0));
  const ordered = dir >= 0 ? forward : backward.reverse();
  const n = Math.max(1, Number(count) || 1);
  const pick = ordered[Math.min(n - 1, Math.max(0, ordered.length - 1))];
  const target = pick || (dir >= 0 ? positions[0] : positions[positions.length - 1]);
  if (!target) return { caret, found: false, count: matches.length, match: null };
  const match = matches.find((m) => m.row === target.row && m.col === target.col) || null;
  return { caret: target, found: true, count: matches.length, match };
}

/** `:123` / palette jump-to-line (1-based, clamped). */
export function jumpToLine(doc, line) {
  const row = Math.max(0, Math.min(Math.floor(Number(line) || 1) - 1, doc.lines.length - 1));
  return pos(row, 0);
}

/**
 * The first failing check that carries a diagnostic line (the §5.4 seam:
 * `evaluate()` copies a check's `line` onto its result). Returns null when no
 * failure points anywhere, so the caller can say so instead of jumping to 1:1.
 */
export function failedCheckTarget(results = []) {
  const hit = (results || []).find((r) => r && !r.ok && Number.isFinite(r.line) && r.line >= 1);
  if (!hit) return null;
  return { line: hit.line, label: hit.label || null, message: hit.message || null };
}

/** A caret for a failed check, or null. */
export function jumpToFailedCheck(doc, results) {
  const target = failedCheckTarget(results);
  return target ? jumpToLine(doc, target.line) : null;
}

/**
 * A diagnostic range (row/col OR a flat offset) as a selection-shaped pair.
 * Accepts either because graders report lines while the browser reports offsets.
 */
export function diagnosticRange(doc, diagnostic) {
  if (!diagnostic) return null;
  if (Number.isFinite(diagnostic.offset)) {
    const start = posOf(doc, diagnostic.offset);
    const end = posOf(doc, diagnostic.offset + Math.max(0, diagnostic.length || 0));
    return { start, end };
  }
  const row = Math.max(0, Math.min((diagnostic.line || 1) - 1, doc.lines.length - 1));
  const col = Math.max(0, Math.min(diagnostic.col || 0, lineAt(doc, row).length));
  return { start: pos(row, col), end: pos(row, col + Math.max(0, diagnostic.length || 0)) };
}

/** The caret a diagnostic range starts at. */
export function jumpToDiagnostic(doc, diagnostic) {
  const range = diagnosticRange(doc, diagnostic);
  return range ? range.start : null;
}

/**
 * Offsets of a match list, for a renderer that paints by absolute column.
 * `doc` is needed because a row's offset depends on every line before it.
 */
export function matchOffsets(doc, matches) {
  const perRow = new Map();
  for (const m of matches) {
    if (!perRow.has(m.row)) perRow.set(m.row, offsetOf(doc, pos(m.row, 0)));
  }
  return matches.map((m) => ({ ...m, offset: perRow.get(m.row) + m.col }));
}

// ---------------------------------------------------------------------------
// Replace
// ---------------------------------------------------------------------------

/**
 * Build a substitution plan: `[{row, col, length, change}]` in reading order.
 *
 * `rows` restricts which lines are considered (`:%s` = every line, `:s` = the
 * caret's line, a visual `:` = the selection's rows). Every change is measured
 * against the ORIGINAL text, which is why a plan can be applied in one
 * `applyEdit` transaction and why confirm-each re-applies from the base
 * document rather than from the previous result.
 *
 * Backreferences are not expanded (`\1` stays literal) — stated here rather
 * than silently mangling the text.
 */
export function substitutePlan(doc, { pattern, replacement = '', all = false, regex = true, smartCase = true }, rows) {
  const matcher = searchPattern(pattern, { regex, smartCase });
  if (!matcher) return [];
  const lineRows = Array.isArray(rows) ? rows : doc.lines.map((_, i) => i);
  const plan = [];
  for (const row of lineRows) {
    if (row < 0 || row >= doc.lines.length) continue;
    const line = doc.lines[row];
    matcher.lastIndex = 0;
    let m = matcher.exec(line);
    while (m) {
      plan.push({
        row,
        col: m.index,
        length: m[0].length,
        change: { start: pos(row, m.index), end: pos(row, m.index + m[0].length), text: replacement },
      });
      if (!all) break;
      if (m[0] === '') matcher.lastIndex += 1; // a zero-width match must advance
      m = matcher.exec(line);
    }
  }
  return plan;
}

/** One-line summary of a replace, for the footer. */
export function describeReplace(count, { all = false } = {}) {
  if (!count) return 'no matches';
  return `${all ? 'replaced' : 'replaced'} ${count} occurrence${count === 1 ? '' : 's'}`;
}

// ---------------------------------------------------------------------------
// Across tabs
// ---------------------------------------------------------------------------

/**
 * The same search in every open file ("search other tabs", a palette command).
 * Order follows the session's tab order, active file first if `active` is given.
 */
export function searchFiles(session, state, { active = null } = {}) {
  const names = Object.keys(session.files || {});
  const ordered = active && names.includes(active) ? [active, ...names.filter((n) => n !== active)] : names;
  const out = [];
  for (const name of ordered) {
    const doc = session.files[name].doc;
    const matches = findMatches(doc, state);
    if (matches.length) out.push({ file: name, matches });
  }
  return out;
}
