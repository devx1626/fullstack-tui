/**
 * The internal browser + dev tools screen.
 *
 * Tab layout, the way a browser's inspector works:
 *   Render   - the page laid out as text, with an inspector sidebar
 *   Elements - the DOM tree, selectable
 *   Styles   - the rules that matched the selected element
 *   Console  - a REPL that runs against the current editor contents
 *   Issues   - accessibility/structure lint plus review notes
 *
 * Every pane is derived from the current challenge's editor contents, so it
 * always reflects exactly what the learner has typed.
 */

import { seg, fit, width } from '../tui/canvas.js';
import { box, clampRows, sectionLabel, prose, split, meter, scrollbar } from '../tui/widgets.js';
import { layoutDocument, elementTree, stylesFor, describeNode, previewParts, synthesisParts } from '../core/browser.js';
import { lint } from '../core/html.js';
import { editorText, editorTexts } from './editor.js';

export const BROWSER_TABS = ['render', 'elements', 'styles', 'console', 'issues'];

const TAB_LABEL = { render: 'Render', elements: 'Elements', styles: 'Styles', console: 'Console', issues: 'Issues' };

/** Cut `len` characters starting at `start` out of a segment list. */
function cutSegs(segs, start, len) {
  const out = [];
  let pos = 0;
  for (const s of segs) {
    const end = pos + s.text.length;
    if (end <= start) { pos = end; continue; }
    if (pos >= start + len) break;
    const from = Math.max(0, start - pos);
    const to = Math.min(s.text.length, start + len - pos);
    if (to > from) out.push({ text: s.text.slice(from, to), s: s.s });
    pos = end;
  }
  return out;
}

/**
 * Apply the pane's scroll offset to a full list of rows and draw a scrollbar in
 * the last column when there is more to see.
 */
function withRail(app, allRows, w, h) {
  const b = app.state.browser;
  const total = allRows.length;
  const maxScroll = Math.max(0, total - h);
  const offset = Math.max(0, Math.min(b.scroll, maxScroll));
  b.scroll = offset;
  const view = allRows.slice(offset, offset + h);
  if (total <= h) return view;
  const rail = scrollbar(app.theme, h, total, offset, app.theme.accent);
  return view.map((row, i) => fit([...cutSegs(row, 0, Math.max(0, w - 1)), ...rail[i]], w));
}

/** Fragment list from the layout engine -> themed segments. */
function paintFragments(frags, theme) {
  return frags.map((f) => seg(f.text, {
    fg: f.s.fg ?? theme.text,
    bg: f.s.bg ?? theme.bg,
    bold: !!f.s.bold,
    italic: !!f.s.italic,
    underline: !!f.s.underline,
    dim: !!f.s.dim,
  }));
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function renderPane(app, w, h, data) {
  const t = app.theme;
  const sidebarW = w >= 84 ? Math.min(30, Math.round(w * 0.26)) : 0;
  const pageW = sidebarW ? w - sidebarW - 1 : w;
  const { lines, meta } = layoutDocument(data.html, data.css, pageW, pageW);

  const pageRows = lines.map((frags) => fit(paintFragments(frags, t), pageW, { bg: t.bg }));

  if (!sidebarW) return clampRows(withRail(app, pageRows, w, h), w, h, t);

  const side = [];
  side.push(fit([seg(' PAGE', { fg: t.accent, bold: true })], sidebarW, { bg: t.bg }));
  side.push(fit([seg('  ' + (meta.title || '(untitled)').slice(0, sidebarW - 4), { fg: t.text, bold: true })], sidebarW, { bg: t.bg }));
  side.push(fit([], sidebarW, { bg: t.bg }));
  side.push(fit([
    seg('  elements  ', { fg: t.faint }),
    seg(String(meta.nodes), { fg: t.text, bold: true }),
  ], sidebarW, { bg: t.bg }));
  side.push(fit([
    seg('  css rules ', { fg: t.faint }),
    seg(String(meta.rules), { fg: t.text, bold: true }),
  ], sidebarW, { bg: t.bg }));
  side.push(fit([
    seg('  viewport  ', { fg: t.faint }),
    seg(`${pageW}ch`, { fg: t.text, bold: true }),
  ], sidebarW, { bg: t.bg }));
  side.push(fit([], sidebarW, { bg: t.bg }));

  side.push(fit([seg(' OUTLINE', { fg: t.accent, bold: true })], sidebarW, { bg: t.bg }));
  if (!meta.headings.length) side.push(fit([seg('  no headings yet', { fg: t.faint })], sidebarW, { bg: t.bg }));
  for (const heading of meta.headings.slice(0, 8)) {
    side.push(fit([seg('  ' + heading.slice(0, sidebarW - 3), { fg: t.muted })], sidebarW, { bg: t.bg }));
  }
  side.push(fit([], sidebarW, { bg: t.bg }));

  side.push(fit([seg(' MEDIA', { fg: t.accent, bold: true })], sidebarW, { bg: t.bg }));
  if (!meta.images.length) side.push(fit([seg('  no images', { fg: t.faint })], sidebarW, { bg: t.bg }));
  meta.images.slice(0, 6).forEach((img) => {
    const ok = img.alt !== null && String(img.alt).trim() !== '';
    side.push(fit([
      seg(ok ? '  ✓ ' : '  ✗ ', { fg: ok ? t.good : t.bad, bold: true }),
      seg(img.src.slice(0, sidebarW - 7), { fg: t.muted }),
    ], sidebarW, { bg: t.bg }));
  });

  side.push(fit([], sidebarW, { bg: t.bg }));
  side.push(fit([seg(' LINKS', { fg: t.accent, bold: true })], sidebarW, { bg: t.bg }));
  if (!meta.links.length) side.push(fit([seg('  no links', { fg: t.faint })], sidebarW, { bg: t.bg }));
  meta.links.slice(0, 6).forEach((href) => {
    side.push(fit([seg('  ' + String(href).slice(0, sidebarW - 3), { fg: t.accentSoft })], sidebarW, { bg: t.bg }));
  });

  const paddedSide = side.slice(0, h);
  while (paddedSide.length < h) paddedSide.push(fit([], sidebarW, { bg: t.bg }));

  const combined = [];
  const rowCount = Math.max(pageRows.length, paddedSide.length);
  for (let i = 0; i < rowCount; i += 1) {
    combined.push(fit([
      ...fit(pageRows[i] || [], pageW, { bg: t.bg }),
      seg('│', { fg: t.border, bg: t.bg }),
      ...fit(paddedSide[i] || [], sidebarW, { bg: t.bg }),
    ], w, { bg: t.bg }));
  }
  return clampRows(withRail(app, combined, w, h), w, h, t);
}

// ---------------------------------------------------------------------------
// Elements
// ---------------------------------------------------------------------------

function elementsPane(app, w, h, data) {
  const t = app.theme;
  const rows = elementTree(data.html);
  const selected = Math.max(0, Math.min(app.state.browser.elementIndex, rows.length - 1));
  app.state.browser.elementIndex = selected;

  const detailW = w >= 90 ? Math.min(46, Math.round(w * 0.42)) : 0;
  const listW = detailW ? w - detailW - 1 : w;
  const innerW = listW - 2;

  const listRows = [];
  const listHeight = Math.max(1, h - 3);
  const offset = Math.max(0, Math.min(app.state.browser.scroll, Math.max(0, rows.length - listHeight)));
  app.state.browser.scroll = offset;

  rows.slice(offset, offset + listHeight).forEach((row, i) => {
    const index = offset + i;
    const active = index === selected;
    const bg = active ? t.panelAlt : t.bg;
    const marker = row.kind === 'text' ? '“' : '<';
    listRows.push(fit([
      seg(active ? ' ▸ ' : '   ', { fg: active ? t.accent : t.faint, bg, bold: active }),
      seg('  '.repeat(Math.min(10, row.depth)), { bg }),
      seg(marker, { fg: row.kind === 'text' ? t.faint : t.secondary, bg }),
      seg(row.label.slice(0, Math.max(4, innerW - row.depth * 2 - 4)), {
        fg: row.kind === 'text' ? t.faint : (active ? t.text : t.text),
        bg,
        bold: active && row.kind === 'element',
        italic: row.kind === 'text',
      }),
    ], listW, { bg }));
  });

  const list = box(t, listW, listRows, { title: `elements (${rows.length})`, focused: true, minHeight: Math.max(1, h - 2) });

  if (!detailW) return clampRows(list, w, h, t);

  // Detail sidebar for the selected node.
  const node = rows[selected] ? rows[selected].node : null;
  const styleInfo = node && node.tag !== '#text' ? stylesFor(data.html, data.css, node, listW) : null;
  const detail = [];
  detail.push(fit([seg(' SELECTED', { fg: t.accent, bold: true })], detailW, { bg: t.bg }));
  detail.push(fit([seg('  ' + describeNode(node).slice(0, detailW - 3), { fg: t.text, bold: true })], detailW, { bg: t.bg }));
  detail.push(fit([], detailW, { bg: t.bg }));

  const attrs = node && node.attrs ? Object.entries(node.attrs) : [];
  detail.push(fit([seg(' ATTRIBUTES', { fg: t.accent, bold: true })], detailW, { bg: t.bg }));
  if (!attrs.length) detail.push(fit([seg('  none', { fg: t.faint })], detailW, { bg: t.bg }));
  attrs.forEach(([k, v]) => {
    detail.push(fit([
      seg('  ' + k, { fg: t.accentSoft }),
      seg('="' + String(v).slice(0, Math.max(2, detailW - k.length - 8)) + '"', { fg: t.string ?? t.muted }),
    ], detailW, { bg: t.bg }));
  });
  detail.push(fit([], detailW, { bg: t.bg }));

  const computed = styleInfo ? styleInfo.computed : {};
  const keys = ['display', 'color', 'background-color', 'font-weight', 'font-style', 'text-decoration', 'text-align', 'list-style'];
  detail.push(fit([seg(' COMPUTED', { fg: t.accent, bold: true })], detailW, { bg: t.bg }));
  const shown = keys.filter((k) => computed[k] !== undefined);
  if (!shown.length) detail.push(fit([seg('  no declared styles', { fg: t.faint })], detailW, { bg: t.bg }));
  shown.forEach((k) => {
    detail.push(fit([
      seg('  ' + k.padEnd(16).slice(0, 17), { fg: t.faint }),
      seg(String(computed[k]).slice(0, detailW - 20), { fg: t.text }),
    ], detailW, { bg: t.bg }));
  });
  detail.push(fit([], detailW, { bg: t.bg }));
  const matchedCount = styleInfo ? styleInfo.matched.length : 0;
  detail.push(fit([
    seg('  matched rules ', { fg: t.faint }),
    seg(String(matchedCount), { fg: matchedCount ? t.good : t.faint, bold: true }),
    seg('   (press 3)', { fg: t.faint }),
  ], detailW, { bg: t.bg }));

  return clampRows(split(t, w, listW, list, detail).slice(0, h), w, h, t);
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function stylesPane(app, w, h, data) {
  const t = app.theme;
  const rows = elementTree(data.html);
  const selected = Math.max(0, Math.min(app.state.browser.elementIndex, rows.length - 1));
  const node = rows[selected] ? rows[selected].node : null;
  const info = node ? stylesFor(data.html, data.css, node, w) : { matched: [], inline: [], computed: {} };

  const out = [];
  out.push(fit([
    seg('  element  ', { fg: t.faint }),
    seg(describeNode(node), { fg: t.text, bold: true }),
    seg('   2/3/j/k pick another element', { fg: t.faint }),
  ], w, { bg: t.bg }));
  out.push(fit([], w, { bg: t.bg }));

  out.push(sectionLabel(t, w, `Matched rules`, `${info.matched.length} from your stylesheet`));
  if (!info.matched.length) {
    out.push(fit([seg('    No selector in this stylesheet targets that element.', { fg: t.faint })], w, { bg: t.bg }));
  }
  info.matched.forEach((rule) => {
    out.push(fit([
      seg('    ', {}),
      seg(rule.selector, { fg: t.accent, bold: true }),
      seg(rule.media ? `   @media ${rule.media}` : '', { fg: t.faint }),
    ], w, { bg: t.bg }));
    const decls = rule.decls.map((d) => `${d.prop}: ${d.value}`).join('; ');
    for (const line of prose(t, w - 10, decls, { fg: t.muted })) {
      out.push(fit([seg('      ', {}), ...line], w, { bg: t.bg }));
    }
  });

  out.push(fit([], w, { bg: t.bg }));
  out.push(sectionLabel(t, w, 'Inline style', info.inline.length ? 'wins over every rule above' : 'none'));
  if (!info.inline.length) out.push(fit([seg('    No `style="..."` on this element.', { fg: t.faint })], w, { bg: t.bg }));
  info.inline.forEach((d) => {
    out.push(fit([
      seg('    ', {}),
      seg(d.prop, { fg: t.accentSoft }),
      seg(': ', { fg: t.faint }),
      seg(d.value, { fg: t.text }),
    ], w, { bg: t.bg }));
  });

  out.push(fit([], w, { bg: t.bg }));
  out.push(sectionLabel(t, w, 'Computed', 'what those rules add up to'));
  const computed = Object.entries(info.computed);
  if (!computed.length) out.push(fit([seg('    Nothing declared for this element.', { fg: t.faint })], w, { bg: t.bg }));
  computed.slice(0, 24).forEach(([k, v]) => {
    out.push(fit([
      seg('    ', {}),
      seg(k.padEnd(22).slice(0, 23), { fg: t.faint }),
      seg(String(v).slice(0, Math.max(4, w - 30)), { fg: t.text }),
    ], w, { bg: t.bg }));
  });

  return clampRows(withRail(app, out, w, h), w, h, t);
}

// ---------------------------------------------------------------------------
// Console
// ---------------------------------------------------------------------------

export function consoleRows(app, w, h) {
  const t = app.theme;
  const b = app.state.browser;
  const out = [];
  const promptRows = 2;
  const bodyH = Math.max(1, h - promptRows - 1);

  out.push(sectionLabel(t, w, 'Console', `runs against your editor  ·  ${b.history.length} evaluated`));

  const content = [];
  b.output.slice(-200).forEach((entry) => {
    if (entry.kind === 'input') {
      content.push(fit([seg('  › ', { fg: t.accent, bold: true }), seg(entry.text, { fg: t.text })], w, { bg: t.bg }));
    } else if (entry.kind === 'error') {
      for (const line of prose(t, w - 6, entry.text, { fg: t.bad })) {
        content.push(fit([seg('    ✗ ', { fg: t.bad, bold: true }), ...line], w, { bg: t.bg }));
      }
    } else if (entry.kind === 'log') {
      for (const line of prose(t, w - 6, entry.text, { fg: t.codeText ?? t.muted })) {
        content.push(fit([seg('    · ', { fg: t.faint }), ...line], w, { bg: t.bg }));
      }
    } else {
      for (const line of prose(t, w - 6, entry.text, { fg: t.good })) {
        content.push(fit([seg('    ⟵ ', { fg: t.good, bold: true }), ...line], w, { bg: t.bg }));
      }
    }
  });

  const total = content.length;
  const maxScroll = Math.max(0, total - bodyH);
  b.scroll = Math.max(0, Math.min(b.scroll, maxScroll));
  // The console follows output unless the learner has scrolled up.
  const offset = b.follow === false ? b.scroll : maxScroll;
  b.scroll = offset;
  for (let i = 0; i < bodyH; i += 1) {
    out.push(content[offset + i] || fit([], w, { bg: t.bg }));
  }

  out.push(fit([], w, { bg: t.bg }));
  const busy = b.busy ? '  running…' : '';
  out.push(fit([
    seg('  › ', { fg: t.accent, bold: true }),
    seg(b.input, { fg: t.text }),
    seg('█', { fg: t.borderFocus, bold: true }),
    seg(busy, { fg: t.faint }),
  ], w, { bg: t.bg }));

  return clampRows(out, w, h, t);
}

// ---------------------------------------------------------------------------
// Issues
// ---------------------------------------------------------------------------

function issuesPane(app, w, h, data) {
  const t = app.theme;
  const { challenge } = app.state.challenge;
  const out = [];
  const html = data.html;
  const notes = lint(html);
  const meta = layoutDocument(html, data.css, w, w).meta;

  out.push(sectionLabel(t, w, 'Structure & accessibility', notes.length ? `${notes.length} thing(s) worth a look` : 'nothing obvious'));
  if (!notes.length) out.push(fit([seg('    ✓ No structural problems detected in the markup.', { fg: t.good })], w, { bg: t.bg }));
  notes.forEach((note) => {
    for (const line of prose(t, w - 8, note, { fg: t.warn })) {
      out.push(fit([seg('    ! ', { fg: t.warn, bold: true }), ...line], w, { bg: t.bg }));
    }
  });

  out.push(fit([], w, { bg: t.bg }));
  out.push(sectionLabel(t, w, 'Heading outline', `${meta.headings.length} heading(s)`));
  if (!meta.headings.length) out.push(fit([seg('    No headings - a page needs an outline.', { fg: t.faint })], w, { bg: t.bg }));
  meta.headings.forEach((heading) => out.push(fit([seg('    ' + heading.slice(0, w - 6), { fg: t.muted })], w, { bg: t.bg })));

  out.push(fit([], w, { bg: t.bg }));
  out.push(sectionLabel(t, w, 'Document', 'what the browser can see'));
  out.push(fit([
    seg('    title    ', { fg: t.faint }),
    seg(meta.title || '(none)', { fg: meta.title ? t.text : t.bad }),
  ], w, { bg: t.bg }));
  out.push(fit([
    seg('    elements ', { fg: t.faint }),
    seg(String(meta.nodes), { fg: t.text }),
    seg('    css rules ', { fg: t.faint }),
    seg(String(meta.rules), { fg: t.text }),
    seg('    links ', { fg: t.faint }),
    seg(String(meta.links.length), { fg: t.text }),
  ], w, { bg: t.bg }));
  out.push(fit([
    seg('    text     ', { fg: t.faint }),
    seg(String(meta.text.length) + ' characters rendered', { fg: t.text }),
  ], w, { bg: t.bg }));

  const missingAlt = meta.images.filter((i) => !String(i.alt || '').trim());
  if (meta.images.length) {
    out.push(fit([], w, { bg: t.bg }));
    out.push(sectionLabel(t, w, 'Images', `${meta.images.length} found, ${missingAlt.length} without alt text`));
    out.push(fit([
      seg('    ', {}),
      meter(t, Math.max(10, w - 30), meta.images.length - missingAlt.length, meta.images.length),
      seg(`   ${meta.images.length - missingAlt.length}/${meta.images.length} described`, { fg: t.muted }),
    ], w, { bg: t.bg }));
  }

  out.push(fit([], w, { bg: t.bg }));
  out.push(sectionLabel(t, w, 'Checks the grader will run', `${(challenge.checks || []).length} assertions`));
  (challenge.checks || []).forEach((check, i) => {
    out.push(fit([
      seg('    ' + String(i + 1).padStart(2) + '. ', { fg: t.faint }),
      seg(check.label.slice(0, w - 10), { fg: t.text }),
    ], w, { bg: t.bg }));
  });

  return clampRows(withRail(app, out, w, h), w, h, t);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/** Everything the panes need, derived from the live editor contents. */
export function browserData(app) {
  const { challenge } = app.state.challenge;
  let parts;
  let code;
  if (app.state.editors) {
    // Synthesis: assemble every file into one page, whichever tab is in focus.
    code = editorTexts(app.state.editors);
    parts = synthesisParts(code);
  } else {
    code = editorText(app.getActiveEditor());
    parts = previewParts(challenge, code);
  }
  return { ...parts, lang: challenge.lang, editorCode: code };
}

export default function renderBrowser(app, w, h) {
  const t = app.theme;
  const tab = app.state.browser.tab;
  const data = browserData(app);
  data.viewport = w;

  const bar = [];
  BROWSER_TABS.forEach((name) => {
    const active = name === tab;
    bar.push(seg(` ${TAB_LABEL[name]} `, {
      fg: active ? t.bg : t.muted,
      bg: active ? t.accent : t.panelAlt,
      bold: active,
    }));
    bar.push(seg(' ', { bg: t.bg }));
  });
  bar.push(seg(`   ${data.viewport}ch viewport`, { fg: t.faint }));

  const bodyH = Math.max(1, h - 1);
  let body;
  if (tab === 'render') body = renderPane(app, w, bodyH, data);
  else if (tab === 'elements') body = elementsPane(app, w, bodyH, data);
  else if (tab === 'styles') body = stylesPane(app, w, bodyH, data);
  else if (tab === 'console') body = consoleRows(app, w, bodyH);
  else body = issuesPane(app, w, bodyH, data);

  const rows = [fit(bar, w, { bg: t.bg }), ...body];
  return clampRows(rows, w, h, t);
}
