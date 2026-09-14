# Ink Spike — Phase 0 Task 0.2 Results

**Date:** 2026-09-14 · **Env:** Node v22.23.2, Linux (sandbox, pty via `script`)
**Versions installed:** `ink@6.8.0` (pinned via `ink@^6`; npm `latest` resolves to 7.1.1 which needs Node ≥ 22), `react@19.3.0`, `esbuild@0.28.2`

## What was probed (spike/spike-a.jsx, spike/spike-b.jsx)

| Probe | Result | Consequence |
|---|---|---|
| B: hook surface of ink@6.8.0 | `useInput`, `useFocus`, `useFocusManager`, `useCursor`, `useApp`, `useStdin/out/err` PRESENT · `usePaste`, `useBoxMetrics`, `useWindowSize`, `useAnimation` **MISSING** | The upstream README documents the *upcoming* (Ink 7) API. On 6.8.0 we own: window size (trivial: `process.stdout.columns/rows` + SIGWINCH — port of classic `dimensions()`), paste grouping (already planned first-party, §A.3), box metrics (measure rendered children), animation |
| B: `contentOffsetY` on `<Box>` | **VERIFIED** — prop accepted *and* offsets render (`row0` scrolled out of a clipped viewport) | ScrollPane can build on `contentOffset` + `overflow="hidden"` instead of hand-rolling a viewport slice |
| A1: fake-stdout render + `waitUntilExit` | **PASS** | Snapshot tests + replay harness drive the real tree headlessly (spec §13) — supported as-is |
| A2: `exitOnCtrlC: false` accepted | **PASS** | Dispatcher can own Ctrl+C (with the escape-coalescer, §A.3) |
| A3: alternate screen | No `?1049h` emitted by ink@6.8.0 — **wrapper required, as planned** (`src/ui/altScreen.jsx` shipped and pty-verified) | Confirms Appendix A.3 shim |
| A4: `patchConsole: false` keeps headless output silent | **PASS** | Headless check-runs write nothing stray |
| A5: re-render cost, 20-row tree × 50 ticks | **min 7.3 ms / p50 22.9 ms / max 32.3 ms** (sandbox, includes one `setTimeout(0)` macrotask per tick — over-counts) | Two lessons: (a) real dispatch→paint measurement must hook Ink's write path, not wall-clock around macrotasks; (b) the 16 ms p95 budget is **not free** — the editor must virtualize (§12) and use `useCursor`/explicit caret rather than re-render-heavy designs |

## Build integration notes (now encoded in esbuild.config.mjs)

1. `alias: { 'react-devtools-core': './src/ui/emptyDevtools.js' }` — ink@6's optional devtools peer must be stubbed or bundling fails.
2. `banner` with `createRequire(import.meta.url)` — ink's CJS deps (`signal-exit`…) call `require()` on builtins from the ESM bundle.
3. Bundle size ≈ 4.9 MB (React + Ink + Yoga wasm). Acceptable for a local TUI; revisit only if startup regresses (§12 budget: < 400 ms cold — current `dist/main.js` starts and renders in well under that).
4. ink's `exports` map blocks `ink/package.json` subpath imports — don't import it from bundled code.

## Runtime notes

- Piped stdout: one-shot Tier D render, exit 0 — verified (`FULLSTACK_UI=next node bin/fullstack.js \| head`).
- Real pty (via `script`): alt-screen ON captured, clean restore (`?1049l`) on exit — verified. App stays alive while stdin is held open (4.17 s ≈ the pipe's hold time, then clean exit on EOF).
- Classic UI untouched and green: `npm test` (tools/check.js) passes; `node bin/fullstack.js` without the env var still refuses non-TTY exactly as before.

## Verdict

**ink@6.8.0 + react@19.3.0 confirmed for Node ≥ 20.** Fallback ladder (A.4) not needed. The four "MISSING" hooks are either trivially first-party (window size), already planned first-party (paste, mouse), or Phase-4 nice-to-haves (animation). One budget flag raised for Phase 2: A5 shows per-tick React flushes can exceed 16 ms when measured naively — the §12 measurement method must hook Ink's stdout writes and the editor must virtualize from day one.

## Follow-ups spun off

- Task 0.3 (input pipeline) must also replace the `useInput`-dependency risk window: nothing in Phase 0 depends on `useInput`, and Phase 1 screens will use the first-party `useKeymap` hook exclusively.
- `useWindowSize` absence → ship `src/ui/useWindowSize.js` (tiny SIGWINCH hook) in task 1.1.
- Appendix A.2/A.5 in the spec are updated with these exact numbers; §12 measurement method clarified.
