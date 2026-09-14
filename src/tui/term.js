/**
 * Terminal lifecycle + raw keyboard handling.
 *
 * We take over the alternate screen buffer so quitting restores whatever the
 * user had in their shell, and we switch stdin to raw mode so every keypress
 * arrives immediately instead of waiting for Enter.
 */

import { seq } from './ansi.js';

const KEYMAP = {
  '\x1b[A': 'up',
  '\x1b[B': 'down',
  '\x1b[C': 'right',
  '\x1b[D': 'left',
  '\x1bOA': 'up',
  '\x1bOB': 'down',
  '\x1bOC': 'right',
  '\x1bOD': 'left',
  '\x1b[5~': 'pageup',
  '\x1b[6~': 'pagedown',
  '\x1b[3~': 'delete',
  '\x1b[2~': 'insert',
  '\x1b[H': 'home',
  '\x1b[F': 'end',
  '\x1b[1~': 'home',
  '\x1b[4~': 'end',
  '\x1b[7~': 'home',
  '\x1b[8~': 'end',
  '\x1bOH': 'home',
  '\x1bOF': 'end',
  '\x1b[Z': 'shift-tab',
  '\x1b[1;2A': 'shift-up',
  '\x1b[1;2B': 'shift-down',
  '\r': 'enter',
  '\n': 'enter',
  '\x7f': 'backspace',
  '\x08': 'backspace',
  '\t': 'tab',
  '\x1b': 'escape',
  '\x03': 'ctrl-c',
  '\x04': 'ctrl-d',
  '\x05': 'ctrl-e',
  '\x06': 'ctrl-f',
  '\x07': 'ctrl-g',
  '\x0b': 'ctrl-k',
  '\x0c': 'ctrl-l',
  '\x0e': 'ctrl-n',
  '\x0f': 'ctrl-o',
  '\x10': 'ctrl-p',
  '\x12': 'ctrl-r',
  '\x13': 'ctrl-s',
  '\x14': 'ctrl-t',
  '\x15': 'ctrl-u',
  '\x16': 'ctrl-v',
  '\x19': 'ctrl-y',
  '\x1a': 'ctrl-z',
  '\x00': 'ctrl-space',
  ' ': 'space',
};

/**
 * Split a raw stdin chunk into key events.
 * Escape sequences are matched longest-first so `\x1b[A` never degrades to Esc.
 */
export function parseChunk(chunk) {
  const keys = [];
  let i = 0;
  const seqs = Object.keys(KEYMAP).sort((a, b) => b.length - a.length);

  while (i < chunk.length) {
    let matched = null;
    for (const s of seqs) {
      if (chunk.startsWith(s, i)) {
        matched = s;
        break;
      }
    }
    if (matched) {
      keys.push({ name: KEYMAP[matched], raw: matched });
      i += matched.length;
      continue;
    }
    const ch = chunk[i];
    const code = ch.charCodeAt(0);
    if (code >= 1 && code <= 26) {
      // Unmapped control character: report it so nothing is silently swallowed.
      keys.push({ name: 'ctrl-' + String.fromCharCode(code + 96), raw: ch });
    } else if (code === 27) {
      keys.push({ name: 'escape', raw: ch });
    } else if (code >= 32) {
      keys.push({ name: 'char', char: ch });
    }
    i += 1;
  }
  return keys;
}

export function dimensions() {
  return {
    w: Math.max(40, process.stdout.columns || 100),
    h: Math.max(16, process.stdout.rows || 30),
  };
}

/** Take over the terminal and stream parsed keys to `onKey`. */
export function startTerminal({ onKey, onResize }) {
  const { stdin, stdout } = process;
  const wasRaw = stdin.isRaw;

  stdout.write(seq.altOn + seq.cursorHide + seq.clearAll + seq.home);

  if (stdin.isTTY) stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');

  const dataHandler = (chunk) => {
    for (const key of parseChunk(chunk)) onKey(key);
  };
  stdin.on('data', dataHandler);

  const resizeHandler = () => onResize(dimensions());
  process.on('SIGWINCH', resizeHandler);

  stdout.on('error', () => {});
}

/** Restore the terminal exactly as we found it. Idempotent. */
export function stopTerminal() {
  const { stdin, stdout } = process;
  try {
    if (stdin.isTTY) stdin.setRawMode(false);
    stdin.pause();
    stdin.removeAllListeners('data');
  } catch {
    /* terminal already gone */
  }
  process.removeAllListeners('SIGWINCH');
  stdout.write(seq.reset + seq.cursorShow + seq.altOff);
}

/** Run a command with the terminal fully restored (used to open $EDITOR). */
export function withTerminalReleased(fn) {
  const { stdin, stdout } = process;
  stdout.write(seq.reset + seq.cursorShow + seq.altOff + seq.clearAll);
  if (stdin.isTTY) stdin.setRawMode(false);
  const restore = () => {
    if (stdin.isTTY) stdin.setRawMode(true);
    stdout.write(seq.altOn + seq.cursorHide + seq.clearAll + seq.home);
  };
  return Promise.resolve()
    .then(fn)
    .finally(restore);
}
