import { T } from '../core/grade.js';

const TODO_FIXTURE = `<div id="app">
  <h1 id="title">Today</h1>
  <ul id="list"></ul>
  <input id="input" value="">
  <button id="add" type="button">Add</button>
  <p id="count">0 items</p>
</div>`;

const CLICK_FIXTURE = `<div id="app">
  <button id="dec" type="button">-</button>
  <output id="value">0</output>
  <button id="inc" type="button">+</button>
  <button id="reset" type="button">reset</button>
</div>`;

export default {
  id: 'javascript',
  title: 'JavaScript',
  badge: 'JS',
  color: 'star',
  tagline: 'The language of the browser and the server - and the one that bites back',
  hours: 8,
  why:
    'JavaScript is the only language you cannot avoid on the web. It is also the one where a single typo produces a silent wrong answer instead ' +
    'of an error, which is why this module is full of bugs to hunt rather than syntax to memorise. Learn to read code, predict its output, ' +
    'and prove it with `console.log`.',
  source: {
    course: 'Dave Gray - JavaScript Full Course for Beginners (8h)',
    url: 'https://www.youtube.com/watch?v=EfAl9bwzVZk',
    roadmap: 'https://roadmap.sh/javascript',
    docs: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript',
  },
  lessons: [
    // ---------------------------------------------------------------------
    {
      id: 'js-01',
      title: 'Variables, Types and Type Coercion',
      minutes: 25,
      objectives: [
        'Choose const or let deliberately and never need var',
        'Predict what typeof returns and where coercion surprises you',
        'Convert types on purpose instead of hoping',
      ],
      sections: [
        {
          heading: 'const by default, let when it changes',
          body:
            '`const` does not mean "immutable value", it means "this binding cannot be reassigned". You can still push to a `const` array. That ' +
            'distinction matters: `const` is the right default, `let` is for counters and accumulators, and `var` is a legacy feature with ' +
            'function-level scoping that causes bugs you cannot see.\n\n' +
            'Undeclared assignment (`x = 5` without `const`) creates a global. It works in a toy file and breaks the moment two scripts run ' +
            'together.',
        },
        {
          heading: 'The eight types, and the one trap',
          body:
            '`string`, `number`, `bigint`, `boolean`, `undefined`, `null`, `symbol`, `object`. Everything else - arrays, functions, dates, ' +
            'regexes - is an object.\n\n' +
            'The trap: `typeof null` is `"object"`. It is a bug from 1995 that cannot be fixed without breaking the web. To test for null, ' +
            'use `value === null`.',
        },
        {
          heading: 'Coercion is where the bugs live',
          body:
            '`+` is the offender: with any string operand it concatenates instead of adding.\n\n' +
            '- `"5" + 3` -> `"53"`\n' +
            '- `"5" - 3` -> `2` (only `+` is overloaded)\n' +
            '- `"5" * "2"` -> `10`\n' +
            '- `1 == "1"` -> `true`\n' +
            '- `1 === "1"` -> `false`\n' +
            '- `[] + {}` -> `"[object Object]"`\n' +
            '- `NaN === NaN` -> `false` (use `Number.isNaN`)\n\n' +
            'Form input is *always* a string. That is why `input.value + 1` produces `"51"` - the single most common beginner bug on the web.',
        },
        {
          heading: 'Convert on purpose',
          body:
            '- `Number("42")` -> 42, `Number("")` -> 0, `Number("42px")` -> `NaN`\n' +
            '- `parseInt("42px", 10)` -> 42 (stops at the first non-digit - always pass the radix)\n' +
            '- `parseFloat("3.14rem")` -> 3.14\n' +
            '- `String(42)`, `(42).toString()`\n' +
            '- `Boolean("")` -> false; also falsy: `0`, `-0`, `NaN`, `null`, `undefined`, `0n`, and `false`\n\n' +
            'Everything else is truthy - including `"0"`, `"false"` and `[]`. That last one bites people checking an array of results.',
        },
        {
          heading: 'Sample code: types behaving predictably',
          body: 'Every line here is a bug you will not have to debug later.',
          code: {
            lang: 'js',
            caption: 'types.js',
            source: `const PRICE = 19.99;          // never reassigned -> const
let cartCount = 0;            // changes -> let

// Form input arrives as a string. Convert before doing maths.
function parseQuantity(raw) {
  const n = Number(String(raw).trim());
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

function formatMoney(amount) {
  return \`GHS \${amount.toFixed(2)}\`;
}

function isFree(item) {
  return item.price === 0;      // strict: "0" is not 0
}

// Template literals beat string concatenation for anything with a variable.
function label(name, count) {
  return \`\${name} (\${count} \${count === 1 ? 'item' : 'items'})\`;
}

console.log(label('Cart', 1));           // Cart (1 item)
console.log(label('Cart', 3));           // Cart (3 items)
console.log(parseQuantity(' 12 '));      // 12
console.log(parseQuantity('twelve'));    // 1
console.log(formatMoney(PRICE * 2));     // GHS 39.98
console.log(typeof null);                // "object" - the famous bug
console.log(Number.isNaN(NaN));          // true`,
          },
        },
      ],
      pitfalls: [
        '`input.value + 1` producing `"51"` instead of `52`',
        'Using `==` and relying on coercion you have not thought through',
        'Checking `x === NaN` instead of `Number.isNaN(x)`',
        '`typeof null === "object"`, so a null check via typeof silently passes',
        'Treating an empty string as "no value" and 0 as falsy in the same expression',
      ],
      keyPoints: [
        '`const` by default, `let` when it changes, never `var`',
        '`typeof null` is `"object"` - compare with `=== null`',
        'Only `+` concatenates; `-`, `*`, `/` coerce to number',
        '`Number()` for full conversion, `parseInt(x, 10)` to stop at a non-digit',
      ],
      resources: [
        { label: 'MDN: JavaScript data types', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Data_structures' },
        { label: 'MDN: Type coercion', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Type_conversion' },
        { label: 'What the heck is the event loop? (later, for js-06)', url: 'https://www.youtube.com/watch?v=8aGhZQkoFbQ' },
      ],
      challenges: [
        {
          id: 'fix-types',
          kind: 'debug',
          difficulty: 'easy',
          minutes: 10,
          lang: 'js',
          prompt:
            'Four functions, four classic type bugs. Nothing here throws an error - every one of them returns a quietly wrong answer, which is ' +
            'exactly why you need to read carefully and run the checks.',
          requirements: [
            '`addPrices` adds numbers even when it is handed strings',
            '`isAdult` returns a boolean based on age, and must not assign',
            '`parseQuantity` returns a whole number of at least 1 for any input',
            '`describe` reports `"object"` for both `null` and arrays, matching `typeof`',
          ],
          starter: `function addPrices(a, b) {
  return a + b;
}

function isAdult(age) {
  return age = 18;
}

function parseQuantity(raw) {
  return raw;
}

function describe(value) {
  return 'The value is ' + typeof value;
}`,
          hints: [
            '`"10" + "5"` is `"105"`. Which operator forces numeric conversion?',
            'A single `=` assigns. You want a comparison that also returns a boolean.',
            '`Number()` on non-numeric text gives `NaN`. Guard it and fall back.',
            '`typeof null` really is `"object"`, and so is `typeof []` - do not "fix" that, the test expects it.',
          ],
          solution: `function addPrices(a, b) {
  return Number(a) + Number(b);
}

function isAdult(age) {
  return Number(age) >= 18;
}

function parseQuantity(raw) {
  const n = Number(String(raw).trim());
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

function describe(value) {
  return 'The value is ' + typeof value;
}`,
          checks: [
            T.js('addPrices("10", "5") is 15, not "105"', 'addPrices("10", "5") === 15', 'Convert both operands with `Number()`.'),
            T.js('addPrices still works with real numbers', 'addPrices(2.5, 2.5) === 5'),
            T.js('isAdult(17) is false', 'isAdult(17) === false', '`return age = 18` assigns 18 and returns it - always truthy.'),
            T.js('isAdult(18) and isAdult(65) are true', 'isAdult(18) === true && isAdult(65) === true'),
            T.js('isAdult returns a real boolean', 'typeof isAdult(20) === "boolean"'),
            T.js('parseQuantity(" 12 ") is 12', 'parseQuantity(" 12 ") === 12', '`Number()` ignores surrounding whitespace.'),
            T.js('parseQuantity("twelve") falls back to 1', 'parseQuantity("twelve") === 1', 'Guard `NaN` with `Number.isFinite`.'),
            T.js('parseQuantity(2.9) is a whole number', 'Number.isInteger(parseQuantity(2.9)) && parseQuantity(2.9) === 2', 'Use `Math.floor`.'),
            T.js('describe(null) says object', 'describe(null) === "The value is object"'),
            T.js('describe([]) says object', 'describe([]) === "The value is object"'),
            T.js('describe(42) says number', 'describe(42) === "The value is number"'),
            T.notSrc('No `var` declarations', /\bvar\s/, '`const` and `let` only.'),
          ],
        },
        {
          id: 'write-format',
          kind: 'write',
          difficulty: 'easy',
          minutes: 12,
          lang: 'js',
          prompt:
            'Write four small utility functions with no type bugs in them: money formatting, a safe integer parser, a membership label and a ' +
            'strict free-price check. These are the kind of helpers every project ends up with.',
          requirements: [
            '`formatMoney(amount)` -> `"GHS 19.99"` with exactly two decimals',
            '`toInt(value, fallback)` -> an integer, or `fallback` for anything non-numeric',
            '`label(count)` -> `"1 item"` or `"3 items"` (singular and plural)',
            '`isFree(item)` -> true only when `item.price` is exactly the number 0',
          ],
          starter: ``,
          hints: [
            '`toFixed(2)` gives you two decimals as a string.',
            '`Number.isFinite(Number(v))` is the safest numeric test - it rejects `""`, `null` and `"abc"`.',
            'Use a template literal with a ternary for the plural.',
            '`=== 0` is strict, so the string `"0"` correctly fails.',
          ],
          solution: `function formatMoney(amount) {
  return \`GHS \${Number(amount).toFixed(2)}\`;
}

function toInt(value, fallback = 0) {
  const text = String(value === null || value === undefined ? '' : value).trim();
  if (text === '') return fallback;
  const n = Number(text);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function label(count) {
  const n = toInt(count, 0);
  return \`\${n} item\${n === 1 ? '' : 's'}\`;
}

function isFree(item) {
  return item != null && item.price === 0;
}`,
          checks: [
            T.js('formatMoney(19.99) === "GHS 19.99"', 'formatMoney(19.99) === "GHS 19.99"'),
            T.js('formatMoney rounds to two decimals', 'formatMoney(5) === "GHS 5.00" && formatMoney(1.005) .length > 6'),
            T.js('toInt("42") === 42', 'toInt("42") === 42'),
            T.js('toInt("4.9") truncates', 'toInt("4.9") === 4', 'Use `Math.trunc` or `Math.floor`.'),
            T.js('toInt returns the fallback for junk', 'toInt("abc", -1) === -1 && toInt("", 7) === 7'),
            T.js('toInt handles a custom fallback of 0', 'toInt(undefined, 0) === 0'),
            T.js('label singular', 'label(1) === "1 item"'),
            T.js('label plural', 'label(3) === "3 items" && label(0) === "0 items"'),
            T.js('isFree is strict about the string "0"', 'isFree({ price: 0 }) === true && isFree({ price: "0" }) === false', '`=== 0` does not coerce.'),
            T.js('isFree survives a missing item', 'isFree(null) === false && isFree({}) === false'),
            T.notSrc('No loose equality', /[^=!<>]==[^=]/, 'Use `===`.'),
          ],
        },
      ],
    },

    // ---------------------------------------------------------------------
    {
      id: 'js-02',
      title: 'Functions, Scope and Closures',
      minutes: 30,
      objectives: [
        'Choose between a function declaration, an arrow and a method',
        'Explain what a closure captures and why that is useful',
        'Spot the missing-return and off-by-one bugs that survive every test',
      ],
      sections: [
        {
          heading: 'Three ways to write a function',
          body:
            '- **Declaration** `function add(a, b) {}` - hoisted, so it can be called before it is defined\n' +
            '- **Arrow** `const add = (a, b) => a + b` - no own `this`, no `arguments`, and a concise body returns the expression\n' +
            '- **Method** `obj.add = function () {}` - has its own `this`, which is why object methods are rarely arrows\n\n' +
            'Rule of thumb: arrow functions for callbacks and small helpers, declarations for things you want hoisted, and never an arrow for ' +
            'an object method that uses `this`.',
        },
        {
          heading: 'Scope: three levels, and closures',
          body:
            '`var` is function-scoped, `let`/`const` are block-scoped. A block is anything with braces - including an `if`, a `for` and a bare ' +
            '`{}`.\n\n' +
            'A **closure** is a function that remembers the variables where it was *defined*, even after that code has finished running. That is ' +
            'how counters, private state and callbacks keep working.',
          code: {
            lang: 'js',
            caption: 'closures in practice',
            source: `function createCounter(start = 0) {
  let count = start;          // captured private state
  return {
    increment: () => ++count,
    value: () => count,
  };
}

const counter = createCounter(10);
counter.increment();
counter.value();              // 11

function createMultiplier(factor) {
  return (n) => n * factor;
}

const triple = createMultiplier(3);
triple(4);                    // 12

// The classic loop bug, fixed with let (or with a factory function)
const fns = [];
for (let i = 0; i < 3; i += 1) {
  fns.push(() => i);
}
fns.map((f) => f());          // [0, 1, 2]`,
          },
        },
        {
          heading: 'Parameters you should be using',
          body:
            '```\nfunction greet(name = "friend", { excited = false } = {}) {\n  return `Hello ${name}${excited ? "!" : "."}`;\n}\n```\n\n' +
            'Default parameters fire when the argument is `undefined` (not `null`). Destructuring in the parameter list keeps call sites ' +
            'readable, and the final `= {}` makes the whole object optional.\n\n' +
            'Rest parameters collect the leftovers: `function sum(...nums)`. If you also want the first argument separately, name it and then ' +
            'rest the remainder.',
        },
        {
          heading: 'Sample code: the four function patterns you will write most',
          body: 'A factory, a higher-order function, a validator and a guard clause. Note how each one returns something.',
          code: {
            lang: 'js',
            caption: 'functions.js',
            source: `// 1. Factory: returns a function configured once
const createSlugger = (separator = '-') => (title) =>
  String(title)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, separator)
    .replace(/^-|-$/g, '');

const slug = createSlugger('-');
slug('  Hello, World!  ');        // "hello-world"

// 2. Higher-order function: takes a function, returns a new one
function once(fn) {
  let done = false;
  let result;
  return (...args) => {
    if (!done) {
      result = fn(...args);
      done = true;
    }
    return result;
  };
}

// 3. Validator with early returns instead of nested ifs
function validateSignup({ email, password } = {}) {
  if (!email) return { ok: false, error: 'Email is required' };
  if (!email.includes('@')) return { ok: false, error: 'Email is not valid' };
  if (!password || password.length < 8) return { ok: false, error: 'Password must be 8+ characters' };
  return { ok: true, error: null };
}

// 4. Recursion stays readable when the base case is first
function sumTo(n) {
  if (n <= 0) return 0;       // base case first
  return n + sumTo(n - 1);
}

sumTo(4);                        // 10`,
          },
        },
      ],
      pitfalls: [
        'Forgetting `return` - the function returns `undefined` and the bug shows up three files away',
        'An arrow function used as an object method, so `this` is the module, not the object',
        'Using `var` in a loop and giving every callback the final value of `i`',
        'Mutating a parameter and assuming the caller cannot see it (objects are passed by reference)',
        'A recursive function whose base case is never reached, usually via an off-by-one',
      ],
      keyPoints: [
        'Arrow functions inherit `this`; declarations hoist',
        'Closures capture the *scope*, not the value',
        'Default parameters apply for `undefined` only',
        'Guard clauses beat nested `if`s',
      ],
      resources: [
        { label: 'MDN: Closures', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Closures' },
        { label: 'MDN: Arrow functions', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/Arrow_functions' },
      ],
      challenges: [
        {
          id: 'fix-functions',
          kind: 'debug',
          difficulty: 'medium',
          minutes: 12,
          lang: 'js',
          prompt:
            'Three functions, three bugs that no test would catch without being asked to look: a missing return, a counter that reports before ' +
            'it counts, and a multiplier that captures nothing. Fix them.',
          requirements: [
            '`add` returns the sum instead of discarding it',
            '`makeCounter()` returns a function where the **first** call gives 1',
            '`multiplier(factor)` returns a function that multiplies by that factor',
            '`range(n)` returns `[0, 1, ..., n-1]` - no off-by-one',
          ],
          starter: `function add(a, b) {
  a + b;
}

function makeCounter() {
  let count = 0;
  return function () {
    return count++;
  };
}

function multiplier(factor) {
  return function (n) {
    return n * n;
  };
}

function range(n) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    out.push(i);
  }
  return out;
}`,
          hints: [
            'A function without `return` gives you `undefined`. What is the expression on the line before the closing brace doing?',
            '`count++` returns the value *before* incrementing. `++count` returns the new value.',
            'The multiplier should use its `factor` parameter, which it closes over.',
            '`range(3)` should be `[0,1,2]`, so the loop should stop before `n`.',
          ],
          solution: `function add(a, b) {
  return a + b;
}

function makeCounter() {
  let count = 0;
  return function () {
    return ++count;
  };
}

function multiplier(factor) {
  return function (n) {
    return n * factor;
  };
}

function range(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(i);
  }
  return out;
}`,
          checks: [
            T.js('add returns a value', 'add(2, 3) === 5', 'You are computing `a + b` and throwing it away.'),
            T.js('add handles negative numbers', 'add(-1, 1) === 0 && add(0, 0) === 0'),
            T.js('makeCounter starts at 1', 'makeCounter()() === 1', '`count++` returns the old value.'),
            T.js('makeCounter keeps counting', '(() => { const c = makeCounter(); return c() === 1 && c() === 2 && c() === 3; })()'),
            T.js('Two counters do not share state', '(() => { const a = makeCounter(); const b = makeCounter(); a(); a(); return a() === 3 && b() === 1; })()', 'Each call to `makeCounter` must create a fresh closure.'),
            T.js('multiplier uses its factor', 'multiplier(3)(4) === 12'),
            T.js('multiplier works with decimals', 'multiplier(0.5)(10) === 5'),
            T.js('range(3) is [0,1,2]', 'JSON.stringify(range(3)) === "[0,1,2]"', 'The loop condition should be `i < n`.'),
            T.js('range(0) is an empty array', 'JSON.stringify(range(0)) === "[]"'),
            T.js('range(5) has five items', 'range(5).length === 5 && range(5)[4] === 4'),
          ],
        },
        {
          id: 'write-higher-order',
          kind: 'write',
          difficulty: 'hard',
          minutes: 18,
          lang: 'js',
          prompt:
            'Write the four higher-order helpers that show up in every codebase. This is the challenge that makes closures click, because you ' +
            'cannot fake `once` or `memoize` with a stateless function.',
          requirements: [
            '`once(fn)` returns a function that calls `fn` at most once and remembers the result',
            '`compose(...fns)` returns a function that applies fns right-to-left',
            '`memoize(fn)` caches results by argument, and exposes a `.cache` Map',
            '`pipe(...fns)` applies fns left-to-right',
            'None of them may use a global variable',
          ],
          starter: ``,
          hints: [
            'A closure over a boolean is all `once` needs.',
            '`compose(a, b)(x)` is `a(b(x))`. `reduceRight` does that in one line.',
            'For `memoize`, use a `Map` and the first argument as the key.',
            '`pipe` is `compose` with `reduce` instead of `reduceRight`.',
          ],
          solution: `function once(fn) {
  let called = false;
  let result;
  return function (...args) {
    if (!called) {
      result = fn.apply(this, args);
      called = true;
    }
    return result;
  };
}

function compose(...fns) {
  return (value) => fns.reduceRight((acc, fn) => fn(acc), value);
}

function pipe(...fns) {
  return (value) => fns.reduce((acc, fn) => fn(acc), value);
}

function memoize(fn) {
  const cache = new Map();
  const wrapped = function (key) {
    if (!cache.has(key)) cache.set(key, fn.apply(this, arguments));
    return cache.get(key);
  };
  wrapped.cache = cache;
  return wrapped;
}`,
          checks: [
            T.js('once calls the function exactly once', '(() => { let calls = 0; const f = once(() => { calls += 1; return "x"; }); f(); f(); f(); return calls === 1; })()'),
            T.js('once returns the original result', '(() => { const f = once((a, b) => a + b); return f(1, 2) === 3 && f(9, 9) === 3; })()'),
            T.js('compose applies functions right to left', 'compose((n) => n + 1, (n) => n * 2)(5) === 11', '`compose(f, g)(x)` is `f(g(x))`.'),
            T.js('compose handles a single function', 'compose((n) => n * 3)(4) === 12'),
            T.js('pipe applies functions left to right', 'pipe((n) => n * 2, (n) => n + 1)(5) === 11'),
            T.js('memoize caches by argument', '(() => { let calls = 0; const f = memoize((n) => { calls += 1; return n * 2; }); f(2); f(2); f(2); return calls === 1; })()'),
            T.js('memoize returns the right value for new arguments', '(() => { const f = memoize((n) => n * 2); f(2); return f(4) === 8 && f(2) === 4; })()'),
            T.js('memoize exposes its cache as a Map', '(() => { const f = memoize((n) => n); f(7); return f.cache instanceof Map && f.cache.get(7) === 7; })()'),
            T.notSrc('No global state declared at the top level', /^(let|var)\s+\w+\s*=\s*(0|\{\}|\[\])\s*$/m, 'Every piece of state must live inside a closure.'),
          ],
        },
      ],
    },

    // ---------------------------------------------------------------------
    {
      id: 'js-03',
      title: 'Arrays, Objects and the Big Three',
      minutes: 35,
      objectives: [
        'Use map, filter and reduce without a mental translation step',
        'Copy data instead of mutating the original',
        'Destructure deeply without losing track of what is where',
      ],
      sections: [
        {
          heading: 'map, filter, reduce - and nothing else',
          body:
            'Ninety percent of array work is those three plus `find`, `some`, `every`, `includes` and `sort`.\n\n' +
            '- `map` - same length, transformed (**returns** the new value; forgetting the return gives you an array of `undefined`)\n' +
            '- `filter` - same shape, fewer items\n' +
            '- `reduce` - anything else; always pass an initial value or an empty array throws\n' +
            '- `sort` - **mutates the original** and sorts lexicographically by default, so `[10, 9, 1].sort()` gives `[1, 10, 9]`\n\n' +
            'That `sort` fact alone accounts for a large share of real-world bugs.',
          code: {
            lang: 'js',
            caption: 'the big three',
            source: `const orders = [
  { id: 1, customer: 'Ama', total: 120, paid: true },
  { id: 2, customer: 'Kofi', total: 80, paid: false },
  { id: 3, customer: 'Ama', total: 45, paid: true },
];

orders.filter((o) => o.paid).map((o) => o.total);          // [120, 45]
orders.reduce((sum, o) => sum + o.total, 0);                // 245
orders.every((o) => o.total > 0);                           // true
orders.some((o) => !o.paid);                                // true
orders.find((o) => o.id === 2)?.customer;                   // "Kofi"

// Sorted copy - never sort the original by accident
const byTotal = [...orders].sort((a, b) => b.total - a.total);

// Grouping with reduce
const byCustomer = orders.reduce((acc, o) => {
  acc[o.customer] = (acc[o.customer] ?? 0) + o.total;
  return acc;
}, {});                                                      // { Ama: 165, Kofi: 80 }

// Immutable updates with spread
const bumped = orders.map((o) => (o.id === 2 ? { ...o, total: 90 } : o));`,
          },
        },
        {
          heading: 'Objects: copy, merge, destructure',
          body:
            '`{ ...a, ...b }` is a shallow merge - nested objects are shared by reference. For a real deep copy use `structuredClone(value)` ' +
            '(modern and handles Dates, Maps and Sets).\n\n' +
            'Destructuring with defaults and renaming:\n\n' +
            '```\nconst { name, role = "member", total: amount } = user;\nconst [first, , third] = items;\n```\n\n' +
            'Optional chaining (`user?.address?.city`) and nullish coalescing (`count ?? 0`) handle missing data without a cascade of `&&`. ' +
            'Note the difference: `??` only falls back for `null`/`undefined`, while `||` also falls back for `0` and `""` - which is how zero ' +
            'quantities become 1.',
        },
        {
          heading: 'Mutating versus copying',
          body:
            '`push`, `pop`, `shift`, `unshift`, `splice`, `sort`, `reverse` all mutate. `slice`, `concat`, `map`, `filter`, `flat`, `toSorted`, ' +
            '`toReversed` return new arrays.\n\n' +
            'If a function receives an array and mutates it, the caller has a bug they cannot see. The convention that saves you: **functions ' +
            'return new data instead of changing the data they were given**.',
        },
        {
          heading: 'Sample code: a small data layer',
          body: 'Filter, transform, group and summarise - the shape of almost all real JavaScript work.',
          code: {
            lang: 'js',
            caption: 'data.js',
            source: `const users = [
  { id: 1, name: 'Ama', city: 'Accra', roles: ['admin', 'editor'], active: true },
  { id: 2, name: 'Kofi', city: 'Kumasi', roles: ['editor'], active: false },
  { id: 3, name: 'Yaa', city: 'Accra', roles: [], active: true },
];

const activeNames = users.filter((u) => u.active).map((u) => u.name);      // ['Ama', 'Yaa']

const byCity = users.reduce((acc, { city, name }) => {
  (acc[city] ??= []).push(name);
  return acc;
}, {});                                                                     // { Accra: ['Ama','Yaa'], Kumasi: ['Kofi'] }

const sortedByName = users.toSorted((a, b) => a.name.localeCompare(b.name));

const allRoles = [...new Set(users.flatMap((u) => u.roles))];               // ['admin','editor']

function addRole(user, role) {
  if (user.roles.includes(role)) return user;       // no-op, not an error
  return { ...user, roles: [...user.roles, role] }; // new object, original untouched
}

const withRole = addRole(users[2], 'editor');
console.log(users[2].roles.length);                 // 0 - the original is safe
console.log(withRole.roles.length);                 // 1

const summary = users.map(({ name, roles = [], active = false }) =>
  \`\${name}: \${roles.length} role(s), \${active ? 'active' : 'inactive'}\`);`,
          },
        },
      ],
      pitfalls: [
        '`map` without `return` silently producing `[undefined, undefined]`',
        '`reduce` with no initial value throwing on an empty array',
        '`sort()` on numbers, which compares them as strings',
        'Mutating a parameter, then wondering why the caller\'s data changed',
        'Using `||` where `??` is meant, so `0` becomes the fallback',
        'Shallow spread assumed to be a deep copy',
      ],
      keyPoints: [
        '`map`/`filter`/`reduce` + `find`/`some`/`every` cover nearly everything',
        '`sort` mutates; `toSorted` does not',
        '`[...arr]` and `{ ...obj }` are shallow copies',
        '`??` falls back only for null/undefined',
      ],
      resources: [
        { label: 'MDN: Array methods', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array' },
        { label: 'Dave Gray: Higher-order functions', url: 'https://www.youtube.com/watch?v=rRgD1yVwIvE' },
      ],
      challenges: [
        {
          id: 'fix-array-bugs',
          kind: 'debug',
          difficulty: 'medium',
          minutes: 15,
          lang: 'js',
          prompt:
            'This module has four bugs that all pass a casual eyeball test: a sort that sorts digits as text, a reduce with no initial value, ' +
            'a mutation that leaks back to the caller, and a `||` where `??` was needed. Fix them without changing the function signatures.',
          requirements: [
            '`topScores(scores, n)` returns the n largest numbers, largest first',
            'The input array must not be reordered by `topScores`',
            '`total(prices)` returns 0 for an empty array',
            '`assignQuantity(item, qty)` returns a new object and leaves the input alone',
            '`strictCount(value)` returns the value when it is 0, and only falls back for null/undefined',
          ],
          starter: `const defaults = { id: 0, quantity: 1 };

function topScores(scores, n = 3) {
  return scores.sort().slice(0, n);
}

function total(prices) {
  return prices.reduce((sum, price) => sum + price);
}

function assignQuantity(item, qty) {
  item.quantity = qty;
  return item;
}

function strictCount(value, fallback = 10) {
  return value || fallback;
}`,
          hints: [
            '`sort()` with no comparator converts to strings: 100 comes before 9. Provide `(a, b) => b - a`.',
            '`sort` mutates. Copy first with `[...scores]` or use `toSorted`.',
            '`reduce` with no initial value throws on an empty array. Pass `0`.',
            'Mutating the parameter changes the caller\'s object. Spread into a new one.',
            '`||` treats 0 and "" as empty. `??` only falls back for null and undefined.',
          ],
          solution: `const defaults = { id: 0, quantity: 1 };

function topScores(scores, n = 3) {
  return scores.toSorted((a, b) => b - a).slice(0, n);
}

function total(prices) {
  return prices.reduce((sum, price) => sum + price, 0);
}

function assignQuantity(item, qty) {
  return { ...item, quantity: qty };
}

function strictCount(value, fallback = 10) {
  return value ?? fallback;
}`,
          checks: [
            T.js('topScores sorts numerically', 'JSON.stringify(topScores([100, 9, 25, 3])) === "[100,25,9]"', 'The default sort is lexicographic.'),
            T.js('topScores respects the limit', 'topScores([5, 4, 3, 2, 1], 2).length === 2 && topScores([5, 4, 3, 2, 1], 2)[0] === 5'),
            T.js('topScores leaves the input untouched', '(() => { const input = [3, 1, 2]; topScores(input); return JSON.stringify(input) === "[3,1,2]"; })()', '`sort` mutates - copy first.'),
            T.js('topScores handles an empty list', 'JSON.stringify(topScores([])) === "[]"'),
            T.js('total sums an ordinary list', 'total([10, 20, 30]) === 60'),
            T.js('total([]) is 0, not a crash', 'total([]) === 0', '`reduce` needs an initial value.'),
            T.js('total handles negatives', 'total([10, -5]) === 5'),
            T.js('assignQuantity returns a new object', '(() => { const original = { id: 1, quantity: 1 }; const updated = assignQuantity(original, 5); return updated !== original && updated.quantity === 5 && original.quantity === 1; })()', 'Spread into a new object instead of assigning to the parameter.'),
            T.js('assignQuantity keeps the other keys', '(() => { const updated = assignQuantity({ id: 7, quantity: 1, name: "x" }, 2); return updated.id === 7 && updated.name === "x"; })()'),
            T.js('strictCount keeps 0', 'strictCount(0) === 0', '`||` would replace 0.'),
            T.js('strictCount keeps an empty string', 'strictCount("") === ""'),
            T.js('strictCount falls back for null and undefined', 'strictCount(null, 5) === 5 && strictCount(undefined) === 10'),
          ],
        },
        {
          id: 'write-report',
          kind: 'write',
          difficulty: 'hard',
          minutes: 20,
          lang: 'js',
          prompt:
            'Write a small reporting toolkit over an array of orders. This is the single most common shape of real JavaScript work: shape the ' +
            'data, aggregate it, then present it.',
          requirements: [
            '`paidTotals(orders)` -> the summed total of paid orders only',
            '`byCustomer(orders)` -> `{ customer: totalPaid }` for paid orders',
            '`topCustomers(orders, n)` -> `[{ customer, total }]` sorted by total, largest first, no mutation of the input',
            '`unpaidIds(orders)` -> an array of ids where `paid` is false',
            '`formatReport(orders)` -> lines like `Ama: GHS 165.00` sorted alphabetically',
            'No mutation of the input array or its objects',
          ],
          starter: `// orders: { id, customer, total, paid }`,
          hints: [
            'Filter first, then map/reduce - it is easier to read than one clever chain.',
            '`toSorted` never mutates; `sort` does.',
            '`localeCompare` is the correct string comparator.',
            '`toFixed(2)` for the money formatting.',
          ],
          solution: `function paidTotals(orders = []) {
  return orders.filter((o) => o.paid).reduce((sum, o) => sum + o.total, 0);
}

function byCustomer(orders = []) {
  return orders
    .filter((o) => o.paid)
    .reduce((acc, o) => {
      acc[o.customer] = (acc[o.customer] ?? 0) + o.total;
      return acc;
    }, {});
}

function topCustomers(orders = [], n = 3) {
  return Object.entries(byCustomer(orders))
    .map(([customer, total]) => ({ customer, total }))
    .toSorted((a, b) => b.total - a.total)
    .slice(0, n);
}

function unpaidIds(orders = []) {
  return orders.filter((o) => !o.paid).map((o) => o.id);
}

function formatReport(orders = []) {
  return Object.entries(byCustomer(orders))
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([customer, total]) => \`\${customer}: GHS \${total.toFixed(2)}\`);
}`,
          checks: [
            T.js('paidTotals sums paid orders only', 'paidTotals([{ total: 120, paid: true }, { total: 80, paid: false }, { total: 45, paid: true }]) === 165'),
            T.js('paidTotals([]) is 0', 'paidTotals([]) === 0'),
            T.js('byCustomer groups paid totals', 'JSON.stringify(byCustomer([{ customer: "Ama", total: 120, paid: true }, { customer: "Kofi", total: 80, paid: false }, { customer: "Ama", total: 45, paid: true }])) === JSON.stringify({ Ama: 165 })'),
            T.js('byCustomer ignores unpaid orders', 'Object.keys(byCustomer([{ customer: "Kofi", total: 80, paid: false }])).length === 0'),
            T.js('topCustomers is sorted descending', 'JSON.stringify(topCustomers([{ customer: "A", total: 10, paid: true }, { customer: "B", total: 90, paid: true }])) === JSON.stringify([{ customer: "B", total: 90 }, { customer: "A", total: 10 }])'),
            T.js('topCustomers respects the limit', 'topCustomers([{ customer: "A", total: 10, paid: true }, { customer: "B", total: 90, paid: true }, { customer: "C", total: 5, paid: true }], 2).length === 2'),
            T.js('unpaidIds finds the unpaid ones', 'JSON.stringify(unpaidIds([{ id: 1, paid: true }, { id: 2, paid: false }])) === "[2]"'),
            T.js('formatReport is alphabetically sorted with two decimals', 'JSON.stringify(formatReport([{ customer: "Kofi", total: 5, paid: true }, { customer: "Ama", total: 165, paid: true }])) === JSON.stringify(["Ama: GHS 165.00", "Kofi: GHS 5.00"])'),
            T.js('No function mutates the input', '(() => { const input = [{ id: 1, customer: "A", total: 10, paid: true }, { id: 2, customer: "B", total: 20, paid: false }]; const snapshot = JSON.stringify(input); paidTotals(input); byCustomer(input); topCustomers(input); unpaidIds(input); formatReport(input); return JSON.stringify(input) === snapshot; })()', 'Copy before you sort, and never write to a parameter.'),
          ],
        },
      ],
    },

    // ---------------------------------------------------------------------
    {
      id: 'js-04',
      title: 'Control Flow and the Bugs That Hide',
      minutes: 25,
      objectives: [
        'Reach for the right loop instead of the one you learned first',
        'Find off-by-one errors by testing boundaries, not the middle',
        'Use breakpoints and console.table instead of console.log everywhere',
      ],
      sections: [
        {
          heading: 'Pick the loop that says what you mean',
          body:
            '- `for...of` - the default for arrays and anything iterable\n' +
            '- `for...in` - **keys of an object**, and it includes inherited ones. Rarely what you want\n' +
            '- `arr.forEach` - when you want a side effect and no return value\n' +
            '- classic `for` - only when you need the index, or to break early\n' +
            '- `while` - when the number of iterations is unknown\n\n' +
            '`break` exits, `continue` skips to the next iteration. Both are legitimate in a loop; both are a code smell in a `forEach` (they do ' +
            'not work there, which surprises people).',
        },
        {
          heading: 'The three classics: off-by-one, order, and unreachable',
          body:
            '**Off-by-one:** `i <= arr.length` reads one past the end. `i < arr.length` is right. Test with an array of length 0 and 1, not 5.\n\n' +
            '**Order:** `if (n % 3 === 0)` before `if (n % 15 === 0)` makes the second branch unreachable. Specific cases must come first.\n\n' +
            '**Unreachable:** a `return` inside a loop body, or a condition that is always false. ESLint catches some of these; reading the code ' +
            'catches the rest.',
        },
        {
          heading: 'Truthiness and short-circuiting trips',
          body:
            '```\nif (count) { }        // false when count is 0 - often a bug\nif (name) { }         // false when name is "" - usually fine\nif (items.length) { } // what you usually mean\n```\n\n' +
            '`&&` and `||` return one of their operands, not a boolean: `const name = user && user.name` gives you `undefined`, not `false`. ' +
            'That is why `??` and optional chaining were added.',
        },
        {
          heading: 'Debugging like a professional',
          body:
            '1. **Read the error, all of it.** The message names the file, the line and the variable. Most bugs are solved here.\n' +
            '2. **Breakpoint, do not log.** DevTools -> Sources -> click the line number. You can inspect every variable, step over, and watch a ' +
            'value change.\n' +
            '3. **Narrow it down.** Comment out half. Bug still there? It is in the other half.\n' +
            '4. **Test the boundaries.** Zero, one, negative, empty string, `null`, very large.\n' +
            '5. **`console.table(arrayOfObjects)`** beats twelve `console.log`s.\n' +
            '6. **Reproduce it in one function.** If you cannot, you do not understand the bug yet.',
        },
        {
          heading: 'Sample code: control flow without surprises',
          body: 'Note the guard clauses, the explicit comparisons, and that the specific cases come first.',
          code: {
            lang: 'js',
            caption: 'flow.js',
            source: `// Guard clauses beat nesting
function grade(score) {
  if (typeof score !== 'number') return 'invalid';
  if (score < 0 || score > 100) return 'invalid';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  return 'F';
}

// Specific cases first
function fizzbuzz(n) {
  const out = [];
  for (let i = 1; i <= n; i += 1) {
    if (i % 15 === 0) out.push('FizzBuzz');
    else if (i % 3 === 0) out.push('Fizz');
    else if (i % 5 === 0) out.push('Buzz');
    else out.push(String(i));
  }
  return out;
}

// Explicit about zero and empty
function describeCart(items) {
  if (!Array.isArray(items)) return 'unknown';
  if (items.length === 0) return 'empty cart';
  if (items.length === 1) return '1 item';
  return \`\${items.length} items\`;
}

// Which loop says what you mean?
function findFirstUnpaid(orders) {
  for (const order of orders) {
    if (!order.paid) return order;   // early exit - for...of is fine
  }
  return null;
}

// Boundaries are where the bugs live
[0, 1, -1, 100, 101].map(grade);     // ['F', 'F', 'invalid', 'A', 'invalid']`,
          },
        },
      ],
      pitfalls: [
        '`<=` in a loop condition',
        'A general `if` placed before a more specific one',
        '`if (count)` where 0 is a valid value',
        '`continue`/`break` used inside `forEach`, where they do nothing useful',
        'Testing only the happy path with 2-3 items',
      ],
      keyPoints: [
        '`for...of` for values, `for...in` for keys (careful), classic `for` only for the index',
        'Boundary tests: 0, 1, empty, negative',
        'Specific conditions before general ones',
        'DevTools breakpoints beat scattered logs',
      ],
      resources: [
        { label: 'MDN: Loops and iteration', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Loops_and_iteration' },
        { label: 'Chrome DevTools: pause your code', url: 'https://developer.chrome.com/docs/devtools/javascript/breakpoints' },
      ],
      challenges: [
        {
          id: 'fix-fizzbuzz',
          kind: 'debug',
          difficulty: 'medium',
          minutes: 12,
          lang: 'js',
          prompt:
            'The classic interview exercise, deliberately broken in three ways. The third bug causes wrong output rather than a crash, which ' +
            'is the kind that reaches production.',
          requirements: [
            '`fizzbuzz(n)` returns an array of n strings',
            'Multiples of 15 produce `"FizzBuzz"`',
            'Multiples of 3 produce `"Fizz"`, multiples of 5 produce `"Buzz"`',
            'Everything else is the number as a string',
            '`grade(score)` returns `"invalid"` for anything non-numeric or out of range',
          ],
          starter: `function fizzbuzz(n) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    if (i % 3 === 0) out.push('Fizz');
    else if (i % 5 === 0) out.push('Buzz');
    else if (i % 15 === 0) out.push('FizzBuzz');
    else out.push(i);
  }
  return out;
}

function grade(score) {
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score < 0) return 'invalid';
  return 'F';
}`,
          hints: [
            'Which condition is the most specific? It has to be checked first.',
            'The `% 15` branch is currently unreachable - what has to happen for it to run?',
            '`out.push(i)` pushes a number. The specification says a string.',
            '`grade(150)` should be `"invalid"`, and so should `grade("80")`.',
          ],
          solution: `function fizzbuzz(n) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    if (i % 15 === 0) out.push('FizzBuzz');
    else if (i % 3 === 0) out.push('Fizz');
    else if (i % 5 === 0) out.push('Buzz');
    else out.push(String(i));
  }
  return out;
}

function grade(score) {
  if (typeof score !== 'number') return 'invalid';
  if (score < 0 || score > 100) return 'invalid';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  return 'F';
}`,
          checks: [
            T.js('fizzbuzz(15)[14] is FizzBuzz', 'fizzbuzz(15)[14] === "FizzBuzz"', 'The `% 15` check must come first.'),
            T.js('fizzbuzz(15)[2] is Fizz', 'fizzbuzz(15)[2] === "Fizz"'),
            T.js('fizzbuzz(15)[4] is Buzz', 'fizzbuzz(15)[4] === "Buzz"'),
            T.js('Numbers come back as strings', 'fizzbuzz(2)[1] === "2" && typeof fizzbuzz(2)[1] === "string"', 'Use `String(i)`.'),
            T.js('fizzbuzz returns exactly n items', 'fizzbuzz(20).length === 20 && fizzbuzz(0).length === 0'),
            T.js('fizzbuzz(1) is ["1"]', 'JSON.stringify(fizzbuzz(1)) === JSON.stringify(["1"])', 'Watch the loop boundary.'),
            T.js('grade boundaries are inclusive', 'grade(80) === "A" && grade(70) === "B"'),
            T.js('grade rejects an empty score', 'grade(0) === "F"', '0 is a valid score, not a falsy non-score.'),
            T.js('grade rejects out-of-range numbers', 'grade(101) === "invalid" && grade(-1) === "invalid"'),
            T.js('grade rejects non-numbers', 'grade("80") === "invalid" && grade(null) === "invalid"', 'Check `typeof` before comparing.'),
          ],
        },
        {
          id: 'write-loops',
          kind: 'write',
          difficulty: 'medium',
          minutes: 15,
          lang: 'js',
          prompt:
            'Write four functions whose bugs usually hide in the boundaries. Then the checks will test them at 0, 1 and the edges, exactly like ' +
            'a careful reviewer would.',
          requirements: [
            '`sumTo(n)` -> the sum of 1..n using a loop, 0 for n <= 0',
            '`findFirstUnpaid(orders)` -> the first unpaid order, or null',
            '`countWords(text)` -> a word frequency object, case-insensitive, ignoring punctuation',
            '`chunk(array, size)` -> nested arrays of at most `size` items, and it must not mutate the input',
          ],
          starter: ``,
          hints: [
            'Guard clauses for `n <= 0` remove the boundary bug entirely.',
            'A `for...of` with an early `return` is the clearest form for find-first.',
            '`text.toLowerCase().match(/[a-z0-9]+/g) ?? []` gives you clean words.',
            '`array.slice(i, i + size)` in a loop is the simplest correct chunk.',
          ],
          solution: `function sumTo(n) {
  if (typeof n !== 'number' || n <= 0) return 0;
  let sum = 0;
  for (let i = 1; i <= n; i += 1) sum += i;
  return sum;
}

function findFirstUnpaid(orders = []) {
  for (const order of orders) {
    if (!order.paid) return order;
  }
  return null;
}

function countWords(text = '') {
  const words = String(text).toLowerCase().match(/[a-z']+/g) ?? [];
  return words.reduce((acc, word) => {
    acc[word] = (acc[word] ?? 0) + 1;
    return acc;
  }, {});
}

function chunk(array = [], size = 1) {
  const n = Math.max(1, Math.floor(size));
  const out = [];
  for (let i = 0; i < array.length; i += n) {
    out.push(array.slice(i, i + n));
  }
  return out;
}`,
          checks: [
            T.js('sumTo(5) is 15', 'sumTo(5) === 15'),
            T.js('sumTo(0) and negatives are 0', 'sumTo(0) === 0 && sumTo(-4) === 0', 'Guard the boundary explicitly.'),
            T.js('sumTo(1) is 1', 'sumTo(1) === 1'),
            T.js('findFirstUnpaid returns the first unpaid order', 'findFirstUnpaid([{ id: 1, paid: true }, { id: 2, paid: false }, { id: 3, paid: false }]).id === 2'),
            T.js('findFirstUnpaid returns null when everything is paid', 'findFirstUnpaid([{ id: 1, paid: true }]) === null'),
            T.js('findFirstUnpaid handles an empty list', 'findFirstUnpaid([]) === null'),
            T.js('countWords is case-insensitive', 'JSON.stringify(countWords("The cat the CAT")) === JSON.stringify({ the: 2, cat: 2 })'),
            T.js('countWords ignores punctuation', 'JSON.stringify(countWords("Hello, world! Hello.")) === JSON.stringify({ hello: 2, world: 1 })'),
            T.js('countWords handles empty input', 'JSON.stringify(countWords("")) === "{}" && JSON.stringify(countWords()) === "{}"'),
            T.js('chunk splits evenly', 'JSON.stringify(chunk([1,2,3,4], 2)) === "[[1,2],[3,4]]"'),
            T.js('chunk keeps a short final chunk', 'JSON.stringify(chunk([1,2,3], 2)) === "[[1,2],[3]]"'),
            T.js('chunk does not mutate its input', '(() => { const input = [1,2,3]; chunk(input, 2); return JSON.stringify(input) === "[1,2,3]"; })()'),
          ],
        },
      ],
    },

    // ---------------------------------------------------------------------
    {
      id: 'js-05',
      title: 'The DOM and Events',
      minutes: 35,
      objectives: [
        'Select, create and update elements without innerHTML soup',
        'Attach one listener that handles many children with delegation',
        'Read and write form state correctly, including numbers',
      ],
      sections: [
        {
          heading: 'Selecting and changing',
          body:
            '`document.querySelector(cssSelector)` returns the first match or `null`; `querySelectorAll` returns a `NodeList` - array-like, so ' +
            '`forEach` works but `map` does not. Convert with `[...nodeList]` when you need array methods.\n\n' +
            'To change content, prefer `textContent` (safe, fast) over `innerHTML` (parses HTML, and is an XSS hole the moment the text comes ' +
            'from a user). Use `classList` rather than reassigning `className` so you do not clobber other classes.\n\n' +
            'The `null` you get from a bad selector is the number one cause of "Cannot read properties of null" - check the selector in DevTools ' +
            'with `document.querySelector("#yourSelector")` before you believe the code is wrong.',
        },
        {
          heading: 'Events, and event delegation',
          body:
            '`addEventListener(type, handler)` is the modern API. Prefer it to `onclick` so two scripts cannot overwrite each other.\n\n' +
            'The `event` object gives you `event.target` (what was clicked) and `event.currentTarget` (what the listener is attached to). The ' +
            'handler runs with `this === currentTarget` when declared as a method - arrows capture the outer `this` instead.\n\n' +
            '**Delegation** is the pattern to learn: attach one listener to a stable parent and use `event.target.closest("li")` to find out which ' +
            'child was involved. It works for children that do not exist yet, and it is one listener instead of a thousand.',
          code: {
            lang: 'js',
            caption: 'delegation',
            source: `const list = document.querySelector('#list');

list.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-remove]');
  if (!button) return;                       // ignore clicks elsewhere
  const item = button.closest('li');
  item?.remove();
});`,
          },
        },
        {
          heading: 'Forms: values are strings',
          body:
            '`input.value` is always a string. `input.valueAsNumber` is a number (NaN when empty). Checkboxes have `.checked` (boolean), not ' +
            '`.value`.\n\n' +
            'Always call `event.preventDefault()` in a submit handler when you are handling the submission yourself, or the page reloads. And ' +
            'call it **first**, before anything that might throw.\n\n' +
            'Build DOM nodes rather than concatenating HTML strings:',
          code: {
            lang: 'js',
            caption: 'build, do not concatenate',
            source: `function renderItem(text) {
  const li = document.createElement('li');
  li.className = 'item';

  const span = document.createElement('span');
  span.textContent = text;          // safe: no HTML parsing

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.dataset.remove = '';
  remove.setAttribute('aria-label', \`Remove \${text}\`);
  remove.textContent = 'Remove';

  li.append(span, remove);
  return li;
}`,
          },
        },
        {
          heading: 'Sample code: a complete, accessible counter',
          body:
            'Notice: cached queries, `textContent` for output, the disabled state driven from data, and one place that both updates the DOM and ' +
            'the accessibility announcement.',
          code: {
            lang: 'js',
            caption: 'counter.js',
            source: `const buttons = document.querySelectorAll('[data-step]');
const output = document.querySelector('#value');
const reset = document.querySelector('#reset');

let count = 0;

function render() {
  output.textContent = String(count);
  reset.disabled = count === 0;
}

function changeBy(step) {
  count += step;
  render();
}

buttons.forEach((button) => {
  button.addEventListener('click', () => {
    changeBy(Number(button.dataset.step));   // data attributes are strings
  });
});

reset.addEventListener('click', () => {
  count = 0;
  render();
});

// Keyboard support for free: buttons already respond to Enter and Space.
render();`,
          },
        },
      ],
      pitfalls: [
        '`innerHTML` with user input - an instant XSS hole',
        'Forgetting `event.preventDefault()` and watching the page reload',
        '`input.value + 1` -> `"51"`',
        'A listener inside a loop, creating one handler per item instead of delegating',
        '`addEventListener` inside a function that runs repeatedly, stacking handlers',
        'Assuming the script runs after the DOM exists (use `defer` or place it at the end)',
      ],
      keyPoints: [
        '`querySelector` returns `null` when it misses - that is the null error',
        '`textContent` for text, `createElement` for structure, `innerHTML` never for user data',
        'Delegate: one listener on the parent, `closest()` to find the child',
        'Form values are strings; `preventDefault()` first',
      ],
      resources: [
        { label: 'MDN: Introduction to the DOM', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Document_Object_Model/Introduction' },
        { label: 'MDN: Event delegation', url: 'https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Building_blocks/Events#event_delegation' },
        { label: 'Dave Gray: DOM crash course', url: 'https://www.youtube.com/watch?v=y17RuWkWdn8' },
      ],
      challenges: [
        {
          id: 'fix-dom-counter',
          kind: 'debug',
          difficulty: 'medium',
          minutes: 15,
          lang: 'js',
          fixture: CLICK_FIXTURE,
          prompt:
            'This counter almost works. The value never updates on screen, `+` jumps by 11 instead of 1, the reset button never disables, and ' +
            'clicking anywhere in the app also fires the handlers. Fix the four bugs. The checks below simulate real clicks, so guesswork will ' +
            'not pass.',
          requirements: [
            'Clicking `#inc` increases the displayed value by exactly 1',
            'Clicking `#dec` decreases it by 1 and can go negative',
            '`#value` reflects the current count as text',
            '`#reset` is disabled while the count is 0 and enabled otherwise',
            'Clicking `#reset` returns the count to 0',
            'Only the buttons change the count',
          ],
          starter: `const inc = document.querySelector('#inc');
const dec = document.querySelector('#dec');
const out = document.querySelector('#value');
const reset = document.querySelector('#reset');

let count = 0;

function render() {
  out.value = count;
}

inc.addEventListener('click', () => {
  count += Number(inc.dataset.step);
  render();
});

dec.addEventListener('click', () => {
  count -= 1;
  render();
});

document.addEventListener('click', () => {
  count += 10;
  render();
});`,
          hints: [
            '`#inc` has no `data-step`, so `Number(undefined)` is `NaN`... but actually look: `count += NaN` would break everything. The real bug is that `dataset.step` is missing, so the `+10` document listener is doing the damage.',
            '`out.value` sets an attribute. To change what is displayed, use `textContent`.',
            'A click listener on `document` fires for every click in the app. Scope it to the buttons.',
            'Set `reset.disabled` inside `render()` so every path updates it.',
          ],
          solution: `const inc = document.querySelector('#inc');
const dec = document.querySelector('#dec');
const out = document.querySelector('#value');
const reset = document.querySelector('#reset');

let count = 0;

function render() {
  out.textContent = String(count);
  reset.disabled = count === 0;
}

inc.addEventListener('click', () => {
  count += 1;
  render();
});

dec.addEventListener('click', () => {
  count -= 1;
  render();
});

reset.addEventListener('click', () => {
  count = 0;
  render();
});

render();`,
          checks: [
            T.js('The display starts at 0', '__text("#value") === "0"', 'Call `render()` once at startup.'),
            T.js('Clicking + increments by 1', '(() => { const before = Number(__text("#value")); __click("#inc"); return Number(__text("#value")) === before + 1; })()'),
            T.js('Clicking + twice increments by 2', '(() => { const before = Number(__text("#value")); __click("#inc"); __click("#inc"); return Number(__text("#value")) === before + 2; })()', 'Nothing else should add to the count.'),
            T.js('Clicking - decrements by 1', '(() => { const before = Number(__text("#value")); __click("#dec"); return Number(__text("#value")) === before - 1; })()'),
            T.js('The count can go negative', '(() => { __click("#reset"); __click("#dec"); __click("#dec"); return Number(__text("#value")) < 0; })()'),
            T.js('Reset is enabled once the count is not 0', '(() => { __click("#inc"); return document.querySelector("#reset").disabled === false; })()'),
            T.js('Reset is disabled at exactly 0', '(() => { __click("#inc"); __click("#reset"); return document.querySelector("#reset").disabled === true; })()'),
            T.js('#value shows text, not an attribute', '__text("#value").trim() === String(Number(__text("#value")))', '`out.value` writes an attribute; `textContent` writes what you see.'),
            T.js('A click elsewhere does not change the count', '(() => { const before = Number(__text("#value")); __click("#app"); return Number(__text("#value")) === before; })()', 'The document-level listener is reacting to clicks that are not buttons.'),
            T.notSrc('No listener attached to document', /document\.addEventListener/, 'Listen to the elements, not the whole document.'),
          ],
        },
        {
          id: 'write-todo',
          kind: 'write',
          difficulty: 'hard',
          minutes: 20,
          lang: 'js',
          fixture: TODO_FIXTURE,
          prompt:
            'Implement the todo list behind the given HTML. The empty `#input` should be ignored, adding should clear the field and move focus ' +
            'back to it, the count should always be right, and removal should use one delegated listener rather than one per item.',
          requirements: [
            '`addTodo(text)` creates an `li.item` holding a `span.label` with the text plus a `button` with a `data-remove` attribute, and appends it to `#list`',
            'Adding ignores empty or whitespace-only text and clips whitespace from real text',
            '`#input` is cleared and refocused after a successful add',
            '`#count` shows `"N items"`, or `"1 item"` when there is exactly one',
            'A single delegated click listener on `#list` removes the clicked item',
            'A click on the Add button triggers a real add (wire the events, do not just define the function)',
          ],
          starter: `const input = document.querySelector('#input');
const addButton = document.querySelector('#add');
const list = document.querySelector('#list');
const countLabel = document.querySelector('#count');

function render() {
  const items = list.querySelectorAll('li.item');
  countLabel.textContent = \`\${items.length} items\`;
}

function addTodo(text) {
  // TODO: create li.item, a remove button, append, then render()
}

addButton.addEventListener('click', () => {
  // TODO: read the input, addTodo it, then clear and refocus
});

list.addEventListener('click', (event) => {
  // TODO: delegate - find the remove button and delete its <li>
});`,
          hints: [
            'Read the input with `input.value.trim()`, and return early when it is empty.',
            'Build nodes with `createElement` and set `textContent` on a `span.label` - never `innerHTML` with user text.',
            '`li.classList.add("item")` is what the count query looks for.',
            'For the delegated handler: `event.target.closest("button[data-remove]")` then `.closest("li").remove()`.',
            'Call `render()` at the end of `addTodo` and after removal.',
          ],
          solution: `const input = document.querySelector('#input');
const addButton = document.querySelector('#add');
const list = document.querySelector('#list');
const countLabel = document.querySelector('#count');

function render() {
  const items = list.querySelectorAll('li.item');
  const n = items.length;
  countLabel.textContent = \`\${n} item\${n === 1 ? '' : 's'}\`;
}

function addTodo(text) {
  const clean = String(text).trim();
  if (!clean) return null;

  const li = document.createElement('li');
  li.classList.add('item');

  const label = document.createElement('span');
  label.classList.add('label');
  label.textContent = clean;
  li.append(label);

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.dataset.remove = '';
  remove.setAttribute('aria-label', \`Remove \${clean}\`);
  remove.textContent = 'x';

  li.append(remove);
  list.append(li);
  render();
  return li;
}

addButton.addEventListener('click', () => {
  const added = addTodo(input.value);
  if (!added) return;
  input.value = '';
  input.focus();
});

list.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-remove]');
  if (!button) return;
  button.closest('li').remove();
  render();
});

render();`,
          checks: [
            T.js('The initial count is correct', '__text("#count") === "0 items"'),
            T.js('Clicking Add with "Milk" creates one item', '(() => { document.querySelector("#list").innerHTML = ""; document.querySelector("#input").value = "Milk"; __click("#add"); return __count("#list li.item") === 1; })()', 'Read `input.value` and append an `li.item`.'),
            T.js('The item text is the trimmed input', '(() => { document.querySelector("#list").innerHTML = ""; document.querySelector("#input").value = "  Milk  "; __click("#add"); return __text("#list li span.label") === "Milk"; })()', 'Use `.trim()` and put the text in a `span.label`.'),
            T.js('The input is cleared after adding', '(() => { document.querySelector("#list").innerHTML = ""; document.querySelector("#input").value = "Bread"; __click("#add"); return __value("#input") === ""; })()'),
            T.js('The count updates to 1 item (singular)', '(() => { document.querySelector("#list").innerHTML = ""; document.querySelector("#input").value = "Bread"; __click("#add"); return __text("#count") === "1 item"; })()', 'Singular needs its own wording.'),
            T.js('Two adds give "2 items"', '(() => { document.querySelector("#list").innerHTML = ""; const i = document.querySelector("#input"); i.value = "A"; __click("#add"); i.value = "B"; __click("#add"); return __text("#count") === "2 items" && __count("#list li.item") === 2; })()'),
            T.js('Empty input adds nothing', '(() => { document.querySelector("#list").innerHTML = ""; document.querySelector("#input").value = "   "; __click("#add"); return __count("#list li.item") === 0; })()', 'Return early for whitespace-only text.'),
            T.js('addTodo can be called directly', '(() => { document.querySelector("#list").innerHTML = ""; addTodo("Manual"); return __count("#list li.item") === 1 && __text("#list li span.label") === "Manual"; })()'),
            T.js('Each item has its own remove button', '(() => { document.querySelector("#list").innerHTML = ""; addTodo("One"); return __count("#list li button") === 1; })()'),
            T.js('Clicking remove deletes that item', '(() => { document.querySelector("#list").innerHTML = ""; addTodo("One"); addTodo("Two"); __click("#list li button"); return __count("#list li.item") === 1 && __text("#list li span.label") === "Two"; })()', 'Delegate on `#list` and use `closest()` + `remove()`.'),
            T.js('The count follows a removal', '(() => { document.querySelector("#list").innerHTML = ""; addTodo("One"); addTodo("Two"); __click("#list li button"); return __text("#count") === "1 item"; })()'),
            T.js('Removal stays correct after several cycles', '(() => { document.querySelector("#list").innerHTML = ""; addTodo("A"); addTodo("B"); addTodo("C"); __click("#list li button"); __click("#list li button"); return __count("#list li.item") === 1 && __text("#count") === "1 item"; })()'),
          ],
        },
      ],
    },

    // ---------------------------------------------------------------------
    {
      id: 'js-06',
      title: 'Async, Promises and fetch',
      minutes: 35,
      objectives: [
        'Read async/await as a sequence instead of a puzzle',
        'Handle errors from a network call properly',
        'Know what the event loop does with your callbacks',
      ],
      sections: [
        {
          heading: 'JavaScript is single-threaded and never blocks',
          body:
            'There is one call stack. Anything slow (a network request, a timer, reading a file) is handed to the runtime, which puts a callback ' +
            'on a queue. When the stack empties, the event loop runs the next callback.\n\n' +
            'That is why this prints `1, 3, 2`:\n\n' +
            '```\nconsole.log(1);\nsetTimeout(() => console.log(2), 0);\nconsole.log(3);\n```\n\n' +
            'Nothing was "delayed by 0ms"; the callback was simply queued behind the current synchronous block.',
        },
        {
          heading: 'A promise is a placeholder for a future value',
          body:
            'Three states: pending, fulfilled, rejected. `await` pauses the *function*, not the program, and returns the fulfilled value. If the ' +
            'promise rejects, `await` throws - which is why `try/catch` works so naturally with it.\n\n' +
            '```\nasync function load() {\n  try {\n    const res = await fetch(url);\n    if (!res.ok) throw new Error(`HTTP ${res.status}`);\n    return await res.json();\n  } catch (err) {\n    console.error("Could not load:", err.message);\n    return null;\n  }\n}\n```\n\n' +
            '**`fetch` does not reject on a 404.** It resolves with `ok: false`. That is the single most common async bug: a missing check for ' +
            '`res.ok` means you cheerfully parse an error page as JSON.',
        },
        {
          heading: 'Sequential versus parallel',
          body:
            '`await` in a loop is sequential - each request waits for the last. If the calls are independent, run them together:\n\n' +
            '```\nconst [user, posts] = await Promise.all([fetchUser(id), fetchPosts(id)]);\n```\n\n' +
            '`Promise.all` rejects as soon as one rejects; `Promise.allSettled` always waits and tells you which succeeded; `Promise.race` settles ' +
            'with the first one. Choose deliberately - a dashboard that loads five widgets should probably use `allSettled` so one failure does ' +
            'not blank the page.',
        },
        {
          heading: 'Sample code: a request layer you can actually ship',
          body:
            'A timeout, a status check, JSON parsing, and typed error handling - in about twenty lines.',
          code: {
            lang: 'js',
            caption: 'api.js',
            source: `const API = 'https://api.example.com';

async function request(path, { timeout = 8000, ...options } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(\`\${API}\${path}\`, { ...options, signal: controller.signal });

    if (!response.ok) {
      throw new Error(\`\${response.status} \${response.statusText} for \${path}\`);
    }

    if (options.method === 'DELETE' || response.status === 204) return null;
    return await response.json();
  } finally {
    clearTimeout(timer);          // always runs, even on failure
  }
}

export async function loadUsers() {
  try {
    const users = await request('/users');
    return Array.isArray(users) ? users : [];
  } catch (err) {
    console.error('loadUsers failed:', err.message);
    return [];                  // an empty list beats a crashed page
  }
}

// Independent requests run together
export async function loadDashboard(userId) {
  const [profile, orders] = await Promise.all([
    request(\`/users/\${userId}\`),
    request(\`/users/\${userId}/orders\`),
  ]);
  return { profile, orders };
}`,
          },
        },
      ],
      pitfalls: [
        'Forgetting `await` - you get a Promise object instead of the data',
        'Not checking `res.ok`, then wondering why `json()` threw',
        '`await` inside a `map` without `Promise.all`, producing an array of pending promises',
        'No `try/catch`, so one failed request blanks the entire UI',
        'No timeout, so a hung request leaves a spinner forever',
      ],
      keyPoints: [
        '`await` pauses the function, not the program',
        '`fetch` resolves on 404 - check `res.ok`',
        '`Promise.all` for parallel, `allSettled` when partial success is fine',
        '`finally` for cleanup, and an `AbortController` for timeouts',
      ],
      resources: [
        { label: 'MDN: Using promises', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Using_promises' },
        { label: 'MDN: async function', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/async_function' },
        { label: 'JavaScript.info: Promises, async/await', url: 'https://javascript.info/async' },
      ],
      challenges: [
        {
          id: 'fix-async',
          kind: 'debug',
          difficulty: 'hard',
          minutes: 15,
          lang: 'js',
          async: true,
          mockFetch: {
            'https://api.example.com/users': [
              { id: 1, name: 'Ama', city: 'Accra' },
              { id: 2, name: 'Kofi', city: 'Kumasi' },
            ],
            'https://api.example.com/broken': 500,
          },
          prompt:
            'This async code has four bugs: a missing `await`, a missing status check, a swallowed error that hides the real problem, and a ' +
            'sequential loop where the requests could run together. The checks await your functions, so the fixes must be correct, not cosmetic.',
          requirements: [
            '`loadUsers()` resolves to the array of users from the API',
            '`loadUsers()` returns an empty array when the request fails, instead of throwing',
            '`loadUsers()` rejects (or throws internally) when the response is not ok, and the catch reports it',
            '`loadUserNames()` loads all names using `Promise.all`, not a sequential loop',
          ],
          starter: `async function loadUsers() {
  const response = fetch('https://api.example.com/users');
  const data = response.json();
  return data;
}

async function loadUserNames() {
  const users = await loadUsers();
  const names = [];
  for (const user of users) {
    names.push(await user.name);
  }
  return names;
}

async function loadUsersSafely() {
  try {
    return await loadUsers();
  } catch (err) {
    return err;
  }
}`,
          hints: [
            '`fetch` returns a promise. Without `await` you are calling `.json()` on a Promise.',
            '`await` the response before reading `.ok`, and throw when it is false.',
            'An `await` inside a `for` loop is sequential. Use `Promise.all` with a `map`.',
            '`return err` in a catch turns a failure into a success. Return a safe fallback instead.',
          ],
          solution: `async function loadUsers() {
  const response = await fetch('https://api.example.com/users');
  if (!response.ok) {
    throw new Error('Request failed with status ' + response.status);
  }
  return await response.json();
}

async function loadUserNames() {
  const users = await loadUsers();
  return Promise.all(users.map((user) => user.name));
}

async function loadUsersSafely() {
  try {
    return await loadUsers();
  } catch (err) {
    console.error('loadUsers failed:', err.message);
    return [];
  }
}`,
          checks: [
            T.js('loadUsers resolves to two users', 'Array.isArray(await loadUsers()) && (await loadUsers()).length === 2', 'Await the response, then await `.json()`.'),
            T.js('loadUsers returns the real data', '(await loadUsers())[0].name === "Ama"'),
            T.js('loadUserNames returns the names', 'JSON.stringify(await loadUserNames()) === JSON.stringify(["Ama", "Kofi"])'),
            T.js('loadUserNames is parallel, not sequential', 'await (async () => { const users = await loadUsers(); const names = await loadUserNames(); return names.length === users.length; })()'),
            T.js('loadUsersSafely resolves with an empty array on failure', 'await (async () => { const original = fetch; fetch = async () => ({ ok: false, status: 500, json: async () => ({}) }); const result = await loadUsersSafely(); fetch = original; return Array.isArray(result) && result.length === 0; })()', 'Returning the error object makes a failure look like success.'),
            T.js('loadUsers rejects when the status is not ok', 'await (async () => { const original = fetch; fetch = async () => ({ ok: false, status: 500, json: async () => ({}) }); let threw = false; try { await loadUsers(); } catch (e) { threw = true; } fetch = original; return threw; })()', 'Throw when `response.ok` is false.'),
            T.src('The status is checked before parsing', /\.ok\b/, 'Check `response.ok` - fetch resolves on 404 and 500.'),
            T.src('Requests run through Promise.all', /Promise\.all/, 'Independent requests should not wait for each other.'),
          ],
        },
        {
          id: 'write-async-pipeline',
          kind: 'write',
          difficulty: 'hard',
          minutes: 20,
          lang: 'js',
          async: true,
          mockFetch: {
            'https://api.example.com/orders': [
              { id: 1, customer: 'Ama', total: 120, paid: true },
              { id: 2, customer: 'Kofi', total: 80, paid: false },
              { id: 3, customer: 'Ama', total: 45, paid: true },
            ],
            'https://api.example.com/customers': [
              { name: 'Ama', city: 'Accra' },
              { name: 'Kofi', city: 'Kumasi' },
            ],
          },
          prompt:
            'Write an async data layer: fetch orders and customers in parallel, join them, and expose a safe wrapper that never throws at the ' +
            'call site. The checks await your functions and simulate a network failure, so error handling is part of the specification.',
          requirements: [
            '`getJson(url)` -> parses JSON, throws a useful Error when `!response.ok`',
            '`loadAll()` -> fetches `/orders` and `/customers` **in parallel** with `Promise.all`, returns `{ orders, customers }`',
            '`summarise()` -> `[{ customer, city, total }]` per customer, totalling only paid orders, sorted by total descending',
            '`tryLoad()` -> never throws; returns `{ ok: true, data }` or `{ ok: false, error }`',
          ],
          starter: `const BASE = 'https://api.example.com';

async function getJson(url) {
  // TODO
}

async function loadAll() {
  // TODO
}

async function summarise() {
  // TODO
}

async function tryLoad() {
  // TODO
}`,
          hints: [
            '`getJson` should `await fetch(url)`, check `.ok`, then `await response.json()`.',
            '`Promise.all([getJson(...), getJson(...)])` gives you both in one round trip.',
            'Join on the customer name: build a lookup object from `customers` first.',
            '`tryLoad` is a `try/catch` that returns a tagged result object.',
          ],
          solution: `const BASE = 'https://api.example.com';

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(\`Request failed: \${response.status} \${url}\`);
  }
  return await response.json();
}

async function loadAll() {
  const [orders, customers] = await Promise.all([
    getJson(\`\${BASE}/orders\`),
    getJson(\`\${BASE}/customers\`),
  ]);
  return { orders, customers };
}

async function summarise() {
  const { orders, customers } = await loadAll();
  const cityOf = Object.fromEntries(customers.map((c) => [c.name, c.city]));
  const totals = orders
    .filter((o) => o.paid)
    .reduce((acc, o) => {
      acc[o.customer] = (acc[o.customer] ?? 0) + o.total;
      return acc;
    }, {});

  return Object.entries(totals)
    .map(([customer, total]) => ({ customer, city: cityOf[customer] ?? 'unknown', total }))
    .toSorted((a, b) => b.total - a.total);
}

async function tryLoad() {
  try {
    return { ok: true, data: await summarise() };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}`,
          checks: [
            T.js('getJson returns parsed data', '(await getJson("https://api.example.com/orders")).length === 3'),
            T.js('getJson throws on a bad status', 'await (async () => { const original = fetch; fetch = async () => ({ ok: false, status: 500, json: async () => ({}) }); let threw = false; try { await getJson("/x"); } catch (e) { threw = true; } fetch = original; return threw; })()'),
            T.js('loadAll returns both collections', 'await (async () => { const r = await loadAll(); return r.orders.length === 3 && r.customers.length === 2; })()'),
            T.js('loadAll runs the requests in parallel', 'await (async () => { let concurrent = 0; let peak = 0; const original = fetch; fetch = async (url) => { concurrent += 1; peak = Math.max(peak, concurrent); await new Promise((r) => setTimeout(r, 5)); concurrent -= 1; return { ok: true, status: 200, json: async () => (String(url).includes("orders") ? [{ customer: "A", total: 1, paid: true }] : [{ name: "A", city: "Accra" }]) }; }; const r = await loadAll(); fetch = original; return peak === 2; })()', 'Both requests must be in flight at the same time - check how you call `Promise.all`.'),
            T.js('summarise totals only paid orders', 'JSON.stringify((await summarise()).map((r) => r.total)) === "[165]"', 'Kofi never paid, so he must not appear in the summary at all.'),
            T.js('summarise attaches the city', '(await summarise())[0].city === "Accra"'),
            T.js('summarise is sorted descending', 'await (async () => { const rows = await summarise(); return rows.every((r, i) => i === 0 || rows[i - 1].total >= r.total); })()'),
            T.js('summarise handles an unknown customer', 'await (async () => { const original = fetch; fetch = async (url) => ({ ok: true, status: 200, json: async () => (String(url).includes("orders") ? [{ customer: "Ghost", total: 10, paid: true }] : []) }); const rows = await summarise(); fetch = original; return rows.length === 1 && rows[0].city === "unknown"; })()', 'Use a fallback when the lookup misses.'),
            T.js('tryLoad never throws and reports success', 'await (async () => { const r = await tryLoad(); return r.ok === true && Array.isArray(r.data); })()'),
            T.js('tryLoad reports failure as data', 'await (async () => { const original = fetch; fetch = async () => ({ ok: false, status: 503, json: async () => ({}) }); const r = await tryLoad(); fetch = original; return r.ok === false && typeof r.error === "string"; })()', 'A failed load should be a value, not an exception at the call site.'),
          ],
        },
      ],
    },
  ],

  project: {
    id: 'js-capstone',
    title: 'Capstone: make the portfolio interactive',
    minutes: 240,
    brief:
      'Take the site you built and styled and give it a real JavaScript layer. This is where the three front-end modules finally combine into ' +
      'something a stranger can use.\n\n' +
      'Keep everything in `portfolio/js/` as small modules, loaded with `<script type="module" defer>`. No frameworks - you are learning the ' +
      'platform first.',
    starter: `portfolio/
├── index.html
├── projects.html
├── contact.html
├── css/styles.css
└── js/
    ├── main.js
    ├── projects.js
    ├── contact.js
    └── theme.js`,
    requirements: [
      'A theme toggle that persists the choice (`localStorage`) and respects `prefers-color-scheme` on first visit',
      'A project filter on the projects page: search by text plus tag buttons, with a live result count and an empty state',
      'The project data lives in a `projects.js` array of objects, and the DOM is built from it with `createElement` - never `innerHTML`',
      'Contact form validation: required fields, a real email check, inline error messages tied to the field with `aria-describedby`, and focus moved to the first invalid field on submit',
      'A mobile navigation toggle that traps focus while open and closes on Escape',
      'A "back to top" button that appears after scrolling 400px and hides again',
      'Every async operation (simulated form submit) has a loading state, a success state and an error state',
      'No `var`, no `innerHTML` with user input, no globals leaking out of their modules',
    ],
    checks: [
      'Submit the contact form empty: focus lands on the first invalid field and an error is announced',
      'Submit with an invalid email: only that field shows an error',
      'Submit valid data: a loading state appears, then a success message, and the form resets',
      'Type nonsense in the project search: an empty state appears and the result count reads 0',
      'Clear the search: all projects return',
      'Click a tag filter, then a second tag: only matching projects remain',
      'Toggle the theme, reload the page: the choice survives',
      'Open the mobile menu, press Escape: it closes and focus returns to the toggle button',
      'Scroll down 400px: the back-to-top button appears; scroll back up: it disappears',
      'Open DevTools console on every page: zero errors and zero warnings',
    ],
    stretch: [
      'Debounce the search input by 200ms and prove it with the Network panel of a real API',
      'Add keyboard navigation to the project list (arrow keys move, Enter opens)',
      'Persist the last-searched term in the URL with `history.replaceState`',
      'Write the same filter logic as a pure function and unit-test it in Node',
      'Add a service worker that caches the page and works offline',
    ],
  },
};
