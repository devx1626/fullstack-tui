# Contributing to fullstack-tui

Thanks for helping build the terminal curriculum. This doc covers the
mechanics; for architecture see `README.md` and the specs
(`tui-overhaul-spec.md`, `errors-and-qol-spec.md`).

## Setup

```bash
npm install
npm test             # full integration suite (should pass on a fresh clone)
npm run build        # needed once before test:unit (the render tests skip
                     # themselves without dist/harness.js)
npm run test:unit
```

Optional but recommended: have `python3` on `$PATH` so the Python module's
live-check tests run instead of skip.

`.github/workflows/ci.yml` runs the same three steps (`build`, `test:unit`,
`check`) on every push and pull request — the merge bar from
`tui-overhaul-spec.md` §13. If it is red locally it will be red there.

## The golden rule: every challenge is self-verifying

`tools/check.js` is more than a linter — it:

1. deep-validates the curriculum shape (ids, langs, checks, starters),
2. renders every screen headless as a smoke test,
3. **runs every challenge's reference solution against its own checks**, and
4. asserts each `debug` challenge's *starter* fails and its *solution* passes.

If you touch the curriculum, the grader, or the editor, `npm test` is the
arbiter. A green `npm test` means the curriculum is internally consistent.

## Adding or editing curriculum content

Modules live in `src/content/NN-slug.js` and export one module object.
Rules that the checker enforces:

- Stable `id` slugs — saved progress keys off them. Never rename.
- Every challenge: `id`, `kind` (`debug`/`write`), `difficulty`, `lang`,
  brief, `starter`, ordered `hints`, worked `solution`, `checks` array.
- `debug` starters must fail their checks (the learner has something to fix).
- Python challenges use `T.py(label, exprOrCapture)` — expression strings,
  `{ name, fn }` capture objects, or `{ expr }` all work; a malformed spec
  throws at authoring time rather than silently never passing.
- Lesson prose supports the markdown-ish subset documented in
  `docs/features.md` §2.

Renumbering/inserting modules: use `git mv` so history follows the file, then
update `src/content/index.js` imports in curriculum order.

## Code conventions

- Plain ESM JavaScript, Node ≥ 20.9, no runtime dependencies beyond
  `ink`/`react`/`esbuild` (dev).
- The classic UI is canvas-drawn (see `src/views/*`, `src/tui/*`); the next
  UI is Ink/React (see `src/ui/*`). Ports go through the command registry:
  screens register handlers via `useKeymap` and deal in **command ids**
  (`challenge.check`), never raw keys.
- The `InputDispatcher` is the sole stdin owner. Never add `useInput` or a
  second raw-mode listener.
- Pure logic (parsers, engines, layout math) lives in `src/core/*` or
  `src/ui/input/*` as exported functions/classes, unit-tested without a
  terminal. Rendering code stays thin.

## Testing

- **Unit tests:** `tests/unit/*.test.js` with `node:test`. Prefer pure
  function tests; for components, render through `dist/harness.js`
  (`tests/helpers/snapshot.js`) — everything React/ink-flavored must come
  from that one bundle, never straight from `node_modules`, or you get the
  two-React `useContext` crash.
- **Structure note:** declare subtests via `await t.test(...)` inside one
  parent test. Flat tests registered after top-level `await`s can be dropped
  by the runner's collection race (this bit us once; the pattern is pinned in
  `tests/unit/challengeScreen.test.js`).
- **Input/replay tests:** `tests/helpers/driver.js` injects scripted bytes
  through the real `InputDispatcher` with fake streams.
- Run the full gate before pushing:

```bash
npm run build && npm test && npm run test:unit
```

## Keymap and commands

User-facing actions must exist in the registry (`src/ui/commands.js`) with a
stable id, default binding, and screen scope. The lint in `tools/check.js`
rejects unregistered conflicts; intentional collisions are listed in the
`ALLOWED_CONFLICTS` set with a comment explaining the "mode wins" rationale.
User overrides live in `.data/keymap.json` and are merged with diagnostics,
never thrown.

## Commit style

Short imperative subject, blank line, body explaining the *why*. Include
test coverage with behavior changes. The repo keeps a `Generated with
Codebuff` trailer convention for assistant-authored commits.

## Filing issues

Include: terminal + OS, Node version, whether it reproduces with
`.data/` moved aside, and (for rendering bugs) a screenshot or the exact
frame text. For challenge-content errors, paste the failing check message —
it is designed to be self-explanatory.
