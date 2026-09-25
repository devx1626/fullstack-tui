#!/usr/bin/env node
/**
 * The entry point. `node bin/fullstack.js` (or `npm start`) launches the Ink
 * TUI from the built bundle dist/main.js; the flags below are the plain-text
 * side doors, run straight from source so they work without a build.
 *
 *   node bin/fullstack.js              launch the TUI (needs `npm run build`)
 *   node bin/fullstack.js --list       print the curriculum as plain text
 *   node bin/fullstack.js --verify     run every reference solution through its own checks
 *   node bin/fullstack.js --reset      delete saved progress and start over
 */

import fs from 'node:fs';
import { existsSync } from 'node:fs';
import { Store, PROGRESS_FILE, ROOT } from '../src/core/store.js';
import { curriculum, totals } from '../src/content/index.js';
import { evaluate } from '../src/core/grade.js';

const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

function printCurriculum() {
  const t = totals();
  const line = (s = '') => process.stdout.write(s + '\n');
  line(`${BOLD}fullstack-tui${RESET} - ${t.modules} modules, ${t.lessons} lessons, ${t.challenges} challenges (${t.debug} debug / ${t.write} write)`);
  line(`~${t.hours} hours of source material re-sequenced into hands-on practice.`);
  line();
  curriculum.forEach((mod, mi) => {
    line(`[${mod.badge}] ${mi + 1}. ${mod.title} - ${mod.tagline}`);
    line(`     course: ${mod.source.course}`);
    line(`     ${mod.source.url}`);
    line(`     roadmap: ${mod.source.roadmap}`);
    mod.lessons.forEach((lesson, li) => {
      line(`   ${String(li + 1).padStart(2, '0')}. ${lesson.title} (${lesson.minutes}m, ${(lesson.challenges || []).length} challenges)`);
      (lesson.challenges || []).forEach((c) => {
        line(`        - [${c.kind}] ${c.id} (${c.difficulty}, ${c.lang})`);
      });
    });
    if (mod.project) line(`   ★ CAPSTONE: ${mod.project.title} (${mod.project.minutes}m)`);
    line();
  });
}

async function verify() {
  let challenges = 0;
  let failed = 0;
  let checks = 0;
  const problems = [];

  for (const mod of curriculum) {
    for (const lesson of mod.lessons) {
      for (const ch of lesson.challenges) {
        challenges += 1;
        if (!ch.checks || !ch.checks.length) {
          failed += 1;
          problems.push(`${lesson.id}.${ch.id}: no checks defined`);
          continue;
        }
        if (!ch.solution) {
          failed += 1;
          problems.push(`${lesson.id}.${ch.id}: no reference solution`);
          continue;
        }
        if (!ch.starter && ch.kind === 'debug') {
          problems.push(`${lesson.id}.${ch.id}: debug challenge has no starter code (warning)`);
        }
        const result = await evaluate(ch, ch.solution);
        checks += result.results.length;
        if (!result.passed) {
          failed += 1;
          const bad = result.results.filter((r) => !r.ok);
          problems.push(
            `${lesson.id}.${ch.id}: ${bad.length} check(s) fail on the reference solution\n` +
              bad.map((b) => `      - ${b.label}${b.message ? ` -> ${b.message}` : ''}`).join('\n'),
          );
        }
        // A debug challenge should also FAIL on its starter, otherwise it is not a bug hunt.
        if (ch.kind === 'debug' && ch.starter) {
          const starterResult = await evaluate(ch, ch.starter);
          if (starterResult.passed) {
            problems.push(`${lesson.id}.${ch.id}: the buggy starter already passes every check (not a real debug exercise)`);
          }
        }
      }
    }
  }

  const line = (s = '') => process.stdout.write(s + '\n');
  problems.forEach((p) => line(`  ! ${p}`));
  line();
  line(`${challenges} challenges, ${checks} individual checks`);
  line(failed === 0 ? 'All reference solutions pass.' : `${failed} challenge(s) need attention.`);
  return failed === 0;
}

function resetProgress() {
  try {
    fs.rmSync(PROGRESS_FILE, { force: true });
    process.stdout.write(`Removed ${PROGRESS_FILE}\n`);
  } catch (err) {
    process.stdout.write(`Could not reset: ${err.message}\n`);
  }
  const ws = `${ROOT}/.workspace`;
  if (process.argv.includes('--all')) {
    fs.rmSync(ws, { recursive: true, force: true });
    process.stdout.write(`Removed ${ws}\n`);
  } else {
    process.stdout.write(`Workspace left alone at ${ws} (use --reset --all to wipe it too)\n`);
  }
}

function printHelp() {
  process.stdout.write(
    [
      'fullstack-tui - an interactive fullstack curriculum in your terminal',
      '',
      '  (no flags)   launch the TUI',
      '  --list       print every module, lesson and challenge',
      '  --verify     run each reference solution through its own checks',
      '  --reset      delete saved progress (add --all to wipe the workspace too)',
      '  --help       this message',
      '',
      'Environment:',
      '  FULLSTACK_THEME=paper        force a palette (auto-detected otherwise)',
      '  FULLSTACK_ICONS=ascii        force an icon set (nerd/unicode/ascii)',
      '  FULLSTACK_SCREENSHOT=playwright   opt in to browser Render-tab screenshots',
      '  EDITOR / VISUAL              editor opened by Ctrl+E inside a challenge',
      '',
    ].join('\n') + '\n',
  );
}

const argv = process.argv.slice(2);
const FLAGGED = ['--list', '--verify', '--reset', '--help', '-h'].some((f) => argv.includes(f));

if (argv.includes('--help') || argv.includes('-h')) {
  printHelp();
} else if (argv.includes('--list')) {
  printCurriculum();
} else if (argv.includes('--verify')) {
  verify().then((ok) => {
    process.exitCode = ok ? 0 : 1;
  });
} else if (argv.includes('--reset')) {
  resetProgress();
} else {
  const dist = new URL('../dist/main.js', import.meta.url);
  if (!existsSync(dist)) {
    process.stdout.write('fullstack-tui needs a build first. Run: npm run build\n');
    process.exit(1);
  }
  const { main: nextMain } = await import(dist.href);
  await nextMain();
}
