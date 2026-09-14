/**
 * Graphics capability probe (M1, docs/multimedia.md §4).
 *
 * Env heuristics (graphicsFromEnv) are indicative; this probe is the
 * authoritative answer. Sequence:
 *
 *   1. Write the kitty graphics query (a 1×1 'a=q' image ask) and DA1
 *      (`ESC [c`) — the terminal's attribute response discloses sixel.
 *   2. Collect stdin bytes for `timeoutMs`, scanning for:
 *        - kitty graphics response `ESC_G...ESC\\`  → kitty protocol
 *        - DA1 response containing `;4;`/`;4c`      → sixel
 *      (terminals answer DA1 even when they lack graphics, so absence of a
 *      graphics ack + presence of DA1 means "no graphics").
 *   3. Resolve with `{ kitty, sixel, protocol }`; on timeout, return the env
 *      heuristic result (never worse than not probing).
 *
 * All I/O is injectable for tests: feed simulated terminal responses and
 * collect written bytes without a real pty.
 */
import { graphicsFromEnv } from './multimedia.js';

const KITTY_QUERY = '\x1b_Gi=31,s=1,v=1,a=q,t=d,f=24;AAAA\x1b\\';
const DA1 = '\x1b[c';

export function probeGraphics({
  write,
  onData,
  removeOnData,
  env = process.env,
  timeoutMs = 150,
} = {}) {
  return new Promise((resolve) => {
    const fallback = graphicsFromEnv(env);
    let buf = '';
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      removeOnData(handler);
      resolve(result);
    };

    const handler = (chunk) => {
      buf += chunk.toString();
      const kittyAck = /\x1b_Gi=31;(?=[^\x1b]*\x1b\\)/.test(buf) || buf.includes('\x1b_Gi=31;OK\x1b\\');
      // DA1 reply: ESC [ ? … c — sixel is attribute 4.
      const da1 = /\x1b\[\?[\d;]*c/.exec(buf);
      const sixel = !!da1 && /(?:^|;|,)4(?:;|,|c|$)/.test(da1[0].replace('\x1b[?', '').replace('c', ';'));
      if (kittyAck || da1) {
        finish({
          kitty: kittyAck || fallback.kitty,
          sixel: sixel || fallback.sixel,
          protocol: kittyAck ? 'kitty' : (sixel ? 'sixel' : (fallback.kitty || fallback.iterm2 ? fallback.protocol : null)),
        });
      }
    };

    const timer = setTimeout(() => finish({ ...fallback, probed: false }), timeoutMs);

    onData(handler);
    write(KITTY_QUERY);
    write(DA1);
  });
}

/**
 * Convenience wrapper for the real terminal (raw stdin before the dispatcher
 * claims it). Returns the same result as probeGraphics.
 */
export async function probeGraphicsTTY({ timeoutMs = 150 } = {}) {
  if (!process.stdout.isTTY || process.env.CI) {
    return { ...graphicsFromEnv(), probed: false };
  }
  process.stdin.setRawMode?.(true);
  const result = await probeGraphics({
    write: (s) => process.stdout.write(s),
    onData: (fn) => process.stdin.on('data', fn),
    removeOnData: (fn) => process.stdin.removeListener('data', fn),
    timeoutMs,
  });
  process.stdin.setRawMode?.(false);
  return result;
}
