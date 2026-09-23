/**
 * SplitPane tests (Phase 1 slice): layout via the built harness.
 * Run: node --test tests/unit/splitPane.test.js  (needs dist/harness.js)
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

if (harness) {
  const renderToText = (element) => helper.renderToText(element, { render: harness.render });
  const strip = helper.stripAnsi;

  test('SplitPane renders both slots and the divider bar', async () => {
    const text = strip(await renderToText(
      harness.el(harness.SplitPane, {
        totalWidth: 20,
        leftWidth: 8,
        left: harness.el(harness.Header, { title: 'L' }),
        right: harness.el(harness.Header, { title: 'R' }),
      }),
    ));
    assert.ok(text.includes('L'), 'left slot missing');
    assert.ok(text.includes('R'), 'right slot missing');
    // The drag handle comes from the icon registry (`icons.cross`; the
    // default unicode set is '✗') riding the `dash` divider cells.
    assert.ok(text.includes('✗'), 'divider bar missing');
  });

  test('SplitPane clamps left width to the minimum', async () => {
    const { clampSplit } = await import(
      pathToFileURL(new URL('../../src/ui/components/splitClamp.js', import.meta.url).pathname)
    );
    assert.equal(clampSplit(100, 1, 12, 12), 12);
    assert.equal(clampSplit(100, 99, 12, 12), 88);
    assert.equal(clampSplit(80, 40, 12, 12), 40);
  });
}
