/**
 * Snapshot test helper (Phase 0 scaffolding for spec §11 test strategy).
 *
 * Renders an ink element against a fake stdout — the exact mechanism the
 * spike verified (`render()` accepts fake streams) — and resolves with the
 * final frame as a plain string. Golden-file assertions in Phase 1 build on
 * this instead of each test re-implementing the stream plumbing.
 *
 * Usage in a .js test file:
 *   const { renderToText, stripAnsi } = await import(harnessPath);
 *   const out = await renderToText(el(Header, { title: 'x' }));
 */
import { Writable, Readable } from 'node:stream';
import assert from 'node:assert/strict';

/** A fake stdin so ink's useInput never touches the real terminal. */
function fakeStdin() {
  const s = new Readable({ read() {} });
  s.isTTY = true;
  s.setRawMode = () => {};
  s.resume = () => {};
  s.pause = () => {};
  return s;
}

/** A fake stdout with ink's required shape. */
export function fakeStdout(columns = 80, rows = 24) {
  const chunks = [];
  const out = new Writable({
    write(chunk, _enc, cb) { chunks.push(chunk.toString()); cb(); },
  });
  out.columns = columns;
  out.rows = rows;
  out.chunks = chunks;
  return out;
}

/**
 * Render one element, settle, unmount, resolve with the full write stream.
 *
 * `render` MUST come from the same bundle that created the element (e.g.
 * `harness.render` from dist/harness.js) — mixing a bundled React with a
 * node_modules ink copy triggers the two-React useContext crash.
 * `settleMs` must outlast ink's post-render timers so one-shot writes land.
 */
export function renderToText(element, { render, columns = 80, rows = 24, settleMs = 40 } = {}) {
  if (!render) throw new Error('renderToText: pass a render fn from the element\'s own bundle');
  const out = fakeStdout(columns, rows);
  const instance = render(element, {
    stdin: fakeStdin(),
    stdout: out,
    exitOnCtrlC: false,
    patchConsole: false,
  });
  return new Promise((resolve) => {
    setTimeout(() => {
      instance.unmount();
      setTimeout(() => resolve(out.chunks.join('')), 20);
    }, settleMs);
  });
}

/** Remove ANSI escape sequences for text-level assertions. */
export function stripAnsi(s) {
  return s.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '');
}

/** Golden-file update mode: npm test with UPDATE_SNAPSHOTS=1 rewrites goldens. */
export const UPDATE_SNAPSHOTS = !!process.env.UPDATE_SNAPSHOTS;

/** Strip volatile whitespace (trailing spaces, blank-line runs) for goldens. */
export function normalizeFrame(s) {
  return stripAnsi(s)
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

/**
 * Compare against (or create) a golden file under tests/snapshots/.
 * Resolution: UPDATE_SNAPSHOTS=1 writes; otherwise deep-equal or throw.
 */
export async function assertGolden(name, frameText) {
  const { writeFileSync, mkdirSync, existsSync, readFileSync } = await import('node:fs');
  const { dirname, join } = await import('node:path');
  const goldenPath = join(process.cwd(), 'tests', 'snapshots', `${name}.snap`);
  const normalized = normalizeFrame(frameText);
  // Guard: a render that crashed mid-mount would snapshot its own error frame
  // and permanently poison the golden. Refuse to capture anything that looks
  // like a caught-error dump (harness/snapshot.test.js run order proved this).
  if (/ERROR\s+Cannot (read|convert)|useContext|ERR_UNCAUGHT/i.test(normalized)) {
    throw new Error(
      `assertGolden(${name}): frame looks like a render error, refusing to capture.\n`
      + `Fix the component first; the old golden (if any) is left untouched.`,
    );
  }
  if (UPDATE_SNAPSHOTS || !existsSync(goldenPath)) {
    mkdirSync(dirname(goldenPath), { recursive: true });
    writeFileSync(goldenPath, normalized);
    return { created: true };
  }
  const golden = readFileSync(goldenPath, 'utf8');
  assert.equal(normalized, golden, `Snapshot mismatch for ${name}`);
  return { created: false };
}
