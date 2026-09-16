/**
 * The grading layer.
 *
 * Content authors declare *intent*, not string matching:
 *
 *   T.js('add(2, 3) returns 5', 'add(2, 3) === 5')
 *   T.dom('every <img> has a non-empty alt', (d) =>
 *     d.query('img').every((n) => (n.attrs.alt || '').trim()) || 'found an <img> with an empty alt')
 *   T.css('`.card` is a flex container', (c) => c.value('.card', 'display') === 'flex')
 *   T.sql('returns one row per user', ({ rows }) => rows.length === 3 || `got ${rows.length}`)
 *
 * JavaScript is executed for real in a sandbox; HTML is parsed into a tree;
 * CSS is parsed into rules; SQL runs against an in-memory SQLite database.
 *
 * `evaluate` returns a result object, or a Promise for challenges marked
 * `async: true` - always `await` it and both paths work.
 */

import { runJs } from './runner.js';
import { Dom, extractScripts, extractStyles, lint } from './html.js';
import { Css } from './css.js';
import { runSql } from './sqlrun.js';
import { createRepo, parseScript } from './shexec.js';
import { stripTypes } from './tsstrip.js';
import { runPy, pyAvailable } from './pyrun.js';

/**
 * Only treat source as markup when it *starts* like a document. Otherwise JS
 * that happens to contain `el.innerHTML = '<div>'` would be misclassified.
 */
const isMarkup = (code) => {
  const s = String(code ?? '').trim();
  if (!s.startsWith('<')) return false;
  return /^<!doctype|^<html|^<[a-z][\w-]*[\s>/]/i.test(s);
};

export const T = {
  /** Boolean expression evaluated in the same scope as the learner's code. */
  js: (label, expr, hint) => ({ kind: 'js', label, expr, hint }),
  /** Read a binding out of the sandbox and assert on it in plain Node. */
  capture: (label, name, fn, hint) => ({ kind: 'capture', label, name, fn, hint }),
  /** Regex against the raw source. Use sparingly - behaviour beats text. */
  src: (label, re, hint) => ({ kind: 'src', label, re, hint }),
  /** Regex that must NOT match. */
  notSrc: (label, re, hint) => ({ kind: 'src', label, re, hint, negate: true }),
  /** Assert on the parsed HTML tree; return true, or a string describing the miss. */
  dom: (label, test, hint) => ({ kind: 'dom', label, test, hint }),
  /** Assert on the parsed stylesheet; return true, or a string describing the miss. */
  css: (label, test, hint) => ({ kind: 'css', label, test, hint }),
  /**
   * Assert on a query result. `test` receives `{ rows, columns, rowsets, db }`
   * and can run extra queries against the same in-memory database.
   * The challenge must supply `schema` with its CREATE TABLE + seed data.
   */
  sql: (label, test, hint) => ({ kind: 'sql', label, test, hint }),
  /**
   * Run the learner's command script for real in a throwaway git repository,
   * then assert on the result. `test` receives repo helpers:
   * `log()`, `branches()`, `status()`, `remotes()`, `exists()`, `read()`,
   * `list()`, `commitCount()`, `lastCommitFiles()`, `run(cmd)`, `transcript`.
   */
  git: (label, test, hint) => ({ kind: 'git', label, test, hint }),
  /**
   * Python check. Three forms:
   *   T.py('label', 'py expression', hint?) — truthiness in the learner's scope
   *   T.py('label', { name: 'x', fn: (v) => v > 3 }, hint?) — capture a value
   *     named `x` (via `capture('x', …)` in learner code) and assert in Node.
   *   T.py('label', { expr: 'py expression' }, hint?) — the same expression form,
   *     handy when the expression lives on its own line in source.
   * (An object with neither `name` nor `expr` is an authoring mistake: it
   * raises here, instead of silently never passing at check time.)
   */
  py: (label, spec, hint) => {
    const isObj = typeof spec === 'object' && spec !== null;
    const objForm = isObj && spec.name !== undefined;
    const exprForm = typeof spec === 'string' || (isObj && typeof spec.expr === 'string');
    if (!exprForm && !(objForm && typeof spec.fn === 'function')) {
      throw new TypeError(`T.py(${JSON.stringify(label)}): need { name, fn } or { expr } or an expression string`);
    }
    return {
      kind: 'py',
      label,
      expr: exprForm ? (typeof spec === 'string' ? spec : spec.expr) : null,
      captureName: objForm ? spec.name : null,
      captureFn: objForm ? spec.fn : null,
      hint,
    };
  },
};

const isOk = (v) => v === true;
const missMessage = (v) => (typeof v === 'string' ? v : undefined);

/**
 * Accept either a real RegExp or the `/pattern/flags` string form, so content
 * authors can write `T.src('...', `/EXPOSE\s+3000/i`)` inside a template
 * literal without the slashes and flags being treated as literal characters.
 */
function toRegExp(spec) {
  if (spec instanceof RegExp) return spec;
  const text = String(spec);
  const m = text.match(/^\/([\s\S]*)\/([a-z]*)$/);
  return m ? new RegExp(m[1], m[2]) : new RegExp(text);
}

function prepare(challenge, code) {
  const checks = challenge.checks || [];
  const files = typeof code === 'string' ? { [challenge.lang || 'js']: code } : code;
  const mainFile = Object.keys(files).find(f => f.endsWith('.html')) || Object.keys(files)[0] || '';
  const source = files[mainFile] || '';
  
  const ctx = {
    challenge,
    source,
    files,
    checks,
    dom: null,
    css: null,
    sqlRun: null,
    jsRun: null,
    lintNotes: [],
    pending: false,
  };

  const domChecks = checks.filter((c) => c.kind === 'dom');
  const cssChecks = checks.filter((c) => c.kind === 'css');
  const sqlChecks = checks.filter((c) => c.kind === 'sql');
  const jsChecks = checks.filter((c) => c.kind === 'js');
  const captureChecks = checks.filter((c) => c.kind === 'capture');

  if (domChecks.length) {
    ctx.dom = new Dom(source, files);
    if (source.trim()) ctx.lintNotes = lint(source);
  }
  if (cssChecks.length) ctx.css = new Css(source, files);
  if (sqlChecks.length) ctx.sqlRun = runSql(source, { schema: challenge.schema || '' });

  if (checks.some((c) => c.kind === 'git')) {
    ctx.repo = createRepo({ files: challenge.files || {}, commands: parseScript(source) });
  }

  const pyChecks = checks.filter((c) => c.kind === 'py');
  if (pyChecks.length) {
    ctx.pyRun = runPy(source, {
      tests: pyChecks.filter((c) => c.expr).map((c) => ({ label: c.label, expr: c.expr })),
      capture: pyChecks.filter((c) => c.captureName).map((c) => ({ name: c.captureName, expr: c.captureName })),
      timeout: challenge.timeout || undefined,
    });
  }

  if (jsChecks.length || captureChecks.length) {
    let jsSource = isMarkup(source) ? extractScripts(source) : source;
    
    // For synthesis, if we have a specific JS file, use that instead of extracted scripts
    const jsFile = Object.keys(files).find(f => f.endsWith('.js') || f.endsWith('.ts'));
    if (jsFile && !isMarkup(source)) {
      jsSource = files[jsFile];
    } else if (jsFile && isMarkup(source)) {
      // combine extracted scripts with the explicit JS file
      jsSource = extractScripts(source) + '\n' + files[jsFile];
    }

    const captureNames = [...new Set(captureChecks.map((c) => c.name))];

    if (challenge.ts) {
      try {
        jsSource = stripTypes(jsSource);
      } catch (err) {
        ctx.jsRun = {
          ok: false,
          error: `TypeScript syntax error: ${err.message}`,
          results: jsChecks.map((c, i) => ({ i, ok: false, error: err.message })),
          captured: {},
          logs: [],
        };
      }
    }

    if (ctx.jsRun) {
      // already failed while stripping types
    } else if (!jsSource.trim() && isMarkup(source)) {
      ctx.jsRun = { ok: true, results: [], captured: {}, logs: [], error: null };
    } else {
      ctx.jsRun = runJs(jsSource, {
        tests: jsChecks.map((c) => ({ label: c.label, expr: c.expr })),
        capture: captureNames,
        timeout: challenge.timeout || 2000,
        domHtml: challenge.fixture ?? null,
        async: !!challenge.async,
        mockFetch: challenge.mockFetch || null,
        prelude: challenge.prelude || '',
        sourceText: source,
      });
      if (ctx.jsRun && typeof ctx.jsRun.then === 'function') ctx.pending = true;
    }
  }

  return ctx;
}

function assemble(ctx) {
  const { checks, jsRun, dom, css, sqlRun, lintNotes, pyRun } = ctx;
  const results = [];
  const jsChecks = checks.filter((c) => c.kind === 'js');
  const pyExprChecks = checks.filter((c) => c.kind === 'py' && c.expr);
  const pyCaptureChecks = checks.filter((c) => c.kind === 'py' && c.captureName);

  for (const check of checks) {
    if (check.kind === 'py') {
      if (pyRun?.unavailable) {
        results.push({ label: check.label, ok: false, message: 'python3 is not installed on this machine', hint: check.hint });
        continue;
      }
      if (check.captureName) {
        const value = pyRun?.captured?.[check.captureName];
        if (value === undefined) {
          results.push({
            label: check.label,
            ok: false,
            message: `add capture('${check.captureName}', …) in your code to record the value`,
            hint: check.hint,
          });
          continue;
        }
        if (value && typeof value === 'object' && '__capture_error__' in value) {
          results.push({ label: check.label, ok: false, message: `capture('${check.captureName}') failed: ${value.__capture_error__}`, hint: check.hint });
          continue;
        }
        try {
          const r = check.captureFn(value);
          results.push({ label: check.label, ok: isOk(r), message: missMessage(r), hint: check.hint });
        } catch (err) {
          results.push({ label: check.label, ok: false, message: err.message, hint: check.hint });
        }
        continue;
      }
      // Expression check: results are positional over pyExprChecks.
      const idx = pyExprChecks.indexOf(check);
      const r = pyRun?.results?.[idx];
      results.push({
        label: check.label,
        ok: !!(r && r.ok),
        message: r && r.error ? r.error : pyRun && pyRun.error && !pyRun.unavailable ? pyRun.error : undefined,
        hint: check.hint,
      });
      continue;
    }

    if (check.kind === 'js') {
      const idx = jsChecks.indexOf(check);
      const r = jsRun?.results?.[idx];
      results.push({
        label: check.label,
        ok: !!(r && r.ok),
        message: r && r.error ? r.error : jsRun && !jsRun.ok ? jsRun.error : undefined,
        hint: check.hint,
      });
      continue;
    }

    if (check.kind === 'capture') {
      if (jsRun && !jsRun.ok) {
        results.push({ label: check.label, ok: false, message: jsRun.error, hint: check.hint });
        continue;
      }
      const value = jsRun?.captured?.[check.name];
      if (value === undefined) {
        results.push({
          label: check.label,
          ok: false,
          message: `expected a value named \`${check.name}\` - did you declare it?`,
          hint: check.hint,
        });
        continue;
      }
      try {
        const r = check.fn(value);
        results.push({ label: check.label, ok: isOk(r), message: missMessage(r), hint: check.hint });
      } catch (err) {
        results.push({ label: check.label, ok: false, message: err.message, hint: check.hint });
      }
      continue;
    }

    if (check.kind === 'src') {
      const re = toRegExp(check.re);
      const found = re.test(ctx.source);
      const pass = check.negate ? !found : found;
      results.push({
        label: check.label,
        ok: pass,
        message: pass ? undefined : check.negate ? 'that pattern is still present in your code' : 'that pattern is missing from your code',
        hint: check.hint,
      });
      continue;
    }

    if (check.kind === 'dom') {
      try {
        const r = check.test(dom);
        results.push({ label: check.label, ok: isOk(r), message: missMessage(r), hint: check.hint });
      } catch (err) {
        results.push({ label: check.label, ok: false, message: err.message, hint: check.hint });
      }
      continue;
    }

    if (check.kind === 'css') {
      try {
        const r = check.test(css);
        results.push({ label: check.label, ok: isOk(r), message: missMessage(r), hint: check.hint });
      } catch (err) {
        results.push({ label: check.label, ok: false, message: err.message, hint: check.hint });
      }
      continue;
    }

    if (check.kind === 'git') {
      const repo = ctx.repo;
      if (!repo || repo.unavailable) {
        results.push({ label: check.label, ok: false, message: 'git is not installed, so this could not be verified', hint: check.hint });
        continue;
      }
      try {
        const r = check.test(repo);
        results.push({ label: check.label, ok: isOk(r), message: missMessage(r), hint: check.hint });
      } catch (err) {
        results.push({ label: check.label, ok: false, message: err.message, hint: check.hint });
      }
      continue;
    }

    if (check.kind === 'sql') {
      if (!sqlRun || sqlRun.error) {
        results.push({ label: check.label, ok: false, message: sqlRun?.error || 'the query did not run', hint: check.hint });
        continue;
      }
      try {
        const r = check.test({ rows: sqlRun.rows, columns: sqlRun.columns, rowsets: sqlRun.rowsets, db: sqlRun.db });
        results.push({ label: check.label, ok: isOk(r), message: missMessage(r), hint: check.hint });
      } catch (err) {
        results.push({ label: check.label, ok: false, message: err.message, hint: check.hint });
      }
      continue;
    }
  }

  const passed = results.length > 0 && results.every((r) => r.ok);
  // Q4 seam (additive, overhaul §5.4 item 2): a check may carry `line` (1-based)
  // — the failure result then points at the source line, so the UI can offer
  // "jump to line". Graders without ranges are unchanged (no `line` field).
  results.forEach((r, i) => {
    const ln = checks[i] && checks[i].line;
    if (Number.isFinite(ln) && ln >= 1) r.line = ln;
  });
  return {
    passed,
    results,
    logs: [...(pyRun?.logs || []), ...(jsRun?.logs || [])],
    error: (pyRun && !pyRun.unavailable && pyRun.error) || (jsRun && !jsRun.ok && jsRun.error) || sqlRun?.error || null,
    lint: lintNotes,
    sql: sqlRun ? { rows: sqlRun.rows, columns: sqlRun.columns, available: sqlRun.available } : null,
  };
}

/** Evaluate every check on a challenge. Awaits transparently for async challenges. */
export function evaluate(challenge, code) {
  const ctx = prepare(challenge, code);
  const finish = () => {
    try {
      return assemble(ctx);
    } finally {
      if (ctx.repo) ctx.repo.cleanup();
    }
  };
  if (ctx.pending) {
    // Async challenges: wait for the sandbox, then reassemble against the
    // *resolved* run - `assemble` reads `ctx.jsRun.results`, and a promise has
    // no results of its own.
    return Promise.resolve(ctx.jsRun).then((resolved) => {
      ctx.jsRun = resolved;
      ctx.pending = false;
      return finish();
    });
  }
  return finish();
}

/**
 * Static analysis used by the "review" panel: warnings that are not failures
 * but that a mentor would point out.
 */
export function review(code, lang = 'js') {
  const notes = [];
  const src = String(code ?? '');

  if (lang === 'js') {
    if (/\bvar\s+/.test(src)) notes.push('Prefer `const`/`let` over `var` - block scoping avoids a whole class of bugs.');
    if (/[^=!<>]==[^=]/.test(src)) notes.push('You used `==`. `===` avoids surprising type coercion.');
    if (/for\s*\(\s*(?:let|var)\s+\w+\s*=\s*0\s*;\s*\w+\s*<\s*\w+\.length/.test(src)) {
      notes.push('This loop works, but `for...of` reads better when you only need the items.');
    }
    const longLines = src.split('\n').filter((l) => l.length > 100).length;
    if (longLines) notes.push(`${longLines} line(s) are over 100 characters - consider wrapping.`);
    if (/console\.log/.test(src)) notes.push('`console.log` is the fastest way to see what your code is doing - keep using it, then delete it.');
    if (/document\.querySelector/.test(src) && !/const |let /.test(src)) notes.push('Store query results in a `const` instead of querying the DOM twice.');
  }

  if (lang === 'html') {
    notes.push(...lint(src));
    if (/<div[^>]*>\s*<div[^>]*>\s*<div/i.test(src)) notes.push('Three or more nested `<div>`s often means a semantic element would read better.');
  }

  if (lang === 'css') {
    const c = new Css(src);
    if (c.uses('width').length && !c.uses('max-width').length) notes.push('Fixed `width` without `max-width` breaks on small screens.');
    if (c.values('color').some((v) => /^#|rgb/.test(v)) && Object.keys(c.customProps()).length === 0) {
      notes.push('Consider CSS custom properties for colours so a theme change is one edit.');
    }
    if (!c.media().length) notes.push('No `@media` queries yet - this sheet is not responsive.');
    if (c.uses('float').length) notes.push('`float` for layout is legacy; Flexbox or Grid is the modern tool.');
    if (c.rules.some((r) => r.decls.some((d) => String(d.value).includes('px')))) notes.push('Mixing px with rem is fine, but keep typography in rem.');
  }

  if (lang === 'sql') {
    if (/\bselect\s+\*/i.test(src)) notes.push('`SELECT *` breaks when the schema changes. Name the columns you actually need.');
    if (!/\bwhere\b/i.test(src) && /\b(update|delete)\b/i.test(src)) notes.push('An UPDATE or DELETE without a WHERE clause hits every row.');
  }

  return notes;
}

export { runJs, runSql, Dom, Css, extractScripts, extractStyles, isMarkup, runPy, pyAvailable };
