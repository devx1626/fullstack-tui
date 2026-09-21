/**
 * Pure row model for the browser screen (overhaul Phase 3, task 3.3).
 *
 * No Ink, no React, no theme here — every builder returns plain row objects
 * (`{ text, frags?, role?, selected? }`) that `browser.jsx` paints and the
 * route tests assert on. The shapes port from the classic `src/views/browser.js`
 * panes; the additions are the Phase 3 seams:
 *
 *   - render rows carry the `lineElements` stamp from `layoutDocument`, so a
 *     click maps to the elementTree row that produced the line (and from
 *     there to its source line);
 *   - the classic Issues pane folds into the render pane as clickable
 *     `⚠ … (line N)` rows (spec C.3 wireframe) — Network takes tab 5;
 *   - the network pane renders the challenge's `mockFetch` routes plus the
 *     fetches the console session actually observed.
 */
import {
  layoutDocument,
  parse as parseHtml,
  elementTree,
  elementRowOffsets,
  elementSourceMap,
  elementSource,
  stylesFor,
  describeNode,
  mockRoutes,
} from '../../core/browser.js';
import { lintWithLines } from '../../core/html.js';
import { ICON_SETS } from '../theme/icons.js';

/** Tab order — spec B.6/B.7: Render/Elements/Styles/Console/Network. */
export const BROWSER_TABS = ['render', 'elements', 'styles', 'console', 'network'];

export const TAB_LABEL = {
  render: 'Render',
  elements: 'Elements',
  styles: 'Styles',
  console: 'Console',
  network: 'Network',
};

/** One-line hint per tab, shown in the footer row of the screen. */
export const TAB_HINTS = {
  render: 'click a line to inspect · Enter jumps to its source',
  elements: 'j/k move · Enter jumps to the source line',
  styles: 'j/k pick an element · rules that matched, and why',
  console: 'type an expression · Enter evaluates · ↑/↓ history · Tab switches pane',
  network: 'mockFetch routes + what the console actually hit',
};

/**
 * A tab's one-line hint with its separators/arrows in the active icon set, so
 * the browser footer degrades to ASCII with the panes. The static TAB_HINTS
 * stay the unicode source of truth (tests and the harness read them).
 */
export function tabHint(tab, icons = ICON_SETS.unicode) {
  const base = TAB_HINTS[tab] || '';
  return base
    .replace(/·/g, icons.bullet)
    .replace(/↑\/↓/g, `${icons.arrowUp}/${icons.arrowDown}`);
}

// ---------------------------------------------------------------------------
// Page assembly (one layout pass, shared by every pane)
// ---------------------------------------------------------------------------

/**
 * One layout pass over the assembled page parts.
 *
 * @returns {{ rows: Array, pageLines: number, meta: object|null, sources: object,
 *             issues: Array<{text, line}>, error: string|null }}
 *   `rows` are the raw rendered fragment rows (`{frags, line}`), `sources` is
 *   the elementTree row → source position map, `issues` the structural lint
 *   with source lines. `error` is set when layout itself threw; `rows` then
 *   holds a single explanatory line so the pane still paints.
 */
export function buildPage(parts, width) {
  const html = (parts && parts.html) || '';
  const css = (parts && parts.css) || '';
  try {
    const root = parseHtml(html);
    const rowsMap = elementRowOffsets(html, root);
    const { lines, lineElements, meta } = layoutDocument(html, css, width, width, { rows: rowsMap });
    return {
      rows: lines.map((frags, line) => ({ frags, line, element: lineElements[line] ?? -1 })),
      pageLines: lines.length,
      meta,
      // ONE parse shared by tree, styles and source lookups — node identity
      // only holds within a parse run (see buildElementRows/buildStyleRows).
      root,
      html,
      css,
      sources: elementSourceMap(html, root),
      issues: lintWithLines(html),
      error: null,
    };
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    return {
      rows: [{ frags: [{ text: `(page failed to render: ${message})`, s: { dim: true } }], line: 0, element: -1 }],
      pageLines: 1,
      meta: null,
      sources: {},
      issues: [{ text: `the page could not be laid out: ${message}`, line: null }],
      error: message,
      root: parseHtml(''),
      html,
      css,
    };
  }
}

// ---------------------------------------------------------------------------
// Render pane (page + inspector sidebar + clickable issue lines)
// ---------------------------------------------------------------------------

const SIDEBAR_MIN_WIDTH = 84;

/**
 * Render-pane rows. On wide screens the classic inspector sidebar (page
 * outline, media, links) sits beside the page; the structural issues the
 * classic Issues pane listed are clickable rows underneath, each carrying the
 * `line` its problem starts on so Enter can jump there.
 */
export function buildRenderRows(page, width, selectedElement, icons = ICON_SETS.unicode) {
  const sidebarW = width >= SIDEBAR_MIN_WIDTH ? Math.min(30, Math.round(width * 0.26)) : 0;
  const pageW = sidebarW ? width - sidebarW - 1 : width;

  const pageRows = page.rows.map((r) => ({
    text: r.frags.map((f) => f.text).join(''),
    frags: r.frags,
    role: r.element >= 0 && r.element === selectedElement ? 'selected' : 'default',
    element: r.element,
  }));

  if (!sidebarW) {
    return [...pageRows, ...renderIssueRows(page, width, icons), ...renderMetaRows(page, width, icons)];
  }

  const side = [];
  const push = (text, role = 'muted') => side.push({ text, role });
  const blank = () => side.push({ text: '', role: 'default' });

  push(' PAGE', 'accent');
  push(`  ${(page.meta && page.meta.title) || '(untitled)'}`, 'default');
  blank();
  push(`  elements   ${page.meta ? page.meta.nodes : '-'}`, 'muted');
  push(`  css rules  ${page.meta ? page.meta.rules : '-'}`, 'muted');
  push(`  viewport   ${pageW}ch`, 'muted');
  blank();
  push(' OUTLINE', 'accent');
  const headings = (page.meta && page.meta.headings) || [];
  if (!headings.length) push('  no headings yet', 'faint');
  for (const h of headings.slice(0, 8)) push(`  ${h}`, 'muted');
  blank();
  push(' MEDIA', 'accent');
  const images = (page.meta && page.meta.images) || [];
  if (!images.length) push('  no images', 'faint');
  for (const img of images.slice(0, 6)) {
    const ok = img.alt !== null && String(img.alt).trim() !== '';
    push(`  ${ok ? icons.check : icons.cross} ${img.src}`, ok ? 'good' : 'bad');
  }
  blank();
  push(' LINKS', 'accent');
  const links = (page.meta && page.meta.links) || [];
  if (!links.length) push('  no links', 'faint');
  for (const href of links.slice(0, 6)) push(`  ${href}`, 'accentSoft');

  const issueRows = renderIssueRows(page, pageW, icons);
  const metaRows = renderMetaRows(page, pageW, icons);
  const zipped = [];
  const height = Math.max(pageRows.length, side.length);
  for (let i = 0; i < height; i += 1) {
    const left = pageRows[i] || { text: '', role: 'default', element: -1 };
    const rail = { text: icons.rail, role: 'faint' };
    const right = side[i] || { text: '', role: 'default' };
    // The page column keeps its element stamp so paneClick can unwrap it.
    zipped.push({ text: '', role: 'row', columns: [{ ...left, element: left.element ?? -1 }, rail, right] });
  }
  return [...zipped, ...issueRows, ...metaRows];
}

/** The clickable `⚠ … (line N)` rows under the rendered page. */
function renderIssueRows(page, width, icons = ICON_SETS.unicode) {
  void width;
  const rows = [];
  if (!page.issues.length) {
    rows.push({ text: `  ${icons.check} no structural problems detected in the markup`, role: 'good' });
    return rows;
  }
  page.issues.forEach((note, i) => {
    const at = note.line ? ` (line ${note.line})` : '';
    rows.push({
      text: `  ${icons.warn} ${note.text}${at}`,
      role: 'warn',
      issue: i,
      issueLine: note.line,
    });
  });
  return rows;
}

/** One-line document summary under the issues (what the grader also sees). */
function renderMetaRows(page, width, icons = ICON_SETS.unicode) {
  void width;
  if (!page.meta) return [];
  return [{
    text: `  ${page.meta.nodes} elements ${icons.bullet} ${page.meta.rules} css rules ${icons.bullet} ${page.meta.links.length} links`,
    role: 'faint',
  }];
}

/**
 * Map a click on a built pane (any tab) to what the click means. Rows carry
 * their own semantics — `treeRow` (elements list), `element` (render page
 * line), `issue` (render issue row) — so the route never repeats geometry.
 *
 * @param {Array} rows   the pane rows the screen is showing
 * @param {number} bodyH visible height (the screen's slice size)
 * @param {number} clickRow 0-based click row WITHIN the visible slice
 * @param {number} offset the pane's scroll offset
 * @returns `{element}` | `{issue}` | `{treeRow}` | null
 */
export function paneClick(rows, bodyH, clickRow, offset) {
  const at = offset + clickRow;
  const row = rows[at];
  if (!row || typeof row !== 'object') return null;
  if (typeof row.treeRow === 'number') return { treeRow: row.treeRow };
  if (typeof row.issue === 'number') return { issue: row.issue, line: row.issueLine ?? null };
  if (typeof row.element === 'number' && row.element >= 0) return { element: row.element };
  // Wide-screen sidebar composition: the page column carries the element stamp.
  if (row.columns && row.columns[0] && typeof row.columns[0].element === 'number' && row.columns[0].element >= 0) {
    return { element: row.columns[0].element };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Elements pane
// ---------------------------------------------------------------------------

/**
 * Element-tree rows with selection, plus `treeRow` on every row so a click
 * selects exactly that row. Mirrors the classic list: `▸` marker, depth
 * indent, `“text”` rows in italic.
 */
export function buildElementRows(page, selected, width, icons = ICON_SETS.unicode) {
  void width;
  const tree = elementTree(page.html, page.root);
  const rows = [];
  rows.push({
    text: `  ${describeNode(tree[selected] ? tree[selected].node : null)}`,
    role: 'header',
  });
  tree.forEach((row, i) => {
    const active = i === selected;
    const marker = row.kind === 'text' ? icons.quote : '<';
    const indent = '  '.repeat(Math.min(10, row.depth));
    rows.push({
      text: `${active ? ` ${icons.select} ` : '   '}${indent}${marker}${row.label}`,
      role: row.kind === 'text' ? 'faint' : 'default',
      selected: active,
      treeRow: i,
      srcLine: page.sources[i] ? page.sources[i].row : null,
    });
  });
  return rows;
}

/** Clamp an element selection to the tree (classic: Math.min/max). */
export function clampElement(page, index) {
  const count = elementTree(page.html, page.root).length;
  if (!count) return 0;
  return Math.max(0, Math.min(index, count - 1));
}

/**
 * The source position of a tree row: `{row, col, text}` for the jump, or null
 * when the row has no source position (generated/phantom nodes).
 */
export function elementRowToSource(page, treeRow) {
  const tree = elementTree(page.html, page.root);
  const row = tree[treeRow];
  if (!row) return null;
  const pos = page.sources[treeRow];
  if (!pos) return null;
  return { row: pos.row, col: pos.col, text: elementSource(page.html, row.node) };
}

// ---------------------------------------------------------------------------
// Styles pane
// ---------------------------------------------------------------------------

/**
 * Styles for the selected tree row: matched rules (selector + declarations),
 * inline style, then the computed map — the classic pane's three sections.
 */
export function buildStyleRows(page, selected, width, icons = ICON_SETS.unicode) {
  void width;
  const tree = elementTree(page.html, page.root);
  const row = tree[selected];
  const rows = [];
  rows.push({ text: `  element   ${describeNode(row ? row.node : null)}`, role: 'header' });
  rows.push({ text: '', role: 'default' });

  if (!row || row.kind === 'text') {
    rows.push({ text: '  (a text node has no styles — pick an element row)', role: 'faint' });
    return rows;
  }

  const info = stylesFor(page.html, page.css, row.node, 100, page.root);

  rows.push({ text: ` MATCHED RULES ${icons.dash} ${info.matched.length} from your stylesheet`, role: 'accent' });
  if (!info.matched.length) {
    rows.push({ text: '    No selector in this stylesheet targets that element.', role: 'faint' });
  }
  info.matched.forEach((rule) => {
    rows.push({
      text: `    ${rule.selector}${rule.media ? `   @media ${rule.media}` : ''}`,
      role: 'accentSoft',
    });
    const decls = (rule.decls || []).map((d) => `${d.prop}: ${d.value}`).join('; ');
    rows.push({ text: `      ${decls}`, role: 'muted' });
  });

  rows.push({ text: '', role: 'default' });
  rows.push({ text: ` INLINE STYLE ${icons.dash} ${info.inline.length ? 'wins over every rule above' : 'none'}`, role: 'accent' });
  if (!info.inline.length) {
    rows.push({ text: '    No `style="..."` on this element.', role: 'faint' });
  }
  for (const d of info.inline) {
    rows.push({ text: `    ${d.prop}: ${d.value}`, role: 'default' });
  }

  rows.push({ text: '', role: 'default' });
  rows.push({ text: ` COMPUTED ${icons.dash} what those rules add up to`, role: 'accent' });
  const computed = Object.entries(info.computed || {});
  if (!computed.length) {
    rows.push({ text: '    Nothing declared for this element.', role: 'faint' });
  }
  for (const [k, v] of computed.slice(0, 24)) {
    rows.push({ text: `    ${k.padEnd(22).slice(0, 23)} ${String(v)}`, role: 'default' });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Console pane
// ---------------------------------------------------------------------------

/**
 * Console transcript + input line, ported from the classic consoleRows:
 * `›` input echoes, `·` page logs, `⟵` return values, `✗` errors. The
 * transcript follows the bottom unless the learner scrolled up (`follow`).
 *
 * @returns {{ rows: Array, scroll: number }} `scroll` is the effective offset
 *   (the route stores it back so wheel scrolling composes with follow).
 */
export function buildConsoleRows({ output = [], input = '', busy = false, follow = true, scroll = 0, lines = 10, historyCount = 0, icons = ICON_SETS.unicode }) {
  const bodyH = Math.max(1, lines - 2);
  const rows = [];

  rows.push({ text: ` CONSOLE ${icons.dash} runs against your code ${icons.bullet} ${historyCount} evaluated`, role: 'accent' });

  const content = [];
  output.slice(-200).forEach((entry) => {
    if (entry.kind === 'input') content.push({ text: `  ${icons.arrowRight} ${entry.text}`, role: 'default' });
    else if (entry.kind === 'error') content.push({ text: `    ${icons.cross} ${entry.text}`, role: 'bad' });
    else if (entry.kind === 'log') content.push({ text: `    ${icons.bullet} ${entry.text}`, role: 'code' });
    else content.push({ text: `    ${icons.arrowLeft} ${entry.text}`, role: 'good' });
  });

  const maxScroll = Math.max(0, content.length - bodyH);
  const offset = follow ? maxScroll : Math.max(0, Math.min(scroll, maxScroll));
  for (let i = 0; i < bodyH; i += 1) rows.push(content[offset + i] || { text: '', role: 'default' });

  rows.push({ text: `  ${icons.arrowRight} ${input}${icons.caret}${busy ? '  running…' : ''}`, role: 'accent' });
  return { rows, scroll: offset };
}

// ---------------------------------------------------------------------------
// Network pane
// ---------------------------------------------------------------------------

/**
 * Network rows: the challenge's declared `mockFetch` routes (what WOULD
 * answer, and with what), then the fetches the console session observed —
 * so a learner can see both the contract and what actually happened.
 */
export function buildNetworkRows(challenge, requests = [], width, icons = ICON_SETS.unicode) {
  void width;
  const rows = [];
  rows.push({ text: ` NETWORK ${icons.dash} mocked routes (mockFetch)`, role: 'accent' });
  const routes = mockRoutes(challenge);
  if (!routes.length) {
    rows.push({ text: '    no mockFetch table on this challenge', role: 'faint' });
  }
  for (const r of routes) {
    rows.push({
      text: `    ${r.method || 'GET'} ${r.url}  ${icons.to}  ${r.status}${r.status === 404 ? ' (no route matched)' : ''}`,
      role: r.status === 404 ? 'warn' : 'default',
    });
  }

  rows.push({ text: '', role: 'default' });
  rows.push({ text: ` REQUESTS ${icons.dash} what the console session fetched`, role: 'accent' });
  const seen = new Set();
  let shown = 0;
  for (const req of requests) {
    const key = `${req.url}#${req.status}`;
    if (seen.has(key)) continue;
    seen.add(key);
    shown += 1;
    rows.push({ text: `    ${icons.to} ${req.url}  ${req.status}`, role: req.status === 404 ? 'warn' : 'good' });
  }
  if (!shown) rows.push({ text: '    (nothing fetched yet — run code that calls fetch)', role: 'faint' });
  return rows;
}
