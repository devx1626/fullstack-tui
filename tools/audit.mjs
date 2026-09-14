#!/usr/bin/env node
/**
 * Content audit.
 *
 * Runs every reference solution through its own checks and writes a report, so
 * a broken check is caught before a learner ever sees it. `npm run check` does
 * the same thing as part of the self-check; this script exists to give a
 * per-challenge breakdown with timings and failure messages while authoring.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { curriculum } from '../src/content/index.js';
import { evaluate } from '../src/core/grade.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = path.join(ROOT, 'tools', 'audit-report.json');

const out = [];
let n = 0;
let failing = 0;

/** A challenge that never settles is a bug in the challenge, not a slow machine. */
function withTimeout(promise, ms, message) {
  let timer = null;
  const guard = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer));
}

for (const mod of curriculum) {
  for (const lesson of mod.lessons) {
    for (const challenge of lesson.challenges) {
      n += 1;
      const started = Date.now();
      const record = { n, module: mod.id, id: `${lesson.id}.${challenge.id}`, kind: challenge.kind };
      try {
        const result = await withTimeout(evaluate(challenge, challenge.solution), 15000, `${lesson.id}.${challenge.id} never settled`);
        record.passed = result.passed;
        record.ms = Date.now() - started;
        record.error = result.error || null;
        record.failures = (result.results || [])
          .filter((r) => !r.ok)
          .map((r) => `${r.label} :: ${r.message || ''}`);
      } catch (err) {
        record.threw = err.message;
        record.ms = Date.now() - started;
      }
      if (record.passed === false || record.threw) failing += 1;
      out.push(record);
      fs.writeFileSync(REPORT, JSON.stringify(out, null, 1));
    }
  }
}

const slow = out.filter((r) => r.ms > 400).sort((a, b) => b.ms - a.ms);
process.stdout.write(`${n} challenges, ${failing} failing\n`);
for (const record of out) {
  if (record.passed === false || record.threw) {
    process.stdout.write(`FAIL ${record.id}${record.threw ? ' threw: ' + record.threw : ''}\n`);
    for (const failure of record.failures || []) process.stdout.write(`       - ${failure}\n`);
  }
}
if (slow.length) {
  process.stdout.write(`\nslowest: ${slow.slice(0, 8).map((r) => r.id + ' ' + r.ms + 'ms').join(', ')}\n`);
}
process.stdout.write(`report written to ${path.relative(ROOT, REPORT)}\n`);
