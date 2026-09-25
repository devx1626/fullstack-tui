#!/usr/bin/env bash
# E4 regression check (errors-and-qol-spec.md §3.1): Ctrl+C (raw ^C byte) must
# fully exit the FULLSTACK_UI=next app — Ink unmount, alt-screen restore, and
# NO lingering node process — even while stdin stays open.
#
# Methodology:
#   - The ^C is injected only after the app has ACTUALLY booted: the harness
#     waits for the alternate-screen engage (?1049h) in the pty typescript
#     before sending the byte. A byte sent during module import hits node's
#     default SIGINT (exit 130, no handler, no restore) and tests the kernel,
#     not the app — the original fixed `sleep 3` did exactly that once the
#     pre-flip double-bundle boot outgrew it (~6.6s and variable).
#   - The verdict is a MID-FLIGHT process check 2s after the byte while stdin
#     is still held open, plus a typescript scan for the ?1049l restore write.
#
# Verdict (exit code):
#   0 = app exited within 2s of the ^C byte            (E4 CLEARED)
#   1 = app still alive 2s after the ^C byte, or no restore (E4 CONFIRMED/PARTIAL)
#   2 = harness failure
set -u

command -v script >/dev/null 2>&1 || { echo "HARNESS: script(1) missing"; exit 2; }
command -v node   >/dev/null 2>&1 || { echo "HARNESS: node missing"; exit 2; }

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
[ -f dist/main.js ] || npm run --silent build >/dev/null 2>&1 || { echo "HARNESS: build failed"; exit 2; }

exec node tools/repro-e4.mjs
