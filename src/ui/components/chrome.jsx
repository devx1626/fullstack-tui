/**
 * Core chrome components (overhaul Phase 1, task 1.1 — first slice).
 * Unicode-tier decoration; Nerd-Font variants arrive with the icon pass.
 */
import React from 'react';
import { Box, Text } from 'ink';

/** Decorated top bar: wordmark, subtitle, right-aligned progress, tab strip. */
export function Header({ title, subtitle, right, tabs, activeTab }) {
  return (
    <Box flexDirection="column" marginBottom={0}>
      <Box>
        <Text bold color="cyan"> ◈ {title}</Text>
        {subtitle ? <Text color="gray"> — {subtitle}</Text> : null}
        {right ? <Box flexGrow={1} /> : null}
        {right ? <Text color="cyan">{right}</Text> : null}
      </Box>
      {tabs && tabs.length ? (
        <Box>
          {tabs.map((t, i) => (
            <Text key={t} inverse={i === activeTab} color={i === activeTab ? undefined : 'gray'}>
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
  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      borderStyle="round"
      borderColor={focused ? 'cyan' : 'gray'}
      paddingX={1}
    >
      {title ? (
        <Box marginBottom={0}>
          <Text bold color={focused ? 'cyan' : 'gray'}> {title}</Text>
        </Box>
      ) : null}
      {children}
    </Box>
  );
}

/** Selectable list rows: ▸ marker, active highlight, optional right hint. */
export function List({ items, selected, height }) {
  const visible = items.slice(Math.max(0, selected - (height ?? items.length) + 1), (Math.max(0, selected - (height ?? items.length) + 1)) + (height ?? items.length));
  return (
    <Box flexDirection="column">
      {visible.map((item, i) => {
        const index = Math.max(0, selected - (height ?? items.length) + 1) + i;
        const active = index === selected;
        return (
          <Box key={index}>
            <Text inverse={active} bold={active} color={active ? undefined : 'gray'}>
              {' '}{active ? '▸' : ' '} {item.label}
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
  return (
    <Box flexDirection="column">
      {notice ? <Text color={notice.kind === 'good' ? 'green' : notice.kind === 'bad' ? 'red' : 'gray'} bold={!!notice.bold}> {notice.text}</Text> : null}
      <Box>
        {hints.map(([key, label], i) => (
          <Text key={`${key}${label}`} color="gray">
            {i > 0 ? ' · ' : ''}
            <Text bold color="white">{key}</Text>
            {' '}
            {label}
          </Text>
        ))}
      </Box>
    </Box>
  );
}

/** Small filled badge. */
export function Badge({ label, color = 'cyan' }) {
  return <Text inverse color={color} bold> {label} </Text>;
}

/** ASCII progress meter: ██████░░░░ 62% */
export function Meter({ done, total, width = 12 }) {
  const filled = total > 0 ? Math.round((done / total) * width) : 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <Text>
      <Text color="cyan">{'█'.repeat(filled)}</Text>
      <Text color="gray">{'░'.repeat(Math.max(0, width - filled))}</Text>
      <Text color="gray"> {pct}%</Text>
    </Text>
  );
}
