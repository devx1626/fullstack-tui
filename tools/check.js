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

/** A budget breach inside CI headroom: reported, but not a merge blocker. */
const warn = (msg) => {
  process.stdout.write(`  WARN ${msg}\n`);
};

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
  const { lintKeymap, COMMANDS, resolveKey, parseBinding } = await import('../src/ui/commands.js');
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

  // Task 2.10: the challenge footer DERIVES its hints from the registry, so a
  // binding change that strands a hint must fail the gate. Each hinted id needs
  // a default binding, and feeding that binding back through the real resolver
  // on the challenge screen has to return the same command.
  const { CHALLENGE_HINT_IDS, footerHints } = await import('../src/ui/hints.js');
  const eventForBinding = (binding) => {
    const p = parseBinding(binding);
    if (!p) return null;
    if (p.key.length === 1 && !p.ctrl && !p.alt && !p.shift) return { type: 'key', name: 'char', char: p.key };
    const mods = `${p.ctrl ? 'ctrl-' : ''}${p.alt ? 'alt-' : ''}${p.shift ? 'shift-' : ''}`;
    return { type: 'key', name: `${mods}${p.key}` };
  };
  let hintProblems = 0;
  for (const [id] of CHALLENGE_HINT_IDS) {
    const cmd = COMMANDS.find((c) => c.id === id);
    const binding = cmd && cmd.keys && cmd.keys.default && cmd.keys.default[0];
    if (!binding) {
      hintProblems += 1;
      fail(`footer hint ${id} has no default binding`);
      continue;
    }
    const got = resolveKey(eventForBinding(binding), 'challenge');
    if (got !== id) {
      hintProblems += 1;
      fail(`footer hint ${id} (${binding}) resolves to ${got} on the challenge screen`);
    }
  }
  if (!hintProblems) {
    process.stdout.write(`   ok  all ${footerHints().length} challenge footer hints resolve through the registry\n`);
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

// 9. Phase 2 next-UI gate: keystroke-to-paint replay (overhaul §12) and the
// degrade-tier render smoke (§13.2/§7.1). Both drive the REAL components, so
// they need the built test harness; when it is absent they SKIP loudly instead
// of failing, exactly like the unit suites (`npm run build` produces it).
process.stdout.write('\n9. next-UI perf + degrade tiers (task 2.11)\n');
try {
  const harnessPath = path.join(ROOT, 'dist', 'harness.js');
  if (!fs.existsSync(harnessPath)) {
    process.stdout.write('   skip  dist/harness.js not built — run: npm run build\n');
  } else {
    const { pathToFileURL } = await import('node:url');
    const { Writable } = await import('node:stream');
    // chalk decides its color level when ink's module graph initializes, so
    // these must be set BEFORE the harness is imported (they are restored
    // before the section ends).
    const previousTheme = process.env.FULLSTACK_THEME;
    const previousForceColor = process.env.FORCE_COLOR;
    process.env.FULLSTACK_THEME = 'midnight'; // deterministic auto-theme
    process.env.FORCE_COLOR = '3'; // a non-TTY stream would silence chalk entirely
    // P0-1, same reasoning as tests/helpers/snapshot.js: ink (is-in-ci) decides
    // at module load whether to stream frames or buffer them until exit. This
    // section's replays and tier smokes measure/read STREAMED frames against a
    // fake stdout, so the runner's CI variable must not switch ink into its
    // buffer-until-exit mode before the bundle initializes.
    for (const key of ['CI', 'CONTINUOUS_INTEGRATION']) {
      const v = process.env[key];
      if (v !== undefined && v !== '0' && v !== 'false') delete process.env[key];
    }
    const harness = await import(pathToFileURL(harnessPath).href);
    const helper = await import('../tests/helpers/snapshot.js');
    const { renderToText, fakeStdin } = helper;
    const { docFromText, applyEdit, moveCaret } = await import('../src/editor/document.js');
    const { typeText } = await import('../src/editor/typekeys.js');
    const { curriculum: uiCurriculum, totals: uiTotals } = await import('../src/content/index.js');

    // -- perf replay: keystroke → the next stdout write (spec §12's method — not
    //    wall-clock around a macrotask, which the ink spike showed over-counts).
    const PERF_LINES = 500;
    const PERF_KEYS = 60;
    // Spec §12 asks for < 16 ms; §13.4 sets 33 ms warn / 100 ms fail. The app
    // ships maxFps: 240 and CodeEditor reuses unchanged row elements, so the
    // ink render-throttle floor is off the critical path. What remains is ink's
    // own per-paint work, which the FLOOR probe below measures on the same
    // machine in the same run: a one-line component (no editor at all) is
    // already p50 ~11 ms / p95 ~18 ms at maxFps 120, so the §12 line is below
    // ink 6's own floor here and the editor's number is only meaningful next to
    // it.
    //
    // P0-1: an absolute ms ceiling measures the MACHINE, not the product — the
    // same loaded run that failed these gates at ~400 ms also measured its ink
    // floor probe at ~400 ms, i.e. the product sat at 1.0× the renderer wall.
    // The hard regression ceiling is therefore FLOOR-RELATIVE: FAIL past
    // PERF_FAIL_MULT × the same-run floor p95 (a genuine ratio regression),
    // with the historical absolute kept only as a backstop against a
    // degenerate-fast floor probe. The absolute lines stay as informational
    // warns; they no longer fail the run by themselves.
    const WARN_MS = 33;
    const SPEC_FAIL_MS = 100;
    const FAIL_MS = 250; // backstop; only binds when the floor probe ran implausibly fast
    const PERF_FAIL_MULT = 10; // spec P0-1: hard ceiling at 10× the same-run ink floor
    // Steady state measured on the dev machine (2026-09-23, five runs): the
    // four probes sit at ~2.7–6.4× the floor p95. The ratio warn is placed above
    // that envelope so it marks GROWTH of the gap to the renderer wall (the
    // §12/P0-5 discussion), not the product's ordinary shape.
    const PERF_WARN_MULT = 8;
    const MAX_FPS = 240; // same cap src/main.jsx ships
    const PERF_FLOOR_KEYS = 20;
    let writeResolve = null;
    const nextWrite = (ms) => new Promise((resolve) => {
      writeResolve = resolve;
      setTimeout(() => {
        if (writeResolve === resolve) {
          writeResolve = null;
          resolve();
        }
      }, ms);
    });
    const perfSeed = Array.from({ length: PERF_LINES }, (_, i) => `const value${i} = ${i};`).join('\n');
    const perfApi = { press: null, caret: null };
    function PerfProbe() {
      const [doc, setDoc] = harness.useState(() => docFromText(perfSeed));
      perfApi.press = (ch) => setDoc((d) => {
        const r = typeText(d, ch, null);
        return applyEdit(d, r.changes, r.caret).doc;
      });
      // A caret-only move: the document text is untouched, so nothing but the
      // cursor cell differs from the previous frame.
      perfApi.caret = () => setDoc((d) => moveCaret(d, { row: (d.caret.row + 1) % 20, col: d.caret.col }));
      return harness.el(harness.CodeEditor, { document: doc, width: 100, height: 24, language: 'js' });
    }

    // The control probe: a ONE-LINE component, no editor, no highlighting. Ink
    // renders and re-tokenizes a frame of its own on every paint, so this is
    // what the machine can do at all — the number the editor's result has to be
    // read against (see the note above). Measured here and now, not assumed.
    const floorApi = { press: null };
    function FloorProbe() {
      const [n, setN] = harness.useState(0);
      floorApi.press = () => setN((v) => v + 1);
      return harness.el(harness.Text, null, `counter ${n}`);
    }

    /**
     * Spec §12's method: one keystroke → the next stdout write, `keys` times.
     *
     * @returns {{p50: number, p95: number, max: number}}
     */
    async function paintReplay(Component, api, { keys, warmup = 150, op = 'press' }) {
      const out = new Writable({
        write(chunk, _enc, cb) {
          if (writeResolve) {
            const done = writeResolve;
            writeResolve = null;
            done();
          }
          cb();
        },
      });
      out.columns = 120;
      out.rows = 40;
      out.isTTY = true;
      const inst = harness.render(harness.el(Component, {}), {
        stdout: out,
        stdin: fakeStdin(),
        exitOnCtrlC: false,
        patchConsole: false,
        // Same cap the app ships (src/main.jsx) so the number means something.
        maxFps: MAX_FPS,
      });
      await new Promise((r) => setTimeout(r, warmup)); // warm the first paint
      const latencies = [];
      for (let i = 0; i < keys; i += 1) {
        // Arm the write waiter BEFORE the keystroke: ink can flush a frame
        // synchronously, and arming afterwards would measure the NEXT update.
        const t0 = process.hrtime.bigint();
        const painted = nextWrite(400);
        api[op]('x');
        await painted;
        latencies.push(Number(process.hrtime.bigint() - t0) / 1e6);
      }
      inst.unmount();
      latencies.sort((a, b) => a - b);
      const q = (f) => latencies[Math.min(latencies.length - 1, Math.floor(f * latencies.length))];
      return { p50: q(0.5), p95: q(0.95), max: latencies[latencies.length - 1] };
    }

    const floor = await paintReplay(FloorProbe, floorApi, { keys: PERF_FLOOR_KEYS });
    const editor = await paintReplay(PerfProbe, perfApi, { keys: PERF_KEYS });
    // Same frame, same session, but the keystroke only MOVES the caret. §12's
    // "caret moves must not re-render siblings" is measured here rather than
    // asserted: ink rebuilds and re-tokenizes the whole frame whenever the tree
    // re-renders at all, so this is the cost a stable-frame caret path would
    // avoid entirely.
    const caret = await paintReplay(PerfProbe, perfApi, { keys: PERF_KEYS, op: 'caret' });
    const { p50 } = editor;
    const ms = (n) => `${n.toFixed(1)} ms`;
    const over = (v, base) => `${(v / base).toFixed(1)}x the floor`;
    process.stdout.write(`   note  caret-only moves on the same frame: p50 ${ms(caret.p50)}, p95 ${ms(caret.p95)} — ${(caret.p50 / p50).toFixed(2)}x what typing costs, because ink re-renders the whole tree on any update\n`);
    const floorVerdict = floor.p95 > 16
      ? "§12's 16 ms p95 is below ink's own floor here, i.e. the target is a property of the renderer rather than of the editor code"
      : "ink's floor is inside §12's 16 ms p95, so any editor overshoot is the editor's own";
    process.stdout.write(`   note  ink floor (one-line component, same run): p50 ${ms(floor.p50)}, p95 ${ms(floor.p95)} — ${floorVerdict}\n`);
    // -- P0-1 verdict ladder, shared by all four §12 probes. The hard FAIL is
    //    floor-relative: a loaded machine inflates the floor probe and the
    //    product together, so a REGRESSION is a change in the ratio, not in the
    //    absolute number. Absolute lines remain as informational warns.
    const perfGate = (label, r, { noteTarget = false } = {}) => {
      const line = `${label} — p50 ${ms(r.p50)} (${over(r.p50, floor.p50)}), p95 ${ms(r.p95)}, max ${ms(r.max)}`;
      const floorP95 = Math.max(floor.p95, 1); // a 0 ms floor would void the multiplier
      const ceiling = Math.max(PERF_FAIL_MULT * floorP95, FAIL_MS);
      const ratio = r.p95 / floorP95;
      if (r.p95 > ceiling) {
        fail(`perf: ${label} p95 ${ms(r.p95)} exceeds the floor-relative regression ceiling ${ms(ceiling)} (${PERF_FAIL_MULT}× the same-run ink floor, backstopped at ${FAIL_MS} ms). ${line}`);
      } else if (ratio >= PERF_WARN_MULT) {
        warn(`perf: ${label} p95 is ${ratio.toFixed(1)}× the same-run ink floor — renderer-wall regression watch. ${line}`);
      } else if (r.p95 > SPEC_FAIL_MS) {
        warn(`perf: ${label} p95 ${ms(r.p95)} is over the spec's ${SPEC_FAIL_MS} ms line (p50 ${ms(r.p50)}). ${line}`);
      } else if (r.p95 > WARN_MS) {
        warn(`perf: ${label} p95 ${ms(r.p95)} over the ${WARN_MS} ms warn line — within CI headroom. ${line}`);
      } else if (noteTarget && r.p95 > 16) {
        process.stdout.write(`   ok  perf replay: ${line}\n   note  p95 is above the §12 16 ms target but inside the ${WARN_MS} ms CI headroom\n`);
      } else {
        process.stdout.write(`   ok  perf replay: ${line}\n`);
      }
    };
    perfGate(`${PERF_LINES}-line buffer, ${PERF_KEYS} keystrokes`, editor, { noteTarget: true });

    // -- light-frame replays: §12 names palette typing and list navigation next
    //    to editor typing. They are where ink's render THROTTLE is largest
    //    relative to the frame's own content (which is what the maxFps cap buys)
    //    — and they still land at the same multiple of the one-line floor, which
    //    is the finding: all four targets share one wall. Reported the same way,
    //    gated on the same §12/§13.4 lines.
    const LIGHT_KEYS = 40;
    const paletteItems = harness.buildPaletteItems({
      screen: 'home',
      curriculum: uiCurriculum,
      screens: harness.SCREEN_TARGETS || [],
    });
    const palWord = 'challenge';
    const paletteApi = { press: null };
    function PaletteProbe() {
      const [query, setQuery] = harness.useState('');
      // Type a real word, then start over: a query that only ever grows ends at
      // "no matches", which renders almost nothing and would flatter the probe.
      paletteApi.press = () => setQuery((q) => (q.length >= palWord.length ? '' : q + palWord[q.length]));
      return harness.el(harness.PaletteScreen, { items: paletteItems, query, selected: 0, height: 14 });
    }
    const listRows = uiCurriculum.flatMap((mod) => [
      { label: `${mod.badge}  ${mod.title}`, right: `${(mod.lessons || []).length} lessons` },
      ...(mod.lessons || []).map((lesson) => ({ label: `   ${lesson.title}`, right: '' })),
    ]);
    const listApi = { press: null };
    function ListProbe() {
      const [selected, setSelected] = harness.useState(0);
      listApi.press = () => setSelected((s) => (s + 1) % listRows.length);
      return harness.el(harness.List, { items: listRows, selected, height: 14 });
    }
    // -- browser-tab scrolling: §12's fourth target. The browser pane scrolls
    //    by moving its visible window over a set of laid-out rows, so the probe
    //    drives the real BrowserScreen with a real built page and a moving
    //    offset — a genuinely different frame each keystroke, like the two
    //    above, rather than a static pane.
    const browserParts = {
      html: Array.from({ length: 32 }, (_, i) => `<p>paragraph ${i} with some words on it</p>`).join('\n'),
      css: 'p { color: #345; }',
      js: '',
    };
    const browserPage = harness.buildPage(browserParts, 96);
    const browserPane = harness.buildRenderRows(browserPage, 96, 0);
    // The screen clamps `offset` to the scrollable range, so cycling it over the
    // PANE length would leave some keystrokes painting the same window (ink then
    // writes nothing and the measure times out at its 400 ms guard). Cycle it
    // over [0, maxOffset] instead, so every keystroke genuinely scrolls.
    const browserBodyH = 30 - 4; // height - the screen's 4 chrome rows
    const browserMaxOffset = Math.max(1, browserPane.length - browserBodyH);
    const browserApi = { press: null };
    function BrowserScrollProbe() {
      const [offset, setOffset] = harness.useState(0);
      browserApi.press = () => setOffset((o) => (o + 3) % (browserMaxOffset + 1));
      return harness.el(harness.BrowserScreen, {
        title: 'demo page',
        tab: 'render',
        pane: browserPane,
        offset,
        width: 100,
        height: 30,
      });
    }
    const lightFrames = [
      ['palette typing', await paintReplay(PaletteProbe, paletteApi, { keys: LIGHT_KEYS })],
      ['list navigation', await paintReplay(ListProbe, listApi, { keys: LIGHT_KEYS })],
      ['browser-tab scrolling', await paintReplay(BrowserScrollProbe, browserApi, { keys: LIGHT_KEYS })],
    ];
    for (const [name, r] of lightFrames) {
      perfGate(`${name} (${LIGHT_KEYS} keystrokes)`, r);
    }

    // -- screen × tier smoke: every screen renders on tiers A–D, and tier D
    //    emits no COLOR SGR (bold/inverse and cursor moves are not color).
    const TIERS = {
      A: { isTTY: true, tty: true, colorDepth: 24, unicode: true, tier: 'A', term: 'xterm-256color', colorterm: 'truecolor' },
      B: { isTTY: true, tty: true, colorDepth: 8, unicode: true, tier: 'B', term: 'xterm-256color', colorterm: '' },
      C: { isTTY: true, tty: true, colorDepth: 0, unicode: true, tier: 'C', term: 'xterm', colorterm: '' },
      D: { isTTY: true, tty: false, colorDepth: 0, unicode: false, tier: 'D', term: 'dumb', colorterm: '' },
    };
    const hasColorSgr = (s) => {
      const re = /\u001b\[([0-9;]*)m/g;
      let m;
      while ((m = re.exec(s))) {
        for (const part of m[1].split(';')) {
          const n = Number(part);
          if ((n >= 30 && n <= 38) || (n >= 40 && n <= 48) || (n >= 90 && n <= 97) || (n >= 100 && n <= 107)) return true;
        }
      }
      return false;
    };
    const SCREENS = {
      home: harness.HomeRoute,
      module: harness.ModuleRoute,
      lesson: harness.LessonRoute,
      challenge: harness.ChallengeRoute,
      projects: harness.ProjectsRoute,
      help: harness.HelpRoute,
      resources: harness.ResourcesRoute,
      workspace: harness.WorkspaceRoute,
      stats: harness.StatsRoute,
      settings: harness.SettingsRoute,
      tour: harness.TourRoute,
    };
    const firstModule = uiCurriculum[0];
    const firstLesson = firstModule.lessons[0];
    const firstChallenge = firstLesson.challenges[0];
    const ROUTE_PARAMS = {
      home: {},
      module: { moduleId: firstModule.id },
      lesson: { moduleId: firstModule.id, lessonId: firstLesson.id },
      challenge: { moduleId: firstModule.id, lessonId: firstLesson.id, challengeId: firstChallenge.id },
      projects: {},
      help: {},
      resources: {},
      workspace: { files: [], root: null },
      stats: {},
      settings: {},
      tour: {},
    };
    const uiDir = path.join(ROOT, '.data', 'check-next-ui');
    fs.rmSync(uiDir, { recursive: true, force: true });
    const uiSettings = {
      data: {
        version: 1,
        onboardedAt: '2026-01-01T00:00:00.000Z',
        theme: 'midnight',
        editor: { vimMode: false, tabSize: 2 },
        panes: {},
        palette: { recent: [] },
      },
      get(key) { return key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), this.data); },
      save() {},
      bannerVisible: () => false,
      dismissBanner: () => {},
      paneRatio: (_screen, _key, fallback) => fallback,
      setPaneRatio: () => {},
      resetPanes: () => {},
    };
    const uiServices = harness.createServices({
      store: new Store(path.join(uiDir, 'progress.json')),
      curriculum: uiCurriculum,
      settings: uiSettings,
      overall: uiTotals(),
      lessonIndex: uiCurriculum.flatMap((m) => m.lessons.map((lesson) => ({ module: m, lesson }))),
    });
    let rendered = 0;
    const colorByTier = {};
    const colorlessTierLeaks = [];
    for (const tier of Object.keys(TIERS)) {
      for (const [name, params] of Object.entries(ROUTE_PARAMS)) {
        let frame = null;
        try {
          frame = await renderToText(
            harness.el(
              harness.ServicesProvider,
              { services: uiServices },
              harness.el(harness.AppRoot, {
                screens: SCREENS,
                initial: { name, params },
                onQuit: () => {},
                caps: TIERS[tier],
              }),
            ),
            { render: harness.render, columns: 100, rows: 30, settleMs: 25 },
          );
        } catch (err) {
          fail(`tier ${tier} ${name}: render threw (${err && err.message ? err.message : err})`);
          continue;
        }
        if (!frame || !frame.length) {
          fail(`tier ${tier} ${name}: rendered nothing`);
          continue;
        }
        rendered += 1;
        if (hasColorSgr(frame)) {
          colorByTier[tier] = (colorByTier[tier] || 0) + 1;
          // Tiers C and D are colorless by capability (theme depth 0), so any
          // color here is a hardcoded Ink color name that bypassed the theme.
          if (tier === 'C' || tier === 'D') colorlessTierLeaks.push(`${tier}:${name}`);
        }
      }
    }
    // -- FULLSTACK_THEME actually reaches the screens, not just AppRoot's own
    //    status line. Before the theme context every screen hardcoded Ink
    //    color NAMES, so `paper` tinted nothing but the frame.
    const rgbSgr = (hex) => `\u001b[38;2;${[1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16))
      .join(';')}m`;
    const themedFrame = async (name) => {
      process.env.FULLSTACK_THEME = name;
      return renderToText(
        harness.el(
          harness.ServicesProvider,
          { services: uiServices },
          harness.el(harness.AppRoot, {
            screens: SCREENS,
            initial: { name: 'home', params: {} },
            onQuit: () => {},
            caps: TIERS.A,
          }),
        ),
        { render: harness.render, columns: 100, rows: 30, settleMs: 25 },
      );
    };
    const paperAccent = rgbSgr('#2874a2'); // paper.accent
    const paperFrame = await themedFrame('paper');
    const midnightFrame = await themedFrame('midnight');
    if (!paperFrame.includes(paperAccent)) {
      fail('theme: FULLSTACK_THEME=paper did not reach the screens (paper accent absent from home)');
    } else if (midnightFrame.includes(paperAccent)) {
      fail('theme: the midnight frame carries paper tokens');
    } else {
      process.stdout.write('   ok  FULLSTACK_THEME=paper repaints the screens, not just the frame\n');
    }

    if (previousTheme === undefined) delete process.env.FULLSTACK_THEME;
    else process.env.FULLSTACK_THEME = previousTheme;
    if (previousForceColor === undefined) delete process.env.FORCE_COLOR;
    else process.env.FORCE_COLOR = previousForceColor;
    const expected = Object.keys(TIERS).length * Object.keys(ROUTE_PARAMS).length;
    if (!colorByTier.A) {
      // If NOTHING was colored even at tier A the assertion above proves
      // nothing — surface that loudly rather than reporting a false pass.
      warn('tier smoke: no frame carried color at tier A — the color assertions are not meaningful here');
    }
    if (rendered === expected) {
      const spread = Object.keys(TIERS).map((tier) => `${tier}:${colorByTier[tier] || 0}`).join(' ');
      process.stdout.write(`   ok  ${Object.keys(ROUTE_PARAMS).length} screens × 4 tiers rendered without throwing (${rendered} frames), colored frames ${spread}\n`);
    }
    if (colorlessTierLeaks.length) {
      // Fixed by the theme context (chrome/screens ask for tokens now); kept as
      // a FAILURE so one hardcoded Ink color name cannot come back unnoticed.
      fail(`colorless tiers C/D emitted color on ${colorlessTierLeaks.length} screen×tier renders `
        + `(hardcoded Ink color names rather than theme tokens): ${colorlessTierLeaks.join(', ')}`);
    }

    // -- 9b. degrade-tier VERIFICATION TOUR (spec §7.1 matrix + §14 Phase 4).
    //    The crash/color smoke above proves every screen renders and that the
    //    theme strips at C/D; the tour proves the frames are the RIGHT text:
    //    glyphs, borders and meters must degrade with the tier, tier D must be
    //    plain 7-bit line-oriented output, and the motion gate must hold. It
    //    walks home/stats/settings at tier A and D and inspects the REAL frames
    //    against each tier's resolved icon set — so a new screen cannot quietly
    //    reintroduce a hardcoded glyph or an undegraded border.
    const { iconsFor, ICON_SETS } = harness;
    const tourScreen = async (tier, route, params) => stripAnsiSafe(await renderToText(
      harness.el(
        harness.ServicesProvider,
        { services: uiServices },
        harness.el(harness.AppRoot, {
          screens: SCREENS,
          initial: { name: route, params },
          onQuit: () => {},
          caps: TIERS[tier],
        }),
      ),
      { render: harness.render, columns: 100, rows: 30, settleMs: 25 },
    ));
    function stripAnsiSafe(s) { return helper.stripAnsi(s).replace(/\n{2,}/g, '\n').replace(/[ \t]+$/gm, ''); }
    const tourFail = [];
    const homeA = await tourScreen('A', 'home', ROUTE_PARAMS.home);
    const homeD = await tourScreen('D', 'home', ROUTE_PARAMS.home);
    const statsD = await tourScreen('D', 'stats', ROUTE_PARAMS.stats);
    const settingsD = await tourScreen('D', 'settings', ROUTE_PARAMS.settings);

    // 1. Glyphs follow the tier: unicode select marker at A, ASCII `>` at D.
    if (!homeA.includes(ICON_SETS.unicode.select)) tourFail.push(`tier A home lacks the unicode select glyph (${ICON_SETS.unicode.select})`);
    if (!homeD.includes(ICON_SETS.ascii.select)) tourFail.push(`tier D home lacks the ascii select glyph (${ICON_SETS.ascii.select})`);
    if (homeD.includes(ICON_SETS.unicode.select)) tourFail.push('tier D home still renders the unicode marker — icons did not degrade');

    // 2. Meters degrade: blocks at A, the # ladder at D.
    if (!homeA.includes(ICON_SETS.unicode.meterFull) && !homeA.includes(ICON_SETS.unicode.meterEmpty)) {
      tourFail.push('tier A home lacks block meters');
    }
    if (homeD.includes(ICON_SETS.unicode.meterFull)) tourFail.push('tier D home still renders block meters');

    // 3. Panels: rounded corners at A, none of them at D (the home screen has
    //    no panel, so the borders assertion runs on the palette-bearing screens
    //    via the icon-set resolution instead — the borderStyle field).

    // 4. Tier D is plain line-oriented output: no glyph above U+007E anywhere.
    const nonAscii = (s) => [...s].filter((ch) => ch.codePointAt(0) > 0x7e).map((ch) => ch);
    for (const [label, frame] of [['home', homeD], ['stats', statsD], ['settings', settingsD]]) {
      const bad = [...new Set(nonAscii(frame))];
      if (bad.length) tourFail.push(`tier D ${label} carries non-ASCII glyphs: ${bad.join(' ')}`);
    }

    // 5. Tier D still tells the learner where they are: the headline + sections.
    for (const [label, frame, wanted] of [
      ['home', homeD, /Let's build/],
      ['stats', statsD, /Progress/],
      ['settings', settingsD, /Preferences|Settings/],
    ]) {
      if (!wanted.test(frame)) tourFail.push(`tier D ${label} lost its identifying chrome`);
    }

    // 6. The app-wide icon set resolves per tier: unicode above D, ascii at D
    //    (the capability probe's decision, which AppRoot hands to the provider).
    if (iconsFor(TIERS.D.unicode === false ? 'ascii' : 'unicode') !== ICON_SETS.ascii) {
      tourFail.push('tier D resolved a non-ascii icon set');
    }

    // 7. Motion gate: NO_ANIMATION/tier D disable the flourishes (the same
    //    gate the check imports statically would run — assert via the bundle).
    if (harness.animationAllowed) {
      if (harness.animationAllowed(TIERS.D, {})) tourFail.push('motion allowed at tier D');
      if (harness.animationAllowed(TIERS.C, {})) tourFail.push('motion allowed at tier C');
      if (!harness.animationAllowed(TIERS.A, {})) tourFail.push('motion disabled at tier A (unicode TTY)');
      if (harness.animationAllowed(TIERS.A, { NO_ANIMATION: '1' })) tourFail.push('NO_ANIMATION ignored');
    }

    if (tourFail.length) {
      for (const f of tourFail) fail(`tier tour: ${f}`);
    } else {
      process.stdout.write('   ok  tier tour: glyphs/meters degrade A→D, tier D is 7-bit line-oriented, motion gate holds\n');
    }

    // -- 9c. small-size sweep (PC-04, loose-ends-spec.md): every route must
    //    render — not throw, not blank — at the small end of the window range.
    //    The classic app had an 11-view × 8-size sweep (check.js §3); this is
    //    its next-UI successor, sized to the floors that matter: 60×16 (the
    //    narrow-terminal pane-toggle regime) and 40×12 (the hard floor), at
    //    tier A for layout and again at tier D for the tiny+colorless
    //    interaction (glyph/border/wrap decisions made with no color and no
    //    unicode at minimum width). Tier D frames additionally assert the
    //    7-bit contract at small width for CHROME routes — a glyph that only
    //    leaks when the layout squeezes is still a leak. The three
    //    content-bearing routes (lesson/challenge/projects) are exempt from
    //    the 7-bit assertion: they render learner material VERBATIM (starters,
    //    briefs, prose) — a directory tree in a starter is data, not chrome,
    //    and must not be transcoded behind the learner's back. Content-tier
    //    fidelity is a content-QA decision (loose-ends-spec.md P0-4), not a
    //    chrome contract.
    const CHROME_ROUTES = new Set(['home', 'module', 'stats', 'settings', 'tour', 'help', 'resources', 'workspace', 'browser']);
    const SMALL_SIZES = [
      { columns: 60, rows: 16, tier: 'A', label: '60x16/A' },
      { columns: 40, rows: 12, tier: 'A', label: '40x12/A' },
      { columns: 40, rows: 12, tier: 'D', label: '40x12/D' },
    ];
    const smallFail = [];
    let smallRendered = 0;
    for (const size of SMALL_SIZES) {
      for (const [name, params] of Object.entries(ROUTE_PARAMS)) {
        let frame = null;
        try {
          frame = await renderToText(
            harness.el(
              harness.ServicesProvider,
              { services: uiServices },
              harness.el(harness.AppRoot, {
                screens: SCREENS,
                initial: { name, params },
                onQuit: () => {},
                caps: TIERS[size.tier],
              }),
            ),
            { render: harness.render, columns: size.columns, rows: size.rows, settleMs: 25 },
          );
        } catch (err) {
          smallFail.push(`${size.label} ${name}: render threw (${err && err.message ? err.message : err})`);
          continue;
        }
        if (!frame || !frame.length) {
          smallFail.push(`${size.label} ${name}: rendered nothing`);
          continue;
        }
        smallRendered += 1;
        if (size.tier === 'D' && CHROME_ROUTES.has(name)) {
          const bad = [...new Set(nonAscii(frame))];
          if (bad.length) smallFail.push(`${size.label} ${name}: non-ASCII glyphs at tiny tier D: ${bad.join(' ')}`);
        }
      }
    }
    if (smallFail.length) {
      for (const f of smallFail) fail(`small-size sweep: ${f}`);
    } else {
      process.stdout.write(`   ok  small-size sweep: 11 routes × 3 window shapes rendered without throwing (${smallRendered} frames incl. 40x12 tier D)\n`);
    }

    fs.rmSync(uiDir, { recursive: true, force: true });
  }
} catch (err) {
  fail(`next-UI smoke: ${err && err.stack ? err.stack.split('\n')[0] : err}`);
}

// 10. Dead-export sweep (overhaul task 2.12). "No dead exports" is the task's
//     own gate, and it is the check that keeps the DELETE PASS honest while the
//     classic UI is still the default entry: anything the Phase 0–2 work left
//     behind (a helper that stopped being called, a module nothing imports)
//     shows up here instead of sitting in the tree looking load-bearing.
//     References are counted across the whole project (src, tests, tools, docs
//     and the root configs), because a helper used only by a test is alive.
process.stdout.write('\n10. dead exports (task 2.12)\n');
try {
  const SWEEP_DIRS = ['src/editor', 'src/ui'];
  /** Documented seams: exported on purpose, wired when their feature lands.
   *  EMPTY since P0-3 wired the M1 screenshot seam (PC-05): probeGraphicsTTY
   *  is invoked from main.jsx's boot, and every graphicsProbe.js/screenshot.js
   *  export has a real caller (screenshotAction.js). A new seam goes here. */
  const DOCUMENTED_SEAMS = {};
  const exts = /\.(js|jsx|mjs|cjs|json|md)$/;
  const walk = (dir, out = []) => {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.posix.join(dir, entry.name);
      if (entry.isDirectory()) walk(rel, out);
      else if (exts.test(entry.name)) out.push(rel);
    }
    return out;
  };
  const files = [
    ...walk('src'), ...walk('tests'), ...walk('tools'), ...walk('docs'),
    ...fs.readdirSync(ROOT, { withFileTypes: true })
      .filter((e) => e.isFile() && exts.test(e.name))
      .map((e) => e.name),
  ];
  const text = new Map(files.map((f) => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')]));
  const targets = SWEEP_DIRS.flatMap((d) => walk(d));
  const countIn = (name, file) => {
    const re = new RegExp(`\\b${name.replace(/[$]/g, '\\$')}\\b`, 'g');
    let n = 0;
    for (const [f, t] of text) n += (t.match(re) || []).length - (f === file ? 1 : 0);
    return n;
  };
  const deadExports = [];
  const usedSeams = [];
  for (const file of targets) {
    const src = text.get(file);
    for (const m of src.matchAll(/^export\s+(?:async\s+)?(?:function|const|class|let)\s+([A-Za-z_$][\w$]*)/gm)) {
      const name = m[1];
      if (DOCUMENTED_SEAMS[name]) { usedSeams.push(name); continue; }
      if (!countIn(name, file)) deadExports.push(`${name} (${file})`);
    }
  }
  // An orphan module is the same problem one level up: nobody imports it.
  const orphans = [];
  for (const file of walk('src')) {
    if (files.filter((f) => f !== file && text.get(f).includes(path.basename(file))).length === 0) {
      orphans.push(file);
    }
  }
  for (const seam of usedSeams) process.stdout.write(`   note  documented seam: ${seam} — ${DOCUMENTED_SEAMS[seam]}\n`);
  if (deadExports.length) {
    fail(`dead exports in ${SWEEP_DIRS.join('/, ')}/: ${deadExports.join(', ')}`);
  } else {
    process.stdout.write(`   ok  no dead exports in ${SWEEP_DIRS.length} trees (${targets.length} files scanned)\n`);
  }
  if (orphans.length) fail(`orphan modules (nothing imports them): ${orphans.join(', ')}`);
  else process.stdout.write('   ok  no orphan modules\n');
} catch (err) {
  fail(`dead-export sweep: ${err && err.stack ? err.stack.split('\n')[0] : err}`);
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
