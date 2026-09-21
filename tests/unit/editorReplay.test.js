/**
 * Editor replay goldens (task 2.9 remainder) — the last open item in Phase 2.
 *
 * Each case drives the REAL `ChallengeRoute` (router → route → vim/typekeys →
 * session → debounced autosave) with a scripted keystroke sequence and records
 * what the editor ended up holding, plus the viewport that document paints.
 * Three scenarios, the ones the spec names:
 *
 *   1. solve-from-scratch — modeless typing into an empty starter
 *   2. vim-edit-undo-redo — `i`, type, `Esc`, `u`, redo
 *   3. multi-file-tab-flow — `<C-w>` switches files, and the draft keeps BOTH
 *
 * Why goldens rather than only assertions: the expected text of a replay is a
 * behaviour, and a `.snap` diff is the reviewable form of it (that is how the
 * `Ctrl+F` formatter and the session/undo tables are pinned too). The assertions
 * alongside them state the INTENT — "the draft is the starter again after undo"
 * — so a golden can never be refreshed into a wrong result without the test
 * failing first.
 *
 * Goldens live in tests/snapshots/editor-replay-*.snap; `UPDATE_SNAPSHOTS=1`
 * rewrites them, as with every other snapshot in the suite.
 *
 * Run: node --test tests/unit/editorReplay.test.js  (needs dist/harness.js)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();

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
    badge: 'JS',
    title: 'JS Basics',
    tagline: 'functions first',
    hours: 2,
    source: { course: 'c', url: 'u', roadmap: 'r', docs: 'd' },
    lessons: [
      {
        id: 'm1.l1',
        title: 'Functions',
        minutes: 10,
        challenges: [
          {
            id: 'scratch',
            title: 'Greeting',
            prompt: 'Write a greeting function.',
            lang: 'js',
            files: { 'app.js': '' },
            hints: ['Start with const.'],
            checks: [],
            difficulty: 'easy',
            minutes: 5,
          },
          {
            id: 'vim',
            title: 'Vim edit',
            prompt: 'Practise undo and redo.',
            lang: 'js',
            files: { 'app.js': 'let n = 1;\n' },
            hints: [],
            checks: [],
            difficulty: 'easy',
            minutes: 5,
          },
          {
            id: 'tabs',
            title: 'Two files',
            prompt: 'Two files, two edits.',
            lang: 'html',
            files: { 'index.html': '', 'style.css': '' },
            hints: [],
            checks: [],
            difficulty: 'easy',
            minutes: 5,
          },
        ],
      },
    ],
    project: { id: 'm1.p', title: 'Portfolio page', minutes: 45, checks: [] },
  },
];

test('editor replay goldens', async (t) => {
  const harnessPath = new URL('../../dist/harness.js', import.meta.url).pathname;
  const harness = existsSync(harnessPath) ? await import(pathToFileURL(harnessPath).href) : null;
  const helper = await import(pathToFileURL(new URL('../helpers/snapshot.js', import.meta.url).pathname));
  const { Store } = await import('../../src/core/store.js');

  if (!harness) {
    t.skip('needs built harness (npm run build)');
    return;
  }

  const challenges = CURRICULUM[0].lessons[0].challenges.length;

  /**
   * Mount the real route tree with fake services.
   *
   * @param {boolean} [opts.viaHome] start on home and `go()` into the challenge,
   *   so an Esc that LEAVES the screen is observable (a single-entry stack
   *   cannot pop anywhere).
   */
  function mountChallenge(challengeId, { vimMode = false, storeFile, viaHome = false } = {}) {
    const box = { host: null };
    function Probe() {
      box.host = harness.useHost();
      return harness.el(harness.Text, null, '');
    }
    const panes = {};
    const settings = {
      data: { palette: { recent: [] }, panes, editor: { vimMode, tabSize: 2 } },
      save: () => {},
      bannerVisible: () => false,
      dismissBanner: () => {},
      paneRatio: (_s, _k, fallback) => fallback,
      setPaneRatio: () => {},
      resetPanes: () => {},
    };
    const store = new Store(storeFile);
    const services = harness.createServices({
      store,
      curriculum: CURRICULUM,
      settings,
      overall: { modules: CURRICULUM.length, challenges },
      lessonIndex: CURRICULUM.flatMap((m) => m.lessons.map((lesson) => ({ module: m, lesson }))),
    });

    function App() {
      return harness.el(
        harness.ServicesProvider,
        { services },
        harness.el(
          harness.RouterProvider,
          {
            screens: { challenge: harness.ChallengeRoute, home: harness.HomeRoute },
            // Start ON the challenge unless the case needs a screen to pop back to.
            initial: viaHome
              ? { name: 'home', params: {} }
              : { name: 'challenge', params: { moduleId: 'm1', lessonId: 'm1.l1', challengeId } },
          },
          harness.el(
            harness.CommandHost,
            { onQuit: () => {} },
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
      store,
      services,
      host: () => box.host,
      open: async () => {
        if (!viaHome) return;
        box.host.go('challenge', { moduleId: 'm1', lessonId: 'm1.l1', challengeId });
      },
      screen: () => harness.getCurrentRoute().screen,
      // Cumulative stream: only used for "appears at least once" checkpoints
      // (the same rule tests/unit/routes.test.js documents), never for state.
      frame: () => helper.stripAnsi(out.chunks.join('')),
      onKey: (key) => harness.getCurrentRoute().onKey(key),
      type: (text) => {
        for (const char of text) harness.getCurrentRoute().onKey({ name: 'char', char });
      },
    };
  }

  const draftOf = (app, challengeId) => app.store.challengeRecord(`m1.l1.${challengeId}`).lastCode;

  /** Write or compare a golden: the replayed buffers + the painted viewport. */
  async function writeGolden(name, { drafts, view }) {
    const parts = [`# editor replay: ${name}`, ''];
    for (const [file, text] of Object.entries(drafts)) {
      parts.push(`## ${file}`, String(text ?? '').replace(/\s+$/, ''), '');
    }
    parts.push('## viewport', view.replace(/\s+$/, ''), '');
    await helper.assertGolden(`editor-replay-${name}`, parts.join('\n'));
  }

  /** Paint a document the way the editor would, for the golden's viewport. */
  const viewportOf = (text, language) => helper.renderToText(
    harness.el(harness.CodeEditor, {
      document: text,
      width: 40,
      height: 8,
      language,
      tabSize: 2,
    }),
    { render: harness.render, columns: 46, rows: 12 },
  );

  try {
    await t.test('replay: solve from scratch in the modeless editor', async () => {
      const storeFile = path.join(ROOT, '.data', 'editor-replay-scratch.json');
      rmSync(storeFile, { force: true });
      const app = mountChallenge('scratch', { storeFile });
      try {
        assert.ok(await waitFor(() => app.screen() === 'challenge'));
        assert.ok(await waitFor(() => app.frame().includes('Greeting')), 'the challenge rendered');

        // Two lines, and no `g`/`G`/`y` in the text on purpose: those letters
        // are GLOBAL registry bindings (nav.first/nav.last, challenge.copy-
        // Solution), so on the challenge screen they resolve as commands and
        // never reach the modeless typing path — the same reason
        // tests/unit/routes.test.js types `xab` rather than words.
        app.type('const add = (n) => n;');
        assert.ok(
          await waitFor(() => app.frame().includes('Tab accept')),
          'the completion popup opened on the typed prefix',
        );
        // Escape dismisses the popup (while it is open it owns Esc, so this
        // cannot pop the screen); Enter would otherwise ACCEPT a row instead
        // of inserting a newline.
        app.onKey({ name: 'escape' });
        app.onKey({ name: 'enter' });
        app.type('add(1)');

        const expected = 'const add = (n) => n;\nadd(1)';
        // A challenge declared with `files` persists a per-file map (Q8 draft).
        assert.ok(
          await waitFor(() => draftOf(app, 'scratch')?.['app.js'] === expected, { timeout: 4000 }),
          `typing reaches the buffer and autosaves (got ${JSON.stringify(draftOf(app, 'scratch'))})`,
        );

        await writeGolden('solve-from-scratch', {
          drafts: { 'app.js': expected },
          view: await viewportOf(expected, 'js'),
        });
      } finally {
        app.inst.unmount();
      }
    });

    await t.test('replay: vim insert, undo, redo', async () => {
      const storeFile = path.join(ROOT, '.data', 'editor-replay-vim.json');
      rmSync(storeFile, { force: true });
      const app = mountChallenge('vim', { vimMode: true, storeFile, viaHome: true });
      try {
        assert.ok(await waitFor(() => app.screen() === 'home'), 'home registers its route');
        await app.open();
        assert.ok(await waitFor(() => app.screen() === 'challenge'));
        assert.ok(await waitFor(() => app.frame().includes('Vim edit')), 'the challenge rendered');

        app.onKey({ name: 'char', char: 'i' });
        app.type('let n = 2; ');
        assert.ok(
          await waitFor(() => app.frame().includes('INSERT')),
          'the mode badge reports insert mode',
        );
        // Esc is the global `app.back` and resolves BEFORE the editor, so the
        // route forwards it to the vim machine while the editor is mid-mode:
        // one press leaves insert mode and stays on the screen. (The popup the
        // 2-char prefix opened closed itself on the trailing space, so it does
        // not take the first press.)
        app.onKey({ name: 'escape' });
        await new Promise((r) => setTimeout(r, 50));
        assert.equal(app.screen(), 'challenge', 'Esc leaves insert mode without popping the screen');

        const edited = 'let n = 2; let n = 1;\n';
        assert.ok(
          await waitFor(() => draftOf(app, 'vim')?.['app.js'] === edited, { timeout: 4000 }),
          `insert-mode typing lands in the buffer (got ${JSON.stringify(draftOf(app, 'vim'))})`,
        );

        // `u` is unbound in the registry (the vim reducer owns it), and the
        // whole insert run is ONE coalesced history step.
        app.onKey({ name: 'char', char: 'u' });
        assert.ok(
          await waitFor(() => draftOf(app, 'vim') == null, { timeout: 4000 }),
          'undo returns the buffer to the starter, so the clean draft is cleared',
        );

        // Redo is `<S-C-z>` in INSERT mode (`<C-r>` belongs to challenge.reset
        // in the registry, which is exactly the kind of collision the replay
        // exists to pin).
        app.onKey({ name: 'char', char: 'i' });
        app.onKey({ name: 'shift-ctrl-z' });
        assert.ok(
          await waitFor(() => draftOf(app, 'vim')?.['app.js'] === edited, { timeout: 4000 }),
          `redo restores the edited buffer (got ${JSON.stringify(draftOf(app, 'vim'))})`,
        );

        await writeGolden('vim-edit-undo-redo', {
          drafts: { 'app.js': edited },
          view: await viewportOf(edited, 'js'),
        });

        // …and in NORMAL mode Esc is still `app.back`: leaving insert mode must
        // not turn the challenge screen into a place you cannot leave.
        for (let i = 0; i < 4 && app.screen() !== 'home'; i += 1) {
          app.onKey({ name: 'escape' });
          await new Promise((r) => setTimeout(r, 120));
        }
        assert.equal(app.screen(), 'home', 'Esc in normal mode leaves the challenge');
      } finally {
        app.inst.unmount();
      }
    });

    await t.test('replay: multi-file tab flow keeps both buffers', async () => {
      const storeFile = path.join(ROOT, '.data', 'editor-replay-tabs.json');
      rmSync(storeFile, { force: true });
      const app = mountChallenge('tabs', { storeFile });
      try {
        assert.ok(await waitFor(() => app.screen() === 'challenge'));
        assert.ok(await waitFor(() => app.frame().includes('Two files')), 'the challenge rendered');

        // Active file is the first of the session order (index.html).
        // (`plain` over `body` because `y` is a registry binding — see above.)
        app.type('head');
        app.onKey({ name: 'ctrl-w' }); // editor.tabNext
        app.type('plain');

        assert.ok(
          await waitFor(() => {
            const d = draftOf(app, 'tabs');
            return d && d['index.html'] === 'head' && d['style.css'] === 'plain';
          }, { timeout: 4000 }),
          `both files keep their own buffer (got ${JSON.stringify(draftOf(app, 'tabs'))})`,
        );
        assert.ok(
          await waitFor(() => app.frame().includes('style.css')),
          'the tab strip names both files',
        );

        await writeGolden('multi-file-tab-flow', {
          drafts: draftOf(app, 'tabs'),
          view: await viewportOf('plain', 'css'),
        });
      } finally {
        app.inst.unmount();
      }
    });
  } finally {
    for (const name of ['scratch', 'vim', 'tabs']) {
      rmSync(path.join(ROOT, '.data', `editor-replay-${name}.json`), { force: true });
    }
  }
});
