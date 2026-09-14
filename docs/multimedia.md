# Multimedia in fullstack-tui — feasibility analysis

**Question:** can the TUI integrate multimedia (images, audio, richer visual feedback)?
**Short answer:** yes for still images, links, notifications, and sub-part styling on capable
terminals; no for audio playback and video — and the app's zero-dependency + graceful-degrade
rules decide *how* we do it. Shipped already: `src/ui/multimedia.js` (pure byte builders,
12 unit tests).

## 1. What the terminal can and cannot do

A terminal is a text grid with escape sequences. There is no standard "play a sound" or
"draw a video" API. What exists is a patchwork of per-terminal protocols:

| Capability | Protocol | Support (2026) | Verdict |
|---|---|---|---|
| Inline **still images** | kitty graphics protocol | kitty, WezTerm, Ghostty | ✅ viable, probe-gated |
| Inline **still images** | iTerm2 `1337;File` | iTerm2, WezTerm, Ghostty, Konsole | ✅ viable, probe-gated |
| Inline **still images** | sixel (`ESC P…`) | foot, WezTerm, contour, mlterm, Windows Terminal (recent), xterm (opt-in build) | ⚠️ viable but fragmented |
| **Clickable links** | OSC 8 | all modern terminals (ignored as plain text elsewhere) | ✅ universal, zero risk |
| **Desktop notifications** | OSC 9 / OSC 777 | iTerm2, Windows Terminal, kitty-likes / rxvt-likes | ✅ best-effort, harmless if ignored |
| **Cursor shapes** (vim mode affordance) | DECSCUSR | universal | ✅ zero risk |
| **Fancy underline** (error squiggles) | SGR 4:3 curly underline | modern terminals; older ones show plain underline | ✅ progressive enhancement |
| **Audio feedback** | BEL only | universal | ⚠️ see §5 |
| **Audio playback / TTS** | none | — | ❌ not feasible in-band |
| **Video / animation** | none (kitty animates images only) | — | ❌ out of scope |
| **Fonts** (icon fonts etc.) | none — Nerd Fonts are a *user* install | — | ⚠️ already specced (§7 degrade tiers) |

Key insight: everything marked ✅ is *escape-sequence output* — bytes we can emit and unit-test
without a terminal, exactly like the existing color layer.

## 2. The three-tier multimedia model (fits the existing §7.1 degrade matrix)

- **M0 — universal (all tiers, including D):** OSC 8 doc links on lesson text
  (`mdnLink()`), BEL on check-complete, DECSCUSR block/bar cursor synced to vim mode,
  OSC 9/777 notification when a long check finishes while the terminal is unfocused.
- **M1 — graphics (probe-gated):** inline previews in the challenge screen. The killer use
  case for this app: the **Render tab shows an actual screenshot of the learner's HTML** by
  driving a headless browser (Playwright, already-sketchable in Node ≥20) → PNG →
  `iterm2Image()`/kitty protocol → inline image. Degrades to the existing ASCII preview on
  terminals without graphics. Probe design in §4.
- **M2 — styling (env-gated):** SGR 4:3 curly underlines under failing grader tokens in the
  editor, in addition to the existing jump-to-line line marker.

## 3. Integration points (minimal, behind flags)

1. `browser.js` Render tab → "screenshot" action (M1): only in the *next* UI, opt-in
   (`FULLSTACK_SCREENSHOT=playwright`), lazy-requires Playwright, shows a graceful
   "playwright not installed — npx playwright install" panel otherwise. The classic UI is untouched.
2. Lesson content authors get `{{link:mdn:Web/HTML|MDN}}` inline tokens → OSC 8 at render time (M0).
3. Vim mode toggles `cursorShape.block/bar` on mode change (M0; combined with the mode
   indicator the spec already requires).
4. Grader failure markers use `squiggle()` on Tier A/B/C with fallback to plain `^` carets (M2).

All four are additive, flag-gated, and degrade to current behavior. No persistence changes.

## 4. The probe problem (honest capability detection)

Env heuristics (`graphicsFromEnv()`) are indicative, not authoritative — `TERM_PROGRAM`
spoofs, SSH strips env, tmux mangles protocols. The spec's rule stands: **probe, don't guess**.

Planned Phase 1 probe (task `m1-probe`, ~60 lines):
1. Before the dispatcher claims raw stdin, write the kitty graphics query
   (`\x1b_Gi=31,s=1,v=1,a=q,t=d,f=24;AAAA\x1b\\`) and a DA1 request (`\x1b[c`).
2. Read the response with a 100 ms timeout using the **existing input pipeline**
   (`MouseParser.rawPassThrough` already passes unknown bytes through — kitty responses
   arrive as `{type:'bytes'}` events).
3. kitty responds with a graphics ack; DA1 response shapes discriminate sixel (`;4;` in DA1
   attributes) and other features. No response → assume none.
4. Cache the result in `capabilities.js` (`caps.graphics = { protocol, sixel, kitty }`).

Risk: probing at startup costs ≤100 ms and can confuse exotic terminals. Mitigation: probe
only when `graphicsFromEnv()` says *maybe* (never probe under `NO_COLOR`, CI, or dumb TERM),
and make the timeout path the default-assume-nothing path.

## 5. What "audio" realistically means (and why playback is out)

- **BEL is the only in-band audio channel.** It's a single byte, no volume control, and most
  terminals map it to a visual flash by default. We emit it on check completion (M0) and
  expose a `settings.sound = 'off'|'bell'` switch — that's the honest ceiling.
- **Playback (mp3/wav/tts) has no terminal protocol.** Anything real means spawning an
  external player (`paplay`, `afplay`, `powershell`…), detecting one, shipping audio assets —
  an OS-integration project with a poor dependency/robustness trade for a learner TUI. The
  spec's zero-dependency and graceful-degrade rules say no. If ever wanted, the seam is the
  same one notifications use: a `notify()`-style builder plus a settings switch.
- Celebration "juice" (the actual QoL goal behind audio) is better served by what the
  terminal *does* support: the milestone banner (Q5), inverse-video flashes, and the
  existing meter/badge chrome.

## 6. Recommendation

Adopt M0 now (zero risk, all environments), build the M1 screenshot-preview slice behind
`FULLSTACK_SCREENSHOT=playwright` as a Phase 1 stretch task, add M2 squiggles when the editor
port lands (Phase 2), and skip audio playback/video permanently. The multimedia layer stays
pure-function byte builders — unit-testable, degrade-first, and consistent with everything
else in the overhaul.
