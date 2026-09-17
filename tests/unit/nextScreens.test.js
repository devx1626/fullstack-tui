/**
 * Phase 1 port tests: help/resources/workspace/stats screens, the command
 * palette, and the shared scroll/wrap helpers.
 * Run: node --test tests/unit/nextScreens.test.js  (needs dist/harness.js)
 *
 * Subtests are declared with `await t.test(...)` inside one parent test — flat
 * tests registered after a top-level await can be dropped by the runner's
 * collection race (see CONTRIBUTING, "Structure note").
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const CURRICULUM = [
  {
    id: '01-html', badge: 'HT', title: 'HTML', tagline: 'structure', hours: 6,
    source: { course: 'HTML course', url: 'https://example.test/html', roadmap: 'https://example.test/rm', docs: 'https://example.test/docs' },
    lessons: [
      { id: '01-html.l1', title: 'Skeleton', minutes: 10, resources: [{ label: 'MDN' }], challenges: [{ id: 'c1', kind: 'debug' }, { id: 'c2', kind: 'write' }] },
    ],
  },
  {
    id: '02-js', badge: 'JS', title: 'JavaScript', tagline: 'behavior', hours: 8,
    source: { course: 'JS course', url: 'https://example.test/js', roadmap: 'r', docs: 'd' },
    lessons: [{ id: '02-js.l1', title: 'Values', minutes: 12, challenges: [{ id: 'c1', kind: 'write' }] }],
  },
];

function fakeStore({ passed = [] } = {}) {
  return {
    isPassed: (id) => passed.includes(id),
    todayMinutes: () => 25,
    weekMinutes: () => 210,
    activity: () => [0, 3, 7, 1, 12, 4, 9, 2],
    data: {
      challenges: {
        '01-html.l1.c1': { passed: true, solvedAt: '2026-09-10T10:00:00.000Z', attempts: 4, hintsUsed: 2 },
        '02-js.l1.c1': { passed: true, solvedAt: '2026-09-12T10:00:00.000Z', attempts: 1, hintsUsed: 0 },
      },
    },
  };
}

test('phase 1 screens + palette', async (t) => {
  const harnessPath = new URL('../../dist/harness.js', import.meta.url).pathname;
  const harness = existsSync(harnessPath) ? await import(pathToFileURL(harnessPath).href) : null;
  const helper = await import(pathToFileURL(new URL('../helpers/snapshot.js', import.meta.url).pathname));
  if (!harness) {
    t.skip('needs built harness (npm run build -- --spike)');
    return;
  }
  // Wide/tall fake terminal: ink wraps to stdout.columns, and the long screens
  // (help, stats) would otherwise break a line mid-assertion.
  const renderToText = (el, opts = {}) => helper.renderToText(el, {
    render: harness.render, columns: 120, rows: 200, ...opts,
  });
  const strip = helper.stripAnsi;

  await t.test('clampScroll keeps the window inside the content', () => {
    assert.equal(harness.clampScroll(0, 100, 10), 0);
    assert.equal(harness.clampScroll(5, 100, 10), 5);
    assert.equal(harness.clampScroll(95, 100, 10), 90, 'never scrolls past the last page');
    assert.equal(harness.clampScroll(999, 8, 10), 0, 'content shorter than the window');
    assert.equal(harness.clampScroll(-4, 100, 10), 0, 'never negative');
    assert.equal(harness.clampScroll(3, 0, 0), 0, 'degenerate height');
  });

  await t.test('wrapText wraps on words and hard-breaks long words', () => {
    assert.deepEqual(harness.wrapText('one two three', 7), ['one two', 'three']);
    assert.deepEqual(harness.wrapText('abcdefgh ij', 4), ['abcd', 'efgh', 'ij']);
    assert.deepEqual(harness.wrapText('x', 10, '  '), ['  x'], 'indent is applied');
    assert.deepEqual(harness.wrapText('', 10), ['']);
  });

  await t.test('sparkline draws one block per sample and clamps the max', () => {
    const s = harness.sparkline([0, 5, 10]);
    assert.equal(s.length, 3);
    assert.equal(s[0], '▁', 'zero is the baseline glyph');
    assert.equal(s[2], '█', 'the max sample is full height');
    assert.ok(harness.sparkline([]).length > 0, 'empty series still renders a baseline');
  });

  await t.test('buildPaletteItems offers commands, screens, modules and lessons', () => {
    const items = harness.buildPaletteItems({
      screen: 'home',
      curriculum: CURRICULUM,
      screens: harness.SCREEN_TARGETS,
    });
    const ids = items.map((i) => i.id);
    assert.ok(ids.includes('cmd:home.openModule'), 'screen command listed');
    assert.ok(ids.includes('cmd:app.quit'), 'global command listed');
    assert.ok(!ids.includes('cmd:challenge.check'), 'another screen\'s command is not listed');
    assert.ok(ids.includes('go:screen:stats'), 'ported screen offered');
    assert.ok(ids.includes('go:module:01-html'), 'module offered');
    assert.ok(ids.includes('go:lesson:01-html.l1'), 'lesson offered');
    const openModule = items.find((i) => i.id === 'cmd:home.openModule');
    assert.equal(openModule.keys, 'cr', 'the row shows its display binding');
  });

  await t.test('recentItems resolves stored ids and drops dead ones', () => {
    const items = harness.buildPaletteItems({ screen: 'home', curriculum: CURRICULUM });
    const recents = harness.recentItems(items, ['cmd:app.quit', 'go:gone', 'cmd:home.openModule']);
    assert.deepEqual(recents.map((r) => r.id), ['cmd:app.quit', 'cmd:home.openModule']);
  });

  await t.test('help screen renders every section from core/help.js', async () => {
    const text = strip(await renderToText(harness.el(harness.HelpScreen, { cursor: 0, height: 200, width: 100 })));
    for (const title of ['Keyboard', 'Inside a challenge', 'Inside the editor', 'Inside the built-in browser', 'Inside a lesson', 'How this works']) {
      assert.ok(text.includes(title), `help section missing: ${title}`);
    }
    assert.ok(text.includes('Ctrl+K'), 'the palette key is documented');
    assert.ok(text.includes('command palette'), 'the palette is described');
  });

  await t.test('resources screen lists modules and their sources', async () => {
    const text = strip(await renderToText(harness.el(harness.ResourcesScreen, {
      curriculum: CURRICULUM, overall: { hours: 120 }, height: 60, width: 100,
    })));
    assert.ok(text.includes('Primary sources'), 'sources section missing');
    assert.ok(text.includes('Dave Gray'), 'primary source missing');
    assert.ok(text.includes('HTML course'), 'module course missing');
    assert.ok(text.includes('https://example.test/js'), 'module url missing');
    assert.ok(text.includes('Tools worth installing'), 'tools section missing');
  });

  await t.test('workspace screen renders injected files and the empty state', async () => {
    const full = strip(await renderToText(harness.el(harness.WorkspaceScreen, {
      files: ['01-html/l1/c1.html', '01-html/l1/c2.css', 'root.md'], root: '/tmp/ws', height: 40, width: 100,
    })));
    assert.ok(full.includes('3 artefacts'), 'file count missing');
    assert.ok(full.includes('c1.html'), 'file missing');
    assert.ok(full.includes('01-html/l1'), 'folder grouping missing');

    const empty = strip(await renderToText(harness.el(harness.WorkspaceScreen, {
      files: [], root: '/tmp/ws', height: 20, width: 100,
    })));
    assert.ok(empty.includes('Empty so far'), 'empty state missing');
  });

  await t.test('stats screen shows totals, modules and wrong-turn counts', async () => {
    const store = fakeStore({ passed: ['01-html.l1.c1'] });
    const stats = {
      totals: { challenges: 3, challengesPassed: 1, debug: 1, debugPassed: 1, write: 2, writePassed: 0 },
      perModule: [
        { id: '01-html', challenges: 2, challengesPassed: 1, percent: 50, lessonsRead: 1, lessons: 1 },
        { id: '02-js', challenges: 1, challengesPassed: 0, percent: 0, lessonsRead: 0, lessons: 1 },
      ],
      streak: { current: 3, best: 9 },
    };
    const text = strip(await renderToText(harness.el(harness.StatsScreen, {
      stats, overall: {}, store, curriculum: CURRICULUM, height: 60,
    })));
    assert.ok(text.includes('1/3 challenges'), 'totals missing');
    assert.ok(text.includes('33%'), 'percent missing');
    assert.ok(text.includes('day streak'), 'streak missing');
    assert.ok(text.includes('HTML'), 'module row missing');
    assert.ok(text.includes('Recently solved'), 'recent list missing');
    assert.ok(text.includes('wrong turns: 3'), 'wrong-turn count missing (4 attempts - 1)');
    assert.ok(text.includes('hints: 2'), 'hints count missing');
  });

  await t.test('palette screen renders the rows it is given', async () => {
    const items = harness.buildPaletteItems({ screen: 'home', curriculum: CURRICULUM, screens: harness.SCREEN_TARGETS });
    const text = strip(await renderToText(harness.el(harness.PaletteScreen, {
      items, query: '', selected: 0, height: 20,
    })));
    assert.ok(text.includes('Command palette'), 'palette title missing');
    assert.ok(text.includes('Open module'), 'command row missing');
  });

  await t.test('paletteMatches: recents float first on an empty query, filter otherwise', () => {
    const items = harness.buildPaletteItems({ screen: 'home', curriculum: CURRICULUM });
    const quit = items.find((i) => i.id === 'cmd:app.quit');
    const withRecents = harness.paletteMatches(items, [quit], '');
    assert.equal(withRecents[0].id, 'cmd:app.quit', 'recent is first on an empty query');
    const filtered = harness.paletteMatches(items, [quit], 'module');
    assert.ok(filtered.length > 0 && filtered.length < items.length, 'query narrows the list');
    assert.ok(filtered.every((i) => /module/i.test(i.title) || /module/i.test(i.id)), 'only matches survive');
  });

  await t.test('the palette is reachable: Ctrl+K is the binding (§10.4 move off Ctrl+P)', async () => {
    // Registry-level guarantee, read from the source module (pure, no React).
    const { COMMANDS } = await import('../../src/ui/commands.js');
    const palette = COMMANDS.find((c) => c.id === 'app.palette');
    assert.ok(palette, 'app.palette must exist');
    assert.ok(palette.keys.default.includes('<C-k>'), 'app.palette must be bound to Ctrl+K');
    assert.ok(!palette.keys.default.includes('<C-p>'), 'Ctrl+P must be free for preview');
  });

  await t.test('paletteKey: typing, editing, moving, running and cancelling', () => {
    const key = harness.paletteKey;
    assert.deepEqual(key({ query: '', selected: 0, count: 5 }, { name: 'char', char: 'c' }), { query: 'c', selected: 0, action: null });
    assert.deepEqual(key({ query: 'ca', selected: 3, count: 5 }, { name: 'char', char: 't' }), { query: 'cat', selected: 0, action: null }, 'typing resets the selection');
    assert.equal(key({ query: 'cat', selected: 2, count: 5 }, { name: 'backspace' }).query, 'ca');
    assert.equal(key({ query: 'c', selected: 1, count: 5 }, { name: 'down' }).selected, 2);
    assert.equal(key({ query: 'c', selected: 4, count: 5 }, { name: 'down' }).selected, 4, 'selection clamps at the end');
    assert.equal(key({ query: 'c', selected: 0, count: 5 }, { name: 'up' }).selected, 0, 'and at the top');
    assert.equal(key({ query: 'c', selected: 0, count: 0 }, { name: 'down' }).selected, 0, 'empty list never moves');
    assert.equal(key({ query: 'c', selected: 0, count: 5 }, { name: 'enter' }).action, 'run');
    assert.equal(key({ query: 'c', selected: 0, count: 5 }, { name: 'escape' }).action, 'cancel');
    assert.equal(key({ query: 'c', selected: 0, count: 5 }, { name: 'f5' }).action, null, 'unknown keys are swallowed, not acted on');
  });

  await t.test('dispatchToScreen addresses the focused screen by command id', () => {
    const seen = [];
    harness.setCurrentRoute({ screen: 'home', onCommand: (id) => seen.push(id) });
    try {
      assert.equal(harness.dispatchToScreen('challenge.check'), true);
      assert.deepEqual(seen, ['challenge.check'], 'the palette can run a screen-scoped id');
    } finally {
      harness.clearRoute();
    }
    assert.equal(harness.dispatchToScreen('challenge.check'), false, 'no screen focused → false');
  });

  await t.test('Ctrl+K opens the palette overlay and a pick navigates there', async () => {
    const store = fakeStore({ passed: [] });
    store.stats = () => ({
      totals: { challenges: 3, challengesPassed: 0, debug: 1, debugPassed: 0, write: 2, writePassed: 0 },
      perModule: [],
      streak: { current: 0, best: 0 },
    });
    const settings = { data: { palette: { recent: [] } }, bannerVisible: () => false, pushRecent: () => {} };
    const services = harness.createServices({
      store, curriculum: CURRICULUM, settings,
      overall: { modules: 2, challenges: 3 }, lessonIndex: [],
    });
    const tree = harness.el(
      harness.ServicesProvider,
      { services },
      harness.el(harness.AppRoot, {
        screens: { home: harness.HomeRoute, help: harness.HelpRoute },
        onQuit: () => {},
      }),
    );
    const out = helper.fakeStdout(120, 60);
    const inst = harness.render(tree, { stdout: out, exitOnCtrlC: false, patchConsole: false });
    // A single fixed sleep races the renderer under load; wait for the state we
    // are about to assert instead.
    const waitFor = async (predicate, label) => {
      for (let i = 0; i < 100; i += 1) {
        if (predicate()) return true;
        await new Promise((r) => { setTimeout(r, 10); });
      }
      throw new Error(`timed out waiting for ${label}`);
    };
    try {
      await waitFor(() => harness.getCurrentRoute().screen === 'home', 'the home screen');

      // Ctrl+K goes through the dispatcher's global pass to the host.
      const sink = harness.getGlobalCommandSink();
      assert.equal(typeof sink, 'function', 'the host must publish a global command sink');
      sink('app.palette');
      await waitFor(() => harness.hasOverlays(), 'the palette overlay');

      // The overlay consumes keys (so the screen underneath never sees them).
      assert.equal(harness.routeToOverlays({ name: 'char', char: 'h' }), true, 'the palette consumes typed input');
      for (const ch of 'elp') harness.routeToOverlays({ name: 'char', char: ch });
      assert.equal(harness.routeToOverlays({ name: 'enter' }), true, 'the palette consumes Enter');

      await waitFor(() => !harness.hasOverlays(), 'the palette to close after running an item');
      await waitFor(() => harness.getCurrentRoute().screen === 'help', 'the help screen to be focused');
    } finally {
      inst.unmount();
      harness._resetOverlays();
      harness.clearRoute();
    }
  });

  await t.test('scroll movement uses the shared nav helper', () => {
    assert.equal(harness.nextIndex(0, 'nav.up', 1e6), 0, 'up at the top stays put');
    assert.equal(harness.nextIndex(0, 'nav.down', 1e6), 1);
    assert.equal(harness.nextIndex(5, 'nav.pageUp', 1e6), 0);
    assert.equal(harness.nextIndex(0, 'nav.pageDown', 1e6), 10);
    assert.equal(harness.nextIndex(0, 'nav.first', 1e6), 0);
    assert.equal(harness.nextIndex(7, 'nav.last', 1e6), 1e6 - 1);
  });

  await t.test('classic UI accepts Ctrl+K too, so the shared help text is true', async () => {
    const path = await import('node:path');
    const fs = await import('node:fs');
    const { App } = await import('../../src/app.js');
    const { darkTheme } = await import('../../src/tui/ansi.js');
    const { Store } = await import('../../src/core/store.js');
    const { Settings } = await import('../../src/ui/settings.js');

    const dir = path.join(process.cwd(), '.data', 'check-ck');
    fs.rmSync(dir, { recursive: true, force: true });
    try {
      const app = new App({
        theme: darkTheme,
        store: new Store(path.join(dir, 'progress.json')),
        settings: new Settings(path.join(dir, 'settings.json')),
      });
      app.w = 100;
      app.h = 30;
      app.screen.out = { write: () => {} };
      app.goHome();

      app.onKey({ name: 'ctrl-k' });
      assert.equal(app.current.name, 'palette', 'Ctrl+K opens the palette');
      app.onKey({ name: 'escape' });

      // Ctrl+P keeps working as before (it is the classic binding).
      app.onKey({ name: 'ctrl-p' });
      assert.equal(app.current.name, 'palette', 'Ctrl+P still opens the palette off-challenge');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
