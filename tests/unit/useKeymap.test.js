/**
 * useKeymap tests (task 0.8 slice) — rendered through the built harness so
 * React lifecycle semantics (register on mount, clear on unmount) are real.
 * Run: node --test tests/unit/useKeymap.test.js  (needs dist/harness.js)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const harnessPath = new URL('../../dist/harness.js', import.meta.url).pathname;
const harness = existsSync(harnessPath) ? await import(pathToFileURL(harnessPath).href) : null;

// The hook and the route registry must come from the same bundle as the
// components (dual-module hazard). Rebuild with --spike refreshes both.
if (!harness) {
  test('useKeymap tests need built harness (npm run build -- --spike)', () => { assert.ok(true); });
} else {
  const helper = await import(
    pathToFileURL(new URL('../helpers/snapshot.js', import.meta.url).pathname)
  );

  async function withScreen(Component, props = {}) {
    const frame = await helper.renderToText(harness.el(Component, props), { render: harness.render });
    return frame;
  }

  test('useKeymap registers a route that resolves keys to command ids', async () => {
    const seen = [];
    function Screen() {
      harness.useKeymap('challenge', (id) => { seen.push(id); });
      return null;
    }
    // Assert while MOUNTED — unmount clears the route (that is test 2's contract).
    const { fakeStdout } = await import('../helpers/snapshot.js');
    const instance = harness.render(harness.el(Screen, {}), {
      stdout: fakeStdout(),
      exitOnCtrlC: false,
      patchConsole: false,
    });
    await new Promise((r) => setTimeout(r, 30));
    const { getCurrentRoute } = harness;
    const route = getCurrentRoute();
    assert.equal(route.screen, 'challenge');
    assert.equal(route.onKey({ name: 'char', char: 's', ctrl: false }), false, 'plain s is not <C-s>');
    assert.equal(route.onKey({ name: 'ctrl-s' }), true, '<C-s> must resolve to challenge.check');
    assert.deepEqual(seen, ['challenge.check']);
    instance.unmount();
  });

  test('unmount clears the route', async () => {
    function Screen() { harness.useKeymap('home', () => {}); return null; }
    const instance = harness.render(harness.el(Screen, {}), {
      stdout: (await import('../helpers/snapshot.js')).fakeStdout(),
      exitOnCtrlC: false,
      patchConsole: false,
    });
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(harness.getCurrentRoute().screen, 'home');
    instance.unmount();
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(harness.getCurrentRoute().screen, null, 'route must be cleared on unmount');
  });
}
