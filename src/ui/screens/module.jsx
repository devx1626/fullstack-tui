/**
 * Module screen (next-UI port, Phase 1).
 *
 * Renders the module view-model (screenModel.js): header with badge/hours,
 * the "why" prose, a progress meter, and the lesson list with status marks.
 * Input through useKeymap: j/k/up/down move, g/G jump, Enter opens the
 * highlighted lesson (registry ids nav.*, module.openLesson).
 */
import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import { moduleViewModel, meterCells, lessonMarks } from './screenModel.js';
import { useKeymap } from '../useKeymap.js';
import { useServices } from '../services.jsx';
import { useTheme, useIcons } from '../theme/context.jsx';

/** Lesson status → theme roles (spec §7.2 tokens). */
const markToneFor = (theme) => ({ done: theme.good, open: theme.warn, unread: theme.muted });

export function ModuleScreen({ vm: vmProp, mod: modProp, moduleId, statsEntry, store: storeProp, cursor = 0, height = 24, onCommand }) {
  const theme = useTheme();
  const ic = useIcons();
  const MARK_TONE = markToneFor(theme);
  // Status marks follow the icon set, so tier D keeps 7-bit output.
  const MARKS = lessonMarks(ic);
  useKeymap('module', (id) => onCommand?.(id));

  // Self-sufficient by default: resolve the module + stats from services when
  // the router passes just { moduleId } (mirrors app.openModule's push).
  // Tests may pass a precomputed `vm` instead.
  const services = useServices() || {};
  const mod = modProp || (services.curriculum || []).find((m) => m.id === moduleId);
  const entry = statsEntry || (services.store && mod)
    ? services.store.stats(services.curriculum).perModule.find((m) => m.id === mod?.id)
    : undefined;
  const store = storeProp || services.store;
  const vm = useMemo(
    () => vmProp || moduleViewModel({ mod, statsEntry: entry, store }),
    [vmProp, mod, entry, store],
  );
  if (!vm) return <Text color={theme.bad}>unknown module</Text>;

  const rowsForLessons = Math.max(1, height - 10);
  const visible = vm.lessons.slice(0, rowsForLessons);
  const meter = meterCells(vm.meter.done, vm.meter.total, 20);

  return (
    <Box flexDirection="column">
      <Text>
        <Text backgroundColor={theme.accent} color={theme.bg} bold> {vm.badge} </Text>
        <Text bold>  {vm.title}</Text>
        <Text color={theme.muted}>   {vm.tagline}</Text>
      </Text>
      <Text color={theme.muted}>
        {'  '}{vm.course}   ~{vm.hours}h of source material
      </Text>

      <Box marginTop={1} flexDirection="column">
        {vm.why.split('\n').filter((l) => l.trim()).slice(0, 3).map((line, i) => (
          <Text key={i} color={theme.muted}>  {line.trim()}</Text>
        ))}
      </Box>

      <Box marginTop={1}>
        <Text>
          <Text color={theme.accent}>{ic.meterFull.repeat(meter.filled)}</Text>
          <Text color={theme.muted}>{ic.meterEmpty.repeat(meter.open)}</Text>
          <Text color={theme.muted}>   {vm.meter.done}/{vm.meter.total} challenges</Text>
          <Text color={theme.muted}>   {vm.lessonsRead}/{vm.lessonsCount} lessons read</Text>
          <Text color={vm.meter.percent === 100 ? theme.good : theme.accent} bold>   {vm.meter.percent}%</Text>
        </Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text>
          <Text color={theme.accent} bold> Lessons </Text>
          <Text color={theme.muted}> Enter opens the highlighted row </Text>
        </Text>
        {visible.map((l) => {
          const active = l.index === cursor;
          const mark = MARKS[l.status]?.mark || l.mark;
          return (
            <Text key={l.index} color={active ? theme.text : theme.muted} bold={active}>
              {' '}
              {active ? ic.select : ' '} <Text color={MARK_TONE[l.status]} bold>{mark}</Text>
              {' '}{String(l.index + 1).padStart(2, '0')}  {l.title.slice(0, 34).padEnd(34)}
              <Text color={theme.muted}> {l.minutes} min  {l.challenges} ch</Text>
              <Text color={l.passed === l.challenges ? theme.good : theme.muted}>  {l.passed}/{l.challenges} done</Text>
            </Text>
          );
        })}
        {vm.project ? (() => {
          const active = vm.lessons.length === cursor; // classic convention: project row follows the lessons
          return (
            <Text color={active ? theme.text : theme.muted} bold={active}>
              {' '}
              {active ? ic.select : ' '} <Text color={theme.warn} bold>{ic.star}</Text> CP{'  '}
              {vm.project.title.slice(0, 38).padEnd(38)}
              <Text color={theme.muted}> {vm.project.minutes} min   capstone</Text>
              <Text color={vm.project.done && vm.project.done === vm.project.total ? theme.good : theme.muted}>
                {'   '}{vm.project.done}/{vm.project.total} ticked
              </Text>
            </Text>
          );
        })() : null}
      </Box>
    </Box>
  );
}
