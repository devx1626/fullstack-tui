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

/** Q13 helper: pass one challenge so the recap has something to report. */
async function q8EdPass(app, entry, ed) {
  ed.lines = String(entry.challenge.solution || '').split('\n');
  ed.row = 0;
  ed.col = 0;
  await app.checkChallenge();
}

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

    // Emmet: a compound abbreviation expands on Tab (and keeps its base indent
    // once the user is off column 0). This challenge's tab is markup already.
    ed.lines = ['  div.card*2'];
    ed.row = 0;
    ed.col = 13;
    app.onKey({ name: 'tab' });
    const emmetOut = ed.lines.join('\n');
    if (emmetOut !== '  <div class="card"></div>\n  <div class="card"></div>') fail(`emmet Tab expansion produced ${JSON.stringify(emmetOut)}`);
    // Plain Tab on a bare tag word stays an indent.
    ed.lines = [''];
    ed.row = 0;
    ed.col = 0;
    app.onKey({ name: 'tab' });
    if (ed.lines.join('\n') !== '  ') fail(`plain Tab on an empty line produced ${JSON.stringify(ed.lines)}`);
    // Prose never expands.
    ed.lines = ['hello world'];
    ed.row = 0;
    ed.col = 11;
    app.onKey({ name: 'tab' });
    if (ed.lines.join('\n') !== 'hello world  ') fail(`Tab inside prose produced ${JSON.stringify(ed.lines)}`);

    // CSS-language tests: rename the editor tab to a .css file so
    // activeLang() resolves to css, then restore it.
    delete app.state.editors.html;
    app.state.editors['styles.css'] = ed;
    // Emmet CSS shorthand: `m10` + `;` completes to a full declaration.
    ed.lines = [''];
    ed.row = 0;
    ed.col = 0;
    for (const ch of 'm10') app.onKey({ name: 'char', char: ch });
    app.onKey({ name: 'char', char: ';' });
    if (ed.lines.join('\n') !== 'margin: 10px;') fail(`css shorthand completion produced ${JSON.stringify(ed.lines)}`);
    // ...but `color: red` + `;` (a finished declaration) is left alone.
    ed.lines = ['color: red'];
    ed.row = 0;
    ed.col = 10;
    app.onKey({ name: 'char', char: ';' });
    if (ed.lines.join('\n') !== 'color: red;') fail(`css shorthand fired mid-declaration: ${JSON.stringify(ed.lines)}`);

    // Prettier-style formatter (Ctrl+F): normalises a mangled stylesheet and
    // keeps the caret on the formatted text.
    ed.lines = ['body{color:red;margin:0}', 'h1{ font-size:2rem }'];
    ed.row = 0;
    ed.col = 0;
    app.onKey({ name: 'ctrl-f' });
    const fmtOut = ed.lines.join('\n');
    if (!fmtOut.includes('body {') || !fmtOut.includes('  color: red;') || !fmtOut.includes('  margin: 0;')) fail(`Ctrl+F format produced ${JSON.stringify(fmtOut)}`);
    if (!fmtOut.includes('h1 {') || !fmtOut.includes('  font-size: 2rem;')) fail(`Ctrl+F format dropped h1: ${JSON.stringify(fmtOut)}`);
    // Formatting again is a no-op (idempotence).
    app.onKey({ name: 'ctrl-f' });
    if (ed.lines.join('\n') !== fmtOut) fail(`Ctrl+F is not idempotent: ${JSON.stringify(ed.lines.join('\n'))}`);
    // The formatter refuses to mangle broken code.
    ed.lines = ['body { color: '];
    ed.row = 0;
    ed.col = 0;
    app.onKey({ name: 'ctrl-f' });
    if (ed.lines.join('\n') !== 'body { color: ') fail(`Ctrl+F mangled broken css: ${JSON.stringify(ed.lines)}`);
    if (!/format safely/.test(app.state.notice?.text || '')) fail(`no format-abort notice: ${JSON.stringify(app.state.notice)}`);
    delete app.state.editors['styles.css'];
    app.state.editors.html = ed;

    // Soft-wrap (Q11): with editor.wrap on, down/up move by SCREEN rows —
    // from a wrapped line's start, down lands on its continuation segment.
    // render() republishes state.editorPaneWidth from the live layout, and this
    // block runs per terminal size, so pin the wrap width before every
    // keypress: the replay must never depend on the size this iteration uses.
    const wrapKey = (name) => {
      app.state.editorPaneWidth = 26; // → wrap column 20
      app.onKey({ name });
    };
    app.settings.data.editor.wrap = true;
    ed.lines = ['aaaa bbbb cccc dddd eeee ffff', 'second'];
    ed.row = 0;
    ed.col = 0;
    ed.goalCol = null;
    app.state.wrapDoc = null;
    wrapKey('down');
    if (ed.row !== 0 || ed.col !== 20) fail(`soft-wrap down did not land on the continuation segment: row=${ed.row} col=${ed.col}`);
    // The goal column is SCREEN-column relative (segment offset), so crossing
    // into the next logical line from a continuation's start lands on col 0.
    wrapKey('down');
    if (ed.row !== 1 || ed.col !== 0) fail(`soft-wrap down did not reach the next line: row=${ed.row} col=${ed.col}`);
    wrapKey('up');
    if (ed.row !== 0 || ed.col !== 20) fail(`soft-wrap up did not restore the goal column: row=${ed.row} col=${ed.col}`);
    if (ed.goalCol !== 0) fail(`soft-wrap lost the goal column: ${ed.goalCol}`);
    // Rendering with wrap on must not crash and must publish a screen-line model
    // with MORE screen rows than logical lines.
    ed.lines = ['word '.repeat(60).trim(), 'tail'];
    ed.row = 0;
    ed.col = 0;
    app.state.pane = 'code';
    app.render();
    if (!app.state.wrapDoc) fail('wrap render did not publish the screen-line model');
    else if (app.state.wrapDoc.totalRows <= ed.lines.length) {
      fail(`wrap render produced ${app.state.wrapDoc.totalRows} rows for ${ed.lines.length} logical lines`);
    }
    app.settings.data.editor.wrap = false;
    app.state.wrapDoc = null;
    // Classic semantics restored: down from (0,20) clamps to line 2's length.
    ed.lines = ['aaaa bbbb cccc dddd eeee ffff', 'second'];
    ed.row = 0;
    ed.col = 20;
    app.onKey({ name: 'down' });
    if (ed.row !== 1 || ed.col !== 6) fail(`classic down after wrap-off produced row=${ed.row} col=${ed.col}`);

    // Q4 caret jump: a failing check annotated with a line number; Ctrl+J
    // moves the caret there and surfaces the editor.
    app.state.pane = 'brief';
    app.state.results = { results: [{ label: 'shape', ok: false, message: 'boom', line: 3 }], logs: [] };
    ed.lines = ['one', 'two', 'three', 'four'];
    ed.row = 0;
    ed.col = 0;
    app.onKey({ name: 'ctrl-j' });
    if (ed.row !== 2 || ed.col !== 0) fail(`Ctrl+J did not jump to line 3: row=${ed.row} col=${ed.col}`);
    if (app.state.pane === 'brief') fail('Ctrl+J left the editor hidden behind the brief pane');
    // Without an annotated line it is a graceful no-op.
    app.state.results = { results: [{ label: 'shape', ok: false, message: 'boom' }], logs: [] };
    app.onKey({ name: 'ctrl-j' });
    if (!/No failing check/.test(app.state.notice?.text || '')) fail(`no no-jump notice: ${JSON.stringify(app.state.notice)}`);
    app.state.results = null;

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
// 6. QoL contract: replay-driven feature assertions (errors-and-qol-spec §6).
process.stdout.write('\n6. QoL contract (feature replays)\n');
try {
  const { emptyEditor, editorText } = await import('../src/views/editor.js');

  // Replay Q8 (autosave): typing stops → saveDraft lands the buffer in
  // lastCode without bumping attempts, and progress.json stays loadable.
  const q8store = new Store(path.join(ROOT, '.data', 'check-qol.json'));
  const q8id = 'qol.replay.autosave';
  const draftEd = emptyEditor('const x = 1;');
  q8store.saveDraft(q8id, editorText(draftEd));
  const q8rec = q8store.challengeRecord(q8id);
  if (q8rec.lastCode !== 'const x = 1;') fail(`Q8 autosave: lastCode got ${JSON.stringify(q8rec.lastCode)}`);
  else if (q8rec.attempts !== 0) fail(`Q8 autosave: attempts bumped to ${q8rec.attempts}`);
  else process.stdout.write('   ok  Q8 saveDraft persists lastCode without an attempt\n');

  // Replay Q1 (resume): seed a challenge record → resumeTarget finds it.
  const q1store = new Store(path.join(ROOT, '.data', 'check-qol.json'));
  const q1mod = curriculum[0];
  const q1lesson = q1mod.lessons[0];
  const q1ch = q1lesson.challenges[0];
  q1store.recordAttempt(`${q1lesson.id}.${q1ch.id}`, 'code', false);
  const target = q1store.data.challenges[`${q1lesson.id}.${q1ch.id}`];
  if (!target || target.passed !== false) fail('Q1 resume: seeded record missing');
  else {
    // The resume row must point at the first unpassed challenge of module 0.
    const resumeApp = new App({ theme: pickTheme(), store: q1store });
    resumeApp.w = 100;
    resumeApp.h = 30;
    resumeApp.screen.out = { write() {} };
    const found = resumeApp.resumeTarget();
    if (!found || found.lessonId !== q1lesson.id) fail(`Q1 resume: resumeTarget got ${JSON.stringify(found)}`);
    else process.stdout.write(`   ok  Q1 resumeTarget lands on ${found.lessonId}\n`);
  }

  // Data-compat guard: the exercised store must round-trip the classic shape.
  const round = new Store(path.join(ROOT, '.data', 'check-qol.json'));
  const probe = round.data.challenges[`${q1lesson.id}.${q1ch.id}`];
  if (!probe || typeof probe.attempts !== 'number' || typeof probe.lastCode !== 'string') {
    fail('QoL data-compat: record shape drifted');
  } else if (round.data.version !== 1) {
    fail(`QoL data-compat: version is ${round.data.version}, expected 1`);
  } else {
    process.stdout.write('   ok  progress store round-trips (version 1, classic shape)\n');
  }

  // Replay Q6 (at-risk banner): visible at streak ≥2 with no dismissal, hidden
  // after dismiss, re-shows on a later day.
  const { Settings, today: settingsToday } = await import('../src/ui/settings.js');
  const q6 = new Settings(path.join(ROOT, '.data', 'check-qol-settings.json'));
  const sAtRisk = { current: 3, best: 5 };
  if (!q6.bannerVisible(sAtRisk)) fail('Q6: banner should show at streak 3 with no dismissal');
  else {
    q6.dismissBanner();
    if (q6.bannerVisible(sAtRisk)) fail('Q6: banner should hide after dismissal today');
    else {
      q6.data.bannerDismissedOn = '2000-01-01'; // simulate tomorrow
      if (!q6.bannerVisible(sAtRisk)) fail('Q6: banner should re-show on a later day');
      else process.stdout.write('   ok  Q6 banner shows, dismisses per-day, re-shows later\n');
    }
  }

  // Replay Q5 (milestones): fired once, never twice; module thresholds fire.
  const q5 = new Settings(path.join(ROOT, '.data', 'check-qol-settings.json'));
  const fakeStats = {
    streak: { current: 7, best: 7 },
    perModule: [{ id: 'm1', percent: 50 }],
  };
  const first = q5.takeMilestones(fakeStats);
  const again = q5.takeMilestones(fakeStats);
  if (!(first.includes('streak-7') && first.includes('best-7') && first.includes('module-m1-25') && first.includes('module-m1-50'))) {
    fail(`Q5: first take missing expected ids: ${JSON.stringify(first)}`);
  } else if (again.length !== 0) {
    fail(`Q5: milestones re-fired: ${JSON.stringify(again)}`);
  } else {
    process.stdout.write('   ok  Q5 milestones fire once (streak/best/module) and stay seen\n');
  }

  // Q14 goal math + Q2 recents while we have a Settings instance.
  const q14store = new Store(path.join(ROOT, '.data', 'check-qol.json'));
  const q14 = q5.goalProgress(q14store);
  if (!q14 || q14.goal !== 3) fail(`Q14: goal default should be 3, got ${JSON.stringify(q14)}`);
  else process.stdout.write('   ok  Q14 goal defaults to 3/day with progress math\n');
  q5.pushRecent('a.b.c');
  q5.pushRecent('d.e.f');
  q5.pushRecent('a.b.c');
  const rec = q5.data.palette.recent;
  if (rec[0] !== 'a.b.c' || rec.length !== 2) fail(`Q2 recents MRU broken: ${JSON.stringify(rec)}`);
  else process.stdout.write('   ok  Q2 palette recents keep MRU order (max 5)\n');

  // Replay Q3 (list endpoints): `g`/`G` jump to the first/last row of the
  // home and module lists (registry ids nav.first/nav.last).
  {
    const navStore = new Store(path.join(ROOT, '.data', 'check-qol.json'));
    const navApp = new App({ theme: pickTheme(), store: navStore });
    navApp.w = 120;
    navApp.h = 34;
    navApp.screen.out = { write() {} };
    navApp.goHome();
    navApp.state.cursor = 1;
    navApp.onKey({ name: 'char', char: 'g' });
    if (navApp.state.cursor !== 0) fail(`Q3: g on home left the cursor at ${navApp.state.cursor}`);
    else {
      navApp.onKey({ name: 'char', char: 'G' });
      if (navApp.state.cursor !== navApp.curriculum.length - 1) {
        fail(`Q3: G on home went to ${navApp.state.cursor}, expected ${navApp.curriculum.length - 1}`);
      } else {
        navApp.openModule(0);
        const rows = navApp.curriculum[0].lessons.length + (navApp.curriculum[0].project ? 1 : 0);
        navApp.state.cursor = 1;
        navApp.onKey({ name: 'char', char: 'G' });
        if (navApp.state.cursor !== rows - 1) fail(`Q3: G on module went to ${navApp.state.cursor}, expected ${rows - 1}`);
        else {
          navApp.onKey({ name: 'char', char: 'g' });
          if (navApp.state.cursor !== 0) fail(`Q3: g on module left the cursor at ${navApp.state.cursor}`);
          else process.stdout.write('   ok  Q3 g/G jump to the first/last row (home + module lists)\n');
        }
      }
    }
  }

  // Replay Q2 (next-up): the palette-only command opens the first unpassed
  // challenge, and the palette offers it (registry id, no key of its own).
  {
    const dir = path.join(ROOT, '.data', 'check-qol-nav');
    fs.rmSync(dir, { recursive: true, force: true });
    const navStore = new Store(path.join(dir, 'progress.json'));
    const navApp = new App({ theme: pickTheme(), store: navStore, settings: new Settings(path.join(dir, 'settings.json')) });
    navApp.w = 120;
    navApp.h = 34;
    navApp.screen.out = { write() {} };
    navApp.goHome();
    const first = navApp.resumeTarget();
    // Pass it, so "next unpassed" must move on rather than re-open it.
    navStore.recordAttempt(`${first.lessonId}.${first.challengeId}`, 'reference', true);
    navApp.goHome();
    navApp.push('palette');
    const offered = navApp.getPaletteItems().filter((i) => i.type === 'command').map((i) => i.id);
    navApp.pop();
    if (!offered.includes('nav.nextUp')) fail(`Q2: the palette did not offer nav.nextUp (${JSON.stringify(offered)})`);
    else {
      navApp.nextUp();
      const second = navApp.resumeTarget();
      const landed = navApp.state.challenge && navApp.state.challenge.id;
      const expected = `${second.lessonId}.${second.challengeId}`;
      if (navApp.current.name !== 'challenge' || landed !== expected) {
        fail(`Q2: nextUp landed on ${landed}, expected ${expected}`);
      } else if (landed === `${first.lessonId}.${first.challengeId}`) {
        fail('Q2: nextUp re-opened the passed challenge');
      } else {
        process.stdout.write('   ok  Q2 nav.nextUp opens the first unpassed challenge from the palette\n');
      }
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // Replay Q9 (checkpoints): every check run snapshots the pre-check buffers
  // into the challenge sidecar; the ring keeps 10 + one daily best; restore
  // puts the buffers back and never touches attempts/streak.
  {
    const dir = path.join(ROOT, '.data', 'check-qol-history');
    fs.rmSync(dir, { recursive: true, force: true });
    const cpStore = new Store(path.join(dir, 'progress.json'));
    const cpSettings = new Settings(path.join(dir, 'settings.json'));
    cpSettings.data.sound = 'off'; // keep the self-check output clean
    const cpApp = new App({ theme: pickTheme(), store: cpStore, settings: cpSettings });
    cpApp.w = 120;
    cpApp.h = 34;
    cpApp.screen.out = { write() {} };
    cpApp.goHome();
    cpApp.nextUp();
    const cpId = cpApp.state.challenge.id;
    const cpEd = cpApp.getActiveEditor();
    const solution = cpApp.state.challenge.challenge.solution;

    for (let i = 0; i < 11; i += 1) {
      cpEd.lines = [`<!-- attempt ${i} -->`];
      await cpApp.checkChallenge();
    }
    // A passing run: the pre-check snapshot of the passing buffer is promoted.
    cpEd.lines = String(solution).split('\n');
    await cpApp.checkChallenge();

    const list = cpStore.checkpoints(cpId);
    const ring = list.filter((s) => s.kind === 'check');
    const best = list.find((s) => s.kind === 'daily-best');
    // 12 runs → the 10 most recent pre-check states are retained; the passing
    // one is re-kinded to daily-best, so check + daily-best must total 10.
    const retained = list.filter((s) => s.kind === 'check' || s.kind === 'daily-best');
    if (ring.length > 10) fail(`Q9: the ring holds ${ring.length} check snapshots, expected at most 10`);
    else if (retained.length !== 10) fail(`Q9: ${retained.length} pre-check snapshots retained, expected 10`);
    else if (!best) fail('Q9: a passing run did not promote a daily-best snapshot');
    else if (best.passed !== true) fail(`Q9: the daily best is not marked passing (${best.passed})`);
    else if (!(best.meta && best.meta.checksPassed === best.meta.checksTotal)) {
      fail(`Q9: the daily best has no passing check counts (${JSON.stringify(best.meta)})`);
    } else {
      process.stdout.write(`   ok  Q9 checkpoints ring holds 10 + a daily best (${cpStore.checkpoints(cpId).length} listed)\n`);
    }

    // The palette offers the restore command inside a challenge, and selecting
    // it lists the snapshots; Enter on a row restores that state.
    cpApp.push('palette');
    const actions = cpApp.getPaletteItems().filter((i) => i.type === 'command').map((i) => i.id);
    cpApp.pop();
    if (!actions.includes('history.restore')) fail(`Q9: the palette did not offer history.restore (${JSON.stringify(actions)})`);
    else {
      cpApp.runPaletteAction('history.restore');
      const rows = cpApp.getPaletteItems();
      if (cpApp.state.paletteMode !== 'history' || !rows.length || rows[0].type !== 'snapshot') {
        fail(`Q9: the restore list did not open (${cpApp.state.paletteMode}, ${rows.length} rows)`);
      } else {
        const target = rows[rows.length - 1].snapshot;
        const attemptsBefore = cpStore.challengeRecord(cpId).attempts;
        cpApp.state.cursor = rows.length - 1;
        cpApp.paletteKey({ name: 'enter' });
        const restored = cpApp.getActiveEditor().lines.join('\n');
        const expected = Object.values(target.files)[0];
        if (cpApp.state.paletteMode !== 'jump') fail('Q9: the palette stayed in history mode after restoring');
        else if (restored !== expected) fail(`Q9: restore produced ${JSON.stringify(restored.slice(0, 40))}, expected ${JSON.stringify(String(expected).slice(0, 40))}`);
        else if (cpStore.challengeRecord(cpId).attempts !== attemptsBefore) fail('Q9: restoring changed the attempt count');
        else process.stdout.write('   ok  Q9 history.restore applies a checkpoint without touching attempts\n');
      }
    }
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // Corrupted settings file recovers to defaults.
  fs.writeFileSync(path.join(ROOT, '.data', 'check-qol-settings.json'), '{oops');
  const corrupted = new Settings(path.join(ROOT, '.data', 'check-qol-settings.json'));
  if (corrupted.goalDaily() !== 3) fail('Settings: corrupted file did not recover');
  else process.stdout.write('   ok  settings recover to defaults on corruption\n');

  for (const f of ['check-qol.json', 'check-qol-settings.json']) {
    fs.rmSync(path.join(ROOT, '.data', f), { force: true });
  }
} catch (err) {
  fail(`QoL contract: ${err && err.stack ? err.stack.split('\n')[0] : err}`);
}

process.stdout.write('\n7. command registry & keymap\n');
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

  // The published references must match their sources (task 1.8): docs/keymap.md
  // is generated from the command registry and docs/vim.md from VIM_BINDINGS, so
  // any hand edit or binding change that is not regenerated fails the gate
  // instead of shipping stale docs.
  const { renderKeymapDocs, renderVimDocs } = await import('./gen-keymap-docs.js');
  for (const [rel, render] of [['docs/keymap.md', renderKeymapDocs], ['docs/vim.md', renderVimDocs]]) {
    const file = path.join(ROOT, rel);
    const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    if (current !== render()) fail(`${rel} is stale — run: npm run keymap:docs`);
    else process.stdout.write(`   ok  ${rel} matches its source table\n`);
  }

  // Task 2.11: every vim binding in Appendix B.5 must actually resolve. The
  // table drives the docs, so a binding that quietly stops being consumed would
  // otherwise ship as documented-but-dead (the pane-nudge keys already did that
  // once — see the notes in `src/ui/input/index.js`).
  const { VIM_BINDINGS, VIM_MODES, createVimState, reduceKey } = await import('../src/editor/vim.js');
  const { docFromText } = await import('../src/editor/document.js');
  const { createRegisters } = await import('../src/editor/registers.js');
  const vimDocs = {
    normal: docFromText('foo bar\n(baz)\nif (x) {\nqux', { caret: { row: 0, col: 0 } }),
    insert: docFromText('foo', { caret: { row: 0, col: 1 } }),
    visual: docFromText('foo bar', { caret: { row: 0, col: 0 } }),
  };
  let deadBindings = 0;
  for (const binding of VIM_BINDINGS) {
    const entry = binding.mode === 'normal' ? [] : [{ name: binding.mode === 'visual' ? 'char' : 'char', char: binding.mode === 'visual' ? 'v' : 'i' }];
    let doc = vimDocs[binding.mode] || vimDocs.normal;
    let state = createVimState({ mode: VIM_MODES.NORMAL });
    let registers = createRegisters();
    let consumed = true;
    for (const key of [...entry, ...binding.keys]) {
      // `dd`, `gg`, `cc`, `yy`, `gc` are two keystrokes, not one key name.
      const strokes = /^[a-zA-Z]{2}$/.test(key) ? [...key] : [key];
      for (const stroke of strokes) {
        const r = reduceKey(state, stroke, { doc, registers, tabSize: 2, lineComment: '//' });
        state = r.state;
        doc = r.doc;
        registers = r.registers;
        consumed = consumed && r.consumed;
      }
    }
    if (!consumed) {
      deadBindings += 1;
      fail(`vim binding ${binding.keys.join(' ')} (${binding.mode}) does not resolve`);
    }
  }
  if (!deadBindings) {
    process.stdout.write(`   ok  all ${VIM_BINDINGS.length} vim bindings resolve (docs/vim.md)\n`);
  }
} catch (err) {
  fail(`registry: ${err && err.message ? err.message : err}`);
}

// 8. The remaining QoL contract items: richer check output (Q7), suggest-only
// formatting (Q10), editor QoL (Q12) and the on-quit recap (Q13).
process.stdout.write('\n8. remaining QoL (Q7, Q10, Q12, Q13)\n');
try {
  const { eachChallenge } = await import('../src/core/targets.js');
  const { curriculum } = await import('../src/content/index.js');
  const { formatDuration } = await import('../src/core/checkNotes.js');
  const { Settings } = await import('../src/ui/settings.js');
  const { settingsRows } = await import('../src/views/settings.js');
  const renderChallenge = (await import('../src/views/challenge.js')).default;
  const renderPalette = (await import('../src/views/palette.js')).default;

  const dir = path.join(ROOT, '.data', 'check-qol8');
  fs.rmSync(dir, { recursive: true, force: true });
  const q8store = new Store(path.join(dir, 'progress.json'));
  const q8settings = new Settings(path.join(dir, 'settings.json'));
  q8settings.data.sound = 'off';
  const q8 = new App({ theme: pickTheme(), store: q8store, settings: q8settings });
  q8.w = 120;
  q8.h = 34;
  q8.screen.out = { write() {} };
  q8.goHome();

  // A single-file markup challenge, chosen by shape rather than by position so
  // a curriculum reshuffle cannot silently change what this section tests.
  const entry = eachChallenge(curriculum).find((e) => (e.challenge.lang || 'js') === 'html' && !e.challenge.files);
  if (!entry) throw new Error('no single-file html challenge in the curriculum');
  q8.openChallenge(entry.moduleIndex, entry.lessonIndex, entry.challengeIndex);
  const q8ed = q8.getActiveEditor();

  // Q10: a check run never rewrites the buffer; it only suggests formatting.
  q8ed.lines = ['<section><h1>hi</h1></section>'];
  q8ed.row = 0;
  q8ed.col = 0;
  const beforeRun = q8ed.lines.join('\n');
  await q8.checkChallenge();
  const run = q8.state.results;
  if (!q8.state.formatHint) fail('Q10: an unformatted buffer produced no format hint');
  else if (q8ed.lines.join('\n') !== beforeRun) fail('Q10: the check run rewrote the buffer');
  else process.stdout.write('   ok  Q10 checking suggests formatting without touching the buffer\n');

  // Q7: the run is timed and annotated, and the duration reaches the panel.
  if (!Number.isFinite(run.durationMs) || run.durationMs < 0) fail(`Q7: no run duration (${run.durationMs})`);
  else if (!Array.isArray(run.notes)) fail('Q7: the run carries no micro-notes array');
  else {
    const frameText = (rows) => rows.map((r) => r.map((s) => (s && s.text) || '').join('')).join('\n');
    q8.state.briefScroll = 9999; // show the tail of the brief, where CHECKS lives
    const text = frameText(renderChallenge(q8, 120, 34));
    const shown = formatDuration(run.durationMs);
    if (shown && !text.includes(shown)) fail(`Q7: the results panel does not show the run duration (${shown})`);
    else if (!text.includes('CHECKS')) fail('Q7: the results panel lost its CHECKS header');
    else process.stdout.write(`   ok  Q7 run timed (${shown}) and annotated (${run.notes.length} micro-notes)\n`);
  }

  // Q10 (second half): formatting clears the hint and really normalises.
  q8.formatEditor();
  if (q8.state.formatHint) fail('Q10: the format hint survived a successful format');
  else if (q8ed.lines.join('\n') === beforeRun) fail('Q10: Ctrl+F did not change an unformatted buffer');
  else process.stdout.write('   ok  Q10 Ctrl+F formats markup (not just CSS) and clears the hint\n');

  // Q12: the indent width setting is honoured by Tab and by auto-indent.
  q8settings.data.editor.tabSize = 4;
  q8.state.pane = 'both';
  q8ed.lines = [''];
  q8ed.row = 0;
  q8ed.col = 0;
  q8.onKey({ name: 'tab' });
  if (q8ed.lines[0] !== '    ') fail(`Q12: tab size 4 produced ${JSON.stringify(q8ed.lines[0])}`);
  else {
    q8.onKey({ name: 'backspace' });
    if (q8ed.lines[0] !== '') fail(`Q12: backspace did not remove the whole indent level (${JSON.stringify(q8ed.lines[0])})`);
    else {
      q8ed.lines = ['div {'];
      q8ed.row = 0;
      q8ed.col = 5;
      q8.onKey({ name: 'enter' });
      if (q8ed.lines[1] !== '    ') fail(`Q12: auto-indent used ${JSON.stringify(q8ed.lines[1])}, expected 4 spaces`);
      else process.stdout.write('   ok  Q12 tab size 4 drives Tab, auto-indent and backspace\n');
    }
  }

  // Q12: bracket matching (palette-only in the modeless editor).
  q8ed.lines = ['div {', '  color: red;', '}'];
  q8ed.row = 0;
  q8ed.col = 5;
  q8.jumpToMatchingBracket();
  if (q8ed.row !== 2 || q8ed.col !== 0) fail(`Q12: bracket match landed at ${q8ed.row}:${q8ed.col}, expected 2:0`);
  else {
    q8ed.lines = ['div {'];
    q8ed.row = 0;
    q8ed.col = 5;
    q8.jumpToMatchingBracket();
    if (!/No matching/.test(q8.state.notice?.text || '')) fail('Q12: an unmatched bracket was not reported');
    else process.stdout.write('   ok  Q12 bracket match jumps to the partner and reports an unmatched bracket\n');
  }

  // Q12: settings rows are addressed by key, and the cursor stays in range.
  q8.push('settings');
  const rows = settingsRows(q8);
  const tabRow = rows.findIndex((r) => r.key === 'tabSize');
  q8settings.data.editor.tabSize = 2;
  q8.state.cursor = tabRow;
  q8.onKey({ name: 'char', char: ' ' });
  if (q8settings.data.editor.tabSize !== 4) fail(`Q12: Space on the tab-size row set ${q8settings.data.editor.tabSize}`);
  else {
    for (let i = 0; i < rows.length + 5; i += 1) q8.onKey({ name: 'down' });
    if (q8.state.cursor !== rows.length - 1) fail(`Q12: the settings cursor reached ${q8.state.cursor}, expected ${rows.length - 1}`);
    else process.stdout.write('   ok  Q12 settings toggles act on row keys and the cursor is clamped\n');
  }
  // Q12: an ignored key on a scroll screen gives visible feedback.
  q8.pop();
  q8.push('stats');
  q8.onKey({ name: 'char', char: 'z' });
  if (!/does nothing/.test(q8.state.notice?.text || '')) fail('Q12: an ignored key on a scroll screen gave no feedback');
  else process.stdout.write('   ok  Q12 visible bell answers an ignored key\n');
  q8.pop();

  // Q13: the recap reflects the session and prints exactly once on quit.
  await q8EdPass(q8, entry, q8ed);
  const recap = q8.recapLines().join('\n');
  if (!/passed/.test(recap)) fail(`Q13: the recap does not report the session pass (${JSON.stringify(recap)})`);
  else if (!/failed checks/.test(recap)) fail('Q13: the recap dropped the failure count');
  else if (!/next up/.test(recap)) fail('Q13: the recap omitted the next-up target');
  else {
    let printed = '';
    q8.isTTY = true;
    q8.printRecap({ write: (s) => { printed += s; } });
    let twice = '';
    q8.printRecap({ write: (s) => { twice += s; } });
    if (!/Session recap/.test(printed)) fail('Q13: printRecap printed nothing');
    else if (twice !== '') fail('Q13: the recap printed twice for one session');
    else process.stdout.write('   ok  Q13 recap reports the session once, with next-up\n');
  }

  // Palette: the view renders the list the cursor selects from.
  q8.goHome();
  q8.push('palette');
  const items = q8.getPaletteItems();
  const firstAction = items.find((i) => i.type === 'command');
  const paletteText = (() => {
    const r = renderPalette(q8, 100, 30);
    return r.map((row) => row.map((s) => (s && s.text) || '').join('')).join('\n');
  })();
  if (!firstAction) fail('palette: no palette-only action offered on home');
  else if (items[0].id !== firstAction.id) fail('palette: actions are not listed first');
  else if (!paletteText.includes(firstAction.label)) fail(`palette: the view does not render the row the cursor selects (${firstAction.label})`);
  else process.stdout.write('   ok  palette view and command list agree (one source of truth)\n');

  fs.rmSync(dir, { recursive: true, force: true });
} catch (err) {
  fail(`remaining QoL: ${err && err.stack ? err.stack.split('\n')[0] : err}`);
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
