/**
 * OSC52 clipboard (overhaul §8.4, task 2.3: "OSC52 encoder + capability
 * heuristic").
 *
 * A terminal cannot be asked to read the system clipboard, but it can be sent
 * one: `ESC ] 52 ; c ; <base64> BEL`. That is the whole protocol, and the
 * interesting parts are all about when it does *not* work:
 *
 *   - inside **tmux** the sequence must be wrapped in a passthrough
 *     (`ESC Ptmux; ESC ESC ] 52 … BEL ESC \`) or tmux eats it;
 *   - inside **screen** it needs `ESC P ESC ] 52 … ESC \`;
 *   - terminals (and multiplexers) that do not implement it will print the
 *     base64 as garbage, so we only send it when the environment says we are
 *     allowed to;
 *   - a huge yank must be chunked, or the terminal's input buffer overflows.
 *
 * So this module is mostly a policy module: `clipboardPolicy()` decides, from
 * the environment and the user's settings, whether a copy is safe, and
 * `copySequence()` produces the exact bytes (unit-tested against the spec's
 * examples). The user's override wins over the heuristic in both directions.
 */

/** OSC52's own practical limit; terminals truncate or drop larger payloads. */
export const MAX_PAYLOAD = 74_000;

/** The BEL-terminated form (what most terminals accept). */
const BEL = '\u0007';
const ST = '\u001b\\';

/**
 * Base64 for UTF-8 text, without Buffer so the encoder stays usable anywhere.
 * (Handles the surrogate pairs a yank of emoji produces.)
 */
export function toBase64(text) {
  const bytes = utf8Bytes(String(text ?? ''));
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += alphabet[b0 >> 2];
    out += alphabet[((b0 & 3) << 4) | ((b1 === undefined ? 0 : b1) >> 4)];
    out += b1 === undefined ? '=' : alphabet[((b1 & 15) << 2) | ((b2 === undefined ? 0 : b2) >> 6)];
    out += b2 === undefined ? '=' : alphabet[b2 & 63];
  }
  return out;
}

function utf8Bytes(str) {
  const out = [];
  for (const ch of str) {
    let cp = ch.codePointAt(0);
    if (cp < 0x80) {
      out.push(cp);
    } else if (cp < 0x800) {
      out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    } else if (cp < 0x10000) {
      out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    } else {
      out.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      );
    }
  }
  return out;
}

/** `\x1b]52;c;<base64>\x07` — the bare sequence, no multiplexer wrapping. */
export function rawSequence(text, { selection = 'c' } = {}) {
  return `\u001b]52;${selection};${toBase64(text)}${BEL}`;
}

/**
 * Wrap a sequence for the detected multiplexer.
 * tmux needs each ESC of the inner sequence doubled.
 */
export function wrapSequence(sequence, { tmux = false, screen = false } = {}) {
  if (tmux) return `\u001bPtmux;${sequence.replace(/\u001b/g, '\u001b\u001b')}${ST}`;
  if (screen) return `\u001bP${sequence}${ST}`;
  return sequence;
}

/**
 * The bytes to write for a copy, or `null` when the policy says not to.
 *
 * @param {string} text
 * @param {{ policy?: object, selection?: string }} [opts]
 */
export function copySequence(text, { policy, selection = 'c' } = {}) {
  const p = policy || clipboardPolicy();
  if (!p.allowed) return null;
  const body = String(text ?? '');
  if (!body) return null;
  if (body.length > MAX_PAYLOAD) return null; // refused rather than truncated
  return wrapSequence(rawSequence(body, { selection }), p);
}

/**
 * Decide whether OSC52 may be used.
 *
 * The heuristic: allowed on a TTY, unless the environment opts out
 * (`FULLSTACK_CLIPBOARD=off`, `NO_OSC52=1`, `TERM=dumb`, or a CI run), and a
 * user setting (`settings.clipboard: 'osc52' | 'off'`) always wins.
 *
 * @param {{ env?: object, isTTY?: boolean, setting?: string|null }} [opts]
 */
export function clipboardPolicy({ env = process.env, isTTY = !!(process.stdout && process.stdout.isTTY), setting = null } = {}) {
  const tmux = !!env.TMUX;
  const screen = !tmux && String(env.TERM || '').startsWith('screen');
  const base = { tmux, screen, why: 'tty' };

  if (setting === 'off') return { ...base, allowed: false, why: 'setting' };
  if (setting === 'osc52') return { ...base, allowed: true, why: 'setting' };
  if (String(env.FULLSTACK_CLIPBOARD || '').toLowerCase() === 'off') return { ...base, allowed: false, why: 'env FULLSTACK_CLIPBOARD' };
  if (env.NO_OSC52) return { ...base, allowed: false, why: 'env NO_OSC52' };
  if (env.CI) return { ...base, allowed: false, why: 'ci' };
  if (!isTTY) return { ...base, allowed: false, why: 'not-a-tty' };
  if (String(env.TERM || '') === 'dumb') return { ...base, allowed: false, why: 'dumb-terminal' };
  return { ...base, allowed: true, why: 'tty' };
}

/** One-line explanation for the clipboard UI (palette, `:registers` panel). */
export function clipboardStatus(policy) {
  return policy.allowed
    ? `system clipboard via OSC52${policy.tmux ? ' (tmux passthrough)' : policy.screen ? ' (screen passthrough)' : ''}`
    : `system clipboard unavailable (${policy.why}) — yanks stay in the TUI registers`;
}
