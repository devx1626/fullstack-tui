import { seg, fit, clip, width } from '../tui/canvas.js';
import { box, clampRows, sectionLabel, prose, codeBlock, split, highlightTokens, diffCode } from '../tui/widgets.js';
import { ensureVisible, editorText, editorTexts } from './editor.js';
import { buildWrapDoc, caretScreenRow, firstVisibleRow } from '../core/softwrap.js';

const KIND = {
  debug: { label: 'DEBUG', color: 'warn', blurb: 'Find and fix the bugs in this code.' },
  write: { label: 'WRITE', color: 'accent', blurb: 'Write this from scratch.' },
  synthesis: { label: 'SYNTHESIS', color: 'star', blurb: 'Combine multiple technologies to build a feature.' },
};

// ---------------------------------------------------------------------------
// Small segment helpers
// ---------------------------------------------------------------------------

/** Cut `len` characters starting at `start` out of a segment list. */
function sliceSegs(segs, start, len) {
  const out = [];
  let pos = 0;
  for (const s of segs) {
    const end = pos + s.text.length;
    if (end <= start) {
      pos = end;
      continue;
    }
    if (pos >= start + len) break;
    const from = Math.max(0, start - pos);
    const to = Math.min(s.text.length, start + len - pos);
    if (to > from) out.push({ text: s.text.slice(from, to), s: s.s });
    pos = end;
  }
  return out;
}

/** Draw an inverted block at character index `at` so the caret is always visible. */
function withCursor(segs, at, theme) {
  const out = [];
  let pos = 0;
  let placed = false;
  for (const s of segs) {
    if (placed) {
      out.push(s);
      continue;
    }
    if (at >= pos + s.text.length) {
      out.push(s);
      pos += s.text.length;
      continue;
    }
    const local = at - pos;
    const before = s.text.slice(0, local);
    const ch = s.text.slice(local, local + 1);
    const after = s.text.slice(local + 1);
    if (before) out.push({ text: before, s: s.s });
    out.push({ text: ch || ' ', s: { ...s.s, reverse: true, bold: true } });
    if (after) out.push({ text: after, s: s.s });
    placed = true;
    pos += s.text.length;
  }
  if (!placed) out.push({ text: ' ', s: { reverse: true, fg: theme.text } });
  return out;
}

/** Replace `span` characters at `start` with `insert`, keeping the row width. */
function spliceRow(row, start, span, insert) {
  const total = width(row);
  const head = sliceSegs(row, 0, Math.max(0, start));
  const tail = sliceSegs(row, start + span, Math.max(0, total - start - span));
  return fit([...head, ...insert, ...tail], total);
}

const COMPLETION_KIND = { tag: 'tag', attr: 'attr', prop: 'prop', value: 'value', kw: 'key', snip: 'snip', fn: 'fn', cmd: 'cmd', word: 'word' };

/** The suggestion list drawn over the code, as used by `editorPanel`. */
function completionPopup(app, w, items, index) {
  const t = app.theme;
  const innerW = w - 2;
  const labelW = Math.min(22, Math.max(12, Math.floor(innerW * 0.4)));
  return items.map((it, i) => {
    const active = i === index;
    const bg = active ? t.accent : t.panelAlt;
    const fg = active ? t.bg : t.text;
    const detailW = Math.max(0, innerW - labelW - 10);
    return fit([
      seg(' ' + it.label.slice(0, labelW - 1).padEnd(labelW - 1), { fg, bg, bold: active }),
      seg(' ' + (COMPLETION_KIND[it.kind] || it.kind).padEnd(5), { fg: active ? t.bg : t.muted, bg }),
      seg(' ' + String(it.detail || '').slice(0, detailW), { fg: active ? t.bg : t.faint, bg, italic: true }),
    ], w, { bg });
  });
}

// ---------------------------------------------------------------------------
// Brief / results column
// ---------------------------------------------------------------------------

function resultsBlock(app, w) {
  const t = app.theme;
  const res = app.state.results;
  const rows = [];
  if (!res) {
    rows.push(sectionLabel(t, w, 'Checks', 'Ctrl+S runs them'));
    rows.push(fit([
      seg('    Nothing checked yet. Write your answer on the right, then press ', { fg: t.faint }),
      seg('Ctrl+S', { fg: t.muted, bold: true }),
      seg('.', { fg: t.faint }),
    ], w, { bg: t.bg }));
    return rows;
  }

  const passed = res.results.filter((r) => r.ok).length;
  rows.push(fit([
    seg('  CHECKS  ', { fg: t.accent, bold: true }),
    seg(`${passed}/${res.results.length}`, { fg: passed === res.results.length ? t.good : t.bad, bold: true }),
    seg(passed === res.results.length ? '   everything passes.' : '   keep going.', { fg: passed === res.results.length ? t.good : t.muted }),
  ], w, { bg: t.bg }));

  if (res.error) {
    rows.push(fit([
      seg('    ! ', { fg: t.bad, bold: true }),
      seg(res.error, { fg: t.bad }),
    ], w, { bg: t.bg }));
  }

  for (const r of res.results) {
    rows.push(fit([
      seg('    ', {}),
      seg(r.ok ? '✓ ' : '✗ ', { fg: r.ok ? t.good : t.bad, bold: true }),
      seg(r.label, { fg: r.ok ? t.muted : t.text }),
    ], w, { bg: t.bg }));
    if (!r.ok && r.message) {
      for (const line of prose(t, w - 10, r.message, { fg: t.warn })) {
        rows.push(fit([seg('        ', {}), ...line], w, { bg: t.bg }));
      }
    }
    if (!r.ok && r.line) {
      rows.push(fit([
        seg('        → line ', { fg: t.accent, bold: true }),
        seg(String(r.line), { fg: t.accent, bold: true }),
        seg('  (Ctrl+J jumps there)', { fg: t.faint }),
      ], w, { bg: t.bg }));
    }
    if (!r.ok && r.hint) {
      rows.push(fit([seg('        hint: ', { fg: t.faint }), seg(r.hint, { fg: t.faint, italic: true })], w, { bg: t.bg }));
    }
  }

  if (res.logs && res.logs.length) {
    rows.push(fit([], w, { bg: t.bg }));
    rows.push(sectionLabel(t, w, 'Console output', `${res.logs.length} line(s)`));
    res.logs.slice(0, 12).forEach((l) => {
      rows.push(fit([seg('    ', {}), seg(String(l).slice(0, w - 8), { fg: t.codeText }), ], w, { bg: t.bg }));
    });
  }

  if (res.review && res.review.length) {
    rows.push(fit([], w, { bg: t.bg }));
    rows.push(sectionLabel(t, w, 'Review notes', 'style and structure, not correctness'));
    for (const note of res.review) {
      for (const line of prose(t, w - 8, note, { fg: t.muted })) {
        rows.push(fit([seg('    · ', { fg: t.faint }), ...line], w, { bg: t.bg }));
      }
    }
  }

  return rows;
}

function briefPanel(app, w, h) {
  const t = app.theme;
  const { module: mod, lesson, challenge } = app.state.challenge;
  const kind = KIND[challenge.kind] || KIND.write;
  const rec = app.store.challengeRecord(app.state.challenge.id);
  const rows = [];

  rows.push(fit([
    seg('  ', {}),
    seg(` ${kind.label} `, { fg: t.bg, bg: t[kind.color], bold: true }),
    seg(`  ${challenge.id}`, { fg: t.text, bold: true }),
    seg(`   ${challenge.difficulty} · ~${challenge.minutes} min · ${challenge.lang}`, { fg: t.faint }),
  ], w, { bg: t.bg }));
  rows.push(fit([
    seg('  ', {}),
    seg(mod.title, { fg: t.secondary }),
    seg('  /  ', { fg: t.faint }),
    seg(lesson.title, { fg: t.muted }),
    seg(rec.passed ? '   ✓ already solved' : '', { fg: t.good, bold: true }),
  ], w, { bg: t.bg }));
  rows.push(fit([], w, { bg: t.bg }));

  for (const line of prose(t, w - 4, challenge.prompt)) {
    rows.push(fit([seg('  ', {}), ...line], w, { bg: t.bg }));
  }
  rows.push(fit([], w, { bg: t.bg }));

  rows.push(sectionLabel(t, w, 'Requirements'));
  for (const r of challenge.requirements || []) {
    for (const line of prose(t, w - 8, r)) {
      rows.push(fit([seg('    ○ ', { fg: t.accent }), ...line], w, { bg: t.bg }));
    }
  }

  if (app.state.hintsShown > 0) {
    rows.push(fit([], w, { bg: t.bg }));
    rows.push(sectionLabel(t, w, 'Hints', `${app.state.hintsShown}/${(challenge.hints || []).length} shown`));
    for (const hint of (challenge.hints || []).slice(0, app.state.hintsShown)) {
      for (const line of prose(t, w - 8, hint, { fg: t.warn })) {
        rows.push(fit([seg('    ? ', { fg: t.warn }), ...line], w, { bg: t.bg }));
      }
    }
  } else if ((challenge.hints || []).length) {
    rows.push(fit([
      seg('    ', {}),
      seg(`${challenge.hints.length} hints available`, { fg: t.faint }),
      seg(' - press ', { fg: t.faint }),
      seg('Ctrl+H', { fg: t.muted }),
      seg(' one at a time rather than jumping to the answer.', { fg: t.faint }),
    ], w, { bg: t.bg }));
  }

  rows.push(fit([], w, { bg: t.bg }));
  rows.push(...resultsBlock(app, w));

  const maxScroll = Math.max(0, rows.length - h);
  const offset = Math.max(0, Math.min(app.state.briefScroll || 0, maxScroll));
  app.state.briefScroll = offset;

  const indicator = rows.length > h
    ? fit([seg('  ', {}), seg(`${offset + 1}-${Math.min(rows.length, offset + h)} of ${rows.length}  (j/k to scroll)`, { fg: t.faint })], w, { bg: t.bg })
    : fit([], w, { bg: t.bg });

  return clampRows([indicator, ...rows.slice(offset, offset + h - 1)], w, h, t);
}

// ---------------------------------------------------------------------------
// Editor column
// ---------------------------------------------------------------------------

function editorPanel(app, w, h) {
  const t = app.theme;
  const { challenge } = app.state.challenge;
  const ed = app.getActiveEditor();
  const lang = challenge.lang || 'js';
  const rows = [];

  // Multi-file challenges get editor tabs, like an IDE.
  const fileNames = app.state.editors ? Object.keys(app.state.editors) : null;
  if (fileNames && fileNames.length > 1) {
    const activeName = fileNames[app.state.editorTab || 0] || fileNames[0];
    const tabSegs = [seg('  ', {})];
    fileNames.forEach((n, i) => {
      if (i) tabSegs.push(seg('  ', {}));
      const active = n === activeName;
      tabSegs.push(seg(` ${n} `, { fg: active ? t.bg : t.muted, bg: active ? t.accent : t.panelAlt, bold: active }));
    });
    tabSegs.push(seg('   Ctrl+Q / Ctrl+W switch', { fg: t.faint }));
    rows.push(fit(tabSegs, w, { bg: t.bg }));
  } else {
    const name = `${challenge.id}.${{ html: 'html', css: 'css', js: 'js', ts: 'ts', sql: 'sql', sh: 'sh', jsx: 'jsx' }[lang] || 'txt'}`;
    rows.push(fit([
      seg('  ', {}),
      seg(name, { fg: t.text, bold: true }),
      seg(`   ${lang}`, { fg: t.faint }),
      seg(ed.lines.length > 1 && editorText(ed) === (challenge.starter || '') ? '   starter code loaded' : '', { fg: t.faint }),
    ], w, { bg: t.bg }));
  }

  const showLogs = app.state.showLogs && app.state.results && app.state.results.logs && app.state.results.logs.length;
  const logsH = showLogs ? Math.min(8, app.state.results.logs.length + 2) : 0;
  const boxH = Math.max(4, h - 2 - logsH);
  const innerH = boxH - 2;
  const insideW = w - 2;
  const digits = String(ed.lines.length).length;
  const gutterW = digits + 2;
  const textW = Math.max(8, insideW - gutterW);

  // Soft-wrap model (Q11): built when settings.editor.wrap is on so that
  // editorVertical() navigates by SCREEN rows and the loop below draws
  // segments instead of logical lines.
  const wrapOn = app.settings?.data?.editor?.wrap === true;
  app.state.editorPaneWidth = w;
  let wrapDoc = null;
  let firstVisibleScreen = 0;
  if (wrapOn) {
    wrapDoc = buildWrapDoc(ed.lines, textW);
    app.state.wrapDoc = wrapDoc;
    const screenRow = caretScreenRow(wrapDoc, ed.row, ed.col);
    const viewRows = Math.max(1, innerH);
    ed.wrappedScrollTop = firstVisibleRow(screenRow, viewRows, ed.wrappedScrollTop || 0);
    firstVisibleScreen = Math.min(ed.wrappedScrollTop, Math.max(0, wrapDoc.totalRows - viewRows));
    app.state.editorScreenRow = screenRow - firstVisibleScreen;
  } else {
    ed.wrappedScrollTop = 0;
    app.state.editorScreenRow = null;
    app.state.wrapDoc = null;
  }

  const { usable } = ensureVisible(ed, innerH, insideW, gutterW);
  const cols = Math.min(textW, usable);

  // Top border with the language label.
  const title = ` ${lang} `;
  rows.push(fit([
    seg('┌─', { fg: t.borderFocus }),
    seg(title, { fg: t.borderFocus, bold: true }),
    seg('─'.repeat(Math.max(0, w - title.length - 4)), { fg: t.borderFocus }),
    seg('┐', { fg: t.borderFocus }),
  ], w, { bg: t.bg }));

  const state = { blockComment: false };
  let cursorRowInPanel = -1;
  let cursorColInPanel = -1;

  // Tokens are cached per logical line: in wrap mode several screen rows draw
  // from the same line, and the highlight state machine must see each line
  // exactly once, in order (rows ascend → lines ascend).
  const tokenCache = new Map();
  const tokensFor = (li, line) => {
    let entry = tokenCache.get(li);
    if (!entry) {
      entry = highlightTokens(line, lang, t, state);
      tokenCache.set(li, entry);
    }
    return entry;
  };

  // Panel row → content. Classic mode: one logical line per row.
  // Wrap mode (Q11): one SEGMENT per row; the gutter number shows only on a
  // line's first segment, continuation rows get a blank gutter.
  let scanHint = 0; // screen rows ascend → the owning line index ascends too
  for (let i = 0; i < innerH; i += 1) {
    const bg = t.codeBg;
    let li;
    let line;
    let segStart = 0;
    let segWidth = 0;
    let firstOfLine = true;
    let caretHere = false;

    if (wrapDoc) {
      const screenIdx = firstVisibleScreen + i;
      let lineIdx = -1;
      for (let k = scanHint; k < wrapDoc.lines.length; k += 1) {
        const l = wrapDoc.lines[k];
        if (screenIdx >= l.startRow && screenIdx < l.startRow + l.rows) { lineIdx = k; break; }
      }
      if (lineIdx === -1) {
        // Past the end of the document: blank row.
        rows.push(fit([
          seg('│', { fg: t.border, bg }),
          seg(' '.repeat(insideW), { bg }),
          seg('│', { fg: t.border, bg }),
        ], w, { bg: t.bg }));
        continue;
      }
      scanHint = lineIdx;
      li = lineIdx;
      line = ed.lines[li] ?? '';
      const owner = wrapDoc.lines[li];
      const segInfo = owner.segs[screenIdx - owner.startRow];
      segStart = segInfo.start;
      segWidth = segInfo.width;
      firstOfLine = segInfo.start === 0;
      caretHere = li === ed.row && caretScreenRow(wrapDoc, ed.row, ed.col) === screenIdx;
    } else {
      li = ed.scrollTop + i;
      line = ed.lines[li];
      if (line === undefined) {
        rows.push(fit([
          seg('│', { fg: t.border, bg }),
          seg(' '.repeat(insideW), { bg }),
          seg('│', { fg: t.border, bg }),
        ], w, { bg: t.bg }));
        continue;
      }
      segStart = ed.scrollX;
      segWidth = cols;
      caretHere = li === ed.row;
    }

    const tokens = tokensFor(li, line);
    const styled = tokens.map((tk) => ({ text: tk.text, s: { fg: tk.fg ?? t.codeText, bg, bold: tk.bold, italic: tk.italic } }));
    const windowed = sliceSegs(styled, segStart, segWidth);
    const cursorIndex = ed.col - segStart;
    const withCare = caretHere && cursorIndex >= 0 && cursorIndex <= segWidth ? withCursor(windowed, cursorIndex, t) : windowed;

    if (caretHere) {
      cursorRowInPanel = rows.length;
      cursorColInPanel = 1 + gutterW + Math.max(0, Math.min(cursorIndex, segWidth));
    }

    const gutter = firstOfLine ? String(li + 1).padStart(digits) + ' ' : ' '.repeat(digits + 1);
    rows.push(fit([
      seg('│', { fg: t.border, bg }),
      seg(gutter, { fg: caretHere ? t.muted : t.faint, bg }),
      seg(' ', { bg }),
      ...withCare,
      seg('│', { fg: t.border, bg }),
    ], w, { bg: t.bg }));
  }

  rows.push(fit([
    seg('└', { fg: t.border }),
    seg('─'.repeat(Math.max(0, w - 2)), { fg: t.border }),
    seg('┘', { fg: t.border }),
  ], w, { bg: t.bg }));

  const pos = `Ln ${ed.row + 1}, Col ${ed.col + 1}`;
  const pct = ed.lines.length ? Math.round(((ed.row + 1) / ed.lines.length) * 100) : 100;
  rows.push(fit([
    seg('  ', {}),
    seg(pos, { fg: t.muted }),
    seg(`   ${ed.lines.length} lines`, { fg: t.faint }),
    seg(`   ${pct}%`, { fg: t.faint }),
    seg('   Ctrl+Space complete  Ctrl+B browser  Ctrl+S check  Ctrl+G solution', { fg: t.faint }),
  ], w, { bg: t.bg }));

  // The suggestion popup is anchored to the caret line: below it when there is
  // room, above it when the caret is near the foot of the pane.
  const comp = app.state.completion;
  if (comp && comp.items.length && cursorRowInPanel >= 0) {
    const items = comp.items.slice(0, 8);
    const popupH = items.length;
    const widest = Math.max(20, ...items.map((it) => it.label.length + String(it.detail || '').length + 12));
    const popupW = Math.max(24, Math.min(insideW - 2, widest));
    const caretCol = Math.max(0, cursorColInPanel - 1);
    const startCol = Math.max(1, Math.min(1 + insideW - popupW - 1, caretCol));
    const lastTextRow = 2 + innerH - 1;
    const below = cursorRowInPanel + 1;
    const startRow = below + popupH - 1 <= lastTextRow ? below : Math.max(2, cursorRowInPanel - popupH);
    const popup = completionPopup(app, popupW, items, comp.index);
    popup.forEach((row, k) => {
      const idx = startRow + k;
      if (idx >= 0 && idx < rows.length) rows[idx] = spliceRow(rows[idx], startCol, popupW, row);
    });
  }

  if (showLogs) {
    const logs = app.state.results.logs.slice(-(logsH - 2));
    const inner = [
      fit([seg(' ' + logs.join('  |  ').slice(0, w - 6), { fg: t.codeText })], w - 2, { bg: t.bg }),
    ];
    rows.push(...box(t, w, inner, { title: 'console output', focused: false, minHeight: logsH - 2 }));
  }

  return { rows: clampRows(rows, w, h, t), cursorRowInPanel, cursorColInPanel };
}

// ---------------------------------------------------------------------------
// Solution view
// ---------------------------------------------------------------------------

function renderSolution(app, w, h) {
  const t = app.theme;
  const { challenge } = app.state.challenge;
  const rows = [];
  rows.push(sectionLabel(t, w, 'Worked solution', 'y loads it into the editor, Ctrl+G hides it again'));
  
  if (app.state.showDiff) {
    rows.push(fit([
      seg('  Comparing your attempt against the solution: ', { fg: t.muted }),
      seg('red = your error, green = correct way', { fg: t.accent, bold: true }),
    ], w, { bg: t.bg }));
    rows.push(fit([], w, { bg: t.bg }));
    
    const currentCode = editorText(app.getActiveEditor());
    const diffRows = diffCode(t, w - 4, currentCode, challenge.solution || '', challenge.lang || 'js');
    const all = diffRows.map((r) => fit([seg('  ', {}), ...r], w, { bg: t.bg }));
    const offset = Math.max(0, Math.min(app.state.solutionCursor, Math.max(0, all.length - (h - 5))));
    app.state.solutionCursor = offset;
    rows.push(...all.slice(offset, offset + h - 5));
  } else {
    rows.push(fit([
      seg('  Comparing your attempt against this is the fastest way to learn - ', { fg: t.muted }),
      seg('only after you have tried.', { fg: t.warn, bold: true }),
    ], w, { bg: t.bg }));
    rows.push(fit([], w, { bg: t.bg }));

    const code = codeBlock(t, w - 4, challenge.solution || '', challenge.lang || 'js', { title: challenge.id });
    const all = code.map((r) => fit([seg('  ', {}), ...r], w, { bg: t.bg }));
    const offset = Math.max(0, Math.min(app.state.solutionCursor, Math.max(0, all.length - (h - 5))));
    app.state.solutionCursor = offset;
    rows.push(...all.slice(offset, offset + h - 5));
  }

  rows.push(fit([], w, { bg: t.bg }));
  rows.push(fit([
    seg('  The checks this solution passes: ', { fg: t.faint }),
    seg(String((challenge.checks || []).length), { fg: t.accent, bold: true }),
    seg(' - read them again, they are the real specification.', { fg: t.faint }),
  ], w, { bg: t.bg }));

  return clampRows(rows, w, h, t);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export default function renderChallenge(app, w, h) {
  const t = app.theme;
  app.state.editorCursorPos = null;
  if (app.state.showSolution) return renderSolution(app, w, h);

  if (app.state.pane === 'both') {
    const leftW = Math.max(38, Math.round(w * 0.46));
    const rightW = w - leftW;
    const left = briefPanel(app, leftW, h);
    const right = editorPanel(app, rightW, h);
    if (right.cursorRowInPanel >= 0) {
      // +4 because the frame has a 3-row header above the body.
      app.state.editorCursorPos = { row: 4 + right.cursorRowInPanel, col: leftW + right.cursorColInPanel + 1 };
    }
    return split(t, w, leftW, left, right.rows);
  }

  if (app.state.pane === 'brief') return briefPanel(app, w, h);

  const { rows, cursorRowInPanel, cursorColInPanel } = editorPanel(app, w, h);
  if (cursorRowInPanel >= 0) app.state.editorCursorPos = { row: 4 + cursorRowInPanel, col: cursorColInPanel + 1 };
  return rows;
}