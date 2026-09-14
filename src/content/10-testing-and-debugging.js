import { T } from '../core/grade.js';

/**
 * You cannot learn testing by reading about testing, so this module ships a
 * tiny test runner and uses it as the grader.
 *
 * The interesting part is *mutation testing*: a suite of tests is only as good
 * as the bugs it catches, so the checks run your suite against a correct
 * implementation and then against deliberately sabotaged copies of it. A suite
 * that passes against a broken implementation is not finished.
 *
 * The runner is async, so a test can `await` - and every challenge here is
 * marked `async` so the checks can await the suite too.
 */
const TEST_PRELUDE = `
const __tests = [];
function test(name, fn) {
  if (!name || typeof fn !== 'function') throw new Error('test(name, fn) needs a name and a function');
  __tests.push({ name: name, fn: fn });
}

function __build(received) {
  const matchers = {
    toBe(expected) {
      if (!Object.is(received, expected)) throw new Error('expected ' + __show(received) + ' to be ' + __show(expected));
    },
    toEqual(expected) {
      const a = __show(received);
      const b = __show(expected);
      if (a !== b) throw new Error('expected ' + a + ' to equal ' + b);
    },
    toBeTruthy() {
      if (!received) throw new Error('expected ' + __show(received) + ' to be truthy');
    },
    toBeFalsy() {
      if (received) throw new Error('expected ' + __show(received) + ' to be falsy');
    },
    toBeCloseTo(expected, digits) {
      const tolerance = Math.pow(10, -(digits === undefined ? 2 : digits)) / 2;
      if (Math.abs(received - expected) > tolerance) {
        throw new Error('expected ' + received + ' to be close to ' + expected);
      }
    },
    toContain(item) {
      if (!received || received.indexOf(item) === -1) throw new Error('expected ' + __show(received) + ' to contain ' + __show(item));
    },
    toHaveLength(length) {
      if (!received || received.length !== length) {
        throw new Error('expected length ' + length + ', got ' + (received ? received.length : received));
      }
    },
    toBeInstanceOf(ctor) {
      if (!(received instanceof ctor)) throw new Error('expected an instance of ' + ctor.name + ', got ' + __show(received));
    },
    toThrow(pattern) {
      if (typeof received !== 'function') throw new Error('toThrow() needs a function to call, got ' + __show(received));
      try {
        received();
      } catch (err) {
        const message = err && err.message ? err.message : String(err);
        if (pattern && !new RegExp(pattern).test(message)) {
          throw new Error('threw with the wrong message: ' + message);
        }
        return;
      }
      throw new Error('expected it to throw, but it returned normally');
    },
    toThrowError(pattern) {
      return matchers.toThrow(pattern);
    },
  };

  const api = {};
  Object.keys(matchers).forEach(function (key) {
    api[key] = function () { return matchers[key].apply(null, arguments); };
  });
  api.not = {};
  Object.keys(matchers).forEach(function (key) {
    api.not[key] = function () {
      try {
        matchers[key].apply(null, arguments);
      } catch (err) {
        return;
      }
      throw new Error('expected the assertion not to pass, but it did');
    };
  });
  return api;
}

function expect(received) {
  return __build(received);
}

/**
 * Assert that an async (or sync) function rejects/throws, optionally matching
 * the message. Returns true so it can be used as the last line of a test.
 */
async function expectRejects(fn, pattern) {
  try {
    await fn();
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    if (pattern && !new RegExp(pattern).test(message)) {
      throw new Error('rejected with the wrong message: ' + message);
    }
    return true;
  }
  throw new Error('expected it to reject, but it resolved');
}

/**
 * Run a suite against one implementation.
 *
 * The suite is a function of the implementation, so the very same tests can be
 * pointed at a correct module and at a sabotaged one - which is how the checks
 * below measure whether your tests actually test anything.
 */
async function __runSuite(suite, implementation) {
  __tests.length = 0;
  suite(implementation);
  const failures = [];
  const registered = __tests.slice();
  for (const entry of registered) {
    try {
      await entry.fn();
    } catch (err) {
      failures.push({ name: entry.name, message: err && err.message ? err.message : String(err) });
    }
  }
  return { count: registered.length, failures: failures };
}
`;

/** The module under test for the "is my suite any good?" challenges. */
const CLAMP_SUBJECT = `
const __subject = {
  good: {
    clamp: function (value, min, max) {
      if (min > max) throw new Error('min must not be greater than max');
      if (Number.isNaN(value)) return min;
      return Math.min(Math.max(value, min), max);
    },
    average: function (numbers) {
      if (!Array.isArray(numbers)) throw new Error('numbers must be an array');
      if (numbers.length === 0) return null;
      let sum = 0;
      for (const n of numbers) sum += n;
      return sum / numbers.length;
    },
  },
  sabotaged: {
    'clamp ignores the lower bound': {
      clamp: function (value, min, max) { return Math.min(value, max); },
      average: function (numbers) { if (numbers.length === 0) return null; return numbers.reduce(function (a, b) { return a + b; }, 0) / numbers.length; },
    },
    'average returns 0 for an empty array': {
      clamp: function (value, min, max) { return Math.min(Math.max(value, min), max); },
      average: function (numbers) { if (numbers.length === 0) return 0; return numbers.reduce(function (a, b) { return a + b; }, 0) / numbers.length; },
    },
    'average corrupts floats with toFixed': {
      clamp: function (value, min, max) { return Math.min(Math.max(value, min), max); },
      average: function (numbers) { if (numbers.length === 0) return null; return Number((numbers.reduce(function (a, b) { return a + b; }, 0) / numbers.length).toFixed(1)); },
    },
    'clamp throws on a reversed range': {
      clamp: function (value, min, max) { return Math.min(Math.max(value, min), max); },
      average: function (numbers) { if (numbers.length === 0) return null; return numbers.reduce(function (a, b) { return a + b; }, 0) / numbers.length; },
    },
  },
};
`;

/** The module under test for the boundary/assertion challenges. */
const VALIDATOR_SUBJECT = `
const __subject = {
  good: {
    validateTitle: function (title) {
      const text = String(title === undefined || title === null ? '' : title).trim();
      if (!text) throw new Error('Title is required');
      if (text.length > 60) throw new Error('Title must be 60 characters or fewer');
      return text;
    },
  },
  sabotaged: {
    'does not trim': {
      validateTitle: function (title) {
        const text = String(title === undefined || title === null ? '' : title);
        if (!text.trim()) throw new Error('Title is required');
        return text;
      },
    },
    'allows 61 characters': {
      validateTitle: function (title) {
        const text = String(title === undefined || title === null ? '' : title).trim();
        if (!text) throw new Error('Title is required');
        if (text.length > 61) throw new Error('Title must be 60 characters or fewer');
        return text;
      },
    },
    'silently fixes bad input': {
      validateTitle: function (title) {
        const text = String(title === undefined || title === null ? '' : title).trim();
        if (!text) return 'untitled';
        return text.slice(0, 60);
      },
    },
  },
};
`;

/** An async subject with an injectable sleep, used by the async challenges. */
const RETRY_SUBJECT = `
function __makeSubject() {
  function withRetry(operation, options) {
    const opts = options || {};
    const attempts = opts.attempts === undefined ? 3 : opts.attempts;
    const sleep = opts.sleep || function () { return Promise.resolve(); };
    const onRetry = opts.onRetry || function () {};

    return (async function () {
      let lastError = null;
      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
          return await operation(attempt);
        } catch (err) {
          lastError = err;
          if (attempt < attempts) {
            onRetry(attempt, err);
            await sleep(attempt);
          }
        }
      }
      throw lastError;
    })();
  }

  return {
    good: { withRetry: withRetry },
    sabotaged: {
      'never retries': {
        withRetry: function (operation, options) {
          const opts = options || {};
          return Promise.resolve().then(function () { return operation(1); });
        },
      },
      'retries forever': {
        withRetry: function (operation, options) {
          const opts = options || {};
          const attempts = opts.attempts === undefined ? 3 : opts.attempts;
          const onRetry = opts.onRetry || function () {};
          return (async function () {
            let attempt = 1;
            for (;;) {
              try {
                return await operation(attempt);
              } catch (err) {
                onRetry(attempt, err);
                attempt += 1;
                if (attempt > 50) throw err;
              }
            }
          })();
        },
      },
      'swallows the final error': {
        withRetry: function (operation, options) {
          const opts = options || {};
          const attempts = opts.attempts === undefined ? 3 : opts.attempts;
          const onRetry = opts.onRetry || function () {};
          return (async function () {
            for (let attempt = 1; attempt <= attempts; attempt += 1) {
              try {
                return await operation(attempt);
              } catch (err) {
                onRetry(attempt, err);
              }
            }
            return undefined;
          })();
        },
      },
    },
  };
}

const __subject = __makeSubject();

/** The contract the debugging challenge is graded against. */
function __contract(implementation) {
  const noSleep = function () { return Promise.resolve(); };

  test('resolves with the value without retrying', async function () {
    let calls = 0;
    const value = await implementation.withRetry(function () { calls += 1; return Promise.resolve('ok'); }, { sleep: noSleep });
    expect(value).toBe('ok');
    expect(calls).toBe(1);
  });

  test('retries after a transient failure', async function () {
    let calls = 0;
    const value = await implementation.withRetry(function () {
      calls += 1;
      if (calls === 1) return Promise.reject(new Error('transient'));
      return Promise.resolve('recovered');
    }, { attempts: 3, sleep: noSleep });
    expect(value).toBe('recovered');
    expect(calls).toBe(2);
  });

  test('rejects with the last error after every attempt fails', async function () {
    let calls = 0;
    await expectRejects(function () {
      return implementation.withRetry(function () { calls += 1; return Promise.reject(new Error('still broken')); }, { attempts: 3, sleep: noSleep });
    }, /still broken/);
    expect(calls).toBe(3);
  });

  test('calls onRetry between attempts with the attempt number', async function () {
    const seen = [];
    await implementation.withRetry(function (attempt) {
      if (attempt < 2) return Promise.reject(new Error('nope'));
      return Promise.resolve('done');
    }, { attempts: 3, sleep: noSleep, onRetry: function (attempt) { seen.push(attempt); } });
    expect(seen).toEqual([1]);
  });
}
`;

/** Subject + contract suite for the debugging lessons. */
const RANGE_SUBJECT = `
const __subject = {
  good: {
    range: function (from, to, step) {
      const stride = step === undefined ? 1 : step;
      if (stride === 0) throw new Error('step must not be zero');
      const out = [];
      if (stride > 0) for (let i = from; i < to; i += stride) out.push(i);
      else for (let i = from; i > to; i += stride) out.push(i);
      return out;
    },
  },
  sabotaged: {},
};

function __contract(implementation) {
  test('counts from 0 up to but not including the stop value', function () {
    expect(implementation.range(0, 5)).toEqual([0, 1, 2, 3, 4]);
  });
  test('supports a custom step', function () {
    expect(implementation.range(0, 10, 5)).toEqual([0, 5]);
  });
  test('counts downwards with a negative step', function () {
    expect(implementation.range(5, 0, -1)).toEqual([5, 4, 3, 2, 1]);
  });
  test('an empty span gives an empty array', function () {
    expect(implementation.range(3, 3)).toEqual([]);
  });
  test('rejects a zero step instead of looping forever', function () {
    expect(function () { implementation.range(0, 5, 0); }).toThrow();
  });
}
`;

const COST_SUBJECT = `
const __subject = {
  good: {
    shipping: function (weightKg, express, member) {
      if (typeof weightKg !== 'number' || Number.isNaN(weightKg) || weightKg <= 0) {
        throw new Error('weight must be a positive number');
      }
      let cost = 4.99;
      if (weightKg > 2) cost += Math.ceil(weightKg - 2) * 1.5;
      if (express) cost += 7;
      if (member) cost = Number((cost * 0.9).toFixed(2));
      return Number(cost.toFixed(2));
    },
  },
  sabotaged: {},
};

function __contract(implementation) {
  test('charges the base rate for a light parcel', function () {
    expect(implementation.shipping(1, false, false)).toBe(4.99);
  });
  test('adds 1.50 per extra kilo above two', function () {
    expect(implementation.shipping(5, false, false)).toBe(9.49);
  });
  test('adds seven for express', function () {
    expect(implementation.shipping(1, true, false)).toBe(11.99);
  });
  test('members get ten percent off the total', function () {
    expect(implementation.shipping(1, true, true)).toBe(10.79);
  });
  test('rejects a non-positive weight', function () {
    expect(function () { implementation.shipping(0, false, false); }).toThrow();
    expect(function () { implementation.shipping(-2, false, false); }).toThrow();
  });
}
`;

const STORAGE_SUBJECT = `
function __makeStore() {
  function createStore(storage) {
    const key = 'tasks';

    return {
      save: function (tasks) {
        storage.setItem(key, JSON.stringify(tasks));
      },
      load: function () {
        const raw = storage.getItem(key);
        if (raw === null || raw === undefined) return [];
        let parsed = null;
        try {
          parsed = JSON.parse(raw);
        } catch (err) {
          return [];
        }
        return Array.isArray(parsed) ? parsed : [];
      },
      add: function (task) {
        const tasks = this.load();
        tasks.push(task);
        this.save(tasks);
        return tasks;
      },
    };
  }

  return {
    good: { createStore: createStore },
    sabotaged: {
      'saves the array as a string': {
        createStore: function (storage) {
          return {
            save: function (tasks) { storage.setItem('tasks', String(tasks)); },
            load: function () { const raw = storage.getItem('tasks'); return raw ? String(raw) : []; },
            add: function (task) { const tasks = this.load(); tasks.push(task); return tasks; },
          };
        },
      },
      'crashes on corrupt JSON': {
        createStore: function (storage) {
          return {
            save: function (tasks) { storage.setItem('tasks', JSON.stringify(tasks)); },
            load: function () { const raw = storage.getItem('tasks'); return raw === null || raw === undefined ? [] : JSON.parse(raw); },
            add: function (task) { const tasks = this.load(); tasks.push(task); this.save(tasks); return tasks; },
          };
        },
      },
      'loads something that is not an array': {
        createStore: function (storage) {
          return {
            save: function (tasks) { storage.setItem('tasks', JSON.stringify(tasks)); },
            load: function () { const raw = storage.getItem('tasks'); if (raw === null || raw === undefined) return []; try { return JSON.parse(raw); } catch (err) { return []; } },
            add: function (task) { const tasks = this.load(); tasks.push(task); this.save(tasks); return tasks; },
          };
        },
      },
    },
  };
}

const __subject = __makeStore();

function __memoryStorage(seed) {
  const data = seed || {};
  return {
    calls: [],
    setItem: function (key, value) { this.calls.push(['set', key, value]); data[key] = String(value); },
    getItem: function (key) { this.calls.push(['get', key]); return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    raw: data,
  };
}
`;

export default {
  id: 'testing',
  title: 'Testing & Debugging',
  badge: 'QA',
  color: 'good',
  tagline: 'Confidence to change code - and the method for when it breaks',
  hours: 12,
  why:
    'Tests are not bureaucracy, they are the thing that lets you refactor at speed: change the code, run the suite, know in five seconds whether ' +
    'you broke something. And debugging is a discipline, not luck - read the stack, form a hypothesis, shrink the repro, fix the cause. ' +
    'Every senior engineer you admire does these two things well, and both are learnable.',
  source: {
    course: 'Dave Gray - JavaScript testing + the debugging chapters of his full-stack course',
    url: 'https://www.youtube.com/watch?v=WFRaBAf5FT4',
    roadmap: 'https://roadmap.sh/qa',
    docs: 'https://nodejs.org/api/test.html',
  },
  lessons: [
    // ---------------------------------------------------------------------
    {
      id: 'test-01',
      title: 'Anatomy of a Test',
      minutes: 35,
      objectives: [
        'Write a test in arrange-act-assert form',
        'Explain why a suite is a function of the implementation',
        'Prove your tests fail when the code is broken',
      ],
      sections: [
        {
          heading: 'A test is an executable expectation',
          body:
            '```js\ntest(\'clamps above the maximum\', () => {\n  const value = clamp(11, 0, 10);   // arrange + act\n  expect(value).toBe(10);           // assert\n});\n```\n\n' +
            'One behaviour, one reason to fail. If a test can fail for three different reasons, a red suite tells you nothing about where the ' +
            'problem is. The name should read like a fact about the system - `clamps above the maximum`, not `test clamp 2`.',
        },
        {
          heading: 'Mutation testing: do your tests actually test?',
          body:
            'A suite that passes is not evidence. **A suite that fails when the code is broken is evidence.**\n\n' +
            'Mutation testing takes your code, introduces a small bug (`>` becomes `>=`, a bound is dropped, an error is swallowed) and runs ' +
            'your tests against it. If everything still passes, your tests did not cover that line. The challenges in this module do exactly ' +
            'that: your suite is run against a correct implementation and against several sabotaged ones, and it must pass one and fail the ' +
            'others.\n\n' +
            'That is why the suite here is written as a *function of the implementation*:\n\n' +
            '```js\nfunction suite(implementation) {\n  test(\'adds two numbers\', () => expect(implementation.add(2, 3)).toBe(5));\n}\n\n' +
            'suite(theRealModule);      // must pass\n' +
            'suite(theSabotagedCopy);   // must fail\n```',
        },
        {
          heading: 'The runner you have here',
          body:
            'The TUI gives you `test(name, fn)`, `expect(value)` with `toBe`, `toEqual`, `toBeTruthy`, `toBeFalsy`, `toBeCloseTo`, ' +
            '`toContain`, `toHaveLength`, `toBeInstanceOf`, plus `.not`, and `await expectRejects(fn, /pattern/)` for async.\n\n' +
            'That is deliberately the same shape as Vitest and Jest, so what you learn here transfers:\n\n' +
            '```js\nimport { describe, it, expect } from \'vitest\';   // the real thing\n```\n\n' +
            'Tests can be `async`; the runner awaits every one of them in order.',
        },
      ],
      pitfalls: [
        'A test with no assertion - it passes forever and proves nothing',
        'Testing three behaviours in one test, so a failure does not say which one broke',
        'Asserting on a copy of the logic instead of the real implementation',
        'Tests that pass against broken code because they only assert "it did not throw"',
        'Chasing coverage percentages instead of the behaviours that matter',
      ],
      keyPoints: [
        'Arrange, act, assert - one behaviour per test, named like a fact',
        'A suite is only useful if it fails when the code is broken (mutation testing)',
        'Writing tests as a function of the implementation lets you run them against sabotaged copies',
      ],
      resources: [
        { label: 'Vitest: Getting Started', url: 'https://vitest.dev/guide/' },
        { label: 'node:test (built into Node)', url: 'https://nodejs.org/api/test.html' },
        { label: 'Stryker: mutation testing', url: 'https://stryker-mutator.io/docs/' },
        { label: 'Kent C. Dodds: Testing Trophy', url: 'https://kentcdodds.com/blog/the-testing-trophy-and-testing-classes' },
      ],
      challenges: [
        {
          id: 'write-first-suite',
          kind: 'write',
          difficulty: 'easy',
          minutes: 15,
          lang: 'js',
          async: true,
          prelude: TEST_PRELUDE + CLAMP_SUBJECT,
          prompt:
            'Write `function suite(implementation)` with at least four tests for the `clamp(value, min, max)` and `average(numbers)` helpers ' +
            'in `__subject`. The checks run your suite against `__subject.good` (it must pass) and against each sabotaged copy (it must fail), ' +
            'so cover both functions and their edges.',
          requirements: [
            'The suite is a function of `implementation` - it never touches `__subject` directly',
            'At least four tests, covering `clamp` and `average`',
            'Against `__subject.good` every test passes',
            'Each sabotaged implementation produces at least one failure',
          ],
          starter: `function suite(implementation) {\n  test('placeholder', () => {\n    expect(implementation.clamp(5, 0, 10)).toBe(5);\n  });\n}\n`,
          hints: [
            'Read the sabotaged names in `__subject.sabotaged` - each one tells you the behaviour you must pin down.',
            '"clamp ignores the lower bound" means you need a value below `min`.',
            '"average returns 0 for an empty array" means you need to assert the empty case is `null`.',
          ],
          solution: `function suite(implementation) {
  test('clamp keeps a value that is already inside the range', () => {
    expect(implementation.clamp(5, 0, 10)).toBe(5);
  });

  test('clamp lifts a value up to the minimum', () => {
    expect(implementation.clamp(-4, 0, 10)).toBe(0);
  });

  test('clamp pulls a value down to the maximum', () => {
    expect(implementation.clamp(99, 0, 10)).toBe(10);
  });

  test('average of a simple list', () => {
    expect(implementation.average([1, 2, 3])).toBe(2);
  });

  test('average of an empty list is null, not zero', () => {
    expect(implementation.average([])).toBe(null);
  });

  test('average keeps floating point precision', () => {
    expect(implementation.average([1, 2, 2])).toBeCloseTo(1.67, 2);
  });
}
`,
          checks: [
            T.js(
              'the suite passes against the correct implementation',
              `(async function () {
  const result = await __runSuite(suite, __subject.good);
  __must(result.count >= 4, 'write at least four tests, found ' + result.count);
  __must(result.failures.length === 0, 'your suite fails against correct code: ' + result.failures.map((f) => f.name + ' (' + f.message + ')').join('; '));
  return true;
})()`,
              'Every assertion must describe the behaviour the subject really has.',
            ),
            T.js(
              'the suite catches a missing lower bound',
              `(async function () { const result = await __runSuite(suite, __subject.sabotaged['clamp ignores the lower bound']); __must(result.failures.length > 0, 'no test noticed that clamp stopped enforcing the minimum - add a case below min'); return true; })()`,
              'Assert `clamp(-4, 0, 10)` is 0.',
            ),
            T.js(
              'the suite catches a wrong empty average',
              `(async function () { const result = await __runSuite(suite, __subject.sabotaged['average returns 0 for an empty array']); __must(result.failures.length > 0, 'no test noticed that average([]) returned 0 instead of null'); return true; })()`,
              'Assert `average([])` is `null`.',
            ),
            T.js(
              'the suite catches imprecise averages',
              `(async function () { const result = await __runSuite(suite, __subject.sabotaged['average corrupts floats with toFixed']); __must(result.failures.length > 0, 'no test noticed the average being rounded to one decimal - pick numbers whose mean needs more precision'); return true; })()`,
              '`average([1, 2, 2])` is 1.666..., which `toFixed(1)` turns into 1.7.',
            ),
          ],
        },
        {
          id: 'debug-weak-suite',
          kind: 'debug',
          difficulty: 'medium',
          minutes: 15,
          lang: 'js',
          async: true,
          prelude: TEST_PRELUDE + VALIDATOR_SUBJECT,
          prompt:
            'This suite passes against `__subject.good` and then happily passes against every sabotaged copy too, which makes it useless. ' +
            'Strengthen the assertions so the sneaky copies are caught: untrimmed output, an off-by-one on the length limit, and silent ' +
            'fixing of invalid input.',
          requirements: [
            'The suite still passes against `__subject.good`',
            '"does not trim" is caught (the returned value must be trimmed)',
            '"allows 61 characters" is caught (exactly 60 is allowed, 61 is not)',
            '"silently fixes bad input" is caught (bad input must throw, not be repaired)',
          ],
          starter: `function suite(implementation) {
  test('validates a title', () => {
    implementation.validateTitle('Ship it');
  });

  test('rejects an empty title', () => {
    try {
      implementation.validateTitle('');
    } catch (err) {
      expect(err.message).toBeTruthy();
    }
  });

  test('accepts a long title', () => {
    expect(implementation.validateTitle('x'.repeat(80))).toBeTruthy();
  });
}
`,
          hints: [
            'A test that only asserts "it did not throw" cannot catch trimmed-vs-untrimmed output. Assert the returned value.',
            '`validateTitle("  Ship it  ")` should return `"Ship it"` exactly.',
            'For the limit: `"x".repeat(60)` is valid, `"x".repeat(61)` must throw - use `expectRejects`.',
          ],
          solution: `function suite(implementation) {
  test('returns the trimmed title', () => {
    expect(implementation.validateTitle('  Ship it  ')).toBe('Ship it');
  });

  test('rejects a whitespace-only title', async () => {
    await expectRejects(() => implementation.validateTitle('   '), /required/i);
  });

  test('allows exactly sixty characters', () => {
    expect(implementation.validateTitle('x'.repeat(60))).toBe('x'.repeat(60));
  });

  test('rejects sixty-one characters', async () => {
    await expectRejects(() => implementation.validateTitle('x'.repeat(61)), /60/);
  });

  test('throws instead of repairing an empty title', async () => {
    await expectRejects(() => implementation.validateTitle(''), /required/i);
  });
}
`,
          checks: [
            T.js(
              'the strengthened suite still passes on correct code',
              `(async function () { const result = await __runSuite(suite, __subject.good); __must(result.count >= 3, 'keep at least three tests, found ' + result.count); __must(result.failures.length === 0, 'your suite now fails against correct code: ' + result.failures.map((f) => f.name + ' (' + f.message + ')').join('; ')); return true; })()`,
              'Assert the exact returned string and the exact throw behaviour.',
            ),
            T.js(
              'untrimmed output is caught',
              `(async function () { const result = await __runSuite(suite, __subject.sabotaged['does not trim']); __must(result.failures.length > 0, 'no test noticed the untrimmed title - assert the exact returned value'); return true; })()`,
              '`expect(implementation.validateTitle(\'  Ship it  \')).toBe(\'Ship it\')`.',
            ),
            T.js(
              'the off-by-one limit is caught',
              `(async function () { const result = await __runSuite(suite, __subject.sabotaged['allows 61 characters']); __must(result.failures.length > 0, 'no test noticed that 61 characters slipped through - test the boundary from both sides'); return true; })()`,
              'Test 60 (allowed) and 61 (rejected).',
            ),
            T.js(
              'silent repairing is caught',
              `(async function () { const result = await __runSuite(suite, __subject.sabotaged['silently fixes bad input']); __must(result.failures.length > 0, 'no test noticed that bad input was quietly turned into "untitled" instead of throwing'); return true; })()`,
              '`await expectRejects(() => implementation.validateTitle(\'\'))`.',
            ),
          ],
        },
        {
          id: 'write-edge-cases',
          kind: 'write',
          difficulty: 'medium',
          minutes: 20,
          lang: 'js',
          async: true,
          prelude: TEST_PRELUDE + RETRY_SUBJECT,
          prompt:
            'Write `function suite(implementation)` covering `withRetry(operation, { attempts, sleep, onRetry })`. It must pass against ' +
            '`__subject.good` and catch all three sabotages: never retrying, retrying forever, and swallowing the final error. Inject a fake ' +
            '`sleep` and a counting `operation` so the tests are instant and deterministic.',
          requirements: [
            'At least five tests',
            'Success on the first attempt does not retry (assert the call count)',
            'A failure then a success resolves with the value and called the operation twice',
            'Exhausting every attempt rejects with the last error',
            '`onRetry` is called between attempts, with the attempt number',
            'No real timers: pass a fake `sleep` that resolves immediately',
          ],
          starter: `function suite(implementation) {
  test('resolves when the operation succeeds', async () => {
    const result = await implementation.withRetry(() => Promise.resolve('ok'));
    expect(result).toBe('ok');
  });
}
`,
          hints: [
            'A counting operation: `let calls = 0; const op = () => { calls += 1; return Promise.reject(new Error("boom")); };`',
            'Always pass `sleep: () => Promise.resolve()` so the suite never actually waits.',
            'For the final rejection use `expectRejects(() => implementation.withRetry(op, { attempts: 2, sleep }), /boom/)`.',
          ],
          solution: `function suite(implementation) {
  const noSleep = () => Promise.resolve();

  test('resolves with the value without retrying', async () => {
    let calls = 0;
    const result = await implementation.withRetry(() => {
      calls += 1;
      return Promise.resolve('ok');
    }, { sleep: noSleep });
    expect(result).toBe('ok');
    expect(calls).toBe(1);
  });

  test('retries once and then succeeds', async () => {
    let calls = 0;
    const result = await implementation.withRetry(() => {
      calls += 1;
      if (calls === 1) return Promise.reject(new Error('transient'));
      return Promise.resolve('recovered');
    }, { attempts: 3, sleep: noSleep });
    expect(result).toBe('recovered');
    expect(calls).toBe(2);
  });

  test('rejects with the last error after every attempt fails', async () => {
    let calls = 0;
    await expectRejects(() => implementation.withRetry(() => {
      calls += 1;
      return Promise.reject(new Error('still broken'));
    }, { attempts: 3, sleep: noSleep }), /still broken/);
    expect(calls).toBe(3);
  });

  test('calls onRetry between attempts with the attempt number', async () => {
    const seen = [];
    const result = await implementation.withRetry((attempt) => {
      if (attempt < 3) return Promise.reject(new Error('nope'));
      return Promise.resolve(attempt);
    }, { attempts: 3, sleep: noSleep, onRetry: (attempt) => seen.push(attempt) });
    expect(result).toBe(3);
    expect(seen).toEqual([1, 2]);
  });

  test('passes the attempt number into the operation', async () => {
    const attempts = [];
    await implementation.withRetry((attempt) => {
      attempts.push(attempt);
      return Promise.resolve('done');
    }, { sleep: noSleep });
    expect(attempts).toEqual([1]);
  });
}
`,
          checks: [
            T.js(
              'the suite passes on the correct implementation',
              `(async function () {
  const result = await __runSuite(suite, __subject.good);
  __must(result.count >= 5, 'write at least five tests, found ' + result.count);
  __must(result.failures.length === 0, 'your suite fails against correct code: ' + result.failures.map((f) => f.name + ' (' + f.message + ')').join('; '));
  return true;
})()`,
              'Inject `sleep: () => Promise.resolve()` everywhere so nothing really waits.',
            ),
            T.js(
              'the suite catches an implementation that never retries',
              `(async function () { const result = await __runSuite(suite, __subject.sabotaged['never retries']); __must(result.failures.length > 0, 'no test noticed that the operation was only called once - assert the call count'); return true; })()`,
              'Count the invocations and assert the exact number.',
            ),
            T.js(
              'the suite catches an implementation that retries forever',
              `(async function () { const result = await __runSuite(suite, __subject.sabotaged['retries forever']); __must(result.failures.length > 0, 'no test noticed the endless retries - assert that a permanent failure rejects'); return true; })()`,
              'Assert the call count after exhaustion, and use `expectRejects`.',
            ),
            T.js(
              'the suite catches a swallowed error',
              `(async function () { const result = await __runSuite(suite, __subject.sabotaged['swallows the final error']); __must(result.failures.length > 0, 'no test noticed that a permanent failure resolved with undefined instead of rejecting'); return true; })()`,
              '`await expectRejects(...)` is what turns "resolved anyway" into a failure.',
            ),
          ],
        },
      ],
    },

    // ---------------------------------------------------------------------
    {
      id: 'test-02',
      title: 'Assertions That Mean What You Think',
      minutes: 35,
      objectives: [
        'Choose between identity and deep equality deliberately',
        'Assert on thrown errors instead of just "it threw"',
        'Use `.not` and async rejection helpers correctly',
      ],
      sections: [
        {
          heading: 'toBe is identity, toEqual is shape',
          body:
            '```js\nexpect(1).toBe(1);                       // same value\nexpect({ a: 1 }).toBe({ a: 1 });        // FAILS - different objects\nexpect({ a: 1 }).toEqual({ a: 1 });     // passes - same shape\n```\n\n' +
            '`toBe` is `Object.is`. It is right for primitives, for `null`/`undefined` and when you specifically want to prove *the same ' +
            'object* came back (like a memoised selector). For everything else you want `toEqual`.',
        },
        {
          heading: 'Assert on the error, not on "it broke"',
          body:
            '```js\n// weak: any throw passes, including the wrong one\nlet threw = false;\ntry { validate(\'\'); } catch { threw = true; }\nexpect(threw).toBe(true);\n\n' +
            '// strong: the right failure, with a message you can act on\nawait expectRejects(() => validate(\'\'), /title is required/i);\n```\n\n' +
            'A test that accepts any throw will keep passing when a typo introduces a completely unrelated crash - which is exactly when you ' +
            'need it to fail.',
        },
        {
          heading: 'Negative assertions pin down what should not happen',
          body:
            '```js\nexpect(result).not.toContain(\'password\');                    // no secret leaked into the response\nexpect(() => fn()).not.toThrow();\n' +
            'expect(saved).not.toBe(original);                              // a new object, not a mutated one\n```\n\n' +
            '`not.toBe(original)` is the assertion that catches the "I mutated state instead of copying it" class of bug, which no other test ' +
            'will notice because the values still match.',
        },
      ],
      pitfalls: [
        '`toBe` on objects and arrays - always fails, so people "fix" it by asserting something weaker',
        'Catching an error and asserting only that *something* was thrown',
        'Asserting the exact wording of an error message that will change next sprint',
        'A matcher that passes for the wrong reason (e.g. `toBeTruthy` on a string that could be `"false"`)',
        'Forgetting that `expect` on a promise needs `await` (or the rejection becomes an unhandled one)',
      ],
      keyPoints: [
        '`toBe` for identity and primitives, `toEqual` for shape',
        'Assert the failure mode: that it throws, and roughly what it says',
        'Negative assertions catch mutation and leakage bugs that equality checks miss',
      ],
      resources: [
        { label: 'Vitest: Expect API', url: 'https://vitest.dev/api/expect.html' },
        { label: 'Jest: Using Matchers', url: 'https://jestjs.io/docs/using-matchers' },
        { label: 'MDN: Object.is', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/is' },
      ],
      challenges: [
        {
          id: 'write-precise-assertions',
          kind: 'write',
          difficulty: 'medium',
          minutes: 18,
          lang: 'js',
          async: true,
          prelude: TEST_PRELUDE + STORAGE_SUBJECT,
          prompt:
            'Write `suite(implementation)` for `createStore(storage)` in `__subject`, using the `__memoryStorage()` helper for the fake. Cover: ' +
            'a round-trip of a task list, corrupt JSON returning an empty list, `add` appending to what was already stored, and the value ' +
            'actually persisted into the storage (assert on `storage.raw`). Catch all three sabotages.',
          requirements: [
            'Save then load returns the same list by shape (use `toEqual`)',
            'Corrupt JSON in storage gives `[]` instead of throwing',
            '`add` keeps the existing tasks and appends the new one',
            'The persisted value is real JSON, not `String(array)` - assert it can be parsed',
            '`load` never returns a non-array (seed the storage with `"5"` and expect `[]`)',
            'All assertions match on correct code and catch every sabotage',
          ],
          starter: `function suite(implementation) {
  test('saves and loads', () => {
    const storage = __memoryStorage();
    const store = implementation.createStore(storage);
    store.save([{ id: 1 }]);
    expect(store.load()).toBe([{ id: 1 }]);
  });
}
`,
          hints: [
            '`toBe` compares references, so `[{ id: 1 }]` will never be `toBe` another array - use `toEqual`.',
            'Corrupt JSON: `__memoryStorage({ tasks: "{not json" })` then expect `load()` to equal `[]`.',
            'Seed a non-array with `__memoryStorage({ tasks: "5" })` - a good store still returns `[]`.',
          ],
          solution: `function suite(implementation) {
  const makeStore = (seed) => implementation.createStore(__memoryStorage(seed));

  test('saves and loads the same list', () => {
    const store = makeStore();
    store.save([{ id: 1, title: 'Ship it' }]);
    expect(store.load()).toEqual([{ id: 1, title: 'Ship it' }]);
  });

  test('persists real JSON that can be parsed back', () => {
    const storage = __memoryStorage();
    const store = implementation.createStore(storage);
    store.save([{ id: 1 }]);
    const raw = storage.raw.tasks;
    expect(typeof raw).toBe('string');
    expect(JSON.parse(raw)).toEqual([{ id: 1 }]);
  });

  test('an empty storage loads as an empty list', () => {
    expect(makeStore().load()).toEqual([]);
  });

  test('corrupt JSON loads as an empty list instead of throwing', () => {
    expect(makeStore({ tasks: '{not json' }).load()).toEqual([]);
  });

  test('a non-array value loads as an empty list', () => {
    expect(makeStore({ tasks: '5' }).load()).toEqual([]);
  });

  test('add appends to what was already stored', () => {
    const store = makeStore({ tasks: JSON.stringify([{ id: 1 }]) });
    const tasks = store.add({ id: 2 });
    expect(tasks).toEqual([{ id: 1 }, { id: 2 }]);
    expect(store.load()).toEqual([{ id: 1 }, { id: 2 }]);
  });
}
`,
          checks: [
            T.js(
              'the suite passes on the correct implementation',
              `(async function () { const result = await __runSuite(suite, __subject.good); __must(result.failures.length === 0, 'your suite fails against correct code: ' + result.failures.map((f) => f.name + ' (' + f.message + ')').join('; ')); return true; })()`,
              'Use `toEqual` for arrays and objects; `toBe` only for primitives and identity.',
            ),
            T.js(
              'the suite catches stringified storage',
              `(async function () { const result = await __runSuite(suite, __subject.sabotaged['saves the array as a string']); __must(result.failures.length > 0, 'no test noticed that the stored value was not JSON - parse it back and compare'); return true; })()`,
              '`JSON.parse(storage.raw.tasks)` must give the array back.',
            ),
            T.js(
              'the suite catches a crash on corrupt JSON',
              `(async function () { const result = await __runSuite(suite, __subject.sabotaged['crashes on corrupt JSON']); __must(result.failures.length > 0, 'no test loaded from a storage containing invalid JSON'); return true; })()`,
              'Seed `{ tasks: "{not json" }` and expect `[]`.',
            ),
            T.js(
              'the suite catches a non-array load',
              `(async function () { const result = await __runSuite(suite, __subject.sabotaged['loads something that is not an array']); __must(result.failures.length > 0, 'no test covered valid JSON that is not an array - seed "5"'); return true; })()`,
              '`JSON.parse("5")` is a number, and the contract says a list.',
            ),
          ],
        },
        {
          id: 'debug-toBe-misuse',
          kind: 'debug',
          difficulty: 'medium',
          minutes: 15,
          lang: 'js',
          async: true,
          prelude: TEST_PRELUDE + CLAMP_SUBJECT,
          prompt:
            'This suite fails against perfectly good code: it uses `toBe` on an array and on an object it constructs itself, so the assertions ' +
            'compare references. It also asserts nothing at all about the error contract. Fix the matchers and add the missing coverage.',
          requirements: [
            'The suite passes against `__subject.good`',
            'Deep comparisons use `toEqual`',
            'The reversed-range error is asserted (a reversed range must throw)',
            '`clamp` still rejects NaN in a defined way, and a test pins that down',
          ],
          starter: `function suite(implementation) {
  test('average returns the mean', () => {
    expect(implementation.average([1, 2, 3])).toBe(2);
  });

  test('average of a list is the same list', () => {
    expect([1, 2]).toBe([1, 2]);
  });

  test('clamp handles NaN', () => {
    implementation.clamp(NaN, 0, 10);
  });

  test('clamp rejects a reversed range', () => {
    implementation.clamp(5, 10, 0);
  });
}
`,
          hints: [
            'The good implementation throws `min must not be greater than max` and returns `min` for `NaN`.',
            '`toBe([1, 2])` compares two different array references - that test can never pass.',
            'Use `await expectRejects(() => implementation.clamp(5, 10, 0), /min/)` for the throw.',
          ],
          solution: `function suite(implementation) {
  test('average returns the mean', () => {
    expect(implementation.average([1, 2, 3])).toBe(2);
  });

  test('average of a list with repeats', () => {
    expect(implementation.average([1, 2, 3])).toEqual(2);
  });

  test('clamp turns NaN into the minimum', () => {
    expect(implementation.clamp(NaN, 0, 10)).toBe(0);
  });

  test('clamp rejects a reversed range', async () => {
    await expectRejects(() => implementation.clamp(5, 10, 0), /min/);
  });
}
`,
          checks: [
            T.js(
              'the suite passes on correct code',
              `(async function () { const result = await __runSuite(suite, __subject.good); __must(result.failures.length === 0, 'still failing against correct code: ' + result.failures.map((f) => f.name + ' (' + f.message + ')').join('; ')); return true; })()`,
              'Replace identity comparisons with shape comparisons.',
            ),
            T.js(
              'no toBe is used on an object or array literal',
              `(async function () { await __runSuite(suite, __subject.good); return true; })()`,
              'Keep `toBe` for numbers and strings; `toEqual` for structures.',
            ),
            T.js(
              'the reversed range throws and the NaN rule is pinned down',
              `(async function () { const result = await __runSuite(suite, __subject.good); __must(result.count >= 4, 'keep at least four tests'); return true; })()`,
              'Assert both the throw and the `NaN` behaviour explicitly.',
            ),
          ],
        },
        {
          id: 'write-assertion-contract',
          kind: 'write',
          difficulty: 'easy',
          minutes: 15,
          lang: 'js',
          async: true,
          prelude: TEST_PRELUDE + CLAMP_SUBJECT,
          prompt:
            'Write `suite(implementation)` that documents the full contract of `clamp` and `average` with the right matcher for each job: ' +
            'identity where identity matters, shape where shape matters, `toThrow` for failures, `toBeCloseTo` for floats, `.not` for what must ' +
            'not happen. It must pass on the good implementation and catch all four sabotages.',
          requirements: [
            'At least six tests',
            'A `toBe` test that proves clamping returns the same primitive value',
            'A `toBeCloseTo` test for a floating-point average',
            'A rejection test using `expectRejects` with a message pattern',
            'A `.not` assertion somewhere it belongs',
            'All four sabotages are caught',
          ],
          starter: `function suite(implementation) {
  // Build the contract test by test.
}
`,
          hints: [
            'The four sabotages: a missing lower bound, `average([]) === 0`, a rounded average, and a reversed range that does not throw.',
            '`expect(implementation.average([1, 2, 2])).toBeCloseTo(1.67, 2)` catches the rounding.',
            '`expect([1]).not.toContain(2)` shows the negative matcher; use it where it says something real.',
          ],
          solution: `function suite(implementation) {
  test('clamp returns the value unchanged inside the range', () => {
    expect(implementation.clamp(5, 0, 10)).toBe(5);
  });

  test('clamp enforces the minimum', () => {
    expect(implementation.clamp(-1, 0, 10)).toBe(0);
  });

  test('clamp enforces the maximum', () => {
    expect(implementation.clamp(50, 0, 10)).toBe(10);
  });

  test('clamp of NaN is the minimum, not NaN', () => {
    expect(implementation.clamp(NaN, 0, 10)).toBe(0);
    expect(implementation.clamp(NaN, 0, 10)).not.toBe(NaN);
  });

  test('clamp rejects a reversed range', async () => {
    await expectRejects(() => implementation.clamp(5, 10, 0), /min/);
  });

  test('average of an empty list is null', () => {
    expect(implementation.average([])).toBe(null);
  });

  test('average keeps floating point precision', () => {
    expect(implementation.average([1, 2, 2])).toBeCloseTo(1.67, 2);
  });

  test('average rejects a non-array', async () => {
    await expectRejects(() => implementation.average('nope'), /array/);
  });
}
`,
          checks: [
            T.js(
              'the suite passes on correct code',
              `(async function () { const result = await __runSuite(suite, __subject.good); __must(result.count >= 6, 'write at least six tests, found ' + result.count); __must(result.failures.length === 0, 'failing against correct code: ' + result.failures.map((f) => f.name + ' (' + f.message + ')').join('; ')); return true; })()`,
              'Each matcher should say something only the real implementation satisfies.',
            ),
            T.js(
              'catches the missing lower bound and the wrong empty average',
              `(async function () { const a = await __runSuite(suite, __subject.sabotaged['clamp ignores the lower bound']); __must(a.failures.length > 0, 'the missing minimum was not caught'); const b = await __runSuite(suite, __subject.sabotaged['average returns 0 for an empty array']); __must(b.failures.length > 0, 'average([]) === 0 was not caught'); return true; })()`,
              'Cover the below-min case and the empty average.',
            ),
            T.js(
              'catches the rounded average and the missing throw',
              `(async function () { const a = await __runSuite(suite, __subject.sabotaged['average corrupts floats with toFixed']); __must(a.failures.length > 0, 'the rounded average was not caught - use toBeCloseTo with a precise expectation'); const b = await __runSuite(suite, __subject.sabotaged['clamp throws on a reversed range']); __must(b.failures.length > 0, 'the reversed-range throw was not covered'); return true; })()`,
              'A test asserting the throw must fail when the throw disappears... which is what `expectRejects` does.',
            ),
          ],
        },
      ],
    },

    // ---------------------------------------------------------------------
    {
      id: 'test-03',
      title: 'Debugging: From Red Test to Root Cause',
      minutes: 40,
      objectives: [
        'Read a failing assertion and locate the code responsible',
        'Shrink a bug to a minimal reproduction before fixing it',
        'Fix the cause, not the symptom, and prove it with the contract suite',
      ],
      sections: [
        {
          heading: 'A failing test is a precise question',
          body:
            '```\nAssertionError: expected 5 to be 4\n  at range (challenge.js:6:28)\n```\n\n' +
            'That message tells you three things: the expectation, the actual value, and the line. Before touching anything, answer: what input ' +
            'produced this? What did I expect and why? Write the input down.\n\n' +
            'Then reduce it. If `range(0, 5)` gives `[0,1,2,3,4]` but `range(5, 0, -1)` gives `[]`, the bug lives in the descending branch - you ' +
            'have already halved the search space without a debugger.',
        },
        {
          heading: 'Hypothesis, then one change at a time',
          body:
            'The scientific method, applied to code:\n\n' +
            '1. **Observe** - the exact failing case and the exact wrong value\n' +
            '2. **Hypothesise** - "the loop condition uses `<` where the descending case needs `>`"\n' +
            '3. **Predict** - "if that is it, `range(5, 0, -1)` will return `[]` but `range(5, 0, 1)` will work"\n' +
            '4. **Test the prediction** - add a print or a test for exactly that case\n' +
            '5. **Fix one thing**, then re-run the whole suite\n\n' +
            'Changing three things at once and seeing green tells you nothing about which change mattered - and you will not learn why it was ' +
            'broken.',
        },
        {
          heading: 'Tools, in the order you should reach for them',
          body:
            '- **The assertion message** - free, instant, first\n' +
            '- **A smaller test case** - the most powerful debugger ever built\n' +
            '- **A `console.log` at the boundary** of the function, not in five places\n' +
            '- **A breakpoint** (`node --inspect-brk`) when you need to watch state change over time\n' +
            '- **`git bisect`** when it worked last week and you have 200 commits since\n' +
            '- **A rubber duck** - explaining the code out loud finds the assumption you never questioned\n\n' +
            'Notice what is not on the list: changing code to see if it helps. That is guessing, and it usually adds a second bug.',
        },
        {
          heading: 'Bugs come in families',
          body:
            '- **Off-by-one**: `<` vs `<=`, `length` vs `length - 1`\n' +
            '- **Order of operations**: else-if chains where a broad case swallows a specific one\n' +
            '- **Mutation**: sorting/filtering the caller\'s array in place\n' +
            '- **Swallowed errors**: `catch {}` that returns undefined instead of rethrowing\n' +
            '- **Async assumptions**: reading state before the await resolves\n\n' +
            'Recognising the family tells you where to look. Every one of those appears in the challenges below, with a contract suite that fails ' +
            'until the cause is fixed.',
        },
      ],
      pitfalls: [
        'Changing the test to match the buggy output - now you have two problems',
        'Fixing the symptom (special-casing the failing input) instead of the cause',
        'Editing five things before re-running, so you cannot tell what worked',
        'Trusting `console.log` output without checking the variable is what you think it is',
        'Declaring victory without running the whole suite',
      ],
      keyPoints: [
        'Read the assertion, shrink the input, form a hypothesis, change one thing',
        'Fix the cause in the implementation; never weaken the test to make it pass',
        'Recognise the bug family to look in the right place first',
      ],
      resources: [
        { label: 'node --inspect (debugger docs)', url: 'https://nodejs.org/en/learn/getting-started/debugging' },
        { label: 'git bisect documentation', url: 'https://git-scm.com/docs/git-bisect' },
        { label: 'Chrome DevTools: Debug JavaScript', url: 'https://developer.chrome.com/docs/devtools/javascript/' },
        { label: 'Julia Evans: How to debug a program', url: 'https://jvns.ca/blog/2016/08/24/five-ways-to-avoid-being-stuck-debugging/' },
      ],
      challenges: [
        {
          id: 'debug-off-by-one',
          kind: 'debug',
          difficulty: 'easy',
          minutes: 12,
          lang: 'js',
          async: true,
          prelude: TEST_PRELUDE + RANGE_SUBJECT,
          prompt:
            'A hidden contract suite tests your `range(from, to, step)`. Right now it reports:\n\n' +
            '```\nexpected [] to equal [5, 4, 3, 2, 1]\n  at range (challenge.js:8)\n```\n\n' +
            'Implement `range` so the whole suite passes: ascending and descending, a custom step, an empty span when `from === to`, and a ' +
            'zero step that throws instead of looping forever.',
          requirements: [
            '`range(0, 5)` gives `[0, 1, 2, 3, 4]` - inclusive of `from`, exclusive of `to`',
            '`range(0, 10, 5)` gives `[0, 5]`',
            '`range(5, 0, -1)` counts down: `[5, 4, 3, 2, 1]`',
            '`range(3, 3)` gives `[]`',
            'A step of `0` throws instead of hanging',
          ],
          starter: `function range(from, to, step) {
  const stride = step === undefined ? 1 : step;
  const out = [];
  for (let i = from; i < to; i += stride) {
    out.push(i);
  }
  return out;
}
`,
          hints: [
            'The condition `i < to` is only right when the step is positive.',
            'Branch on the direction: `if (stride > 0) ... else ...`, with `i > to` for the descending case.',
            'Guard the zero step before the loop - `i += 0` never terminates.',
          ],
          solution: `function range(from, to, step) {
  const stride = step === undefined ? 1 : step;
  if (stride === 0) throw new Error('step must not be zero');

  const out = [];
  if (stride > 0) {
    for (let i = from; i < to; i += stride) out.push(i);
  } else {
    for (let i = from; i > to; i += stride) out.push(i);
  }
  return out;
}
`,
          checks: [
            T.js(
              'the contract suite passes',
              `(async function () { const result = await __runSuite(__contract, { range: range }); __must(result.failures.length === 0, 'still failing: ' + result.failures.map((f) => f.name + ' -> ' + f.message).join('; ')); return true; })()`,
              'Run the whole suite after each change - do not stop at the first green assertion.',
            ),
            T.js(
              'descending ranges are correct on their own',
              `(function () { __must(range(5, 0, -1).join() === '5,4,3,2,1', 'the descending branch is still wrong, got ' + JSON.stringify(range(5, 0, -1))); __must(range(0, 3).join() === '0,1,2', 'the ascending branch regressed, got ' + JSON.stringify(range(0, 3))); return true; })()`,
              'Two loops, one per direction, sharing the same accumulator.',
            ),
          ],
        },
        {
          id: 'debug-else-if-order',
          kind: 'debug',
          difficulty: 'medium',
          minutes: 15,
          lang: 'js',
          async: true,
          prelude: TEST_PRELUDE + COST_SUBJECT,
          prompt:
            'A hidden contract suite tests your `shipping(weightKg, express, member)` function. It currently reports:\n\n' +
            '```\nexpected 11.99 to be 10.79\n  at shipping (challenge.js:9)\nexpected 9.49 to be 5.49\n  at shipping (challenge.js:7)\n```\n\n' +
            'Diagnose the arithmetic: the weight surcharge is being calculated wrongly, and the member discount is being applied after the ' +
            'express fee in a way that loses money.',
          requirements: [
            'Base rate is 4.99',
            'Each whole kilo above 2 adds 1.50 (`5kg` costs 4.99 + 3 x 1.50 = 9.49)',
            'Express adds exactly 7.00',
            'Members pay 10% less than the final total (11.99 -> 10.79), rounded to 2 decimals',
            'A weight that is not a positive number throws',
          ],
          starter: `function shipping(weightKg, express, member) {
  let cost = 4.99;
  if (weightKg > 2) {
    cost += (weightKg - 2) * 1.5;
  }
  if (member) {
    cost = cost * 0.9;
  }
  if (express) {
    cost += 7;
  }
  return Number(cost.toFixed(2));
}
`,
          hints: [
            'The failing case says 9.49 was expected where the code gave something else - check the surcharge formula against the statement "each whole kilo above 2".',
            '`Math.ceil(weightKg - 2) * 1.5` for 5kg gives 4.50, and 4.99 + 4.50 = 9.49.',
            'The member discount must be the *last* thing applied, after the express fee - and the input guard is missing entirely.',
          ],
          solution: `function shipping(weightKg, express, member) {
  if (typeof weightKg !== 'number' || Number.isNaN(weightKg) || weightKg <= 0) {
    throw new Error('weight must be a positive number');
  }

  let cost = 4.99;
  if (weightKg > 2) {
    cost += Math.ceil(weightKg - 2) * 1.5;
  }
  if (express) {
    cost += 7;
  }
  if (member) {
    cost = Number((cost * 0.9).toFixed(2));
  }
  return Number(cost.toFixed(2));
}
`,
          checks: [
            T.js(
              'the contract suite passes',
              `(async function () { const result = await __runSuite(__contract, { shipping: shipping }); __must(result.failures.length === 0, 'still failing: ' + result.failures.map((f) => f.name + ' -> ' + f.message).join('; ')); return true; })()`,
              'Work through the failing expectations one at a time.',
            ),
            T.js(
              'the surcharge is per whole kilo above two',
              `(function () { __must(shipping(2, false, false) === 4.99, '2kg is exactly the base rate, got ' + shipping(2, false, false)); __must(shipping(2.5, false, false) === 6.49, '2.5kg means one whole extra kilo, got ' + shipping(2.5, false, false)); __must(shipping(5, false, false) === 9.49, '5kg should be 9.49, got ' + shipping(5, false, false)); return true; })()`,
              '`Math.ceil(weightKg - 2) * 1.5`.',
            ),
            T.js(
              'the guard rejects bad weights',
              `(function () { let threw = 0; [0, -1, NaN, 'heavy'].forEach((bad) => { try { shipping(bad, false, false); } catch (err) { threw += 1; } }); __must(threw === 4, 'all four bad weights should throw, only ' + threw + ' did'); return true; })()`,
              'Validate the type, NaN and the sign at the top of the function.',
            ),
          ],
        },
        {
          id: 'debug-swallowed-error',
          kind: 'debug',
          difficulty: 'hard',
          minutes: 18,
          lang: 'js',
          async: true,
          prelude: TEST_PRELUDE + RETRY_SUBJECT,
          prompt:
            'A hidden contract suite tests your `withRetry(operation, options)`. It reports:\n\n' +
            '```\nexpected it to reject, but it resolved\n  at withRetry (challenge.js:14)\nexpected 1 to be 3\n  at withRetry (challenge.js:18)\n```\n\n' +
            'Two bugs, one family: errors are being swallowed, and the retry loop gives up after a single attempt. Implement the contract ' +
            'properly.',
          requirements: [
            '`attempts` defaults to 3 and the operation is called at most that many times',
            'The first success resolves with its value immediately (no extra calls)',
            'The operation receives the 1-based attempt number',
            'If every attempt fails, it rejects with the *last* error',
            '`onRetry(attempt, error)` fires between attempts, before sleeping',
            '`sleep(attempt)` is awaited between attempts',
          ],
          starter: `async function withRetry(operation, options) {
  const opts = options || {};
  const attempts = opts.attempts || 3;
  const onRetry = opts.onRetry || (() => {});

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (err) {
      onRetry(attempt, err);
    }
  }
  return undefined;
}
`,
          hints: [
            'Returning `undefined` after the loop is the swallowed error - keep `lastError` and throw it.',
            '`opts.attempts || 3` hides an explicit `attempts: 0`; use `??` instead.',
            'The sleep was dropped entirely: `await (opts.sleep || (() => Promise.resolve()))(attempt)` between attempts.',
          ],
          solution: `async function withRetry(operation, options) {
  const opts = options || {};
  const attempts = opts.attempts ?? 3;
  const sleep = opts.sleep || (() => Promise.resolve());
  const onRetry = opts.onRetry || (() => {});

  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (err) {
      lastError = err;
      if (attempt < attempts) {
        onRetry(attempt, err);
        await sleep(attempt);
      }
    }
  }

  throw lastError;
}
`,
          checks: [
            T.js(
              'the contract suite passes',
              `(async function () { const result = await __runSuite(__contract, { withRetry: withRetry }); __must(result.failures.length === 0, 'still failing: ' + result.failures.map((f) => f.name + ' -> ' + f.message).join('; ')); return true; })()`,
              'A rejected promise from the last attempt must propagate, not be swallowed.',
            ),
            T.js(
              'a permanent failure rejects with the last error',
              `(async function () {
  const errors = [];
  let calls = 0;
  try {
    await withRetry(() => { calls += 1; return Promise.reject(new Error('failure ' + calls)); }, { attempts: 3, sleep: () => Promise.resolve() });
    __must(false, 'it resolved instead of rejecting');
  } catch (err) {
    errors.push(err.message);
  }
  __must(calls === 3, 'the operation should be called 3 times, was called ' + calls);
  __must(errors[0] === 'failure 3', 'the last error should win, got ' + JSON.stringify(errors[0]));
  return true;
})()`,
              'Track `lastError` in the catch and throw it after the loop.',
            ),
            T.js(
              'onRetry and sleep only run between attempts',
              `(async function () {
  const events = [];
  await withRetry((attempt) => {
    if (attempt < 2) return Promise.reject(new Error('nope'));
    return Promise.resolve('done');
  }, {
    attempts: 3,
    onRetry: (attempt) => events.push('retry ' + attempt),
    sleep: (attempt) => { events.push('sleep ' + attempt); return Promise.resolve(); },
  });
  __must(events.join(' | ') === 'retry 1 | sleep 1', 'expected one retry then one sleep, got ' + events.join(' | '));
  return true;
})()`,
              'Only retry while `attempt < attempts`.',
            ),
          ],
        },
      ],
    },
  ],

  project: {
    id: 'testing-capstone',
    title: 'Capstone: a tested, mutation-resistant task API',
    minutes: 240,
    brief:
      'Take the Express + SQL task API and put a real safety net under it: unit tests for the pure logic, integration tests against a real ' +
      'in-memory database, and a mutation run that proves the suite is not just decoration.\\n\\n' +
      'Then write `DEBUG.md`: three bugs you actually hit while doing this, how you found each one, and what you would do differently next ' +
      'time. That document is worth more than the coverage number.',
    starter: `task-api/
├── src/
│   ├── services/tasks.js
│   └── routes/tasks.js
├── test/
│   ├── unit/validate.test.js
│   ├── integration/tasks.test.js
│   └── helpers/db.js
├── stryker.conf.json
├── DEBUG.md
└── package.json`,
    requirements: [
      '`node --test` (or Vitest) runs the whole suite with no network and no sleeps longer than 50ms',
      'Unit tests for every pure function: validation, mapping, totals, slug generation',
      'Integration tests that boot the real router against a throwaway SQLite database, seeded per test',
      'Every test creates its own data and asserts on the state it created - no shared fixtures, no order dependence',
      'The happy path AND the failure path for every endpoint (400, 404, 409, 500)',
      'One test per bug you can imagine: duplicate title, 61-character title, whitespace-only title, missing id',
      'A mutation run (Stryker, or a hand-written sabotage script) with a mutation score of 80% or better',
      'Coverage is reported but never chased - every uncovered line is either dead code or a missing test',
      'Assertions compare exact values and shapes; no `toBeTruthy()` on a string that could be "false"',
      'No test asserts on console output, and none depend on the system clock',
      '`DEBUG.md` documents three real bugs with the failing assertion, the hypothesis, and the fix',
    ],
    checks: [
      'Delete a line of validation logic: at least one test goes red',
      'Change `>` to `>=` in a length check: a boundary test catches it',
      'Swap the order of two mutation calls in the service: an integration test catches it',
      'Run the suite twice in a row in a different order (shuffle with `--test-shuffle`): identical results',
      'Unplug the network and run the suite: it still passes',
      'Grep the tests for `setTimeout(` with a value over 50: none',
      'Intentionally swallow an error in the service: the failure-path test fails',
      'Mutation score is 80% or higher, and every surviving mutant has a documented reason',
      'A brand new contributor can run the suite with one command from the README',
      '`DEBUG.md` contains a real failing assertion for each bug, not a summary',
    ],
    stretch: [
      'Add property-based tests with fast-check for the range/clamp style helpers',
      'Add a contract test that runs the same suite against the real HTTP server and an in-process router',
      'Add snapshot tests for the API error shapes and review every snapshot by hand',
      'Wire the suite into GitHub Actions with coverage reported per pull request',
      'Add a flaky-test detector that runs the suite 20 times and reports any test with mixed results',
    ],
  },
};
