/**
 * Fuzzy matching for the command palette (overhaul §10, palette-first QoL).
 *
 * Pure and deterministic — no ink/React — so it unit-tests without the JSX
 * harness. Scoring favors what a learner is typing toward:
 *   exact substring > word-boundary prefix > plain subsequence,
 *   with earlier matches and shorter texts breaking ties.
 */

/** Score `query` against `text`; null when not a subsequence match. */
export function fuzzyScore(query, text) {
  if (!query) return 1; // empty query lists everything, in given order
  const q = query.toLowerCase();
  const t = text.toLowerCase();

  // 1) substring: best case, earlier is better
  const idx = t.indexOf(q);
  if (idx !== -1) return 100 - idx + Math.max(0, 10 - text.length / 10);

  // 2) subsequence with word-boundary bonuses
  let score = 0;
  let ti = 0;
  let prevWordStart = false;
  for (let qi = 0; qi < q.length; qi += 1) {
    const ch = q[qi];
    const found = t.indexOf(ch, ti);
    if (found === -1) return null;
    const isWordStart = found === 0 || /[\s\-_./]/.test(t[found - 1]);
    if (isWordStart) score += 5;
    if (found === ti && qi > 0) score += 3; // consecutive
    score += prevWordStart && isWordStart ? 2 : 0;
    prevWordStart = isWordStart;
    ti = found + 1;
  }
  return score;
}

/**
 * Filter + rank command entries: [{ id, title, keys?, category? }, ...].
 * Empty query returns the original order (recents-first is the caller's job).
 */
export function filterCommands(commands, query) {
  const scored = [];
  for (let i = 0; i < commands.length; i += 1) {
    const cmd = commands[i];
    let s = fuzzyScore(query, cmd.title);
    if (s === null && cmd.id) s = fuzzyScore(query, cmd.id.replace(/[.:-]/g, ' ')) !== null ? 10 : null;
    if (s !== null) scored.push({ cmd, s, i });
  }
  scored.sort((a, b) => (b.s - a.s) || (a.i - b.i));
  return scored.map((x) => x.cmd);
}

/** Clamp a selected index after the match list shrinks/grows. */
export function clampSelected(selected, count) {
  if (count <= 0) return 0;
  return Math.max(0, Math.min(selected, count - 1));
}
