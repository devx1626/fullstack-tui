# TUI Overhaul — Specification

**Project:** `fullstack-tui` — interactive terminal curriculum for fullstack web development
**Spec status:** Draft for review (no code written yet)
**Date:** 2026-09-14
**Author:** Buffy (from a 5-round requirements interview)

---

## 1. Summary

A **full rewrite of the TUI layer** on top of **Ink (React)**, delivered **view-by-view in phases**, transforming every aspect of the terminal experience:

- **Look:** rich & decorated visual design — rounded chrome, Nerd Font iconography (with fallbacks), a curated multi-theme set, resizable split panes.
- **Editor:** a serious writing experience — vim-first modal editing **on by default**, undo/redo, selection & clipboard, search & replace, multi-cursor, smarter completions.
- **Navigation & UX:** a command palette that lists every command, a user-rebindable keymap file, context-sensitive ("mode wins") key dispatch, a first-run welcome tour.
- **Robustness & perf:** capability detection with graceful degradation down to `TERM=dumb`, mouse support everywhere, a hard sub-16ms keystroke-to-paint budget, and real test infrastructure (unit + snapshot + keystroke replay on `node:test`).

The curriculum itself (content, graders, runners, progress data) is **not** the focus, but small **additive** changes to core APIs are allowed where the new UI needs them. **Existing user progress data must keep working with zero migration.**

---

## 2. Goals and Non-Goals

### Goals

1. Replace `src/tui/` (canvas, term, ansi, widgets) and all 12 views with an Ink/React implementation.
2. Improve **all four** experience axes: visual polish, editor power, navigation/UX, robustness/perf — none is deprioritized.
3. Work on **any terminal Node 20+ runs on**, degrading gracefully — from truecolor + Nerd Fonts down to plain ASCII, 8-color, `TERM=dumb`.
4. Preserve **byte-level compatibility** with existing `.data/progress.json` and workspace artifacts.
5. Introduce a **command registry + keymap** so every action is discoverable, palette-listed, and user-rebindable.
6. Ship in **phases**; each phase leaves the app fully usable and the old code for migrated views deleted.

### Non-Goals

- Changing lesson/challenge **content**, grader semantics (`src/core/grade.js` check logic), or the runner sandbox behavior.
- Rewriting `src/core/store.js` persistence format or moving the data file.
- Mobile/web interfaces; this stays a terminal app.
- LSP integration, tree-sitter parsing, or remote/collaborative editing (future work).
- Windows conhost pixel-perfection (Windows Terminal is the target; conhost just must not crash).

---

## 3. Current State (grounding for the rewrite)

### 3.1 Inventory

| Layer | Files | Notes |
|---|---|---|
| ANSI/palette | `src/tui/ansi.js` | 256-color only; `darkTheme`/`lightTheme`; `FULLSTACK_THEME` + `COLORFGBG` detection |
| Renderer | `src/tui/canvas.js` | Segment model `{text, style}`; `fit`/`clip`/`wrap`/`paragraph`; `Screen` double-buffer with line-diff |
| Terminal | `src/tui/term.js` | Raw mode, alt screen, `KEYMAP` → key names, `parseChunk`, `SIGWINCH`, `withTerminalReleased` (for `$EDITOR`) |
| Widgets | `src/tui/widgets.js` | Regex tokenizer for 10 languages, `codeBlock`, `header`/`footer`, `box`, `split`, `viewport`, `scrollbar`, `listRows`, `prose`, `statChips`, `sparkline`, `meter`, `badge`, `diffCode` |
| Shell | `src/app.js` | Screen stack router (12 views), key handlers per screen, challenge controller (completion engine wiring, browser tabs, save/reset/preview), footer hints |
| Editor model | `src/views/editor.js` | Line-array + `{row, col}` cursor; smart indent, auto-pair, multi-file via `emptyEditors` |
| Views | `src/views/*.js` | home, module, lesson, challenge, projects, stats, help, resources, workspace, browser, palette, settings |
| Embedded browser | `src/core/browser.js`, `src/views/browser.js` | Tabs: render / elements / styles / console; `synthesisParts` assembles multi-file pages |
| Check tool | `tools/check.js` | Headless `App` self-check + curriculum validation; currently the only test |

### 3.2 Known gaps the rewrite must fix

These were confirmed during the defect scan preceding this spec:

- **No undo/redo, no selection, no clipboard** — `setTextAt` whole-document writes make single-char operations safe but a history stack impossible to bolt on cleanly.
- **No mouse support** of any kind.
- **256-color ceiling** — no truecolor, no 8/16-color fallback, no unicode-width awareness (`width()` counts `String.length`, so CJK/emoji misalign rows).
- **Key conflicts**: Ctrl+P means *preview* inside a challenge but *palette* everywhere else; vim mode will claim `j/k/h/l`, so a per-mode dispatch policy is required (see §10.3).
- **Escape-sequence split risk**: `parseChunk` matches sequences within a chunk; a sequence split across stdin chunks (SSH latency) misparses as a lone `Esc` + garbage chars.
- **Naive diff**: `diffCode` compares line-by-line positionally (`current[i]` vs `reference[i]`) — misaligned insertions cascade.
- **Paste**: bracketed paste not handled; auto-pairing corrupts multi-char pastes.
- **Footer/hint drift**: per-view footer hints are hardcoded in `app.js` and can disagree with actual handlers.
- **No tests** beyond `tools/check.js`; view correctness is verified only by crash-absence.
- **`state.editor` / `state.editors` duality**: legacy single-editor field still shadows the multi-file model in several paths — the rewrite removes this class of bug entirely.

---

## 4. Interview Decisions (definitive)

Every user answer below is binding for this spec.

| # | Question | Decision |
|---|---|---|
| 1 | Priority across visual polish / editor power / nav & UX / robustness & perf | **All of the above — equal priority** |
| 2 | Dependency policy | **Whatever is best** — framework takeover explicitly allowed |
| 3 | Terminal support | **Everything** Node runs on, incl. `TERM=dumb` and 8-color |
| 4 | Visual direction | **Rich & decorated** (boxes, rounded corners, Nerd Font icons, section art) |
| 5 | Rewrite strategy | **Full rewrite** of the TUI layer; views' behavior preserved |
| 6 | Editor capabilities | **All**: undo/select/clipboard, search & replace, multi-cursor, smarter completions |
| 7 | Saved-state compatibility | **Fully compatible** — no migration, `.data/progress.json` and `~/.fullstack` artifacts keep working |
| 8 | Test infrastructure | **All**: view snapshots, unit tests, keystroke replay, *and* keep `tools/check.js` green |
| 9 | Framework | **Ink (React)** |
| 10 | Editor interaction model | **Vim-first** |
| 11 | Mouse | **Mouse everywhere** (click to move caret/select, wheel to scroll) |
| 12 | Degradation floor | **Graceful degrade** via capability detection |
| 13 | Vim default state | **Vim ON by default**; first-run hint teaches Esc/insert; settings can disable |
| 14 | Build tooling | **Add a build step** — esbuild + JSX, `src/` → `dist/`, `bin` points at `dist` |
| 15 | Icons/fonts | **Nerd Font icons** with automatic ASCII/unicode fallback |
| 16 | Rollout | **Phased views** (shell+nav → editor → browser/tools), delete old code per phase |
| 17 | Node floor | **Raise engines to Node ≥ 20** → Ink 6 + React 19 |
| 18 | Embedded browser | **Port existing tabs as-is + add** click-to-inspect, live re-render, network panel |
| 19 | Keybind system | **Command registry + user-rebindable keymap file**; palette lists all commands |
| 20 | Rewrite scope boundary | **TUI + core seams** — additive core API changes allowed where the UI needs them |
| 21 | Layout | **Resizable panes** with per-screen remembered ratios |
| 22 | Themes | **Curated set of 3–5 built-ins** with Settings picker + `FULLSTACK_THEME` |
| 23 | Performance bar | **Imperceptible**: < ~16 ms keystroke-to-paint typical; no dropped frames on large buffers |
| 24 | Documentation | **Full docs**: README rewrite, screenshots, keymap reference, vim cheatsheet, theme/mouse/env docs, CONTRIBUTING for the new architecture |
| 25 | Key-conflict policy | **Mode wins** — per-mode dispatch (vim normal/insert, palette, etc.); palette moves to Ctrl+K; editor keeps Ctrl+P preview |
| 26 | Onboarding | **Full welcome tour** on first launch (layout, vim keys, "try it" sandbox before the dashboard) |
| 27 | Test runner | **`node:test`** (built-in; zero dev-deps) |
| 28 | First milestone after shell/nav | **Editor upgrade** (vim, undo, search, multi-cursor, completions) |

---

## 5. Target Architecture

### 5.1 Stack

- **Node ≥ 20.9** (`engines` bumped; CI/matrix note in docs).
- **Ink 6 + React 19** — app is a React component tree; screens are components; the screen stack becomes React state (a router context) instead of the hand-rolled `this.stack`.
- **esbuild** for JSX: `src/**/*.jsx` → `dist/index.js` (ESM, bundle or transpile-only; no bundling of node builtins). `npm start` / `bin/fullstack.js` run `dist/`. A `dev` script (`esbuild --watch` + node `--watch`) supports the inner loop.
- **Zero other runtime deps** for v1 (vim engine, keymap, commands, capability detection are all first-party). esbuild is a devDependency only.

### 5.2 Directory layout after the rewrite

```
bin/fullstack.js          # entry → dist
src/
  main.jsx                # React root: providers (theme, mouse, keymap, router, store)
  ui/                     # NEW TUI layer (replaces src/tui/)
    capabilities.js       # terminal capability probe (§7.1)
    theme/                # theme definitions + ThemeProvider + icons w/ fallback (§7)
    commands.js           # command registry (§10.1)
    keymap.js             # default keymap + user keymap.json loader (§10.2)
    dispatcher.jsx        # mode-wins key dispatch (§10.3)
    useKeymap.jsx         # React hook wiring dispatcher → Ink's useInput
    mouse.js              # SGR mouse mode, click/wheel parsing, hit-testing (§8.5)
    clipboard.js          # OSC52 + fallbacks (§8.4)
    components/           # Header, Footer, TabBar, Panel, List, Table, Meter, Badge,
                          # ScrollPane, ResizableSplit, CodeEditor, CompletionPopup,
                          # DiffView, Modal, WelcomeTour, Toast/Notice ...
  screens/                # NEW views (replaces src/views/*.js rendering only)
    home.jsx module.jsx lesson.jsx challenge.jsx projects.jsx stats.jsx
    help.jsx resources.jsx workspace.jsx browser.jsx palette.jsx settings.jsx
  editor/                 # NEW editor engine (framework-agnostic, pure)
    document.js           # rope-ish text model (line array or piece table; see §8.1)
    history.js            # undo/redo with coalescing (§8.2)
    selection.js          # ranges, shift-motion, mouse selection (§8.3)
    search.js             # incremental search, replace, match counts (§8.6)
    multicursor.js        # multi-cursor model + per-cursor ops (§8.7)
    vim.js                # modal state machine (§8.8)
    completions.js        # superset of current complete.js (§8.9)
  content/                # unchanged
  core/                   # unchanged except additive seams (§5.4)
  store.js → src/core/store.js  # unchanged
dist/                     # build output (gitignored)
tools/check.js            # extended, still first-class (§13)
tests/                    # node:test suites (§13)
esbuild.config.mjs
```

Old `src/tui/` and the rendering parts of `src/views/` are **deleted per phase** (§14). The editor model in `src/views/editor.js` is superseded by `src/editor/` and deleted in Phase 3.

### 5.3 State management

- A single `AppProvider` (React context + `useReducer`) replaces the mutable `app.state` bag. Sub-trees subscribe to slices so a keystroke in the editor doesn't re-render the whole frame (Ink reconciles per component).
- Screen stack becomes `{ name, params }[]` in router context with `push`/`pop`/`replace` semantics identical to today (Esc behavior preserved everywhere).
- The `Store` (`src/core/store.js`) instance is injected via context — **its API and file format do not change** (§11).
- Timers (study-time flush every 30 s) move into a provider effect; `unref` semantics preserved.

### 5.4 Permitted core seams (additive only)

The UI may require small additive changes; each is listed so review is easy:

1. `core/browser.js`: expose structured results (nodes with source ranges) so **click-to-inspect** can map a render-tab click to an element index and jump to its source position; expose the mocked-route table for the **network panel**. No behavior change to existing exports.
2. `core/grade.js` (or a wrapper): allow graders to report a **diagnostic range** (line/col) when a check fails, so failures can jump-to-location in the editor. Optional field; graders without it behave as today.
3. `core/runner.js`: allow the console to reuse one warmed VM context across evaluations in a browser session (perf only; isolation semantics unchanged).
4. `Store`: **no format changes**; additive read-only helpers allowed (e.g. `statsFor(id)`).
Anything beyond additive/observational changes needs a spec amendment.

---

## 6. Behavior Compatibility Contract

The rewrite must preserve, verbatim unless a section below says otherwise:

- **Routing & keys**: stack navigation, `Esc` pops (quits at home), `?` opens help, `q` quits on non-typing screens, `j/k/h/l`, `Tab`, `Space`, `Enter` semantics on lists, per-screen footer hint *content* (until §10 re-derives them from the registry).
- **Challenge flow**: Ctrl+S check, Ctrl+R reset (per-file for multi-file), Ctrl+H hints (Conceptual → Strategic → Code progression), Ctrl+G solution (+ `y` to copy, + diff view), Ctrl+B browser, Ctrl+E external editor via `$EDITOR`/`VISUAL` with `withTerminalReleased`-equivalent suspend/resume, Ctrl+O save, Ctrl+T console logs, Ctrl+P preview, Ctrl+Space completions, Ctrl+Q/W tab switching, tab-completion acceptance, auto-pair/auto-close-tag behavior.
- **Multi-file (synthesis) model**: per-file editors, per-file language detection, save writes every file, reset only touches the focused file.
- **Console**: expression history (↑/↓), Ctrl+L clear, Ctrl+U clear line, async `await` support, mockFetch/prelude/fixture context.
- **Persistence**: every `Store` call site and the `progress.json` schema (§11.1) unchanged; lesson scroll positions, streaks, `bestCode`/`lastCode` all keep working.
- **CLI**: `--verify`, `--list`, `--reset`, `FULLSTACK_THEME` env var (now one of several theme selection inputs, §7.2), `FULLSTACK_UI`-style escapes are **not** kept after parity (per phase 4 deletion).

Deliberate changes are: the Ctrl+P split (§10.3), palette invocation key (Ctrl+K), and anything else listed in §10.4.

---

## 7. Visual Design System ("rich & decorated")

### 7.1 Capability detection (`ui/capabilities.js`)

Probed once at startup (with safe re-probe on resize), producing a profile:

| Capability | Detection | Graceful fallback |
|---|---|---|
| Truecolor | `COLORTERM=truecolor` / `TERM\=*-truecolor` | → 256 → 16 |
| Color depth | `CI`/`NO_COLOR`/`FORCE_COLOR` respected; `TERM`/`COLORTERM` parsing; `TERM=dumb` → 0 | 0-color: all fg/bg dropped, emphasis via bold/underline only |
| Unicode box-drawing & block glyphs | `TERM`/platform/locale heuristic (`NO_UNICODE=1` override, Windows: WT_SESSION ⇒ yes, conhost ⇒ no) | ASCII chrome (`+-\|`, `#`, `=`) |
| Nerd Font | `TERM_PROGRAM`, `WEZTERM_*`, `KITTY_*`, user override in settings/env (`FULLSTACK_ICONS=nerd|unicode|ascii`) — never *auto-guess hard*; heuristic off ⇒ unicode tier | unicode → ASCII tiers |
| Mouse | TTY check + `FULLSTACK_MOUSE=0/1` override; SGR (1006) mode preferred | keyboard-only |
| Bracketed paste | `\x1b[?2004h` support assumed on modern; disable on `dumb` | paste as char stream with pairing suppressed |
| Terminal size | `process.stdout.columns/rows` + SIGWINCH (debounced ~50 ms) | min floor 40×16 like today |

**Degrade matrix** (must be visually verified at each tier):

- **Tier A** (truecolor + nerd + mouse): full experience.
- **Tier B** (256-color + unicode): icons → unicode glyphs (`  → ✔ ✗ ▸ █ ▁▂▃`), rounded corners → sharp or kept per glyph support.
- **Tier C** (16-color + unicode): theme maps to nearest ANSI-16.
- **Tier D** (no color, ASCII, `TERM=dumb`): the app still runs, renders plain line-oriented screens, no alt-screen animations; a banner notes the degraded mode. Ink renders static output here — the app must never crash on a missing TTY (piped stdout: static one-shot render + exit, as tests need).

### 7.2 Themes (curated set, 3–5)

Ship: `midnight` (default dark, successor to today's dark), `paper` (light), plus **three more** finalized during implementation — direction: one high-contrast dark (a11y), one warm accent dark, one dimmed/pastel. Each theme is a **semantic token set** (bg, panel, panelAlt, border, borderFocus, text, muted, faint, accent, accentSoft, secondary, good, bad, warn, star, codeBg, codeText, string, keyword, comment, number — superset of today's keys so the tokenizer ports cleanly) expressed per color-depth tier (truecolor hex + 256 + 16 mappings).

Selection order: `FULLSTACK_THEME` env → saved settings → `COLORFGBG`/`TERM_PROGRAM` heuristic → default. Settings screen gets a **live-preview theme picker** (arrow keys re-theme the screen instantly).

### 7.3 Chrome & decoration language

- **Header**: double-height on Tier A/B — app wordmark + version, breadcrumb trail (`Module › Lesson › Challenge`), global progress ring/meter on the right, active top-level tab strip (Dashboard / Projects / Progress / Resources / Workspace) as decorated tabs.
- **Footer**: keybind hints **generated from the active mode's command registry entries** (no more hand-maintained lists), notices/toasts rendered as colored chips (info/good/warn/bad), current vim **mode indicator** (`-- INSERT --`, `-- NORMAL --`, `-- VISUAL --`) styled as a mode-colored block like vim/Powerline.
- **Panels**: rounded borders (`╭ ╮ ╰ ╯`) on Tier A/B, title-in-border with icon, focus ring in `borderFocus`; subtle background banding in lists.
- **Section art**: module headers get a themed ASCII/nerd banner block and per-language icon (HTML/CSS/JS/TS/React/Node/SQL/Docker/Git/YAML); challenge cards get kind icons (write/debug/synthesis) and difficulty pips; stat chips get sparklines and meters (port `sparkline`/`meter` to components).
- **Motion**: strictly non-essential — e.g. progress meter fill on pass, toast slide — implemented with a single rAF-like interval and fully disabled at Tier C/D and `NO_ANIMATION=1`. Never blocks input.

### 7.4 Layout & resizable panes

- `ResizableSplit` component (horizontal + vertical) with: smart defaults by terminal width (today's `w >= 104` rule generalized), divider drag with **mouse**, and a keybind (`⌃⇧←/→`, rebindable) to nudge ratios.
- Ratios persisted **per screen** in settings (`ui.panes.challenge = { brief: 0.42 }` etc.), clamped to sane min widths; reset-to-default command in the palette.
- All long views (lesson, stats, help, resources, workspace, solution, browser tabs) share one `ScrollPane` with consistent scroll model, scrollbar rail (port of `scrollbar`), and mouse-wheel support.

---

## 8. Editor & Writing Experience (first milestone after shell/nav)

The editor is a pure, framework-agnostic engine (`src/editor/*`) with a thin Ink binding (`CodeEditor` component). Every operation returns a new state (immutably or via internal copy-on-write) so undo and React re-render fall out naturally.

### 8.1 Document model

- Text + cursor + selection + per-file tab state; keep the line-array representation but wrap it so operations go through one `applyEdit(changes)` chokepoint (replaces today's `setTextAt` whole-document writes).
- Multi-file tabs as today (Ctrl+Q/W switch, per-file language, per-file cursor/scroll/undo stacks preserved when switching).
- Correct visual width: wcwidth-aware (own 300-line implementation, zero-dep) for CJK/emoji; tabs expand to configurable `tabSize` (default 2, matching today's insert-2-spaces).

### 8.2 Undo/redo

- Full history per file with **coalescing** (typing bursts, auto-pair inserts, indent on Enter = one undo step), grouped on completion acceptance, paste, and replace-all.
- Keybinds: undo = vim `u` (normal) / Ctrl+Z (insert & modeless); redo = Shift+Ctrl+Z or the palette command — **not** Ctrl+R, which stays owned by challenge reset (Appendix B.8 conflict register). Undo in one file never touches others.

### 8.3 Selection & clipboard

- Selection ranges (anchor+head), extended by shift+arrows/home/end/pgup/pgdn, mouse drag, and vim visual/visual-line/visual-block modes.
- Ops on selection: delete, yank/paste, indent/outdent (Tab/Shift+Tab), comment/uncomment (per-language, palette command), case transforms.
- Clipboard: **OSC52** escape for copy with capability heuristic + user override; system paste via bracketed paste; internal yank register ring (vim registers `"` `0` plus named `a–z` minimal set).

### 8.4 Paste

- Bracketed paste groups the whole insertion: suppress auto-pair/auto-indent during paste, normalize CRLF, one undo step, keep selection semantics (paste replaces selection).

### 8.5 Mouse in the editor

- Click places caret; double-click selects word; drag selects; wheel scrolls; click a file tab to switch; click a completion popup item to accept; click a gutter line number to select the line.
- **Shift+Click / Shift+wheel bypasses mouse capture** so native terminal text-selection still works (documented).

### 8.6 Search & replace

- Incremental search (`/` in vim normal mode, Ctrl+F in insert/other screens) with: match count, next/prev (`n`/`N`), highlight-all-in-viewport, case toggle (smart-case default), regex toggle, and search across the active file first with "search other tabs" via palette command.
- Replace (`%s`-style via palette command + Ctrl+H in-editor): confirm-each or replace-all, undoable as one step.
- `gd`-style go-to-matching-bracket, jump-to-line (`:` + number), and jump-to-failed-check (uses the diagnostic range from the §5.4 seam when present).

### 8.7 Multi-cursor

- Add-cursor-above/below (Ctrl+Alt+↑/↓ rebindable), add-cursor-at-next-match-of-selection (Ctrl+D analog), visual-block column insert.
- All primary ops (type, backspace, pair-insert, indent, completion) apply per-cursor; single undo step for the batch. Cap cursors at ~50 with a notice.

### 8.8 Vim mode (first-class, ON by default)

- Modal state machine: normal / insert / visual / visual-line / visual-block / replace(overtype) / pending-operator.
- Coverage target for v1 (full cheatsheet in docs): motions `h j k l w W b B e E 0 ^ $ gg G { } f/F t/T ; , %` with counts; operators `d c y > < gu gU` + `p/P` with registers; insert entry `i a I A o O s`; ex-lite via palette (`:w` save, `:q` back, `:q!`, `:wq`, `:reset`, `:hint`, `:solution`, `:browser`, `:%s//`); marks minimal (`` `` `` jump back), dotful basics (`.` repeats last change).
- Mode indicator always visible in the footer; **first-run guardrails** (§9): the welcome tour teaches `i` and `Esc`, and when a user types text in normal mode for >2 s with no edit, a one-time footer hint appears: "Press `i` to start typing — `?` for help". A settings toggle (`editor.vimMode: false`) + palette command switch to modeless mode (current keymap) without restart.
- Ctrl+C **never** gets eaten by vim mode: it remains the global quit (§10.3), matching beginner expectations.

### 8.9 Completions & signature help

- Keep and extend the current trigger engine (Ctrl+Space, auto-trigger ≥2 chars or `<`/`:`/`@`), preserving smart-pair integration.
- Data superset per language: HTML tags/attrs (+ per-tag attr sets, entity completion), CSS properties/values/at-rules/pseudo (with `:`/`--` triggers), JS/TS DOM + language API surface (document/querySelector methods, array/string/object methods, keywords), React/JSX tags for the React modules, shell/SQL kept as today.
- Snippets with tab-stop placeholders (`for`, `fn`, `document.querySelector(...)` etc.), expanded through the same `applyEdit` chokepoint.
- **Signature help**: after `(` show a one-line signature popup for known DOM/builtin APIs (Ctrl+Space cycles overloads); dismiss on `)`/Esc/move.
- Popup: keyboard (`↑↓` select, `Tab/Enter` accept, `Esc` dismiss — same as today), plus mouse hover/click; rendered as an Ink overlay with the doc-string line for the focused item.

---

## 9. Onboarding — Welcome Tour

First launch (flag in settings, `onboardedAt: null`) shows a full-screen tour before the dashboard:

1. **Welcome + what this is** — curriculum shape, progress tracking, where data lives (`.data/progress.json`).
2. **The screen** — annotated header/body/footer diagram with live highlights.
3. **Vim in 30 seconds** — Normal vs Insert, `i`/`Esc`, `:w` to check, arrow keys always work; explicitly reassures beginners, with "switch to simple keys" option right there (writes `editor.vimMode: false`).
4. **Try-it sandbox** — a scratch challenge (non-graded) with a pre-filled buffer where the tour asks the user to type, complete a snippet (Ctrl+Space), save (`:w`), and open the browser pane (Ctrl+B). Success advances.
5. **Mouse & clipboard note** — Shift+click to select text natively, wheel to scroll.
6. Done → dashboard, `onboardedAt` stamped; re-run anytime via palette command "Replay welcome tour" and `?` → "Tour" entry.

Skippable at every step (Esc); skipping marks onboarded. Degrade tiers adjust the tour copy (no mouse section at Tier C/D, ASCII diagrams).

---

## 10. Commands, Keymap & Dispatch

### 10.1 Command registry (`ui/commands.js`)

Every user-invokable action becomes a registered command:

```js
register({
  id: 'challenge.check',            // stable, used in keymap.json and tests
  title: 'Check my code',            // palette display
  category: 'challenge',
  icon: 'check',                     // nerd/unicode/ascii tier icon
  when: (ctx) => ctx.screen === 'challenge' && !ctx.showSolution,  // availability
  run: (ctx) => ctx.checkChallenge(),
  keys: { normal: '<C-s>', insert: '<C-s>' },  // defaults per mode; may be null
  hint: ['^S', 'check'],             // footer chip derivation
})
```

~70 commands projected (navigation ×12, lesson ×6, editor ×25, vim-ex ×8, browser ×10, workspace/save ×5, settings/theme ×5). The palette lists **all commands matching `when(ctx)`**, fuzzy-filtered over `title` + `id` + category, showing keybinding and icon — replacing today's navigation-only palette. Navigation targets (modules/lessons/challenges) remain a palette *source* mixed under a "Go to" section.

### 10.2 User keymap (`.data/keymap.json` — project-local, beside `.data/settings.json`; travels with the repo like the progress file)

- Format: `{ "challenge.check": "<C-s>", "editor.deleteLine": "<C-d>" }`; loaded at startup, merged over defaults, unknown ids warned (rendered once in the footer as a notice, never crash).
- Settings screen gets a **keymap viewer** (browse by category; read-only in v1 with a pointer to editing the file + "Reload keymap" command).
- Conflict handling: user overrides are applied per-mode; collisions between two *commands bound in the same mode/context* resolve in registry order and are surfaced in `tools/check.js` as warnings (§13).

### 10.3 Dispatch: "mode wins"

A single dispatcher resolves keys by priority, first match wins:

1. **Modal overlays**: completion popup, search prompt, palette input, confirm dialogs.
2. **Vim mode** (if enabled): the vim state machine consumes the key entirely.
3. **Screen-local commands** whose `when(ctx)` passes.
4. **Global commands**: Ctrl+K palette (everywhere), `?` help, Ctrl+C quit, Ctrl+L repaint (all *after* overlays but before screen-local fallbacks where the screen hasn't claimed them — exact ordering table lives in `dispatcher.jsx` and is unit-tested).
5. **Fallback**: unmatched keys are dropped silently (as today), except in the editor where chars type.

Concretely: **Ctrl+K** = palette everywhere; **Ctrl+P** = preview inside challenge screens only; inside the palette, Ctrl+P types a literal `p`. Documented in the keymap reference.

### 10.4 Deliberate key changes vs today

| Key | Was | Now |
|---|---|---|
| Ctrl+P (non-challenge) | palette | **Ctrl+K** palette; Ctrl+P reserved for preview/binding on screens that have one |
| Palette contents | navigation only | all commands + "Go to" navigation |
| Footer hints | hardcoded arrays | derived from registry `hint`s |
| Ctrl+Z / Ctrl+F / Ctrl+D … | unused | undo / search / add-cursor (insert mode) |
| `u` / `d`/`c`/`y` etc. | typed as text | vim operators when vim mode on |

---

## 11. Persistence & Compatibility

### 11.1 Unchanged (contract)

`.data/progress.json` — schema `version: 1` exactly as today (`lessons{scroll,read}`, `challenges{passed,attempts,hintsUsed,solutionSeen,solvedAt,lastCode,bestCode}`, `projects{checks,notes}`, `days{minutes,challenges,lessons}`, `streak`, `totals`, `lastSeen`). New code must never write keys it doesn't read today unless additive and backward-tolerant (old app versions must still be able to load the file). Workspace artifact layout (`<module>/<lesson>/<challenge>[.<ext>|/<file>]` + `.preview.html`) unchanged.

### 11.2 New settings file

`.data/settings.json` (created lazily, JSON, versioned `version: 1`):

```jsonc
{
  "version": 1,
  "onboardedAt": null,            // ISO date after tour
  "theme": "midnight",            // | "paper" | …
  "editor": { "vimMode": true, "tabSize": 2, "relativeLineNumbers": false },
  "mouse": true,
  "icons": "auto",                // auto | nerd | unicode | ascii
  "panes": { "challenge": { "brief": 0.42 }, "browser": { "render": 0.5 } },
  "palette": { "recent": ["challenge.check"] }
}
```

All keys optional with defaults; unknown keys ignored. Keymap override file lives beside it. A `Reset UI settings` command clears it without touching progress.

---

## 12. Performance Budget

- **Keystroke-to-paint < 16 ms** (p95) on a mid-range laptop (2020 4-core) for: typing in a 500-line buffer, palette typing, list navigation, browser-tab scrolling. Measured by hooking Ink's stdout write path (not wall-clock around macrotasks — spike A5 showed a naive `setTimeout(0)`-based measure over-counts to ~23 ms p50 on an idle 20-row tree). Asserted in check runs with generous CI headroom (warn > 33 ms, fail > 100 ms). Because idle re-renders can already approach the budget, the editor virtualizes its viewport from day one (§8) and caret moves must not re-render siblings.
- Editor viewport is **virtualized** (render only visible lines ±20); syntax highlighting is per-visible-line, memoized by (line, lang, theme) in a small LRU.
- Palette: fuzzy match over ≤ 200 items must be < 2 ms/query (pre-indexed token sets).
- Frame cost: no full-tree re-render on caret moves — caret blink/move touches the editor component only; Ink's static output used for never-changing chrome where it helps.
- Startup: < 400 ms cold to first interactive frame (Tier A terminal), excluding Node boot.
- The 30 s session flush and any timers stay `unref`'d; no timer wakes the render loop.

---

## 13. Testing Strategy

Runner: **`node:test`** (built-in), run via `npm test`. `tools/check.js` stays the curriculum validator and is extended; the new suites live in `tests/`.

1. **Unit tests** (`tests/unit/`): document model (every op × undo), vim state machine (table-driven: key seq → expected state/text), selection/multi-cursor ops, search/replace, completions triggers + snippet expansion, keymap merge + conflict detection, dispatcher priority table, capability detection (stubbed env matrix), wcwidth, OSC52 encoder, theme tier mapping, mouse-event parser (SGR + wheel), `Store` unchanged-behavior regression suite.
2. **View snapshot tests** (`tests/snapshots/`): render each screen with a seeded store/curriculum at fixed sizes (40×16, 80×24, 120×40, 200×50) into a **fake stdout** (capture Ink's output, strip ANSI or keep as flag), assert normalized text snapshots. Snapshot-blessing flow documented. Include a degrade-matrix matrix test: each screen × tier A–D renders without throwing, and Tier D contains no ANSI escapes.
3. **Keystroke replay harness** (`tests/helpers/`): drives the real `App`/root component headless — feed key event sequences (parsed via the same `parseChunk`-equivalent, or Ink's input stream) + a scripted clock; assert resulting state and/or final screen text. Goldens: onboarding tour, solve-a-challenge-from-scratch (type → check → pass → save), vim edit undo redo, multi-file tab flow, console session, resize sequence, mouse click-to-caret.
4. **`tools/check.js` extensions**: (a) curriculum validation as today; (b) keymap lint — duplicate bindings within a mode, bindings shadowed by overlays, unknown command ids; (c) perf smoke — replay N keystrokes, report p50/p95, warn above budget; (d) headless render of every screen at every tier (crash-proof, like the existing self-check).
5. **CI shape**: `npm run build && npm test && npm run check` green is the merge bar.

---

## 14. Phased Rollout

Each phase: implemented → old code deleted → docs updated → all suites green. Nothing ships half-migrated within a phase.

**Cut-over mechanics (clarified):** Ink and the hand-rolled renderer cannot share one terminal frame, so screens migrate as a set. Phases 0–3 keep the **current app as the default entry** while the new UI runs behind `FULLSTACK_UI=next` for development and testing; "old code deleted per phase" applies to superseded experiments *inside the new tree*. At **Phase 4**, once the next UI reaches parity, the default flips to the Ink app, `FULLSTACK_UI` is removed, and all of `src/tui/` + old `src/views/` rendering is deleted in one commit. This resolves the apparent conflict between "phased views" and "both renderers need the whole terminal."

- **Phase 0 — Foundations** (no user-visible change): Node 20 engines, esbuild pipeline, Ink/React deps, providers, capability detection, theme engine (port current two themes first), command registry + keymap loader + dispatcher, mouse plumbing, test scaffolding + replay harness. `src/tui/` still powers the app; new layer proven by tests.
- **Phase 1 — Shell & navigation**: Header/Footer/TabBar/List/ScrollPane/Modal/Toast components; home, module, lesson, projects, stats, help, resources, workspace, settings, **command palette**, **welcome tour**; resizable split landed (used by challenge in Phase 2). Delete: old `views/{home,module,lesson,projects,stats,help,resources,workspace,settings,palette}.js` + widget paths they alone used. *(Palette moves to Ctrl+K here; footer hints become registry-derived.)*
- **Phase 2 — Editor & challenge** (**first value milestone**): `src/editor/*` engine + vim + undo/selection/clipboard/search/multi-cursor/completions/snippets/signature; challenge screen on Ink with ResizableSplit, tab strip, completion popup, diff view (upgrade `diffCode` to a real line-level LCS diff while porting); Ctrl+P preview, Ctrl+B browser handoff. Delete: old `views/challenge.js` rendering, old `views/editor.js` model, old `widgets.js` codeBlock/tokenizer once nothing references them.
- **Phase 3 — Browser & tools**: render/elements/styles/console tabs ported as-is **plus** live re-render (debounced ~300 ms, error overlay), click-to-inspect (render→elements/styles sync, jump-to-source), network panel (5th tab); console on warmed context. Delete: old `views/browser.js`, old `core/browser.js` consumers updated to the new seam.
- **Phase 4 — Polish & cut-over**: full theme set (3–5), Nerd Font icon pass, animation touches, degrade-tier verification tour, perf budget enforcement in check, docs (§15) complete, remove `FULLSTACK_UI`/legacy env escapes and any compat shims, delete remaining `src/tui/` remnants.

---

## 15. Documentation Deliverables

- **README rewrite**: hero screenshot (Tier A), feature list, install (Node ≥ 20), quickstart, keymap reference table (auto-generated from the registry — build a `tools/gen-keymap-docs.js`), vim cheatsheet, themes + env vars (`FULLSTACK_THEME`, `FULLSTACK_ICONS`, `FULLSTACK_MOUSE`, `NO_COLOR`, `NO_UNICODE`, `NO_ANIMATION`), mouse behavior incl. Shift-bypass, troubleshooting tiers (why does it look plain?), data & backup.
- **CONTRIBUTING/architecture doc**: the new layer map (§5.2), command registration how-to, adding a screen, adding a theme, editor engine guide, testing guide (snapshots + replay), esbuild/build notes.
- **In-app**: `?` help rewritten as paged, themed, mouse-scrollable manual (same content as keymap reference); welcome tour doubles as the interactive tutorial.

---

## 16. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Ink re-render cost breaks the 16 ms budget on big buffers | Editor feels laggy — core promise broken | Virtualized viewport, memoized highlighting, slice-scoped state, perf assert in check tool from Phase 2 onward |
| Vim-by-default traps beginners | Learners can't type; curriculum's audience fails at step one | Welcome tour with sandbox, persistent mode indicator, footer nudge when typing in normal mode, one-key switch to modeless, Ctrl+C always quits |
| Ink + `TERM=dumb` / non-TTY | Crashes or garbage in CI, pipes, odd terminals | Tier D static renderer + fake-stdout tests per tier; `noTTY` guard at entry (piped stdout ⇒ one-shot static output) |
| Escape-sequence latency misparse (SSH) | Random `Esc` presses while navigating | Input coalescer: buffer ≤ 50 ms for ambiguous ESC-led input; unit-tested splitter |
| Mouse capture annoys selection/copy users | Day-to-day friction | Shift bypass, settings toggle, documented |
| OSC52 unsupported | Clipboard silently broken | Detect/heuristic + explicit setting + internal register always works |
| Full rewrite bites off more than phases can chew | Long broken intermediate states | Phase discipline: app always runnable, suites green per phase, old code deleted per phase |
| Scope creep into core/graders | Curriculum regressions | §5.4 seam whitelist; anything else needs spec amendment |

---

## 17. Open Questions (to resolve during implementation, non-blocking)

1. ~~Settings/keymap file location~~ **Resolved (Phase 0):** project-local `.data/settings.json` + `.data/keymap.json`, matching the existing `.data/progress.json` convention.
2. Exact 3 remaining themes and their palettes (design pass in Phase 4).
3. Document model internals: line-array with change-batching vs piece-table — decide in Phase 2 against the perf budget.
4. Whether relative line numbers ship in v1 (setting is reserved) or Phase 4 polish.
5. Windows conhost: aim "does not crash, Tier C" — verify and document, no promises beyond.
6. Ink 7 upgrade: once Node ≥ 22 is acceptable for the audience, migrate to Ink 7 for its native Alternate Screen and revised input pipeline; our first-party input pipeline (§A.3) then narrows to paste + mouse only. Revisit after Phase 4. *(Spike note: npm `latest` already resolves to 7.1.1 — keep `ink@^6` pinned.)*

---

## 18. Acceptance Criteria (whole project)

- [ ] All 12 screens rendered via Ink, old TUI code deleted.
- [ ] `npm run build && npm test && npm run check` green; ≥ 3 replay goldens for the editor; snapshot tests for every screen × 4 sizes; degrade matrix A–D crash-free.
- [ ] p95 keystroke-to-paint within budget on the replay harness.
- [ ] A user with an existing `.data/progress.json` opens the new app and retains: progress, streaks, in-progress code, lesson scroll positions — with **zero** manual steps.
- [ ] Every visible action is a registry command; palette lists them; keymap.json rebind works; footer hints match reality (registry-derived).
- [ ] Vim-first editing with the §8.8 coverage list works end-to-end, and can be disabled live from Settings.
- [ ] Mouse: click caret/list/tab, drag select, wheel scroll, divider drag, completion click — plus Shift bypass.
- [ ] Welcome tour runs on first launch and is re-playable.
- [ ] README/CONTRIBUTING/keymap/vim docs complete; screenshots accurate.

---

# Appendix A — Ink 6 / React 19 Feasibility & De-risking

*Research findings from the official Ink repository/docs, npm metadata, and release coverage (Sept 2026). Verified facts first, then the shim plan, then the fallback ladder.*

## A.1 Verified facts

| Fact | Consequence for this project |
|---|---|
| Ink is a custom React renderer over **Yoga flexbox**; every `<Box>` is a flex container; **all text must be inside `<Text>`**; `<Box>` cannot nest inside `<Text>` | Views port as component trees; the segment-row mental model is replaced by layout, not emulated |
| Ink 7 (Apr 2026) requires **Node ≥ 22 and React ≥ 19.2**, adds native **Alternate Screen** mode in `render()` and a revised input pipeline | Our Node ≥ 20 decision **pins us to ink@6**. Ink 7 is the documented future upgrade path (Appendix E, §17.6) |
| Stable ink@6 has **no built-in alternate screen** (GitHub issue #263; community wrapper `fullscreen-ink` exists) | We ship a first-party ~30-line wrapper: emit `\x1b[?1049h` + cursor-hide around `render()`, `\x1b[?1049l` + cursor-show on unmount — identical sequences to today's `term.js` |
| Stable ink@6 has **no built-in mouse support** (mouse SGR bytes arrive in `useInput` as garbage; community pattern is to pre-parse stdin) | Confirms the architecture: our **first-party input pipeline** (§A.3) owns stdin raw mode, parses SGR mouse (1006), bracketed paste (2004), and escape-split coalescing, and feeds the dispatcher. We do **not** use `useInput` as the primary input path |
| `render(element, { stdout, stdin, exitOnCtrlC, patchConsole, debug })` accepts **fake streams** | Snapshot tests and the keystroke-replay harness drive the real tree headlessly — §13 is directly supported |
| Newer Ink docs expose `useBoxMetrics`, `contentOffsetX/Y` + `overflow="hidden"` (scroll views), `usePaste`, `useCursor` (caret placement for IME), `useWindowSize`, `<Static>`, custom `borderStyle` objects | **Spike-verified (docs/ink-spike.md)**: ink@6.8.0 ships `useCursor`, `useFocus*`, `useStd*`, `<Static>` and working `contentOffsetY` (prop accepted *and* offsets render). `usePaste`, `useBoxMetrics`, `useWindowSize`, `useAnimation` are **absent** — window size is a trivial first-party SIGWINCH hook; paste/mouse are first-party by design (§A.3); box metrics measured via rendered-children; animation deferred to Phase 4 |
| Yoga does not support percentage `minWidth`/`maxWidth` (react/yoga#872) | Min/max pane widths computed in pixels from `useWindowSize` |
| Ink re-renders the tree on each state change and writes diffs; unbatched stdin chunks cause one render per chunk | The input pipeline coalesces events on a ~16 ms tick before dispatch (§12 perf budget); editor viewport stays virtualized |
| `patchConsole` (on by default) captures `console.*` above the frame | Code must not `console.log` in TUI mode; headless check asserts zero stray writes |

## A.2 Version matrix decision

- `ink@^6` + `react@^19` — **spike-resolved**: `ink@6.8.0` (peers `react >=19`, engines `node >=20`; npm `latest` is 7.1.1 which needs Node ≥ 22 — pin `ink@^6` in installs/renovate config) with `react@19.3.0`. esbuild bundling requires two documented workarounds (devtools alias + createRequire banner, see docs/ink-spike.md).
- `esbuild` (devDependency only) with `jsx: 'automatic'`, `format: 'esm'`, `platform: 'node'`, `target: 'node20'`.
- engines: `node >=20.9` (decision #17).

## A.3 Input pipeline (first-party, replaces `useInput`)

```
stdin (raw) → chunker → [escape-split coalescer ≤50 ms] → [SGR mouse parser]
                       → [bracketed paste grouper]        → key events
       → dispatcher (§10.3) → commands / vim machine / screen handlers
```

- Ports the proven `parseChunk` from `src/tui/term.js` and fixes its known SSH split bug (§3.2).
- All parsing is pure and unit-tested (key seq → events, including split-across-chunks cases).
- Ink never touches stdin; `exitOnCtrlC: false`; Ctrl+C handled by the dispatcher (always quits, even in vim normal mode).

## A.4 Fallback ladder (if the spike fails)

1. ink@6 unusable with Node 20 → try ink@6 + react@18.
2. Still broken → ink@5 + react@18: lose `useBoxMetrics`/`contentOffset` (ScrollPane falls back to measuring rendered row counts — the current `viewport()` approach inside a component); lose `usePaste` (we own paste parsing anyway).
3. Only if both fail (not expected — Ink 5/6 both run on Node 18+) → re-raise Node floor decision with the user before proceeding.

## A.5 De-risked-by-design notes

- **Alt screen, mouse, paste, escape-split** are all first-party code regardless of Ink version — the riskiest integrations do not depend on Ink at all.
- **Degrade Tier D** (`TERM=dumb`, non-TTY): render() with a fake stdout and `debug: false`, one-shot static output, exit — same path as tests, so it is exercised continuously.
- **Caret/IME**: cursor placement uses `useCursor` if present in ink@6, else the same explicit `moveTo` write today's app does via `screen.out`.

---

# Appendix B — Default Command Registry & Keymap

Notation: `<C-x>` Ctrl, `<A-x>` Alt, `<S-x>` Shift, `<Esc>` `<CR>` `<Space>` `<Tab>` `<BS>` `<Del>` named keys; plain letters are literal characters. **Modes:** `N` = vim normal (and visual where noted), `I` = vim insert *and* modeless editor, screen contexts come from `when(ctx)`. User overrides in `.data/keymap.json` map command ids to the same notation. Final inventory: **~120 ids** (≈70 user-facing; the rest are motions/completion internals surfaced in the keymap viewer).

## B.1 Global (8)

| Command | Title | Keys | Notes |
|---|---|---|---|
| `app.quit` | Quit | `<C-c>`, `q` (non-typing screens) | Always wins, even in vim normal mode |
| `app.back` | Back / dismiss | `<Esc>` | Pops stack; quits at home |
| `app.palette` | Command palette | `<C-k>` | Everywhere; **replaces old Ctrl+P palette** |
| `app.help` | Help manual | `?` | |
| `app.repaint` | Repaint screen | `<C-l>` | |
| `app.reloadKeymap` | Reload keymap | palette-only | |
| `app.toggleMouse` | Toggle mouse capture | palette-only | Writes `mouse` setting |
| `app.tour` | Replay welcome tour | palette-only | |

## B.2 Navigation (13)

| Command | Keys | Notes |
|---|---|---|
| `nav.up` / `nav.down` | `<up>`/`k` · `<down>`/`j` | Lists, menus; **not** the editor (vim owns hjkl there) |
| `nav.pageUp` / `nav.pageDown` | `<pageup>` · `<pagedown>` | |
| `nav.first` / `nav.last` | `g` · `G` | List endpoints (vim-consistent) |
| `nav.select` | `<CR>` | Open focused item |
| `nav.jumpTab1..5` | `<A-1>`..`<A-5>` | Dashboard/Projects/Progress/Resources/Workspace |
| `nav.tabNext` / `nav.tabPrev` | `<A-l>` · `<A-h>` | Cycle top-level tabs |

## B.3 Lesson (5)

| Command | Keys | Notes |
|---|---|---|
| `lesson.open` | `<CR>` (no focus) | Opens first unpassed challenge |
| `lesson.focusNext` / `lesson.focusPrev` | `<Tab>` · `<S-Tab>` | Challenge focus ring |
| `lesson.markRead` | `m` | |
| `lesson.next` | `n` | Next lesson |

## B.4 Challenge (13)

| Command | Keys | Notes |
|---|---|---|
| `challenge.check` | `<C-s>`, ex `:w` | |
| `challenge.reset` | `<C-r>` | Focused file for multi-file |
| `challenge.resetFile` / `challenge.resetAll` | palette-only | Multi-file variants |
| `challenge.hint` | `<C-h>` | Beats insert-mode `<C-h>`; insert backspace is `<BS>` |
| `challenge.solution` | `<C-g>` | Toggles solution; again = diff |
| `challenge.copySolution` | `y` (solution view) | |
| `challenge.preview` | `<C-p>` | Challenge screens only (§10.3) |
| `challenge.browser` | `<C-b>` | |
| `challenge.save` | `<C-o>` | |
| `challenge.externalEditor` | `<C-e>` | Suspends/resumes alt screen via `$EDITOR` |
| `challenge.logs` | `<C-t>` | |
| `challenge.paneToggle` | `<Tab>` (narrow) | brief ↔ code |

## B.5 Editor (56 ids, compressed rows)

| Command(s) | Vim N | I / modeless | Notes |
|---|---|---|---|
| `editor.cursor{Left,Right,Up,Down}` | `h` `l` `k` `j` | arrows | Visual extends with `<S-*>` |
| `editor.lineStart` / `editor.lineEnd` | `0` `$` | `<Home>` `<End>` | `^` = first non-blank |
| `editor.docStart` / `editor.docEnd` | `gg` `G` | palette | |
| `editor.word{Forward,Back,End}` | `w` `b` `e` | `<A-right>/<A-left>` | Counts supported |
| `editor.scrollHalf{Up,Down}` | `<C-u>` `<C-d>` | `<PageUp>` `<PageDown>` | |
| `editor.scrollPage{Up,Down}` | `<C-b>` `<C-f>` | — | `<C-f>` is **scroll**, not find (search is `/`) |
| `editor.undo` | `u` | `<C-z>` | |
| `editor.redo` | `<C-r>` | `<S-C-z>` | `<C-r>` on challenge screens = reset (mode wins); redo via `<S-C-z>`/palette |
| `editor.deleteChar` | `x` | `<Del>` | `X` = backspace-delete |
| `editor.deleteLine` | `dd` | palette | |
| `editor.change` | `c{motion}` `cc` | — | |
| `editor.yank` | `y{motion}` `yy` | — | Feeds registers + OSC52 per setting |
| `editor.put` | `p` `P` | palette | Register ring |
| `editor.join` | `J` | palette | |
| `editor.indent` / `editor.outdent` | `>` `<` | `<Tab>`/`<S-Tab>` on selection | |
| `editor.commentToggle` | `gc{motion}` `gcc` | palette | Per-language line/block |
| `editor.visual{Char,Line,Block}` | `v` `V` `<C-v>` | — | Block implies multi-cursor column |
| `editor.insertBefore` / `insertAfter` | `i` `a` | — | |
| `editor.insertLineStart` / `insertLineEnd` | `I` `A` | palette | |
| `editor.open{Below,Above}` | `o` `O` | palette | Smart indent on enter |
| `editor.substituteChar` / `editor.replaceMode` | `s` `R` | — | |
| `editor.search` | `/` `?` | `<C-f>`→palette alias | Incremental, smart-case, regex toggle |
| `editor.search{Next,Prev}` | `n` `N` | palette | |
| `editor.replaceRange` | ex `:s` `:%s` | palette | Confirm-each or all; one undo step |
| `editor.gotoLine` | ex `:123` | palette | |
| `editor.gotoMatchingBracket` | `%` | palette | |
| `editor.multiCursorAdd{Above,Below}` | `<C-A-up>` `<C-A-down>` | same | |
| `editor.multiCursorNextMatch` | `<C-d>` | same | Selection → next match |
| `editor.multiCursorClear` | `<Esc>` | same | |
| `editor.completionTrigger` | `<C-space>` | same | Also signature help after `(` |
| `editor.completion{Next,Prev}` | `<C-n>` `<C-p>` (popup open) | same | |
| `editor.completionAccept` | `<Tab>`/`<CR>` | same | |
| `editor.completionDismiss` | `<Esc>` | same | |
| `editor.tab{Next,Prev}` | `<C-w>` `<C-q>` | same | Multi-file tabs (unchanged) |
| `editor.clipboardCopy` / `clipboardPaste` | yank/`p` + OSC52 | palette | Real pastes via bracketed paste |
| `editor.selectAll` / `editor.cut` | `ggVG`/`d` | palette | Modeless affordances |

## B.6 Browser (13)

| Command | Keys | Notes |
|---|---|---|
| `browser.open` / `browser.close` | `<C-b>` · `<Esc>`/`<C-b>` | |
| `browser.tab{Next,Prev}` | `<Tab>` · `<S-Tab>` | Render/Elements/Styles/Console/Network |
| `browser.jumpTab1..5` | `1`–`5` | |
| `browser.consoleRun` | `<CR>` | |
| `browser.consoleHistory{Up,Down}` | `<up>` `<down>` | Console input only |
| `browser.consoleClearInput` / `consoleClear` | `<C-u>` · `<C-l>` | |

## B.7 Settings, help, palette, tour (12)

| Command | Keys | Notes |
|---|---|---|
| `settings.open` | `s` (home) | |
| `settings.themeNext` / `themePick` | palette / in-screen list | Live preview |
| `settings.vimToggle` | palette + tour | `editor.vimMode` |
| `settings.mouseToggle` / `iconsCycle` / `resetUI` | palette | |
| `help.close` | `<Esc>` `q` | |
| `palette.execute` / `palette.dismiss` | `<CR>` · `<Esc>` | Palette input owns chars |
| `tour.next` / `tour.skip` | `<CR>` · `<Esc>` | |

## B.8 Conflict register (linted by `tools/check.js`)

| Binding | Owner | Loser (relocated) |
|---|---|---|
| `<C-p>` | preview (challenge screens) | palette moved to `<C-k>` globally |
| `<C-r>` | reset (challenge) | redo via `<S-C-z>` + palette |
| `<C-h>` | hint (challenge) | insert-mode backspace is `<BS>` only |
| `<C-f>` | scroll page down (vim std) | search stays `/` + palette |
| `<C-c>` | quit (global) | vim `Ctrl-C`-as-`<Esc>` **not** emulated (beginner safety) |
| `<C-v>` | visual block | terminal paste via bracketed paste / `<S-Ins>` |
| `hjkl` | vim motions | list nav (`nav.*`) disabled while editor focused |

Rules encoded in the registry: (1) a binding may resolve differently per mode/screen but each `(binding, mode, when)` triple must be unique; (2) overlays > vim > screen-local > global; (3) `q` never quits from typing surfaces.

---

# Appendix C — Visual Wireframes (unicode tier; Tier A swaps in Nerd Font glyphs)

## C.1 Home / dashboard (80 cols)

```
╭──────────────────────────────────────────────────────────────────────────────╮
│ ◈ fullstack-tui            12 modules · 48 lessons · 214 challenges   ▓▓▓░ 42%│
│ › Dashboard   Projects   Progress   Resources   Workspace                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  RESUME ► 02-javascript · functions · arrow-functions                        │
│                                                                              │
│  MODULES                                                                     │
│  ▸ 01 · HTML & the Web             14 challenges  ████████░░░░  57%          │
│    02 · JavaScript Language        22 challenges  ███░░░░░░░░   9%          │
│    03 · CSS Layout                 18 challenges  ░░░░░░░░░░░░   0%          │
│    04 · Data & SQL                 16 challenges  ░░░░░░░░░░░░   0%          │
│                                                                              │
│  ACTIVITY  ▂▁▂▄▃▅▂▁▂▄▆▃▂▁▂▃▄▅▆▇   today 45m · streak ⚂ 3                     │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯
 NORMAL ▸ j/k move · <CR> open · <C-k> palette · s settings · ? help · q quit
```

## C.2 Challenge split (100 cols) — brief + checks left, editor + completion right

```
╭ 01-html › forms › form-boss ─────────────────────────── solved 3/14 · 21% ───╮
│ › Dashboard  Projects  Progress  Resources  Workspace                        │
├───────────────────────────────────┬──────────────────────────────────────────┤
│ BRIEF                     ✎ edit  │ index.html ▸ style.css         NORMAL    │
│ Build a contact form with:        │  1 <!DOCTYPE html>                       │
│  • a <form> posting to #          │  2 <html>                                │
│  • labels for every input         │  3   <form id="signup">                  │
│                                   │  4     <label for="name">Name</label>    │
│ CHECKS  <C-s>                     │  5     <input id="name" requ▊>          │
│  ✔ form has method="post"         │                                          │
│  ✘ input#email is required        │╭────────────────────────────────────────╮│
│      ↳ jump: <CR> · line 14       ││ tag  <form id="signup">  Tab·accept    ││
│        found: <input type=email>  ││ tag  <label for="…">                   ││
│                                   ││ attr for="…"   bind to input id        ││
│                                   │╰────────────────────────────────────────╯│
├───────────────────────────────────┴──────────────────────────────────────────┤
│ ^S check  ^H hint  ^G solution  ^P preview  ^B browser  ^W tab  :w = check    │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## C.3 Embedded browser (100 cols) — five tabs incl. Network, live re-render

```
╭ BROWSER ─ form-boss ─────────────────────────────────────────────────────────╮
│ › Render   Elements   Styles   Console   Network                             │
├──────────────────────────────────────────────────────────────────────────────┤
│ ┌ live ────────────────────────────────────────── re-renders as you type ──┐ │
│ │  Contact us                                                             │ │
│ │  [ Name ________ ]  [ Email ________ ]  [ Send ]                        │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│ ⚠ <label> "Email" does not point at an input (line 14) · click to jump       │
│                                                                              │
│ NETWORK (mocked)                                                             │
│  200  GET   /api/teams      12ms   ▂▂▂▂                                      │
│  400  POST  /api/save        8ms   ▂▂            ← payload on <CR>           │
╰──────────────────────────────────────────────────────────────────────────────╯
 Tab pane · 1-5 jump · click inspect · <C-B> editor · <Esc> back
```

## C.4 Command palette (overlay, 56 cols)

```
            ╭ ⌘ Command palette ────────────────────────────╮
            │ che▊                                          │
            ├───────────────────────────────────────────────┤
            │ ▸ ✔  Check my code                    ^S      │
            │   ⧉  Toggle solution diff             ^G ^G   │
            │   ↺  Reset challenge                  ^R      │
            │   ⤓  Save to workspace                ^O      │
            │ ─ Go to ─────────────────────────────────────  │
            │   › lesson: forms · module: 01-html            │
            └───────────────────────────────────────────────┘
```

## C.5 Welcome tour step (80 cols)

```
╭ Welcome · step 2 of 5 ───────────────────────────────────────────────────────╮
│                                                                              │
│   Your editor speaks vim.                                                    │
│                                                                              │
│   NORMAL mode — move, delete, yank. You are here now.                        │
│   INSERT mode — type text. Press  i  to enter it.                            │
│   Back to NORMAL: press  Esc.                                                │
│                                                                              │
│   Try it: press  i , type  hello , then  Esc.                                │
│                                                                              │
│   Prefer simple keys?  [S] Switch to modeless editing                        │
│                                                     <CR> continue · Esc skip │
╰──────────────────────────────────────────────────────────────────────────────╯
```

## C.6 Degrade Tier D (`TERM=dumb`, no color, ASCII)

```
+----------------------------------------------------------------------------+
| fullstack-tui   12 modules / 48 lessons / 214 challenges        42%        |
| Dashboard  Projects  Progress  Resources  Workspace                        |
+----------------------------------------------------------------------------+
| RESUME > 02-javascript / functions / arrow-functions                       |
| MODULES                                                                    |
|   [>] 01 HTML & the Web         14 challenges   [#######.....] 57%         |
|   [ ] 02 JavaScript Language    22 challenges   [#..........]  9%          |
| (degraded mode: no colors, no icons, plain keys only)                      |
+----------------------------------------------------------------------------+
| j/k move  enter open  ctrl+k palette  s settings  ? help  q quit           |
+----------------------------------------------------------------------------+
```

---

# Appendix D — Phase 0 & Phase 1 Implementation Plan

Sizes: **S** ≤ half day, **M** ≤ 2 days, **L** ≤ 1 week (focused solo work). Every task ends with its Definition of Done (DoD). Old UI stays the default entry throughout (§14 cut-over mechanics).

## Phase 0 — Foundations (invisible to users)

| # | Task | Files (new/changed) | Size | DoD | Status (2026-09-14) |
|---|---|---|---|---|---|
| 0.1 | Tooling baseline: engines ≥ 20.9, esbuild pipeline, scripts | `package.json`, `esbuild.config.mjs`, `bin/fullstack.js` (→ `dist/main.js` with "run npm run build" fallback), `.gitignore` (+`dist`) | S | `npm run build && node bin/fullstack.js` runs a hello-frame under `FULLSTACK_UI=next` | ✅ done |
| 0.2 | Ink spike: verify npm-stable ink@6 peer deps (react 18/19), alt-screen shim, `usePaste`/`useBoxMetrics`/`contentOffset`/`useCursor` availability, fake-stdout render | `docs/ink-spike.md`, `spike/` (temp) | S | Findings recorded; Appendix A.2/A.4 confirmed or fallback ladder chosen | ✅ done — `docs/ink-spike.md`, ink@6.8.0 pinned, fallback ladder not needed |
| 0.3 | Input pipeline (pure): chunker+keymap port, escape-split coalescer, SGR mouse parser, bracketed paste, keybind notation parser | `src/ui/input/{parseChunk,escapeCoalesce,mouse,paste,keys,index}.js` | M | Unit tests incl. split-across-chunks, SGR press/drag/wheel, paste grouping | ✅ done — `src/ui/input/index.js` + 13 tests |
| 0.4 | Capability probe | `src/ui/capabilities.js` | S | Env-matrix tests (truecolor/256/16/dumb/NO_COLOR/WT_SESSION…); tier resolution table | ✅ done — tier matrix pinned by `tests/unit/capabilities.test.js` (9 cases); the M1 *graphics* probe is Phase 1 (`m1-probe`, docs/multimedia.md) |
| 0.5 | Theme engine: token types, tier mapping (hex→256→16), midnight+paper ports, icons (nerd/unicode/ascii sets) | `src/ui/theme/{types,tiers,icons}.js`, `src/ui/theme/themes/*.js`, `ThemeProvider.jsx` | M | Both themes render identical hues to today at 256 tier; tier tests | ◐ partial — themes + hex→256 down-mapping shipped and tested; icon sets land with Phase 1 screens |
| 0.6 | Settings store | `src/ui/settings.js` | S | Load/merge/defaults for `.data/settings.json`; corrupted-file recovery; tests | ✅ done — unknown-key preservation + corruption recovery tested |
| 0.7 | Command registry + keymap loader + conflict lint API | `src/ui/commands.js`, `src/ui/keymap.js`, `defaults/` (Appendix B data) | M | All Appendix B ids registered; keymap.json merge; lint finds seeded conflicts | ✅ done — 46 ids, conflict lint, `keymap.js` loader (`.data/keymap.json` merge, diagnostics-not-thrown, 8 tests); `defaults/` folded into `commands.js` data |
| 0.8 | Dispatcher + `useKeymap` | `src/ui/dispatcher.jsx` | M | Priority-table unit tests (overlays > vim > screen > global); Ctrl+C always quits | ✅ done — `InputDispatcher` pty-verified; `useKeymap` hook + route registry wired into main.jsx (dispatcher stays sole stdin owner); overlay priority arrives with overlays in Phase 1 |
| 0.9 | App skeleton: providers, router, alt-screen wrapper, resize, noTTY static entry | `src/main.jsx`, `src/ui/{AppRoot,altScreen,staticRender}.jsx`, `src/ui/router.jsx` | M | `FULLSTACK_UI=next` shows a chrome frame on tiers A–D; piped stdout renders once and exits | ✅ done — `AppRoot` (ThemeProvider → RouterProvider → ScreenFrame/RouterView) mounted in main.jsx; pty-verified with clean ^C; noTTY static path unchanged |
| 0.10 | Test scaffolding: fake stdout/stdin driver, snapshot util, replay runner; check-tool hooks | `tests/helpers/{driver,snapshot}.js`, `tests/unit/*`, `tools/check.js` (+keymap lint, tier smoke) | M | Snapshot of hello-frame stable across runs; replay drives a scripted key sequence | ✅ done — fake streams + golden snapshots (+poison guard), QoL replays (classic UI), and `tests/helpers/driver.js` (scripted bytes → real InputDispatcher, fake streams; caught the parallel-parse phantom-key bug) |
| 0.11 | Docs stubs | `README.md` (v2 banner), `CONTRIBUTING.md` skeleton | S | Build/test instructions accurate | ✅ done — `README.md` + `CONTRIBUTING.md` written (layer map, command/screen/theme how-tos, testing guide) |

**Phase 0 exit:** old app byte-identical in behavior; next-UI hello-frame green on all tiers; `npm run build && npm test && npm run check` green.

> **Progress note (2026-09-14, update 2):** Phase 0 is complete — router + AppRoot mounted, keymap loader live (user overrides from `.data/keymap.json`), `useKeymap` wired to the dispatcher. Phase 1 opened with the first real screen port: `screens/challenge.jsx` (SplitPane layout, registry-resolved commands via useKeymap, DECSCUSR vim cursor). Multimedia M0 is live in the *classic* app too: check-complete desktop notification + BEL (settings.sound gate, Space-to-toggle in settings view) and OSC 8 hyperlinks on module source rows via `Screen.linkify`. M1 probe (`graphicsProbe.js`) and screenshot engine (`screenshot.js`, lazy Playwright) shipped with tests. Replay driver (`tests/helpers/driver.js`) drives the real InputDispatcher with scripted bytes — it caught and fixed a real bug (mouse bytes leaking into the key parser as phantom keys; parser chain is now sequential). 95/95 unit tests.
>
> **Testing note:** a node:test registration race was found and documented — test files whose registrations follow a top-level `await` can silently drop tests (each passed individually via `--test-name-pattern`, yet vanished from full runs). The fix pattern: declare subtests with `await t.test(...)` inside one awaited parent. Applied to `challengeScreen.test.js`.

## Phase 1 — Shell & navigation (next-UI covers all non-editor screens)

| # | Task | Files (new) | Size | DoD |
|---|---|---|---|---|
| 1.1 | Core components: `Panel`, `Header`, `Footer` (registry-derived hints), `TabBar`, `List`, `ScrollPane`, `Modal`, `Toast`, `Badge`, `Meter`, `Sparkline`, `StatChips` | `src/ui/components/*.jsx` + co-located tests | L | Each component unit/snapshot-tested at 40/80/120/200 cols |
| 1.2 | `ResizableSplit` (mouse drag, nudge keys, per-screen persistence) | `src/ui/components/ResizableSplit.jsx`, settings `panes.*` | M | Drag + keyboard nudge + persistence + reset-to-default command | ✅ done — `useResizableSplit` owns a screen's ratio: seeded from `panes.<screen>.<key>`, dragged on the divider column (1-based SGR x), nudged by `view.paneWider`/`paneNarrower` (`<C-left>`/`<C-right>` plus the spec's `<C-S-*>`), reset by the palette's `view.paneReset`. Ratios (not columns) persist, so a remembered layout survives a resize; `splitClamp.js` gained `clampRatio`/`nudgeRatio`/`ratioToColumns`/`columnsToRatio`. Two parser fixes were needed to make the keys real: CSI `1;<mod>` arrows were falling through to the Alt branch, and every `p.shift` binding was skipped in resolution (so `<S-Tab>` was dead too). Drag state is read through a ref — a press+motion burst arrives in one stdin read and would otherwise drop the first motion |
| 1.3 | Router integration: screen registry, breadcrumbs, stack semantics preserved | `src/ui/screens/index.js`, `src/ui/router.jsx` | S | Push/pop/Esc-at-home behavior matches old app (replay golden) |
| 1.4 | Screens: `home`, `module`, `lesson`, `projects`, `stats`, `help`, `resources`, `workspace`, `settings` | `src/ui/screens/*.jsx` | L | Snapshot parity vs old views' content (same data, new chrome); replay goldens for nav flows | ✅ done — all nine ported. Help shares `src/core/help.js` with the classic view; Settings shares `src/ui/preferences.js` (rows AND Space toggles) with the classic view and `App.toggleSetting`, plus the next-UI-only vim row. Module→lesson→challenge follows the classic flow. Porting surfaced two real store bugs along the way: `projectProgress` counted by check text while ticks are keyed `${projectId}.${index}` (every capstone meter read 0/N), and the palette/route handlers read render-time state (dropped keystrokes). Both fixed and regression-tested. The classic 'How to Navigate' block was deliberately NOT duplicated onto the Ink screen: the key list lives once in `core/help.js` and the screen points at it |
| 1.5 | Command palette (fuzzy over registry + "Go to" sources, recent list) on `<C-k>` | `src/ui/screens/palette.jsx` | M | Fuzzy perf test (<2 ms/200 items); `<C-p>` no longer opens palette outside challenge | ✅ done — 49 commands + "Go to" (screens/modules/lessons), recents-first, dispatched by command id via `dispatchToScreen`; hosted by `CommandHost` as an overlay so the screen underneath keeps its cursor and handler; `app.palette` rebound to `<C-k>` (classic accepts it too, so shared help text stays true); `paletteKey`/`paletteMatches`/`buildPaletteItems` unit-tested + a Ctrl+K→type→Enter navigation test. Perf budget not yet asserted (task 2.11) |
| 1.6 | Welcome tour (5 steps, sandbox, vim-on/modeless choice) gated by `onboardedAt` | `src/ui/screens/tour.jsx` | M | Replay golden: full tour, skip path, modeless switch persists | ✅ done — pure `tourSteps({ tier })` + `tourReducer` (unit-tested: the walk, the finish-on-last-step, skip-from-anywhere, tiers C/D dropping the mouse step). `main.jsx` opens the app ON the tour when `onboardedAt` is null; `TourRoute` stamps `onboardedAt` on both exits (Enter-to-finish and Esc-to-skip — Esc is the global `app.back`, handled by the route instead of a duplicate binding) and resets the stack to the dashboard. `v` writes `editor.vimMode` through the same `togglePreference` the settings screen uses, so the displayed choice and the persisted one cannot diverge. Replay via the palette's `app.tour`. Deviation: the sandbox step presents the scratch buffer and its checklist and advances on `<CR>` — the interactive typing it describes needs the Phase 2 editor |
| 1.7 | Challenge placeholder in next-UI ("editor lands next phase") so no dead route | `src/ui/screens/challenge.jsx` (stub) | S | Route resolves without crash | ✅ superseded — the challenge route is real: brief + record-backed buffer, working Ctrl+S grader with Q7 results (counts/duration/micro-notes), hints recorded, solution toggle, suggest-only format (Q10), record-backed reset, driver-tested (`tests/unit/routes.test.js`) |
| 1.8 | Keymap docs generator + check-tool screen×tier snapshot smoke | `tools/gen-keymap-docs.js`, `tools/check.js` | S | Keymap reference auto-generated matches registry; all screens render on tiers A–D | ◐ partial — `tools/gen-keymap-docs.js` renders `docs/keymap.md` from the registry and check §7 fails the run on drift (`npm run keymap:docs`). The screen × tier snapshot smoke still rides with the §13.2 snapshot suite |
| 1.9 | Docs refresh for nav layer | `README.md`, `CONTRIBUTING.md` | S | Screenshots + keymap table current |

> **Progress note (2026-09-16):** the next UI is *interactive* now. `src/ui/host.jsx` (`CommandHost`) owns the per-screen list cursor, navigation and the global command table; `src/ui/routes.jsx` gives home/module/challenge real behavior (j/k/g/G, Enter opens, Esc pops, Ctrl+S runs the real grader, Ctrl+H/Ctrl+G hint + solution), and main.jsx's dispatcher global pass now reaches the same table instead of returning `false`.
>
> **Progress note (2026-09-17, update 5):** **The whole editor ENGINE is in place — 2.1 through 2.6 — and the remaining work in Phase 2 is the UI binding (2.7–2.10) plus the perf job.** `src/editor/` is now document + history + selection/registers/OSC52 + `vim/` (motions, operators, ex) + `vim.js` (the state machine) + `search.js` + `multicursor.js`, none of it importing React or Ink, all of it covered by 607 unit assertions. The vim machine is a pure reducer whose result carries the next document, the next registers, a history hint and a `request`/`command` channel — so undo, scrolling, OSC52 copies and `:w`/`:q` are all the CALLER's job and the machine stays testable. Two acceptance artifacts exist rather than prose: a 137-row key-sequence table and `VIM_BINDINGS`, which now generates `docs/vim.md` AND lints every binding through `reduceKey` in `npm test` (a bogus entry was confirmed to fail the run). Writing the table from vim's documented behaviour — rather than from what the code did — is what surfaced the real defects this round: `selRange` needs `{anchor, head}` (every `deleteChanges({start, end})` call was a latent throw), `B`/`E` never passed the `big` flag so `W`/`B`/`E` silently behaved like `w`/`b`/`e`, linewise `dd` left a phantom trailing empty line (linewise paste must insert whole lines, not text ending in `\n`), `V>` indented the following line, `dy` deleted a line as if it were `dd`, and spreading an ex-table entry whose `kind` was `'command'` over the parse `kind` made every `:w` unparseable. `%s///c` now re-applies its accepted set to the document the prompt started from, so a replacement of a different length cannot shift the later matches.
>
> **Progress note (2026-09-17, update 4):** **Phase 2 opened with its foundation.** The engine is being built bottom-up in the spec's order, so 2.1 (document model) and 2.2 (history) landed as pure, framework-agnostic modules with nothing wired to the UI yet — that is what 2.3 (selection/registers) and 2.4 (vim) build on, and 2.8/2.9 expose it on screen. Both files are heavily tested (23 document tests including a seeded property test against a reference string model, 12 history table tests — in `tests/unit/editorHistory.test.js`, since `history.test.js` already belongs to the classic checkpoint suite — and 10 width tests) because everything downstream inherits their contracts. Two decisions worth recording: `applyEdit` THROWS on overlapping changes rather than merging them (a silent merge would let a multi-cursor bug look like a working edit), and the width helper is documented as a box-width approximation that sums codepoints (a ZWJ emoji sequence over-counts) instead of pretending to be a grapheme segmenter.
>
> **Progress note (2026-09-17, update 3):** **Phase 1 is complete.** The settings screen (1.4), the welcome tour (1.6) and resizable panes (1.2) all landed, which closed out `UNPORTED_SCREENS` (now empty, kept so the next unported screen only has to add an entry). Two shared modules were extracted so a port can't contradict the original: `src/ui/preferences.js` (settings rows + Space toggles, used by the classic view, `App.toggleSetting` and the Ink screen) and the existing `core/help.js`. `screenTargets.js` gained a `tab` flag + `TAB_TARGETS`, because the tab cycle had been walking Help as if it were a tab while Appendix B.2 specifies five. The parser learned the CSI `1;<mod>` modified arrows and shift now participates in key resolution (previously every `p.shift` binding was skipped, leaving `<S-Tab>` unreachable).
>
> **Progress note (2026-09-17, update 2):** the lesson and projects screens landed too (task 1.4), and the input pipeline now emits Alt-modified keys — `ESC`+char parses as `alt-<char>` (CSI/SS3 and a lone `Esc` behave as before), which makes the Appendix B.2 tab bindings real: `nav.jumpTab1..5` on `Alt+1..5` and `nav.tabNext`/`tabPrev` on `Alt+h`/`Alt+l`, wired in the host and covered by an end-to-end Alt+3 test. The only deliberate behavior change is the standard terminal tradeoff: `Esc` followed by a letter inside the ~50 ms coalescing window is Alt+letter.
>
> **Progress note (2026-09-17):** Phase 1 gained the command palette (task 1.5) and four read-only screens (help, resources, workspace, progress) — see the status column above. Two defects surfaced while wiring the palette: its keys had to be driven from a ref rather than render state (two keys in one tick both read the pre-key value, so a pasted/fast keystroke vanished), and running a pick needed `dispatchToScreen` because screen-scoped ids (`challenge.check`) are owned by the focused screen, not the host's global table. `docs/features.md` and the README status were synced.
>
> Three wiring defects surfaced and were fixed on the way: `mergeKeymap` honoured only a command's FIRST default binding, so `j`/`k`/`q` were dead in the Ink app (resolution now walks every binding of `keys.default`); `useKeymap` registered a handler that closed over render-time state, so `j` then Enter in the same tick acted on the pre-`j` cursor (the route handler now reads the latest callback through a ref); and `AppRoot` read `size.width`/`size.height` from a hook that returns `{ w, h }`, pinning the frame to 80×24 and ignoring every resize. Routes are covered by `tests/unit/routes.test.js` (real router + real grader). Remaining Phase 1 work at the time of that note: 1.2, 1.4 (screen ports: lesson, projects, stats, help, resources, workspace, settings), 1.5 palette screen, 1.6 tour. All of it has since landed — see the status column and the update-3 note above; the phase is done and the next milestone is task 2.x (the editor).

**Phase 1 exit:** `FULLSTACK_UI=next` navigates the whole curriculum, palette + tour work, old UI untouched as default; all suites green. Phase 2 (editor) then starts from the Appendix E plan.

---

# Appendix E — Phase 2 Implementation Plan (Editor & Challenge)

Sizes as in Appendix D (S ≤ half day, M ≤ 2 days, L ≤ 1 week). Prereqs: Phase 0's input pipeline (task 0.3), dispatcher (0.8), theme engine (0.5), and the spike-verified ink@6.8.0 surface (`useCursor` present; `usePaste`/`useBoxMetrics`/`useWindowSize` absent → first-party). Dependencies: 2.1 → 2.2 → 2.3 → 2.4; 2.5–2.7 depend on 2.1; 2.8 needs 2.1–2.3; 2.9 integrates everything; 2.7/2.8 can run in parallel.

| # | Task | Files (new) | Size | DoD |
|---|---|---|---|---|
| 2.1 | Document model: line-array + single `applyEdit(changes)` chokepoint (replaces classic `setTextAt` whole-doc writes), `{changes, caret}` transactions, per-file tab state (cursor/scroll/undo preserved on tab switch) | `src/editor/document.js`, `tests/unit/document.js` | M | Every mutation flows through `applyEdit`; randomized op-sequence property tests never corrupt text; multi-file model matches classic behavior (emptyEditors port) | ✅ done — `document.js` wraps the same line array in a value with ONE mutation point (`applyEdit`, single pass, last-to-first, clamps, rejects overlapping changes instead of silently merging them) plus insert/delete/replace/setText wrappers that all funnel through it. The caret is mapped through a transaction by offset (an edit after it never moves it; typing at it lands after the typed text; an offset inside a replaced range collapses to the end of the replacement), and `createSession` holds one document + one history + view state per file, so a tab switch restores caret, scroll and undo stack. `width.js` adds the zero-dep wcwidth-style helper (CJK/emoji = 2, combining/ZWJ/VS = 0, tab stops, click-to-caret inverse, horizontal slice) — documented as a box-width approximation, not a grapheme segmenter. 23 tests incl. a seeded 300-step property test against a one-string reference model, plus 10 in `tests/unit/width.test.js`. Test path is `tests/unit/document.test.js` (the table's `tests/unit/document.js` drops the `.test`). The Ink binding lands with 2.8/2.9 |
| 2.2 | History: undo/redo with coalescing (typing bursts, auto-pair, indent-on-enter = one step; group on completion accept, paste, replace-all); redo cleared on new edit; 1000-step cap | `src/editor/history.js`, tests | M | Table tests incl. coalescing windows; undo never crosses files; matches §8.2 keybinds (redo ≠ Ctrl+R, per B.8) | ✅ done (engine) — entries hold `{before, after}` document snapshots, so undo restores text exactly and never has to replay a diff. Coalescing merges a run of the same kind (`typing`/`pair`/`indent`) inside the window (400 ms, injectable `at` so the table tests are deterministic) while `coalesce: false` (paste, completion accept, replace-all) is always its own step; a no-op edit records nothing; any new edit clears the redo branch; `limit` caps the stack (1000 default). Per-file stacks live in the session, so undo cannot cross a file. 12 table tests. The §8.2 keybinds (`u`/`<C-z>`, redo ≠ `<C-r>`) are wired in 2.4/2.10 |
| 2.3 | Selection & registers: anchor/head ranges, shift-motions, mouse-selection events, register ring (`"`, `0`, `a–z`), yank/put, OSC52 encoder + capability heuristic | `src/editor/selection.js`, `src/editor/registers.js`, `src/editor/osc52.js`, tests | M | visual/visual-line/visual-block state tests; OSC52 bytes verified against spec examples; paste replaces selection | ✅ done — `selection.js` is anchor/head ranges (`selRange`, `selMerge`, word/line/block selection, and every operation as a CHANGE LIST so a caller batches them into one undo step); `registers.js` is the ring (`"`/`0`/`a–z`/`_`/`+`, linewise vs charwise vs blockwise, `"A` appending); `osc52.js` encodes the escape with a tmux/screen wrapper and a capability heuristic. 48 tests in `tests/unit/selection.test.js`, including OSC52 bytes against the spec's examples and paste-replaces-selection. Mouse selection events and shift-motions land with the component in 2.8 |
| 2.4 | Vim state machine: normal/insert/visual(3)/replace/pending-operator; motions `h j k l w W b B e E 0 ^ $ gg G { } f/F t/T ; , %` with counts; operators `d c y > < gu gU` + `p/P`; `i a I A o O s`, `R`; `.` repeat; `` `` `` mark; ex-lite (`:w :q :q! :wq :reset :hint :solution :browser :%s`) routed as registry commands | `src/editor/vim.js`, `src/editor/vim/{motions,operators,ex}.js`, tests | L | ≥150 table-driven key-seq→state/text cases; **Ctrl+C never consumed**; mode-indicator events drive footer; modeless fallback path identical to classic keymap | ✅ done — `reduceKey(state, key, ctx)` is a PURE reducer returning `{state, doc, registers, changed, kind, coalesce, status, request, command, consumed}`; the Ink component (2.8) and the tests drive the same function, and a screen only has to apply `doc` and run `command`. 137-row acceptance table in `tests/unit/vim.test.js` (237 assertions) written from vim's documented behaviour, plus a per-binding resolution test and a check-tool lint over the same table. `ex.js` parses `:` to REGISTRY COMMAND IDS (never editor functions), so `:w` checks the challenge because `challenge.check` does; `:%s///c` runs its confirm-each loop on `y/n/a/q` in the editor itself, re-applying from the base document so a longer replacement cannot shift the later matches. Ctrl+C/Ctrl+K return `consumed: false` in every mode (asserted mid-operator, mid-insert and mid-`:`). Deviations recorded in `docs/vim.md`: the caret is a boundary, so a bare `v`+`d` deletes nothing and a one-column block is `<C-v>jd`; a search starts strictly after the caret so `n` advances; a motion-less key after an operator (`dy`) CANCELS rather than doubling (it used to delete a line) |
| 2.5 | Search & replace: incremental `/` `?`, `n`/`N`, smart-case + regex toggles, highlight-all-in-viewport, `:s`/`:%s` confirm-each/all (one undo step), jump-to-line, `%` bracket match, jump-to-failed-check via the §5.4 diagnostic-range seam | `src/editor/search.js`, tests | M | Incremental state tests; replace-all single-undo verified; failed-check jump lands on grader range when present | ✅ done (engine) — `search.js` owns the matcher so "what is highlighted" and "what `n`/replace act on" come from ONE match list; `compile` reports an invalid regex instead of throwing, `toggleCase`/`toggleRegex`/`pushHistory` cover the prompt, `viewportMatches` limits painting to the visible rows, and `stepMatch` wraps with a strict "skip the caret" rule so `n` advances. `substitutePlan` moved here from `vim.js` (which imports it) so `:s`, `%s///c` and the palette's replace-all cannot produce different change lists. `jumpToFailedCheck` uses the §5.4 seam (`evaluate()` copies a check's `line` onto its result) and returns null when a failure carries no range instead of jumping to 1:1. `/` and `?` themselves are owned by the vim machine (`state.input`); the Ctrl+F prompt for modeless mode rides on 2.9 |
| 2.6 | Multi-cursor: add above/below, next-match-of-selection, visual-block column insert, per-cursor ops (type/backspace/pair/indent/completion), 50-cursor cap with notice | `src/editor/multicursor.js`, tests | M | Cursor-collision collapse tests; one undo step per batch; all Appendix B.5 `<C-A-*>`/`<C-d>` binds live | ✅ done (engine) — a cursor set is `{cursors, primary}` plain data (the primary is an INDEX, not a copy of a position, so the first cursor's edit cannot leave a stale second one). Every op returns ONE change list for `applyEdit`, which is what makes a batch a single undo step — the test records the before/after pair and undoes it in one go. `cursorSetForEdit` collapses duplicates first, because two identical inserts would be a genuine overlap (`applyEdit` throws on those). The 50-cursor cap reports a notice instead of silently dropping, and `cursorsForBlock` turns a visual block into per-row cursors. `<C-A-↑/↓>` and `<C-d>` reach it from 2.8/2.9 (the bindings are in the registry; the screen wiring is not) |
| 2.7 | Completions v2: port `complete.js` trigger engine; superset data (HTML tag→attr sets + entities, CSS props/values/at-rules/pseudos, JS DOM + builtins, JSX tags); snippets with tab stops via `applyEdit`; signature help after `(`; popup with mouse + doc line | `src/editor/completions.js`, `src/editor/data/{html,css,js,jsx}.js`, `src/ui/components/CompletionPopup.jsx`, tests | L | Trigger-table tests (Ctrl+Space, ≥2-char auto, `<`/`:`/`@` starters — classic parity); snippet caret placement tests; popup snapshot |
| 2.8 | `CodeEditor` component: virtualized viewport (visible ±20 lines), memoized per-line highlight (port tokenizer from `widgets.js` → `src/editor/highlight.js`, LRU keyed by line+lang+theme), gutter + line numbers (+relative option), tab strip (Ctrl+Q/W), caret via `useCursor`/explicit `moveTo`, mouse click-caret/drag-select/wheel/tab-click | `src/ui/components/CodeEditor.jsx`, `src/editor/highlight.js`, tests | L | **p95 keystroke-to-paint < 16 ms on a 500-line buffer** (§12 stdout-write-hook method in the replay harness); snapshots at 4 sizes × tiers A–D; wide-char (CJK/emoji) columns verified via wcwidth helper |
| 2.9 | Challenge screen port: `ResizableSplit` brief/checks + editor, pane defaults (`w ≥ 104` rule), full command wiring (check/reset/hint/solution/copy/preview/browser/logs/external-editor with terminal release), **DiffView upgraded to line-level LCS** (replaces positional `diffCode`), per-file save/reset multi-file model, console-log overlay (Ctrl+T) | `src/ui/screens/challenge.jsx`, `src/ui/components/DiffView.jsx`, tests + replay goldens | L | Replay goldens: solve-from-scratch (type→check→pass→save), vim-edit-undo-redo, multi-file tab flow, Ctrl+P preview, Ctrl+E external-editor round-trip; classic behavior contract (§6) asserted step-by-step |
| 2.10 | Footer & mode UX: registry-derived hints for challenge/editor commands, vim mode block (`-- INSERT --` styling), live `editor.vimMode` toggle in settings, one-time footer nudge when typing in normal mode > 2 s | `src/ui/components/Footer.jsx`, `src/ui/screens/challenge.jsx`, tests | M | Hints match registry (lint-enforced); nudge fires once per session; toggle switches modes without restart |
| 2.11 | Check-tool integration: perf replay job (N keystrokes → p50/p95 vs §12 thresholds), keymap lint extended to vim bindings (B.8 conflict register), challenge screen × tier snapshot smoke | `tools/check.js` | S | Check green; a synthetic budget breach triggers warn/fail paths; every B.5 binding resolves or is reported | ◐ partial — the vim half is done: check §7 drives every entry of `VIM_BINDINGS` through the real `reduceKey` and fails the run if one stops resolving, and the same table generates `docs/vim.md` (regenerated + drift-checked alongside `docs/keymap.md`, both gated by `npm test`). Verified to bite: a bogus binding produced `FAIL vim binding f19 (normal) does not resolve` and a stale-doc FAIL. Still open: the perf replay job (needs 2.8) and the screen × tier snapshot smoke |
| 2.12 | Delete pass + docs: remove `src/views/editor.js` model, old challenge rendering, and `widgets.js` codeBlock/tokenizer once unreferenced (classic challenge screen still default until Phase 4 flip); README vim cheatsheet + regenerated keymap table | `src/views/*`, `README.md`, `CONTRIBUTING.md` | S | No dead exports; `npm run build && npm test && npm run check` green; docs match implemented keys |

**Phase 2 exit:** all §8 editor features functional behind `FULLSTACK_UI=next`; perf budget enforced by check; every Appendix B.5 binding live; old classic app still the default entry with its own challenge flow untouched; all suites green. Phase 3 (browser & tools) plan follows the same shape at Phase 2 exit.
