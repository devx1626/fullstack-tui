#!/usr/bin/env node
/** Temporary probe: run one challenge's solution through the sandbox and dump everything. */
import { curriculum } from '../src/content/index.js';
import { runJs } from '../src/core/runner.js';
import { evaluate } from '../src/core/grade.js';

const wanted = process.argv[2];
let found = null;
for (const mod of curriculum) {
  for (const lesson of mod.lessons) {
    for (const ch of lesson.challenges) {
      if (`${lesson.id}.${ch.id}` === wanted) found = { mod, lesson, ch };
    }
  }
}

if (!found) {
  process.stdout.write(`no challenge matching ${wanted}\n`);
  process.exit(1);
}

const { ch } = found;
const jsChecks = ch.checks.filter((c) => c.kind === 'js');
process.stdout.write(`challenge ${wanted} (${ch.kind}, async=${!!ch.async}, checks=${ch.checks.length})\n`);
process.stdout.write(`kinds: ${[...new Set(ch.checks.map((c) => c.kind))].join(', ')}\n\n`);

const result = await runJs(ch.solution, {
  tests: jsChecks.map((c) => ({ label: c.label, expr: c.expr })),
  capture: [],
  timeout: ch.timeout || 2000,
  domHtml: ch.fixture ?? null,
  async: !!ch.async,
  mockFetch: ch.mockFetch || null,
  prelude: ch.prelude || '',
  sourceText: ch.solution,
});

process.stdout.write(JSON.stringify({
  ok: result.ok,
  error: result.error,
  results: result.results,
  logs: result.logs,
}, null, 1) + '\n');

if (jsChecks) {
  process.stdout.write(`\nfirst expression:\n${jsChecks[0]?.expr?.slice(0, 400)}\n`);
}

const assembled = await evaluate(ch, ch.solution);
process.stdout.write('\nassembled: ' + JSON.stringify({
  passed: assembled.passed,
  results: assembled.results.map((r) => [r.ok, r.label, r.message]),
}, null, 1) + '\n');
