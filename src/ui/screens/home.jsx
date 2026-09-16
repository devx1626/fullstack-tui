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

const TONE = { good: 'green', warn: 'yellow', accent: 'cyan', muted: 'gray', secondary: 'magenta', star: 'yellow', faint: 'gray' };

export function HomeScreen({
  vm: vmProp,
  cursor = 0,
  height = 24,
  onCommand,
}) {
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
        <Text bold color="white"> Let&apos;s build. </Text>
        <Text color="gray">{vm.headline.modules} modules from HTML to deployment, </Text>
        <Text color="cyan">{vm.headline.challenges} graded challenges</Text>
      </Text>

      {vm.banner ? (
        <Text>
          <Text color="yellow" bold> ⚑ </Text>
          <Text color="yellow" bold>{vm.banner.current}-day streak at risk</Text>
          <Text color="gray"> — one challenge keeps it alive</Text>
          <Text color="gray">   (x dismiss)</Text>
        </Text>
      ) : null}

      {vm.resume ? (
        <Text>
          <Text color="gray"> Next up: </Text>
          <Text color="magenta" bold>{vm.resume.moduleTitle}</Text>
          <Text color="gray">  ›  </Text>
          <Text>{vm.resume.lessonTitle}</Text>
          <Text color="cyan">  ›  {vm.resume.challengeId}</Text>
          <Text color="gray">{vm.resume.kind ? `  (${vm.resume.kind})` : ''}</Text>
        </Text>
      ) : (
        <Text color="green" bold> Every challenge is solved. Go build something nobody asked you to build.</Text>
      )}

      <Box marginTop={1} flexWrap="wrap" gapX={2}>
        {vm.chips.map((c) => (
          <Text key={c.label}>
            <Text color={TONE[c.tone] || 'gray'} bold>{String(c.value)}</Text>
            <Text color="gray"> {c.label}</Text>
          </Text>
        ))}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text>
          <Text color="cyan" bold> Modules </Text>
          <Text color="gray"> j/k to move · Enter to open </Text>
        </Text>
        {visible.map((m, i) => {
          const active = i === cursor;
          const meter = meterCells(m.done, m.total, 14);
          return (
            <Text key={m.id} color={active ? 'white' : 'gray'} bold={active}>
              {' '}
              {active ? '▸' : ' '} <Text color="cyan" bold>{m.badge.padEnd(3)}</Text> {m.title}
              <Text color="gray"> {'─'.repeat(meter.filled)}{'·'.repeat(meter.open)} {m.done}/{m.total} {m.percent}%</Text>
            </Text>
          );
        })}
        {vm.modules.length > visible.length ? (
          <Text color="gray">   … {vm.modules.length - visible.length} more modules</Text>
        ) : null}
      </Box>
    </Box>
  );
}

/** One-line transient notice, re-exported for screen parity with classic. */
export { Toast };
