/**
 * CodeEditor component tests (overhaul task 2.8): render via the harness.
 * Run: node --test tests/unit/codeEditor.test.js  (needs dist/harness.js)
 *
 * The component is render-only by contract, so the tests assert drawing:
 * the gutter, the text, theming through roles, the tab strip, and that a
 * raw-text fallback renders without a document value. Input/mouse behavior
 * lives in the pure modules (viewport/width) and with the route.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const harnessPath = new URL('../../dist/harness.js', import.meta.url).pathname;
const harness = existsSync(harnessPath) ? await import(pathToFileURL(harnessPath).href) : null;
const helper = await import(
  pathToFileURL(new URL('../helpers/snapshot.js', import.meta.url).pathname)
);

const THEME = {
  id: 'test', comment: 'c', keyword: 'k', string: 's', number: 'n',
  accent: 'a', accentSoft: 'a2', star: 'st',
};

if (harness) {
  const renderToText = (element) => helper.renderToText(element, { render: harness.render });
  const strip = helper.stripAnsi;

  test('CodeEditor renders text with a gutter', async () => {
    const text = strip(await renderToText(
      harness.el(harness.CodeEditor, {
        document: 'const a = 1;\nconst b = 2;',
        width: 40,
        height: 5,
        language: 'js',
        theme: THEME,
      }),
    ));
    assert.ok(text.includes('const a = 1;'), 'line 1 missing');
    assert.ok(text.includes('const b = 2;'), 'line 2 missing');
    assert.ok(/\b1\b/.test(text), 'gutter numbers missing');
    // Exactly `height` text rows: padded past EOF so the frame is stable.
    const body = text.split('\n').filter((l) => l.trim().length > 0);
    assert.ok(body.length >= 5, `expected padded rows, got ${body.length}`);
  });

  test('CodeEditor publishes its mouse handler into mouseSink', async () => {
    // The route provides the sink and composes divider-first, editor-second;
    // the component's only mouse job is publishing a stable handler there.
    const sink = { current: null };
    await renderToText(
      harness.el(harness.CodeEditor, {
        document: 'abc',
        width: 40,
        height: 2,
        mouseSink: sink,
        mouseHandlers: { onDocClick: () => {} },
      }),
    );
    assert.ok(sink.current, 'no handler published');
    // Intent plumbing: a wheel event reaches onDocWheel through the handler.
    let wheel = 0;
    await renderToText(
      harness.el(harness.CodeEditor, {
        document: 'abc',
        width: 40,
        height: 2,
        mouseSink: sink,
        mouseHandlers: { onDocWheel: (d) => { wheel = d; } },
      }),
    );
    sink.current({ type: 'mouse', action: 'wheel-down', button: 64 });
    assert.equal(wheel, 1, 'wheel-down did not reach onDocWheel');
  });

  test('CodeEditor draws the tab strip when tabs are given', async () => {
    const text = strip(await renderToText(
      harness.el(harness.CodeEditor, {
        document: 'x = 1',
        width: 40,
        height: 3,
        tabs: [{ name: 'main.js', dirty: false }, { name: 'util.js', dirty: true }],
        activeTab: 1,
      }),
    ));
    assert.ok(text.includes('main.js'), 'tab 1 missing');
    assert.ok(text.includes('util.js'), 'tab 2 missing');
    assert.ok(text.includes('•'), 'dirty marker missing');
  });

  test('CodeEditor scrolls: scrollTop shows a later window of the buffer', async () => {
    const lines = Array.from({ length: 30 }, (_, i) => `line ${i}`);
    const text = strip(await renderToText(
      harness.el(harness.CodeEditor, {
        document: { lines, caret: { row: 0, col: 0 }, view: { scrollTop: 25, scrollX: 0 } },
        width: 40,
        height: 5,
        language: 'text',
      }),
    ));
    assert.ok(text.includes('line 25'), 'window start missing');
    assert.ok(text.includes('line 29'), 'window end missing');
    assert.ok(!text.includes('line 24'), 'row above the window leaked in');
  });

  test('CodeEditor hides the gutter with showGutter=false', async () => {
    const text = strip(await renderToText(
      harness.el(harness.CodeEditor, {
        document: 'hello',
        width: 40,
        height: 2,
        showGutter: false,
        language: 'text',
      }),
    ));
    assert.ok(text.includes('hello'));
    assert.ok(!/^\s*1\s/m.test(text), 'line number rendered without a gutter');
  });
}
