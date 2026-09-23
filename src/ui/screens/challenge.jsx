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
import { CompletionPopup } from '../components/CompletionPopup.jsx';
import { CelebrateLine } from '../components/overlays.jsx';
import { useKeymap } from '../useKeymap.js';
import { cursorShape } from '../multimedia.js';
import { docFromText } from '../../editor/document.js';
import { footerLine, modeBadge, NUDGE_TEXT } from '../hints.js';
import { useTheme, useIcons } from '../theme/context.jsx';

/** The editor pane: CodeEditor normally, DiffView when the solution is shown. */
function EditorPane({
  document: doc,
  selection,
  tabs,
  activeTab,
  width,
  height,
  language,
  theme: themeProp = null,
  tabSize,
  showSolution,
  solutionRows,
  mouseHandlers,
  mouseSink,
  diagnostics,
}) {
  // Explicit prop wins (tests/previews); otherwise the app-wide theme tokens.
  const theme = themeProp || useTheme();
  if (showSolution || !doc) {
    return (
      <Box flexDirection="column" width={width}>
        <Box flexDirection="row" width={width}>
          <Text bold inverse color={theme.accent}>{' solution '}</Text>
          <Text color={theme.muted}>  your code vs the reference — Ctrl+G hides</Text>
        </Box>
        {solutionRows.slice(0, height).map((r, i) => (
          <Box key={i} flexDirection="row">
            <Text bold color={r.kind === 'add' || r.kind === 'mod-ref' ? theme.good : r.kind === 'del' || r.kind === 'mod-cur' ? theme.bad : undefined}>
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
      diagnostics={diagnostics}
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
  diagnostics = null, // M2: failing-check ranges for the editor pane
  showSolution = false,
  solutionRows = [],
  logs = null,
  showLogs = false,
  popup = null, // completion list (task 2.7); the route owns its state
  popupSignature = null, // signature help for the call at the caret
  theme: themeProp = null,
  tabSize = 2,
  mouseHandlers = null,
  mouseSink = null,
  onMouse,
  onCommand,
  registerInput = true, // false when the ROUTE owns input (task 2.9); keeps
  // standalone test mounts working by registering the screen themselves
  onModeChange,
  nudge = false, // §9: one-time "press i to start typing" guardrail
  vimEnabled, // vim on? the footer's nudge line only makes sense then
  celebrate = null, // §7.3 motion: {key} while the pass flourish shows
}) {
  const theme = themeProp || useTheme();
  const ic = useIcons();
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
            <Text bold color={theme.accent}> {title || 'untitled challenge'}</Text>
            <Text> </Text>
            {brief.split('\n').map((line, i) => (
              <Text key={i} color={theme.muted}> {line}</Text>
            ))}
            {results ? (
              <Box flexDirection="column" marginTop={1}>
                <Text bold color={results.passed ? theme.good : theme.bad}>
                  {' '}CHECKS  {results.results.filter((r) => r.ok).length}/{results.results.length}
                  {Number.isFinite(results.durationMs) ? `   ${ic.bullet}   ${results.durationMs} ms` : ''}
                </Text>
                {(results.notes || []).map((n, i) => (
                  <Text key={i} color={n.kind === 'warn' ? theme.warn : n.kind === 'honesty' ? theme.accent : theme.muted}>
                    {' '}{ic.bullet} {n.text}
                  </Text>
                ))}
              </Box>
            ) : null}
            {showLogs && logs ? (
              <Box flexDirection="column" marginTop={1}>
                <Text bold color={theme.secondary}> CONSOLE</Text>
                {logs.length === 0 ? <Text color={theme.muted}> {ic.bullet} (no output)</Text> : null}
                {logs.slice(-12).map((l, i) => (
                  <Text key={i} color={l.kind === 'error' ? theme.bad : l.kind === 'warn' ? theme.warn : theme.muted}>
                    {' '}{ic.bullet} {l.text}
                  </Text>
                ))}
              </Box>
            ) : null}
          </Box>
        )}
        right={(
          <Box flexDirection="column">
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
              diagnostics={diagnostics}
            />
            <CompletionPopup popup={popup} signature={popupSignature} width={textWidth} />
          </Box>
        )}
      />
      <Text color={busy ? theme.warn : status ? theme.accent : theme.muted}>
        {' '}{status ? status.split('\n')[0] : footerLine(undefined, ` ${ic.sep} `)}
      </Text>
      {status && status.includes('\n')
        ? status.split('\n').slice(1).map((line, i) => (
          <Text key={i} color={theme.bad}> {line}</Text>
        ))
        : null}
      {celebrate ? <CelebrateLine key={celebrate.key} /> : null}
      {nudge ? (
        <Text color={theme.warn}> {NUDGE_TEXT}</Text>
      ) : null}
      {(() => {
        const badge = modeBadge(mode);
        return badge ? <Text color={theme.good} bold>{badge}</Text> : null;
      })()}
    </Box>
  );
}
