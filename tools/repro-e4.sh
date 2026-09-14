#!/usr/bin/env bash
# E4 regression check (errors-and-qol-spec.md §3.1): Ctrl+C (raw ^C byte) must
# fully exit the FULLSTACK_UI=next app — Ink unmount, alt-screen restore, and
# NO lingering node process — even while stdin stays open.
#
# Methodology (learned the hard way, see docs/ink-spike.md companion notes):
#   - The ^C must be a raw 0x03 byte injected AFTER boot (~3s; the 4.9MB bundle
#     needs a moment) — an early byte hits default SIGINT before the app's own
#     handler installs, which tests the wrong thing.
#   - The verdict is a MID-FLIGHT process check, not elapsed time: the feeding
#     pipeline runs to completion regardless of when the app exits.
#
# Verdict (exit code):
#   0 = app exited within 2s of the ^C byte            (E4 CLEARED)
#   1 = app still alive 2s after the ^C byte           (E4 CONFIRMED)
#   2 = harness failure
set -u

LOG=/tmp/e4-regression.$$.txt
trap 'rm -f "$LOG"' EXIT

command -v script >/dev/null 2>&1 || { echo "HARNESS: script(1) missing"; exit 2; }
command -v node   >/dev/null 2>&1 || { echo "HARNESS: node missing"; exit 2; }

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
[ -f dist/main.js ] || npm run --silent build >/dev/null 2>&1 || { echo "HARNESS: build failed"; exit 2; }

# Feed: idle 3s (boot), ^C byte, hold stdin open 6 more seconds.
( sleep 3; printf '\x03'; sleep 6 ) | timeout 20 script -q -c \
  "env FULLSTACK_UI=next node bin/fullstack.js" "$LOG" >/dev/null 2>&1 &

sleep 5   # t=5s: 2s after the ^C byte, stdin still held open

ALIVE=$(ps -eo comm,args | grep -E '^node.*fullstack' | grep -v grep | wc -l)
wait 2>/dev/null

if [ "$ALIVE" -gt 0 ]; then
  echo "E4 CONFIRMED: app still alive 2s after ^C"
  exit 1
fi

# Restore sequence must have been written before exit.
if grep -aq $'\x1b\[?1049l' "$LOG"; then
  echo "E4 CLEARED: clean exit on ^C with alt-screen restore"
  exit 0
fi
echo "E4 PARTIAL: exited but alt-screen restore missing (terminal left scrambled)"
exit 1
