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
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Text } from 'ink';
import { useHost } from './host.jsx';
import { useServices } from './services.jsx';
import { useKeymap } from './useKeymap.js';
import { nextIndex } from './nav.js';
import { findChallenge, firstUnpassedIn } from '../core/targets.js';
import { nextLesson } from '../content/index.js';
import { HomeScreen } from './screens/home.jsx';
import { ModuleScreen } from './screens/module.jsx';
import { ChallengeScreen } from './screens/challenge.jsx';
import { LessonScreen, lessonLines } from './screens/lesson.jsx';
import { ProjectsScreen, projectsLines } from './screens/projects.jsx';
import { HelpScreen } from './screens/help.jsx';
import { ResourcesScreen } from './screens/resources.jsx';
import { WorkspaceScreen } from './screens/workspace.jsx';
import { StatsScreen } from './screens/stats.jsx';

/** Solution → displayable text (string challenges or a files map). */
function solutionText(challenge) {
  const sol = challenge && challenge.solution;
  if (!sol) return '';
  if (typeof sol === 'string') return sol;
  return Object.entries(sol).map(([name, text]) => `── ${name} ──\n${text}`).join('\n\n');
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

  const challengeKey = target ? `${target.lessonId}.${target.challengeId}` : null;
  const record = target ? services.store.challengeRecord(challengeKey) : null;
  const saved = record && typeof record.lastCode === 'string' ? record.lastCode : null;
  const starter = target ? (target.challenge.starter ?? '') : '';
  const code = showSolution ? solutionText(target.challenge) : (saved ?? starter);

  const onCommand = useCallback(async (id) => {
    if (nextIndex(0, id, 0) !== null) return; // no list on this screen
    if (!target) return;
    switch (id) {
      case 'challenge.check': {
        if (busy) return;
        if (target.challenge.files) {
          setStatus('Multi-file challenges are graded in the classic UI for now.');
          return;
        }
        setBusy(true);
        setStatus('running your code…');
        try {
          const { evaluate } = await import('../core/grade.js');
          const started = Date.now();
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
        // The classic pass path clears lastCode through resetChallenge; the
        // buffer here is record-driven, so dropping the saved draft is reset.
        services.store.saveDraft(challengeKey, null);
        setShowSolution(false);
        setResults(null);
        setStatus('Draft cleared — the starter is back (Ctrl+S re-checks it).');
        return;
      }
      case 'editor.format': {
        // Suggest-only (Q10): never rewrite the buffer from a route.
        const { formatCode } = await import('../core/format.js');
        const out = formatCode(target.challenge.lang || 'js', code);
        setStatus(!out
          ? "Couldn't format safely — fix the syntax first."
          : out.changed
            ? 'The formatter would rewrite this buffer — the Phase 2 editor applies it. (The classic UI formats today: Ctrl+F.)'
            : 'Already formatted.');
        return;
      }
      default:
        host.run(id);
    }
  }, [busy, challengeKey, code, hintIndex, host, services, showSolution, target]);

  if (!target) return <Text color="red">unknown challenge: {challengeId || lessonId || moduleId}</Text>;

  return (
    <ChallengeScreen
      title={target.challenge.title || target.challenge.id}
      brief={target.challenge.prompt || ''}
      code={code}
      width={host.width}
      status={status}
      busy={busy}
      results={results}
      onCommand={onCommand}
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
