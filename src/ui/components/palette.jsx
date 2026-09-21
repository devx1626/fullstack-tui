/**
 * Command palette (overhaul §10; palette-first decision from QoL interview).
 *
 * Controlled component: the parent owns `query`, `selected`, and `commands`,
 * and receives intent callbacks (onChangeQuery, onMove, onRun, onCancel). Key
 * handling stays outside so the palette works identically under the classic
 * keymap and the future Ink dispatcher.
 *
 *   ┌─ Palette ──────────────────────────────┐
 *   │ > sav_                                 │
 *   │ ▸ save & check                 ^S      │
 *   │   preview                      ^P      │
 *   │   reset editor                 ^G      │
 *   └────────────────────────────────────────┘
 */
import React from 'react';
import { Box, Text } from 'ink';
import { filterCommands, clampSelected } from '../fuzzy.js';
import { useTheme, useIcons } from '../theme/context.jsx';

/**
 * Recents-first ordering + fuzzy filter. Exported so the owner of `selected`
 * (the CommandHost) computes the SAME list this component renders — otherwise
 * the highlighted row and the executed row can disagree.
 */
export function paletteMatches(commands = [], recents = [], query = '') {
  const ordered = query
    ? commands
    : [...recents, ...commands.filter((c) => !recents.some((r) => r.id === c.id))];
  return filterCommands(ordered, query);
}

export function Palette({
  title = 'Palette',
  query = '',
  commands = [],
  selected = 0,
  height = 10,
  recents = [],
  onChangeQuery,
  onMove, // (delta) => void
  onRun, // (command) => void
  onCancel, // () => void
}) {
  // Recents float to the top on an empty query (QoL: palette-first navigation).
  const theme = useTheme();
  const ic = useIcons();
  const matches = paletteMatches(commands, recents, query);
  const sel = clampSelected(selected, matches.length);

  return (
    <Box flexDirection="column" borderStyle={ic.borderStyle} borderColor={theme.accent} paddingX={1}>
      <Text bold color={theme.accent}>{ic.brand} {title}</Text>
      <Text>
        <Text color={theme.accent}>{'> '}</Text>
        <Text>{query}</Text>
        <Text color={theme.muted}>▏</Text>
      </Text>
      {matches.length === 0 ? (
        <Text color={theme.muted}> no matching commands</Text>
      ) : (
        matches.slice(0, height).map((cmd, i) => (
          <Text key={cmd.id} color={i === sel ? undefined : theme.muted}>
            <Text color={i === sel ? theme.accent : theme.muted}>{i === sel ? `${ic.select} ` : '  '}</Text>
            {cmd.title}
            {cmd.keys ? <Text color={theme.muted}>{'  '.padEnd(4)}{cmd.keys}</Text> : null}
          </Text>
        ))
      )}
      <Text color={theme.muted}> {ic.arrowUp}/{ic.arrowDown} move {ic.bullet} Enter run {ic.bullet} Esc close </Text>
    </Box>
  );
}
