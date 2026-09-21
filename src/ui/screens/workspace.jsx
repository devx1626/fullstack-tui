/**
 * Workspace screen (next-UI port, Phase 1).
 *
 * Lists the real files under `.workspace/` — the portfolio every checked
 * challenge writes to. `files`/`root` are injectable so the screen renders in
 * tests without touching the disk; with no props it reads the same
 * `listWorkspace()` the classic view uses.
 */
import React from 'react';
import { Box, Text } from 'ink';
import { WORKSPACE, listWorkspace } from '../../core/workspace.js';
import { clampScroll, wrapText } from './screenModel.js';
import { useKeymap } from '../useKeymap.js';
import { useTheme, useIcons } from '../theme/context.jsx';
import { midnight } from '../theme/themes.js';

const INTRO = 'Every challenge you check gets written here as a normal file. This is your portfolio, accumulating one exercise at a time - `cd` into it, open it in a browser, or `git init` it.';

/**
 * Flatten the workspace listing into renderable rows (unkeyed). Theme is a
 * parameter so the helper stays pure and callable from tests.
 */
export function workspaceLines(files = [], root = WORKSPACE, width = 80, theme = midnight) {
  const lines = [];
  const push = (el) => lines.push(el);
  const home = process.env.HOME || '';

  push(
    <Text>
      <Text color={theme.accent} bold> Workspace </Text>
      <Text color={theme.muted}> {String(root).replace(home, '~')}</Text>
    </Text>,
  );
  for (const line of wrapText(INTRO.replace(/`/g, ''), Math.max(20, width - 4), '  ')) {
    push(<Text color={theme.muted}>{line}</Text>);
  }
  push(<Text> </Text>);

  if (!files.length) {
    push(<Text color={theme.muted}>  Empty so far. Solve a challenge and press Ctrl+O to write it out.</Text>);
    return lines;
  }

  push(
    <Text>
      <Text color={theme.accent} bold> Files </Text>
      <Text color={theme.muted}> {files.length} artefacts</Text>
    </Text>,
  );

  // Directories first (classic convention), then every file with its folder.
  const dirs = new Set();
  const leaves = [];
  for (const file of files) {
    const parts = String(file).split('/');
    const name = parts.pop();
    const dir = parts.join('/');
    if (dir) dirs.add(dir);
    leaves.push({ name, dir, full: file });
  }
  for (const dir of Array.from(dirs).sort()) {
    push(<Text><Text>  </Text><Text color={theme.accent} bold>{dir}</Text></Text>);
  }
  for (const leaf of leaves) {
    push(
      <Text>
        {leaf.dir ? '    ' : '  '}
        <Text color={theme.muted}>{leaf.name}</Text>
        {leaf.dir ? <Text color={theme.muted}>   {leaf.dir}</Text> : null}
      </Text>,
    );
  }
  return lines;
}

export function WorkspaceScreen({ files, root, cursor = 0, height = 24, width = 80, onCommand }) {
  const theme = useTheme();
  const ic = useIcons();
  useKeymap('workspace', (id) => onCommand?.(id));

  // `files === undefined` means "read the real workspace"; an explicit array
  // (even empty) is respected so tests never touch the filesystem.
  const listing = files === undefined ? listWorkspace() : files;
  const lines = workspaceLines(listing, root || WORKSPACE, width, theme);
  const view = Math.max(1, height - 3);
  const offset = clampScroll(cursor, lines.length, view);
  const shown = lines.slice(offset, offset + view);

  return (
    <Box flexDirection="column">
      <Text>
        <Text color={theme.accent} bold> Workspace </Text>
        <Text color={theme.muted}> j/k scroll {ic.bullet} PgUp/PgDn page {ic.bullet} Esc back</Text>
      </Text>
      {shown.map((el, i) => <React.Fragment key={offset + i}>{el}</React.Fragment>)}
      <Text color={theme.muted}> {lines.length ? offset + 1 : 0}-{Math.min(lines.length, offset + view)} of {lines.length} </Text>
    </Box>
  );
}
