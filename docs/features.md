# fullstack-tui — Feature Inventory

The canonical list of what the app does. Ground truth as of 2026-09-29, the
post-flip world: the Ink UI is the only UI. Dated progress notes live in
`docs/changelog.md`; what's next is tracked in `loose-ends-spec.md`. This
document feeds the README and the command registry (`src/ui/commands.js`).

## 1. What it is

An interactive **terminal curriculum** for fullstack web development: lessons
read in the terminal, hands-on code challenges written in a built-in editor,
graded by real engines (a sandboxed JavaScript runtime, structural HTML/CSS
analyzers, live SQLite/Git/Python sandboxes), with progress, streaks, and
artifacts persisted to disk. Zero runtime dependencies beyond `ink`/`react`,
Node ≥ 20.9, ESM.

**Entry points**

| Invocation | Behavior |
|---|---|
| `npm start` / `fullstack` | Launch the TUI (requires TTY; `npm run build` first) |
| `fullstack --list` | Print the full curriculum (modules → lessons → challenges) as plain text |
| `fullstack --verify` | Run every reference solution through its own checks; also asserts debug challenges *fail* on their buggy starter |
| `fullstack --reset [--all]` | Delete progress (and optionally `.workspace/`) |
| `fullstack --help` | Flag + environment reference |
| `FULLSTACK_THEME=…` | Force a palette (`midnight`/`paper`/`ember`/`dusk`/`sand`; auto via the capabilities probe otherwise) |
| `FULLSTACK_ICONS=nerd\|unicode\|ascii` | Force a glyph set (auto via the terminal heuristic otherwise) |
| `FULLSTACK_SCREENSHOT=playwright` | Opt in to the browser Render tab's screenshot action |
| `NO_ANIMATION=1` | Static frames only (also implied by `CI` and colour-degraded tiers) |
| `EDITOR` / `VISUAL` | External editor used by `Ctrl+E` |

## 2. The curriculum content

- **12 modules** (HTML, CSS, JavaScript, Git & the Shell, Node.js, Express &
  APIs, Databases & SQL, React, TypeScript, Python, Testing & Debugging,
  Deploy & DevOps), each with `badge`, `tagline`, course source + roadmap
  links, and a capstone project.
- **Lessons** with minute estimates, markdown-ish prose (inline `**bold**`,
  `` `code` ``, `*italic*`; paragraphs, headings, code blocks, tables,
  callouts), and a scroll position **persisted per lesson**.
- **Challenges** per lesson, each with `id`, `kind`, `difficulty`, `lang`,
  brief, `starter` code, ordered `hints` (Conceptual → Strategic → Code), a
  worked `solution`, and a `checks` array:
  - `write` — build from scratch.
  - `debug` — buggy starter that must be fixed (verify asserts starters fail).
- **Capstone projects** per module: description, minute estimate, and a
  **checkable task list** (toggled in the TUI, persisted).
- Checks are real code, not text matching: JS assertions executed against the
  learner's runtime values; HTML checks query a parsed tree; CSS checks
  inspect parsed rules. `mockFetch` tables keep network lessons
  offline-deterministic; `prelude` injects per-challenge helpers; React
  challenges run against a DOM shim with per-check component resets.
- **Content QA nets:** `tools/check.js` lints every external URL in the
  curriculum (a dead link fails the gate) and re-grades all 125 reference
  solutions; `tools/qa-audit.mjs` grades every check against its starter to
  catch checks that pass without the learner doing anything.

## 3. Screens

Twelve routes (`src/main.jsx`), five of them top-level tabs:

| Screen | What it shows | Key interactions |
|---|---|---|
| **Dashboard** | Module list with progress bars, resume row, streak/stat chips incl. the daily-goal chip, comeback nudge | `j/k` move, `Enter` open module, `p` projects, `s` settings, `n` dismiss nudge, `?` help |
| **Module** | Lesson list (+ capstone entry), per-lesson challenge counts and pass state | `j/k`, `Enter` open lesson/project |
| **Lesson** | Scrollable prose, challenge list with kind/difficulty/passed markers, read-state | `j/k` scroll, `Tab` focus challenges, `Enter` open (first unsolved), `m` mark read, `n` next lesson |
| **Challenge** | Split view: brief + checks ‖ editor (narrow terminals get a `Tab` pane toggle); results pane | see §5 |
| **Projects** | Capstone checklists with progress | `Tab` focus, `Space` tick |
| **Progress** | Totals, per-module progress, streaks, 21-day activity sparkline, time stats | scroll |
| **Help** | Full keyboard reference + "how grading works" notes | scroll |
| **Resources** | Curated external links (grouped) | scroll |
| **Workspace** | Everything saved to `.workspace/` | scroll |
| **Browser** | Embedded dev tools — see §6 | `Tab`/`1-5` tabs, console input |
| **Settings** | All preferences — see §7 | `j/k`, `Space` toggle, `←`/`→` step pickers |
| **Tour** | First-launch welcome tour (5 steps, replayable via `app.tour`) | `Enter` advance, `Esc` skip |

**Chrome (all screens):** header with title/subtitle, breadcrumbs, top-level
tab strip (Dashboard/Projects/Progress/Resources/Workspace — `Alt+1..5` to
jump, `Alt+h`/`Alt+l` to cycle), overall progress on the right; footer with
context hints derived from the command registry + notice line.

## 4. The editor (`src/editor/`)

Pure and framework-free — none of it imports React:

- **Document model:** line array behind a single `applyEdit(changes)`
  chokepoint; `{changes, caret}` transactions; a multi-file session holding
  one document + history + view state per file, so switching tabs restores
  caret, scroll and undo.
- **History:** undo/redo over exact snapshots, coalescing typing/pair/indent
  runs inside a 400 ms window, always-separate paste/completion/replace-all
  steps, 1000-step cap.
- **Selection, registers, OSC52:** anchor/head ranges; a register ring with
  linewise/charwise/blockwise kinds; OSC52 copy that works over SSH.
- **Vim:** a pure reducer with a 137-row acceptance table; motions, operators,
  visual mode, and `ex` commands (`:w`/`:q`/`:%s`) that map to REGISTRY
  command ids rather than editor functions.
- **Search/replace, multi-cursor** (stack and column sets), **bracket
  matching** (palette; strings/comments masked first).
- **Completions:** per-language triggers, 2-char prefix auto-open,
  `Ctrl+Space` force, snippet tab stops, signature help.
- **Emmet:** `Tab` expands markup abbreviations, `;` completes CSS
  shorthands; one precedence ladder with snippet stops and the completion
  popup (vim insert/modeless only), replay-pinned.
- **Typing aids:** auto-pairing, HTML auto-close tags, pair-backspace, smart
  indent, indent-step backspace, visible bell for keys a screen does not use.
- **Formatter** (`Ctrl+F`): Prettier-style normaliser for html/css/js/json —
  never reflows, idempotent, aborts (with a notice) rather than mangle broken
  code. Suggest-only: checks note unformatted code, they never rewrite it.
- **Soft wrap** (Settings): long lines render across several rows, `↑`/`↓`
  move by screen row with the goal column preserved. **Tab size** cycles
  2/4/8 and drives indent everywhere.
- **Highlighting** for 10+ languages with block-comment state; zero-dep
  wcwidth-style cells for CJK/emoji/combining marks; line-level LCS diff for
  the solution view.
- **The UI binding** (`CodeEditor`): virtualized viewport, gutter, tab strip,
  themed highlighting, mouse (drag-select, double-click word), a caret fast
  path that skips the React render for caret-only moves, and a one-time
  "press i to type" nudge in vim mode. Replay goldens pin the behaviour
  (`tests/unit/editorReplay.test.js`).

## 5. The challenge workflow

| Key | Action | Notes |
|---|---|---|
| `Ctrl+S` | **Check** — run every check against the buffer | Multi-file: all files graded together; attempt recorded; on pass: saved to workspace |
| `Ctrl+R` | Reset to starter | Focused file only (multi-file) |
| `Ctrl+H` | Reveal next hint | Ordered; usage recorded per challenge |
| `Ctrl+G` | Show/hide worked solution | `y` copies it into the editor; second press toggles a **diff view** |
| `Ctrl+B` | Open the embedded browser | See §6 |
| `Ctrl+P` | Preview in the real browser | Same parts-assembly as the embedded browser |
| `Ctrl+O` | Save artifact to `.workspace/` | Multi-file: whole folder |
| `Ctrl+E` | Open in `$EDITOR`/`VISUAL` | Terminal released and restored; buffer reloaded |
| `Ctrl+F` | **Format** | See §4; suggest-only |
| `Ctrl+J` | Jump to a failed check's line | When the check carries a line range |
| `Ctrl+T` | Toggle the console output panel | Captured logs |
| `Tab` | Pane toggle on narrow terminals | brief ↔ code |

**Grading pipeline:** code (optionally TS-stripped) → `node:vm` sandbox (fake
console, no fs, mocked `fetch`, DOM shim when relevant) → async code on a
**worker thread** that can be terminated (infinite-loop protection; sync
loops hit the vm timeout) → per-check pass/fail with readable errors.
Progress records: `attempts`, `lastCode`, `bestCode`, `passed`, `solvedAt`,
`hintsUsed`, `solutionSeen`.

**Checkpoints (Q9):** before every check run the pre-check buffers are
written to a per-challenge sidecar — every tab byte-exact. Retention: the 10
most recent runs plus the **first passing state of each day** (★, never
evicted; snapshots older than 30 days drop). Restoring never touches
attempts, streaks or `lastCode`.

**Results panel (Q7):** `passed/total` + run duration, then mentor-style
micro-notes derived from the run: a thrown exception first, identifiers a
failing message names that are missing from the buffer, an untouched starter,
and an honesty note when hints or the solution were used.

**Palette actions:** the palette lists every registry command available on
the current screen plus "Go to" targets (screens, modules, lessons), fuzzy
filtered, recents first. It is hosted as an overlay (`Ctrl+K`), not a router
screen, so the screen underneath keeps its cursor state.

**Motivation (P1-3, all quiet by design):** a **daily goal** (Settings row;
Off → 1 → 3 → 5 → 10; `<C-g>` cycles on the settings screen) shows as a
dashboard chip and scores the recap's streak line. A **comeback nudge** —
one line after 7+ days away with nothing passed today, dismissed for the day
with `n`, never shown on first run. A **revisit pointer** in the recap names
the first challenge attempted 3+ times without a pass. **Milestone toasts**
(Q5): one-line celebrations for streaks (7/30/100), personal-best streaks,
and module crossings, each firing exactly once per install.

**Session recap (Q13):** quitting prints, after the alt screen is gone, the
time spent, challenges passed (with overall progress), failed checks, the
streak with today's goal, the revisit pointer, and the next-up challenge.

## 6. The embedded browser (dev tools)

Five tabs, `1–5` or `Tab` cycling:

1. **Render** — HTML laid out as a reader-view text grid: block/inline flow,
   headings, lists, tables, links (href shown), CSS applied for what survives
   a character grid (weight, colour, alignment, `display:none`, text-transform,
   `min-width` media queries). Screenshot action (opt-in) renders the page
   with headless Chromium and shows the PNG inline.
2. **Elements** — indented DOM tree, navigable, selected node described.
3. **Styles** — matched rules, inline styles, and the computed map for the
   selected node: *why* the render looks as it does.
4. **Console** — evaluates expressions against the learner's own code and the
   rendered page DOM: history, async `await`, REPL-formatted results; a
   warmed session (code executes once per edit, every `fetch` recorded).
5. **Network** — the recorded fetches with method/status/URL.

Follow mode: element selection follows the caret in markup challenges, so
Elements/Styles track what you type. Click-to-inspect syncs
Render→Elements/Styles; jump-to-source puts the editor caret on the element.

## 7. Settings & persistence

All preferences live in `.data/settings.json` (atomic tmp+rename writes;
corrupt files recover to defaults and stay writable). The Settings screen's
rows come from one shared module (`src/ui/preferences.js`) — the same rows,
values, and toggle behaviour everywhere:

- **Theme / Icons:** live-preview pickers (`←`/`→` or Space) over five
  curated themes and three glyph sets; `Auto` follows the capabilities probe;
  the whole tree re-themes/re-glyphs instantly.
- **Vim keys, sound (bell/OSC notify), soft wrap, tab size, daily goal.**
- Keymap overrides (`.data/keymap.json`) merge with diagnostics — unknown
  ids and bad bindings are reported, never fatal.

`src/ui/theme/` is the only place colour is decided: semantic tokens through
`ThemeProvider`/`useTheme`, hex at tier A, nearest-256 at B/C, **no colour at
all** at tier D (asserted by the gate). Screens ask for a ROLE (`theme.accent`)
never a raw value.

`.data/progress.json` holds per-lesson read/scroll state, per-challenge
records, per-project checklists, per-day minutes, **streak**
(timezone-local days), and `lastSeen`. Every save merges the on-disk records
over the in-memory state — additive facts never go backwards, so multiple
writers can share one progress file (`tests/unit/storeMerge.test.js`).
Checkpoints live in `.data/history/`; artifacts in `.workspace/`.

## 8. Quality tooling

- `npm run check` / `npm test` (`tools/check.js`) — the integration gate:
  curriculum deep-validation (shape, langs, starter-fails-for-debug),
  headless render smoke at every degrade tier (colourless tiers must emit no
  colour SGR), reference-solution verification, keymap conflict lint,
  generated-docs checks, external-link linter, and the perf replay
  (keystroke-to-paint against a one-line control probe — the enforced gate is
  the floor-relative ratio, the absolute numbers report).
- `npm run test:unit` — the node:test suites (`tests/unit/`), including
  editor replay goldens, route replays, and the store/checkpoint/persistence
  behaviours.
- `npm run verify` — the reference-solution + buggy-starter assertions across
  all 12 modules (Python live when `python3` exists, skipped gracefully when
  not).
- `tools/qa-audit.mjs` — the content QA probe: hint-ladder/difficulty lint
  plus every check graded against its starter.
- `.github/workflows/ci.yml` — build + `test:unit` + `check` on every push
  and PR (Node 22, `self-check` gated on `unit`), both jobs under timeout
  budgets.

## 9. What's next

Tracked in `loose-ends-spec.md` (priority waves), with landed history in
`docs/changelog.md`.
