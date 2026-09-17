/**
 * Settings screen (next-UI port, Phase 1 task 1.4 — the last screen).
 *
 * Rows and toggles come from `src/ui/preferences.js`, the same module the
 * classic canvas view and `App.toggleSetting` use, so the two UIs cannot
 * document different rows or different Space behavior. This screen adds the
 * Vim row (the classic modeless editor has no modes, so showing it there would
 * be a lie) and nothing else.
 *
 * Deliberately NOT copied from `src/views/settings.js`: its 12-row "How to
 * Navigate" block, which duplicates the key list. That list now lives once in
 * `src/core/help.js` and is rendered by the Help screen (`?`), which this
 * screen points at instead of restating — the exact drift the shared help
 * content was extracted to prevent.
 *
 * Pure inputs: `rows` (preferenceRows output), `cursor`, `width`, `height`.
 */
import React from 'react';
import { Box, Text } from 'ink';
import { clampScroll } from './screenModel.js';
import { useKeymap } from '../useKeymap.js';

/** Marker + colors for a focused row, shared by the renderer and tests. */
export function rowMarker(row, active) {
  if (active) return '▸';
  return row.toggleable ? '·' : ' ';
}

/**
 * Flatten the settings page into renderable rows (unkeyed), like the other
 * ported screens, so the layout can be asserted without a terminal.
 */
export function settingsLayout({ rows = [], cursor = 0, width = 80 } = {}) {
  const lines = [];
  // Which line holds the focused row: the cursor is a ROW index, but a focused
  // toggleable row also emits a hint line, so the two are not the same number.
  let cursorLine = 0;
  const valueColumn = Math.max(24, Math.min(48, Math.floor(width * 0.45)));

  lines.push(
    <Text>
      <Text color="cyan" bold> Preferences </Text>
      <Text color="gray"> stored in .data/settings.json</Text>
    </Text>,
  );
  lines.push(
    <Text color="gray">
      {' '}Space toggles the focused row · the environment owns the rest · ? lists every key
    </Text>,
  );
  lines.push(<Text> </Text>);

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const active = i === cursor;
    if (active) cursorLine = lines.length;
    const label = String(row.label || '').padEnd(14);
    lines.push(
      <Text inverse={active} bold={active}>
        {' '}{rowMarker(row, active)} <Text color={active ? undefined : 'cyan'}>{label}</Text>
        <Text color={row.toggleable ? undefined : 'gray'}>
          {String(row.value || '').slice(0, Math.max(0, width - valueColumn - 4))}
        </Text>
      </Text>,
    );
    if (active && row.hint) {
      lines.push(<Text color="gray">{'      '}{row.hint}{row.toggleable ? '' : ' — not a toggle'}</Text>);
    }
  }

  lines.push(<Text> </Text>);
  lines.push(
    <Text color="gray">
      {' '}Pane widths (challenge split) are remembered per screen; the palette resets them.
    </Text>,
  );
  return { lines, cursorLine };
}

/** Just the renderable rows — for row-content assertions. */
export function settingsLines(props) {
  return settingsLayout(props).lines;
}

export function SettingsScreen({ rows = [], cursor = 0, width = 80, height = 24, onCommand }) {
  useKeymap('settings', (id) => onCommand?.(id));

  const { lines, cursorLine } = settingsLayout({ rows, cursor, width });
  const view = Math.max(1, height - 3);
  const offset = clampScroll(cursorLine, lines.length, view);
  const shown = lines.slice(offset, offset + view);

  return (
    <Box flexDirection="column">
      <Text>
        <Text color="cyan" bold> Settings </Text>
        <Text color="gray"> j/k move · Space toggle · Esc back</Text>
      </Text>
      {shown.map((el, i) => <React.Fragment key={offset + i}>{el}</React.Fragment>)}
      <Text color="gray"> {lines.length ? offset + 1 : 0}-{Math.min(lines.length, offset + view)} of {lines.length} </Text>
    </Box>
  );
}
