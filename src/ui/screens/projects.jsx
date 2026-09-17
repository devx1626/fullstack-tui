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

/** Flatten the focused project into renderable rows. */
export function projectsLines({ curriculum = [], store, cursor = 0, focus = 'brief', checkCursor = 0, width = 80 }) {
  const lines = [];
  const push = (el) => lines.push(el);
  const projects = curriculum.filter((m) => m.project);
  const index = Math.max(0, Math.min(cursor, Math.max(0, projects.length - 1)));
  const mod = projects[index];
  if (!mod) {
    push(<Text color="gray">  No capstone projects defined.</Text>);
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
      <Text color="yellow" bold>☆ </Text>
      <Text bold>{project.title}</Text>
      <Text color="gray">   from the {mod.title} module</Text>
    </Text>,
  );
  push(
    <Text>
      {'  '}
      <Text color="gray">project {index + 1} of {projects.length}</Text>
      <Text color="gray">   j/k switches project   Tab focuses the checklist, Space ticks an item</Text>
    </Text>,
  );
  const cells = checks.length ? Math.round((ticked / checks.length) * 20) : 0;
  push(
    <Text>
      {'  '}
      <Text color="cyan">{'█'.repeat(cells)}</Text>
      <Text color="gray">{'░'.repeat(Math.max(0, 20 - cells))}</Text>
      <Text color={ticked === checks.length && checks.length ? 'green' : 'gray'}>
        {'   '}{ticked}/{checks.length} requirements ticked
      </Text>
      <Text color="gray">   ~{project.minutes} min</Text>
    </Text>,
  );
  push(<Text> </Text>);

  push(<Text><Text color="cyan" bold> Brief</Text></Text>);
  for (const line of wrapText(String(project.brief || '').replace(/\*\*/g, '').replace(/`/g, ''), Math.max(12, width - 4), '  ')) {
    push(<Text>{line}</Text>);
  }
  push(<Text> </Text>);

  if (project.starter) {
    push(<Text><Text color="cyan" bold> Suggested starting point</Text></Text>);
    for (const l of String(project.starter).split('\n')) push(<Text color="green">{`  ${l}`.replace(/\s+$/, '')}</Text>);
    push(<Text> </Text>);
  }

  push(
    <Text>
      <Text color="cyan" bold> Definition of done </Text>
      <Text color="gray"> {inChecks ? 'Space to tick' : 'Tab to focus and tick'}</Text>
    </Text>,
  );
  checks.forEach((check, i) => {
    const id = `${project.id}.${i}`;
    const done = !!(record.checks && record.checks[id]);
    const active = inChecks && i === checkCursor;
    push(
      <Text color={active ? 'white' : undefined} bold={active}>
        {'  '}
        <Text color={done ? 'green' : 'gray'} bold>{done ? '[✓] ' : '[ ] '}</Text>
        <Text color={done ? 'gray' : undefined}>{check}</Text>
      </Text>,
    );
  });

  if (project.stretch && project.stretch.length) {
    push(<Text> </Text>);
    push(
      <Text>
        <Text color="cyan" bold> Stretch goals </Text>
        <Text color="gray"> optional, but this is where the learning compounds</Text>
      </Text>,
    );
    for (const s of project.stretch) push(<Text color="magenta">    + {s}</Text>);
  }
  return { lines, project, checks };
}

export function ProjectsScreen({ lines = [], height = 24, scroll = 0 }) {
  const view = Math.max(1, height - 2);
  const offset = clampScroll(scroll, lines.length, view);
  const shown = lines.slice(offset, offset + view);
  return (
    <Box flexDirection="column">
      <Text>
        {'  '}
        <Text color="gray">{lines.length ? offset + 1 : 0}-{Math.min(lines.length, offset + view)} of {lines.length}</Text>
        <Text color="gray">  j/k project · Tab checklist · Space tick</Text>
      </Text>
      {shown.map((el, i) => <React.Fragment key={offset + i}>{el}</React.Fragment>)}
    </Box>
  );
}
