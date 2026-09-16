import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRecap } from '../../src/core/recap.js';

test('buildRecap: an idle session gets one line, not a wall of zeros', () => {
  const lines = buildRecap({ seconds: 300, totals: { passed: 3 } });
  assert.equal(lines.length, 1);
  assert.match(lines[0], /Nothing checked this session/);
});

test('buildRecap: idle with a next-up target names it', () => {
  const lines = buildRecap({ nextUp: 'css-box-model-01' });
  assert.equal(lines.length, 1);
  assert.match(lines[0], /next up: css-box-model-01/);
});

test('buildRecap: reports time, passes, failures, streak and next up', () => {
  const lines = buildRecap({
    seconds: 2530,
    passed: ['a-01', 'a-02', 'b-01'],
    failures: 4,
    totalPassed: 124,
    totalChallenges: 125,
    streak: 12,
    todayCount: 3,
    dailyGoal: 3,
    nextUp: 'js-final-02',
  }).join('\n');
  assert.match(lines, /42m 10s/);
  assert.match(lines, /3 challenges {2}\(124\/125 overall\)/);
  assert.match(lines, /4 failed checks/);
  assert.match(lines, /12 days {2}· {2}today 3\/3 \(goal met\)/);
  assert.match(lines, /next up {2}js-final-02/);
});

test('buildRecap: rows with nothing to say are omitted', () => {
  const lines = buildRecap({ seconds: 100, passed: ['a-01'] });
  const text = lines.join('\n');
  assert.match(text, /1 challenge/);
  assert.doesNotMatch(text, /failures/);
  assert.doesNotMatch(text, /streak/);
  assert.doesNotMatch(text, /next up/);
});

test('buildRecap: a very short session omits the time row', () => {
  const lines = buildRecap({ seconds: 2, passed: ['a-01'] });
  assert.doesNotMatch(lines.join('\n'), /time/);
});

test('buildRecap: goal line shows progress without claiming the goal was met', () => {
  const lines = buildRecap({ passed: ['a-01'], streak: 3, todayCount: 1, dailyGoal: 3 }).join('\n');
  assert.match(lines, /today 1\/3/);
  assert.doesNotMatch(lines, /goal met/);
});

test('buildRecap: only failures still produces a recap', () => {
  const lines = buildRecap({ seconds: 60, failures: 2 }).join('\n');
  assert.match(lines, /2 failed checks/);
  assert.match(lines, /1m 0s/);
});
