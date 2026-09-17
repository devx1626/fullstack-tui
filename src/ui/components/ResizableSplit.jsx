/**
 * ResizableSplit (overhaul §7.4, task 1.2).
 *
 * The Phase 1 slice of this feature was `splitPane.jsx` (a drag-ready layout)
 * plus `splitClamp.js` (the shared math). What was missing is the part the
 * acceptance criterion names: *drag + keyboard nudge + persistence +
 * reset-to-default*. Those live here:
 *
 *   useResizableSplit(...)   one hook owning the ratio for a screen's pane:
 *                            - seeds from `.data/settings.json` (`panes.<screen>.<pane>`)
 *                            - mouse drag on the divider column
 *                            - `nudge(±RATIO_STEP)` for the nudge commands
 *                            - `reset()` for the palette's reset-to-default
 *                            - every change is written straight back to settings,
 *                              as a RATIO, so a remembered layout survives a resize
 *
 * Routes own behavior in this architecture (see routes.jsx), so the hook is
 * called by a ROUTE and its values are passed down to the screen as props; the
 * screen keeps a local fallback so it still renders standalone in tests.
 *
 * Mouse notes: SGR mouse x/y are 1-based (input/index.js), so the divider at
 * 0-based column `leftWidth` is reported at `x === leftWidth + 1`. Only the
 * divider ±1 column starts a drag, so clicking inside a pane is left to the
 * screen (a future click-to-inspect / click-to-caret handler).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SplitPane } from './splitPane.jsx';
import {
  RATIO_STEP,
  clampRatio,
  columnsToRatio,
  nudgeRatio,
  ratioToColumns,
} from './splitClamp.js';

/**
 * @param {object} opts
 * @param {string} opts.screen   screen id the ratio is remembered under (e.g. 'challenge')
 * @param {string} opts.pane     pane key inside that screen (e.g. 'brief')
 * @param {object} opts.settings Settings instance (`.data/settings.json`); optional
 * @param {number} opts.totalWidth terminal width in columns
 * @param {number} [opts.minLeft]
 * @param {number} [opts.minRight]
 * @param {number} [opts.fallbackRatio] default when nothing is remembered
 */
export function useResizableSplit({
  screen,
  pane,
  settings,
  totalWidth,
  minLeft = 20,
  minRight = 24,
  fallbackRatio = 0.42,
}) {
  const remembered = settings && typeof settings.paneRatio === 'function'
    ? settings.paneRatio(screen, pane, fallbackRatio)
    : clampRatio(fallbackRatio);

  const [ratio, setRatio] = useState(remembered);
  const [dragging, setDragging] = useState(false);
  // Both the ratio AND the drag flag are read through refs. The mouse handler
  // must never read render state: a terminal sends press+motion in one burst,
  // and a handler closed over `dragging === false` would drop the first motion
  // of every fast drag (`setDragging` only reaches a re-render after the tick).
  const ratioRef = useRef(ratio);
  ratioRef.current = ratio;
  const draggingRef = useRef(false);

  const commit = useCallback((next) => {
    const clamped = clampRatio(next);
    ratioRef.current = clamped;
    setRatio(clamped);
    if (settings && typeof settings.setPaneRatio === 'function') settings.setPaneRatio(screen, pane, clamped);
    return clamped;
  }, [pane, screen, settings]);

  // A remembered ratio from a previous run arrives with the settings instance;
  // adopt it when it changes (settings are a singleton, but tests swap them).
  useEffect(() => {
    const saved = settings && typeof settings.paneRatio === 'function'
      ? settings.paneRatio(screen, pane, fallbackRatio)
      : clampRatio(fallbackRatio);
    ratioRef.current = saved;
    setRatio(saved);
  }, [fallbackRatio, pane, screen, settings]);

  const nudge = useCallback((delta) => commit(nudgeRatio(ratioRef.current, delta)), [commit]);
  const widen = useCallback(() => nudge(RATIO_STEP), [nudge]);
  const narrow = useCallback(() => nudge(-RATIO_STEP), [nudge]);
  const reset = useCallback(() => {
    if (settings && typeof settings.resetPanes === 'function') settings.resetPanes(screen);
    ratioRef.current = clampRatio(fallbackRatio);
    setRatio(clampRatio(fallbackRatio));
    return clampRatio(fallbackRatio);
  }, [fallbackRatio, screen, settings]);

  const leftWidth = ratioToColumns(ratio, totalWidth, minLeft, minRight);

  /**
   * Mouse handling for the divider. Returns true when the event was ours.
   *
   * The drag is tracked in `draggingRef` (never in the closure) and the ratio
   * is recomputed from the event's own x, so a whole press→drag→release burst
   * arriving in ONE stdin read works — which is exactly what a fast drag sends.
   */
  const onMouse = useCallback((ev) => {
    if (!ev || ev.type !== 'mouse') return false;
    const dividerX = ratioToColumns(ratioRef.current, totalWidth, minLeft, minRight) + 1; // 1-based '│'
    if (ev.action === 'down') {
      if (ev.button !== 0 || Math.abs(ev.x - dividerX) > 1) return false;
      draggingRef.current = true;
      setDragging(true);
      return true;
    }
    if (ev.action === 'motion') {
      if (!draggingRef.current) return false;
      commit(columnsToRatio(ev.x - 1, totalWidth));
      return true;
    }
    if (ev.action === 'up') {
      if (!draggingRef.current) return false;
      draggingRef.current = false;
      setDragging(false);
      commit(columnsToRatio(ev.x - 1, totalWidth));
      return true;
    }
    return false;
  }, [commit, minLeft, minRight, totalWidth]);

  return { ratio, leftWidth, dragging, onMouse, nudge, widen, narrow, reset, setRatio: commit };
}

/**
 * Presentational split with the divider state wired in. The ratio itself lives
 * in `useResizableSplit` (a route owns it); this component just draws.
 */
export function ResizableSplit({
  left,
  right,
  totalWidth,
  leftWidth,
  dragging = false,
  minLeft = 20,
  minRight = 24,
  onResize,
}) {
  return (
    <SplitPane
      totalWidth={totalWidth}
      leftWidth={leftWidth}
      minLeft={minLeft}
      minRight={minRight}
      dragging={dragging}
      left={left}
      right={right}
      onResize={onResize}
    />
  );
}
