# fullstack-tui — Feature Inventory

*Ground truth as of 2026-09-14 (post Phase 0). This document is the canonical feature list — it feeds the README rewrite (overhaul §15) and the registry wiring (task 0.7a).*

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
| `FULLSTACK_UI=next fullstack` | Next-UI entry (Ink; Phase 0 hello frame) |
| `FULLSTACK_THEME=light\|dark` | Force a palette (auto via `COLORFGBG` otherwise) |
| `EDITOR` / `VISUAL` | External editor used by Ctrl+E |

---

## 2. The curriculum content

- **10 modules** (HTML, JavaScript, CSS, Data & SQL, Git & CLI, Node, Express & APIs, Testing & Debugging, React, Capstones — exact titles via `--list`), each with `badge`, `tagline`, course source + roadmap links.
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
- **Completions** (IDE-style popup): per-language triggers — `<` in HTML (tags + attributes), `:`/`@`/`-` in CSS (properties/values), JS keywords/APIs/snippets, SQL keywords, shell commands — plus words already in the buffer. Auto-opens on 2+ char prefixes or construct starters; `Ctrl+Space` forces; `↑↓` navigate, `Tab`/`Enter` accept, `Esc` dismiss.
- **Syntax highlighting** for 10+ languages (js/ts/jsx, html, css, sql, sh, docker, yaml, json, md) with block-comment state carried across lines; code blocks get line-number gutters.
- **Multi-file** (synthesis): file **tab strip**, per-file language detection, `Ctrl+Q`/`Ctrl+W` switch tabs; reset affects only the focused file; save writes every file; per-file cursor/scroll.
- Navigation: arrows, Home/End, PgUp/PgDn (10-line pages), with viewport scrolling (`scrollTop`/`scrollX`).

## 5. The challenge workflow

| Key | Action | Notes |
|---|---|---|
| `Ctrl+S` | **Check** — run every check against the buffer | Multi-file: all files graded together; results pane + per-check messages; attempt recorded; on pass: saved to workspace automatically |
| `Ctrl+R` | Reset to starter | Focused file only (multi-file) |
| `Ctrl+H` | Reveal next hint | Ordered; usage recorded per challenge |
| `Ctrl+G` | Show/hide worked solution | Scrollable; `y` copies it into the editor; second `Ctrl+G` toggles a **diff view** (current vs solution, line-aligned, bad/good colored) |
| `Ctrl+B` | Open the embedded browser | See §6 |
| `Ctrl+P` | Preview — write `.preview.html` and open in the real browser | Uses the same parts-assembly as the embedded browser |
| `Ctrl+O` | Save artifact to `.workspace/` | Multi-file: whole folder |
| `Ctrl+E` | Open the file in `$EDITOR`/`VISUAL` | Terminal released (alt screen off) and restored; file reloaded into the buffer |
| `Ctrl+T` | Toggle console output panel | Shows captured logs |
| `Tab` | Pane toggle on narrow terminals | brief ↔ code |

**Grading pipeline:** code (optionally TS-stripped) → `node:vm` sandbox (fake console, no fs, mocked `fetch`, DOM shim from a fixture when relevant) → async code on a **worker thread** that can be terminated (infinite-loop protection; sync loops hit the vm timeout) → per-check pass/fail with readable errors (`Timed out — looks like an infinite loop…`), review notes, and captured logs. Progress records: `attempts`, `lastCode`, `bestCode`, `passed`, `solvedAt`, `hintsUsed`, `solutionSeen`.

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
- Study time flushed every 30 s of active session (`unref`'d timer, headless-safe).
- Resume: home resume row targets the first unpassed challenge.
- Artifacts: `.workspace/<module>/<lesson>/<challenge>.<ext>` (or `/` + file names for synthesis; `.preview.html` for previews).
- `.data/smoke.json` — self-check scratch (headless App render smoke).

## 8. Terminal handling

- Alternate screen buffer, hidden hardware cursor parked at the editor caret (IME-friendly), **double-buffered line-diff renderer** (only changed rows are written — flicker-free), full-row `fit` so stale characters never linger.
- Raw-mode keyboard with a full keymap: arrows, Home/End variants, PgUp/PgDn, Insert/Delete, Shift+Tab, Shift+arrows, all Ctrl letters, named Enter/Tab/Backspace; unmapped control chars are surfaced (never silently swallowed).
- Terminal resize (SIGWINCH) re-renders; min floor 40×16; `Ctrl+L` forces a full repaint.
- 256-color themes (dark default, light via env/`COLORFGBG`), used consistently for chrome/code/browser output.
- Non-TTY stdin/stdout: CLI modes only, with a clear message (and the headless self-check path renders via the same view pipeline).

## 9. Quality tooling

- `npm run check` / `test` (`tools/check.js`): curriculum deep-validation (shape, langs, check/solution presence, starter-fails-for-debug) + headless render smoke of screens + reference-solution verification (every check passes) + a battery of editor/sandbox unit checks (auto-pairing, completions, grader semantics).
- `npm run verify` — the reference-solution + buggy-starter assertions across all 10 modules.
- `FULLSTACK_UI=next` pipeline: esbuild bundle (Node 20 target), capability detection, tier-mapped themes, alt-screen wrapper, Ctrl+C lifecycle — verified on a real pty (`tools/repro-e4.sh`).

## 10. Planned (spec'd, not yet built)

Overhaul (`tui-overhaul-spec.md`): Ink 6 rewrite in 5 phases, vim-first editor (undo/selection/search/multi-cursor/snippets/signature help), mouse everywhere, Nerd-Font visual system with degrade tiers, 5 themes, command registry + rebindable keymap, welcome tour, resizable panes, network tab + click-to-inspect + live re-render, perf budget, replay/snapshot test suites.
Errors & QoL (`errors-and-qol-spec.md`): stabilization pass (E1–E4, S1–S4), resume row v2, palette recents/next-up, jump-to-line failures, milestones, at-risk banner, autosave + checkpoints, suggest-only format, soft wrap, on-quit recap, daily challenges goal.
