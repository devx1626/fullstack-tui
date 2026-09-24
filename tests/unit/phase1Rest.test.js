/**
 * Phase 1 remainder tests: the settings screen (task 1.4), the welcome tour
 * (task 1.6), and the shared preference/split math task 1.2 persists.
 * Run: node --test tests/unit/phase1Rest.test.js  (needs dist/harness.js)
 *
 * Structure note: subtests are declared with `await t.test(...)` inside one
 * parent — flat tests registered after a top-level await can be dropped by the
 * runner's collection race (see CONTRIBUTING).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { waitFor } from '../helpers/snapshot.js';

const ROOT = process.cwd();
const TMP = path.join(ROOT, '.data', 'phase1-rest');

const CURRICULUM = [
  {
    id: '01-html', badge: 'HT', title: 'HTML', tagline: 'structure', hours: 6,
    source: { course: 'c', url: 'u', roadmap: 'r', docs: 'd' },
    lessons: [{ id: '01-html.l1', title: 'Skeleton', minutes: 10, challenges: [{ id: 'c1', kind: 'debug' }] }],
  },
];

test('phase 1: settings, tour and pane persistence', async (t) => {
  const harnessPath = new URL('../../dist/harness.js', import.meta.url).pathname;
  const harness = existsSync(harnessPath) ? await import(pathToFileURL(harnessPath).href) : null;
  const helper = await import(pathToFileURL(new URL('../helpers/snapshot.js', import.meta.url).pathname));
  if (!harness) {
    t.skip('needs built harness (npm run build)');
    return;
  }
  const { Store } = await import('../../src/core/store.js');
  const { Settings } = await import('../../src/ui/settings.js');
  const strip = helper.stripAnsi;

  /** A Settings instance backed by a throwaway file (never the real one). */
  const tempSettings = (name) => {
    const dir = path.join(TMP, name);
    rmSync(dir, { recursive: true, force: true });
    return new Settings(path.join(dir, 'settings.json'));
  };

  function fakeStore() {
    return {
      isPassed: () => false,
      isLessonRead: () => false,
      markLessonRead: () => {},
      getLessonScroll: () => 0,
      setLessonScroll: () => {},
      projectRecord: () => ({ checks: {}, notes: '' }),
      projectProgress: () => 0,
      todayMinutes: () => 0,
      weekMinutes: () => 0,
      activity: () => [],
      stats: () => ({ totals: { challenges: 1, challengesPassed: 0, debug: 1, debugPassed: 0, write: 0, writePassed: 0 }, perModule: [], streak: { current: 0, best: 0 } }),
      data: { challenges: {} },
    };
  }

  /** Mount the real route tree (router + CommandHost) with fake services. */
  function mountApp(services, { initial = { name: 'home', params: {} }, onQuit = () => {} } = {}) {
    const box = { host: null };
    function Probe() {
      box.host = harness.useHost();
      return harness.el(harness.Text, null, 'probe');
    }
    const tree = harness.el(
      harness.ServicesProvider,
      { services },
      harness.el(
        harness.RouterProvider,
        {
          screens: {
            home: harness.HomeRoute,
            settings: harness.SettingsRoute,
            tour: harness.TourRoute,
          },
          initial,
        },
        harness.el(
          harness.CommandHost,
          { onQuit },
          harness.el(harness.Box, { flexDirection: 'column' }, harness.el(harness.RouterView, {}), harness.el(Probe, {})),
        ),
      ),
    );
    const out = helper.fakeStdout(120, 60);
    const inst = harness.render(tree, { stdout: out, stdin: helper.fakeStdin(), exitOnCtrlC: false, patchConsole: false });
    return {
      inst,
      host: () => box.host,
      screen: () => harness.getCurrentRoute().screen,
      frame: () => strip(out.chunks.join('')),
      onKey: (key) => harness.getCurrentRoute().onKey(key),
    };
  }

  const servicesFor = (settings) => harness.createServices({
    store: fakeStore(),
    curriculum: CURRICULUM,
    settings,
    overall: { modules: 1, challenges: 1 },
    lessonIndex: [],
  });

  await t.test('shared preference rows and toggles (one source for both UIs)', () => {
    const written = [];
    const settings = { data: {}, save: () => written.push(1) };

    const rows = harness.preferenceRows({ settings, env: { HOME: '/home/me' }, workspace: '/home/me/ws' });
    assert.deepEqual(rows.map((r) => r.key), ['theme', 'icons', 'sound', 'wrap', 'tabSize', 'workspace', 'editor']);
    assert.equal(rows.find((r) => r.key === 'workspace').value, '~/ws', 'HOME is shortened for display');
    assert.equal(rows.find((r) => r.key === 'theme').toggleable, true, 'the theme picker is a toggle row');
    assert.equal(rows.find((r) => r.key === 'workspace').toggleable, false, 'environment rows are not toggles');
    assert.equal(harness.vimPreferenceRow({ settings }).key, 'vimMode', 'the next UI adds the vim row');

    // Space on a row acts on its KEY, and every toggle saves.
    assert.equal(harness.togglePreference(settings, 'sound').changed, true);
    assert.equal(settings.data.sound, 'off');
    assert.equal(harness.togglePreference(settings, 'wrap').changed, true);
    assert.equal(settings.data.editor.wrap, true);
    assert.equal(harness.togglePreference(settings, 'tabSize').changed, true);
    assert.equal(settings.data.editor.tabSize, 4, '2 → 4');
    assert.equal(harness.togglePreference(settings, 'tabSize').changed, true);
    assert.equal(settings.data.editor.tabSize, 8, '4 → 8');
    assert.equal(harness.togglePreference(settings, 'tabSize').changed, true);
    assert.equal(settings.data.editor.tabSize, 2, '8 wraps to 2');
    assert.equal(harness.togglePreference(settings, 'vimMode').changed, true);
    assert.equal(settings.data.editor.vimMode, false);
    // Theme cycles through the curated set and persists (Phase 4 picker).
    const themeToggle = harness.togglePreference(settings, 'theme');
    assert.equal(themeToggle.changed, true, 'theme is a picker row');
    assert.equal(settings.data.theme, 'midnight', 'unset (Auto) cycles to the first palette');
    assert.equal(themeToggle.theme, 'midnight');

    assert.ok(written.length >= 6, 'each toggle persists');
    assert.equal(harness.clampTabSize(99), 8, 'a hand-edited width is clamped');
    assert.equal(harness.clampTabSize('nope'), 2, 'garbage falls back to 2');
  });

  await t.test('settings screen renders the rows with the focused one marked', async () => {
    const settings = { data: { sound: 'off', editor: { tabSize: 4 } }, save: () => {} };
    const rows = [...harness.preferenceRows({ settings }), harness.vimPreferenceRow({ settings })];
    const { lines, cursorLine } = harness.settingsLayout({ rows, cursor: 2, width: 100 });
    assert.equal(lines[cursorLine].props.children[1], '▸', 'the focused row carries the marker');
    assert.equal(harness.rowMarker(rows[0], false), '·', 'the theme picker row carries the toggle marker');
    assert.equal(harness.rowMarker(rows.find((r) => r.key === 'workspace'), false), ' ', 'environment rows have no marker');

    const text = strip(await helper.renderToText(
      harness.el(harness.SettingsScreen, { rows, cursor: 2, width: 100, height: 40 }),
      { render: harness.render, columns: 120, rows: 60 },
    ));
    assert.ok(text.includes('Preferences'), 'header missing');
    assert.ok(text.includes('Soft wrap'), 'a shared row is missing');
    assert.ok(text.includes('On  (Space to toggle)'), 'the row value reflects the setting');
    assert.ok(text.includes('Vim keys'), 'the next-UI-only row is missing');
    assert.ok(text.includes('Off  (Space to toggle)'), 'sound off comes from the same data');
  });

  await t.test('settings route: s opens it and Space toggles through the real host', async () => {
    const settings = tempSettings('settings-route');
    const app = mountApp(servicesFor(settings));
    try {
      assert.ok(await waitFor(() => app.screen() === 'home'), 'starts on the dashboard');

      app.onKey({ name: 'char', char: 's' });
      assert.ok(await waitFor(() => app.screen() === 'settings'), 's opens the settings screen');

      // Walk to the Tab size row by KEY (never a magic index) and press Space.
      const rows = [...harness.preferenceRows({ settings }), harness.vimPreferenceRow({ settings })];
      const tabRow = rows.findIndex((r) => r.key === 'tabSize');
      for (let i = 0; i < tabRow; i += 1) {
        app.onKey({ name: 'down' });
        await waitFor(() => app.host().cursor === i + 1);
      }
      settings.data.editor.tabSize = 2;
      app.onKey({ name: 'space' });
      assert.ok(await waitFor(() => settings.data.editor.tabSize === 4), 'Space cycles the indent width');
      assert.ok(await waitFor(() => app.frame().includes('Indent is now 4 spaces')), 'the host reports the toggle');

      // The cursor is clamped to the row list, like the classic screen. Keys are
      // fed one per committed render: the route keeps its cursor in React state,
      // and the dispatcher delivers one event per tick (see routes.test.js).
      for (let guard = 0; guard < rows.length + 5 && app.host().cursor < rows.length - 1; guard += 1) {
        const before = app.host().cursor;
        app.onKey({ name: 'down' });
        await waitFor(() => app.host().cursor === Math.min(before + 1, rows.length - 1));
      }
      assert.equal(app.host().cursor, rows.length - 1, 'the cursor cannot leave the rows');
    } finally {
      app.inst.unmount();
      harness.clearRoute();
    }
  });

  await t.test('tour steps degrade by tier and the machine finishes on the last step', () => {
    const full = harness.tourSteps({ tier: 'A' });
    assert.equal(full.length, 5, 'five steps on a full terminal');
    assert.deepEqual(full.map((s) => s.id), ['welcome', 'screen', 'keys', 'sandbox', 'mouse']);
    assert.equal(harness.tourSteps({ tier: 'D' }).length, 4, 'no mouse step without a mouse');
    assert.ok(!harness.tourSteps({ tier: 'D' }).some((s) => s.id === 'mouse'));
    assert.equal(harness.SANDBOX_SAMPLE.join('\n').includes('<h1>'), true, 'the sandbox ships a sample buffer');

    let state = { index: 0, done: false };
    for (let i = 0; i < 4; i += 1) {
      state = harness.tourReducer(state, { type: 'next' }, 5);
      assert.equal(state.done, false, `step ${i} must not finish early`);
    }
    assert.equal(state.index, 4);
    state = harness.tourReducer(state, { type: 'next' }, 5);
    assert.equal(state.done, true, 'the last step finishes the tour');
    assert.equal(harness.tourReducer({ index: 2 }, { type: 'skip' }, 5).done, true, 'skip finishes from anywhere');
  });

  await t.test('first launch opens the tour: Enter finishes it and stamps onboardedAt', async () => {
    const settings = tempSettings('tour-finish');
    assert.equal(settings.data.onboardedAt, null, 'a fresh settings file is not onboarded');
    const app = mountApp(servicesFor(settings), { initial: { name: 'tour', params: {} } });
    try {
      assert.ok(await waitFor(() => app.screen() === 'tour'), 'boots into the tour');
      assert.ok(await waitFor(() => app.frame().includes('Welcome tour')), 'the tour renders');

      // The route picks its own step list from the detected tier (tiers C/D
      // drop the mouse step), so the walk is driven from the same list rather
      // than a hard-coded five. Keys go one per tick: the route keeps its step
      // in React state and the real dispatcher delivers one event at a time.
      const { detectCapabilities } = await import('../../src/ui/capabilities.js');
      const steps = harness.tourSteps({ tier: detectCapabilities().tier });
      const ids = steps.map((s) => s.id);
      const sandboxAt = ids.indexOf('sandbox');
      // Tiers C/D drop the mouse step, so the sandbox can be the LAST step of
      // the walk (that is what this environment reports) — the loop below must
      // not assume a step after it.
      assert.ok(sandboxAt > 0, `a walkable tour (${ids.join(', ')})`);
      const tick = () => new Promise((r) => { setTimeout(r, 50); });

      for (let i = 0; i < sandboxAt; i += 1) {
        app.onKey({ name: 'enter' });
        await tick();
      }
      // Newly introduced lines really are written, so this is a content check.
      assert.ok(await waitFor(() => app.frame().includes('scratch buffer')), 'Enter walks to the sandbox step');

      for (let i = sandboxAt; i < ids.length - 1; i += 1) {
        app.onKey({ name: 'enter' });
        await tick();
      }
      app.onKey({ name: 'enter' }); // the last step finishes the tour
      assert.ok(await waitFor(() => app.screen() === 'home'), 'finishing lands on the dashboard');
      assert.ok(settings.data.onboardedAt, 'finishing stamps onboardedAt');
      assert.equal(await waitFor(() => settings.load().onboardedAt != null), true, 'the stamp is persisted to disk');
    } finally {
      app.inst.unmount();
      harness.clearRoute();
    }
  });

  await t.test('Esc skips the tour (marks onboarded) and v switches to simple keys', async () => {
    const settings = tempSettings('tour-skip');
    const app = mountApp(servicesFor(settings), { initial: { name: 'tour', params: {} } });
    try {
      assert.ok(await waitFor(() => app.screen() === 'tour'), 'boots into the tour');

      // v persists the beginner choice: the same preference settings.vimToggle
      // flips, written straight to .data/settings.json.
      app.onKey({ name: 'char', char: 'v' });
      assert.ok(await waitFor(() => settings.data.editor.vimMode === false), 'v switches to modeless keys');
      assert.ok(await waitFor(() => app.frame().includes('simple (no modes)')), 'the screen reports the choice');

      // Esc is the global app.back; on the tour that is skip (spec §9).
      app.onKey({ name: 'escape' });
      assert.ok(await waitFor(() => app.screen() === 'home'), 'skipping lands on the dashboard');
      assert.ok(settings.data.onboardedAt, 'skipping marks the tour as done');
      assert.equal(settings.data.editor.vimMode, false, 'the modeless choice survives the skip');
    } finally {
      app.inst.unmount();
      harness.clearRoute();
    }
  });

  await t.test('pane ratios: clamp math, per-screen persistence and reset', () => {
    // Pure math (task 1.2): columns and ratios are different units.
    assert.equal(harness.clampRatio(0.02), harness.MIN_RATIO, 'below the minimum clamps up');
    assert.equal(harness.clampRatio(0.99), harness.MAX_RATIO, 'above the maximum clamps down');
    assert.equal(harness.clampRatio('nope'), harness.MIN_RATIO, 'garbage falls back');
    assert.equal(Number(harness.nudgeRatio(0.42).toFixed(2)), 0.47, 'a nudge steps by 0.05');
    assert.equal(harness.ratioToColumns(0.5, 100, 20, 24), 50);
    assert.equal(harness.ratioToColumns(0.01, 100, 20, 24), 20, 'the min width still applies');
    assert.equal(harness.columnsToRatio(50, 100), 0.5, 'a drag stores the same unit as a nudge');

    const settings = tempSettings('panes');
    assert.equal(settings.paneRatio('challenge', 'brief', 0.42), 0.42, 'nothing remembered → the default');
    settings.setPaneRatio('challenge', 'brief', 0.5);
    settings.setPaneRatio('browser', 'render', 0.6);
    assert.equal(settings.paneRatio('challenge', 'brief', 0.42), 0.5);
    assert.equal(settings.paneRatio('browser', 'render', 0.42), 0.6, 'each screen keeps its own ratio');
    assert.equal(settings.paneRatio('stats', 'body', 0.42), 0.42, 'an unset screen falls back');

    // Round-trips through the file, like a restart.
    const reopened = new Settings(settings.file);
    assert.equal(reopened.paneRatio('challenge', 'brief', 0.42), 0.5, 'the ratio survives a reload');

    reopened.resetPanes('challenge');
    assert.equal(reopened.paneRatio('challenge', 'brief', 0.42), 0.42, 'reset drops the remembered ratio');
    assert.equal(reopened.paneRatio('browser', 'render', 0.42), 0.6, 'reset is per screen');
  });

  await t.test('settings merge tolerates a hand-edited panes value', async () => {
    const { mkdirSync, writeFileSync, readFileSync } = await import('node:fs');
    const dir = path.join(TMP, 'panes-merge');
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'settings.json');
    writeFileSync(file, JSON.stringify({ panes: { challenge: { brief: 0.3 }, broken: 'nope' }, custom: 7 }));
    const settings = new Settings(file);
    assert.equal(settings.paneRatio('challenge', 'brief', 0.42), 0.3, 'a saved ratio loads');
    assert.equal(settings.paneRatio('broken', 'brief', 0.42), 0.42, 'a non-object screen entry is ignored');
    assert.equal(settings.data.custom, 7, 'unknown top-level keys survive');
    settings.setPaneRatio('stats', 'body', 0.5);
    const onDisk = JSON.parse(readFileSync(file, 'utf8'));
    assert.equal(onDisk.panes.stats.body, 0.5);
    assert.equal(onDisk.panes.challenge.brief, 0.3, 'other screens are preserved');
  });

  rmSync(TMP, { recursive: true, force: true });
});
