/**
 * Chrome component tests (task 1.1 slice): render via the shared snapshot
 * helper (fake stdout) and assert on visible text.
 * Run: node --test tests/unit/chrome.test.js
 *
 * These are .js tests importing .jsx components — resolved through the built
 * dist bundle when present, else skipped with a note (build required).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Components live in src/ui/components (jsx). Test via the harness entry
// built by esbuild (`npm run build -- --spike` builds it).
const harnessPath = new URL('../../dist/harness.js', import.meta.url).pathname;
const harness = existsSync(harnessPath)
  ? await import(pathToFileURL(harnessPath).href)
  : null;
const helper = await import(
  pathToFileURL(new URL('../helpers/snapshot.js', import.meta.url).pathname)
);

if (harness) {
  const renderToText = (element) => helper.renderToText(element, { render: harness.render });
  const strip = helper.stripAnsi;

  test('Header shows title, subtitle and highlights the active tab', async () => {
    const text = strip(await renderToText(
      harness.el(harness.Header, {
        title: 'fullstack-tui',
        subtitle: '10 modules',
        right: '42%',
        tabs: ['Dashboard', 'Projects'],
        activeTab: 1,
      }),
    ));
    assert.ok(text.includes('fullstack-tui'), `title missing in ${JSON.stringify(text.slice(0, 200))}`);
    assert.ok(text.includes('10 modules'));
    assert.ok(text.includes('Projects'));
    assert.ok(text.includes('42%'));
  });

  test('List marks the selected row with the caret', async () => {
    const text = strip(await renderToText(
      harness.el(harness.List, {
        items: [{ label: 'one' }, { label: 'two' }, { label: 'three' }],
        selected: 1,
      }),
    ));
    assert.ok(text.includes('two'));
    assert.ok(text.includes('▸'));
  });

  test('Meter fills proportionally', async () => {
    const text = strip(await renderToText(harness.el(harness.Meter, { done: 3, total: 4, width: 10 })));
    assert.ok(text.includes('75%'), `pct missing: ${JSON.stringify(text)}`);
    assert.ok(text.includes('███'));
  });

  test('Footer renders hints and notice kinds', async () => {
    const text = strip(await renderToText(
      harness.el(harness.Footer, {
        hints: [['j/k', 'move'], ['Enter', 'open']],
        notice: { text: 'Saved', kind: 'good', bold: true },
      }),
    ));
    assert.ok(text.includes('move'));
    assert.ok(text.includes('Saved'));
  });
}
