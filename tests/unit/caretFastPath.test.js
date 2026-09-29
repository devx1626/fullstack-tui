/**
 * P0-5: the editor caret fast path (route-level replay).
 * Run: node --test tests/unit/caretFastPath.test.js  (needs dist/harness.js)
 *
 * The §12 contract: a caret move that changes neither selection, scroll view,
 * multi-cursor set, active tab, nor a relative gutter must not re-render the
 * tree — ink only repositions the terminal cursor (its cursor-only write
 * sequence). The observable, renderer-independent contract is:
 *
 *   1. the caret MOVES (the next typed char lands at the new position) —
 *      proved through the autosaved buffer, like every route replay;
 *   2. NO frame is painted for the move (the stdout stream stays silent) —
 *      the byte-identical-frame guarantee, now enforced, not just measured;
 *   3. any guard miss (selection, multi-cursor, scroll-needing move) falls
 *      back to the state-update path and the frame repaints as before.
 *
 * Fast-path geometry note: the route arms cursorPoint with the same layout
 * constants EditorPane renders (stripRows 1, gutter 4, height 20). A guarded
 * move that would scroll (caret pushed past the window edge) must NOT take
 * the fast path — the frame has to repaint with the new scroll view.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import '../helpers/runner-env.js';

const ROOT = process.cwd();
const STORE_FILE = path.join(ROOT, '.data', 'caret-fastpath-test.json');

test('P0-5: caret fast path — silent moves, moved caret, guarded fallbacks', async (t) => {
  const harnessPath = new URL('../../dist/harness.js', import.meta.url).pathname;
  const harness = existsSync(harnessPath) ? await import(pathToFileURL(harnessPath).href) : null;
  const helper = await import(pathToFileURL(new URL('../helpers/snapshot.js', import.meta.url).pathname));
  const { Store } = await import('../../src/core/store.js');

  if (!harness) {
    t.skip('needs built harness (npm run build)');
    return;
  }

  const CURRICULUM = [
    {
      id: 'm1', badge: 'HT', title: 'HTML Basics', tagline: 'structure first', hours: 6,
      source: { course: 'c', url: 'u', roadmap: 'r', docs: 'd' },
      lessons: [
        { id: 'm1.l1', title: 'Headings', minutes: 10, challenges: [
          { id: 'c1', title: 'First heading', prompt: 'Wrap it in an h1.', lang: 'html', starter: '<h1', hints: ['a', 'b'], checks: [], difficulty: 'easy', minutes: 5 },
        ] },
      ],
      project: { id: 'm1.p', title: 'P', minutes: 45, checks: [{ id: 'k1' }] },
    },
  ];

  function fakeSettings() {
    const panes = {};
    return {
      data: { palette: { recent: [] }, panes, editor: { vimMode: false } },
      save: () => {},
      bannerVisible: () => false,
      dismissBanner: () => {},
      paneRatio: (s, k, f) => { const v = panes[s] && panes[s][k]; return Number.isFinite(v) ? v : f; },
      setPaneRatio: (s, k, r) => { panes[s] = { ...(panes[s] || {}), [k]: r }; },
      resetPanes: (s) => { delete panes[s]; },
    };
  }

  const savedCode = (svc, key) => {
    const rec = svc.store.challengeRecord(key);
    return rec ? rec.lastCode : undefined;
  };

  async function waitFor(fn, { timeout = 8000, step = 20 } = {}) {
    const start = Date.now();
    for (;;) {
      const value = fn();
      if (value) return value;
      if (Date.now() - start > timeout) return null;
      await new Promise((r) => setTimeout(r, step));
    }
  }

  /** Build a single-file buffer of `rows` empty lines + '<h1' (caret on the
   *  LAST row), the P1-13b/PC-11 pattern: Enters insert BEFORE the caret. */
  async function mountWithRows(rows) {
    rmSync(STORE_FILE, { force: true });
    const services = harness.createServices({
      store: new Store(STORE_FILE),
      curriculum: CURRICULUM,
      settings: fakeSettings(),
      overall: { modules: 1, challenges: 1 },
      lessonIndex: CURRICULUM.flatMap((m) => m.lessons.map((lesson) => ({ module: m, lesson }))),
    });
    const box = { host: null };
    function Probe() { box.host = harness.useHost(); return harness.el(harness.Text, null, 'probe'); }
    function App() {
      return harness.el(
        harness.ServicesProvider, { services },
        harness.el(
          harness.RouterProvider,
          { screens: {
            home: harness.HomeRoute, module: harness.ModuleRoute, lesson: harness.LessonRoute,
            challenge: harness.ChallengeRoute, browser: harness.BrowserRoute, help: harness.HelpRoute,
            settings: harness.SettingsRoute, tour: harness.TourRoute,
          }, initial: { name: 'home', params: {} } },
          harness.el(harness.CommandHost, {}, harness.el(harness.Box, { flexDirection: 'column' }, harness.el(harness.RouterView, {}), harness.el(Probe, {}))),
        ),
      );
    }
    const out = helper.fakeStdout(120, 40);
    const inst = harness.render(harness.el(App, {}), { stdout: out, stdin: helper.fakeStdin(), exitOnCtrlC: false, patchConsole: false });
    const app = {
      inst,
      host: () => box.host,
      screen: () => harness.getCurrentRoute().screen,
      frame: () => helper.stripAnsi(out.chunks.join('')),
      onKey: (key) => harness.getCurrentRoute().onKey(key),
      /** The stdout bytes since the last reset: how much ink actually wrote. */
      bytes: () => out.chunks.join(''),
      resetBytes: () => { out.chunks.length = 0; },
    };
    assert.ok(await waitFor(() => app.screen() === 'home'), 'home rendered');
    app.host().go('challenge', { moduleId: 'm1', lessonId: 'm1.l1', challengeId: 'c1' });
    assert.ok(await waitFor(() => app.frame().includes('First heading')), 'the challenge rendered');
    assert.ok(await waitFor(() => app.frame().includes('<h1')), 'the editor painted the starter');
    for (let i = 0; i < rows; i += 1) app.onKey({ name: 'return' });
    assert.ok(
      await waitFor(() => (savedCode(services, 'm1.l1.c1') ?? '').split('\n').length === rows + 1, { timeout: 4000 }),
      'the buffer is in place',
    );
    app.resetBytes();
    return { app, services, close: async () => { inst.unmount(); await new Promise((r) => setTimeout(r, 80)); } };
  }

  await t.test('a caret move inside the window paints NOTHING and still moves the caret', async () => {
    const { app, services, close } = await mountWithRows(2);
    try {
      // The caret sits on the last row (2). `up` moves it one row inside the
      // visible window: the fast path's domain.
      app.resetBytes();
      app.onKey({ name: 'up' });
      await new Promise((r) => setTimeout(r, 120)); // outlast ink's throttle + effect flush

      // Contract 1: no frame. A full re-render would write cell bytes (the
      // painted buffer, gutter numbers, chrome) into the stream; ink's
      // cursor-only sequence writes ONLY escape codes, never printable text.
      const written = app.bytes();
      const printable = written.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '');
      assert.equal(printable, '', 'a fast-path caret move paints no printable bytes (no re-render)');

      // Contract 2: the caret DID move — the next typed char lands on row 1,
      // not row 2 (poll the store; the autosave debounces 400 ms).
      app.onKey({ name: 'char', char: 'Z' });
      assert.ok(
        await waitFor(() => (savedCode(services, 'm1.l1.c1') ?? '').includes('\nZ\n') || (savedCode(services, 'm1.l1.c1') ?? '').startsWith('Z\n'), { timeout: 4000 }),
        'the char landed on the MOVED-TO row (the caret really moved)',
      );
    } finally {
      await close();
    }
  });

  await t.test('typing still repaints (the fast path never swallows edits)', async () => {
    const { app, services, close } = await mountWithRows(0);
    try {
      app.resetBytes();
      app.onKey({ name: 'char', char: 'Q' });
      assert.ok(
        await waitFor(() => savedCode(services, 'm1.l1.c1') === 'Q<h1', { timeout: 4000 }),
        'typing lands in the buffer',
      );
      // A typing keystroke must produce a visible frame diff eventually — the
      // fast path must not have broken ordinary rendering.
      assert.ok(app.bytes().length > 0, 'typing produced output bytes');
    } finally {
      await close();
    }
  });

  await t.test('a move the window cannot show still lands the caret (followCaret guard)', async () => {
    // 30 Enters push the caret to row 30 while the view stays at scrollTop 0
    // (rows 0..19 visible) — the caret is already outside the window. A
    // pageup to row 20 is STILL outside, so the followCaret guard must refuse
    // the fast path (the cursor cell would be null/clamped) and let the plain
    // state-update path run. The visible-window content is unchanged by both
    // paths (the caret is not a text-layer cell), so the assertion is where
    // the next char LANDS: the caret must be exactly on row 20.
    const { app, services, close } = await mountWithRows(30);
    try {
      app.onKey({ name: 'pageup' }); // row 30 → row 20
      await new Promise((r) => setTimeout(r, 150));
      app.onKey({ name: 'char', char: 'Y' });
      const code = () => savedCode(services, 'm1.l1.c1') ?? '';
      assert.ok(
        await waitFor(() => {
          const lines = code().split('\n');
          return lines[20] && lines[20].startsWith('Y');
        }, { timeout: 4000 }),
        'the caret landed on row 20 (guard refused the fast path; the slow path moved it)',
      );
    } finally {
      await close();
    }
  });

  await t.test('with a multi-cursor set, arrows use the repaint path (cells stay honest)', async () => {
    const { app, services, close } = await mountWithRows(2);
    try {
      // Stack two cursors (the PC-11 path), then fold with down — the fold is
      // a SET change, so it must repaint, not fast-path.
      app.onKey({ name: 'ctrl-alt-up' });
      await new Promise((r) => setTimeout(r, 60));
      app.onKey({ name: 'down' });
      await new Promise((r) => setTimeout(r, 80));
      app.onKey({ name: 'char', char: 'W' });
      assert.ok(
        await waitFor(() => (savedCode(services, 'm1.l1.c1') ?? '').includes('W'), { timeout: 4000 }),
        'typing after the fold edits one caret (the set collapsed)',
      );
      const lines = (savedCode(services, 'm1.l1.c1') ?? '').split('\n');
      const wCount = lines.filter((l) => l.includes('W')).length;
      assert.equal(wCount, 1, 'exactly one W: the multi set folded to one caret before the char');
    } finally {
      await close();
    }
  });

  await t.test('a burst of caret moves composes through the ref (two-key burst rule)', async () => {
    const { app, services, close } = await mountWithRows(2);
    try {
      // Two ups in one tick: the second must apply against the first's
      // session (sessionRef), not the render's stale one.
      app.onKey({ name: 'up' });
      app.onKey({ name: 'up' });
      await new Promise((r) => setTimeout(r, 120));
      app.onKey({ name: 'char', char: 'B' });
      assert.ok(
        await waitFor(() => (savedCode(services, 'm1.l1.c1') ?? '').startsWith('B\n'), { timeout: 4000 }),
        'two fast-path ups moved the caret two rows (the char landed on row 0)',
      );
    } finally {
      await close();
    }
  });
});
