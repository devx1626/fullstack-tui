/**
 * Projects screen (next-UI port, Phase 1).
 *
 * Capstone checklists: j/k switches project, Tab focuses the checklist,
 * Space ticks the focused item (the classic flow). `projectsLines()` is pure so
 * the route can own the cursors and the screen stays a windowing presenter.
 *
 * Tick keys match the store contract: `${projectId}.${index}` (App.projectsKey
 * writes the same shape), which is also why `projectProgress` counts by index.
 */
import React from 'react';
import { Box, Text } from 'ink';
import { clampScroll, wrapText } from './screenModel.js';
import { useTheme, useIcons } from '../theme/context.jsx';
import { midnight } from '../theme/themes.js';
import { ICON_SETS } from '../theme/icons.js';

/**
 * Flatten the focused project into renderable rows. Theme is a parameter (not
 * a hook) so the helper stays pure; `midnight` keeps direct callers working.
 */
export function projectsLines({ curriculum = [], store, cursor = 0, focus = 'brief', checkCursor = 0, width = 80, theme = midnight, icons = ICON_SETS.unicode }) {
  const lines = [];
  const push = (el) => lines.push(el);
  const projects = curriculum.filter((m) => m.project);
  const index = Math.max(0, Math.min(cursor, Math.max(0, projects.length - 1)));
  const mod = projects[index];
  if (!mod) {
    push(<Text color={theme.muted}>  No capstone projects defined.</Text>);
    return { lines, project: null, checks: [] };
  }

  const project = mod.project;
  const checks = project.checks || [];
  const inChecks = focus === 'checks';
  const ticked = store && store.projectProgress ? store.projectProgress(project.id, checks) : 0;
  const record = store && store.projectRecord ? store.projectRecord(project.id) : { checks: {} };

  push(
    <Text>
      {'  '}
      <Text color={theme.warn} bold>{icons.star} </Text>
      <Text bold>{project.title}</Text>
      <Text color={theme.muted}>   from the {mod.title} module</Text>
    </Text>,
  );
  push(
    <Text>
      {'  '}
      <Text color={theme.muted}>project {index + 1} of {projects.length}</Text>
      <Text color={theme.muted}>   j/k switches project   Tab focuses the checklist, Space ticks an item</Text>
    </Text>,
  );
  const cells = checks.length ? Math.round((ticked / checks.length) * 20) : 0;
  push(
    <Text>
      {'  '}
      <Text color={theme.accent}>{icons.meterFull.repeat(cells)}</Text>
      <Text color={theme.muted}>{icons.meterEmpty.repeat(Math.max(0, 20 - cells))}</Text>
      <Text color={ticked === checks.length && checks.length ? theme.good : theme.muted}>
        {'   '}{ticked}/{checks.length} requirements ticked
      </Text>
      <Text color={theme.muted}>   ~{project.minutes} min</Text>
    </Text>,
  );
  push(<Text> </Text>);

  push(<Text><Text color={theme.accent} bold> Brief</Text></Text>);
  for (const line of wrapText(String(project.brief || '').replace(/\*\*/g, '').replace(/`/g, ''), Math.max(12, width - 4), '  ')) {
    push(<Text>{line}</Text>);
  }
  push(<Text> </Text>);

  if (project.starter) {
    push(<Text><Text color={theme.accent} bold> Suggested starting point</Text></Text>);
    for (const l of String(project.starter).split('\n')) push(<Text color={theme.good}>{`  ${l}`.replace(/\s+$/, '')}</Text>);
    push(<Text> </Text>);
  }

  push(
    <Text>
      <Text color={theme.accent} bold> Definition of done </Text>
      <Text color={theme.muted}> {inChecks ? 'Space to tick' : 'Tab to focus and tick'}</Text>
    </Text>,
  );
  checks.forEach((check, i) => {
    const id = `${project.id}.${i}`;
    const done = !!(record.checks && record.checks[id]);
    const active = inChecks && i === checkCursor;
    push(
      <Text color={active ? theme.text : undefined} bold={active}>
        {'  '}
        <Text color={done ? theme.good : theme.muted} bold>{done ? `[${icons.check}] ` : '[ ] '}</Text>
        <Text color={done ? theme.muted : undefined}>{check}</Text>
      </Text>,
    );
  });

  if (project.stretch && project.stretch.length) {
    push(<Text> </Text>);
    push(
      <Text>
        <Text color={theme.accent} bold> Stretch goals </Text>
        <Text color={theme.muted}> optional, but this is where the learning compounds</Text>
      </Text>,
    );
    for (const s of project.stretch) push(<Text color={theme.secondary}>    + {s}</Text>);
  }
  return { lines, project, checks };
}

export function ProjectsScreen({ lines = [], height = 24, scroll = 0 }) {
  const theme = useTheme();
  const ic = useIcons();
  const view = Math.max(1, height - 2);
  const offset = clampScroll(scroll, lines.length, view);
  const shown = lines.slice(offset, offset + view);
  return (
    <Box flexDirection="column">
      <Text>
        {'  '}
        <Text color={theme.muted}>{lines.length ? offset + 1 : 0}-{Math.min(lines.length, offset + view)} of {lines.length}</Text>
        <Text color={theme.muted}>  j/k project {ic.bullet} Tab checklist {ic.bullet} Space tick</Text>
      </Text>
      {shown.map((el, i) => <React.Fragment key={offset + i}>{el}</React.Fragment>)}
    </Box>
  );
}
