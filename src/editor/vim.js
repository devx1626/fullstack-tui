/**
 * Vim state machine (overhaul §8.8 / Appendix B.5, task 2.4).
 *
 * A PURE REDUCER. `reduceKey(state, key, ctx)` returns the next state plus the
 * next document, registers and whatever the caller must do (undo, scroll, copy
 * to the OS clipboard, run a registry command). It never touches React, stdin,
 * or the classic app, so the whole key table is unit-testable and the Ink
 * component is a thin binding.
 *
 * ```
 * const r = reduceKey(state, key, { doc, registers, tabSize });
 * r.doc / r.state / r.registers    // new values
 * r.changed                        // did the document move? (history decides)
 * r.kind / r.coalesce              // history hints: 'typing' | 'operator' | …
 * r.request                        // {type:'undo'} | {type:'scroll'} | …
 * r.command                        // {id,title} — a REGISTRY command to run
 * r.consumed                       // false → let the dispatcher have the key
 * ```
 *
 * Three rules worth stating because they are deliberate:
 *
 *  1. **Ctrl+C and Ctrl+K are never consumed.** §8.8 requires Ctrl+C to keep
 *     quitting (beginner safety) and §10.3 requires Ctrl+K to reach the palette
 *     from everywhere, including the editor. Anything else the machine does not
 *     bind comes back `consumed: false`, so global commands still work.
 *  2. **`:w` and friends are not editor functions.** ex-lite parses to a
 *     registry command ID (`vim/ex.js`), so `:w` checks the challenge code
 *     because `challenge.check` does — vim does not know what checking is.
 *  3. **The `:` and `/` lines are owned here** (`state.input`), not by a screen
 *     overlay. One owner means the pending command line cannot drift from the
 *     document it is about, and the footer just renders `state.input.text`.
 *     `:%s/x/y/c` runs its confirm-each loop on `y`/`n`/`a`/`q` in the editor
 *     itself, so confirm-each works with no extra UI to wire.
 *
 * `.` repeat is a RECIPE, not a stored diff: `{type:'operator', op, motion}` is
 * re-run at the new caret, exactly like vim. Replaying literal changes would
 * paste text from the old location into the new one.
 */
import {
  applyEdit, clampPos, cmpPos, eqPos, pos,
} from './document.js';
import {
  BLOCKWISE, CHARWISE, LINEWISE, createRegisters, normaliseRegisterName, put, readRegister, yank,
} from './registers.js';
import * as S from './selection.js';
import { applyMotion, MOTION_TOKENS, nextMatch, searchMatches, searchPattern } from './vim/motions.js';
import {
  OPERATOR_NAMES, applyOperator, blockInsertChanges, deleteCharChanges, deleteLineChanges,
  joinChanges, putChanges, replaceCharChanges, resolveTarget,
} from './vim/operators.js';
import { describeEx, parseEx } from './vim/ex.js';
// The substitution plan lives in `search.js` so `:s`, the confirm-each loop and
// the palette's replace-all cannot produce different change lists.
import { substitutePlan } from './search.js';

export const VIM_MODES = {
  NORMAL: 'normal',
  INSERT: 'insert',
  VISUAL: 'visual',
  VISUAL_LINE: 'visual-line',
  VISUAL_BLOCK: 'visual-block',
  REPLACE: 'replace',
  OPERATOR: 'operator-pending',
  EX: 'ex',
  SEARCH: 'search',
};

const OPERATOR_LABELS = {
  d: 'DELETE', c: 'CHANGE', y: 'YANK', '>': 'INDENT', '<': 'OUTDENT', gu: 'LOWER', gU: 'UPPER', gc: 'COMMENT',
};

const MODE_LABELS = {
  [VIM_MODES.NORMAL]: 'NORMAL',
  [VIM_MODES.INSERT]: 'INSERT',
  [VIM_MODES.VISUAL]: 'VISUAL',
  [VIM_MODES.VISUAL_LINE]: 'V-LINE',
  [VIM_MODES.VISUAL_BLOCK]: 'V-BLOCK',
  [VIM_MODES.REPLACE]: 'REPLACE',
  [VIM_MODES.EX]: 'EX',
  [VIM_MODES.SEARCH]: 'SEARCH',
};

/** Auto-pair table (§8.9 "preserving smart-pair integration"). */
export const PAIRS = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`' };
const CLOSERS = new Set(Object.values(PAIRS));
const OPENERS = new Set(Object.keys(PAIRS));

/** Keys the machine must never claim (rule 1 in the header). */
export const NEVER_CONSUMED = new Set(['ctrl-c', 'ctrl-k']);

/** Arrow keys always move the caret, in every mode (tour copy, §9). */
const ARROW_TO_MOTION = {
  left: 'h', right: 'l', up: 'k', down: 'j',
  'shift-left': 'h', 'shift-right': 'l', 'shift-up': 'k', 'shift-down': 'j',
};

export function createVimState({
  mode = VIM_MODES.NORMAL, enabled = true, register = '"', clipboard = 'auto',
} = {}) {
  return {
    enabled,
    mode,
    clipboard,
    register,
    appendRegister: false,
    count: '',
    operator: null,
    opCount: '',
    pending: null, // {kind:'g'|'find'|'replace'|'mark'|'register', arg}
    lastFind: null, // {ch, dir, till} for ; and ,
    lastChange: null, // the `.` recipe
    search: { pattern: '', dir: 1, regex: false, smartCase: true },
    jumpBack: null, // `` returns here
    anchor: null, // visual-mode anchor
    input: null, // {kind:'ex'|'search', text:'', dir}
    confirm: null, // {plan, index, applied} for `:s///c`
    blockInsert: null, // {rect, at, typed}
    insertBuffer: null, // chars typed since insert was entered (for `.`)
    status: null,
  };
}

/** Footer text: `-- INSERT --`-style, plus the pending count/operator. */
export function modeLabel(state) {
  if (!state || !state.enabled) return 'MODELESS';
  if (state.mode === VIM_MODES.OPERATOR) {
    const label = OPERATOR_LABELS[state.operator] || 'OPERATOR';
    return `${state.count}${state.operator || ''}·${label}`.replace('·', ' ');
  }
  const base = MODE_LABELS[state.mode] || String(state.mode).toUpperCase();
  return state.count ? `${state.count}·${base}` : base;
}

/**
 * The selection to render for the current visual mode (or null).
 *
 * Block mode is the one place vim's caret is INCLUSIVE of the character under
 * it: `<C-v>jd` deletes the column the cursor sits on. Our caret is a boundary,
 * so the block's far corner moves one column further out to include both corner
 * characters — otherwise a canonical one-column block would be empty.
 */
export function visualSelection(state, doc) {
  if (!state || !state.anchor || !isVisual(state.mode)) return null;
  if (state.mode === VIM_MODES.VISUAL_BLOCK) return blockSelection(state, doc);
  const sel = S.createSelection(state.anchor, doc.caret);
  if (state.mode === VIM_MODES.VISUAL_LINE) return S.linewise(doc, sel);
  return sel;
}

/** The blockwise selection, with both corner characters included. */
export function blockSelection(state, doc) {
  if (!state || !state.anchor) return null;
  const anchor = state.anchor;
  const head = doc.caret;
  const out = anchor.col <= head.col
    ? S.createSelection(anchor, pos(head.row, head.col + 1))
    : S.createSelection(pos(anchor.row, anchor.col + 1), head);
  // A one-cell block still has to be a selection even when both corners are the
  // same position (createSelection returns null for an empty pair).
  return out || S.createSelection(anchor, pos(anchor.row, anchor.col + 1));
}

export function isVisual(mode) {
  return mode === VIM_MODES.VISUAL || mode === VIM_MODES.VISUAL_LINE || mode === VIM_MODES.VISUAL_BLOCK;
}

const visualBlock = (mode) => mode === VIM_MODES.VISUAL_BLOCK;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Normalise a key event (or a bare string, for tests) into `{name, char, token}`. */
export function keySpec(key) {
  if (typeof key === 'string') {
    return { name: key, char: key.length === 1 ? key : null, token: key, shift: false };
  }
  const name = key.name || '';
  const char = key.char || null;
  const token = name === 'char' || name === 'space' ? (char ?? (name === 'space' ? ' ' : '')) : name;
  return { name, char, token, shift: !!(key.shift || /^shift-/.test(name)) };
}

const asCount = (text, fallback = 1) => {
  const n = parseInt(text === '' ? String(fallback) : text, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
};

const withCaret = (doc, p) => ({ ...doc, caret: clampPos(doc, p) });

/** Apply a change list (or just move the caret when there is nothing to apply). */
function applyChanges(doc, changes, caret) {
  const list = (changes || []).filter((c) => c && (c.text !== '' || cmpPos(c.start, c.end) !== 0));
  if (!list.length) return { doc: withCaret(doc, caret ?? doc.caret), changed: false };
  const out = applyEdit(doc, list, caret ?? null);
  return { doc: out.doc, changed: true };
}

function base(state, doc, registers) {
  return {
    state,
    doc,
    registers,
    changed: false,
    consumed: true,
    kind: null,
    coalesce: false,
    status: null,
    request: null,
    command: null,
    selection: visualSelection(state, doc),
  };
}

/**
 * Build a result. `patch.mark` records the caret to come back to with `` `` ``
 * (the jump-back mark), which is why the pre-move caret has to be passed in
 * rather than read from the result document.
 */
const done = (state, doc, registers, patch = {}) => {
  const withMark = patch.mark ? { ...state, jumpBack: patch.mark } : state;
  const out = base(withMark, doc, registers);
  Object.assign(out, patch);
  out.state = { ...withMark, status: patch.status ?? null };
  out.selection = patch.selection !== undefined ? patch.selection : visualSelection(out.state, doc);
  return out;
};

/** Where the caret was, for the `` `` `` mark. */
const caretBefore = (doc) => ({ ...doc.caret });

// ---------------------------------------------------------------------------
// The reducer
// ---------------------------------------------------------------------------

/**
 * @param {object} state from `createVimState`
 * @param {string|object} key a key event ({name, char}) or a bare key name
 * @param {{doc, registers?, tabSize?, lineComment?, now?, autoPair?}} ctx
 */
export function reduceKey(state, key, ctx = {}) {
  const doc = ctx.doc;
  const registers = ctx.registers || createRegisters();
  if (!state || !state.enabled) return doorClosed(doc, state, registers);
  if (!doc || !Array.isArray(doc.lines)) return doorClosed(doc, state, registers);

  const spec = keySpec(key);
  if (NEVER_CONSUMED.has(spec.token)) return doorClosed(doc, state, registers);
  if (spec.token === 'ctrl-c' || spec.token === 'ctrl-k') return doorClosed(doc, state, registers);

  // A pending confirm-each prompt owns y/n/a/q before anything else.
  if (state.confirm) return confirmKey(state, spec, ctx, registers);
  if (state.blockInsert) return blockInsertKey(state, spec, ctx, registers);

  switch (state.mode) {
    case VIM_MODES.INSERT: return insertKey(state, spec, ctx, registers);
    case VIM_MODES.REPLACE: return replaceKey(state, spec, ctx, registers);
    case VIM_MODES.EX:
    case VIM_MODES.SEARCH: return inputKey(state, spec, ctx, registers);
    case VIM_MODES.VISUAL:
    case VIM_MODES.VISUAL_LINE:
    case VIM_MODES.VISUAL_BLOCK: return visualKey(state, spec, ctx, registers);
    case VIM_MODES.OPERATOR: return operatorKey(state, spec, ctx, registers);
    default: return normalKey(state, spec, ctx, registers);
  }
}

/** Unhandled/never-consumed key: hand it back to the dispatcher unchanged. */
function doorClosed(doc, state, registers) {
  return { ...base(state, doc, registers), consumed: false, state };
}

// ---------------------------------------------------------------------------
// Normal mode
// ---------------------------------------------------------------------------

function normalKey(state, spec, ctx, registers) {
  const { doc } = ctx;
  const t = spec.token;

  // Counts. `0` is a motion only when no count is in progress.
  if (/^[0-9]$/.test(t) && !(t === '0' && state.count === '')) {
    const next = { ...state, count: `${state.count}${t}`.replace(/^0+/, '') || '0' };
    return done(next, doc, registers, { status: next.count });
  }

  if (t === 'escape') {
    return done(cleared(state), doc, registers);
  }

  if (t === 'ctrl-z' || t === 'ctrl-s') {
    return done(cleared(state), doc, registers, { request: { type: 'undo' } });
  }
  if (t === 'ctrl-r') {
    return done(cleared(state), doc, registers, { request: { type: 'redo' } });
  }
  if (t === 'ctrl-f') return scroll(state, doc, registers, 1, 'page');
  if (t === 'ctrl-b') return scroll(state, doc, registers, -1, 'page');
  if (t === 'ctrl-d') return scroll(state, doc, registers, 1, 'half');
  if (t === 'ctrl-u') return scroll(state, doc, registers, -1, 'half');
  if (t === 'ctrl-w') return tabRequest(state, doc, registers, 1);
  if (t === 'ctrl-q') return tabRequest(state, doc, registers, -1);
  if (t === 'ctrl-o' || t === 'ctrl-i') return doorClosed(doc, state, registers);

  // Pending two-key families.
  if (state.pending) return pendingKey(state, spec, ctx, registers);

  if (t === '"') return done({ ...state, pending: { kind: 'register' } }, doc, registers);
  if (t === '`' || t === "'") return jumpBack(state, doc, registers);
  if (t === 'g') return done({ ...state, pending: { kind: 'g' } }, doc, registers);
  if (t === 'f' || t === 'F' || t === 't' || t === 'T' || t === 'r') {
    return done({ ...state, pending: { kind: t === 'r' ? 'replace' : 'find', arg: t } }, doc, registers);
  }

  if (t === ':') return openInput(state, doc, registers, 'ex');
  if (t === '/' || t === '?') return openInput(state, doc, registers, 'search', t === '/' ? 1 : -1);
  if (t === 'n' || t === 'N') return searchNext(state, doc, registers, t === 'n' ? 1 : -1);
  if (t === '.') return repeatChange(state, ctx, registers);
  if (t === 'u') return done(cleared(state), doc, registers, { request: { type: 'undo' } });
  if (t === 'p' || t === 'P') return putRegister(state, doc, registers, t === 'p');
  if (t === 'J') return simpleEdit(state, doc, registers, {
    changes: joinChanges(doc, doc.caret, asCount(state.count)).changes, caret: doc.caret, kind: 'join', name: 'J',
  });

  // Operators (including the doubling forms `dd`, `yy`, `>>`, `<<`).
  if (t === 'd' || t === 'c' || t === 'y' || t === '>' || t === '<') {
    return done({ ...state, operator: t, mode: VIM_MODES.OPERATOR, pending: null, opCount: '' }, doc, registers);
  }

  if (t === ';' || t === ',') return repeatFind(state, doc, registers, t === ',');

  if (t === 'v' || t === 'V' || t === 'ctrl-v') {
    const mode = t === 'v' ? VIM_MODES.VISUAL : t === 'V' ? VIM_MODES.VISUAL_LINE : VIM_MODES.VISUAL_BLOCK;
    return done({ ...state, mode, anchor: doc.caret, count: '' }, doc, registers);
  }

  if (t === 'i') return enterInsert(state, doc, registers, 'i');
  if (t === 'a') return enterInsert(state, doc, registers, 'a', { forward: 1 });
  if (t === 'I') return enterInsert(state, doc, registers, 'I', { at: 'firstNonBlank' });
  if (t === 'A') return enterInsert(state, doc, registers, 'A', { at: 'lineEnd' });
  if (t === 'o' || t === 'O') return openLine(state, doc, registers, t === 'o');
  if (t === 's') {
    const count = asCount(state.count);
    const del = deleteCharChanges(doc, doc.caret, { count });
    const applied = applyChanges(doc, del.changes, del.caret);
    return enterInsert(
      { ...state, lastChange: { type: 'insert', entry: 's', text: '' } },
      applied.doc, registers, 's', { skipEdit: true },
    );
  }
  if (t === 'R') return done({ ...state, mode: VIM_MODES.REPLACE, insertBuffer: '' }, doc, registers);

  if (t === 'x' || t === 'X') {
    const count = asCount(state.count);
    const out = deleteCharChanges(doc, doc.caret, { count, backward: t === 'X' });
    const next = out.changes.length
      ? yank(registers, out.text, { name: state.register, kind: CHARWISE })
      : registers;
    return simpleEdit(state, doc, next, {
      changes: out.changes, caret: out.caret, kind: 'delete', name: t, count,
      status: out.changes.length ? `deleted ${out.changes.length} char(s)` : 'nothing to delete',
    });
  }

  if (t === 'D') return runOperatorFrom(state, ctx, registers, 'd', doc.caret, { token: '$', count: 1, explicitCount: true });
  if (t === 'C') return runOperatorFrom(state, ctx, registers, 'c', doc.caret, { token: '$', count: 1, explicitCount: true });
  if (t === 'Y') return runOperatorFrom(state, ctx, registers, 'y', doc.caret, { token: 'j', count: 0, linewise: 'line' });

  if (t === '%') {
    const m = applyMotion(doc, doc.caret, '%', { count: asCount(state.count) });
    return moveResult(state, ctx, registers, m, { jumped: true });
  }
  if (t === '*' || t === '#') return searchWord(state, doc, registers, t === '*');

  if (spec.name === 'pageup' || spec.name === 'pagedown') {
    return scroll(state, doc, registers, spec.name === 'pagedown' ? 1 : -1, 'page');
  }
  if (spec.name === 'home') return moveResult(state, ctx, registers, { caret: S.lineStart(doc, doc.caret.row) });
  if (spec.name === 'end') return moveResult(state, ctx, registers, { caret: S.lineEnd(doc, doc.caret.row) });
  if (spec.name === 'delete') {
    const out = deleteCharChanges(doc, doc.caret, { count: 1 });
    return simpleEdit(state, doc, registers, { changes: out.changes, caret: out.caret, kind: 'delete', name: 'delete' });
  }
  if (spec.name === 'backspace') {
    const out = deleteCharChanges(doc, doc.caret, { count: 1, backward: true });
    return simpleEdit(state, doc, registers, { changes: out.changes, caret: out.caret, kind: 'delete', name: 'backspace' });
  }

  const token = ARROW_TO_MOTION[spec.name] || t;
  if (MOTION_TOKENS.has(token) && token !== 'gg') {
    const m = applyMotion(doc, doc.caret, token, {
      count: asCount(state.count),
      explicitCount: state.count !== '',
    });
    return moveResult(state, ctx, registers, m, { jumped: token === 'G' });
  }

  return doorClosed(doc, state, registers);
}

/** A pure movement (no edit); a big jump records the `` `` `` mark. */
function moveResult(state, ctx, registers, motion, { jumped = false } = {}) {
  const doc = ctx.doc;
  const next = { ...state, count: '' };
  if (next.operator) return finishOperator(next, ctx, registers, motion);
  const moved = withCaret(doc, motion.caret);
  return done(next, moved, registers, {
    mark: jumped ? caretBefore(doc) : null,
    status: motion.failed ? 'no match' : null,
  });
}

// ---------------------------------------------------------------------------
// Pending two-key families (g, f/F/t/T, r, ", `` ` ``)
// ---------------------------------------------------------------------------

function pendingKey(state, spec, ctx, registers) {
  const { doc } = ctx;
  const pending = state.pending;
  const t = spec.token;

  if (pending.kind === 'register') {
    const name = normaliseRegisterName(spec.char);
    if (!name) return done(cleared(state), doc, registers, { status: `no register “${spec.char ?? ''}”` });
    // `"A` appends to `a`: uppercase means append.
    const append = /[A-Z]/.test(spec.char);
    return done({
      ...state, register: append ? spec.char.toLowerCase() : name, appendRegister: append, pending: null,
    }, doc, registers, { status: `register ${name}` });
  }

  if (pending.kind === 'g') {
    const next = { ...state, pending: null };
    if (t === 'g') {
      const m = applyMotion(doc, doc.caret, 'gg', { count: asCount(state.count) });
      return moveResult(next, ctx, registers, m, { jumped: true });
    }
    if (t === 'G') {
      const m = applyMotion(doc, doc.caret, 'G', { count: asCount(state.count), explicitCount: state.count !== '' });
      return moveResult(next, ctx, registers, m, { jumped: true });
    }
    if (t === 'u') return startOperatorOrApply(next, ctx, registers, 'gu');
    if (t === 'U') return startOperatorOrApply(next, ctx, registers, 'gU');
    if (t === 'c') return startOperatorOrApply(next, ctx, registers, 'gc');
    if (t === 'v') {
      // `gv` reselects the last visual range.
      if (!state.lastVisual) return done(next, doc, registers, { status: 'no previous selection' });
      return done({ ...next, ...state.lastVisual }, doc, registers);
    }
    return done(next, doc, registers, { status: `unknown g${t}` });
  }

  if (pending.kind === 'find') {
    const kind = pending.arg;
    const dir = kind === 'f' || kind === 't' ? 1 : -1;
    const till = kind === 't' || kind === 'T';
    const ch = spec.char;
    if (!ch) return done(cleared(state), doc, registers);
    const next = { ...state, pending: null, count: '', lastFind: { ch, dir, till } };
    if (next.operator) {
      const motion = applyMotion(doc, doc.caret, kind, { arg: ch, count: asCount(state.count), explicitCount: true });
      return finishOperator(next, ctx, registers, { ...motion, token: kind, arg: ch });
    }
    const m = applyMotion(doc, doc.caret, kind, { arg: ch, count: asCount(state.count) });
    return moveResult(next, ctx, registers, m);
  }

  if (pending.kind === 'replace') {
    if (!spec.char) return done(cleared(state), doc, registers);
    const count = asCount(state.count);
    const out = replaceCharChanges(doc, doc.caret, spec.char, count);
    return simpleEdit(state, doc, registers, {
      changes: out.changes, caret: out.caret, kind: 'replaceChar', name: 'r', ch: spec.char, count,
      status: out.changes.length ? `replaced ${count} char(s)` : 'nothing to replace',
    });
  }

  return done(cleared(state), doc, registers);
}

/**
 * An operator that can double (`dd`) or be followed by another operator key
 * (`gu`/`gU`/`gc` are already two-key, so they never double).
 */
/** `D` / `C` / `Y` — an operator with its motion already decided. */
function runOperatorFrom(state, ctx, registers, op, start, motion) {
  const { doc } = ctx;
  const withOp = { ...state, operator: op, mode: VIM_MODES.OPERATOR };
  if (motion.linewise === 'line') {
    const row = Math.min(start.row, doc.lines.length - 1);
    return finishOperator(withOp, ctx, registers, {
      caret: pos(row, 0), linewise: true, explicitCount: true, doubling: true, token: null,
    }, { count: 1 });
  }
  const m = applyMotion(doc, start, motion.token, { count: motion.count, explicitCount: true });
  return finishOperator(withOp, ctx, registers, { ...m, token: motion.token, arg: motion.arg ?? null }, { count: motion.count });
}

function startOperatorOrApply(state, ctx, registers, op) {
  const { doc } = ctx;
  if (state.operator) {
    return finishOperator(state, ctx, registers, { caret: { ...doc.caret }, linewise: false });
  }
  return done({ ...state, operator: op, mode: VIM_MODES.OPERATOR, opCount: '' }, doc, registers);
}

// ---------------------------------------------------------------------------
// Operator-pending
// ---------------------------------------------------------------------------

function operatorKey(state, spec, ctx, registers) {
  const { doc } = ctx;
  const t = spec.token;
  const op = state.operator;

  if (t === 'escape') return done({ ...cleared(state), mode: VIM_MODES.NORMAL }, doc, registers);
  if (/^[0-9]$/.test(t) && !(t === '0' && state.opCount === '')) {
    return done({ ...state, opCount: `${state.opCount}${t}` }, doc, registers);
  }
  if (MOTION_TOKENS.has(t)) {
    const count = asCount(state.opCount) * asCount(state.count);
    const motion = applyMotion(doc, doc.caret, t, {
      count, arg: spec.arg || null, goalCol: null,
      // `dG` with no count must go to the LAST line, so "explicit" means the
      // user typed digits — not "we are inside an operator".
      explicitCount: state.count !== '' || state.opCount !== '',
    });
    return finishOperator(state, ctx, registers, { ...motion, token: t, arg: spec.arg || null }, { count });
  }
  if (t === ';' || t === ',') return repeatFind(state, doc, registers, t === ',');
  if (t === 'g') return done({ ...state, pending: { kind: 'g' } }, doc, registers);
  if (t === 'f' || t === 'F' || t === 't' || t === 'T') {
    return done({ ...state, pending: { kind: 'find', arg: t } }, doc, registers);
  }

  // Doubling (`dd`, `yy`, `cc`, `>>`, `<<`, `gcc`, `guu`) applies the operator
  // to the lines the caret is on — but ONLY on the operator's own key. Any other
  // unbound key cancels instead: treating `dy` as `dd` (a typo'd motion) deleted
  // a line silently, which is the worst possible failure mode for an editor.
  const doubleKey = op && op.length === 2 ? op[1] : op;
  if (t === doubleKey) {
    // Both counts count: `2d2d` is four lines.
    const lines = Math.max(1, asCount(state.opCount) * asCount(state.count));
    const lastRow = Math.min(doc.caret.row + lines - 1, doc.lines.length - 1);
    const motion = { caret: pos(lastRow, 0), linewise: true, explicitCount: true, doubling: true, token: null };
    return finishOperator(state, ctx, registers, motion, { count: lines });
  }
  return done({ ...cleared(state), mode: VIM_MODES.NORMAL }, doc, registers, { status: `no motion '${t}' for ${op}` });
}

/** `d`/`c`/`y` + a resolved motion (or a visual selection). */
function finishOperator(state, ctx, registers, motion, { count = 1, selection = null, mode = 'char', expanded = false } = {}) {
  const { doc } = ctx;
  const op = state.operator;
  let target = resolveTarget(doc, doc.caret, motion, { selection, mode, expanded });
  // `cc` keeps the line and its indent (vim's behaviour), so the change is the
  // line CONTENT rather than the line including its newline. Only for a single
  // line: `c2j` really does replace whole lines. A one-line range ends at
  // column 0 of the NEXT row, so "one line" is that shape — not `start.row ===
  // end.row`, which never happens for a line that has a line after it.
  const oneLine = target.range.end.row === target.range.start.row
    || (target.range.end.col === 0 && target.range.end.row === target.range.start.row + 1);
  if (op === 'c' && target.linewise && oneLine) {
    const row = target.range.start.row;
    target = {
      ...target,
      range: { start: S.firstNonBlank(doc, row), end: S.lineEnd(doc, row) },
    };
  }
  const res = applyOperator({
    doc,
    operator: op,
    target,
    registers,
    registerName: state.register,
    tabSize: ctx.tabSize ?? 2,
    lineComment: ctx.lineComment ?? '//',
  });
  const applied = applyChanges(doc, res.changes, res.caret);
  // The operated text, for the OSC52 copy request (yanks only — copying on
  // every delete would spam the system clipboard).
  const yanked = target.blockwise && target.selection
    ? S.blockText(doc, target.selection)
    : S.selText(doc, { anchor: target.range.start, head: target.range.end });

  const next = {
    ...cleared(state),
    mode: res.enteredInsert ? VIM_MODES.INSERT : VIM_MODES.NORMAL,
    register: state.register,
    insertBuffer: res.enteredInsert ? '' : null,
    // A yank is not a change, so it never becomes the `.` recipe.
    lastChange: op === 'y'
      ? state.lastChange
      : { type: 'operator', op, count, motion: motionSpec(motion, count), register: state.register },
  };
  return {
    ...base(next, applied.doc, res.registers || registers),
    changed: applied.changed,
    kind: op === 'y' ? null : opToKind(op),
    coalesce: false,
    status: res.status,
    request: op === 'y' && yanked ? { type: 'clipboard', text: yanked } : null,
    selection: null,
    consumed: true,
  };
}

/** Keep the resolved motion as a REPEATABLE spec (`.` recomputes at the caret). */
function motionSpec(motion, combined) {
  if (!motion) return { token: 'j', count: 1, doubling: true };
  if (motion.doubling) return { token: 'j', count: combined, doubling: true };
  return {
    token: motion.token || null,
    arg: motion.arg ?? null,
    count: combined,
    doubling: false,
  };
}

function opToKind(op) {
  return {
    d: 'delete', c: 'change', y: 'yank', '>': 'indent', '<': 'outdent',
    gu: 'case', gU: 'case', gc: 'comment',
  }[op] || 'operator';
}

// ---------------------------------------------------------------------------
// Insert / replace mode
// ---------------------------------------------------------------------------

function enterInsert(state, doc, registers, entry, { at = null, forward = 0, skipEdit = false } = {}) {
  let caret = doc.caret;
  if (at === 'firstNonBlank') caret = S.firstNonBlank(doc, doc.caret.row);
  if (at === 'lineEnd') caret = S.lineEnd(doc, doc.caret.row);
  if (forward) caret = { row: caret.row, col: Math.min(caret.col + forward, doc.lines[caret.row].length) };
  const next = {
    ...cleared(state),
    mode: VIM_MODES.INSERT,
    insertBuffer: '',
    lastChange: { type: 'insert', entry, text: '' },
  };
  return done(next, withCaret(doc, caret), registers);
}

function insertKey(state, spec, ctx, registers) {
  const { doc } = ctx;
  const t = spec.token;
  const now = ctx.now ?? Date.now();

  if (t === 'escape') {
    // Leaving insert steps the caret back onto the last character typed (vim),
    // and only at column 0 does it stay put.
    const caret = doc.caret.col > 0
      ? { row: doc.caret.row, col: doc.caret.col - 1 }
      : doc.caret;
    const lastChange = state.insertBuffer
      ? { type: 'insert', entry: (state.lastChange && state.lastChange.entry) || 'i', text: state.insertBuffer }
      : state.lastChange;
    return done({ ...state, mode: VIM_MODES.NORMAL, insertBuffer: null, lastChange, status: null }, withCaret(doc, caret), registers);
  }

  if (t === 'ctrl-z') return done(state, doc, registers, { request: { type: 'undo' } });
  if (t === 'ctrl-r' || t === 'shift-ctrl-z') return done(state, doc, registers, { request: { type: 'redo' } });
  if (t === 'ctrl-n') return done(state, doc, registers, { request: { type: 'completion', dir: 1 } });
  if (t === 'ctrl-p') return done(state, doc, registers, { request: { type: 'completion', dir: -1 } });

  if (t === 'backspace') {
    const out = smartBackspace(doc);
    return insertEdit(state, ctx, registers, out.changes, out.caret, 'typing', { buffer: 'backspace' });
  }
  if (spec.name === 'delete') {
    const out = deleteCharChanges(doc, doc.caret, { count: 1 });
    return insertEdit(state, ctx, registers, out.changes, out.caret, 'typing');
  }
  if (t === 'ctrl-w') {
    const out = deleteWordBefore(doc);
    return insertEdit(state, ctx, registers, out.changes, out.caret, 'typing');
  }
  if (t === 'ctrl-u') {
    const out = deleteToLineStart(doc);
    return insertEdit(state, ctx, registers, out.changes, out.caret, 'typing');
  }

  if (t === 'enter') {
    const pair = expandPairOnEnter(doc, ctx.tabSize ?? 2);
    if (pair) return insertEdit(state, ctx, registers, pair.changes, pair.caret, 'indent');
    const out = newlineChanges(doc, ctx.tabSize ?? 2);
    return insertEdit(state, ctx, registers, out.changes, out.caret, 'indent');
  }

  if (t === 'tab') {
    const col = S.lineStart(doc, doc.caret.row).col + doc.caret.col;
    const size = Math.max(1, ctx.tabSize ?? 2);
    const spaces = size - (doc.caret.col % size);
    if (ctx.hardTabs) return insertEdit(state, ctx, registers, [{ start: doc.caret, end: doc.caret, text: '\t' }], { row: doc.caret.row, col: doc.caret.col + 1 }, 'indent');
    return insertEdit(state, ctx, registers, [{ start: doc.caret, end: doc.caret, text: ' '.repeat(spaces) }], { row: doc.caret.row, col: doc.caret.col + spaces }, 'indent');
  }

  // Arrow keys move the caret; the LETTERS h/j/k/l must type. The old
  // `ARROW_TO_MOTION[spec.name] || t` fallback routed a typed `h`/`j`/`k`/`l`
  // through this motion branch, so insert mode silently dropped four of the
  // most common letters — typing `hello` produced `eo` and dragged the caret
  // around. Only a real arrow key has an entry in ARROW_TO_MOTION.
  const arrowMotion = ARROW_TO_MOTION[spec.name];
  if (arrowMotion) {
    const m = applyMotion(doc, doc.caret, arrowMotion, { count: 1, goalCol: null });
    return done(state, withCaret(doc, m.caret), registers);
  }
  if (spec.name === 'home') return done(state, withCaret(doc, S.lineStart(doc, doc.caret.row)), registers);
  if (spec.name === 'end') return done(state, withCaret(doc, S.lineEnd(doc, doc.caret.row)), registers);
  if (spec.name === 'pageup' || spec.name === 'pagedown') {
    return done(state, doc, registers, { request: { type: 'scroll', dir: spec.name === 'pagedown' ? 1 : -1, amount: 'page' } });
  }
  if (spec.name === 'insert') return done({ ...state, mode: VIM_MODES.REPLACE }, doc, registers);

  if (!spec.char && t !== 'space') return doorClosed(doc, state, registers);
  const ch = spec.char ?? ' ';
  const pair = pairInsert(doc, ch, { autoPair: ctx.autoPair !== false });
  if (pair.moveOnly) return done(state, withCaret(doc, pair.caret), registers);
  return insertEdit(state, ctx, registers, pair.changes, pair.caret, pair.paired ? 'pair' : 'typing', {
    buffer: ch, paired: pair.paired, now,
  });
}

/** Insert-mode edit: applies the change and appends to the `.` repeat buffer. */
function insertEdit(state, ctx, registers, changes, caret, kind, { buffer = '', paired = false, now = null } = {}) {
  const applied = applyChanges(ctx.doc, changes, caret);
  const insertBuffer = buffer === 'backspace'
    ? (state.insertBuffer || '').slice(0, -1)
    : `${state.insertBuffer || ''}${buffer}`;
  const next = { ...state, insertBuffer };
  if (paired && state.lastChange) next.lastChange = { ...state.lastChange, pair: paired };
  return {
    ...base(next, applied.doc, registers),
    changed: applied.changed,
    kind,
    coalesce: true,
    status: null,
  };
}

function replaceKey(state, spec, ctx, registers) {
  const { doc } = ctx;
  const t = spec.token;
  if (t === 'escape') {
    return done({ ...state, mode: VIM_MODES.NORMAL, insertBuffer: null }, withCaret(doc, doc.caret), registers);
  }
  if (spec.name === 'backspace') {
    const out = smartBackspace(doc);
    return insertEdit(state, ctx, registers, out.changes, out.caret, 'typing');
  }
  // Same rule as insert mode: arrows move, the letters h/j/k/l overtype.
  const arrowMotion = ARROW_TO_MOTION[spec.name];
  if (arrowMotion) {
    const m = applyMotion(doc, doc.caret, arrowMotion, { count: 1 });
    return done(state, withCaret(doc, m.caret), registers);
  }
  if (spec.name === 'enter') {
    const out = newlineChanges(doc, ctx.tabSize ?? 2);
    return insertEdit(state, ctx, registers, out.changes, out.caret, 'indent');
  }
  if (!spec.char && t !== 'space') return doorClosed(doc, state, registers);
  const ch = spec.char ?? ' ';
  const line = doc.lines[doc.caret.row];
  const atEnd = doc.caret.col >= line.length;
  // Overtype: replace the character under the caret; past end-of-line it appends.
  const changes = atEnd
    ? [{ start: doc.caret, end: doc.caret, text: ch }]
    : [{ start: doc.caret, end: { row: doc.caret.row, col: doc.caret.col + 1 }, text: ch }];
  return insertEdit(state, ctx, registers, changes, { row: doc.caret.row, col: doc.caret.col + 1 }, 'typing');
}

// ---------------------------------------------------------------------------
// Visual modes
// ---------------------------------------------------------------------------

function visualKey(state, spec, ctx, registers) {
  const { doc } = ctx;
  const t = spec.token;
  const mode = state.mode;

  if (t === 'escape') return exitVisual(state, doc, registers);
  if (t === 'v' || t === 'V' || t === 'ctrl-v') {
    const wanted = t === 'v' ? VIM_MODES.VISUAL : t === 'V' ? VIM_MODES.VISUAL_LINE : VIM_MODES.VISUAL_BLOCK;
    if (wanted === mode) return exitVisual(state, doc, registers);
    return done({ ...state, mode: wanted }, doc, registers);
  }
  if (t === 'o') return done({ ...state, anchor: doc.caret }, withCaret(doc, state.anchor), registers);
  if (t === 'g') return done({ ...state, pending: { kind: 'g' } }, doc, registers);
  if (t === '"') return done({ ...state, pending: { kind: 'register' } }, doc, registers);
  if (t === ':') return openInput(state, doc, registers, 'ex', null, { visual: true });
  if (t === 'u') return runVisualOperator(state, ctx, registers, 'gu');
  if (t === 'U') return runVisualOperator(state, ctx, registers, 'gU');
  if (t === 'y' || t === 'd' || t === 'c' || t === '>' || t === '<' || t === 'x' || t === 's') {
    const op = t === 'x' || t === 's' ? 'd' : t === 'U' ? 'gU' : t;
    return runVisualOperator(state, ctx, registers, op);
  }
  if (t === 'p' || t === 'P') return pasteOverSelection(state, ctx, registers);
  if (t === 'I' || t === 'A') {
    if (!visualBlock(mode)) {
      const at = t === 'I' ? 'firstNonBlank' : 'lineEnd';
      return enterInsert(state, doc, registers, t, { at });
    }
    const rect = S.blockRect(blockSelection(state, doc));
    return done({ ...state, blockInsert: { rect, at: t === 'I' ? 'left' : 'right', typed: '' }, mode: VIM_MODES.INSERT, insertBuffer: '' }, doc, registers);
  }

  const token = ARROW_TO_MOTION[spec.name] || t;
  if (MOTION_TOKENS.has(token) && token !== 'g') {
    const m = applyMotion(doc, doc.caret, token, {
      count: asCount(state.count), goalCol: null, explicitCount: state.count !== '',
    });
    return done({ ...state, count: '' }, withCaret(doc, m.caret), registers);
  }
  if (spec.name === 'home') return done({ ...state, count: '' }, withCaret(doc, S.lineStart(doc, doc.caret.row)), registers);
  if (spec.name === 'end') return done({ ...state, count: '' }, withCaret(doc, S.lineEnd(doc, doc.caret.row)), registers);
  return doorClosed(doc, state, registers);
}

/** Leaving visual mode puts the caret at the start of the selection (vim). */
function exitVisual(state, doc, registers) {
  const sel = visualSelection(state, doc);
  const caret = sel ? S.selMin(sel) : doc.caret;
  return done(
    { ...cleared(state), mode: VIM_MODES.NORMAL, anchor: null, lastVisual: { mode: state.mode, anchor: state.anchor } },
    withCaret(doc, caret),
    registers,
  );
}

function runVisualOperator(state, ctx, registers, op) {
  const { doc } = ctx;
  const mode = state.mode === VIM_MODES.VISUAL_LINE ? 'line' : state.mode === VIM_MODES.VISUAL_BLOCK ? 'block' : 'char';
  const sel = visualSelection(state, doc);
  const startedAt = sel ? S.selMin(sel) : doc.caret;
  const withOp = { ...state, operator: op, anchor: null, mode: VIM_MODES.OPERATOR };
  // `expanded: true` — visualSelection already produced whole lines for
  // visual-line, and expanding again would grow the range by a row.
  const result = finishOperator(withOp, ctx, registers, null, { selection: sel, mode, expanded: true });
  // The caret for a visual operator lands at the start of the operated range.
  const applied = withCaret(result.doc, startedAt);
  const clearedState = { ...result.state, lastVisual: { mode: state.mode, anchor: state.anchor } };
  return { ...result, doc: applied, state: clearedState, selection: null };
}

function pasteOverSelection(state, ctx, registers) {
  const { doc } = ctx;
  const sel = visualSelection(state, doc);
  const entry = put(registers, state.register);
  if (!entry.text) return done(cleared(state), doc, registers, { status: 'register is empty' });
  const changes = S.replaceChanges(sel, entry.text.endsWith('\n') ? entry.text.slice(0, -1) : entry.text);
  const applied = applyChanges(doc, changes, S.selMin(sel));
  const next = yank(registers, entry.text, { name: state.register, kind: entry.kind });
  return {
    ...base(cleared(state), applied.doc, next),
    changed: applied.changed,
    kind: 'put',
    status: `pasted ${entry.text.length} char(s)`,
  };
}

/** Visual-block `I`/`A`: the same insertion on every row of the block. */
/**
 * Visual-block `I`/`A`: the same insertion on every row of the block. Each
 * keystroke inserts into every row at that row's own column, so rows shorter
 * than the block are not skipped.
 */
function blockInsertKey(state, spec, ctx, registers) {
  const { doc } = ctx;
  const t = spec.token;
  if (t === 'escape') {
    const next = { ...state, blockInsert: null, mode: VIM_MODES.NORMAL, insertBuffer: null };
    return done(next, doc, registers, { status: 'block insert done' });
  }
  if (spec.name === 'enter') {
    const out = newlineChanges(doc, ctx.tabSize ?? 2);
    return insertEdit(state, ctx, registers, out.changes, out.caret, 'indent');
  }
  if (spec.name === 'backspace') {
    const { rect, at, typed } = state.blockInsert;
    if (!typed) return done(state, doc, registers);
    const edge = at === 'left' ? rect.left : rect.right;
    const changes = [];
    for (let row = rect.top; row <= Math.min(rect.bottom, doc.lines.length - 1); row += 1) {
      const col = edge + typed.length - 1;
      if (col < doc.lines[row].length) changes.push({ start: pos(row, col), end: pos(row, col + 1), text: '' });
    }
    const applied = applyChanges(doc, changes, pos(rect.bottom, edge));
    return {
      ...base({ ...state, blockInsert: { ...state.blockInsert, typed: typed.slice(0, -1) } }, applied.doc, registers),
      changed: applied.changed,
      kind: 'typing',
      coalesce: true,
    };
  }
  if (!spec.char && t !== 'space') return doorClosed(doc, state, registers);
  const ch = spec.char ?? ' ';
  const { rect, at, typed } = state.blockInsert;
  const edge = at === 'left' ? rect.left : rect.right;
  const changes = [];
  for (let row = rect.top; row <= Math.min(rect.bottom, doc.lines.length - 1); row += 1) {
    const col = Math.min(edge + typed.length, doc.lines[row].length);
    changes.push({ start: pos(row, col), end: pos(row, col), text: ch });
  }
  const caret = pos(rect.bottom, Math.min(edge + typed.length + 1, doc.lines[rect.bottom].length + 1));
  const applied = applyChanges(doc, changes, caret);
  return {
    ...base({ ...state, blockInsert: { ...state.blockInsert, typed: `${typed}${ch}` } }, applied.doc, registers),
    changed: applied.changed,
    kind: 'typing',
    coalesce: true,
    status: `${rect.bottom - rect.top + 1} rows`,
  };
}

// ---------------------------------------------------------------------------
// ex / search input lines
// ---------------------------------------------------------------------------

/** Put the machine back in normal mode with the pending command line gone. */
const leaveInput = (state) => ({ ...cleared(state), mode: VIM_MODES.NORMAL, input: null });

function openInput(state, doc, registers, kind, dir = 1, { visual = false } = {}) {
  const range = visual && state.anchor
    ? { fromRow: Math.min(state.anchor.row, doc.caret.row), toRow: Math.max(state.anchor.row, doc.caret.row) }
    : null;
  const next = {
    ...cleared(state),
    mode: kind === 'ex' ? VIM_MODES.EX : VIM_MODES.SEARCH,
    input: { kind, text: '', dir, range },
  };
  return done(next, doc, registers);
}

function inputKey(state, spec, ctx, registers) {
  const { doc } = ctx;
  const input = state.input || { kind: 'ex', text: '', dir: 1 };
  const t = spec.token;

  if (t === 'escape') return done(leaveInput(state), doc, registers, { status: 'cancelled' });
  if (t === 'backspace') {
    if (!input.text) return done({ ...state, input: null, mode: VIM_MODES.NORMAL }, doc, registers);
    return done({ ...state, input: { ...input, text: input.text.slice(0, -1) } }, doc, registers);
  }
  if (t === 'enter') return commitInput(state, ctx, registers);
  if (!spec.char && t !== 'space') return doorClosed(doc, state, registers);
  return done({ ...state, input: { ...input, text: `${input.text}${spec.char ?? ' '}` } }, doc, registers);
}

function commitInput(state, ctx, registers) {
  const { doc } = ctx;
  const input = state.input;
  if (input.kind === 'search') return commitSearch(state, ctx, registers, input);
  return commitEx(state, ctx, registers, input);
}

function commitSearch(state, ctx, registers, input) {
  const { doc } = ctx;
  const pattern = input.text;
  const next = { ...leaveInput(state), search: { ...state.search, pattern, dir: input.dir } };
  if (!pattern) return done(next, doc, registers, { status: 'search cancelled' });
  const hit = nextMatch(doc, doc.caret, pattern, {
    dir: input.dir, regex: next.search.regex, smartCase: next.search.smartCase,
  });
  if (!hit.found) return done(next, doc, registers, { status: `pattern not found: ${pattern}` });
  return done({ ...next, jumpBack: caretBefore(doc) }, withCaret(doc, hit.caret), registers, {
    status: `/ ${pattern} — ${hit.count} match(es)`,
  });
}

function commitEx(state, ctx, registers, input) {
  const { doc } = ctx;
  const parsed = parseEx(input.text);
  const clearedState = leaveInput(state);

  if (parsed.kind === 'empty') return done(clearedState, doc, registers);
  if (parsed.kind === 'unknown') {
    return done(clearedState, doc, registers, { status: `unknown command :${parsed.command}` });
  }
  if (parsed.kind === 'error') return done(clearedState, doc, registers, { status: parsed.message });

  if (parsed.handler === 'registers') {
    return done(clearedState, doc, registers, { request: { type: 'registers' }, status: 'registers' });
  }

  if (parsed.kind === 'ex') {
    return done(clearedState, doc, registers, {
      command: parsed.also
        ? { id: parsed.id, title: parsed.title, then: { id: parsed.also, title: 'go back' } }
        : { id: parsed.id, title: parsed.title },
      status: `:${parsed.name} — ${describeEx(parsed)}`,
    });
  }

  if (parsed.kind === 'goto-line') {
    const row = Math.max(0, Math.min(parsed.line - 1, doc.lines.length - 1));
    return done({ ...clearedState, jumpBack: caretBefore(doc) }, withCaret(doc, pos(row, 0)), registers, {
      status: `line ${row + 1}`,
    });
  }

  // `:s` / `:%s` — substitute.
  const rows = substituteRows(doc, parsed.range, input.range);
  const plan = planSubstitute(doc, parsed, rows, state.search);
  if (!plan.length) return done(clearedState, doc, registers, { status: `no match: ${parsed.pattern}` });
  if (parsed.confirm) {
    return done({ ...clearedState, confirm: { plan, index: 0, accepted: [], base: doc } }, doc, registers, {
      status: `replace ${plan.length}? (y/n/a/q)`,
    });
  }
  const applied = applyChanges(doc, plan.map((p) => p.change), null);
  return {
    ...base(clearedState, applied.doc, registers),
    changed: applied.changed,
    kind: 'replaceAll',
    coalesce: false,
    status: `replaced ${plan.length} occurrence(s)`,
  };
}

/** Which rows a `:s` range covers. `%` and a visual `:`, else the caret's line. */
function substituteRows(doc, range, visualRange) {
  if (range === '%') return doc.lines.map((_, i) => i);
  if (range && /^\d+,\d+$/.test(range)) {
    const [a, b] = range.split(',').map(Number);
    const rows = [];
    for (let row = Math.max(0, a - 1); row <= Math.min(b - 1, doc.lines.length - 1); row += 1) rows.push(row);
    return rows;
  }
  if (range) return [Math.max(0, Math.min(Number(range) - 1, doc.lines.length - 1))];
  if (visualRange) {
    const rows = [];
    for (let row = visualRange.fromRow; row <= Math.min(visualRange.toRow, doc.lines.length - 1); row += 1) rows.push(row);
    return rows;
  }
  return [doc.caret.row];
}

/** The `:s` shape of `substitutePlan` (patterns in ex are always regex). */
export function planSubstitute(doc, parsed, rows, searchOpts = {}) {
  return substitutePlan(doc, {
    pattern: parsed.pattern,
    replacement: parsed.replacement,
    all: parsed.all,
    regex: true,
    smartCase: searchOpts.smartCase !== false,
  }, rows);
}

/**
 * Confirm-each loop: `y` accept, `n` skip, `a` accept all, `q` stop.
 *
 * Every step re-applies the ACCEPTED set to the document the prompt started
 * from, never to the previous result: the plan's positions are computed against
 * the original text, so applying them one at a time to a document that already
 * moved would delete the wrong characters whenever the replacement is a
 * different length.
 */
function confirmKey(state, spec, ctx, registers) {
  const t = spec.token;
  const { plan, index, accepted, base: baseDoc } = state.confirm;
  const doc = baseDoc || ctx.doc;
  const finish = (list) => {
    const result = applyChanges(doc, list.map((p) => p.change), null);
    return {
      ...base({ ...cleared(state), mode: VIM_MODES.NORMAL, confirm: null }, result.doc, registers),
      changed: result.changed,
      kind: 'replaceAll',
      coalesce: false,
      status: `replaced ${list.length} of ${plan.length} occurrence(s)`,
    };
  };
  const commit = (take, all = false) => {
    const list = all ? [...accepted, ...plan.slice(index)] : take ? [...accepted, plan[index]] : accepted;
    const nextIndex = all ? plan.length : index + 1;
    if (nextIndex >= plan.length) return finish(list);
    const result = applyChanges(doc, list.map((p) => p.change), null);
    return {
      ...base({ ...state, confirm: { plan, index: nextIndex, accepted: list, base: baseDoc } }, result.doc, registers),
      changed: true,
      kind: 'replaceAll',
      coalesce: false,
      status: `${nextIndex + 1}/${plan.length}: replace? (y/n/a/q)`,
    };
  };
  if (t === 'y') return commit(true);
  if (t === 'n') return commit(false);
  if (t === 'a') return commit(true, true);
  if (t === 'q' || t === 'escape') return finish(accepted);
  return done(state, ctx.doc, registers, { status: 'y = yes, n = no, a = all, q = quit' });
}

function repeatChange(state, ctx, registers) {
  const { doc } = ctx;
  const last = state.lastChange;
  if (!last) return done(cleared(state), doc, registers, { status: 'nothing to repeat' });
  if (last.type === 'insert') {
    // `.` for an insert: re-enter at the same place, type the same text, leave.
    if (!last.text) return done(cleared(state), doc, registers, { status: 'nothing to repeat' });
    const entry = last.entry === 'a' || last.entry === 'A' || last.entry === 's' ? last.entry : 'i';
    let from = doc;
    let caret = doc.caret;
    if (entry === 'a') caret = { row: caret.row, col: Math.min(caret.col + 1, doc.lines[caret.row].length) };
    if (entry === 'A') caret = S.lineEnd(doc, caret.row);
    if (entry === 's') {
      const del = deleteCharChanges(doc, caret, { count: 1 });
      from = applyChanges(doc, del.changes, del.caret).doc;
      caret = del.caret;
    }
    const pair = ctx.autoPair !== false ? pairInsert(from, last.text, { autoPair: true }) : null;
    const changes = pair && pair.paired
      ? pair.changes
      : [{ start: caret, end: caret, text: last.text }];
    const applied = applyChanges(from, changes, pair && pair.paired ? pair.caret : { row: caret.row, col: caret.col + last.text.length });
    const outCaret = applied.doc.caret;
    const normalCaret = outCaret.col >= applied.doc.lines[outCaret.row].length
      ? outCaret
      : { row: outCaret.row, col: outCaret.col - 1 };
    return {
      ...base({ ...cleared(state), lastChange: last }, withCaret(applied.doc, normalCaret), registers),
      changed: applied.changed,
      kind: 'typing',
      coalesce: false,
      status: 'repeated insert',
    };
  }
  if (last.type === 'operator') {
    const withOp = { ...cleared(state), operator: last.op, register: last.register || state.register };
    if (last.motion.doubling) {
      const lines = Math.max(1, last.motion.count || 1);
      const lastRow = Math.min(doc.caret.row + lines - 1, doc.lines.length - 1);
      const motion = { caret: pos(lastRow, 0), linewise: true, explicitCount: true, doubling: true, token: null };
      return finishOperator(withOp, ctx, registers, motion, { count: lines });
    }
    const m = applyMotion(doc, doc.caret, last.motion.token, {
      count: last.motion.count, arg: last.motion.arg, explicitCount: true,
    });
    return finishOperator(withOp, ctx, registers, { ...m, token: last.motion.token, arg: last.motion.arg }, { count: last.motion.count });
  }
  // Simple single-key changes (x, X, J, p, P, r…).
  const count = last.count || 1;
  if (last.name === 'x' || last.name === 'X') {
    const out = deleteCharChanges(doc, doc.caret, { count, backward: last.name === 'X' });
    return simpleEdit(state, doc, registers, { changes: out.changes, caret: out.caret, kind: 'delete', name: last.name, count, status: 'repeated' });
  }
  if (last.name === 'J') {
    const out = joinChanges(doc, doc.caret, count);
    return simpleEdit(state, doc, registers, { changes: out.changes, caret: out.caret, kind: 'join', name: 'J', count, status: 'repeated' });
  }
  if (last.name === 'p' || last.name === 'P') {
    const put2 = putRegister(state, doc, registers, last.name === 'p');
    return { ...put2, kind: 'put', coalesce: false, status: 'repeated' };
  }
  if (last.name === 'r') {
    const out = replaceCharChanges(doc, doc.caret, last.ch, count);
    return simpleEdit(state, doc, registers, { changes: out.changes, caret: out.caret, kind: 'replaceChar', name: 'r', ch: last.ch, count, status: 'repeated' });
  }
  return done(cleared(state), doc, registers, { status: 'nothing to repeat' });
}

// ---------------------------------------------------------------------------
// Shared edit paths
// ---------------------------------------------------------------------------

function simpleEdit(state, doc, registers, { changes, caret, kind, name, ch = null, count = 1, status = null }) {
  const applied = applyChanges(doc, changes, caret);
  const next = { ...cleared(state), lastChange: { type: 'simple', name, ch, count } };
  return {
    ...base(next, applied.doc, registers),
    changed: applied.changed,
    kind,
    coalesce: false,
    status,
  };
}

function putRegister(state, doc, registers, after) {
  const entry = put(registers, state.register);
  const count = asCount(state.count);
  if (!entry.text) return done(cleared(state), doc, registers, { status: 'register is empty' });
  const out = putChanges({ doc, caret: doc.caret, entry, count, before: !after });
  const applied = applyChanges(doc, out.changes, out.caret);
  const next = { ...cleared(state), lastChange: { type: 'simple', name: after ? 'p' : 'P', count } };
  return {
    ...base(next, applied.doc, registers),
    changed: applied.changed,
    kind: 'put',
    coalesce: false,
    status: `pasted ${out.changes.length ? 'register' : 'nothing'}`,
  };
}

function openLine(state, doc, registers, below) {
  const row = below ? doc.caret.row + 1 : doc.caret.row;
  const indent = /^[ \t]*/.exec(doc.lines[doc.caret.row] || '')[0];
  // Opening below the LAST line has to append, not insert: there is no row
  // after it, and a position past the end would be clamped back into the line.
  const atEof = below && doc.caret.row >= doc.lines.length - 1;
  const changes = atEof
    ? [{ start: S.lineEnd(doc, doc.caret.row), end: S.lineEnd(doc, doc.caret.row), text: `\n${indent}` }]
    : [{ start: pos(row, 0), end: pos(row, 0), text: `${indent}\n` }];
  const caret = pos(row, indent.length);
  const applied = applyChanges(doc, changes, caret);
  return {
    ...base({
      ...cleared(state),
      mode: VIM_MODES.INSERT,
      insertBuffer: '',
      lastChange: { type: 'insert', entry: below ? 'o' : 'O', text: '' },
    }, applied.doc, registers),
    changed: applied.changed,
    kind: 'indent',
    coalesce: false,
    status: below ? 'opened below' : 'opened above',
  };
}

function jumpBack(state, doc, registers) {
  if (state.pending && state.pending.kind === 'mark') return done(cleared(state), doc, registers);
  if (!state.jumpBack) return done({ ...state, pending: { kind: 'mark', arg: 1 } }, doc, registers, { status: 'no mark set' });
  const target = state.jumpBack;
  const back = caretBefore(doc);
  return done({ ...cleared(state), jumpBack: back }, withCaret(doc, target), registers, {
    status: `back to ${target.row + 1}:${target.col + 1}`,
  });
}

function searchNext(state, doc, registers, dir) {
  const { pattern, regex, smartCase } = state.search;
  if (!pattern) return done(cleared(state), doc, registers, { status: 'no previous search' });
  const hit = nextMatch(doc, doc.caret, pattern, { dir, regex, smartCase });
  if (!hit.found) return done(cleared(state), doc, registers, { status: `pattern not found: ${pattern}` });
  return done({ ...cleared(state), jumpBack: caretBefore(doc) }, withCaret(doc, hit.caret), registers, {
    status: `${pattern}: ${hit.count} match(es)`,
  });
}

function searchWord(state, doc, registers, forward) {
  const sel = S.selectWord(doc, doc.caret);
  if (!sel) return done(state, doc, registers, { status: 'no word under the cursor' });
  const text = S.selText(doc, sel);
  const pattern = `\\b${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`;
  const hit = nextMatch(doc, doc.caret, pattern, { dir: forward ? 1 : -1, regex: true, smartCase: false });
  const next = { ...cleared(state), search: { ...state.search, pattern, regex: true }, jumpBack: caretBefore(doc) };
  if (!hit.found) return done(next, doc, registers, { status: `no more matches for ${text}` });
  return done(next, withCaret(doc, hit.caret), registers, { status: `${text}: ${hit.count} match(es)` });
}

function scroll(state, doc, registers, dir, amount) {
  return done({ ...state, count: '' }, doc, registers, { request: { type: 'scroll', dir, amount } });
}

function tabRequest(state, doc, registers, dir) {
  return done({ ...state, count: '' }, doc, registers, { request: { type: 'tab', dir } });
}

function cleared(state) {
  return { ...state, count: '', operator: null, opCount: '', pending: null, status: null };
}

// ---------------------------------------------------------------------------
// Text helpers used by insert mode (each returns `{changes, caret}`)
// ---------------------------------------------------------------------------

/** Backspace: join lines at column 0; inside an empty pair delete both halves. */
export function smartBackspace(doc) {
  const { row, col } = doc.caret;
  if (col === 0) {
    if (row === 0) return { changes: [], caret: doc.caret };
    const start = pos(row - 1, doc.lines[row - 1].length);
    return { changes: [{ start, end: doc.caret, text: '' }], caret: start };
  }
  const line = doc.lines[row];
  const prev = line[col - 1];
  const next = line[col];
  // `()` with the caret between the halves: backspace removes the pair.
  if (PAIRS[prev] && PAIRS[prev] === next) {
    return { changes: [{ start: pos(row, col - 1), end: pos(row, col + 1), text: '' }], caret: pos(row, col - 1) };
  }
  return { changes: [{ start: pos(row, col - 1), end: doc.caret, text: '' }], caret: pos(row, col - 1) };
}

function deleteWordBefore(doc) {
  const { row, col } = doc.caret;
  if (col === 0) return smartBackspace(doc);
  const line = doc.lines[row];
  const before = line.slice(0, col);
  const trimmed = before.replace(/(\s+|\S+)\s*$/, '');
  const start = pos(row, trimmed.length);
  return { changes: [{ start, end: doc.caret, text: '' }], caret: start };
}

function deleteToLineStart(doc) {
  const start = S.lineStart(doc, doc.caret.row);
  if (eqPos(start, doc.caret)) return { changes: [], caret: doc.caret };
  return { changes: [{ start, end: doc.caret, text: '' }], caret: start };
}

/** Enter: keep the indent, and add one level after an opening bracket. */
export function newlineChanges(doc, tabSize = 2) {
  const line = doc.lines[doc.caret.row];
  const indent = /^[ \t]*/.exec(line)[0];
  const unit = ' '.repeat(Math.max(1, tabSize));
  const before = line.slice(0, doc.caret.col);
  const after = line.slice(doc.caret.col);
  const opensBlock = /[{([]\s*$/.test(before);
  const extra = opensBlock ? unit : '';
  const text = `\n${indent}${extra}`;
  return { changes: [{ start: doc.caret, end: doc.caret, text }], caret: pos(doc.caret.row + 1, indent.length + extra.length), text: after };
}

/** Enter between an empty pair: open a block and keep the closing half. */
export function expandPairOnEnter(doc, tabSize = 2) {
  const line = doc.lines[doc.caret.row];
  const prev = line[doc.caret.col - 1];
  const next = line[doc.caret.col];
  if (!prev || !next || PAIRS[prev] !== next) return null;
  const indent = /^[ \t]*/.exec(line)[0];
  const unit = ' '.repeat(Math.max(1, Number(tabSize) || 2));
  // Both newlines travel with the change: the first ends the `{` line, the
  // second pushes the closer onto its own row. Inserting only one of them (an
  // earlier version sliced the leading `\n` off) left the closer glued to the
  // blank line.
  const text = `\n${indent}${unit}\n${indent}`;
  const start = pos(doc.caret.row, doc.caret.col);
  return {
    changes: [{ start, end: start, text }],
    caret: pos(doc.caret.row + 1, indent.length + unit.length),
  };
}

/** `(`/`"` auto-pairing, or stepping over a closing character already there. */
export function pairInsert(doc, ch, { autoPair = true } = {}) {
  const line = doc.lines[doc.caret.row];
  const after = line[doc.caret.col];
  const change = { start: doc.caret, end: doc.caret, text: ch };
  if (!autoPair) return { changes: [change], caret: pos(doc.caret.row, doc.caret.col + ch.length), paired: false };

  // Typing the closer that is already there steps over it (no edit at all).
  if (CLOSERS.has(ch) && after === ch) {
    return { changes: [], caret: pos(doc.caret.row, doc.caret.col + 1), paired: false, moveOnly: true };
  }
  if (!OPENERS.has(ch)) {
    return { changes: [change], caret: pos(doc.caret.row, doc.caret.col + ch.length), paired: false };
  }
  // Don't duplicate a closer that is already next to the caret (`(|)`).
  if (CLOSERS.has(after)) {
    return { changes: [change], caret: pos(doc.caret.row, doc.caret.col + 1), paired: false };
  }
  const closer = PAIRS[ch];
  const text = ch === closer ? `${ch}${closer}` : `${ch}${closer}`;
  return {
    changes: [{ start: doc.caret, end: doc.caret, text }],
    caret: pos(doc.caret.row, doc.caret.col + 1),
    paired: true,
  };
}

// ---------------------------------------------------------------------------
// Binding table (task 2.11 lints this against the keymap registry)
// ---------------------------------------------------------------------------

/**
 * Every Appendix B.5 binding the machine implements. `tools/check.js` walks this
 * so a binding that silently stops resolving fails the run, and the vim test
 * suite drives each entry through `reduceKey`.
 */
export const VIM_BINDINGS = [
  { keys: ['h', 'j', 'k', 'l'], mode: 'normal', command: 'editor.cursor', note: 'arrows always work too' },
  { keys: ['0', '$', '^'], mode: 'normal', command: 'editor.lineStart' },
  { keys: ['gg', 'G'], mode: 'normal', command: 'editor.docStart' },
  { keys: ['w', 'W', 'b', 'B', 'e', 'E'], mode: 'normal', command: 'editor.wordForward' },
  { keys: ['ctrl-u', 'ctrl-d'], mode: 'normal', command: 'editor.scrollHalfUp' },
  { keys: ['ctrl-b', 'ctrl-f'], mode: 'normal', command: 'editor.scrollPageUp', note: 'ctrl-f is scroll, not find' },
  { keys: ['u'], mode: 'normal', command: 'editor.undo' },
  { keys: ['ctrl-z'], mode: 'insert', command: 'editor.undo' },
  { keys: ['ctrl-r'], mode: 'normal', command: 'editor.redo' },
  { keys: ['shift-ctrl-z'], mode: 'insert', command: 'editor.redo' },
  { keys: ['x', 'X'], mode: 'normal', command: 'editor.deleteChar' },
  { keys: ['dd', 'D'], mode: 'normal', command: 'editor.deleteLine' },
  { keys: ['c', 'cc', 'C'], mode: 'normal', command: 'editor.change' },
  { keys: ['y', 'yy', 'Y'], mode: 'normal', command: 'editor.yank' },
  { keys: ['p', 'P'], mode: 'normal', command: 'editor.put' },
  { keys: ['J'], mode: 'normal', command: 'editor.join' },
  { keys: ['>', '<'], mode: 'normal', command: 'editor.indent' },
  { keys: ['gc'], mode: 'normal', command: 'editor.commentToggle' },
  { keys: ['v', 'V', 'ctrl-v'], mode: 'normal', command: 'editor.visualChar' },
  { keys: ['i', 'a', 'I', 'A'], mode: 'normal', command: 'editor.insertBefore' },
  { keys: ['o', 'O'], mode: 'normal', command: 'editor.openBelow' },
  { keys: ['s', 'R'], mode: 'normal', command: 'editor.substituteChar' },
  { keys: ['/', '?'], mode: 'normal', command: 'editor.search' },
  { keys: ['n', 'N'], mode: 'normal', command: 'editor.searchNext' },
  { keys: [':'], mode: 'normal', command: 'ex' },
  { keys: ['%'], mode: 'normal', command: 'editor.gotoMatchingBracket' },
  { keys: ['f', 'F', 't', 'T', ';', ','], mode: 'normal', command: 'editor.findChar' },
  { keys: ['{', '}'], mode: 'normal', command: 'editor.paragraphForward' },
  { keys: ['.'], mode: 'normal', command: 'editor.repeat' },
  { keys: ['`'], mode: 'normal', command: 'editor.jumpBack' },
  { keys: ['"'], mode: 'normal', command: 'editor.selectRegister' },
  { keys: ['r'], mode: 'normal', command: 'editor.replaceChar' },
  { keys: ['escape'], mode: 'visual', command: 'editor.visualExit' },
];

/** `;` and `,` repeat/undo the last `f`/`t` (both directions). */
export function repeatFind(state, doc, registers, reverse) {
  if (!state.lastFind) return done({ ...state, count: '' }, doc, registers, { status: 'no f/t to repeat' });
  const { ch, dir, till } = state.lastFind;
  const token = till ? (dir > 0 ? 't' : 'T') : (dir > 0 ? 'f' : 'F');
  const effective = reverse ? (dir > 0 ? (till ? 'T' : 'F') : (till ? 't' : 'f')) : token;
  const m = applyMotion(doc, doc.caret, effective, { arg: ch, count: asCount(state.count) });
  const next = { ...state, pending: null, count: '' };
  if (next.operator) {
    return finishOperator(next, { doc }, registers, { ...m, token: effective, arg: ch });
  }
  return moveResult(next, { doc }, registers, m);
}


export { searchMatches, MOTION_TOKENS, OPERATOR_NAMES, LINEWISE, CHARWISE, BLOCKWISE, readRegister, yank };
