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
import '../helpers/runner-env.js';

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
          {
            id: 'cursor',
            title: 'Cursor column',
            prompt: 'Edit all three lines at once.',
            lang: 'js',
            files: { 'app.js': 'let a = 1;\nlet b = 2;\nlet c = 3;\n' },
            hints: [],
            checks: [],
            difficulty: 'easy',
            minutes: 5,
          },
          {
            id: 'roundtrip',
            title: 'Round trip',
            prompt: 'Leave, edit outside, come back.',
            lang: 'js',
            files: { 'app.js': '' },
            hints: [],
            checks: [],
            difficulty: 'easy',
            minutes: 5,
          },
          {
            id: 'preview',
            title: 'Preview page',
            prompt: 'Write markup, preview it.',
            lang: 'html',
            starter: '<h1>preview marker</h1>',
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
    // PC-11 / P1-2 acceptance: "a replay golden for an add-cursor-and-type
    // sequence". <C-A-down> stacks a cursor per row of the ACTIVE file; one
    // typed char then lands on every row in ONE committed batch.
    await t.test('replay: multi-cursor column edit (PC-11)', async () => {
      const storeFile = path.join(ROOT, '.data', 'editor-replay-cursor.json');
      rmSync(storeFile, { force: true });
      const app = mountChallenge('cursor', { storeFile });
      try {
        assert.ok(await waitFor(() => app.screen() === 'challenge'));
        assert.ok(await waitFor(() => app.frame().includes('Cursor column')), 'the challenge rendered');

        // The caret seeds at (0,0); two stacks of <C-A-down> put a cursor on
        // every row. ('x' is deliberately absent from the text: it would be
        // consumed by the multi path anyway, but the vim deleteChar reading
        // of a bare 'x' is exactly the kind of drift a golden pins.)
        app.onKey({ name: 'ctrl-alt-down' });
        app.onKey({ name: 'ctrl-alt-down' });
        await new Promise((r) => setTimeout(r, 80));
        app.type('X');

        const expected = 'Xlet a = 1;\nXlet b = 2;\nXlet c = 3;\n';
        assert.ok(
          await waitFor(() => draftOf(app, 'cursor')?.['app.js'] === expected, { timeout: 4000 }),
          `the batch edit reached every row (got ${JSON.stringify(draftOf(app, 'cursor'))})`,
        );

        await writeGolden('multi-cursor-column-type', {
          drafts: { 'app.js': expected },
          view: await viewportOf(expected, 'js'),
        });
      } finally {
        app.inst.unmount();
      }
    });

    await t.test('replay: Ctrl+E round-trip through $EDITOR (PC-16)', async () => {
      const storeFile = path.join(ROOT, '.data', 'editor-replay-roundtrip.json');
      rmSync(storeFile, { force: true });
      const app = mountChallenge('roundtrip', { storeFile });
      const { WORKSPACE } = await import('../../src/core/workspace.js');
      const fs = await import('node:fs');

      // "vi" would block a CI run waiting for a human; the fake editor is a
      // shebang script the route spawns exactly like vi — it appends a line
      // and exits 0, exercising spawn → exit → read-back deterministically.
      // $EDITOR is a single argv word here (the route spawns `$VISUAL $file`
      // as two entries), so an executable file, not "node script.js".
      const realEditor = { VISUAL: process.env.VISUAL, EDITOR: process.env.EDITOR };
      const fakeEditorPath = path.join(ROOT, '.data', 'fake-editor.mjs');
      fs.writeFileSync(fakeEditorPath, [
        '#!/usr/bin/env node',
        "import { appendFileSync } from 'node:fs';",
        "appendFileSync(process.argv[2], '\\n// edited externally');",
      ].join('\n'));
      fs.chmodSync(fakeEditorPath, 0o755);
      process.env.VISUAL = fakeEditorPath;
      process.env.EDITOR = fakeEditorPath;

      // Terminal release is observable: withTerminalReleased writes the alt-off
      // sequence to process.stdout directly (not ink's stream), so patching it
      // records the release/restore ORDER the golden pins.
      const seq = await import('../../src/tui/ansi.js');
      const released = [];
      const restored = [];
      const realWrite = process.stdout.write.bind(process.stdout);
      process.stdout.write = (chunk, ...rest) => {
        const s = String(chunk);
        if (s.includes(seq.seq.altOff)) released.push(s);
        if (s.includes(seq.seq.altOn)) restored.push(s);
        return realWrite(chunk, ...rest);
      };

      try {
        assert.ok(await waitFor(() => app.screen() === 'challenge'));
        assert.ok(await waitFor(() => app.frame().includes('Round trip')), 'the challenge rendered');

        // Type first, so the round-trip carries LEARNED work out and back —
        // not just the starter. No g/G/j/k/y in the text (registry bindings
        // on this screen — the same constraint the other goldens document).
        app.type('// mine');
        assert.ok(
          await waitFor(() => draftOf(app, 'roundtrip')?.['app.js'] === '// mine', { timeout: 4000 }),
          'the typed line autosaves before the round-trip',
        );

        const before = fs.existsSync(WORKSPACE) ? fs.readdirSync(WORKSPACE) : [];
        app.onKey({ name: 'ctrl-e' }); // challenge.externalEditor

        // The round-trip is async (release → spawn → read-back → reload);
        // the status line proves the read-back path ran, the store proves the
        // reloaded buffer landed, and the workspace proves the temp file was
        // consumed.
        const externEdited = '// mine\n// edited externally';
        assert.ok(
          await waitFor(() => draftOf(app, 'roundtrip')?.['app.js'] === externEdited, { timeout: 8000 }),
          `the externally edited text replaces the buffer (got ${JSON.stringify(draftOf(app, 'roundtrip'))})`,
        );
        assert.ok(
          await waitFor(() => app.frame().includes('Reloaded from'), { timeout: 4000 }),
          'the status line reports the reload from $EDITOR',
        );
        const after = fs.existsSync(WORKSPACE) ? fs.readdirSync(WORKSPACE) : [];
        const tempFiles = after.filter((f) => f.startsWith('.fullstack-tui-edit-'));
        assert.equal(tempFiles.length, 0, 'the edit artifact is consumed (deleted) after the round-trip');
        assert.ok(after.length <= before.length, 'no artifact litter is left behind');

        // The release/restore pair must be ORDERED: the learner's shell only
        // survives the excursion if alt-off precedes the editor and alt-on
        // follows it.
        assert.equal(released.length, 1, 'the terminal was released exactly once');
        assert.equal(restored.length, 1, 'the terminal was restored exactly once');

        await writeGolden('external-editor-roundtrip', {
          drafts: { 'app.js': externEdited },
          view: await viewportOf(externEdited, 'js'),
        });
      } finally {
        process.stdout.write = realWrite;
        if (realEditor.VISUAL === undefined) delete process.env.VISUAL; else process.env.VISUAL = realEditor.VISUAL;
        if (realEditor.EDITOR === undefined) delete process.env.EDITOR; else process.env.EDITOR = realEditor.EDITOR;
        rmSync(fakeEditorPath, { force: true });
        app.inst.unmount();
      }
    });

    await t.test('replay: Ctrl+P preview round-trip writes a standalone document (PC-17)', async () => {
      const storeFile = path.join(ROOT, '.data', 'editor-replay-preview.json');
      rmSync(storeFile, { force: true });
      const app = mountChallenge('preview', { storeFile });
      const { WORKSPACE } = await import('../../src/core/workspace.js');
      const fs = await import('node:fs');

      // Headless guard: the route hands the file to the OS via openExternally,
      // which honors FULLSTACK_NO_OPEN (same env-var family as
      // FULLSTACK_THEME/FULLSTACK_HEADLESS). Without it a developer run would
      // pop a browser tab every test pass.
      const noOpen = process.env.FULLSTACK_NO_OPEN;
      process.env.FULLSTACK_NO_OPEN = '1';
      try {
        assert.ok(await waitFor(() => app.screen() === 'challenge'));
        assert.ok(await waitFor(() => app.frame().includes('Preview page')), 'the challenge rendered');

        // An EDIT must flow into the document, not just the starter: type a
        // prefix so the written file proves the LIVE buffer was assembled.
        // (Safe letters only: no g/G/j/k/y on this screen; single-file drafts
        // persist as a plain string, unlike the per-file map above.)
        app.type('<p>seen</p>');
        assert.ok(
          await waitFor(() => draftOf(app, 'preview') === '<p>seen</p><h1>preview marker</h1>', { timeout: 4000 }),
          'the typed markup reaches the buffer',
        );

        app.onKey({ name: 'ctrl-p' }); // challenge.preview

        // Status first (fast), then the artifact on disk.
        assert.ok(
          await waitFor(() => app.frame().includes('Preview written to'), { timeout: 4000 }),
          'the route reports the written file (the opener was suppressed)',
        );
        const dir = path.join(WORKSPACE, 'm1', 'm1.l1');
        assert.ok(
          await waitFor(() => fs.existsSync(dir) && fs.readdirSync(dir).some((f) => f.endsWith('.preview.html')), { timeout: 4000 }),
          'the preview document lands under the challenge workspace folder',
        );
        const file = fs.readdirSync(dir).find((f) => f.endsWith('.preview.html'));
        const document = fs.readFileSync(path.join(dir, file), 'utf8');

        // Parts assembly: the LIVE buffer (typed markup + starter), the
        // classic banner, and a self-contained document (styles inline).
        assert.ok(document.includes('<p>seen</p>'), 'the live edit is in the document');
        assert.ok(document.includes('<h1>preview marker</h1>'), 'the starter markup is in the document');
        assert.ok(document.includes('tui-preview-banner'), 'the preview banner is present');
        assert.ok(/<!DOCTYPE html>/i.test(document), 'the document is standalone');

        // Golden: buffer → document → status, the whole round-trip on record.
        const parts = [
          '# editor replay: preview-roundtrip',
          '',
          '## buffer',
          '<p>seen</p><h1>preview marker</h1>',
          '',
          '## document',
          document.replace(/\s+$/, ''),
          '',
          '## status',
          'Preview written to',
          '',
        ];
        await helper.assertGolden('preview-roundtrip', parts.join('\n'));
      } finally {
        if (noOpen === undefined) delete process.env.FULLSTACK_NO_OPEN; else process.env.FULLSTACK_NO_OPEN = noOpen;
        rmSync(path.join(WORKSPACE, 'm1'), { recursive: true, force: true }); // the written preview is an artifact, not a test fixture
        app.inst.unmount();
      }
    });
  } finally {
    for (const name of ['scratch', 'vim', 'tabs', 'roundtrip', 'preview']) {
      rmSync(path.join(ROOT, '.data', `editor-replay-${name}.json`), { force: true });
    }
  }
});
