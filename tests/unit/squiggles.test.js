/**
 * M2 curly-underline squiggles (docs/multimedia.md) — the editor binding.
 *
 * The contract:
 *   - `squiggleRows` (src/editor/viewport.js) turns §5.4 diagnostics into
 *     selection-shaped per-row ranges, in VISUAL columns, viewport-clamped and
 *     merged — the same discipline selectionRows applies to selections;
 *   - a line-only diagnostic waves the line's trimmed content (the common
 *     grader shape); an offset diagnostic without a length paints nothing;
 *   - `rowPieces` cuts pieces at squiggle edges exactly like selection edges;
 *   - the Ink CodeEditor wraps squiggle pieces in SGR 4:3 / 4:0 (colon form —
 *     measured on ink 6: a legacy `0m`/`24m` close is stripped by ink's frame
 *     tokenizer, so the wave would bleed to end of line), colored by the
 *     theme's `bad` token, and renders NOTHING at tier D where the theme
 *     strips to undefined.
 *
 * Run: node --test tests/unit/squiggles.test.js  (render cases need dist/harness.js)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const { docFromText, pos } = await import('../../src/editor/document.js');
const { rowPieces, squiggleRows } = await import('../../src/editor/viewport.js');
const { squiggle, squiggleSgr } = await import('../../src/ui/multimedia.js');

const textsOf = (pieces) => pieces.map((p) => p.text).join('');

test('squiggleRows: ranges, fallbacks and skips', async (t) => {
  const doc = docFromText('const a = 1;\nlet total = xx + 1;\n\nconsole.log(a);');

  await t.test('line + col + length becomes one visual-column range', () => {
    assert.deepEqual(
      squiggleRows(doc, [{ line: 2, col: 12, length: 2 }]),
      [{ row: 1, fromCol: 12, toCol: 14 }],
    );
  });

  await t.test('a line-only diagnostic waves the trimmed line content', () => {
    const padded = docFromText('   indented body   ');
    assert.deepEqual(
      squiggleRows(padded, [{ line: 1 }]),
      [{ row: 0, fromCol: 3, toCol: 16 }],
      'leading whitespace is skipped, trailing whitespace is not waved',
    );
  });

  await t.test('a blank line diagnostic paints nothing', () => {
    assert.deepEqual(squiggleRows(doc, [{ line: 3 }]), []);
  });

  await t.test('a line beyond the document paints nothing (no clamping to the last line)', () => {
    assert.deepEqual(squiggleRows(doc, [{ line: 99 }]), [], 'an unknown line must not wave an unrelated row');
  });

  await t.test('an offset diagnostic maps through posOf; without length it is skipped', () => {
    // "let total = xx + 1;" starts at offset 13 (line 1 is 12 chars + \n).
    const base = 'const a = 1;\n'.length;
    assert.deepEqual(
      squiggleRows(doc, [{ offset: base + 12, length: 2 }]),
      [{ row: 1, fromCol: 12, toCol: 14 }],
    );
    assert.deepEqual(squiggleRows(doc, [{ offset: base + 12 }]), [], 'no length → no range');
  });

  await t.test('degenerate diagnostics are skipped', () => {
    assert.deepEqual(squiggleRows(doc, [null]), []);
    assert.deepEqual(squiggleRows(doc, 'nope'), [], 'not an array');
    assert.deepEqual(squiggleRows(null, [{ line: 1 }]), [], 'no doc');
  });

  await t.test('rows are clamped to the viewport window', () => {
    // doc rows 0..3; window top=1 height=3 covers rows 1..3. Diagnostics on
    // doc lines 1 (row 0) and 2 (row 1): only row 1 survives the window.
    const rows = squiggleRows(doc, [{ line: 1, col: 0, length: 5 }, { line: 2, col: 0, length: 5 }], { top: 1, height: 3 });
    assert.deepEqual(rows.map((r) => r.row), [1], 'row 0 is above the viewport');
  });

  await t.test('two diagnostics on one row merge into one range', () => {
    const rows = squiggleRows(doc, [
      { line: 2, col: 12, length: 2 },
      { line: 2, col: 16, length: 1 },
    ]);
    assert.equal(rows.length, 1);
    assert.deepEqual([rows[0].fromCol, rows[0].toCol], [12, 17]);
  });

  await t.test('a range crossing a newline touches every row it spans', () => {
    // Line 2 is 19 chars: 8 chars from col 14 run past its EOL (' + 1;'),
    // across the empty line 3, ending on line 4's 'co' (cols 0..2) — exactly
    // the rows a selection over the same range would paint. (Same-row ends
    // stay caret-exclusive: a length ending at col 19 == EOL touches row 1
    // only.)
    const rows = squiggleRows(doc, [{ line: 2, col: 14, length: 8 }]);
    assert.deepEqual(rows.map((r) => r.row), [1, 2, 3]);
  });
});

test('rowPieces: squiggle edges cut pieces exactly like selection edges', async (t) => {
  const doc = docFromText('let total = xx + 1;');
  const [sq] = squiggleRows(doc, [{ line: 1, col: 12, length: 2 }]);

  await t.test('pieces inside the range carry squiggle; outside do not', () => {
    const pieces = rowPieces([], docFromText('let total = xx + 1;').lines[0], {
      startCol: 0, width: 40, sqFrom: sq.fromCol, sqTo: sq.toCol,
    });
    assert.deepEqual(pieces.map((p) => [p.text, p.squiggle]), [
      ['let total = ', false],
      ['xx', true],
      [' + 1;', false],
    ]);
    assert.equal(textsOf(pieces), 'let total = xx + 1;', 'pieces reassemble the line');
  });

  await t.test('a squiggle inside a styled segment splits it, keeping the style', () => {
    const segs = [{ text: 'let total = xx + 1;', color: 'k' }];
    const pieces = rowPieces(segs, 'let total = xx + 1;', {
      startCol: 0, width: 40, sqFrom: 12, sqTo: 14,
    });
    assert.deepEqual(pieces.map((p) => [p.text, p.color, p.squiggle]), [
      ['let total = ', 'k', false],
      ['xx', 'k', true],
      [' + 1;', 'k', false],
    ]);
  });

  await t.test('squiggle and selection compose on the same row', () => {
    const pieces = rowPieces([], 'let total = xx + 1;', {
      startCol: 0, width: 40, selFrom: 0, selTo: 4, sqFrom: 12, sqTo: 14,
    });
    assert.deepEqual(pieces.map((p) => [p.text, p.inverse, p.squiggle]), [
      ['let ', true, false],
      ['total = ', false, false],
      ['xx', false, true],
      [' + 1;', false, false],
    ]);
  });

  await t.test('no squiggle range → no squiggle flags (the default path)', () => {
    const pieces = rowPieces([], 'plain', { startCol: 0, width: 10 });
    assert.ok(pieces.every((p) => p.squiggle === false));
  });
});

test('the raw squiggle() primitive keeps its M2 wire format', () => {
  assert.equal(squiggle('err', 196), '\x1b[4:3;58:5:196merr\x1b[24;59m');
  assert.match(squiggleSgr.open(9), /^\x1b\[4:3;58:5:9m$/);
  assert.equal(squiggleSgr.close(), '\x1b[4:0m\x1b[59m', 'colon-form close: ink 6 must not strip it');
});

test('Ink CodeEditor paints M2 waves, gated by the theme tier', async (t) => {
  const harnessPath = path.join(ROOT, 'dist', 'harness.js');
  if (!existsSync(harnessPath)) {
    t.skip('needs built harness (npm run build)');
    return;
  }
  const harness = await import(pathToFileURL(harnessPath).href);
  const helper = await import(pathToFileURL(path.join(ROOT, 'tests/helpers/snapshot.js')).href);
  const { midnight } = await import(pathToFileURL(path.join(ROOT, 'src/ui/theme/themes.js')).href);

  const renderFrame = async (props) => {
    const out = helper.fakeStdout(90, 14);
    const inst = harness.render(harness.el(harness.CodeEditor, {
      document: 'const a = 1;\nlet total = xx + 1;\nconsole.log(a);',
      width: 40,
      height: 6,
      language: 'js',
      tabSize: 2,
      ...props,
    }), { stdout: out, stdin: helper.fakeStdin(), exitOnCtrlC: false, patchConsole: false });
    await new Promise((r) => setTimeout(r, 60));
    inst.unmount();
    return out.chunks.join('');
  };

  await t.test('a themed editor waves the failing token and stops the wave', async () => {
    const frame = await renderFrame({ diagnostics: [{ line: 2, col: 12, length: 2 }] });
    const row = frame.split('\n').find((l) => l.includes('[4:3'));
    assert.ok(row, 'the squiggle row rendered');
    assert.ok(row.includes('58:5:'), 'the underline color rides SGR 58:5');
    assert.ok(row.includes('\x1b[4:0m\x1b[59m'), 'the wave closes in colon form');
    const opens = (row.match(/\[4:3/g) || []).length;
    assert.equal(opens, 1, 'exactly one open: the wave does not bleed to the tail');
    const stripped = row.replace(/\x1b\[[0-9;:]*m/g, '');
    assert.ok(stripped.includes('xx'), 'the squiggled text stays visible');
  });

  await t.test('no diagnostics → no escape noise', async () => {
    const frame = await renderFrame({});
    assert.ok(!frame.includes('4:3'), 'no wave without diagnostics');
  });

  await t.test('tier D (theme stripped to undefined) renders no wave', async () => {
    // The app-wide theme at depth 0 maps every token to undefined; pass that
    // shape explicitly, the way AppRoot hands it down at tier D.
    const stripped = { name: midnight.name };
    for (const k of Object.keys(midnight)) if (k !== 'name') stripped[k] = undefined;
    const frame = await renderFrame({ theme: stripped, diagnostics: [{ line: 2, col: 12, length: 2 }] });
    assert.ok(!frame.includes('4:3'), 'tier D: the squiggle is dropped, not drawn plain');
  });
});
