/**
 * useKeymap (overhaul task 0.8 slice) — the React side of the dispatcher.
 *
 * The InputDispatcher is the SOLE stdin owner (a parallel ink useInput would
 * double-parse every byte). Components instead register their screen handler
 * here; main.jsx's dispatcher reads the registered route via getCurrentRoute().
 * The hook resolves raw key events to command ids through the registry
 * ("mode wins": bindings scoped to `screen` or global), so components deal in
 * command ids, never raw keys.
 *
 *   component                          dispatcher (main.jsx)
 *   ─────────                          ─────────────────────
 *   useKeymap('challenge', cmd)  ──►   getRoute() → getCurrentRoute()
 *                                        └─ onKey(ev) → resolveKey → cmd(id)
 */
import { useEffect, useRef } from 'react';
import { resolveKey } from './commands.js';
import { effectiveKeymap } from './keymap.js';

/** The one focused-screen route (module-level: one app per process). */
const route = { screen: null, onKey: null, onMouse: null, onPaste: null };

export function getCurrentRoute() {
  return route;
}

export function setCurrentRoute(next) {
  Object.assign(route, next);
}

export function clearRoute() {
  route.screen = null;
  route.onKey = null;
  route.onMouse = null;
  route.onPaste = null;
}

/**
 * Register command handling for the focused screen.
 *
 * @param {string|null} screen current screen id (null = works everywhere)
 * @param {(id: string, ev: object) => void} onCommand called with the
 *   resolved command id (Appendix C) and the raw parser event
 * @param {{enabled?: boolean, keymap?: Map}} opts
 *
 * Handlers should be stable (useCallback) — the effect re-registers on
 * identity change, which is fine but churns.
 */
export function useKeymap(screen, onCommand, { enabled = true, keymap } = {}) {
  // The registered handler reads the LATEST callback through a ref, so a
  // re-render never leaves a stale closure registered. Without this, handlers
  // that close over state (a list cursor, a code buffer) would be one frame
  // behind: press `j` then Enter within the same tick and Enter would act on
  // the pre-`j` value. It also stops the effect churning on every keystroke.
  const handlerRef = useRef(onCommand);
  handlerRef.current = onCommand;

  useEffect(() => {
    if (!enabled) return undefined;
    // Defaults merged with the user's `.data/keymap.json` (QoL/overhaul: a
    // rebind must actually take effect, not just lint clean).
    const map = keymap ?? effectiveKeymap();
    setCurrentRoute({
      screen,
      onKey: (ev) => {
        const handler = handlerRef.current;
        if (typeof handler !== 'function') return false;
        const id = resolveKey(ev, screen, map);
        if (!id) return false;
        handler(id, ev);
        return true;
      },
    });
    return () => clearRoute();
  }, [screen, enabled, keymap]);
}
