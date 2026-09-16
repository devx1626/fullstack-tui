/**
 * Overlay stack (overhaul Phase 1, spec §10 "mode wins" + task 1.1b).
 *
 * Priority order of key routing, now enforced end to end:
 *
 *   ctrl-c (quit, never consumable)  >  overlays (LIFO top first)  >  focused
 *   screen route  >  global handler
 *
 * While a modal is open the screen must NOT see keys — a modal that leaked
 * `j`/`k` into an editor underneath would corrupt learner code. So an event
 * the top overlay does not consume is DROPPED, not passed down. This mirrors
 * how every modal system works (vim dialogs, VS Code quick-input) and is the
 * "overlays > vim > screen > global" row of the task 0.8 priority table.
 *
 * Pure module: no I/O, no React — the dispatcher holds the only instance.
 * The React side mounts `<Modal>` visuals independently and calls
 * openOverlay/closeOverlay when its `open` prop changes; see overlays.jsx.
 */

let stack = [];

/** True when any overlay is open. */
export function hasOverlays() {
  return stack.length > 0;
}

/** The topmost overlay handler, or null. */
export function topOverlay() {
  return stack.length ? stack[stack.length - 1] : null;
}

/** Number of open overlays (tests, chrome badges). */
export function overlayDepth() {
  return stack.length;
}

/**
 * Push an overlay.
 *
 * @param {{ id?: string, onKey?: (ev) => boolean }} overlay
 *   `onKey` returns true when the event is consumed. The top overlay's
 *   onKey runs first; false/undefined means "swallow and drop" while any
 *   overlay is open — the screen underneath must never see the event.
 * @returns {() => void} a closer for this overlay (idempotent).
 */
export function openOverlay(overlay) {
  const entry = { id: overlay?.id ?? null, onKey: overlay?.onKey };
  stack.push(entry);
  let closed = false;
  return () => {
    if (closed) return;
    closed = true;
    const i = stack.indexOf(entry);
    if (i !== -1) stack.splice(i, 1);
  };
}

/** Close overlays by id (all matching); no-op when none match. */
export function closeOverlay(id) {
  stack = stack.filter((o) => o.id !== id);
}

/** Close everything (screen transitions, app quit). */
export function clearOverlays() {
  stack = [];
}

/**
 * Give one event to the overlay layer. Only called by the dispatcher when
 * `hasOverlays()` is true.
 *
 * @returns {boolean} true when the event was consumed by the top overlay;
 *   false when the top overlay declined it — the caller must then DROP the
 *   event (never forward it to the screen route).
 */
export function routeToOverlays(ev) {
  const top = topOverlay();
  if (!top || typeof top.onKey !== 'function') return false;
  return top.onKey(ev) === true;
}

/** Test isolation hook. */
export function _resetOverlays() {
  stack = [];
}
