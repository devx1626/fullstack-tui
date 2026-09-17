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
 * It also hosts the command palette (task 1.5) as an OVERLAY: the palette must
 * not be a router screen, or the screen underneath would unmount and lose its
 * cursor state and command handler (see screens/palette.jsx).
 *
 * It also owns the per-screen list cursor, the window size the screens render
 * at, and a module-level sink so main.jsx's dispatcher can route keys that no
 * screen claims (its global pass) to the same command table.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text } from 'ink';
import { useRouter } from './router.jsx';
import { useServices } from './services.jsx';
import { useWindowSize } from './useWindowSize.js';
import { COMMANDS, resolveKey } from './commands.js';
import { dispatchToScreen } from './useKeymap.js';
import { openOverlay } from './input/overlayStack.js';
import { clampSelected } from './fuzzy.js';
import { effectiveKeymap } from './keymap.js';
import { SCREEN_TARGETS } from './screenTargets.js';
import { PaletteScreen, buildPaletteItems, recentItems, paletteKey } from './screens/palette.jsx';
import { paletteMatches } from './components/palette.jsx';
import { firstUnpassed, firstUnpassedIn } from '../core/targets.js';

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
  // Palette state lives at the top because `openPalette` (below) closes over
  // the setters, and the palette must render above the mounted screen.
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState('');
  const [paletteSelected, setPaletteSelected] = useState(0);
  // The authoritative query/selection for key handling. State is only for
  // rendering: two keys in the same tick (paste-speed typing, or a pipelined
  // stdin burst) would otherwise both read the pre-key render value and one
  // character would vanish.
  const paletteStateRef = useRef({ query: '', selected: 0 });

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

  const openPalette = useCallback(() => {
    paletteStateRef.current = { query: '', selected: 0 };
    setPaletteQuery('');
    setPaletteSelected(0);
    setPaletteOpen(true);
  }, []);

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
      case 'app.help':
        go('help');
        return true;
      case 'app.palette':
        openPalette();
        return true;
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

  // ---- command palette (task 1.5) -----------------------------------------
  const paletteItems = useMemo(() => (paletteOpen
    ? buildPaletteItems({
      screen,
      curriculum: (services && services.curriculum) || [],
      screens: SCREEN_TARGETS,
      keymap: effectiveKeymap(),
    })
    : []), [paletteOpen, screen, services]);

  const recents = useMemo(() => {
    if (!paletteOpen) return [];
    const stored = (services && services.settings && services.settings.data.palette.recent) || [];
    return recentItems(paletteItems, stored);
  }, [paletteOpen, paletteItems, services]);

  const matches = useMemo(
    () => paletteMatches(paletteItems, recents, paletteQuery),
    [paletteItems, recents, paletteQuery],
  );

  const closePalette = useCallback(() => {
    paletteStateRef.current = { query: '', selected: 0 };
    setPaletteOpen(false);
    setPaletteQuery('');
    setPaletteSelected(0);
  }, []);

  const runPaletteItem = useCallback((item) => {
    if (!item) return;
    closePalette();
    if (services && services.settings) services.settings.pushRecent(item.id);
    if (item.kind === 'screen') {
      // Home-first so Esc always has somewhere to go back to.
      const target = item.route;
      router.reset('home');
      if (target !== 'home') router.push(target);
      return;
    }
    if (item.kind === 'module') {
      go('module', { moduleId: item.moduleId });
      return;
    }
    if (item.kind === 'lesson') {
      const mod = ((services && services.curriculum) || []).find((m) => m.id === item.moduleId);
      const lesson = mod && (mod.lessons || []).find((l) => l.id === item.lessonId);
      const index = lesson ? firstUnpassedIn(lesson, (id) => services.store.isPassed(id)) : 0;
      const ch = lesson && lesson.challenges ? lesson.challenges[index] : null;
      if (ch) go('challenge', { moduleId: item.moduleId, lessonId: item.lessonId, challengeId: ch.id });
      return;
    }
    // A registry command: the focused screen first (it may own the id), then
    // the global table.
    if (!dispatchToScreen(item.commandId)) run(item.commandId);
  }, [closePalette, go, router, run, services]);

  // The palette's modal key handling. The handler is read through a ref so the
  // overlay registers once and never closes over a stale query/selection.
  const paletteKeyRef = useRef(null);
  paletteKeyRef.current = (ev) => {
    const cur = paletteStateRef.current;
    // Match against the LIVE query, not the last rendered one: an action must
    // pick the row the user is looking at after the keystroke that triggered it.
    const live = paletteMatches(paletteItems, recents, cur.query);
    const next = paletteKey({ query: cur.query, selected: cur.selected, count: live.length }, ev);
    if (next.action === 'cancel') { closePalette(); return true; }
    if (next.action === 'run') { runPaletteItem(live[clampSelected(cur.selected, live.length)]); return true; }
    paletteStateRef.current = { query: next.query, selected: next.selected };
    setPaletteQuery(next.query);
    setPaletteSelected(next.selected);
    return true; // consumed: the dispatcher drops anything an overlay declines
  };

  useEffect(() => {
    if (!paletteOpen) return undefined;
    // Overlay priority: the dispatcher offers every key here and DROPS what the
    // palette declines, so the screen underneath never sees them.
    return openOverlay({ id: 'palette', onKey: (ev) => paletteKeyRef.current(ev) });
  }, [paletteOpen]);

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
    paletteOpen,
    openPalette,
    closePalette,
  }), [screen, cursor, setCursor, size, notice, say, go, back, run, services, paletteOpen, openPalette, closePalette]);

  return (
    <HostContext.Provider value={value}>
      <Box flexDirection="column">
        {children}
        {paletteOpen ? (
          <PaletteScreen
            items={paletteItems}
            recents={recents}
            query={paletteQuery}
            selected={clampSelected(paletteSelected, matches.length)}
            height={size.h}
          />
        ) : null}
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
