/**
 * Undo/redo history (overhaul §8.2, task 2.2).
 *
 * What the spec asks for, and where each rule lives:
 *
 *   - **Coalescing** — a typing burst is ONE undo step, and so is an auto-pair
 *     insert or the indent-on-Enter that follows an opener. `historyRecord`
 *     merges an entry into the previous one when both carry the same
 *     coalescable `kind` and land inside the window (default 400 ms).
 *   - **Group on completion accept, paste and replace-all** — those callers
 *     record with `coalesce: false`, and a non-coalescable entry never merges
 *     (neither into the previous step nor as a target for the next).
 *   - **Redo cleared on a new edit** — any record drops `future`.
 *   - **1000-step cap** — `limit`; the oldest entry falls off the bottom.
 *   - **Undo never crosses files** — a history belongs to ONE file, and the
 *     session (document.js) keeps one per file. There is no global stack to
 *     cross with.
 *
 * Entries hold `{ before, after }` DOCUMENT values. Documents are line arrays
 * of shared strings, so a snapshot costs an array of pointers — cheap enough
 * that exact snapshots beat diffing for correctness, which is the whole point
 * of the task ("undo never corrupts text").
 *
 * Time is injected (`at`) rather than read from the clock, so coalescing is
 * deterministic in tests.
 */
/**
 * Text of a document value.
 *
 * Deliberately local rather than `document.js`'s `docText`: document.js imports
 * this module, and a cycle would make the dependency graph directional on
 * nothing. History only ever needs `.lines`, so it reads only that.
 */
const textOf = (doc) => (doc && Array.isArray(doc.lines) ? doc.lines.join('\n') : String(doc ?? ''));

/** Kinds that may merge into a previous entry. `typing` is the default. */
export const COALESCE_WINDOW_MS = 400;
export const COALESCE_KINDS = new Set(['typing', 'pair', 'indent']);

export function createHistory({ limit = 1000 } = {}) {
  return { past: [], future: [], limit: Math.max(1, limit | 0) };
}

export function historyDepth(history) {
  return history.past.length;
}

export function canUndo(history) {
  return !!(history && history.past.length);
}

export function canRedo(history) {
  return !!(history && history.future.length);
}

/** The next step undo would apply (tests, debug overlays) — never mutated. */
export function peekUndo(history) {
  return history.past.length ? history.past[history.past.length - 1] : null;
}

export function peekRedo(history) {
  return history.future.length ? history.future[history.future.length - 1] : null;
}

/**
 * Record one transaction.
 *
 * @param {object} history
 * @param {object} before document before the edit
 * @param {object} after document after the edit
 * @param {{ coalesce?: string|boolean|false, at?: number, label?: string,
 *           window?: number }} [opts]
 * @returns {object} a NEW history (the input is never mutated)
 */
export function historyRecord(history, before, after, { coalesce = false, at, label, window = COALESCE_WINDOW_MS } = {}) {
  // A "smart" edit can compute the same text back (formatter no-op, auto-pair
  // that had nothing to do); those must not create an empty undo step.
  if (textOf(before) === textOf(after)) return history;

  const kind = coalesce === false || coalesce == null
    ? false
    : (coalesce === true ? 'typing' : String(coalesce));
  const now = Number.isFinite(at) ? at : Date.now();
  const entry = { before, after, kind, at: now, label: label || null };

  const last = history.past[history.past.length - 1];
  const canMerge = !!last
    && kind !== false
    && last.kind === kind
    && COALESCE_KINDS.has(kind)
    && Number.isFinite(last.at)
    && now - last.at <= window;

  if (canMerge) {
    // Keep the run's ORIGINAL before (that is what one undo must restore) and
    // take the newest after.
    const merged = { ...last, after, at: now };
    return { ...history, past: [...history.past.slice(0, -1), merged], future: [] };
  }

  const past = [...history.past, entry];
  if (past.length > history.limit) past.splice(0, past.length - history.limit);
  // Any new edit invalidates the redo branch (spec §8.2).
  return { ...history, past, future: [] };
}

/** Undo once. Returns `{ doc, history, entry }` or null when there is nothing. */
export function historyUndo(history) {
  if (!history.past.length) return null;
  const entry = history.past[history.past.length - 1];
  return {
    doc: entry.before,
    entry,
    history: {
      ...history,
      past: history.past.slice(0, -1),
      future: [...history.future, entry],
    },
  };
}

/** Redo once. Returns `{ doc, history, entry }` or null when there is nothing. */
export function historyRedo(history) {
  if (!history.future.length) return null;
  const entry = history.future[history.future.length - 1];
  return {
    doc: entry.after,
    entry,
    history: {
      ...history,
      past: [...history.past, entry],
      future: history.future.slice(0, -1),
    },
  };
}

/** Drop all history (a file reset to its starter, a fresh checkout). */
export function historyClear(history) {
  return { ...history, past: [], future: [] };
}
