/**
 * Terminal shell helpers for the Ink UI — shell-outs that must release the
 * alt screen while a child process owns the terminal (Ctrl+E external editor,
 * anything else that spawns $EDITOR-style programs).
 *
 * Re-homed from the classic UI's `src/tui/term.js` in the Phase 4 flip (the
 * only consumer the next UI has); the sequences are identical to what the
 * classic app emitted.
 */
const ALT_ON = '\x1b[?1049h';
const ALT_OFF = '\x1b[?1049l';
const CURSOR_HIDE = '\x1b[?25l';
const CURSOR_SHOW = '\x1b[?25h';
const RESET = '\x1b[0m';
const CLEAR_ALL = '\x1b[2J';
const HOME = '\x1b[H';

/**
 * Release the terminal (leave the alt screen, cooked stdin), run `fn`, then
 * restore the alt screen exactly as ink left it — even when `fn` throws.
 * The Ink app must be paused/unmounted for the duration by the caller.
 */
export function withTerminalReleased(fn) {
  const { stdin, stdout } = process;
  stdout.write(RESET + CURSOR_SHOW + ALT_OFF + CLEAR_ALL);
  if (stdin.isTTY) stdin.setRawMode(false);
  const restore = () => {
    if (stdin.isTTY) stdin.setRawMode(true);
    stdout.write(ALT_ON + CURSOR_HIDE + CLEAR_ALL + HOME);
  };
  return Promise.resolve()
    .then(fn)
    .finally(restore);
}
