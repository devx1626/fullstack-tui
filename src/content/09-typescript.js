import { T } from '../core/grade.js';

/**
 * TypeScript challenges are *executed*: the TUI strips the annotations the same
 * way Node does and runs the result in the sandbox, so behaviour is verified
 * for real.
 *
 * Types themselves are not compiled here - that needs `tsc`. So each challenge
 * pairs a behavioural check with `T.src` checks that assert the annotations you
 * actually wrote (a required `readonly id`, an optional `due?: string`, a
 * `value is string[]` predicate, no `any` in sight). Run `npx tsc --noEmit` in
 * the workspace when you want the compiler's opinion too.
 */

export default {
  id: 'typescript',
  title: 'TypeScript',
  badge: 'TS',
  color: 'accent',
  tagline: 'JavaScript with a type checker looking over your shoulder',
  hours: 14,
  why:
    'TypeScript exists to move bugs from runtime to your editor: typos in property names, forgotten null checks, a function that suddenly gets ' +
    'passed a string. In a real codebase the types are the documentation, the refactoring tool and the test that never gets deleted. Most ' +
    'professional React, Node and Next.js work is TypeScript now, and "I have not used it" is the one answer that closes doors.',
  source: {
    course: 'Dave Gray - TypeScript tutorial for beginners',
    url: 'https://www.youtube.com/watch?v=2pZmKW9-I_k',
    roadmap: 'https://roadmap.sh/typescript',
    docs: 'https://www.typescriptlang.org/docs/handbook/2/everyday-types.html',
  },
  lessons: [
    // ---------------------------------------------------------------------
    {
      id: 'ts-01',
      title: 'Types, Inference and Unions',
      minutes: 40,
      objectives: [
        'Let inference do the work and annotate only where it is needed',
        'Model a value with a union of literal types',
        'Recognise `any` as a hole in the type checker',
      ],
      sections: [
        {
          heading: 'Inference first, annotations where it matters',
          body:
            '```ts\nconst count = 0;              // inferred number\nconst name = \'Ama\';           // inferred "Ama" (a literal type)\nlet total = 0;               // inferred number, and mutable\n\ntotal = \'zero\';              // Error: Type \'string\' is not assignable to type \'number\'\n```\n\n' +
            'TypeScript is smart enough to infer local variables, which is why the best-typed codebases annotate *boundaries*: function parameters, ' +
            'return types, exported values. Annotating every local variable just makes noise.\n\n' +
            'Writing the return type explicitly is worth the keystrokes - it turns a mistake inside the function into an error at the function, ' +
            'instead of at some distant call site.',
        },
        {
          heading: 'Object types, aliases and interfaces',
          body:
            '```ts\ntype Id = string | number;         // a union\n\ninterface User {\n  id: Id;\n  name: string;\n  nickname?: string;               // optional\n  readonly createdAt: string;      // cannot be reassigned\n}\n```\n\n' +
            '`type` and `interface` are nearly interchangeable for object shapes. Use `interface` for objects you expect others to extend, `type` ' +
            'for unions, tuples, mapped types and anything computed. Pick one convention per codebase and stop arguing.',
        },
        {
          heading: 'Literal unions beat enums and booleans',
          body:
            '```ts\ntype Status = \'todo\' | \'doing\' | \'done\';\n\nfunction advance(status: Status): Status {\n  if (status === \'todo\') return \'doing\';\n  if (status === \'doing\') return \'done\';\n  return \'done\';\n}\n\nadvance(\'todu\');   // Error: Argument of type \'"todu"\' is not assignable\n```\n\n' +
            'A string literal union gives you autocomplete, typos caught at compile time, and no runtime representation at all - unlike `enum`, ' +
            'which emits JavaScript. It is the single most useful type in TypeScript.',
        },
        {
          heading: '`any` switches the checker off',
          body:
            '`any` is contagious: one `any` silences every check that touches it, including the typo the checker was about to catch.\n\n' +
            '```ts\nfunction total(cart: any) {\n  return cart.items.reduce((sum, item) => sum + item.price * item.qty, 0);\n  //                                                              ^^^ silently NaN\n}\n```\n\n' +
            'With `strict` mode on, a real type turns that `qty` into a compile error. When you genuinely do not know the shape, reach for ' +
            '`unknown` and narrow it - never `any`.',
        },
      ],
      pitfalls: [
        'Annotating everything until the code is 50% types, or nothing at all so `any` sneaks in',
        'Leaving `strict` off, which quietly makes `null` and `undefined` assignable everywhere',
        'Reaching for `any` to silence an error instead of modelling the value',
        'Using a `string` where a literal union would have caught the typo',
        'Mutating a `readonly` property through a cast',
      ],
      keyPoints: [
        'Let inference handle locals; annotate params, returns and exported values',
        'Unions of string literals are your best enum: no runtime cost, great autocomplete',
        '`any` disables checking for everything it touches - use `unknown` and narrow instead',
      ],
      resources: [
        { label: 'TypeScript Handbook: Everyday Types', url: 'https://www.typescriptlang.org/docs/handbook/2/everyday-types.html' },
        { label: 'TypeScript Playground', url: 'https://www.typescriptlang.org/play' },
        { label: 'Total TypeScript: Beginners tutorial', url: 'https://www.totaltypescript.com/tutorials/beginners-typescript' },
      ],
      challenges: [
        {
          id: 'write-annotate',
          kind: 'write',
          difficulty: 'easy',
          minutes: 12,
          lang: 'ts',
          ts: true,
          prompt:
            'Annotate this price formatter properly. `formatPrice(amount, currency?)` returns the amount with two decimals, prefixed by the ' +
            'currency symbol when one is given. Also declare `Id` as `string | number` and `Role` as the literal union `"admin" | "member"`. ' +
            'No `any` anywhere.',
          requirements: [
            '`amount` is a `number`; `currency` is an optional `string`',
            'The declared return type is `string`',
            '`type Id` is exactly `string | number`',
            '`type Role` is a literal union of `admin` and `member`',
            '`formatPrice(12.5)` gives `"12.50"` and `formatPrice(12.5, "€")` gives `"€12.50"`',
          ],
          starter: `type Id = string;

type Role = string;

function formatPrice(amount, currency) {
  const value = amount.toFixed(2);
  return currency ? currency + value : value;
}
`,
          hints: [
            'Optional parameters are written `currency?: string` - the parameter has to come last.',
            'Annotate the return after the parameter list: `function formatPrice(amount: number, currency?: string): string`.',
            'A literal union is `\'admin\' | \'member\'`, not `string`.',
          ],
          solution: `type Id = string | number;

type Role = 'admin' | 'member';

function formatPrice(amount: number, currency?: string): string {
  const value = amount.toFixed(2);
  return currency ? currency + value : value;
}
`,
          checks: [
            T.js(
              'formats with and without a currency',
              `(function () { __must(formatPrice(12.5) === '12.50', 'formatPrice(12.5) should give "12.50", got ' + JSON.stringify(formatPrice(12.5))); __must(formatPrice(12.5, '€') === '€12.50', 'formatPrice(12.5, "€") should give "€12.50", got ' + JSON.stringify(formatPrice(12.5, '€'))); return true; })()`,
              'Keep the existing behaviour, just add the types.',
            ),
            T.js(
              'the parameter and return types are declared',
              `/function\\s+formatPrice\\s*\\(\\s*amount\\s*:\\s*number\\s*,\\s*currency\\s*\\?\\s*:\\s*string\\s*\\)\\s*:\\s*string/.test(__src) || 'annotate it as function formatPrice(amount: number, currency?: string): string'`,
              'The optional marker goes before the colon: `currency?: string`.',
            ),
            T.js(
              'the Id and Role aliases are unions',
              `/(type|interface)\\s+Id\\s*=\\s*string\\s*\\|\\s*number/.test(__src) || 'declare type Id = string | number'`,
              'Union members are separated by a pipe: `string | number`.',
            ),
            T.js(
              'Role is a literal union',
              `/type\\s+Role\\s*=\\s*['"]admin['"]\\s*\\|\\s*['"]member['"]/.test(__src) || 'declare type Role = "admin" | "member" (string literals, not string)'`,
              'A literal union lists the allowed values, in quotes.',
            ),
            T.js(
              'no `any` crept in',
              `!/\\bany\\b/.test(__src) || 'replace the any with a real type - that is the whole point of this module'`,
              'Use `number`, `string` and your aliases instead of `any`.',
            ),
          ],
        },
        {
          id: 'debug-any-typo',
          kind: 'debug',
          difficulty: 'medium',
          minutes: 15,
          lang: 'ts',
          ts: true,
          prompt:
            'This cart total returns `NaN`, and nothing warned you. The reason is `any`: the type checker was switched off for exactly the line ' +
            'that had the typo. Type the data properly and fix the bug so the total is a real number.',
          requirements: [
            'Type `Item` as `{ price: number; quantity: number }` and `Cart` as `{ items: Item[]; discount?: number }`',
            '`cartTotal` takes a `Cart` and returns a `number`',
            'Add up `price * quantity` for every item and subtract the discount',
            'A missing discount counts as 0 - no `NaN`',
            'No `any` in the file',
          ],
          starter: `type Cart = { items: any[]; discount: number };

function cartTotal(cart: any): number {
  let sum = 0;
  for (const item of cart.items) {
    sum += item.price * item.qty;
  }
  return sum - cart.discount;
}
`,
          hints: [
            'The property is called `quantity` - the typo survived because `any` disabled the check.',
            'Type the items: `type Item = { price: number; quantity: number };`',
            'Make the discount optional (`discount?: number`) and use `cart.discount ?? 0`.',
          ],
          solution: `type Item = { price: number; quantity: number };

type Cart = { items: Item[]; discount?: number };

function cartTotal(cart: Cart): number {
  let sum = 0;
  for (const item of cart.items) {
    sum += item.price * item.quantity;
  }
  return sum - (cart.discount ?? 0);
}
`,
          checks: [
            T.js(
              'totals the items',
              `(function () { const result = cartTotal({ items: [{ price: 2, quantity: 3 }, { price: 1.5, quantity: 2 }], discount: 1 }); __must(result === 8, 'expected 8, got ' + result + (Number.isNaN(result) ? ' (NaN - the item property name is still wrong)' : '')); return true; })()`,
              '`price * quantity`, summed across items, then minus the discount.',
            ),
            T.js(
              'treats a missing discount as zero',
              `(function () { const result = cartTotal({ items: [{ price: 2, quantity: 3 }] }); __must(result === 6, 'with no discount the total should be 6, got ' + result); return true; })()`,
              'Use `cart.discount ?? 0`.',
            ),
            T.js(
              'an empty cart totals zero',
              `(function () { const result = cartTotal({ items: [] }); __must(result === 0, 'an empty cart should total 0, got ' + result); return true; })()`,
              'Starting the accumulator at 0 is enough.',
            ),
            T.js(
              'the types are real, not any',
              `!/\\bany\\b/.test(__src) || 'the any annotations are what hid the bug - replace them with Item and Cart'`,
              'Declare `type Item` and `type Cart` and use them in the signature.',
            ),
            T.js(
              'Item declares quantity as a number',
              `/quantity\\s*:\\s*number/.test(__src) || 'declare quantity: number on Item'`,
              '`type Item = { price: number; quantity: number };`',
            ),
          ],
        },
        {
          id: 'write-result-union',
          kind: 'write',
          difficulty: 'medium',
          minutes: 18,
          lang: 'ts',
          ts: true,
          prompt:
            'Model success and failure with a discriminated union, then write helpers for it: `ok(value)`, `err(message)`, a type predicate ' +
            '`isOk(result)` and `unwrap(result, fallback)`. This is the pattern you will reach for whenever a function can fail without ' +
            'throwing.',
          requirements: [
            '`Ok<T>` has `ok: true` and `value: T`; `Err` has `ok: false` and `error: string`',
            '`Result<T>` is `Ok<T> | Err`',
            '`isOk` is a type predicate: `result is Ok<T>`',
            '`unwrap` returns the value when ok, otherwise the fallback',
            '`unwrap(ok(5), 0)` is 5 and `unwrap(err("nope"), 0)` is 0',
          ],
          starter: `type Ok<T> = { ok: boolean; value: T };
type Err = { ok: boolean; error: string };
type Result<T> = Ok<T> | Err;

function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

function err(error: string): Err {
  return { ok: false, error };
}

function isOk<T>(result: Result<T>): boolean {
  return result.ok;
}

function unwrap<T>(result: Result<T>, fallback: T): T {
  return result.ok ? result.value : fallback;
}
`,
          hints: [
            'The discriminant must be the *literal* `true`/`false`, not `boolean` - that is what lets TypeScript narrow the union.',
            'A type predicate is a return type of the form `result is Ok<T>`.',
            'With `ok: true` on one member and `ok: false` on the other, `if (result.ok)` narrows to `Ok<T>` automatically.',
          ],
          solution: `type Ok<T> = { ok: true; value: T };
type Err = { ok: false; error: string };
type Result<T> = Ok<T> | Err;

function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

function err(error: string): Err {
  return { ok: false, error };
}

function isOk<T>(result: Result<T>): result is Ok<T> {
  return result.ok;
}

function unwrap<T>(result: Result<T>, fallback: T): T {
  return result.ok ? result.value : fallback;
}
`,
          checks: [
            T.js(
              'ok and err build the right shapes',
              `(function () { const good = ok(1); const bad = err('nope'); __must(good.ok === true && good.value === 1, 'ok(1) should be { ok: true, value: 1 }, got ' + JSON.stringify(good)); __must(bad.ok === false && bad.error === 'nope', 'err("nope") should be { ok: false, error: "nope" }, got ' + JSON.stringify(bad)); return true; })()`,
              'Return object literals with the right discriminant.',
            ),
            T.js(
              'unwrap returns the value or the fallback',
              `(function () { __must(unwrap(ok(5), 0) === 5, 'unwrap(ok(5), 0) should be 5'); __must(unwrap(err('nope'), 0) === 0, 'unwrap(err("nope"), 0) should be 0'); return true; })()`,
              'Branch on `result.ok`.',
            ),
            T.js(
              'isOk narrows the type',
              `/result\\s+is\\s+Ok\\s*<\\s*T\\s*>/.test(__src) || 'isOk must be a type predicate: result is Ok<T>'`,
              'A predicate return type reads `result is Ok<T>`.',
            ),
            T.js(
              'the union is discriminated by literal true/false',
              `/ok\\s*:\\s*true/.test(__src) && /ok\\s*:\\s*false/.test(__src) || 'the discriminant must be the literals true and false, otherwise TypeScript cannot narrow the union'`,
              '`ok: true` on Ok and `ok: false` on Err.',
            ),
          ],
        },
      ],
    },

    // ---------------------------------------------------------------------
    {
      id: 'ts-02',
      title: 'Objects, Optionality and Exhaustive Unions',
      minutes: 45,
      objectives: [
        'Use optional and readonly properties deliberately',
        'Handle `undefined` without a runtime crash',
        'Model mutually exclusive states with a discriminated union and switch exhaustively',
      ],
      sections: [
        {
          heading: 'Optional means "might be undefined"',
          body:
            '```ts\ninterface User {\n  name: string;\n  address?: { city: string };\n}\n\nfunction label(user: User): string {\n  return user.address?.city ?? \'unknown\';   // no crash, no non-null assertion\n}\n```\n\n' +
            'With `strictNullChecks` on, `user.address.city` is a compile error - which is the point. Reach for `?.` and `??` rather than `!`:\n\n' +
            '- `a?.b` - short-circuits to `undefined` if `a` is nullish\n' +
            '- `a ?? b` - fallback for `null`/`undefined` only\n' +
            '- `a || b` - fallback for *any* falsy value, including `0` and `\'\'` - usually a bug\n' +
            '- `a!.b` - "trust me", which disables the check you just paid for',
        },
        {
          heading: 'readonly is free documentation',
          body:
            '```ts\ninterface Task {\n  readonly id: string;\n  title: string;\n  tags: readonly string[];\n}\n\ntask.id = \'other\';        // Error: Cannot assign to \'id\' because it is a read-only property\ntask.tags.push(\'x\');      // Error: push does not exist on readonly string[]\n```\n\n' +
            '`readonly` is shallow: it stops reassignment of that property, not mutation of a nested object. It is a compile-time promise, ' +
            'erased at runtime - and exactly what you want on ids, timestamps and arrays of tags.',
        },
        {
          heading: 'Discriminated unions model impossible states',
          body:
            'A `kind` (or `type`) field that is a literal per variant lets TypeScript narrow for you:\n\n' +
            '```ts\ntype Notification =\n  | { kind: \'email\'; to: string }\n  | { kind: \'sms\'; number: string }\n  | { kind: \'push\'; deviceId: string };\n\nfunction describe(n: Notification): string {\n  switch (n.kind) {\n    case \'email\': return \'email to \' + n.to;\n    case \'sms\': return \'sms to \' + n.number;\n    case \'push\': return \'push to \' + n.deviceId;\n    default: return assertNever(n);\n  }\n}\n\nfunction assertNever(value: never): never {\n  throw new Error(\'Unhandled case: \' + JSON.stringify(value));\n}\n```\n\n' +
            'Inside each branch the other variants are impossible, and the `never` default means adding a fourth variant turns the switch into a ' +
            'compile error until you handle it.',
        },
      ],
      pitfalls: [
        'Using a non-null assertion (`!`) to silence the error instead of handling `undefined`',
        '`|| `where `??` was meant, silently replacing `0` and `\'\'`',
        'Modelling state as several optional fields (`loading?`, `error?`, `data?`) so impossible combinations type-check',
        '`readonly` on a nested object expecting deep immutability',
        'Forgetting the `never` default, so a new variant silently falls through',
      ],
      keyPoints: [
        '`strict` exists to make `undefined` a compile error - fix it with `?.` and `??`',
        '`readonly` prevents reassignment and is erased at runtime',
        'A literal discriminant plus an exhaustive switch with `assertNever` makes new states impossible to ignore',
      ],
      resources: [
        { label: 'TypeScript Handbook: Narrowing', url: 'https://www.typescriptlang.org/docs/handbook/2/narrowing.html' },
        { label: 'TypeScript Handbook: Unions and Intersections', url: 'https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#union-types' },
        { label: 'TSConfig: strict', url: 'https://www.typescriptlang.org/tsconfig#strict' },
      ],
      challenges: [
        {
          id: 'write-task-type',
          kind: 'write',
          difficulty: 'medium',
          minutes: 18,
          lang: 'ts',
          ts: true,
          prompt:
            'Model a task properly, then write the two functions that work with it. `Task` has a readonly `id`, a `title`, an optional `due`, ' +
            'a `status` of `todo | doing | done` and `tags` as a readonly array of strings. `makeTask` builds a new task (status `todo`, empty ' +
            'tags, a generated non-empty id). `isOverdue(task, today)` is true when there is a due date, that date is before `today` ' +
            '(both `YYYY-MM-DD`), and the task is not done.',
          requirements: [
            '`type Status = "todo" | "doing" | "done"`',
            '`interface Task` with `readonly id: string`, `title: string`, `due?: string`, `status: Status`, `readonly tags: readonly string[]`',
            '`makeTask(input: { title: string; due?: string }): Task` generates the id and defaults status to `todo`',
            '`isOverdue(task: Task, today: string): boolean` handles the missing due date without crashing',
            'Dates compare correctly as `YYYY-MM-DD` strings',
          ],
          starter: `type Status = string;

interface Task {
  id: string;
  title: string;
  status: Status;
  tags: string[];
}

function makeTask(input: { title: string; due?: string }): Task {
  // Build the task here.
  throw new Error('not implemented');
}

function isOverdue(task: Task, today: string): boolean {
  // Implementation here.
  return false;
}
`,
          hints: [
            'Generate the id with a counter plus a timestamp: `let seq = 0;` then `String(++seq) + \'-\' + Date.now()`.',
            'An optional property is `due?: string`; a readonly array is `readonly tags: readonly string[]`.',
            '`isOverdue` needs `task.due !== undefined`, then `task.due < today` - ISO strings sort chronologically.',
          ],
          solution: `type Status = 'todo' | 'doing' | 'done';

interface Task {
  readonly id: string;
  title: string;
  due?: string;
  status: Status;
  readonly tags: readonly string[];
}

let seq = 0;

function makeTask(input: { title: string; due?: string }): Task {
  seq += 1;
  return {
    id: 'task-' + seq + '-' + Date.now(),
    title: input.title,
    due: input.due,
    status: 'todo',
    tags: [],
  };
}

function isOverdue(task: Task, today: string): boolean {
  if (task.due === undefined) return false;
  if (task.status === 'done') return false;
  return task.due < today;
}
`,
          checks: [
            T.js(
              'makeTask builds a todo with a generated id',
              `(function () { const task = makeTask({ title: 'Ship it' }); __must(typeof task.id === 'string' && task.id.length > 0, 'generate a non-empty string id'); __must(task.title === 'Ship it', 'keep the title'); __must(task.status === 'todo', 'a new task starts as todo, got ' + JSON.stringify(task.status)); __must(Array.isArray(task.tags) && task.tags.length === 0, 'start with an empty tags array'); return true; })()`,
              'Return an object literal with every field filled in.',
            ),
            T.js(
              'ids do not collide',
              `(function () { const a = makeTask({ title: 'a' }); const b = makeTask({ title: 'b' }); __must(a.id !== b.id, 'two tasks got the same id: ' + a.id); return true; })()`,
              'Mix a counter into the id, not just a timestamp.',
            ),
            T.js(
              'due dates are carried through and compared correctly',
              `(function () {
  const late = makeTask({ title: 'late', due: '2026-01-01' });
  const early = makeTask({ title: 'early', due: '2026-12-01' });
  const none = makeTask({ title: 'none' });
  __must(isOverdue(late, '2026-06-01') === true, 'a task due 2026-01-01 is overdue on 2026-06-01');
  __must(isOverdue(early, '2026-06-01') === false, 'a task due 2026-12-01 is not overdue on 2026-06-01');
  __must(isOverdue(none, '2026-06-01') === false, 'a task with no due date is never overdue');
  return true;
})()`,
              'Check `task.due === undefined` first, then compare the strings.',
            ),
            T.js(
              'a done task is never overdue',
              `(function () { const task = makeTask({ title: 'done', due: '2026-01-01' }); const finished = { ...task, status: 'done' }; __must(isOverdue(finished, '2026-06-01') === false, 'finished work cannot be overdue'); return true; })()`,
              'Add the `status === \'done\'` guard.',
            ),
            T.js(
              'the optional and readonly modifiers are declared',
              `/due\\s*\\?\\s*:\\s*string/.test(__src) || 'declare due as optional: due?: string'`,
              'The question mark goes before the colon.',
            ),
            T.js(
              'the Task interface is properly typed',
              `/readonly\\s+id\\s*:\\s*string/.test(__src) || 'make id readonly: readonly id: string'`,
              'Readonly ids are one of the cheapest safety wins there is.',
            ),
          ],
        },
        {
          id: 'debug-optional-crash',
          kind: 'debug',
          difficulty: 'easy',
          minutes: 10,
          lang: 'ts',
          ts: true,
          prompt:
            '`label` crashes with "Cannot read properties of undefined" whenever a user has no address, and the tests only ever used users ' +
            '*with* an address. Handle the missing case - without an `any` and without `!`.',
          requirements: [
            'A user with an address gives `"<name> in <city>"`',
            'A user without an address gives `"<name> in unknown"`',
            'No non-null assertion (`!`) and no `any`',
            '`address` stays optional in the type',
          ],
          starter: `type User = {
  name: string;
  address?: { city: string; country: string };
};

function label(user: User): string {
  return user.name + ' in ' + user.address.city;
}
`,
          hints: [
            '`user.address?.city` short-circuits to `undefined` instead of throwing.',
            '`?? "unknown"` supplies the fallback - `||` would also treat an empty city as missing.',
            'Do not reach for `user.address!` - that just moves the crash back to runtime.',
          ],
          solution: `type User = {
  name: string;
  address?: { city: string; country: string };
};

function label(user: User): string {
  return user.name + ' in ' + (user.address?.city ?? 'unknown');
}
`,
          checks: [
            T.js(
              'labels a user with an address',
              `(function () { const text = label({ name: 'Ama', address: { city: 'Accra', country: 'GH' } }); __must(text === 'Ama in Accra', 'expected "Ama in Accra", got ' + JSON.stringify(text)); return true; })()`,
              'Keep the existing happy path.',
            ),
            T.js(
              'survives a missing address',
              `(function () { const text = label({ name: 'Kofi' }); __must(text === 'Kofi in unknown', 'expected "Kofi in unknown", got ' + JSON.stringify(text)); return true; })()`,
              'Use `user.address?.city ?? \'unknown\'`.',
            ),
            T.js(
              'no assertions or any were used to silence it',
              `(!/[\\w)]\\s*!\\s*[.[]/.test(__src) && !/\\bany\\b/.test(__src)) || 'handle the undefined case instead of asserting it away with ! or any'`,
              '`?.` plus `??` is the whole fix.',
            ),
          ],
        },
        {
          id: 'write-exhaustive-union',
          kind: 'write',
          difficulty: 'hard',
          minutes: 20,
          lang: 'ts',
          ts: true,
          prompt:
            'Model three notification channels as a discriminated union and write `describe(notification): string` that switches on `kind`. ' +
            'The switch must be exhaustive with an `assertNever` default, so adding a fourth channel becomes a compile error rather than a ' +
            'silent `undefined`.',
          requirements: [
            '`Notification` is a union of `{ kind: "email"; to: string }`, `{ kind: "sms"; number: string }` and `{ kind: "push"; deviceId: string }`',
            '`describe` returns `"email to <to>"`, `"sms to <number>"` or `"push to <deviceId>"`',
            '`assertNever(value: never): never` throws with the value in the message',
            'An unknown `kind` reaching `describe` throws instead of returning undefined',
          ],
          starter: `type Notification = { kind: string; to: string };

function assertNever(value: never): never {
  throw new Error('Unhandled case: ' + JSON.stringify(value));
}

function describe(notification: Notification): string {
  return 'notification';
}
`,
          hints: [
            'Each variant needs its own literal: `{ kind: \'email\'; to: string } | { kind: \'sms\'; number: string } | ...`',
            'Switch on `notification.kind` and return inside each case.',
            'The default case calls `assertNever(notification)` - after all cases, the only remaining type is `never`.',
          ],
          solution: `type Notification =
  | { kind: 'email'; to: string }
  | { kind: 'sms'; number: string }
  | { kind: 'push'; deviceId: string };

function assertNever(value: never): never {
  throw new Error('Unhandled case: ' + JSON.stringify(value));
}

function describe(notification: Notification): string {
  switch (notification.kind) {
    case 'email':
      return 'email to ' + notification.to;
    case 'sms':
      return 'sms to ' + notification.number;
    case 'push':
      return 'push to ' + notification.deviceId;
    default:
      return assertNever(notification);
  }
}
`,
          checks: [
            T.js(
              'describes each variant',
              `(function () { __must(describe({ kind: 'email', to: 'ama@example.com' }) === 'email to ama@example.com', 'the email case is wrong'); __must(describe({ kind: 'sms', number: '+233...' }) === 'sms to +233...', 'the sms case is wrong'); __must(describe({ kind: 'push', deviceId: 'abc' }) === 'push to abc', 'the push case is wrong'); return true; })()`,
              'One case per variant, returning the right string.',
            ),
            T.js(
              'an unknown kind throws instead of returning undefined',
              `(function () { try { describe({ kind: 'fax', to: 'x' }); } catch (err) { __must(/Unhandled case/.test(err.message), 'assertNever should throw mentioning the unhandled case, got ' + JSON.stringify(err.message)); return true; } __must(false, 'an unknown kind should throw, not return - is the default case missing?'); })()`,
              'The `default` branch calls `assertNever(notification)`.',
            ),
            T.js(
              'the union members carry literal kinds',
              `(/kind\\s*:\\s*['"]email['"]/.test(__src) && /kind\\s*:\\s*['"]sms['"]/.test(__src) && /kind\\s*:\\s*['"]push['"]/.test(__src)) || 'each variant needs its own literal kind (kind: "email", kind: "sms", kind: "push")'`,
              'A single `{ kind: string }` shape cannot be narrowed, so the exhaustiveness check does nothing.',
            ),
            T.js(
              'the default case uses never',
              `/assertNever\\s*\\(\\s*notification\\s*\\)/.test(__src) || 'call assertNever(notification) in the default case'`,
              'That call is what makes a new variant a compile error.',
            ),
          ],
        },
      ],
    },

    // ---------------------------------------------------------------------
    {
      id: 'ts-03',
      title: 'Generics and Reusable Types',
      minutes: 40,
      objectives: [
        'Write a generic function that keeps the caller\'s type',
        'Constrain a type parameter and use it in a return type',
        'Type an async boundary with a generic wrapper',
      ],
      sections: [
        {
          heading: 'A generic is a type parameter',
          body:
            '```ts\nfunction first<T>(items: T[]): T | undefined {\n  return items[0];\n}\n\nconst n = first([1, 2, 3]);       // number | undefined\nconst s = first([\'a\', \'b\']);      // string | undefined\n```\n\n' +
            'Compare that with `function first(items: any[]): any` - the same runtime behaviour, but the caller learns nothing and every later ' +
            'mistake is unchecked. **Generics preserve the relationship between the input and the output.**',
        },
        {
          heading: 'Constrain the parameter with extends',
          body:
            '```ts\nfunction groupBy<T, K extends string>(items: T[], key: (item: T) => K): Record<K, T[]> {\n  const out = {} as Record<K, T[]>;\n  for (const item of items) {\n    const k = key(item);\n    (out[k] ??= []).push(item);\n  }\n  return out;\n}\n```\n\n' +
            '`K extends string` means the key must be usable as an object key, which is what makes `Record<K, T[]>` legal. Constraints are how ' +
            'generics stay honest instead of collapsing into `any`.',
        },
        {
          heading: 'Generics at the async boundary',
          body:
            '```ts\ninterface ApiUser { id: number; name: string }\n\nasync function getJson<T>(url: string): Promise<T> {\n  const res = await fetch(url);\n  if (!res.ok) throw new Error(`${res.status} for ${url}`);\n  return (await res.json()) as T;\n}\n\nconst user = await getJson<ApiUser>(\'/api/me\');\n```\n\n' +
            'One generic helper replaces a hand-written fetch per endpoint. The cast is a *promise about the server*, not a check - which is why ' +
            'the next lesson is about validating that response instead of trusting it.',
        },
      ],
      pitfalls: [
        'Using `any[]` where a type parameter would keep the caller\'s type',
        'Adding a type parameter that is only used once - it adds nothing',
        'Casting with `as T` and forgetting that nothing was validated at runtime',
        'Over-constraining: `<T extends object>` when you only need `T`',
        'Naming type parameters `T1`, `T2` so the signature stops reading like documentation',
      ],
      keyPoints: [
        'Generics carry a type from input to output; `any` throws it away',
        '`extends` constrains a parameter and unlocks richer return types',
        'A generic wrapper plus a cast is fine at the boundary - as long as you validate next',
      ],
      resources: [
        { label: 'TypeScript Handbook: Generics', url: 'https://www.typescriptlang.org/docs/handbook/2/generics.html' },
        { label: 'Total TypeScript: Generics', url: 'https://www.totaltypescript.com/tutorials/beginners-typescript' },
        { label: 'MDN: Promise', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise' },
      ],
      challenges: [
        {
          id: 'write-group-by',
          kind: 'write',
          difficulty: 'medium',
          minutes: 18,
          lang: 'ts',
          ts: true,
          prompt:
            'Write `groupBy<T, K extends string>(items, keySelector)` returning `Record<K, T[]>`. It walks the items once, keys them with ' +
            'the selector, and never mutates the input array.',
          requirements: [
            'Signature is `function groupBy<T, K extends string>(items: T[], key: (item: T) => K): Record<K, T[]>`',
            'Items appear in their original order inside each group',
            'Every group key that appears in the data exists on the result',
            'The input array is not modified',
            'Grouping an empty array gives an empty object',
          ],
          starter: `function groupBy<T, K extends string>(items: T[], key: (item: T) => K): Record<K, T[]> {
  // Implement the grouping here.
  return {} as Record<K, T[]>;
}
`,
          hints: [
            'Start with `const out = {} as Record<K, T[]>;`',
            'For each item: `const k = key(item); (out[k] ??= []).push(item);`',
            '`??=` assigns only when the key is nullish - a tidy way to lazily create the bucket.',
          ],
          solution: `function groupBy<T, K extends string>(items: T[], key: (item: T) => K): Record<K, T[]> {
  const out = {} as Record<K, T[]>;

  for (const item of items) {
    const group = key(item);
    if (out[group] === undefined) out[group] = [];
    out[group].push(item);
  }

  return out;
}
`,
          checks: [
            T.js(
              'groups the items by the selected key',
              `(function () {
  const items = [{ tag: 'css', id: 1 }, { tag: 'js', id: 2 }, { tag: 'css', id: 3 }];
  const grouped = groupBy(items, (item) => item.tag);
  __must(grouped.css && grouped.css.length === 2, 'expected two css items, got ' + JSON.stringify(grouped.css));
  __must(grouped.js && grouped.js.length === 1, 'expected one js item, got ' + JSON.stringify(grouped.js));
  return true;
})()`,
              'Create the bucket if it is missing, then push.',
            ),
            T.js(
              'keeps the original order inside a group',
              `(function () { const items = [{ id: 1 }, { id: 2 }, { id: 3 }]; const grouped = groupBy(items, () => 'all'); __must(grouped.all.map((i) => i.id).join() === '1,2,3', 'expected 1,2,3 got ' + grouped.all.map((i) => i.id).join()); return true; })()`,
              'A single pass with push preserves order.',
            ),
            T.js(
              'does not mutate the input or leak stray keys',
              `(function () { const items = [{ tag: 'a' }]; const copy = JSON.stringify(items); const grouped = groupBy(items, (i) => i.tag); __must(JSON.stringify(items) === copy, 'the input array was modified'); __must(Object.keys(grouped).join() === 'a', 'only keys that appear in the data should exist, got ' + Object.keys(grouped).join()); return true; })()`,
              'Build a fresh object; never sort or splice the input.',
            ),
            T.js(
              'an empty input gives an empty object',
              `(function () { const grouped = groupBy([], (item) => item); __must(Object.keys(grouped).length === 0, 'grouping nothing should give {}'); return true; })()`,
              'Nothing special needed - just do not pre-seed keys.',
            ),
            T.js(
              'the type parameter is constrained and used in the return',
              `/function\\s+groupBy\\s*<\\s*T\\s*,\\s*K\\s+extends\\s+string\\s*>/.test(__src) || 'declare the parameters as <T, K extends string>'`,
              'The constraint is what makes `Record<K, T[]>` legal.',
            ),
          ],
        },
        {
          id: 'debug-generic-loss',
          kind: 'debug',
          difficulty: 'medium',
          minutes: 15,
          lang: 'ts',
          ts: true,
          prompt:
            '`firstBy` works at runtime but its types are useless: `any[]` in, `any` out, so callers get no help at all. Keep the behaviour ' +
            'and make the signature carry the item type, including the `undefined` when nothing matches.',
          requirements: [
            'Signature is `function firstBy<T>(items: T[], predicate: (item: T) => boolean): T | undefined`',
            'Returns the first matching item, by identity (the same object)',
            'Returns `undefined` when nothing matches',
            'Returns `undefined` for an empty array',
            'No `any` in the file',
          ],
          starter: `function firstBy(items: any[], predicate: any): any {
  for (const item of items) {
    if (predicate(item)) return item;
  }
  return undefined;
}
`,
          hints: [
            'The predicate is a function returning a boolean: `predicate: (item: T) => boolean`.',
            'The return type is `T | undefined` - saying `T` would lie to the caller.',
            'Only the signature changes; the body already does the right thing.',
          ],
          solution: `function firstBy<T>(items: T[], predicate: (item: T) => boolean): T | undefined {
  for (const item of items) {
    if (predicate(item)) return item;
  }
  return undefined;
}
`,
          checks: [
            T.js(
              'returns the first match by identity',
              `(function () { const target = { id: 2 }; const items = [{ id: 1 }, target, { id: 3 }]; const found = firstBy(items, (item) => item.id === 2); __must(found === target, 'it should return the very object from the array, not a copy'); return true; })()`,
              'Keep returning the item itself.',
            ),
            T.js(
              'returns undefined when nothing matches',
              `(function () { __must(firstBy([{ id: 1 }], (item) => item.id === 9) === undefined, 'no match should give undefined'); __must(firstBy([], () => true) === undefined, 'an empty array should give undefined'); return true; })()`,
              'The loop falls through to `return undefined`.',
            ),
            T.js(
              'the predicate receives every item until it matches',
              `(function () { const seen = []; const items = [{ id: 1 }, { id: 2 }, { id: 3 }]; firstBy(items, (item) => { seen.push(item.id); return item.id === 2; }); __must(seen.join() === '1,2', 'the predicate should stop being called after a match, saw ' + seen.join()); return true; })()`,
              'Return as soon as the predicate is true - do not collect all matches.',
            ),
            T.js(
              'the signature is generic',
              `/function\\s+firstBy\\s*<\\s*T\\s*>/.test(__src) || 'declare firstBy<T>(items: T[], predicate: (item: T) => boolean): T | undefined'`,
              'One type parameter is enough here.',
            ),
            T.js(
              'no any is left',
              `!/\\bany\\b/.test(__src) || 'every any here is a place the caller loses their type'`,
              'Replace `any[]` with `T[]` and `any` with `(item: T) => boolean` / `T | undefined`.',
            ),
          ],
        },
        {
          id: 'write-typed-fetch',
          kind: 'write',
          difficulty: 'hard',
          minutes: 20,
          lang: 'ts',
          async: true,
          ts: true,
          mockFetch: {
            '/api/teams': { teams: [{ id: 1, name: 'Core' }, { id: 2, name: 'Web' }] },
          },
          prompt:
            'Write a generic `getJson<T>(url): Promise<T>` that fetches, throws on a non-ok response, and resolves with the parsed body - then ' +
            'use it to write `loadTeams(): Promise<Team[]>` with `interface Team { id: number; name: string }`, unwrapping the `{ teams }` ' +
            'envelope the API returns.',
          requirements: [
            '`getJson<T>(url: string): Promise<T>` throws an Error mentioning the status when `res.ok` is false',
            '`loadTeams()` calls `getJson<{ teams: Team[] }>("/api/teams")` and returns just the array',
            '`interface Team` is declared with a `number` id and a `string` name',
            'An unknown URL rejects rather than resolving with an empty array',
          ],
          starter: `interface Team {
  // Declare the shape.
}

async function getJson<T>(url: string): Promise<T> {
  // Implement the generic fetch wrapper.
  throw new Error('not implemented');
}

async function loadTeams(): Promise<Team[]> {
  // Use getJson here.
  return [];
}
`,
          hints: [
            'The wrapper: `const res = await fetch(url); if (!res.ok) throw new Error(...); return (await res.json()) as T;`',
            'Call it with the envelope type: `const data = await getJson<{ teams: Team[] }>(\'/api/teams\');`',
            'Then `return data.teams;` - the function\'s job is to unwrap the API shape.',
          ],
          solution: `interface Team {
  id: number;
  name: string;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error('GET ' + url + ' failed with ' + res.status);
  }
  return (await res.json()) as T;
}

async function loadTeams(): Promise<Team[]> {
  const data = await getJson<{ teams: Team[] }>('/api/teams');
  return data.teams;
}
`,
          checks: [
            T.js(
              'getJson resolves with the parsed body',
              `(async function () { const data = await getJson('/api/teams'); __must(data && Array.isArray(data.teams), 'getJson should resolve with the parsed JSON body, got ' + JSON.stringify(data)); return true; })()`,
              'Await `res.json()` and return it.',
            ),
            T.js(
              'loadTeams unwraps the envelope',
              `(async function () { const teams = await loadTeams(); __must(Array.isArray(teams), 'loadTeams should resolve with an array'); __must(teams.length === 2 && teams[0].name === 'Core', 'expected the two teams from the envelope, got ' + JSON.stringify(teams)); return true; })()`,
              'Return `data.teams`, not the whole envelope.',
            ),
            T.js(
              'a failed response rejects',
              `(async function () { try { await getJson('/api/nope'); } catch (err) { __must(/404/.test(err.message), 'the error should mention the status, got ' + JSON.stringify(err.message)); return true; } __must(false, 'an unknown URL should reject instead of resolving'); })()`,
              'Check `res.ok` and throw with `res.status` in the message.',
            ),
            T.js(
              'the Team interface is declared',
              `/interface\\s+Team\\s*\\{[^}]*id\\s*:\\s*number[^}]*name\\s*:\\s*string/s.test(__src) || 'declare interface Team { id: number; name: string }'`,
              'Names and ids should be typed, not left as `any`.',
            ),
            T.js(
              'getJson is generic',
              `/function\\s+getJson\\s*<\\s*T\\s*>\\s*\\(\\s*url\\s*:\\s*string\\s*\\)\\s*:\\s*Promise\\s*<\\s*T\\s*>/.test(__src) || 'declare it as getJson<T>(url: string): Promise<T>'`,
              'One type parameter, used in the return type.',
            ),
          ],
        },
      ],
    },

    // ---------------------------------------------------------------------
    {
      id: 'ts-04',
      title: 'Narrowing, unknown and Runtime Validation',
      minutes: 45,
      objectives: [
        'Narrow a union with typeof, Array.isArray and in',
        'Write a type predicate that checks its input for real',
        'Validate data crossing a boundary instead of casting it',
      ],
      sections: [
        {
          heading: 'unknown is the honest type for outside data',
          body:
            'Everything that enters your program - JSON, `localStorage`, a query string, a message from another service - is a claim, not a ' +
            'fact. `unknown` says "I have not checked this yet", and TypeScript refuses to let you use it until you have:\n\n' +
            '```ts\nfunction parseConfig(input: unknown): Config {\n  if (typeof input !== \'object\' || input === null) throw new Error(\'config must be an object\');\n  const candidate = input as Record<string, unknown>;\n  if (typeof candidate.host !== \'string\') throw new Error(\'config.host must be a string\');\n  if (typeof candidate.port !== \'number\') throw new Error(\'config.port must be a number\');\n  return { host: candidate.host, port: candidate.port };\n}\n```\n\n' +
            'The `as Record<string, unknown>` is safe because of the check above it, and every branch after that narrows one field at a time.',
        },
        {
          heading: 'Narrowing tools',
          body:
            '- `typeof x === \'string\'` - primitives (note: arrays are `\'object\'`)\n' +
            '- `Array.isArray(x)` - the only reliable array check\n' +
            '- `x === null` - because `typeof null === \'object\'`\n' +
            '- `\'name\' in x` - property presence on objects\n' +
            '- `x instanceof Date` - class instances\n' +
            '- a user-defined predicate - `function isTask(x: unknown): x is Task`',
        },
        {
          heading: 'Type predicates check and persuade',
          body:
            '```ts\nfunction isStringArray(value: unknown): value is string[] {\n  return Array.isArray(value) && value.every((item) => typeof item === \'string\');\n}\n```\n\n' +
            'The `value is string[]` return type is a promise to the compiler. If the body only checks `Array.isArray`, the promise is a lie and ' +
            'the bug shows up three files away. Write the predicate so it really tests what the type claims - and remember that a predicate ' +
            'that returns plain `boolean` narrows nothing at all.',
        },
      ],
      pitfalls: [
        '`typeof value === "array"` - there is no such typeof result',
        'A predicate returning `boolean` instead of `value is T`, so no narrowing happens',
        '`value!` or `as Task` on untrusted JSON instead of validating it',
        'Checking `Array.isArray` but not what is *inside* the array',
        'Forgetting that `typeof null === "object"`, so a null slips through an object check',
      ],
      keyPoints: [
        '`unknown` forces validation; `any` hides the missing validation',
        'Narrow with typeof, Array.isArray, `in` and instanceof before trusting anything',
        'A predicate must claim `value is T` *and* genuinely test it',
      ],
      resources: [
        { label: 'TypeScript Handbook: Narrowing', url: 'https://www.typescriptlang.org/docs/handbook/2/narrowing.html' },
        { label: 'Zod (runtime validation library)', url: 'https://zod.dev/' },
        { label: 'MDN: typeof', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/typeof' },
      ],
      challenges: [
        {
          id: 'write-parse-config',
          kind: 'write',
          difficulty: 'hard',
          minutes: 22,
          lang: 'ts',
          ts: true,
          prompt:
            'Write `parseConfig(input: unknown): Config` where `Config` is `{ host: string; port: number; features?: string[] }`. Every field ' +
            'is validated for real and a bad field throws an `Error` whose message names that field. Extra keys on the input are ignored.',
          requirements: [
            'The parameter is `unknown` and there is no `any`',
            'A non-object input (or `null`) throws mentioning "object"',
            'A missing or non-string `host` throws mentioning "host"',
            'A missing or non-number `port` throws mentioning "port"',
            '`features`, when present, must be an array of strings - otherwise throw mentioning "features"',
            'A valid object round-trips: `{ host, port, features }`',
          ],
          starter: `interface Config {
  host: string;
  port: number;
  features?: string[];
}

function parseConfig(input: unknown): Config {
  // Validate every field before returning.
  throw new Error('not implemented');
}
`,
          hints: [
            'First guard the container: `if (typeof input !== \'object\' || input === null) throw new Error(\'config must be an object\');`',
            'Then work through a `Record<string, unknown>` view of it, one field at a time.',
            'For features: `if (!Array.isArray(features) || !features.every((f) => typeof f === \'string\')) throw ...`',
          ],
          solution: `interface Config {
  host: string;
  port: number;
  features?: string[];
}

function parseConfig(input: unknown): Config {
  if (typeof input !== 'object' || input === null) {
    throw new Error('config must be an object');
  }

  const candidate = input as Record<string, unknown>;

  if (typeof candidate.host !== 'string') {
    throw new Error('config.host must be a string');
  }

  if (typeof candidate.port !== 'number') {
    throw new Error('config.port must be a number');
  }

  const config: Config = { host: candidate.host, port: candidate.port };

  if (candidate.features !== undefined) {
    const features = candidate.features;
    if (!Array.isArray(features) || !features.every((item) => typeof item === 'string')) {
      throw new Error('config.features must be an array of strings');
    }
    config.features = features as string[];
  }

  return config;
}
`,
          checks: [
            T.js(
              'a valid config round-trips',
              `(function () { const config = parseConfig({ host: 'localhost', port: 3000, features: ['a'] }); __must(config.host === 'localhost' && config.port === 3000, 'the valid fields should be copied across, got ' + JSON.stringify(config)); __must(Array.isArray(config.features) && config.features[0] === 'a', 'features should be carried through'); return true; })()`,
              'Return a fresh object built from the validated fields.',
            ),
            T.js(
              'rejects non-objects',
              `(function () { let threw = false; try { parseConfig('nope'); } catch (err) { threw = /object/.test(err.message); } __must(threw, 'a string input should throw mentioning "object"'); let nullThrew = false; try { parseConfig(null); } catch (err) { nullThrew = /object/.test(err.message); } __must(nullThrew, 'null must be rejected too - typeof null is "object"'); return true; })()`,
              'Guard with `typeof input !== \'object\' || input === null`.',
            ),
            T.js(
              'rejects a bad host and port',
              `(function () { let host = false; try { parseConfig({ port: 1 }); } catch (err) { host = /host/.test(err.message); } __must(host, 'a missing host should throw mentioning "host"'); let port = false; try { parseConfig({ host: 'x', port: '3000' }); } catch (err) { port = /port/.test(err.message); } __must(port, 'a string port should throw mentioning "port"'); return true; })()`,
              'Check the type of each field and name it in the message.',
            ),
            T.js(
              'rejects a bad features value',
              `(function () { let notArray = false; try { parseConfig({ host: 'x', port: 1, features: 'a,b' }); } catch (err) { notArray = /features/.test(err.message); } __must(notArray, 'a non-array features should throw mentioning "features"'); let badItem = false; try { parseConfig({ host: 'x', port: 1, features: ['a', 2] }); } catch (err) { badItem = /features/.test(err.message); } __must(badItem, 'an array with a non-string item should throw too'); return true; })()`,
              '`Array.isArray` is not enough - check every item.',
            ),
            T.js(
              'the parameter is unknown and there is no any',
              `/parseConfig\\s*\\(\\s*input\\s*:\\s*unknown\\s*\\)/.test(__src) || 'the parameter must be unknown, not any'`,
              '`unknown` is what forces you to validate.',
            ),
          ],
        },
        {
          id: 'debug-type-guard',
          kind: 'debug',
          difficulty: 'medium',
          minutes: 15,
          lang: 'ts',
          ts: true,
          prompt:
            'This guard never returns true: `typeof value === "array"` is not a thing, and because the function returns `boolean` instead of a ' +
            'type predicate, TypeScript would not narrow anyway. Fix the guard so it genuinely checks for an array of strings, and make it ' +
            'narrow.',
          requirements: [
            '`isStringArray(value: unknown): value is string[]`',
            'True only for arrays whose every element is a string',
            '`joinTags` returns the joined tags for a valid array and `""` otherwise',
            'No `any`, and no `typeof x === "array"`',
          ],
          starter: `function isStringArray(value: any): boolean {
  return typeof value === 'array';
}

function joinTags(value: any): string {
  if (isStringArray(value)) {
    return value.join(', ');
  }
  return '';
}
`,
          hints: [
            '`Array.isArray(value)` is the only reliable array check.',
            'A predicate return type is `value is string[]` - that is what narrows `value` afterwards.',
            'Check the contents too: `value.every((item) => typeof item === \'string\')`.',
          ],
          solution: `function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function joinTags(value: unknown): string {
  if (isStringArray(value)) {
    return value.join(', ');
  }
  return '';
}
`,
          checks: [
            T.js(
              'joins a real string array',
              `(function () { __must(joinTags(['a', 'b']) === 'a, b', 'expected "a, b", got ' + JSON.stringify(joinTags(['a', 'b']))); return true; })()`,
              '`Array.isArray` plus an element check.',
            ),
            T.js(
              'rejects arrays with non-strings',
              `(function () { __must(joinTags(['a', 2]) === '', 'an array with a number is not a string array'); return true; })()`,
              '`value.every((item) => typeof item === \'string\')` fails on the number.',
            ),
            T.js(
              'rejects everything that is not an array',
              `(function () { __must(joinTags('nope') === '', 'a string is not a string array'); __must(joinTags(null) === '', 'null is not an array'); __must(joinTags({ 0: 'a' }) === '', 'an object is not an array'); return true; })()`,
              'The guard must be true only for arrays - do not forget `null`.',
            ),
            T.js(
              'the guard is a real predicate',
              `/function\\s+isStringArray\\s*\\(\\s*value\\s*:\\s*unknown\\s*\\)\\s*:\\s*value\\s+is\\s+string\\[\\]/.test(__src) || 'declare it as isStringArray(value: unknown): value is string[]'`,
              '`value is string[]` is what lets the caller narrow.',
            ),
            T.js(
              'does not use any or the fake typeof check',
              `(!/\\bany\\b/.test(__src) && !/typeof\\s+\\w+\\s*===\\s*['"]array['"]/.test(__src)) || 'remove the any annotations and the typeof "array" check'`,
              '`typeof` can never return "array".',
            ),
          ],
        },
        {
          id: 'write-area-union',
          kind: 'write',
          difficulty: 'medium',
          minutes: 18,
          lang: 'ts',
          ts: true,
          prompt:
            'Model shapes as a discriminated union - `{ kind: "circle"; radius: number }`, `{ kind: "rect"; width: number; height: number }` - ' +
            'and write `area(shape)` and `describe(shape)` with exhaustive switches. `describe` should return `"circle r=2"` or `"rect 3x4"`.',
          requirements: [
            'Both variants carry a literal `kind`',
            '`area` uses π as `Math.PI` and returns a number',
            '`describe` renders `circle r=<radius>` and `rect <width>x<height>`',
            'Both switches are exhaustive with a `never` default',
            'An unknown kind throws',
          ],
          starter: `type Shape = { kind: string; radius: number };

function area(shape: Shape): number {
  return 0;
}

function describe(shape: Shape): string {
  return '';
}
`,
          hints: [
            'Two variants: `| { kind: \'circle\'; radius: number } | { kind: \'rect\'; width: number; height: number }`',
            'Switch on `shape.kind`; inside the circle case `shape.radius` is the only property that exists.',
            'The default branch: `const never: never = shape; throw new Error(\'Unknown shape: \' + JSON.stringify(never));`',
          ],
          solution: `type Shape =
  | { kind: 'circle'; radius: number }
  | { kind: 'rect'; width: number; height: number };

function area(shape: Shape): number {
  switch (shape.kind) {
    case 'circle':
      return Math.PI * shape.radius ** 2;
    case 'rect':
      return shape.width * shape.height;
    default: {
      const never: never = shape;
      throw new Error('Unknown shape: ' + JSON.stringify(never));
    }
  }
}

function describe(shape: Shape): string {
  switch (shape.kind) {
    case 'circle':
      return 'circle r=' + shape.radius;
    case 'rect':
      return 'rect ' + shape.width + 'x' + shape.height;
    default: {
      const never: never = shape;
      throw new Error('Unknown shape: ' + JSON.stringify(never));
    }
  }
}
`,
          checks: [
            T.js(
              'area computes both shapes',
              `(function () { const circle = area({ kind: 'circle', radius: 2 }); __must(Math.abs(circle - Math.PI * 4) < 1e-9, 'circle area should be PI * r^2, got ' + circle); const rect = area({ kind: 'rect', width: 3, height: 4 }); __must(rect === 12, 'rect area should be 12, got ' + rect); return true; })()`,
              'π times radius squared; width times height.',
            ),
            T.js(
              'describe renders both shapes',
              `(function () { __must(describe({ kind: 'circle', radius: 2 }) === 'circle r=2', 'expected "circle r=2", got ' + JSON.stringify(describe({ kind: 'circle', radius: 2 }))); __must(describe({ kind: 'rect', width: 3, height: 4 }) === 'rect 3x4', 'expected "rect 3x4", got ' + JSON.stringify(describe({ kind: 'rect', width: 3, height: 4 }))); return true; })()`,
              'Interpolate the properties that exist in each branch.',
            ),
            T.js(
              'unknown shapes throw',
              `(function () { let threw = false; try { area({ kind: 'hexagon', radius: 1 }); } catch (err) { threw = true; } __must(threw, 'an unknown kind should throw from the never default'); return true; })()`,
              'Assign to `const never: never = shape` and throw.',
            ),
            T.js(
              'the union uses literal kinds',
              `(/kind\\s*:\\s*['"]circle['"]/.test(__src) && /kind\\s*:\\s*['"]rect['"]/.test(__src)) || 'each variant needs its own literal kind'`,
              'A `kind: string` union cannot be narrowed.',
            ),
            T.js(
              'never is used to enforce exhaustiveness',
              `/\\bnever\\b/.test(__src) || 'use a never default in both switches'`,
              'That is what makes a new shape a compile error.',
            ),
          ],
        },
      ],
    },

    // ---------------------------------------------------------------------
    {
      id: 'ts-05',
      title: 'Types at the Boundary (and a typed reducer)',
      minutes: 45,
      objectives: [
        'Separate the API\'s shape from your domain shape',
        'Validate rather than cast the response',
        'Type a reducer over a discriminated union of actions',
      ],
      sections: [
        {
          heading: 'The wire format is not your data model',
          body:
            'The API sends `{ id, title, completed: 0 | 1 }`. Your app wants `{ id, title, completed: boolean }`. Type the wire shape, then map ' +
            'it:\n\n' +
            '```ts\ninterface ApiTask { id: number; title: string; completed: 0 | 1 }\ninterface Task { id: number; title: string; completed: boolean }\n\n' +
            'const toTask = (row: ApiTask): Task => ({\n  id: row.id,\n  title: row.title,\n  completed: row.completed === 1,\n});\n```\n\n' +
            'Two interfaces feels like duplication until the API adds a field or changes a name - then you change exactly one mapping function ' +
            'and the rest of the app never notices.',
        },
        {
          heading: 'A cast is a promise you cannot keep',
          body:
            '```ts\nconst data = (await res.json()) as Task;   // compiler: fine\nreturn data.title.toUpperCase();            // runtime: Cannot read properties of undefined\n```\n\n' +
            '`res.json()` returns `any`, so a cast silences the checker. At a boundary the honest sequence is: **parse as unknown, validate, then ' +
            'trust.** In a real project a schema library does the work:\n\n' +
            '```ts\nconst TaskSchema = z.object({ id: z.number(), title: z.string() });\nconst task = TaskSchema.parse(await res.json());   // throws with a useful message\n```\n\n' +
            'The lesson below has you hand-write that validation, which is exactly what the library is doing for you.',
        },
        {
          heading: 'Typed reducers: state + discriminated actions',
          body:
            '```ts\ninterface State { count: number; history: number[] }\n\ntype Action =\n  | { type: \'increment\'; by: number }\n  | { type: \'reset\' }\n  | { type: \'undo\' };\n\n' +
            'function reducer(state: State, action: Action): State {\n  switch (action.type) {\n    case \'increment\':\n      return { count: state.count + action.by, history: [...state.history, state.count] };\n    case \'reset\':\n      return { count: 0, history: [] };\n    case \'undo\': {\n      if (state.history.length === 0) return state;\n      const previous = state.history[state.history.length - 1];\n      return { count: previous, history: state.history.slice(0, -1) };\n    }\n    default:\n      return assertNever(action);\n  }\n}\n```\n\n' +
            'Every branch returns a **new** state object, so React can see the change, and `action.by` only exists inside the increment branch ' +
            'because of the discriminated union.',
        },
      ],
      pitfalls: [
        'Casting `res.json()` to your domain type instead of validating it',
        'Using one interface for both the wire format and the UI model, so every API tweak ripples through the app',
        'Mutating the state object in a reducer and returning the same reference',
        'A non-exhaustive switch that returns `undefined` for a new action type',
        'Trusting `content-type` instead of simply validating the body',
      ],
      keyPoints: [
        'Type the boundary separately and map into your domain',
        'Parse as `unknown`, validate, then trust - a cast is not validation',
        'A reducer is a pure function from (state, action) to new state; a discriminated union makes it exhaustive',
      ],
      resources: [
        { label: 'react.dev: Extracting State Logic into a Reducer', url: 'https://react.dev/learn/extracting-state-logic-into-a-reducer' },
        { label: 'TypeScript Handbook: Type Predicates', url: 'https://www.typescriptlang.org/docs/handbook/2/narrowing.html#using-type-predicates' },
        { label: 'Zod: schema validation', url: 'https://zod.dev/' },
      ],
      challenges: [
        {
          id: 'write-api-types',
          kind: 'write',
          difficulty: 'medium',
          minutes: 18,
          lang: 'ts',
          async: true,
          ts: true,
          mockFetch: {
            '/api/tasks': [
              { id: 1, title: 'Ship it', completed: 1 },
              { id: 2, title: 'Write tests', completed: 0 },
            ],
          },
          prompt:
            'The API returns an array of rows where `completed` is `0 | 1`. Declare both shapes, write `toTask(row)` to map a row into the ' +
            'domain type, and `loadTasks()` that fetches `/api/tasks` and returns `Task[]`.',
          requirements: [
            '`interface ApiTask { id: number; title: string; completed: 0 | 1 }` and `interface Task` with `completed: boolean`',
            '`toTask(row: ApiTask): Task` converts `0 | 1` to `boolean`',
            '`loadTasks(): Promise<Task[]>` returns mapped domain objects',
            'The original response objects are not mutated',
            'A failed response rejects',
          ],
          starter: `interface ApiTask {
  // The wire shape.
}

interface Task {
  // Your domain shape.
}

function toTask(row: ApiTask): Task {
  // Map one row.
  throw new Error('not implemented');
}

async function loadTasks(): Promise<Task[]> {
  // Fetch and map.
  return [];
}
`,
          hints: [
            '`completed: 0 | 1` on `ApiTask`, `completed: boolean` on `Task`.',
            'Map with a comparison: `completed: row.completed === 1`.',
            '`const rows = await getJson...` - or just `const res = await fetch(\'/api/tasks\'); const rows = await res.json();`',
          ],
          solution: `interface ApiTask {
  id: number;
  title: string;
  completed: 0 | 1;
}

interface Task {
  id: number;
  title: string;
  completed: boolean;
}

function toTask(row: ApiTask): Task {
  return {
    id: row.id,
    title: row.title,
    completed: row.completed === 1,
  };
}

async function loadTasks(): Promise<Task[]> {
  const res = await fetch('/api/tasks');
  if (!res.ok) {
    throw new Error('GET /api/tasks failed with ' + res.status);
  }
  const rows = (await res.json()) as ApiTask[];
  return rows.map(toTask);
}
`,
          checks: [
            T.js(
              'maps a row into the domain type',
              `(function () { const done = toTask({ id: 1, title: 'x', completed: 1 }); const open = toTask({ id: 2, title: 'y', completed: 0 }); __must(done.completed === true, 'completed: 1 should map to true, got ' + JSON.stringify(done.completed)); __must(open.completed === false, 'completed: 0 should map to false, got ' + JSON.stringify(open.completed)); __must(done.title === 'x' && done.id === 1, 'the other fields should pass through'); return true; })()`,
              '`completed: row.completed === 1`.',
            ),
            T.js(
              'toTask does not mutate the row',
              `(function () { const row = { id: 1, title: 'x', completed: 1 }; toTask(row); __must(row.completed === 1, 'the wire object should stay untouched'); return true; })()`,
              'Return a new object rather than assigning to the row.',
            ),
            T.js(
              'loadTasks fetches and maps',
              `(async function () { const tasks = await loadTasks(); __must(Array.isArray(tasks) && tasks.length === 2, 'expected two tasks, got ' + JSON.stringify(tasks)); __must(tasks[0].completed === true && tasks[1].completed === false, 'the completed flags should be booleans, got ' + JSON.stringify(tasks.map((t) => t.completed))); return true; })()`,
              'Map the parsed rows through `toTask`.',
            ),
            T.js(
              'the two interfaces stay separate',
              `(/interface\\s+ApiTask\\s*\\{[^}]*completed\\s*:\\s*0\\s*\\|\\s*1/s.test(__src)) || 'declare ApiTask with completed: 0 | 1 - the wire format keeps its own type'`,
              'Two shapes: one for what the server sends, one for what the app uses.',
            ),
          ],
        },
        {
          id: 'debug-as-any',
          kind: 'debug',
          difficulty: 'hard',
          minutes: 18,
          lang: 'ts',
          async: true,
          ts: true,
          mockFetch: {
            '/api/tasks/1': { id: 1, title: 'Ship it' },
            '/api/tasks/2': { id: 2 },
          },
          prompt:
            'This function dies with "Cannot read properties of undefined" when the server omits a field, and the `as any` cast is what let ' +
            'that call site through the type checker. Validate the response instead of casting it, and fail with a message that says which ' +
            'task was broken.',
          requirements: [
            'No `any` and no `as any` anywhere',
            '`loadTitle(1)` resolves with `"SHIP IT"`',
            '`loadTitle(2)` (a row with no title) rejects with a message mentioning the id or the word "title"',
            'A non-ok response rejects too',
            'The validation happens at the boundary, before any use of the data',
          ],
          starter: `async function loadTitle(id: number): Promise<string> {
  const res = await fetch('/api/tasks/' + id);
  const data = (await res.json()) as any;
  return data.title.toUpperCase();
}
`,
          hints: [
            'Read the body into an `unknown` and check it: `const data: unknown = await res.json();`',
            'An assertion helps TypeScript here: `const row = data as { title?: unknown };` - safe because you check it on the next line.',
            'Then `if (typeof row.title !== \'string\' || !row.title) throw new Error(\'Task \' + id + \' has no title\');`',
          ],
          solution: `async function loadTitle(id: number): Promise<string> {
  const res = await fetch('/api/tasks/' + id);
  if (!res.ok) {
    throw new Error('GET /api/tasks/' + id + ' failed with ' + res.status);
  }

  const body: unknown = await res.json();
  if (typeof body !== 'object' || body === null) {
    throw new Error('Task ' + id + ' returned a non-object body');
  }

  const row = body as { title?: unknown };
  if (typeof row.title !== 'string' || row.title.length === 0) {
    throw new Error('Task ' + id + ' has no title');
  }

  return row.title.toUpperCase();
}
`,
          checks: [
            T.js(
              'returns the upper-cased title',
              `(async function () { const title = await loadTitle(1); __must(title === 'SHIP IT', 'expected "SHIP IT", got ' + JSON.stringify(title)); return true; })()`,
              'Validate first, then use the value.',
            ),
            T.js(
              'a missing title rejects with a useful message',
              `(async function () { try { await loadTitle(2); } catch (err) { __must(/title/i.test(err.message), 'the error should say the title is missing, got ' + JSON.stringify(err.message)); return true; } __must(false, 'a row with no title should reject, not resolve with undefined'); })()`,
              'Check `typeof row.title === \'string\'` before using it.',
            ),
            T.js(
              'no any or as any remains',
              `(!/\\bas\\s+any\\b/.test(__src) && !/\\bany\\b/.test(__src)) || 'the cast is the bug - validate the body instead of casting it'`,
              'Validate as `unknown` and narrow with typeof.',
            ),
            T.js(
              'the ok check is present',
              `/!?\\s*\\bres\\.ok\\b/.test(__src) || 'check res.ok and throw with the status'`,
              'A 404 body is not JSON you can trust.',
            ),
          ],
        },
        {
          id: 'write-typed-reducer',
          kind: 'write',
          difficulty: 'hard',
          minutes: 22,
          lang: 'ts',
          ts: true,
          prompt:
            'Write a typed reducer for a counter with history. Actions: `{ type: "increment"; by: number }`, `{ type: "reset" }`, ' +
            '`{ type: "undo" }`. State: `{ count: number; history: number[] }`. Every branch returns a new object, `undo` with an empty history ' +
            'returns the state unchanged, and the switch is exhaustive.',
          requirements: [
            '`interface State { count: number; history: number[] }` and a discriminated `Action` union',
            '`increment` adds `by` and pushes the *previous* count onto the history',
            '`reset` gives `{ count: 0, history: [] }`',
            '`undo` restores the last history entry and removes it; with no history it returns the same state',
            'No mutation: the previous state object must be untouched',
            'An unknown action type throws',
          ],
          starter: `interface State {
  count: number;
  history: number[];
}

type Action = { type: string; by?: number };

function reducer(state: State, action: Action): State {
  return state;
}
`,
          hints: [
            'The union: `{ type: \'increment\'; by: number } | { type: \'reset\' } | { type: \'undo\' }`',
            'Increment: `{ count: state.count + action.by, history: [...state.history, state.count] }`',
            'Undo: `const previous = state.history[state.history.length - 1]; return { count: previous, history: state.history.slice(0, -1) };`',
          ],
          solution: `interface State {
  count: number;
  history: number[];
}

type Action =
  | { type: 'increment'; by: number }
  | { type: 'reset' }
  | { type: 'undo' };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'increment':
      return { count: state.count + action.by, history: [...state.history, state.count] };
    case 'reset':
      return { count: 0, history: [] };
    case 'undo': {
      if (state.history.length === 0) return state;
      const previous = state.history[state.history.length - 1];
      return { count: previous, history: state.history.slice(0, -1) };
    }
    default: {
      const never: never = action;
      throw new Error('Unknown action: ' + JSON.stringify(never));
    }
  }
}
`,
          checks: [
            T.js(
              'increment accumulates and records history',
              `(function () {
  const start = { count: 0, history: [] };
  const one = reducer(start, { type: 'increment', by: 2 });
  const two = reducer(one, { type: 'increment', by: 3 });
  __must(one.count === 2, 'after +2 the count should be 2, got ' + one.count);
  __must(two.count === 5, 'after +3 the count should be 5, got ' + two.count);
  __must(two.history.join() === '0,2', 'history should record the previous counts, got ' + JSON.stringify(two.history));
  return true;
})()`,
              'Push `state.count` *before* adding `by`.',
            ),
            T.js(
              'undo restores the previous state',
              `(function () { const a = reducer({ count: 0, history: [] }, { type: 'increment', by: 4 }); const b = reducer(a, { type: 'undo' }); __must(b.count === 0, 'undo should restore 0, got ' + b.count); __must(b.history.length === 0, 'history should be empty again, got ' + JSON.stringify(b.history)); return true; })()`,
              'Pop the last history entry into the count.',
            ),
            T.js(
              'undo with no history is a no-op',
              `(function () { const state = { count: 7, history: [] }; const next = reducer(state, { type: 'undo' }); __must(next.count === 7 && next.history.length === 0, 'undo with nothing to undo should leave the state alone, got ' + JSON.stringify(next)); return true; })()`,
              'Return `state` unchanged when the history is empty.',
            ),
            T.js(
              'reset clears everything',
              `(function () { const next = reducer({ count: 9, history: [1, 2] }, { type: 'reset' }); __must(next.count === 0 && next.history.length === 0, 'reset should give { count: 0, history: [] }, got ' + JSON.stringify(next)); return true; })()`,
              'Return a fresh object, not the state you were given.',
            ),
            T.js(
              'nothing is mutated',
              `(function () {
  const state = { count: 1, history: [0] };
  const snapshot = JSON.stringify(state);
  reducer(state, { type: 'increment', by: 1 });
  reducer(state, { type: 'reset' });
  reducer(state, { type: 'undo' });
  __must(JSON.stringify(state) === snapshot, 'a reducer must never mutate the state it was given - React would not re-render');
  return true;
})()`,
              'Spread the old state into a new object every time.',
            ),
            T.js(
              'unknown actions throw',
              `(function () { let threw = false; try { reducer({ count: 0, history: [] }, { type: 'nope' }); } catch (err) { threw = true; } __must(threw, 'an unknown action should hit the never branch and throw'); return true; })()`,
              'Keep the exhaustive default with `never`.',
            ),
          ],
        },
      ],
    },
  ],

  project: {
    id: 'ts-capstone',
    title: 'Capstone: migrate a JavaScript app to strict TypeScript',
    minutes: 300,
    brief:
      'Take the Express + React task app you built in the earlier modules and move it to TypeScript with `strict` on, one honest file at a ' +
      'time.\\n\\n' +
      'The point is not to sprinkle annotations - it is to make impossible states unrepresentable: parse at the boundaries, narrow instead of ' +
      'casting, and let the compiler delete whole categories of bug. Keep a log of every bug the types caught; that log is the real ' +
      'deliverable.',
    starter: `task-app/
├── tsconfig.json
├── shared/
│   └── types.ts
├── server/
│   ├── index.ts
│   ├── routes/tasks.ts
│   └── db/tasks.ts
├── client/
│   ├── api/client.ts
│   ├── features/tasks/
│   │   ├── tasksSlice.ts
│   │   └── TaskList.tsx
│   └── types.ts
└── MIGRATION.md`,
    requirements: [
      '`tsconfig.json` with `strict: true`, `noUncheckedIndexedAccess: true` and `noImplicitOverride: true`',
      '`shared/types.ts` holds `Task`, `NewTask`, `ApiTask` and the action unions - one source of truth used by both sides',
      'Every boundary (request body, query string, fetch response, `localStorage`) goes through a validation function instead of a cast',
      'A `Result<T, E>` type for the service layer, with `ok`/`err`/`unwrap` helpers',
      '`unknown` rather than `any` everywhere; zero occurrences of `any` outside of a documented footnote',
      'A typed error hierarchy: `ValidationError`, `NotFoundError`, `ConflictError`, each carrying a status code',
      'All reducers take a discriminated action union and switch exhaustively with `assertNever`',
      'No non-null assertions (`!`) - narrow instead',
      'Optional chaining and `??` everywhere a value can be missing; `||` only where falsy really means fallback',
      '`MIGRATION.md` lists every bug the compiler caught, with the file and the symptom it would have caused in production',
    ],
    checks: [
      '`npx tsc --noEmit` exits 0 with `strict` on',
      'Grep the source for `: any`, `as any` and `!` assertions: only documented exceptions remain',
      'Send a request body with a missing field: you get a 400 with the offending field named, not a crash',
      'Send a request body with an unexpected extra field: it is ignored, and a test proves it',
      'Change `Task.completed` from `boolean` to `0 | 1`: the compiler shows every place that must change, and nothing else',
      'Delete a variant from the notification/action union: the build fails with the exact switch that needs updating',
      'Corrupt a `localStorage` value by hand: the app recovers with a logged warning instead of a white screen',
      'Run the API test suite under `tsc` with `noUncheckedIndexedAccess`: array access is handled, not assumed',
      'The React app builds with no `skipLibCheck`-hidden errors of your own',
      '`MIGRATION.md` contains at least 5 real catches with the symptom each would have caused',
    ],
    stretch: [
      'Replace the hand-written validators with a schema library (Zod or Valibot) and compare the ergonomics',
      'Generate the API types from the server with a tool instead of writing them twice',
      'Add `eslint` with `@typescript-eslint/no-floating-promises` and fix what it finds',
      'Add branded types for ids (`type TaskId = string & { __brand: \'TaskId\' }`) so you cannot pass a user id where a task id belongs',
      'Turn on `exactOptionalPropertyTypes` and document everything it catches',
    ],
  },
};
