#!/usr/bin/env node
/**
 * Content QA probe (P0-4, rubric half).
 *
 * The scripted half of the module-by-module QA pass. Reads every challenge in
 * the curriculum and reports what a reviewer needs in hand before reading the
 * prose:
 *
 *   1. Vacuous checks — every check is run against the challenge's STARTER
 *      code. A check that already passes before the learner does anything
 *      tests nothing; a challenge where ALL checks pass on the starter asks
 *      nothing at all. (Some starter-passing checks are legitimate guard
 *      rails — T.notSrc "don't reintroduce var" style, or a structural dom
 *      check beside the real behavioral one — so per-check hits are signals
 *      for the human pass, and only the all-pass case is called out hard.)
 *   2. Hint ladder — fewer than three hints, empty hints, or duplicate hint
 *      strings inside one challenge (the rubric's Concept → Strategy → Code
 *      ladder collapses when two rungs say the same thing).
 *   3. Requirements — missing or empty requirements[] on a write challenge.
 *   4. Metadata — difficulty vocabulary, implausible minutes, missing
 *      prompt/solution, and a starter identical to the solution
 *      (nothing to do, or a copy-paste slip).
 *   5. Difficulty jumps — adjacent challenges (in lesson order) that step
 *      easy→hard with no medium between, the spike the rubric smooths.
 *   6. Sync-scored async checks — T.js checks whose expressions await or
 *      return promises but the challenge lacks `async: true`. Without the
 *      flag the runner never awaits the expression, the promise object is
 *      truthy, and every check auto-passes on ANY code (the ops-04 bug,
 *      found the hard way — see loose-ends-spec P0-4).
 *
 * Local authoring scratch, like tools/audit.mjs: stdout only, nothing
 * committed to the gate. Runtime is bounded (15 s per probe, like audit).
 *
 * Usage: node tools/qa-audit.mjs [--json]
 */

import { curriculum } from '../src/content/index.js';
import { evaluate } from '../src/core/grade.js';

const asJson = process.argv.includes('--json');

/** A challenge that never settles is a bug in the challenge, not a slow machine. */
function withTimeout(promise, ms, message) {
  let timer = null;
  const guard = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer));
}

const DIFFICULTY = new Set(['easy', 'medium', 'hard']);
const RANK = { easy: 0, medium: 1, hard: 2 };
const ASYNCISH = /await |\(async function|async \(\) =>/;

function lintChallenge(ch) {
  const issues = [];
  const hints = ch.hints || [];
  if (hints.length < 3) issues.push(`hints: only ${hints.length} (ladder wants 3)`);
  if (hints.some((h) => !String(h || '').trim())) issues.push('hints: an empty rung');
  const seen = new Set();
  for (const h of hints) {
    const key = String(h || '').trim().toLowerCase();
    if (seen.has(key)) issues.push(`hints: duplicate rung "${String(h).slice(0, 48)}..."`);
    seen.add(key);
  }
  if (ch.kind === 'write' && !(ch.requirements || []).length) {
    issues.push('requirements: empty on a write challenge');
  }
  if (!String(ch.prompt || '').trim()) issues.push('prompt: missing');
  if (!String(ch.solution ?? '').trim()) issues.push('solution: missing');
  if (
    String(ch.starter ?? '') === String(ch.solution ?? '') &&
    String(ch.solution ?? '').trim()
  ) {
    issues.push('starter: identical to solution');
  }
  if (!DIFFICULTY.has(ch.difficulty)) issues.push(`difficulty: "${ch.difficulty}" is out of vocabulary`);
  if (!(ch.minutes >= 1 && ch.minutes <= 90)) issues.push(`minutes: ${ch.minutes} is implausible`);
  if (!(ch.checks || []).length) issues.push('checks: none — verify passes vacuously');
  const asyncishJs = (ch.checks || []).some((c) => c.kind === 'js' && ASYNCISH.test(c.expr || ''));
  if (asyncishJs && !ch.async) {
    issues.push('async: checks await/return promises but async:true is missing — promise objects are truthy, so every check auto-passes on ANY code');
  }
  return issues;
}

const perModule = [];
let nChallenges = 0;

for (const mod of curriculum) {
  const modReport = { id: mod.id, challenges: [], vacuousAll: 0, checksTotal: 0, checksStarterPass: 0 };
  let prev = null; // previous challenge in curriculum order, for the jump scan

  for (const lesson of mod.lessons) {
    // Lesson-level metadata: a lesson that promises 90 minutes of work in a
    // 30-minute module is a planning bug the prose pass should catch.
    for (const ch of lesson.challenges) {
      nChallenges += 1;
      const gid = `${lesson.id}.${ch.id}`;
      const record = { id: gid, findings: lintChallenge(ch), starterPass: [], jump: null };

      // Difficulty jump: a direct easy→hard step between adjacent challenges.
      if (prev && RANK[prev.difficulty] !== undefined && RANK[ch.difficulty] !== undefined) {
        if (RANK[ch.difficulty] - RANK[prev.difficulty] === 2) {
          record.jump = `${prev.id} (${prev.difficulty}) -> ${gid} (${ch.difficulty}) spikes with no medium between`;
        }
      }
      prev = { id: gid, difficulty: ch.difficulty };

      // Vacuous-check probe: run the checks against the starter.
      const nChecks = (ch.checks || []).length;
      modReport.checksTotal += nChecks;
      if (nChecks && String(ch.starter ?? '').trim()) {
        try {
          const result = await withTimeout(
            evaluate(ch, ch.starter),
            15000,
            `${gid} starter probe never settled`,
          );
          const passedLabels = (result.results || []).filter((r) => r.ok).map((r) => r.label);
          record.starterPass = passedLabels;
          modReport.checksStarterPass += passedLabels.length;
          if (passedLabels.length === nChecks) {
            record.findings.push(`VACUOUS: all ${nChecks} checks already pass on the starter`);
            modReport.vacuousAll += 1;
          }
        } catch (err) {
          record.findings.push(`starter probe failed to run: ${err.message}`);
        }
      }

      modReport.challenges.push(record);
    }
  }
  perModule.push(modReport);
}

if (asJson) {
  process.stdout.write(JSON.stringify(perModule, null, 1));
} else {
  process.stdout.write(`QA probe: ${nChallenges} challenges across ${perModule.length} modules\n`);
  process.stdout.write(
    `checks probed on starters: ${perModule.reduce((a, m) => a + m.checksTotal, 0)}, ` +
      `passing pre-work: ${perModule.reduce((a, m) => a + m.checksStarterPass, 0)}\n\n`,
  );
  for (const mod of perModule) {
    const flagged = mod.challenges.filter(
      (c) => c.findings.length || c.starterPass.length || c.jump,
    );
    process.stdout.write(`== ${mod.id} — ${mod.challenges.length} challenges`);
    if (mod.vacuousAll) process.stdout.write(` — ${mod.vacuousAll} FULLY VACUOUS`);
    process.stdout.write('\n');
    if (!flagged.length) {
      process.stdout.write('   clean\n');
      continue;
    }
    for (const c of flagged) {
      for (const f of c.findings) process.stdout.write(`   ${c.id}: ${f}\n`);
      for (const j of [c.jump].filter(Boolean)) process.stdout.write(`   ${c.id}: ${j}\n`);
      if (c.starterPass.length && !c.findings.some((f) => f.startsWith('VACUOUS'))) {
        process.stdout.write(
          `   ${c.id}: ${c.starterPass.length}/${mod.checksTotal >= 0 ? '' : ''}checks pass on starter (guard rails?): ${c.starterPass.map((s) => `"${s.slice(0, 56)}"`).join(', ')}\n`,
        );
      }
    }
  }
}
