/**
 * Alternate-screen wrapper (spec §7.1, Appendix A.3).
 *
 * npm-stable ink@6 has no native fullscreen option (upstream added one in
 * Ink 7). This wrapper emits the exact sequences the classic app's term.js
 * used: enter 1049 + hide cursor on mount, restore on unmount — including on
 * error/unmount so the user's shell is never left scrambled.
 */
import React, { useEffect } from 'react';

const ALT_ON = '\x1b[?1049h';
const ALT_OFF = '\x1b[?1049l';
const CURSOR_HIDE = '\x1b[?25l';
const CURSOR_SHOW = '\x1b[?25h';

export function AltScreen({ children, stdout = process.stdout }) {
  useEffect(() => {
    stdout.write(ALT_ON + CURSOR_HIDE);
    return () => {
      stdout.write(CURSOR_SHOW + ALT_OFF);
    };
  }, [stdout]);
  return <>{children}</>;
}
