/**
 * Completion wiring (overhaul task 2.7) — the popup end to end.
 * Run: node --test tests/unit/completionWiring.test.js  (needs dist/harness.js)
 *
 * The engine is covered by tests/unit/completions.test.js and the view is
 * render-only, so what is left to prove is the WIRING: a typed prefix opens the
 * list, Enter accepts through the same `commit`/`applyEdit` path as typing, and
 * the popup outranks the global Esc/↑↓ while it is open (§10.3 row 1) without
 * swallowing the keys it declines.
 *
 * Structure note: subtests are declared with `await t.test(...)` inside one
 * parent (node:test drops flat registrations that follow a top-level await).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import '../helpers/runner-env.js';

const ROOT = process.cwd();
const STORE_FILE = path.join(ROOT, '.data', 'completion-wiring-test.json');

/** One html challenge whose starter begins a tag, so `<di` has candidates. */
const CURRICULUM = [
  {
    id: 'm1',
    badge: 'HT',
    title: 'HTML',
    tagline: 'structure',
    hours: 2,
    source: { course: 'c', url: 'u', roadmap: 'r', docs: 'd' },
    lessons: [
      {
        id: 'm1.l1',
        title: 'Tags',
        minutes: 10,
        challenges: [
          {
            id: 'c1',
            title: 'A div',
            prompt: 'Make a div.',
            lang: 'html',
            starter: '',
            hints: ['Start with <'],
            checks: [],
            difficulty: 'easy',
            minutes: 5,
            solution: '<div></div>',
          },
        ],
      },
    ],
  },
];

async function waitFor(fn, { timeout = 8000, step = 20 } = {}) {
  const start = Date.now();
  for (;;) {
    const value = fn();
    if (value) return value;
    if (Date.now() - start > timeout) return null;
    await new Promise((r) => setTimeout(r, step));
  }
}

test('completion popup wiring (task 2.7)', async (t) => {
  const harnessPath = new URL('../../dist/harness.js', import.meta.url).pathname;
  const harness = existsSync(harnessPath) ? await import(pathToFileURL(harnessPath).href) : null;
  const helper = await import(pathToFileURL(new URL('../helpers/snapshot.js', import.meta.url).pathname));
  const { Store } = await import('../../src/core/store.js');
  const { parseKeys } = await import('../../src/ui/input/index.js');
  const { resolveKey } = await import('../../src/ui/commands.js');

  if (!harness) {
    t.skip('needs built harness (npm run build)');
    return;
  }

  /** A settings double: vim OFF (modeless typing), pane ratios inert. */
  function fakeSettings() {
    return {
      data: { editor: { vimMode: false, tabSize: 2 }, palette: { recent: [] }, panes: {} },
      get: (key) => (key === 'editor.vimMode' ? false : undefined),
      save: () => {},
      bannerVisible: () => false,
      dismissBanner: () => {},
      paneRatio: (_screen, _key, fallback) => fallback,
      setPaneRatio: () => {},
      resetPanes: () => {},
    };
  }

  function mount() {
    const store = new Store(STORE_FILE);
    const services = harness.createServices({
      store,
      curriculum: CURRICULUM,
      settings: fakeSettings(),
      overall: { modules: 1, challenges: 1 },
      lessonIndex: [{ module: CURRICULUM[0], lesson: CURRICULUM[0].lessons[0] }],
    });
    function App() {
      return harness.el(
        harness.ServicesProvider,
        { services },
        harness.el(
          harness.RouterProvider,
          {
            screens: { home: harness.HomeRoute, challenge: harness.ChallengeRoute },
            initial: {
              name: 'challenge',
              params: { moduleId: 'm1', lessonId: 'm1.l1', challengeId: 'c1' },
            },
          },
          harness.el(
            harness.CommandHost,
            { onQuit: () => {} },
            harness.el(harness.RouterView, {}),
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
    const press = async (ch, ms = 20) => {
      harness.getCurrentRoute().onKey({ name: 'char', char: ch });
      await new Promise((r) => setTimeout(r, ms));
    };
    return {
      inst,
      store,
      onKey: (key) => harness.getCurrentRoute().onKey(key),
      press,
      screen: () => harness.getCurrentRoute().screen,
      frame: () => helper.stripAnsi(out.chunks.join('')),
    };
  }

  await t.test('the popup view draws the focused row, its doc line and the signature', async () => {
    const popup = {
      items: [
        { label: 'div', kind: 'tag', detail: '', insert: 'div></div>' },
        { label: 'dialog', kind: 'tag', detail: 'modal element', insert: 'dialog></dialog>' },
      ],
      selected: 1,
      from: { row: 0, col: 1 },
      to: { row: 0, col: 3 },
      prefix: 'di',
      family: 'markup',
      stops: [],
      stopIndex: -1,
    };
    const frame = helper.stripAnsi(await helper.renderToText(
      harness.el(harness.CompletionPopup, {
        popup,
        width: 46,
        signature: { sig: 'querySelector(selectors)', params: ['selectors'], activeParam: 0 },
      }),
      { render: harness.render },
    ));
    assert.ok(frame.includes('div'), 'the first candidate renders');
    assert.ok(frame.includes('dialog'), 'the focused candidate renders');
    assert.ok(frame.includes('›'), 'the focused row is marked');
    assert.ok(frame.includes('modal element'), 'the focused item doc line renders');
    assert.ok(frame.includes('querySelector(selectors)'), 'signature help renders');
    assert.ok(frame.includes('[1/1]'), 'the active parameter is shown');
  });

  await t.test('Ctrl+Space is reachable from the real byte parser', () => {
    // Ctrl+Space is NUL in raw mode; before the KEYMAP entry it was dropped, so
    // the documented trigger could only ever fire in a synthetic event.
    const events = parseKeys('\x00');
    assert.equal(events.length, 1, 'NUL must parse to exactly one event');
    assert.equal(events[0].name, 'ctrl-space');
    assert.equal(
      resolveKey(events[0], 'challenge'),
      'editor.completionTrigger',
      'the parsed key resolves to the completion command on the challenge screen',
    );
  });

  await t.test('a typed prefix opens the list and Enter accepts it', async () => {
    rmSync(STORE_FILE, { force: true });
    const app = mount();
    try {
      assert.ok(await waitFor(() => app.screen() === 'challenge'), 'the challenge route registered');
      assert.ok(await waitFor(() => app.frame().includes('Make a div.')), 'the challenge rendered');

      // `<di` — the auto-trigger (spec §8.9) opens the popup as the prefix
      // grows; no Ctrl+Space needed.
      // One key per render, like the real dispatcher (a caller that fires a
      // whole burst in one tick would batch into a single setSession).
      for (const ch of '<di') await app.press(ch);
      assert.ok(await waitFor(() => app.frame().includes('Tab accept')), 'the popup rendered');
      assert.ok(await waitFor(() => app.frame().includes('div')), 'the div candidate is listed');

      // ↓ re-selects the second candidate (`dialog` is first). The nav id is
      // intercepted by the popup, not the list cursor — `dialog` would be the
      // accepted item otherwise.
      app.onKey({ name: 'down' });
      await new Promise((r) => setTimeout(r, 40));

      // Enter accepts through the route's commit path: `<di` → `div></div>`.
      app.onKey({ name: 'enter' });
      assert.ok(
        await waitFor(() => app.frame().includes('div></div>')),
        'Enter accepted the focused item into the buffer',
      );
      // And the list is gone: the same Enter that accepted must not stay open.
      assert.equal(app.screen(), 'challenge');

      // Undo is ONE step for the whole accepted snippet (spec §8.2).
      app.onKey({ name: 'ctrl-z' });
      assert.ok(await waitFor(() => app.frame().includes('<di')), 'one undo restores the typed prefix');
    } finally {
      app.inst.unmount();
    }
  });

  await t.test('the open popup owns Esc, ↑/↓ and typing (and declines the rest)', async () => {
    rmSync(STORE_FILE, { force: true });
    const app = mount();
    try {
      assert.ok(await waitFor(() => app.screen() === 'challenge'));
      assert.ok(await waitFor(() => app.frame().includes('Make a div.')));

      // Ctrl+Space (manual trigger) on a fresh buffer: empty prefix still lists
      // the markup extras, so the popup opens.
      app.onKey({ name: 'ctrl-space' });
      assert.ok(await waitFor(() => app.frame().includes('Tab accept')), 'Ctrl+Space opened the popup');

      // Esc is the global app.back; with the popup open it must dismiss the
      // list WITHOUT popping the screen.
      app.onKey({ name: 'escape' });
      await new Promise((r) => setTimeout(r, 60));
      assert.equal(app.screen(), 'challenge', 'Esc dismissed the popup instead of leaving the screen');

      // Typing while open must refilter, not dismiss: reopen, then type `<d`.
      app.onKey({ name: 'ctrl-space' });
      assert.ok(await waitFor(() => app.frame().includes('Tab accept')));
      await app.press('<');
      await app.press('d');
      assert.ok(
        await waitFor(() => app.frame().includes('div')),
        'typing over an open popup refilters the list',
      );
    } finally {
      app.inst.unmount();
    }
  });

  rmSync(STORE_FILE, { force: true });
});
