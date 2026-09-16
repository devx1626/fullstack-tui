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
import { moduleViewModel, meterCells } from './screenModel.js';
import { useKeymap } from '../useKeymap.js';
import { useServices } from '../services.jsx';

const MARK_TONE = { done: 'green', open: 'yellow', unread: 'gray' };

export function ModuleScreen({ vm: vmProp, mod: modProp, moduleId, statsEntry, store: storeProp, cursor = 0, height = 24, onCommand }) {
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
  if (!vm) return <Text color="red">unknown module</Text>;

  const rowsForLessons = Math.max(1, height - 10);
  const visible = vm.lessons.slice(0, rowsForLessons);
  const meter = meterCells(vm.meter.done, vm.meter.total, 20);

  return (
    <Box flexDirection="column">
      <Text>
        <Text backgroundColor="cyan" color="black" bold> {vm.badge} </Text>
        <Text bold>  {vm.title}</Text>
        <Text color="gray">   {vm.tagline}</Text>
      </Text>
      <Text color="gray">
        {'  '}{vm.course}   ~{vm.hours}h of source material
      </Text>

      <Box marginTop={1} flexDirection="column">
        {vm.why.split('\n').filter((l) => l.trim()).slice(0, 3).map((line, i) => (
          <Text key={i} color="gray">  {line.trim()}</Text>
        ))}
      </Box>

      <Box marginTop={1}>
        <Text>
          <Text color="cyan">{'─'.repeat(meter.filled)}</Text>
          <Text color="gray">{'·'.repeat(meter.open)}</Text>
          <Text color="gray">   {vm.meter.done}/{vm.meter.total} challenges</Text>
          <Text color="gray">   {vm.lessonsRead}/{vm.lessonsCount} lessons read</Text>
          <Text color={vm.meter.percent === 100 ? 'green' : 'cyan'} bold>   {vm.meter.percent}%</Text>
        </Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text>
          <Text color="cyan" bold> Lessons </Text>
          <Text color="gray"> Enter opens the highlighted row </Text>
        </Text>
        {visible.map((l) => {
          const active = l.index === cursor;
          return (
            <Text key={l.index} color={active ? 'white' : 'gray'} bold={active}>
              {' '}
              {active ? '▸' : ' '} <Text color={MARK_TONE[l.status]} bold>{l.mark}</Text>
              {' '}{String(l.index + 1).padStart(2, '0')}  {l.title.slice(0, 34).padEnd(34)}
              <Text color="gray"> {l.minutes} min  {l.challenges} ch</Text>
              <Text color={l.passed === l.challenges ? 'green' : 'gray'}>  {l.passed}/{l.challenges} done</Text>
            </Text>
          );
        })}
        {vm.project ? (() => {
          const active = vm.lessons.length === cursor; // classic convention: project row follows the lessons
          return (
            <Text color={active ? 'white' : 'gray'} bold={active}>
              {' '}
              {active ? '▸' : ' '} <Text color="yellow" bold>★</Text> CP{'  '}
              {vm.project.title.slice(0, 38).padEnd(38)}
              <Text color="gray"> {vm.project.minutes} min   capstone</Text>
              <Text color={vm.project.done && vm.project.done === vm.project.total ? 'green' : 'gray'}>
                {'   '}{vm.project.done}/{vm.project.total} ticked
              </Text>
            </Text>
          );
        })() : null}
      </Box>
    </Box>
  );
}
