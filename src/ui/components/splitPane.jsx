/**
 * SplitPane (Phase 1 task 1.2 slice, spec Appendix D): vertical split with
 * drag-to-resize. Layout is owned by the parent; the pane reports resize
 * intent via onResize(newLeftCols) so the dispatcher/registry can own the
 * command path (mouse drag AND keyboard ^W left / ^W right later).
 *
 * Widths are clamped to [minLeft, total-minRight]; useLayoutEffect lets the
 * parent sync real terminal bounds on mount (window width arrives there).
 */
import React, { useLayoutEffect } from 'react';
import { Box, Text } from 'ink';
import { clampSplit } from './splitClamp.js';

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
          <Text color={dragging ? 'cyan' : 'gray'}>│</Text>
        </Box>
        <Box width={Math.max(0, totalWidth - clamped - 1)} flexDirection="column" overflow="hidden">
          {right}
        </Box>
      </Box>
      {/* Drag strip: width-proportional handle map for the mouse parser */}
      <Box>
        {dividerCells.map((cell, i) => (
          <Text key={i} color={dragging ? 'cyan' : 'gray'}>{cell === 'bar' ? '┴' : '─'}</Text>
        ))}
      </Box>
    </Box>
  );
}
