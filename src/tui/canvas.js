/**
 * The rendering core.
 *
 * Everything on screen is composed of *segments*: `{ text, s }` where `s` is a
 * tiny style object `{ fg, bg, bold, dim, italic, underline, reverse }`.
 *
 * A frame is an array of rows and a row is an array of segments. Screens are
 * double-buffered line by line so redraws never flicker, even in slow
 * terminals: only rows whose rendered string changed get re-emitted.
 */

import { seq } from './ansi.js';

/** Build a segment. */
export const seg = (text, s = {}) => ({ text: String(text), s });

/** Turn a style object into the escape prefix for it. */
export function styleCode(s = {}) {
  let out = '';
  if (s.bold) out += seq.bold;
  if (s.dim) out += seq.dim;
  if (s.italic) out += seq.italic;
  if (s.underline) out += seq.underline;
  if (s.blink) out += seq.blink;
  if (s.reverse) out += seq.reverse;
  if (s.fg != null) out += seq.fg(s.fg);
  if (s.bg != null) out += seq.bg(s.bg);
  return out;
}

/** Render segments to a string with escapes. */
export function paint(segs) {
  let out = '';
  for (const x of segs) {
    if (!x || !x.text) continue;
    out += styleCode(x.s) + x.text + seq.reset;
  }
  return out;
}

/** Visible width of a segment list (what we assume each char takes). */
export const width = (segs) => segs.reduce((n, x) => n + (x && x.text ? x.text.length : 0), 0);

/** Trim a segment list to at most `max` visible characters. */
export function clip(segs, max) {
  const out = [];
  let used = 0;
  for (const x of segs) {
    // A malformed segment must never take the whole TUI down mid-session.
    if (!x || x.text == null) continue;
    if (used >= max) break;
    const room = max - used;
    const text = String(x.text);
    if (text.length <= room) {
      out.push(text === x.text ? x : { text, s: x.s });
      used += text.length;
    } else {
      out.push({ text: text.slice(0, room), s: x.s });
      used = max;
    }
  }
  return out;
}

/** Clip, then pad with `fill` so the row is exactly `w` characters. */
export function fit(segs, w, fill = {}) {
  const trimmed = clip(segs.filter(Boolean), w);
  const used = width(trimmed);
  if (used < w) trimmed.push(seg(' '.repeat(w - used), fill));
  return trimmed;
}

/** Overlay a segment list at a given offset inside a full-width row. */
export function overlay(w, fill, offset, segs) {
  const left = clip([seg(' '.repeat(Math.max(0, offset)), fill)], w);
  return fit([...left, ...segs], w, fill);
}

// ---------------------------------------------------------------------------
// Inline markdown (a deliberately tiny subset: **bold**, `code`, *italic*)
// ---------------------------------------------------------------------------

const INLINE_RE = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\n]+\*)/g;

/** Parse inline markdown into styled segments. */
export function inline(text, base = {}) {
  const parts = String(text).split(INLINE_RE).filter((p) => p !== '');
  const out = [];
  for (const p of parts) {
    if (/^\*\*[^*]+\*\*$/.test(p)) out.push(seg(p.slice(2, -2), { ...base, bold: true }));
    else if (/^`[^`]+`$/.test(p)) out.push(seg(p.slice(1, -1), { ...base, bold: false, bg: base.codeBg ?? base.bg, fg: base.codeFg ?? base.fg }));
    else if (/^\*[^*\n]+\*$/.test(p)) out.push(seg(p.slice(1, -1), { ...base, italic: true }));
    else out.push(seg(p, base));
  }
  return out;
}

/**
 * Wrap a segment list to `w` columns, honouring explicit newlines.
 * Word-aware, with a hard split for words longer than the line.
 */
export function wrap(segs, w) {
  const lines = [];
  let cur = [];
  let used = 0;

  const flush = () => {
    // trim trailing whitespace
    while (cur.length && /^[\s]*$/.test(cur[cur.length - 1].text)) {
      used -= cur[cur.length - 1].text.length;
      cur.pop();
    }
    lines.push(cur);
    cur = [];
    used = 0;
  };

  const emit = (text, s) => {
    const chunks = String(text).split('\n');
    chunks.forEach((chunk, idx) => {
      if (idx > 0) flush();
      if (!chunk) return;
      const tokens = chunk.match(/\S+|\s+/g) || [];
      for (const tk of tokens) {
        if (/^\s+$/.test(tk)) {
          if (used > 0) {
            cur.push(seg(tk, s));
            used += tk.length;
          }
          continue;
        }
        if (used + tk.length > w && used > 0) flush();
        if (tk.length > w) {
          let rest = tk;
          while (rest.length > w) {
            if (used > 0) flush();
            cur.push(seg(rest.slice(0, w), s));
            used = w;
            flush();
            rest = rest.slice(w);
          }
          if (rest) {
            cur.push(seg(rest, s));
            used += rest.length;
          }
        } else {
          cur.push(seg(tk, s));
          used += tk.length;
        }
      }
    });
  };

  for (const x of segs) emit(x.text, x.s);
  if (cur.length || lines.length === 0) flush();
  return lines;
}

/** Convenience: markdown text straight to wrapped segment lines. */
export function paragraph(text, w, base = {}) {
  return wrap(inline(text, base), w);
}

// ---------------------------------------------------------------------------
// Frames
// ---------------------------------------------------------------------------

/**
 * Compose a frame of exactly `h` rows. Extra rows are dropped, missing rows
 * are blanked, and every row is padded to `w` so diffs are byte-stable.
 */
export function frame(rows, w, h, fill = {}) {
  const out = [];
  for (let i = 0; i < h; i += 1) {
    const r = rows[i] || [];
    out.push(fit(r, w, fill));
  }
  return out;
}

/** Double-buffered writer. Only changed rows are written to the terminal. */
export class Screen {
  constructor(out) {
    this.out = out;
    this.prev = [];
    this.w = 0;
    this.h = 0;
  }

  resize(w, h) {
    if (w !== this.w || h !== this.h) {
      this.w = w;
      this.h = h;
      this.prev = [];
      this.out.write(seq.clearAll + seq.home);
    }
  }

  present(rows, fill = {}) {
    const buffer = [];
    for (let i = 0; i < this.h; i += 1) {
      const line = paint(fit(rows[i] || [], this.w, fill));
      if (this.prev[i] === line) continue;
      buffer.push(seq.moveTo(i + 1, 1) + line);
      this.prev[i] = line;
    }
    if (buffer.length) this.out.write(buffer.join(''));
  }

  invalidate() {
    this.prev = [];
  }
}
