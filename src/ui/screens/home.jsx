/**
 * Home screen (next-UI port, Phase 1).
 *
 * Reads a precomputed view-model (screenModel.js — pure and unit-tested) and
 * renders it with chrome primitives. Input goes through useKeymap:
 * j/k/up/down move, g/G jump, Enter opens the highlighted module, r resumes,
 * x dismisses the streak banner. All ids exist in the registry (nav.up/down/
 * first/last, home.openModule, nav.resume) so keymap.json can rebind them.
 */
import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import { homeViewModel, meterCells } from './screenModel.js';
import { useKeymap } from '../useKeymap.js';
import { useServices } from '../services.jsx';
import { Toast } from '../components/overlays.jsx';
import { useTheme, useIcons } from '../theme/context.jsx';

/** Chip tones → theme roles (spec §7.2 tokens, never raw Ink color names). */
const toneFor = (theme) => ({
  good: theme.good,
  warn: theme.warn,
  accent: theme.accent,
  muted: theme.muted,
  secondary: theme.secondary,
  star: theme.star,
  faint: theme.faint,
});

export function HomeScreen({
  vm: vmProp,
  cursor = 0,
  height = 24,
  onCommand,
}) {
  const theme = useTheme();
  const ic = useIcons();
  const TONE = toneFor(theme);
  useKeymap('home', (id) => onCommand?.(id));

  // Self-sufficient by default (router renders <Screen {...params}/>); tests
  // and AppRoot can inject a precomputed vm instead.
  const services = useServices() || {};
  const vm = useMemo(
    () => vmProp || (services.curriculum ? homeViewModel({
      curriculum: services.curriculum,
      stats: services.store.stats(services.curriculum),
      overall: services.overall,
      store: services.store,
      settings: services.settings,
      resumeTarget: () => services.resumeTarget(),
      lessonIndex: services.lessonIndex,
    }) : { banner: null, resume: null, headline: { modules: 0, challenges: 0 }, chips: [], modules: [] }),
    [vmProp, services],
  );

  const rowsForModules = Math.max(1, height - 12);
  const visible = vm.modules.slice(0, rowsForModules);

  return (
    <Box flexDirection="column" paddingLeft={1}>
      <Text>
        <Text bold color={theme.text}> Let&apos;s build. </Text>
        <Text color={theme.muted}>{vm.headline.modules} modules from HTML to deployment, </Text>
        <Text color={theme.accent}>{vm.headline.challenges} graded challenges</Text>
      </Text>

      {vm.banner ? (
        <Text>
          <Text color={theme.warn} bold> {ic.flag} </Text>
          <Text color={theme.warn} bold>{vm.banner.current}-day streak at risk</Text>
          <Text color={theme.muted}> — one challenge keeps it alive</Text>
          <Text color={theme.muted}>   (x dismiss)</Text>
        </Text>
      ) : null}

      {vm.resume ? (
        <Text>
          <Text color={theme.muted}> Next up: </Text>
          <Text color={theme.secondary} bold>{vm.resume.moduleTitle}</Text>
          <Text color={theme.muted}>  {ic.arrowRight}  </Text>
          <Text>{vm.resume.lessonTitle}</Text>
          <Text color={theme.accent}>  {ic.arrowRight}  {vm.resume.challengeId}</Text>
          <Text color={theme.muted}>{vm.resume.kind ? `  (${vm.resume.kind})` : ''}</Text>
        </Text>
      ) : (
        <Text color={theme.good} bold> Every challenge is solved. Go build something nobody asked you to build.</Text>
      )}

      <Box marginTop={1} flexWrap="wrap" gapX={2}>
        {vm.chips.map((c) => (
          <Text key={c.label}>
            <Text color={TONE[c.tone] || theme.muted} bold>{String(c.value)}</Text>
            <Text color={theme.muted}> {c.label}</Text>
          </Text>
        ))}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text>
          <Text color={theme.accent} bold> Modules </Text>
          <Text color={theme.muted}> j/k to move {ic.bullet} Enter to open</Text>
        </Text>
        {visible.map((m, i) => {
          const active = i === cursor;
          const meter = meterCells(m.done, m.total, 14);
          return (
            <Text key={m.id} color={active ? theme.text : theme.muted} bold={active}>
              {' '}
              {active ? ic.select : ' '} <Text color={theme.accent} bold>{m.badge.padEnd(3)}</Text> {m.title}
              <Text color={theme.muted}> {ic.meterFull.repeat(meter.filled)}{ic.meterEmpty.repeat(meter.open)} {m.done}/{m.total} {m.percent}%</Text>
            </Text>
          );
        })}
        {vm.modules.length > visible.length ? (
          <Text color={theme.muted}>   {ic.arrowRight} {vm.modules.length - visible.length} more modules</Text>
        ) : null}
      </Box>
    </Box>
  );
}

/** One-line transient notice, re-exported for screen parity with classic. */
export { Toast };
