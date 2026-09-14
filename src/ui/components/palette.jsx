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
  const ordered = query
    ? commands
    : [...recents, ...commands.filter((c) => !recents.some((r) => r.id === c.id))];
  const matches = filterCommands(ordered, query);
  const sel = clampSelected(selected, matches.length);

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text bold color="cyan">◈ {title}</Text>
      <Text>
        <Text color="cyan">{'> '}</Text>
        <Text>{query}</Text>
        <Text color="gray">▏</Text>
      </Text>
      {matches.length === 0 ? (
        <Text color="gray"> no matching commands</Text>
      ) : (
        matches.slice(0, height).map((cmd, i) => (
          <Text key={cmd.id} color={i === sel ? undefined : 'gray'}>
            <Text color={i === sel ? 'cyan' : 'gray'}>{i === sel ? '▸ ' : '  '}</Text>
            {cmd.title}
            {cmd.keys ? <Text color="gray">{'  '.padEnd(4)}{cmd.keys}</Text> : null}
          </Text>
        ))
      )}
      <Text color="gray"> ↑/↓ move · Enter run · Esc close </Text>
    </Box>
  );
}
