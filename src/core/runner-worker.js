/**
 * Worker entry point for the JavaScript sandbox.
 *
 * The main thread cannot preempt `while (true) { await x }`, so async code is
 * handed to this thread and killed by the main thread if it will not settle.
 * Each job builds its own vm context, and the main thread terminates the worker
 * afterwards, so nothing leaks between grades.
 */

import { parentPort } from 'node:worker_threads';
import { runInProcess } from './runner.js';

/** Structured clone rejects functions; fall back to their source text. */
function cloneable(value) {
  try {
    return structuredClone(value);
  } catch {
    return typeof value === 'function' ? String(value) : String(value);
  }
}

function sanitize(out) {
  return {
    ok: !!out.ok,
    error: out.error ?? null,
    stack: out.stack ?? null,
    results: out.results || [],
    logs: out.logs || [],
    captured: Object.fromEntries(Object.entries(out.captured || {}).map(([k, v]) => [k, cloneable(v)])),
  };
}

function run(job) {
  return runInProcess(job.code, {
    tests: job.tests || [],
    capture: job.capture || [],
    timeout: job.timeout || 2000,
    extraLogs: job.extraLogs || [],
    domHtml: job.domHtml ?? null,
    async: !!job.async,
    mockFetch: job.mockFetch || null,
    prelude: job.prelude || '',
    sourceText: job.sourceText ?? job.code,
  });
}

if (parentPort) {
  parentPort.on('message', (job) => {
    let result;
    try {
      result = run(job);
    } catch (err) {
      parentPort.postMessage({ error: err && err.message ? err.message : String(err) });
      return;
    }
    if (result && typeof result.then === 'function') {
      result.then(
        (out) => parentPort.postMessage({ result: sanitize(out) }),
        (err) => parentPort.postMessage({ error: err && err.message ? err.message : String(err) }),
      );
    } else {
      parentPort.postMessage({ result: sanitize(result) });
    }
  });
}
