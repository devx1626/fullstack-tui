import test from 'node:test';
import assert from 'node:assert/strict';

import { runPy, pyAvailable, setPyAvailable } from '../../src/core/pyrun.js';

const hasPy = pyAvailable();

test('pyAvailable probes python3', () => {
  // Whatever the machine has, the probe answers a boolean and caches.
  assert.equal(typeof hasPy, 'boolean');
  assert.equal(pyAvailable(), hasPy); // cached, stable
});

test('unavailable python fails every check with a friendly message', () => {
  setPyAvailable(false);
  try {
    const r = runPy('print("hi")', { tests: [{ label: 'x', expr: 'True' }] });
    assert.equal(r.ok, false);
    assert.equal(r.unavailable, true);
    assert.match(r.error, /install Python/i);
  } finally {
    setPyAvailable(hasPy);
  }
});

test('expression checks evaluate in the learner scope', { skip: !hasPy && 'no python3' }, () => {
  const r = runPy('total = 2 + 3', { tests: [{ label: 'sum is 5', expr: 'total == 5' }] });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.results[0].ok, true);
});

test('failing expressions report a miss, not a crash', { skip: !hasPy && 'no python3' }, () => {
  const r = runPy('total = 2 + 2', { tests: [{ label: 'sum is 5', expr: 'total == 5' }] });
  assert.equal(r.ok, false);
  assert.equal(r.results[0].ok, false);
  assert.ok(r.results[0].error);
});

test('capture protocol round-trips values to Node', { skip: !hasPy && 'no python3' }, () => {
  const r = runPy("nums = [1, 2, 3]\ncapture('evens', [n for n in nums if n % 2 == 0])", {
    capture: [{ name: 'evens', expr: 'evens' }],
  });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.captured.evens, [2]);
});

test('learner prints stay in logs, marker protocol stays hidden', { skip: !hasPy && 'no python3' }, () => {
  const r = runPy('print("hello out")\nx = 1', { tests: [{ label: 'x', expr: 'x == 1' }] });
  assert.deepEqual(r.logs, ['hello out']);
  assert.equal(r.ok, true);
});

test('syntax errors surface as a clean message', { skip: !hasPy && 'no python3' }, () => {
  const r = runPy('def broken(:\n  pass', { tests: [{ label: 'never', expr: 'True' }] });
  assert.equal(r.ok, false);
  assert.match(r.error, /SyntaxError|was never closed/i);
  assert.equal(r.results[0].ok, false);
});

test('runtime errors in learner code fail without throwing', { skip: !hasPy && 'no python3' }, () => {
  const r = runPy('values = []\nvalues[5] = 1', { tests: [{ label: 'never', expr: 'True' }] });
  assert.equal(r.ok, false);
  assert.match(r.error, /IndexError/);
});
