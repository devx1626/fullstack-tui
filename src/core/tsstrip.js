/**
 * TypeScript type stripping.
 *
 * Node ships an erasable-syntax stripper, which is exactly what we need: the
 * learner writes real TypeScript and we remove the annotations before handing
 * the file to the `node:vm` sandbox, so the behaviour of their code is really
 * executed.
 *
 * What this does NOT do is type-check. Nothing here can catch a wrong type -
 * `npx tsc --noEmit` is the tool for that, and the lessons say so. The checks
 * in the TypeScript module therefore assert two things: behaviour (by running
 * the stripped code) and declared shape (by inspecting the annotations the
 * learner actually wrote).
 */

let stripTypeScriptTypes = null;

try {
  const mod = await import('node:module');
  stripTypeScriptTypes = typeof mod.stripTypeScriptTypes === 'function' ? mod.stripTypeScriptTypes : null;
} catch {
  stripTypeScriptTypes = null;
}

export const tsAvailable = () => stripTypeScriptTypes !== null;

/**
 * Node prints "ExperimentalWarning: stripTypeScriptTypes ..." to stderr the
 * first time the API is used. stderr writes land straight in the middle of the
 * alternate screen, so the one line everybody using this module expects is
 * dropped, and every other warning is passed through untouched.
 */
const SILENCED = 'ExperimentalWarning: stripTypeScriptTypes';
function silenceThatOneWarning() {
  const original = process.stderr.write;
  process.stderr.write = function filtered(chunk, ...rest) {
    const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
    if (text.includes(SILENCED)) return true;
    return original.call(process.stderr, chunk, ...rest);
  };
}

if (stripTypeScriptTypes) silenceThatOneWarning();

/**
 * Remove type annotations, keeping the code's line count so error messages and
 * any line-numbered feedback still point at the right place.
 */
export function stripTypes(code) {
  if (!stripTypeScriptTypes) {
    throw new Error('This Node version has no TypeScript stripper - upgrade to Node 22.13 or newer.');
  }
  return stripTypeScriptTypes(String(code), { mode: 'strip' });
}
