/**
 * Capability detection (spec §7.1).
 *
 * Probed once at startup; drives theme tier, icon set, mouse mode. The icon
 * probe (Nerd Font / `FULLSTACK_ICONS`) lives in theme/icons.js and is folded
 * into the profile here so screens can read one `caps` object.
 */
import { autoIconSet } from './theme/icons.js';

export function detectCapabilities(env = process.env, isTTY = process.stdout.isTTY) {
  const term = String(env.TERM || '');
  const colorterm = String(env.COLORTERM || '');
  const noColor = !!env.NO_COLOR || String(env.FORCE_COLOR || '') === '0';

  // -- color depth -----------------------------------------------------------
  let colorDepth = 0;
  if (!noColor) {
    if (term === 'dumb') {
      colorDepth = 0;
    } else if (colorterm === 'truecolor' || /-truecolor/.test(term) || env.FORCE_COLOR === '3') {
      colorDepth = 24;
    } else if (colorterm === '24bit') {
      colorDepth = 24;
    } else if (term || isTTY) {
      colorDepth = 8; // 256-color floor (spec: modern-era floor)
    } else {
      colorDepth = 8; // non-TTY: still render colors into the fake stream (tests)
    }
  }

  // -- unicode ----------------------------------------------------------------
  const noUnicode = !!env.NO_UNICODE;
  const wtSession = !!env.WT_SESSION;
  const unicode = !noUnicode && term !== 'dumb' && (wtSession || !/^win|^cygwin/i.test(term));

  // -- TTY --------------------------------------------------------------------
  const tty = !!isTTY && term !== 'dumb';

  // -- tier (spec §7.1 degrade matrix) -----------------------------------------
  let tier;
  if (tty && colorDepth >= 24 && unicode) tier = 'A';
  else if (tty && colorDepth >= 8 && unicode) tier = 'B';
  else if (tty && unicode) tier = 'C';
  else tier = 'D';

  // -- icons (overhaul §7.1): env override → known-Nerd terminal → unicode → ascii
  const icons = autoIconSet(env, unicode);

  return { isTTY: !!isTTY, tty, colorDepth, unicode, tier, term, colorterm, icons };
}
