/**
 * Motion (overhaul §7.3 "Motion" — the Phase 4 animation touch).
 *
 * Strictly non-essential: a running indicator while a check executes and a
 * one-line celebration when it passes. The rules the spec sets:
 *
 *   - one rAF-like interval at a time, driven from a hook that unmounts clean;
 *   - fully disabled at tiers C/D and under `NO_ANIMATION=1` — the frame is
 *     then static text (the same string the animation would end on), so
 *     snapshots and tier D output stay deterministic;
 *   - never blocks input: the interval only sets a character index; every
 *     keystroke still reaches the dispatcher between paints.
 *
 * `animationAllowed(caps, env)` is the single gate, exported for tests and the
 * check tool's tier smoke.
 */

/** The spin/ramp frames. ASCII's ramp is the 7-bit ladder from icons.js. */
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const SPINNER_FRAMES_ASCII = ['.', 'o', 'O', 'o'];
const CELEBRATE_FRAMES = ['✶', '✸', '✹', '✺', '✹', '✸'];
const CELEBRATE_FRAMES_ASCII = ['*', '+', '*', '+', '*', '+'];

/** True when motion may run: a TTY terminal above tier D, `NO_ANIMATION` unset. */
export function animationAllowed(caps = {}, env = process.env) {
  if (env.NO_ANIMATION) return false;
  if (env.CI) return false; // deterministic logs over spinning frames
  return !!(caps && caps.tty) && !!caps.unicode && caps.tier !== 'C' && caps.tier !== 'D';
}

/** Which frame set to use — callers that already resolved the icon set. */
export function framesFor(icons) {
  const ascii = !icons || icons.meterFull === '#';
  return {
    spinner: ascii ? SPINNER_FRAMES_ASCII : SPINNER_FRAMES,
    celebrate: ascii ? CELEBRATE_FRAMES_ASCII : CELEBRATE_FRAMES,
  };
}

/** Pick a deterministic frame (no Math.random — snapshots stay stable). */
export function frameAt(frames, i) {
  return frames[((i % frames.length) + frames.length) % frames.length];
}

/**
 * One shared animation clock. Returns `{ value, running, start, stop }`:
 * `value` is the current frame index, `start(stepMs)` begins the interval and
 * `stop()` clears it. The hook holds ONE interval — a component that mounts a
 * second one (or React StrictMode's double-mount) never stacks timers.
 */
export function createAnimator() {
  let timer = null;
  let index = 0;
  const listeners = new Set();
  return {
    get value() { return index; },
    get running() { return timer !== null; },
    start(stepMs = 80, onChange = () => {}) {
      this.stop();
      listeners.add(onChange);
      timer = setInterval(() => {
        index += 1;
        for (const fn of listeners) fn(index);
      }, stepMs);
      return index;
    },
    stop() {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
      listeners.clear();
      return index;
    },
    /** Reset the frame to a fixed index (tests, snapshot determinism). */
    reset(i = 0) {
      index = i;
      return index;
    },
  };
}
