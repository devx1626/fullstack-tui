/**
 * TypeScript type stripping.
 *
 * The engine is esbuild's `transformSync` with `loader: 'ts'` — the same
 * transform the build itself uses, from a package already in `dependencies`,
 * so the lane adds no dependency and has no Node version floor beyond the
 * app's own (`engines` says >=20.9; the previous engine here was
 * `node:module`.stripTypeScriptTypes, which needs Node 22.13+).
 *
 * What this does NOT do is type-check. Nothing here can catch a wrong type —
 * `npx tsc --noEmit` is the tool for that, and the lessons say so. The checks
 * in the TypeScript module therefore assert two things: behaviour (by running
 * the stripped code) and declared shape (by inspecting the annotations the
 * learner actually wrote).
 */

import { transformSync } from 'esbuild';

/**
 * Availability probe, parity with grade.js's `pyAvailable`: esbuild is a hard
 * dependency, so the lane is always on — the function exists so callers can
 * ask instead of assuming, the way they already do for the Python lane.
 */
export const tsAvailable = () => true;

/**
 * esbuild reports type-syntax failures as esbuild `Error` objects whose
 * message bundles every diagnostic ("Transform failed with N errors:\n
 * <stdin>:1:18: ERROR: ..."). Learner-facing errors go through one line of
 * status bar, so keep only the FIRST diagnostic, drop the meaningless
 * `<stdin>` file name, and keep the line/column: the editor shows the
 * learner's unstripped source, where those coordinates are correct.
 * Returns null when the shape is not one we can compact.
 */
export function compactTsError(err) {
  const raw = err && err.message !== undefined ? String(err.message) : String(err);
  const m = /(\d+):(\d+):\s*ERROR:\s*(.+)/.exec(raw);
  if (!m) return null;
  const first = m[3].split('\n', 1)[0].trim();
  if (!first) return null;
  return `TypeScript syntax error (line ${m[1]}, col ${m[2]}): ${first}`;
}

/**
 * Remove type annotations, keeping line positions stable so runtime error
 * line numbers still point at the learner's source (annotations vanish in
 * place; only a trailing re-emitted export block can add lines, and only
 * after the learner's own statements). Throws an esbuild `Error` on
 * type-syntax failure — see `compactTsError` for the learner-facing form.
 */
export function stripTypes(code) {
  const out = transformSync(String(code), {
    loader: 'ts',
    format: 'esm', // preserve import/export exactly as the learner wrote them
    target: 'node20',
    logLevel: 'silent',
  });
  return out.code;
}
