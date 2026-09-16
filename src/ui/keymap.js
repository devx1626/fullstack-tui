/**
 * Keymap loader (overhaul task 0.7 remainder).
 *
 * Reads `.data/keymap.json` — a map of command id → binding string — and
 * merges it over the registry defaults. Diagnostics (unknown ids, invalid
 * bindings, conflicts) are returned, never thrown: a broken user keymap must
 * not stop the TUI. The app loads this once at startup; tools/check.js keeps
 * linting the *defaults* so local experiments don't fail repo checks.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeKeymap, lintKeymap } from './commands.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const KEYMAP_FILE = path.join(HERE, '..', '..', '.data', 'keymap.json');

/** Parse the keymap file; anything invalid becomes a diagnostic, not a crash. */
export function readKeymapFile(file = KEYMAP_FILE) {
  // `null` means "defaults only" (used by the test runner, below).
  if (!file) return { map: {}, error: null };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { map: {}, error: 'keymap: file is not an object' };
    }
    return { map: parsed, error: null };
  } catch (err) {
    if (err && err.code === 'ENOENT') return { map: {}, error: null }; // no file = defaults
    return { map: {}, error: 'keymap: unreadable or corrupt file (using defaults)' };
  }
}

/**
 * Load the effective keymap: defaults + user overrides.
 * @returns {{ keymap: Map<string,string|null>, problems: string[] }}
 */
export function loadKeymap(file = KEYMAP_FILE) {
  const { map, error } = readKeymapFile(file);
  const merged = mergeKeymap(map);
  const problems = error ? [error] : [];
  for (const id of merged.unknown) problems.push(`keymap: unknown command id "${id}"`);
  problems.push(...lintKeymap(merged));
  return { keymap: merged.keymap, bindings: merged.bindings, problems };
}

let effective = null;

/**
 * The effective keymap for the running app — defaults + user overrides,
 * loaded once per process and cached. useKeymap resolves keys through this,
 * so `.data/keymap.json` rebinds take effect without a restart of the code
 * path (a broken file only produces diagnostics).
 */
export function effectiveKeymap() {
  if (!effective) {
    // Deterministic under the test runner (node:test marks its children with
    // NODE_TEST_CONTEXT): a developer's local rebind experiment in
    // `.data/keymap.json` must not be able to fail the suite.
    effective = loadKeymap(process.env.NODE_TEST_CONTEXT ? null : KEYMAP_FILE);
  }
  return effective;
}
