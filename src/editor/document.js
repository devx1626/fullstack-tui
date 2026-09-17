/**
 * Document model (overhaul §8.1, task 2.1).
 *
 * The classic model (`src/views/editor.js`) is MUTABLE and lets every caller
 * write `ed.lines[...]` directly; its "smart" edits rewrite the whole document
 * through `setTextAt`. That is why undo has to be bolted on from outside and
 * why nothing can be replayed reliably. This engine keeps the same line-array
 * representation but wraps it in a value with ONE mutation point:
 *
 *     applyEdit(doc, changes) → { doc, caret }
 *
 * Every change — a typed character, an auto-pair, an indent-on-enter, a paste,
 * a replace-all, a completion accept — is expressed as a list of
 * `{ start, end, text }` replacements and applied in a single pass against a
 * single immutable snapshot. Consequences that matter downstream:
 *
 *   - history stores (before, after) pairs and can undo in exactly one step
 *     per transaction, including multi-change ones (§8.2);
 *   - a multi-cursor batch is ONE transaction, so it is one undo step (§8.7);
 *   - the caret survives an edit it was not part of, because it is mapped
 *     through the change list rather than recomputed by the caller;
 *   - randomized property tests can assert that text is never corrupted,
 *     because there is one function that can corrupt it.
 *
 * Positions are `{ row, col }` in UTF-16 code units (row 0-based, col 0-based);
 * offsets are a flat index into `docText(doc)`. Both are clamped, never
 * silently wrapped.
 *
 * A SESSION holds the multi-file state: one document + one history per file,
 * with per-file language and view state (scroll, goal column) preserved when
 * switching tabs — "per-file cursor/scroll/undo preserved on tab switch"
 * (task 2.1) and "undo never crosses files" (task 2.2).
 */
import { createHistory, historyRecord, historyUndo, historyRedo, canUndo as historyCanUndo, canRedo as historyCanRedo } from './history.js';

// ---------------------------------------------------------------------------
// Positions and ranges
// ---------------------------------------------------------------------------

/** A position in the document. `row`/`col` are 0-based code-unit indexes. */
export function pos(row, col) {
  return { row: Math.max(0, row | 0), col: Math.max(0, col | 0) };
}

export function isPos(p) {
  return !!p && Number.isFinite(p.row) && Number.isFinite(p.col);
}

/** Compare two positions: -1 before, 0 equal, 1 after. */
export function cmpPos(a, b) {
  if (a.row !== b.row) return a.row < b.row ? -1 : 1;
  if (a.col !== b.col) return a.col < b.col ? -1 : 1;
  return 0;
}

export function eqPos(a, b) {
  return !!a && !!b && a.row === b.row && a.col === b.col;
}

export function minPos(a, b) {
  return cmpPos(a, b) <= 0 ? a : b;
}

export function maxPos(a, b) {
  return cmpPos(a, b) >= 0 ? a : b;
}

/** An ordered range from two positions (either order). */
export function range(a, b) {
  return cmpPos(a, b) <= 0 ? { start: a, end: b } : { start: b, end: a };
}

export function isEmptyRange(r) {
  return !!r && eqPos(r.start, r.end);
}

/** Overlap test for change validation and selection merging. */
export function rangesOverlap(a, b) {
  return cmpPos(a.start, b.end) < 0 && cmpPos(b.start, a.end) < 0;
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

/** Default per-file view state (scroll + the soft-wrap goal column). */
export function defaultView() {
  return { scrollTop: 0, scrollX: 0, goalCol: null };
}

/**
 * Build a document from text.
 *
 * @param {string} text
 * @param {{ caret?: {row,col}, view?: object, language?: string }} [opts]
 */
const clampPosRaw = (lines, p) => {
  const row = Math.max(0, Math.min(Number(p && p.row) || 0, lines.length - 1));
  return { row, col: Math.max(0, Math.min(Number(p && p.col) || 0, lines[row].length)) };
};

export function docFromText(text, { caret, view, language } = {}) {
  const lines = String(text ?? '').split('\n');
  const safe = lines.length ? lines : [''];
  const doc = {
    lines: safe,
    caret: clampPosRaw(safe, caret || pos(0, 0)),
    view: { ...defaultView(), ...(view || {}) },
  };
  if (language) doc.language = language;
  return doc;
}

/** Clamp a position into the document. */
export function clampPos(doc, p) {
  return clampPosRaw(doc.lines, p || doc.caret);
}

export function docText(doc) {
  return doc && Array.isArray(doc.lines) ? doc.lines.join('\n') : '';
}

export function lineCount(doc) {
  return doc.lines.length;
}

export function lineAt(doc, row) {
  return doc.lines[Math.max(0, Math.min(row | 0, doc.lines.length - 1))] || '';
}

// ---------------------------------------------------------------------------
// Offsets
// ---------------------------------------------------------------------------

/** Flat offset of a position in `docText(doc)`. */
export function offsetOf(doc, p = doc.caret) {
  const { row, col } = clampPos(doc, p);
  let n = 0;
  for (let i = 0; i < row; i += 1) n += doc.lines[i].length + 1;
  return n + col;
}

/** Inverse of `offsetOf`; clamps out-of-range and non-numeric offsets. */
export function posOf(doc, offset) {
  const text = docText(doc);
  const n = Math.max(0, Math.min(Number(offset) || 0, text.length));
  let row = 0;
  let lineStart = 0;
  for (let i = 0; i < n; i += 1) {
    if (text.charCodeAt(i) === 10) {
      row += 1;
      lineStart = i + 1;
    }
  }
  return { row, col: n - lineStart };
}

/** Caret accessors (kept in one place so the view can't reach around the model). */
export function caretOf(doc) {
  return doc.caret;
}

export function viewOf(doc) {
  return doc.view || defaultView();
}

export function moveCaret(doc, p) {
  return { ...doc, caret: clampPos(doc, p) };
}

export function setView(doc, patch) {
  return { ...doc, view: { ...viewOf(doc), ...patch } };
}

/** Caret position moved by a motion function, clamping at the document edges. */
export function moveCaretBy(doc, fn) {
  const moved = fn({ ...doc.caret }, doc);
  return moveCaret(doc, moved || doc.caret);
}

// ---------------------------------------------------------------------------
// Edits — the single mutation chokepoint
// ---------------------------------------------------------------------------

/**
 * Describe one replacement. Three call shapes, all of them things the editor
 * actually does:
 *   edit(range, 'text')        — replace a selection
 *   edit(start, end, 'text')   — replace [start, end)
 *   edit(position, 'text')     — insert at a position
 */
export function edit(a, b, c) {
  const isRange = !!a && a.start !== undefined && a.end !== undefined;
  if (typeof b === 'string' || b === undefined) {
    const text = typeof b === 'string' ? b : '';
    if (isRange) return { start: a.start, end: a.end, text };
    const at = a || pos(0, 0);
    return { start: at, end: at, text }; // a bare position means insertion
  }
  return { start: a, end: b, text: String(c ?? '') };
}

/**
 * Apply one or more changes in a single transaction.
 *
 * Changes are clamped into the document, sorted, and rejected if they overlap
 * (overlapping changes are a programming error: silently merging them would
 * make a multi-cursor bug look like a working edit). They are applied from the
 * last to the first so earlier offsets stay valid.
 *
 * @param {object} doc
 * @param {Array|object} changes a change, or a list of them
 * @param {{row,col}|null} [caret] explicit caret for the result; when omitted
 *   the existing caret is mapped through the changes (so an edit elsewhere
 *   never teleports the cursor).
 * @returns {{ doc: object, caret: {row,col} }}
 */
export function applyEdit(doc, changes, caret = null) {
  const list = normaliseChanges(doc, changes);
  if (!list.length) {
    return { doc, caret: caret ? clampPos(doc, caret) : doc.caret };
  }
  let lines = doc.lines.slice();
  for (let i = list.length - 1; i >= 0; i -= 1) {
    lines = applyOne(lines, list[i]);
  }
  const next = { ...doc, lines };
  // An explicit caret wins; otherwise the caret rides through the transaction.
  next.caret = caret ? clampPosRaw(lines, caret) : posOf(next, mapOffsetThrough(doc, list, offsetOf(doc, doc.caret)));
  return { doc: next, caret: next.caret };
}

/** Validate, clamp and sort changes; throws on overlapping ranges. */
export function normaliseChanges(doc, changes) {
  const raw = Array.isArray(changes) ? changes : (changes ? [changes] : []);
  const list = raw
    .map((c) => {
      const start = clampPos(doc, c.start);
      const end = clampPos(doc, c.end || c.start);
      const [a, b] = cmpPos(start, end) <= 0 ? [start, end] : [end, start];
      return { start: a, end: b, text: String(c.text ?? '') };
    })
    .filter((c) => !(eqPos(c.start, c.end) && c.text === ''))
    .sort((x, y) => cmpPos(x.start, y.start) || cmpPos(x.end, y.end));
  for (let i = 1; i < list.length; i += 1) {
    const prev = list[i - 1];
    const cur = list[i];
    // Touching at a point is fine (insert-at-a-position twice is ordered);
    // genuinely overlapping ranges are not.
    if (cmpPos(cur.start, prev.end) < 0) {
      throw new Error(
        `applyEdit: changes overlap (${prev.start.row}:${prev.start.col}..${prev.end.row}:${prev.end.col} `
        + `vs ${cur.start.row}:${cur.start.col}..${cur.end.row}:${cur.end.col})`,
      );
    }
  }
  return list;
}

/** Splice one change into a line array (the only place `lines` is written). */
function applyOne(lines, change) {
  const out = lines.slice();
  const { start, end, text } = change;
  const before = out[start.row].slice(0, start.col);
  const after = out[end.row].slice(end.col);
  const inserted = text.split('\n');
  if (inserted.length === 1) {
    out.splice(start.row, end.row - start.row + 1, before + inserted[0] + after);
  } else {
    const tail = inserted[inserted.length - 1] + after;
    out.splice(start.row, end.row - start.row + 1, before + inserted[0], ...inserted.slice(1, -1), tail);
  }
  return out;
}

/**
 * Map an OLD offset through a batch of changes.
 *
 * The rules, which are the ones an editor must have to feel right:
 *   - an edit strictly AFTER the caret leaves it alone (no teleporting);
 *   - typing AT the caret (a pure insertion) leaves the caret after the typed
 *     text — otherwise the next character would appear before the last one;
 *   - an offset inside a replaced range collapses to the end of the
 *     replacement, which is what makes "type over a selection" work;
 *   - a deletion starting at the caret leaves it where it is.
 */
export function mapOffsetThrough(doc, changes, offset) {
  const list = normaliseChanges(doc, changes);
  let shift = 0;
  for (const c of list) {
    const start = offsetOf(doc, c.start);
    const end = offsetOf(doc, c.end);
    const inserted = c.text.length;
    if (offset < start) return offset + shift; // strictly before this change
    if (start === end) {
      // Pure insertion at or before the caret: the caret moves along with it.
      shift += inserted;
      continue;
    }
    if (offset <= end) return start + shift + inserted; // inside the replaced range
    shift += inserted - (end - start); // after it
  }
  return offset + shift;
}

// Convenience wrappers — all of them go through applyEdit, no exceptions.
export function insertAt(doc, text, at = doc.caret) {
  return applyEdit(doc, { start: at, end: at, text }, null);
}

export function deleteRange(doc, r, caret) {
  return applyEdit(doc, { start: r.start, end: r.end, text: '' }, caret);
}

export function replaceRange(doc, r, text, caret) {
  return applyEdit(doc, { start: r.start, end: r.end, text }, caret);
}

/**
 * Replace the whole document, optionally placing the caret at an offset.
 * The new-engine equivalent of the classic `setText` / `setTextAt`, kept
 * because smart edits (auto-pair, accept-completion) compute on full text.
 */
export function setText(doc, text, caretOffset = null) {
  const next = docFromText(text, { view: doc.view, language: doc.language });
  if (caretOffset != null) next.caret = posOf(next, caretOffset);
  return { doc: next, caret: next.caret };
}

// ---------------------------------------------------------------------------
// Session — multi-file tabs with per-file history and view state
// ---------------------------------------------------------------------------

/**
 * Create the multi-file editor state.
 *
 * @param {Record<string, string>} files name → initial text (classic `emptyEditors`)
 * @param {{ order?: string[], active?: string, tabSize?: number, historyLimit?: number,
 *           languages?: Record<string,string> }} [opts]
 */
export function createSession(files = {}, { order, active, tabSize = 2, historyLimit = 1000, languages = {} } = {}) {
  const names = order || Object.keys(files);
  const state = {};
  for (const name of names) {
    state[name] = {
      doc: docFromText(files[name] ?? '', { language: languages[name] }),
      history: createHistory({ limit: historyLimit }),
    };
  }
  const first = names[0] || null;
  return {
    order: names,
    active: active || first,
    files: state,
    tabSize,
  };
}

export function sessionNames(session) {
  return session.order.slice();
}

export function sessionDoc(session, name = session.active) {
  const file = session.files[name];
  return file ? file.doc : null;
}

export function activeFile(session) {
  return session.files[session.active] || null;
}

/** Caret of a file (default: the active one) — the session-level accessor. */
export function sessionCaret(session, name = session.active) {
  const file = session.files[name];
  return file ? file.doc.caret : pos(0, 0);
}

/** Text of every file, classic `editorTexts` shape (`{ name: text }`). */
export function sessionTexts(session) {
  const out = {};
  for (const name of session.order) {
    const file = session.files[name];
    if (file) out[name] = docText(file.doc);
  }
  return out;
}

export function sessionText(session, name = session.active) {
  const file = session.files[name];
  return file ? docText(file.doc) : '';
}

/** Switch the active file. Per-file caret, scroll and history come along. */
export function sessionFocus(session, name) {
  if (!session.files[name] || name === session.active) return session;
  return { ...session, active: name };
}

/** The next / previous file name, for Ctrl+W / Ctrl+Q (wraps, like the classic). */
export function sessionStep(session, delta) {
  const { order, active } = session;
  if (!order.length) return null;
  const at = order.indexOf(active);
  const next = order[(((at < 0 ? 0 : at) + delta) % order.length + order.length) % order.length];
  return next === active && order.length === 1 ? null : next;
}

export function sessionSetText(session, name, text, caretOffset = null, opts = {}) {
  const file = session.files[name];
  if (!file) return session;
  const { doc } = setText(file.doc, text, caretOffset);
  return commit(session, name, doc, opts);
}

/** Replace a file's text wholesale (record-backed loads, reset-to-starter). */
export function sessionResetFile(session, name, text, opts = {}) {
  return sessionSetText(session, name, text, 0, opts);
}

/**
 * Apply a transaction to one file and record it in that file's history.
 * This is the ONE way an edit enters a session.
 *
 * @param {object} session
 * @param {Array|object} changes
 * @param {{ caret?: object, name?: string, coalesce?: string|false, at?: number,
 *           label?: string, history?: boolean }} [opts]
 */
export function sessionEdit(session, changes, opts = {}) {
  const name = opts.name || session.active;
  const file = session.files[name];
  if (!file) return session;
  const { doc } = applyEdit(file.doc, changes, opts.caret || null);
  return commit(session, name, doc, opts);
}

/** Swap in a new document for a file, recording history unless told not to. */
export function commit(session, name, doc, { history = true, coalesce = false, at, label } = {}) {
  const file = session.files[name];
  if (!file) return session;
  const next = { ...session, files: { ...session.files } };
  next.files[name] = {
    ...file,
    doc,
    history: history ? historyRecord(file.history, file.doc, doc, { coalesce, at, label }) : file.history,
  };
  return next;
}

export function sessionUndo(session, name = session.active) {
  const file = session.files[name];
  if (!file) return session;
  const step = historyUndo(file.history);
  if (!step) return session;
  return { ...session, files: { ...session.files, [name]: { ...file, doc: step.doc, history: step.history } } };
}

export function sessionRedo(session, name = session.active) {
  const file = session.files[name];
  if (!file) return session;
  const step = historyRedo(file.history);
  if (!step) return session;
  return { ...session, files: { ...session.files, [name]: { ...file, doc: step.doc, history: step.history } } };
}

export function sessionCanUndo(session, name = session.active) {
  const file = session.files[name];
  return !!file && historyCanUndo(file.history);
}

export function sessionCanRedo(session, name = session.active) {
  const file = session.files[name];
  return !!file && historyCanRedo(file.history);
}

export function sessionHistory(session, name = session.active) {
  const file = session.files[name];
  return file ? file.history : null;
}

/** Set a per-file view value (scroll, goal column) without touching history. */
export function sessionSetView(session, name, patch) {
  const file = session.files[name || session.active];
  if (!file) return session;
  return {
    ...session,
    files: { ...session.files, [name || session.active]: { ...file, doc: setView(file.doc, patch) } },
  };
}
