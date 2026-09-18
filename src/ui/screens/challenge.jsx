/**
 * Challenge screen (overhaul task 2.9): brief/checks pane + the Phase 2 editor.
 *
 * Layout: ResizableSplit (task 1.2) — brief and results left, CodeEditor right.
 * The editor shows a real viewport (gutter, tabs, highlight, caret); the route
 * owns the session (documents, history, vim state) and hands down:
 *   - document/selection/tabs for the active file
 *   - mouseHandlers consumed by CodeEditor's mouseSink pattern
 *   - showDiff (solution view) → DiffView rows rendered in place of the editor
 *
 * Everything on screen is presentational; behavior (typing, checking, saving,
 * diffing) belongs to the route — same split as every ported screen.
 */
import React, { useEffect, useMemo } from 'react';
import { Box, Text } from 'ink';
import { ResizableSplit } from '../components/ResizableSplit.jsx';
import { clampSplit } from '../components/splitClamp.js';
import { CodeEditor } from '../components/CodeEditor.jsx';
import { useKeymap } from '../useKeymap.js';
import { cursorShape } from '../multimedia.js';
import { docFromText } from '../../editor/document.js';

/** The editor pane: CodeEditor normally, DiffView when the solution is shown. */
function EditorPane({
  document: doc,
  selection,
  tabs,
  activeTab,
  width,
  height,
  language,
  theme,
  tabSize,
  showSolution,
  solutionRows,
  mouseHandlers,
  mouseSink,
}) {
  if (showSolution || !doc) {
    return (
      <Box flexDirection="column" width={width}>
        <Box flexDirection="row" width={width}>
          <Text bold inverse color="cyan">{' solution '}</Text>
          <Text color="gray">  your code vs the reference — Ctrl+G hides</Text>
        </Box>
        {solutionRows.slice(0, height).map((r, i) => (
          <Box key={i} flexDirection="row">
            <Text bold color={r.kind === 'add' || r.kind === 'mod-ref' ? 'green' : r.kind === 'del' || r.kind === 'mod-cur' ? 'red' : undefined}>
              {r.marker}
            </Text>
            <Text>
              {r.segs.map((s, j) => (
                <Text key={j} color={s.color || undefined} bold={s.bold || undefined} italic={s.italic || undefined}>
                  {s.text}
                </Text>
              ))}
            </Text>
          </Box>
        ))}
      </Box>
    );
  }
  return (
    <CodeEditor
      document={doc}
      selection={selection}
      tabs={tabs}
      activeTab={activeTab}
      width={width}
      height={height}
      language={language}
      theme={theme}
      tabSize={tabSize}
      mouseHandlers={mouseHandlers}
      mouseSink={mouseSink}
    />
  );
}

export function ChallengeScreen({
  title,
  brief = '',
  session = null, // multi-file editor session (createSession shape)
  document: docOverride = null, // single-document mode (tests, simple previews)
  code = null, // raw-text mode (classic slice tests); lowest precedence
  selection = null,
  mode = 'normal',
  width = 80,
  leftWidth: leftWidthProp,
  dragging = false,
  status = null,
  busy = false,
  results = null,
  showSolution = false,
  solutionRows = [],
  logs = null,
  showLogs = false,
  theme = null,
  tabSize = 2,
  mouseHandlers = null,
  mouseSink = null,
  onMouse,
  onCommand,
  registerInput = true, // false when the ROUTE owns input (task 2.9); keeps
  // standalone test mounts working by registering the screen themselves
  onModeChange,
}) {
  const leftWidth = leftWidthProp ?? Math.round(width * 0.42);

  // M0: block cursor in normal mode, bar in insert (unchanged from Phase 1).
  useEffect(() => {
    process.stdout.write(mode === 'insert' ? cursorShape.bar : cursorShape.block);
    return () => process.stdout.write(cursorShape.reset);
  }, [mode]);

  // Commands resolve through the registry — this screen never sees raw keys:
  // the route registers the same screen id with onRawKey for vim/typing.
  const handle = React.useCallback((id) => {
    onCommand?.(id);
  }, [onCommand]);

  // Input registration is the ROUTE's job now (it resolves commands AND owns
  // the raw typing path). The screen registers only in standalone mounts
  // (tests) so its keymap does not clobber the route's richer registration —
  // two registrations for one screen meant last-mount-wins, and typing died.
  useKeymap('challenge', handle, { onMouse, enabled: registerInput });

  const doc = useMemo(() => docOverride
    || (session && session.files && session.files[session.active] && session.files[session.active].doc)
    || (code != null ? docFromText(code) : null)
    || null, [docOverride, session, code]);
  const files = session ? session.order : [];
  const tabs = files.length > 1
    ? files.map((name) => ({ name, dirty: false }))
    : null;
  const activeTab = session && tabs ? Math.max(0, files.indexOf(session.active)) : 0;

  const textWidth = Math.max(10, width - clampSplit(width, leftWidth, 20, 24) - 1);
  const editorHeight = 20;
  const language = (doc && doc.language) || 'js';

  return (
    <Box flexDirection="column">
      <ResizableSplit
        totalWidth={width}
        leftWidth={clampSplit(width, leftWidth, 20, 24)}
        dragging={dragging}
        left={(
          <Box flexDirection="column">
            <Text bold color="cyan"> {title || 'untitled challenge'}</Text>
            <Text> </Text>
            {brief.split('\n').map((line, i) => (
              <Text key={i} color="gray"> {line}</Text>
            ))}
            {results ? (
              <Box flexDirection="column" marginTop={1}>
                <Text bold color={results.passed ? 'green' : 'red'}>
                  {' '}CHECKS  {results.results.filter((r) => r.ok).length}/{results.results.length}
                  {Number.isFinite(results.durationMs) ? `   ·   ${results.durationMs} ms` : ''}
                </Text>
                {(results.notes || []).map((n, i) => (
                  <Text key={i} color={n.kind === 'warn' ? 'yellow' : n.kind === 'honesty' ? 'cyan' : 'gray'}>
                    {' '}· {n.text}
                  </Text>
                ))}
              </Box>
            ) : null}
            {showLogs && logs ? (
              <Box flexDirection="column" marginTop={1}>
                <Text bold color="magenta"> CONSOLE</Text>
                {logs.length === 0 ? <Text color="gray"> · (no output)</Text> : null}
                {logs.slice(-12).map((l, i) => (
                  <Text key={i} color={l.kind === 'error' ? 'red' : l.kind === 'warn' ? 'yellow' : 'gray'}>
                    {' '}· {l.text}
                  </Text>
                ))}
              </Box>
            ) : null}
          </Box>
        )}
        right={(
          <EditorPane
            document={doc}
            selection={selection}
            tabs={tabs}
            activeTab={activeTab}
            width={textWidth}
            height={editorHeight}
            language={language}
            theme={theme}
            tabSize={tabSize}
            showSolution={showSolution}
            solutionRows={solutionRows}
            mouseHandlers={mouseHandlers}
            mouseSink={mouseSink}
          />
        )}
      />
      <Text color={busy ? 'yellow' : status ? 'cyan' : 'gray'}>
        {' '}{(status || (lastCommandText(mode))).split('\n')[0]}
      </Text>
      {status && status.includes('\n')
        ? status.split('\n').slice(1).map((line, i) => (
          <Text key={i} color="red"> {line}</Text>
        ))
        : null}
      {mode === 'insert' ? <Text color="green"> -- INSERT --</Text> : null}
    </Box>
  );
}

function lastCommandText(mode) {
  return mode === 'insert'
    ? '-- INSERT -- · Esc back to normal · Ctrl+S check'
    : 'Ctrl+S check · Ctrl+H hint · Ctrl+G solution · Ctrl+T console · Esc back';
}
