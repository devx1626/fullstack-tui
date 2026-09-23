/**
 * SplitPane (spec Appendix D): the vertical-split LAYOUT. Widths are clamped to
 * [minLeft, total-minRight]; useLayoutEffect lets the parent sync real terminal
 * bounds on mount (window width arrives there).
 *
 * This is the drawing half only. The behavior task 1.2 asks for — mouse drag on
 * the divider, keyboard nudge, per-screen persistence, reset-to-default — lives
 * in `ResizableSplit.jsx` (`useResizableSplit` + `<ResizableSplit>`), which
 * wraps this component; screens should use that one.
 */
import React, { useLayoutEffect } from 'react';
import { Box, Text } from 'ink';
import { clampSplit } from './splitClamp.js';
import { useTheme, useIcons } from '../theme/context.jsx';

export function SplitPane({
  left,
  right,
  totalWidth,
  leftWidth,
  minLeft = 12,
  minRight = 12,
  dragging = false,
  onResize,
}) {
  const theme = useTheme();
  const ic = useIcons();
  const clamped = clampSplit(totalWidth, leftWidth, minLeft, minRight);

  // Sync parent-clamped width back on mount (terminal-width awareness).
  useLayoutEffect(() => {
    if (onResize && clamped !== leftWidth) onResize(clamped);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const dividerCells = [];
  for (let x = 0; x < totalWidth; x += 1) {
    if (x < clamped) dividerCells.push('left');
    else if (x === clamped) dividerCells.push('bar');
    else dividerCells.push('right');
  }

  return (
    <Box flexDirection="column" width={totalWidth}>
      {/* Content row */}
      <Box>
        <Box width={clamped} flexDirection="column" overflow="hidden">
          {left}
        </Box>
        <Box width={1} flexDirection="column">
          <Text color={dragging ? theme.accent : theme.muted}>{ic.rail}</Text>
        </Box>
        <Box width={Math.max(0, totalWidth - clamped - 1)} flexDirection="column" overflow="hidden">
          {right}
        </Box>
      </Box>
      {/* Drag strip: width-proportional handle map for the mouse parser */}
      <Box>
        {dividerCells.map((cell, i) => (
          <Text key={i} color={dragging ? theme.accent : theme.muted}>{cell === 'bar' ? ic.cross : ic.dash}</Text>
        ))}
      </Box>
    </Box>
  );
}
