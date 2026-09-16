/**
 * A small multi-line editor model.
 *
 * Kept deliberately dumb - arrays of strings plus a cursor - so the challenge
 * view can render it with the same segment primitives as everything else and
 * the diffing screen keeps redraws cheap.
 */

export function emptyEditor(text = '') {
  const ed = { lines: String(text ?? '').split('\n'), row: 0, col: 0, scrollTop: 0, scrollX: 0 };
  clamp(ed);
  return ed;
}

export function emptyEditors(files = {}) {
  const editors = {};
  for (const [name, text] of Object.entries(files)) {
    editors[name] = emptyEditor(text);
  }
  return editors;
}

export function editorText(ed) {
  if (!ed) return '';
  return ed.lines.join('\n');
}

export function editorTexts(editors) {
  const files = {};
  for (const [name, ed] of Object.entries(editors)) {
    files[name] = editorText(ed);
  }
  return files;
}

export function setText(ed, text) {
  ed.lines = String(text ?? '').split('\n');
  ed.row = 0;
  ed.col = 0;
  ed.scrollTop = 0;
  ed.scrollX = 0;
  clamp(ed);
  return ed;
}

/** Absolute offset of the caret in `editorText(ed)`. */
export function offsetOf(ed) {
  let n = 0;
  for (let i = 0; i < ed.row; i += 1) n += ed.lines[i].length + 1;
  return n + ed.col;
}

/**
 * Inverse of offsetOf: an absolute offset → `{ row, col }`, clamped to the
 * document. Used by features that think in text offsets (bracket matching,
 * formatter results) but must move a row/column caret.
 */
export function rowColOf(ed, offset) {
  const text = editorText(ed);
  const pos = Math.max(0, Math.min(Number(offset) || 0, text.length));
  const before = text.slice(0, pos);
  return { row: (before.match(/\n/g) || []).length, col: pos - (before.lastIndexOf('\n') + 1) };
}

/**
 * Replace the whole document while leaving the caret at `offset`.
 *
 * "Smart" edits (auto-paired brackets, auto-closed tags, accepting a
 * completion) are computed on the full text, so applying them is one call.
 */
export function setTextAt(ed, text, offset) {
  const raw = String(text ?? '');
  ed.lines = raw.split('\n');
  const before = raw.slice(0, Math.max(0, Math.min(offset, raw.length)));
  ed.row = (before.match(/\n/g) || []).length;
  ed.col = before.length - (before.lastIndexOf('\n') + 1);
  clamp(ed);
  return ed;
}

function clamp(ed) {
  if (!ed.lines.length) ed.lines = [''];
  ed.row = Math.max(0, Math.min(ed.row, ed.lines.length - 1));
  ed.col = Math.max(0, Math.min(ed.col, ed.lines[ed.row].length));
}

/** Visual width helper: tabs count as two columns, as we insert spaces. */
const rowWidth = (line) => line.length;

export function insertChar(ed, ch) {
  const line = ed.lines[ed.row];
  ed.lines[ed.row] = line.slice(0, ed.col) + ch + line.slice(ed.col);
  ed.col += ch.length;
  ed.goalCol = null; // soft-wrap: any edit cancels the vertical goal column
  clamp(ed);
}

export function insertText(ed, text) {
  for (const ch of text) {
    if (ch === '\n') insertNewline(ed);
    else insertChar(ed, ch);
  }
}

export function insertNewline(ed, indentSize = 2) {
  const line = ed.lines[ed.row];
  const before = line.slice(0, ed.col);
  const after = line.slice(ed.col);
  const indentMatch = before.match(/^[ \t]*/);
  let indent = indentMatch ? indentMatch[0] : '';
  if (/[{[(]\s*$/.test(before)) indent += ' '.repeat(Math.max(1, indentSize));
  ed.lines.splice(ed.row, 1, before, indent + after);
  ed.row += 1;
  ed.col = indent.length;
  ed.goalCol = null;
  clamp(ed);
}

export function backspace(ed, indentSize = 2) {
  ed.goalCol = null;
  if (ed.col > 0) {
    const line = ed.lines[ed.row];
    // Delete a whole indent level when sitting on clean indentation.
    const size = Math.max(1, indentSize);
    const head = line.slice(0, ed.col);
    const spaces = head.match(/ +$/);
    const step = spaces && size > 1 && spaces[0].length % size === 0 && spaces[0].length > 1 ? size : 1;
    ed.lines[ed.row] = line.slice(0, ed.col - step) + line.slice(ed.col);
    ed.col -= step;
  } else if (ed.row > 0) {
    const prev = ed.lines[ed.row - 1];
    const cur = ed.lines[ed.row];
    ed.lines.splice(ed.row - 1, 2, prev + cur);
    ed.row -= 1;
    ed.col = prev.length;
  }
  clamp(ed);
}

export function del(ed) {
  ed.goalCol = null;
  const line = ed.lines[ed.row];
  if (ed.col < line.length) {
    ed.lines[ed.row] = line.slice(0, ed.col) + line.slice(ed.col + 1);
  } else if (ed.row < ed.lines.length - 1) {
    ed.lines.splice(ed.row, 2, line + ed.lines[ed.row + 1]);
  }
  clamp(ed);
}

export function move(ed, dir) {
  if (dir === 'left') {
    ed.goalCol = null;
    if (ed.col > 0) ed.col -= 1;
    else if (ed.row > 0) {
      ed.row -= 1;
      ed.col = ed.lines[ed.row].length;
    }
  } else if (dir === 'right') {
    ed.goalCol = null;
    if (ed.col < ed.lines[ed.row].length) ed.col += 1;
    else if (ed.row < ed.lines.length - 1) {
      ed.row += 1;
      ed.col = 0;
    }
  } else if (dir === 'up') {
    ed.row = Math.max(0, ed.row - 1);
  } else if (dir === 'down') {
    ed.row = Math.min(ed.lines.length - 1, ed.row + 1);
  }
  clamp(ed);
}

export function moveToLineStart(ed) {
  ed.col = 0;
}

export function moveToLineEnd(ed) {
  ed.col = ed.lines[ed.row].length;
}

export function moveToDocStart(ed) {
  ed.row = 0;
  ed.col = 0;
}

export function moveToDocEnd(ed) {
  ed.row = ed.lines.length - 1;
  ed.col = ed.lines[ed.row].length;
}

/** Keep the cursor inside the visible window. */
export function ensureVisible(ed, viewRows, viewCols, gutter) {
  if (ed.row < ed.scrollTop) ed.scrollTop = ed.row;
  if (ed.row >= ed.scrollTop + viewRows) ed.scrollTop = ed.row - viewRows + 1;
  const usable = Math.max(10, viewCols - gutter);
  if (ed.col < ed.scrollX) ed.scrollX = ed.col;
  if (ed.col >= ed.scrollX + usable) ed.scrollX = ed.col - usable + 1;
  if (ed.scrollTop < 0) ed.scrollTop = 0;
  if (ed.scrollX < 0) ed.scrollX = 0;
  return { usable };
}

export { rowWidth };
