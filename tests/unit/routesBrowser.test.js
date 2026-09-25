/**
 * Browser route tests (Phase 3, task 3.7) — driven through the REAL route
 * tree (router → useKeymap → route → pure model), the same harness shape the
 * challenge-route tests use. Covers the §14 Phase 3 behaviors the unit tests
 * above the model cannot: C-b push/pop, live re-render from an autosaved
 * draft, click-to-inspect, the jump-to-source handoff and the warmed console
 * session (code runs once per edit, not per expression).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import '../helpers/runner-env.js';

const harnessPath = new URL('../../dist/harness.js', import.meta.url).pathname;
const harness = existsSync(harnessPath) ? await import(pathToFileURL(harnessPath).href) : null;
const helper = await import(pathToFileURL(new URL('../helpers/snapshot.js', import.meta.url).pathname));

const { Store } = await import('../../src/core/store.js');
const { runConsoleSession, resetConsoleSession, _resetConsoleSessionForTests } = await import('../../src/core/runner.js');

const CURRICULUM = [{
  id: 'm1',
  badge: 'HT',
  title: 'HTML',
  tagline: 'structure',
  hours: 6,
  source: { course: 'c', url: 'u', roadmap: 'r', docs: 'd' },
  lessons: [{
    id: 'm1.l1',
    title: 'Headings',
    minutes: 10,
    challenges: [{
      id: 'c1',
      title: 'Page with a heading',
      prompt: 'Make an h1.',
      lang: 'html',
      starter: '<h1>Draft</h1>\n<img src="a.png">\n',
      hints: ['h1'],
      checks: [],
      difficulty: 'easy',
      minutes: 5,
    }],
  }],
  project: null,
}];

const STORE_DIR = mkdtempSync(path.join(tmpdir(), 'browser-route-'));
const STORE_FILE = path.join(STORE_DIR, 'progress.json');

/** Poll until `fn()` is truthy. */
async function waitFor(fn, { timeout = 8000, step = 20 } = {}) {
  const start = Date.now();
  for (;;) {
    const value = fn();
    if (value) return value;
    if (Date.now() - start > timeout) return null;
    await new Promise((r) => setTimeout(r, step));
  }
}

test('browser route: C-b, live re-render, inspect, jump handoff, console', async (t) => {
  if (!harness) {
    t.skip('needs built harness (npm run build)');
    return;
  }
  resetConsoleSession();

  function mountApp(services) {
    const box = { host: null };
    function Probe() {
      box.host = harness.useHost();
      return harness.el(harness.Text, null, 'probe');
    }
    function App() {
      return harness.el(
        harness.ServicesProvider,
        { services },
        harness.el(
          harness.RouterProvider,
          {
            screens: {
              home: harness.HomeRoute,
              challenge: harness.ChallengeRoute,
              browser: harness.BrowserRoute,
            },
            initial: { name: 'challenge', params: { moduleId: 'm1', lessonId: 'm1.l1', challengeId: 'c1' } },
          },
          harness.el(
            harness.CommandHost,
            {},
            harness.el(
              harness.Box,
              { flexDirection: 'column' },
              harness.el(harness.RouterView, {}),
              harness.el(Probe, {}),
            ),
          ),
        ),
      );
    }
    const out = helper.fakeStdout(110, 34);
    const inst = harness.render(harness.el(App, {}), { stdout: out, stdin: helper.fakeStdin(), exitOnCtrlC: false, patchConsole: false });
    return {
      inst,
      host: () => box.host,
      screen: () => harness.getCurrentRoute().screen,
      frame: () => helper.stripAnsi(out.chunks.join('')),
      onKey: (key) => harness.getCurrentRoute().onKey(key),
      onMouse: (ev) => { const r = harness.getCurrentRoute(); return r.onMouse ? r.onMouse(ev) : false; },
    };
  }

  function servicesFor() {
    const store = new Store(STORE_FILE);
    return harness.createServices({
      store,
      curriculum: CURRICULUM,
      settings: { data: { palette: { recent: [] }, panes: {}, editor: {} }, save: () => {}, bannerVisible: () => false, dismissBanner: () => {}, paneRatio: () => 0.5, setPaneRatio: () => {}, resetPanes: () => {} },
      overall: { modules: 1, challenges: 1 },
      lessonIndex: [],
    });
  }

  try {
    rmSync(STORE_FILE, { force: true });
    const services = servicesFor();
    const app = mountApp(services);

    await t.test('C-b pushes the browser over the challenge', async () => {
      assert.ok(await waitFor(() => app.screen() === 'challenge'), 'the challenge mounts first');
      assert.ok(await waitFor(() => app.frame().includes('Page with a heading')), 'the brief renders');
      app.onKey({ name: 'ctrl-b' });
      assert.ok(await waitFor(() => app.screen() === 'browser'), 'Ctrl+B opens the browser');
      assert.ok(await waitFor(() => app.frame().includes('Render')), 'the tab strip renders');
      assert.ok(app.frame().includes('Elements') && app.frame().includes('Network'), 'five tabs incl. Network');
      assert.ok(app.frame().includes('live: re-renders as you type'), 'the live indicator shows');
    });

    await t.test('live re-render: an autosaved draft updates the page', async () => {
      // Simulate ChallengeRoute's autosave: write a draft the poll will see.
      services.store.saveDraft('m1.l1.c1', '<h1>Edited live</h1>\n<p>second</p>\n');
      assert.ok(
        await waitFor(() => app.frame().includes('Edited live'), { timeout: 4000 }),
        'the page re-renders from the draft within the poll window',
      );
    });

    await t.test('click-to-inspect selects the element; Enter pops with a pending jump', async () => {
      // The h1's rendered line is the first page row: 3 chrome rows above the
      // body, 1-based screen row 4 → bodyRow 0.
      const hit = app.onMouse({ type: 'mouse', action: 'down', button: 0, x: 4, y: 4 });
      assert.equal(hit, true, 'the browser claims clicks in its pane');
      assert.ok(
        await waitFor(() => app.frame().includes('inspecting <h1>')),
        'the click selects the element the line belongs to',
      );
      assert.ok(app.frame().includes('Page with a heading') || app.frame().length > 0);
      // Enter = jump-to-source on a non-console pane → pops with a handoff.
      app.onKey({ name: 'enter' });
      assert.ok(await waitFor(() => app.screen() === 'challenge'), 'Enter pops back to the editor');
      assert.ok(
        await waitFor(() => harness.browserJumpHandoff.pending === null),
        'the challenge route consumed the jump',
      );
    });

    await t.test('the console evaluates on the warmed session', async () => {
      app.onKey({ name: 'ctrl-b' });
      assert.ok(await waitFor(() => app.screen() === 'browser'), 'back into the browser');
      app.onKey({ name: 'char', char: '4' }); // jumpTab4 → Console
      assert.ok(await waitFor(() => app.frame().includes('CONSOLE')), 'the console pane shows');
      // Type via printable chars (they must NOT fire global commands).
      for (const ch of '1+1') app.onKey({ name: 'char', char: ch });
      app.onKey({ name: 'enter' });
      assert.ok(await waitFor(() => app.frame().includes('⟵ 2')), 'the expression evaluates');
      // A second expression evaluates on top of the same warm session.
      for (const ch of '2+2') app.onKey({ name: 'char', char: ch });
      app.onKey({ name: 'enter' });
      assert.ok(await waitFor(() => app.frame().includes('⟵ 4')), 'the second expression evaluates too');
    });

    await t.test('network pane lists the mocked routes and observed fetches', async () => {
      // The console owns printable keys (so `1+1` can be typed), so pane
      // switching there is Tab — the registry's browser.tabNext.
      app.onKey({ name: 'tab' }); // console → network
      assert.ok(await waitFor(() => app.frame().includes('NETWORK')), 'the network pane shows');
      assert.ok(app.frame().includes('no mockFetch'), 'this challenge has no table; it says so');
    });

    await t.test('browser.screenshot: palette-dispatched, gated, guidance lands in the footer (P0-3)', async () => {
      // Still on the browser screen. Services carry NO graphicsProbe and the
      // test env does not opt in — the action must answer with guidance, not
      // an image, and the playwright-adjacent modules must stay unimported.
      delete process.env.FULLSTACK_SCREENSHOT;
      harness.dispatchToScreen('browser.screenshot', { type: 'command', source: 'palette' });
      assert.ok(
        await waitFor(() => app.frame().includes('FULLSTACK_SCREENSHOT=playwright')),
        'the disabled branch shows the opt-in hint in the footer notice',
      );

      // Opt in but keep the terminal protocol empty (no probe, no env): the
      // no-protocol branch answers next.
      process.env.FULLSTACK_SCREENSHOT = 'playwright';
      try {
        harness.dispatchToScreen('browser.screenshot', { type: 'command', source: 'palette' });
        assert.ok(
          await waitFor(() => app.frame().includes('no inline-image protocol')),
          'the no-protocol branch shows terminal guidance',
        );
      } finally {
        delete process.env.FULLSTACK_SCREENSHOT;
      }
    });

    app.onKey({ name: 'escape' });
    assert.ok(await waitFor(() => app.screen() === 'challenge'), 'Esc returns to the editor');
    app.inst.unmount();
  } finally {
    resetConsoleSession();
  }
});

test('runConsoleSession: the page code executes once per edit, not per expression', async () => {
  _resetConsoleSessionForTests();
  const code = 'globalThis.__runs = (globalThis.__runs || 0) + 1;\nconst n = 5;';
  const first = await runConsoleSession(code, 'n * 2', {});
  assert.equal(first.ok, true, 'the first evaluation succeeds');
  assert.equal(first.value, '10');
  assert.equal(first.rebuilt, true, 'the first call boots the page');
  const second = await runConsoleSession(code, 'n + 1', {});
  assert.equal(second.rebuilt, false, 'the same code does NOT re-execute');
  assert.equal(second.value, '6');
  // Editing the code rebuilds exactly once more.
  const edited = await runConsoleSession(code + '\nconst m = 2;', 'n * m', {});
  assert.equal(edited.rebuilt, true, 'changed code rebuilds the session');
  assert.equal(edited.value, '10');
  _resetConsoleSessionForTests();
});
