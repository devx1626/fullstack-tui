# Loose Ends — Audit, Backlog & Execution Plan

**Status:** spec — no work started
**Date:** 2026-09-23
**Supersedes:** nothing; complements `tui-overhaul-spec.md` (overhaul) and `errors-and-qol-spec.md` (errors & QoL)
**Arbiter:** `npm run build && npm test && npm run test:unit` (the §13 merge bar), plus `tests/unit/*.test.js` per item

---

## 0. Purpose & Interview Decisions

A fresh full audit of the project — **not limited to what the existing specs planned**. It
catalogs everything left untied: planned-but-unfinished work, half-built seams, runner-hostile
gates, content drift, docs drift, and the aesthetics/motivation polish the specs never covered.
Every item carries a priority, a recommended execution, and verification.

**Decisions from the interview (binding for this spec):**

| # | Decision | Choice |
|---|----------|--------|
| 1 | Audit lens | **Fresh full audit** — new gaps the specs never covered (content, QoL, aesthetics, motivation), not just planned-work tracking |
| 2 | Phase 4 cut-over | **Include the flip** — Ink becomes the default entry; classic UI deleted |
| 3 | Deliverable shape | **Prioritized backlog** — P0/P1/P2, one-paragraph recommendation each; details on demand |
| 4 | CI | **First-class workstream** — runner-proof the gates, get the pipeline green |
| 5 | Audience | **Both beginners and career switchers** — flex: simple keys by default, power discoverable, never forced |
| 6 | Content | **QA + fill gaps** — audit the 12 modules and fix what it finds (thin hints, weak feedback, stale links); no brand-new authoring |
| 7 | Aesthetics | **Balanced mix** — chrome refinement + personality + micro-motion, sequenced after functional loose ends |
| 8 | Motivation systems | **In scope** — finish the half-built ones and extend; goalSet is already reserved in the registry |
| 9 | M1 screenshot seam | **Wire it** — Render-tab action behind `FULLSTACK_SCREENSHOT=playwright` with graceful not-installed guidance |
| 10 | Flip risk | **Big-bang** — parity checklist ticks off, then ONE commit flips default + deletes classic |
| 11 | Editor picks | **Caret fast path first** — the measured ~29 ms/move win; relativeNumbers stays reserved until it's in |
| 12 | Verification | **House standard** — unit tests per task, check §-sections extended, pty checks for terminal behavior, replay goldens for flows |
| 13 | P0 anchor | **Runner-proof CI** — every later task then lands with a working gate |
| 14 | Docs | **Full workstream** — README rewrite, features.md split, CONTRIBUTING refresh, with acceptance |
| 15 | Effort envelope | **Focused sprint (days, not weeks)** — each item sized to land in one sitting |
| 16 | Tone | **Quiet & precise** — restrained, tool-like; a clean line and a meter, never confetti |
| 17 | Overflow rule | **Aesthetics defer** — CI + flip + content QA + docs are protected; aesthetics/motivation polish is the explicit next-backlog section |
| 18 | Multi-cursor | **Wire it** — connect the registered bindings in the challenge route + acceptance tests |
| 19 | Dev tooling | **Minimal tooling** — small strict ESLint flat config + prettier, devDeps only |
| 20 | Ink 7 | **Post-flip item** — evaluate after the cut-over, as its own P2 line item |

---

## 1. Executive Summary

The project is functionally deep and heavily gated: `npm test` (tools/check.js) deep-validates
the curriculum, runs every reference solution, replays keystrokes, renders 11 screens × 4
tiers, measures perf against a floor probe, and fails on dead exports. Phases 0–3 of the Ink
overhaul are landed; the squiggles feature (M2) just shipped; the classic UI still runs as the
default entry, kept alive only by imports.

The loose ends fall into six clusters:

1. **Pipeline:** CI is red on every run — perf ceilings pinned to local hardware, load-sensitive
   timing tests. The merge bar exists but the cloud gate that's supposed to enforce it doesn't.
2. **Cut-over:** the Phase 4 flip is planned, half-prepared (docs, deletes, env escapes) and
   blocking ~5,000 lines of deletion, the Ink 7 question, and the docs rewrite.
3. **Seams & half-built features:** M1 screenshot (inert, allowlisted), multi-cursor bindings
   (engine-complete, unreachable), caret fast path (documented lever, not built), goalSet
   (reserved command, no UI), Ctrl+P/Ctrl+E round-trip goldens (named, unwritten).
4. **Content:** 12 modules authored in one push — tone, difficulty, hints, links and check
   quality have never been systematically reviewed against the learner experience.
5. **Docs:** README describes the pre-flip world; features.md is part inventory, part
   changelog; CONTRIBUTING still points at a fixed workflow that the flip will change.
6. **Polish:** quiet chrome refinement, gentle micro-motion within degrade rules, and the
   motivation systems (goal, recap, milestones) finished and extended.

Ordering follows the interview: **CI first** (anchor), then flip + delete, then the seams and
content, with polish as the protected-to-last tier that defers first if the sprint overflows.

---

## 2. Priority Tiers (definitions)

- **P0 — Sprint-blockers.** Items the sprint exists to land. If one of these is cut, the
  sprint is considered failed. Protected by the overflow rule.
- **P1 — Protected secondary.** Land these if the sprint holds; they are the first to be
  *rescheduled* (not descoped to nothing) if P0 overruns.
- **P2 — Next-backlog.** Explicitly deferred to the following backlog cycle, per the overflow
  rule. Tracked here so the decision is visible, not accidental.

---

## 3. P0 — Sprint-Blockers

### P0-1 · Runner-proof CI (the anchor)

**Finding.** Every CI run is red, and the repo has never had a green cloud run. Two independent
causes, both environmental rather than product:

1. **Perf ceilings are absolute ms numbers calibrated to one machine.** The four §12 targets
   (editor keystroke-to-paint, palette typing, list navigation, browser-tab scrolling) fail on
   runners at ~400 ms against a hard-coded 250 ms ceiling — while the **same-run ink floor
   probe** also measures ~400 ms, i.e. the product sits at 1.0× the renderer floor. The gate
   already prints the floor beside each number; the *ceiling* just doesn't use it.
2. **Load-sensitive unit tests.** `tests/unit/animation.test.js` ("spinner frames reach the
   stream") deletes `CI` to force motion on, then waits ≤2 s on a runner slow enough that no
   frame lands in time. The settle-window tests ("the challenge rendered") fail the same way —
   `node --test` runs ~64 files (each importing the 9.1 MB harness bundle) concurrently on a
   small runner.

**Recommendation.**
- Convert the four perf ceilings to **floor-relative**: fail past N× the same-run floor probe
  (e.g. 10× floor as a hard regression ceiling; keep the existing "warn at k× floor" lines for
  the renderer-wall discussion). Absolute numbers stay printed for interpretability.
- For the timing tests: raise timeouts under `CI=true` (a `CI`-aware `waitFor` default, e.g.
  8 s), and for the animation spinner test specifically, poll with a generous window rather
  than deleting `CI` and racing a 2 s wall — or mark it `t.skip()` when `CI` and TTY-less,
  since `animationAllowed` is false on runners *by design* (`env.CI` → static frames).
- Confirm the deterministic-frames contract still holds on runners: with `CI=true`, BusyLine
  renders the static frame, so snapshot tests are unaffected; only the motion-forcing test
  needs the runner-aware path.
- Acceptance: **two consecutive green runs** on `master` (guards against flaky-pass).

**Status (2026-09-23).** The perf-gates half is implemented in `tools/check.js` §9: the hard
FAIL ceiling for all four §12 probes (editor typing, palette typing, list navigation,
browser-tab scrolling) is now `max(10 × same-run ink floor p95, 250 ms backstop)`
(`PERF_FAIL_MULT`), and the absolute 33/100/250 ms lines remain as informational warns that no
longer fail the run by themselves. The 250 ms backstop keeps the gate honest if the floor
probe ever runs implausibly fast (a near-0 floor is clamped to 1 ms before the multiplier).
The ratio warn (`PERF_WARN_MULT`, 8× floor) sits above the measured steady-state envelope
(p95 ≈ 2.7–6.4× floor across five runs) so it marks *growth* of the gap to the renderer wall,
not the product's ordinary shape — the report-only renderer-wall pass stays in P1-1. Verified:
five consecutive green `npm run check` runs on the dev machine (past the two-run acceptance),
plus a forced-fail dry run (`PERF_FAIL_MULT=1`, `FAIL_MS=50`) proving all four gates trip with
the floor-relative message and the run exits non-zero. The load-sensitive-timing half (the
`CI`-aware `waitFor` default, the animation spinner window) is **still open** — nothing here
touches it.

### P0-2 · Phase 4 flip: parity checklist, then big-bang cut-over

**Finding.** The flip is planned (`tui-overhaul-spec.md` §"Cut-over mechanics") and half-prepared
(docs still say classic is default; env escapes to remove; ~5k lines of classic code kept alive
only by `src/app.js` imports; check §10 will catch the orphaned files the moment they're
unreferenced). The specs defer several decisions ("revisit after Phase 4") that block a clean
flip.

**Recommendation.** Execute as one gated milestone:

1. **Parity checklist (ticked before the flip commit — every row verified by its command).**

   Status legend: ✅ = verified green on this tree (2026-09-23 audit run); ⬜ = action
   required before the flip (the row names it). Command cells are exact and runnable from
   the repo root. IDs (`PC-nn`) are referenceable from tasks and commits.

   **A. Screens & rendering**

   | ID | Requirement | Verification command | Status |
   |---|---|---|---|
   | PC-01 | All 11 routes render without throwing at tiers A–D (44 frames) | `npm run check` (§9 tier smoke prints `A:11 B:11 C:0 D:0`) | ✅ |
   | PC-02 | Tier C/D emit no color SGR; `FULLSTACK_THEME=paper` reaches a screen | `npm run check` (§9 asserts both; fails on regressions) | ✅ |
   | PC-03 | Degrade tour: glyphs, meters, borders, 7-bit tier D, motion gate hold | `npm run check` (§9 verification tour) | ✅ |
   | PC-04 | Small/degenerate sizes render — the NEXT-UI equivalent of the classic size sweep (built 2026-09-23: check §9c sweeps 11 routes × 60×16/A, 40×12/A, 40×12/D = 33 frames, non-throw + non-blank + a 7-bit assertion on chrome routes at tiny tier D) | `npm run check` (§9c prints `small-size sweep: 11 routes × 3 window shapes rendered without throwing`) | ✅ |
   | PC-05 | No dead exports / orphan modules, allowlist EMPTY after P0-3 wires the M1 seam | `npm run check` (§10; remove the `probeGraphicsTTY` entry) | ⬜ |
   | PC-06 | Piped non-TTY stdin/stdout: one-shot static render, exit 0 | `npm run build && FULLSTACK_UI=next node bin/fullstack.js \| head -5; echo exit=$?` (re-run post-flip without the env) | ✅ |

   **B. Keys & commands**

   | ID | Requirement | Verification command | Status |
   |---|---|---|---|
   | PC-07 | Every footer/help key token resolves to a registered `(id, mode, when)`; no conflicts outside ALLOWED_CONFLICTS | `npm run check` (§5 registry lint) | ✅ |
   | PC-08 | All 33 vim bindings resolve through the real `reduceKey`; footer hints resolve on the challenge screen | `npm run check` (§7) | ✅ |
   | PC-09 | `docs/keymap.md` + `docs/vim.md` regenerate with no diff | `npm run keymap:docs && git diff --exit-code docs/keymap.md docs/vim.md` | ✅ |
   | PC-10 | Help screen renders `src/core/help.js` (shared content, both UIs pre-flip) | `node --test tests/unit/nextScreens.test.js` | ✅ |
   | PC-11 | Multi-cursor bindings reachable from the challenge route (P1-2) — the registry must not ship unreachable bindings once classic dies | `node --test tests/unit/multicursor.test.js tests/unit/routes.test.js` (after P1-2 lands) | ⬜ |
   | PC-12 | `%` bracket match live in vim mode (P1-10); modeless stays palette-only | `node --test tests/unit/vim.test.js tests/unit/brackets.test.js` + docs regen (PC-09) | ⬜ |
   | PC-13 | Palette lists screen commands + Go-to targets; `keymap.json` overrides merge with diagnostics | `node --test tests/unit/palette.test.js tests/unit/keymap.test.js tests/unit/useKeymap.test.js` | ✅ |

   **C. Editor & challenge flows**

   | ID | Requirement | Verification command | Status |
   |---|---|---|---|
   | PC-14 | Replay goldens: solve-from-scratch, vim insert/undo/redo, multi-file tabs — with intent assertions beside each golden | `node --test tests/unit/editorReplay.test.js` | ✅ |
   | PC-15 | Burst-typing safety: two printable bytes in one stdin chunk compose in order | `node --test tests/unit/routes.test.js` (two-key-burst subtest) | ✅ |
   | PC-16 | Ctrl+E external editor: terminal release → edit → restore → buffer reload (P1-6 golden) | `node --test tests/unit/editorReplay.test.js` (external-editor-roundtrip golden: fake shebang $EDITOR, alt-off/alt-on written exactly once, artifact consumed, reloaded buffer) | ✅ |
   | PC-17 | Ctrl+P preview round-trip: parts assembly → `.preview.html` write (P1-6 golden) | `node --test tests/unit/editorReplay.test.js` (preview-roundtrip golden: live buffer → assembled standalone document on disk; FULLSTACK_NO_OPEN=1 suppresses the OS opener) | ✅ |
   | PC-18 | Mouse end-to-end: click-caret, drag-select, wheel, divider drag, claim protocol — via raw SGR bytes through the real InputDispatcher into the mounted route tree | `node --test tests/unit/mouseReplay.test.js` (5 replays: caret clicks, drag-select+replace, wheel scroll, brief-pane rejection, claim protocol) + `node --test tests/unit/routes.test.js` (divider drag) | ✅ |
   | PC-19 | Autosave debounce flushes on unmount (fast exit loses nothing) | `node --test tests/unit/editorReplay.test.js tests/unit/routes.test.js` | ✅ |
   | PC-20 | Completions E2E: trigger, accept-as-one-undo-step, snippets, signature; popup outranks global Esc | `node --test tests/unit/completionWiring.test.js tests/unit/completions.test.js` | ✅ |
   | PC-21 | M2 squiggles render and strip at colorless tiers | `node --test tests/unit/squiggles.test.js` + `npm run check` (§9) | ✅ |

   **D. Terminal & process lifecycle**

   | ID | Requirement | Verification command | Status |
   |---|---|---|---|
   | PC-22 | Ctrl+C (raw 0x03): clean exit, no lingering process, alt-screen restored (`?1049l`) | `bash tools/repro-e4.sh` → exit 0, "E4 CLEARED" | ⬜ run pre-flip (verified at Phase 0; re-verify on the flip candidate) |
   | PC-23 | SIGWINCH resize re-renders; min floor 40×16 honored | `node --test tests/unit/sigwinch.test.js` (fake-emitter unit: real listener → snapshot → re-render chain, floor clamp/release, no-op skip, challenge split re-clamp via the mouse gate, listener-leak check) | ✅ |
   | PC-24 | Input parsers: mouse SGR 1006, bracketed paste 2004, escape coalescer, Alt-chars | `node --test tests/unit/input.test.js tests/unit/driver.test.js` | ✅ |

   **E. Data & persistence**

   | ID | Requirement | Verification command | Status |
   |---|---|---|---|
   | PC-25 | Progress store: multi-writer additive merge; corrupt file falls back to writer state | `node --test tests/unit/storeMerge.test.js` | ✅ |
   | PC-26 | `keymap.json` corrupt/unknown ids warn-not-fatal; `settings.json` corrupt recovers to defaults | `node --test tests/unit/keymap.test.js` (keymap ✅); ⬜ verify a settings-corrupt test exists, add one to `phase1Rest.test.js` if not | ⬜ |
   | PC-27 | Checkpoint sidecars (Q9: 10-run ring + daily best) restorable from the NEXT-UI palette (`history.restore`) — classic replays cover it today; confirm the Ink path | ⬜ route-level restore test; then `node --test tests/unit/routes.test.js` | ⬜ |
   | PC-28 | Pass saves artifacts to `.workspace/` (multi-file folders included) from the Ink route | ⬜ confirm existing coverage in `routes.test.js`; extend if only the classic replay asserts it | ⬜ |

   **F. Flip-commit mechanics (verify the deletion itself)**

   | ID | Requirement | Verification command | Status |
   |---|---|---|---|
   | PC-29 | `bin/fullstack.js` loads `dist/main.js` directly; missing-build message kept; `FULLSTACK_UI` handling gone; `FULLSTACK_THEME`/`FULLSTACK_ICONS`/`EDITOR`/`VISUAL` envs stay | review + `npm run build && node bin/fullstack.js \| head -3` (piped one-shot) | ⬜ |
   | PC-30 | `package.json`: `ui:next` script removed, description/keywords updated, deps unchanged | `git diff package.json` review + `npm start` pty smoke | ⬜ |
   | PC-31 | Deleted: `src/tui/`, `src/views/`, `src/app.js`, `src/index.js` — zero references remain | `git grep -nE "src/(tui\|views)\|src/app\.js\|src/index\.js" -- src bin tests tools` → empty | ⬜ |
   | PC-32 | Classic-only tests deleted (`editor.test.js` classic model, `canvasLinks.test.js`); check §6/§8 classic replay sections removed with every Q-item they covered asserted green on Ink equivalents (`routes.test.js`, `milestoneToasts.test.js`, `checkNotes.test.js`, `recap.test.js`) | `npm run test:unit` + `npm run check` | ⬜ |
   | PC-33 | README flip minimum in the same commit: `npm start` = Ink, `FULLSTACK_UI` note, scripts table, status section | review + `npm run keymap:docs && git diff --exit-code docs/` | ⬜ |

   **Tally & gate rule.** As of 2026-09-23 (post-PC-23): **21 rows verified green** (✅), **12
   rows carry work** (⬜) — of which 5 are build-test rows (PC-11, PC-12,
   PC-26, PC-27, PC-28) and 7 are flip-mechanics rows (PC-29–PC-33, PC-22's
   re-run, PC-05's allowlist edit). **The flip commit is permitted only when every row in
   sections A–E reads ✅ and section F is executed as the commit itself.** Rows are ticked by
   running the command cell on the flip-candidate tree, never from memory.
2. **Flip commit (big-bang, one commit):**
   - `bin/fullstack.js`: default `FULLSTACK_UI=next` behavior; remove the env var handling
     and legacy env escapes (`FULLSTACK_THEME=light|dark` handled by the new theme resolver —
     the overhaul spec line 191 already says these are NOT kept after parity).
   - Delete `src/tui/`, `src/views/`, `src/app.js`, `src/index.js` (classic entry), and the
     classic-only tests (§10 will flag orphans; the allowlist gets emptied of the M1 seam
     entry *if* P0-3 lands first — see the dependency note there).
   - `package.json`: update `description`/`keywords` (no more "classic UI"); remove
     `ui:next` script; keep `fullstack` bin.
   - Squiggles already land in the next UI (M2 done); nothing to port.
   - Docs: flip-forced README rewrite lands **in the same commit** (see P1-4 for the full docs
     workstream; the flip commit carries the minimum: entry point, scripts, key table, status
     section, and a one-line note that `FULLSTACK_UI` is gone — `npm start` launches the Ink
     UI directly).
   - Content: no change — the grader, sandbox, curriculum modules are UI-agnostic.
3. **Post-flip gates stay identical:** the §13 merge bar, §10 dead-export gate (now with an
   empty allowlist if P0-3 wired the seam), perf gates as floor-relative from P0-1.

**Sizing note.** The flip itself is one sitting; the parity checklist is the real work and is
mostly verification, not building. If a gap is found during parity (a classic behavior with no
next-UI equivalent), it becomes a P1 item ahead of the flip — do not widen the flip commit.

**Dependencies:** P0-1 (green CI as the arbiter), P0-3 (M1 seam decision changes what §10
allows), P1-2 (multi-cursor wiring must precede the flip so the registry isn't shipping
unreachable bindings when classic dies).

### P0-3 · Wire the M1 screenshot seam

**Dependency note:** this unblocks the flip's delete list — if the seam is wired, check §10's
allowlist entry for `probeGraphicsTTY` comes out, and the modules become live code with a real
caller.

**Finding.** `src/ui/graphicsProbe.js` (env + TTY probe) and `src/ui/screenshot.js` (lazy
Playwright PNG builder) are written and unit-tested but invoked from nothing — they exist as a
documented seam with a named check-§10 allowlist entry. `docs/multimedia.md` planned the
integration for the browser Render tab.

**Recommendation.** Wire per the multimedia doc: browser Render tab gains a "screenshot"
action (registry command `browser.screenshot`), gated by `FULLSTACK_SCREENSHOT=playwright`;
lazy-require Playwright, render the current page HTML to PNG, emit via `iterm2Image()`/kitty
chunked protocol builders that already exist; **graceful degradation**: playwright not
installed → guidance panel ("npx playwright install chromium"); graphics probe says none →
action hidden entirely (probe-gated, per the doc's "probe, don't guess" rule); CI/non-TTY →
never probed. The render is the learner's own page — no network (mockFetch discipline holds).
- Acceptance: unit tests for the gating logic (env/probe/not-installed paths); a pty-skipped
  test asserting the not-installed guidance renders; docs/multimedia.md §6 status updated;
  §10 allowlist entry removed.

### P0-4 · Content QA + gap-fill (all 12 modules)

**Finding.** The curriculum was authored in one push; `npm test` verifies *structural* integrity
and that reference solutions pass, but no pass has systematically reviewed the learner
experience: tone consistency, difficulty curves, hint laddering, stale external links, weak
checks, or feedback quality.

**Recommendation.** One pass, module by module, with a fixed review rubric per module:

- **Tone & difficulty:** does the prose match the audience contract (beginner-flexible,
  career-switcher-respecting)? Do lesson → challenge jumps spike unreasonably? Are the three
  hint tiers real (Conceptual → Strategic → Code), with the Code hint actually sufficient?
- **Hints & feedback:** for every challenge, does the first Code hint + check message give a
  learner a realistic path? Are failure messages mentor-style (the `checkNotes` voice)?
- **Links:** verify every course/roadmap/MDN link resolves (script the check — extend
  tools/check.js with a link linter for `course`, `roadmap`, and lesson-body URLs; offline
  determinism is NOT required for the linter — it runs in the check gate, not in the learner
  runtime).
- **Checks:** reference solutions still pass (covered by `npm run verify`), but also: does any
  check pass vacuously (e.g. `typeof` checks a learner can satisfy without doing the task)?
  Does any check fail on a *correct-but-different* solution?
- **Fix what it finds** (QA + gaps): thin hints filled, vacuous checks tightened, broken links
  replaced, difficulty spikes smoothed. **No brand-new authoring** — new modules/topics are
  explicitly out of scope for this sprint.

**Verification per decision 12 (tiered):** the verify suite + check §-sections already cover
structure; content fixes carry targeted unit assertions where a check's behavior changed
(e.g. a tightened check's reference solution and a wrong-answer rejection); tone/link fixes
carry no new tests beyond the link linter.

### P0-5 · Editor caret fast path

**Finding.** Documented, measured, and deliberately not built (`tui-overhaul-spec.md` §12,
update 4/5): a caret-only move currently costs ~0.6× a typing keystroke (~29 ms) because ink
re-renders and re-tokenizes the whole frame even when only the caret moved. The route-level
fast path — update `sessionRef`, reposition the terminal cursor, **no React state update** —
is worth the whole ~29 ms per move. The component half of the contract is already asserted
(`tests/unit/codeEditor.test.js`: caret moves paint byte-identical text).

**Recommendation.** Build the fast path with the guard conditions §12 specifies: the move must
change neither selection nor scroll view, `relativeNumbers` must be off (relative gutters
depend on the caret row), and vim mode badge/footer must not depend on the caret (they don't).
Where it hooks: ChallengeRoute's session ref (the same ref that already serializes two-key
bursts). Fallback: any guard fails → normal state update path (current behavior).
- Acceptance: replay harness measurement shows caret-only moves at a floor-adjacent p95;
  existing replay goldens unchanged; a new test asserting the guards fall back correctly.
- **Decision 11 ordering:** relativeNumbers stays reserved (setting present but undefined) —
  it ships only after this fast path exists and is gated to disable the fast path when on.
  The audit records this as a *deliberate* order, not a deferral.

---

## 4. P1 — Protected Secondary

### P1-1 · Runner-proof CI part 2: noise reduction

While P0-1's floor-relative ceilings are in (check §9), the perf story deserves one more pass:
report-only mode for the renderer-wall discussion (the four targets sit at ~2.7–6.4× floor
because of ink's re-tokenization; the ceiling catches *regressions*, not the wall), and
a CI job ordering that runs `test:unit` first for fast feedback, then `check`. Also: a job
timeout budget so a hung pty check can't eat the 10-minute default.

### P1-2 · Wire multi-cursor bindings

**Finding.** Multi-cursor is engine-complete (`multicursor.js`, 50-cursor cap, per-cursor ops)
and registered (`<C-A-↑/↓>`, `<C-d>` per Appendix B.5), but the challenge route never wired
the handlers — learners cannot reach it. The overhaul spec notes "the screen wiring is not"
in 2.6's acceptance.

**Recommendation.** Connect in ChallengeRoute: add-cursor-above/below (`<C-A-↑/↓>`),
next-match (`<C-d>`), and per-cursor typing/backspace/pair/indent through the existing
typekeys path. Render: caret set drawn as the terminal cursor at primary + an explicit
secondary caret rendering (the engine returns the cursor set; the component draws it).
- Acceptance: acceptance tests (registry → route → engine round-trip, collision collapse,
  50-cap notice), a replay golden for an add-cursor-and-type sequence, and the footer hints
  lint passing with the new bindings surfaced.
- **Must precede the flip (P0-2)** so the registry never ships unreachable bindings once
  classic is gone.

### P1-3 · Motivation systems: finish the half-built, extend gently

**Findings.** `settings.goalSet` is a reserved registry command with no UI (errors-and-qol-spec
§0.7a table); the session recap (Q13) exists and is good; milestone toasts (Q5) are one-shot
and solid.

**Recommendation.**
- **Daily goal (goalSet):** a small goal flow — set a daily challenge goal in Settings (the
  reserved command already exists; the settings screen row is the natural home, per
  errors-and-qol-spec §4 phase work), surface it as a chip on the dashboard (next to the
  streak chips, which already exist), and let the recap report against it. Quiet presentation
  per decision 16: a chip and a line, never a celebration.
- **Recap extension:** the recap already prints time, passes, failed checks, streak vs goal,
  next-up. Extend with: goal hit/miss line (needs goalSet), and — if content QA produced
  anything — a "worth revisiting" pointer (e.g. the first challenge failed 3+ times without a
  pass, if such a record exists).
- **Comeback nudge (new, small):** if lastSeen is 7+ days back, the dashboard shows one
  respectful line (streak broken, here's next-up) — one line, dismissible, no confetti.
- All persistence through `.data/progress.json`/`settings.json` with the existing atomic-write
  and merge discipline; unit tests for the goal math and the nudge predicate.

### P1-4 · Docs workstream

**Findings.** README says the classic UI is "the stable, default experience" (pre-flip world),
its status section narrates phases 2–4 as future, and its scripts table carries pre-flip
entries. features.md is part inventory, part changelog (dated progress notes interleaved with
feature truth). CONTRIBUTING describes a workflow the flip changes (env var entry, deleted
files). The specs themselves are honest but enormous; they're history documents now.

**Recommendation.** Four deliverables, sequenced around the flip:
1. **README rewrite** (flip-forced minimum lands in the flip commit; the full rewrite as its
   own item): post-flip entry points, scripts, key table, features highlights, status section
   describing the shipped state, no phase narrative.
2. **features.md split:** the feature inventory stays the canonical list; the dated progress
   notes move to `docs/changelog.md` (or are trimmed into it); the §10 "Planned" section is
   replaced with a pointer to this spec's backlog.
3. **CONTRIBUTING refresh:** post-flip entry (`npm start` = Ink UI), the golden rule, testing
   discipline, commit style, and a pointer to this spec for "what's next".
4. **Specs section:** add a short "status: superseded by loose-ends-spec.md for remaining
   work" note at the top of the two big specs, so a future reader doesn't re-plan from stale
   status tables. The specs stay as history/rationale, not as trackers.
5. **Publishing note:** if the package is ever published to npm, do it **after** the flip and
   tag v1.0.0 there — no published user should ever meet the classic app (see the resolved
   flip-risk finding in §7).

### P1-5 · Minimal dev tooling

**Finding.** No linter/formatter/typechecker — `tools/check.js` enforces house style (no
`useInput`, no hardcoded color names, no dead exports) but nothing catches general JS issues.

**Recommendation.** Small strict ESLint flat config (`eslint` + `@eslint/js` recommended +
a few rules: no-unused-vars, eqeqeq, no-var, prefer-const; JSX via a minimal config) +
`prettier` (with the repo's existing 2-space/100-col style) as devDeps only, wired as
`npm run lint` / `npm run format`. CI job: lint after build, non-blocking at first (warn),
flipping to blocking after the first cleanup pass. Deliberately excluded: TypeScript
(invasive; the zero-TS call was made at project start), plugin sprawl, import sorting.

### P1-6 · Unwritten round-trip goldens — CLOSED 2026-09-23

**Finding.** The 2.9 acceptance named "Ctrl+P/Ctrl+E round-trip goldens" as unwritten; the
replay goldens cover solve-from-scratch, vim, and multi-file flows, but not the two paths that
release the terminal (Ctrl+E external editor) or shell out (Ctrl+P preview).

**Recommendation.** Write them. The terminal-release round-trip (alt screen off → external
editor → alt screen on → buffer reloaded) is the riskiest untested path in the challenge flow;
a pty-driven golden (or a pty-skipped test with the release logic unit-tested against a fake
release hook) closes the last named gap in the 2.9 acceptance.

**Resolved (both goldens now exist in tests/unit/editorReplay.test.js; rows PC-16/PC-17 ✅).**
Writing them immediately paid for itself twice:

1. **`challenge.preview` was a dead binding in the next UI** — `<C-p>` was registered in
   commands.js but neither the route switch nor the host table implemented `openPreview`
   (classic-only at src/app.js). The route now owns it: classic-parity parts assembly
   (previewParts for single-file, synthesisParts for multi-file), writePreview to the
   challenge's workspace path, openExternally hand-off, failure-as-status-line. A new
   FULLSTACK_NO_OPEN=1 env (same family as FULLSTACK_THEME) forces the "written to …"
   fallback so headless environments never spawn a desktop opener.
2. **Bundled-ROOT bug (would have broken the P0-2 flip)**: the goldens drive the BUNDLED
   route (dist/harness.js), and store.js's hardcoded `ROOT = resolve(HERE, '..', '..')`
   resolved one directory ABOVE the project from the bundle — every `.data` write and
   `.workspace` artifact from dist/main.js would land outside the repo. ROOT now walks up
   to the nearest package.json, which is correct in both the checkout and bundled layouts.
   The Ctrl+E golden also exposed the edit artifact never being deleted (one orphan file
   per excursion); the route now consumes it in a finally.

### P1-7 · Aesthetics & micro-motion (quiet tier)

**Findings.** The foundation is strong (theme tokens, icon sets with degrade, motion gate).
What remains is chrome-level refinement, deliberately sequenced last.

**Recommendation.** Quiet & precise, per decisions 7/16:
- **Chrome audit:** consistent panel padding/spacing across the 11 screens; alignment of the
  header/tab strip/progress right-edge; the footer's context-hints line as the single
  source of truth for hints (already linted — extend the lint to *all* screens, not just
  challenge).
- **Micro-motion within the gate:** a subtle settle animation on the results pane (the data
  is there — the perf story is already told), progress meters that fill rather than snap on
  the dashboard, and a quiet toast slide for milestone toasts. Everything gated by
  `animationAllowed` (tiers, CI, NO_ANIMATION) — the existing gate is the spec, don't invent a
  new one.
- **Personality:** one authored moment — a first-launch banner line (the welcome tour already
  exists; the banner is a single line above it, themed, quiet) and a themed block character
  for the module badge row. No mascots, no confetti.
- All presentational; replay goldens + tier smoke keep frames deterministic; anything that
  changes a frame updates goldens deliberately (reviewable diffs).

### P1-8 · Command palette discoverability pass

**Finding.** 67 command ids, and the palette lists "every registry command available on the
current screen plus Go-to targets". Discoverability beyond the palette is thin: the footer
shows per-screen hints, but nothing tells a learner the palette *exists* beyond the welcome
tour step and help text.

**Finds** a gap the specs never covered: **the palette is the app's power surface, but
discoverability of the palette itself is a one-time tour step.**

**Recommendation.** Small, quiet: a first-session footer hint (`Ctrl+K for commands`) on the
dashboard for the first N sessions (persisted session count), and a `commands` help section
in the help screen listing the most-used registry commands per screen. No new surface, no new
screen.

### P1-8 (alt) · Check-tool link linter

Merged into P0-4 (the content QA carries the link linter extension to tools/check.js — not a
separate workstream).

### P1-9 · Settings: goalSet row + palette discoverability (merged)

Merged into P1-3 and P1-8; the Settings screen gains the goal row there.

### P1-10 · Editor polish odds & ends

**Findings.** Small named-in-spec items that never got a row: `%` bracket match is registered
but palette-only in the modeless editor (waiting on the vim engine — which has since landed,
so the binding can go live); `editor.bracketMatch` from the palette already works with the
vim engine; `relativeNumbers` stays reserved (decision 11).

**Recommendation.** `%` goes live with the vim engine now present (vim.js is the mode gate;
modeless keeps the palette-only behavior as documented). Verify in the vim acceptance table
(`%` motions are table-covered); extend docs/vim.md via the generator.

---

% — the `%` item is deliberately small; it rides the vim engine that landed in Phase 2.

---

## 5. P2 — Next-Backlog (explicitly deferred by the overflow rule)

### P2-1 · Aesthetics expansion beyond the quiet tier

Deeper visual work beyond P1-7's quiet tier: screen transitions, richer celebration moments,
more personality. Explicitly the *next* backlog's scope — the sprint protects CI/flip/content/
docs and defers this first.

### P2-2 · Ink 7 evaluation

The npm-latest ink@7 (needs Node ≥ 22, native Alternate Screen, revised input pipeline) —
evaluate after the flip per decision 20. Upside: delete the first-party alt-screen shim and
narrow the input pipeline to paste+mouse (§A.3). Downside: Node ≥ 22 requirement conflicts
with the current `engines: >=20.9`. Deliverable: an evaluation note in docs/ (or a spec
amendment), not a migration.

### P2-3 · Content expansion (new authoring)

New modules/topics (TypeScript module, capstone depth) — explicitly out of the QA + gaps
scope (decision 6) and into the next backlog.

### P2-4 · Content QA, wave 2 (the modules the sprint couldn't reach)

If the P0-4 pass samples rather than covers all 12 modules (overflow rule), the remainder
lands here.

### P2-5 · Perf: the ink wall itself

The ~3–6× floor overhead on all four §12 targets is ink's re-tokenization, not the app's.
If ink 7's renderer changes the equation (P2-2), re-baseline. Until then, the floor-relative
ceiling from P0-1 is the honest gate.

### P2-6 · Reserved-but-unshipped settings review

`relativeNumbers` ships after the fast path (decision 11). Other reserved-but-unshipped
settings (if any others accumulate) get a review: ship, or remove the reservation (the
registry lints should catch dead command ids — verify the same discipline holds for settings
keys).

---

## 6. Execution Waves (sprint shape)

Focused sprint (days, not weeks), sequenced by dependency, with the overflow rule applied:

| Wave | Items | Rationale |
|---|---|---|
| **1** | P0-1 CI | Anchor: every later task lands with a working gate |
| **2** | P0-2 flip (incl. min README), P0-3 M1 wire, P1-2 multicursor | Cut-over cluster; P1-2 must precede the flip |
| **3** | P0-5 fast path, P0-4 content QA | Product depth; content QA is the long pole — rubric-driven, module by module |
| **4** | P1-3 motivation, P1-4 docs, P1-5 tooling, P1-6 goldens, P1-10 | Landing tier; docs describe the final state |
| **5 (defer tier)** | P1-7 aesthetics, P1-8 discoverability → P2 | Overflow rule: these defer first |

**Dependency notes:**
- P0-2 (flip) requires P0-1 (green CI), P0-3 (§10 allowlist), P1-2 (multicursor wiring).
- P1-4 (docs) requires P0-2 (the flip defines the docs' subject matter).
- P1-7 (aesthetics) requires the flip (polishing chrome nobody will delete).
- P0-5 (fast path) requires nothing but the §12 guard conditions.

**Sequencing principle:** every wave ends green — build, test:unit, and check pass after each
item, not just at the end. Items are sized to land in one sitting each (decision 15).

---

## 7. Risks & Open Questions

- **Flip risk (the biggest) — RESOLVED 2026-09-23: big-bang stands.** The open question asked
  whether a distributed user base justifies a staged flip with a `FULLSTACK_UI=classic`
  escape hatch. Evidence gathered: the package is **not published to npm** (`npm view
  fullstack-tui` → 404; the name/bin are publish-ready but no version has ever shipped),
  there are **no git tags, no GitHub releases, no changelog**, and the public repo (created
  2026-09-16) shows **zero stars/forks/watchers/issues**. The only user is the developer;
  the only persisted state is local `.data/` — which the flip does not touch, because both
  UIs already share one progress store, settings and keymap through
  `src/core/store.js`/`src/ui/preferences.js`. A staged flip's insurance would protect
  nobody while extending the classic code's life, the test surface and the docs' two-UI
  ambiguity through a bake period with zero beneficiaries. Mitigations, in order:
  (1) the **parity checklist** (P0-2) is the real safety mechanism — verifiable rows, not
  vibes; (2) big-bang makes the flip **one commit**, so the disaster path is a plain
  `git revert` — cheaper and cleaner than any escape hatch; (3) the flip lands immediately
  after a **green CI run** (P0-1 dependency); (4) if npm publication is ever planned, do it
  **after** the flip and tag v1.0.0 there, so no published user ever meets the classic app
  (recorded in P1-4).
- **Content QA scope risk.** 12 modules × rubric is the sprint's long pole. Mitigation: the
  rubric keeps it mechanical; if the pass outruns the sprint, the remainder becomes P2-4
  explicitly (not silently).
- **Playwright in CI?** Wiring M1 (P0-3) adds an optional heavy dependency. It's lazy-loaded
  and learner-side only (never in the check gate beyond the gating-logic unit tests), so CI
  cost stays zero. If it later earns a CI job (screenshot smoke), that's a deliberate follow-up.
- **Playwright as a devDep vs optionalPeer:** recommend NOT adding it to package.json at all —
  lazy-require keeps it opt-in (`FULLSTACK_SCREENSHOT=playwright` + npx playwright install).
  Verify the lazy-require path handles the not-installed case cleanly (it's unit-tested).
- **ESLint/prettier as the first devDeps.** The project's zero-dep philosophy (zero *runtime*
  deps; esbuild/ink/react are already declared) — adding two devDeps is consistent with that
  (they're dev-only), but verify the config stays small (decision 19: minimal tooling).
- **floor-relative perf ceiling risk:** a runner's floor probe variance (shared CI runners are
  noisy) could make N× floor either too tight (flaky CI) or too loose (missed regressions).
  Mitigation: measure the floor probe's own variance across a few CI runs before fixing N;
  consider taking the floor as the median of 3 probes in the same run.

## 8. Verification Bar (per decision 12)

- **Code items (engine/UI):** unit tests per item; check §-sections extended where a standing
  gate belongs (link linter → check, multicursor hints lint, floor-relative perf gate); pty
  checks for terminal behavior (repro-e4 stays the Ctrl+C regression command); replay goldens
  for flows (multicursor sequence, Ctrl+P/Ctrl+E round-trips).
- **Content items:** `npm run verify` + check's structural validation + targeted unit
  assertions where a check's behavior changed; the new link linter runs in the gate.
- **Aesthetics items:** replay goldens + tier smoke keep frames deterministic; anything that
  changes a painted frame updates goldens deliberately (reviewable diffs); no new test
  machinery for presentational-only changes beyond snapshots where cheap.
- **Docs items:** `npm run keymap:docs` regenerates with no diff; the §7 drift gate keeps docs
  honest; README's scripts table is asserted against package.json by the existing check (if
  one exists — if not, that's a one-line addition in P1-4).

## 9. Non-Goals (stated to prevent scope creep)

- **No TypeScript** (decision 19 adjacent; the project-wide call was made at inception).
- **No new modules/topics authored** (decision 6; P2-3).
- **No audio/video playback** (multimedia.md's permanent ruling).
- **No classic-UI feature parity work** — the flip deletes it; parity is a checklist, not a
  porting exercise.
- **No new test framework** — node:test + tools/check.js remain the only machinery.
- **No runtime dependencies added.** DevDeps (ESLint/prettier) only, per decision 19.

---

*End of spec. Work is under way — parity rows tick in the P0-2 checklist and item status is
recorded under each finding (see P0-1's status block). Still open from Wave 1: the
load-sensitive-timing half of P0-1 (`CI`-aware `waitFor`, animation spinner window).*
