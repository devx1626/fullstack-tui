/**
 * Router (overhaul task 0.9 remainder) — React-side screen stack mirroring
 * the classic App's push/pop model, so ports stay mechanical:
 *
 *   classic                     next UI
 *   ───────                     ───────
 *   app.push('challenge', p)    router.push('challenge', p)
 *   app.pop()                   router.pop()
 *   VIEWS[name](app, w, h)      <Screen name=... params=.../> via SCREENS
 *
 * The stack is context state; useKeymap registrations attach per screen, and
 * unmount clears them (same contract the hook tests pin). Screens are
 * registered in a SCREENS map so the router has no view imports — Phase 1
 * ports add entries without touching this file.
 */
import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { Text } from 'ink';
import { useTheme } from './theme/context.jsx';

const RouterContext = createContext(null);

export function RouterProvider({ initial = { name: 'home', params: {} }, screens, children }) {
  const [stack, setStack] = useState([initial]);

  const push = useCallback((name, params = {}) => {
    setStack((s) => [...s, { name, params }]);
  }, []);

  const pop = useCallback(() => {
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  }, []);

  const replace = useCallback((name, params = {}) => {
    setStack((s) => [...s.slice(0, -1), { name, params }]);
  }, []);

  const reset = useCallback((name, params = {}) => {
    setStack([{ name, params }]);
  }, []);

  const value = useMemo(() => {
    const top = stack[stack.length - 1];
    return { stack, top, push, pop, replace, reset, screens };
  }, [stack, push, pop, replace, reset, screens]);

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter() {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error('useRouter must be used inside <RouterProvider>');
  return ctx;
}

/** Renders the top of the stack. Unknown screens fail loudly in dev. */
export function RouterView({ fallback = null }) {
  const theme = useTheme();
  const { top, screens } = useRouter();
  const Screen = screens[top.name];
  if (!Screen) {
    return fallback ?? <Text color={theme.bad}>unknown screen: {top.name}</Text>;
  }
  return <Screen {...top.params} />;
}
