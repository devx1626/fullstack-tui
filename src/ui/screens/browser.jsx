/**
 * Browser screen (overhaul Phase 3, task 3.4) — the embedded dev tools.
 *
 * Presentational, like every ported screen: the route (routesBrowser.js) owns
 * the session (tab, scroll, selected element, console state) and hands down
 * rows built by the pure `browserModel.js`. Five tabs per spec B.6/C.3 —
 * Render / Elements / Styles / Console / Network — with the classic Issues
 * fold-in living as the clickable ⚠ rows under the rendered page.
 *
 * Scrolling is the classic slice model (`offset` → visible window), kept
 * deterministic for the replay/perf probes; `ScrollPane`'s contentOffsetY
 * path stays available if a pane ever needs to render unvirtualized rows.
 */
import React from 'react';
import { Box, Text } from 'ink';
import { BROWSER_TABS, TAB_LABEL, tabHint } from './browserModel.js';
import { useTheme, useIcons } from '../theme/context.jsx';

/** Fragment rows from layoutDocument keep their per-run styles. */
function FragRow({ frags, width }) {
  return (
    <Box width={width} flexShrink={0}>
      {frags.map((f, i) => (
        <Text
          key={i}
          bold={!!f.s.bold}
          italic={!!f.s.italic}
          underline={!!f.s.underline}
          dimColor={!!f.s.dim}
        >
          {f.text}
        </Text>
      ))}
    </Box>
  );
}

/** Role → theme token, resolved at paint time like the classic seg() calls. */
function colorFor(theme, role) {
  switch (role) {
    case 'accent': return theme.accent;
    case 'accentSoft': return theme.accentSoft;
    case 'muted': return theme.muted;
    case 'faint': return theme.faint;
    case 'good': return theme.good;
    case 'bad': return theme.bad;
    case 'warn': return theme.warn;
    case 'code': return theme.codeText;
    case 'secondary': return theme.secondary;
    default: return undefined;
  }
}

/**
 * One plain text row; `selected` inverts (the render-pane inspect highlight).
 *
 * Memoized: a scroll moves the visible window by a few rows, so most rows keep
 * the SAME row object and width across frames — with React.memo plus absolute
 * (pane-index) keys below, only the newly-exposed rows re-render. This is the
 * browser's version of the editor's row reuse, and it is what keeps
 * browser-tab scrolling off the per-row re-render path.
 */
const Row = React.memo(function Row({ row, width, theme }) {
  if (row.columns) {
    // Render-pane sidebar composition: page column, rail, side column.
    const pageW = Math.max(10, width - 31);
    return (
      <Box width={width} flexShrink={0}>
        <Box width={pageW} flexShrink={0}>
          <Text inverse={row.columns[0].role === 'selected'} wrap="truncate">
            {row.columns[0].text || ' '}
          </Text>
        </Box>
        <Text color={theme.border}>{row.columns[1].text}</Text>
        <Box width={30} flexShrink={0}>
          <Text color={colorFor(theme, row.columns[2].role)} wrap="truncate">
            {row.columns[2].text || ' '}
          </Text>
        </Box>
      </Box>
    );
  }
  if (row.frags) return <FragRow frags={row.frags} width={width} />;
  const color = colorFor(theme, row.role);
  return (
    <Text
      inverse={!!row.selected}
      bold={!!row.selected || row.role === 'accent' || row.role === 'header'}
      color={color}
      wrap="truncate"
    >
      {row.text || ' '}
    </Text>
  );
});

/**
 * @param {object} props
 * @param {string} props.title       challenge title in the header
 * @param {string} props.tab         active tab id (BROWSER_TABS)
 * @param {Array}  props.pane        rows for the ACTIVE tab (pure model output)
 * @param {number} props.offset      scroll offset into `pane`
 * @param {string|null} props.overlay  error-overlay line (live re-render broke)
 * @param {string|null} props.notice footer notice (jump confirmations, hints)
 * @param {number} props.width
 * @param {number} props.height      total screen height (incl. chrome rows)
 * @param {boolean} [props.live]     "re-renders as you type" indicator
 * @param {boolean} [props.busy]     console evaluation in flight
 * @param {number} [props.pageLines] rendered-line count (status readout)
 * @param {(id: string) => void} props.onCommand
 */
export function BrowserScreen({
  title = 'browser',
  tab = 'render',
  pane = [],
  offset = 0,
  overlay = null,
  notice = null,
  width = 100,
  height = 24,
  live = true,
  busy = false,
  pageLines = 0,
  onCommand,
}) {
  const theme = useTheme();
  const ic = useIcons();

  // 1 header + 1 tab strip + 1 status + 1 footer = 4 chrome rows.
  const bodyH = Math.max(1, height - 4);
  const active = BROWSER_TABS.includes(tab) ? tab : 'render';
  const maxOffset = Math.max(0, pane.length - bodyH);
  const at = Math.max(0, Math.min(offset, maxOffset));
  const visible = pane.slice(at, at + bodyH);

  return (
    <Box flexDirection="column" width={width}>
      <Box>
        <Text bold color={theme.accent}> {ic.brand} {title}</Text>
        <Text color={theme.muted}>
          {' '}— {TAB_LABEL[active]}
          {live ? `  ${ic.bullet}  live: re-renders as you type` : ''}
          {busy ? `  ${ic.bullet}  running…` : ''}
        </Text>
        <Box flexGrow={1} />
        <Text color={theme.faint}>{pageLines} lines</Text>
      </Box>
      <Box>
        {BROWSER_TABS.map((name, i) => (
          <Text
            key={name}
            inverse={name === active}
            bold={name === active}
            color={name === active ? theme.accent : theme.muted}
          >
            {' '}{i + 1} {TAB_LABEL[name]}{' '}
          </Text>
        ))}
      </Box>
      {overlay ? (
        <Text bold color={theme.bad} wrap="truncate"> {ic.warn} {overlay}</Text>
      ) : (
        <Text color={theme.faint} wrap="truncate"> {tabHint(active, ic)}</Text>
      )}
      <Box flexDirection="column" height={bodyH} overflow="hidden">
        {visible.map((row, i) => (
          // Absolute (pane-index) key, not the slice index: a scroll then keeps
          // the identity of every row that stayed on screen, so the memoized
          // Row can skip those frames entirely.
          <Row key={at + i} row={row} width={width} theme={theme} />
        ))}
      </Box>
      <Text color={notice ? theme.accentSoft : theme.muted} wrap="truncate">
        {' '}{notice || `${TAB_LABEL[active]} ${ic.bullet} ${tabHint(active, ic)}`}
      </Text>
    </Box>
  );
}
