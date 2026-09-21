/**
 * Core chrome components (overhaul Phase 1, task 1.1 — first slice).
 * Decoration reads the active icon set (nerd/unicode/ascii, §7.1), so the same
 * components render rounded+Nerd on Tier A and `+--`/ASCII on Tier D.
 */
import React from 'react';
import { Box, Text } from 'ink';
import { useTheme, useIcons } from '../theme/context.jsx';

/** Decorated top bar: wordmark, subtitle, right-aligned progress, tab strip. */
export function Header({ title, subtitle, right, tabs, activeTab }) {
  const theme = useTheme();
  const ic = useIcons();
  return (
    <Box flexDirection="column" marginBottom={0}>
      <Box>
        <Text bold color={theme.accent}> {ic.brand} {title}</Text>
        {subtitle ? <Text color={theme.muted}> — {subtitle}</Text> : null}
        {right ? <Box flexGrow={1} /> : null}
        {right ? <Text color={theme.accent}>{right}</Text> : null}
      </Box>
      {tabs && tabs.length ? (
        <Box>
          {tabs.map((t, i) => (
            <Text key={t} inverse={i === activeTab} color={i === activeTab ? undefined : theme.muted}>
              {' '}{t}{' '}
            </Text>
          ))}
        </Box>
      ) : null}
    </Box>
  );
}

/** Rounded panel with a title in the border; focus ring optional. */
export function Panel({ title, focused = false, width, height, children }) {
  const theme = useTheme();
  const ic = useIcons();
  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      borderStyle={ic.borderStyle}
      borderColor={focused ? theme.accent : theme.muted}
      paddingX={1}
    >
      {title ? (
        <Box marginBottom={0}>
          <Text bold color={focused ? theme.accent : theme.muted}> {title}</Text>
        </Box>
      ) : null}
      {children}
    </Box>
  );
}

/** Selectable list rows: select marker, active highlight, optional right hint. */
export function List({ items, selected, height }) {
  const theme = useTheme();
  const ic = useIcons();
  const visible = items.slice(Math.max(0, selected - (height ?? items.length) + 1), (Math.max(0, selected - (height ?? items.length) + 1)) + (height ?? items.length));
  return (
    <Box flexDirection="column">
      {visible.map((item, i) => {
        const index = Math.max(0, selected - (height ?? items.length) + 1) + i;
        const active = index === selected;
        return (
          <Box key={index}>
            <Text inverse={active} bold={active} color={active ? undefined : theme.muted}>
              {' '}{active ? ic.select : ' '} {item.label}
              {item.right ? `  ${item.right}` : ''}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}

/**
 * Scrollable pane using ink@6's verified contentOffsetY + overflow hidden.
 * `offset` = rows scrolled down (positive `contentOffsetY` shifts children up,
 * per the spike: contentOffsetY:1 on a clipped column hides the first row).
 */
export function ScrollPane({ height, offset, children }) {
  return (
    <Box height={height} flexDirection="column" overflow="hidden" contentOffsetY={offset || 0}>
      {children}
    </Box>
  );
}

/** Keybind hint footer: <C-s> check · j/k move … */
export function Footer({ hints, notice }) {
  const theme = useTheme();
  const ic = useIcons();
  return (
    <Box flexDirection="column">
      {notice ? <Text color={notice.kind === 'good' ? theme.good : notice.kind === 'bad' ? theme.bad : theme.muted} bold={!!notice.bold}> {notice.text}</Text> : null}
      <Box>
        {hints.map(([key, label], i) => (
          <Text key={`${key}${label}`} color={theme.muted}>
            {i > 0 ? ` ${ic.bullet} ` : ''}
            <Text bold color={theme.text}>{key}</Text>
            {' '}
            {label}
          </Text>
        ))}
      </Box>
    </Box>
  );
}

/** Small filled badge. */
export function Badge({ label, color = null }) {
  const theme = useTheme();
  return <Text inverse color={color || theme.accent} bold> {label} </Text>;
}

/** Progress meter: ██████░░░░ 62% (unicode) / ######.... (ascii). */
export function Meter({ done, total, width = 12 }) {
  const theme = useTheme();
  const ic = useIcons();
  const filled = total > 0 ? Math.round((done / total) * width) : 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <Text>
      <Text color={theme.accent}>{ic.meterFull.repeat(filled)}</Text>
      <Text color={theme.muted}>{ic.meterEmpty.repeat(Math.max(0, width - filled))}</Text>
      <Text color={theme.muted}> {pct}%</Text>
    </Text>
  );
}
