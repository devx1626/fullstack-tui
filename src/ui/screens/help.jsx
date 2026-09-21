/**
 * Help screen (next-UI port, Phase 1).
 *
 * Renders the manual from `src/core/help.js` — the same data the classic
 * canvas view lays out — so the two UIs cannot disagree about which key does
 * what. Scrolling uses `cursor` as the top visible row: j/k move one row,
 * PgUp/PgDn ten, g/G jump to the ends (the pure clamp is screenModel's
 * `clampScroll`, shared with the other read-only screens).
 *
 * `lines(width)` is exported so tests can assert content without a terminal.
 */
import React from 'react';
import { Box, Text } from 'ink';
import { HELP_SECTIONS, HELP_NOTES } from '../../core/help.js';
import { clampScroll, wrapText } from './screenModel.js';
import { useKeymap } from '../useKeymap.js';
import { useTheme, useIcons } from '../theme/context.jsx';
import { midnight } from '../theme/themes.js';

const KEY_W = 14;

/**
 * Flatten the manual into renderable rows (unkeyed; the screen adds keys).
 * Theme is a parameter so the helper stays pure and callable from tests.
 */
export function helpLines(width = 80, theme = midnight) {
  const lines = [];
  const push = (el) => lines.push(el);

  HELP_SECTIONS.forEach((s, i) => {
    if (i > 0) push(<Text> </Text>);
    push(
      <Text>
        <Text color={theme.accent} bold> {s.title} </Text>
        {s.hint ? <Text color={theme.muted}> {s.hint}</Text> : null}
      </Text>,
    );
    for (const [key, label] of s.rows) {
      push(
        <Text>
          {'  '}
          <Text color={theme.accent} bold>{String(key).padEnd(KEY_W)}</Text>
          <Text>{label}</Text>
        </Text>,
      );
    }
  });

  push(<Text> </Text>);
  push(<Text><Text color={theme.accent} bold> How this works </Text></Text>);
  for (const note of HELP_NOTES) {
    // The classic prose renderer strips the markdown emphasis it understands.
    const plain = note.replace(/\*\*/g, '').replace(/`/g, '');
    for (const line of wrapText(plain, Math.max(20, width - 4), '  ')) {
      push(<Text color={theme.muted}>{line}</Text>);
    }
  }
  return lines;
}

export function HelpScreen({ cursor = 0, height = 24, width = 80, onCommand }) {
  const theme = useTheme();
  const ic = useIcons();
  useKeymap('help', (id) => onCommand?.(id));

  const lines = helpLines(width, theme);
  const view = Math.max(1, height - 3);
  const offset = clampScroll(cursor, lines.length, view);
  const shown = lines.slice(offset, offset + view);

  return (
    <Box flexDirection="column">
      <Text>
        <Text color={theme.accent} bold> Help </Text>
        <Text color={theme.muted}> j/k scroll {ic.bullet} PgUp/PgDn page {ic.bullet} g/G ends {ic.bullet} Esc back </Text>
      </Text>
      {shown.map((el, i) => <React.Fragment key={offset + i}>{el}</React.Fragment>)}
      <Text color={theme.muted}>
        {' '}
        {lines.length ? offset + 1 : 0}-{Math.min(lines.length, offset + view)} of {lines.length}
      </Text>
    </Box>
  );
}
