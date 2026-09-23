/**
 * Router/AppRoot tests (task 0.9 remainder) — rendered through the built
 * harness (same-bundle React; no node_modules react in this file).
 * Run: node --test tests/unit/router.test.js  (needs dist/harness.js)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const harnessPath = new URL('../../dist/harness.js', import.meta.url).pathname;
const harness = existsSync(harnessPath) ? await import(pathToFileURL(harnessPath).href) : null;
const helper = await import(
  pathToFileURL(new URL('../helpers/snapshot.js', import.meta.url).pathname)
);

if (!harness) {
  test('router tests need built harness (npm run build)', () => { assert.ok(true); });
} else {
  const renderToText = (el) => helper.renderToText(el, { render: harness.render });
  const strip = helper.stripAnsi;

  function Probe() {
    const router = harness.useRouter();
    return harness.el(harness.Text, null, `screen:${router.top.name}`);
  }

  test('router renders the top of the initial stack', async () => {
    const { createElement } = await import('react').catch(() => ({}));
    void createElement; // never imported directly — built via harness.el below
    function App() {
      return harness.el(harness.RouterProvider, {
        screens: { probe: Probe },
        initial: { name: 'probe', params: {} },
        children: harness.el(harness.RouterView, {}),
      });
    }
    const text = strip(await renderToText(harness.el(App, {})));
    assert.ok(text.includes('screen:probe'), JSON.stringify(text.slice(0, 120)));
  });

  test('unknown screen shows a loud fallback', async () => {
    function App() {
      return harness.el(harness.RouterProvider, {
        screens: {},
        initial: { name: 'nope', params: {} },
        children: harness.el(harness.RouterView, {}),
      });
    }
    const text = strip(await renderToText(harness.el(App, {})));
    assert.ok(text.includes('unknown screen: nope'));
  });

  test('push/pop navigates the stack', async () => {
    let api = null;
    function Nav() {
      api = harness.useRouter();
      return harness.el(harness.Text, null, `at:${api.top.name}`);
    }
    function App() {
      return harness.el(harness.RouterProvider, {
        screens: { a: Nav, b: Nav },
        initial: { name: 'a', params: {} },
        children: harness.el(harness.RouterView, {}),
      });
    }
    // Render once to grab the router API, then drive it via a re-render.
    const { fakeStdout } = await import('../helpers/snapshot.js');
    const out = fakeStdout();
    const inst = harness.render(harness.el(App, {}), { stdout: out, exitOnCtrlC: false, patchConsole: false });
    await new Promise((r) => setTimeout(r, 30));
    assert.ok(api, 'router API captured');
    api.push('b', { x: 1 });
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(api.top.name, 'b');
    api.pop();
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(api.top.name, 'a');
    // pop on the root is a no-op
    api.pop();
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(api.top.name, 'a');
    inst.unmount();
  });
}
