/**
 * A sandboxed JavaScript runner.
 *
 * Learner code is executed inside a `node:vm` context with a fake console, no
 * filesystem and no network. Tests are authored as JS *expressions* which are
 * evaluated in the same scope as the learner's code, so `add(2, 3) === 5`
 * genuinely calls their function instead of grepping for a pattern.
 *
 * Async challenges get an `async` wrapper, which means `await` works at the top
 * level, test expressions are awaited too, and a mock `fetch` keeps everything
 * offline and deterministic.
 *
 * Async code runs on a worker thread (see `runJs` below). A synchronous
 * infinite loop is stopped by the vm timeout, but `while (true) { await x }`
 * starves the event loop so no timer can ever fire - the only way out of that
 * is to kill the thread it runs on.
 */

import { Worker } from 'node:worker_threads';
import vm from 'node:vm';
import { createDom } from './domshim.js';

const stringify = (v) => {
  if (typeof v === 'string') return v;
  if (v === undefined) return 'undefined';
  if (typeof v === 'function') return `[Function ${v.name || 'anonymous'}]`;
  if (typeof v === 'bigint') return `${v}n`;
  try {
    const s = JSON.stringify(v);
    return s === undefined ? String(v) : s;
  } catch {
    return String(v);
  }
};

/** Offline stand-in for fetch, driven by a per-challenge mock table. */
function makeFetch(mock = {}) {
  return async (url, options = {}) => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    const target = String(url);
    const key = Object.keys(mock).find((k) => target.includes(k));
    const response = (body) => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      url: target,
      headers: { get: (h) => (String(h).toLowerCase() === 'content-type' ? 'application/json' : null) },
      json: async () => body,
      text: async () => JSON.stringify(body),
    });
    if (key === undefined) {
      return {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        url: target,
        headers: { get: () => null },
        json: async () => {
          throw new Error(`404 for ${target}`);
        },
        text: async () => 'Not Found',
      };
    }
    const body = mock[key];
    return typeof body === 'function' ? body(options) : response(body);
  };
}

function cleanError(err) {
  const msg = err && err.message ? String(err.message) : String(err);
  if (/Script execution timed out|timed out/i.test(msg)) {
    return 'Timed out - looks like an infinite loop. Check your loop conditions.';
  }
  return msg.replace(/^challenge\.js:\d+\s*/, '');
}

function buildSource(code, { capture, tests, domBootstrap, async, prelude = '' }) {
  const captureSource = capture.length
    ? `__captured = { ${capture.map((n) => `${JSON.stringify(n)}: (typeof ${n} !== 'undefined' ? ${n} : undefined)`).join(', ')} };`
    : '';

  // Each test expression is an independent observation, so a prelude may
  // declare `__beforeTest()` to reset whatever harness state it keeps (the
  // React shim uses it to give every check a fresh component instance).
  const testsSource = tests
    .map(
      (t, i) => `
  try {
    if (typeof __beforeTest === 'function') __beforeTest();
    const __observed = ${async ? 'await ' : ''}(${t.expr});
    // A string is an explanation, not a pass: writing "cond || 'why it failed'"
    // is how a check carries a message, and it only works if the returned
    // string is treated as the miss. Anything else truthy passes.
    if (typeof __observed === 'string') __results.push({ i: ${i}, ok: false, error: __observed });
    else __results.push({ i: ${i}, ok: !!__observed });
  } catch (err) {
    __results.push({ i: ${i}, ok: false, error: err && err.message ? err.message : String(err) });
  }`,
    )
    .join('\n');

  return `${async ? '(async function () {' : '(function () {'}
  const __logs = [];
  const __fmt = __stringify;
  const console = {
    log: (...a) => __logs.push(a.map(__fmt).join(' ')),
    info: (...a) => __logs.push(a.map(__fmt).join(' ')),
    warn: (...a) => __logs.push('warn: ' + a.map(__fmt).join(' ')),
    error: (...a) => __logs.push('error: ' + a.map(__fmt).join(' ')),
    table: (v) => __logs.push(__fmt(v)),
    debug: () => {},
    group: () => {},
    groupEnd: () => {},
    time: () => {},
    timeEnd: () => {},
  };
  let __captured = {};
  const __results = [];
  // The learner's original source, exactly as typed - useful for checks that
  // assert on the types or patterns they wrote (TypeScript annotations are
  // stripped from the code we execute, so they can only be seen here).
  const __src = __source;
  // Every check in the curriculum can fail loudly: __must(condition, message)
  // turns a false into an error whose message the learner actually reads.
  const __must = (condition, message) => {
    if (!condition) throw new Error(message || 'not quite right yet');
    return true;
  };
  const __show = (value) => {
    if (typeof value === 'string') return JSON.stringify(value);
    if (value === undefined) return 'undefined';
    try {
      const json = JSON.stringify(value);
      return json === undefined ? String(value) : json;
    } catch (err) {
      return String(value);
    }
  };

  const require = (name) => { throw new Error('require("' + name + '") is not available in the TUI sandbox'); };
  const process = undefined;
${prelude}
${code}
  ${domBootstrap}
  ${captureSource}
${testsSource}
  return { __results, __captured, __logs };
})()`;
}

/**
 * Run `code` in this thread and collect test results.
 *
 * @param {string} code learner source
 * @param {object} opts
 * @param {{label:string, expr:string}[]} opts.tests  expressions evaluated in scope
 * @param {string[]} opts.capture  variable names to read back out of the sandbox
 * @param {number} opts.timeout  milliseconds before we assume an infinite loop
 * @param {string} opts.domHtml  when set, a DOM is built from this fixture and injected
 * @param {boolean} opts.async  wrap in an async function so `await` works
 * @param {object} opts.mockFetch  URL fragment -> JSON body for the offline fetch
 * @param {string} opts.prelude  code injected before the learner's, for challenge-specific helpers
 * @param {string} opts.sourceText  the learner's original source, exposed to checks as `__src`
 */
export function runInProcess(code, opts = {}) {
  const {
    tests = [],
    capture = [],
    timeout = 2000,
    extraLogs = [],
    domHtml = null,
    async = false,
    mockFetch = null,
  } = opts;

  const out = {
    ok: true,
    error: null,
    stack: null,
    results: [],
    captured: {},
    logs: [...extraLogs],
    dom: null,
  };

  /** Wrap a timer callback so its failures are recorded rather than fatal. */
  const asyncErrors = [];
  const safeCallback = (fn) => (...args) => {
    try {
      const returned = fn(...args);
      if (returned && typeof returned.catch === 'function') {
        returned.catch((err) => asyncErrors.push(`async error: ${err && err.message ? err.message : err}`));
      }
      return returned;
    } catch (err) {
      asyncErrors.push(`async error: ${err && err.message ? err.message : err}`);
      return undefined;
    }
  };

  const dom = domHtml == null ? null : createDom(domHtml);
  out.dom = dom;
  const domBootstrap = dom ? 'if (typeof document !== "undefined") document.dispatchEvent("DOMContentLoaded");' : '';

  const wrapped = buildSource(code, { capture, tests, domBootstrap, async, prelude: opts.prelude || '' });

  const sandbox = {
    __stringify: stringify,
    __source: String(opts.sourceText ?? code),
    // Learner code schedules timers with abandon. A throw inside a callback
    // becomes a recorded log line instead of an uncaught exception that would
    // take the whole TUI down with it.
    setTimeout: (fn, ms, ...rest) => setTimeout(safeCallback(fn), ms, ...rest),
    clearTimeout,
    setInterval: (fn, ms, ...rest) => setInterval(safeCallback(fn), ms, ...rest),
    clearInterval,
    queueMicrotask,
    JSON,
    Math,
    Date,
    Object,
    Array,
    String,
    Number,
    Boolean,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Symbol,
    Promise,
    RegExp,
    Error,
    TypeError,
    RangeError,
    SyntaxError,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    structuredClone,
    fetch: makeFetch(mockFetch || {}),
    AbortController,
  };

  if (dom) {
    Object.assign(sandbox, {
      document: dom.document,
      // In a browser `window` *is* the global object, so `window.count = fn`
      // makes `count()` callable on its own. Plenty of DOM exercises - and the
      // dev-tools console - rely on that, so the proxy mirrors assignments
      // onto the sandbox global rather than keeping them on a private object.
      window: new Proxy(dom.window, {
        has: (target, key) => Reflect.has(target, key) || key in sandbox,
        get: (target, key) => (Reflect.has(target, key) ? Reflect.get(target, key) : sandbox[key]),
        set: (target, key, value) => {
          Reflect.set(target, key, value);
          sandbox[key] = value;
          return true;
        },
        deleteProperty: (target, key) => {
          Reflect.deleteProperty(target, key);
          delete sandbox[key];
          return true;
        },
      }),
      Element: dom.Element,
      Event: dom.Event,
      __click: dom.__click,
      __fire: dom.__fire,
      __text: dom.__text,
      __count: dom.__count,
      __attr: dom.__attr,
      __value: dom.__value,
      __has: dom.__has,
      __html: dom.__html,
    });
  }
  sandbox.globalThis = sandbox;

  const absorb = (returned) => {
    out.results = (returned && returned.__results) || [];
    out.captured = (returned && returned.__captured) || {};
    out.logs = out.logs.concat((returned && returned.__logs) || []);
    out.logs = out.logs.concat(asyncErrors);
    return out;
  };

  const blowUp = (err) => {
    out.ok = false;
    out.error = cleanError(err);
    out.stack = err && err.stack ? String(err.stack).split('\n').slice(0, 4).join('\n') : null;
    out.results = tests.map((t, i) => ({ i, ok: false, error: out.error }));
    return out;
  };

  let script;
  try {
    script = new vm.Script(wrapped, { filename: 'challenge.js' });
  } catch (err) {
    return blowUp(err);
  }

  const context = vm.createContext(sandbox);

  if (!async) {
    try {
      return absorb(script.runInContext(context, { timeout }));
    } catch (err) {
      return blowUp(err);
    }
  }

  // Async: race the learner's promise against a hard deadline so a forgotten
  // `resolve()` cannot hang the TUI.
  const guard = new Promise((_, reject) => {
    const t = setTimeout(() => reject(new Error('Timed out waiting for your async code to settle.')), timeout + 1500);
    if (typeof t.unref === 'function') t.unref();
  });

  return Promise.race([script.runInContext(context, { timeout }), guard])
    .then(absorb)
    .catch(blowUp);
}

export { stringify };

// ---------------------------------------------------------------------------
// Worker-backed execution for async challenges
// ---------------------------------------------------------------------------

/** The shape `blowUp` produces, so a killed worker looks like any other run. */
function timedOut(tests, message) {
  return {
    ok: false,
    error: message,
    stack: null,
    results: tests.map((t, i) => ({ i, ok: false, error: message })),
    captured: {},
    logs: [],
  };
}

const INFINITE_LOOP =
  'Timed out - looks like an infinite loop. Check your loop conditions.';

/**
 * Run async learner code on a worker thread so it can be terminated.
 *
 * Always resolves with the same result object that `runInProcess` returns; if
 * workers are unavailable it falls back to running in this thread.
 */
function runInWorker(code, opts) {
  if (typeof Worker !== 'function') return runInProcess(code, opts);

  const tests = opts.tests || [];
  const payload = {
    code,
    tests,
    capture: opts.capture || [],
    timeout: opts.timeout || 2000,
    extraLogs: opts.extraLogs || [],
    domHtml: opts.domHtml ?? null,
    async: true,
    mockFetch: opts.mockFetch || null,
    prelude: opts.prelude || '',
    sourceText: opts.sourceText ?? code,
  };

  return new Promise((resolve) => {
    let worker;
    try {
      // `execArgv: []` matters: an inherited `--input-type` (or any other
      // eval-only flag) otherwise makes the worker fail to load its entry file.
      worker = new Worker(new URL('./runner-worker.js', import.meta.url), { execArgv: [] });
    } catch {
      resolve(runInProcess(code, opts));
      return;
    }

    let settled = false;
    let timer = null;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      worker.terminate().catch(() => {});
      resolve(result);
    };

    // The main thread is never starved by the worker, so this timer always
    // fires - even when the learner's code is stuck in a microtask loop.
    timer = setTimeout(() => finish(timedOut(tests, INFINITE_LOOP)), (opts.timeout || 2000) + 1500);

    worker.on('message', (message) => {
      if (message && message.result) finish(message.result);
      else finish(timedOut(tests, (message && message.error) || 'The sandbox stopped unexpectedly.'));
    });
    // A worker that never got as far as running the job is an environment
    // problem, not learner code: grade it here so the answer is still correct.
    worker.on('error', () => finish(runInProcess(code, opts)));
    worker.on('exit', () => {
      if (!settled) finish(timedOut(tests, INFINITE_LOOP));
    });

    try {
      worker.postMessage(payload);
    } catch {
      // The payload (a mock fetch table, say) was not cloneable: run it here.
      finish(runInProcess(code, opts));
    }
  });
}

/**
 * Run `code` and collect test results.
 *
 * Synchronous code stays in this thread (the vm timeout contains it and the
 * round-trip to a worker would only slow grading down); async code is handed to
 * a worker thread that can always be terminated.
 */
export function runJs(code, opts = {}) {
  if (!opts.async) return runInProcess(code, opts);
  return runInWorker(code, opts);
}
