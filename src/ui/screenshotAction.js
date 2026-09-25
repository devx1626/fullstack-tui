/**
 * M1 screenshot action (P0-3, docs/multimedia.md §3/§6): the decision layer
 * between the browser route and the heavyweight pieces (the graphics probe
 * and the lazy Playwright renderer). Every branch returns a declarative
 * result — guidance lines OR an escape string — so the route never imports
 * playwright-adjacent code directly and every path is unit-testable without
 * a pty and without Playwright installed.
 *
 * Gating ladder ("probe, don't guess", docs/multimedia.md §4):
 *   1. FULLSTACK_SCREENSHOT=playwright must opt the feature in;
 *   2. the terminal must have an inline-image protocol — the boot-time probe
 *      when one ran, else the env heuristic (never worse than not probing);
 *   3. Playwright must be importable (lazy — see screenshot.js) with graceful
 *      guidance when it is not.
 * CI / non-TTY / NO_COLOR never probe (graphicsProbe.js) and the env
 * heuristics stay empty there, so the action hides itself in exactly the
 * environments where it could not render.
 */
import { graphicsFromEnv } from './multimedia.js';

/** True when the feature is opted in via the environment. */
export function screenshotEnvEnabled(env = process.env) {
  return env.FULLSTACK_SCREENSHOT === 'playwright';
}

/**
 * Which inline-image protocol the terminal supports, trusting a real probe
 * result over env heuristics when both exist (the probe is authoritative —
 * TERM_PROGRAM spoofs, SSH strips env).
 *
 * @param {{ graphics?: { kitty?, sixel?, iterm2?, protocol? } | null, probed?: boolean } | null} probe
 *        the boot-time probe result stashed on services (may be null)
 * @param {object} [env] environment for the heuristic fallback
 * @returns {string|null} 'kitty' | 'iterm2' | 'sixel' | null
 */
export function screenshotProtocol(probe, env = process.env) {
  if (probe && probe.graphics) {
    const g = probe.graphics;
    if (g.kitty) return 'kitty';
    if (g.iterm2) return 'iterm2';
    if (g.sixel) return 'sixel';
    return null;
  }
  if (probe && probe.probed) return null; // probed and answered: no graphics
  const g = graphicsFromEnv(env);
  return g.protocol;
}

/**
 * Should `browser.screenshot` exist for this session?
 * @returns {{ available: boolean, reason: 'disabled' | 'no-protocol' | 'ready' }}
 */
export function screenshotAvailability(probe, env = process.env) {
  if (!screenshotEnvEnabled(env)) return { available: false, reason: 'disabled' };
  if (!screenshotProtocol(probe, env)) return { available: false, reason: 'no-protocol' };
  return { available: true, reason: 'ready' };
}

/**
 * Run the action for the current page parts. Never throws: every failure
 * mode degrades to guidance lines the browser shows in its footer notice.
 *
 * @param {{ html: string, css?: string, js?: string }} parts the assembled page
 * @param {{ graphics?: object | null, probed?: boolean } | null} probe boot probe result
 * @param {object} [env] environment override for tests
 * @returns {Promise<{ kind: 'disabled' | 'no-protocol' | 'not-installed' | 'no-protocol-after-render' | 'rendered', lines?: string[], image?: string }>}
 */
export async function runScreenshotAction(parts, probe, env = process.env) {
  const avail = screenshotAvailability(probe, env);
  if (!avail.available) {
    return avail.reason === 'disabled'
      ? { kind: 'disabled', lines: ['Screenshots are opt-in: restart with FULLSTACK_SCREENSHOT=playwright.'] }
      : { kind: 'no-protocol', lines: ['This terminal has no inline-image protocol (kitty / iTerm2 / sixel) — nothing to draw into.'] };
  }
  const { isPlaywrightAvailable, notAvailableMessage, renderInlineImage } = await import('./screenshot.js');
  if (!(await isPlaywrightAvailable())) {
    return { kind: 'not-installed', lines: notAvailableMessage() };
  }
  const image = await renderInlineImage(parts, probe && probe.graphics ? probe.graphics : graphicsFromEnv(env));
  if (!image) return { kind: 'no-protocol-after-render', lines: ['No inline-image protocol available for the rendered image.'] };
  return { kind: 'rendered', image };
}
