/**
 * Q7 richer check output — the pure half.
 *
 * The grader returns pass/fail per check; this module turns a *run* into the
 * few sentences a mentor would add, without running anything itself:
 *
 *   - how long the run took (set by the caller, which owns the clock),
 *   - identifiers a failing message talks about that are not in the learner's
 *     code at all (the most common "why is this failing" question),
 *   - an exception in the console, which has to be fixed first because it
 *     stops every later check from meaning much,
 *   - an untouched starter buffer,
 *   - the honesty note when hints or the solution were on and it passed.
 *
 * Everything here is string/array work so it is unit-testable with no
 * terminal, no child process and no clock.
 */

/** `820` → `820 ms`, `12400` → `12.4s`, `74000` → `1m 14s`. */
export function formatDuration(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n < 0) return '';
  if (n < 1000) return `${Math.round(n)} ms`;
  const secs = n / 1000;
  if (secs < 60) return `${secs.toFixed(1)}s`;
  const mins = Math.floor(secs / 60);
  return `${mins}m ${Math.round(secs - mins * 60)}s`;
}

const ERROR_RE = /\b(?:[A-Z][A-Za-z]*Error|ReferenceError|TypeError|SyntaxError|RangeError|NameError|KeyError|ValueError|IndentationError)\b/;

/**
 * Tokens a human would call "code" that a check message mentions.
 * Deliberately narrow — a false note is worse than no note:
 *   `.card`, `#hero`, `<h1>`.
 * A `.` in the middle of a word (`index.html`) is not a selector.
 */
export function mentionedTokens(message) {
  const text = String(message ?? '');
  const out = [];
  const push = (kind, name) => {
    if (name && !out.some((t) => t.name === name)) out.push({ kind, name });
  };
  for (const m of text.matchAll(/(?:^|[^\w.'"-])\.([a-zA-Z_][\w-]*)\b/g)) push('class', m[1]);
  for (const m of text.matchAll(/(?:^|[^\w])#([a-zA-Z_][\w-]*)\b/g)) push('id', m[1]);
  for (const m of text.matchAll(/<([a-z][a-z0-9]*)[\s>/]/g)) push('tag', m[1]);
  return out;
}

const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Is the mentioned token actually written in the learner's code?
 * A CSS-ish selector in a message is satisfied by the markup form too: a
 * check about `.card` passes the moment `class="card"` exists, so the note
 * must not claim the class is missing.
 */
function presentInCode(token, code) {
  const name = esc(token.name);
  if (token.kind === 'class') {
    return new RegExp(`\\.${name}(?![\\w-])`).test(code)
      || new RegExp(`class\\s*=\\s*["'][^"']*\\b${name}\\b`).test(code);
  }
  if (token.kind === 'id') {
    return new RegExp(`#${name}(?![\\w-])`).test(code)
      || new RegExp(`id\\s*=\\s*["']${name}["']`).test(code);
  }
  return new RegExp(`<${name}(?![\\w-])`, 'i').test(code);
}

function describe(token) {
  if (token.kind === 'class') return `\`${token.name}\` is a class in the failing check but appears nowhere in your code`;
  if (token.kind === 'id') return `\`${token.name}\` is an id in the failing check but appears nowhere in your code`;
  return `\`<${token.name}>\` never appears in your code`;
}

/**
 * Build the micro-notes for one run.
 *
 * @param {{
 *   results?: Array<{ ok: boolean, message?: string, label?: string }>,
 *   logs?: Array<string>,
 *   code?: string,
 *   starter?: string,
 *   hintsShown?: number,
 *   solutionShown?: boolean,
 * }} run
 * @returns {Array<{ kind: 'warn'|'info'|'honesty', text: string }>}
 */
export function checkNotes(run = {}) {
  const {
    results = [],
    logs = [],
    code = '',
    starter = '',
    hintsShown = 0,
    solutionShown = false,
  } = run;
  const notes = [];
  const failed = results.filter((r) => !r.ok);
  const allPassed = results.length > 0 && failed.length === 0;

  // 1. An exception beats every other note: nothing else can be trusted yet.
  const logText = logs.map((l) => String(l)).join('\n');
  const err = logText.match(ERROR_RE);
  if (err) {
    notes.push({
      kind: 'warn',
      text: `Your code threw a ${err[0]} - fix that first, then re-check; later checks can't run past it.`,
    });
  }

  // 2. Failing messages naming things that are not in the code at all.
  if (!allPassed) {
    const missing = [];
    for (const r of failed) {
      for (const token of mentionedTokens(r.message)) {
        if (missing.some((t) => t.name === token.name)) continue;
        if (!presentInCode(token, code)) missing.push(token);
      }
      if (missing.length >= 3) break;
    }
    missing.slice(0, 3).forEach((token) => notes.push({ kind: 'info', text: describe(token) }));
  }

  // 3. Nothing typed yet — say so instead of leaving them hunting.
  if (!allPassed && !err && code.trim() !== '' && code.trim() === String(starter).trim()) {
    notes.push({
      kind: 'info',
      text: 'The editor is still the starter code - the first requirement above is the place to start.',
    });
  }

  // 4. Passed, but not clean: honest about what helped.
  if (allPassed && solutionShown) {
    notes.push({
      kind: 'honesty',
      text: 'You passed with the solution on screen. Worth typing it again cold - the next module builds on this.',
    });
  } else if (allPassed && hintsShown > 0) {
    notes.push({
      kind: 'honesty',
      text: `Passed with ${hintsShown} hint${hintsShown === 1 ? '' : 's'} used. A sibling challenge cold would confirm it stuck.`,
    });
  }

  return notes;
}
