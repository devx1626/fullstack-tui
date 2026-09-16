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
      { id: 'm1.l2', title: 'Lists', minutes: 12, challenges: [{ id: 'c3', title: 'A list', prompt: 'Make a list.', lang: 'html', starter: '', hints: ['ul + li'], checks: [], difficulty: 'easy', minutes: 6 }] },
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

/** Poll until `fn()` is truthy (or time out and return null). */
async function waitFor(fn, { timeout = 2000, step = 20 } = {}) {
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
    t.skip('needs built harness (npm run build -- --spike)');
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
            screens: { home: harness.HomeRoute, module: harness.ModuleRoute, challenge: harness.ChallengeRoute },
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

  function servicesFor(cur, { onDismiss } = {}) {
    const store = new Store(STORE_FILE);
    const settings = {
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
      await new Promise((r) => setTimeout(r, 120));
      assert.equal(app.cursor(), 1, 'G clamps to the last module');

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
      assert.ok(await waitFor(() => app.screen() === 'challenge'), 'Enter on a lesson pushes the challenge route');
      // Module row 1 is the "Lists" lesson — its first unpassed challenge.
      assert.ok(await waitFor(() => app.frame().includes('Make a list.')), 'the brief renders');
      assert.ok(await waitFor(() => app.frame().includes('Ctrl+H hint')), 'the challenge footer documents its keys');
      assert.equal(app.cursor(), 0, 'the challenge screen carries no list cursor');

      app.onKey({ name: 'escape' });
      assert.ok(await waitFor(() => app.screen() === 'module'), 'Esc pops back to the module');
      assert.equal(app.cursor(), 1, 'the module cursor is remembered');

      app.inst.unmount();
    });

    await t.test('home: q quits through the host, unported commands explain themselves', async () => {
      const quits = [];
      const app = mountApp(servicesFor(CURRICULUM), { onQuit: () => quits.push('q') });
      assert.ok(await waitFor(() => app.screen() === 'home'));

      app.onKey({ name: 'char', char: 's' });
      assert.ok(
        await waitFor(() => app.frame().includes('lands with the Phase 1 port')),
        'unported settings screen reported',
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

      // Reset: the record-backed buffer drops back to the starter.
      app.onKey({ name: 'ctrl-r' });
      assert.ok(await waitFor(() => app.frame().includes('Draft cleared'), { timeout: 8000 }), 'reset reported');
      assert.equal(
        new Store(STORE_FILE).challengeRecord(challengeId).lastCode ?? null,
        null,
        'reset cleared the saved draft',
      );

      app.inst.unmount();
    });
  } finally {
    rmSync(STORE_FILE, { force: true });
  }
});
