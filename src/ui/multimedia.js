/**
 * Multimedia & rich-terminal primitives (feasibility phase — docs/multimedia.md).
 *
 * Pure string builders: every function returns bytes to write to stdout, so
 * they unit-test without a terminal and degrade to empty strings when the
 * capability is absent. Nothing here assumes a graphics-capable terminal.
 *
 * Tiers (docs/multimedia.md §2):
 *   M0 universal  — OSC 8 links, BEL, DECSCUSR cursor shapes, OSC 9 notify
 *   M1 graphics   — kitty / iTerm2 / sixel inline images (probe-gated)
 *   M2 styling    — SGR 4:3 curly underline (error squiggles), 24-bit color
 *   not feasible  — audio playback, video, font control (docs/multimedia.md §5)
 */

// ---------------------------------------------------------------- M0: links

/** The app's base URL for OSC 8 links, overridable for tests. */
export const DOC_BASE = 'https://developer.mozilla.org/en-US/docs/';

/**
 * OSC 8 hyperlink (M0 — supported by every modern terminal; unknown
 * terminals ignore the wrapper and print the label as plain text).
 * @param {string} url destination
 * @param {string} label visible text
 * @param {string} [id] optional link id so terminals dedupe hover state
 */
export function osc8(url, label, id) {
  const idPart = id ? `;id=${id}` : '';
  return `\x1b]8;;${url}${idPart}\x1b\\${label}\x1b]8;;\x1b\\`;
}

/** MDN doc link for a lesson/challenge topic, as an OSC 8 string. */
export function mdnLink(slug, label) {
  return osc8(`${DOC_BASE}${slug}`, label || slug, `mdn-${slug}`);
}

// ---------------------------------------------------------------- M0: bell

/** BEL (M0): universal, rendered as a visual flash when muted. */
export const BEL = '\x07';

// ---------------------------------------------------------------- M0: cursor

/** DECSCUSR cursor shapes (M0): vim-mode affordance. */
export const cursorShape = {
  block: '\x1b[2 q',
  bar: '\x1b[6 q',
  underline: '\x1b[4 q',
  /** Restore the terminal default. */
  reset: '\x1b[0 q',
};

// ---------------------------------------------------------------- M0: notify

/**
 * Desktop notification via OSC 9 (iTerm2/Windows Terminal/kitty-ish) with
 * OSC 777 fallback body (rxvt-likes). Fire after long checks complete.
 */
export function notify(title, body) {
  const esc = (s) => String(s).replace(/[\x07\\\x1b]/g, '');
  return `\x1b]9;${esc(title)}\x07` + (body ? `\x1b]777;notify;${esc(title)};${esc(body)}\x07` : '');
}

// ---------------------------------------------------------------- M2: styling

/** SGR 4:3 curly underline (M2): error squiggles under editor tokens. */
export function squiggle(text, colorCode = 1) {
  return `\x1b[4:3;58:5:${colorCode}m${text}\x1b[24;59m`;
}

// ---------------------------------------------------------------- M1: graphics

/**
 * Graphics capability hints from the environment (M1). Static env heuristics
 * only — the authoritative probe (DA1 + kitty graphics query with a stdin
 * timeout) is a Phase 1 task that runs before the dispatcher takes the
 * terminal, reusing the input pipeline to read responses.
 *
 * Returns { sixel, kitty, iterm2, protocol } where protocol names the
 * preferred inline-image protocol or null.
 */
export function graphicsFromEnv(env = process.env) {
  const term = String(env.TERM || '');
  const program = String(env.TERM_PROGRAM || '');
  const kittyWindow = !!env.KITTY_WINDOW_ID;
  const iterm = program === 'iTerm.app' || program === 'WezTerm' || !!env.WEZTERM_EXECUTABLE;
  const ghostty = !!env.GHOSTTY_RESOURCES_DIR || /ghostty/i.test(term);

  // Bare `xterm` does NOT imply sixel (reference xterm needs --enable-sixel
  // and distros rarely ship it); only explicit sixel-capable programs claim it.
  const sixel = iterm || ghostty || /foot|wezterm|contour|mlterm/i.test(term) || !!env.WT_SESSION;
  const kitty = kittyWindow || /kitty|wezterm|ghostty/i.test(term) || program === 'WezTerm' || ghostty;
  const iterm2 = iterm || ghostty;

  let protocol = null;
  if (kitty) protocol = 'kitty';
  else if (iterm2) protocol = 'iterm2';
  else if (sixel) protocol = 'sixel';

  return { sixel, kitty, iterm2, protocol };
}

/**
 * iTerm2 inline image (M1): base64 PNG/JPEG wrapped in the 1337 sequence.
 * Kitty and WezTerm also honor it — one builder covers the two most common
 * graphics paths; the kitty chunked protocol is added when the probe lands.
 */
export function iterm2Image(base64, { name = 'image.png', width, height } = {}) {
  const size = [];
  if (width) size.push(`width=${width}`);
  if (height) size.push(`height=${height}`);
  const args = [`name=${Buffer.from(name).toString('base64')}`, 'inline=1', ...size].join(';');
  const body = base64.length > 4096
    ? `\x1b]1337;File=${args};size=${base64.length}:\n${base64}\x1b\\`
    : `\x1b]1337;File=${args}:${base64}\x1b\\`;
  return body;
}
