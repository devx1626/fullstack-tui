# Changelog

Notable user-facing changes, newest first. Quiet by house tone (decision 16):
what changed and why it matters — no celebration.

Earlier history lives in the dated progress notes of `tui-overhaul-spec.md` and
`errors-and-qol-spec.md`; those notes fold into this file as the docs workstream
(loose-ends-spec P1-4) proceeds.

## Unreleased — 2026-09-29 · Motivation systems

The motivation half-features are finished: the daily goal is real, and the app
says one quiet thing when you come back.

- **Daily goal.** Settings gains a Daily goal row; Space cycles Off → 1 → 3 →
  5 → 10. The dashboard shows an `of goal N/M` chip while the goal is on, and
  the on-quit recap keeps score against it. `<C-g>` cycles from anywhere on
  the settings screen.
- **Comeback nudge.** After a week or more away, the dashboard shows one line
  — the streak starts again today — dismissible with `n` for the rest of the
  day. A first-run learner never sees it.
- **Worth revisiting.** The recap gains one pointer: the first challenge you
  attempted three-plus times without ever passing, if there is one.

## Unreleased — 2026-09-26 · Dead-key fixes

A post-flip audit of the key map found four keys whose global bindings resolved
before the challenge editor and silently misbehaved. All four are fixed:

- `Ctrl+Alt+↑/↓` (multi-cursor stack) now parse at the byte level; previously
  the terminals' CSI 1;7 form degraded to Alt+[ garbage and the bindings were
  unreachable from a real terminal.
- `PageUp`/`PageDown` move the caret ten rows in the modeless editor instead of
  being eaten by list navigation; `j`/`k`/`g`/`G` reach the editor too.
- `y` types as a plain character unless the solution view is open, where it
  copies the solution into the editor (classic behavior, restored).
- `q` types instead of quitting the app on the challenge screen. Quit stays on
  `Ctrl+C` and in the palette.

### Editor caret fast path (P0-5)

Caret-only moves in the modeless editor no longer repaint the frame. A move
that changes nothing but the caret position — no selection, no scroll, no
multi-cursor set, relative numbers off — updates the editor state and the
terminal cursor directly and skips the React render entirely; ink emits only
its cursor-move sequence instead of rebuilding the frame. Editing behavior is
unchanged: any move the guards cannot prove safe falls back to the ordinary
render path, and `relativeNumbers` remains reserved until its gutter gate
ships.

### Curriculum links repaired (P0-4, scripted half)

`npm run check` now lints every external URL in the curriculum: a dead link
fails the gate. Its first pass found six stale references — two MDN pages that
moved, a retired Node.js Docker tutorial, and three old blog posts — all
replaced with live pages (MDN's type-coercion glossary entry, the Docker
Node.js language guide, and Julia Evans's debugging manifesto among them).

### Challenge QA fixes (P0-4, first QA tranche)

A content QA probe that grades every challenge's checks against its starter
code caught one challenge whose checks could never fail: the graceful-shutdown
challenge's async checks were scored without being awaited, so any submission
— including nothing at all — passed all four. It grades properly now (and its
starter no longer crashes the grader). Eight challenges gained a real third
hint rung, two intro-labeled challenges sit in the normal difficulty scale,
and the probe (`tools/qa-audit.mjs`) stays available for the next QA pass.

### Content QA pass complete (P0-4)

All twelve modules have now been read challenge by challenge against a fixed
rubric — tone, hint ladders, difficulty steps, and whether each check can
actually fail wrong code. Thirteen defects were fixed across the pass. The
subtle ones: a git hint recommending a `.gitignore` line its own check
rejected; a security check so strict it failed the parameterised SQL its hint
taught; a rounding assertion that almost any wrong answer satisfied; and two
prompts describing bugs the starter code could not produce. Every challenge
now has a three-rung hint ladder, a normal difficulty label, and checks that
were verified both to pass their reference solution and to fail a do-nothing
submission. The link linter and the QA probe keep watching for regressions in
future content work.

## 2026-09-25 · The flip

**The Ink UI is the only UI.** The classic canvas app (`src/app.js`,
`src/views/`, `src/tui/`) and its entry (`src/index.js`) are deleted; the Phase
4 cut-over (`7e79fdf`) lands as one commit after the parity checklist verified
33/33 rows green.

### Removed

- The classic UI and the `FULLSTACK_UI` environment switch. `npm start` boots
  the Ink UI from the built bundle (`dist/main.js`) directly, with the
  missing-build message kept. The plain-text side doors (`--list`, `--verify`,
  `--reset`, `--help`) moved into `bin/fullstack.js` and still run without a
  build.
- ~5,900 lines of classic views, canvas widgets, and the classic-only tests
  that exercised them. Curriculum content is untouched: `npm run verify`
  re-ran all 125 challenges (823 checks) clean on the flip tree.

### Changed

- `check` sections 3/6/8 (the classic-canvas render loop and classic-App QoL
  replays) are gone with the views they drove; their coverage holds on the Ink
  equivalents — the §9 screen × tier smoke, the route-tree suites, and check
  §7/§10. The dead-export gate now runs with an empty allowlist.
- README carries the post-flip minimum: entry point, scripts, key table,
  status section. The full docs workstream (features.md split, CONTRIBUTING
  refresh) remains open as P1-4.

### Added (landed in the days before the flip, shipped with it)

- **Multi-cursor in the challenge editor** (PC-11/P1-2): `Ctrl+Alt+↑/↓` stack
  cursors per row, `Ctrl+D` adds a cursor at the next match (modeless; vim
  keeps its scroll binding), typing edits every cursor as one undo step,
  arrows/Esc collapse.
- **Checkpoint restore from the palette** (PC-27): `history.restore` lists the
  pre-check snapshots (10-run ring + daily best) and restores one, without
  touching attempt counts.
- **Workspace artifacts on pass and `Ctrl+O`** (PC-28): single-file
  `<module>/<lesson>/<challenge>.<ext>`, multi-file challenge folders.
- **Browser screenshots** (PC-05/P0-3): `browser.screenshot` in the palette,
  gated on `FULLSTACK_SCREENSHOT=playwright` + an inline-image protocol
  (probed at boot, env heuristics as fallback), lazy Playwright with
  install-guidance on every failure path.
- **Emmet in the editor**: `Tab` expands markup/CSS abbreviations, `;`
  completes CSS shorthands (`m10` → `margin: 10px;`) — classic parity, before
  the flip would have silently dropped it (mode-interaction edge cases are
  tracked as P1-11).
- **Tab/`;` precedence pinned and multi-cursor Tab indents** (P1-11): snippet
  stops outrank emmet, emmet outranks the completion popup, `;` keeps the
  classic shape gate, and Tab under a multi-cursor set indents every row as
  one undo step (docs/features.md §4).
- **Visible bell for ignored keys** (Q12/P1-12): a key nothing claims answers
  with a muted status-line note (`'z' does nothing here — '?' lists the
  keys`) instead of vanishing; a ~1s same-key suppressor keeps held keys from
  spamming. Typing surfaces and `?` stay exempt, which flushed out that `?`
  had never parsed as a binding (`parseBinding` now reads bare punctuation;
  the editor and console claim it as input).

### Fixed

- The E4 regression repro (`tools/repro-e4.sh`) readiness-gates the `^C` byte
  on the app's own output instead of a stale fixed delay, and reads the pty
  relay stream rather than `script(1)`'s typescript; PC-22 re-verified clean on
  the flip candidate.
