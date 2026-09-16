/**
 * Pure navigation helper tests — list cursor movement (Q3) and the shared
 * resume / next-up / challenge-lookup targets used by both UIs.
 * Run: node --test tests/unit/nav.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { nextIndex, isListMove } from '../../src/ui/nav.js';
import { firstUnpassed, firstUnpassedIn, findChallenge, eachChallenge } from '../../src/core/targets.js';

const CURRICULUM = [
  {
    id: 'm1',
    title: 'HTML',
    lessons: [
      { id: 'm1.l1', title: 'Headings', challenges: [{ id: 'c1' }, { id: 'c2' }] },
      { id: 'm1.l2', title: 'Lists', challenges: [{ id: 'c3' }] },
    ],
  },
  {
    id: 'm2',
    title: 'Python',
    lessons: [{ id: 'm2.l1', title: 'Vars', challenges: [{ id: 'c1' }] }],
  },
];

test('nextIndex: movement clamps, never wraps', () => {
  assert.equal(nextIndex(0, 'nav.up', 3), 0);
  assert.equal(nextIndex(2, 'nav.down', 3), 2);
  assert.equal(nextIndex(1, 'nav.up', 3), 0);
  assert.equal(nextIndex(1, 'nav.down', 3), 2);
  assert.equal(nextIndex(4, 'nav.down', 3), 2, 'an out-of-range cursor is clamped first');
});

test('nextIndex: g/G endpoints and paging', () => {
  assert.equal(nextIndex(2, 'nav.first', 5), 0);
  assert.equal(nextIndex(0, 'nav.last', 5), 4);
  assert.equal(nextIndex(0, 'nav.pageDown', 30), 10);
  assert.equal(nextIndex(25, 'nav.pageDown', 30), 29);
  assert.equal(nextIndex(25, 'nav.pageUp', 30), 15);
});

test('nextIndex: empty lists and unrelated ids', () => {
  assert.equal(nextIndex(0, 'nav.down', 0), 0);
  assert.equal(nextIndex(3, 'nav.last', 0), 0);
  assert.equal(nextIndex(0, 'challenge.check', 4), null);
  assert.equal(nextIndex(0, 'home.openModule', 4), null);
  assert.ok(isListMove('nav.first'));
  assert.ok(!isListMove('app.quit'));
});

test('firstUnpassed walks modules, lessons and challenges in order', () => {
  const none = () => false;
  assert.equal(firstUnpassed(CURRICULUM, none).challengeId, 'c1');
  assert.equal(firstUnpassed(CURRICULUM, none).lessonId, 'm1.l1');

  const passed = new Set(['m1.l1.c1', 'm1.l1.c2', 'm1.l2.c3']);
  const next = firstUnpassed(CURRICULUM, (id) => passed.has(id));
  assert.equal(next.moduleId, 'm2');
  assert.equal(next.lessonId, 'm2.l1');
  assert.equal(next.challengeId, 'c1');

  const all = new Set(CURRICULUM.flatMap((m) => m.lessons.flatMap((l) => l.challenges.map((c) => `${l.id}.${c.id}`))));
  assert.equal(firstUnpassed(CURRICULUM, (id) => all.has(id)), null);
});

test('firstUnpassedIn falls back to the first challenge of the lesson', () => {
  const lesson = CURRICULUM[0].lessons[0];
  assert.equal(firstUnpassedIn(lesson, () => false), 0);
  assert.equal(firstUnpassedIn(lesson, (id) => id === 'm1.l1.c1'), 1);
  const done = new Set(['m1.l1.c1', 'm1.l1.c2']);
  assert.equal(firstUnpassedIn(lesson, (id) => done.has(id)), 0, 'all passed → first row');
  assert.equal(firstUnpassedIn({ id: 'x', challenges: [] }, () => false), 0);
});

test('findChallenge resolves router params, ids or first-unpassed', () => {
  const byId = findChallenge(CURRICULUM, { moduleId: 'm1', lessonId: 'm1.l1', challengeId: 'c2' });
  assert.equal(byId.challengeId, 'c2');
  assert.equal(byId.challengeIndex, 1);

  const firstOpen = findChallenge(CURRICULUM, { moduleId: 'm1', lessonId: 'm1.l2' }, (id) => id === 'm1.l2.c3');
  assert.equal(firstOpen.challengeId, 'c3', 'a fully passed lesson falls back to its first challenge');

  assert.equal(findChallenge(CURRICULUM, { moduleId: 'nope', lessonId: 'x' }), null);
  assert.equal(findChallenge([], {}), null);
});

test('eachChallenge flattens every challenge with its owners', () => {
  const all = eachChallenge(CURRICULUM);
  assert.equal(all.length, 4);
  assert.deepEqual(
    all.map((e) => `${e.module.id}/${e.lesson.id}/${e.challenge.id}`),
    ['m1/m1.l1/c1', 'm1/m1.l1/c2', 'm1/m1.l2/c3', 'm2/m2.l1/c1'],
  );
});
