/**
 * FULLSTACK_UI=next entry point.
 *
 * Phase 0: proves the pipeline end-to-end — providers mount, alt-screen
 * wrapper engages on a TTY, the chrome frame renders, Ctrl+C quits cleanly.
 * Screens arrive in Phase 1; the classic UI remains the default entry.
 */
import React from 'react';
import { render, Text, Box } from 'ink';
import { detectCapabilities } from './ui/capabilities.js';
import { themeForCapabilities } from './ui/theme/index.js';
import { AltScreen } from './ui/altScreen.jsx';

function ChromeFrame({ theme, tier }) {
  const w = 58;
  const line = '─'.repeat(w - 2);
  return (
    <Box flexDirection="column">
      <Text color={theme.accent}>╭{line}╮</Text>
      <Text color={theme.text}>  ◈ fullstack-tui — next UI (Phase 0)</Text>
      <Text color={theme.muted}>  theme: {theme.name} · tier: {tier}</Text>
      <Text color={theme.muted}>  screens land in Phase 1 — classic UI is still the default</Text>
      <Text color={theme.accent}>╰{line}╯</Text>
      <Text color={theme.faint}>  ctrl+c quit</Text>
    </Box>
  );
}

export function main() {
  const caps = detectCapabilities();
  const theme = themeForCapabilities(caps, process.env.FULLSTACK_THEME);

  // Piped stdout / TERM=dumb: one-shot static render, then exit (spec §7.1 Tier D).
  if (!caps.isTTY) {
    render(<ChromeFrame theme={theme} tier={caps.tier} />, { patchConsole: false });
    return;
  }

  // Ctrl+C is ours (E4 fix): exitOnCtrlC would unmount Ink's tree but leave
  // our stdin hold alive, so the process lingered after ^C on a real TTY.
  const { unmount, waitUntilExit } = render(
    <AltScreen>
      <ChromeFrame theme={theme} tier={caps.tier} />
    </AltScreen>,
    { exitOnCtrlC: false, patchConsole: true },
  );

  // Phase 0: no screens consume input yet, so hold stdin to keep the app
  // alive and watch for the ^C byte (raw mode) plus SIGINT (cooked mode).
  // The input pipeline (task 0.3) replaces this ad-hoc watcher.
  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    process.stdin.pause();
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
  process.stdin.resume();
  process.stdin.on('data', (buf) => {
    if (buf.includes(0x03)) cleanup();
  });
  process.on('SIGINT', cleanup);
  void waitUntilExit;
}
