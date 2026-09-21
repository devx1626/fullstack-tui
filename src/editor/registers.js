/**
 * Registers (overhaul §8.3, task 2.3).
 *
 * The vim register set the spec asks for, kept deliberately minimal and
 * explicit rather than emulating all of vim's storage:
 *
 *   `"`  unnamed — every yank and delete lands here (what `p` pastes)
 *   `0`  the last YANK specifically (deletes never touch it, so `dd` then `p`
 *        still pastes what you copied)
 *   `a–z` named — `"ayy` yanks into a, `"ap` pastes it; `"Ayy` APPENDS
 *   `_`  black hole — deletes into it discard the text
 *   `+`  the system clipboard, read through OSC52 (§8.4 / osc52.js). It is
 *        write-only: we can send a copy but cannot read the terminal's
 *        clipboard back, which `put('+')` reports instead of pretending.
 *
 * Each register also remembers whether its content is LINEWISE, because that
 * decides how `p` pastes it: linewise below the current line, characterwise
 * after the caret.
 *
 * Pure value functions: `yank`/`put` return a new register file, so a session
 * can hold registers in React state and undo/redo cannot corrupt them.
 */

export const LINEWISE = 'linewise';
export const CHARWISE = 'charwise';
export const BLOCKWISE = 'blockwise';

export function createRegisters() {
  return { unnamed: empty(), yank: empty(), named: {}, pending: null };
}

const empty = (kind = CHARWISE) => ({ text: '', kind });

export function cloneRegisters(registers) {
  const out = createRegisters();
  out.unnamed = { ...registers.unnamed };
  out.yank = { ...registers.yank };
  out.named = Object.fromEntries(Object.entries(registers.named || {}).map(([k, v]) => [k, { ...v }]));
  out.pending = registers.pending || null;
  return out;
}

/** A register's content as `{ text, kind }`, or an empty charwise one. */
export function readRegister(registers, name = '"') {
  if (!registers) return empty();
  if (name === '"' || name == null) return registers.unnamed || empty();
  if (name === '0') return registers.yank || empty();
  if (name === '_') return empty(); // black hole: always empty
  if (name === '+') return registers.system || empty(); // read-only, see below
  return (registers.named && registers.named[name]) || empty();
}

export function registerNames(registers) {
  return Object.keys((registers && registers.named) || {}).sort();
}

/**
 * Store text. `write: 'yank'` also updates register `0` (yanks); a delete
 * (`write: 'delete'`) leaves `0` alone. `append` implements `"A`.
 *
 * @returns the new register file
 */
export function yank(registers, text, { name = '"', kind = CHARWISE, write = 'yank', append = false } = {}) {
  const next = registers ? cloneRegisters(registers) : createRegisters();
  const value = String(text ?? '');
  if (!value) return next; // yanking nothing must not clear the register

  if (name === '_') return next; // discarded on purpose
  if (name === '+') {
    // The system clipboard is written by sending OSC52 (see osc52.js); we keep
    // a local copy so `"p` can also paste it back within this session.
    next.system = { text: value, kind };
    next.unnamed = { text: value, kind };
    return next;
  }

  if (name === '0') {
    next.yank = { text: value, kind };
    next.unnamed = { text: value, kind };
    return next;
  }

  if (name === '"') {
    next.unnamed = { text: value, kind };
    if (write === 'yank') next.yank = { text: value, kind };
    return next;
  }

  if (!/^[a-zA-Z]$/.test(name)) return next; // unknown register: no-op, never fatal
  const key = name.toLowerCase();
  const prev = append ? (next.named[key] || empty()) : empty();
  next.named = {
    ...next.named,
    [key]: {
      text: append ? `${prev.text}${value}` : value,
      // Appending to a linewise register keeps it linewise.
      kind: append ? prev.kind : kind,
    },
  };
  if (name === name.toUpperCase() && append) return next; // "Ayy does not touch unnamed
  next.unnamed = { text: next.named[key].text, kind: next.named[key].kind };
  if (write === 'yank') next.yank = { text: next.named[key].text, kind: next.named[key].kind };
  return next;
}

/** Read a register for a paste. */
export function put(registers, name = '"') {
  return readRegister(registers, name);
}

/** The line count of a linewise register (a `3p` pastes three times). */
export function registerLineCount(entry) {
  if (!entry || !entry.text) return 0;
  const body = entry.kind === LINEWISE && entry.text.endsWith('\n') ? entry.text.slice(0, -1) : entry.text;
  return body === '' ? 0 : body.split('\n').length;
}

/**
 * The vim register ring, for a `:registers`-style panel: most recently written
 * first, with a one-line preview of each.
 */
export function registerList(registers, { preview = 40 } = {}) {
  const rows = [];
  const push = (name, entry) => {
    if (!entry || !entry.text) return;
    const oneLine = entry.text.replace(/\n/g, '⏎');
    rows.push({
      name,
      kind: entry.kind,
      length: entry.text.length,
      preview: oneLine.length > preview ? `${oneLine.slice(0, preview - 1)}…` : oneLine,
    });
  };
  push('"', registers && registers.unnamed);
  push('0', registers && registers.yank);
  for (const name of registerNames(registers)) push(name, registers.named[name]);
  if (registers && registers.system) push('+', registers.system);
  return rows;
}

/** `"a` → `a`; used by the pending-register state in vim.js. */
export function normaliseRegisterName(ch) {
  if (!ch) return null;
  if (ch === '"' || ch === '0' || ch === '_' || ch === '+' || ch === '*') return ch === '*' ? '+' : ch;
  if (/^[a-zA-Z]$/.test(ch)) return ch;
  return null;
}

