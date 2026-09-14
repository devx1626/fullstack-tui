/**
 * FULLSTACK_UI=next entry point.
 *
 * Phase 0 complete: providers mount, alt-screen engages on a TTY, the chrome
 * frame renders, and the input pipeline (task 0.4) routes keys/mouse/paste
 * through the dispatcher. Screens arrive in Phase 1; the classic UI remains
 * the default entry until the Phase 4 cut-over.
 */
import React from 'react';
import { render, Text, Box } from 'ink';
import { detectCapabilities } from './ui/capabilities.js';
import { themeForCapabilities } from './ui/theme/index.js';
import { AltScreen } from './ui/altScreen.jsx';
import { InputDispatcher } from './ui/input/dispatcher.js';
import { getCurrentRoute } from './ui/useKeymap.js';

function ChromeFrame({ theme, tier, input }) {
  const w = 58;
  const line = '─'.repeat(w - 2);
  return (
    <Box flexDirection="column">
      <Text color={theme.accent}>╭{line}╮</Text>
      <Text color={theme.text}>  ◈ fullstack-tui — next UI (Phase 0)</Text>
      <Text color={theme.muted}>  theme: {theme.name} · tier: {tier}</Text>
      <Text color={theme.muted}>  screens land in Phase 1 — classic UI is still the default</Text>
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

  // Ctrl+C is ours (E4 fix): exitOnCtrlC would unmount Ink's tree but leave
  // our stdin hold alive, so the process lingered after ^C on a real TTY.
  const { unmount } = render(
    <AltScreen>
      <ChromeFrame theme={theme} tier={caps.tier} input="keys · mouse · paste" />
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
    globalHandler: () => false, // palette/quit/help land in Phase 1
    onQuit: quit,
  });
  dispatcher.start();

  process.on('SIGINT', quit); // cooked-mode fallback (e.g. kill -INT)
}
