# fullstack-tui — Feature Inventory

*Ground truth as of 2026-09-17 (post Phase 0, next-UI Phase 1 in progress — dashboard/module/challenge routes interactive). This document is the canonical feature list — it feeds the README rewrite (overhaul §15) and the registry wiring (task 0.7a).*

## Multimedia & rich terminal (M0–M2, docs/multimedia.md)

- **M0 (live):** desktop notification + BEL when a check finishes (OSC 9/777; `settings.sound` gate, toggled in Settings with Space); OSC 8 clickable hyperlinks on module source URLs (course/roadmap/docs); DECSCUSR vim cursor shapes in the next-UI challenge screen (block = normal, bar = insert).
- **M1 (probe-gated):** graphics capability probe (kitty query + DA1 sixel attribute, 150 ms bounded wait, env fallback) and a screenshot engine — headless Chromium via lazy-loaded Playwright renders the learner's HTML to a PNG, emitted inline through the kitty (chunked) or iTerm2 protocol. Opt-in (`FULLSTACK_SCREENSHOT=playwright`), graceful not-installed guidance, classic UI untouched.
- **M2 (planned, editor port):** SGR 4:3 curly underlines for error squiggles.
- **Ruled out:** audio playback and video — no terminal protocol; celebrations use BEL + visual chrome instead.

## Next UI (FULLSTACK_UI=next, Ink 6 + React 19)

- **Input:** `InputDispatcher` owns raw stdin (mouse SGR 1006, bracketed paste 2004, escape coalescer) feeding a sequential parser chain; "mode wins" routing (focused screen → global); Ctrl+C quits cleanly (E4-verified, no process leak).
- **Shell:** `AppRoot` = ThemeProvider → RouterProvider (push/pop/replace/reset stack) → ScreenFrame with window-size tracking; alt-screen on TTY, one-shot static render when piped.
- **Commands:** registry of 49 ids with `.data/keymap.json` user overrides (unknown ids/bad bindings reported, never fatal); `useKeymap(screen, onCommand)` resolves keys to command ids — components never handle raw keys, and `CommandHost` (`src/ui/host.jsx`) owns the per-screen cursor plus the global command table.
- **Components:** Header/TabBar, Footer, Panel, List, ScrollPane, Badge, Meter, SplitPane (drag-ready, clamp math shared with keyboard nudge), command Palette with fuzzy filter + recents-first ordering.
- **Screens ported:** dashboard, module and challenge routes are real (`src/ui/routes.jsx`: `j/k/g/G`, Enter opens, Esc pops, Ctrl+S runs the real grader, Ctrl+H/Ctrl+G hint + solution, record-backed buffer/reset) on top of the challenge slice (SplitPane brief|editor, registry commands, vim cursor). The lesson, projects, stats, help, resources, workspace and settings ports, the command palette screen and the welcome tour follow (named in `UNPORTED_SCREENS`).

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
| `Ctrl+P` | Preview — write `.preview.html` and open in the real browser | Uses the same parts-assembly as the embedded browser; **off-challenge it opens the command palette** |
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
- `.data/smoke.json` — self-check scratch (headless App render smoke).

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
Errors & QoL (`errors-and-qol-spec.md`): the classic scope is complete (Q1–Q10, Q13, Q14 shipped with replays in `tools/check.js` §6/§8), and Q7/Q10/Q13 now also work on the Ink UI (results header with duration + micro-notes, suggest-only format, quit recap — `tests/unit/routes.test.js`); what remains there is the palette/tour screens plus Q12's `%` binding, which needs the Phase 2 vim engine.
Next UI (`FULLSTACK_UI=next`): the remaining screen ports, the palette screen + welcome tour, and the Phase 2 editor (vim, undo, selection, search, multi-cursor, snippets).
