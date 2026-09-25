# Changelog

Notable user-facing changes, newest first. Quiet by house tone (decision 16):
what changed and why it matters — no celebration.

Earlier history lives in the dated progress notes of `tui-overhaul-spec.md` and
`errors-and-qol-spec.md`; those notes fold into this file as the docs workstream
(loose-ends-spec P1-4) proceeds.

## Unreleased — 2026-09-25 · The flip

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

### Fixed

- The E4 regression repro (`tools/repro-e4.sh`) readiness-gates the `^C` byte
  on the app's own output instead of a stale fixed delay, and reads the pty
  relay stream rather than `script(1)`'s typescript; PC-22 re-verified clean on
  the flip candidate.
