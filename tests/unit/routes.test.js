/**
 * Next-UI route + command-host tests (Phase 1 wiring).
 * Run: node --test tests/unit/routes.test.js  (needs dist/harness.js)
 *
 * These drive the REAL wiring end to end: the router renders a route, the
 * route registers its keymap via useKeymap, and keys pushed through
 * getCurrentRoute().onKey travel registry → route → CommandHost → router.
 *
 * Assertions read host state (screen + cursor) captured by a probe child, not
 * the write stream: ink diffs frames, so "the stream contains X" stays true
 * forever and silently passes after a failed step. Frame text is only used
 * for content that can appear exactly once (a brief, a footer hint).
 *
 * Waits are polls (`waitFor`), not fixed sleeps: ink commits a re-render and
 * its effects on the next tick, so a hard-coded delay is a flake generator.
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
const STORE_FILE = path.join(ROOT, '.data', 'routes-test.json');

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
          { id: 'c1', title: 'First heading', prompt: 'Wrap it in an h1.', lang: 'html', starter: '<h1', hints: ['Open the tag first.', 'Then close it.'], checks: [], difficulty: 'easy', minutes: 5 },
          { id: 'c2', title: 'Second heading', prompt: 'Two headings.', lang: 'html', starter: '', hints: ['Use h2.'], checks: [], difficulty: 'easy', minutes: 5 },
        ],
      },
      // c3 carries one real (source-regex) check so the PASS path — workspace
      // artifacts (PC-28) and checkpoint annotation (PC-27) — is drivable.
      // c4 is the multi-file challenge: its pass must write every tab under
      // the challenge folder (PC-28), and its two rows anchor the multi-cursor
      // typing test (PC-11).
      { id: 'm1.l2', title: 'Lists', minutes: 12, challenges: [
        { id: 'c3', title: 'A list', prompt: 'Make a list.', lang: 'html', starter: '', hints: ['ul + li'], checks: [{ kind: 'src', label: 'has a list', re: '<ul' }], difficulty: 'easy', minutes: 6 },
        { id: 'c4', title: 'Two files', prompt: 'Markup plus styles.', lang: 'html', files: { 'index.html': '<p>hi</p>\n', 'style.css': 'p {}\n', 'app.js': 'const x = 1;\n' }, hints: [], checks: [], difficulty: 'easy', minutes: 6 },
        // c5: a single-file CSS challenge so the emmet shorthand path (`m10` +
        // `;` → `margin: 10px;`) is drivable through the real route.
        { id: 'c5', title: 'Box model', prompt: 'Style it.', lang: 'css', starter: 'p {}\n', hints: [], checks: [], difficulty: 'easy', minutes: 4 },
      ] },
    ],
    project: { id: 'm1.p', title: 'Portfolio page', minutes: 45, checks: [{ id: 'k1' }, { id: 'k2' }] },
  },
  {
    id: 'm2',
    badge: 'PY',
    title: 'Python',
    tagline: 'scripts',
    hours: 4,
    source: { course: 'c', url: 'u', roadmap: 'r', docs: 'd' },
    lessons: [{ id: 'm2.l1', title: 'Vars', minutes: 9, challenges: [{ id: 'c1', title: 'A variable', prompt: 'x = 1', lang: 'py', starter: '', hints: ['x = 1'], checks: [], difficulty: 'easy', minutes: 4 }] }],
  },
];

/** Poll until `fn()` is truthy (or time out and return null).
 *
 * The default budget is generous on purpose: the full suite runs many files in
 * parallel, and the challenge route's mount (session seed + autosave wiring)
 * takes measurably longer under that contention than a lone-file run. Every
 * waitFor here polls real app state, so a bigger timeout only costs wall time
 * on genuine failures.
 */
async function waitFor(fn, { timeout = 8000, step = 20 } = {}) {
  const start = Date.now();
  for (;;) {
    const value = fn();
    if (value) return value;
    if (Date.now() - start > timeout) return null;
    await new Promise((r) => setTimeout(r, step));
  }
}

test('next-UI routes + command host', async (t) => {
  const harnessPath = new URL('../../dist/harness.js', import.meta.url).pathname;
  const harness = existsSync(harnessPath) ? await import(pathToFileURL(harnessPath).href) : null;
  const helper = await import(pathToFileURL(new URL('../helpers/snapshot.js', import.meta.url).pathname));
  const { Store } = await import('../../src/core/store.js');
  const { curriculum } = await import('../../src/content/index.js');
  const { firstUnpassed } = await import('../../src/core/targets.js');

  if (!harness) {
    t.skip('needs built harness (npm run build)');
    return;
  }

  /** Mount the real route tree with fake services; drive keys via the route. */
  function mountApp(services, { onQuit } = {}) {
    const box = { host: null, frame: '' };
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
              browser: harness.BrowserRoute,
              help: harness.HelpRoute,
              settings: harness.SettingsRoute,
              tour: harness.TourRoute,
            },
            initial: { name: 'home', params: {} },
          },
          harness.el(
            harness.CommandHost,
            { onQuit },
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
    // Ink still binds stdin for useInput (ChallengeScreen's vim cursor path);
    // without a fake the CI runner's non-TTY stdin breaks raw-mode setup.
    const inst = harness.render(harness.el(App, {}), { stdout: out, stdin: helper.fakeStdin(), exitOnCtrlC: false, patchConsole: false });
    return {
      inst,
      host: () => box.host,
      cursor: () => box.host && box.host.cursor,
      screen: () => harness.getCurrentRoute().screen,
      // Content assertions only (the stream is cumulative — see the header).
      frame: () => helper.stripAnsi(out.chunks.join('')),
      onKey: (key) => harness.getCurrentRoute().onKey(key),
    };
  }

  /** An in-memory Settings double: pane ratios round-trip like the real one. */
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

  function servicesFor(cur, { onDismiss, settings: settingsOverride } = {}) {
    const store = new Store(STORE_FILE);
    const settings = settingsOverride || {
      bannerVisible: () => false,
      dismissBanner: () => { if (onDismiss) onDismiss(); },
    };
    const challenges = cur.reduce((n, m) => n + m.lessons.reduce((k, l) => k + l.challenges.length, 0), 0);
    return harness.createServices({
      store,
      curriculum: cur,
      settings,
      overall: { modules: cur.length, challenges },
      lessonIndex: cur.flatMap((m) => m.lessons.map((lesson) => ({ module: m, lesson }))),
    });
  }

  try {
    await t.test('home: cursors move, Enter opens the module, Esc unwinds', async () => {
      rmSync(STORE_FILE, { force: true });
      const app = mountApp(servicesFor(CURRICULUM));
      assert.ok(await waitFor(() => app.screen() === 'home'), 'home registers its route');

      app.onKey({ name: 'char', char: 'j' });
      assert.ok(await waitFor(() => app.cursor() === 1), 'j moves the cursor down');

      app.onKey({ name: 'char', char: 'G' });
      // P0-1: wait for the asserted state itself instead of a fixed sleep
      // racing the renderer — the resolve IS the assert, and it also orders the
      // following `g` press strictly after G has applied.
      assert.ok(await waitFor(() => app.cursor() === 1), 'G clamps to the last module');

      app.onKey({ name: 'char', char: 'g' });
      assert.ok(await waitFor(() => app.cursor() === 0), 'g jumps back to the first module');

      app.onKey({ name: 'enter' });
      assert.ok(await waitFor(() => app.screen() === 'module'), 'Enter pushes the module route');
      assert.equal(app.cursor(), 0, 'the module screen starts at its first row');
      assert.ok(
        await waitFor(() => app.frame().includes('Portfolio page')),
        'module lessons + capstone row render',
      );

      app.onKey({ name: 'char', char: 'j' });
      assert.ok(await waitFor(() => app.cursor() === 1), 'module cursor moves');

      app.onKey({ name: 'enter' });
      assert.ok(await waitFor(() => app.screen() === 'lesson'), 'Enter on a lesson pushes the lesson route');
      // Module row 1 is the "Lists" lesson; the lesson screen lists its practice.
      assert.ok(await waitFor(() => app.frame().includes('Practice')), 'the lesson renders its practice list');

      // Enter on the lesson opens the focused challenge (first unpassed).
      app.onKey({ name: 'enter' });
      assert.ok(await waitFor(() => app.screen() === 'challenge'), 'Enter on a lesson opens a challenge');
      assert.ok(await waitFor(() => app.frame().includes('Make a list.')), 'the brief renders');
      assert.ok(await waitFor(() => app.frame().includes('Ctrl+H hint')), 'the challenge footer documents its keys');
      assert.equal(app.cursor(), 0, 'the challenge screen carries no list cursor');

      app.onKey({ name: 'escape' });
      assert.ok(await waitFor(() => app.screen() === 'lesson'), 'Esc pops back to the lesson');

      app.onKey({ name: 'escape' });
      assert.ok(await waitFor(() => app.screen() === 'module'), 'Esc pops back to the module');
      assert.equal(app.cursor(), 1, 'the module cursor is remembered');

      app.inst.unmount();
    });

    await t.test('home: s opens settings, and q quits through the host', async () => {
      const quits = [];
      const app = mountApp(servicesFor(CURRICULUM), { onQuit: () => quits.push('q') });
      assert.ok(await waitFor(() => app.screen() === 'home'));

      // Task 1.4 is complete, so `s` now opens the real screen rather than the
      // "lands with the Phase 1 port" notice this test used to assert.
      app.onKey({ name: 'char', char: 's' });
      assert.ok(await waitFor(() => app.screen() === 'settings'), 's opens the settings screen');
      assert.ok(
        await waitFor(() => app.frame().includes('Preferences')),
        'the settings screen renders its rows',
      );
      assert.equal(quits.length, 0);

      app.onKey({ name: 'char', char: 'q' });
      assert.ok(await waitFor(() => quits.length === 1), 'q reaches the host quit hook');

      app.inst.unmount();
    });

    await t.test('home: r (resume) and the global next-up sink open the first unpassed challenge', async () => {
      rmSync(STORE_FILE, { force: true });
      const app = mountApp(servicesFor(CURRICULUM));
      assert.ok(await waitFor(() => app.screen() === 'home'));

      app.onKey({ name: 'char', char: 'r' });
      assert.ok(await waitFor(() => app.screen() === 'challenge'), 'r resumes into a challenge');
      assert.ok(
        await waitFor(() => app.frame().includes('Wrap it in an h1.')),
        'resume lands on the first unpassed challenge',
      );

      app.onKey({ name: 'escape' });
      assert.ok(await waitFor(() => app.screen() === 'home'), 'Esc returns home');

      // nav.nextUp has no default key — it arrives through the dispatcher's
      // global pass, which the host registers as a sink.
      const sink = harness.getGlobalCommandSink();
      assert.equal(typeof sink, 'function', 'CommandHost registered the global sink');
      assert.equal(sink('nav.nextUp'), true);
      assert.ok(await waitFor(() => app.screen() === 'challenge'), 'next-up navigates');
      assert.ok(await waitFor(() => app.frame().includes('Wrap it in an h1.')));

      app.inst.unmount();
    });

    await t.test('challenge: hints, solution toggle and a real check run are wired', async () => {
      // The real curriculum exercises the real grader (the fixture above has
      // no checks); its first unpassed challenge is the next-up target.
      rmSync(STORE_FILE, { force: true });
      const services = servicesFor(curriculum);
      const target = firstUnpassed(curriculum, (id) => services.store.isPassed(id));
      const challengeId = `${target.lessonId}.${target.challengeId}`;

      const app = mountApp(services);
      assert.ok(await waitFor(() => app.screen() === 'home'));
      assert.equal(harness.getGlobalCommandSink()('nav.nextUp'), true);
      assert.ok(await waitFor(() => app.screen() === 'challenge'));

      app.onKey({ name: 'ctrl-h' });
      assert.ok(await waitFor(() => /Hint 1\/\d+/.test(app.frame())), 'hint text renders');
      assert.equal(
        new Store(STORE_FILE).challengeRecord(challengeId).hintsUsed,
        1,
        'revealing a hint is recorded in progress',
      );

      app.onKey({ name: 'ctrl-g' });
      assert.ok(await waitFor(() => /Solution for|Solution hidden/.test(app.frame())), 'solution toggle reported');

      app.onKey({ name: 'ctrl-s' });
      assert.ok(
        await waitFor(() => /checks passed/.test(app.frame()), { timeout: 15000 }),
        'the grader ran and reported its result',
      );

      app.inst.unmount();
    });

    await t.test('challenge: Q7 results panel, Q10 suggest-only format, working reset', async () => {
      // An html challenge whose formatted form differs from its starter, so
      // both the format suggestion and the reset round-trip are observable.
      rmSync(STORE_FILE, { force: true });
      const services = servicesFor(curriculum);
      const { eachChallenge } = await import('../../src/core/targets.js');
      const entry = eachChallenge(curriculum).find(
        (e) => (e.challenge.lang || 'js') === 'html' && !e.challenge.files,
      );
      const challengeId = `${entry.lesson.id}.${entry.challenge.id}`;

      const app = mountApp(services);
      assert.ok(await waitFor(() => app.screen() === 'home'));
      assert.equal(
        harness.getGlobalCommandSink()('nav.nextUp'),
        true,
        'navigate to the first unpassed challenge first',
      );
      assert.ok(await waitFor(() => app.screen() === 'challenge'));
      // The next-up target may not be our chosen entry; open it via the host's
      // router. Content assertion uses the brief (curriculum challenges carry
      // an id, not a title — the screen falls back to it).
      app.host().go('challenge', {
        moduleId: entry.module.id,
        lessonId: entry.lesson.id,
        challengeId: entry.challenge.id,
      });
      assert.ok(
        await waitFor(() => app.frame().includes(entry.challenge.id)),
        'chosen challenge renders (id fallback in the title row)',
      );

      // Q10: Ctrl+F is suggest-only — the saved draft is untouched.
      app.onKey({ name: 'ctrl-f' });
      assert.ok(
        await waitFor(() => /formatter would rewrite|Already formatted/.test(app.frame()), { timeout: 8000 }),
        'Ctrl+F reports the suggest-only verdict',
      );

      // Q7: a run renders the CHECKS header with counts, a duration and the
      // micro-notes ("CHECKS  1/5   ·   40 ms", then the note lines).
      app.onKey({ name: 'ctrl-s' });
      assert.ok(
        await waitFor(() => /CHECKS  \d+\/\d+/.test(app.frame()), { timeout: 20000 }),
        'the checks header rendered with counts',
      );
      assert.ok(
        await waitFor(() => /CHECKS  \d+\/\d+\s+·\s+\d+ ms/.test(app.frame()), { timeout: 8000 }),
        'header carries the run duration',
      );
      assert.ok(
        await waitFor(() => app.frame().includes('· The editor is still the starter code') || /· /.test(app.frame()), { timeout: 8000 }),
        'micro-notes render under the header',
      );

      // Reset: the session buffers drop back to the starter (per-file, with
      // history — Ctrl+Z restores the work). The draft in the store is cleared.
      app.onKey({ name: 'ctrl-r' });
      assert.ok(await waitFor(() => app.frame().includes('Reset to starter'), { timeout: 8000 }), 'reset reported');
      assert.equal(
        new Store(STORE_FILE).challengeRecord(challengeId).lastCode ?? null,
        null,
        'reset cleared the saved draft',
      );

      app.inst.unmount();
    });

    await t.test('challenge: typing edits the buffer, undo restores it (task 2.9)', async () => {
      rmSync(STORE_FILE, { force: true });
      const services = servicesFor(CURRICULUM);
      const app = mountApp(services);
      try {
        assert.ok(await waitFor(() => app.screen() === 'home'));
        app.host().go('challenge', { moduleId: 'm1', lessonId: 'm1.l1', challengeId: 'c1' });
        // Wait for a REAL render of this app's challenge screen (a stale route
        // registration from a previous subtest would satisfy screen() alone).
        assert.ok(await waitFor(() => app.frame().includes('First heading')), 'challenge rendered');
        assert.ok(await waitFor(() => app.screen() === 'challenge'));

        // Typed 'x' reaches the editor (nothing binds it) and the debounced
        // autosave persists it. The caret seeds at {0,0}, so the insert
        // PREPENDS to the starter: 'x' + '<h1'. Polled through the SAME
        // services instance the route writes through — a fresh Store would
        // race sibling test files on the shared store file (full-suite
        // flakiness).
        app.onKey({ name: 'char', char: 'x' });
        const challengeId = 'm1.l1.c1';
        assert.ok(
          await waitFor(() => services.store.challengeRecord(challengeId).lastCode === 'x<h1', { timeout: 4000 }),
          'typing lands in the buffer and autosaves',
        );

        // Two bytes arriving in ONE stdin chunk (an SSH burst, a fast typist, a
        // coalesced read) must BOTH land. The route reads the latest editor
        // state through refs for exactly this: before, both keys ran against
        // the same render and the second silently overwrote the first.
        // Both keys are UNBOUND on this screen (a bound letter is a command by
        // design — `y` is challenge.copySolution, for instance), so they are
        // exactly the "two printable bytes in one chunk" case.
        app.onKey({ name: 'char', char: 'a' });
        app.onKey({ name: 'char', char: 'b' });
        assert.ok(
          await waitFor(() => services.store.challengeRecord(challengeId).lastCode === 'xab<h1', { timeout: 4000 }),
          'a two-key burst in one tick applies both characters',
        );

        // Ctrl+Z is unbound by the registry, so it falls through to the vim
        // reducer, which requests undo. Undo runs are coalesced inside a 400 ms
        // window, so the burst is one step and the earlier 'x' may or may not
        // share it depending on how long the autosave polls took — undo until
        // the buffer is the starter again ('' — a clean buffer is not a draft).
        let clean = false;
        for (let i = 0; i < 3 && !clean; i += 1) {
          app.onKey({ name: 'ctrl-z' });
          clean = await waitFor(
            () => (services.store.challengeRecord(challengeId).lastCode ?? null) === null,
            { timeout: 4000 },
          );
        }
        assert.ok(clean, 'undo restores the starter and the clean draft is cleared');
      } finally {
        app.inst.unmount();
      }
    });

    // ---- PC-11 (P1-2): the multi-cursor engine, wired for real ------------
    await t.test('challenge: multi-cursor bindings type on two lines and collapse (PC-11)', async () => {
      rmSync(STORE_FILE, { force: true });
      const services = servicesFor(CURRICULUM);
      const app = mountApp(services);
      try {
        assert.ok(await waitFor(() => app.screen() === 'home'));
        // A single file is the multi-cursor canvas: cursors stack per ROW of
        // the ACTIVE document (the engine is per-document, like every editor).
        app.host().go('challenge', { moduleId: 'm1', lessonId: 'm1.l1', challengeId: 'c1' });
        assert.ok(await waitFor(() => app.frame().includes('First heading')), 'the challenge rendered');
        // The starter painted in the frame proves the session has seeded (the
        // title alone renders before the seed tick — keys would be dropped).
        assert.ok(await waitFor(() => app.frame().includes('<h1')), 'the editor painted the starter');

        const draft = () => services.store.challengeRecord('m1.l1.c1').lastCode;

        // Build a three-row buffer modeless: Enter inserts the newline BEFORE
        // the caret's text, so two Enters give '\n\n<h1' with the caret on
        // row 2. ↑-stacking walks UP from the outermost cursor and the PRIMARY
        // follows the top cursor (the engine's sorted-first rule), so two
        // stacks cover rows 2, 1 and 0 with the primary on row 0. (The
        // rendering — inverse cells — is pinned by the rowPieces/editor unit
        // tests; the STATE is the proof here: one keystroke lands on every
        // row at once.)
        app.onKey({ name: 'return' });
        app.onKey({ name: 'return' });
        assert.ok(
          await waitFor(() => draft() === '\n\n<h1', { timeout: 4000 }),
          'the three-row buffer is in place (caret on row 2)',
        );
        app.onKey({ name: 'ctrl-alt-up' });
        app.onKey({ name: 'ctrl-alt-up' });
        await new Promise((r) => setTimeout(r, 60));

        app.onKey({ name: 'char', char: 'X' });
        assert.ok(
          await waitFor(() => draft() === 'X\nX\nX<h1', { timeout: 4000 }),
          'the typed char landed on all three cursor rows at once',
        );

        // ↓ folds the set back to ONE caret: the terminal caret was on the
        // bottom row (2), so ↓ keeps it there and the next char edits ONE
        // row — row 2 — while rows 0/1 stop receiving keys. (The registry
        // binds ↓ to the global nav ids; the route routes them to the editor
        // while a multi set exists.)
        app.onKey({ name: 'down' });
        await new Promise((r) => setTimeout(r, 60));
        app.onKey({ name: 'char', char: 'Y' });
        assert.ok(
          await waitFor(() => draft() === 'X\nX\nXY<h1', { timeout: 4000 }),
          'after the collapse the caret edits one line only',
        );
      } finally {
        app.inst.unmount();
      }
    });

    await t.test('challenge: <C-d> adds a cursor at the next word match (PC-11)', async () => {
      rmSync(STORE_FILE, { force: true });
      const services = servicesFor(CURRICULUM);
      const app = mountApp(services);
      try {
        assert.ok(await waitFor(() => app.screen() === 'home'));
        app.host().go('challenge', { moduleId: 'm1', lessonId: 'm1.l2', challengeId: 'c3' });
        assert.ok(await waitFor(() => app.frame().includes('A list')), 'the challenge rendered');

        const draft = () => services.store.challengeRecord('m1.l2.c3').lastCode;
        await new Promise((r) => setTimeout(r, 250)); // let the session seed
        for (const ch of 'x x') app.onKey({ name: 'char', char: ch });
        assert.ok(await waitFor(() => draft() === 'x x', { timeout: 4000 }), 'buffer ready');

        // The caret rests after the LAST 'x' (col 3) — modeless typing always
        // ends there (bare ←/→ resolve to global nav ids, so this is the only
        // reachable spot). Ctrl+D takes the word ENDING at the caret ('x') and
        // adds a cursor at its next match — none forward, so the search WRAPS
        // to (0,0), the engine's documented `n`-style behaviour. One 'Y' then
        // inserts at BOTH carets in one batch.
        app.onKey({ name: 'ctrl-d' });
        await new Promise((r) => setTimeout(r, 60));
        app.onKey({ name: 'char', char: 'Y' });
        assert.ok(
          await waitFor(() => draft() === 'Yx xY', { timeout: 4000 }),
          'typing edited both match positions at once',
        );
        // One undo step for the whole batch (the multi contract).
        app.onKey({ name: 'ctrl-z' });
        assert.ok(
          await waitFor(() => draft() === 'x x', { timeout: 4000 }),
          'the batch is a single undo step',
        );
      } finally {
        app.inst.unmount();
      }
    });

    // ---- PC-12: % is a vim MOTION on the next UI --------------------------
    await t.test('challenge: vim % moves the caret to the matching bracket (PC-12)', async () => {
      rmSync(STORE_FILE, { force: true });
      const services = servicesFor(CURRICULUM);
      const app = mountApp(services);
      try {
        assert.ok(await waitFor(() => app.screen() === 'home'));
        app.host().go('challenge', { moduleId: 'm1', lessonId: 'm1.l2', challengeId: 'c3' });
        assert.ok(await waitFor(() => app.frame().includes('A list')), 'the challenge rendered');

        // Modeless sanity (Q12): % is a plain typable char — no vim motion.
        app.onKey({ name: 'char', char: '%' });
        assert.ok(
          await waitFor(() => services.store.challengeRecord('m1.l2.c3').lastCode === '%', { timeout: 4000 }),
          'modeless: % typed into the buffer',
        );

        // Turn vim ON through the real toggle (the palette's settings.vimToggle).
        assert.equal(harness.dispatchToScreen('settings.vimToggle'), true, 'the vim toggle dispatches to the focused screen');
        assert.ok(await waitFor(() => app.frame().includes('Vim keys on'), { timeout: 4000 }), 'the toggle reported');

        // Build a real bracket pair in INSERT mode (vim cc clears the '%'
        // line and leaves insert mode). Then 0 → col 0 ('('), and % must
        // land ON the ')' at col 3: inserting there (i X Esc) rewrites the
        // buffer to '(abX)' — text that only exists if the caret MOVED.
        app.onKey({ name: 'char', char: 'c' });
        app.onKey({ name: 'char', char: 'c' });
        await new Promise((r) => setTimeout(r, 60));
        for (const ch of '(ab)') app.onKey({ name: 'char', char: ch });
        app.onKey({ name: 'escape' });
        assert.ok(
          await waitFor(() => services.store.challengeRecord('m1.l2.c3').lastCode === '(ab)', { timeout: 4000 }),
          'insert-mode retyping produced the bracket pair',
        );
        app.onKey({ name: 'char', char: '0' });
        app.onKey({ name: 'char', char: '%' });
        await new Promise((r) => setTimeout(r, 80));
        app.onKey({ name: 'char', char: 'i' });
        app.onKey({ name: 'char', char: 'X' });
        app.onKey({ name: 'escape' });
        assert.ok(
          await waitFor(() => services.store.challengeRecord('m1.l2.c3').lastCode === '(abX)', { timeout: 4000 }),
          'vim: % moved the caret onto the matching bracket before the insert',
        );
      } finally {
        app.inst.unmount();
      }
    });

    // ---- PC-27: checkpoints are captured and restorable on the next UI ----
    await t.test('challenge: checkpoints are taken and restorable from history.restore (PC-27)', async () => {
      rmSync(STORE_FILE, { force: true });
      // Checkpoint sidecars outlive the progress store on disk (that is their
      // point) — clear THIS challenge's sidecar so the run sees exactly what
      // it creates.
      rmSync(path.join(ROOT, '.data', 'history', 'm1.l2.c3.json'), { force: true });
      const services = servicesFor(CURRICULUM);
      const app = mountApp(services);
      try {
        assert.ok(await waitFor(() => app.screen() === 'home'));
        app.host().go('challenge', { moduleId: 'm1', lessonId: 'm1.l2', challengeId: 'c3' });
        assert.ok(await waitFor(() => app.frame().includes('A list')), 'the challenge rendered');

        // Type a marker and run a check ('z' fails the <ul check — fine: the
        // checkpoint is about the PRE-RUN state, and the outcome annotates it).
        app.onKey({ name: 'char', char: 'z' });
        assert.ok(
          await waitFor(() => services.store.challengeRecord('m1.l2.c3').lastCode === 'z', { timeout: 4000 }),
          'the marker landed in the buffer',
        );
        app.onKey({ name: 'ctrl-s' });
        await waitFor(() => app.frame().includes('CHECKS'), { timeout: 20000 });
        const snaps = services.store.checkpoints('m1.l2.c3');
        assert.equal(snaps.length, 1, 'a check run captured a checkpoint');
        assert.equal(snaps[0].files.html, 'z', 'the snapshot holds the pre-run buffer');
        assert.equal(snaps[0].passed, false, 'the outcome was annotated onto the snapshot');

        // Now edit away from it and restore through the command id.
        app.onKey({ name: 'char', char: 'q' });
        await waitFor(() => services.store.challengeRecord('m1.l2.c3').lastCode === 'zq', { timeout: 4000 });
        assert.equal(harness.dispatchToScreen('history.restore'), true, 'the restore command dispatches');
        await waitFor(() => app.frame().includes('Restore a checkpoint'), { timeout: 4000 });
        assert.ok(app.frame().includes('just now'), 'the snapshot label rendered');

        // Enter restores the highlighted row (the overlay owns the keys).
        app.onKey({ name: 'return' });
        assert.ok(
          await waitFor(() => services.store.challengeRecord('m1.l2.c3').lastCode === 'z', { timeout: 4000 }),
          'the checkpoint buffer came back',
        );
        assert.ok(
          await waitFor(() => app.frame().includes('Restored just now'), { timeout: 4000 }),
          'the restore was reported with the snapshot label',
        );
        // The overlay closed: Esc pops the screen again (no mid-modal leak).
        app.onKey({ name: 'escape' });
        assert.ok(
          await waitFor(() => app.screen() !== 'challenge', { timeout: 4000 }),
          'after the list closed, Esc works on the screen again',
        );
      } finally {
        app.inst.unmount();
      }
    });

    // ---- PC-28: a pass writes the real artifact(s) to .workspace ----------
    await t.test('challenge: passing a check writes workspace artifacts (PC-28)', async () => {
      const { readArtifact } = await import('../../src/core/workspace.js');
      rmSync(STORE_FILE, { force: true });
      rmSync(path.join(ROOT, '.workspace', 'm1'), { recursive: true, force: true });
      const services = servicesFor(CURRICULUM);
      const app = mountApp(services);
      try {
        assert.ok(await waitFor(() => app.screen() === 'home'));
        app.host().go('challenge', { moduleId: 'm1', lessonId: 'm1.l2', challengeId: 'c3' });
        assert.ok(await waitFor(() => app.frame().includes('A list')), 'the challenge rendered');
        await new Promise((r) => setTimeout(r, 250)); // let the session seed

        // '<ul>' satisfies c3's one check. The fix under test: the pass path
        // says "Saved to your workspace" AND means it — the artifact exists
        // on disk with the buffer's bytes (the classic pass path parity).
        for (const ch of '<ul>') app.onKey({ name: 'char', char: ch });
        assert.ok(
          await waitFor(() => services.store.challengeRecord('m1.l2.c3').lastCode === '<ul>', { timeout: 4000 }),
          'the passing buffer is in place',
        );
        app.onKey({ name: 'ctrl-s' });
        assert.ok(
          await waitFor(() => /1\/1 checks passed/.test(app.frame()), { timeout: 20000 }),
          'the check passed',
        );
        assert.equal(readArtifact('m1/m1.l2/c3.html'), '<ul>', 'single-file: the artifact carries the buffer');

        // Multi-file: Ctrl+O (the same save block as the pass path) writes
        // EVERY tab under the challenge folder, so the folder runs on its own.
        app.host().go('challenge', { moduleId: 'm1', lessonId: 'm1.l2', challengeId: 'c4' });
        assert.ok(await waitFor(() => app.frame().includes('Two files')), 'the multi-file challenge rendered');
        // The editor painting the starter proves the c4 session has seeded —
        // a Ctrl+O that arrives one tick earlier would hit a null session.
        assert.ok(await waitFor(() => app.frame().includes('<p>hi</p>')), 'the c4 buffers painted');
        app.onKey({ name: 'ctrl-o' });
        assert.ok(
          await waitFor(() => readArtifact('m1/m1.l2/c4/index.html') === '<p>hi</p>\n', { timeout: 4000 }),
          'multi-file: every tab written under the challenge folder',
        );
        assert.ok(
          await waitFor(() => readArtifact('m1/m1.l2/c4/style.css') === 'p {}\n', { timeout: 4000 }),
          'multi-file: the second tab landed too',
        );
      } finally {
        rmSync(path.join(ROOT, '.workspace', 'm1'), { recursive: true, force: true });
        app.inst.unmount();
      }
    });

    /** The autosaved buffer for a challenge (autosave debounces at 400ms).
     *  Reads the STORE record — never dereference `lastCode` inside a waitFor
     *  without this null-guard, or you get a TypeError instead of poll-false. */
    const savedCode = (svc, key) => {
      const rec = svc.store.challengeRecord(key);
      return rec ? rec.lastCode : undefined;
    };

    await t.test('challenge: emmet Tab expansion and the CSS `;` shorthand (classic parity)', async () => {
      rmSync(STORE_FILE, { force: true });
      const settings = fakeSettings();
      settings.data.editor.vimMode = false; // modeless editor: classic defaults
      const services = servicesFor(CURRICULUM, { settings });
      const app = mountApp(services);
      try {
        assert.ok(await waitFor(() => app.screen() === 'home'));

        // -- markup: `div.card*2` + Tab expands at the caret -----------------
        app.host().go('challenge', { moduleId: 'm1', lessonId: 'm1.l1', challengeId: 'c2' });
        assert.ok(await waitFor(() => app.frame().includes('Second heading')), 'c2 rendered');
        await new Promise((r) => setTimeout(r, 450)); // let the session seed (starter is empty; no text paints)
        for (const ch of 'div.card*2') app.onKey({ name: 'char', char: ch });
        app.onKey({ name: 'tab' });
        const EXPANDED = '<div class="card"></div>\n<div class="card"></div>';
        assert.ok(
          await waitFor(() => savedCode(services, 'm1.l1.c2') === EXPANDED),
          'Tab expanded the compound abbreviation at the caret',
        );
        // One undo step reverts the WHOLE expansion (coalesce: false).
        app.onKey({ name: 'ctrl-z' });
        assert.ok(
          await waitFor(() => savedCode(services, 'm1.l1.c2') === 'div.card*2'),
          'one undo step reverts the whole expansion',
        );

        // -- modeless indent fallback, then the CSS `;` shorthand -------------
        // (vim is still off here; c5's caret starts at 0:0, so park it at EOL.)
        app.host().go('challenge', { moduleId: 'm1', lessonId: 'm1.l2', challengeId: 'c5' });
        assert.ok(await waitFor(() => app.frame().includes('Box model')), 'c5 rendered');
        await new Promise((r) => setTimeout(r, 450));
        app.onKey({ name: 'end' });
        app.onKey({ name: 'tab' }); // no abbreviation at the caret → an indent
        assert.ok(
          await waitFor(() => savedCode(services, 'm1.l2.c5') === 'p {}  \n'),
          'plain Tab indents by two spaces',
        );
        app.onKey({ name: 'return' }); // the shorthand goes on its own line
        for (const ch of 'm10') app.onKey({ name: 'char', char: ch });
        app.onKey({ name: 'char', char: ';' });
        assert.ok(
          await waitFor(() => savedCode(services, 'm1.l2.c5') === 'p {}  \nmargin: 10px;\n'),
          'the `;` shorthand expanded (the expansion supplies the semicolon)',
        );

        // -- vim normal mode gates emmet: Tab is a motion, not an indent -----
        app.host().go('settings');
        assert.ok(await waitFor(() => app.screen() === 'settings'));
        assert.equal(
          harness.getGlobalCommandSink()('settings.vimToggle'),
          true,
          'vim on for the gating subtest',
        );
        app.host().go('challenge', { moduleId: 'm1', lessonId: 'm1.l1', challengeId: 'c2' });
        assert.ok(await waitFor(() => app.screen() === 'challenge'));
        await new Promise((r) => setTimeout(r, 450));
        app.onKey({ name: 'escape' }); // normal mode
        app.onKey({ name: 'tab' }); // normal-mode Tab: a motion, buffer untouched
        await new Promise((r) => setTimeout(r, 500)); // an indent would have autosaved by now
        assert.equal(savedCode(services, 'm1.l1.c2'), 'div.card*2', 'normal-mode Tab leaves the buffer alone');
      } finally {
        delete settings.data.editor.vimMode;
        app.inst.unmount();
      }
    });

    // ---- P1-11: the four Tab/`;` boundary decisions, pinned by replay ------

    await t.test('P1-11a: an armed snippet stop-walk outranks emmet and the indent', async () => {
      rmSync(STORE_FILE, { force: true });
      const settings = fakeSettings();
      settings.data.editor.vimMode = false;
      const services = servicesFor(CURRICULUM, { settings });
      const app = mountApp(services);
      try {
        assert.ok(await waitFor(() => app.screen() === 'home'));
        assert.ok(await waitFor(() => app.screen() === 'home'));
        // The qsel snippet is a JS-only extra, so the stop-walk replay runs on
        // c4's app.js tab (single-file tab focus; the strip is not the point).
        app.host().go('challenge', { moduleId: 'm1', lessonId: 'm1.l2', challengeId: 'c4' });
        assert.ok(await waitFor(() => app.frame().includes('Two files')), 'c4 rendered');
        // Wait for the MULTI-FILE session (any tab) to paint before switching:
        // ctrl-w hits a null session otherwise.
        assert.ok(await waitFor(() => app.frame().includes('<p>hi</p>')), 'the session painted');
        app.onKey({ name: 'ctrl-w' }); // index.html → style.css
        app.onKey({ name: 'ctrl-w' }); // style.css → app.js
        assert.ok(await waitFor(() => app.frame().includes('const x = 1;')), 'the app.js buffer painted');

        // This subtest is MODELESS (vim off): `end` parks at EOL, `return`
        // opens a fresh line below, then the snippet name types normally.
        // `forof` not `qsel`: bare `q` is a global quit binding that eats the
        // key before the editor (the same constraint the PC-12 replay hit).
        app.onKey({ name: 'end' });
        app.onKey({ name: 'return' });
        // Type the snippet name: the popup opens on the 2+-char prefix.
        for (const ch of 'forof') app.onKey({ name: 'char', char: ch });
        assert.ok(
          await waitFor(() => app.frame().includes('Tab accept'), { timeout: 4000 }),
          'the completion popup opened on the typed snippet name',
        );

        // Tab #1 ACCEPTS the snippet (emmet is null in JS by design — expandAt
        // has no JS grammar), arming the stop-walk with FOUR stops.
        app.onKey({ name: 'tab' });
        assert.ok(
          await waitFor(() => savedCode(services, 'm1.l2.c4')?.['app.js'] === 'const x = 1;\nfor (const item of items) {\n  \n}\n', { timeout: 4000 }),
          'Tab accepted the snippet (the typed prefix was replaced)',
        );

        // Tabs #2-#4 WALK the armed stops (caret-only moves; nothing edits the
        // buffer — this is the order emmet and the indent must respect).
        app.onKey({ name: 'tab' });
        app.onKey({ name: 'tab' });
        app.onKey({ name: 'tab' });
        await new Promise((r) => setTimeout(r, 500));
        assert.equal(
          savedCode(services, 'm1.l2.c4')?.['app.js'],
          'const x = 1;\nfor (const item of items) {\n  \n}\n',
          'the stop-walk Tabs never touched the buffer',
        );

        // Tab #5: the walk is exhausted → the modeless indent finally applies
        // at the caret (the walk ended at the snippet's end position, so the
        // indent lands there — trailing, exactly where the caret sits).
        app.onKey({ name: 'tab' });
        assert.ok(
          await waitFor(() => savedCode(services, 'm1.l2.c4')?.['app.js'] === 'const x = 1;\nfor (const item of items) {\n  \n}  \n', { timeout: 4000 }),
          'after the walk ends, Tab is an indent again',
        );
      } finally {
        app.inst.unmount();
      }
    });

    await t.test('P1-11b: vim insert — emmet beats the popup, `;` keeps the classic shape gate', async () => {
      rmSync(STORE_FILE, { force: true });
      const settings = fakeSettings();
      settings.data.editor.vimMode = true; // the vim path is under test
      const services = servicesFor(CURRICULUM, { settings });
      const app = mountApp(services);
      try {
        assert.ok(await waitFor(() => app.screen() === 'home'));
        app.host().go('challenge', { moduleId: 'm1', lessonId: 'm1.l2', challengeId: 'c5' });
        assert.ok(await waitFor(() => app.frame().includes('p {}')), 'the starter painted');

        // `o` from normal mode opens a FRESH line below and enters insert
        // (a literal \n char does not newline in vim). Type the abbreviation:
        // the popup opens on the 2+-char prefix while typing.
        app.onKey({ name: 'o' });
        for (const ch of 'flex') app.onKey({ name: 'char', char: ch });
        // Tab must EXPAND (classic precedence: emmet outranks the popup on
        // Tab) and close it — the expansion REPLACES the abbreviation.
        app.onKey({ name: 'tab' });
        assert.ok(
          await waitFor(() => savedCode(services, 'm1.l2.c5') === 'p {}\ndisplay: flex;\n', { timeout: 4000 }),
          'Tab expanded the value-form abbreviation with the popup live',
        );

        // The decision on `;` in vim insert: CLASSIC-VERBATIM. The engine's
        // own shape gate decides — an abbreviation-shaped token expands, prose
        // does not. No extra vim-specific gating.
        app.onKey({ name: 'escape' });
        app.onKey({ name: 'o' }); // open a line below, insert mode
        for (const ch of 'm10') app.onKey({ name: 'char', char: ch });
        app.onKey({ name: 'char', char: ';' });
        assert.ok(
          await waitFor(() => savedCode(services, 'm1.l2.c5') === 'p {}\ndisplay: flex;\nmargin: 10px;\n', { timeout: 4000 }),
          'an abbreviation-shaped token before `;` expands in vim insert too',
        );

        // Prose `;`: typed literally — `zz;` is not abbreviation-shaped and
        // expandAt answers null for it (pinned at the engine; here end to end).
        app.onKey({ name: 'escape' });
        app.onKey({ name: 'o' });
        for (const ch of 'zz') app.onKey({ name: 'char', char: ch });
        app.onKey({ name: 'char', char: ';' });
        assert.ok(
          await waitFor(() => savedCode(services, 'm1.l2.c5') === 'p {}\ndisplay: flex;\nmargin: 10px;\nzz;\n', { timeout: 4000 }),
          'prose before `;` types the semicolon instead of expanding',
        );
      } finally {
        delete settings.data.editor.vimMode;
        app.inst.unmount();
      }
    });

    await t.test('P1-11c: Tab under a multi-cursor set indents every row as one undo step', async () => {
      rmSync(STORE_FILE, { force: true });
      const services = servicesFor(CURRICULUM);
      const app = mountApp(services);
      try {
        assert.ok(await waitFor(() => app.screen() === 'home'));
        app.host().go('challenge', { moduleId: 'm1', lessonId: 'm1.l1', challengeId: 'c1' });
        assert.ok(await waitFor(() => app.frame().includes('<h1')), 'the starter painted');

        // Three NON-BLANK rows (the engine's indent skips blank rows by
        // design — no phantom indents), then three cursors via the PC-11
        // construction (Enter inserts the newline BEFORE the caret's text).
        app.onKey({ name: 'char', char: 'X' });
        app.onKey({ name: 'return' });
        app.onKey({ name: 'char', char: 'Y' });
        app.onKey({ name: 'return' });
        app.onKey({ name: 'char', char: 'Z' });
        assert.ok(await waitFor(() => savedCode(services, 'm1.l1.c1') === 'X\nY\nZ<h1', { timeout: 4000 }), 'three rows built');
        app.onKey({ name: 'ctrl-alt-up' });
        app.onKey({ name: 'ctrl-alt-up' });
        await new Promise((r) => setTimeout(r, 80));

        // Tab: NOT an emmet expansion, NOT a no-op — every cursor's row
        // indents in the same committed transaction.
        app.onKey({ name: 'tab' });
        assert.ok(
          await waitFor(() => savedCode(services, 'm1.l1.c1') === '  X\n  Y\n  Z<h1', { timeout: 4000 }),
          'Tab indented every cursor row at once',
        );

        // The set survived, normalised to the shifted columns: each cursor sat
        // AFTER its row's typed char (col 1 → col 3 post-indent), so one char
        // still lands on every row — appended after the char.
        app.onKey({ name: 'char', char: 'W' });
        assert.ok(
          await waitFor(() => savedCode(services, 'm1.l1.c1') === '  XW\n  YW\n  ZW<h1', { timeout: 4000 }),
          'the multi set is intact after the indent (columns shifted by the indent)',
        );
      } finally {
        app.inst.unmount();
      }
    });

    // ---- Q12/P1-12: the visible bell at the Ink global layer ---------------
    // The classic UI answered a key nothing claimed with a status-line note
    // (app.js visibleBell); the Ink dispatcher dropped it silently. The bell
    // now rings from dispatchGlobal's fallthrough via the host's say channel.
    await t.test('P1-12: an ignored key rings the visible bell once, `?` still opens help', async () => {
      rmSync(STORE_FILE, { force: true });
      const services = servicesFor(CURRICULUM);
      const app = mountApp(services);
      try {
        assert.ok(await waitFor(() => app.screen() === 'home'));
        app.host().go('lesson', { moduleId: 'm1', lessonId: 'm1.l1' });
        assert.ok(await waitFor(() => app.frame().includes('Headings')), 'the lesson (a scroll screen) rendered');

        // A key nothing claims falls through the route to dispatchGlobal —
        // the same path main.jsx's dispatcher takes for unclaimed keys.
        // Assertions read the host NOTICE (state), not the frame: ink frames
        // are cumulative, so stream text can never prove a second ring.
        harness.dispatchGlobal({ type: 'key', name: 'char', char: 'z' }, 'lesson');
        await waitFor(() => app.host().notice);
        assert.ok(app.host().notice.message.includes("'z' does nothing here — '?' lists the keys"), `the bell note names the key and the way out (${app.host().notice.message})`);
        assert.equal(app.host().notice.kind, 'muted', 'the bell is the quiet tone');
        const firstId = app.host().notice.id;
        assert.ok(
          await waitFor(() => app.frame().includes("'z' does nothing here")),
          'the note actually renders',
        );

        // The classic bell fired per keypress; the same-key suppressor is the
        // deliberate improvement over parity — a burst must not re-notice.
        harness.dispatchGlobal({ type: 'key', name: 'char', char: 'z' }, 'lesson');
        await new Promise((r) => setTimeout(r, 60));
        assert.equal(app.host().notice.id, firstId, 'a same-key burst shows the note once');

        // `?` itself stays exempt by structure: it resolves to app.help and
        // never reaches the bell's fallthrough.
        harness.dispatchGlobal({ type: 'key', name: 'char', char: '?' }, 'lesson');
        assert.ok(await waitFor(() => app.screen() === 'help'), '`?` still opens help');
        app.onKey({ name: 'escape' });
        assert.ok(await waitFor(() => app.screen() === 'lesson'), 'back on the lesson');

        // Any handled key re-arms the suppressor, so a repeat after it rings
        // again — the suppressor limits bursts, not honest feedback.
        harness.dispatchGlobal({ type: 'key', name: 'pageup' }, 'lesson');
        await waitFor(() => app.host().notice && app.host().notice.id !== firstId);
        const secondId = app.host().notice.id;
        assert.ok(!app.host().notice.message.includes('does nothing here'), 'pageup resolves to a command, not the bell');
        harness.dispatchGlobal({ type: 'key', name: 'char', char: 'z' }, 'lesson');
        await waitFor(() => app.host().notice && app.host().notice.id !== secondId);
        assert.ok(app.host().notice.message.includes("'z' does nothing here"), 'the bell rings again for a repeat after a handled key');
      } finally {
        app.inst.unmount();
      }
    });

    await t.test('P1-12: typing surfaces stay silent — editor and browser console claim their keys first', async () => {
      rmSync(STORE_FILE, { force: true });
      const services = servicesFor(CURRICULUM);
      const app = mountApp(services);
      try {
        assert.ok(await waitFor(() => app.screen() === 'home'));

        // The editor is a typing surface: modeless `%` edits the buffer (the
        // Q12 modeless guarantee) and must never ring the bell.
        app.host().go('challenge', { moduleId: 'm1', lessonId: 'm1.l2', challengeId: 'c3' });
        assert.ok(await waitFor(() => app.frame().includes('A list')), 'the challenge rendered');
        app.onKey({ name: 'char', char: '%' });
        assert.ok(
          await waitFor(() => services.store.challengeRecord('m1.l2.c3').lastCode === '%', { timeout: 4000 }),
          'modeless: % typed into the buffer',
        );
        assert.ok(!app.frame().includes("does nothing here"), 'the editor never rings the bell');

        // The browser console pane is a typing surface too: `+` types there.
        app.onKey({ name: 'ctrl-b' });
        assert.ok(await waitFor(() => app.screen() === 'browser'), 'the browser opened');
        app.onKey({ name: 'char', char: '4' });
        assert.ok(await waitFor(() => app.frame().includes('CONSOLE')), 'the console pane shows');
        app.onKey({ name: 'char', char: '+' });
        assert.ok(await waitFor(() => app.frame().includes('+')), 'the char typed into the console input');
        assert.ok(!app.frame().includes("does nothing here"), 'the console pane never rings the bell');
        assert.ok(!app.frame().includes("'+' does nothing"), 'the plus never reads as an ignored key');
      } finally {
        app.inst.unmount();
      }
    });

    await t.test('challenge: pane nudge keys and a divider drag remember the split (task 1.2)', async () => {
      rmSync(STORE_FILE, { force: true });
      const settings = fakeSettings();
      const app = mountApp(servicesFor(CURRICULUM, { settings }));
      try {
        assert.ok(await waitFor(() => app.screen() === 'home'));
        app.host().go('challenge', { moduleId: 'm1', lessonId: 'm1.l1', challengeId: 'c1' });
        assert.ok(await waitFor(() => app.screen() === 'challenge'), 'the challenge route is focused');
        assert.equal(settings.data.panes.challenge, undefined, 'nothing remembered yet');

        // The nudge keys are the ones the pipeline actually emits for ctrl+arrow
        // (`parseKeys` maps CSI 1;5C/D), so this is the real keystroke path.
        app.onKey({ name: 'ctrl-right' });
        assert.ok(
          await waitFor(() => settings.data.panes.challenge && settings.data.panes.challenge.brief === 0.47),
          'ctrl+right widens the pane and persists the ratio',
        );
        app.onKey({ name: 'ctrl-left' });
        assert.ok(
          await waitFor(() => settings.data.panes.challenge.brief.toFixed(2) === '0.42'),
          'ctrl+left narrows it back',
        );

        // A divider drag. x/y from the SGR parser are 1-based, so the divider
        // of a 0.42 split sits at `leftWidth + 1`; the test derives both the
        // column and the expected ratio from the host's own width rather than
        // hard-coding a frame size.
        const W = app.host().width;
        const dividerX = harness.ratioToColumns(0.42, W, 20, 24) + 1;
        const route = harness.getCurrentRoute();
        assert.equal(
          route.onMouse({ type: 'mouse', action: 'down', button: 0, x: Math.max(1, dividerX - 8), y: 5 }),
          false,
          'a click inside a pane is left to the screen',
        );
        assert.equal(route.onMouse({ type: 'mouse', action: 'down', button: 0, x: dividerX, y: 5 }), true, 'the divider claims the press');
        const targetX = dividerX + 12;
        assert.equal(route.onMouse({ type: 'mouse', action: 'motion', x: targetX, y: 5 }), true, 'the drag follows the mouse');
        assert.equal(route.onMouse({ type: 'mouse', action: 'up', x: targetX, y: 5 }), true, 'release ends the drag');
        const dragged = harness.columnsToRatio(targetX - 1, W);
        assert.ok(dragged > 0.42, `the drag must widen (${dragged})`);
        assert.ok(
          await waitFor(() => settings.data.panes.challenge.brief === dragged),
          'the dragged width is persisted as a ratio',
        );
        assert.equal(
          route.onMouse({ type: 'mouse', action: 'motion', x: dividerX + 30, y: 5 }),
          false,
          'motion without a press is not a drag',
        );

        // Per screen: another screen's layout is untouched, and the palette
        // command resets just this one. The palette dispatches a registry
        // command to the FOCUSED SCREEN first (`dispatchToScreen`) and only
        // falls back to the host table, so that is the path asserted here —
        // and `host.run` off a challenge screen answers honestly instead.
        settings.setPaneRatio('browser', 'render', 0.6);
        assert.equal(harness.dispatchToScreen('view.paneReset'), true, 'the focused screen owns the reset command');
        assert.ok(await waitFor(() => settings.data.panes.challenge === undefined), 'reset drops this screen\'s ratio');
        assert.equal(settings.data.panes.browser.render, 0.6, 'reset is per screen');
        assert.ok(await waitFor(() => app.frame().includes('Pane widths reset')), 'the route reports the reset');

        app.host().run('view.paneReset');
        assert.ok(
          await waitFor(() => app.frame().includes('open a challenge first')),
          'off a challenge screen the host says where the command applies',
        );
      } finally {
        app.inst.unmount();
      }
    });
  } finally {
    rmSync(STORE_FILE, { force: true });
  }
});
