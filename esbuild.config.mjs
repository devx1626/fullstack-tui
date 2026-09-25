/**
 * esbuild pipeline for fullstack-tui.
 *
 * Builds src/main.jsx → dist/main.js (the FULLSTACK_UI=next entry) and
 * src/ui/harness.jsx → dist/harness.js (the bundle the unit render tests drive
 * real components through). The classic UI (src/index.js) is not bundled — it
 * runs straight from source until the Phase 4 cut-over.
 */
import * as esbuild from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const base = {
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  jsx: 'automatic',
  jsxImportSource: 'react',
  sourcemap: 'inline',
  logLevel: 'info',
  // Optional ink peer: aliased to a stub so the bundle has no runtime dep on
  // devtools machinery we never enable.
  alias: { 'react-devtools-core': './src/ui/emptyDevtools.js' },
  // P0-3 (M1): Playwright is a hard-OPTIONAL dependency — screenshot.js only
  // ever dynamic-imports it, and it is not installed by default. Keep it out
  // of the bundle graph entirely; the loader throws at runtime (caught by
  // isPlaywrightAvailable → guidance) when the user has not installed it.
  external: ['playwright'],
  // Ink deps (signal-exit etc.) still call require() for node builtins;
  // give the ESM bundle a working require via createRequire. The binding is
  // renamed so bundled sources that import `createRequire` themselves (e.g.
  // src/core/sqlrun.js) don't collide with the banner's top-level declaration.
  banner: {
    js: "import { createRequire as __bundle_createRequire } from 'node:module'; const require = __bundle_createRequire(import.meta.url);",
  },
};

// Named entries keep output paths exact: dist/main.js and dist/harness.js.
// The harness is always built — the unit suites and tools/check.js render the
// real components through it; without it those checks silently skip.
const entries = [
  { in: 'src/main.jsx', out: 'main' },
  { in: 'src/ui/harness.jsx', out: 'harness' },
];

if (watch) {
  const ctx = await esbuild.context({ ...base, entryPoints: entries, outdir: join(here, 'dist'), absWorkingDir: here });
  await ctx.watch();
  console.log('[esbuild] watching for changes...');
} else {
  await esbuild.build({ ...base, entryPoints: entries, outdir: join(here, 'dist'), absWorkingDir: here });
}
