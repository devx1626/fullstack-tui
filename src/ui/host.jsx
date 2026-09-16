/**
 * CommandHost (Phase 1 wiring) — the missing half of `useKeymap`.
 *
 * The ported Ink screens register a keymap route and hand every resolved
 * command id to their `onCommand` prop; nothing supplied that prop, so in the
 * real app each key resolved to an id and then did nothing (and nothing ever
 * called `router.push`, so the app could not leave home).
 *
 * This provider is that host:
 *
 *   key ──► InputDispatcher ──► useKeymap (resolveKey) ──► screen onCommand
 *                                                              │
 *                        ┌─────────────────────────────────────┘
 *                        ▼
 *              routes.jsx (screen-specific: cursors, open)
 *                        │
 *                        ▼
 *              CommandHost.run  (global: quit, back, resume, next-up, help,
 *                                palette, repaint, and an honest "not ported
 *                                yet" notice for everything else)
 *
 * It also owns the per-screen list cursor, the window size the screens render
 * at, and a module-level sink so main.jsx's dispatcher can route keys that no
 * screen claims (its global pass) to the same command table.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Box, Text } from 'ink';
import { useRouter } from './router.jsx';
import { useServices } from './services.jsx';
import { useWindowSize } from './useWindowSize.js';
import { COMMANDS, resolveKey } from './commands.js';
import { firstUnpassed } from '../core/targets.js';

const HostContext = createContext(null);

/** Host of the focused screen (null outside <CommandHost>). */
export function useHost() {
  return useContext(HostContext);
}

// ---------------------------------------------------------------------------
// Global command sink (main.jsx dispatcher → this host)
// ---------------------------------------------------------------------------

const sink = { handler: null };

/** Registered by CommandHost so the dispatcher's global pass can reach it. */
export function setGlobalCommandSink(fn) {
  sink.handler = fn;
}

export function getGlobalCommandSink() {
  return sink.handler;
}

/**
 * Route one raw key event through the registry to the sink, for keys the
 * focused screen declined. Returns true when the host consumed it.
 */
export function dispatchGlobal(ev, screen) {
  if (!ev || ev.type !== 'key' || !sink.handler) return false;
  const id = resolveKey(ev, screen ?? null);
  if (!id) return false;
  return sink.handler(id, ev) === true;
}

/** Screens the overhaul hasn't ported yet — named in the honest notice. */
export const UNPORTED_SCREENS = {
  'app.help': 'the paged help manual',
  'app.palette': 'the command palette (Ctrl+K port)',
  'home.openProjects': 'the projects screen',
  'home.openSettings': 'the settings screen',
  'module.openProject': 'the project brief screen',
};

export function CommandHost({ onQuit, children }) {
  const router = useRouter();
  const services = useServices();
  const size = useWindowSize();
  const [cursors, setCursors] = useState({});
  const [notice, setNotice] = useState(null);

  const screen = router.top.name;
  const cursor = cursors[screen] || 0;

  const setCursor = useCallback((next) => {
    setCursors((c) => ({ ...c, [screen]: next }));
  }, [screen]);

  const say = useCallback((message, kind = 'info') => {
    setNotice({ message, kind, id: Math.random() });
  }, []);

  const go = useCallback((name, params = {}) => {
    router.push(name, params);
  }, [router]);

  const back = useCallback(() => {
    if (router.stack.length > 1) {
      router.pop();
      return true;
    }
    return false;
  }, [router]);

  const resume = useCallback(() => {
    const target = services && services.resumeTarget ? services.resumeTarget() : null;
    if (!target) {
      say('Every challenge is passed — the capstone projects are next.', 'ok');
      return true;
    }
    go('challenge', {
      moduleId: target.moduleId,
      lessonId: target.lessonId,
      challengeId: target.challengeId,
    });
    return true;
  }, [go, say, services]);

  const nextUp = useCallback(() => {
    if (!services) return false;
    const target = firstUnpassed(services.curriculum, (id) => services.store.isPassed(id));
    if (!target) {
      say('Every challenge is passed — the capstone projects are next.', 'ok');
      return true;
    }
    go('challenge', {
      moduleId: target.moduleId,
      lessonId: target.lessonId,
      challengeId: target.challengeId,
    });
    return true;
  }, [go, say, services]);

  /** Global command table — everything a screen does not handle itself. */
  const run = useCallback((id) => {
    switch (id) {
      case 'app.quit':
        if (onQuit) onQuit();
        return true;
      case 'app.back':
        return back();
      case 'app.repaint':
        return true; // ink owns the frame; nothing to invalidate
      case 'nav.resume':
        return resume();
      case 'nav.nextUp':
        return nextUp();
      default:
        break;
    }
    const cmd = COMMANDS.find((c) => c.id === id);
    if (cmd) {
      const unported = UNPORTED_SCREENS[id];
      say(
        unported
          ? `${unported} lands with the Phase 1 port — the classic UI has it today.`
          : `“${cmd.title}” is not wired in the next UI yet.`,
        'warn',
      );
      return true;
    }
    say(`No command for “${id}”.`, 'error');
    return true;
  }, [back, nextUp, onQuit, resume, say]);

  // main.jsx's dispatcher consults this for keys no screen claimed.
  useEffect(() => {
    setGlobalCommandSink(run);
    return () => setGlobalCommandSink(null);
  }, [run]);

  const value = useMemo(() => ({
    screen,
    cursor,
    setCursor,
    size,
    width: size.w,
    height: size.h,
    notice,
    say,
    go,
    back,
    run,
    services,
  }), [screen, cursor, setCursor, size, notice, say, go, back, run, services]);

  return (
    <HostContext.Provider value={value}>
      <Box flexDirection="column">
        {children}
        {notice ? (
          <Box marginTop={1}>
            <Text color={notice.kind === 'error' ? 'red' : notice.kind === 'warn' ? 'yellow' : 'cyan'}>
              {' '}· {notice.message} ·
            </Text>
          </Box>
        ) : null}
      </Box>
    </HostContext.Provider>
  );
}
