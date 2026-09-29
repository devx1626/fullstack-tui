# fullstack-tui

An interactive terminal curriculum for learning fullstack web development:
12 modules from HTML to deployment, lessons, hands-on code challenges, debug
hunts, and capstone projects — all in your terminal, with a real code editor,
a built-in browser, and live grading.

```
$ npm start

  Let's build. 12 modules from HTML to deployment, 125 graded challenges
  - most of them are bugs to hunt.
```

## Quick start

```bash
npm install
npm run build      # one-time: bundle dist/main.js (the TUI runs from the bundle)
npm start
```

First launch opens a five-step welcome tour (skippable with `Esc`, replayable
from the command palette). Optional: `python3` on `$PATH` enables the Python
module's live checks — without it, that module's checks say so and everything
else works.

## Keys

| Key | Action |
| --- | --- |
| `j` / `k`, arrows | Move · `Enter` open · `Esc` back |
| `Ctrl+S` | Check my code (challenge screen) |
| `Ctrl+H` / `Ctrl+G` | Reveal a hint / show the worked solution |
| `Ctrl+B` | The embedded browser (Render · Elements · Styles · Console · Network) |
| `Ctrl+P` | Open the challenge preview in your real browser |
| `Ctrl+K` | Command palette (every command, fuzzy-filtered) |
| `Alt+1..5` | Dashboard · Projects · Progress · Resources · Workspace (`Alt+h`/`Alt+l` cycle) |
| `Ctrl+←` / `Ctrl+→` | Resize the challenge split (or drag the divider) |
| `s` | Settings, from the dashboard (`Space` toggles the focused row) |
| `n` | Dismiss the comeback nudge, from the dashboard |
| `Ctrl+C` | Quit (`q` works too, except while typing in the editor) |

The full table (80 commands, incl. multi-cursor editing and vim mode) is
generated in `docs/keymap.md`; vim mode has its own sheet in `docs/vim.md`.
Keys live in one registry (`src/ui/commands.js`) and are rebindable via
`.data/keymap.json`.

## Environments

- `FULLSTACK_THEME=paper` — force a theme (`midnight`, `paper`, `ember`,
  `dusk`, `sand`; auto-detected otherwise). Five curated palettes sharing one
  token contract; colorless terminals render with no colour at all.
- `FULLSTACK_ICONS=nerd|unicode|ascii` — force a glyph set (auto via a
  terminal heuristic; Nerd is never guessed from colour depth alone). Both
  are also live-preview pickers on the Settings screen.
- `FULLSTACK_SCREENSHOT=playwright` — opt in to the Render tab's screenshot
  action (headless Chromium via lazy-loaded Playwright).
- `EDITOR` / `VISUAL` — the external editor `Ctrl+E` hands the buffer to.
- `NO_ANIMATION=1` — render the static frame (also implied by `CI` and
  colour-degraded tiers), keeping output deterministic.

## Scripts

| Script | What it does |
| --- | --- |
| `npm start` | Launch the TUI (needs `npm run build` first) |
| `npm run build` | Bundle `dist/main.js` **and** the test harness `dist/harness.js` (`npm run dev` to watch) |
| `npm test` / `npm run check` | The integration gate: curriculum deep-validation, headless screen renders, every reference solution re-graded, editor/sandbox unit checks, keymap + link + perf lints |
| `npm run test:unit` | node:test suite (`tests/unit/*.test.js`) |
| `npm run verify` | Reference-solution + buggy-starter assertions across all 12 modules |
| `npm run list` | Print the curriculum as plain text |
| `npm run keymap:docs` | Regenerate `docs/keymap.md` + `docs/vim.md` from their source tables |
| `npm run reset` | Clear local progress (`--reset --all` also wipes `.workspace/`) |

## Where things live

```
src/
  main.jsx          the Ink entry point (bundled to dist/main.js)
  ui/               the Ink UI: command registry + dispatcher, router,
                    screens, components, theme/
  editor/           the editor engine (pure: document, history, vim,
                    search, multi-cursor, completions, highlight, diff)
  core/             engines: grading, completions, emmet, format, softwrap,
                    SQL/git/python sandboxes, progress store, recap
  content/          the curriculum (01-html … 12-deploy-and-devops)
tests/
  unit/             node:test suite
  helpers/          snapshot + keystroke-replay drivers
tools/
  check.js          the integration gate behind npm test
  qa-audit.mjs      content QA probe (grades every check against its starter)
docs/               features.md, keymap.md + vim.md (generated),
                    changelog.md, multimedia.md, ink-spike.md
```

Progress, settings, drafts, and checkpoint history live under `.data/`
(git-ignored). Deleting `.data/progress.json` resets progress; settings and
keymap recover to defaults if corrupt; every write is atomic (tmp + rename)
and merge-safe across writers.

## The curriculum

Twelve modules — HTML, CSS, JavaScript, Git & the Shell, Node.js, Express &
APIs, Databases & SQL, React, TypeScript, Python, Testing & Debugging, and
Deploy & DevOps — each with lessons, debug/write challenges, and a capstone
project with a checkable task list.

Grading is real, not string-matching: HTML/CSS checks query a parsed tree,
JavaScript runs in a sandboxed `node:vm` with an infinite-loop killer,
against SQLite for SQL, inside a live scratch repo for Git, and through a
`python3 -I -B` runner for Python. Every challenge ships a worked solution,
and the `npm test` gate re-grades all of them on every change — the checks
you face are the checks the maintainers verify.

## Status

The app is the Ink UI, full stop. The Phase 4 flip (2026-09-25) deleted the
classic canvas app and the `FULLSTACK_UI` switch; every screen — dashboard,
module, lesson, projects, challenge with the full editor, the embedded
browser and dev tools, help, resources, workspace, progress, settings — is
ported, and the command palette plus a welcome tour sit on top.

The editor engine (`src/editor/`) is pure and framework-free: a document
model behind one `applyEdit` chokepoint, undo/redo with typed coalescing,
selection + registers + OSC52, a vim state machine, search/replace,
multi-cursor, IDE completions, Emmet abbreviations, soft wrap, a Prettier-style
formatter that refuses to mangle broken code, and a line-level LCS diff.
The challenge screen binds it to a virtualized, mouse-aware component with
checkpoints before every check run, jump-to-failing-line, and replay goldens
pinning the behaviour (`tests/unit/editorReplay.test.js`).

Ongoing work is tracked in `loose-ends-spec.md` (see also `docs/changelog.md`
for what landed recently). Known honest limitation: keystroke-to-paint p95
sits above the 16 ms aspiration because ink 6 re-tokenizes the whole frame
per paint — the measured renderer floor on this machine already touches the
target, so the enforced perf gate is ratio-based (regressions fail, absolute
numbers report). The measurement and rationale live in `tools/check.js` §9.
