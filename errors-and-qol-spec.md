# Errors & QoL — Specification

**Project:** `fullstack-tui`
**Spec status:** Draft for review (no code changes made)
**Date:** 2026-09-14
**Author:** Buffy (from a 5-round requirements interview + code audit)
**Companion doc:** `tui-overhaul-spec.md` (the Ink rewrite plan) — this spec **amends** it, it does not replace it.

---

## 1. Summary

Two workstreams, one plan:

1. **Error analysis** — a stabilization pass fixing every **user-visible defect** in the current code (classic UI and the new Phase 0 layer), with audit-confirmed findings cited at `file:line` and suspected findings carrying a verify-then-fix reproduction step.
2. **Quality-of-life features** — across **all four** themes (speed & navigation, feedback & polish, editor conveniences, session & habits), each slotted into the existing Phase 0–4 rollout rather than bolted on, each registered as a first-class command, and each accepted by a **replay assertion** in `tools/check.js`.

Ground rules from the interview: **fix first, then QoL**; `progress.json` stays byte-compatible; all new UI state lives outside the progress schema; the classic UI keeps working as the default entry until the Phase 4 cut-over.

---

## 2. Interview Decisions (definitive)

| # | Question | Decision |
|---|---|---|
| 1 | Spec shape | **Combined spec** — error-fix list and QoL features, prioritized together |
| 2 | Relation to the Ink overhaul plan | **Fold into phases** — QoL must fit inside the existing Phase 0–4 rollout |
| 3 | Error-fix severity bar | **All user-visible** — crashes, wrong behavior, wrong colors, dead keys, misleading hints |
| 4 | QoL themes in scope | **All four**: speed & navigation, feedback & polish, editor conveniences, session & habits |
| 5 | Resume UX | **Home + RESUME row** — pinned resume row upgraded; Enter launches it in one keystroke |
| 6 | Autosave | **Both worlds** — debounced live save (~1 s after typing stops) **plus** a checkpoint snapshot before every check run |
| 7 | Code formatting | **Suggest only** — never auto-apply; a note offers a keybind/palette format command |
| 8 | Daily goal mechanic | **Challenges per day** (not minutes) with a dashboard progress bar |
| 9 | Checkpoint retention | **Last 10 snapshots + one daily "best" autosnapshot**, pruned automatically on write |
| 10 | Fix workflow | **Fix first, then QoL** — stabilization pass precedes all QoL work; new-layer bugs fixed immediately |
| 11 | Session wrap | **On-quit recap** |
| 12 | Discoverability | **Palette-first** — every new action is a registry command; palette is the discovery surface |
| 13 | Check-failure feedback depth | **Jump-to-line** — failure messages link to a line; jump moves the caret (via the grader diagnostic seam) |
| 14 | Habit pressure | **Banner + milestones** — at-risk-streak banner (once/day) plus milestone celebrations (7/30/100 days, new best) |
| 15 | Word wrap | **Soft-wrap viewport** — proper visual wrap with logical lines preserved and real cursor math on wrapped rows |
| 16 | Quit interaction | **Instant quit + print** — `q` quits immediately; the recap prints to the normal terminal after exit |
| 17 | Audit confidence handling | **Verified + flagged** — confirmed findings with `file:line`; suspected ones marked verify-then-fix with repro steps |
| 18 | Goal default for new learners | **3 challenges/day**, never forced; mentioned once in the tour; changeable/disable-able in settings |
| 19 | Command registry timing | **Registry in Phase 0** — a new task wires ~30 existing actions into the registry skeleton; QoL commands register from day one |
| 20 | Verification bar | **Replay asserts** — `tools/check.js` grows a "QoL contract" section driving each feature headlessly and asserting the outcome |

---

## 3. Error Analysis — Stabilization Pass

### 3.1 Confirmed findings (fix immediately, before any QoL work)

> **Status (2026-09-14, stabilization pass executed):** E1 FIXED (grey loop scans all 24 entries; regression `tests/unit/hexTo256.test.js`, 5/5 green). E2 FIXED (hint now `s`→settings; the mislabeled `s`→progress also corrected; protected by the registry spot-check in check section 5). E3 FIXED (spikes compile only with `npm run build -- --spike`). E4 FIXED (see row). S1 CLEARED (verified working end-to-end: `previewParts` already feeds inline scripts into the console sandbox; `hi()` → `42`). S2 FIXED (`absWorkingDir` in the watch branch). S3 CLEARED for key accuracy — every documented key is real; the real gap was two *undocumented* features (palette, multi-file tab switching), now added to help; future drift is linted by check section 5. S4 CLEARED (cyclic values stringify to `""` — cosmetic empty display, no crash; a future nicety could render `[Circular]`).



| ID | Finding | Location | Effect | Fix |
|---|---|---|---|---|
| **E1** | ✅ FIXED — `hexTo256` grey-ramp scan broke early; now scans all 24 entries | `src/ui/theme/index.js` | Tier B (256-color) panels/borders/code backgrounds rendered darker than intended | Fixed + regression `tests/unit/hexTo256.test.js` (dark/mid/light greys, cube-vs-ramp precedence) |
| **E2** | ✅ FIXED — home footer hint now `['s', 'settings']`; the wrong `s`→progress label corrected to settings | `src/app.js` → `footerHints()` | Learners looked for a "settings" key that did not exist | Fixed; protected by registry spot-check (`s` on home → `home.openSettings`) in check section 5 |
| **E3** | ✅ FIXED — spike entries compile only with `npm run build -- --spike`; default builds ship `dist/main.js` alone | `esbuild.config.mjs` | Build noise and dead artifacts in every build | Fixed and verified both build modes |
| **E4** | Competing Ctrl+C paths in the next UI: `exitOnCtrlC: true` lets Ink unmount on Ctrl+C, but `process.stdin.resume()` (added to hold the loop open) is never paused on Ink's own exit path — risk of a lingering/zombie process after Ctrl+C on a real TTY | `src/main.jsx` (Phase 0 frame) | After Ctrl+C the terminal may not return cleanly | **VERIFIED CONFIRMED on pty** (raw `\x03` byte → Ink unmounted but node lingered until stdin EOF) and **FIXED**: `exitOnCtrlC: false`, app watches for the `\x03` byte + SIGINT in one cleanup path (pause stdin → unmount → explicit `process.exit` after the restore write flushes). Regression: `bash tools/repro-e4.sh` (delayed-byte injection + mid-flight process check; elapsed-time measurement is invalid because the feeding pipeline outlives the app) |

**E4 reproduction step:** `script -q -c "env FULLSTACK_UI=next node bin/fullstack.js" /tmp/x.txt`, send Ctrl+C (`\x03`) via the pty, then check whether the node process exits (`pgrep -f fullstack`). Record result, then apply the fix and re-run.

### 3.2 Suspected findings (verify-then-fix in the same pass)

> **Status:** S1 ✅ CLEARED · S2 ✅ FIXED · S3 ✅ CLEARED (+docs gap fixed) · S4 ✅ CLEARED — details below.

| ID | Suspicion | Location | Verification step | If confirmed |
|---|---|---|---|---|
| **S1** | ~~Suspected~~ **CLEARED**: single-file markup console scripting works — `previewParts` already extracts inline `<script>` blocks; end-to-end repro (`hi()` → `{"value":42}`, error null) | `src/app.js` → `runConsole()` | Verified by direct sandbox repro (2026-09-14) | None needed; the synthesis path and this path share `previewParts`/`synthesisParts` correctly |
| **S2** | ~~Suspected~~ **FIXED**: watch branch now passes `absWorkingDir: here` | `esbuild.config.mjs` | Code inspection confirmed the gap | Fixed in the same pass |
| **S3** | ~~Suspected~~ **CLEARED with a docs fix**: every help-documented key is real; the actual drift was two undocumented features — command palette (Ctrl+P) and multi-file tab switching (Ctrl+Q/W) — now added to help | `src/views/help.js` | Key-by-key diff against handler map | Fixed; future drift linted by check section 5 |
| **S4** | ~~Suspected~~ **CLEARED**: cyclic structures stringify to `""` (JSON.stringify throws → `String(v)` fallback → empty); cosmetic, never crashes | `src/core/runner.js` `stringify` | Repro: `stringify(cyclicArray)` → `""`, no exception | Optional nicety logged: render `[Circular]` instead of `""` |

### 3.3 Reconciliation with overhaul-spec §3.2

Known issues already logged in the overhaul spec are **not** duplicated as fixes here; their disposition:

- Fixed **now** because they are user-visible bugs on classic: footer/hint drift (E2/S3), console scripting (S1).
- Remaining **rewrite deliverables** (already scheduled): no undo/selection/clipboard, no mouse, 256-color ceiling, key conflicts, escape-split misparse, naive positional `diffCode`, paste corruption, `state.editor` duality — owned by overhaul Phases 0–2 (see Appendix E task 2.9's LCS DiffView, §A.3 input pipeline, etc.).

### 3.4 Sequencing rule

**Stabilization first**: E1–E4 + S1–S4 land as one pass with tests before any §4 feature work. New-layer bugs discovered later follow "fix immediately" (decision #10), never queue behind QoL.

---

## 4. QoL Features

Every feature below: behavior, data, phase slot, and its replay assertion (decision #20). All new actions are **registry commands** from day one (decision #19).

### 4.1 Data & compatibility rules (apply to everything below)

- `.data/progress.json` schema untouched. One **additive** `Store` method allowed: `saveDraft(id, code)` which writes `challenges[id].lastCode` *without* incrementing attempts or touching streaks (old app versions read `lastCode` fine).
- All new UI state (goal config, milestone-seen flags, banner dismissals, palette recents) lives in `.data/settings.json` (schema already defined in overhaul §11.2) — extended here with `goal`, `milestonesSeen`, `bannerDismissedOn`, `palette.recent`.
- Checkpoints live in **sidecar files**: `.data/history/<lessonId>.<challengeId>.json` — never inside `progress.json`.

### 4.2 Speed & navigation

| Feature | Behavior | Phase | Replay assert |
|---|---|---|---|
| **Q1. Resume row v2** | Dashboard's resume row becomes the pinned first row: `Resume ▸ <module> › <lesson> › <challenge> (<n> checks passed, last attempt <rel time>)`. `Enter` on home (menu focus) opens it directly; `r` is the explicit keybind. Falls back to "Start here ▸" for brand-new learners | 1 | Replay: seed store with an in-progress challenge → launch → press Enter → assert `challenge` screen open with the right challenge id |
| **Q2. Palette recents + next-up** | Palette gains a "Recent" section (last 5 opened challenges, stored in `settings.palette.recent`, MRU-updated on open) and a "Go to next unpassed" command (`nav.nextUp`) | 1 | Replay: open two challenges, open palette, assert recents order; assert next-up command lands on the first unpassed challenge |
| **Q3. List endpoints** | `g`/`G` jump to first/last item on all lists (already specified as `nav.first`/`nav.last` in overhaul Appendix B.2 — carried into the registry skeleton so they exist from Phase 0) | 0 | Registry smoke: `g`/`G` resolve on home/module lists in replay |

### 4.3 Feedback & polish

| Feature | Behavior | Phase | Replay assert |
|---|---|---|---|
| **Q4. Jump-to-line failures** | Phase 1 (classic): failed-check messages gain `→ line N` text when the grader's check carries a range (additive seam, overhaul §5.4 item 2; graders without ranges unchanged). Phase 2 (new editor): pressing Enter/`jump` on a failed check moves the caret to that line and flashes the gutter | 1 (text) / 2 (caret jump) | Phase 2 replay: craft failing check with range → assert `editorCursorPos` lands on the range's line after jump |
| **Q5. Milestone celebrations** | One-time toasts + a dashboard flourish for: streak 7/30/100, new personal best streak, module completion 25/50/75/100%. Seen-milestones tracked in `settings.milestonesSeen` (id-keyed) so each fires exactly once | 1 | Replay: seed store at streak 6, simulate a pass crossing 7 → assert toast shown once; re-run → assert not shown again |
| **Q6. At-risk streak banner** | If the streak ≥ 2 and no challenge passed today, one dismissable banner per day on the dashboard: "⚑ 3-day streak at risk — one challenge keeps it alive". Dismissal recorded per-day (`settings.bannerDismissedOn`) | 1 | Replay: seed streak/no-today-activity → assert banner row present; simulate dismissal keypress → assert gone, next-day state re-shows |
| **Q7. Richer check output** | Results header gains: check counts (passed/total), run duration, and micro-notes when notable ("first attempt, no hints", "new best: 8/8") — derived from existing `attempts`/`hintsUsed` records | 1 | Snapshot of the results pane with seeded records |
| **Q7 (shipped)** | ✅ `src/core/checkNotes.js` — header shows `passed/total · <duration>`, then mentor micro-notes: an exception in the console first (nothing else can be trusted past it), identifiers a failing message names that are *not* in the buffer (`class="card"` counts for `.card`), an untouched starter, and an honesty note when hints/the solution were used. `tests/unit/checkNotes.test.js` + check §8 | — | done |

### 4.4 Editor conveniences

| Feature | Behavior | Phase | Replay assert |
|---|---|---|---|
| **Q8. Debounced autosave** | ~1 s after typing stops, editor contents → `Store.saveDraft(id, code)` (no attempt bump). Multi-file: drafts per file. Crash-safe: lastCode always ≤ 1 s stale | 1 (classic too — store-level) | Replay: type, advance fake clock past debounce, assert `challengeRecord(id).lastCode` matches buffer; kill mid-typing → assert pre-debounce value intact |
| **Q9. Checkpoints** | Before every check run, snapshot the buffer(s) into the challenge's sidecar history. Retention: last **10** snapshots + one daily "best" autosnapshot (first passing state of the day), pruned on write (decision #9). Palette command `history.restore` lists snapshots (timestamp, size, passed?) and restores into the editor (one undo step) | 1 | Replay: run check 12 times with edits → assert sidecar holds 10 + daily-best entries; restore one → assert editor text equals the snapshot |
| **Q10. Format (suggest only)** | Never auto-applies (decision #7). If a check run produces a buffer whose formatted form differs, show a one-line note (rate-limited: once per challenge per session): "Code differs from formatted style — ^F format". Format command (`editor.format`) normalizes indentation (2-space), trailing whitespace, and blank-line runs for js/css/html | 1 (classic editor via palette+key) | Replay: messy buffer → check → assert note shown once, buffer byte-identical; run format → assert normalized |
| **Q10 (shipped)** | ✅ A check run compares the buffer with `formatCode(...)` and sets a one-line suggest-only note (`state.formatHint`, cleared by a successful format, reset with the challenge); the buffer is byte-identical after the run. `Ctrl+F` now falls back to whole-document formatting for js/html/json — `formatCodeAt` is CSS-only, so the key previously answered "couldn't format safely" on valid markup. check §8 | — | done |
| **Q11. Soft-wrap viewport** | Proper soft wrap (decision #15): long logical lines render across multiple screen rows; logical line numbers preserved; cursor math operates on wrapped rows (up/down by screen row, goal-column kept); wrap column = pane width; recomputed on resize. Requires the new editor engine's screen-line model: each logical line → list of (startCol, endCol) segment pairs | 2 (Appendix E task 2.8 addendum) | Unit: wrap a 200-col line at width 40 → segment math correct at boundaries (words, wide chars); replay: navigate down through a wrapped region → caret follows screen rows |
| **Q12. Small editor QoL** | Bracket-match jump `%` (already in registry B.5), tab-size setting honored (2 default), visible-bell on attempt to edit read-only views | 2 | Unit tests on the new editor model |
| **Q12 (shipped, classic halves)** | ✅ `src/core/brackets.js` matches `()[]{}` with strings/comments masked (`tests/unit/brackets.test.js`); the setting is honoured by Tab, auto-indent and backspace (Settings → Tab size cycles 2/4/8, `tests/unit/editor.test.js`); ignored keys on scroll screens answer with a visible note. The `%` *binding* is palette-only until the Phase 2 vim editor — the classic editor is modeless, so `width: 50%` must stay typable | — | done |

### 4.5 Session & habits

| Feature | Behavior | Phase | Replay assert |
|---|---|---|---|
| **Q13. On-quit recap** | `q`/Ctrl+C quits instantly (decision #16); after the alt screen tears down, print to the normal terminal: session time, challenges passed this session (ids), checks failed, streak line ("streak 4 days · best 9"), goal progress ("goal 2/3 today"), and a next-up suggestion (resume target). Implemented in the classic exit path now; the next UI reproduces it at cut-over | 1 | Replay: run a scripted session (pass 1 challenge, 2 min fake time), quit → assert recap text contains the challenge id and streak line |
| **Q13 (shipped)** | ✅ `src/core/recap.js` (`buildRecap`, `tests/unit/recap.test.js`) + `App.recapLines()/printRecap()`: `quit()` flushes the timer, tears the alt screen down, then prints dimmed rows (time · passed with overall progress · failed checks · streak + today's goal · next up). Prints once per session and only on a TTY; an idle session gets one friendly line. check §8 | — | done |
| **Q14. Daily goal (challenges)** | `settings.goal.daily` default **3** on fresh installs (0 = off), changeable in settings, mentioned once in the tour (decision #18). Dashboard shows a goal bar: "Goal 2/3 challenges today" (counts challenges *first passed today*; re-passes don't count). Reaching the goal triggers a single celebratory note (ties into Q5's toast system); the at-risk banner (Q6) references the goal when set | 1 | Replay: seed 2 passed today + goal 3 → pass one more → assert goal-complete note fired once; assert bar math on dashboard snapshot |

### 4.6 Discoverability rule (decision #12)

Every feature above registers a command (ids: `nav.resume`, `nav.nextUp`, `history.restore`, `editor.format`, `settings.goalSet`, `session.recap`…), so the Phase 1 palette surfaces them with keybinds and icons. Footer stays minimal; the palette is the catalog.

---

## 5. Registry timing amendment (decision #19 → overhaul Appendix D change)

**New Phase 0 task 0.7a** (inserted after 0.7, size M):

- Build the registry skeleton (`src/ui/commands.js`) and wire **~30 existing classic actions** (nav, lesson, challenge, browser, settings — per overhaul Appendix B) to their current classic handlers, so ids exist before screens migrate.
- All §4 QoL commands register against this skeleton from day one, with their `keymap.json` defaults landed immediately.
- `tools/check.js` gains the keymap lint (E2/S3 depend on it) as part of this task.

This makes the QoL work rewrite-proof: features are registered commands, consumed by whichever UI is live.

---

## 6. QoL contract in `tools/check.js` (decision #20)

New section after the existing ones:

1. **Feature replays** — one scripted replay per §4 feature (tables in 4.2–4.5) running the real App headless with a fake clock; each asserts its outcome. Failing any replay fails the check run.
2. **Binding lints** — footer keys ⊆ bindings (E2), help keys ⊆ bindings (S3), registry conflicts ⊆ allowed set (overhaul B.8).
3. **Data-compat guard** — after a full replay session, assert `progress.json` round-trips through the *classic* `Store.load()` shape (no new keys, `version: 1`).

---

## 7. Sequencing (merged timeline)

| Step | Content | Gate | Status (2026-09-14) |
|---|---|---|---|
| **0. Stabilization** | E1–E4 + S1–S4 (§3), with tests/repro notes | `npm run build && npm test && npm run check` green; E4 pty repro resolved | ✅ done — E1–E4 fixed (E4 regression-covered by `tools/repro-e4.sh`), S1/S3/S4 cleared, S2 fixed |
| **Phase 0 (+0.7a)** | Registry skeleton + QoL command registration; Q3 endpoints live | Registry smoke replays green | ✅ done — 46 ids + conflict lint; Q1/Q5/Q6/Q8/Q14 replays green; settings store shipped |
| **Phase 1 (+QoL)** | Q1, Q2, Q4 (text), Q5, Q6, Q7, Q8, Q9, Q10 (classic), Q13, Q14; palette consumes registry | Full QoL contract green on classic | ✅ classic scope done — Q1–Q10 and Q13/Q14 all shipped with unit + replay coverage (check §6/§8): recents MRU, `nav.nextUp`, `g`/`G` endpoints, `→ line N` + caret jump, milestones, banner, autosave, checkpoints + `history.restore`, goal bar, Q7 run timing + micro-notes, Q10 suggest-only format note, Q13 on-quit recap. The palette now renders the *same* item list the cursor selects from. Remaining Phase 1 work is the Ink port (palette/tour screens), not these behaviours |
| **Phase 2 (+QoL)** | Q4 (caret jump), Q11 soft-wrap (Appendix E 2.8 addendum), Q12 | Phase 2 gate + soft-wrap unit/replay | ◐ Q4 caret jump (`Ctrl+J`), Q11 soft-wrap and the classic halves of Q12 shipped with unit + replay coverage (`src/core/softwrap.js`, `src/core/brackets.js`, `tests/unit/softwrap.test.js`, `tests/unit/brackets.test.js`, `tests/unit/editor.test.js`, check §3/§8, Settings → Wrap / Tab size). Q12's `%` binding is deliberately palette-only until the new editor engine (the modeless classic editor must keep typing `50%`); `editor.bracketMatch` exists, is tested, and is reachable from the palette |
| **Phase 4** | Recap & toasts reproduced on the Ink UI at cut-over; flourishes (decoration tier) for Q5 | Cut-over checklist includes QoL parity | ☐ pending — see also docs/multimedia.md for M0–M2 flourishes (OSC 8 links, bell, cursor shapes, notifications, optional inline screenshots) |

---

## 8. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Autosave writes race with check runs | `saveDraft` skipped while a check/evaluation is in flight; checkpoints are the durable pre-check state anyway |
| Sidecar history grows unbounded across many challenges | 10+1 per challenge is bounded; add a `history.purge` palette command; prune runs on write |
| Milestone flags in `settings.json` lost if users delete settings | Acceptable: milestones re-fire once (a celebration, not data); progress.json untouched by design |
| Soft-wrap cursor-math regressions corrupt editor feel | Feature-flagged (`editor.wrap: true` default off→on after replay suite proves boundary cases: wide chars, tabs, zero-width joins) |
| Recap printing after alt-screen exit can interleave with shell prompt | Print recap only after `?1049l` write flushes (already synchronous on stdout); keep to ≤ 8 lines |
| QoL work delays the rewrite | Every QoL item is phase-slotted and registry-based; nothing blocks Phase 0/1 milestones already planned |

---

## 9. Acceptance Criteria

<!-- 2026-09-14: multimedia feasibility assessed — see docs/multimedia.md. Audio/video ruled out; M0 primitives (links, bell, cursor, notify) and M1 probe plan shipped in src/ui/multimedia.js. -->

- [ ] Stabilization pass: all E-items fixed with tests; all S-items verified (fixed or documented not-a-bug with evidence).
- [ ] No footer/help hint names a nonexistent key (lint-enforced).
- [ ] Default build contains no spike artifacts.
- [ ] Ctrl+C from the next UI exits cleanly on a real pty (no lingering process) — regression-checked by `tools/repro-e4.sh`.
- [ ] Every §4 feature has a green replay assertion in the QoL contract section.
- [x] `progress.json` remains schema-identical after exercising every QoL feature (compat guard).
- [x] Checkpoint sidecars never exceed 10 + 1 entries per challenge; restore round-trips byte-exact (check §6 Q9 replay + `tests/unit/history.test.js`).
- [ ] Dashboard shows resume row, goal bar, and streak state; banner and milestones each fire at most once per their rules.
- [ ] Recap prints on quit with correct session data; quitting stays instant.

---

# Appendix A — Checkpoint Sidecar Format & Prune Algorithm (Q9)

**File:** `.data/history/<lessonId>.<challengeId>.json` (one sidecar per challenge, created lazily on first checkpoint; deleted files lose only checkpoints — the classic app ignores the directory entirely).

```jsonc
{
  "version": 1,
  "challengeId": "02-javascript.functions.arrow-functions",
  "updatedAt": "2026-09-14T12:00:00.000Z",
  "snapshots": [
    {
      "id": "s-20260914T115812444Z",
      "at": "2026-09-14T11:58:12.444Z",
      "kind": "check",              // "check" | "daily-best" | "manual"
      "passed": false,               // null when unknown (manual)
      "files": { "index.html": "…", "style.css": "…" },  // byte-exact, every tab
      "meta": { "attemptNo": 7, "checksPassed": 5, "checksTotal": 8 }
    }
  ],
  "dailyBest": { "day": "2026-09-14", "id": "s-20260914T100301111Z" }
}
```

**Kinds:** `check` — automatic snapshot taken immediately before every `challenge.check` run (the pre-check state); `daily-best` — the **first passing** snapshot of each day, promoted automatically; `manual` — reserved for a future palette "snapshot now" command.

**Prune algorithm (runs on every write, then atomic tmp+rename like `Store.save`):**
1. Append the new snapshot (newest first in `snapshots`).
2. Keep at most the **10 most recent `check` snapshots** (decision #9's ring).
3. `daily-best`/`manual` snapshots are **never evicted** by the ring; a new passing snapshot promotes to `dailyBest` only if no entry exists for today (first passing state of the day wins, later ones stay as ordinary ring entries).
4. Drop every snapshot older than 30 days, including promoted ones.
5. Size guard: if one snapshot exceeds 256 KB (runaway paste), keep the newest 3 entries total and set `"truncated": true` on the file.

**Restore (`history.restore` palette command):** list = dailyBest (badge ★) + ring, labeled with relative time, kind, and `checksPassed/Total`; selecting one applies `setTextAt` per file (caret at 0/0), wrapped as **one undo transaction**; restoring never touches `attempts`, streaks, or `lastCode`. A restored buffer is itself snapshotted on the next check like any other state.

**Multi-file:** the `files` map captures every open tab byte-exact; restoring into a challenge whose file set changed since (content updates) restores only matching filenames and notes the rest.

---

# Appendix B — Soft-Wrap Screen-Line Model (Q11)

Wrap is a **view concern**: edit operations remain purely logical (single `applyEdit` chokepoint); only the caret/selection mapping layer knows about screen rows.

**Data structures:**
- `viewLines`: materialized screen rows, derived per logical line `i` as `segments = wrapSegments(lineText, width)` → `[{startCol, endCol}]` (endCol exclusive). Each segment renders as one view row `{ line: i, startCol, endCol, cont: n>0 }`.
- Cache key per logical line: `(revision, width, tabSize)` — an edit re-wraps only the changed line; a single line's re-wrap never reflows others; materialization touches only visible lines ±1 logical line.
- Wrap width = pane content width (borders + gutter subtracted); recomputed on resize and pane drag.

**Wrap rules:** break at whitespace runs; hard-break words longer than the width at wcwidth boundaries; tabs expanded per `tabSize` before measuring; zero-width characters (combining marks) attach to the previous cell and never start a row; wide (CJK/emoji) characters never straddle the boundary — they move whole to the next row.

**Cursor mapping:**
- Logical `(row, col)` → view row via prefix sums of segment counts per line; caret drawn at `(viewRow, col − startCol)`.
- Screen up/down move **view rows**; the logical `(row, col)` derives from the target view row's segment plus the **sticky goal column** (kept across vertical moves, reset by explicit horizontal motion) — matching every mainstream editor.
- Home/End and vim `0`/`$` act on the **logical** line (first/last segment). Selections are logical ranges (anchor/head) rendered across as many view rows as they span. Mouse click maps view row → logical `(row, col)` via `startCol + offset`.
- Vertical scrolling and `ensureVisible` operate on view rows; the gutter shows the logical line number on a line's first segment and a continuation marker (blank pad or `⌎`) on the rest.

**Boundary cases (unit-mandated before the flag defaults ON):** line exactly `width` cells; single word longer than `width`; consecutive spaces at the wrap point; wrap inside a word with trailing punctuation; wide char at `width−1`; combining char at boundary; tab at boundary; empty lines; trailing newline; wrap column 1 (degenerate). Feature flag `editor.wrap` (settings §11.2 of the overhaul spec) defaults ON only after the replay suite proves this set; OFF falls back to today's horizontal scroll.

---

# Appendix C — Registry Wiring Table (overhaul task 0.7a)

The ~33 actions below are wired into `src/ui/commands.js` in task 0.7a so ids exist before screens migrate. In the classic UI, handlers stay hardcoded until cut-over; the registry is the source of truth for the keymap lint, `keymap.json` overrides, palette data, and docs from day one.

## Global

| Command id | Classic handler (today) | Default keys |
|---|---|---|
| `app.quit` | `App.quit()` + `q` char check | `<C-c>`, `q` |
| `app.back` | `pop()` (Esc handlers) | `<Esc>` |
| `app.help` | `push('help')` | `?` |
| `app.repaint` | `invalidate()+render()` | `<C-l>` |
| `app.palette` | palette branch of `onKey` | `<C-k>` (works Phase 1) |

## Navigation & home

| Command id | Classic handler | Default keys |
|---|---|---|
| `nav.up` / `nav.down` | `isUp`/`isDown` branches | `<up>`/`k`, `<down>`/`j` |
| `nav.pageUp` / `nav.pageDown` | `pageup`/`pagedown` branches | `<PageUp>`/`<PageDown>` |
| `nav.first` / `nav.last` | *(new — Q3)* | `g` / `G` |
| `nav.select` | `enter` branches | `<CR>` |
| `home.openModule` | `openModule(cursor)` | `<CR>` on home list |
| `home.openProjects` | `p` in `menuKey` | `p` |
| `home.openSettings` | `s` in `menuKey` | `s` |
| `nav.resume` | *(new — Q1)* | `r` (home) |

## Module & lesson

| Command id | Classic handler | Default keys |
|---|---|---|
| `module.openLesson` | `moduleKey` enter | `<CR>` |
| `lesson.scrollUp` / `lesson.scrollDown` | `lessonKey` up/down | arrows, `k`/`j` |
| `lesson.focusNext` / `lesson.focusPrev` | `lessonKey` tab/shift-tab | `<Tab>`/`<S-Tab>` |
| `lesson.openChallenge` | `lessonKey` enter | `<CR>` |
| `lesson.markRead` | `m` handler | `m` |
| `lesson.next` | `n` handler | `n` |
| `nav.nextUp` | *(new — Q2)* | palette (Phase 1) |

## Challenge & editor

| Command id | Classic handler | Default keys |
|---|---|---|
| `challenge.check` | `checkChallenge` | `<C-s>`, ex `:w` |
| `challenge.reset` | `resetChallenge` | `<C-r>` |
| `challenge.hint` | `revealHint` | `<C-h>` |
| `challenge.solution` | `<C-g>` toggle | `<C-g>` |
| `challenge.copySolution` | `y` in solution view | `y` |
| `challenge.preview` | `openPreview` | `<C-p>` |
| `challenge.browser` | `openBrowser` | `<C-b>` |
| `challenge.save` | `saveToWorkspace(true)` | `<C-o>` |
| `challenge.externalEditor` | `openInEditor` | `<C-e>` |
| `challenge.logs` | `<C-t>` toggle | `<C-t>` |
| `editor.tabNext` / `editor.tabPrev` | `switchEditorTab(±1)` | `<C-w>` / `<C-q>` |
| `editor.completionTrigger` | `refreshCompletion(true)` | `<C-space>` |
| `history.restore` | *(new — Q9)* | palette (Phase 1) |
| `editor.format` | *(new — Q10)* | `<C-f>` (classic interim), palette |
| `editor.jumpToLine` | *(new — Q4)* `jumpToFailedCheck` | `<C-j>` |
| `editor.bracketMatch` | *(new — Q12)* `jumpToMatchingBracket` | palette only in the classic editor; `%` with the Phase 2 vim engine |

## Browser

| Command id | Classic handler | Default keys |
|---|---|---|
| `browser.close` | `browserKey` esc/Ctrl+B | `<Esc>`, `<C-b>` |
| `browser.tabNext` / `browser.tabPrev` | `browserKey` tab/shift-tab | `<Tab>`/`<S-Tab>` |
| `browser.jumpTab1..5` | `1`–`5` chars | `1`–`5` |
| `browser.consoleRun` | `consoleKey` enter | `<CR>` (console tab) |

**Lint rules enforced from 0.7a** (overhaul §13.4 + this spec §3.1 E2): every footer/help key token must resolve to a registered `(id, mode, when)`; no two commands share a `(binding, mode, when)` triple; unknown ids in `keymap.json` warn once. New QoL commands (`nav.resume`, `nav.nextUp`, `history.restore`, `editor.format`, `session.recap`, `settings.goalSet`) register here too, keyed to their §4 phase work.
