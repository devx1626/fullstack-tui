/**
 * SIGWINCH resize (parity row PC-23, loose-ends-spec §D).
 * Run: node --test tests/unit/sigwinch.test.js  (needs dist/harness.js)
 *
 * This path had NO automated coverage: real terminals deliver SIGWINCH to the
 * process, useWindowSize.js subscribes with process.on('SIGWINCH'), re-reads
 * process.stdout.columns/rows in its snapshot, and useSyncExternalStore
 * re-renders whatever consumed it — the CommandHost's width/height, and
 * through them every screen's layout (the challenge split re-clamps with
 * clampSplit so both panes keep their minimums).
 *
 * A pty would exercise the OS delivery too, but the row explicitly prescribes
 * a fake-emitter unit: `process.emit('SIGWINCH')` drives the REAL listener →
 * snapshot → re-render chain (the OS half is kernel behavior, not ours), which
 * keeps the test deterministic and CI-safe. Assertions read live app state
 * (host.width/height via a probe child) and the route's mouse gate, which
 * behaviorally exposes the split's clamped divider column — never painted
 * frames, which a cumulative stream makes ambiguous.
 *
 * Structure note: subtests are declared via `await t.test(...)` inside one
 * parent (the node:test collection race with top-level awaits).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const STORE_FILE = path.join(ROOT, '.data', 'sigwinch-test.json');

/** Poll until `fn()` is truthy (or time out and return null). */
async function waitFor(fn, { timeout = 8000, step = 20 } = {}) {
  const start = Date.now();
  for (;;) {
    const value = fn();
    if (value) return value;
    if (Date.now() - start > timeout) return null;
    await new Promise((r) => setTimeout(r, step));
  }
}

const CURRICULUM = [
  {
    id: 'm1',
    badge: 'HT',
    title: 'HTML Basics',
    tagline: 'structure first',
    hours: 6,
    source: { course: 'c', url: 'u', roadmap: 'r', docs: 'd' },
    lessons: [
      {
        id: 'm1.l1',
        title: 'Headings',
        minutes: 10,
        challenges: [
          { id: 'c1', title: 'Resize me', prompt: 'Split pane.', lang: 'js', starter: 'const x = 1;', hints: [], checks: [], difficulty: 'easy', minutes: 5 },
        ],
      },
    ],
    project: { id: 'm1.p', title: 'Portfolio page', minutes: 45, checks: [] },
  },
];

test('SIGWINCH resize re-renders the tree (PC-23)', async (t) => {
  const harnessPath = new URL('../../dist/harness.js', import.meta.url).pathname;
  const harness = existsSync(harnessPath) ? await import(pathToFileURL(harnessPath).href) : null;
  const helper = await import(pathToFileURL(new URL('../helpers/snapshot.js', import.meta.url).pathname));
  const { Store } = await import('../../src/core/store.js');

  if (!harness) {
    t.skip('needs built harness (npm run build)');
    return;
  }

  // useWindowSize reads process.stdout — the REAL one, not ink's stream — so
  // the test mutates those properties directly and restores them afterwards.
  // Under the test runner they are usually undefined (the classic floor 100x30
  // applies), which is exactly the state the floor assertions start from.
  const realColumns = process.stdout.columns;
  const realRows = process.stdout.rows;
  const setWin = (columns, rows) => {
    process.stdout.columns = columns;
    process.stdout.rows = rows;
  };
  const emitResize = () => {
    // Fake-emitter contract: same delivery mechanism a pty-driven session
    // would end in (process listeners), minus the kernel half.
    process.emit('SIGWINCH');
  };

  /** Mount the real tree (bare probe, or the challenge screen) and record
   * every host width/height the probe observes. */
  function mountTree({ challenge = null } = {}) {
    const box = { host: null, observations: [] };
    function Probe() {
      box.host = harness.useHost();
      const w = box.host && box.host.width;
      const h = box.host && box.host.height;
      const last = box.observations[box.observations.length - 1];
      if (w !== undefined && (!last || last.w !== w || last.h !== h)) {
        box.observations.push({ w, h });
      }
      return harness.el(harness.Text, null, 'probe');
    }
    const panes = {};
    const settings = {
      data: { palette: { recent: [] }, panes, editor: {} },
      save: () => {},
      bannerVisible: () => false,
      dismissBanner: () => {},
      paneRatio: (s, k, fallback) => (panes[s] && panes[s][k] != null ? panes[s][k] : fallback),
      setPaneRatio: (s, k, ratio) => { panes[s] = { ...(panes[s] || {}), [k]: ratio }; },
      resetPanes: (s) => { delete panes[s]; },
    };
    const store = new Store(STORE_FILE);
    const services = harness.createServices({
      store,
      curriculum: CURRICULUM,
      settings,
      overall: { modules: CURRICULUM.length, challenges: 1 },
      lessonIndex: CURRICULUM.flatMap((m) => m.lessons.map((lesson) => ({ module: m, lesson }))),
    });

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
            },
            initial: challenge
              ? { name: 'challenge', params: challenge }
              : { name: 'home', params: {} },
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

    const out = helper.fakeStdout(120, 40);
    const inst = harness.render(harness.el(App, {}), {
      stdout: out,
      stdin: helper.fakeStdin(),
      exitOnCtrlC: false,
      patchConsole: false,
    });
    return {
      inst,
      settings,
      observations: box.observations,
      host: () => box.host,
      screen: () => harness.getCurrentRoute() && harness.getCurrentRoute().screen,
      frame: () => helper.stripAnsi(out.chunks.join('')),
      route: () => harness.getCurrentRoute(),
    };
  }

  try {
    await t.test('a resize event re-renders with the new window size', async () => {
      rmSync(STORE_FILE, { force: true });
      setWin(100, 30);
      const app = mountTree();
      try {
        assert.ok(await waitFor(() => app.host()), 'the tree mounts');
        assert.equal(app.host().width, 100, 'the initial size comes from process.stdout');

        setWin(61, 20);
        emitResize();
        assert.ok(
          await waitFor(() => app.host().width === 61 && app.host().height === 20),
          'SIGWINCH re-reads the window and re-renders the host',
        );
        assert.ok(
          app.observations.some((o) => o.w === 61 && o.h === 20),
          'the probe observed the resize as a real re-render, not a stale read',
        );
      } finally {
        app.inst.unmount();
      }
    });

    await t.test('the classic floor 40x16 is honored on absurdly small windows', async () => {
      rmSync(STORE_FILE, { force: true });
      setWin(100, 30);
      const app = mountTree();
      try {
        assert.ok(await waitFor(() => app.host()));
        setWin(15, 9); // below both floors
        emitResize();
        assert.ok(
          await waitFor(() => app.host().width === 40 && app.host().height === 16),
          'width clamps to 40 and height to 16 (useWindowSize floors)',
        );

        // Back over the floor: the clamp must release, not stick.
        setWin(90, 28);
        emitResize();
        assert.ok(
          await waitFor(() => app.host().width === 90 && app.host().height === 28),
          'the floor is a clamp, not a one-way latch',
        );
      } finally {
        app.inst.unmount();
      }
    });

    await t.test('a no-op resize (same snapshot) does not re-render', async () => {
      rmSync(STORE_FILE, { force: true });
      setWin(100, 30);
      const app = mountTree();
      try {
        assert.ok(await waitFor(() => app.host()));
        await waitFor(() => app.observations.length > 0);
        const rendersBefore = app.observations.length;
        emitResize(); // columns/rows unchanged → identical snapshot
        await new Promise((r) => setTimeout(r, 120));
        assert.equal(
          app.observations.length,
          rendersBefore,
          'useSyncExternalStore skips the re-render when the snapshot is identical',
        );
      } finally {
        app.inst.unmount();
      }
    });

    await t.test('the challenge split re-clamps on shrink (min panes kept, gate honest)', async () => {
      rmSync(STORE_FILE, { force: true });
      setWin(100, 30);
      const app = mountTree({ challenge: { moduleId: 'm1', lessonId: 'm1.l1', challengeId: 'c1' } });
      try {
        assert.ok(await waitFor(() => app.screen() === 'challenge'), 'challenge route registered');
        assert.ok(await waitFor(() => app.frame().includes('Resize me')), 'the challenge rendered');
        assert.ok(await waitFor(() => app.host().width === 100));

        // At 100 columns the default ratio (0.42) puts the divider at 0-based
        // column 42: a press at SGR x 20 lands in the brief pane (nobody
        // claims it), one at x 43 is the divider drag (claimed).
        const route = () => app.route();
        assert.ok(route() && typeof route().onMouse === 'function', 'the route registered its mouse handler');
        const press = (x, y) => ({ type: 'mouse', action: 'down', button: 0, x, y });
        assert.equal(route().onMouse(press(20, 1)), false, 'left of the divider is the brief pane');
        assert.equal(route().onMouse(press(43, 1)), true, 'the divider column claims its press');

        // Shrink to a degenerate window: useWindowSize floors 30 → 40 columns,
        // where the remembered ratio (0.42 × 40 = 17) is clamped by minRight
        // (24) to leftWidth 16 — clampSplit's minimums dominate below the
        // degenerate sum. The mouse gate must follow the CLAMPED layout:
        // x 5 is still the brief pane, x 17 is already the divider.
        setWin(30, 20);
        emitResize();
        assert.ok(await waitFor(() => app.host().width === 40), 'the shrink re-renders (at the 40-column floor)');
        assert.equal(route().onMouse(press(5, 1)), false, 'the brief pane still ends left of the clamped divider');
        assert.equal(route().onMouse(press(17, 1)), true, 'the clamped divider column claims its press');
      } finally {
        app.inst.unmount();
      }
    });

    await t.test('SIGWINCH listeners are cleaned up on unmount (no leak)', async () => {
      rmSync(STORE_FILE, { force: true });
      setWin(100, 30);
      const baseline = process.listenerCount('SIGWINCH');
      const appA = mountTree();
      assert.ok(await waitFor(() => appA.host()));
      const withA = process.listenerCount('SIGWINCH');
      assert.ok(withA > baseline, 'a mounted tree subscribes to SIGWINCH');

      const appB = mountTree();
      assert.ok(await waitFor(() => appB.host()));
      assert.ok(
        process.listenerCount('SIGWINCH') > withA,
        'a second tree adds its own subscription',
      );

      appB.inst.unmount();
      await new Promise((r) => setTimeout(r, 50));
      assert.equal(process.listenerCount('SIGWINCH'), withA, 'unmount removes the second subscription');

      appA.inst.unmount();
      await new Promise((r) => setTimeout(r, 50));
      assert.equal(
        process.listenerCount('SIGWINCH'),
        baseline,
        'every unmount removes exactly its own subscription (no leak)',
      );
    });
  } finally {
    if (realColumns === undefined) delete process.stdout.columns; else process.stdout.columns = realColumns;
    if (realRows === undefined) delete process.stdout.rows; else process.stdout.rows = realRows;
    rmSync(STORE_FILE, { force: true });
  }
});
