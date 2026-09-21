/**
 * Browser pane model unit tests (Phase 3, task 3.7).
 *
 * The builders are pure, so these assert the row shapes, the click mapping
 * and the jump-to-source data directly — the route-level behaviors (live
 * re-render, C-b push/pop, the jump handoff) are covered in
 * routesBrowser.test.js through the real route tree.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BROWSER_TABS,
  TAB_LABEL,
  buildPage,
  buildRenderRows,
  buildElementRows,
  buildStyleRows,
  buildConsoleRows,
  buildNetworkRows,
  clampElement,
  elementRowToSource,
  paneClick,
} from '../../src/ui/screens/browserModel.js';

const CSS = 'h1 { color: crimson; }\np { font-weight: bold; }';
const HTML = '<!DOCTYPE html>\n<html>\n<body>\n  <h1>Hello</h1>\n  <p class="lead">world</p>\n  <img src="a.png">\n</body>\n</html>\n';

const PAGE = buildPage({ html: HTML, css: CSS, js: '' }, 80);

test('browser tabs: five panes with Network as the fifth (spec B.6)', () => {
  assert.deepEqual(BROWSER_TABS, ['render', 'elements', 'styles', 'console', 'network']);
  assert.equal(TAB_LABEL.network, 'Network');
});

test('buildPage: layout rows carry the element stamp and source map', () => {
  assert.equal(PAGE.error, null);
  assert.ok(PAGE.pageLines >= 2, 'the page lays out to multiple lines');
  assert.equal(PAGE.rows.length, PAGE.pageLines);
  // Tree: html(0) body(1) h1(2) text(3) p(4) text(5) img(6) — text rows count.
  const stamped = new Set(PAGE.rows.map((r) => r.element).filter((n) => n >= 0));
  assert.ok(stamped.has(2), 'a rendered line carries the h1 tree row');
  assert.ok(stamped.has(4), 'a rendered line carries the p tree row');
  assert.ok(PAGE.sources[2] && PAGE.sources[2].row === 3, 'the h1 source position points at its line');
});

test('buildPage: a broken page becomes an issue row, not a throw', () => {
  const page = buildPage({ html: null, css: null, js: '' }, 80);
  assert.equal(typeof page.html, 'string');
  assert.doesNotThrow(() => buildRenderRows(page, 80, 0));
});

test('buildPage: structural issues come with source lines (the clickable ⚠ rows)', () => {
  const texts = PAGE.issues.map((n) => n.text);
  assert.ok(texts.some((t) => t.includes('<img>')), 'missing alt is reported');
  const img = PAGE.issues.find((n) => n.text.includes('<img>'));
  assert.equal(img.line, 6, 'the img issue points at line 6 (1-based)');
});

test('buildRenderRows: page rows + issue rows, selected line highlighted', () => {
  const rows = buildRenderRows(PAGE, 80, 2); // the h1's tree row
  assert.ok(rows.length > PAGE.pageLines, 'issue rows follow the page');
  assert.ok(rows.some((r) => r.role === 'warn' && typeof r.issueLine === 'number'), '⚠ rows carry their line');
  assert.ok(rows.some((r) => r.role === 'selected'), 'the selected element row is marked');
  // Narrow terminal: no sidebar columns.
  assert.ok(rows.every((r) => !r.columns), 'sidebar composition only on wide screens');
});

test('buildRenderRows: wide screens zip the page with the inspector sidebar', () => {
  const rows = buildRenderRows(PAGE, 100, 0);
  assert.ok(rows.some((r) => r.columns && r.columns.length === 3), 'page | rail | sidebar composition');
  assert.ok(rows.some((r) => r.columns && r.columns[2].text.includes('elements')), 'the sidebar lists element stats');
});

test('buildElementRows: tree rows carry treeRow + srcLine, selection marks', () => {
  const selected = 4; // the <p>
  const rows = buildElementRows(PAGE, selected, 80);
  const pRow = rows.find((r) => r.treeRow === 4);
  assert.ok(pRow, 'the p row exists');
  assert.equal(pRow.selected, true);
  assert.equal(pRow.srcLine, 4, 'the p starts on line 5 (0-based 4)');
  assert.ok(rows.some((r) => r.treeRow === 3 && r.role === 'faint'), 'text rows render in the faint role');
});

test('clampElement clamps to the tree size and survives empty pages', () => {
  assert.equal(clampElement(PAGE, 99), 6, 'seven tree rows (html, body, h1, text, p, text, img)');
  assert.equal(clampElement(PAGE, -3), 0);
  const empty = buildPage({ html: '', css: '', js: '' }, 40);
  assert.equal(clampElement(empty, 7), 0);
});

test('elementRowToSource: row → position + open-tag text for the jump', () => {
  const src = elementRowToSource(PAGE, 2);
  assert.equal(src.row, 3, 'the h1 starts on line 4 (0-based 3)');
  assert.match(src.text, /^<h1>/);
  // Text rows and generated nodes have no source position.
  assert.equal(elementRowToSource(PAGE, 3), null);
  assert.equal(elementRowToSource(PAGE, 99), null);
});

test('buildStyleRows: matched rule, declarations and computed for the selected element', () => {
  const selected = 2; // the h1 matches the crimson rule
  const rows = buildStyleRows(PAGE, selected, 80);
  const text = rows.map((r) => r.text).join('\n');
  assert.ok(text.includes('h1'), 'the selector shows');
  assert.ok(text.includes('color'), 'declarations show');
  assert.ok(text.includes('crimson'), 'values show');
  assert.ok(text.toLowerCase().includes('computed'), 'the computed section shows');
  // A text node row explains itself instead of listing styles.
  const textRows = buildStyleRows(PAGE, 3, 80).map((r) => r.text).join('\n');
  assert.ok(textRows.includes('text node'), 'text nodes are not styled');
});

test('buildConsoleRows: transcript markers, follow, and the input line', () => {
  const { rows, scroll } = buildConsoleRows({
    output: [
      { kind: 'input', text: 'addOne(1)' },
      { kind: 'result', text: '2' },
      { kind: 'log', text: 'page loaded' },
      { kind: 'error', text: 'boom' },
    ],
    input: '1 +',
    busy: false,
    follow: true,
    scroll: 0,
    lines: 8,
    historyCount: 1,
  });
  const text = rows.map((r) => r.text);
  assert.ok(text.some((t) => t.includes('› addOne(1)')), 'input echo');
  assert.ok(text.some((t) => t.includes('⟵ 2')), 'result marker');
  assert.ok(text.some((t) => t.includes('· page loaded')), 'log marker');
  assert.ok(text.some((t) => t.includes('✗ boom')), 'error marker');
  assert.ok(text.some((t) => t.includes('› 1 +█')), 'the input line shows the caret');
  assert.equal(scroll, 0, 'follow keeps the transcript at the bottom (already there)');
});

test('buildConsoleRows: scrolling up stops the follow', () => {
  const output = Array.from({ length: 40 }, (_, i) => ({ kind: 'log', text: `line ${i}` }));
  const followed = buildConsoleRows({ output, input: '', busy: false, follow: true, scroll: 0, lines: 8, historyCount: 0 });
  assert.ok(followed.scroll > 0, 'follow pins to the bottom (rows scrolled)');
  const lastText = followed.rows[followed.rows.length - 2].text;
  assert.ok(lastText.includes('line 39'), 'the newest log is visible when following');
  const scrolled = buildConsoleRows({ output, input: '', busy: false, follow: false, scroll: 3, lines: 8, historyCount: 0 });
  assert.equal(scrolled.scroll, 3, 'manual scroll is honoured when not following');
});

test('buildNetworkRows: declared mockFetch routes plus observed requests', () => {
  const challenge = { mockFetch: { '/api/items': [1, 2], '/api/nope': undefined } };
  const rows = buildNetworkRows(challenge, [{ url: '/api/items', status: 200 }], 80);
  const text = rows.map((r) => r.text).join('\n');
  assert.ok(text.includes('GET /api/items  →  200'), 'a declared route shows its status');
  assert.ok(text.includes('/api/nope  →  404'), 'an empty route answers 404');
  assert.ok(text.includes('→ /api/items  200'), 'observed requests are listed');
  const bare = buildNetworkRows({}, [], 80).map((r) => r.text).join('\n');
  assert.ok(bare.includes('no mockFetch'), 'challenges without a table say so');
});

test('paneClick: rows carry their own semantics (no geometry duplication)', () => {
  const renderRows = buildRenderRows(PAGE, 80, 0);
  const issueAt = renderRows.findIndex((r) => r.role === 'warn');
  const issueHit = paneClick(renderRows, 20, issueAt, 0);
  assert.ok(issueHit && typeof issueHit.issue === 'number', 'a ⚠ row click means jump-to-issue');

  const elementRows = buildElementRows(PAGE, 0, 80);
  const treeHit = paneClick(elementRows, 20, 2, 0);
  assert.ok(treeHit && typeof treeHit.treeRow === 'number', 'an elements-list click selects that row');

  // A page-line click (a render row with element >= 0).
  const pageIndex = renderRows.findIndex((r) => typeof r.element === 'number' && r.element >= 0);
  const elementHit = paneClick(renderRows, 20, pageIndex, 0);
  assert.ok(elementHit && elementHit.element >= 0, 'a page-line click inspects its element');
  assert.equal(paneClick(renderRows, 20, 0, 9999), null, 'offsets beyond the pane click nothing');
});
