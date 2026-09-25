/**
 * Browser route (overhaul Phase 3, tasks 3.5–3.6) — the behavioral half.
 *
 * Owns the session the screen only renders (classic parity with the App's
 * `state.browser`): tab, scroll, selected element, console input/history/
 * output — plus the Phase 3 additions:
 *
 *   - live re-render: the store's autosaved draft is polled at ~300 ms (the
 *     spec's debounce; ChallengeRoute autosaves at 400 ms, so the page follows
 *     a keystroke by well under a second) and a layout error becomes the ⚠
 *     overlay line instead of a crash;
 *   - click-to-inspect: a click on a rendered line selects the element that
 *     produced it (Elements/Styles follow, via the shared elementIndex); a
 *     click on a ⚠ issue row jumps straight to its source line;
 *   - jump-to-source: Enter on a selected element (or a clicked issue row)
 *     moves the challenge editor's caret to the element's source position —
 *     across the stack via `browserJumpHandoff` (the challenge route stays
 *     mounted underneath a pushed screen, so it can apply the jump on pop);
 *   - console on a warmed context (core/runner.js `runConsoleSession`): the
 *     learner's code executes once per edit, expressions evaluate on top of
 *     its values, and every fetch the session makes is recorded for Network.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Text } from 'ink';
import { useHost } from './host.jsx';
import { useServices } from './services.jsx';
import { useKeymap } from './useKeymap.js';
import { useRouter } from './router.jsx';
import { useIcons } from './theme/context.jsx';
import { findChallenge } from '../core/targets.js';
import { previewParts, synthesisParts, elementTree } from '../core/browser.js';
import { runConsoleSession, resetConsoleSession } from '../core/runner.js';
import {
  BROWSER_TABS,
  buildPage,
  buildRenderRows,
  buildElementRows,
  buildStyleRows,
  buildConsoleRows,
  buildNetworkRows,
  clampElement,
  elementRowToSource,
  paneClick,
  TAB_HINTS,
} from './screens/browserModel.js';
import { BrowserScreen } from './screens/browser.jsx';
import { runScreenshotAction } from './screenshotAction.js';
/** The live re-render cadence (spec §14 Phase 3: debounced ~300 ms). */
export const LIVE_POLL_MS = 300;

/**
 * Cross-screen jump handoff. The browser route writes a pending jump and
 * pops; the challenge route (still mounted underneath) applies it — moving
 * the caret (and, for multi-file, the active file) to the element's source.
 */
export const browserJumpHandoff = { pending: null };

/** The file name synthesisParts would use as the page (for jump targeting). */
function htmlFileOf(files) {
  const names = Object.keys(files || {});
  return names.find((n) => n.endsWith('.html')) || names.find((n) => n.endsWith('.htm')) || null;
}

/** Per-visit console/selection memory, so reopening the browser on the same
 * challenge restores its transcript (classic openBrowser parity). */
const visitMemory = new Map();

const EMPTY_SESSION = {
  tab: 'render',
  scroll: 0,
  elementIndex: 0,
  follow: true,
  input: '',
  history: [],
  historyIndex: 0,
  output: [],
  busy: false,
};

export function BrowserRoute({ moduleId, lessonId, challengeId }) {
  const host = useHost();
  const services = useServices();
  const router = useRouter();
  // The pane rows carry their glyphs, so the browser degrades to ASCII with
  // the rest of the UI (Phase 4 icon pass).
  const icons = useIcons();
  const width = host.width || 100;
  const height = host.height || 24;

  const [session, setSessionState] = useState(EMPTY_SESSION);
  const [notice, setNotice] = useState(null);
  const [requests, setRequests] = useState([]);
  // Bumped when the draft (or width) changes: page + parts re-derive.
  const [draftSig, setDraftSig] = useState(null);

  // Like ChallengeRoute: the session ref is updated SYNCHRONOUSLY by every
  // setter (value or updater), so two keys arriving in one stdin chunk compose
  // in order instead of the second overwriting the first against a stale ref.
  const sessionRef = useRef(session);
  const setSession = useCallback((next) => {
    const value = typeof next === 'function' ? next(sessionRef.current) : next;
    sessionRef.current = value;
    setSessionState(value);
  }, []);
  const noticeRef = useRef(null);

  const target = useMemo(() => {
    if (!services) return null;
    return findChallenge(services.curriculum, { moduleId, lessonId, challengeId }, (id) => services.store.isPassed(id));
  }, [challengeId, lessonId, moduleId, services]);

  const challengeKey = target ? `${target.lessonId}.${target.challengeId}` : null;

  // ---- visit memory: restore the last session for this challenge -----------
  useEffect(() => {
    if (!challengeKey) return;
    const saved = visitMemory.get(challengeKey);
    setSession(saved ? { ...EMPTY_SESSION, ...saved, busy: false } : { ...EMPTY_SESSION });
    setRequests([]);
    setNotice(null);
  }, [challengeKey]);
  useEffect(() => () => {
    if (challengeKey) visitMemory.set(challengeKey, { ...sessionRef.current });
  }, [challengeKey]);

  // ---- live re-render: poll the autosaved draft ----------------------------
  const draftOf = useCallback(() => {
    if (!target || !services?.store) return null;
    const rec = services.store.challengeRecord(challengeKey);
    const last = rec && rec.lastCode;
    const files = target.challenge.files || null;
    if (files) {
      const texts = {};
      for (const name of Object.keys(files)) {
        texts[name] = (last && typeof last === 'object' && last[name] != null ? last[name] : files[name]) ?? '';
      }
      return texts;
    }
    return (typeof last === 'string' && last) || (target.challenge.starter ?? '');
  }, [challengeKey, services, target]);

  useEffect(() => {
    if (!challengeKey) return undefined;
    const tick = setInterval(() => {
      const draft = draftOf();
      const sig = JSON.stringify(draft ?? null);
      setDraftSig((prev) => {
        if (prev === sig) return prev;
        return sig;
      });
    }, LIVE_POLL_MS);
    return () => clearInterval(tick);
  }, [challengeKey, draftOf]);

  /** The assembled page parts for the CURRENT draft. */
  const parts = useMemo(() => {
    if (!target) return null;
    const draft = draftOf();
    const files = target.challenge.files || null;
    if (files) return synthesisParts(draft || {});
    return previewParts(target.challenge, draft || '');
    // draftSig (not draftOf) drives rebuilds — the poll is the debounce.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, draftSig]);

  const layoutWidth = Math.max(40, width - 2);
  const page = useMemo(() => buildPage(parts, layoutWidth), [parts, layoutWidth]);

  /** Does the page source come from an editable buffer? (jump eligibility) */
  const canJump = useMemo(() => {
    if (!target) return false;
    if (target.challenge.files) return !!htmlFileOf(target.challenge.files);
    const lang = target.challenge.lang || 'js';
    return lang === 'html' || lang === 'html+css';
  }, [target]);

  // ---- jump-to-source ------------------------------------------------------
  const jumpTo = useCallback((pos, label) => {
    if (!canJump) {
      setNotice('The rendered page is a fixture for this challenge — its lines are not in your editor.');
      return;
    }
    const files = target.challenge.files || null;
    browserJumpHandoff.pending = {
      file: files ? htmlFileOf(files) : null,
      row: pos.row,
      col: pos.col || 0,
      label: label || `line ${pos.row + 1}`,
    };
    router.pop();
  }, [canJump, router, target]);

  /** Jump to the source of an elementTree row (Elements selection, render click). */
  const jumpToTreeRow = useCallback((treeRow) => {
    const src = elementRowToSource(page, treeRow);
    if (!src) {
      setNotice('That element has no source position (it is generated).');
      return;
    }
    jumpTo(src, `line ${src.row + 1}`);
  }, [jumpTo, page]);

  // ---- console --------------------------------------------------------------
  const runConsole = useCallback(() => {
    const now = sessionRef.current;
    const expr = now.input.trim();
    if (!expr || now.busy) return;
    const files = target.challenge.files || null;
    const isMarkup = !!files || ['html', 'html+css', 'css'].includes(target.challenge.lang || 'js');
    const code = isMarkup ? parts?.js || '' : String(draftOf() ?? '');
    const domHtml = isMarkup ? parts?.html || '' : (target.challenge.fixture ?? null);

    setSession((s) => ({
      ...s,
      busy: true,
      input: '',
      history: [...s.history, expr],
      historyIndex: s.history.length + 1,
      output: [...s.output, { kind: 'input', text: expr }],
      follow: true,
    }));
    runConsoleSession(code, expr, {
      domHtml,
      mockFetch: target.challenge.mockFetch || null,
      prelude: target.challenge.prelude || '',
    })
      .then((res) => {
        setRequests(res.requests.slice());
        setSession((s) => {
          const output = [...s.output];
          if (res.error) output.push({ kind: 'error', text: res.error });
          else output.push({ kind: 'result', text: res.value });
          for (const line of res.logs || []) output.push({ kind: 'log', text: String(line) });
          return { ...s, busy: false, output, follow: true };
        });
      })
      .catch((err) => {
        setSession((s) => ({
          ...s,
          busy: false,
          output: [...s.output, { kind: 'error', text: err && err.message ? err.message : String(err) }],
        }));
      });
  }, [draftOf, parts, target]);

  // A different challenge must not inherit a warmed context for other code.
  useEffect(() => {
    if (!challengeKey) return undefined;
    return () => resetConsoleSession();
  }, [challengeKey]);

  // ---- M1 screenshot action (P0-3, docs/multimedia.md §3) -------------------
  // Gated by the action module (env opt-in + graphics protocol + lazy
  // Playwright); every failure mode degrades to a footer-notice line, exactly
  // like the other shell-outs on this route. The rendered image goes straight
  // to stdout as the terminal's inline-image escape — never through ink's
  // frame, which is text-only.
  const runScreenshot = useCallback(() => {
    if (!parts) return;
    setNotice('Rendering screenshot…');
    runScreenshotAction(parts, services && services.graphicsProbe)
      .then((res) => {
        if (res.kind === 'rendered') {
          process.stdout.write(res.image);
          setNotice('Screenshot emitted to the terminal.');
        } else {
          setNotice((res.lines || ['Screenshot failed.']).join(' '));
        }
      })
      .catch((err) => setNotice(`Screenshot failed: ${err && err.message ? err.message : err}`));
  }, [parts, services]);

  // ---- pane rows ------------------------------------------------------------
  const bodyH = Math.max(1, height - 4);
  const paneRows = useMemo(() => {
    if (!target || !page) return [];
    switch (session.tab) {
      case 'elements':
        return buildElementRows(page, clampElement(page, session.elementIndex), width, icons);
      case 'styles':
        return buildStyleRows(page, clampElement(page, session.elementIndex), width, icons);
      case 'console':
        return buildConsoleRows({
          output: session.output,
          input: session.input,
          busy: session.busy,
          follow: session.follow,
          scroll: session.scroll,
          lines: bodyH,
          historyCount: session.history.length,
          icons,
        }).rows;
      case 'network':
        return buildNetworkRows(target.challenge, requests, width, icons);
      default:
        return buildRenderRows(page, width, clampElement(page, session.elementIndex), icons);
    }
  }, [bodyH, icons, page, requests, session.busy, session.elementIndex, session.follow, session.history.length, session.input, session.output, session.scroll, session.tab, target, width]);

  const maxScroll = Math.max(0, paneRows.length - bodyH);

  const scrollBy = useCallback((delta, { follow = false } = {}) => {
    setSession((s) => ({ ...s, follow, scroll: Math.max(0, s.scroll + delta) }));
  }, []);

  const moveSelection = useCallback((delta) => {
    setSession((s) => {
      if (!page) return s;
      const next = clampElement(page, s.elementIndex + delta);
      return { ...s, elementIndex: next };
    });
  }, [page]);

  // ---- commands (registry ids; screen-scoped ids win over globals — the
  // browser command block sits above the Global section in commands.js) ------
  //
  // The console pane is a typing surface: printable keys type into the input
  // line instead of firing. Two paths reach it — keys that resolve to a
  // screen binding (letters/digits are `jumpTab1..5` etc.) come through
  // `onCommand`, and keys that resolve to NOTHING (+, (, =, …) come through
  // `onRawKey`. `touchConsole` is the shared predicate so the two agree.
  const touchConsole = useCallback((ev) => {
    if (sessionRef.current.tab !== 'console') return false;
    if (!ev || ev.type === 'command') return false; // palette runs are not typing
    if (ev.ctrl || ev.alt) return false;
    if (ev.name === 'backspace') {
      setSession((s) => ({ ...s, input: s.input.slice(0, -1) }));
      return true;
    }
    if (ev.name === 'space') {
      setSession((s) => ({ ...s, input: s.input + ' ' }));
      return true;
    }
    if (ev.name === 'char') {
      setSession((s) => ({ ...s, input: s.input + (ev.char || '') }));
      return true;
    }
    return false;
  }, [setSession]);

  const onCommand = useCallback((id, ev) => {
    const now = sessionRef.current;
    if (!target) return;

    // The console pane is a typing surface: single-letter command keys (q, j,
    // k, 1..5, …) type into the input line instead of firing.
    if (touchConsole(ev)) return;

    switch (id) {
      case 'app.back':
        router.pop();
        return;
      case 'browser.close':
        router.pop();
        return;
      case 'browser.tabNext':
      case 'browser.tabPrev': {
        const dir = id === 'browser.tabNext' ? 1 : -1;
        const at = BROWSER_TABS.indexOf(now.tab);
        setSession((s) => ({ ...s, tab: BROWSER_TABS[(at + dir + BROWSER_TABS.length) % BROWSER_TABS.length], scroll: 0, follow: true }));
        return;
      }
      case 'browser.jumpTab1':
      case 'browser.jumpTab2':
      case 'browser.jumpTab3':
      case 'browser.jumpTab4':
      case 'browser.jumpTab5': {
        const next = BROWSER_TABS[Number(id.slice(-1)) - 1];
        if (next) setSession((s) => ({ ...s, tab: next, scroll: 0, follow: true }));
        return;
      }
      case 'browser.screenshot':
        runScreenshot();
        return;
      case 'browser.consoleRun':
        if (now.tab === 'console') runConsole();
        else jumpToTreeRow(clampElement(page, now.elementIndex));
        return;
      case 'browser.consoleHistoryUp':
      case 'nav.up':
      case 'nav.pageUp': {
        // On the console pane <up> is history; everywhere else (and for the
        // nav ids) it scrolls or walks the element tree.
        if (id === 'browser.consoleHistoryUp' && now.tab === 'console' && now.history.length) {
          const at = Math.max(0, Math.min(now.historyIndex - 1, now.history.length - 1));
          setSession((s) => ({ ...s, historyIndex: at, input: s.history[at] || '' }));
          return;
        }
        if (now.tab === 'elements' || now.tab === 'styles') moveSelection(-1);
        else scrollBy(id === 'nav.pageUp' ? -Math.max(1, bodyH - 2) : -1);
        return;
      }
      case 'browser.consoleHistoryDown':
      case 'nav.down':
      case 'nav.pageDown': {
        if (id === 'browser.consoleHistoryDown' && now.tab === 'console' && now.history.length) {
          const at = Math.min(now.history.length, now.historyIndex + 1);
          setSession((s) => ({ ...s, historyIndex: at, input: at >= s.history.length ? '' : (s.history[at] || '') }));
          return;
        }
        if (now.tab === 'elements' || now.tab === 'styles') moveSelection(1);
        else scrollBy(id === 'nav.pageDown' ? Math.max(1, bodyH - 2) : 1);
        return;
      }
      case 'browser.consoleClearInput':
        if (now.tab === 'console') setSession((s) => ({ ...s, input: '' }));
        return;
      case 'browser.consoleClear':
        if (now.tab === 'console') setSession((s) => ({ ...s, output: [], scroll: 0, follow: true }));
        return;

      case 'nav.first':
        if (now.tab === 'elements' || now.tab === 'styles') setSession((s) => ({ ...s, elementIndex: 0 }));
        else setSession((s) => ({ ...s, scroll: 0 }));
        return;
      case 'nav.last':
        if (now.tab === 'elements' || now.tab === 'styles') moveSelection(1e9);
        else setSession((s) => ({ ...s, scroll: maxScroll }));
        return;
      case 'app.quit':
        host.run('app.quit');
        return;
      case 'app.help':
        host.run('app.help');
        return;
      case 'app.palette':
        host.run('app.palette');
        return;
      case 'app.repaint':
        host.run('app.repaint');
        return;
      default:
        // Unknown/unhandled ids go to the global table (pane widths etc. say
        // their honest message instead of vanishing).
        host.run(id);
    }
  }, [bodyH, host, jumpToTreeRow, maxScroll, moveSelection, page, router, runConsole, scrollBy, target, touchConsole]);

  // ---- mouse: click-to-inspect + wheel scroll -------------------------------
  const onMouse = useCallback((ev) => {
    if (!ev || ev.type !== 'mouse') return false;
    const now = sessionRef.current;
    if (ev.action === 'wheel-up' || ev.action === 'wheel-down') {
      const delta = ev.action === 'wheel-down' ? 3 : -3;
      if (now.tab === 'console') setSession((s) => ({ ...s, follow: false, scroll: Math.max(0, s.scroll + delta) }));
      else scrollBy(delta);
      return true;
    }
    if (ev.action !== 'down' || typeof ev.y !== 'number') return false;
    const bodyRow = ev.y - 1 - 3; // 1-based screen row minus 3 chrome rows
    if (bodyRow < 0 || bodyRow >= bodyH) return true; // clicks in the pane column are ours
    const hit = paneClick(paneRows, bodyH, bodyRow, now.tab === 'console' ? buildConsoleRows({
      output: now.output, input: now.input, busy: now.busy, follow: now.follow, scroll: now.scroll, lines: bodyH, historyCount: now.history.length, icons,
    }).scroll : now.scroll);
    if (!hit) return true;

    if (now.tab === 'render') {
      if (hit.element != null) {
        const selected = clampElement(page, hit.element);
        const src = elementRowToSource(page, selected);
        setSession((s) => ({ ...s, elementIndex: selected }));
        setNotice(src
          ? `inspecting ${describeOf(page, selected)} — Enter jumps to line ${src.row + 1}`
          : `inspecting ${describeOf(page, selected)}`);
      } else if (hit.issue != null) {
        const note = page.issues[hit.issue];
        if (note && note.line != null) jumpTo({ row: note.line - 1, col: 0 }, note.text);
        else setNotice('That issue has no source line.');
      }
      return true;
    }
    if (now.tab === 'elements' && hit.treeRow != null) {
      setSession((s) => ({ ...s, elementIndex: hit.treeRow }));
      return true;
    }
    return true;
  }, [bodyH, icons, jumpTo, page, paneRows, scrollBy]);

  // Raw keys: unbound printable keys must reach the console pane too (they
  // resolve to no command id, so `useKeymap` sends them here before the
  // global table). Everywhere else false lets the global handler run.
  const onRawKey = useCallback((ev) => touchConsole(ev), [touchConsole]);

  // Route registration: commands + raw keys + mouse, like every ported route.
  useKeymap('browser', onCommand, { onMouse, onRawKey });

  if (!target) return <Text color="red">unknown challenge: {challengeId || lessonId || moduleId}</Text>;
  if (!parts) return null; // one tick while the first parts derive

  const consoleScroll = session.tab === 'console'
    ? buildConsoleRows({
      output: session.output, input: session.input, busy: session.busy, follow: session.follow, scroll: session.scroll, lines: bodyH, historyCount: session.history.length, icons,
    }).scroll
    : session.scroll;

  return (
    <BrowserScreen
      title={target.challenge.title || target.challenge.id}
      tab={session.tab}
      pane={paneRows}
      offset={consoleScroll}
      overlay={page.error || null}
      notice={notice}
      width={width}
      height={height}
      live
      busy={session.busy}
      pageLines={page.pageLines}
      onCommand={onCommand}
    />
  );
}

/** A short description of a tree row for notices. */
function describeOf(page, treeRow) {
  const rows = elementTree(page.html);
  const row = rows[treeRow];
  return row ? (row.kind === 'text' ? 'a text node' : `<${row.label}>`) : 'an element';
}
