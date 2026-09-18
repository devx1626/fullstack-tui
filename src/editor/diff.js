/**
 * Line-level diff via LCS (overhaul task 2.9).
 *
 * The classic `diffCode` (src/tui/widgets.js) compares POSITIONALLY: line i of
 * the answer against line i of the reference, so one inserted line made every
 * following line report a mismatch. This module computes a real longest common
 * subsequence over lines (Wagner-Fischer, capped for pathological inputs), so
 * the DiffView shows +/- rows that align with what the learner actually changed.
 *
 * Rows carry an `op` ('equal', 'insert', 'delete') plus the LINE INDEX on each
 * side, so a renderer can pair deletions with the insertion that replaced them
 * without re-diffing. `similarity()` (LCS length / max length) decides whether
 * a row pair is shown as a modify pair (`!`/`?` like the classic) or as a
 * separate delete+insert — that threshold is a parameter, not a hidden guess.
 *
 * Everything is pure; `diffLines` never throws on any input shape.
 */
import { highlightLine } from './highlight.js';

/** Default cap: beyond this many rows the diff degrades to positional compare
 * (documented, and still correct at the ends — just no real alignment). */
const MAX_LCS_CELLS = 1_000_000;

/**
 * Longest common subsequence over lines, returning the matched index pairs
 * `[{a, b}]` in ascending order. O(n*m) time; bails to a positional match
 * above `maxCells`.
 */
export function lcsMatches(aLines, bLines, { maxCells = MAX_LCS_CELLS } = {}) {
  const a = aLines || [];
  const b = bLines || [];
  const n = a.length;
  const m = b.length;
  if (n === 0 || m === 0) return [];
  if (n * m > maxCells) {
    // Positional fallback: match only the identical tail-aligned rows.
    const out = [];
    for (let i = 0; i < Math.min(n, m); i += 1) {
      if (a[i] === b[i]) out.push({ a: i, b: i });
    }
    return out;
  }
  // Wagner-Fischer with a rolling row; we keep the full table though —
  // reconstruction needs it, and 1e6 numbers is a few MB at worst.
  const dp = new Array(n + 1);
  for (let i = 0; i <= n; i += 1) dp[i] = new Uint32Array(m + 1);
  for (let i = 1; i <= n; i += 1) {
    const ai = a[i - 1];
    const row = dp[i];
    const prev = dp[i - 1];
    for (let j = 1; j <= m; j += 1) {
      row[j] = ai === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], row[j - 1]);
    }
  }
  // Walk back from dp[n][m].
  const matches = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      matches.push({ a: i - 1, b: j - 1 });
      i -= 1;
      j -= 1;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i -= 1;
    } else {
      j -= 1;
    }
  }
  return matches.reverse();
}

/**
 * Diff two line arrays into aligned rows:
 *   `{ op: 'equal',   a, b, text }`         present in both (a/b are indexes)
 *   `{ op: 'insert',  b, text }`            only in `bLines`
 *   `{ op: 'delete',  a, text }`            only in `aLines`
 *   `{ op: 'modify',  a, b, current, reference }` — a delete+insert PAIR of
 *      similar lines (LCS similarity at or above `modifyThreshold`, default
 *      0.5), shown as one change instead of two unrelated rows.
 */
export function diffLines(currentText, referenceText, { modifyThreshold = 0.5, maxCells = MAX_LCS_CELLS } = {}) {
  const a = String(currentText ?? '').split('\n');
  const b = String(referenceText ?? '').split('\n');
  const matches = lcsMatches(a, b, { maxCells });

  // Walk the matches; the gaps between them are the changes.
  const raw = [];
  let ai = 0;
  let bi = 0;
  for (const mt of matches) {
    while (ai < mt.a) raw.push({ op: 'delete', a: ai, text: a[ai] }), (ai += 1);
    while (bi < mt.b) raw.push({ op: 'insert', b: bi, text: b[bi] }), (bi += 1);
    raw.push({ op: 'equal', a: mt.a, b: mt.b, text: a[mt.a] });
    ai += 1;
    bi += 1;
  }
  while (ai < a.length) raw.push({ op: 'delete', a: ai, text: a[ai] }), (ai += 1);
  while (bi < b.length) raw.push({ op: 'insert', b: bi, text: b[bi] }), (bi += 1);

  // Pair adjacent delete+insert runs into modify rows when similar.
  const rows = [];
  let k = 0;
  while (k < raw.length) {
    const dels = [];
    const ins = [];
    while (k < raw.length && raw[k].op === 'delete') dels.push(raw[k]), (k += 1);
    while (k < raw.length && raw[k].op === 'insert') ins.push(raw[k]), (k += 1);
    if (dels.length && ins.length && dels.length + ins.length <= 6) {
      // Pair the runs line-by-line where similarity allows (a replace block).
      const pairs = Math.min(dels.length, ins.length);
      let d = 0;
      let insIdx = 0;
      for (; d < pairs; d += 1) {
        const sim = similarity(dels[d].text, ins[d].text);
        if (sim >= modifyThreshold) {
          rows.push({
            op: 'modify',
            a: dels[d].a,
            b: ins[d].b,
            current: dels[d].text,
            reference: ins[d].text,
          });
          insIdx = d + 1;
        } else break;
      }
      for (; d < dels.length; d += 1) rows.push(dels[d]);
      for (; insIdx < ins.length; insIdx += 1) rows.push(ins[insIdx]);
    } else {
      for (const r of dels) rows.push(r);
      for (const r of ins) rows.push(r);
    }
    if (k < raw.length && raw[k].op === 'equal') {
      rows.push(raw[k]);
      k += 1;
    } else if (k < raw.length && raw[k].op !== 'equal') {
      continue; // another change block follows without an equal separator
    }
  }
  return rows;
}

/** Character-level LCS similarity of two strings in [0,1]. */
export function similarity(x, y) {
  const s = String(x ?? '');
  const t = String(y ?? '');
  if (!s && !t) return 1;
  if (!s || !t) return 0;
  if (s === t) return 1;
  const cells = s.length * t.length;
  if (cells > MAX_LCS_CELLS) return s[0] === t[0] ? 0.5 : 0;
  const prev = new Uint32Array(t.length + 1);
  const cur = new Uint32Array(t.length + 1);
  for (let i = 1; i <= s.length; i += 1) {
    for (let j = 1; j <= t.length; j += 1) {
      cur[j] = s[i - 1] === t[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    }
    prev.set(cur);
  }
  return prev[t.length] / Math.max(s.length, t.length);
}

/**
 * Diff rows → renderable line rows for the DiffView. Each returned row is
 * `{ kind: 'equal'|'add'|'del'|'mod-cur'|'mod-ref', marker, text, segs }` with
 * segments already highlighted (roles resolved through `theme`).
 */
export function diffRows(currentText, referenceText, { lang = 'js', theme = null, modifyThreshold = 0.5 } = {}) {
  const rows = diffLines(currentText, referenceText, { modifyThreshold });
  const state = { blockComment: false };
  const hl = (text) => highlightLine(text, lang, theme, state);
  const out = [];
  for (const r of rows) {
    if (r.op === 'equal') {
      out.push({ kind: 'equal', marker: '  ', text: r.text, segs: hl(r.text) });
    } else if (r.op === 'insert') {
      out.push({ kind: 'add', marker: '+ ', text: r.text, segs: hl(r.text) });
    } else if (r.op === 'delete') {
      out.push({ kind: 'del', marker: '- ', text: r.text, segs: hl(r.text) });
    } else {
      out.push({ kind: 'mod-cur', marker: '! ', text: r.current, segs: hl(r.current) });
      out.push({ kind: 'mod-ref', marker: '? ', text: r.reference, segs: hl(r.reference) });
    }
  }
  return out;
}
