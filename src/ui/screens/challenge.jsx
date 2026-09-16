/**
 * Challenge screen (next-UI port slice, Phase 1 start).
 *
 * Demonstrates the full vertical slice a ported screen gets:
 *   - layout via SplitPane (brief | editor panel)
 *   - input via useKeymap → command ids (Appendix C), no raw key handling
 *   - vim-mode affordance via DECSCUSR cursor shape (M0 multimedia)
 *
 * The editor itself is a static viewer in this slice; the Phase 2 editor
 * (Appendix E) replaces it without changing the wiring shown here. Until it
 * lands, `status` carries the outcome of the commands the host ran for us
 * (check result, hint text, solution toggle), so keys are never silent.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { Box, Text } from 'ink';
import { SplitPane } from '../components/splitPane.jsx';
import { clampSplit } from '../components/splitClamp.js';
import { useKeymap } from '../useKeymap.js';
import { cursorShape } from '../multimedia.js';

export function ChallengeScreen({
  title = 'untitled challenge',
  brief = '',
  code = '',
  mode = 'normal', // 'normal' | 'insert' — vim state arrives in Phase 2
  width = 80,
  status = null,
  busy = false,
  onCommand,
  onModeChange,
}) {
  const [leftWidth, setLeftWidth] = useState(Math.round(width * 0.42));
  const [lastCommand, setLastCommand] = useState(null);

  // M0: block cursor in normal mode, bar in insert. Written straight to the
  // terminal (outside ink's frame); restored to the terminal default on unmount.
  useEffect(() => {
    process.stdout.write(mode === 'insert' ? cursorShape.bar : cursorShape.block);
    return () => process.stdout.write(cursorShape.reset);
  }, [mode]);

  // Commands resolve through the registry — this screen never sees raw keys.
  const handle = useCallback((id) => {
    setLastCommand(id);
    if (id === 'challenge.check' && mode === 'normal') onModeChange?.('insert');
    onCommand?.(id);
  }, [mode, onCommand, onModeChange]);

  useKeymap('challenge', handle);

  const clamped = clampSplit(width, leftWidth, 20, 24);
  const lines = code ? code.split('\n') : ['(empty buffer — the Phase 2 editor types here)'];

  return (
    <Box flexDirection="column">
      <SplitPane
        totalWidth={width}
        leftWidth={clamped}
        left={(
          <Box flexDirection="column">
            <Text bold color="cyan"> {title}</Text>
            <Text> </Text>
            {brief.split('\n').map((line, i) => (
              <Text key={i} color="gray"> {line}</Text>
            ))}
          </Box>
        )}
        right={(
          <Box flexDirection="column">
            {lines.slice(0, 20).map((line, i) => (
              <Text key={i} color={code ? undefined : 'gray'}> {line}</Text>
            ))}
          </Box>
        )}
      />
      <Text color={busy ? 'yellow' : status ? 'cyan' : 'gray'}>
        {' '}{status
          || (lastCommand ? `last: ${lastCommand}` : 'Ctrl+S check · Ctrl+H hint · Ctrl+G solution · Esc back')}
      </Text>
    </Box>
  );
}
