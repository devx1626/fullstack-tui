/**
 * Resources screen (next-UI port, Phase 1).
 *
 * The curriculum's source material: the primary playlists, one row per module
 * (course, URL, roadmap, docs, further reading), and the tools worth
 * installing. Content mirrors `src/views/resources.js`; the data comes from
 * the same curriculum objects, so the two UIs cannot list different sources.
 */
import React from 'react';
import { Box, Text } from 'ink';
import { clampScroll, wrapText } from './screenModel.js';
import { useKeymap } from '../useKeymap.js';
import { useTheme, useIcons } from '../theme/context.jsx';
import { midnight } from '../theme/themes.js';

export const PRIMARY = '**Dave Gray, Full Course Programming Tutorials** - 88 hours across 14 complete courses, the spine of every module here.';

export const SOURCES = [
  ['playlist', 'https://www.youtube.com/playlist?list=PL0Zuz27SZ-6M1Uopt6_VL3gf3cpMnwavm'],
  ['channel ', 'https://www.youtube.com/@DaveGrayTeachesCode'],
  ['roadmaps', 'https://roadmap.sh/full-stack'],
];

export const TOOLS = [
  ['VS Code + Live Server', 'instant browser reload while you write'],
  ['Chrome / Firefox DevTools', 'the real CSS and JS debugger - press F12'],
  ['Node.js 18+', 'runs the backend modules and this TUI'],
  ['Git', 'version control, module 04'],
  ['DB Browser for SQLite or psql', 'module 07'],
  ['Postman or curl', 'poke your own APIs, module 06'],
];

/** Flatten the resources page into renderable rows (unkeyed). */
export function resourcesLines(curriculum = [], overall = {}, width = 80, theme = midnight) {
  const lines = [];
  const push = (el) => lines.push(el);

  push(
    <Text>
      <Text color={theme.accent} bold> Primary sources </Text>
      <Text color={theme.muted}> the curriculum below is a re-sequencing of these</Text>
    </Text>,
  );
  for (const line of wrapText(PRIMARY.replace(/\*\*/g, ''), Math.max(20, width - 4), '  ')) {
    push(<Text color={theme.muted}>{line}</Text>);
  }
  for (const [label, url] of SOURCES) {
    push(
      <Text>
        {'  '}
        <Text color={theme.muted}>{label}</Text>
        <Text color={theme.accent}>  {url}</Text>
      </Text>,
    );
  }

  push(<Text> </Text>);
  push(
    <Text>
      <Text color={theme.accent} bold> Per module </Text>
      <Text color={theme.muted}> {overall.hours || '—'} hours of source material</Text>
    </Text>,
  );
  for (const mod of curriculum) {
    const src = mod.source || {};
    push(
      <Text>
        {'  '}
        <Text color={theme.accent} bold>{(mod.badge || '').padEnd(4)}</Text>
        <Text bold>{(mod.title || '').padEnd(16)}</Text>
        <Text color={theme.muted}>{src.course || ''}</Text>
      </Text>,
    );
    push(<Text><Text>      </Text><Text color={theme.accent}>{src.url || ''}</Text></Text>);
    push(
      <Text>
        <Text>      </Text>
        <Text color={theme.secondary}>roadmap {src.roadmap || ''}</Text>
        <Text color={theme.muted}>   docs {src.docs || ''}</Text>
      </Text>,
    );
    const extras = (mod.lessons || []).flatMap((l) => l.resources || []).slice(0, 3);
    if (extras.length) {
      push(
        <Text>
          <Text>      </Text>
          <Text color={theme.muted}>further: </Text>
          <Text color={theme.muted}>{extras.map((r) => r.label).join(' | ')}</Text>
        </Text>,
      );
    }
    push(<Text> </Text>);
  }

  push(<Text><Text color={theme.accent} bold> Tools worth installing </Text></Text>);
  for (const [tool, why] of TOOLS) {
    push(
      <Text>
        {'  '}
        <Text bold>{tool.padEnd(30)}</Text>
        <Text color={theme.muted}>{why}</Text>
      </Text>,
    );
  }
  return lines;
}

export function ResourcesScreen({ curriculum: curriculumProp, overall: overallProp, cursor = 0, height = 24, width = 80, onCommand }) {
  const theme = useTheme();
  const ic = useIcons();
  useKeymap('resources', (id) => onCommand?.(id));

  const curriculum = curriculumProp || [];
  const lines = resourcesLines(curriculum, overallProp || {}, width, theme);
  const view = Math.max(1, height - 3);
  const offset = clampScroll(cursor, lines.length, view);
  const shown = lines.slice(offset, offset + view);

  return (
    <Box flexDirection="column">
      <Text>
        <Text color={theme.accent} bold> Resources </Text>
        <Text color={theme.muted}> j/k scroll {ic.bullet} PgUp/PgDn page {ic.bullet} Esc back</Text>
      </Text>
      {shown.map((el, i) => <React.Fragment key={offset + i}>{el}</React.Fragment>)}
      <Text color={theme.muted}> {lines.length ? offset + 1 : 0}-{Math.min(lines.length, offset + view)} of {lines.length} </Text>
    </Box>
  );
}
