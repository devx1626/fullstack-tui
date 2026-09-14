#!/usr/bin/env node
/**
 * Self-check.
 *
 * 1. Syntax-checks every source file (so a typo never reaches the learner).
 * 2. Renders every view headlessly to catch crashes in the render path.
 * 3. Runs every reference solution through its own checks.
 * 4. Proves every debug challenge fails on its starter code.
 *
 * Usage: node tools/check.js [--fail-fast]
 *   --fail-fast  stop at the first problem instead of reporting all of them.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FAIL_FAST = process.argv.includes('--fail-fast');
let failures = 0;

const fail = (msg) => {
  failures += 1;
  process.stdout.write(`  FAIL ${msg}\n`);
  if (FAIL_FAST) {
    try {
      fs.rmSync(path.join(ROOT, '.data', 'check-tmp.json'), { force: true });
    } catch {
      /* nothing to clean up */
    }
    process.stdout.write(`\nStopping after the first problem (--fail-fast).\n`);
    process.exit(1);
  }
};

function listJs(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.data' || entry.name === '.workspace') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listJs(full, out);
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

process.stdout.write('1. syntax check\n');
const files = listJs(ROOT);
for (const file of files) {
  const res = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (res.status !== 0) fail(`${path.relative(ROOT, file)}: ${res.stderr.split('\n')[0]}`);
  else process.stdout.write(`   ok  ${path.relative(ROOT, file)}\n`);
}

process.stdout.write('\n2. curriculum integrity\n');
const { curriculum, totals } = await import('../src/content/index.js');
const seenLessons = new Set();
const seenChallenges = new Set();
const t = totals();
const VALID_KINDS = ['debug', 'write', 'synthesis'];

/** One malformed entry must produce a FAIL, never a crashed check run. */
const guard = (what, fn) => {
  try {
    fn();
  } catch (err) {
    fail(`${what} could not be validated: ${err.message}`);
  }
};

for (const mod of curriculum) {
  guard(`module ${mod.id || '?'}`, () => {
    if (!mod.id || !mod.title) fail('module missing id/title');
    if (!mod.lessons || !mod.lessons.length) fail(`module ${mod.id} has no lessons`);
    if (!mod.tagline) fail(`module ${mod.id} has no tagline`);
    if (!mod.badge) fail(`module ${mod.id} has no badge`);
    if (!mod.color) fail(`module ${mod.id} has no color`);
    if (!mod.hours) fail(`module ${mod.id} has no hours estimate`);
    if (!mod.why) fail(`module ${mod.id} has no "why" introduction`);
    if (!mod.source?.url || !mod.source?.roadmap) fail(`module ${mod.id} is missing source links`);
    if (!mod.source?.docs) fail(`module ${mod.id} is missing a docs link`);
  });

  for (const lesson of mod.lessons || []) {
    guard(`lesson ${lesson.id || '?'}`, () => {
      if (!lesson.id) fail(`lesson in module ${mod.id} has no id`);
      if (seenLessons.has(lesson.id)) fail(`duplicate lesson id ${lesson.id}`);
      seenLessons.add(lesson.id);
      if (!lesson.title) fail(`lesson ${lesson.id} has no title`);
      if (!lesson.minutes) fail(`lesson ${lesson.id} has no minutes estimate`);
      if (!lesson.sections?.length) fail(`lesson ${lesson.id} has no sections`);
      if (!lesson.objectives?.length) fail(`lesson ${lesson.id} has no objectives`);
      if (!lesson.challenges?.length) fail(`lesson ${lesson.id} has no challenges`);
      for (const [si, section] of (lesson.sections || []).entries()) {
        if (!section.heading) fail(`lesson ${lesson.id} section ${si + 1} has no heading`);
        if (!section.body) fail(`lesson ${lesson.id} section ${si + 1} has no body`);
        if (section.code && (!section.code.source || !section.code.lang)) {
          fail(`lesson ${lesson.id} section ${si + 1} has a code block missing source or lang`);
        }
      }
      for (const r of lesson.resources || []) {
        if (!r.label || !r.url) fail(`lesson ${lesson.id} has a resource missing a label or url`);
      }
    });

    for (const ch of lesson.challenges || []) {
      guard(`challenge ${lesson.id}.${ch?.id}`, () => {
        const id = `${lesson.id}.${ch.id}`;
        if (!ch.id) fail(`a challenge in lesson ${lesson.id} has no id`);
        if (seenChallenges.has(id)) fail(`duplicate challenge id ${id}`);
        seenChallenges.add(id);
        if (!VALID_KINDS.includes(ch.kind)) fail(`${id} has unknown kind "${ch.kind}" (expected ${VALID_KINDS.join(', ')})`);
        if (!ch.prompt) fail(`${id} has no prompt`);
        if (!ch.hints?.length) fail(`${id} has no hints`);
        if (!ch.checks?.length) fail(`${id} has no checks`);
        if (!ch.difficulty) fail(`${id} has no difficulty`);
        if (!ch.minutes) fail(`${id} has no minutes estimate`);
        if (!ch.lang && ch.kind !== 'synthesis') fail(`${id} has no lang`);
        if (!ch.solution) fail(`${id} has no reference solution`);
        if (ch.kind === 'debug' && !ch.starter) fail(`${id} is a debug challenge but has no starter code`);
        if (ch.kind === 'synthesis' && !ch.files) fail(`${id} is a synthesis challenge but declares no files`);
        for (const [ci, check] of (ch.checks || []).entries()) {
          if (!check.label) fail(`${id} check #${ci + 1} has no label`);
          if (typeof check.ok !== 'function' && check.kind === undefined && !check.expr && !check.re) {
            fail(`${id} check "${check.label}" has no test (ok/expr/re/kind)`);
          }
        }
      });
    }
  }

  if (mod.project) {
    guard(`project ${mod.project.id || '?'}`, () => {
      if (!mod.project.checks?.length) fail(`project ${mod.project.id} has no definition of done`);
      if (!mod.project.brief) fail(`project ${mod.project.id} has no brief`);
      if (!mod.project.title) fail(`project ${mod.project.id} has no title`);
      if (!mod.project.minutes) fail(`project ${mod.project.id} has no minutes estimate`);
    });
  }
}
process.stdout.write(`   ${t.modules} modules, ${t.lessons} lessons, ${t.challenges} challenges (${t.debug} debug / ${t.write} write)\n`);
process.stdout.write(`   unique ids: ${seenLessons.size} lessons, ${seenChallenges.size} challenges\n`);

process.stdout.write('\n3. headless render of every view\n');
const { pickTheme } = await import('../src/tui/ansi.js');
const { App } = await import('../src/app.js');
const { Store } = await import('../src/core/store.js');

const tmpStore = new Store(path.join(ROOT, '.data', 'check-tmp.json'));
const app = new App({ theme: pickTheme(), store: tmpStore });
app.w = 120;
app.h = 34;
app.screen.out = { write() {} };

const sizes = [[120, 34], [100, 30], [80, 24], [60, 20]];
try {
  for (const [w, h] of sizes) {
    app.w = w;
    app.h = h;
    app.goHome();
    app.push('stats');
    app.push('help');
    app.push('resources');
    app.push('workspace');
    app.push('projects');
    app.pop();
    app.openModule(0);
    app.openLesson(0, 0);
    app.openChallenge(0, 0, 0);
    app.revealHint();
    app.state.showSolution = true;
    app.render();
    app.state.showSolution = false;
    app.state.pane = 'brief';
    app.render();
    app.state.pane = 'code';
    app.render();
    app.state.pane = 'both';
    app.state.showLogs = true;
    app.render();
    const view = app.current.name;
    if (view !== 'challenge') fail(`expected to be on the challenge screen, got ${view}`);
    await app.checkChallenge();
    app.render();

    // IDE-like input: a suggestion list, then auto-pairing and auto-closed tags.
    app.state.pane = 'both';
    const ed = app.getActiveEditor();
    ed.lines = [''];
    ed.row = 0;
    ed.col = 0;
    for (const ch of '<div') app.onKey({ name: 'char', char: ch });
    if (!app.state.completion || !app.state.completion.items.length) fail(`no completion offered after typing "<div" at ${w}x${h}`);
    app.onKey({ name: 'tab' });
    if (ed.lines.join('\n') !== '<div></div>') fail(`accepting the tag suggestion produced ${JSON.stringify(ed.lines)}`);
    ed.lines = ['<p'];
    ed.row = 0;
    ed.col = 2;
    app.onKey({ name: 'char', char: '>' });
    if (ed.lines.join('\n') !== '<p></p>') fail(`typing ">" did not close the tag: ${JSON.stringify(ed.lines)}`);

    // The built-in browser + dev tools, on every pane.
    app.openBrowser();
    for (const tab of ['render', 'elements', 'styles', 'console', 'issues']) {
      app.state.browser.tab = tab;
      app.state.browser.scroll = 0;
      app.render();
    }

    // The dev-tools console evaluates expressions against the editor contents.
    const ced = app.getActiveEditor();
    ced.lines = [
      '<!doctype html>',
      '<html><body><ul><li>a</li><li>b</li></ul>',
      '<script>window.count = function () { return document.querySelectorAll("li").length; };</script>',
      '</body></html>',
    ];
    ced.row = 0;
    ced.col = 0;
    app.state.browser.tab = 'console';
    app.state.browser.output = [];
    app.state.browser.input = 'count()';
    await app.runConsole();
    const last = app.state.browser.output[app.state.browser.output.length - 1];
    if (!last || last.kind !== 'result' || last.text !== '2') {
      fail(`dev-tools console gave ${JSON.stringify(last)} instead of 2 at ${w}x${h}`);
    }
    app.pop();
    if (app.current.name !== 'challenge') fail(`the browser did not return to the challenge at ${w}x${h}`);
  }
  process.stdout.write('   every view rendered at 120x34, 100x30, 80x24 and 60x20\n');
} catch (err) {
  // A short, readable report: where it crashed and the error chain, without a
  // wall of internal frames.
  const frames = String(err.stack || '')
    .split('\n')
    .filter((l) => l.includes('src/') || l.includes('tools/check.js'))
    .slice(0, 4)
    .map((l) => l.replace(/^\s*at\s*/, ''))
    .join(' <- ');
  fail(`render crashed: ${err.message}${frames ? `\n        at ${frames}` : ''}`);
}

process.stdout.write('\n4. reference solutions + debug starters\n');
const { evaluate } = await import('../src/core/grade.js');
let checked = 0;
let checkCount = 0;
for (const mod of curriculum) {
  for (const lesson of mod.lessons) {
    for (const ch of lesson.challenges) {
      checked += 1;
      let res;
      try {
        res = await evaluate(ch, ch.solution);
      } catch (err) {
        fail(`${lesson.id}.${ch.id} grading threw on the reference solution: ${err.message}`);
        continue;
      }
      checkCount += res.results.length;
      if (!res.passed) {
        const bad = res.results.filter((r) => !r.ok);
        const detail = bad.map((b) => `${b.label}${b.message ? ` -> ${b.message}` : ''}`).join(' | ');
        fail(`${lesson.id}.${ch.id} reference solution fails ${bad.length} check(s): ${detail}`);
      }
      if (ch.kind === 'debug' && ch.starter) {
        let startRes;
        try {
          startRes = await evaluate(ch, ch.starter);
        } catch {
          fail(`${lesson.id}.${ch.id} grading threw on the starter code`);
          continue;
        }
        if (startRes.passed) fail(`${lesson.id}.${ch.id} starter already passes - not a real debug exercise`);
      }
    }
  }
}
process.stdout.write(`   ${checked} challenges, ${checkCount} checks executed\n`);

process.stdout.write('\n5. editor intelligence (completion + auto-pairing)\n');
const { completionsFor, smartInsert, autoCloseTag, pairBackspace } = await import('../src/core/complete.js');
const probe = (label, fn) => {
  try {
    const result = fn();
    if (result === true) process.stdout.write(`   ok  ${label}\n`);
    else fail(`${label}: ${result === undefined ? 'no result' : result}`);
  } catch (err) {
    fail(`${label} threw: ${err.message}`);
  }
};

probe('HTML tag suggestions follow "<"', () => {
  const res = completionsFor('html', '<', 1);
  return (res && res.items.some((i) => i.label === 'div')) || 'no <div> suggestion';
});
probe('a tag suggestion inserts its own closing tag', () => {
  const res = completionsFor('html', '<di', 3);
  const item = res && res.items.find((i) => i.label === 'div');
  return (item && item.insert === 'div></div>' && item.caret === 4) || `got ${JSON.stringify(item)}`;
});
probe('attribute suggestions appear inside a tag', () => {
  const res = completionsFor('html', '<a href="#" ', 12);
  return (res && res.items.some((i) => i.label === 'target')) || 'no attribute suggestions';
});
probe('attribute values are suggested inside quotes', () => {
  const res = completionsFor('html', '<input type="e', 14);
  return (res && res.items.some((i) => i.label === 'email')) || 'no value suggestions';
});
probe('CSS properties and values complete', () => {
  const props = completionsFor('css', '.a {\n  disp', 11);
  const values = completionsFor('css', '.a {\n  display: bl', 17);
  return (props && props.items.some((i) => i.label === 'display') && values && values.items.some((i) => i.label === 'block')) || 'missing CSS completion';
});
probe('JS keywords, snippets and document words complete', () => {
  const kw = completionsFor('js', 'awa', 3);
  const snip = completionsFor('js', 'foro', 4);
  const text = 'const customerName = 1;\ncUSt';
  const word = completionsFor('js', text, text.length);
  return (
    (kw && kw.items.some((i) => i.label === 'await') && snip && snip.items.some((i) => i.label === 'forof') && word && word.items.some((i) => i.label === 'customerName')) ||
    'missing JS completion'
  );
});
probe('SQL keywords complete', () => {
  const res = completionsFor('sql', 'SELE', 4);
  return (res && res.items.some((i) => i.label === 'SELECT')) || 'no SQL completion';
});
probe('shell subcommands complete inside the line', () => {
  const res = completionsFor('sh', 'git ch', 6);
  return (res && res.from === 4 && res.items.some((i) => i.label === 'checkout')) || 'no shell subcommand completion';
});
probe('shell flags complete for the command in play', () => {
  const commit = completionsFor('sh', 'git commit --a', 14);
  const docker = completionsFor('sh', 'docker run -', 12);
  return (
    (commit && commit.items.some((i) => i.label === '--amend') && docker && docker.items.some((i) => i.label === '--name')) ||
    'no shell flag completion'
  );
});
probe('typing ">" auto-closes a tag', () => {
  const res = autoCloseTag('<section>', 9);
  return (res && res.text === '<section></section>') || `got ${JSON.stringify(res)}`;
});
probe('void elements are not auto-closed', () => autoCloseTag('<img>', 5) === null || 'a void tag was closed');
probe('an already-closed tag is left alone', () => autoCloseTag('<div></div>', 5) === null || 'duplicate closing tag added');
probe('brackets and quotes auto-pair', () => {
  const bracket = smartInsert('f(', 2, '(', 'js');
  const quote = smartInsert('const s = ', 10, '"', 'js');
  return (bracket && bracket.text === 'f(()' && quote && quote.text === 'const s = ""') || 'pairing failed';
});
probe('a closing character steps over the one already there', () => {
  const res = smartInsert('()', 1, ')', 'js');
  return (res && res.offset === 2 && res.text === '()') || `got ${JSON.stringify(res)}`;
});
probe('backspace removes both halves of an empty pair', () => {
  const res = pairBackspace('()', 1);
  return (res && res.text === '') || `got ${JSON.stringify(res)}`;
});

fs.rmSync(path.join(ROOT, '.data', 'check-tmp.json'), { force: true });

// 5. Command registry / keymap lint (overhaul task 0.7a; spec E2/S3).
process.stdout.write('\n5. command registry & keymap\n');
try {
  const { lintKeymap, COMMANDS, resolveKey } = await import('../src/ui/commands.js');
  const problems = lintKeymap();
  for (const p of problems) fail(p);
  if (!problems.length) process.stdout.write(`   ok  ${COMMANDS.length} commands registered, no conflicts\n`);

  // Footer/help keys must resolve to real bindings on their screens (E2/S3).
  const spotChecks = [
    ['home', { name: 'char', char: 's' }, 'home.openSettings'], // E2 regression
    ['challenge', { name: 'ctrl-s' }, 'challenge.check'],
    ['challenge', { name: 'ctrl-w' }, 'editor.tabNext'],
    ['browser', { name: 'char', char: '4' }, 'browser.jumpTab4'],
  ];
  for (const [screen, key, want] of spotChecks) {
    const got = resolveKey(key, screen);
    if (got !== want) fail(`key ${JSON.stringify(key)} on ${screen} resolved to ${got}, expected ${want}`);
    else process.stdout.write(`   ok  ${screen}: ${key.char || key.name} → ${got}\n`);
  }
} catch (err) {
  fail(`registry: ${err && err.message ? err.message : err}`);
}

process.stdout.write('\n');
if (failures) {
  process.stdout.write(`${failures} problem(s) found.\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('All checks passed.\n');
}

// The App and the terminal keep handles open by design; a self-check has to
// end deterministically rather than waiting for the event loop to drain.
process.exit(failures ? 1 : 0);
