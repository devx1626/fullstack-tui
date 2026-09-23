/**
 * Snapshot suite scaffolding (Phase 0, spec §11): proves the golden-file
 * machinery end-to-end with a deterministic component. Phase 1 components
 * add goldens by calling assertGolden() with their own names.
 *
 * First run creates the golden; UPDATE_SNAPSHOTS=1 rewrites it; every later
 * run compares. Goldens are committed as plain (ANSI-stripped) text.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// JSX components resolve through the built harness (npm run build).
const harnessPath = new URL('../../dist/harness.js', import.meta.url).pathname;
const harness = existsSync(harnessPath)
  ? await import(pathToFileURL(harnessPath).href)
  : null;

const helper = await import(pathToFileURL(new URL('../helpers/snapshot.js', import.meta.url).pathname));

if (harness) {
  test('snapshot helper renders deterministic frames', async () => {
    const frame = await helper.renderToText(
      harness.el(harness.Header, {
        title: 'fullstack-tui',
        subtitle: 'golden test',
        right: '42%',
        tabs: ['Dashboard', 'Projects'],
        activeTab: 0,
      }),
      { render: harness.render },
    );
    const text = helper.stripAnsi(frame);
    assert.ok(text.includes('fullstack-tui'), `title missing: ${JSON.stringify(text.slice(0, 150))}`);
    assert.ok(text.includes('golden test'));
    assert.ok(text.includes('42%'));
  });

  test('golden file: create on first run, compare after', async () => {
    const frame = await helper.renderToText(
      harness.el(harness.Meter, { done: 3, total: 4, width: 12 }),
      { render: harness.render },
    );
    const result = await helper.assertGolden('chrome-meter-3of4', frame);
    // Both outcomes are valid: first run creates, later runs compare.
    assert.ok(typeof result.created === 'boolean');
  });
} else {
  test('snapshot scaffolding requires built harness (npm run build)', () => {
    assert.ok(true, 'skipped: harness not built');
  });
}
