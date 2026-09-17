/**
 * CodeEditor (overhaul task 2.8) — the Ink binding for the Phase 2 editor.
 *
 * The engine (`src/editor/*`) is pure; this component draws what the pure
 * viewport projects and forwards intent upward. It owns NO document logic:
 *
 *   - draw:  `visibleRows` + `highlightWindow` (+ LRU) render the viewport;
 *            gutter and tab strip are drawn from the SAME projection so they
 *            can never disagree with the text. Selection highlighting is cut
 *            into the segments themselves (`rowPieces`), so a selection can
 *            never misalign with a wide char or a colour change.
 *   - caret: `useCursor` positions the real terminal cursor from
 *            `cursorPoint()`; the block/bar SHAPE stays the screen's job
 *            (DECSCUSR, M0).
 *   - mouse: ink has no per-Box mouse capture, and the dispatcher allows one
 *            route-level `onMouse` — so the component publishes its handler
 *            into `mouseSink.current` (a ref the ROUTE provides) and the route
 *            composes: divider first, editor second. `useEditorMouse` builds
 *            the handler from click/drag/wheel intents.
 *
 * Editing itself (typing, undo, vim) lives with the route/session: it holds the
 * document, this component displays it. That split is what keeps the component
 * render-only and therefore snapshot-safe.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { Box, Text, useCursor } from 'ink';
import {
  cursorPoint,
  rowPieces,
  selectionRows,
  visibleRows,
} from '../../editor/viewport.js';
import { highlightWindow, createHighlightCache } from '../../editor/highlight.js';

/** Normalize a doc-like value (full document or raw text) into a document. */
function toDoc(docOrText) {
  if (docOrText && Array.isArray(docOrText.lines)) return docOrText;
  return {
    lines: String(docOrText ?? '').split('\n'),
    caret: { row: 0, col: 0 },
    view: { scrollTop: 0, scrollX: 0 },
  };
}

/**
 * Turn SGR mouse events into editor intents. Used by CodeEditor; exported so
 * tests (and unusual routes) can drive it directly.
 *
 *   onDocClick({row, col})   button-0 press inside the text area
 *   onDocDrag({row, col})    motion while the button is held (drag-select)
 *   onDocWheel(dir)          -1 = up, +1 = down
 *
 * `row`/`col` are DOCUMENT coordinates: the viewport's scrollTop and the
 * gutter width are already resolved. Clicks above the text area or left of the
 * gutter clamp to row 0 / column 0 — always a typeable position.
 */
export function useEditorMouse({ onDocClick, onDocDrag, onDocWheel, stripRows = 0, gutter = 0, top = 0 }) {
  const draggingRef = useRef(false);
  const clickRef = useRef(onDocClick);
  const dragRef = useRef(onDocDrag);
  const wheelRef = useRef(onDocWheel);
  clickRef.current = onDocClick;
  dragRef.current = onDocDrag;
  wheelRef.current = onDocWheel;

  // Geometry lives in a ref so the returned handler is STABLE across scrolls —
  // re-registering the route's mouse handler on every keystroke would churn.
  const geoRef = useRef({ stripRows, gutter, top });
  geoRef.current = { stripRows, gutter, top };

  return (ev) => {
    if (!ev || ev.type !== 'mouse') return false;
    const g = geoRef.current;
    const point = () => ({
      // SGR x/y are 1-based (input/index.js).
      col: Math.max(0, ev.x - 1 - g.gutter),
      row: g.top + Math.max(0, ev.y - 1 - g.stripRows),
    });
    if (ev.action === 'down') {
      if (ev.button !== 0) return false;
      draggingRef.current = true;
      clickRef.current?.(point());
      return true;
    }
    if (ev.action === 'motion') {
      if (!draggingRef.current) return false;
      dragRef.current?.(point());
      return true;
    }
    if (ev.action === 'up') {
      const was = draggingRef.current;
      draggingRef.current = false;
      return was; // claim only when a press/drag was ours
    }
    if (ev.action === 'wheel-up') { wheelRef.current?.(-1); return true; }
    if (ev.action === 'wheel-down') { wheelRef.current?.(1); return true; }
    return false;
  };
}

/** One visible row of the tab strip. */
function TabStrip({ tabs, active, width }) {
  return (
    <Box flexDirection="row" width={width}>
      {tabs.map((tab, i) => {
        const isActive = i === active;
        const label = ` ${tab.name}${tab.dirty ? ' •' : ''} `;
        return (
          <Text key={`${tab.name}.${i}`} bold={isActive} inverse={isActive} color={isActive ? 'cyan' : 'gray'}>
            {label}
          </Text>
        );
      })}
    </Box>
  );
}

/**
 * @param {object} props
 * @param {object|string} props.document      document value (or raw text) to show
 * @param {object} [props.selection]          `{anchor, head}` or null
 * @param {number} [props.width=60]           content width in columns
 * @param {number} [props.height=20]          visible text rows
 * @param {string} [props.language='js']      highlight language ('js', 'py', …)
 * @param {object} [props.theme]              theme with comment/keyword/string/… roles
 * @param {number} [props.tabSize=2]
 * @param {boolean} [props.relativeNumbers]   vim-style relative line numbers
 * @param {Array}  [props.tabs]               `[{name, dirty}]` — draws the strip when present
 * @param {number} [props.activeTab=0]
 * @param {boolean} [props.showGutter=true]   hide for preview panes
 * @param {object} [props.mouseHandlers]      `{onDocClick, onDocDrag, onDocWheel}`
 * @param {{current: Function|null}} [props.mouseSink]
 *                                            route-provided ref; the component
 *                                            publishes its mouse handler there
 */
export function CodeEditor({
  document: docProp,
  selection = null,
  width = 60,
  height = 20,
  language = 'js',
  theme = null,
  tabSize = 2,
  relativeNumbers = false,
  tabs = null,
  activeTab = 0,
  showGutter = true,
  mouseHandlers = null,
  mouseSink = null,
}) {
  const doc = useMemo(() => toDoc(docProp), [docProp]);
  const view = doc.view || { scrollTop: 0, scrollX: 0 };
  const { setCursorPosition } = useCursor();

  // Per-instance LRU (see highlight.js): typing re-tokenises exactly one line.
  const cacheRef = useRef(null);
  if (!cacheRef.current) cacheRef.current = createHighlightCache({ capacity: 2048 });

  const top = Math.max(0, view.scrollTop | 0);
  const rows = useMemo(() => visibleRows(doc, { top, height }), [doc, top, height]);
  const highlighted = useMemo(
    () => highlightWindow(doc, { top, height, lang: language, theme: theme || undefined, cache: cacheRef.current }),
    [doc, top, height, language, theme],
  );
  const selByRow = useMemo(() => {
    const map = new Map();
    for (const r of selectionRows(doc, selection, { top, height, tabSize })) map.set(r.row, r);
    return map;
  }, [doc, selection, top, height, tabSize]);

  const stripRows = tabs && tabs.length ? 1 : 0;
  const gutterW = showGutter ? Math.max(2, String(Math.max(1, doc.lines.length)).length + 2) : 0;
  const textWidth = Math.max(1, width - gutterW);
  const scrollX = Math.max(0, view.scrollX | 0);

  // Terminal cursor: the caret's cell inside this box, or hidden when scrolled
  // away. Coordinates are relative to this component's output origin.
  useEffect(() => {
    const p = cursorPoint({ top: stripRows, left: gutterW, height, width: textWidth }, doc, view, { tabSize });
    setCursorPosition(p);
    return () => setCursorPosition(undefined);
  }, [doc, view, stripRows, gutterW, height, textWidth, tabSize, setCursorPosition]);

  // Mouse: build the handler from intents, then publish it to the route's sink.
  // Publishing happens in an effect AND during render (sink.current) so a route
  // that composes its own handler on the same tick never sees a null.
  const mouse = useEditorMouse({
    onDocClick: mouseHandlers?.onDocClick,
    onDocDrag: mouseHandlers?.onDocDrag,
    onDocWheel: mouseHandlers?.onDocWheel,
    stripRows,
    gutter: gutterW,
    top,
  });
  useEffect(() => {
    if (mouseSink) mouseSink.current = mouse;
  }, [mouse, mouseSink]);
  if (mouseSink) mouseSink.current = mouse;

  const gutterCell = (row) => {
    if (!showGutter) return '';
    if (row === null || row === undefined) return ' '.repeat(gutterW);
    const n = relativeNumbers
      ? (Math.abs(row - (doc.caret ? doc.caret.row : 0)) || row + 1)
      : row + 1;
    return `${String(n).padStart(gutterW - 2)}  `;
  };

  return (
    <Box flexDirection="column" width={width}>
      {stripRows ? <TabStrip tabs={tabs} active={activeTab} width={width} /> : null}
      {rows.map((r, i) => {
        const sel = selByRow.get(r.row);
        const pieces = rowPieces(highlighted[i] || [], r.line ?? '', {
          startCol: scrollX,
          width: textWidth,
          selFrom: sel ? sel.fromCol : null,
          // A full-row selection runs to the line's end (MAX_SAFE sentinel from
          // selectionRows): clamp to the actual text width for rendering.
          selTo: sel ? Math.min(sel.toCol, scrollX + textWidth) : null,
        });
        return (
          <Box key={i} flexDirection="row">
            {showGutter ? <Text>{gutterCell(r.row)}</Text> : null}
            <Text>
              {pieces.length === 0
                ? ' '
                : pieces.map((s, j) => (
                  <Text
                    key={j}
                    color={s.color || undefined}
                    bold={s.bold || undefined}
                    italic={s.italic || undefined}
                    inverse={s.inverse || undefined}
                  >
                    {s.text}
                  </Text>
                ))}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
