/**
 * Python runner (module 10 — Python).
 *
 * Same trust model as the git sandbox: the learner's code runs on THEIR
 * machine (the app already executes learner JavaScript and opens $EDITOR),
 * so this is not a security boundary — it is a safety harness:
 *
 *   - `python3 -I -B` (isolated: no user site-packages, no env vars,
 *     no bytecode files written);
 *   - run from a throwaway temp directory;
 *   - hard timeout, stdout/stderr captured;
 *   - a capture protocol: the challenge's `capture()` snippets append JSON
 *     lines to stdout, which the runner parses back into values.
 *
 * `pyAvailable()` gates everything the same way `gitAvailable()` does —
 * missing python3 means challenges show a clean "install Python" note
 * instead of failures. Nothing here writes outside its temp directory.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const PY_TIMEOUT = 8000;
const MARKER = '__FULLSTACK_TUI__';

function py(args, { cwd, timeout = PY_TIMEOUT } = {}) {
  const result = spawnSync('python3', ['-I', '-B', ...args], {
    encoding: 'utf8',
    timeout,
    cwd,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONDONTWRITEBYTECODE: '1' },
  });
  return {
    code: result.status ?? 1,
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || ''),
    timedOut: result.error?.code === 'ETIMEDOUT' || (result.status === null && result.signal === 'SIGTERM'),
  };
}

let cachedAvailable = null;

export function pyAvailable() {
  if (cachedAvailable !== null) return cachedAvailable;
  try {
    const r = py(['-c', 'import sys; print(sys.version_info[0])']);
    cachedAvailable = r.code === 0 && r.stdout.trim() === '3';
  } catch {
    cachedAvailable = false;
  }
  return cachedAvailable;
}

/** Test seam: force the availability probe result. */
export function setPyAvailable(v) {
  cachedAvailable = v;
}

/**
 * The prelude every run gets. It provides:
 *   - `capture(name, value)` — records a value for the grading layer;
 *   - a guarded `main` guard is NOT injected (learners write top-level code
 *     like in the JS sandbox; we run the file directly).
 */
const CAPTURE_PRELUDE = `
import json as _json, sys as _sys
def capture(name, value):
    globals()[name] = value  # bind so later capture evals can re-read the value
    _sys.stdout.write("${MARKER}" + _json.dumps({"n": name, "v": value}) + "\\n")
`;

/**
 * Run learner Python with checks.
 *
 * `code`   — the learner's source.
 * `tests`  — [{ label, expr }] where `expr` is Python source evaluated AFTER
 *            the learner's code, expected to produce a truthy value. Names
 *            from the learner's module are in scope.
 * `capture`— [{ name, fn }] — `fn(value)` runs in Node on the captured value
 *            (JSON round-trip applies: objects→plain, no functions).
 *
 * Returns { ok, results[], captured{}, logs[], error, unavailable } — the
 * same shape `runJs` produces so `assemble()` can treat them alike.
 */
export function runPy(code, { tests = [], capture = [], timeout = PY_TIMEOUT } = {}) {
  if (!pyAvailable()) {
    return {
      ok: false,
      unavailable: true,
      results: tests.map((t) => ({ label: t.label, ok: false, error: 'python3 is not installed' })),
      captured: {},
      logs: [],
      error: 'python3 was not found on this machine - install Python 3.8+ to run these challenges',
    };
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fullstack-py-'));
  try {
    const lines = [CAPTURE_PRELUDE, String(code ?? ''), ''];
    // Captures: re-print marked JSON after the learner's code so values can
    // be read back even though stdout mixing with prints is inevitable.
    for (const c of capture) {
      lines.push(`try:\n    capture(${pyStr(c.name)}, eval(${pyStr(c.expr)}))\nexcept Exception as _e:\n    capture(${pyStr(c.name)}, {"__capture_error__": str(_e)})`);
    }
    // Checks: each expr evaluated in order; result line is a JSON array of
    // booleans printed through the marker so learner prints cannot fake it.
    if (tests.length) {
      const arr = tests.map((t) => `bool(eval(${pyStr(t.expr)}))`).join(', ');
      lines.push(`try:\n    _res = [${arr}]\nexcept Exception as _e:\n    _res = _e\n`);
      lines.push(`capture("__checks__", _res if not isinstance(_res, Exception) else {"__check_error__": str(_res)})`);
    }
    lines.push('');

    const file = path.join(dir, 'learner.py');
    fs.writeFileSync(file, lines.join('\n'));

    const r = py([file], { cwd: dir, timeout });

    // Split learner stdout from capture lines. The trailing '' from the final
    // newline is an artifact, not learner output.
    const logs = [];
    const captures = [];
    const outLines = r.stdout.split('\n');
    if (outLines.length && outLines[outLines.length - 1] === '') outLines.pop();
    for (const line of outLines) {
      if (line.startsWith(MARKER)) {
        try {
          captures.push(JSON.parse(line.slice(MARKER.length)));
        } catch {
          /* truncated marker line — ignore */
        }
      } else {
        logs.push(line);
      }
    }

    const captured = {};
    let checkError = null;
    let checkResults = null;
    for (const c of captures) {
      if (c.n === '__checks__') {
        if (c.v && typeof c.v === 'object' && '__check_error__' in c.v) checkError = c.v.__check_error__;
        else checkResults = c.v;
      } else {
        captured[c.n] = c.v;
      }
    }

    const syntaxFailed = r.code !== 0 && !checkResults && /SyntaxError|IndentationError/.test(r.stderr);
    const timedOut = r.timedOut;
    // A crash anywhere in the learner's module (before checks ran) surfaces
    // the traceback on every result, the way runJs does.
    const moduleError = syntaxFailed || timedOut || (r.code !== 0 && !checkResults)
      ? timedOut ? 'your code ran too long - is there an infinite loop?' : firstErrorLine(r.stderr)
      : null;

    const results = tests.map((t, i) => {
      if (moduleError) return { label: t.label, ok: false, error: moduleError };
      if (checkError !== null && checkError !== undefined) {
        return { label: t.label, ok: false, error: `check failed to run: ${checkError}` };
      }
      const v = checkResults ? checkResults[i] : false;
      return { label: t.label, ok: v === true, error: v === true ? undefined : 'that check did not pass' };
    });

    return {
      ok: results.every((x) => x.ok) && !moduleError,
      unavailable: false,
      results,
      captured,
      logs,
      error: moduleError || (checkError !== null && checkError !== undefined ? `check failed to run: ${checkError}` : null),
      stderr: r.stderr,
    };
  } finally {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* OS will reclaim the temp dir */
    }
  }
}

/** First meaningful line of a Python traceback for the error UI. */
function firstErrorLine(stderr) {
  const lines = String(stderr || '').split('\n').filter(Boolean);
  const err = lines.filter((l) => /^(Traceback|[A-Za-z_.]*(Error|Exception))/i.test(l.trim()));
  return (err[err.length - 1] || lines[lines.length - 1] || 'unknown error').trim();
}

/** Python string literal for embedding source safely. */
function pyStr(s) {
  const json = JSON.stringify(String(s ?? ''));
  // JSON strings are valid Python strings except for \\u escapes of lone
  // surrogates, which Python 3 also accepts — good enough for check source.
  return json;
}
