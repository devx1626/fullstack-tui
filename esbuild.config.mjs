/**
 * esbuild pipeline for fullstack-tui.
 *
 * Phase 0: builds src/main.jsx → dist/main.js (the FULLSTACK_UI=next entry)
 * and spike/*.jsx → dist/spike/ (Ink feasibility probes). The classic UI
 * (src/index.js) is not bundled — it runs straight from source until the
 * Phase 4 cut-over.
 */
import * as esbuild from 'esbuild';
import { existsSync, readdirSync } from 'node:fs';
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
  // Ink deps (signal-exit etc.) still call require() for node builtins;
  // give the ESM bundle a working require via createRequire.
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
};

// Named entries keep output paths exact: dist/main.js and dist/spike/*.js.
// Spikes are opt-in (npm run build -- --spike): production builds ship only
// the app entry (E3 fix — spike artifacts never leak into a default build).
const entries = [{ in: 'src/main.jsx', out: 'main' }];
if (process.argv.includes('--spike')) {
  const spikeDir = join(here, 'spike');
  if (existsSync(spikeDir)) {
    for (const f of readdirSync(spikeDir)) {
      if (/\.jsx$/.test(f)) entries.push({ in: `spike/${f}`, out: `spike/${f.replace(/\.jsx$/, '')}` });
    }
  }
}

if (watch) {
  const ctx = await esbuild.context({ ...base, entryPoints: entries, outdir: join(here, 'dist'), absWorkingDir: here });
  await ctx.watch();
  console.log('[esbuild] watching for changes...');
} else {
  await esbuild.build({ ...base, entryPoints: entries, outdir: join(here, 'dist'), absWorkingDir: here });
}
