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
import { useEffect } from 'react';
import { resolveKey, mergeKeymap } from './commands.js';

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
  useEffect(() => {
    if (!enabled) return undefined;
    const map = keymap ?? mergeKeymap().keymap;
    setCurrentRoute({
      screen,
      onKey: (ev) => {
        if (typeof onCommand !== 'function') return false;
        const id = resolveKey(ev, screen, map);
        if (!id) return false;
        onCommand(id, ev);
        return true;
      },
    });
    return () => clearRoute();
  }, [screen, enabled, onCommand, keymap]);
}
