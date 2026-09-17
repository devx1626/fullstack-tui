/**
 * Input pipeline (overhaul task 0.3, spec §A.3) — pure, unit-testable parsers.
 *
 *   bytes → parseChunk (keys, ported from classic term.js)
 *         → MouseParser (SGR 1006 click/press/release/wheel/modifiers)
 *         → PasteBuffer (bracketed paste 2004 grouping)
 *         → EscapeCoalescer (ambiguous-ESC disambiguation over time)
 *
 * Splits across chunk boundaries are the reason the coalescer exists: a
 * sequence arriving as two reads (SSH latency) must resolve to ONE event, not
 * Esc + garbage. All parsers are streaming: feed(chunk) → events, keep state.
 */

// ---------------------------------------------------------------------------
// Key parsing (port of classic term.js KEYMAP + parseChunk)
// ---------------------------------------------------------------------------

const KEYMAP = {
  '\x1b[A': 'up', '\x1b[B': 'down', '\x1b[C': 'right', '\x1b[D': 'left',
  '\x1bOA': 'up', '\x1bOB': 'down', '\x1bOC': 'right', '\x1bOD': 'left',
  '\x1b[5~': 'pageup', '\x1b[6~': 'pagedown', '\x1b[3~': 'delete', '\x1b[2~': 'insert',
  '\x1b[H': 'home', '\x1b[F': 'end', '\x1b[1~': 'home', '\x1b[4~': 'end',
  '\x1b[7~': 'home', '\x1b[8~': 'end', '\x1bOH': 'home', '\x1bOF': 'end',
  '\x1b[Z': 'shift-tab',
  // Modified arrows (xterm CSI 1;<mod> form). Without these the bytes arrive as
  // ESC + '[1;5C' → Alt+[ and the bindings are unreachable, which is how the
  // pane-nudge keys (`<C-left>`/`<C-right>`, spec §7.4) would have shipped dead.
  //   2 = shift, 3 = alt, 5 = ctrl, 6 = ctrl+shift
  '\x1b[1;2C': 'shift-right', '\x1b[1;2D': 'shift-left',
  '\x1b[1;3C': 'alt-right', '\x1b[1;3D': 'alt-left',
  '\x1b[1;5C': 'ctrl-right', '\x1b[1;5D': 'ctrl-left',
  '\x1b[1;6C': 'ctrl-shift-right', '\x1b[1;6D': 'ctrl-shift-left',
  '\r': 'enter', '\n': 'enter', '\x7f': 'backspace', '\x08': 'backspace',
  '\t': 'tab', ' ': 'space',
};

const CTRL_NAMES = new Set(['c', 'd', 'e', 'f', 'g', 'k', 'l', 'n', 'o', 'p', 'r', 's', 't', 'u', 'v', 'y', 'z']);

/** Parse a byte string into key events (no mouse/paste handling here). */
export function parseKeys(chunk) {
  const events = [];
  let i = 0;
  const seqs = Object.keys(KEYMAP).sort((a, b) => b.length - a.length);
  while (i < chunk.length) {
    let matched = null;
    for (const s of seqs) {
      if (chunk.startsWith(s, i)) { matched = s; break; }
    }
    if (matched) {
      events.push({ type: 'key', name: KEYMAP[matched], raw: matched });
      i += matched.length;
      continue;
    }
    const code = chunk.charCodeAt(i);
    const ch = chunk[i];
    if (code >= 1 && code <= 26) {
      const letter = String.fromCharCode(code + 96);
      if (CTRL_NAMES.has(letter)) events.push({ type: 'key', name: `ctrl-${letter}`, raw: ch });
      else events.push({ type: 'key', name: `ctrl-${letter}`, raw: ch }); // unmapped ctrl: still surfaced
    } else if (code === 27 && i + 1 < chunk.length && chunk.charCodeAt(i + 1) >= 32 && chunk.charCodeAt(i + 1) < 127) {
      // ESC + a printable ASCII char is Alt+<char> — the standard terminal
      // encoding, and what the coalescer's timer flush produces when a user
      // presses an Alt combination. CSI/SS3 sequences were matched by KEYMAP
      // above, and a lone ESC at end-of-chunk still falls through to 'escape'.
      // (Inherent terminal ambiguity: Esc followed by a letter within the
      // coalescing window reads as Alt+letter, exactly as in vim/readline.)
      const next = chunk[i + 1];
      events.push({ type: 'key', name: `alt-${next.toLowerCase()}`, char: next, raw: chunk.slice(i, i + 2) });
      i += 2;
      continue;
    } else if (code === 27) {
      events.push({ type: 'key', name: 'escape', raw: ch });
    } else if (code >= 32) {
      events.push({ type: 'key', name: 'char', char: ch, raw: ch });
    }
    i += 1;
  }
  return events;
}

// ---------------------------------------------------------------------------
// SGR mouse parsing (1006: ESC [ < b ; x ; y M/m)
// ---------------------------------------------------------------------------

const MOUSE_RE = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])/;

export class MouseParser {
  constructor({ rawPassThrough = false } = {}) {
    this.pending = '';
    // rawPassThrough: emit unconsumed bytes as {type:'bytes', text} instead of
    // parsing keys — used when a downstream layer (coalescer) owns key parsing.
    this.rawPassThrough = rawPassThrough;
  }

  /**
   * Feed bytes; returns mouse events and consumes them, leaving non-mouse
   * bytes in `pending` for the key parser.
   * Event: { type:'mouse', action:'down'|'up'|'motion'|'wheel-up'|'wheel-down',
   *          button, x, y, shift, alt, ctrl } (x/y 1-based like terminals).
   */
  feed(chunk) {
    this.pending += chunk;
    const events = [];
    // Only full SGR sequences; anything without the \x1b[< intro is passthrough.
    let m;
    // Multiple sequences may arrive in one chunk.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const idx = this.pending.indexOf('\x1b[<');
      if (idx === -1) break;
      m = MOUSE_RE.exec(this.pending.slice(idx));
      if (!m) break; // incomplete — wait for more bytes
      const before = this.pending.slice(0, idx);
      if (before) events.push(...(this.rawPassThrough ? [{ type: 'bytes', text: before }] : this.keys(before)));
      const bits = Number(m[1]);
      const button = bits & 3;
      const motion = (bits & 32) !== 0;
      const wheel = (bits & 64) !== 0;
      const release = m[4] === 'm';
      let action;
      if (wheel) action = (bits & 1) === 0 ? 'wheel-up' : 'wheel-down';
      else if (motion) action = 'motion';
      else if (release) action = 'up';
      else action = 'down';
      events.push({
        type: 'mouse',
        action,
        button,
        x: Number(m[2]),
        y: Number(m[3]),
        shift: (bits & 4) !== 0,
        alt: (bits & 8) !== 0,
        ctrl: (bits & 16) !== 0,
      });
      this.pending = this.pending.slice(idx + m[0].length);
    }
    if (this.pending) {
      // If a complete-but-nonfinal prefix of a mouse sequence is present, hold it.
      if (/\x1b\[<?\d*;?\d*;?\d*[Mm]?$/.test(this.pending) && this.pending.includes('\x1b[')
          && !MOUSE_RE.test(this.pending) && !/\x1b\[<[0-9;]*$/.test(this.pending) === false) {
        // keep pending as-is (incomplete SGR tail)
      } else if (/\x1b\[[0-9;<]*$/.test(this.pending)) {
        // incomplete escape-ish tail: hold
      } else {
        if (this.rawPassThrough) {
          events.push({ type: 'bytes', text: this.pending });
        } else {
          events.push(...this.keys(this.pending));
        }
        this.pending = '';
      }
    }
    return events;
  }

  keys(bytes) { return parseKeys(bytes); }
}

/** Enable/disable SGR mouse tracking (1006 + any-motion 1003 for hover-less drag). */
export const mouseSeq = {
  on: '\x1b[?1000h\x1b[?1002h\x1b[?1006h',
  off: '\x1b[?1006l\x1b[?1002l\x1b[?1000l',
};

// ---------------------------------------------------------------------------
// Bracketed paste (2004)
// ---------------------------------------------------------------------------

export const pasteSeq = { on: '\x1b[?2004h', off: '\x1b[?2004l' };

/** Groups bytes between \x1b[200~ and \x1b[201~ into one paste event. */
export class PasteBuffer {
  constructor({ rawPassThrough = false } = {}) {
    this.active = false; this.buf = ''; this.intro = '';
    this.rawPassThrough = rawPassThrough;
  }

  feed(chunk) {
    const events = [];
    this.intro += chunk;
    let work = this.intro;
    while (work.length) {
      if (!this.active) {
        const start = work.indexOf('\x1b[200~');
        if (start === -1) {
          // Emit everything up to the last possible sequence intro.
          const keep = /(?:\x1b\[\d*)?$/.exec(work)[0] || '';
          const head = work.slice(0, work.length - keep.length);
          if (head) {
            if (this.rawPassThrough) events.push({ type: 'bytes', text: head });
            else events.push(...parseKeys(head));
          }
          this.intro = keep;
          return events;
        }
        if (start > 0) {
          if (this.rawPassThrough) events.push({ type: 'bytes', text: work.slice(0, start) });
          else events.push(...parseKeys(work.slice(0, start)));
        }
        this.active = true;
        this.buf = '';
        work = work.slice(start + 6);
        continue;
      }
      const end = work.indexOf('\x1b[201~');
      if (end === -1) { this.buf += work; work = ''; continue; }
      this.buf += work.slice(0, end);
      events.push({ type: 'paste', text: this.buf.replace(/\r\n/g, '\n').replace(/\r/g, '\n') });
      this.buf = '';
      this.active = false;
      work = work.slice(end + 6);
    }
    this.intro = '';
    return events;
  }
}

// ---------------------------------------------------------------------------
// Escape coalescer
// ---------------------------------------------------------------------------

/**
 * Buffers ESC-led bytes for `waitMs` so split sequences reunite. A lone Esc
 * (nothing follows within the window) is emitted as an escape key; a complete
 * known sequence flushes immediately.
 */
export class EscapeCoalescer {
  constructor(waitMs = 50) {
    this.waitMs = waitMs;
    this.buf = '';
    this.timer = null;
    this.onEvent = null; // set by the app
  }

  /** Feed raw bytes; returns events that are ready NOW (may be empty). */
  feed(chunk) {
    this.buf += chunk;
    const events = [];
    // Flush every complete sequence up front.
    while (this.buf.length) {
      const evs = parseKeys(this.buf);
      // parseKeys treats a leading lone \x1b as escape even if more follows.
      if (this.buf.startsWith('\x1b') && !this.isCompleteSequence(this.buf)) {
        // Incomplete sequence: wait (coalesce) unless only the ESC arrived and
        // the window already elapses via timer.
        break;
      }
      // Consume what parseKeys matched (by re-deriving lengths).
      let used = 0;
      for (const e of evs) used += e.raw.length;
      if (used === 0) break;
      events.push(...evs);
      this.buf = this.buf.slice(used);
      // If what remains starts with ESC and is incomplete, the loop breaks next pass.
    }
    if (this.buf.startsWith('\x1b') && this.buf.length > 1 && this.isCompleteSequence(this.buf)) {
      events.push(...parseKeys(this.buf));
      this.buf = '';
      return events;
    }
    if (this.buf.startsWith('\x1b')) {
      this.arm();
    } else if (this.buf) {
      // Non-ESC remainder is always flushable.
      events.push(...parseKeys(this.buf));
      this.buf = '';
      this.disarm();
    }
    return events;
  }

  isCompleteSequence(buf) {
    if (!buf.startsWith('\x1b')) return false;
    if (buf.length === 1) return false;
    // CSI: \x1b [ ... final byte 0x40–0x7e
    if (buf[1] === '[') {
      return /[\x40-\x7e]/.test(buf.slice(2));
    }
    // SS3: \x1b O <one char>
    if (buf[1] === 'O') return buf.length >= 3;
    return false;
  }

  arm() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      const evs = parseKeys(this.buf);
      this.buf = '';
      this.timer = null;
      if (this.onEvent) evs.forEach((e) => this.onEvent(e));
    }, this.waitMs);
    if (typeof this.timer.unref === 'function') this.timer.unref();
  }

  disarm() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
  }

  /** Force-flush any pending buffer (on shutdown). */
  flush() {
    const evs = this.buf ? parseKeys(this.buf) : [];
    this.buf = '';
    this.disarm();
    return evs;
  }
}
