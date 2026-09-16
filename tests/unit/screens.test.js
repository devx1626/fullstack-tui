/**
 * Screen port tests: view-models + home/module components (Phase 1).
 * Run: node --test tests/unit/screens.test.js  (needs dist/harness.js)
 *
 * Uses the awaited-subtest structure (see challengeScreen.test.js) to stay
 * immune to the node:test collection race with top-level awaits.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Minimal store double covering the view-model contract. */
function fakeStore({ passed = [], read = [] } = {}) {
  return {
    isPassed: (id) => passed.includes(id),
    isLessonRead: (id) => read.includes(id),
    projectProgress: (id, checks) => (checks || []).filter((c) => passed.includes(`${id}.${c.id}`)).length,
    todayMinutes: () => 25,
    weekMinutes: () => 210,
    activity: () => [],
  };
}

const CURRICULUM = [
  {
    id: 'm1', badge: 'HT', title: 'HTML Basics', tagline: 'structure first',
    hours: 6,
    source: { course: 'c', url: 'u', roadmap: 'r', docs: 'd' },
    lessons: [
      { id: 'm1.l1', title: 'Headings', minutes: 10, challenges: [{ id: 'c1', kind: 'debug' }, { id: 'c2', kind: 'write' }] },
      { id: 'm1.l2', title: 'Lists', minutes: 12, challenges: [{ id: 'c3', kind: 'write' }] },
    ],
    project: { id: 'm1.p', title: 'Portfolio page', minutes: 45, checks: [{ id: 'k1' }, { id: 'k2' }] },
  },
  {
    id: 'm2', badge: 'PY', title: 'Python', tagline: 'scripts',
    hours: 4,
    source: { course: 'c', url: 'u', roadmap: 'r', docs: 'd' },
    lessons: [{ id: 'm2.l1', title: 'Vars', minutes: 9, challenges: [{ id: 'c1', kind: 'write' }] }],
  },
];

test('home + module screens', async (t) => {
  const harnessPath = new URL('../../dist/harness.js', import.meta.url).pathname;
  const harness = existsSync(harnessPath) ? await import(pathToFileURL(harnessPath).href) : null;
  const helper = await import(pathToFileURL(new URL('../helpers/snapshot.js', import.meta.url).pathname));
  if (!harness) {
    t.skip('needs built harness (npm run build -- --spike)');
    return;
  }
  const renderToText = (el) => helper.renderToText(el, { render: harness.render });
  const strip = helper.stripAnsi;

  await t.test('view-model: chips, meters, banner, resume row', () => {
    const store = fakeStore({ passed: ['m1.l1.c1', 'm1.l1.c2', 'm1.l2.c3'], read: ['m1.l1', 'm1.l2'] });
    // stats() is a Store method; emulate it minimally rather than import it.
    const perModule = CURRICULUM.map((mod) => {
      const challenges = mod.lessons.reduce((n, l) => n + l.challenges.length, 0);
      const challengesPassed = mod.lessons.reduce((n, l) => n + l.challenges.filter((c) => store.isPassed(`${l.id}.${c.id}`)).length, 0);
      return { id: mod.id, challenges, challengesPassed, percent: Math.round((challengesPassed / challenges) * 100), lessonsRead: mod.lessons.filter((l) => store.isLessonRead(l.id)).length };
    });
    const stats = { totals: { challenges: 4, challengesPassed: 3, debug: 1, debugPassed: 1, write: 3, writePassed: 2 }, perModule, streak: { current: 3, best: 9 } };

    const settings = { bannerVisible: (s) => s.current > 0 && s.current < 5 };
    // Resume targets m1.l2 — but everything in m1 is passed in this fixture,
    // so the model walks forward to the first UNPASSED challenge (m2.l1.c1).
    const vm = harness.homeViewModel({
      curriculum: CURRICULUM,
      stats,
      overall: { modules: 2, challenges: 4 },
      store,
      settings,
      resumeTarget: () => ({ lessonId: 'm2.l1', moduleId: 'm2' }),
      lessonIndex: CURRICULUM.flatMap((m) => m.lessons.map((lesson) => ({ module: m, lesson }))),
    });

    assert.equal(vm.headline.modules, 2);
    assert.deepEqual(vm.banner, { current: 3 });
    assert.equal(vm.resume.moduleTitle, 'Python');
    assert.equal(vm.resume.challengeId, 'c1'); // first unpassed
    const m1 = vm.modules.find((m) => m.id === 'm1');
    assert.equal(m1.done, 3);
    assert.equal(m1.total, 3);
    assert.equal(m1.percent, 100);
    assert.equal(vm.chips.find((c) => c.label === 'minutes today').value, 25);
  });

  await t.test('view-model: no banner when hidden, no resume when solved', () => {
    const store = fakeStore({ passed: [], read: [] });
    const vm = harness.homeViewModel({
      curriculum: CURRICULUM,
      stats: { totals: { challenges: 4, challengesPassed: 4, debug: 1, debugPassed: 1, write: 3, writePassed: 3 }, perModule: [], streak: { current: 0, best: 0 } },
      overall: { modules: 2, challenges: 4 },
      store,
      settings: { bannerVisible: () => false },
      resumeTarget: () => null,
      lessonIndex: [],
    });
    assert.equal(vm.banner, null);
    assert.equal(vm.resume, null);
  });

  await t.test('module view-model: status marks + project progress', () => {
    const store = fakeStore({ passed: ['m1.l1.c1'], read: [] });
    const vm = harness.moduleViewModel({ mod: CURRICULUM[0], statsEntry: { challengesPassed: 1, challenges: 3, percent: 33, lessonsRead: 0 }, store });
    assert.equal(vm.lessons[0].status, 'open');
    assert.equal(vm.lessons[1].status, 'unread');
    assert.equal(vm.lessons[0].mark, '●');
    assert.equal(vm.project.done, 0);
    assert.equal(vm.project.total, 2);
    const done = harness.moduleViewModel({
      mod: CURRICULUM[0],
      statsEntry: { challengesPassed: 3, challenges: 3, percent: 100, lessonsRead: 2 },
      store: fakeStore({ passed: ['m1.l1.c1', 'm1.l1.c2', 'm1.l2.c3'], read: ['m1.l1', 'm1.l2'] }),
    });
    assert.equal(done.lessons[1].status, 'done');
    assert.equal(done.lessons[1].mark, '✓');
  });

  await t.test('home screen renders headline, chips, and module rows', async () => {
    const vm = harness.homeViewModel({
      curriculum: CURRICULUM,
      stats: { totals: { challenges: 4, challengesPassed: 3, debug: 1, debugPassed: 1, write: 3, writePassed: 2 }, perModule: [], streak: { current: 2, best: 2 } },
      overall: { modules: 2, challenges: 4 },
      store: fakeStore(),
      settings: { bannerVisible: () => true },
      resumeTarget: () => null,
      lessonIndex: [],
    });
    const text = strip(await renderToText(harness.el(harness.HomeScreen, { vm, cursor: 0, height: 24 })));
    assert.ok(text.includes("Let's build"), 'headline missing');
    assert.ok(text.includes('2-day streak at risk'), 'banner missing');
    assert.ok(text.includes('HTML Basics'), 'module row missing');
    assert.ok(text.includes('Python'), 'second module row missing');
  });

  await t.test('module screen renders lessons with status marks', async () => {
    const vm = harness.moduleViewModel({ mod: CURRICULUM[0], statsEntry: { challengesPassed: 1, challenges: 3, percent: 33, lessonsRead: 0 }, store: fakeStore({ passed: ['m1.l1.c1'] }) });
    const text = strip(await renderToText(harness.el(harness.ModuleScreen, { vm, cursor: 0, height: 24 })));
    assert.ok(text.includes('HTML Basics'), 'module title missing');
    assert.ok(text.includes('Headings'), 'lesson row missing');
    assert.ok(text.includes('Portfolio page'), 'capstone row missing');
    assert.ok(text.includes('1/2 done'), 'per-lesson progress missing');
  });

  await t.test('home screen registers its keymap route while mounted', async () => {
    const vm = harness.homeViewModel({
      curriculum: CURRICULUM,
      stats: { totals: { challenges: 4, challengesPassed: 0, debug: 0, debugPassed: 0, write: 0, writePassed: 0 }, perModule: [], streak: { current: 0, best: 0 } },
      overall: { modules: 2, challenges: 4 },
      store: fakeStore(),
      settings: { bannerVisible: () => false },
      resumeTarget: () => null,
      lessonIndex: [],
    });
    const seen = [];
    const inst = harness.render(
      harness.el(harness.HomeScreen, { vm, onCommand: (id) => seen.push(id) }),
      { stdout: helper.fakeStdout(), exitOnCtrlC: false, patchConsole: false },
    );
    await new Promise((r) => setTimeout(r, 30));
    const route = harness.getCurrentRoute();
    assert.equal(route.screen, 'home');
    route.onKey({ name: 'g' });
    assert.ok(seen.includes('nav.first'), 'g must resolve to nav.first');
    route.onKey({ name: 'char', char: 'r' });
    assert.ok(seen.includes('nav.resume'), 'r must resolve to nav.resume');
    inst.unmount();
  });
});
