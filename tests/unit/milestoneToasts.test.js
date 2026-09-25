/**
 * Q5 milestone toasts on the Ink UI (errors-and-qol-spec Q5, Phase 4 parity).
 *
 * The contract:
 *   - `milestoneLabel`/`milestoneToast` (src/ui/milestones.js) turn fresh
 *     `takeMilestones()` ids into the toast line, icon-aware so the ascii set
 *     keeps tier D 7-bit;
 *   - the classic pass path (src/app.js) appends the SAME text via the same
 *     helper (single source, like preferences.js);
 *   - the Ink challenge route (src/ui/routes.jsx) shows it as a toast after a
 *     pass — exactly once, because takeMilestones marks ids seen (and saves
 *     them, so a milestone cannot re-fire in a later session either).
 *
 * The integration test drives the REAL ChallengeRoute: it seeds a 6-day streak
 * dated yesterday plus the known-good solution into a real Store, checks with
 * Ctrl+S, and expects the toast as the streak rolls to 7 — then proves a
 * second check and a whole second session never re-fire it.
 *
 * Run: node --test tests/unit/milestoneToasts.test.js  (needs dist/harness.js)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import '../helpers/runner-env.js';

const ROOT = process.cwd();

async function waitFor(fn, { timeout = 8000, step = 20 } = {}) {
  const start = Date.now();
  for (;;) {
    const value = fn();
    if (value) return value;
    if (Date.now() - start > timeout) return null;
    await new Promise((r) => setTimeout(r, step));
  }
}

test('milestone helpers: labels, toast line, icon-awareness', async (t) => {
  const { milestoneLabel, milestoneToast } = await import('../../src/ui/milestones.js');
  const { ICON_SETS } = await import('../../src/ui/theme/icons.js');

  await t.test('labels for every milestone kind settings.takeMilestones emits', () => {
    assert.equal(milestoneLabel('streak-7'), '7-day streak!');
    assert.equal(milestoneLabel('streak-100'), '100-day streak!');
    assert.equal(milestoneLabel('best-12'), 'new best streak: 12 days');
    assert.equal(milestoneLabel('module-html-50'), 'html 50% complete');
    assert.equal(milestoneLabel('module-html-basics-100'), 'html-basics 100% complete');
    // Unknown ids degrade to themselves rather than throwing — a new milestone
    // kind added in settings.js still surfaces.
    assert.equal(milestoneLabel('future-kind-x'), 'future-kind-x');
  });

  await t.test('toast takes the FIRST fresh milestone; nothing fresh is empty', () => {
    assert.equal(milestoneToast([]), '');
    assert.equal(milestoneToast(null), '');
    assert.equal(milestoneToast(undefined), '');
    assert.equal(milestoneToast(['streak-7', 'best-7']), '★ 7-day streak!');
  });

  await t.test('the ascii set keeps the toast 7-bit', () => {
    const line = milestoneToast(['streak-7'], ICON_SETS.ascii);
    assert.equal(line, '* 7-day streak!');
    for (const ch of line) assert.ok(ch.codePointAt(0) <= 0x7e, `non-ASCII glyph ${ch}`);
  });
});

// (The "classic pass path uses the same shared helper" source-read replay
// died with the classic UI in the Phase 4 flip — the Ink route subtest below
// pins the toast end-to-end through the real route.)

test('Ink route: a passing check fires the milestone toast exactly once', async (t) => {
  const harnessPath = path.join(ROOT, 'dist', 'harness.js');
  if (!existsSync(harnessPath)) {
    t.skip('needs built harness (npm run build)');
    return;
  }
  const harness = await import(pathToFileURL(harnessPath).href);
  const helper = await import(pathToFileURL(path.join(ROOT, 'tests/helpers/snapshot.js')).href);
  const { Store } = await import(pathToFileURL(path.join(ROOT, 'src/core/store.js')).href);
  const { Settings } = await import(pathToFileURL(path.join(ROOT, 'src/ui/settings.js')).href);
  const { curriculum } = await import(pathToFileURL(path.join(ROOT, 'src/content/index.js')).href);

  // The m1 debugging challenge with a known-good solution in the curriculum.
  const found = (() => {
    for (const m of curriculum) {
      for (const lesson of m.lessons) {
        const hit = (lesson.challenges || []).find((c) => c.id === 'fix-skeleton');
        if (hit) return { moduleId: m.id, lessonId: lesson.id, challenge: hit };
      }
    }
    throw new Error('curriculum changed: fix-skeleton missing');
  })();
  const challengeKey = `${found.lessonId}.${found.challenge.id}`;
  const routeParams = { moduleId: found.moduleId, lessonId: found.lessonId, challengeId: found.challenge.id };

  const dir = path.join(ROOT, '.data', 'milestone-toast-test');
  mkdirSync(dir, { recursive: true });
  const storeFile = path.join(dir, 'progress.json');
  const settingsFile = path.join(dir, 'settings.json');
  rmSync(storeFile, { force: true });
  rmSync(settingsFile, { force: true });

  // A 6-day streak dated yesterday: the pass's touch() rolls it to 7 and sets
  // best=7 — the exact moment `streak-7` and `best-7` become earnable.
  const yesterday = new Date(Date.now() - 86400000);
  const y = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  function mount() {
    const box = { host: null };
    function Probe() {
      box.host = harness.useHost();
      return harness.el(harness.Text, null, '');
    }
    const store = new Store(storeFile);
    if (!store.data.streak?.lastDay) {
      // Only the first mount seeds the streak; the second mount reads the
      // rolled state back from disk (that is the point of the remount).
      store.data.streak = { current: 6, best: 6, lastDay: y(yesterday) };
      store.save();
    }
    // Seed the known-good solution as the saved draft, so the session boots
    // holding it (the route seeds lastCode → starter) and one Ctrl+S passes.
    // Idempotent: the second mount's record already carries it.
    const rec = store.challengeRecord(challengeKey);
    if (!rec.lastCode) {
      rec.lastCode = found.challenge.solution;
      store.data.challenges[challengeKey] = rec;
      store.save();
    }
    const settings = new Settings(settingsFile);
    const services = harness.createServices({
      store,
      curriculum,
      settings,
      overall: { modules: curriculum.length, challenges: 10 },
      lessonIndex: curriculum.flatMap((m) => m.lessons.map((lesson) => ({ module: m, lesson }))),
    });

    function App() {
      return harness.el(
        harness.ServicesProvider,
        { services },
        harness.el(
          harness.RouterProvider,
          { screens: { challenge: harness.ChallengeRoute }, initial: { name: 'challenge', params: routeParams } },
          harness.el(
            harness.CommandHost,
            { onQuit: () => {} },
            harness.el(harness.Box, { flexDirection: 'column' },
              harness.el(harness.RouterView, {}),
              harness.el(Probe, {})),
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
    // Spy on the host's toast channel: every say() call is recorded, so the
    // "exactly once" claim is observable even though a toast stays on screen
    // until replaced (the frame alone could not tell shown from re-fired).
    const sayCalls = [];
    const waitForMount = waitFor(() => box.host, { timeout: 4000 }).then(() => {
      const original = box.host.say;
      box.host.say = (message, kind) => {
        sayCalls.push({ message, kind });
        return original(message, kind);
      };
    });
    return {
      inst,
      store,
      settings,
      sayCalls,
      ready: waitForMount,
      frame: () => helper.stripAnsi(out.chunks.join('')),
      check: () => harness.getCurrentRoute().onKey({ name: 'ctrl-s' }),
    };
  }

  try {
    // ---- Session 1: the pass crosses the streak boundary ------------------
    const app1 = mount();
    try {
      await app1.ready;
      // The seeded draft is the known-good solution; seeing it painted proves
      // both the challenge screen and the session seed.
      assert.ok(await waitFor(() => app1.frame().includes('<!DOCTYPE')), 'the challenge rendered with the solution draft seeded');

      app1.check();
      assert.ok(
        await waitFor(() => app1.frame().includes('7-day streak!'), { timeout: 10000 }),
        'the pass rolled the streak to 7 and the toast fired',
      );
      assert.ok(
        app1.sayCalls.some((c) => c.message === '★ 7-day streak!' && c.kind === 'ok'),
        'the toast went through the host toast channel, kind ok',
      );
      assert.equal(app1.sayCalls.length, 1, 'exactly one toast for the two fresh milestones');

      // The second check on the same mount must not re-fire: takeMilestones
      // marked streak-7/best-7 seen (and the pass path re-runs takeMilestones).
      app1.check();
      await waitFor(() => app1.frame().includes('5/5'), { timeout: 10000 }); // settle the second run
      await new Promise((r) => setTimeout(r, 50));
      assert.equal(app1.sayCalls.length, 1, 'the toast fired once, not once per passing check');

      // ...and the seen-markers were persisted for future sessions.
      const saved = JSON.parse(readFileSync(settingsFile, 'utf8'));
      assert.ok(saved.milestonesSeen.includes('streak-7'), 'streak-7 persisted as seen');
      assert.ok(saved.milestonesSeen.includes('best-7'), 'best-7 persisted as seen');
      assert.equal(app1.store.stats(curriculum).streak.current, 7, 'the streak rolled 6 → 7');
    } finally {
      app1.inst.unmount();
    }

    // ---- Session 2: a whole new mount (new Store + Settings instances on the
    // same files) must not celebrate the already-seen milestones again. ------
    const app2 = mount();
    try {
      await app2.ready;
      assert.ok(await waitFor(() => app2.frame().includes('<!DOCTYPE')), 'the persisted solution re-seeded the session');
      app2.check();
      await waitFor(() => app2.frame().includes('5/5'), { timeout: 10000 });
      await new Promise((r) => setTimeout(r, 50));
      assert.equal(app2.sayCalls.length, 0, 'no milestone toast in a new session: seen means seen');
    } finally {
      app2.inst.unmount();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
