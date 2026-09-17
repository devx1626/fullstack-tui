/**
 * FULLSTACK_UI=next entry point.
 *
 * Phase 1: the shell is real — providers mount, alt-screen engages on a TTY,
 * the input pipeline routes keys/mouse/paste through the dispatcher, and the
 * home + module + challenge screens render from the classic app's singletons
 * (store, curriculum, settings). The classic UI remains the default entry
 * until the Phase 4 cut-over.
 */
import React from 'react';
import { render, Text, Box } from 'ink';
import { detectCapabilities } from './ui/capabilities.js';
import { themeForCapabilities } from './ui/theme/index.js';
import { AltScreen } from './ui/altScreen.jsx';
import { InputDispatcher } from './ui/input/dispatcher.js';
import { getCurrentRoute } from './ui/useKeymap.js';
import { AppRoot } from './ui/AppRoot.jsx';
import { ServicesProvider, createServices } from './ui/services.jsx';
import { dispatchGlobal } from './ui/host.jsx';
import {
  HomeRoute, ModuleRoute, ChallengeRoute,
  HelpRoute, ResourcesRoute, WorkspaceRoute, StatsRoute,
} from './ui/routes.jsx';
import { Store } from './core/store.js';
import { Settings } from './ui/settings.js';
import { buildRecap } from './core/recap.js';
import { curriculum, totals, allLessons } from './content/index.js';

/**
 * Screen registry: the router maps route names to components (no imports
 * inside router.jsx). Routes — not screens — own behavior: they resolve the
 * route params against services, keep the list cursor, and hand command ids
 * to the CommandHost (host.jsx).
 */
const SCREENS = {
  home: HomeRoute,
  module: ModuleRoute,
  challenge: ChallengeRoute,
  help: HelpRoute,
  resources: ResourcesRoute,
  workspace: WorkspaceRoute,
  stats: StatsRoute,
};

function ChromeFrame({ theme, tier, input }) {
  const w = 58;
  const line = '─'.repeat(w - 2);
  return (
    <Box flexDirection="column">
      <Text color={theme.accent}>╭{line}╮</Text>
      <Text color={theme.text}>  ◈ fullstack-tui — next UI (Phase 1)</Text>
      <Text color={theme.muted}>  theme: {theme.name} · tier: {tier}</Text>
      <Text color={theme.muted}>  screens: home · module · challenge — classic UI is still the default</Text>
      <Text color={theme.accent}>╰{line}╯</Text>
      <Text color={theme.faint}>  ctrl+c quit · input: {input}</Text>
    </Box>
  );
}

export function main() {
  const caps = detectCapabilities();
  const theme = themeForCapabilities(caps, process.env.FULLSTACK_THEME);

  // Piped stdout / TERM=dumb: one-shot static render, then exit (spec §7.1 Tier D).
  if (!caps.isTTY) {
    render(<ChromeFrame theme={theme} tier={caps.tier} input="none (pipe)" />, { patchConsole: false });
    return;
  }

  // Singletons shared with the classic app (same files, same schema).
  const store = new Store();
  const settings = new Settings();
  const services = createServices({
    store,
    curriculum,
    settings,
    overall: totals(),
    lessonIndex: allLessons(),
  });

  // Ctrl+C is ours (E4 fix): exitOnCtrlC would unmount Ink's tree but leave
  // our stdin hold alive, so the process lingered after ^C on a real TTY.
  const { unmount } = render(      <AltScreen>
      <ServicesProvider services={services}>
        <AppRoot screens={SCREENS} onQuit={() => quit()} />
      </ServicesProvider>
    </AltScreen>,
    { exitOnCtrlC: false, patchConsole: true },
  );

  let done = false;
  const quit = () => {
    if (done) return;
    done = true;
    dispatcher.stop();
    try {
      unmount(); // flushes the alt-screen restore + final frame
    } catch {
      /* terminal may already be gone */
    }
    // Q13: the recap goes to the normal screen after the alt screen is gone —
    // the same contract as the classic quit path, fed by the same helpers.
    try {
      const t = services.store.stats(curriculum).totals;
      const target = services.resumeTarget();
      const session = services.sessionState;
      const lines = buildRecap({
        seconds: session.seconds,
        passed: [...session.passed],
        failures: session.failures,
        totalPassed: t.challengesPassed,
        totalChallenges: t.challenges,
        streak: services.store.stats(curriculum).streak || 0,
        todayCount: services.store.passedToday(),
        dailyGoal: services.settings?.data?.goal?.daily || 0,
        nextUp: target ? `${target.lessonId} · ${target.challengeId}` : null,
      });
      process.stdout.write(`\nSession recap\n${lines.join('\n')}\n\n`);
    } catch {
      /* a dying terminal must never break quitting */
    }
    // stdin.pause() alone does not unref the TTY handle while Ink still holds
    // its own stdin listeners — the loop would linger. Exit explicitly, like
    // the classic app's quit() does.
    setTimeout(() => process.exit(0), 30); // let the restore write flush
  };

  // Task 0.4: the dispatcher owns stdin (raw mode), parses mouse/paste/keys
  // byte-level, and routes events to the focused screen then the global handler.
  const dispatcher = new InputDispatcher({
    stdout: process.stdout,
    stdin: process.stdin,
    // Screens register their handlers via useKeymap(); the hook's route
    // registry is the single source of truth for "who is focused".
    getRoute: () => getCurrentRoute(),
    // Keys no screen claims fall through to the CommandHost's global table
    // (quit/palette/help/resume/next-up) instead of vanishing silently.
    globalHandler: (ev) => dispatchGlobal(ev, getCurrentRoute().screen),
    onQuit: quit,
  });
  dispatcher.start();

  process.on('SIGINT', quit); // cooked-mode fallback (e.g. kill -INT)
}
