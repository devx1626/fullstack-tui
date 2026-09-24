/**
 * Route-level mouse replay (PC-18, loose-ends-spec parity row).
 * Run: node --test tests/unit/mouseReplay.test.js  (needs dist/harness.js)
 *
 * The unit suites pin each LINK in isolation: input.test.js parses SGR bytes,
 * keymap tests route events, useEditorMouse tests map pane coordinates, and
 * routes.test.js drives the divider drag. Nothing drove the WHOLE chain —
 * bytes → MouseParser → dispatcher → route gate → editor sink → session
 * commit — which is where an integration bug would hide (PC-18's reason to
 * exist: "mouse is unit-covered but there is no route-level replay").
 *
 * This file does exactly that: a real challenge screen is mounted, the real
 * InputDispatcher owns a fake stdin, and raw SGR sequences — the exact bytes a
 * terminal emits, delivered as chunks the way a fast drag arrives — are fed
 * through. Assertions read the same seams as routes.test.js: the store draft
 * the route writes through (polled, never race-prone frame matching) and the
 * cumulative write stream for painted content.
 *
 * Geometry is computed at RUNTIME from app.host().width, never assumed:
 * useWindowSize reads process.stdout.columns (undefined under the test runner
 * → the classic floor 100), NOT the ink fake stdout's width — the same seam
 * routes.test.js's divider test navigates by reading host().width first.
 * From W: leftWidth = round(0.42 × W) clamped, the divider is 0-based column
 * leftWidth, the editor pane starts at 0-based column leftWidth + 1, the
 * gutter is String(lineCount).length + 2 wide, and a single-file challenge
 * has no tab strip (stripRows 0) with the pane at terminal row 1 — so SGR y
 * is already the document row (1-based) and pane x needs no further math
 * beyond the route's own rebase (it subtracts leftWidth + 1 before the sink
 * subtracts the gutter).
 *
 * Structure note: subtests are declared via `await t.test(...)` inside one
 * parent (the node:test collection race with top-level awaits).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import '../helpers/runner-env.js';

const ROOT = process.cwd();
const STORE_FILE = path.join(ROOT, '.data', 'mouse-replay-test.json');

const TALL_STARTER = Array.from({ length: 30 }, (_, i) => `// L${String(i).padStart(2, '0')}`).join('\n');

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
          { id: 'c1', title: 'First heading', prompt: 'One line.', lang: 'js', starter: 'const highlight = 1;', hints: [], checks: [], difficulty: 'easy', minutes: 5 },
          { id: 'c2', title: 'Drag target', prompt: 'Three lines.', lang: 'js', starter: 'alpha\nbeta\ngamma', hints: [], checks: [], difficulty: 'easy', minutes: 5 },
        ],
      },
    ],
    project: { id: 'm1.p', title: 'Portfolio page', minutes: 45, checks: [] },
  },
  {
    id: 'm2',
    badge: 'LN',
    title: 'Long file',
    tagline: 'scroll it',
    hours: 4,
    source: { course: 'c', url: 'u', roadmap: 'r', docs: 'd' },
    lessons: [
      { id: 'm2.l1', title: 'Tall', minutes: 9, challenges: [{ id: 'c1', title: 'A tall file', prompt: 'Scroll.', lang: 'js', starter: TALL_STARTER, hints: [], checks: [], difficulty: 'easy', minutes: 4 }] },
    ],
  },
];

/** Poll until `fn()` is truthy (or time out and return null) — same policy
 * as routes.test.js: generous budget, small step, polls real state. */
async function waitFor(fn, { timeout = 8000, step = 20 } = {}) {
  const start = Date.now();
  for (;;) {
    const value = fn();
    if (value) return value;
    if (Date.now() - start > timeout) return null;
    await new Promise((r) => setTimeout(r, step));
  }
}

test('route-level mouse replay through ChallengeRoute', async (t) => {
  const harnessPath = new URL('../../dist/harness.js', import.meta.url).pathname;
  const harness = existsSync(harnessPath) ? await import(pathToFileURL(harnessPath).href) : null;
  const helper = await import(pathToFileURL(new URL('../helpers/snapshot.js', import.meta.url).pathname));
  const { InputDispatcher } = await import('../../src/ui/input/dispatcher.js');
  const { Store } = await import('../../src/core/store.js');

  if (!harness) {
    t.skip('needs built harness (npm run build)');
    return;
  }

  /** Mount the real route tree and own its stdin with a REAL InputDispatcher.
   *
   * The dispatcher gets its OWN fake stdin, separate from the one handed to
   * ink's render: ink's useInput keeps its (silent) binding for the vim cursor
   * path, while every byte we feed travels the production parser chain —
   * MouseParser → PasteBuffer → EscapeCoalescer → route — not a synthesized
   * event. Feeding raw SGR bytes is the point: a synthesized {type:'mouse'}
   * object would skip the very links PC-18 exists to verify.
   *
   * `onMouseSpy` records every route-level claim (what onMouseRoute returned)
   * so tests can pin the claim protocol, not just the data effects.
   */
  function mountApp(services, { onMouseSpy } = {}) {
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
              module: harness.ModuleRoute,
              lesson: harness.LessonRoute,
              challenge: harness.ChallengeRoute,
              settings: harness.SettingsRoute,
              tour: harness.TourRoute,
            },
            initial: { name: 'home', params: {} },
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
    const inst = harness.render(harness.el(App, {}), { stdout: out, stdin: helper.fakeStdin(), exitOnCtrlC: false, patchConsole: false });

    const claims = [];
    const dspStdin = helper.fakeStdin();
    const dispatcher = new InputDispatcher({
      stdout: out,
      stdin: dspStdin,
      getRoute: () => {
        const route = harness.getCurrentRoute();
        if (!route) return route;
        if (!onMouseSpy) return route;
        return {
          ...route,
          onMouse: (ev) => {
            const ok = typeof route.onMouse === 'function' ? route.onMouse(ev) === true : false;
            claims.push({ action: ev.action, button: ev.button, x: ev.x, y: ev.y, ok });
            return ok;
          },
        };
      },
      globalHandler: () => false,
      onQuit: () => {},
    });
    dispatcher.start();

    return {
      inst,
      dispatcher,
      claims,
      host: () => box.host,
      screen: () => harness.getCurrentRoute() && harness.getCurrentRoute().screen,
      /** Feed raw bytes as one stdin chunk (arrays = one chunk per element). */
      feed: (script) => dspStdin.emit('data', Buffer.from(Array.isArray(script) ? script.join('') : script)),
      frame: () => helper.stripAnsi(out.chunks.join('')),
    };
  }

  function fakeSettings() {
    const panes = {};
    return {
      data: { palette: { recent: [] }, panes, editor: {} },
      save: () => {},
      bannerVisible: () => false,
      dismissBanner: () => {},
      paneRatio: (screen, key, fallback) => {
        const saved = panes[screen] && panes[screen][key];
        return Number.isFinite(saved) ? saved : fallback;
      },
      setPaneRatio: (screen, key, ratio) => { panes[screen] = { ...(panes[screen] || {}), [key]: ratio }; },
      resetPanes: (screen) => { delete panes[screen]; },
    };
  }

  function servicesFor(cur) {
    const store = new Store(STORE_FILE);
    const settings = fakeSettings();
    const challenges = cur.reduce((n, m) => n + m.lessons.reduce((k, l) => k + l.challenges.length, 0), 0);
    return harness.createServices({
      store,
      curriculum: cur,
      settings,
      overall: { modules: cur.length, challenges },
      lessonIndex: cur.flatMap((m) => m.lessons.map((lesson) => ({ module: m, lesson }))),
    });
  }

  /** SGR encodings (input/index.js): `ESC [ < bits ; x ; y M|m`, x/y 1-based.
   * bits: 0 left-press/release, 2 right, 32 motion, 64/65 wheel up/down. */
  const press = (x, y) => `\x1b[<0;${x};${y}M`;
  const release = (x, y) => `\x1b[<0;${x};${y}m`;
  const motion = (x, y) => `\x1b[<32;${x};${y}M`;
  const rightPress = (x, y) => `\x1b[<2;${x};${y}M`;
  const wheelDown = (x, y) => `\x1b[<65;${x};${y}M`;

  /** Open a challenge and wait for a REAL render of it. Returns { record,
   * xAtCol, briefX } — geometry helpers bound to the LIVE host width:
   * xAtCol(col, row) is the SGR byte pair for a click on a document cell,
   * briefX is an x safely inside the brief pane. `record` reads the SAME
   * services instance the route writes through (a fresh Store would race
   * sibling test files on the shared store file). */
  async function openChallenge(app, services, { moduleId, lessonId, challengeId, title, lineCount }) {
    app.host().go('challenge', { moduleId, lessonId, challengeId });
    assert.ok(await waitFor(() => app.screen() === 'challenge'), 'challenge route registered');
    assert.ok(await waitFor(() => app.frame().includes(title)), 'challenge rendered');
    const record = () => services.store.challengeRecord(`${lessonId}.${challengeId}`);
    // W is the REAL host width (useWindowSize reads process.stdout, which the
    // runner leaves at the 100-column floor — never the fake stdout's 120).
    const W = app.host().width;
    const leftWidth = harness.ratioToColumns(0.42, W, 20, 24);
    const gutter = String(Math.max(1, lineCount)).length + 2;
    const firstTextX = leftWidth + 2 + gutter; // 1-based SGR x of document col 0
    return {
      record,
      xAtCol: (col, row) => [firstTextX + col, row],
      briefX: Math.max(1, leftWidth - 5),
    };
  }

  try {
    await t.test('a click inside the editor pane moves the caret (bytes → parser → gate → sink → session)', async () => {
      rmSync(STORE_FILE, { force: true });
      const services = servicesFor(CURRICULUM);
      const app = mountApp(services);
      try {        await waitFor(() => app.screen() === 'home');
        const { record, xAtCol } = await openChallenge(app, services, {
          moduleId: 'm1', lessonId: 'm1.l1', challengeId: 'c1', title: 'First heading', lineCount: 1,
        });
        assert.ok(await waitFor(() => record().lastCode == null, { timeout: 4000 }), 'the starter seeds without a draft');

        // Click inside 'highlight' (col 8, before 'ghlight') and type. '0' is
        // unbound here, so it types at the caret the click moved — discriminating
        // col 8 from both the seed position (0) and end-of-line clamping.
        const [x1, y1] = xAtCol(8, 1);
        app.feed(press(x1, y1) + release(x1, y1));
        app.feed('0');
        assert.ok(
          await waitFor(() => record().lastCode === 'const hi0ghlight = 1;', { timeout: 4000 }),
          'typing lands at the clicked column (terminal-absolute x rebased by the route)',
        );

        // A second click re-points the caret: column 0, before 'const'.
        const [x2, y2] = xAtCol(0, 1);
        app.feed(press(x2, y2) + release(x2, y2));
        app.feed('X');
        assert.ok(
          await waitFor(() => record().lastCode === 'Xconst hi0ghlight = 1;', { timeout: 4000 }),
          'a second click re-points the caret at the token',
        );
      } finally {
        app.dispatcher.stop();
        app.inst.unmount();
      }
    });

    await t.test('a drag extends a selection and typing replaces it (motion burst in one chunk)', async () => {
      rmSync(STORE_FILE, { force: true });
      const services = servicesFor(CURRICULUM);
      const app = mountApp(services);
      try {
        await waitFor(() => app.screen() === 'home');
        const { record, xAtCol } = await openChallenge(app, services, {
          moduleId: 'm1', lessonId: 'm1.l1', challengeId: 'c2', title: 'Drag target', lineCount: 3,
        });
        assert.ok(await waitFor(() => record().lastCode == null, { timeout: 4000 }), 'the starter seeds without a draft');

        // Row 2 is 'beta'. Press at its first column, drag through the word to
        // its end (caret-exclusive), then release — all FOUR sequences arriving
        // as ONE chunk, exactly what a fast drag sends.
        const [px, py] = xAtCol(0, 2);
        const [mx1] = xAtCol(3, 2);
        const [mx2] = xAtCol(4, 2);
        app.feed(press(px, py) + motion(mx1, py) + motion(mx2, py) + release(mx2, py));

        // 'z' (unbound) replaces the selected 'beta' — the session effect of
        // the whole chain. Reads ref-fresh session state (the burst-safe
        // contract), so one tick is enough for the pair to settle.
        app.feed('z');
        assert.ok(
          await waitFor(() => record().lastCode === 'alpha\nz\ngamma', { timeout: 4000 }),
          'the drag-selected word is replaced by the typed text',
        );
      } finally {
        app.dispatcher.stop();
        app.inst.unmount();
      }
    });

    await t.test('wheel over the editor scrolls the challenge viewport', async () => {
      rmSync(STORE_FILE, { force: true });
      const services = servicesFor(CURRICULUM);
      const app = mountApp(services);
      try {        await waitFor(() => app.screen() === 'home');
        const { record, xAtCol } = await openChallenge(app, services, {
          moduleId: 'm2', lessonId: 'm2.l1', challengeId: 'c1', title: 'A tall file', lineCount: 30,
        });

        // The 30-line file fills the 20-row editor: L00–L19 visible, L20 is
        // below the fold. Three wheel-DOWNS in ONE chunk scroll 3 × 3 = 9 rows
        // toward the end (wheel-up would clamp at the top), and the painted
        // frame must show the newly revealed row.
        const [wx, wy] = xAtCol(4, 10);
        assert.ok(!app.frame().includes('L20'), 'L20 is below the fold before scrolling');
        app.feed(wheelDown(wx, wy) + wheelDown(wx, wy) + wheelDown(wx, wy));
        assert.ok(
          await waitFor(() => app.frame().includes('L20'), { timeout: 4000 }),
          'wheel scroll repaints the viewport past the fold',
        );
        assert.ok(
          await waitFor(() => (record().lastCode ?? null) === null, { timeout: 4000 }),
          'scrolling is a view change, never a draft',
        );
      } finally {
        app.dispatcher.stop();
        app.inst.unmount();
      }
    });

    await t.test('a click in the brief pane is nobody\'s: the editor never sees it', async () => {
      rmSync(STORE_FILE, { force: true });
      const services = servicesFor(CURRICULUM);
      const app = mountApp(services);
      try {        await waitFor(() => app.screen() === 'home');
        const { record, briefX } = await openChallenge(app, services, {
          moduleId: 'm1', lessonId: 'm1.l1', challengeId: 'c1', title: 'First heading', lineCount: 1,
        });

        // briefX is well inside the brief pane (the gate hands it to
 // splitMouse, which declines pane clicks — routes.test.js pins that
 // half). The editor sink must not fire: no caret move, no claim.
        app.feed(press(briefX, 3) + release(briefX, 3));
        app.feed(press(20, 3) + release(20, 3));
        assert.ok(app.claims.every((c) => c.ok === false), 'no handler claims a brief-pane click');

        // Proof the caret never moved: 'W' still types at the seed position.
        app.feed('W');
        assert.ok(
          await waitFor(() => record().lastCode === 'Wconst highlight = 1;', { timeout: 4000 }),
          'the brief-pane click left the editor caret untouched',
        );
      } finally {
        app.dispatcher.stop();
        app.inst.unmount();
      }
    });

    await t.test('the claim protocol is honest at route level (right-button, lone motion, full drag)', async () => {
      rmSync(STORE_FILE, { force: true });
      const services = servicesFor(CURRICULUM);
      const app = mountApp(services, { onMouseSpy: true });
      try {
        await waitFor(() => app.screen() === 'home');
        const { xAtCol } = await openChallenge(app, services, {
          moduleId: 'm1', lessonId: 'm1.l1', challengeId: 'c1', title: 'First heading', lineCount: 1,
        });

        // One chunk, five sequences: a right-button press (not a caret tool),
        // a motion with no press held, then a complete left drag — all inside
        // the editor pane (xAtCol col 0 is its first text column).
        const [ax, ay] = xAtCol(0, 1);
        const [bx] = xAtCol(1, 1);
        app.feed(rightPress(ax, ay) + motion(bx, ay) + press(ax, ay) + motion(bx, ay) + release(bx, ay));

        assert.ok(
          await waitFor(() => app.claims.length === 5, { timeout: 4000 }),
          'every byte sequence reached the route-level handler',
        );
        assert.deepEqual(
          app.claims.map((c) => c.ok),
          [false, false, true, true, true],
          'right-button and press-less motion are declined; the left drag is claimed end to end',
        );
      } finally {
        app.dispatcher.stop();
        app.inst.unmount();
      }
    });
  } finally {
    rmSync(STORE_FILE, { force: true });
  }
});
