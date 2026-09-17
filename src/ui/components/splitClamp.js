/**
 * Split sizing math (pure, shared by mouse drag, keyboard nudge and the
 * remembered per-screen ratios in `Settings.paneRatio`).
 *
 * Two units are in play and they must not be confused:
 *   - COLUMNS (`clampSplit`) — what the component lays out with.
 *   - RATIOS (`clampRatio`) — what `.data/settings.json` remembers, so a
 *     remembered layout survives a terminal resize (task 1.2).
 */

/** Fraction of the total width a pane may take (either side). */
export const MIN_RATIO = 0.15;
export const MAX_RATIO = 0.85;

/** One keyboard nudge (`<C-left>` / `<C-right>`) in ratio units. */
export const RATIO_STEP = 0.05;

/** Clamp columns so both panes keep at least minLeft/minRight. */
export function clampSplit(totalWidth, leftWidth, minLeft = 12, minRight = 12) {
  const max = Math.max(0, totalWidth - minRight);
  const min = Math.min(minLeft, max);
  return Math.max(min, Math.min(leftWidth, max));
}

/** Clamp a remembered ratio into [MIN_RATIO, MAX_RATIO]. */
export function clampRatio(ratio) {
  const r = Number(ratio);
  if (!Number.isFinite(r)) return MIN_RATIO;
  return Math.max(MIN_RATIO, Math.min(MAX_RATIO, r));
}

/** Step a ratio by `delta`, clamped. Used by the nudge commands. */
export function nudgeRatio(ratio, delta = RATIO_STEP) {
  return clampRatio(clampRatio(ratio) + delta);
}

/** Ratio → clamped left-pane columns for a given terminal width. */
export function ratioToColumns(ratio, totalWidth, minLeft = 12, minRight = 12) {
  return clampSplit(totalWidth, Math.round(clampRatio(ratio) * totalWidth), minLeft, minRight);
}

/** Clamped left-pane columns → ratio, so drag and nudge store the same unit. */
export function columnsToRatio(columns, totalWidth) {
  if (!totalWidth || totalWidth <= 0) return MIN_RATIO;
  return clampRatio(columns / totalWidth);
}
