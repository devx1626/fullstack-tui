/**
 * TS-strip engine tests (esbuild transformSync replaces node:module's
 * stripTypeScriptTypes, which needed Node 22.13+ — engines allows 20.9).
 * Run: node --test tests/unit/tsstrip.test.js
 *
 * Contract under test: annotations vanish within each statement and the code
 * stays semantically identical (esbuild collapses type-only declaration LINES,
 * so line numbers are not preserved verbatim — but syntax-error coordinates
 * are reported against the learner's ORIGINAL source, which is what the
 * editor shows). import/export statements are accepted by the engine (a
 * superset of the erasable-only builtin), though the vm.Script sandbox grades
 * script-style code — what the curriculum's challenges actually contain.
 * Syntax failures throw esbuild errors that compactTsError reduces to one
 * learner-facing line with the learner's own line/column coordinates.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { compactTsError, stripTypes, tsAvailable } from '../../src/core/tsstrip.js';

test('stripTypes removes annotations and keeps the code semantically identical', () => {
  const src = [
    'type Id = string | number;',
    '',
    'interface User {',
    '  id: Id;',
    '  name: string;',
    '}',
    '',
    'const n: number = 41;',
    'const u: User = { id: 1, name: "a" };',
  ].join('\n');
  const out = stripTypes(src);
  assert.ok(!out.includes('interface'), 'type-only declarations vanish');
  assert.ok(!out.includes(': number'), 'annotations vanish');
  // The run-time statements survive, in order, runnable — that is what the
  // sandbox needs; the engine may collapse the type-only lines above them.
  assert.ok(out.includes('const n = 41;'), 'value declarations survive');
  assert.ok(out.includes('{ id: 1, name: "a" }'), 'initialisers survive verbatim');
  assert.ok(out.indexOf('const n = 41;') < out.indexOf('{ id: 1, name: "a" }'), 'statement order holds');
});

test('stripTypes accepts import/export statements (superset of the erasable-only builtin)', () => {
  // `helper` must be used — unused imports are tree-shaken, by design.
  const src = 'import { helper } from "./helper.js";\nexport const answer: string = helper(42);\nexport function f(x: string): string { return x; }\n';
  const out = stripTypes(src);
  assert.ok(out.includes('./helper.js'), 'import statement survives as module syntax');
  assert.ok(out.includes('export'), 'export survives');
  assert.ok(!out.includes(': number') && !out.includes(': string'), 'annotations gone');
  // Note: the vm.Script sandbox grades script-style code (no ESM), which is
  // what the curriculum's TS challenges contain — this assertion pins that
  // the ENGINE is not the limit, unlike the erasable-only builtin it replaced.
});

test('stripTypes handles the enum/namespace superset the erasable-only builtin rejects', () => {
  const out = stripTypes('enum Color { Red = 1, Green }\nconst c: Color = Color.Green;\n');
  assert.ok(!out.includes('enum'), 'enum is lowered to plain JS, not rejected');
  assert.ok(out.includes('1') && out.includes('2'), 'enum members keep their values');
});

test('stripTypes throws on type-syntax failure, with the learner source coordinates', () => {
  assert.throws(() => stripTypes('const x: number = ;'), (err) => {
    const compact = compactTsError(err);
    return compact !== null
      && compact.startsWith('TypeScript syntax error (line 1, col ')
      && compact.includes('Unexpected');
  }, 'error compacts to one line with line/col from the learner source');
});

test('compactTsError: null for foreign errors, first diagnostic wins, no <stdin> noise', () => {
  assert.equal(compactTsError(null), null);
  assert.equal(compactTsError(undefined), null);
  assert.equal(compactTsError(new Error('plain JS failure')), null);
  const fake = Object.assign(new Error('Transform failed with 2 errors:\n<stdin>:3:8: ERROR: Unexpected ";"\n<stdin>:4:1: ERROR: Another thing'), {});
  const compact = compactTsError(fake);
  assert.ok(compact.includes('(line 3, col 8)'), 'first diagnostic coordinates win');
  assert.ok(!compact.includes('stdin'), 'meaningless input name is dropped');
  assert.ok(!compact.includes('Another'), 'only the first diagnostic is kept');
});

test('grade integration: ts:true challenge strips and grades, bad TS fails with the compact message', async () => {
  const { evaluate } = await import('../../src/core/grade.js');
  const challenge = {
    lang: 'ts',
    ts: true,
    checks: [{ label: 'answers 42', kind: 'js', expr: 'ANSWER === 42' }],
  };
  // Script-style typed code, exactly the shape the TS module's challenges use
  // (the vm.Script sandbox takes no import/export).
  const good = evaluate(challenge, { 'main.ts': 'const ANSWER: number = 42;' });
  assert.equal(good.results[0].ok, true, 'typed code grades after stripping');

  const bad = evaluate(challenge, { 'main.ts': 'const ANSWER: number = ;' });
  assert.equal(bad.results[0].ok, false);
  assert.match(String(bad.error), /^TypeScript syntax error \(line \d+, col \d+\): /, 'status bar gets the one-line form');
});

test('tsAvailable reflects the engine the lane actually uses', () => {
  // esbuild is a hard dependency — the lane is always available now, unlike
  // the Node 22.13+ builtin this module used to wrap.
  assert.equal(tsAvailable(), true);
});
