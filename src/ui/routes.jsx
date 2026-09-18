/**
 * Challenge route (next-UI, Phase 1) — QoL parity with the classic UI.
 *
 * Reads the buffer from the progress record (lastCode → starter), so work
 * survives restarts exactly like the classic editor's autosave (Q8). The
 * buffer is never rewritten here: Ctrl+F reports what the formatter would do
 * (suggest-only, Q10) until the Phase 2 editor lands, and a check run (Q7)
 * reports per-check results with duration, micro-notes and the failing-check
 * line numbers instead of a one-line shrug.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Text } from 'ink';
import { useHost } from './host.jsx';
import { useServices } from './services.jsx';
import { useKeymap } from './useKeymap.js';
import { useRouter } from './router.jsx';
import { detectCapabilities } from './capabilities.js';
import { nextIndex } from './nav.js';
import { findChallenge, firstUnpassedIn } from '../core/targets.js';
import { nextLesson } from '../content/index.js';
import { preferenceRows, vimPreferenceRow, togglePreference } from './preferences.js';import { applyEdit } from '../editor/document.js';
import { createSession,
  sessionDoc,
  sessionText,
  sessionTexts,
  sessionStep,
  sessionSetView,
  sessionResetFile,
  sessionSetText,
  sessionUndo,
  sessionRedo,
  commit,
  moveCaret,
  viewOf,
} from '../editor/document.js';
import { createVimState, reduceKey, isVisual } from '../editor/vim.js';
import { typeText, typeBackspace, typeDelete, typeNewline, moveArrow } from '../editor/typekeys.js';
import { createRegisters } from '../editor/registers.js';
import { copySequence as clipboardSequence } from '../editor/osc52.js';
import { clickToPos } from '../editor/viewport.js';
import { diffRows } from '../editor/diff.js';
import { effectiveKeymap } from './keymap.js';
import { resolveKey } from './commands.js';
import { useResizableSplit } from './components/ResizableSplit.jsx';
import { HomeScreen } from './screens/home.jsx';
import { ModuleScreen } from './screens/module.jsx';
import { ChallengeScreen } from './screens/challenge.jsx';
import { LessonScreen, lessonLines } from './screens/lesson.jsx';
import { ProjectsScreen, projectsLines } from './screens/projects.jsx';
import { HelpScreen } from './screens/help.jsx';
import { ResourcesScreen } from './screens/resources.jsx';
import { WorkspaceScreen } from './screens/workspace.jsx';
import { StatsScreen } from './screens/stats.jsx';
import { SettingsScreen } from './screens/settings.jsx';
import { TourScreen, tourSteps, tourReducer } from './screens/tour.jsx';

/** Solution → displayable text (string challenges or a files map). */
function solutionText(challenge) {
  const sol = challenge && challenge.solution;
  if (!sol) return '';
  if (typeof sol === 'string') return sol;
  return Object.entries(sol).map(([name, text]) => `── ${name} ──\n${text}`).join('\n\n');
}

/** Highlight language for a file name (extension → highlight.js key). */
function langOf(name) {
  const ext = String(name || '').split('.').pop().toLowerCase();
  const map = {
    js: 'js', jsx: 'js', mjs: 'js', cjs: 'js', ts: 'js', tsx: 'js',
    html: 'html', htm: 'html', css: 'css', json: 'json',
    sh: 'sh', bash: 'sh', md: 'md', py: 'py', sql: 'sql',
    yml: 'yaml', yaml: 'yaml',
  };
  return map[ext] || 'js';
}

/** One failing check, rendered as a numbered status line. */
function failingLine(r) {
  const base = `✗ ${r.label}${r.message ? ` — ${r.message}` : ''}`;
  return Number.isFinite(r.line) && r.line >= 1 ? `${base} (→ line ${r.line})` : base;
}

export function HomeRoute() {
  const host = useHost();
  const services = useServices();
  const modules = (services && services.curriculum) || [];
  const count = modules.length;
  const { cursor, setCursor } = host;

  const onCommand = useCallback((id) => {
    const next = nextIndex(cursor, id, count);
    if (next !== null) {
      setCursor(next);
      return;
    }
    switch (id) {
      case 'home.openModule': {
        const mod = modules[cursor];
        if (mod) host.go('module', { moduleId: mod.id });
        return;
      }
      case 'home.dismissBanner':
        if (services && services.settings) services.settings.dismissBanner();
        host.say('Banner dismissed for today.', 'ok');
        return;
      default:
        host.run(id);
    }
  }, [count, cursor, host, modules, services, setCursor]);

  return <HomeScreen cursor={cursor} height={host.height} onCommand={onCommand} />;
}

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

export function ModuleRoute({ moduleId }) {
  const host = useHost();
  const services = useServices();
  const modules = (services && services.curriculum) || [];
  const mod = modules.find((m) => m.id === moduleId) || modules[0];
  const rows = mod ? mod.lessons.length + (mod.project ? 1 : 0) : 0;
  const { cursor, setCursor } = host;

  const onCommand = useCallback((id) => {
    const next = nextIndex(cursor, id, rows);
    if (next !== null) {
      setCursor(next);
      return;
    }
    switch (id) {
      case 'module.openLesson': {
        if (!mod) return;
        const lesson = mod.lessons[cursor];
        if (!lesson) {
          // The project row follows the lessons (classic convention).
          host.run('module.openProject');
          return;
        }
        // Phase 1: the lesson screen exists, so Enter opens it (the classic
        // flow) rather than jumping straight into the first challenge.
        host.go('lesson', { moduleId: mod.id, lessonId: lesson.id });
        return;
      }
      default:
        host.run(id);
    }
  }, [cursor, host, mod, rows, services, setCursor]);

  return (
    <ModuleScreen
      moduleId={mod ? mod.id : moduleId}
      cursor={cursor}
      height={host.height}
      onCommand={onCommand}
    />
  );
}

// ---------------------------------------------------------------------------
// Challenge
// ---------------------------------------------------------------------------

export function ChallengeRoute({ moduleId, lessonId, challengeId }) {
  const host = useHost();
  const services = useServices();
  const [showSolution, setShowSolution] = useState(false);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [hintIndex, setHintIndex] = useState(0);
  const [results, setResults] = useState(null); // Q7 view of the last run

  const target = useMemo(() => {
    if (!services) return null;
    return findChallenge(
      services.curriculum,
      { moduleId, lessonId, challengeId },
      (id) => services.store.isPassed(id),
    );
  }, [challengeId, lessonId, moduleId, services]);

  // Task 1.2: the ratio (not the column count) is remembered per screen, so a
  // remembered layout survives a resize; drag and nudge both write it back.
  const split = useResizableSplit({
    screen: 'challenge',
    pane: 'brief',
    settings: services && services.settings,
    totalWidth: host.width,
    minLeft: 20,
    minRight: 24,
    fallbackRatio: 0.42,
  });
  const { widen, narrow, reset: resetPanes, onMouse: splitMouse } = split;

  // ---- Phase 2 editor session (task 2.9) --------------------------------
  // One session owns every file (docs + history + view state). The seed is
  // the saved draft → starter, exactly the classic's record-driven boot.
  const challengeKey = target ? `${target.lessonId}.${target.challengeId}` : null;
  const record = target ? services.store.challengeRecord(challengeKey) : null;
  const starter = target ? (target.challenge.starter ?? '') : '';

  const [session, setSession] = useState(null);
  const [vim, setVim] = useState(() => createVimState({ enabled: services?.settings?.get?.('editor.vimMode') ?? false }));
  const [registers, setRegisters] = useState(() => createRegisters());
  const [selection, setSelection] = useState(null);
  const [mode, setMode] = useState('normal');

  // (Re)seed when the target changes; a same-target re-render keeps the buffer.
  useEffect(() => {
    if (!target) return;
    const key = `${target.lessonId}.${target.challengeId}`;
    const rec = services.store.challengeRecord(key);
    const files = target.challenge.files
      ? Object.fromEntries(Object.entries(target.challenge.files).map(([n, s]) => [n, rec.lastCode?.[n] ?? s ?? '']))
      : { [target.challenge.lang || 'js']: (typeof rec.lastCode === 'string' ? rec.lastCode : null) ?? target.challenge.starter ?? '' };
    const names = Object.keys(files);
    setSession(createSession(files, {
      order: names,
      languages: Object.fromEntries(names.map((n) => [n, langOf(n)])),
    }));
    setVim(createVimState({ enabled: !!services?.settings?.data?.editor?.vimMode }));
    setSelection(null);
    setMode('normal');
  }, [target, services]);

  // Autosave (Q8): debounced write of the active file's text. A buffer equal
  // to the starter is NOT a draft — reset stays "no draft" instead of racing
  // the reset command and re-persisting the starter as saved work.
  const saveTimer = useRef(null);
  useEffect(() => {
    if (!session || !challengeKey || !services?.store?.saveDraft) return undefined;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const texts = sessionTexts(session);
      const starters = target?.challenge?.files
        ? target.challenge.files
        : { [session.active]: target?.challenge?.starter ?? '' };
      const isClean = Object.keys(starters).length > 0
        && Object.entries(starters).every(([n, s]) => (texts[n] ?? '') === (s ?? ''));
      services.store.saveDraft(
        challengeKey,
        isClean ? null : (target?.challenge?.files ? texts : texts[session.active]),
      );
    }, 400);
    return () => clearTimeout(saveTimer.current);
  }, [session, challengeKey, services, target]);

  const activeName = session ? session.active : 'js';

  /** Copy text via OSC52 (no child process, works over SSH). */
  const copyText = useCallback((text) => {
    try {
      const seq = clipboardSequence(text, { setting: services?.settings?.data?.clipboard ?? null });
      if (seq) process.stdout.write(seq);
    } catch { /* clipboard is best-effort; never break a keystroke on it */ }
  }, [services]);

  /**
   * One keystroke → session → history. Two paths, one session:
   *   - vim on:  the vim reducer decides (its result carries the next doc).
   *   - vim off: the MODELESS layer (typekeys.js) — chars type, backspace/
   *     delete/enter/arrows behave like the classic editor.
   * Returns true when the key was consumed.
   */
  const applyKey = useCallback((ev) => {
    if (!session) return true;
    const name = session.active;
    const doc = sessionDoc(session, name);

    if (vim && vim.enabled) {
      const res = reduceKey(vim, ev, { doc, registers, tabSize: session.tabSize });

      let next = session;
      if (res.changed && res.doc !== doc) {
        next = commit(session, name, res.doc, { coalesce: res.coalesce || false });
      }
      // Requests the engine cannot do itself (pure reducer): undo/redo/scroll.
      if (res.request?.type === 'undo') next = sessionUndo(next, name);
      if (res.request?.type === 'redo') next = sessionRedo(next, name);
      if (res.request?.type === 'scroll' && res.request.amount === 'page') {
        const view = viewOf(doc);
        next = sessionSetView(next, name, { scrollTop: Math.max(0, (view.scrollTop || 0) + res.request.dir * 20) });
      }
      if (res.request?.type === 'tab') {
        next = sessionStep(next, res.request.dir);
      }
      if (res.request?.type === 'clipboard' && res.request.text) {
        copyText(res.request.text);
      }
      if (res.registers !== registers) setRegisters(res.registers);
      if (res.state !== vim) setVim(res.state);
      const nextMode = res.state && res.state.mode ? res.state.mode : 'normal';
      setMode(isVisual(nextMode) ? 'visual' : nextMode === 'insert' || nextMode === 'replace' ? 'insert' : 'normal');
      if (next !== session) setSession(next);
      if (res.status) setStatus(res.status);
      return res.consumed !== false;
    }

    // ---- modeless path (vim off): classic-editor behavior ----------------
    const key = ev && ev.name;
    let next = session;
    let consumed = true;
    if (key === 'char' && ev.char) {
      next = commit(session, name, applyEdit(doc, typeText(doc, ev.char, selection).changes, typeText(doc, ev.char, selection).caret).doc, { coalesce: 'typing' });
    } else if (key === 'backspace') {
      const r = typeBackspace(doc, selection, { indentSize: 2 });
      next = r.changes.length ? commit(session, name, applyEdit(doc, r.changes, r.caret).doc, { coalesce: 'typing' }) : session;
    } else if (key === 'delete') {
      const r = typeDelete(doc, selection);
      next = r.changes.length ? commit(session, name, applyEdit(doc, r.changes, r.caret).doc, { coalesce: 'typing' }) : session;
    } else if (key === 'return' || key === 'enter') {
      const r = typeNewline(doc, selection);
      next = commit(session, name, applyEdit(doc, r.changes, r.caret).doc, { coalesce: 'typing' });
    } else if (key === 'left' || key === 'right' || key === 'up' || key === 'down' || key === 'home' || key === 'end') {
      const p = moveArrow(doc, key);
      next = commit(session, name, moveCaret(doc, p), { history: false });
    } else if (key === 'ctrl-z') {
      next = sessionUndo(session, name);
    } else if (key === 'ctrl-y' || key === 'shift-ctrl-z') {
      next = sessionRedo(session, name);
    } else {
      consumed = false; // escape, ctrl combos, F-keys … → global handlers
    }
    if (selection && consumed) setSelection(null); // typing collapses the drag
    if (next !== session) setSession(next);
    return consumed;
  }, [copyText, registers, selection, session, vim]);

  /** Registry commands (resolved keys, palette, host) — the id decides. */
  const onCommand = useCallback(async (id) => {
    if (nextIndex(0, id, 0) !== null) return; // no list on this screen
    if (!target) return;
    switch (id) {
      case 'challenge.check': {
        if (busy) return;
        setBusy(true);
        setStatus('running your code…');
        try {
          const { evaluate } = await import('../core/grade.js');
          const started = Date.now();
          const code = sessionText(session);
          const result = await evaluate(target.challenge, code);
          result.durationMs = Date.now() - started;
          const { checkNotes } = await import('../core/checkNotes.js');
          result.notes = checkNotes({
            results: result.results,
            logs: result.logs,
            code,
            starter: target.challenge.starter,
            hintsShown: hintIndex,
            solutionShown: showSolution,
          });
          setResults(result);
          const passed = result.results.filter((r) => r.ok).length;
          const total = result.results.length;
          if (result.passed) {
            // Q13 accounting + workspace parity with the classic pass path.
            if (services.sessionState) services.sessionState.passed.add(challengeKey);
            services.store.recordAttempt(challengeKey, code, true);
            setStatus(`${total}/${total} checks passed in ${result.durationMs} ms — solved. Saved to your workspace.`);
          } else {
            if (services.sessionState) services.sessionState.failures += total - passed;
            const failures = result.results.filter((r) => !r.ok);
            const head = `${passed}/${total} checks passed in ${result.durationMs} ms — ${failures.length} failing:`;
            setStatus([head, ...failures.slice(0, 4).map(failingLine)].join('\n'));
          }
        } catch (err) {
          setStatus(`check threw: ${err && err.message ? err.message : err}`);
        } finally {
          setBusy(false);
        }
        return;
      }
      case 'challenge.hint': {
        const hints = target.challenge.hints || [];
        if (!hints.length) {
          setStatus('No hints for this challenge.');
          return;
        }
        const i = Math.min(hintIndex, hints.length - 1);
        setHintIndex(i + 1);
        // Revealing a hint is progress the store must keep (classic parity).
        services.store.useHint(challengeKey);
        setStatus(`Hint ${i + 1}/${hints.length}: ${hints[i]}`);
        return;
      }
      case 'challenge.solution':
        setShowSolution((v) => !v);
        setStatus(showSolution
          ? 'Solution hidden.'
          : `Solution for ${target.challenge.title} — Ctrl+G again to hide.`);
        return;
      case 'challenge.reset': {
        // Per-file reset: every file back to its starter, one history entry per
        // file so Ctrl+Z (undo) brings the learner's work back.
        const files = target.challenge.files
          ? target.challenge.files
          : { [activeName]: target.challenge.starter ?? '' };
        let next = session;
        for (const [name, text] of Object.entries(files)) {
          next = sessionResetFile(next, name, text ?? '', { label: 'reset' });
        }
        setSession(next);
        services.store.saveDraft(challengeKey, null);
        setShowSolution(false);
        setResults(null);
        setStatus('Reset to starter — Ctrl+Z brings your work back.');
        return;
      }
      case 'challenge.save': {
        const texts = sessionTexts(session);
        services.store.saveDraft(challengeKey, target.challenge.files ? texts : texts[session.active]);
        setStatus('Saved to your workspace.');
        return;
      }
      case 'editor.tabNext':
        setSession(sessionStep(session, 1));
        return;
      case 'editor.tabPrev':
        setSession(sessionStep(session, -1));
        return;
      case 'editor.undo':
        setSession(sessionUndo(session));
        return;
      case 'editor.redo':
        setSession(sessionRedo(session));
        return;
      case 'challenge.externalEditor': {
        // Round-trip through $EDITOR with the terminal released (classic parity).
        const { withTerminalReleased } = await import('../tui/term.js');
        const { saveArtifact } = await import('../core/workspace.js');
        const fs = await import('node:fs');
        const name = session.active;
        const file = saveArtifact(`.fullstack-tui-edit-${Date.now()}-${name}`, sessionText(session, name));
        const editor = process.env.VISUAL || process.env.EDITOR || 'vi';
        await withTerminalReleased(async () => {
          const { spawn } = await import('node:child_process');
          await new Promise((resolve) => {
            const child = spawn(editor, [file], { stdio: 'inherit' });
            child.on('exit', resolve);
            child.on('error', resolve);
          });
        });
        try {
          const updated = fs.readFileSync(file, 'utf8');
          setSession(sessionSetText(session, name, updated));
          setStatus(`Reloaded from ${editor}.`);
        } catch {
          setStatus('Could not read the file back.');
        }
        return;
      }
      case 'view.paneWider':
        widen();
        return;
      case 'view.paneNarrower':
        narrow();
        return;
      case 'view.paneReset':
        resetPanes();
        host.say('Pane widths reset to the default split.', 'ok');
        return;
      case 'editor.format': {
        // Suggest-only (Q10): never rewrite the buffer from a route.
        const { formatCode } = await import('../core/format.js');
        const out = formatCode(target.challenge.lang || 'js', sessionText(session));
        setStatus(!out
          ? "Couldn't format safely — fix the syntax first."
          : out.changed
            ? 'The formatter would rewrite this buffer — the classic UI applies it (Ctrl+F).'
            : 'Already formatted.');
        return;
      }
      default:
        host.run(id);
    }
  }, [activeName, busy, challengeKey, hintIndex, host, narrow, resetPanes, session, services, showSolution, target, widen]);

  // Raw keys: resolved commands first (registry wins), then the editor.
  // The mouse composition (divider first, editor sink second) is registered
  // on the same route; raw keys fall through to applyKey via useKeymap's
  // onRawKey channel (task 2.9).
  const editorSink = useRef(null);
  const onMouseRoute = useCallback((ev) => {
    if (splitMouse && splitMouse(ev)) return true;
    // The route owns the layout: only events inside the EDITOR pane (right of
    // the divider column) reach the editor's sink. A click in the brief pane
    // is nobody's (the pane test relies on that: "left to the screen" means
    // unclaimed, so global handlers keep working).
    if (ev && ev.type === 'mouse' && typeof ev.x === 'number' && ev.x - 1 > split.leftWidth) {
      if (editorSink.current && editorSink.current(ev)) return true;
    }
    return false;
  }, [splitMouse, split.leftWidth]);

  const mouseHandlers = useMemo(() => ({
    // Click → caret through the pure mapping; drag extends a selection.
    onDocClick: ({ row, col }) => {
      if (!session) return;
      const doc = sessionDoc(session);
      const p = clickToPos(doc, row, col, { tabSize: session.tabSize });
      setSelection(null);
      setSession(commit(session, session.active, moveCaret(doc, p), { history: false }));
    },
    onDocDrag: ({ row, col }) => {
      if (!session) return;
      const doc = sessionDoc(session);
      const p = clickToPos(doc, row, col, { tabSize: session.tabSize });
      setSelection((prev) => ({
        anchor: (prev && prev.anchor) || doc.caret,
        head: p,
      }));
    },
    onDocWheel: (dir) => {
      if (!session) return;
      const view = viewOf(sessionDoc(session));
      setSession(sessionSetView(session, session.active, {
        scrollTop: Math.max(0, (view.scrollTop || 0) + dir * 3),
      }));
    },
  }), [session]);

  useKeymap('challenge', onCommand, { onMouse: onMouseRoute, onRawKey: applyKey });

  if (!target) return <Text color="red">unknown challenge: {challengeId || lessonId || moduleId}</Text>;
  if (!session) return null; // one tick while the session seeds

  const solutionRows = showSolution
    ? diffRows(sessionText(session), solutionText(target.challenge), {
      lang: target.challenge.lang || 'js',
      theme: null,
    })
    : [];

  return (
    <ChallengeScreen
      title={target.challenge.title || target.challenge.id}
      brief={target.challenge.prompt || ''}
      session={session}
      selection={selection}
      mode={mode}
      width={host.width}
      status={status}
      busy={busy}
      results={results}
      showSolution={showSolution}
      solutionRows={solutionRows}
      leftWidth={split.leftWidth}
      dragging={split.dragging}
      onMouse={onMouseRoute}
      onCommand={onCommand}
      mouseHandlers={mouseHandlers}
      mouseSink={editorSink}
      tabSize={session.tabSize}
      registerInput={false}
    />
  );
}

// ---------------------------------------------------------------------------
// Lesson (Phase 1): prose + practice list, focus and persisted scroll
// ---------------------------------------------------------------------------

export function LessonRoute({ moduleId, lessonId }) {
  const host = useHost();
  const services = useServices();
  const curriculum = (services && services.curriculum) || [];
  const store = services && services.store;
  const mod = curriculum.find((m) => m.id === moduleId) || null;
  const lesson = mod ? ((mod.lessons || []).find((l) => l.id === lessonId) || (mod.lessons || [])[0]) : null;

  const [focus, setFocus] = useState(() => (lesson && store ? firstUnpassedIn(lesson, (id) => store.isPassed(id)) : 0));
  const [scroll, setScroll] = useState(0);

  // Restore the persisted scroll position for this lesson (classic parity).
  useEffect(() => {
    if (lesson && store && store.getLessonScroll) setScroll(store.getLessonScroll(lesson.id) || 0);
  }, [lesson, store]);

  const width = host.width || 80;
  const { lines, challengeRows } = useMemo(
    () => (lesson ? lessonLines({ mod, lesson, store, focus, width }) : { lines: [], challengeRows: [] }),
    [mod, lesson, store, focus, width],
  );

  const persistScroll = useCallback((next) => {
    setScroll(next);
    if (lesson && store && store.setLessonScroll) store.setLessonScroll(lesson.id, next);
  }, [lesson, store]);

  const onCommand = useCallback((id) => {
    const move = nextIndex(scroll, id, SCROLL_COUNT);
    if (move !== null) {
      persistScroll(move);
      return;
    }
    const challenges = lesson ? (lesson.challenges || []) : [];
    switch (id) {
      case 'lesson.focusNext': {
        if (!challenges.length) return;
        const next = Math.min(challenges.length - 1, focus + 1);
        setFocus(next);
        if (typeof challengeRows[next] === 'number') persistScroll(challengeRows[next]);
        return;
      }
      case 'lesson.focusPrev': {
        if (!challenges.length) return;
        const next = Math.max(0, focus - 1);
        setFocus(next);
        if (typeof challengeRows[next] === 'number') persistScroll(challengeRows[next]);
        return;
      }
      case 'lesson.openChallenge': {
        const ch = challenges[focus];
        if (!ch || !mod) return;
        host.go('challenge', { moduleId: mod.id, lessonId: lesson.id, challengeId: ch.id });
        return;
      }
      case 'lesson.markRead': {
        if (!lesson || !store) return;
        store.markLessonRead(lesson.id);
        host.say(`Marked “${lesson.title}” as read.`, 'ok');
        return;
      }
      case 'lesson.next': {
        const next = lesson ? nextLesson(lesson.id) : null;
        if (next) host.go('lesson', { moduleId: next.module.id, lessonId: next.lesson.id });
        else host.say('That was the last lesson — the capstone projects are next.', 'ok');
        return;
      }
      default:
        host.run(id);
    }
  }, [challengeRows, focus, host, lesson, mod, persistScroll, scroll, store]);

  useKeymap('lesson', onCommand);

  return <LessonScreen lines={lines} height={host.height} scroll={scroll} />;
}

// ---------------------------------------------------------------------------
// Projects (Phase 1): capstone checklists
// ---------------------------------------------------------------------------

export function ProjectsRoute() {
  const host = useHost();
  const services = useServices();
  const curriculum = (services && services.curriculum) || [];
  const store = services && services.store;
  const [cursor, setCursor] = useState(0);
  const [focus, setFocus] = useState('brief');
  const [checkCursor, setCheckCursor] = useState(0);
  // The classic store is not reactive; a bump after a tick re-derives the rows.
  const [revision, setRevision] = useState(0);

  const { lines, project, checks } = useMemo(
    () => projectsLines({ curriculum, store, cursor, focus, checkCursor, width: host.width || 80 }),
    [curriculum, store, cursor, focus, checkCursor, host.width, revision],
  );

  const onCommand = useCallback((id) => {
    const inChecks = focus === 'checks';
    const count = inChecks ? checks.length : curriculum.filter((m) => m.project).length;
    const move = nextIndex(inChecks ? checkCursor : cursor, id, count);
    if (move !== null) {
      if (inChecks) setCheckCursor(move);
      else { setCursor(move); setCheckCursor(0); }
      return;
    }
    switch (id) {
      case 'projects.focusToggle':
        if (!checks.length) return;
        setFocus(inChecks ? 'brief' : 'checks');
        setCheckCursor(0);
        return;
      case 'projects.tick': {
        if (!inChecks || !project || (!store.toggleProjectCheck)) return;
        const key = `${project.id}.${checkCursor}`;
        const now = store.toggleProjectCheck(project.id, key);
        setRevision((v) => v + 1);
        host.say(`${now ? 'Ticked' : 'Unticked'}: ${checks[checkCursor]}`, now ? 'ok' : 'warn');
        return;
      }
      default:
        host.run(id);
    }
  }, [checkCursor, checks, curriculum, cursor, focus, host, project, store]);

  useKeymap('projects', onCommand);

  return <ProjectsScreen lines={lines} height={host.height} scroll={0} />;
}

// ---------------------------------------------------------------------------
// Read-only scroll screens (Phase 1): help, resources, workspace, stats
// ---------------------------------------------------------------------------

/**
 * Scroll cursor for the read-only screens: nav.* moves the top visible row.
 * `count` is deliberately huge — `clampScroll` knows the real line count at
 * render time, so `G` lands on the last page either way and the route never
 * has to measure content.
 */
const SCROLL_COUNT = 1e6;

function useScrollCommand() {
  const host = useHost();
  const [cursor, setCursor] = useState(0);
  const onCommand = useCallback((id) => {
    const next = nextIndex(cursor, id, SCROLL_COUNT);
    if (next !== null) {
      setCursor(next);
      return;
    }
    host.run(id);
  }, [cursor, host]);
  return [cursor, onCommand];
}

export function HelpRoute() {
  const host = useHost();
  const [cursor, onCommand] = useScrollCommand();
  return <HelpScreen cursor={cursor} width={host.width} height={host.height} onCommand={onCommand} />;
}

export function ResourcesRoute() {
  const host = useHost();
  const services = useServices();
  const [cursor, onCommand] = useScrollCommand();
  return (
    <ResourcesScreen
      curriculum={(services && services.curriculum) || []}
      overall={(services && services.overall) || {}}
      cursor={cursor}
      width={host.width}
      height={host.height}
      onCommand={onCommand}
    />
  );
}

export function WorkspaceRoute({ files, root }) {
  const host = useHost();
  const [cursor, onCommand] = useScrollCommand();
  return (
    <WorkspaceScreen
      files={files}
      root={root}
      cursor={cursor}
      width={host.width}
      height={host.height}
      onCommand={onCommand}
    />
  );
}

export function StatsRoute() {
  const host = useHost();
  const services = useServices();
  const [cursor, onCommand] = useScrollCommand();
  const stats = services && services.store ? services.store.stats(services.curriculum) : {};
  return (
    <StatsScreen
      stats={stats}
      overall={(services && services.overall) || {}}
      store={services && services.store}
      curriculum={(services && services.curriculum) || []}
      cursor={cursor}
      height={host.height}
      onCommand={onCommand}
    />
  );
}

// ---------------------------------------------------------------------------
// Settings (Phase 1, task 1.4 — the last screen of the phase)
// ---------------------------------------------------------------------------

export function SettingsRoute() {
  const host = useHost();
  const services = useServices();
  const settings = services && services.settings;
  // The classic store is not reactive, and neither is the Settings instance, so
  // a bump after a toggle re-derives the rows (the value column must show the
  // new value immediately — the classic view re-renders the same way).
  const [revision, setRevision] = useState(0);

  const rows = useMemo(
    () => [...preferenceRows({ settings }), vimPreferenceRow({ settings })],
    [settings, revision], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const onCommand = useCallback((id) => {
    const move = nextIndex(host.cursor, id, rows.length);
    if (move !== null) {
      host.setCursor(move);
      return;
    }
    if (id === 'settings.toggle' || id === 'settings.vimToggle') {
      const key = id === 'settings.vimToggle' ? 'vimMode' : (rows[host.cursor] && rows[host.cursor].key);
      if (!key) return;
      const { message, kind } = togglePreference(settings, key);
      setRevision((v) => v + 1);
      host.say(message, kind === 'good' ? 'ok' : 'warn');
      return;
    }
    host.run(id);
  }, [host, rows, settings]);

  return (
    <SettingsScreen
      rows={rows}
      cursor={host.cursor}
      width={host.width}
      height={host.height}
      onCommand={onCommand}
    />
  );
}

// ---------------------------------------------------------------------------
// Welcome tour (Phase 1, task 1.6)
// ---------------------------------------------------------------------------

export function TourRoute() {
  const host = useHost();
  const services = useServices();
  const router = useRouter();
  const settings = services && services.settings;
  // The tier decides whether the mouse step is honest (spec §9: tiers C/D
  // adjust the copy); detectCapabilities is a cached probe.
  const steps = useMemo(() => tourSteps({ tier: detectCapabilities().tier }), []);
  const [index, setIndex] = useState(0);

  const editorPrefs = (settings && settings.data && settings.data.editor) || {};
  const modeless = editorPrefs.vimMode === false;

  /**
   * Stamping `onboardedAt` is what gates the tour, so BOTH exits (finish and
   * skip) go through here, and the stack is reset to the dashboard rather than
   * popped: booting straight into the tour means there is nothing underneath it.
   */
  const finish = useCallback((why) => {
    if (settings && settings.data) {
      settings.data.onboardedAt = new Date().toISOString();
      if (typeof settings.save === 'function') settings.save();
    }
    router.reset('home');
    host.say(why === 'skip'
      ? 'Tour skipped — replay it from the palette (Ctrl+K → Replay welcome tour).'
      : 'Welcome aboard. Ctrl+K lists every command; ? opens the manual.', 'ok');
  }, [host, router, settings]);

  const onCommand = useCallback((id) => {
    switch (id) {
      case 'tour.next': {
        const next = tourReducer({ index }, { type: 'next' }, steps.length);
        if (next.done) finish('next');
        else setIndex(next.index);
        return;
      }
      case 'tour.modeless': {
        togglePreference(settings, 'vimMode');
        host.say(modeless
          ? 'Back to vim keys — i to type, Esc to stop.'
          : 'Simple keys on — no modes to learn (remembered).', 'ok');
        return;
      }
      case 'tour.skip':
      // Esc is the global `app.back`; on the tour that means skip (spec §9:
      // "skippable at every step"), handled here rather than by a second binding.
      case 'app.back':
        finish('skip');
        return;
      default:
        host.run(id);
    }
  }, [finish, host, index, modeless, settings, steps.length]);

  const step = steps[Math.min(index, steps.length - 1)] || steps[0];
  return (
    <TourScreen
      step={index}
      total={steps.length}
      title={step.title}
      body={step.body}
      sandbox={step.id === 'sandbox'}
      modeless={modeless}
      onCommand={onCommand}
    />
  );
}
