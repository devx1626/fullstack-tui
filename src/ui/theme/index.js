/**
 * Theme resolution (spec §7.1/§7.2).
 *
 * Ink accepts hex colors, which are always emitted as 24-bit sequences by
 * chalk (ink's color engine). For tier B/C we down-map the hex tokens to the
 * nearest 256 palette entry — as ink's own `ansi256(n)` STRING form, because
 * its colorizer calls `color.startsWith(...)` and a bare number throws
 * (`color.startsWith is not a function`, caught by the tier smoke in
 * tools/check.js). For tier D all color is dropped. Chrome asks only for theme
 * tokens and never for raw values.
 */
import { midnight, paper, themes } from './themes.js';

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Nearest xterm-256 index for a hex color (6×6×6 cube + greys). */
export function hexTo256(hex) {
  if (!HEX_RE.test(hex)) return null;
  const { r, g, b } = hexToRgb(hex);
  const cube = [0, 95, 135, 175, 215, 255];
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < 24; i += 1) {
    const ri = cube[(i / 36) | 0];
    const gi = cube[((i / 6) | 0) % 6];
    const bi = cube[i % 6];
    const d = (r - ri) ** 2 + (g - gi) ** 2 + (b - bi) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = 16 + i;
    }
  }
  for (let i = 0; i < 24; i += 1) {
    const v = 8 + i * 10;
    const d = (r - v) ** 2 + (g - v) ** 2 + (b - v) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = 232 + i;
      // E1 fix: no break here — several grey entries can improve in sequence
      // for dark inputs, so the nearest grey is only found by scanning all 24.
    }
  }
  return best;
}

function mapTheme(theme, depth) {
  const out = { name: theme.name };
  for (const [k, v] of Object.entries(theme)) {
    if (k === 'name') continue;
    if (depth >= 24) {
      out[k] = v; // hex passthrough
    } else {
      const idx = hexTo256(v);
      out[k] = idx == null ? v : (depth === 0 ? undefined : `ansi256(${idx})`);
    }
  }
  return out;
}

export function themeForCapabilities(caps, requested) {
  // Selection order (spec §7.2): FULLSTACK_THEME env → saved settings →
  // COLORFGBG heuristic → default. Names are case-insensitive and looked up
  // through the `themes` map, so adding a palette there is all it takes to
  // make it selectable — no branch to remember.
  const key = String(requested || '').toLowerCase();
  let base = Object.prototype.hasOwnProperty.call(themes, key) ? themes[key] : null;
  if (!base) {
    // Auto: COLORFGBG heuristic like the classic app, else dark. An unknown
    // name lands here too rather than silently painting the wrong palette.
    const cfg = process.env.COLORFGBG;
    const bg = cfg ? Number(String(cfg).split(';').pop()) : NaN;
    base = Number.isFinite(bg) && bg >= 7 ? paper : midnight;
  }

  const depth = caps.colorDepth;
  const mapped = mapTheme(base, depth);
  if (depth === 0) {
    // Tier D: strip every color token to undefined so <Text color={undefined}>
    // renders plain.
    for (const k of Object.keys(mapped)) if (k !== 'name') mapped[k] = undefined;
  }
  return mapped;
}
