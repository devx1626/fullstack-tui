# fullstack-tui — Feature Inventory

*Ground truth as of 2026-09-18 (Phase 0 and Phase 1 complete; next-UI Phase 2 in progress — the editor engine and its UI binding are landed, the challenge route runs the real grader). This document is the canonical feature list — it feeds the README rewrite (overhaul §15) and the registry wiring (task 0.7a).*

## Multimedia & rich terminal (M0–M2, docs/multimedia.md)

- **M0 (live):** desktop notification + BEL when a check finishes (OSC 9/777; `settings.sound` gate, toggled in Settings with Space); OSC 8 clickable hyperlinks on module source URLs (course/roadmap/docs); DECSCUSR vim cursor shapes in the next-UI challenge screen (block = normal, bar = insert).
- **M1 (probe-gated):** graphics capability probe (kitty query + DA1 sixel attribute, 150 ms bounded wait, env fallback) and a screenshot engine — headless Chromium via lazy-loaded Playwright renders the learner's HTML to a PNG, emitted inline through the kitty (chunked) or iTerm2 protocol. Opt-in (`FULLSTACK_SCREENSHOT=playwright`), graceful not-installed guidance, classic UI untouched.
- **M2 (planned, editor port):** SGR 4:3 curly underlines for error squiggles.
- **M2 (shipped with the Phase 4 motion pass):** the check flow animates — a braille spinner (ASCII ladder on tier D) while a check runs and a settling sparkle flourish on a pass (`BusyLine`/`CelebrateLine`). Motion is strictly non-essential and gated by `animationAllowed`: `NO_ANIMATION=1`, `CI`, tiers C/D and non-TTY render the static frame the animation would settle on, so snapshots stay deterministic. One shared interval clocks every flourish (no stacked timers), and it only advances a frame index — input is never blocked.
- **Ruled out:** audio playback and video — no terminal protocol; celebrations use BEL + visual chrome instead.

## Next UI (FULLSTACK_UI=next, Ink 6 + React 19)

- **Input:** `InputDispatcher` owns raw stdin (mouse SGR 1006, bracketed paste 2004, escape coalescer) feeding a sequential parser chain; "mode wins" routing (focused screen → global); Ctrl+C quits cleanly (E4-verified, no process leak). **Alt keys** work: `ESC`+char parses as `alt-<char>` (CSI/SS3 sequences still win, a lone `Esc` still flushes as escape), so the Appendix B.2 tab bindings — `Alt+1..5` for Dashboard/Projects/Progress/Resources/Workspace and `Alt+h`/`Alt+l` to cycle — resolve. The tradeoff is the standard terminal one: pressing `Esc` then a letter inside the ~50 ms coalescing window reads as an Alt combination, exactly as in vim/readline.
- **Top-level tabs:** `nav.jumpTab1..5` / `nav.tabNext` / `nav.tabPrev`, also listed in the palette.
- **Shell:** `AppRoot` = ThemeProvider → RouterProvider (push/pop/replace/reset stack) → ScreenFrame with window-size tracking; alt-screen on TTY, one-shot static render when piped.
- **Commands:** registry of 67 ids with `.data/keymap.json` user overrides (unknown ids/bad bindings reported, never fatal); `useKeymap(screen, onCommand)` resolves keys to command ids — components never handle raw keys, and `CommandHost` (`src/ui/host.jsx`) owns the per-screen cursor plus the global command table.
- **Components:** Header/TabBar, Footer, Panel, List, ScrollPane, Badge, Meter, SplitPane (drag-ready, clamp math shared with keyboard nudge), command Palette with fuzzy filter + recents-first ordering.
- **Screens ported — Phase 1 complete, challenge upgraded in Phase 2:** dashboard, module, lesson, projects and challenge routes are real (`src/ui/routes.jsx`: `j/k/g/G`, Enter opens, Esc pops, Ctrl+S runs the real grader, Ctrl+H/Ctrl+G hint + solution, record-backed buffer/reset) plus the read-only scroll screens **Help** (`?`), **Resources**, **Workspace** and **Progress** (`j/k` scroll, `g`/`G` ends) and **Settings** (`s` from the dashboard: `j/k` move, Space toggles the focused row, and the **Theme and Icons rows are live-preview pickers** — `←`/`→` or Space step through the curated palettes / nerd-unicode-ascii glyph sets, re-theming or re-glyphing the whole tree instantly and persisting to `.data/settings.json`; each `Auto` follows the terminal). Help renders `src/core/help.js`, the same content the classic view lays out. Rows and Space behavior come from `src/ui/preferences.js`, shared with the classic view and `App.toggleSetting`, so the two UIs cannot document different preferences. The lesson screen keeps the classic flow — module → lesson → challenge — with `Tab` cycling the practice focus and `m`/`n` for read-state and next-lesson.
- **Command palette (`Ctrl+K`):** hosted by `CommandHost` as an overlay, not a router screen — pushing it would unmount the screen underneath and lose its cursor state and command handler. It lists every registry command available on the current screen plus "Go to" targets (screens, modules, lessons), fuzzy-filters with recents-first ordering, and runs a pick by command id through `dispatchToScreen` (so a screen-scoped command like `challenge.check` behaves exactly like its key). `screenTargets.js` is the list of ported screens the palette offers; the classic UI also accepts `Ctrl+K` now, so the shared help text is true in both.
- **Welcome tour (task 1.6):** a first launch (`onboardedAt: null`) opens on a five-step tour — welcome, screen anatomy, vim in 30 seconds (with `v` to switch to simple keys), a scratch sandbox, and mouse/clipboard — before the dashboard. `Enter` advances, `Esc` skips, and BOTH exits stamp `onboardedAt`; `v` writes the same `editor.vimMode` preference `settings.vimToggle` flips, so a choice can never be displayed but not persisted. Tiers C/D drop the mouse step (`tourSteps({ tier })`). Replay it from the palette (`app.tour`).
- **Resizable split (task 1.2):** `useResizableSplit` (`src/ui/components/ResizableSplit.jsx`) owns a screen's pane ratio — seeds it from `.data/settings.json` (`panes.challenge.brief`), drags on the divider column with the mouse, nudges with `<C-left>`/`<C-right>` (and the spec's `<C-S-left>`/`<C-S-right>`), and is reset by the palette's `view.paneReset`. Ratios (not columns) are stored, so a remembered layout survives a resize. Modified arrows needed real parser support — CSI `1;<mod>` sequences were falling through to the Alt branch and would have shipped the bindings dead — and shift-modified bindings resolve now (`<S-Tab>` included).
- **Editor engine (Phase 2, done):** `src/editor/` is framework-agnostic and pure. `document.js` (line array behind a single `applyEdit(changes)` chokepoint; `{changes, caret}` transactions; insert/delete/replace/setText wrappers; a multi-file session holding one document + history + view state per file, so switching tabs restores caret, scroll and undo), `history.js` (undo/redo over exact before/after snapshots, coalescing typing/pair/indent runs inside a 400 ms window, always-separate paste/completion/replace-all steps, redo cleared on a new edit, 1000-step cap), `selection.js` + `registers.js` + `osc52.js` (anchor/head ranges, a register ring with linewise/charwise/blockwise kinds, OSC52 copy that works over SSH), `vim.js` + `vim/{motions,operators,ex}.js` (a pure reducer with a 137-row acceptance table; `ex` maps `:w`/`:q`/`:%s` to REGISTRY command ids rather than editor functions), `search.js`, `multicursor.js`, `typekeys.js` (the classic modeless key path, ported as one change list per keystroke), `width.js` (zero-dep wcwidth-style cells for CJK/emoji/combining marks), `highlight.js`, `viewport.js` and `diff.js` (line-level LCS). None of it imports React.
- **Editor UI binding (tasks 2.7–2.10):** `CodeEditor` draws the virtualized viewport, gutter, tab strip and themed highlighting, and publishes its mouse handler to the route; `CompletionPopup` renders the list from `completions.js` (trigger on `<`/`:`/`@` or a 2-char prefix, `Ctrl+Space` on demand, `↑↓` select, `Tab`/`Enter` accept, `Esc` dismiss, snippet tab stops, signature line). Ctrl+Space is reachable from the real parser now — it arrives as NUL and used to be dropped. The route owns the popup state and intercepts the global `Esc`/`↑`/`↓` while it is open. The challenge footer DERIVES its hints from the command registry and adds the vim mode badge and the one-time normal-mode nudge.
- **Check tool (task 2.11):** `tools/check.js` §7 lints the footer hints back through the real resolver and drives every `VIM_BINDINGS` entry through `reduceKey`; §9 replays 60 keystrokes into a 500-line buffer and reports p50/p95 keystroke-to-paint, renders every screen at degrade tiers A–D, asserts that the colorless tiers emit no colour SGR at all, and asserts that `FULLSTACK_THEME=paper` reaches a rendered screen. The two findings from its first run are fixed: the render throttle is off the critical path (`maxFps: 240` plus memoized editor rows, one gutter node and merged identical pieces) and tiers C/D are colorless (theme tokens instead of hardcoded Ink colour names). The remaining warning is the honest p95 number — keystroke-to-paint is still above the §12 16 ms target, so the job warns at the spec's 33/100 ms lines and fails only on a genuine regression. The same run also measures a ONE-LINE control component: ink's own floor is p50 8–10 ms / p95 16–23 ms (both numbers move together under load), i.e. §12's target sits at the edge of what ink's renderer can do at all — it re-tokenizes the whole frame on every paint (`@alcalzone/ansi-tokenize` is ~11.5 ms of a 24-row frame) and creates a fresh `OutputCaches` per render, which §12 now records as a measured deviation. The gate prints that floor beside the editor number (which tracks it at ~4–7x) so the absolute values stay interpretable across machines. The same section replays the other two §12 targets that exist — palette typing (a real registry list) and list navigation (the dashboard's rows), both ~3.6–5.6x the floor — and measures a **caret-only move** on the editor frame: ~0.6x a typing keystroke, because ink rebuilds and re-tokenizes the whole frame on any update (the component-side contract that a caret move paints identical text is pinned in `tests/unit/codeEditor.test.js`). **Browser-tab scrolling** is now measured too (Phase 3 built the browser): the probe drives the real `BrowserScreen` with a real built page and a moving offset, and lands at p50 ~62 ms / p95 ~159 ms — **~6.3x the floor**, the same wall as the other three targets (its rows are memoized by absolute pane index, so a scroll only re-renders the newly-exposed rows).
- **Icon sets (Phase 4 icon pass):** `src/ui/theme/icons.js` holds three complete glyph sets — `nerd` (Nerd Font private-use), `unicode` (the shipped default) and `ascii` (`+--`/7-bit for Tier D) — behind one semantic registry, so components ask for a ROLE (`icons.select`, `icons.check`) through `useIcons()` and never hardcode a glyph. Selection order is `FULLSTACK_ICONS` env → saved setting → heuristic: a known Nerd terminal (`KITTY_*`, `WEZTERM_*`, `TERM_PROGRAM=ghostty|kitty|wezterm`) selects `nerd`, a non-unicode/`TERM=dumb` profile selects `ascii`, and everything else stays `unicode` (Nerd is never guessed from color depth alone). `ICON_SETS[set].borderStyle` also carries ink's Box border name, so panels degrade from rounded to `+--` with the glyphs. The Settings screen has a live-preview picker on the **Icons** row (`Space` or `←`/`→`, persisted to `.data/settings.json`; `Auto` follows the probe), and the whole tree re-glyphs instantly — same mechanism as the theme picker.
- **Theme tokens (task 2.11 remainder):** `src/ui/theme/` is the only place colour is decided — `themes.js` holds the named palettes (midnight, paper, ember, dusk, sand — five curated themes sharing one token contract) with a Settings live-preview picker (`←`/`→`/Space, persisted to `.data/settings.json`, `Auto` = terminal heuristic), `index.js` resolves one against the capabilities probe (`themeForCapabilities`: hex at tier A, nearest `ansi256(n)` at B/C, all values stripped at D), and `context.jsx` publishes it as `ThemeProvider`/`useTheme`, mounted by `AppRoot` above the router. Screens and chrome ask for a ROLE (`theme.accent`, `theme.muted`, …) and never for a raw value, including the pure `*Lines` row builders, which take the theme as a parameter and stay directly testable. Two user-visible bugs fell out of the conversion: `FULLSTACK_THEME=paper` now repaints the screens instead of just AppRoot's status line, and the colorless tiers really go grayscale (`npm test` asserts both, and that C/D emit no colour SGR at all).
- **Editor replay goldens (task 2.9 remainder):** `tests/unit/editorReplay.test.js` drives the REAL `ChallengeRoute` (router → vim/typekeys → session → debounced autosave) with scripted keystrokes and pins three scenarios the spec names — solve-from-scratch in the modeless editor, vim insert/undo/redo, and a multi-file tab flow — as reviewable `.snap` goldens plus intent assertions alongside them, so a golden cannot be refreshed into a wrong answer unnoticed. Writing it found three shipped bugs: `sessionStep` returned a file NAME the route stored as a session (`Ctrl+W`/`Ctrl+Q` corrupted it), vim insert/replace mode swallowed `h`/`j`/`k`/`l` as motions, and `<Esc>` resolved to `app.back` before the editor saw it (insert mode was a trap). It also forced the autosave debounce to flush on unmount — leaving the screen within 400 ms of a keystroke used to discard the edit.
- **No dead exports (task 2.12, sweep half):** `npm test` §10 scans `src/editor/**` and `src/ui/**` for named exports referenced nowhere across src, tests, tools, docs and the root configs (a helper used only by a test is alive) and for modules nothing imports, failing on either with a named allowlist for documented seams (`probeGraphicsTTY`, whose feature is not wired yet). The sweep removed five leftovers (`JSX_KEYWORDS`, `cursorsAt`, `isRegisterPrefix`, `VISUAL_MODES`, `confirmSubstituteState`). The classic `src/views/editor.js` model and `tui/widgets.js` codeBlock/tokenizer are NOT dead yet — the classic UI is still the default entry and imports them — so that deletion is deferred to the Phase 4 flip, where §10 catches them the moment they are unreferenced.
- **Phase 3 browser (landed):** the embedded dev tools are ported — Render/Elements/Styles/Console/Network, live re-render from the autosaved draft (debounced ~300 ms with a ⚠ error overlay), click-to-inspect that syncs Render→Elements/Styles, jump-to-source back into the editor caret, and a warmed console session (the learner's code executes once per edit, expressions evaluate on top, every fetch recorded for Network). The pure pane-row model takes the active icon set, so the browser's marks, rails, carets and hint separators degrade to ASCII with the rest of the UI.
- **Not ported (Phase 4):** the 3–5 theme set, the Nerd Font icon pass, and the cut-over that makes the Ink UI the default entry.
- **Capstone meters:** `Store.projectProgress(id, checks)` now counts the `${projectId}.${index}` keys the app actually writes. It previously filtered by the check *text*, so every capstone meter read `0/N` no matter how many items were ticked (classic module/projects views included).

---

## 1. What it is

An interactive **terminal curriculum** for fullstack web development: lessons read in the terminal, hands-on code challenges written in a built-in editor, graded by a real sandboxed JavaScript runtime and structural HTML/CSS analyzers, with progress, streaks, and artifacts persisted to disk. Zero runtime dependencies (until the Ink cut-over), Node ≥ 20.9, ESM.

**Entry points**

| Invocation | Behavior |
|---|---|
| `npm start` / `fullstack` | Launch the TUI (requires TTY) |
| `fullstack --list` | Print the full curriculum (modules → lessons → challenges) as plain text |
| `fullstack --verify` | Run every reference solution through its own checks; also asserts debug challenges *fail* on their buggy starter |
| `fullstack --reset [--all]` | Delete progress (and optionally `.workspace/`) |
| `fullstack --help` | Flag reference |
| `FULLSTACK_UI=next fullstack` | Next-UI entry (Ink; interactive dashboard/module/challenge routes) |
| `FULLSTACK_THEME=light\|dark` | Force a palette (auto via `COLORFGBG` otherwise) |
| `FULLSTACK_ICONS=nerd\|unicode\|ascii` | Force a glyph set (auto via the terminal heuristic otherwise) |
| `EDITOR` / `VISUAL` | External editor used by Ctrl+E |

---

## 2. The curriculum content

- **12 modules** (HTML, JavaScript, CSS, Data & SQL, Git & CLI, Node, Express & APIs, Python, Testing & Debugging, React, DevOps & Deploy, Capstones — exact titles via `--list`), each with `badge`, `tagline`, course source + roadmap links.
- **Lessons** with minute estimates, markdown-ish prose (inline `**bold**`, `` `code` ``, `*italic*`; paragraphs, headings, code blocks, tables, callouts), and a scroll position **persisted per lesson**.
- **Challenges** per lesson, each with: `id`, `kind`, `difficulty`, `lang`, brief, `starter` code, ordered `hints` (Conceptual → Strategic → Code), a worked `solution`, and a `checks` array.
  - `write` — build from scratch.
  - `debug` — buggy starter that must be fixed (verify asserts starters fail).
  - `synthesis` — **multi-file** (e.g. `index.html` + `style.css` + `app.js`) assembled into one page.
- **Capstone projects** per module: description, minute estimate, and a **checkable task list** (toggled in the TUI, persisted).
- Checks are real code: JS assertions executed against the learner's runtime values; HTML checks query a parsed tree; CSS checks inspect parsed rules — not text matching. `mockFetch` tables keep network lessons offline-deterministic; `prelude` injects per-challenge helpers; React challenges run against a DOM shim with per-check component resets.

---

## 3. Screens (12)

| Screen | What it shows | Key interactions |
|---|---|---|
| **Home** | Module list with progress bars, resume row, activity sparkline, streak/stat chips, top-level tab strip | `j/k` move, `Enter` open module, `p` projects, `s` settings, `?` help, `q` quit |
| **Module** | Lesson list (+ capstone entry), per-lesson challenge counts and pass state | `j/k`, `Enter` open lesson/project |
| **Lesson** | Scrollable prose, challenge list with kind/difficulty/passed markers, read-state | `j/k`/`PgUp/PgDn` scroll, `Tab` focus challenges, `Enter` open (first unsolved by default), `m` mark read, `n` next lesson |
| **Challenge** | Split view: brief + checks ‖ editor (narrow terminals get a `Tab` pane toggle). Completion popup, hints, solution view + diff, results pane | see §5 |
| **Projects** | Capstone checklists with progress | `Tab` focus toggles, `Space` tick |
| **Stats** | Totals, per-module progress, streaks, 21-day activity sparkline, time stats | scroll |
| **Help** | Full keyboard reference + "how grading works" notes | scroll |
| **Resources** | Curated external links (grouped) | scroll |
| **Workspace** | Everything saved to `.workspace/` (artifact tree) | scroll |
| **Browser** | Embedded dev tools — see §6 | `Tab`/`1-5` tabs, console input |
| **Palette** | Command/navigation palette (fuzzy filter over modules/lessons/challenges) | type to filter, arrows, `Enter` |
| **Settings** | Theme, editor behavior info | arrows |

**Chrome (all screens):** header with title/subtitle, breadcrumbs (`Module › Lesson › Challenge`), top-level tab strip (Dashboard/Projects/Progress/Resources/Workspace) highlighted per route, overall progress on the right; footer with context hints + notice line (info/good/warn/bad).

---

## 4. The editor

- Multi-line buffer model: line array + cursor; whole-document edit chokepoints for smart operations (`setTextAt`).
- Typing aids: **auto-pairing** (brackets/quotes close themselves), **HTML auto-close tags** on `>`, **pair-backspace** (empty pair deleted both halves), **smart indent** on Enter (continues indentation; extra indent after `{`/`[`/`(`), **indent-step backspace**.
- **Emmet** (VS Code-style): `Tab` expands markup abbreviations (`div.card*2>p` → nested elements, indent-aware, prose-safe, requires a structural operator); `;` completes CSS shorthand (`m10` → `margin: 10px;`).
- **What Tab and `;` do, per mode** (one precedence ladder, replay-pinned in `tests/unit/routes.test.js`):
  1. **Snippet tab stops** — after a completion with placeholders is accepted, Tab walks its stops until the walk is exhausted; nothing else may steal it.
  2. **Emmet** — Tab expands an abbreviation at the caret when one is present (this outranks the completion popup, and clears it — the expansion makes the list stale); `;` completes a CSS shorthand when the token before the caret is abbreviation-shaped (`m10;` → `margin: 10px;`; prose like `zz;` types literally). Both fire only where text keys edit the buffer: vim **insert** mode or the modeless editor — in vim normal mode Tab stays a motion and `;` repeats `f`/`t`.
  3. **Completion popup** — Tab/Enter accept the focused item (which may arm new tab stops).
  4. **Indent** — no snippet walk, no abbreviation, no popup: Tab indents two spaces at the caret; under a **multi-cursor set** it indents every cursor's row as one undo step (blank rows are skipped by design).
  Emmet never fires in JS files (`expandAt` has no JS grammar), so snippet stops there are unreachable by emmet by construction.
- **Formatter** (`Ctrl+F`): Prettier-style normaliser for html/css/js/json — spacing normalisation, collapsed blank-line runs, `<pre>` preserved, no reflow; CSS formats the enclosing rule, every other language the whole buffer; aborts (with a notice) rather than mangle broken code, and is idempotent. A check run never formats for you: it only notes that the formatter would rewrite the buffer (`Ctrl+F` to apply).
- **Completions** (IDE-style popup): per-language triggers — `<` in HTML (tags + attributes), `:`/`@`/`-` in CSS (properties/values), JS keywords/APIs/snippets, Python keywords/builtins, SQL keywords, shell commands — plus words already in the buffer. Auto-opens on 2+ char prefixes or construct starters; `Ctrl+Space` forces; `↑↓` navigate, `Tab`/`Enter` accept, `Esc` dismiss.
- **Syntax highlighting** for 10+ languages (js/ts/jsx, html, css, python, sql, sh, docker, yaml, json, md) with block-comment state carried across lines; code blocks get line-number gutters.
- **Multi-file** (synthesis): file **tab strip**, per-file language detection, `Ctrl+Q`/`Ctrl+W` switch tabs; reset affects only the focused file; save writes every file; per-file cursor/scroll.
- Navigation: arrows, Home/End, PgUp/PgDn (10-line pages), with viewport scrolling (`scrollTop`/`scrollX`).
- **Soft wrap** (Settings → Wrap): long logical lines render across several screen rows, gutter numbers stay on the line's first row, and `↑`/`↓` move by screen row with the goal column preserved (`src/core/softwrap.js`).
- **Tab size** (Settings → Tab size, cycles 2/4/8): drives `Tab`, auto-indent on Enter and indent-step backspace (`tests/unit/editor.test.js`).
- **Visible bell**: a key a screen does not use answers with a one-line notice instead of redrawing an identical frame.
- **Jump to a failing line** (`Ctrl+J`): when a failed check carries a line range the results pane shows `→ line N` and the key puts the caret there and reveals the editor.
- **Torn-down frames render**: every view survives a render with no challenge loaded (reset flows, palette jumps) at any terminal size — verified by an 11-view × 8-size sweep including degenerate sizes.
- **Bracket match** (`editor.bracketMatch`, palette): put the caret on (or right after) `(`/`[`/`{` and jump to its partner — strings and comments are masked first, and an unmatched bracket is reported instead of guessed. Palette-only in the modeless editor so `width: 50%` keeps typing a percent sign; `%` arrives with the vim engine.

## 5. The challenge workflow

| Key | Action | Notes |
|---|---|---|
| `Ctrl+S` | **Check** — run every check against the buffer | Multi-file: all files graded together; results pane + per-check messages; attempt recorded; on pass: saved to workspace automatically |
| `Ctrl+R` | Reset to starter | Focused file only (multi-file) |
| `Ctrl+H` | Reveal next hint | Ordered; usage recorded per challenge |
| `Ctrl+G` | Show/hide worked solution | Scrollable; `y` copies it into the editor; second `Ctrl+G` toggles a **diff view** (current vs solution, line-aligned, bad/good colored) |
| `Ctrl+B` | Open the embedded browser | See §6 |
| `Ctrl+P` | Preview — write `.preview.html` and open in the real browser | Uses the same parts-assembly as the embedded browser; **off-challenge it opens the palette** (the next UI binds the palette to `Ctrl+K`; the classic app accepts both) |
| `Ctrl+O` | Save artifact to `.workspace/` | Multi-file: whole folder |
| `Ctrl+E` | Open the file in `$EDITOR`/`VISUAL` | Terminal released (alt screen off) and restored; file reloaded into the buffer |
| `Ctrl+F` | **Format** the focused buffer (or the enclosing CSS rule) | Prettier-style; never reflows; aborts on broken code (see §4). Suggest-only: checks note unformatted code, they never rewrite it |
| `Ctrl+J` | Jump to the line of a failed check | Only when the check carries a line range |
| `Ctrl+T` | Toggle console output panel | Shows captured logs |
| `Tab` | Pane toggle on narrow terminals | brief ↔ code |

**Grading pipeline:** code (optionally TS-stripped) → `node:vm` sandbox (fake console, no fs, mocked `fetch`, DOM shim from a fixture when relevant) → async code on a **worker thread** that can be terminated (infinite-loop protection; sync loops hit the vm timeout) → per-check pass/fail with readable errors (`Timed out — looks like an infinite loop…`), review notes, and captured logs. Progress records: `attempts`, `lastCode`, `bestCode`, `passed`, `solvedAt`, `hintsUsed`, `solutionSeen`.

**Palette actions** (`Ctrl+P` off-challenge) — the palette lists the curriculum plus registry commands that have no key of their own:

- `nav.nextUp` — jump straight to the first unpassed challenge ("Go to next unpassed challenge").
- `history.restore` (offered inside a challenge) — pick a **checkpoint** and put its buffers back.

**Checkpoints (Q9):** before every `Ctrl+S` run the pre-check buffers are written to a per-challenge sidecar (`.data/history/<lesson>.<challenge>.json`) — every tab byte-exact. Retention: the 10 most recent runs plus the **first passing state of each day** (★, never evicted; snapshots older than 30 days drop). Restoring never touches attempts, streaks or `lastCode`, and files the challenge no longer has are reported rather than invented.

**List endpoints (Q3):** `g`/`G` jump to the first/last row on the home, module and projects lists, and `g` returns to the top of a scrolled lesson/stats/help view.

**Results panel (Q7):** the header shows `passed/total` plus how long the run took (sandbox spawns dominate), followed by mentor-style micro-notes derived from the run: a thrown exception first, identifiers a failing message names that are missing from the buffer (a `class="card"` satisfies a check about `.card`), an untouched starter, and an honesty note when hints or the solution were used (`src/core/checkNotes.js`).

**Milestone toasts (Q5):** passing a challenge can celebrate a fresh milestone — a 7/30/100-day streak, a new personal-best streak, or a module crossing 25/50/75/100% — shown as a one-line toast. Both UIs share one id → text step (`src/ui/milestones.js`), and seen ids persist in `settings.milestonesSeen`, so each milestone fires exactly once per install, not once per pass.

**Session recap (Q13):** quitting (`q`/`Ctrl+C`) prints, after the alt screen is gone, the time spent this session, challenges passed (with overall progress), failed checks, the streak with today's goal, and the next-up challenge (`src/core/recap.js`). It prints once, only on a TTY, and an idle session gets a single friendly line.

## 6. The embedded browser (dev tools)

Five tabs, `1–5` or `Tab` cycling:

1. **Render** — HTML laid out as a reader-view text grid: block/inline flow, headings with levels, list markers, tables with cell rules, blockquote/code/hr treatment, links underlined (href shown), void-element placeholders (`[input:text name]`), CSS applied for what survives a character grid: weight, style, underline/strike, dim (opacity), fg/bg color (named/hex/rgb → nearest xterm-256), alignment, `display:none`, text-transform, `min-width` media queries against a notional viewport.
2. **Elements** — indented DOM tree (elements + significant text rows), navigable, with the selected node described `<tag attr="…">`.
3. **Styles** — for the selected node: matched rules (selector + declarations), inline styles, and computed map; explains *why* the render looks as it does.
4. **Console** — evaluates expressions against the learner's own code and the rendered page DOM: history (`↑`/`↓`), `Ctrl+U` clear input, `Ctrl+L` clear output, async `await` supported, results REPL-formatted; synthesis challenges see the assembled page and all scripts; single-file markup challenges include their inline `<style>`/`<script>` content via `previewParts`.
5. **Issues** — static analysis: structural/a11y problems (missing alt, label/for mismatches, etc.).

Follow mode: element selection follows the caret position in markup challenges (`follow: true`), so Elements/Styles track what you're typing.

## 7. Progress, streaks & persistence

- `.data/progress.json` (atomic tmp+rename writes; never crashes the TUI on disk errors): version, learner name, per-lesson `{read, completedAt, scroll}`, per-challenge records (§5), per-project `{checks, notes}`, per-day `{minutes, challenges, lessons}`, **streak** `{current, best, lastDay}` (timezone-local days), totals `{seconds, sessions}`, `lastSeen`.
- **Multi-writer safe**: every save merges the on-disk records over the in-memory state — additive facts (`passed`, `attempts`, `hintsUsed`, day counters) never go backwards, so the classic UI and `FULLSTACK_UI=next` (or any helper) can share one progress file without a stale writer erasing a pass. A corrupted file falls back to the writer's own state (`tests/unit/storeMerge.test.js`).
- Study time flushed every 30 s of active session (`unref`'d timer, headless-safe).
- Resume: home resume row targets the first unpassed challenge.
- Artifacts: `.workspace/<module>/<lesson>/<challenge>.<ext>` (or `/` + file names for synthesis; `.preview.html` for previews).
- `.data/history/<lessonId>.<challengeId>.json` — checkpoint sidecars (Q9: pre-check snapshots, 10-run ring + daily best). Deleting the directory loses only checkpoints.

## 8. Terminal handling

- Alternate screen buffer, hidden hardware cursor parked at the editor caret (IME-friendly), **double-buffered line-diff renderer** (only changed rows are written — flicker-free), full-row `fit` so stale characters never linger.
- Raw-mode keyboard with a full keymap: arrows, Home/End variants, PgUp/PgDn, Insert/Delete, Shift+Tab, Shift+arrows, all Ctrl letters, named Enter/Tab/Backspace; unmapped control chars are surfaced (never silently swallowed).
- Terminal resize (SIGWINCH) re-renders; min floor 40×16; `Ctrl+L` forces a full repaint.
- 256-color themes (dark default, light via env/`COLORFGBG`), used consistently for chrome/code/browser output.
- Non-TTY stdin/stdout: CLI modes only, with a clear message (and the headless self-check path renders via the same view pipeline).

## 9. Quality tooling

- `npm run check` / `test` (`tools/check.js`): curriculum deep-validation (shape, langs, check/solution presence, starter-fails-for-debug) + headless render smoke of screens + reference-solution verification (every check passes) + a battery of editor/sandbox unit checks (auto-pairing, completions, grader semantics).
- `npm run test:unit` — the `node:test` suites (`tests/unit/`: checkpoints and store merging, the pure nav/target helpers, and the newer pure modules — `checkNotes`, `recap`, `brackets`, the editor model, soft wrap, `capabilities`, `hexTo256`, `keymap`, `overlayStack`, `palette`, `splitPane`, `useKeymap`, the input driver, the Ink routes/challenge screen, and `tests/unit/graphicsProbe`/`screenshot`).
- `.github/workflows/ci.yml` — build + `test:unit` + `check` on every push and PR (Node 22).
- `npm run verify` — the reference-solution + buggy-starter assertions across all 12 modules (Python reference checks run live when `python3` is available, and are skipped gracefully when it is not).
- `FULLSTACK_UI=next` pipeline: esbuild bundle (Node 20 target), capability detection, tier-mapped themes, alt-screen wrapper, Ctrl+C lifecycle — verified on a real pty (`tools/repro-e4.sh`).

## 10. Planned (spec'd, not yet built)

Overhaul (`tui-overhaul-spec.md`): Ink 6 rewrite in 5 phases, vim-first editor (undo/selection/search/multi-cursor/snippets/signature help), mouse everywhere, Nerd-Font visual system with degrade tiers, 5 themes, command registry + rebindable keymap, welcome tour, resizable panes, network tab + click-to-inspect + live re-render, perf budget, replay/snapshot test suites.
Errors & QoL (`errors-and-qol-spec.md`): the classic scope is complete (Q1–Q10, Q13, Q14 shipped with replays in `tools/check.js` §6/§8), and Q5/Q7/Q10/Q13 now also work on the Ink UI (one-shot milestone toasts — `tests/unit/milestoneToasts.test.js` — results header with duration + micro-notes, suggest-only format, quit recap — `tests/unit/routes.test.js`); what remains on that list is M2's curly-underline squiggles (docs/multimedia.md).
Next UI (`FULLSTACK_UI=next`): Phases 1–3 are landed — shell/navigation/palette/tour/resizable panes; the editor engine, vim, search, multi-cursor, completions and challenge route with replay goldens; and the Phase 3 browser & dev tools (`BrowserRoute` + `BrowserScreen` + the pure `browserModel`, live re-render, click-to-inspect, jump-to-source, warmed console, Network tab, `tests/unit/routesBrowser.test.js`) with the §12 browser-scroll probe in check §9. What remains is the Phase 4 cut-over (make the Ink UI the default, delete `src/tui/` and the classic `src/views/browser.js` model) plus the theme/icon polish.
