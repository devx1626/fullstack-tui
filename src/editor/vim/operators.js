/**
 * Vim operators (overhaul §8.8, task 2.4).
 *
 * An operator (`d`, `c`, `y`, `>`, `<`, `gu`, `gU`, `gc`) never touches the
 * document: it turns a resolved RANGE into an `applyEdit` change list, the text
 * a yank/delete should store, and where the caret ends up. That is what lets
 * the caller apply the whole thing as one transaction (one undo step) and lets
 * `y` copy without an edit at all.
 *
 * `resolveTarget` encodes the three vim rules that surprise people:
 *
 *   - an operator doubles (`dd`, `yy`, `>>`) to mean the lines the caret is on;
 *   - an INCLUSIVE motion contributes the character it lands on (`de`, `df,`),
 *     an exclusive one does not (`dw`, `d$`) — the flag comes from motions.js;
 *   - a LINEWISE motion (`dj`, `dG`) makes the whole operation linewise, so the
 *     trailing newline travels with the text and `p` pastes whole lines.
 */
import { cmpPos, pos, range } from '../document.js';

/**
 * A bare `{start, end}` pair is not a selection: `selection.js` speaks
 * `{anchor, head}`. Every delete funnels through here so the two shapes cannot
 * drift apart (a `{start, end}` passed to `deleteChanges` used to throw on
 * `sel.anchor.row`).
 */
const deleteRange = (start, end) => deleteChanges({ anchor: start, head: end });

/**
 * Delete a range with the document model's line-array caveat handled: when the
 * range runs to the very END of the text and starts at column 0, the newline
 * BEFORE it goes too. Without this, `dG` on the last line and `x`/`dd` at the
 * end leave a phantom empty final line behind.
 *
 * Only a column-0 start qualifies, so a join like `X` at column 0 (which starts
 * at the end of the previous line) keeps its own exact range.
 */
export function deleteSpan(doc, start, end) {
  const lastRow = doc.lines.length - 1;
  const atDocEnd = end.row === lastRow && end.col === doc.lines[lastRow].length;
  if (atDocEnd && start.col === 0 && start.row > 0) {
    return deleteChanges({ anchor: pos(start.row - 1, doc.lines[start.row - 1].length), head: end });
  }
  return deleteChanges({ anchor: start, head: end });
}
import {
  blockLines, commentChanges, deleteChanges, indentChanges, linewise, outdentChanges,
  selRange, selText, selectLineRange,
} from '../selection.js';
import { BLOCKWISE, CHARWISE, LINEWISE, yank } from '../registers.js';

export { deleteRange };

/**
 * The rows a LINE-oriented operation should touch.
 *
 * `selection.js` counts a range that ends at column 0 of a later row as
 * including that row (a mid-line → next-line-start selection does own the
 * newline). A LINEWISE target is a different shape: `V` on line 0 produces
 * `[(0,0), (1,0))` to mean "line 0", so counting the boundary row made `V>`
 * indent the line below as well. Linewise targets are trimmed back to the end
 * of their last line instead.
 */
export function linewiseRows(doc, range, isLinewise) {
  if (!isLinewise || !range) return range;
  const { start, end } = range;
  if (end.row > start.row && end.col === 0) {
    const row = end.row - 1;
    return { start, end: pos(row, doc.lines[row].length) };
  }
  return range;
}
export const OPERATORS = new Set(['d', 'c', 'y', '>', '<', 'gu', 'gU', 'gc']);
export const OPERATOR_NAMES = {
  d: 'delete', c: 'change', y: 'yank', '>': 'indent', '<': 'outdent', gu: 'lowercase', gU: 'uppercase', gc: 'comment',
};

/** Visual modes, in the vocabulary `resolveTarget` understands. */
export const VISUAL_MODES = { v: 'char', V: 'line', '<C-v>': 'block' };

/**
 * Resolve an operator's range.
 *
 * @param {object} doc
 * @param {{row,col}} start the caret the operator started from
 * @param {{caret,inclusive,linewise}|null} motion from `applyMotion`
 * @param {{ selection?: object, mode?: 'char'|'line'|'block' }} [opts]
 */
export function resolveTarget(doc, start, motion, { selection = null, mode = 'char', expanded = false } = {}) {
  if (selection) {
    // `expanded` says the caller already turned the selection into whole lines
    // (visual-line). Expanding twice is how `Vd` on line 0 of two lines used to
    // delete BOTH lines: the second pass took the line range as a fresh
    // selection and grew it by a row.
    const effective = mode === 'line' && !expanded ? linewise(doc, selection) : selection;
    return {
      range: selRange(effective),
      linewise: mode === 'line',
      blockwise: mode === 'block',
      selection: effective,
    };
  }
  if (!motion) return { range: { start, end: start }, linewise: false, blockwise: false, selection: null };

  if (motion.linewise) {
    const from = Math.min(start.row, motion.caret.row);
    const to = Math.max(start.row, motion.caret.row);
    const sel = selectLineRange(doc, from, to);
    return { range: selRange(sel), linewise: true, blockwise: false, selection: sel };
  }

  let end = motion.caret;
  // `de` — an inclusive motion contributes the character it landed on.
  if (motion.inclusive && cmpPos(end, start) >= 0) end = pos(end.row, end.col + 1);
  return { range: range(start, end), linewise: false, blockwise: false, selection: null };
}

/**
 * Apply an operator to a resolved target.
 *
 * @returns {{ changes, caret, registers, status, kind, enteredInsert }}
 *   `registers` is null when nothing was stored (indent, case, comment).
 */
export function applyOperator({
  doc, operator, target, registers = null, registerName = '"', tabSize = 2, lineComment = '//',
}) {
  const { range: r, linewise: isLinewise, blockwise, selection } = target;
  const rows = linewiseRows(doc, r, isLinewise);
  const kind = OPERATOR_NAMES[operator] || operator;
  const kindOfRegister = blockwise ? BLOCKWISE : isLinewise ? LINEWISE : CHARWISE;

  switch (operator) {
    case 'y': {
      const text = textForRange(doc, r, { blockwise, selection });
      return {
        changes: [],
        caret: r.start,
        registers: text ? yank(registers, text, { name: registerName, kind: kindOfRegister, write: 'yank' }) : registers,
        status: text ? `yanked ${describe(text, isLinewise)}` : 'nothing to yank',
        kind,
        enteredInsert: false,
      };
    }

    case 'd':
    case 'c': {
      const text = textForRange(doc, r, { blockwise, selection });
      // A block is one change PER ROW: a single spanning range would swallow
      // everything between the block's corners and join the lines.
      const changes = !text ? []
        : blockwise && selection
          ? blockLines(doc, selection).filter((l) => !l.empty)
            .map((l) => ({ start: pos(l.row, l.start), end: pos(l.row, l.end), text: '' }))
          : deleteSpan(doc, r.start, r.end);
      return {
        changes,
        caret: r.start,
        registers: text ? yank(registers, text, { name: registerName, kind: kindOfRegister, write: 'delete' }) : registers,
        status: text
          ? `${operator === 'c' ? 'changed' : 'deleted'} ${describe(text, isLinewise)}`
          : 'nothing to delete',
        kind,
        enteredInsert: operator === 'c',
      };
    }

    case '>':
    case '<': {
      const changes = operator === '>'
        ? indentChanges(doc, rows, tabSize)
        : outdentChanges(doc, rows, tabSize);
      // The indent is about to change, so the caret is the first non-blank
      // AFTER it — vim leaves the cursor on the re-indented text, not where the
      // old indentation was.
      const width = Math.max(1, Number(tabSize) || 2);
      const shift = operator === '>' ? width : -width;
      return {
        changes,
        caret: pos(r.start.row, Math.max(0, firstNonBlankColumn(doc, r.start.row) + shift)),
        registers: null,
        status: `${operator === '>' ? 'indented' : 'outdented'} ${r.end.row - r.start.row + 1} line(s)`,
        kind,
        enteredInsert: false,
      };
    }

    case 'gu':
    case 'gU': {
      const text = textForRange(doc, r, { blockwise, selection });
      const next = operator === 'gu' ? text.toLowerCase() : text.toUpperCase();
      return {
        changes: next === text ? [] : [{ start: r.start, end: r.end, text: next }],
        caret: r.start,
        registers: null,
        status: next === text ? 'nothing to change' : `${operator === 'gu' ? 'lowercased' : 'uppercased'} ${describe(text, isLinewise)}`,
        kind,
        enteredInsert: false,
      };
    }

    case 'gc': {
      const changes = commentChanges(doc, isLinewise ? rows : (selection || r), lineComment);
      return {
        changes,
        caret: firstNonBlankPos(doc, r.start.row),
        registers: null,
        status: changes.length ? 'toggled comments' : 'nothing to comment',
        kind,
        enteredInsert: false,
      };
    }

    default:
      return { changes: [], caret: r.start, registers, status: `unknown operator ${operator}`, kind, enteredInsert: false };
  }
}

/**
 * `p` / `P`: charwise pastes after/before the caret, linewise pastes whole
 * lines below/above. The caret lands at the END of what was pasted (vim leaves
 * it on the last character; end-of-insert is the predictable choice for a
 * non-modal-feeling editor, and it is what continued typing needs).
 */
export function putChanges({ doc, caret, entry, count = 1, before = false }) {
  if (!entry || !entry.text) return { changes: [], caret };
  const times = Math.max(1, Number(count) || 1);
  const body = entry.kind === LINEWISE && entry.text.endsWith('\n') ? entry.text.slice(0, -1) : entry.text;
  const repeated = entry.kind === LINEWISE
    ? Array.from({ length: times }, () => body).join('\n')
    : body.repeat(times);
  const indentOf = (text) => (/^[ \t]*/.exec(String(text).split('\n')[0] || '')[0] || '').length;

  if (entry.kind === LINEWISE) {
    // A linewise paste inserts whole LINES. Writing `"a\n"` as raw text at the
    // end of a line would splice it into that line (`aa` + a blank row), so the
    // change starts at column 0 of a line instead: the inserted newline is what
    // creates the new row.
    if (before) {
      const at = pos(caret.row, 0);
      return {
        changes: [{ start: at, end: at, text: `${repeated}\n` }],
        caret: pos(caret.row, indentOf(repeated)),
      };
    }
    const row = caret.row;
    if (row >= doc.lines.length - 1) {
      // Below the last line: the block is appended, and the document must not
      // gain a phantom trailing empty line for it.
      const at = pos(row, doc.lines[row].length);
      return {
        changes: [{ start: at, end: at, text: `\n${repeated}` }],
        caret: pos(row + 1, indentOf(repeated)),
      };
    }
    const at = pos(row + 1, 0);
    return {
      changes: [{ start: at, end: at, text: `${repeated}\n` }],
      caret: pos(row + 1, indentOf(repeated)),
    };
  }

  // Charwise `p` pastes AFTER the character under the caret (vim); `P` pastes
  // before it. Without the +1 the two would be indistinguishable.
  const line = doc.lines[caret.row] || '';
  const at = before || caret.col >= line.length ? caret : pos(caret.row, caret.col + 1);
  return {
    changes: [{ start: at, end: at, text: repeated }],
    caret: pos(at.row, at.col + repeated.length),
  };
}

/** `J`: join the caret's line with the next (`count` lines). */
export function joinChanges(doc, caret, count = 1) {
  const times = Math.max(1, Number(count) || 1);
  const changes = [];
  let row = caret.row;
  for (let i = 0; i < times && row < doc.lines.length - 1; i += 1) {
    const line = doc.lines[row];
    const next = doc.lines[row + 1];
    // The joined text stays in the document (`after` in applyEdit), so this
    // change only replaces [end-of-line, first-non-blank of the next line) with
    // the single space vim inserts — the next line's own indent is what gets
    // trimmed away.
    const leading = /^[ \t]*/.exec(next)[0].length;
    const trimmed = next.slice(leading);
    const needsSpace = line !== '' && !/\s$/.test(line) && trimmed !== '';
    changes.push({
      start: pos(row, line.length),
      end: pos(row + 1, leading),
      text: needsSpace ? ' ' : '',
    });
    row += 1;
  }
  return { changes, caret };
}

/** `r<c>`: replace the next `count` characters with `count` copies of `ch`. */
export function replaceCharChanges(doc, caret, ch, count = 1) {
  const line = doc.lines[caret.row];
  if (caret.col >= line.length) return { changes: [], caret };
  const end = pos(caret.row, Math.min(caret.col + Math.max(1, count), line.length));
  return {
    changes: [{ start: caret, end, text: String(ch).repeat(end.col - caret.col) }],
    caret: pos(caret.row, Math.max(0, end.col - 1)),
  };
}

/**
 * `x` / `X`: delete `count` characters forward/backward.
 * At end-of-line `x` pulls in the next line's newline and indent (so it joins);
 * at column 0 `X` joins with the previous line rather than doing nothing.
 */
export function deleteCharChanges(doc, caret, { count = 1, backward = false } = {}) {
  const times = Math.max(1, Number(count) || 1);
  if (backward) {
    if (caret.col === 0) {
      if (caret.row === 0) return { changes: [], caret, text: '' };
      const start = pos(caret.row - 1, doc.lines[caret.row - 1].length);
      const leading = /^\s*/.exec(doc.lines[caret.row])[0].length;
      const end = pos(caret.row, leading);
      return { changes: deleteSpan(doc, start, end), caret: start, text: '\n' };
    }
    const start = pos(caret.row, Math.max(0, caret.col - times));
    return { changes: deleteRange(start, caret), caret: start, text: doc.lines[caret.row].slice(start.col, caret.col) };
  }
  const line = doc.lines[caret.row];
  const end = pos(caret.row, Math.min(caret.col + times, line.length));
  if (end.col === caret.col) {
    if (caret.row >= doc.lines.length - 1) return { changes: [], caret, text: '' };
    const leading = /^\s*/.exec(doc.lines[caret.row + 1])[0].length;
    const target = pos(caret.row + 1, leading);
    return { changes: deleteRange(caret, target), caret, text: '\n' };
  }
  return { changes: deleteRange(caret, end), caret, text: line.slice(caret.col, end.col) };
}

/** `dd` / `D`-style linewise deletion, used by `dd` and `cc`. */
export function deleteLineChanges(doc, caret, count = 1) {
  const times = Math.max(1, Number(count) || 1);
  const last = Math.min(caret.row + times - 1, doc.lines.length - 1);
  const sel = selectLineRange(doc, caret.row, last);
  return {
    changes: deleteChanges(sel),
    caret: pos(Math.min(caret.row, doc.lines.length - 1), 0),
    text: selText(doc, sel),
  };
}

/** Block-column insert (`<C-v>I` / `<C-v>A`): one change per row. */
export function blockInsertChanges(doc, selection, text, at = 'left') {
  const lines = blockLines(doc, selection);
  const changes = lines.map((l) => {
    const col = at === 'left' ? l.start : l.end;
    return { start: pos(l.row, col), end: pos(l.row, col), text };
  });
  return { changes, caret: changes.length ? changes[changes.length - 1].start : pos(0, 0) };
}

// ---------------------------------------------------------------------------

export function firstNonBlankColumn(doc, row) {
  const m = /^[ \t]*/.exec(doc.lines[row] || '');
  return m ? m[0].length : 0;
}

export function firstNonBlankPos(doc, row) {
  return pos(row, firstNonBlankColumn(doc, row));
}

export function describe(text, isLinewise) {
  if (!text) return 'nothing';
  if (isLinewise) {
    const lines = text.split('\n').filter((l) => l !== '').length || 1;
    return `${lines} line(s)`;
  }
  const chars = text.replace(/\n/g, '').length;
  return `${chars} char(s)`;
}

function textForRange(doc, r, { blockwise, selection }) {
  if (blockwise && selection) {
    return blockLines(doc, selection).map((l) => doc.lines[l.row].slice(l.start, l.end)).join('\n');
  }
  return selText(doc, { anchor: r.start, head: r.end });
}
